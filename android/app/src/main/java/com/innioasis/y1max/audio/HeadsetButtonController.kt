package com.innioasis.y1max.audio

import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.KeyEvent
import java.util.concurrent.CopyOnWriteArrayList

/**
 * HeadsetButtonController: Controlador nativo de gestos para auriculares 3.5mm de un solo botón
 * (driver ACCDET de MediaTek MT6572 / AOSP) y del botón inferior físico Play/Pause.
 *
 * Mapeo de Gestos:
 * - 1 Clic Corto (<350ms): Play / Pause toggle.
 * - 2 Clics Cortos: Pista Siguiente (Next Track).
 * - 3 Clics Cortos: Pista Anterior (Previous Track, disparo inmediato al 3er UP).
 * - Hold (0 clics previos + pulsación sostenida >= 450ms): Subir volumen en bucle cada 250ms con pulso háptico de 10ms.
 * - 1 Clic + Hold (Doble pulsación con la 2da sostenida >= 450ms): Bajar volumen en bucle cada 250ms con pulso háptico.
 */
object HeadsetButtonController {

    const val CLICK_WINDOW_MS = 350L
    const val HOLD_THRESHOLD_MS = 450L
    const val VOLUME_REPEAT_INTERVAL_MS = 250L
    const val MAX_HOLD_SAFETY_MS = 10_000L

    enum class VolumeDirection {
        RAISE, LOWER
    }

    interface Listener {
        fun onTogglePlayPause()
        fun onNextTrack()
        fun onPreviousTrack()
        fun onVolumeAdjusted(direction: Int, newSystemVolumePercent: Int)
    }

    private val handler = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArrayList<Listener>()
    private var appContext: Context? = null

    // Deduplicación contra despachos duales (dispatchKeyEvent + BroadcastReceiver)
    private var lastProcessedDownTime: Long = 0L
    private var lastProcessedAction: Int = -1
    private var lastProcessedEventTime: Long = 0L
    private var lastWallClockMs: Long = 0L

    // Máquina de estados de gestos
    private var isPressed: Boolean = false
    private var isHolding: Boolean = false
    private var completedClicks: Int = 0
    private var currentHoldDirection: VolumeDirection? = null

    fun setListener(listener: Listener?) {
        listeners.clear()
        if (listener != null) {
            listeners.add(listener)
        }
    }

    fun addListener(listener: Listener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener)
        }
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun isSupportedHeadsetKey(keyCode: Int): Boolean {
        return keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
               keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE ||
               keyCode == 79 ||
               keyCode == 85
    }

    fun registerSystemWide(context: Context) {
        try {
            appContext = context.applicationContext
            val am = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            val component = ComponentName(context.applicationContext, Y1MediaButtonReceiver::class.java)
            @Suppress("DEPRECATION")
            am?.registerMediaButtonEventReceiver(component)
        } catch (e: Throwable) {
            android.util.Log.e("HeadsetButtonCtrl", "Error registrando media button receiver", e)
        }
    }

    fun unregisterSystemWide(context: Context) {
        try {
            val am = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            val component = ComponentName(context.applicationContext, Y1MediaButtonReceiver::class.java)
            @Suppress("DEPRECATION")
            am?.unregisterMediaButtonEventReceiver(component)
        } catch (e: Throwable) {
            android.util.Log.e("HeadsetButtonCtrl", "Error desregistrando media button receiver", e)
        }
    }

    fun stopVolumeRampSafety() {
        handler.removeCallbacks(volumeRepeatRunnable)
        handler.removeCallbacks(holdRunnable)
        handler.removeCallbacks(holdSafetyRunnable)
        isHolding = false
        currentHoldDirection = null
    }

    fun cancelAll() {
        handler.removeCallbacks(clickWindowRunnable)
        handler.removeCallbacks(volumeRepeatRunnable)
        handler.removeCallbacks(holdRunnable)
        handler.removeCallbacks(holdSafetyRunnable)
        isHolding = false
        isPressed = false
        completedClicks = 0
        currentHoldDirection = null
    }

    private val clickWindowRunnable = Runnable {
        val clicks = completedClicks
        completedClicks = 0
        when (clicks) {
            1 -> notifyPlayPause()
            2 -> notifyNext()
            3 -> notifyPrevious()
        }
    }

    private val holdRunnable = Runnable {
        val ctx = appContext ?: return@Runnable
        if (!isPressed) return@Runnable

        isHolding = true
        if (completedClicks == 0) {
            currentHoldDirection = VolumeDirection.RAISE
            triggerHapticPulse(ctx)
            adjustVolume(ctx, VolumeDirection.RAISE)
            handler.postDelayed(volumeRepeatRunnable, VOLUME_REPEAT_INTERVAL_MS)
        } else if (completedClicks == 1) {
            currentHoldDirection = VolumeDirection.LOWER
            triggerHapticPulse(ctx)
            adjustVolume(ctx, VolumeDirection.LOWER)
            handler.postDelayed(volumeRepeatRunnable, VOLUME_REPEAT_INTERVAL_MS)
        }
    }

    private val volumeRepeatRunnable = object : Runnable {
        override fun run() {
            val ctx = appContext ?: return
            if (isHolding && isPressed) {
                val dir = currentHoldDirection ?: return
                adjustVolume(ctx, dir)
                handler.postDelayed(this, VOLUME_REPEAT_INTERVAL_MS)
            }
        }
    }

    private val holdSafetyRunnable = Runnable {
        stopVolumeRampSafety()
        isPressed = false
        completedClicks = 0
    }

    private fun adjustVolume(context: Context, direction: VolumeDirection) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val adjustDir = if (direction == VolumeDirection.RAISE) {
            AudioManager.ADJUST_RAISE
        } else {
            AudioManager.ADJUST_LOWER
        }
        val dirInt = if (direction == VolumeDirection.RAISE) 1 else -1

        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, adjustDir, AudioManager.FLAG_SHOW_UI)
        val cur = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val percent = if (max > 0) ((cur.toFloat() / max.toFloat()) * 100f).toInt().coerceIn(0, 100) else 0

        notifyVolumeAdjusted(dirInt, percent)
    }

    private fun triggerHapticPulse(context: Context) {
        try {
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (vibrator?.hasVibrator() == true) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(10L, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(10L)
                }
            }
        } catch (_: Throwable) {
        }
    }

    private fun notifyPlayPause() {
        for (l in listeners) l.onTogglePlayPause()
    }

    private fun notifyNext() {
        for (l in listeners) l.onNextTrack()
    }

    private fun notifyPrevious() {
        for (l in listeners) l.onPreviousTrack()
    }

    private fun notifyVolumeAdjusted(direction: Int, percent: Int) {
        for (l in listeners) l.onVolumeAdjusted(direction, percent)
    }

    @Synchronized
    fun onKeyEvent(context: Context, event: KeyEvent): Boolean {
        appContext = context.applicationContext
        val keyCode = event.keyCode
        val action = event.action

        if (!isSupportedHeadsetKey(keyCode)) {
            return false
        }

        // OS Auto-Repeat Filtering:
        // On ACTION_DOWN, if event.repeatCount > 0, return true (consume the event)
        // WITHOUT resetting holdRunnable or incrementing clickCount!
        if (action == KeyEvent.ACTION_DOWN && event.repeatCount > 0) {
            return true
        }

        // Canceled key event check (e.g., gesture canceled by OS)
        if ((event.flags and KeyEvent.FLAG_CANCELED) != 0) {
            cancelAll()
            return true
        }

        // Deduplication check:
        // If identical (action, downTime) or same action within 35ms wall-clock time
        val nowWall = System.currentTimeMillis()
        val downTime = event.downTime
        val eventTime = event.eventTime

        val isDuplicateDownTime = (action == lastProcessedAction && downTime != 0L && downTime == lastProcessedDownTime)
        val isDuplicateWallClock = (action == lastProcessedAction && (nowWall - lastWallClockMs < 35L))

        if (isDuplicateDownTime || isDuplicateWallClock) {
            return true
        }

        lastProcessedAction = action
        lastProcessedDownTime = downTime
        lastProcessedEventTime = eventTime
        lastWallClockMs = nowWall

        when (action) {
            KeyEvent.ACTION_DOWN -> {
                isPressed = true
                // Cancel pending click evaluations because another press is starting
                handler.removeCallbacks(clickWindowRunnable)
                handler.removeCallbacks(holdRunnable)
                handler.removeCallbacks(holdSafetyRunnable)

                handler.postDelayed(holdRunnable, HOLD_THRESHOLD_MS)
                handler.postDelayed(holdSafetyRunnable, MAX_HOLD_SAFETY_MS)
                return true
            }

            KeyEvent.ACTION_UP -> {
                handler.removeCallbacks(holdRunnable)
                handler.removeCallbacks(holdSafetyRunnable)

                if (isHolding) {
                    stopVolumeRampSafety()
                    isPressed = false
                    completedClicks = 0
                    return true
                }

                isPressed = false
                completedClicks++

                if (completedClicks >= 3) {
                    handler.removeCallbacks(clickWindowRunnable)
                    completedClicks = 0
                    notifyPrevious()
                } else {
                    handler.removeCallbacks(clickWindowRunnable)
                    handler.postDelayed(clickWindowRunnable, CLICK_WINDOW_MS)
                }
                return true
            }
        }

        return false
    }
}
