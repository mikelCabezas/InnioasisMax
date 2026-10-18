package com.facebook.react.bridge

import android.content.Context
import android.content.ContextWrapper
import com.facebook.react.modules.core.DeviceEventManagerModule

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class ReactMethod

interface NativeModule {
    fun getName(): String
}

abstract class ReactContextBaseJavaModule(
    protected val reactApplicationContext: ReactApplicationContext
) : NativeModule

class ReactApplicationContext(base: Context) : ContextWrapper(base) {
    var emitter: DeviceEventManagerModule.RCTDeviceEventEmitter =
        object : DeviceEventManagerModule.RCTDeviceEventEmitter {
            override fun emit(eventName: String, data: Any?) {}
        }

    @Suppress("UNCHECKED_CAST")
    fun <T> getJSModule(clazz: Class<T>): T {
        return emitter as T
    }
}

interface ReadableMap {
    fun hasKey(name: String): Boolean
    fun getString(name: String): String?
    fun getInt(name: String): Int
    fun getDouble(name: String): Double
    fun getBoolean(name: String): Boolean
}

interface WritableMap : ReadableMap {
    fun putString(key: String, value: String?)
    fun putInt(key: String, value: Int)
    fun putDouble(key: String, value: Double)
    fun putBoolean(key: String, value: Boolean)
}

class SimpleWritableMap : WritableMap {
    private val map = HashMap<String, Any?>()

    override fun hasKey(name: String): Boolean = map.containsKey(name)
    override fun getString(name: String): String? = map[name] as? String
    override fun getInt(name: String): Int = (map[name] as? Number)?.toInt() ?: 0
    override fun getDouble(name: String): Double = (map[name] as? Number)?.toDouble() ?: 0.0
    override fun getBoolean(name: String): Boolean = (map[name] as? Boolean) ?: false

    override fun putString(key: String, value: String?) {
        map[key] = value
    }

    override fun putInt(key: String, value: Int) {
        map[key] = value
    }

    override fun putDouble(key: String, value: Double) {
        map[key] = value
    }

    override fun putBoolean(key: String, value: Boolean) {
        map[key] = value
    }
}

object Arguments {
    fun createMap(): WritableMap = SimpleWritableMap()
}

interface Promise {
    fun resolve(value: Any?)
    fun reject(code: String, message: String)
}

class NoOpPromise : Promise {
    override fun resolve(value: Any?) {}
    override fun reject(code: String, message: String) {}
}
