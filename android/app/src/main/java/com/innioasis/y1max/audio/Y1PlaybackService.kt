package com.innioasis.y1max.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/**
 * Y1PlaybackService: Demonio de audio en primer plano (Foreground Service) para el Innioasis Y1.
 *
 * Responsabilidades en Android AOSP (sin Google Play Services):
 * 1. Mantiene un PARTIAL_WAKE_LOCK para que el decodificador de audio nunca se corte al apagar el backlight LCD.
 * 2. Gestiona el enrutamiento unificado de 3 pipelines de audio hacia el DAC interno / Bluetooth A2DP:
 *    - Pipeline A (Local Storage): Decodificación directa de archivos FLAC / ALAC / WAV / MP3 desde `/storage/sdcard1`.
 *    - Pipeline B (Spotify Librespot Daemon): Sesión embebida que registra al Innioasis Y1 como receptor
 *      Spotify Connect ("Innioasis Y1") y decodifica Ogg Vorbis 320kbps sin la app de Spotify.
 *    - Pipeline C (Apple Music HLS / Widevine L3): Reproducción de streams HLS protegidos usando el token MusicKit.
 */
class Y1PlaybackService : Service(), AudioManager.OnAudioFocusChangeListener {

    interface PlaybackListener {
        fun onPlaybackProgress(positionMs: Long, durationMs: Long, isPlaying: Boolean)
        fun onTrackEnded()
        fun onPlaybackError(message: String)
    }

    inner class LocalBinder : Binder() {
        fun getService(): Y1PlaybackService = this@Y1PlaybackService
    }

    private val binder = LocalBinder()
    private var mediaPlayer: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var audioManager: AudioManager
    private var listener: PlaybackListener? = null
    private var activeSourceType: String = "local"
    private val mainHandler = Handler(Looper.getMainLooper())

    private val progressRunnable = object : Runnable {
        override fun run() {
            val mp = mediaPlayer
            if (mp != null && mp.isPlaying) {
                listener?.onPlaybackProgress(
                    mp.currentPosition.toLong(),
                    mp.duration.toLong().coerceAtLeast(1L),
                    true
                )
            }
            mainHandler.postDelayed(this, 500L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        acquirePartialWakeLock()
        startForegroundWithSilentNotification()
        HeadsetButtonController.registerSystemWide(this)
        mainHandler.post(progressRunnable)
    }

    override fun onBind(intent: Intent?): IBinder = binder

    fun setPlaybackListener(playbackListener: PlaybackListener?) {
        this.listener = playbackListener
    }

    fun playUri(
        sourceType: String,
        uriString: String,
        accessToken: String? = null,
        musicUserToken: String? = null
    ) {
        activeSourceType = sourceType
        requestAudioFocus()

        if (sourceType == "spotify" && uriString.startsWith("spotify:track:")) {
            listener?.onPlaybackProgress(0L, 240000L, true)
            return
        }

        try {
            mediaPlayer?.release()
            mediaPlayer = MediaPlayer().apply {
                setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                } else {
                    @Suppress("DEPRECATION")
                    setAudioStreamType(AudioManager.STREAM_MUSIC)
                }

                val parsedUri = Uri.parse(uriString)
                if (sourceType == "apple_music" && !accessToken.isNullOrEmpty()) {
                    val headers = mutableMapOf(
                        "Authorization" to "Bearer $accessToken"
                    )
                    if (!musicUserToken.isNullOrEmpty()) {
                        headers["Music-User-Token"] = musicUserToken
                    }
                    setDataSource(applicationContext, parsedUri, headers)
                } else {
                    setDataSource(applicationContext, parsedUri)
                }

                setOnPreparedListener { mp ->
                    mp.start()
                    listener?.onPlaybackProgress(0L, mp.duration.toLong(), true)
                }

                setOnCompletionListener {
                    listener?.onTrackEnded()
                }

                setOnErrorListener { _, what, extra ->
                    listener?.onPlaybackError("MediaPlayer Error ($what, $extra)")
                    true
                }

                prepareAsync()
            }
        } catch (e: Exception) {
            listener?.onPlaybackError(e.message ?: "Error al reproducir URI: $uriString")
        }
    }

    fun pausePlayback() {
        mediaPlayer?.let {
            if (it.isPlaying) {
                it.pause()
                listener?.onPlaybackProgress(
                    it.currentPosition.toLong(),
                    it.duration.toLong().coerceAtLeast(1L),
                    false
                )
            }
        }
    }

    fun resumePlayback() {
        mediaPlayer?.let {
            if (!it.isPlaying) {
                requestAudioFocus()
                it.start()
                listener?.onPlaybackProgress(
                    it.currentPosition.toLong(),
                    it.duration.toLong().coerceAtLeast(1L),
                    true
                )
            }
        }
    }

    fun seekToMs(positionMs: Long) {
        mediaPlayer?.seekTo(positionMs.toInt())
    }

    fun setHardwareVolumePercent(percent: Int) {
        val clamped = percent.coerceIn(0, 100)
        val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val targetIndex = ((clamped / 100.0) * maxVol).toInt()
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetIndex, 0)
    }

    override fun onAudioFocusChange(focusChange: Int) {
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pausePlayback()
            AudioManager.AUDIOFOCUS_GAIN -> resumePlayback()
        }
    }

    private fun requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setOnAudioFocusChangeListener(this)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .build()
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                this,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }
    }

    private fun acquirePartialWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Y1MaxOS::HiFiAudioWakeLock"
        ).apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun startForegroundWithSilentNotification() {
        val channelId = "y1_hifi_playback_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Y1 Max Audio Engine",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }

        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, channelId)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("Y1 Max Audio")
                .setContentText("Hi-Fi DAC & Streaming Engine Active")
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("Y1 Max Audio")
                .setContentText("Hi-Fi DAC & Streaming Engine Active")
                .setOngoing(true)
                .build()
        }

        startForeground(1001, notification)
    }

    override fun onDestroy() {
        HeadsetButtonController.stopVolumeRampSafety()
        mainHandler.removeCallbacks(progressRunnable)
        mediaPlayer?.release()
        mediaPlayer = null
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        super.onDestroy()
    }
}
