package io.github.peranika.poruneko

import android.app.Application
import android.content.Intent
import android.util.Log

/** The app: the Go backend starts with it and lives as long as it does */
class PorunekoApp : Application() {
    lateinit var backend: Backend
        private set
    lateinit var bridge: NativeBridge
        private set

    override fun onCreate() {
        super.onCreate()
        backend = Backend(this)
        backend.start()
        bridge = NativeBridge(backend)
        bridge.appHandler = ::handle
        bridge.start()
    }

    /** The backend's calls that need no screen */
    private fun handle(call: NativeCall): Boolean {
        when (call.method) {
            "busy" -> setBusy(call.params.optBoolean("on"))
            else -> return false
        }
        bridge.reply(call)
        return true
    }

    /** Runs the background service while the backend has downloads, so that Android does not freeze or stop the
     * app (and the backend with it) in the background */
    private fun setBusy(on: Boolean) {
        val intent = Intent(this, BackgroundService::class.java)
        if (!on) {
            stopService(intent)
            return
        }
        try {
            startForegroundService(intent)
        } catch (e: Exception) {
            // not allowed while the app is in the background (Android 12+); the downloads go on while it is open
            Log.w(Backend.TAG, "background service: $e")
        }
    }
}
