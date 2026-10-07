package io.github.peranika.poruneko

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File
import java.io.OutputStream
import java.security.SecureRandom
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * The Go backend (main_android.go): the desktop app's own program, built for Android and shipped as
 * libporuneko.so. It runs as a child process and serves the screen, the API and the images on 127.0.0.1.
 * It ends when its stdin closes, so it does not outlive the app.
 */
class Backend(private val context: Context) {
    /** The secret every request to the backend carries (other apps can reach 127.0.0.1 too) */
    val token: String = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }

    @Volatile
    var port = 0
        private set

    @Volatile
    private var ready = CountDownLatch(1)
    private var process: Process? = null
    private var stdin: OutputStream? = null

    /** The backend's address ("" until it is listening) */
    val baseUrl: String get() = if (port > 0) "http://127.0.0.1:$port" else ""

    /** The folder the user puts plugins (.wasm) in: Android/data/<app>/files/plugins, reachable over USB */
    val pluginDir: File get() = File(context.getExternalFilesDir(null), "plugins").also { it.mkdirs() }

    /** Where works are saved until the user chooses: Android/data/<app>/files/library, which needs no permission */
    private val libraryDir: File get() = File(context.getExternalFilesDir(null), "library").also { it.mkdirs() }

    @Synchronized
    fun start() {
        if (process != null) return
        port = 0
        ready = CountDownLatch(1)
        val ready = ready
        val exe = File(context.applicationInfo.nativeLibraryDir, "libporuneko.so")
        val pb = ProcessBuilder(exe.path)
        val env = pb.environment()
        env["PORUNEKO_DATA_DIR"] = context.filesDir.path
        env["PORUNEKO_PLUGIN_DIR"] = pluginDir.path
        env["PORUNEKO_LIBRARY_DIR"] = libraryDir.path
        env["PORUNEKO_TOKEN"] = token
        env["TMPDIR"] = context.cacheDir.path
        env["HOME"] = context.filesDir.path
        env["TZ"] = TimeZone.getDefault().id
        // the name other devices show for this one when syncing, until the user gives one
        env["PORUNEKO_DEVICE_NAME"] = Build.MODEL
        // the backend takes the UI language from LANG when the setting is unset
        env["LANG"] = Locale.getDefault().toLanguageTag().replace('-', '_') + ".UTF-8"
        val p = pb.start()
        process = p
        stdin = p.outputStream // kept open: closing it (or this process ending) stops the backend
        thread(name = "backend-stdout", isDaemon = true) {
            p.inputStream.bufferedReader().forEachLine { line ->
                val m = Regex("""^PORUNEKO_LISTEN (\d+)$""").find(line)
                if (m != null && port == 0) {
                    port = m.groupValues[1].toInt()
                    ready.countDown()
                } else {
                    Log.i(TAG, line)
                }
            }
        }
        thread(name = "backend-stderr", isDaemon = true) {
            p.errorStream.bufferedReader().forEachLine { Log.i(TAG, it) }
        }
        thread(name = "backend-wait", isDaemon = true) {
            val code = p.waitFor()
            Log.w(TAG, "the backend ended ($code)")
            ready.countDown()
        }
    }

    /** Stops the backend (it saves its data and ends when its stdin closes) and starts it again */
    fun restart() {
        synchronized(this) {
            val p = process ?: return start()
            try {
                stdin?.close()
            } catch (_: Exception) {
            }
            if (!p.waitFor(10, TimeUnit.SECONDS)) p.destroyForcibly()
            process = null
            stdin = null
        }
        start()
    }

    /** Waits until the backend listens; false if it ended or did not start in time */
    fun awaitReady(seconds: Long = 60): Boolean = ready.await(seconds, TimeUnit.SECONDS) && port > 0

    companion object {
        const val TAG = "poruneko"
    }
}
