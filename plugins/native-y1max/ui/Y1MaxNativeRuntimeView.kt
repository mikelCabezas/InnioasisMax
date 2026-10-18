package com.innioasis.y1max.ui

import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.media.AudioManager
import android.media.MediaMetadataRetriever
import android.net.wifi.WifiManager
import android.os.Environment
import android.os.Vibrator
import android.provider.Settings
import android.util.LruCache
import android.view.MotionEvent
import android.view.SoundEffectConstants
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NoOpPromise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.innioasis.y1max.audio.HeadsetButtonController
import com.innioasis.y1max.audio.Y1AudioModule
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

/**
 * Y1MaxNativeRuntimeView: Motor de renderizado nativo 2D acelerado por GPU (Mali-400 MP1 / API 17+)
 * diseñado para correr a 60 FPS en el Innioasis Y1 (Android 4.2.2 Jelly Bean, MT6572, 480x360).
 *
 * Incluye:
 * - Indexación completa SIN LÍMITE de `/storage/sdcard0/Music` y `/storage/sdcard1` (1,695+ canciones).
 * - Lector de Playlists `.m3u` reales desde `/storage/sdcard0/Playlists` y `/storage/sdcard0/Y1_Playlists`
 *   (incluyendo `Daily Mix 1..6`, `Descubrimiento Semanal`, `Radar de Novedades`, `Apple Music - ...`).
 * - Agrupación real por Álbumes, Artistas, Playlists y Todas las Canciones.
 * - Extractor asíncrono de carátulas ID3/FLAC reales (`MediaMetadataRetriever` con `LruCache` RGB_565)
 *   para el Collage 2x2, la vista previa derecha en tiempo real, Cover Flow 3D y Now Playing.
 */
class Y1MaxNativeRuntimeView(
    context: Context,
    private val reactContext: ReactApplicationContext,
    private val audioModule: Y1AudioModule
) : View(context) {

    data class TrackItem(
        val id: String,
        val title: String,
        val artist: String,
        val album: String,
        val durationMs: Long,
        val source: String, // "local" | "spotify" | "apple_music"
        val uri: String,
        val codecLabel: String,
        val coverColor: Int
    )

    data class PlaylistGroup(
        val id: String,
        val name: String,
        val tracks: List<TrackItem>
    )

    data class AlbumGroup(
        val id: String,
        val title: String,
        val artist: String,
        val tracks: List<TrackItem>,
        val representativeTrack: TrackItem
    )

    data class ArtistGroup(
        val id: String,
        val name: String,
        val albums: List<AlbumGroup>,
        val tracks: List<TrackItem>
    )

    data class MenuItem(
        val id: String,
        val label: String,
        val sublabel: String = "",
        val badge: String = "",
        val hasChevron: Boolean = true,
        val previewKind: String = "album_collage",
        val accentColor: Int = Color.parseColor("#1D6FE8"),
        val previewTrack: TrackItem? = null,
        val onSelect: () -> Unit
    )

    data class MenuPage(
        val id: String,
        val title: String,
        val screenType: String, // "split_menu" | "cover_flow" | "now_playing" | "qr_auth" | "wheel_search"
        val providerBadge: String = "local",
        val items: List<MenuItem> = emptyList(),
        var focusedIndex: Int = 0
    )

    data class ThemePalette(
        val name: String,
        val bg: Int,
        val paneRightBg: Int,
        val statusBarTop: Int,
        val statusBarBottom: Int,
        val textPrimary: Int,
        val textSecondary: Int,
        val highlightTop: Int,
        val highlightBottom: Int,
        val highlightText: Int,
        val divider: Int
    )

    private val themes = listOf(
        ThemePalette(
            name = "Classic Color",
            bg = Color.parseColor("#F5F6F8"),
            paneRightBg = Color.parseColor("#EAECEF"),
            statusBarTop = Color.parseColor("#F2F4F7"),
            statusBarBottom = Color.parseColor("#CFD5DF"),
            textPrimary = Color.parseColor("#111317"),
            textSecondary = Color.parseColor("#5B6270"),
            highlightTop = Color.parseColor("#479AF5"),
            highlightBottom = Color.parseColor("#1664D8"),
            highlightText = Color.WHITE,
            divider = Color.parseColor("#AEB6C2")
        ),
        ThemePalette(
            name = "Y1 Mono Grey",
            bg = Color.parseColor("#C7CDBC"),
            paneRightBg = Color.parseColor("#BCC3B0"),
            statusBarTop = Color.parseColor("#C7CDBC"),
            statusBarBottom = Color.parseColor("#B1B9A5"),
            textPrimary = Color.parseColor("#1B2118"),
            textSecondary = Color.parseColor("#495343"),
            highlightTop = Color.parseColor("#1B2118"),
            highlightBottom = Color.parseColor("#1B2118"),
            highlightText = Color.parseColor("#C7CDBC"),
            divider = Color.parseColor("#6E7866")
        ),
        ThemePalette(
            name = "Backlit Blue",
            bg = Color.parseColor("#D4ECFF"),
            paneRightBg = Color.parseColor("#C2E3FF"),
            statusBarTop = Color.parseColor("#D4ECFF"),
            statusBarBottom = Color.parseColor("#A8D6FF"),
            textPrimary = Color.parseColor("#0A2239"),
            textSecondary = Color.parseColor("#2E567C"),
            highlightTop = Color.parseColor("#0A2239"),
            highlightBottom = Color.parseColor("#12395E"),
            highlightText = Color.parseColor("#D4ECFF"),
            divider = Color.parseColor("#689FD4")
        ),
        ThemePalette(
            name = "OLED Dark",
            bg = Color.parseColor("#0E1014"),
            paneRightBg = Color.parseColor("#151921"),
            statusBarTop = Color.parseColor("#232834"),
            statusBarBottom = Color.parseColor("#14171F"),
            textPrimary = Color.parseColor("#F3F5F8"),
            textSecondary = Color.parseColor("#8A93A6"),
            highlightTop = Color.parseColor("#3B8BF7"),
            highlightBottom = Color.parseColor("#185EC7"),
            highlightText = Color.WHITE,
            divider = Color.parseColor("#2B3140")
        )
    )

    data class FontScalePreset(
        val name: String,
        val visibleRows: Int,
        val rowHeight: Float,
        val titleSize: Float,
        val sublabelSize: Float
    )

    private val fontScalePresets = listOf(
        FontScalePreset("Compact", visibleRows = 8, rowHeight = 41.5f, titleSize = 13.5f, sublabelSize = 10.5f),
        FontScalePreset("Normal", visibleRows = 7, rowHeight = 47.4f, titleSize = 15.0f, sublabelSize = 11.5f),
        FontScalePreset("Large (Default)", visibleRows = 6, rowHeight = 55.3f, titleSize = 16.5f, sublabelSize = 12.5f),
        FontScalePreset("Extra Large", visibleRows = 5, rowHeight = 66.4f, titleSize = 18.5f, sublabelSize = 13.5f)
    )
    private var fontScaleIndex = 2
    private val fontScale: FontScalePreset get() = fontScalePresets[fontScaleIndex]

    private var themeIndex = 0
    private val theme: ThemePalette get() = themes[themeIndex]

    private val stack = ArrayList<MenuPage>()
    @Volatile private var localTracks: List<TrackItem> = emptyList()
    @Volatile private var localAlbums: List<AlbumGroup> = emptyList()
    @Volatile private var localArtists: List<ArtistGroup> = emptyList()
    @Volatile private var localPlaylists: List<PlaylistGroup> = emptyList()

    private val spotifyTracks = ArrayList<TrackItem>()
    private val appleTracks = ArrayList<TrackItem>()

    private var spotifyAuthed = false
    private var appleAuthed = false
    private var activeQrProvider = "spotify"

    private var currentTrack: TrackItem? = null
    private var currentQueue: List<TrackItem> = emptyList()
    private var currentQueueIndex = 0
    private var isPlaying = false
    private var positionMs = 0L
    private var durationMs = 240000L
    private var volumePercent = 76
    private var nowPlayingMode = "volume" // "volume" | "scrub"
    private var volumeOverlayUntilMs = 0L

    // Real Connectivity & Hardware Settings State (MT6572 Android 4.2.2)
    private var wifiEnabled = false
    private var btEnabled = false
    private var lastConnectivityCheckMs = 0L
    private var brightnessPercent: Int = 80
    private var wheelVibrationMode: String = "Soft (Default)"
    private var wheelClickSound: Boolean = false
    private var isKeypadLocked: Boolean = false
    private var autoLock1MinEnabled: Boolean = true
    private var lastInteractionTimeMs: Long = System.currentTimeMillis()
    private var unlockHoldStartMs: Long = 0L
    private var autoLockTimeoutSec: Int = 60
    private var lastLockedPlayPauseMs: Long = 0L
    private var lastDisplayWakeTimeMs: Long = 0L

    // 60 FPS Smooth Interpolation (Lerp) States
    private var animProgressRatio: Float = 0f
    private var animVolumeRatio: Float = 0.76f
    private var animScrubKnobScale: Float = 0f
    private var animVolumeOverlayMix: Float = 0f
    private var animCoverFlowFocus: Float = 0f

    // In-App Wi-Fi Password & Connection State (API 17 Direct WifiConfiguration)
    private val wifiPasswordTokens = listOf(
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
        "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "!", "@", "#", "$", "%", "&", "*", "-", "_", "+", "=", ".", "?",
        "DEL", "SPC", "CONNECT"
    )
    private var targetWifiSsid: String = ""
    private var targetWifiCaps: String = ""
    private var wifiPasswordInput: String = ""
    private var wifiPasswordKeyIndex: Int = 0
    @Volatile private var wifiStatusMessage: String = "Select a network to connect in-app"

    @Volatile private var isIndexing = false
    @Volatile private var lastScanSummary = "Scanning /storage/sdcard0/Music..."
    private var syncAngleDeg = 0f

    // Caché en memoria de carátulas reales (RGB_565 160x160)
    private val artworkCache = object : LruCache<String, Bitmap>(60) {}
    private val failedArtworkPaths = HashSet<String>()
    private val pendingArtworkPaths = HashSet<String>()
    private val artworkExecutor = Executors.newFixedThreadPool(2)
    private val scannerExecutor = Executors.newSingleThreadExecutor()

    // Wheel Search State
    private val wheelTokens = listOf(
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "SPACE", "DEL", "RESULTS"
    )
    private var searchQuery = "A"
    private var searchMode = "keyboard" // "keyboard" | "results"
    private var searchKeyIndex = 0
    private var searchResultIndex = 0
    private var searchResults: List<TrackItem> = emptyList()

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val srcRect = Rect()
    private val scrubDiamondPath = android.graphics.Path()

    private val clockFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

    private val autoLockWatchdog = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()
            if (autoLockTimeoutSec > 0 && (now - lastInteractionTimeMs >= autoLockTimeoutSec * 1000L)) {
                isKeypadLocked = true
                unlockHoldStartMs = 0L
                Y1SleepPowerController.enterDisplaySleep(context as? Activity)
            } else if (autoLock1MinEnabled && !isKeypadLocked && (now - lastInteractionTimeMs >= 60_000L)) {
                isKeypadLocked = true
                unlockHoldStartMs = 0L
            }
            invalidate()
            postDelayed(this, 1000L)
        }
    }

    init {
        isFocusable = true
        isFocusableInTouchMode = true
        requestFocus()
        isSoundEffectsEnabled = false
        refreshConnectivityState(force = true)
        seedStreamingCatalogs()
        pushRootMenu()
        triggerFullLibraryScan()
        applyHardwareAutoLock()
        applyHardwareBrightness()
        postDelayed(autoLockWatchdog, 1000L)
        Y1TimeController.syncTimeOverWifi { _, _ ->
            post { invalidate() }
        }

        HeadsetButtonController.setListener(object : HeadsetButtonController.Listener {
            override fun onTogglePlayPause() {
                handleHardwareButton("PLAY_PAUSE")
            }

            override fun onNextTrack() {
                handleHardwareButton("NEXT")
            }

            override fun onPreviousTrack() {
                handleHardwareButton("PREVIOUS")
            }

            override fun onVolumeAdjusted(direction: Int, newSystemVolumePercent: Int) {
                volumePercent = newSystemVolumePercent
                audioModule.setVolume(volumePercent, NoOpPromise())
                volumeOverlayUntilMs = System.currentTimeMillis() + 2200L
                invalidate()
            }
        })
    }

    private fun getWifiManager(): WifiManager? {
        return try {
            context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        } catch (_: Throwable) {
            null
        }
    }

    private fun refreshConnectivityState(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastConnectivityCheckMs < 2500L) return
        lastConnectivityCheckMs = now
        try {
            wifiEnabled = getWifiManager()?.isWifiEnabled == true
        } catch (_: Throwable) {
        }
        try {
            btEnabled = BluetoothAdapter.getDefaultAdapter()?.isEnabled == true
        } catch (_: Throwable) {
        }
    }

    private fun applyHardwareBrightness() {
        try {
            (context as? Activity)?.window?.let { win ->
                val lp = win.attributes
                lp.screenBrightness = (brightnessPercent / 100f).coerceIn(0.05f, 1.0f)
                win.attributes = lp
            }
        } catch (_: Throwable) {
        }
        try {
            Settings.System.putInt(
                context.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS,
                ((brightnessPercent * 255) / 100).coerceIn(10, 255)
            )
        } catch (_: Throwable) {
        }
        Y1SleepPowerController.setHardwareBacklight(brightnessPercent)
    }

    private fun applyHardwareAutoLock() {
        Y1SleepPowerController.applyTimeoutPolicy(context as? Activity, autoLockTimeoutSec)
    }

    private fun formatAutoLockLabel(): String {
        return when (autoLockTimeoutSec) {
            15 -> "15 Seconds"
            30 -> "30 Seconds"
            60 -> "1 Minute"
            120 -> "2 Minutes"
            300 -> "5 Minutes"
            else -> "Always On"
        }
    }

    private fun triggerWheelFeedback() {
        val vibMs = when (wheelVibrationMode) {
            "Soft (Default)" -> 8L
            "Medium" -> 16L
            "Strong" -> 28L
            else -> 0L
        }
        if (vibMs > 0L) {
            try {
                @Suppress("DEPRECATION")
                (context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.vibrate(vibMs)
            } catch (_: Throwable) {
            }
        }
        if (wheelClickSound) {
            try {
                isSoundEffectsEnabled = true
                playSoundEffect(SoundEffectConstants.CLICK)
                (context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)
                    ?.playSoundEffect(AudioManager.FX_KEY_CLICK)
            } catch (_: Throwable) {
            }
        } else {
            isSoundEffectsEnabled = false
        }
    }

    private fun seedStreamingCatalogs() {
        spotifyTracks.clear()
        spotifyTracks.addAll(
            listOf(
                TrackItem(
                    id = "sp_1",
                    title = "Veridis Quo",
                    artist = "Daft Punk",
                    album = "Discovery",
                    durationMs = 345000L,
                    source = "spotify",
                    uri = "spotify:track:2LD2gT7gwAurzdQDQtILds",
                    codecLabel = "Spotify Ogg 320kbps",
                    coverColor = Color.parseColor("#1DB954")
                ),
                TrackItem(
                    id = "sp_2",
                    title = "Starboy",
                    artist = "The Weeknd, Daft Punk",
                    album = "Starboy",
                    durationMs = 230000L,
                    source = "spotify",
                    uri = "spotify:track:7MXVkk9YMctZqd1Srtv4MB",
                    codecLabel = "Spotify Ogg 320kbps",
                    coverColor = Color.parseColor("#14833B")
                ),
                TrackItem(
                    id = "sp_3",
                    title = "Nightcall",
                    artist = "Kavinsky",
                    album = "OutRun",
                    durationMs = 258000L,
                    source = "spotify",
                    uri = "spotify:track:0U0ldCRmgCqhVvD6ksG63j",
                    codecLabel = "Spotify Ogg 320kbps",
                    coverColor = Color.parseColor("#0F5C29")
                )
            )
        )

        appleTracks.clear()
        appleTracks.addAll(
            listOf(
                TrackItem(
                    id = "am_1",
                    title = "Get Lucky (Hi-Res Lossless)",
                    artist = "Daft Punk",
                    album = "Random Access Memories",
                    durationMs = 369000L,
                    source = "apple_music",
                    uri = "",
                    codecLabel = "Apple ALAC 24-bit/96kHz",
                    coverColor = Color.parseColor("#FA243C")
                ),
                TrackItem(
                    id = "am_2",
                    title = "Let It Happen",
                    artist = "Tame Impala",
                    album = "Currents",
                    durationMs = 467000L,
                    source = "apple_music",
                    uri = "",
                    codecLabel = "Apple ALAC 24-bit/48kHz",
                    coverColor = Color.parseColor("#B5179E")
                ),
                TrackItem(
                    id = "am_3",
                    title = "Weird Fishes / Arpeggi",
                    artist = "Radiohead",
                    album = "In Rainbows",
                    durationMs = 318000L,
                    source = "apple_music",
                    uri = "",
                    codecLabel = "Apple ALAC 16-bit/44.1kHz",
                    coverColor = Color.parseColor("#F77F00")
                )
            )
        )
    }

    private fun triggerFullLibraryScan() {
        if (isIndexing) return
        isIndexing = true
        lastScanSummary = "Scanning /storage/sdcard0/Music..."
        postInvalidate()

        scannerExecutor.execute {
            val scannedTracks = scanAllDeviceAudioFiles()
            val albums = buildAlbumGroups(scannedTracks)
            val artists = buildArtistGroups(scannedTracks, albums)
            val playlists = scanDeviceM3uPlaylists(scannedTracks)

            localTracks = scannedTracks
            localAlbums = albums
            localArtists = artists
            localPlaylists = playlists
            if (currentTrack == null && scannedTracks.isNotEmpty()) {
                currentTrack = scannedTracks.first()
                currentQueue = scannedTracks
            }
            isIndexing = false
            lastScanSummary = "${scannedTracks.size} Tracks • ${albums.size} Albums • ${playlists.size} Playlists"
            runFederatedSearch()

            post {
                refreshRootMenuLabels()
                invalidate()
            }
        }
    }

    private fun scanAllDeviceAudioFiles(): List<TrackItem> {
        val found = ArrayList<TrackItem>(2000)
        val seenPaths = HashSet<String>(2000)
        val roots = listOf(
            File("/storage/sdcard0/Music"),
            File("/storage/sdcard0/Podcasts"),
            File("/storage/sdcard0/Audiobooks"),
            File("/storage/sdcard1"),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
        )
        val validExts = setOf("mp3", "flac", "m4a", "wav", "ogg", "aac", "opus")
        val palette = intArrayOf(
            Color.parseColor("#1D3557"),
            Color.parseColor("#2A9D8F"),
            Color.parseColor("#E63946"),
            Color.parseColor("#6D597A"),
            Color.parseColor("#457B9D"),
            Color.parseColor("#D62828"),
            Color.parseColor("#023E8A")
        )

        fun walk(dir: File?, depth: Int) {
            if (dir == null || depth > 6 || !dir.exists() || !dir.canRead()) return
            val children = dir.listFiles() ?: return
            for (f in children) {
                if (f.name.startsWith(".")) continue
                if (f.isDirectory) {
                    walk(f, depth + 1)
                } else if (f.isFile) {
                    val absPath = f.absolutePath
                    if (!seenPaths.add(absPath)) continue
                    val ext = f.extension.lowercase(Locale.ROOT)
                    if (validExts.contains(ext)) {
                        val parentAlbum = f.parentFile?.name ?: "Unknown Album"
                        val parentArtist = f.parentFile?.parentFile?.name ?: "Unknown Artist"
                        var cleanTitle = f.nameWithoutExtension.replace(Regex("^\\d{1,3}[\\s._-]+"), "")
                        val suffix = " - $parentArtist"
                        if (cleanTitle.endsWith(suffix, ignoreCase = true) && cleanTitle.length > suffix.length) {
                            cleanTitle = cleanTitle.substring(0, cleanTitle.length - suffix.length).trim()
                        }
                        found.add(
                            TrackItem(
                                id = "sd_${found.size}",
                                title = cleanTitle,
                                artist = parentArtist,
                                album = parentAlbum,
                                durationMs = 225000L,
                                source = "local",
                                uri = absPath,
                                codecLabel = if (ext == "flac") "FLAC Lossless" else "${ext.uppercase(Locale.ROOT)} 320kbps",
                                coverColor = palette[found.size % palette.size]
                            )
                        )
                        if (found.size % 250 == 0) {
                            lastScanSummary = "Indexing SD... (${found.size} tracks)"
                            postInvalidate()
                        }
                    }
                }
            }
        }

        for (root in roots) {
            try {
                walk(root, 0)
            } catch (_: Exception) {
            }
        }

        found.sortBy { it.title.lowercase(Locale.ROOT) }
        return found
    }

    private fun buildAlbumGroups(tracks: List<TrackItem>): List<AlbumGroup> {
        val byAlbum = LinkedHashMap<String, MutableList<TrackItem>>()
        for (t in tracks) {
            val key = "${t.artist.lowercase(Locale.ROOT)}::${t.album.lowercase(Locale.ROOT)}"
            byAlbum.getOrPut(key) { ArrayList() }.add(t)
        }
        return byAlbum.entries.map { (key, list) ->
            val first = list.first()
            AlbumGroup(
                id = "alb:$key",
                title = first.album,
                artist = first.artist,
                tracks = list,
                representativeTrack = first
            )
        }.sortedBy { it.title.lowercase(Locale.ROOT) }
    }

    private fun buildArtistGroups(tracks: List<TrackItem>, albums: List<AlbumGroup>): List<ArtistGroup> {
        val tracksByArtist = LinkedHashMap<String, MutableList<TrackItem>>()
        for (t in tracks) {
            tracksByArtist.getOrPut(t.artist) { ArrayList() }.add(t)
        }
        val albumsByArtist = albums.groupBy { it.artist }
        return tracksByArtist.entries.map { (artistName, list) ->
            ArtistGroup(
                id = "art:$artistName",
                name = artistName,
                albums = albumsByArtist[artistName] ?: emptyList(),
                tracks = list
            )
        }.sortedBy { it.name.lowercase(Locale.ROOT) }
    }

    private fun scanDeviceM3uPlaylists(allTracks: List<TrackItem>): List<PlaylistGroup> {
        val trackByPath = HashMap<String, TrackItem>(allTracks.size * 2)
        val trackByFileName = HashMap<String, TrackItem>(allTracks.size * 2)
        for (t in allTracks) {
            trackByPath[t.uri] = t
            trackByFileName[File(t.uri).name.lowercase(Locale.ROOT)] = t
        }

        val dirs = listOf(
            File("/storage/sdcard0/Playlists"),
            File("/storage/sdcard0/Y1_Playlists")
        )
        val groups = ArrayList<PlaylistGroup>()
        val seenNames = HashSet<String>()

        for (dir in dirs) {
            if (!dir.exists() || !dir.isDirectory) continue
            val files = dir.listFiles() ?: continue
            for (f in files) {
                val ext = f.extension.lowercase(Locale.ROOT)
                if (ext != "m3u" && ext != "m3u8") continue
                val name = f.nameWithoutExtension
                if (!seenNames.add(name.lowercase(Locale.ROOT))) continue

                val resolvedTracks = ArrayList<TrackItem>()
                try {
                    f.forEachLine { rawLine ->
                        val line = rawLine.trim()
                        if (line.isNotEmpty() && !line.startsWith("#")) {
                            val normalizedRel = line.replace("\\", "/").removePrefix("../")
                            val candidateAbs = "/storage/sdcard0/Music/$normalizedRel"
                            val matched = trackByPath[candidateAbs]
                                ?: trackByPath[line]
                                ?: trackByFileName[File(normalizedRel).name.lowercase(Locale.ROOT)]
                            if (matched != null) {
                                resolvedTracks.add(matched)
                            }
                        }
                    }
                } catch (_: Exception) {
                }

                if (resolvedTracks.isNotEmpty()) {
                    groups.add(
                        PlaylistGroup(
                            id = "pl:${f.name}",
                            name = name,
                            tracks = resolvedTracks
                        )
                    )
                }
            }
        }

        groups.sortBy { it.name.lowercase(Locale.ROOT) }
        return groups
    }

    private fun getOrLoadArtwork(track: TrackItem?): Bitmap? {
        if (track == null || track.uri.isEmpty() || track.uri.startsWith("spotify:")) return null
        val path = track.uri
        val cached = artworkCache.get(path)
        if (cached != null) return cached
        if (failedArtworkPaths.contains(path) || pendingArtworkPaths.contains(path)) return null

        pendingArtworkPaths.add(path)
        artworkExecutor.execute {
            var bmp: Bitmap? = null
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(path)
                val bytes = retriever.embeddedPicture
                if (bytes != null && bytes.isNotEmpty()) {
                    val boundsOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, boundsOpts)
                    var sampleSize = 1
                    while (boundsOpts.outWidth / sampleSize > 200 || boundsOpts.outHeight / sampleSize > 200) {
                        sampleSize *= 2
                    }
                    val decodeOpts = BitmapFactory.Options().apply {
                        inSampleSize = sampleSize
                        inPreferredConfig = Bitmap.Config.RGB_565
                    }
                    bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOpts)
                }
            } catch (_: Exception) {
            } finally {
                try {
                    retriever.release()
                } catch (_: Exception) {
                }
            }

            if (bmp == null) {
                // Buscar cover.jpg / folder.jpg en la carpeta del álbum
                val parent = File(path).parentFile
                if (parent != null && parent.exists()) {
                    for (coverName in listOf("cover.jpg", "folder.jpg", "cover.png", "album.jpg")) {
                        val cf = File(parent, coverName)
                        if (cf.exists()) {
                            try {
                                val decodeOpts = BitmapFactory.Options().apply {
                                    inSampleSize = 2
                                    inPreferredConfig = Bitmap.Config.RGB_565
                                }
                                bmp = BitmapFactory.decodeFile(cf.absolutePath, decodeOpts)
                                if (bmp != null) break
                            } catch (_: Exception) {
                            }
                        }
                    }
                }
            }

            post {
                pendingArtworkPaths.remove(path)
                if (bmp != null) {
                    artworkCache.put(path, bmp)
                    invalidate()
                } else {
                    failedArtworkPaths.add(path)
                }
            }
        }
        return null
    }

    private fun buildRootItems(): List<MenuItem> = buildRootMenuItems()

    private fun buildRootMenuItems(): List<MenuItem> {
        return listOf(
            MenuItem(
                id = "root:local",
                label = "Music",
                sublabel = if (isIndexing) lastScanSummary else "${localTracks.size} Songs • ${localAlbums.size} Albums",
                previewKind = "album_collage",
                onSelect = { openProviderHub("local") }
            ),
            MenuItem(
                id = "root:playlists",
                label = "Playlists (.m3u)",
                sublabel = "${localPlaylists.size} Saved Mixes (Apple/Spotify/SD)",
                previewKind = "album_collage",
                onSelect = { openLocalPlaylistsMenu() }
            ),
            MenuItem(
                id = "root:spotify",
                label = "Spotify",
                sublabel = "Direct Stream & Connect",
                previewKind = "spotify_hub",
                accentColor = Color.parseColor("#1DB954"),
                onSelect = { openProviderHub("spotify") }
            ),
            MenuItem(
                id = "root:apple",
                label = "Apple Music",
                sublabel = "Lossless & Cloud Library",
                previewKind = "apple_music_hub",
                accentColor = Color.parseColor("#FA243C"),
                onSelect = { openProviderHub("apple_music") }
            ),
            MenuItem(
                id = "root:cover_flow",
                label = "Cover Flow",
                sublabel = "${localAlbums.size} Albums in 3D",
                previewKind = "cover_flow_teaser",
                onSelect = {
                    stack.add(
                        MenuPage(
                            id = "cover_flow",
                            title = "Cover Flow (${localAlbums.size})",
                            screenType = "cover_flow",
                            providerBadge = "local",
                            items = localAlbums.map { alb ->
                                MenuItem(
                                    id = alb.id,
                                    label = alb.title,
                                    sublabel = alb.artist,
                                    accentColor = alb.representativeTrack.coverColor,
                                    previewTrack = alb.representativeTrack,
                                    onSelect = { openTrackList(alb.title, "local", alb.tracks) }
                                )
                            }
                        )
                    )
                    invalidate()
                }
            ),
            MenuItem(
                id = "root:search",
                label = "Search",
                sublabel = "Search across ${localTracks.size} tracks",
                previewKind = "album_collage",
                onSelect = {
                    searchMode = "keyboard"
                    runFederatedSearch()
                    stack.add(
                        MenuPage(
                            id = "wheel_search",
                            title = "Search",
                            screenType = "wheel_search",
                            providerBadge = "local"
                        )
                    )
                    invalidate()
                }
            ),
            MenuItem(
                id = "root:now_playing",
                label = "Now Playing",
                sublabel = currentTrack?.let { "${it.title} — ${it.artist}" } ?: "Not Playing",
                previewKind = "now_playing_artwork",
                previewTrack = currentTrack,
                onSelect = { openNowPlayingScreen() }
            ),
            MenuItem(
                id = "root:settings",
                label = "Settings",
                sublabel = "${theme.name} • Wi-Fi / BT / Display",
                previewKind = "device_status",
                onSelect = { openSettingsMenu() }
            )
        )
    }

    private fun pushRootMenu() {
        stack.clear()
        stack.add(
            MenuPage(
                id = "root",
                title = "Innioasis Y1",
                screenType = "split_menu",
                providerBadge = currentTrack?.source ?: "local",
                items = buildRootMenuItems()
            )
        )
        invalidate()
    }

    private fun refreshRootMenuLabels() {
        if (stack.isNotEmpty() && stack[0].id == "root") {
            val prevFocus = stack[0].focusedIndex
            val items = buildRootMenuItems()
            stack[0] = stack[0].copy(
                items = items,
                focusedIndex = prevFocus.coerceIn(0, max(0, items.size - 1))
            )
        }
    }

    private fun openLocalPlaylistsMenu() {
        stack.add(
            MenuPage(
                id = "local:playlists",
                title = "Playlists (${localPlaylists.size})",
                screenType = "split_menu",
                providerBadge = "local",
                items = localPlaylists.map { pl ->
                    MenuItem(
                        id = pl.id,
                        label = pl.name,
                        sublabel = "${pl.tracks.size} songs",
                        previewKind = "now_playing_artwork",
                        previewTrack = pl.tracks.firstOrNull(),
                        onSelect = { openTrackList(pl.name, "local", pl.tracks) }
                    )
                }
            )
        )
        invalidate()
    }

    private fun openLocalAlbumsMenu() {
        stack.add(
            MenuPage(
                id = "local:albums",
                title = "Albums (${localAlbums.size})",
                screenType = "split_menu",
                providerBadge = "local",
                items = localAlbums.map { alb ->
                    MenuItem(
                        id = alb.id,
                        label = alb.title,
                        sublabel = "${alb.artist} • ${alb.tracks.size} songs",
                        previewKind = "now_playing_artwork",
                        accentColor = alb.representativeTrack.coverColor,
                        previewTrack = alb.representativeTrack,
                        onSelect = { openTrackList(alb.title, "local", alb.tracks) }
                    )
                }
            )
        )
        invalidate()
    }

    private fun openLocalArtistsMenu() {
        stack.add(
            MenuPage(
                id = "local:artists",
                title = "Artists (${localArtists.size})",
                screenType = "split_menu",
                providerBadge = "local",
                items = localArtists.map { art ->
                    MenuItem(
                        id = art.id,
                        label = art.name,
                        sublabel = "${art.albums.size} albums • ${art.tracks.size} songs",
                        previewKind = "now_playing_artwork",
                        previewTrack = art.tracks.firstOrNull(),
                        onSelect = { openTrackList(art.name, "local", art.tracks) }
                    )
                }
            )
        )
        invalidate()
    }

    private fun openProviderHub(source: String) {
        if (source == "spotify" && !spotifyAuthed) {
            activeQrProvider = "spotify"
            stack.add(
                MenuPage(
                    id = "qr:spotify",
                    title = "Spotify Sign In",
                    screenType = "qr_auth",
                    providerBadge = "spotify"
                )
            )
            invalidate()
            return
        }
        if (source == "apple_music" && !appleAuthed) {
            activeQrProvider = "apple_music"
            stack.add(
                MenuPage(
                    id = "qr:apple_music",
                    title = "Apple Music Sign In",
                    screenType = "qr_auth",
                    providerBadge = "apple_music"
                )
            )
            invalidate()
            return
        }

        if (source == "local") {
            stack.add(
                MenuPage(
                    id = "hub:local",
                    title = "Music",
                    screenType = "split_menu",
                    providerBadge = "local",
                    items = listOf(
                        MenuItem(
                            id = "local:all_songs",
                            label = "All Songs",
                            sublabel = "${localTracks.size} tracks",
                            previewKind = "now_playing_artwork",
                            previewTrack = localTracks.firstOrNull(),
                            onSelect = { openTrackList("All Songs (${localTracks.size})", "local", localTracks) }
                        ),
                        MenuItem(
                            id = "local:albums",
                            label = "Albums",
                            sublabel = "${localAlbums.size} albums",
                            previewKind = "album_collage",
                            onSelect = { openLocalAlbumsMenu() }
                        ),
                        MenuItem(
                            id = "local:artists",
                            label = "Artists",
                            sublabel = "${localArtists.size} artists",
                            previewKind = "album_collage",
                            onSelect = { openLocalArtistsMenu() }
                        ),
                        MenuItem(
                            id = "local:playlists",
                            label = "Playlists (.m3u)",
                            sublabel = "${localPlaylists.size} playlists",
                            previewKind = "album_collage",
                            onSelect = { openLocalPlaylistsMenu() }
                        ),
                        MenuItem(
                            id = "local:cover_flow",
                            label = "Cover Flow",
                            sublabel = "3D Album Browser",
                            previewKind = "cover_flow_teaser",
                            onSelect = {
                                stack.add(
                                    MenuPage(
                                        id = "cover_flow",
                                        title = "Cover Flow (${localAlbums.size})",
                                        screenType = "cover_flow",
                                        providerBadge = "local",
                                        items = localAlbums.map { alb ->
                                            MenuItem(
                                                id = alb.id,
                                                label = alb.title,
                                                sublabel = alb.artist,
                                                accentColor = alb.representativeTrack.coverColor,
                                                previewTrack = alb.representativeTrack,
                                                onSelect = { openTrackList(alb.title, "local", alb.tracks) }
                                            )
                                        }
                                    )
                                )
                                invalidate()
                            }
                        )
                    )
                )
            )
            invalidate()
            return
        }

        val tracks = if (source == "spotify") spotifyTracks else appleTracks
        val title = if (source == "spotify") "Spotify" else "Apple Music"
        val preview = if (source == "spotify") "spotify_hub" else "apple_music_hub"

        stack.add(
            MenuPage(
                id = "hub:$source",
                title = title,
                screenType = "split_menu",
                providerBadge = source,
                items = listOf(
                    MenuItem(
                        id = "$source:playlists",
                        label = "Playlists",
                        sublabel = "Curated & Saved Mixes",
                        previewKind = preview,
                        onSelect = { openTrackList("$title Playlists", source, tracks) }
                    ),
                    MenuItem(
                        id = "$source:albums",
                        label = "Albums",
                        sublabel = "${tracks.size} Albums",
                        previewKind = "album_collage",
                        onSelect = { openTrackList("$title Albums", source, tracks) }
                    ),
                    MenuItem(
                        id = "$source:artists",
                        label = "Artists",
                        sublabel = "All Artists",
                        previewKind = preview,
                        onSelect = { openTrackList("$title Artists", source, tracks) }
                    ),
                    MenuItem(
                        id = "$source:liked",
                        label = if (source == "spotify") "Liked Songs" else "Favorite Songs",
                        sublabel = "${tracks.size} Tracks",
                        previewKind = "now_playing_artwork",
                        onSelect = { openTrackList("Liked Songs", source, tracks) }
                    )
                )
            )
        )
        invalidate()
    }

    private fun openTrackList(title: String, source: String, tracks: List<TrackItem>) {
        stack.add(
            MenuPage(
                id = "tracks:$source:$title",
                title = title,
                screenType = "split_menu",
                providerBadge = source,
                items = tracks.mapIndexed { idx, t ->
                    MenuItem(
                        id = "${t.id}_$idx",
                        label = t.title,
                        sublabel = "${t.artist} — ${t.album}",
                        badge = "",
                        hasChevron = true,
                        previewKind = "now_playing_artwork",
                        accentColor = t.coverColor,
                        previewTrack = t,
                        onSelect = { startPlayback(t, tracks) }
                    )
                }
            )
        )
        invalidate()
    }

    private fun launchSystemSettingsIntent(action: String) {
        try {
            val intent = Intent(action).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (_: Throwable) {
            try {
                val fallback = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
            } catch (_: Throwable) {
            }
        }
    }

    private fun exitToStockY1Os() {
        try {
            val pm = context.packageManager
            val stockIntent = pm.getLaunchIntentForPackage("com.themoon.y1")
                ?: pm.getLaunchIntentForPackage("com.android.launcher")
                ?: pm.getLaunchIntentForPackage("com.android.launcher3")
            if (stockIntent != null) {
                stockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(stockIntent)
                return
            }
        } catch (_: Throwable) {
        }
        (context as? Activity)?.finish()
    }

    private fun performHardwareShutdown() {
        Thread {
            try {
                Runtime.getRuntime().exec(arrayOf("/system/xbin/su", "-c", "reboot -p")).waitFor()
            } catch (_: Throwable) {
            }
            try {
                Runtime.getRuntime().exec(arrayOf("/system/xbin/su", "-c", "svc power shutdown")).waitFor()
            } catch (_: Throwable) {
            }
            try {
                val intent = Intent("android.intent.action.ACTION_REQUEST_SHUTDOWN")
                intent.putExtra("android.intent.extra.KEY_CONFIRM", false)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(intent)
            } catch (_: Throwable) {
            }
        }.start()
    }

    private fun openPowerOffConfirmMenu() {
        stack.add(
            MenuPage(
                id = "settings:power_off_confirm",
                title = "Power Off Innioasis Y1?",
                screenType = "split_menu",
                providerBadge = "local",
                items = listOf(
                    MenuItem(
                        id = "power_off:cancel",
                        label = "Cancel (Keep On)",
                        sublabel = "Return to Settings",
                        hasChevron = false,
                        previewKind = "device_status",
                        onSelect = {
                            if (stack.size > 1) {
                                stack.removeAt(stack.size - 1)
                                invalidate()
                            }
                        }
                    ),
                    MenuItem(
                        id = "power_off:confirm",
                        label = "Confirm Power Off Now",
                        sublabel = "Shutdown Innioasis Y1 hardware completely",
                        badge = "OFF",
                        hasChevron = false,
                        previewKind = "device_status",
                        onSelect = { performHardwareShutdown() }
                    )
                ),
                focusedIndex = 0
            )
        )
        invalidate()
    }

    private fun openWifiPasswordScreen(ssid: String, caps: String) {
        targetWifiSsid = ssid
        targetWifiCaps = caps
        wifiPasswordInput = ""
        wifiPasswordKeyIndex = 0
        stack.add(
            MenuPage(
                id = "wifi_password:$ssid",
                title = "Wi-Fi: $ssid",
                screenType = "wifi_password",
                providerBadge = "local"
            )
        )
        invalidate()
    }

    @Suppress("DEPRECATION")
    private fun connectToWifiNetwork(ssid: String, password: String, caps: String) {
        wifiStatusMessage = "Connecting to $ssid..."
        if (stack.lastOrNull()?.screenType == "wifi_password") {
            stack.removeAt(stack.size - 1)
        }
        refreshWifiMenuLabels()
        invalidate()

        Thread {
            try {
                val wm = getWifiManager()
                if (wm != null) {
                    if (!wm.isWifiEnabled) {
                        wm.isWifiEnabled = true
                        wifiEnabled = true
                    }
                    var netId = -1
                    val existingList = try {
                        wm.configuredNetworks ?: emptyList()
                    } catch (_: Throwable) {
                        emptyList()
                    }
                    val existingNet = existingList.firstOrNull {
                        it.SSID == "\"$ssid\"" || it.SSID == ssid
                    }

                    if (password.isEmpty() && existingNet != null && (caps.contains("WPA") || caps.contains("WEP"))) {
                        netId = existingNet.networkId
                    } else {
                        if (existingNet != null) {
                            try {
                                wm.removeNetwork(existingNet.networkId)
                            } catch (_: Throwable) {
                            }
                        }
                        val conf = android.net.wifi.WifiConfiguration()
                        conf.SSID = "\"$ssid\""
                        when {
                            password.isEmpty() || (!caps.contains("WPA") && !caps.contains("WEP")) -> {
                                conf.allowedKeyManagement.set(android.net.wifi.WifiConfiguration.KeyMgmt.NONE)
                            }
                            caps.contains("WEP") -> {
                                conf.wepKeys[0] = "\"$password\""
                                conf.wepTxKeyIndex = 0
                                conf.allowedKeyManagement.set(android.net.wifi.WifiConfiguration.KeyMgmt.NONE)
                                conf.allowedGroupCiphers.set(android.net.wifi.WifiConfiguration.GroupCipher.WEP40)
                            }
                            else -> {
                                conf.preSharedKey = "\"$password\""
                            }
                        }
                        netId = wm.addNetwork(conf)
                    }

                    if (netId != -1) {
                        wm.disconnect()
                        wm.enableNetwork(netId, true)
                        wm.saveConfiguration()
                        wm.reconnect()
                    } else {
                        // Root fallback via wpa_cli on Y1 if addNetwork returns -1
                        try {
                            val pskCmd = if (password.isEmpty()) {
                                "wpa_cli -i wlan0 add_network && wpa_cli -i wlan0 save_config"
                            } else {
                                "wpa_cli -i wlan0 reconfigure"
                            }
                            Runtime.getRuntime().exec(arrayOf("/system/xbin/su", "-c", pskCmd)).waitFor()
                        } catch (_: Throwable) {
                        }
                    }

                    var connectedIp = ""
                    for (attempt in 0 until 8) {
                        Thread.sleep(1000L)
                        val info = wm.connectionInfo
                        val ip = info?.ipAddress ?: 0
                        val currentSsid = (info?.ssid ?: "").replace("\"", "").trim()
                        if (ip != 0 && (currentSsid.equals(ssid, ignoreCase = true) || currentSsid.isNotEmpty())) {
                            connectedIp = String.format(
                                Locale.US,
                                "%d.%d.%d.%d",
                                ip and 0xff,
                                ip shr 8 and 0xff,
                                ip shr 16 and 0xff,
                                ip shr 24 and 0xff
                            )
                            break
                        }
                    }

                    wifiStatusMessage = if (connectedIp.isNotEmpty()) {
                        Y1TimeController.syncTimeOverWifi { _, _ ->
                            post { invalidate() }
                        }
                        "Connected to $ssid ($connectedIp)"
                    } else {
                        "Saved & associating with $ssid..."
                    }
                }
            } catch (e: Throwable) {
                wifiStatusMessage = "Wi-Fi Error: ${e.message ?: "Failed"}"
            }
            post {
                refreshConnectivityState(force = true)
                refreshWifiMenuLabels()
                refreshSettingsMenuLabels()
                invalidate()
            }
        }.start()
    }

    private fun buildWifiMenuItems(): List<MenuItem> {
        val wm = getWifiManager()
        val items = ArrayList<MenuItem>()
        @Suppress("DEPRECATION")
        val currentConnSsid = try {
            (wm?.connectionInfo?.ssid ?: "").replace("\"", "").trim()
        } catch (_: Throwable) {
            ""
        }
        items.add(
            MenuItem(
                id = "wifi:toggle",
                label = "Toggle Wi-Fi: ${if (wifiEnabled) "ON" else "OFF"}",
                sublabel = if (wifiEnabled) "Press Center to Turn OFF" else "Press Center to Turn ON",
                badge = if (wifiEnabled) "ON" else "OFF",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    val nextState = !wifiEnabled
                    try {
                        wm?.isWifiEnabled = nextState
                    } catch (_: Throwable) {
                    }
                    wifiEnabled = nextState
                    if (nextState) {
                        wifiStatusMessage = "Scanning 2.4GHz networks..."
                        try {
                            @Suppress("DEPRECATION")
                            wm?.startScan()
                        } catch (_: Throwable) {
                        }
                    } else {
                        wifiStatusMessage = "Wi-Fi turned OFF"
                    }
                    refreshWifiMenuLabels()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            )
        )
        items.add(
            MenuItem(
                id = "wifi:scan",
                label = "Scan Wi-Fi Networks",
                sublabel = wifiStatusMessage,
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    try {
                        if (!wifiEnabled) {
                            wm?.isWifiEnabled = true
                            wifiEnabled = true
                        }
                        wifiStatusMessage = "Scanning nearby access points..."
                        @Suppress("DEPRECATION")
                        wm?.startScan()
                    } catch (_: Throwable) {
                    }
                    refreshWifiMenuLabels()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            )
        )

        val scanList = try {
            wm?.scanResults ?: emptyList()
        } catch (_: Throwable) {
            emptyList()
        }
        @Suppress("DEPRECATION")
        val configuredSsids = try {
            (wm?.configuredNetworks ?: emptyList()).mapNotNull { it.SSID?.replace("\"", "")?.trim() }.toSet()
        } catch (_: Throwable) {
            emptySet()
        }
        val seenSsids = HashSet<String>()
        for (sr in scanList.sortedByDescending { it.level }) {
            @Suppress("DEPRECATION")
            val ssid = (sr.SSID ?: "").trim()
            if (ssid.isEmpty() || !seenSsids.add(ssid)) continue
            val caps = sr.capabilities ?: ""
            val isOpen = !caps.contains("WPA") && !caps.contains("WEP")
            val sec = when {
                caps.contains("WPA") -> "WPA2"
                caps.contains("WEP") -> "WEP"
                else -> "Open"
            }
            val isCurrent = currentConnSsid.isNotEmpty() && currentConnSsid.equals(ssid, ignoreCase = true)
            val isSaved = configuredSsids.contains(ssid)
            val statusTag = when {
                isCurrent -> "Connected"
                isSaved -> "Saved"
                else -> "In-App Connect"
            }
            items.add(
                MenuItem(
                    id = "wifi:net:$ssid",
                    label = ssid,
                    sublabel = "$statusTag • ${sr.level} dBm • $sec",
                    badge = if (isCurrent) "CONN" else "",
                    hasChevron = true,
                    previewKind = "device_status",
                    onSelect = {
                        if (isOpen) {
                            connectToWifiNetwork(ssid, "", caps)
                        } else {
                            openWifiPasswordScreen(ssid, caps)
                        }
                    }
                )
            )
        }
        return items
    }

    private fun refreshWifiMenuLabels() {
        for (idx in stack.indices) {
            if (stack[idx].id == "settings:wifi") {
                val prevFocus = stack[idx].focusedIndex
                val items = buildWifiMenuItems()
                stack[idx] = stack[idx].copy(
                    items = items,
                    focusedIndex = prevFocus.coerceIn(0, max(0, items.size - 1))
                )
            }
        }
    }

    private fun openWifiMenu() {
        refreshConnectivityState(force = true)
        try {
            @Suppress("DEPRECATION")
            getWifiManager()?.startScan()
        } catch (_: Throwable) {
        }
        stack.add(
            MenuPage(
                id = "settings:wifi",
                title = "Wi-Fi Networks",
                screenType = "split_menu",
                providerBadge = "local",
                items = buildWifiMenuItems()
            )
        )
        invalidate()
    }

    private fun openBluetoothMenu() {
        refreshConnectivityState(force = true)
        stack.add(
            MenuPage(
                id = "settings:bt",
                title = "Bluetooth",
                screenType = "split_menu",
                providerBadge = "local",
                items = buildBluetoothMenuItems()
            )
        )
        invalidate()
    }

    private fun buildBluetoothMenuItems(): List<MenuItem> {
        val adapter = try {
            BluetoothAdapter.getDefaultAdapter()
        } catch (_: Throwable) {
            null
        }
        val items = ArrayList<MenuItem>()
        items.add(
            MenuItem(
                id = "bt:toggle",
                label = "Toggle Bluetooth: ${if (btEnabled) "ON" else "OFF"}",
                sublabel = if (btEnabled) "Press Center to Turn OFF" else "Press Center to Turn ON",
                badge = if (btEnabled) "ON" else "OFF",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    val nextState = !btEnabled
                    try {
                        if (nextState) adapter?.enable() else adapter?.disable()
                    } catch (_: Throwable) {
                    }
                    btEnabled = nextState
                    refreshBluetoothMenuLabels()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            )
        )
        items.add(
            MenuItem(
                id = "bt:pair",
                label = "Pair Bluetooth Headphones",
                sublabel = "Open Android Bluetooth pairing screen",
                hasChevron = true,
                previewKind = "device_status",
                onSelect = {
                    launchSystemSettingsIntent(Settings.ACTION_BLUETOOTH_SETTINGS)
                }
            )
        )

        val bonded = try {
            adapter?.bondedDevices ?: emptySet()
        } catch (_: Throwable) {
            emptySet()
        }
        for (dev in bonded) {
            val devName = try {
                dev.name ?: dev.address ?: "Bluetooth Audio"
            } catch (_: Throwable) {
                "Bluetooth Audio"
            }
            val devAddr = try {
                dev.address ?: ""
            } catch (_: Throwable) {
                ""
            }
            items.add(
                MenuItem(
                    id = "bt:dev:$devAddr",
                    label = devName,
                    sublabel = "Paired ($devAddr) • Tap to Connect",
                    hasChevron = true,
                    previewKind = "device_status",
                    onSelect = {
                        launchSystemSettingsIntent(Settings.ACTION_BLUETOOTH_SETTINGS)
                    }
                )
            )
        }
        return items
    }

    private fun refreshBluetoothMenuLabels() {
        for (idx in stack.indices) {
            if (stack[idx].id == "settings:bt") {
                val prevFocus = stack[idx].focusedIndex
                val items = buildBluetoothMenuItems()
                stack[idx] = stack[idx].copy(
                    items = items,
                    focusedIndex = prevFocus.coerceIn(0, max(0, items.size - 1))
                )
            }
        }
    }

    private var timeSyncStatusMessage = "Tap to sync via Wi-Fi NTP"

    private fun buildDateTimeMenuItems(): List<MenuItem> {
        val items = ArrayList<MenuItem>()
        items.add(
            MenuItem(
                id = "dt:sync",
                label = "Sync Time via Wi-Fi / NTP",
                sublabel = timeSyncStatusMessage,
                badge = "SYNC",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    timeSyncStatusMessage = "Syncing with time servers..."
                    refreshDateTimeMenuLabels()
                    invalidate()
                    Y1TimeController.syncTimeOverWifi { _, msg ->
                        post {
                            timeSyncStatusMessage = msg
                            refreshDateTimeMenuLabels()
                            refreshSettingsMenuLabels()
                            invalidate()
                        }
                    }
                }
            )
        )
        items.add(
            MenuItem(
                id = "dt:timezone",
                label = "Timezone",
                sublabel = Y1TimeController.getCurrentTimezoneLabel(),
                badge = if (Y1TimeController.currentTimezoneIndex < Y1TimeController.timezones.size) {
                    Y1TimeController.timezones[Y1TimeController.currentTimezoneIndex].id.substringAfterLast("/")
                } else "",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    Y1TimeController.cycleTimezone {
                        post {
                            refreshDateTimeMenuLabels()
                            refreshSettingsMenuLabels()
                            invalidate()
                        }
                    }
                }
            )
        )
        items.add(
            MenuItem(
                id = "dt:hour_plus",
                label = "Adjust Hour (+1h)",
                sublabel = "Current: ${Y1TimeController.formatClock()} (Tap to add 1h)",
                badge = "+1h",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    Y1TimeController.adjustHours(1) {
                        post {
                            refreshDateTimeMenuLabels()
                            refreshSettingsMenuLabels()
                            invalidate()
                        }
                    }
                }
            )
        )
        items.add(
            MenuItem(
                id = "dt:hour_minus",
                label = "Adjust Hour (-1h)",
                sublabel = "Current: ${Y1TimeController.formatClock()} (Tap to subtract 1h)",
                badge = "-1h",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    Y1TimeController.adjustHours(-1) {
                        post {
                            refreshDateTimeMenuLabels()
                            refreshSettingsMenuLabels()
                            invalidate()
                        }
                    }
                }
            )
        )
        items.add(
            MenuItem(
                id = "dt:min_plus",
                label = "Adjust Minute (+1m)",
                sublabel = "Current: ${Y1TimeController.formatClock()} (Tap to add 1m)",
                badge = "+1m",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    Y1TimeController.adjustMinutes(1) {
                        post {
                            refreshDateTimeMenuLabels()
                            refreshSettingsMenuLabels()
                            invalidate()
                        }
                    }
                }
            )
        )
        items.add(
            MenuItem(
                id = "dt:min_minus",
                label = "Adjust Minute (-1m)",
                sublabel = "Current: ${Y1TimeController.formatClock()} (Tap to subtract 1m)",
                badge = "-1m",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    Y1TimeController.adjustMinutes(-1) {
                        post {
                            refreshDateTimeMenuLabels()
                            refreshSettingsMenuLabels()
                            invalidate()
                        }
                    }
                }
            )
        )
        items.add(
            MenuItem(
                id = "dt:format",
                label = "Time Format: ${if (Y1TimeController.is24HourFormat) "24 Hours" else "12 Hours (AM/PM)"}",
                sublabel = "Current: ${Y1TimeController.formatClock()} • Tap to Toggle",
                badge = if (Y1TimeController.is24HourFormat) "24H" else "12H",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    Y1TimeController.is24HourFormat = !Y1TimeController.is24HourFormat
                    refreshDateTimeMenuLabels()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            )
        )
        return items
    }

    private fun refreshDateTimeMenuLabels() {
        for (idx in stack.indices) {
            if (stack[idx].id == "settings:datetime") {
                val prevFocus = stack[idx].focusedIndex
                val items = buildDateTimeMenuItems()
                stack[idx] = stack[idx].copy(
                    items = items,
                    focusedIndex = prevFocus.coerceIn(0, max(0, items.size - 1))
                )
            }
        }
    }

    private fun openDateTimeMenu() {
        stack.add(
            MenuPage(
                id = "settings:datetime",
                title = "Date & Time",
                screenType = "split_menu",
                providerBadge = "local",
                items = buildDateTimeMenuItems()
            )
        )
        invalidate()
    }

    private fun buildSettingsMenuItems(): List<MenuItem> {
        refreshConnectivityState()
        return listOf(
            MenuItem(
                id = "set:datetime",
                label = "Date & Time",
                sublabel = "${Y1TimeController.formatClock()} • ${Y1TimeController.getCurrentTimezoneLabel()}",
                badge = Y1TimeController.formatClock(),
                hasChevron = true,
                previewKind = "device_status",
                onSelect = { openDateTimeMenu() }
            ),
            MenuItem(
                id = "set:wifi",
                label = "Wi-Fi",
                sublabel = if (wifiEnabled) "ON • In-App Wheel Setup" else "OFF • Tap to Enable & Scan",
                badge = if (wifiEnabled) "ON" else "OFF",
                hasChevron = true,
                previewKind = "device_status",
                onSelect = { openWifiMenu() }
            ),
            MenuItem(
                id = "set:bt",
                label = "Bluetooth",
                sublabel = if (btEnabled) "ON • Tap to Configure" else "OFF • Tap to Enable",
                badge = if (btEnabled) "ON" else "OFF",
                hasChevron = true,
                previewKind = "device_status",
                onSelect = { openBluetoothMenu() }
            ),
            MenuItem(
                id = "set:auto_keypad_lock",
                label = "Auto Keypad Lock (1 min)",
                sublabel = if (autoLock1MinEnabled) "ON (Default) • Hold Center 3s to unlock" else "OFF • Manual lock only",
                badge = if (autoLock1MinEnabled) "ON" else "OFF",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    autoLock1MinEnabled = !autoLock1MinEnabled
                    lastInteractionTimeMs = System.currentTimeMillis()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:lock_now",
                label = "Lock Keypad Now",
                sublabel = "Hold Center 3 Seconds to Unlock",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    isKeypadLocked = true
                    unlockHoldStartMs = 0L
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:power_off",
                label = "Power Off Device",
                sublabel = "Shutdown Innioasis Y1 completely",
                badge = "OFF",
                hasChevron = true,
                previewKind = "device_status",
                onSelect = { openPowerOffConfirmMenu() }
            ),
            MenuItem(
                id = "set:brightness",
                label = "Brightness",
                sublabel = "Screen Backlight ($brightnessPercent%)",
                badge = "$brightnessPercent%",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    brightnessPercent = when (brightnessPercent) {
                        20 -> 40
                        40 -> 60
                        60 -> 80
                        80 -> 100
                        else -> 20
                    }
                    applyHardwareBrightness()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:vibration",
                label = "Wheel Vibration",
                sublabel = "Haptic Feedback: $wheelVibrationMode",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    wheelVibrationMode = when (wheelVibrationMode) {
                        "Soft (Default)" -> "Medium"
                        "Medium" -> "Strong"
                        "Strong" -> "Off"
                        else -> "Soft (Default)"
                    }
                    triggerWheelFeedback()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:click_sound",
                label = "Wheel Click Sound",
                sublabel = if (wheelClickSound) "On" else "Off (Default)",
                badge = if (wheelClickSound) "ON" else "OFF",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    wheelClickSound = !wheelClickSound
                    triggerWheelFeedback()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:auto_lock",
                label = "Screen Sleep Timeout",
                sublabel = "Timeout: ${formatAutoLockLabel()}",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    autoLockTimeoutSec = when (autoLockTimeoutSec) {
                        15 -> 30
                        30 -> 60
                        60 -> 120
                        120 -> 300
                        300 -> 0
                        else -> 15
                    }
                    applyHardwareAutoLock()
                    refreshSettingsMenuLabels()
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:font",
                label = "Font Size",
                sublabel = "Press Center to cycle (${fontScale.name})",
                badge = "${fontScale.visibleRows}R",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    fontScaleIndex = (fontScaleIndex + 1) % fontScalePresets.size
                    refreshSettingsMenuLabels()
                    refreshRootMenuLabels()
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:theme",
                label = "LCD Palette / Theme",
                sublabel = "Press Center to cycle (${theme.name})",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    themeIndex = (themeIndex + 1) % themes.size
                    refreshSettingsMenuLabels()
                    refreshRootMenuLabels()
                    invalidate()
                }
            ),
            MenuItem(
                id = "set:scan",
                label = "Re-Index Full microSD",
                sublabel = lastScanSummary,
                hasChevron = false,
                previewKind = "device_status",
                onSelect = {
                    triggerFullLibraryScan()
                    refreshSettingsMenuLabels()
                }
            ),
            MenuItem(
                id = "set:exit",
                label = "Exit to Stock Y1 OS",
                sublabel = "Return to com.themoon.y1",
                hasChevron = false,
                previewKind = "device_status",
                onSelect = { exitToStockY1Os() }
            )
        )
    }

    private fun refreshSettingsMenuLabels() {
        for (idx in stack.indices) {
            if (stack[idx].id == "settings") {
                val prevFocus = stack[idx].focusedIndex
                val items = buildSettingsMenuItems()
                stack[idx] = stack[idx].copy(
                    items = items,
                    focusedIndex = prevFocus.coerceIn(0, max(0, items.size - 1))
                )
            }
        }
    }

    private fun openSettingsMenu() {
        refreshConnectivityState(force = true)
        stack.add(
            MenuPage(
                id = "settings",
                title = "Settings",
                screenType = "split_menu",
                providerBadge = "local",
                items = buildSettingsMenuItems()
            )
        )
        invalidate()
    }

    private fun startPlayback(track: TrackItem, queue: List<TrackItem>) {
        currentTrack = track
        currentQueue = queue
        currentQueueIndex = max(0, queue.indexOfFirst { it.id == track.id })
        isPlaying = true
        positionMs = 0L
        durationMs = track.durationMs
        nowPlayingMode = "volume"

        if (track.uri.isNotEmpty() && !track.uri.startsWith("spotify:")) {
            val map = Arguments.createMap().apply {
                putString("source", track.source)
                putString("uri", track.uri)
            }
            audioModule.playTrack(map, NoOpPromise())
        }
        refreshRootMenuLabels()
        openNowPlayingScreen()
    }

    private fun openNowPlayingScreen() {
        nowPlayingMode = "volume"
        val top = stack.lastOrNull()
        if (top?.screenType != "now_playing") {
            stack.add(
                MenuPage(
                    id = "now_playing",
                    title = "Now Playing",
                    screenType = "now_playing",
                    providerBadge = currentTrack?.source ?: "local"
                )
            )
        }
        invalidate()
    }

    private fun runFederatedSearch() {
        val q = searchQuery.trim().lowercase(Locale.ROOT)
        val all = localTracks + spotifyTracks + appleTracks
        searchResults = if (q.isEmpty()) {
            all.take(60)
        } else {
            all.filter {
                it.title.lowercase(Locale.ROOT).contains(q) ||
                    it.artist.lowercase(Locale.ROOT).contains(q) ||
                    it.album.lowercase(Locale.ROOT).contains(q)
            }.take(60)
        }
        searchResultIndex = 0
    }

    fun onLockKeyDown() {
        val now = System.currentTimeMillis()
        if (Y1SleepPowerController.isDisplayAsleep) {
            lastInteractionTimeMs = now
            lastDisplayWakeTimeMs = now
            Y1SleepPowerController.wakeDisplay(context as? Activity, brightnessPercent)
            invalidate()
            return
        }
        lastInteractionTimeMs = now
        if (isKeypadLocked && unlockHoldStartMs == 0L) {
            unlockHoldStartMs = now
            invalidate()
        }
    }

    fun onLockKeyUp() {
        if (unlockHoldStartMs != 0L) {
            unlockHoldStartMs = 0L
            invalidate()
        }
    }

    fun isPlayPauseNeededForTextEntry(): Boolean {
        if (isKeypadLocked) return false
        val screen = stack.lastOrNull()?.screenType ?: return false
        return screen == "wheel_search" || screen == "wifi_password"
    }

    fun onReactBridgeEvent(eventName: String, data: WritableMap?) {
        if (eventName == "Y1HardwareKey" && data != null) {
            val button = data.getString("button") ?: return
            val repeatCount = data.getInt("repeatCount")
            handleHardwareButton(button, repeatCount)
        } else if (eventName == "Y1NativePlaybackProgress" && data != null) {
            positionMs = data.getDouble("positionMs").toLong()
            durationMs = max(1L, data.getDouble("durationMs").toLong())
            isPlaying = data.getBoolean("isPlaying")
            postInvalidate()
        } else if (eventName == "Y1NativeTrackEnded") {
            if (currentQueue.isNotEmpty()) {
                val nextIdx = (currentQueueIndex + 1) % currentQueue.size
                startPlayback(currentQueue[nextIdx], currentQueue)
            }
        }
    }

    private fun handleWheelInput(action: String) {
        val now = System.currentTimeMillis()
        if (Y1SleepPowerController.isDisplayAsleep) {
            lastInteractionTimeMs = now
            lastDisplayWakeTimeMs = now
            Y1SleepPowerController.wakeDisplay(context as? Activity, brightnessPercent)
            invalidate()
            return
        }
        if (now - lastDisplayWakeTimeMs < 350L) {
            return
        }
        handleHardwareButton(action, 0)
    }

    private fun handleHardwareButton(button: String, repeatCount: Int = 0) {
        val now = System.currentTimeMillis()
        if (Y1SleepPowerController.isDisplayAsleep) {
            lastInteractionTimeMs = now
            lastDisplayWakeTimeMs = now
            Y1SleepPowerController.wakeDisplay(context as? Activity, brightnessPercent)
            invalidate()
            return
        }
        if (now - lastDisplayWakeTimeMs < 350L) {
            return
        }

        val top = stack.lastOrNull() ?: return

        // Handle Keypad Lock state first (requires holding CENTER or MENU for 3.0 seconds)
        if (isKeypadLocked) {
            if ((button == "CENTER" || button == "MENU" || button == "CENTER_LONG") && unlockHoldStartMs == 0L) {
                unlockHoldStartMs = now
            }
            invalidate()
            return
        }

        lastInteractionTimeMs = now

        if (button == "CENTER_LONG") {
            if (top.screenType == "wheel_search") {
                if (searchResults.isNotEmpty()) {
                    searchMode = if (searchMode == "keyboard") "results" else "keyboard"
                    triggerWheelFeedback()
                }
            } else if (top.screenType == "wifi_password") {
                triggerWheelFeedback()
                connectToWifiNetwork(targetWifiSsid, wifiPasswordInput, targetWifiCaps)
            } else {
                isKeypadLocked = true
                unlockHoldStartMs = 0L
                triggerWheelFeedback()
            }
            invalidate()
            return
        }

        val accelStep = if (repeatCount > 12) 5 else if (repeatCount > 4) 2 else 1
        when (button) {
            "WHEEL_CW" -> stepWheel(accelStep)
            "WHEEL_CCW" -> stepWheel(-accelStep)
            "CENTER" -> pressCenter(top)
            "MENU" -> pressMenuBack(top)
            "PLAY_PAUSE" -> {
                if (top.screenType == "wifi_password") {
                    triggerWheelFeedback()
                    connectToWifiNetwork(targetWifiSsid, wifiPasswordInput, targetWifiCaps)
                } else if (top.screenType == "wheel_search") {
                    if (searchResults.isNotEmpty()) {
                        searchMode = if (searchMode == "keyboard") "results" else "keyboard"
                        triggerWheelFeedback()
                        invalidate()
                    }
                } else {
                    isPlaying = !isPlaying
                    if (isPlaying) audioModule.resume(NoOpPromise()) else audioModule.pause(NoOpPromise())
                    invalidate()
                }
            }
            "NEXT" -> {
                if (top.screenType == "wifi_password") {
                    triggerWheelFeedback()
                    connectToWifiNetwork(targetWifiSsid, wifiPasswordInput, targetWifiCaps)
                } else if (top.screenType == "wheel_search") {
                    if (searchResults.isNotEmpty()) {
                        searchMode = if (searchMode == "keyboard") "results" else "keyboard"
                        triggerWheelFeedback()
                        invalidate()
                    }
                } else if (currentQueue.isNotEmpty()) {
                    val nextIdx = (currentQueueIndex + 1) % currentQueue.size
                    startPlayback(currentQueue[nextIdx], currentQueue)
                }
            }
            "PREVIOUS" -> {
                if (top.screenType == "wifi_password") {
                    if (wifiPasswordInput.isNotEmpty()) {
                        wifiPasswordInput = wifiPasswordInput.substring(0, wifiPasswordInput.length - 1)
                        triggerWheelFeedback()
                        invalidate()
                    }
                } else if (currentQueue.isNotEmpty()) {
                    val prevIdx = (currentQueueIndex - 1 + currentQueue.size) % currentQueue.size
                    startPlayback(currentQueue[prevIdx], currentQueue)
                }
            }
        }
    }

    private fun stepWheel(delta: Int) {
        val top = stack.lastOrNull() ?: return
        triggerWheelFeedback()
        when (top.screenType) {
            "now_playing" -> {
                if (nowPlayingMode == "scrub") {
                    positionMs = (positionMs + delta * 5000L).coerceIn(0L, max(1L, durationMs))
                    audioModule.seekTo(positionMs.toDouble(), NoOpPromise())
                } else {
                    val dir = if (delta > 0) 1 else -1
                    volumePercent = (volumePercent + dir * 4).coerceIn(0, 100)
                    audioModule.setVolume(volumePercent, NoOpPromise())
                    volumeOverlayUntilMs = System.currentTimeMillis() + 2200L
                    postInvalidateDelayed(2250L)
                }
            }
            "wifi_password" -> {
                val dir = if (delta > 0) 1 else -1
                wifiPasswordKeyIndex = (wifiPasswordKeyIndex + dir + wifiPasswordTokens.size) % wifiPasswordTokens.size
            }
            "wheel_search" -> {
                val dir = if (delta > 0) 1 else -1
                if (searchMode == "keyboard") {
                    searchKeyIndex = (searchKeyIndex + dir + wheelTokens.size) % wheelTokens.size
                } else {
                    val maxRow = max(0, searchResults.size - 1)
                    searchResultIndex = (searchResultIndex + dir).coerceIn(0, maxRow)
                }
            }
            else -> {
                if (top.items.isNotEmpty()) {
                    top.focusedIndex = (top.focusedIndex + delta).coerceIn(0, top.items.size - 1)
                }
            }
        }
        invalidate()
    }

    private fun pressCenter(top: MenuPage) {
        when (top.screenType) {
            "qr_auth" -> {
                if (activeQrProvider == "spotify") {
                    spotifyAuthed = true
                    stack.removeAt(stack.size - 1)
                    openProviderHub("spotify")
                } else {
                    appleAuthed = true
                    stack.removeAt(stack.size - 1)
                    openProviderHub("apple_music")
                }
            }
            "now_playing" -> {
                if (nowPlayingMode == "scrub") {
                    nowPlayingMode = "volume"
                } else {
                    nowPlayingMode = "scrub"
                    volumeOverlayUntilMs = 0L
                }
            }
            "wifi_password" -> {
                val tok = wifiPasswordTokens[wifiPasswordKeyIndex]
                when (tok) {
                    "CONNECT" -> connectToWifiNetwork(targetWifiSsid, wifiPasswordInput, targetWifiCaps)
                    "DEL" -> {
                        if (wifiPasswordInput.isNotEmpty()) {
                            wifiPasswordInput = wifiPasswordInput.substring(0, wifiPasswordInput.length - 1)
                        }
                    }
                    "SPC" -> {
                        wifiPasswordInput += " "
                    }
                    else -> {
                        wifiPasswordInput += tok
                    }
                }
            }
            "wheel_search" -> {
                if (searchMode == "keyboard") {
                    val tok = wheelTokens[searchKeyIndex]
                    when (tok) {
                        "RESULTS" -> if (searchResults.isNotEmpty()) searchMode = "results"
                        "DEL" -> {
                            if (searchQuery.isNotEmpty()) {
                                searchQuery = searchQuery.substring(0, searchQuery.length - 1)
                                runFederatedSearch()
                            }
                        }
                        "SPACE" -> {
                            searchQuery += " "
                            runFederatedSearch()
                        }
                        else -> {
                            searchQuery += tok
                            runFederatedSearch()
                        }
                    }
                } else {
                    val picked = searchResults.getOrNull(searchResultIndex)
                    if (picked != null) {
                        startPlayback(picked, searchResults)
                    }
                }
            }
            else -> {
                val item = top.items.getOrNull(top.focusedIndex)
                item?.onSelect?.invoke()
            }
        }
        invalidate()
    }

    private fun pressMenuBack(top: MenuPage) {
        if (top.screenType == "now_playing" && nowPlayingMode == "scrub") {
            nowPlayingMode = "volume"
            invalidate()
            return
        }
        if (top.screenType == "wheel_search" && searchMode == "results") {
            searchMode = "keyboard"
            invalidate()
            return
        }
        if (stack.size > 1) {
            stack.removeAt(stack.size - 1)
            invalidate()
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            val now = System.currentTimeMillis()
            if (Y1SleepPowerController.isDisplayAsleep) {
                lastInteractionTimeMs = now
                lastDisplayWakeTimeMs = now
                Y1SleepPowerController.wakeDisplay(context as? Activity, brightnessPercent)
                invalidate()
                return true
            }
            if (isKeypadLocked) {
                onLockKeyDown()
                return true
            }
            lastInteractionTimeMs = now
            val w = width.toFloat().coerceAtLeast(1f)
            val h = height.toFloat().coerceAtLeast(1f)
            val nx = (event.x / w) * 480f
            val ny = (event.y / h) * 360f
            val top = stack.lastOrNull() ?: return true

            if (ny <= 30f && nx <= 120f) {
                handleHardwareButton("MENU")
                return true
            }
            if (top.screenType == "split_menu" && nx < 240f && ny > 28f) {
                val rows = fontScale.visibleRows
                val rHeight = fontScale.rowHeight
                val halfOffset = rows / 2
                val clickedRow = ((ny - 28f) / rHeight).toInt()
                val visibleStart = max(0, min(top.focusedIndex - halfOffset, max(0, top.items.size - rows)))
                val targetIndex = visibleStart + clickedRow
                if (targetIndex in top.items.indices) {
                    if (top.focusedIndex == targetIndex) {
                        handleHardwareButton("CENTER")
                    } else {
                        top.focusedIndex = targetIndex
                        invalidate()
                    }
                    return true
                }
            }
            handleHardwareButton("CENTER")
            return true
        } else if (event.action == MotionEvent.ACTION_UP || event.action == MotionEvent.ACTION_CANCEL) {
            onLockKeyUp()
        }
        return super.onTouchEvent(event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (Y1SleepPowerController.isDisplayAsleep) {
            canvas.drawColor(Color.BLACK)
            return
        }
        refreshConnectivityState()
        val now = System.currentTimeMillis()
        if (autoLockTimeoutSec > 0 && (now - lastInteractionTimeMs >= autoLockTimeoutSec * 1000L)) {
            isKeypadLocked = true
            unlockHoldStartMs = 0L
            Y1SleepPowerController.enterDisplaySleep(context as? Activity)
            canvas.drawColor(Color.BLACK)
            return
        } else if (autoLock1MinEnabled && !isKeypadLocked && (now - lastInteractionTimeMs >= 60_000L)) {
            isKeypadLocked = true
            unlockHoldStartMs = 0L
        }

        val scaleX = width / 480f
        val scaleY = height / 360f
        canvas.save()
        canvas.scale(scaleX, scaleY)

        paint.shader = null
        paint.color = theme.bg
        canvas.drawRect(0f, 0f, 480f, 360f, paint)

        val top = stack.lastOrNull()
        if (top != null) {
            drawStatusBar(canvas, top)
            when (top.screenType) {
                "split_menu" -> drawSplitMenu(canvas, top)
                "cover_flow" -> drawCoverFlow(canvas, top)
                "now_playing" -> drawNowPlaying(canvas)
                "qr_auth" -> drawQrAuthModal(canvas)
                "wheel_search" -> drawWheelSearch(canvas)
                "wifi_password" -> drawWifiPasswordScreen(canvas)
            }
        }

        if (isKeypadLocked) {
            val heldMs = if (unlockHoldStartMs > 0L) (now - unlockHoldStartMs) else 0L
            if (unlockHoldStartMs > 0L && heldMs >= 3000L) {
                isKeypadLocked = false
                unlockHoldStartMs = 0L
                lastInteractionTimeMs = now
                triggerWheelFeedback()
                postInvalidateOnAnimation()
            } else {
                paint.shader = null
                paint.style = Paint.Style.FILL
                paint.color = 0xEE10141D.toInt()
                rect.set(64f, 306f, 416f, 350f)
                canvas.drawRoundRect(rect, 10f, 10f, paint)

                if (unlockHoldStartMs > 0L) {
                    val unlockProgress = (heldMs / 3000f).coerceIn(0f, 1f)
                    val fillW = 344f * unlockProgress
                    paint.shader = LinearGradient(
                        68f, 310f, (68f + fillW).coerceAtLeast(70f), 346f,
                        Color.parseColor("#479AF5"), Color.parseColor("#1664D8"),
                        Shader.TileMode.CLAMP
                    )
                    rect.set(68f, 310f, 68f + fillW, 346f)
                    canvas.drawRoundRect(rect, 7f, 7f, paint)
                    paint.shader = null

                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = 1.8f
                    paint.color = Color.parseColor("#479AF5")
                    rect.set(64f, 306f, 416f, 350f)
                    canvas.drawRoundRect(rect, 10f, 10f, paint)
                    paint.style = Paint.Style.FILL

                    val remSec = String.format(Locale.US, "%.1f", (3.0f - heldMs / 1000f).coerceAtLeast(0f))
                    val prevAlign = textPaint.textAlign
                    textPaint.textAlign = Paint.Align.CENTER
                    textPaint.typeface = Typeface.DEFAULT_BOLD
                    textPaint.textSize = 12f
                    textPaint.color = Color.WHITE
                    canvas.drawText("🔓 Unlocking... Hold ${remSec}s", 240f, 333f, textPaint)
                    textPaint.textAlign = prevAlign
                    postInvalidateDelayed(16L)
                } else {
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = 1.6f
                    paint.color = Color.parseColor("#D9383A")
                    rect.set(64f, 306f, 416f, 350f)
                    canvas.drawRoundRect(rect, 10f, 10f, paint)
                    paint.style = Paint.Style.FILL

                    val prevAlign = textPaint.textAlign
                    textPaint.textAlign = Paint.Align.CENTER
                    textPaint.typeface = Typeface.DEFAULT_BOLD
                    textPaint.textSize = 11.5f
                    textPaint.color = Color.WHITE
                    canvas.drawText("🔒 Keypad Locked • Hold Center 3s to Unlock", 240f, 333f, textPaint)
                    textPaint.textAlign = prevAlign
                }
            }
        }

        canvas.restore()
    }

    private fun drawStatusBar(canvas: Canvas, top: MenuPage) {
        paint.shader = LinearGradient(
            0f, 0f, 0f, 28f,
            theme.statusBarTop, theme.statusBarBottom,
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, 480f, 28f, paint)
        paint.shader = null

        paint.color = theme.divider
        canvas.drawRect(0f, 27f, 480f, 28f, paint)

        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 13f
        textPaint.color = theme.textPrimary
        canvas.drawText(ellipsize(top.title, 26), 10f, 19f, textPaint)

        if (isIndexing) {
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 9.5f
            textPaint.color = Color.parseColor("#1D6FE8")
            canvas.drawText("SYNC", 242f, 18f, textPaint)
            Y1VectorArtwork.drawSpinningSyncIcon(
                canvas,
                280f,
                14f,
                7f,
                syncAngleDeg,
                Color.parseColor("#1D6FE8"),
                paint
            )
            syncAngleDeg = (syncAngleDeg + 18f) % 360f
            postInvalidateDelayed(32)
        }

        if (isKeypadLocked) {
            Y1VectorArtwork.drawPadlockIcon(canvas, 306f, 14f, 6.5f, paint)
        }

        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 11f
        textPaint.color = theme.textPrimary
        canvas.drawText(if (isPlaying) "▶" else "❚❚", 328f, 18f, textPaint)

        Y1VectorArtwork.drawBluetoothIcon(canvas, 352f, 14f, 7f, btEnabled, paint)
        Y1VectorArtwork.drawWifiIcon(canvas, 374f, 14f, 7f, wifiEnabled, paint)

        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.5f
        paint.color = theme.textPrimary
        rect.set(392f, 8f, 416f, 20f)
        canvas.drawRect(rect, paint)
        paint.style = Paint.Style.FILL
        paint.color = Color.parseColor("#28B446")
        canvas.drawRect(394f, 10f, 414f, 18f, paint)

        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 11.5f
        textPaint.color = theme.textPrimary
        val clockStr = Y1TimeController.formatClock()
        val clockW = textPaint.measureText(clockStr)
        val clockX = 472f - clockW
        canvas.drawText(clockStr, clockX, 18.5f, textPaint)
    }

    private fun drawSplitMenu(canvas: Canvas, page: MenuPage) {
        val visibleRows = fontScale.visibleRows
        val rowHeight = fontScale.rowHeight
        val halfOffset = visibleRows / 2
        val startIdx = max(0, min(page.focusedIndex - halfOffset, max(0, page.items.size - visibleRows)))
        val endIdx = min(page.items.size, startIdx + visibleRows)

        for (i in startIdx until endIdx) {
            val item = page.items[i]
            val rowTop = 28f + (i - startIdx) * rowHeight
            val rowBottom = rowTop + rowHeight
            val isFocused = (i == page.focusedIndex)

            if (isFocused) {
                paint.shader = LinearGradient(
                    0f, rowTop, 0f, rowBottom,
                    theme.highlightTop, theme.highlightBottom,
                    Shader.TileMode.CLAMP
                )
                canvas.drawRect(0f, rowTop, 240f, rowBottom, paint)
                paint.shader = null
            }

            val hasMiniArtwork = item.previewTrack != null
            val textLeft = if (hasMiniArtwork) 50f else 10f

            if (hasMiniArtwork) {
                val thumbSize = min(36f, rowHeight - 8f)
                val thumbTop = rowTop + (rowHeight - thumbSize) * 0.5f
                drawArtworkBox(canvas, item.previewTrack, 8f, thumbTop, thumbSize, item.label)
            }

            val maxLabelChars = when {
                hasMiniArtwork && visibleRows <= 5 -> 13
                hasMiniArtwork && visibleRows == 6 -> 15
                hasMiniArtwork -> 17
                visibleRows <= 5 -> 17
                visibleRows == 6 -> 19
                else -> 22
            }
            val maxSubChars = maxLabelChars + 4

            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = fontScale.titleSize
            textPaint.color = if (isFocused) theme.highlightText else theme.textPrimary
            val titleY = if (item.sublabel.isNotEmpty()) {
                rowTop + rowHeight * 0.44f
            } else {
                rowTop + rowHeight * 0.60f
            }
            canvas.drawText(ellipsize(item.label, maxLabelChars), textLeft, titleY, textPaint)

            if (item.sublabel.isNotEmpty()) {
                textPaint.typeface = Typeface.DEFAULT
                textPaint.textSize = fontScale.sublabelSize
                textPaint.color = if (isFocused) theme.highlightText else theme.textSecondary
                canvas.drawText(ellipsize(item.sublabel, maxSubChars), textLeft, rowTop + rowHeight * 0.78f, textPaint)
            }

            val midY = rowTop + rowHeight * 0.58f
            if (item.badge.isNotEmpty()) {
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = fontScale.sublabelSize
                textPaint.color = if (isFocused) theme.highlightText else theme.textSecondary
                canvas.drawText(item.badge, 188f, midY, textPaint)
            } else if (item.hasChevron) {
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = fontScale.titleSize
                textPaint.color = if (isFocused) theme.highlightText else theme.textSecondary
                canvas.drawText(">", 222f, midY, textPaint)
            }
        }

        // Indicador de posición de scroll vertical (sutil en x=237..239)
        if (page.items.size > visibleRows) {
            val trackH = 332f
            val thumbH = max(18f, trackH * (visibleRows.toFloat() / page.items.size.toFloat()))
            val ratio = page.focusedIndex.toFloat() / max(1, page.items.size - 1).toFloat()
            val thumbTop = 28f + (trackH - thumbH) * ratio
            paint.color = theme.divider
            canvas.drawRect(236f, thumbTop, 239f, thumbTop + thumbH, paint)
        }

        paint.color = theme.divider
        canvas.drawRect(240f, 28f, 241f, 360f, paint)

        paint.color = theme.paneRightBg
        canvas.drawRect(241f, 28f, 480f, 360f, paint)

        val focusedItem = page.items.getOrNull(page.focusedIndex)
        drawPreviewPane(canvas, focusedItem)
    }

    private fun drawArtworkBox(
        canvas: Canvas,
        track: TrackItem?,
        left: Float,
        top: Float,
        size: Float,
        fallbackLabel: String
    ) {
        val bmp = getOrLoadArtwork(track)
        rect.set(left, top, left + size, top + size)
        if (bmp != null && !bmp.isRecycled) {
            paint.shader = null
            paint.color = Color.WHITE
            srcRect.set(0, 0, bmp.width, bmp.height)
            canvas.drawBitmap(bmp, srcRect, rect, paint)
        } else {
            Y1VectorArtwork.drawDefaultVinylCover(
                canvas,
                left,
                top,
                size,
                track?.coverColor ?: Color.parseColor("#1D6FE8"),
                fallbackLabel,
                paint,
                textPaint
            )
        }
    }

    private fun drawPreviewPane(canvas: Canvas, item: MenuItem?) {
        val kind = item?.previewKind ?: "album_collage"
        when (kind) {
            "spotify_hub" -> {
                Y1VectorArtwork.drawSpotifyLogo(canvas, 360f, 136f, 54f, paint)

                textPaint.color = theme.textPrimary
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = 14f
                canvas.drawText("Spotify Direct & Connect", 272f, 232f, textPaint)
                textPaint.color = theme.textSecondary
                textPaint.typeface = Typeface.DEFAULT
                textPaint.textSize = 11f
                canvas.drawText(
                    if (spotifyAuthed) "Status: Linked (Ogg 320kbps)" else "Status: Press Center for QR Login",
                    270f, 254f, textPaint
                )
            }
            "apple_music_hub" -> {
                Y1VectorArtwork.drawAppleMusicLogo(canvas, 306f, 82f, 108f, paint)

                textPaint.color = theme.textPrimary
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = 14f
                canvas.drawText("Apple Music Lossless", 285f, 232f, textPaint)
                textPaint.color = theme.textSecondary
                textPaint.typeface = Typeface.DEFAULT
                textPaint.textSize = 11f
                canvas.drawText(
                    if (appleAuthed) "Status: ALAC 24-bit/96kHz Ready" else "Status: Press Center for QR Login",
                    268f, 254f, textPaint
                )
            }
            "now_playing_artwork" -> {
                val track = item?.previewTrack ?: currentTrack ?: localTracks.firstOrNull()
                drawArtworkBox(canvas, track, 282f, 48f, 156f, track?.album ?: "Y1 Hi-Fi")

                textPaint.color = theme.textPrimary
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = 13.5f
                canvas.drawText(ellipsize(track?.title ?: "No Track", 24), 258f, 232f, textPaint)

                textPaint.color = theme.textSecondary
                textPaint.typeface = Typeface.DEFAULT
                textPaint.textSize = 11.5f
                canvas.drawText(ellipsize(track?.artist ?: "", 26), 258f, 252f, textPaint)
                canvas.drawText(ellipsize(track?.album ?: "", 26), 258f, 270f, textPaint)
                canvas.drawText(track?.codecLabel ?: "FLAC Lossless", 258f, 290f, textPaint)
            }
            "device_status" -> {
                paint.color = theme.bg
                rect.set(258f, 46f, 462f, 342f)
                canvas.drawRoundRect(rect, 8f, 8f, paint)

                textPaint.color = theme.textPrimary
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = 13.5f
                canvas.drawText("Innioasis Y1 System", 272f, 74f, textPaint)

                textPaint.typeface = Typeface.DEFAULT
                textPaint.textSize = 10.5f
                textPaint.color = theme.textSecondary
                canvas.drawText("SoC: MediaTek MT6572 • Android 4.2.2", 272f, 98f, textPaint)
                canvas.drawText("Wi-Fi: ${if (wifiEnabled) "ON" else "OFF"} • Bluetooth: ${if (btEnabled) "ON" else "OFF"}", 272f, 118f, textPaint)
                canvas.drawText("Auto Lock (1m): ${if (autoLock1MinEnabled) "ON (Hold 3s)" else "OFF"}", 272f, 138f, textPaint)
                canvas.drawText("Brightness: $brightnessPercent% • Sleep: ${formatAutoLockLabel()}", 272f, 158f, textPaint)
                canvas.drawText("Vibration: $wheelVibrationMode", 272f, 178f, textPaint)
                canvas.drawText("Click Sound: ${if (wheelClickSound) "On" else "Off (Default)"}", 272f, 198f, textPaint)
                canvas.drawText("Library: ${localTracks.size} Songs • ${localAlbums.size} Albums", 272f, 218f, textPaint)
                canvas.drawText("Playlists (.m3u): ${localPlaylists.size}", 272f, 238f, textPaint)
                canvas.drawText("Theme: ${theme.name} (${fontScale.name})", 272f, 258f, textPaint)
                canvas.drawText(ellipsize(wifiStatusMessage, 30), 272f, 280f, textPaint)
            }
            else -> {
                // Collage 2x2 con las carátulas reales de los primeros 4 álbumes de la microSD
                for (idx in 0 until 4) {
                    val col = idx % 2
                    val row = idx / 2
                    val left = 272f + col * 92f
                    val top = 48f + row * 92f
                    val alb = localAlbums.getOrNull(idx * 3)
                    val repTrack = alb?.representativeTrack ?: localTracks.getOrNull(idx)
                    drawArtworkBox(canvas, repTrack, left, top, 82f, alb?.title ?: "Album ${idx + 1}")
                }
                textPaint.color = theme.textPrimary
                textPaint.typeface = Typeface.DEFAULT_BOLD
                textPaint.textSize = 13f
                canvas.drawText("${localTracks.size} Tracks Indexed", 295f, 258f, textPaint)
                textPaint.color = theme.textSecondary
                textPaint.typeface = Typeface.DEFAULT
                textPaint.textSize = 11f
                canvas.drawText("${localAlbums.size} Albums • ${localPlaylists.size} M3U Playlists", 274f, 278f, textPaint)
            }
        }
    }

    private fun drawCoverFlow(canvas: Canvas, page: MenuPage) {
        val centerIdx = page.focusedIndex
        val targetFocus = centerIdx.toFloat()
        if (kotlin.math.abs(animCoverFlowFocus - targetFocus) > 6f) {
            animCoverFlowFocus = targetFocus
        } else {
            animCoverFlowFocus += (targetFocus - animCoverFlowFocus) * 0.28f
        }
        if (kotlin.math.abs(animCoverFlowFocus - targetFocus) > 0.005f) {
            postInvalidateOnAnimation()
        }

        // Draw back-to-front so outer albums (-2, 2) are drawn first, inner side albums (-1, 1) next,
        // and offset = 0 (selected album) is drawn LAST on top of everything!
        for (offset in intArrayOf(-2, 2, -1, 1, 0)) {
            val idx = centerIdx + offset
            if (idx !in page.items.indices) continue
            val item = page.items[idx]
            val relOffset = idx.toFloat() - animCoverFlowFocus
            val absOff = kotlin.math.abs(relOffset)
            val cx = 240f + relOffset * 84f
            val size = when {
                absOff < 1f -> 152f - 48f * absOff
                else -> (104f - 22f * (absOff - 1f)).coerceAtLeast(76f)
            }
            val top = when {
                absOff < 1f -> 46f + 32f * absOff
                else -> (78f + 14f * (absOff - 1f)).coerceAtMost(96f)
            }
            val left = cx - size / 2f

            if (offset == 0) {
                // Elevated 3D drop shadow behind the selected center album + solid backing so side covers never bleed through
                paint.shader = null
                paint.style = Paint.Style.FILL
                paint.color = 0x55000000
                rect.set(left - 4f, top + 6f, left + size + 4f, top + size + 10f)
                canvas.drawRoundRect(rect, 8f, 8f, paint)
                paint.color = Color.WHITE
                rect.set(left, top, left + size, top + size)
                canvas.drawRect(rect, paint)
            }

            drawArtworkBox(canvas, item.previewTrack, left, top, size, item.label)

            if (offset != 0) {
                // Subtle dark dimming overlay on non-selected side albums for 3D depth
                paint.shader = null
                paint.style = Paint.Style.FILL
                paint.color = 0x44000000
                rect.set(left, top, left + size, top + size)
                canvas.drawRect(rect, paint)
            } else {
                // Crisp highlight frame around the elevated center album
                paint.shader = null
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = 2.5f
                paint.color = Color.parseColor("#1D6FE8")
                rect.set(left - 1.5f, top - 1.5f, left + size + 1.5f, top + size + 1.5f)
                canvas.drawRoundRect(rect, 4f, 4f, paint)
                paint.style = Paint.Style.FILL
            }
        }

        val focused = page.items.getOrNull(centerIdx)
        if (focused != null) {
            val prevAlign = textPaint.textAlign
            textPaint.textAlign = Paint.Align.CENTER
            textPaint.color = theme.textPrimary
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 16f
            canvas.drawText(ellipsize(focused.label, 32), 240f, 234f, textPaint)

            textPaint.color = theme.textSecondary
            textPaint.typeface = Typeface.DEFAULT
            textPaint.textSize = 13f
            canvas.drawText(ellipsize(focused.sublabel, 36), 240f, 256f, textPaint)
            textPaint.textSize = 11.5f
            canvas.drawText("Album ${centerIdx + 1} of ${page.items.size} • Press Center to Open", 240f, 314f, textPaint)
            textPaint.textAlign = prevAlign
        }
    }

    private fun drawNowPlaying(canvas: Canvas) {
        val track = currentTrack ?: localTracks.firstOrNull() ?: return
        val now = System.currentTimeMillis()
        val isScrubbing = (nowPlayingMode == "scrub")
        val isShowingVolume = (!isScrubbing && now < volumeOverlayUntilMs)

        // =========================================================================
        // 1. Upper Section: Larger 208x208 Album Cover (left = 22f, top = 42f)
        //    + Vertically Balanced Metadata at left = 248f
        // =========================================================================
        paint.shader = null
        paint.style = Paint.Style.FILL
        paint.color = 0x33000000
        rect.set(20f, 45f, 234f, 255f)
        canvas.drawRoundRect(rect, 6f, 6f, paint)

        drawArtworkBox(canvas, track, 22f, 42f, 208f, track.album)

        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.2f
        paint.color = theme.divider
        rect.set(22f, 42f, 230f, 250f)
        canvas.drawRect(rect, paint)
        paint.style = Paint.Style.FILL

        textPaint.color = theme.textSecondary
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 11.5f
        canvas.drawText("${currentQueueIndex + 1} of ${max(1, currentQueue.size)} • ${track.codecLabel}", 248f, 84f, textPaint)

        textPaint.color = theme.textPrimary
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 19f
        canvas.drawText(ellipsize(track.title, 20), 248f, 122f, textPaint)

        textPaint.color = theme.textSecondary
        textPaint.typeface = Typeface.DEFAULT
        textPaint.textSize = 15f
        canvas.drawText(ellipsize(track.artist, 23), 248f, 154f, textPaint)
        textPaint.textSize = 13.5f
        canvas.drawText(ellipsize(track.album, 24), 248f, 182f, textPaint)

        // =========================================================================
        // 2. Smooth 60 FPS Interpolation (Lerp) for Bar Fill, Bolita & Mode Mix
        // =========================================================================
        val targetProgressRatio = (positionMs.toFloat() / max(1L, durationMs).toFloat()).coerceIn(0f, 1f)
        val targetVolumeRatio = (volumePercent.coerceIn(0, 100) / 100f)
        val targetScrubScale = if (isScrubbing) 1f else 0f
        val targetVolumeMix = if (isShowingVolume) 1f else 0f

        animProgressRatio += (targetProgressRatio - animProgressRatio) * 0.25f
        animVolumeRatio += (targetVolumeRatio - animVolumeRatio) * 0.25f
        animScrubKnobScale += (targetScrubScale - animScrubKnobScale) * 0.22f
        animVolumeOverlayMix += (targetVolumeMix - animVolumeOverlayMix) * 0.22f

        val needsNextFrame =
            kotlin.math.abs(animProgressRatio - targetProgressRatio) > 0.001f ||
                kotlin.math.abs(animVolumeRatio - targetVolumeRatio) > 0.001f ||
                kotlin.math.abs(animScrubKnobScale - targetScrubScale) > 0.005f ||
                kotlin.math.abs(animVolumeOverlayMix - targetVolumeMix) > 0.005f
        if (needsNextFrame) {
            postInvalidateOnAnimation()
        }

        // =========================================================================
        // 3. Single Dynamic Bottom Bar (barTop = 310f, barBottom = 324f)
        // =========================================================================
        val barLeft = 68f
        val barRight = 412f
        val barTop = 310f
        val barBottom = 324f
        val barCenterY = 317f

        paint.shader = null
        paint.style = Paint.Style.FILL
        paint.color = theme.divider
        rect.set(barLeft, barTop, barRight, barBottom)
        canvas.drawRoundRect(rect, 7f, 7f, paint)

        val blendedRatio = (animProgressRatio * (1f - animVolumeOverlayMix) + animVolumeRatio * animVolumeOverlayMix).coerceIn(0f, 1f)
        val fillRight = barLeft + 344f * blendedRatio

        paint.color = Color.WHITE
        paint.shader = LinearGradient(
            barLeft, barTop, fillRight.coerceAtLeast(barLeft + 2f), barBottom,
            theme.highlightTop, theme.highlightBottom,
            Shader.TileMode.CLAMP
        )
        rect.set(barLeft, barTop, fillRight, barBottom)
        canvas.drawRoundRect(rect, 7f, 7f, paint)
        paint.shader = null

        val knobX = fillRight.coerceIn(barLeft + 5f, barRight - 5f)
        val effectiveScrubScale = (animScrubKnobScale * (1f - animVolumeOverlayMix)).coerceIn(0f, 1f)
        val knobRadius = 6f + 4f * effectiveScrubScale

        if (effectiveScrubScale > 0.02f) {
            // Smoothly animated active border + outer halo ring when scrubbing
            val haloAlpha = (56f * effectiveScrubScale).toInt().coerceIn(0, 255)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 1.6f * effectiveScrubScale
            paint.color = Color.parseColor("#1D6FE8")
            rect.set(barLeft - 1f, barTop - 1f, barRight + 1f, barBottom + 1f)
            canvas.drawRoundRect(rect, 8f, 8f, paint)

            paint.style = Paint.Style.FILL
            paint.color = (haloAlpha shl 24) or 0x1D6FE8
            canvas.drawCircle(knobX, barCenterY, 9f + 4.5f * effectiveScrubScale, paint)
        }

        // Smoothly scaled white bolita with blue ring
        paint.style = Paint.Style.FILL
        paint.color = Color.WHITE
        canvas.drawCircle(knobX, barCenterY, knobRadius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 1.6f + 1.0f * effectiveScrubScale
        paint.color = Color.parseColor("#1D6FE8")
        canvas.drawCircle(knobX, barCenterY, knobRadius, paint)
        paint.style = Paint.Style.FILL

        if (effectiveScrubScale > 0.05f) {
            canvas.drawCircle(knobX, barCenterY, 3.4f * effectiveScrubScale, paint)
        }

        if (animVolumeOverlayMix > 0.5f) {
            val speakerColor = Color.parseColor("#1D6FE8")
            Y1VectorArtwork.drawSpeakerIcon(canvas, 44f, barCenterY, 9.5f, volumePercent, speakerColor, paint)

            textPaint.color = theme.textPrimary
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 11.5f
            canvas.drawText("$volumePercent%", 420f, 321f, textPaint)
            postInvalidateDelayed(250L)
        } else {
            textPaint.color = if (isScrubbing) theme.textPrimary else theme.textSecondary
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 11.5f
            canvas.drawText(formatDuration(positionMs), 22f, 321f, textPaint)
            canvas.drawText("-${formatDuration(max(0L, durationMs - positionMs))}", 420f, 321f, textPaint)
        }
    }

    private fun drawWifiPasswordScreen(canvas: Canvas) {
        paint.color = theme.paneRightBg
        canvas.drawRect(0f, 28f, 480f, 100f, paint)

        textPaint.color = theme.textPrimary
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 13.5f
        canvas.drawText("SSID: ${ellipsize(targetWifiSsid, 22)}", 14f, 48f, textPaint)

        textPaint.color = Color.parseColor("#1D6FE8")
        textPaint.textSize = 12.5f
        val shownPass = if (wifiPasswordInput.isEmpty()) "(empty / use saved)" else "${wifiPasswordInput}|"
        canvas.drawText("PASS: $shownPass", 225f, 48f, textPaint)

        val prevAlign = textPaint.textAlign
        textPaint.textAlign = Paint.Align.CENTER
        for (offset in -5..5) {
            val idx = (wifiPasswordKeyIndex + offset + wifiPasswordTokens.size) % wifiPasswordTokens.size
            val rawTok = wifiPasswordTokens[idx]
            val tok = when (rawTok) {
                "CONNECT" -> "JOIN"
                else -> rawTok
            }
            val cx = 240f + offset * 41f
            val isActive = (offset == 0)
            if (isActive) {
                paint.color = Color.parseColor("#1D6FE8")
                rect.set(cx - 19f, 60f, cx + 19f, 90f)
                canvas.drawRoundRect(rect, 5f, 5f, paint)
            }
            textPaint.color = if (isActive) Color.WHITE else theme.textPrimary
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 12f
            canvas.drawText(tok, cx, 80f, textPaint)
        }
        textPaint.textAlign = prevAlign

        paint.color = Color.parseColor("#1D6FE8")
        canvas.drawRect(0f, 100f, 480f, 124f, paint)
        textPaint.color = Color.WHITE
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 10.5f
        canvas.drawText(
            "Wheel: Pick Char • CENTER: Add • PLAY/PAUSE (or >>|): Connect Now • |<<: Delete",
            12f, 116f, textPaint
        )

        paint.color = theme.paneRightBg
        rect.set(20f, 140f, 460f, 336f)
        canvas.drawRoundRect(rect, 8f, 8f, paint)

        textPaint.color = theme.textPrimary
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 14f
        canvas.drawText("In-App Click Wheel Wi-Fi Setup (No Android Settings!)", 36f, 168f, textPaint)

        textPaint.color = theme.textSecondary
        textPaint.typeface = Typeface.DEFAULT
        textPaint.textSize = 12f
        canvas.drawText("• Rotate Wheel to browse lowercase (a-z), UPPERCASE (A-Z), digits (0-9) & symbols", 36f, 196f, textPaint)
        canvas.drawText("• Press CENTER to type the highlighted character into the password", 36f, 220f, textPaint)
        canvas.drawText("• Press PREVIOUS (|<<) or select DEL to backspace", 36f, 244f, textPaint)
        canvas.drawText("• Press PLAY/PAUSE (>||) or NEXT (>>|) anytime to connect immediately!", 36f, 268f, textPaint)

        paint.color = Color.parseColor("#1D6FE8")
        rect.set(36f, 286f, 444f, 322f)
        canvas.drawRoundRect(rect, 6f, 6f, paint)
        textPaint.color = Color.WHITE
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 12.5f
        canvas.drawText("Status: ${ellipsize(wifiStatusMessage, 48)}", 50f, 309f, textPaint)
    }

    private fun drawQrAuthModal(canvas: Canvas) {
        val isSpotify = activeQrProvider == "spotify"
        val pairingUrl = Y1LocalPairingServer.startAndGetPairingUrl(activeQrProvider) { provider, _ ->
            post {
                if (provider.lowercase(Locale.ROOT).contains("apple")) {
                    appleAuthed = true
                    if (stack.lastOrNull()?.screenType == "qr_auth") {
                        stack.removeAt(stack.size - 1)
                        openProviderHub("apple_music")
                    }
                } else {
                    spotifyAuthed = true
                    if (stack.lastOrNull()?.screenType == "qr_auth") {
                        stack.removeAt(stack.size - 1)
                        openProviderHub("spotify")
                    }
                }
                invalidate()
            }
        }

        QrCodeEncoder.drawQrCode(canvas, pairingUrl, 28f, 48f, 182f, paint)

        textPaint.color = theme.textPrimary
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 11f
        canvas.drawText(if (isSpotify) "CODE: Y1SP-9042" else "CODE: Y1AM-4820", 62f, 250f, textPaint)

        textPaint.color = theme.textPrimary
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 15.5f
        canvas.drawText(
            if (isSpotify) "Connect Spotify (OAuth2 PKCE)" else "Connect Apple Music (MusicKit)",
            224f, 74f, textPaint
        )

        textPaint.color = theme.textSecondary
        textPaint.typeface = Typeface.DEFAULT
        textPaint.textSize = 11.5f
        canvas.drawText("1. Scan QR code with your phone camera", 224f, 106f, textPaint)
        canvas.drawText("2. Authorize Innioasis Y1 over Wi-Fi", 224f, 128f, textPaint)
        canvas.drawText("3. Or open Pairing URL in browser:", 224f, 150f, textPaint)

        textPaint.color = Color.parseColor("#1D6FE8")
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 10.5f
        canvas.drawText(ellipsize(pairingUrl, 34), 224f, 172f, textPaint)

        paint.color = if (isSpotify) Color.parseColor("#1DB954") else Color.parseColor("#FA243C")
        rect.set(224f, 214f, 456f, 254f)
        canvas.drawRoundRect(rect, 6f, 6f, paint)
        textPaint.color = Color.WHITE
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 12.5f
        canvas.drawText("Press CENTER to Complete Pairing", 242f, 238f, textPaint)
    }

    private fun drawWheelSearch(canvas: Canvas) {
        paint.color = theme.paneRightBg
        canvas.drawRect(0f, 28f, 480f, 92f, paint)

        textPaint.color = theme.textPrimary
        textPaint.typeface = Typeface.DEFAULT_BOLD
        textPaint.textSize = 13.5f
        canvas.drawText("QUERY: \"$searchQuery\"", 14f, 49f, textPaint)

        textPaint.textSize = 11f
        textPaint.color = theme.textSecondary
        canvas.drawText(
            if (searchMode == "keyboard") "WHEEL KEYBOARD (${searchResults.size} matches)" else "RESULTS (${searchResultIndex + 1}/${max(1, searchResults.size)})",
            210f, 49f, textPaint
        )

        val prevAlign = textPaint.textAlign
        textPaint.textAlign = Paint.Align.CENTER
        for (offset in -5..5) {
            val idx = (searchKeyIndex + offset + wheelTokens.size) % wheelTokens.size
            val rawTok = wheelTokens[idx]
            val tok = when (rawTok) {
                "SPACE" -> "SPC"
                "RESULTS" -> "GO"
                else -> rawTok
            }
            val cx = 240f + offset * 41f
            val isActive = (offset == 0 && searchMode == "keyboard")
            if (isActive) {
                paint.color = Color.parseColor("#1D6FE8")
                rect.set(cx - 19f, 60f, cx + 19f, 86f)
                canvas.drawRoundRect(rect, 4f, 4f, paint)
            }
            textPaint.color = if (isActive) Color.WHITE else theme.textPrimary
            textPaint.textSize = 11.5f
            canvas.drawText(tok, cx, 77f, textPaint)
        }
        textPaint.textAlign = prevAlign

        // Instruction bar between character wheel ribbon and results list
        if (searchMode == "results") {
            paint.color = Color.parseColor("#1D6FE8")
            canvas.drawRect(0f, 92f, 480f, 114f, paint)
            textPaint.color = Color.WHITE
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 10.5f
            canvas.drawText(
                "▼ NAVIGATING RESULTS • Center: Play • PLAY/MENU: Keyboard ▲",
                14f, 107f, textPaint
            )
        } else {
            paint.color = theme.divider
            canvas.drawRect(0f, 92f, 480f, 114f, paint)
            textPaint.color = theme.textPrimary
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 10.5f
            canvas.drawText(
                "Press PLAY/PAUSE (or >>|) to Jump to Results List ▼",
                14f, 107f, textPaint
            )
        }

        val visibleRows = 6
        val startIdx = if (searchMode == "results") {
            max(0, min(searchResultIndex - visibleRows / 2, max(0, searchResults.size - visibleRows)))
        } else {
            0
        }
        val endIdx = min(searchResults.size, startIdx + visibleRows)

        for (i in startIdx until endIdx) {
            val track = searchResults[i]
            val rowSlot = i - startIdx
            val rowTop = 116f + rowSlot * 40f
            val isFocused = (searchMode == "results" && i == searchResultIndex)

            if (isFocused) {
                paint.color = Color.parseColor("#1D6FE8")
                canvas.drawRect(0f, rowTop, 480f, rowTop + 39f, paint)
            }

            textPaint.color = if (isFocused) Color.WHITE else theme.textPrimary
            textPaint.typeface = Typeface.DEFAULT_BOLD
            textPaint.textSize = 13f
            canvas.drawText(
                ellipsize("${track.title} — ${track.artist}", 38),
                14f, rowTop + 24f, textPaint
            )

            val srcBadge = track.source.uppercase(Locale.ROOT)
            textPaint.textSize = 10f
            textPaint.color = if (isFocused) Color.WHITE else theme.textSecondary
            canvas.drawText("[$srcBadge]", 395f, rowTop + 24f, textPaint)
        }
    }

    private fun formatDuration(ms: Long): String {
        val totalSec = max(0L, ms / 1000L)
        val m = totalSec / 60L
        val s = totalSec % 60L
        return String.format(Locale.US, "%d:%02d", m, s)
    }

    private fun ellipsize(text: String, maxChars: Int): String {
        return if (text.length <= maxChars) text else text.substring(0, maxChars - 1) + "…"
    }
}
