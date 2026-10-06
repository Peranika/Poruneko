package io.github.peranika.poruneko

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.view.Gravity
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

/** The screen: a WebView showing the frontend the Go backend serves */
class MainActivity : Activity() {
    private lateinit var backend: Backend
    private lateinit var bridge: NativeBridge
    private lateinit var container: FrameLayout
    private lateinit var webView: WebView
    private var fullscreen = false

    // the calls waiting for another screen (a folder chooser, the permission settings, a login page)
    private var pendingDir: NativeCall? = null
    private var pendingPermission: NativeCall? = null
    private var pendingLogin: NativeCall? = null
    private var pendingFile: NativeCall? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as PorunekoApp
        backend = app.backend
        bridge = app.bridge
        bridge.handler = ::handle
        // the notification shown while downloading in the background
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
        }

        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        webView = WebView(this).apply {
            setBackgroundColor(BACKGROUND)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            webViewClient = object : WebViewClient() {
                // pages of other sites open in the browser
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == "127.0.0.1") return false
                    openURL(request.url.toString())
                    return true
                }
            }
        }
        container = FrameLayout(this).apply {
            setBackgroundColor(BACKGROUND)
            addView(webView)
            setOnApplyWindowInsetsListener { v, insets ->
                // the screen stays clear of the system bars and the keyboard, except in full screen
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
                if (fullscreen) v.setPadding(0, 0, 0, insets.getInsets(WindowInsets.Type.ime()).bottom)
                else v.setPadding(b.left, b.top, b.right, b.bottom)
                WindowInsets.CONSUMED
            }
        }
        setContentView(container)

        load()
    }

    override fun onDestroy() {
        if (bridge.handler == ::handle) bridge.handler = null
        super.onDestroy()
    }

    /** Shows the screen once the backend listens */
    private fun load() {
        thread(name = "backend-wait-ready", isDaemon = true) {
            val ok = backend.awaitReady()
            runOnUiThread {
                if (ok) webView.loadUrl("${backend.baseUrl}/?token=${backend.token}")
                else showError(getString(R.string.backend_failed))
            }
        }
    }

    /** The back button: the screen goes back first (closing a dialog...); with nothing to go back to, the app goes
     * to the background (it keeps running, unlike when it is closed) */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        webView.evaluateJavascript("window.poruneko && window.poruneko.back ? window.poruneko.back() : false") {
            if (it != "true") moveTaskToBack(true)
        }
    }

    override fun onResume() {
        super.onResume()
        // back from the permission settings: choose the folder now that the files can be read
        pendingPermission?.let { call ->
            pendingPermission = null
            if (Environment.isExternalStorageManager()) chooseDir(call)
            else bridge.reply(call, error = getString(R.string.storage_denied))
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQUEST_DIR -> pendingDir?.let { call ->
                pendingDir = null
                val uri = data?.data
                if (resultCode != RESULT_OK || uri == null) {
                    bridge.reply(call, "")
                    return
                }
                val path = treeToPath(uri)
                if (path == null) bridge.reply(call, error = getString(R.string.folder_unsupported))
                else bridge.reply(call, path)
            }
            REQUEST_FILE -> pendingFile?.let { call ->
                pendingFile = null
                val uri = data?.data
                if (resultCode != RESULT_OK || uri == null) {
                    bridge.reply(call, "")
                    return
                }
                // the backend opens files by path, so the chosen file is copied into the cache first
                thread(name = "copy-file", isDaemon = true) {
                    try {
                        bridge.reply(call, copyToCache(uri).path)
                    } catch (e: Exception) {
                        bridge.reply(call, error = e.message ?: e.toString())
                    }
                }
            }
            REQUEST_LOGIN -> pendingLogin?.let { call ->
                pendingLogin = null
                val got = data?.getStringExtra(LoginActivity.EXTRA_COOKIES)
                if (resultCode != RESULT_OK || got == null) {
                    bridge.reply(call, null)
                    return
                }
                val o = JSONObject(got)
                bridge.reply(call, o.keys().asSequence().associateWith { o.getString(it) })
            }
        }
    }

    private fun showError(text: String) {
        container.removeAllViews()
        container.addView(TextView(this).apply {
            this.text = text
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        })
    }

    // ---------------------------------------------------------------- The backend's calls

    private fun handle(call: NativeCall) = runOnUiThread {
        try {
            when (call.method) {
                "chooseDir" -> chooseDir(call)
                "openURL" -> {
                    openURL(call.params.getString("url"))
                    bridge.reply(call)
                }
                "clipboardText" -> {
                    val clip = getSystemService(ClipboardManager::class.java).primaryClip
                    val text = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).coerceToText(this).toString() else ""
                    bridge.reply(call, text)
                }
                "setFullscreen" -> {
                    setFullscreen(call.params.optBoolean("on"))
                    bridge.reply(call)
                }
                "toggleFullscreen" -> {
                    setFullscreen(!fullscreen)
                    bridge.reply(call, fullscreen)
                }
                "quit" -> {
                    bridge.reply(call)
                    finishAndRemoveTask()
                }
                "chooseFile" -> {
                    pendingFile?.let { bridge.reply(it, "") }
                    pendingFile = call
                    @Suppress("DEPRECATION")
                    startActivityForResult(
                        Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),
                        REQUEST_FILE
                    )
                }
                "restart" -> {
                    webView.loadUrl("about:blank")
                    thread(name = "backend-restart", isDaemon = true) {
                        bridge.replyNow(call)
                        backend.restart()
                        runOnUiThread { load() }
                    }
                }
                "login" -> {
                    pendingLogin?.let { bridge.reply(it, null) }
                    pendingLogin = call
                    @Suppress("DEPRECATION")
                    startActivityForResult(
                        Intent(this, LoginActivity::class.java).putExtra(LoginActivity.EXTRA_PARAMS, call.params.toString()),
                        REQUEST_LOGIN
                    )
                }
                else -> bridge.reply(call, error = "unsupported")
            }
        } catch (e: Exception) {
            bridge.reply(call, error = e.message ?: e.toString())
        }
    }

    /** Copies a chosen file into the cache (the folder is emptied first: it holds only the last one) */
    private fun copyToCache(uri: Uri): File {
        val name = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"
        val dir = File(cacheDir, "chosen")
        dir.deleteRecursively()
        dir.mkdirs()
        val out = File(dir, name.replace('/', '_'))
        contentResolver.openInputStream(uri)!!.use { input -> out.outputStream().use { input.copyTo(it) } }
        return out
    }

    /** Asks for a folder. The backend opens files by path, so it needs the permission to every file first */
    private fun chooseDir(call: NativeCall) {
        if (!Environment.isExternalStorageManager()) {
            pendingPermission?.let { bridge.reply(it, "") }
            pendingPermission = call
            startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        pendingDir?.let { bridge.reply(it, "") }
        pendingDir = call
        @Suppress("DEPRECATION")
        startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQUEST_DIR)
    }

    private fun openURL(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun setFullscreen(on: Boolean) {
        fullscreen = on
        val c = window.insetsController ?: return
        if (on) {
            c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            c.hide(WindowInsets.Type.systemBars())
        } else {
            c.show(WindowInsets.Type.systemBars())
        }
        container.requestApplyInsets()
    }

    companion object {
        private const val REQUEST_DIR = 1
        private const val REQUEST_LOGIN = 2
        private const val REQUEST_FILE = 3
        private const val REQUEST_NOTIFICATIONS = 4
        private val BACKGROUND = Color.rgb(15, 17, 21)

        /** The path of a folder chosen in the system's folder chooser (null for one that is not a plain folder,
         * such as one of a cloud storage app) */
        fun treeToPath(uri: Uri): String? {
            if (uri.authority != "com.android.externalstorage.documents") return null
            val id = DocumentsContract.getTreeDocumentId(uri) // "primary:Download/Comics", "1234-ABCD:Comics"
            val volume = id.substringBefore(':')
            val rel = id.substringAfter(':', "")
            val base = if (volume == "primary") Environment.getExternalStorageDirectory().path else "/storage/$volume"
            return if (rel.isEmpty()) base else "$base/$rel"
        }
    }
}
