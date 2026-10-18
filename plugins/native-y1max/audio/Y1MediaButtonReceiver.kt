package com.innioasis.y1max.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.view.KeyEvent

/**
 * Y1MediaButtonReceiver: BroadcastReceiver para Intent.ACTION_MEDIA_BUTTON.
 * Intercepta de manera exclusiva las pulsaciones del botón de auriculares 3.5mm (ACCDET)
 * y aborta el broadcast ordenado para que apps de fábrica (p.ej. com.themoon.y1)
 * no intercepten ni roben los eventos.
 */
class Y1MediaButtonReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (Intent.ACTION_MEDIA_BUTTON != intent.action) {
            return
        }

        @Suppress("DEPRECATION")
        val keyEvent = intent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return

        if (HeadsetButtonController.isSupportedHeadsetKey(keyEvent.keyCode)) {
            HeadsetButtonController.onKeyEvent(context.applicationContext, keyEvent)
            if (isOrderedBroadcast) {
                abortBroadcast()
            }
        }
    }
}
