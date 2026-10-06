package io.github.peranika.poruneko

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.DocumentsContract
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
import kotlin.concurrent.thread

/** The screen: a WebView showing the frontend the Go backend serves */
class MainActivity : Activity() {
    private lateinit var backend: Backend
    private lateinit var container: FrameLayout
    private lateinit var webView: WebView
    private var fullscreen = false

    // the calls waiting for another screen (a folder chooser, the permission settings, a login page)
    private var pendingDir: NativeCall? = null
    private var pendingPermission: NativeCall? = null
    private var pendingLogin: NativeCall? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        backend = (application as PorunekoApp).backend
        bridge(backend).also {
            it.handler = ::handle
            it.start()
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

        thread(name = "backend-wait-ready", isDaemon = true) {
            val ok = backend.awaitReady()
            runOnUiThread {
                if (ok) webView.loadUrl("${backend.baseUrl}/?token=${backend.token}")
                else showError(getString(R.string.backend_failed))
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // back from the permission settings: choose the folder now that the files can be read
        pendingPermission?.let { call ->
            pendingPermission = null
            if (Environment.isExternalStorageManager()) chooseDir(call)
            else bridge(backend).reply(call, error = getString(R.string.storage_denied))
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
                    bridge(backend).reply(call, "")
                    return
                }
                val path = treeToPath(uri)
                if (path == null) bridge(backend).reply(call, error = getString(R.string.folder_unsupported))
                else bridge(backend).reply(call, path)
            }
            REQUEST_LOGIN -> pendingLogin?.let { call ->
                pendingLogin = null
                val got = data?.getStringExtra(LoginActivity.EXTRA_COOKIES)
                if (resultCode != RESULT_OK || got == null) {
                    bridge(backend).reply(call, null)
                    return
                }
                val o = JSONObject(got)
                bridge(backend).reply(call, o.keys().asSequence().associateWith { o.getString(it) })
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
        val bridge = bridge(backend)
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

    /** Asks for a folder. The backend opens files by path, so it needs the permission to every file first */
    private fun chooseDir(call: NativeCall) {
        if (!Environment.isExternalStorageManager()) {
            pendingPermission?.let { bridge(backend).reply(it, "") }
            pendingPermission = call
            startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        pendingDir?.let { bridge(backend).reply(it, "") }
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
        private val BACKGROUND = Color.rgb(15, 17, 21)

        private var bridge: NativeBridge? = null

        /** The one bridge of the app (the activity can be created again; the backend stays) */
        fun bridge(backend: Backend): NativeBridge = bridge ?: NativeBridge(backend).also { bridge = it }

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
