package com.facebook.react.modules.core

class DeviceEventManagerModule {
    interface RCTDeviceEventEmitter {
        fun emit(eventName: String, data: Any?)
    }
}
