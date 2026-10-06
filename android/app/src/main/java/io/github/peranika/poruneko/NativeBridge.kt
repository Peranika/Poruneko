package io.github.peranika.poruneko

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** A call of the backend for what only the Android app can do (choosing a folder, opening the browser...) */
class NativeCall(val id: Long, val method: String, val params: JSONObject)

/**
 * The backend's calls to the Android app (internal/webapi): they are read from /native/calls, one JSON object per
 * line, and each is answered with a POST to /native/reply. The calls are handed (on the reading thread) to
 * [appHandler] first, which does what needs no screen, then to [handler], the screen's; a call that neither takes
 * is answered with an error.
 */
class NativeBridge(private val backend: Backend) {
    /** Takes the calls that need no screen (returns false for the others) */
    @Volatile
    var appHandler: ((NativeCall) -> Boolean)? = null

    @Volatile
    var handler: ((NativeCall) -> Unit)? = null

    @Volatile
    private var started = false

    fun start() {
        if (started) return
        started = true
        thread(name = "native-bridge", isDaemon = true) {
            while (true) {
                if (!backend.awaitReady()) {
                    Thread.sleep(1000)
                    continue
                }
                try {
                    read()
                } catch (e: Exception) {
                    Log.w(Backend.TAG, "native calls: $e")
                }
                Thread.sleep(1000) // the backend restarted or the stream broke; read again
            }
        }
    }

    private fun read() {
        val conn = open("/native/calls")
        conn.readTimeout = 0
        conn.inputStream.bufferedReader().forEachLine { line ->
            if (line.isBlank()) return@forEachLine
            val o = JSONObject(line)
            val call = NativeCall(o.getLong("id"), o.getString("method"), o.optJSONObject("params") ?: JSONObject())
            if (appHandler?.invoke(call) == true) return@forEachLine
            val h = handler
            if (h == null) reply(call, error = "the app is not on screen") else h(call)
        }
    }

    /** Answers a call with its result (a String, Boolean, Map, null...) or an error ("unsupported" for a call the
     * app cannot do). It is sent on another thread */
    fun reply(call: NativeCall, result: Any? = null, error: String? = null) {
        thread(name = "native-reply", isDaemon = true) { replyNow(call, result, error) }
    }

    /** Answers a call on this thread (not the main one), returning once the backend has the answer */
    fun replyNow(call: NativeCall, result: Any? = null, error: String? = null) {
        val body = JSONObject().put("id", call.id)
        body.put("result", toJSON(result))
        if (error != null) body.put("error", error)
        try {
            val conn = open("/native/reply")
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            conn.responseCode
            conn.disconnect()
        } catch (e: Exception) {
            Log.w(Backend.TAG, "native reply: $e")
        }
    }

    private fun toJSON(v: Any?): Any = when (v) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject(v)
        else -> v
    }

    private fun open(path: String): HttpURLConnection {
        val conn = URL(backend.baseUrl + path).openConnection() as HttpURLConnection
        conn.setRequestProperty("X-Poruneko-Token", backend.token)
        conn.connectTimeout = 5000
        return conn
    }
}
