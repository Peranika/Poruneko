package io.github.peranika.poruneko

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject

/**
 * A site's sign-in page (the Android form of internal/loginwin): it waits until the site's login cookies are all
 * there in their signed-in form, then returns them (EXTRA_COOKIES: a JSON object of name -> value). The WebView's
 * cookies are kept, so signing in again later is only opening the page.
 */
class LoginActivity : Activity() {
    private class Wanted(val name: String, val match: Regex?)

    private lateinit var cookieUrl: String
    private lateinit var wanted: List<Wanted>
    private val handler = Handler(Looper.getMainLooper())
    private val poll = object : Runnable {
        override fun run() {
            if (check()) return
            handler.postDelayed(this, 1000)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val p = JSONObject(intent.getStringExtra(EXTRA_PARAMS) ?: "{}")
        val url = p.getString("url")
        cookieUrl = p.optString("cookieUrl").ifEmpty { url }
        val cookies = p.optJSONArray("cookies")
        wanted = (0 until (cookies?.length() ?: 0)).map { i ->
            val c = cookies!!.getJSONObject(i)
            Wanted(c.getString("name"), c.optString("match").takeIf { it.isNotEmpty() }?.let(::Regex))
        }
        title = p.optString("title")
        if (p.optBoolean("fresh")) forget()

        val webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // some sites refuse to sign in inside an app's WebView ("; wv" in the user agent)
            settings.userAgentString = settings.userAgentString.replace("; wv", "")
            webViewClient = WebViewClient()
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        setContentView(FrameLayout(this).apply {
            addView(webView)
            setOnApplyWindowInsetsListener { v, insets ->
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
                v.setPadding(b.left, b.top, b.right, b.bottom)
                WindowInsets.CONSUMED
            }
        })
        webView.loadUrl(url)
        handler.post(poll)
    }

    override fun onDestroy() {
        handler.removeCallbacks(poll)
        super.onDestroy()
    }

    /** Returns the cookies once they are all there (true when done) */
    private fun check(): Boolean {
        val got = read()
        if (wanted.any { w -> got[w.name].let { it.isNullOrEmpty() || (w.match != null && !w.match.containsMatchIn(it)) } }) {
            return false
        }
        val out = JSONObject()
        wanted.forEach { out.put(it.name, got[it.name]) }
        setResult(RESULT_OK, Intent().putExtra(EXTRA_COOKIES, out.toString()))
        finish()
        return true
    }

    /** The cookies the WebView sends to cookieUrl (HttpOnly ones too) */
    private fun read(): Map<String, String> {
        val header = CookieManager.getInstance().getCookie(cookieUrl) ?: return emptyMap()
        return header.split(";").mapNotNull {
            val kv = it.trim().split("=", limit = 2)
            if (kv.size == 2) kv[0] to kv[1] else null
        }.toMap()
    }

    /** Deletes the login cookies, to sign in to another account: they are expired on the host and each of the
     * domains above it, as the site may have set them on any of those */
    private fun forget() {
        val cm = CookieManager.getInstance()
        val host = android.net.Uri.parse(cookieUrl).host ?: return
        val labels = host.split(".")
        val domains = (0..labels.size - 2).map { labels.drop(it).joinToString(".") }
        for (w in wanted) {
            cm.setCookie(cookieUrl, "${w.name}=; Max-Age=0; Path=/")
            for (d in domains) cm.setCookie(cookieUrl, "${w.name}=; Max-Age=0; Path=/; Domain=.$d")
        }
        cm.flush()
    }

    companion object {
        const val EXTRA_PARAMS = "params"
        const val EXTRA_COOKIES = "cookies"
    }
}
