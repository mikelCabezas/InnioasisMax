package com.innioasis.y1max.ui

import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/**
 * Y1TimeController: Gestor de Fecha, Hora y Zona Horaria para Innioasis Y1 (Android 4.2.2 API 17).
 *
 * Características:
 * 1. Sincronización automática por Wi-Fi / NTP (HTTP Header Date de Google + geolocalización IP).
 * 2. Ajuste manual de hora y minutos mediante la Click Wheel.
 * 3. Selección de Zona Horaria (Europe/Madrid por defecto) con persistencia vía `/system/xbin/su`.
 * 4. Formato 24h / 12h para la barra superior.
 */
object Y1TimeController {

    private val executor = Executors.newSingleThreadExecutor()

    var is24HourFormat: Boolean = true

    data class TimezoneItem(val id: String, val label: String)

    val timezones = listOf(
        TimezoneItem("Europe/Madrid", "Europe/Madrid (GMT+2 / CEST)"),
        TimezoneItem("Europe/London", "Europe/London (GMT+1 / BST)"),
        TimezoneItem("Europe/Paris", "Europe/Paris (GMT+2 / CEST)"),
        TimezoneItem("Europe/Berlin", "Europe/Berlin (GMT+2 / CEST)"),
        TimezoneItem("America/New_York", "America/New_York (GMT-4 / EDT)"),
        TimezoneItem("America/Chicago", "America/Chicago (GMT-5 / CDT)"),
        TimezoneItem("America/Denver", "America/Denver (GMT-6 / MDT)"),
        TimezoneItem("America/Los_Angeles", "America/Los_Angeles (GMT-7 / PDT)"),
        TimezoneItem("America/Buenos_Aires", "America/Buenos_Aires (GMT-3)"),
        TimezoneItem("America/Mexico_City", "America/Mexico_City (GMT-6)"),
        TimezoneItem("Asia/Tokyo", "Asia/Tokyo (GMT+9)"),
        TimezoneItem("Asia/Shanghai", "Asia/Shanghai (GMT+8)"),
        TimezoneItem("UTC", "UTC (GMT+0)")
    )

    var currentTimezoneIndex: Int = 0
        private set

    init {
        // Inicializar zona horaria actual
        val currentTzId = TimeZone.getDefault().id
        val idx = timezones.indexOfFirst { it.id.equals(currentTzId, ignoreCase = true) }
        currentTimezoneIndex = if (idx >= 0) idx else 0
        applyTimezone(timezones[currentTimezoneIndex].id)
    }

    fun getCurrentTimezoneLabel(): String {
        return timezones[currentTimezoneIndex].label
    }

    fun cycleTimezone(onChanged: () -> Unit) {
        currentTimezoneIndex = (currentTimezoneIndex + 1) % timezones.size
        val tz = timezones[currentTimezoneIndex].id
        applyTimezone(tz)
        onChanged()
    }

    fun applyTimezone(tzId: String) {
        try {
            val tz = TimeZone.getTimeZone(tzId)
            TimeZone.setDefault(tz)
        } catch (_: Throwable) {}

        executor.execute {
            try {
                Runtime.getRuntime().exec(arrayOf(
                    "/system/xbin/su", "-c",
                    "setprop persist.sys.timezone $tzId; setprop persist.sys.country ES"
                )).waitFor()
            } catch (_: Throwable) {}
        }
    }

    fun formatClock(): String {
        val pattern = if (is24HourFormat) "HH:mm" else "h:mm a"
        val sdf = SimpleDateFormat(pattern, Locale.getDefault())
        return sdf.format(Date())
    }

    fun adjustHours(delta: Int, onComplete: () -> Unit) {
        val cal = Calendar.getInstance()
        cal.add(Calendar.HOUR_OF_DAY, delta)
        applySystemTime(cal.timeInMillis, onComplete)
    }

    fun adjustMinutes(delta: Int, onComplete: () -> Unit) {
        val cal = Calendar.getInstance()
        cal.add(Calendar.MINUTE, delta)
        applySystemTime(cal.timeInMillis, onComplete)
    }

    private fun applySystemTime(targetEpochMs: Long, onComplete: () -> Unit) {
        executor.execute {
            try {
                val cal = Calendar.getInstance()
                cal.timeInMillis = targetEpochMs
                val sdf = SimpleDateFormat("yyyyMMdd.HHmmss", Locale.US)
                val formatted = sdf.format(cal.time)

                Runtime.getRuntime().exec(arrayOf(
                    "/system/xbin/su", "-c",
                    "date -s $formatted"
                )).waitFor()
            } catch (_: Throwable) {}

            onComplete()
        }
    }

    /**
     * Sincronización automática de Fecha y Hora por Wi-Fi / HTTP Header Date.
     */
    fun syncTimeOverWifi(onResult: (Boolean, String) -> Unit) {
        executor.execute {
            var success = false
            var msg = "Error connecting to time server"
            val endpoints = listOf(
                "http://clients3.google.com/generate_204",
                "http://www.google.com",
                "http://worldtimeapi.org/api/ip"
            )

            for (endpoint in endpoints) {
                var conn: HttpURLConnection? = null
                try {
                    val url = URL(endpoint)
                    conn = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 3500
                        readTimeout = 3500
                        instanceFollowRedirects = false
                        requestMethod = "GET"
                        setRequestProperty("User-Agent", "Y1MaxOS/1.0 (Android 4.2.2)")
                    }
                    conn.connect()

                    val serverEpoch = conn.date
                    if (serverEpoch > 1577836800000L) { // Post 2020
                        val cal = Calendar.getInstance()
                        cal.timeInMillis = serverEpoch
                        val sdf = SimpleDateFormat("yyyyMMdd.HHmmss", Locale.US)
                        val formatted = sdf.format(cal.time)

                        val proc = Runtime.getRuntime().exec(arrayOf(
                            "/system/xbin/su", "-c",
                            "date -s $formatted"
                        ))
                        proc.waitFor()

                        // Detectar timezone si es endpoint de IP
                        if (endpoint.contains("worldtimeapi")) {
                            try {
                                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                                val body = reader.readText()
                                val tzMatch = Regex("\"timezone\":\"([^\"]+)\"").find(body)
                                if (tzMatch != null) {
                                    val detectedTz = tzMatch.groupValues[1]
                                    val idx = timezones.indexOfFirst { it.id.equals(detectedTz, ignoreCase = true) }
                                    if (idx >= 0) {
                                        currentTimezoneIndex = idx
                                        applyTimezone(timezones[idx].id)
                                    }
                                }
                            } catch (_: Throwable) {}
                        }

                        val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(serverEpoch))
                        msg = "Synced: $timeStr (${getCurrentTimezoneLabel()})"
                        success = true
                        break
                    }
                } catch (e: Throwable) {
                    msg = "Sync failed: ${e.message ?: "Timeout"}"
                } finally {
                    try { conn?.disconnect() } catch (_: Throwable) {}
                }
            }

            onResult(success, msg)
        }
    }
}
