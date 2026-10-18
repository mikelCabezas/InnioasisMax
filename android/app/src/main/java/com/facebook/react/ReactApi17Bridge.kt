package com.facebook.react

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Bundle
import android.view.Window
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.innioasis.y1max.audio.Y1AudioModule
import com.innioasis.y1max.ui.Y1MaxNativeRuntimeView

/**
 * Puente ligero compatible con Android 4.2.2 Jelly Bean (API 17 / Dalvik / MediaTek MT6572)
 * que implementa las firmas de React Native (`ReactActivity`, `ReactInstanceManager`, `ReactApplicationContext`,
 * `DeviceEventManagerModule`, `Arguments`) sin arrastrar los binarios C++ API-24 de Hermes/SoLoader
 * que provocan `INSTALL_FAILED_OLDER_SDK` o `UnsatisfiedLinkError` en el firmware real del Innioasis Y1.
 */
open class ReactActivity : Activity() {
    var reactInstanceManager: ReactInstanceManager? = null
    private var runtimeView: Y1MaxNativeRuntimeView? = null

    open fun getMainComponentName(): String = "main"

    override fun onCreate(savedInstanceState: Bundle?) {
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        @Suppress("DEPRECATION")
        val flags = WindowManager.LayoutParams.FLAG_FULLSCREEN or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
        window.setFlags(flags, flags)
        super.onCreate(savedInstanceState)

        val reactContext = ReactApplicationContext(applicationContext)
        val audioModule = Y1AudioModule(reactContext)
        val view = Y1MaxNativeRuntimeView(this, reactContext, audioModule)
        runtimeView = view

        reactContext.emitter = object : DeviceEventManagerModule.RCTDeviceEventEmitter {
            override fun emit(eventName: String, data: Any?) {
                view.onReactBridgeEvent(eventName, data as? WritableMap)
            }
        }

        reactInstanceManager = ReactInstanceManager(reactContext)
        setContentView(view)
    }
}

class ReactInstanceManager(val currentReactContext: ReactApplicationContext?)

interface ReactPackage {
    fun createNativeModules(reactContext: ReactApplicationContext): List<com.facebook.react.bridge.NativeModule>
    fun createViewManagers(reactContext: ReactApplicationContext): List<com.facebook.react.uimanager.ViewManager<*, *>>
}
