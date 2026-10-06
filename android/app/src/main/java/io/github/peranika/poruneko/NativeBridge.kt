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
 * line, and each is answered with a POST to /native/reply. The calls are handed to [handler] (on the reading
 * thread); a call with no handler is answered with an error.
 */
class NativeBridge(private val backend: Backend) {
    @Volatile
    var handler: ((NativeCall) -> Unit)? = null

    @Volatile
    private var started = false

    fun start() {
        if (started) return
        started = true
        thread(name = "native-bridge", isDaemon = true) {
            while (!backend.awaitReady()) Thread.sleep(1000)
            while (true) {
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
            val h = handler
            if (h == null) reply(call, error = "the app is not on screen") else h(call)
        }
    }

    /** Answers a call with its result (a String, Boolean, Map, null...) or an error ("unsupported" for a call the
     * app cannot do) */
    fun reply(call: NativeCall, result: Any? = null, error: String? = null) {
        val body = JSONObject().put("id", call.id)
        body.put("result", toJSON(result))
        if (error != null) body.put("error", error)
        thread(name = "native-reply", isDaemon = true) {
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
