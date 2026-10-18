package com.innioasis.y1max.audio

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Y1AudioModule: Puente React Native (NativeModule) hacia `Y1PlaybackService`.
 */
class Y1AudioModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    Y1PlaybackService.PlaybackListener {

    private var playbackService: Y1PlaybackService? = null
    private var isBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as? Y1PlaybackService.LocalBinder
            playbackService = binder?.getService()
            playbackService?.setPlaybackListener(this@Y1AudioModule)
            isBound = true
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            playbackService = null
            isBound = false
        }
    }

    init {
        bindToPlaybackService()
    }

    override fun getName(): String = "Y1AudioModule"

    private fun bindToPlaybackService() {
        val intent = Intent(reactContext, Y1PlaybackService::class.java)
        reactContext.startService(intent)
        reactContext.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }

    @ReactMethod
    fun playTrack(options: ReadableMap, promise: Promise) {
        val source = options.getString("source") ?: "local"
        val uri = options.getString("uri") ?: ""
        val accessToken = if (options.hasKey("accessToken")) options.getString("accessToken") else null
        val musicUserToken = if (options.hasKey("musicUserToken")) options.getString("musicUserToken") else null

        if (uri.isEmpty()) {
            promise.reject("INVALID_URI", "La URI de la pista no puede estar vacía")
            return
        }

        playbackService?.playUri(source, uri, accessToken, musicUserToken)
        promise.resolve(true)
    }

    @ReactMethod
    fun pause(promise: Promise) {
        playbackService?.pausePlayback()
        promise.resolve(true)
    }

    @ReactMethod
    fun resume(promise: Promise) {
        playbackService?.resumePlayback()
        promise.resolve(true)
    }

    @ReactMethod
    fun seekTo(positionMs: Double, promise: Promise) {
        playbackService?.seekToMs(positionMs.toLong())
        promise.resolve(true)
    }

    @ReactMethod
    fun setVolume(percent: Int, promise: Promise) {
        playbackService?.setHardwareVolumePercent(percent)
        promise.resolve(true)
    }

    override fun onPlaybackProgress(positionMs: Long, durationMs: Long, isPlaying: Boolean) {
        val payload = Arguments.createMap().apply {
            putDouble("positionMs", positionMs.toDouble())
            putDouble("durationMs", durationMs.toDouble())
            putBoolean("isPlaying", isPlaying)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("Y1NativePlaybackProgress", payload)
    }

    override fun onTrackEnded() {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("Y1NativeTrackEnded", null)
    }

    override fun onPlaybackError(message: String) {
        val payload = Arguments.createMap().apply {
            putString("message", message)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("Y1NativePlaybackError", payload)
    }
}
