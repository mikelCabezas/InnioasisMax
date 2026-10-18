package com.innioasis.y1max

import android.app.Application
import com.innioasis.y1max.audio.Y1AudioPackage

/**
 * MainApplication de Y1 Max OS.
 * Registra el paquete nativo de audio (`Y1AudioPackage`) y prepara el puente de eventos para API 17+.
 */
class MainApplication : Application() {
    val packages = listOf(Y1AudioPackage())

    override fun onCreate() {
        super.onCreate()
    }
}
