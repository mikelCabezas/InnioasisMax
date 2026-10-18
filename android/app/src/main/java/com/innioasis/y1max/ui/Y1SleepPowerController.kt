package com.innioasis.y1max.ui

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.WindowManager
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Innioasis Y1 (MediaTek MT6572 Android 4.2.2 API 17) Sleep & Backlight Controller.
 *
 * Provides:
 * 1. Screen timeout policy via Settings.System.SCREEN_OFF_TIMEOUT, FLAG_KEEP_SCREEN_ON,
 *    and disabling stay_on_while_plugged_in via root su.
 * 2. Deep display sleep: Sets window screenBrightness to 0.0f, clears FLAG_KEEP_SCREEN_ON,
 *    and writes 0 directly to /sys/class/leds/lcd-backlight/brightness via su / direct sysfs
 *    so the physical LCD backlight turns 100% OFF even when plugged into USB power,
 *    while the Activity stays alive to capture Click Wheel button presses.
 * 3. Instant display wake: Restores window screenBrightness and writes target brightness
 *    to /sys/class/leds/lcd-backlight/brightness on the very first button or wheel event.
 * 4. Hardware backlight control synchronized with Settings brightness changes.
 */
object Y1SleepPowerController {

    private const val TAG = "Y1SleepPowerController"
    private const val BACKLIGHT_SYSFS = "/sys/class/leds/lcd-backlight/brightness"
    private const val SU_BINARY = "/system/xbin/su"

    @Volatile
    var isDisplayAsleep: Boolean = false

    private val bgExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    init {
        // Attempt to grant world-write permissions to sysfs backlight node for fast access
        bgExecutor.execute {
            runSuCommand("chmod 666 $BACKLIGHT_SYSFS")
        }
    }

    /**
     * Updates SCREEN_OFF_TIMEOUT, window FLAG_KEEP_SCREEN_ON, and disables
     * stay_on_while_plugged_in via root so USB power does not inhibit display sleep.
     */
    fun applyTimeoutPolicy(activity: Activity?, timeoutSeconds: Int) {
        val timeoutMs = if (timeoutSeconds > 0) timeoutSeconds * 1000 else Int.MAX_VALUE
        try {
            activity?.contentResolver?.let { resolver ->
                Settings.System.putInt(resolver, Settings.System.SCREEN_OFF_TIMEOUT, timeoutMs)
            }
        } catch (_: Throwable) {
        }

        activity?.let { act ->
            act.runOnUiThread {
                try {
                    act.window?.let { win ->
                        if (timeoutSeconds > 0) {
                            win.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        } else {
                            win.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        }
                    }
                } catch (_: Throwable) {
                }
            }
        }

        // Disable stay_on_while_plugged_in so USB charging doesn't prevent screen timeout
        bgExecutor.execute {
            runSuCommand("settings put global stay_on_while_plugged_in 0")
        }
    }

    /**
     * Enters display sleep:
     * - Returns immediately if already asleep
     * - Sets isDisplayAsleep = true
     * - Clears FLAG_KEEP_SCREEN_ON and sets window screenBrightness to 0.0f
     * - Writes 0 to /sys/class/leds/lcd-backlight/brightness via root su / direct sysfs
     *   so the Innioasis Y1 physical LCD backlight turns 100% OFF even when plugged into USB,
     *   while the Activity stays alive to receive the next Click Wheel button press.
     */
    fun enterDisplaySleep(activity: Activity?) {
        if (isDisplayAsleep) return
        isDisplayAsleep = true

        activity?.let { act ->
            act.runOnUiThread {
                try {
                    act.window?.let { win ->
                        win.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        val lp = win.attributes
                        lp.screenBrightness = 0.0f
                        win.attributes = lp
                    }
                } catch (_: Throwable) {
                }
            }
        }

        bgExecutor.execute {
            writeHardwareBrightness(0)
        }
    }

    /**
     * Wakes display:
     * - Returns false if !isDisplayAsleep (unless force = true)
     * - Sets isDisplayAsleep = false
     * - Restores window screenBrightness to targetBrightnessPercent
     * - Writes target brightness to /sys/class/leds/lcd-backlight/brightness via root su / direct sysfs
     * - Returns true (indicating this input event woke the screen)
     */
    fun wakeDisplay(activity: Activity?, targetBrightnessPercent: Int, force: Boolean = false): Boolean {
        if (!isDisplayAsleep && !force) return false
        isDisplayAsleep = false

        val clampedPercent = targetBrightnessPercent.coerceIn(10, 100)
        val windowBrightness = clampedPercent / 100f
        val hwVal = (clampedPercent * 255) / 100

        activity?.let { act ->
            act.runOnUiThread {
                try {
                    act.window?.let { win ->
                        val lp = win.attributes
                        lp.screenBrightness = windowBrightness
                        win.attributes = lp
                    }
                } catch (_: Throwable) {
                }
            }
        }

        bgExecutor.execute {
            writeHardwareBrightness(hwVal)
        }

        return true
    }

    /**
     * Sets hardware LCD backlight directly (e.g. when changing brightness in Settings).
     */
    fun setHardwareBacklight(targetBrightnessPercent: Int) {
        val clampedPercent = targetBrightnessPercent.coerceIn(10, 100)
        val hwVal = (clampedPercent * 255) / 100
        bgExecutor.execute {
            writeHardwareBrightness(hwVal)
        }
    }

    /**
     * Writes raw integer brightness to /sys/class/leds/lcd-backlight/brightness.
     * Tries direct file write first; if not permitted, falls back to su command.
     */
    private fun writeHardwareBrightness(value: Int) {
        var written = false
        try {
            val file = File(BACKLIGHT_SYSFS)
            if (file.exists() && file.canWrite()) {
                FileOutputStream(file).use { fos ->
                    fos.write(value.toString().toByteArray())
                    fos.flush()
                }
                written = true
            }
        } catch (_: Throwable) {
        }

        if (!written) {
            runSuCommand("echo $value > $BACKLIGHT_SYSFS")
        }
    }

    /**
     * Executes shell command using /system/xbin/su (or su in PATH), safely catching all errors.
     */
    private fun runSuCommand(cmd: String) {
        try {
            val suBinary = if (File(SU_BINARY).exists()) SU_BINARY else "su"
            val process = ProcessBuilder(suBinary, "-c", cmd).redirectErrorStream(true).start()
            process.waitFor()
        } catch (_: Throwable) {
        }
    }
}
