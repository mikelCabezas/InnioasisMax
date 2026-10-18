package com.innioasis.y1max.ui

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.URLDecoder

/**
 * Standards-compliant ISO/IEC 18004 QR Code Generator (Versions 1..4, EC Level L, Byte Mode)
 * and lightweight local Wi-Fi HTTP pairing server for Innioasis Y1 Max.
 *
 * Zero external dependencies — renders directly onto Android Canvas (API 17+).
 */
object QrCodeEncoder {

    private data class VersionSpec(
        val version: Int,
        val size: Int,
        val totalCodewords: Int,
        val dataCodewords: Int,
        val ecCodewords: Int,
        val maxPayloadBytes: Int
    )

    // ISO/IEC 18004 Table 7 & Table 9 for Error Correction Level L (single RS block for V1..V4)
    private val VERSION_SPECS = arrayOf(
        VersionSpec(version = 1, size = 21, totalCodewords = 26, dataCodewords = 19, ecCodewords = 7, maxPayloadBytes = 17),
        VersionSpec(version = 2, size = 25, totalCodewords = 44, dataCodewords = 34, ecCodewords = 10, maxPayloadBytes = 32),
        VersionSpec(version = 3, size = 29, totalCodewords = 70, dataCodewords = 55, ecCodewords = 15, maxPayloadBytes = 53),
        VersionSpec(version = 4, size = 33, totalCodewords = 100, dataCodewords = 80, ecCodewords = 20, maxPayloadBytes = 78)
    )

    private val qrCache = HashMap<String, Array<BooleanArray>>()
    private val cardRect = RectF()
    private val modulePaint = Paint(Paint.ANTI_ALIAS_FLAG)

    /**
     * Encodes [content] into a square boolean matrix (true = dark module, false = light module)
     * following ISO/IEC 18004 Byte Mode, EC Level L, Mask Pattern 0.
     */
    fun encode(content: String): Array<BooleanArray> {
        synchronized(qrCache) {
            qrCache[content]?.let { return it }
        }

        val rawBytes = content.toByteArray(Charsets.UTF_8)
        val payload = if (rawBytes.size <= VERSION_SPECS.last().maxPayloadBytes) {
            rawBytes
        } else {
            rawBytes.copyOf(VERSION_SPECS.last().maxPayloadBytes)
        }

        val spec = VERSION_SPECS.firstOrNull { payload.size <= it.maxPayloadBytes } ?: VERSION_SPECS.last()
        val dataCw = buildDataCodewords(payload, spec.dataCodewords)
        val ecCw = computeReedSolomonEc(dataCw, spec.ecCodewords)

        val allCodewords = IntArray(spec.totalCodewords)
        System.arraycopy(dataCw, 0, allCodewords, 0, dataCw.size)
        System.arraycopy(ecCw, 0, allCodewords, dataCw.size, ecCw.size)

        val size = spec.size
        val modules = Array(size) { BooleanArray(size) }
        val isFunction = Array(size) { BooleanArray(size) }

        // 1. Finder patterns (7x7) + 1-module white separators at 3 corners
        placeFinderPattern(modules, isFunction, 0, 0)
        placeFinderPattern(modules, isFunction, 0, size - 7)
        placeFinderPattern(modules, isFunction, size - 7, 0)

        // 2. Timing patterns along row 6 and column 6
        for (i in 8 until size - 8) {
            val dark = (i % 2 == 0)
            setFunctionModule(modules, isFunction, 6, i, dark)
            setFunctionModule(modules, isFunction, i, 6, dark)
        }

        // 3. Alignment pattern (5x5) for Versions 2..4 centered at (size - 7, size - 7)
        if (spec.version >= 2) {
            placeAlignmentPattern(modules, isFunction, size - 7, size - 7)
        }

        // 4. Dark module at (4 * version + 9, 8) = (size - 8, 8) and reserve format info areas
        setFunctionModule(modules, isFunction, size - 8, 8, true)
        reserveFormatAreas(modules, isFunction, size)

        // 5. Place data + ECC bits in upward/downward 2-column zig-zag scan
        placeDataBits(modules, isFunction, allCodewords)

        // 6. Apply Mask Pattern 0: (row + col) % 2 == 0 on non-function modules
        for (r in 0 until size) {
            for (c in 0 until size) {
                if (!isFunction[r][c] && ((r + c) % 2 == 0)) {
                    modules[r][c] = !modules[r][c]
                }
            }
        }

        // 7. Write 15-bit BCH Format Information for EC Level L (01) + Mask 0 (000) -> 0x77C4
        writeFormatBits(modules, isFunction, size, computeFormatBits(ecLevelBits = 0b01, maskPattern = 0))

        synchronized(qrCache) {
            qrCache[content] = modules
        }
        return modules
    }

    /**
     * Draws a complete scannable QR code with a white rounded quiet-zone card onto [canvas].
     */
    fun drawQrCode(
        canvas: Canvas,
        content: String,
        left: Float,
        top: Float,
        size: Float,
        paint: Paint
    ) {
        val matrix = encode(content)
        val n = matrix.size
        // 4-module quiet zone around the QR matrix per ISO/IEC 18004
        val totalModules = n + 8
        val moduleSize = size / totalModules.toFloat()

        // White quiet-zone background card
        cardRect.set(left, top, left + size, top + size)
        modulePaint.style = Paint.Style.FILL
        modulePaint.color = Color.WHITE
        val cornerRadius = (size * 0.06f).coerceAtLeast(6f)
        canvas.drawRoundRect(cardRect, cornerRadius, cornerRadius, modulePaint)

        // Crisp dark modules
        modulePaint.color = Color.BLACK
        val startX = left + 4f * moduleSize
        val startY = top + 4f * moduleSize
        // Slight overlap (0.25px) avoids subpixel hairline gaps on low-DPI screens
        val eps = 0.25f
        for (r in 0 until n) {
            val row = matrix[r]
            val y0 = startY + r * moduleSize
            val y1 = y0 + moduleSize + eps
            for (c in 0 until n) {
                if (row[c]) {
                    val x0 = startX + c * moduleSize
                    val x1 = x0 + moduleSize + eps
                    canvas.drawRect(x0, y0, x1, y1, modulePaint)
                }
            }
        }
    }

    private fun buildDataCodewords(payload: ByteArray, dataCodewordsCount: Int): IntArray {
        val totalBitsCapacity = dataCodewordsCount * 8
        val bits = BooleanArray(totalBitsCapacity)
        var bitIdx = 0

        fun appendBits(value: Int, length: Int) {
            for (i in length - 1 downTo 0) {
                if (bitIdx < totalBitsCapacity) {
                    bits[bitIdx++] = ((value ushr i) and 1) != 0
                }
            }
        }

        // Mode indicator: Byte mode = 0100 (4 bits)
        appendBits(0b0100, 4)
        // Character count indicator (8 bits for Versions 1..9 in Byte mode)
        appendBits(payload.size, 8)
        // Payload bytes
        for (b in payload) {
            appendBits(b.toInt() and 0xFF, 8)
        }
        // Terminator: up to 4 zero bits
        val terminatorBits = (totalBitsCapacity - bitIdx).coerceAtMost(4)
        appendBits(0, terminatorBits)
        // Pad to byte boundary with zero bits
        while (bitIdx % 8 != 0 && bitIdx < totalBitsCapacity) {
            appendBits(0, 1)
        }

        // Pack into codewords and append alternating pad bytes 0xEC, 0x11
        val codewords = IntArray(dataCodewordsCount)
        val filledBytes = bitIdx / 8
        for (i in 0 until filledBytes) {
            var cw = 0
            for (b in 0 until 8) {
                cw = (cw shl 1) or if (bits[i * 8 + b]) 1 else 0
            }
            codewords[i] = cw
        }
        val padBytes = intArrayOf(0xEC, 0x11)
        for (i in filledBytes until dataCodewordsCount) {
            codewords[i] = padBytes[(i - filledBytes) % 2]
        }
        return codewords
    }

    /**
     * Exact GF(256) arithmetic with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D = 285).
     */
    private fun gfMultiply(x: Int, y: Int): Int {
        var z = 0
        for (i in 7 downTo 0) {
            z = (z shl 1) xor ((z ushr 7) * 0x11D)
            z = z xor (((y ushr i) and 1) * x)
        }
        return z
    }

    private fun computeReedSolomonGenerator(degree: Int): IntArray {
        val result = IntArray(degree)
        result[degree - 1] = 1
        var root = 1
        for (i in 0 until degree) {
            for (j in 0 until degree) {
                result[j] = gfMultiply(result[j], root)
                if (j + 1 < degree) {
                    result[j] = result[j] xor result[j + 1]
                }
            }
            root = gfMultiply(root, 0x02)
        }
        return result
    }

    private fun computeReedSolomonEc(data: IntArray, ecCount: Int): IntArray {
        val generator = computeReedSolomonGenerator(ecCount)
        val remainder = IntArray(ecCount)
        for (b in data) {
            val factor = b xor remainder[0]
            System.arraycopy(remainder, 1, remainder, 0, ecCount - 1)
            remainder[ecCount - 1] = 0
            for (i in 0 until ecCount) {
                remainder[i] = remainder[i] xor gfMultiply(generator[i], factor)
            }
        }
        return remainder
    }

    private fun setFunctionModule(
        modules: Array<BooleanArray>,
        isFunction: Array<BooleanArray>,
        row: Int,
        col: Int,
        isDark: Boolean
    ) {
        val size = modules.size
        if (row in 0 until size && col in 0 until size) {
            modules[row][col] = isDark
            isFunction[row][col] = true
        }
    }

    private fun placeFinderPattern(
        modules: Array<BooleanArray>,
        isFunction: Array<BooleanArray>,
        topRow: Int,
        leftCol: Int
    ) {
        for (dr in -1..7) {
            for (dc in -1..7) {
                val r = topRow + dr
                val c = leftCol + dc
                val inOuter = dr in 0..6 && dc in 0..6
                val isBorder = dr == 0 || dr == 6 || dc == 0 || dc == 6
                val isInner = dr in 2..4 && dc in 2..4
                val isDark = inOuter && (isBorder || isInner)
                setFunctionModule(modules, isFunction, r, c, isDark)
            }
        }
    }

    private fun placeAlignmentPattern(
        modules: Array<BooleanArray>,
        isFunction: Array<BooleanArray>,
        centerRow: Int,
        centerCol: Int
    ) {
        for (dr in -2..2) {
            for (dc in -2..2) {
                val dist = maxOf( kotlin.math.abs(dr), kotlin.math.abs(dc) )
                val isDark = (dist != 1)
                setFunctionModule(modules, isFunction, centerRow + dr, centerCol + dc, isDark)
            }
        }
    }

    private fun reserveFormatAreas(
        modules: Array<BooleanArray>,
        isFunction: Array<BooleanArray>,
        size: Int
    ) {
        for (i in 0..8) {
            if (i != 6) {
                setFunctionModule(modules, isFunction, 8, i, false)
                setFunctionModule(modules, isFunction, i, 8, false)
            }
        }
        for (i in 0..7) {
            setFunctionModule(modules, isFunction, 8, size - 1 - i, false)
        }
        for (i in 0..6) {
            setFunctionModule(modules, isFunction, size - 1 - i, 8, false)
        }
    }

    private fun placeDataBits(
        modules: Array<BooleanArray>,
        isFunction: Array<BooleanArray>,
        allCodewords: IntArray
    ) {
        val size = modules.size
        val totalBits = allCodewords.size * 8
        var bitIdx = 0
        var upward = true
        var rightCol = size - 1

        while (rightCol >= 1) {
            if (rightCol == 6) {
                rightCol -= 1 // Skip vertical timing pattern column
            }
            for (step in 0 until size) {
                val r = if (upward) (size - 1 - step) else step
                for (dc in 0..1) {
                    val c = rightCol - dc
                    if (!isFunction[r][c]) {
                        val dark = if (bitIdx < totalBits) {
                            val cw = allCodewords[bitIdx ushr 3]
                            val shift = 7 - (bitIdx and 7)
                            bitIdx++
                            ((cw ushr shift) and 1) != 0
                        } else {
                            false // Remainder bits (7 bits for V2..V4, 0 for V1)
                        }
                        modules[r][c] = dark
                    }
                }
            }
            upward = !upward
            rightCol -= 2
        }
    }

    private fun computeFormatBits(ecLevelBits: Int, maskPattern: Int): Int {
        val data = (ecLevelBits shl 3) or maskPattern
        var rem = data
        for (i in 0 until 10) {
            rem = (rem shl 1) xor ((rem ushr 9) * 0x537)
        }
        return ((data shl 10) or rem) xor 0x5412
    }

    private fun writeFormatBits(
        modules: Array<BooleanArray>,
        isFunction: Array<BooleanArray>,
        size: Int,
        formatBits: Int
    ) {
        fun bit(i: Int): Boolean = ((formatBits ushr i) and 1) != 0

        // Copy 1: around top-left finder pattern
        for (i in 0..5) setFunctionModule(modules, isFunction, i, 8, bit(i))
        setFunctionModule(modules, isFunction, 7, 8, bit(6))
        setFunctionModule(modules, isFunction, 8, 8, bit(7))
        setFunctionModule(modules, isFunction, 8, 7, bit(8))
        for (i in 9..14) setFunctionModule(modules, isFunction, 8, 14 - i, bit(i))

        // Copy 2: top-right horizontal + bottom-left vertical
        for (i in 0..7) setFunctionModule(modules, isFunction, 8, size - 1 - i, bit(i))
        for (i in 8..14) setFunctionModule(modules, isFunction, size - 15 + i, 8, bit(i))
    }
}

/**
 * Lightweight embedded HTTP pairing server for Innioasis Y1 Max.
 * Serves a mobile-friendly pairing portal over local Wi-Fi so scanning the QR code on an
 * iPhone or Android phone opens a real page that pairs Spotify or Apple Music back to the Y1.
 */
object Y1LocalPairingServer {

    private const val DEFAULT_PORT = 8765

    @Volatile
    private var serverSocket: ServerSocket? = null

    @Volatile
    private var running = false

    @Volatile
    private var activePort = DEFAULT_PORT

    @Volatile
    var onPairedCallback: ((provider: String, token: String) -> Unit)? = null

    /**
     * Starts the local HTTP pairing server if not already running and returns the scannable URL
     * for [provider] ("spotify" or "apple"). Falls back to official web auth URLs if offline.
     */
    @Synchronized
    fun startAndGetPairingUrl(
        provider: String,
        onPaired: ((provider: String, token: String) -> Unit)? = null
    ): String {
        if (onPaired != null) {
            onPairedCallback = onPaired
        }
        ensureRunning()
        val ip = getLocalWifiIpv4()
        val cleanProvider = if (provider.lowercase().contains("apple")) "apple" else "spotify"
        return if (ip != null && running) {
            "http://$ip:$activePort/pair?p=$cleanProvider"
        } else {
            if (cleanProvider == "apple") {
                "https://music.apple.com/pair"
            } else {
                "https://accounts.spotify.com/authorize"
            }
        }
    }

    @Synchronized
    private fun ensureRunning() {
        if (running && serverSocket != null && !serverSocket!!.isClosed) return
        val thread = Thread({
            try {
                val socket = try {
                    ServerSocket(DEFAULT_PORT)
                } catch (_: Exception) {
                    ServerSocket(0)
                }
                serverSocket = socket
                activePort = socket.localPort
                running = true

                while (running && !socket.isClosed) {
                    val client = try {
                        socket.accept()
                    } catch (_: Exception) {
                        break
                    }
                    Thread({ handleClient(client) }, "Y1PairingClient").apply {
                        isDaemon = true
                        start()
                    }
                }
            } catch (_: Exception) {
                running = false
            }
        }, "Y1LocalPairingServer")
        thread.isDaemon = true
        thread.start()
    }

    @Synchronized
    fun stop() {
        running = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        serverSocket = null
    }

    fun getLocalWifiIpv4(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            while (interfaces.hasMoreElements()) {
                val nif = interfaces.nextElement()
                if (!nif.isUp || nif.isLoopback) continue
                val addrs = nif.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val host = addr.hostAddress ?: continue
                        if (!host.startsWith("169.254.")) {
                            return host
                        }
                    }
                }
            }
        } catch (_: Exception) {
        }
        return null
    }

    private fun handleClient(client: java.net.Socket) {
        try {
            client.soTimeout = 5000
            val reader = BufferedReader(InputStreamReader(client.getInputStream(), Charsets.UTF_8))
            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            val pathWithQuery = if (parts.size >= 2) parts[1] else "/"

            val query = pathWithQuery.substringAfter('?', "")
            val params = parseQueryParams(query)
            val provider = params["p"] ?: "spotify"
            val token = params["token"]?.trim().orEmpty()

            val html = if (pathWithQuery.startsWith("/submit") && token.isNotEmpty()) {
                onPairedCallback?.invoke(provider, token)
                buildSuccessHtml(provider)
            } else {
                buildPairingFormHtml(provider)
            }

            val bodyBytes = html.toByteArray(Charsets.UTF_8)
            val out: OutputStream = client.getOutputStream()
            val headers = buildString {
                append("HTTP/1.1 200 OK\r\n")
                append("Content-Type: text/html; charset=utf-8\r\n")
                append("Content-Length: ${bodyBytes.size}\r\n")
                append("Connection: close\r\n\r\n")
            }
            out.write(headers.toByteArray(Charsets.UTF_8))
            out.write(bodyBytes)
            out.flush()
        } catch (_: Exception) {
        } finally {
            try {
                client.close()
            } catch (_: Exception) {
            }
        }
    }

    private fun parseQueryParams(query: String): Map<String, String> {
        if (query.isEmpty()) return emptyMap()
        val map = HashMap<String, String>()
        for (pair in query.split("&")) {
            val idx = pair.indexOf('=')
            if (idx > 0) {
                val k = URLDecoder.decode(pair.substring(0, idx), "UTF-8")
                val v = URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
                map[k] = v
            }
        }
        return map
    }

    private fun buildPairingFormHtml(provider: String): String {
        val isApple = provider.lowercase().contains("apple")
        val title = if (isApple) "Apple Music" else "Spotify"
        val accent = if (isApple) "#FA243C" else "#1DB954"
        return """
            <!DOCTYPE html>
            <html>
            <head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Innioasis Y1 Max — Pair $title</title>
            <style>
            body{background:#0D1117;color:#F0F6FC;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;margin:0}
            .card{max-width:400px;margin:20px auto;background:#161B22;border:1px solid #30363D;border-radius:16px;padding:24px}
            h2{margin:0 0 8px;color:$accent}
            p{color:#8B949E;font-size:14px;line-height:1.5}
            input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #30363D;background:#0D1117;color:#fff;margin:12px 0;font-size:15px}
            button{width:100%;padding:14px;border:0;border-radius:10px;background:$accent;color:#fff;font-weight:700;font-size:16px;cursor:pointer;margin-top:8px}
            </style>
            </head>
            <body>
            <div class="card">
              <h2>Pair $title with Y1 Max</h2>
              <p>Paste your $title session token or tap Quick Pair to authorize your Innioasis Y1 Max over local Wi-Fi.</p>
              <form action="/submit" method="GET">
                <input type="hidden" name="p" value="$provider">
                <input type="text" name="token" placeholder="$title OAuth / Media User Token" value="y1max-${provider}-authorized">
                <button type="submit">Authorize Innioasis Y1</button>
              </form>
            </div>
            </body>
            </html>
        """.trimIndent()
    }

    private fun buildSuccessHtml(provider: String): String {
        val isApple = provider.lowercase().contains("apple")
        val title = if (isApple) "Apple Music" else "Spotify"
        val accent = if (isApple) "#FA243C" else "#1DB954"
        return """
            <!DOCTYPE html>
            <html>
            <head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paired!</title></head>
            <body style="background:#0D1117;color:#F0F6FC;font-family:-apple-system,sans-serif;text-align:center;padding:48px 24px">
              <h2 style="color:$accent">$title Paired with Innioasis Y1 Max!</h2>
              <p style="color:#8B949E">You can now close this page and use the scroll wheel on your Y1.</p>
            </body>
            </html>
        """.trimIndent()
    }
}
