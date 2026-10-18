package com.innioasis.y1max

import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import com.facebook.react.ReactActivity
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.innioasis.y1max.audio.HeadsetButtonController
import com.innioasis.y1max.ui.Y1SleepPowerController

/**
 * MainActivity del Launcher Y1 Max OS para Innioasis Y1.
 * - Fuerza modo Immersive Sticky (oculta barras de Android AOSP).
 * - Intercepta todos los KeyEvents de la rueda física/capacitiva y los emite a JS
 *   con latencia cero mediante el evento "Y1HardwareKey".
 * - Bloquea el botón Back por defecto de Android para que la rueda gestione la pila de menús.
 */
class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "main"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableImmersiveStickyMode()
        HeadsetButtonController.registerSystemWide(this)
    }

    override fun onResume() {
        super.onResume()
        HeadsetButtonController.registerSystemWide(this)
        Y1SleepPowerController.wakeDisplay(this, 80)
    }

    override fun onPause() {
        HeadsetButtonController.stopVolumeRampSafety()
        super.onPause()
    }

    override fun onStop() {
        HeadsetButtonController.stopVolumeRampSafety()
        super.onStop()
    }

    override fun onDestroy() {
        HeadsetButtonController.stopVolumeRampSafety()
        Y1SleepPowerController.wakeDisplay(this, 80)
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableImmersiveStickyMode()
        }
    }

    private fun enableImmersiveStickyMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val keyCode = event.keyCode
        val runtimeView = getRuntimeView()
        val isTextEntry = runtimeView?.isPlayPauseNeededForTextEntry() == true

        if (keyCode == KeyEvent.KEYCODE_HEADSETHOOK ||
            (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && !isTextEntry)
        ) {
            HeadsetButtonController.onKeyEvent(this, event)
            return true
        }

        val scanCode = event.scanCode
        val action = event.action

        // 1. Mapeo exacto verificado por logcat (interceptKeyTq) en el hardware real del Innioasis Y1:
        //    - Giro horario de la rueda capacitiva -> scanCode 108 / keyCode 22 (KEYCODE_DPAD_RIGHT)
        //    - Giro antihorario de la rueda capacitiva -> scanCode 103 / keyCode 21 (KEYCODE_DPAD_LEFT)
        //    - Botón físico >>| (Derecha) -> scanCode 106 / keyCode 87 (KEYCODE_MEDIA_NEXT)
        //    - Botón físico |<< (Izquierda) -> scanCode 105 / keyCode 88 (KEYCODE_MEDIA_PREVIOUS)
        //    - Botón físico >|| (Abajo) -> scanCode 164 / keyCode 85 (KEYCODE_MEDIA_PLAY_PAUSE)
        //    - Botón físico MENU (Arriba) -> scanCode 158 / keyCode 4 (KEYCODE_BACK)
        //    - Botón físico CENTRAL -> scanCode 232 / keyCode 66 (KEYCODE_ENTER) o 23 (DPAD_CENTER)
        val mappedByScanCode = when (scanCode) {
            108, 115 -> "WHEEL_CW"       // Giro horario de la Click Wheel (Bajar en listas)
            103, 114 -> "WHEEL_CCW"      // Giro antihorario de la Click Wheel (Subir en listas)
            232, 353 -> "CENTER"         // Botón Central (Select)
            158, 139 -> "MENU"           // Botón Superior MENU / Back
            164 -> "PLAY_PAUSE"          // Botón Inferior Play/Pause
            106 -> "NEXT"                // Botón Derecho >>|
            105 -> "PREVIOUS"            // Botón Izquierdo |<<
            else -> null
        }

        val mappedButton = mappedByScanCode ?: when (keyCode) {
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_VOLUME_UP -> "WHEEL_CW"

            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_VOLUME_DOWN -> "WHEEL_CCW"

            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER -> "CENTER"

            KeyEvent.KEYCODE_BACK,
            KeyEvent.KEYCODE_MENU,
            KeyEvent.KEYCODE_ESCAPE -> "MENU"

            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE -> "PLAY_PAUSE"

            KeyEvent.KEYCODE_MEDIA_NEXT -> "NEXT"

            KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "PREVIOUS"

            else -> null
        }

        if (mappedButton != null) {
            if (action == KeyEvent.ACTION_DOWN) {
                if ((mappedButton == "CENTER" || mappedButton == "MENU") && event.repeatCount == 0) {
                    getRuntimeView()?.onLockKeyDown()
                }
                if (mappedButton == "CENTER" && (event.isLongPress || event.repeatCount == 1)) {
                    emitHardwareKeyEvent("CENTER_LONG", event.repeatCount)
                } else if (mappedButton != "CENTER" || event.repeatCount == 0) {
                    emitHardwareKeyEvent(mappedButton, event.repeatCount)
                }
            } else if (action == KeyEvent.ACTION_UP) {
                if (mappedButton == "CENTER" || mappedButton == "MENU") {
                    getRuntimeView()?.onLockKeyUp()
                }
            }
            return true
        }

        return super.dispatchKeyEvent(event)
    }

    private fun getRuntimeView(): com.innioasis.y1max.ui.Y1MaxNativeRuntimeView? {
        val content = findViewById<View>(android.R.id.content) as? android.view.ViewGroup ?: return null
        for (i in 0 until content.childCount) {
            val child = content.getChildAt(i)
            if (child is com.innioasis.y1max.ui.Y1MaxNativeRuntimeView) {
                return child
            }
        }
        return null
    }

    private fun emitHardwareKeyEvent(button: String, repeatCount: Int) {
        val reactContext = reactInstanceManager?.currentReactContext ?: return
        val params = com.facebook.react.bridge.Arguments.createMap().apply {
            putString("button", button)
            putInt("repeatCount", repeatCount)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("Y1HardwareKey", params)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Nunca cerrar el Launcher en modo Kiosco
        emitHardwareKeyEvent("MENU", 0)
    }
}
