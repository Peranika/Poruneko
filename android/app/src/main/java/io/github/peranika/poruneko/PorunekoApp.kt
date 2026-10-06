package io.github.peranika.poruneko

import android.app.Application

/** The app: the Go backend starts with it and lives as long as it does */
class PorunekoApp : Application() {
    lateinit var backend: Backend
        private set

    override fun onCreate() {
        super.onCreate()
        backend = Backend(this)
        backend.start()
    }
}
