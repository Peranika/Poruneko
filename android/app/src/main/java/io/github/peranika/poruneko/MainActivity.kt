package io.github.peranika.poruneko

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.inputmethod.EditorInfo
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The app: the screen of Poruneko on the user's computer (its remote access), full screen in a WebView, with the
 * back button. The computer's address is asked for once (and again when it cannot be reached)
 */
class MainActivity : Activity() {
    private lateinit var container: FrameLayout
    private lateinit var webView: WebView
    private var fullscreen = false

    // the computer's address (http://host:port/), kept for the next start
    private val prefs by lazy { getSharedPreferences("server", MODE_PRIVATE) }
    private var serverUrl: String
        get() = prefs.getString("url", "") ?: ""
        set(v) = prefs.edit().putString("url", v).apply()

    // the app's own screen (the address, and why the computer could not be reached) over the WebView, while shown
    private var panel: LinearLayout? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
                    if (isServer(request.url)) return false
                    openURL(request.url.toString())
                    return true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) showPanel(getString(R.string.unreachable, serverUrl, error.description))
                }
            }
            addJavascriptInterface(AndroidPage(), "PorunekoAndroid")
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
        if (serverUrl.isEmpty()) showPanel(null) else open()
    }

    private fun open() {
        hidePanel()
        webView.loadUrl(serverUrl)
    }

    /** Whether a URL is on the computer (the app's pages) */
    private fun isServer(url: Uri): Boolean {
        val s = Uri.parse(serverUrl)
        return url.host == s.host && url.port == s.port
    }

    /** The back button: the screen goes back first (closing a dialog...); with nothing to go back to, the app goes
     * to the background. Over a page already shown, the address screen closes back to it */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (panel != null) {
            if (serverUrl.isNotEmpty() && webView.url != null) hidePanel() else moveTaskToBack(true)
            return
        }
        webView.evaluateJavascript("window.poruneko && window.poruneko.back ? window.poruneko.back() : false") {
            if (it != "true") moveTaskToBack(true)
        }
    }

    // ---------------------------------------------------------------- The address

    /** Shows the screen asking for the computer's address, with why when it could not be reached */
    private fun showPanel(problem: String?) {
        hidePanel()
        setFullscreen(false)
        val dp = { v: Int -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt() }
        fun text(s: String, size: Float, color: Int) = TextView(this).apply {
            text = s
            textSize = size
            setTextColor(color)
            setPadding(0, 0, 0, dp(12))
        }
        val input = EditText(this).apply {
            setText(serverUrl)
            hint = "http://100.x.x.x:$DEFAULT_PORT/"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            isSingleLine = true
        }
        val connect = {
            val url = normalize(input.text.toString())
            if (url == null) input.error = getString(R.string.bad_address)
            else {
                serverUrl = url
                open()
            }
        }
        input.setOnEditorActionListener { _, _, _ -> connect(); true }
        val p = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(BACKGROUND)
            setPadding(dp(24), dp(24), dp(24), dp(24))
            isClickable = true
            addView(text(getString(R.string.server_title), 22f, Color.WHITE))
            if (problem != null) addView(text(problem, 14f, Color.rgb(255, 93, 93)))
            addView(text(getString(R.string.server_hint), 14f, Color.LTGRAY))
            addView(input)
            addView(Button(this@MainActivity).apply {
                text = getString(R.string.connect)
                setOnClickListener { connect() }
            })
        }
        container.addView(p, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        panel = p
    }

    private fun hidePanel() {
        panel?.let { container.removeView(it) }
        panel = null
    }

    /** An address as typed (a host, host:port or a URL) as http://host:port/ (null if it is not one) */
    private fun normalize(typed: String): String? {
        val t = typed.trim()
        if (t.isEmpty()) return null
        val u = Uri.parse(if ("://" in t) t else "http://$t")
        if ((u.scheme != "http" && u.scheme != "https") || u.host.isNullOrEmpty()) return null
        val withPort = if (u.port == -1 && u.scheme == "http") u.buildUpon().encodedAuthority("${u.host}:$DEFAULT_PORT").build() else u
        return withPort.buildUpon().path("/").clearQuery().fragment(null).build().toString()
    }

    // ---------------------------------------------------------------- What the page asks of the app

    /**
     * What the page can ask of the app (window.PorunekoAndroid): what it cannot do itself in a WebView (full screen
     * with the system bars, the clipboard), and changing the computer's address. Called on a thread of the WebView
     */
    private inner class AndroidPage {
        @JavascriptInterface
        fun serverUrl(): String = this@MainActivity.serverUrl

        @JavascriptInterface
        fun changeServer() {
            runOnUiThread { showPanel(null) }
        }

        @JavascriptInterface
        fun setFullscreen(on: Boolean) {
            runOnUiThread { this@MainActivity.setFullscreen(on) }
        }

        @JavascriptInterface
        fun clipboardText(): String {
            val clip = getSystemService(ClipboardManager::class.java).primaryClip
            return if (clip != null && clip.itemCount > 0) clip.getItemAt(0).coerceToText(this@MainActivity).toString() else ""
        }
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
        private val BACKGROUND = Color.rgb(15, 17, 21)

        // the port the computer's remote access listens on unless told otherwise (internal/remote.DefaultPort)
        private const val DEFAULT_PORT = 47392
    }
}
