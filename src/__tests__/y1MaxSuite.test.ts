import { AudioTagParser } from '../infrastructure/storage/AudioTagParser';
import { WHEEL_KEYBOARD_TOKENS } from '../presentation/components/Y1WheelSearch';
import { Y1_THEMES, Y1_METRICS } from '../presentation/theme/y1Theme';
import { SpotifyMusicProvider } from '../infrastructure/providers/SpotifyMusicProvider';
import { AppleMusicProvider } from '../infrastructure/providers/AppleMusicProvider';
import { useY1Store } from '../application/store/useY1Store';
import {
  HeadsetGestureController,
  CLICK_WINDOW_MS,
  HOLD_THRESHOLD_MS,
  VOLUME_REPEAT_INTERVAL_MS,
  KEYCODE_HEADSETHOOK,
  HeadsetGestureCallbacks,
  HeadsetGestureTimerProvider,
} from '../application/services/HeadsetGestureController';

/**
 * Suite de pruebas automatizadas de Y1 Max OS.
 * Verifica:
 * 1. Parser binario ID3v2.3 / ID3v2.4 (enteros synchsafe y frames TIT2, TPE1, TALB, TRCK, TYER).
 * 2. Parser binario FLAC (cabecera fLaC, bloque STREAMINFO 24-bit/96kHz y VORBIS_COMMENT little-endian).
 * 3. Inferencia heurística de rutas microSD (`/storage/sdcard1/Music/Artist/Album/01 - Track.flac`).
 * 4. Flujos de autenticación QR OAuth2 PKCE (Spotify) y MusicKit QR Pairing (Apple Music) + Catálogos y Búsqueda.
 * 5. Métricas de hardware 480x360 y paletas de temas LCD (`classic_color`, `y1_mono_grey`, `y1_backlit_blue`, `y1_dark`).
 * 6. Máquina de estados de la Click Wheel (`useY1Store`): arranque, navegación jerárquica, Cover Flow, Búsqueda Federada y ciclo de temas.
 * 7. Máquina de estados de auriculares ACCDET 3.5mm (HeadsetGestureController): clics simples, dobles, triples, volumen por hold, deduplicación y terminación.
 */

const utf8Encoder = new TextEncoder();

function encodeUtf8(str: string): number[] {
  return Array.from(utf8Encoder.encode(str));
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `[ASSERT FAIL] ${message} — esperado: ${JSON.stringify(
        expected
      )}, recibido: ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERT FAIL] ${message}`);
  }
}

function buildId3v23Frame(frameId: string, text: string): number[] {
  const textBytes = encodeUtf8(text);
  const payloadSize = 1 + textBytes.length; // 1 byte de encoding (3 = UTF-8) + texto
  const sizeBytes = [
    (payloadSize >>> 24) & 0xff,
    (payloadSize >>> 16) & 0xff,
    (payloadSize >>> 8) & 0xff,
    payloadSize & 0xff,
  ];
  return [
    frameId.charCodeAt(0),
    frameId.charCodeAt(1),
    frameId.charCodeAt(2),
    frameId.charCodeAt(3),
    ...sizeBytes,
    0x00,
    0x00, // flags
    0x03, // UTF-8 encoding byte
    ...textBytes,
  ];
}

function encodeSynchsafe32(value: number): [number, number, number, number] {
  return [
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f,
  ];
}

export async function runAllTests(): Promise<void> {
  let passed = 0;

  // =========================================================================
  // TEST 1: Parser Binario ID3v2.3 (.mp3)
  // =========================================================================
  {
    const frames = [
      ...buildId3v23Frame('TIT2', 'Instant Crush'),
      ...buildId3v23Frame('TPE1', 'Daft Punk'),
      ...buildId3v23Frame('TALB', 'Random Access Memories'),
      ...buildId3v23Frame('TRCK', '05/13'),
      ...buildId3v23Frame('TYER', '2013'),
      ...buildId3v23Frame('TLEN', '337000'),
    ];
    const header = [
      0x49,
      0x44,
      0x33, // "ID3"
      0x03,
      0x00, // v2.3.0
      0x00, // flags
      ...encodeSynchsafe32(frames.length),
    ];
    const mp3Buffer = new Uint8Array([...header, ...frames]);
    const parsed = AudioTagParser.parseHeaderBytes(mp3Buffer, 'mp3');

    assertEqual(parsed.title, 'Instant Crush', 'ID3v2 TIT2 debe extraer el título');
    assertEqual(parsed.artist, 'Daft Punk', 'ID3v2 TPE1 debe extraer el artista');
    assertEqual(
      parsed.album,
      'Random Access Memories',
      'ID3v2 TALB debe extraer el álbum'
    );
    assertEqual(parsed.trackNumber, 5, 'ID3v2 TRCK debe extraer el número de pista');
    assertEqual(parsed.year, 2013, 'ID3v2 TYER debe extraer el año');
    assertEqual(parsed.durationMs, 337000, 'ID3v2 TLEN debe extraer duración en ms');
    assertEqual(parsed.codecLabel, 'MP3 320kbps', 'ID3v2 debe etiquetar codec MP3');
    console.log('  ✓ [1/6] AudioTagParser: Cabecera binaria ID3v2.3 (.mp3) verificada');
    passed++;
  }

  // =========================================================================
  // TEST 2: Parser Binario FLAC (STREAMINFO + VORBIS_COMMENT)
  // =========================================================================
  {
    const streamInfo = new Uint8Array(34);
    streamInfo[10] = 0x17;
    streamInfo[11] = 0x70;
    streamInfo[12] = 0x01;
    streamInfo[13] = 0x70;
    streamInfo[14] = 0x00;
    streamInfo[15] = 0x0e;
    streamInfo[16] = 0xa6;
    streamInfo[17] = 0x00;

    const vendor = encodeUtf8('reference libFLAC 1.4');
    const comments = [
      'TITLE=Everything In Its Right Place',
      'ARTIST=Radiohead',
      'ALBUM=Kid A',
      'TRACKNUMBER=1',
      'DATE=2000-10-02',
    ].map((c) => encodeUtf8(c));

    const writeU32LE = (n: number): number[] => [
      n & 0xff,
      (n >>> 8) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 24) & 0xff,
    ];

    const vorbisBytes: number[] = [
      ...writeU32LE(vendor.length),
      ...vendor,
      ...writeU32LE(comments.length),
    ];
    for (const c of comments) {
      vorbisBytes.push(...writeU32LE(c.length), ...c);
    }

    const flacBytes = new Uint8Array([
      0x66,
      0x4c,
      0x61,
      0x43, // "fLaC"
      0x00,
      0x00,
      0x00,
      34,
      ...Array.from(streamInfo),
      0x84,
      (vorbisBytes.length >>> 16) & 0xff,
      (vorbisBytes.length >>> 8) & 0xff,
      vorbisBytes.length & 0xff,
      ...vorbisBytes,
    ]);

    const parsedFlac = AudioTagParser.parseHeaderBytes(flacBytes, 'flac');
    assertEqual(
      parsedFlac.title,
      'Everything In Its Right Place',
      'FLAC Vorbis debe extraer TITLE'
    );
    assertEqual(parsedFlac.artist, 'Radiohead', 'FLAC Vorbis debe extraer ARTIST');
    assertEqual(parsedFlac.album, 'Kid A', 'FLAC Vorbis debe extraer ALBUM');
    assertEqual(parsedFlac.trackNumber, 1, 'FLAC Vorbis debe extraer TRACKNUMBER');
    assertEqual(parsedFlac.year, 2000, 'FLAC Vorbis debe extraer DATE/YEAR');
    assertEqual(
      parsedFlac.codecLabel,
      'FLAC 24-bit/96kHz',
      'FLAC STREAMINFO debe calcular bits y kHz exactos'
    );
    assertEqual(
      parsedFlac.durationMs,
      10000,
      'FLAC STREAMINFO debe calcular duración exacta desde totalSamples/sampleRate'
    );
    console.log('  ✓ [2/6] AudioTagParser: Cabecera binaria FLAC (STREAMINFO + VORBIS_COMMENT) verificada');
    passed++;
  }

  // =========================================================================
  // TEST 3: Fallback Heurístico de Rutas en Tarjeta microSD
  // =========================================================================
  {
    const inferred = AudioTagParser.inferFromFilePath(
      'file:///storage/sdcard1/Music/Aphex%20Twin/Selected%20Ambient%20Works/03%20-%20Pulsewidth.flac'
    );
    assertEqual(inferred.artist, 'Aphex Twin', 'Debe inferir artista desde carpeta padre');
    assertEqual(
      inferred.album,
      'Selected Ambient Works',
      'Debe inferir álbum desde subcarpeta'
    );
    assertEqual(inferred.trackNumber, 3, 'Debe inferir número de pista desde prefijo');
    assertEqual(inferred.title, 'Pulsewidth', 'Debe limpiar prefijo y extensión del título');
    console.log('  ✓ [3/6] AudioTagParser: Inferencia heurística de rutas microSD verificada');
    passed++;
  }

  // =========================================================================
  // TEST 4: Proveedores Spotify & Apple Music (QR Auth + Catálogo + Búsqueda)
  // =========================================================================
  {
    const spotify = new SpotifyMusicProvider();
    await spotify.initialize();
    const initialAuth = await spotify.isAuthenticated();
    assertEqual(initialAuth, false, 'Spotify inicia sin autenticar hasta escanear QR');

    const qrSession = await spotify.startQRAuthSession();
    assertTrue(
      qrSession.verificationUriComplete.includes('accounts.spotify.com/authorize'),
      'Spotify QR debe generar URL OAuth2 PKCE válida'
    );

    spotify.simulateQRScanSuccess();
    assertEqual(
      await spotify.isAuthenticated(),
      true,
      'Spotify debe marcarse autenticado tras emparejamiento QR'
    );

    const spSearch = await spotify.search('daft');
    assertTrue(spSearch.tracks.length > 0, 'Búsqueda en Spotify debe retornar pistas');

    const apple = new AppleMusicProvider();
    await apple.initialize();
    const appleQr = await apple.startQRAuthSession();
    assertTrue(
      appleQr.verificationUriComplete.includes('code=Y1AM-4820'),
      'Apple Music QR debe incluir código de emparejamiento MusicKit'
    );
    apple.simulateQRScanSuccess();
    assertEqual(
      await apple.isAuthenticated(),
      true,
      'Apple Music debe autenticarse tras simulación QR'
    );
    const amSearch = await apple.search('giorgio');
    assertTrue(amSearch.tracks.length > 0, 'Búsqueda en Apple Music debe retornar pistas');
    console.log('  ✓ [4/6] Proveedores Spotify & Apple Music: OAuth2 PKCE / MusicKit QR y catálogos verificados');
    passed++;
  }

  // =========================================================================
  // TEST 5: Métricas de Hardware 480x360, Teclado por Rueda y 4 Temas LCD
  // =========================================================================
  {
    assertEqual(Y1_METRICS.screenWidth, 480, 'Ancho nativo del Innioasis Y1 es 480px');
    assertEqual(Y1_METRICS.screenHeight, 360, 'Alto nativo del Innioasis Y1 es 360px');
    assertTrue(
      WHEEL_KEYBOARD_TOKENS.includes('SPACE') &&
        WHEEL_KEYBOARD_TOKENS.includes('DEL') &&
        WHEEL_KEYBOARD_TOKENS.includes('RESULTS'),
      'Teclado rotatorio por rueda incluye tokens de control'
    );
    assertTrue(
      Boolean(Y1_THEMES.classic_color) &&
        Boolean(Y1_THEMES.y1_mono_grey) &&
        Boolean(Y1_THEMES.y1_backlit_blue) &&
        Boolean(Y1_THEMES.y1_dark),
      'Los 4 temas de pantalla LCD están definidos'
    );
    console.log('  ✓ [5/6] Sistema de Diseño Y1 Max OS: Métricas 480x360 y 4 paletas LCD verificadas');
    passed++;
  }

  // =========================================================================
  // TEST 6: Máquina de Estados de Navegación por Click Wheel (useY1Store)
  // =========================================================================
  {
    const store = useY1Store.getState();
    await store.bootSystem();

    let state = useY1Store.getState();
    assertEqual(state.stack.length, 1, 'El stack raíz debe tener 1 nivel tras bootSystem');
    assertEqual(state.stack[0].focusedIndex, 0, 'Foco inicial en ítem 0 (Music)');
    assertEqual(
      state.stack[0].items[0].label,
      'Music',
      'El primer ítem del menú raíz debe llamarse "Music"'
    );
    assertEqual(
      state.stack[0].items.some((item) => item.label === 'Exit to Stock Y1 OS'),
      false,
      '"Exit to Stock Y1 OS" no debe estar en el menú raíz'
    );

    // Verificar valores por defecto de los nuevos estados de hardware y configuración
    assertEqual(state.wifiEnabled, true, 'wifiEnabled inicia en true');
    assertEqual(state.bluetoothEnabled, true, 'bluetoothEnabled inicia en true');
    assertEqual(state.brightnessLevel, 80, 'brightnessLevel inicia en 80');
    assertEqual(state.wheelVibration, 'soft', 'wheelVibration inicia en soft');
    assertEqual(state.wheelClickSound, false, 'wheelClickSound inicia en false (desactivado por defecto)');
    assertEqual(state.isKeypadLocked, false, 'isKeypadLocked inicia en false');
    assertEqual(state.autoKeypadLock1Min, true, 'autoKeypadLock1Min inicia en true');
    assertEqual(state.autoLockSeconds, 60, 'autoLockSeconds inicia en 60');

    // Giro horario de la rueda (WHEEL_CW -> +1)
    state.wheelStep(1);
    state = useY1Store.getState();
    assertEqual(state.stack[0].focusedIndex, 1, 'Giro CW debe mover foco al ítem 1 (Spotify)');

    // Abrir Spotify sin sesión -> debe abrir modal QR Auth
    await state.pressCenter();
    state = useY1Store.getState();
    assertEqual(
      state.stack[state.stack.length - 1].screenType,
      'qr_auth',
      'Seleccionar Spotify sin token debe abrir pantalla QR Auth'
    );

    // Simular escaneo QR con botón central -> debe abrir el hub de Spotify
    await state.pressCenter();
    state = useY1Store.getState();
    assertEqual(
      state.stack[state.stack.length - 1].id,
      'provider:hub:spotify',
      'Completar QR Auth debe entrar directamente al menú de Spotify'
    );

    // Volver al menú raíz con botón MENU
    state.pressMenuBack();
    state = useY1Store.getState();
    assertEqual(state.stack.length, 1, 'Botón MENU debe regresar a la raíz');

    // Probar búsqueda federada (Local + Spotify + Apple Music) y conmutación con PLAY_PAUSE
    await state.openWheelSearch();
    state = useY1Store.getState();
    assertEqual(
      state.stack[state.stack.length - 1].screenType,
      'wheel_search',
      'Debe abrir pantalla Y1WheelSearch'
    );
    assertEqual(
      state.searchMode,
      'keyboard',
      'Y1WheelSearch inicia en modo keyboard'
    );
    assertTrue(
      state.searchResults.length >= 2,
      'Búsqueda federada por defecto ("DAFT") debe combinar resultados locales y de streaming'
    );

    // Pulsar PLAY_PAUSE en wheel_search debe alternar entre 'keyboard' y 'results'
    await state.pressPlayPause();
    state = useY1Store.getState();
    assertEqual(
      state.searchMode,
      'results',
      'Pulsar PLAY_PAUSE en wheel_search conmuta de keyboard a results'
    );
    await state.pressPlayPause();
    state = useY1Store.getState();
    assertEqual(
      state.searchMode,
      'keyboard',
      'Pulsar PLAY_PAUSE nuevamente en wheel_search regresa a keyboard'
    );

    // Ciclar controles de hardware y temas LCD
    const initialTheme = state.themeMode;
    state.cycleTheme();
    assertTrue(
      useY1Store.getState().themeMode !== initialTheme,
      'cycleTheme debe alternar entre las paletas LCD del Innioasis Y1'
    );
    state.cycleBrightness();
    assertEqual(
      useY1Store.getState().brightnessLevel,
      100,
      'cycleBrightness avanza de 80 a 100'
    );
    state.cycleBrightness();
    assertEqual(
      useY1Store.getState().brightnessLevel,
      20,
      'cycleBrightness cicla de 100 a 20'
    );
    state.cycleWheelVibration();
    assertEqual(
      useY1Store.getState().wheelVibration,
      'medium',
      'cycleWheelVibration avanza de soft a medium'
    );
    state.toggleWheelClickSound();
    assertEqual(
      useY1Store.getState().wheelClickSound,
      true,
      'toggleWheelClickSound activa el sonido de clic'
    );
    state.toggleWheelClickSound();
    assertEqual(
      useY1Store.getState().wheelClickSound,
      false,
      'toggleWheelClickSound desactiva el sonido de clic'
    );
    state.toggleAutoKeypadLock1Min();
    assertEqual(
      useY1Store.getState().autoKeypadLock1Min,
      false,
      'toggleAutoKeypadLock1Min desactiva bloqueo automático a 1 min'
    );
    state.toggleAutoKeypadLock1Min();
    assertEqual(
      useY1Store.getState().autoKeypadLock1Min,
      true,
      'toggleAutoKeypadLock1Min reactiva bloqueo automático a 1 min'
    );
    state.cycleAutoLockTimeout();
    assertEqual(
      useY1Store.getState().autoLockSeconds,
      120,
      'cycleAutoLockTimeout avanza de 60s a 120s'
    );

    // Probar conexión Wi-Fi in-app con contraseña y opciones de Settings
    state.connectWifiWithPassword('Innioasis_5G', 'secret1234');
    assertEqual(
      useY1Store.getState().connectedWifiSsid,
      'Innioasis_5G',
      'connectWifiWithPassword registra el SSID conectado'
    );

    // Probar modo Scrub/Seek en Now Playing al pulsar botón central
    state.openNowPlaying();
    state = useY1Store.getState();
    assertEqual(
      state.nowPlayingWheelMode,
      'volume',
      'Now Playing inicia en modo volumen por defecto'
    );
    await state.pressCenter();
    state = useY1Store.getState();
    assertEqual(
      state.nowPlayingWheelMode,
      'scrub',
      'Pulsar Center en Now Playing activa el modo scrub/seek'
    );
    const posBeforeScrub = state.playback.positionMs;
    state.wheelStep(1);
    state = useY1Store.getState();
    assertEqual(
      state.playback.positionMs,
      posBeforeScrub + 5000,
      'Girar rueda en modo scrub adelanta 5000ms'
    );
    state.pressMenuBack();
    state = useY1Store.getState();
    assertEqual(
      state.nowPlayingWheelMode,
      'volume',
      'Pulsar MENU en modo scrub regresa a modo volumen sin salir de Now Playing'
    );

    await state.powerOffDevice();
    assertEqual(
      useY1Store.getState().isPoweredOff,
      true,
      'powerOffDevice activa el estado de apagado de hardware'
    );

    console.log('  ✓ [6/6] Máquina de Estados Click Wheel (useY1Store): Navegación, QR, Scrub/Seek, Búsqueda Federada y Ajustes Hardware verificados');
    passed++;
  }

  // =========================================================================
  // TEST 7: Máquina de Estados Headset ACCDET (HeadsetGestureController)
  // =========================================================================
  {
    class FakeHeadsetClock implements HeadsetGestureTimerProvider {
      private currentTime = 1000;
      private timerId = 0;
      private timers = new Map<
        number,
        { fn: () => void; time: number; interval?: number }
      >();

      public now(): number {
        return this.currentTime;
      }

      public setTimeout(fn: () => void, ms: number): number {
        const id = ++this.timerId;
        this.timers.set(id, { fn, time: this.currentTime + ms });
        return id;
      }

      public clearTimeout(id: number): void {
        this.timers.delete(id);
      }

      public setInterval(fn: () => void, ms: number): number {
        const id = ++this.timerId;
        this.timers.set(id, { fn, time: this.currentTime + ms, interval: ms });
        return id;
      }

      public clearInterval(id: number): void {
        this.timers.delete(id);
      }

      public advanceBy(ms: number): void {
        const targetTime = this.currentTime + ms;
        while (true) {
          let nextTimerId: number | null = null;
          let earliestTime = targetTime + 1;

          for (const [id, entry] of this.timers.entries()) {
            if (entry.time <= targetTime && entry.time < earliestTime) {
              earliestTime = entry.time;
              nextTimerId = id;
            }
          }

          if (nextTimerId === null) {
            break;
          }

          const timer = this.timers.get(nextTimerId)!;
          this.currentTime = timer.time;
          if (timer.interval !== undefined) {
            timer.time += timer.interval;
          } else {
            this.timers.delete(nextTimerId);
          }
          timer.fn();
        }
        this.currentTime = targetTime;
      }
    }

    const clock = new FakeHeadsetClock();

    let playPauseCalls = 0;
    let nextTrackCalls = 0;
    let prevTrackCalls = 0;
    let volRaiseCalls = 0;
    let volLowerCalls = 0;

    const resetSpies = () => {
      playPauseCalls = 0;
      nextTrackCalls = 0;
      prevTrackCalls = 0;
      volRaiseCalls = 0;
      volLowerCalls = 0;
    };

    const callbacks: HeadsetGestureCallbacks = {
      onTogglePlayPause: () => {
        playPauseCalls++;
      },
      onNextTrack: () => {
        nextTrackCalls++;
      },
      onPreviousTrack: () => {
        prevTrackCalls++;
      },
      onVolumeRaise: () => {
        volRaiseCalls++;
      },
      onVolumeLower: () => {
        volLowerCalls++;
      },
    };

    const controller = new HeadsetGestureController(callbacks, {
      timerProvider: clock,
    });

    // --- Sub-test 1: Single short click -> Play/Pause tras 350ms ---
    resetSpies();
    controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      keyCode: KEYCODE_HEADSETHOOK,
      downTime: clock.now(),
    });
    clock.advanceBy(50); // Mantenido 50ms (< 450ms)
    controller.handleKeyEvent({
      action: 'ACTION_UP',
      keyCode: KEYCODE_HEADSETHOOK,
      downTime: clock.now() - 50,
    });

    assertEqual(
      playPauseCalls,
      0,
      'Single short click no debe disparar antes de la ventana debounce de 350ms'
    );
    clock.advanceBy(CLICK_WINDOW_MS - 1);
    assertEqual(
      playPauseCalls,
      0,
      'Single short click no debe disparar a 349ms'
    );
    clock.advanceBy(1);
    assertEqual(
      playPauseCalls,
      1,
      'Single short click debe disparar onTogglePlayPause exactamente tras 350ms'
    );
    assertEqual(nextTrackCalls, 0, 'No debe disparar onNextTrack en click simple');
    assertEqual(prevTrackCalls, 0, 'No debe disparar onPreviousTrack en click simple');

    // --- Sub-test 2: Double short click -> Next Track ---
    resetSpies();
    // Primer clic
    controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      downTime: clock.now(),
    });
    clock.advanceBy(40);
    controller.handleKeyEvent({
      action: 'ACTION_UP',
      downTime: clock.now() - 40,
    });
    clock.advanceBy(100); // 100ms después (< 350ms) llega el 2do clic
    // Segundo clic
    controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      downTime: clock.now(),
    });
    clock.advanceBy(40);
    controller.handleKeyEvent({
      action: 'ACTION_UP',
      downTime: clock.now() - 40,
    });

    assertEqual(
      nextTrackCalls,
      0,
      'Double click no debe disparar antes de que expire la ventana debounce'
    );
    clock.advanceBy(CLICK_WINDOW_MS);
    assertEqual(
      nextTrackCalls,
      1,
      'Double click debe disparar onNextTrack al completar la ventana debounce'
    );
    assertEqual(playPauseCalls, 0, 'No debe disparar onTogglePlayPause en doble clic');
    assertEqual(prevTrackCalls, 0, 'No debe disparar onPreviousTrack en doble clic');

    // --- Sub-test 3: Triple short click -> Previous Track ---
    resetSpies();
    // Clic 1
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });
    clock.advanceBy(40);
    controller.handleKeyEvent({ action: 'ACTION_UP', downTime: clock.now() - 40 });
    clock.advanceBy(60);
    // Clic 2
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });
    clock.advanceBy(40);
    controller.handleKeyEvent({ action: 'ACTION_UP', downTime: clock.now() - 40 });
    clock.advanceBy(60);
    // Clic 3
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });
    clock.advanceBy(40);
    controller.handleKeyEvent({ action: 'ACTION_UP', downTime: clock.now() - 40 });

    assertEqual(prevTrackCalls, 0, 'Triple click no debe disparar antes de la ventana');
    clock.advanceBy(CLICK_WINDOW_MS);
    assertEqual(prevTrackCalls, 1, 'Triple click debe disparar onPreviousTrack tras 350ms');
    assertEqual(playPauseCalls, 0, 'No debe disparar PlayPause en triple click');
    assertEqual(nextTrackCalls, 0, 'No debe disparar NextTrack en triple click');

    // --- Sub-test 4: Hold (0 clics previos, mantenido >= 450ms) -> Volume Raise repitiendo cada 250ms ---
    resetSpies();
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });
    clock.advanceBy(HOLD_THRESHOLD_MS - 1); // 449ms
    assertEqual(volRaiseCalls, 0, 'Hold no debe disparar antes de alcanzar 450ms');
    assertEqual(controller.isHoldingActive, false, 'No debe marcar isHoldingActive antes de 450ms');

    clock.advanceBy(1); // 450ms exactos
    assertEqual(volRaiseCalls, 1, 'Hold (0 clics) debe disparar onVolumeRaise inmediatamente a los 450ms');
    assertEqual(controller.isHoldingActive, true, 'isHoldingActive debe ser true tras alcanzar umbral');

    clock.advanceBy(VOLUME_REPEAT_INTERVAL_MS - 1); // +249ms
    assertEqual(volRaiseCalls, 1, 'No debe emitir segundo tick antes de los 250ms de repetición');

    clock.advanceBy(1); // +250ms (tick 2)
    assertEqual(volRaiseCalls, 2, 'Debe emitir tick 2 tras 250ms de repetición');

    clock.advanceBy(VOLUME_REPEAT_INTERVAL_MS); // tick 3
    assertEqual(volRaiseCalls, 3, 'Debe emitir tick 3 tras otros 250ms');

    // Soltar botón (ACTION_UP) -> debe detener inmediatamente el bucle
    controller.handleKeyEvent({ action: 'ACTION_UP', downTime: clock.now() });
    assertEqual(controller.isHoldingActive, false, 'ACTION_UP debe desactivar isHoldingActive inmediatamente');

    clock.advanceBy(1000);
    assertEqual(volRaiseCalls, 3, 'No deben emitirse más ticks de volumen tras ACTION_UP');
    assertEqual(playPauseCalls, 0, 'ACTION_UP tras HOLD no debe disparar onTogglePlayPause');

    // --- Sub-test 5: 1 Click + Hold (2ª pulsación mantenida >= 450ms) -> Volume Lower repitiendo cada 250ms ---
    resetSpies();
    // 1er Clic corto
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });
    clock.advanceBy(50);
    controller.handleKeyEvent({ action: 'ACTION_UP', downTime: clock.now() - 50 });
    assertEqual(controller.currentClickCount, 1, 'Conteo de clics debe ser 1 tras el primer clic corto');

    // 2ª pulsación dentro de la ventana de debounce (100ms tras UP)
    clock.advanceBy(100);
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });

    clock.advanceBy(HOLD_THRESHOLD_MS - 1);
    assertEqual(volLowerCalls, 0, '1 Click + Hold no debe disparar antes de 450ms');
    assertEqual(playPauseCalls, 0, '1er clic no debe haber disparado PlayPause');

    clock.advanceBy(1); // 450ms de la 2ª pulsación
    assertEqual(volLowerCalls, 1, '1 Click + Hold debe disparar onVolumeLower a los 450ms de la 2ª pulsación');
    assertEqual(controller.isHoldingActive, true, 'isHoldingActive debe ser true en 1 Click + Hold');

    clock.advanceBy(VOLUME_REPEAT_INTERVAL_MS);
    assertEqual(volLowerCalls, 2, '1 Click + Hold debe emitir tick 2 tras 250ms');
    clock.advanceBy(VOLUME_REPEAT_INTERVAL_MS);
    assertEqual(volLowerCalls, 3, '1 Click + Hold debe emitir tick 3 tras otros 250ms');

    // Soltar botón -> detener inmediatamente
    controller.handleKeyEvent({ action: 'ACTION_UP', downTime: clock.now() });
    assertEqual(controller.isHoldingActive, false, 'ACTION_UP desactiva isHoldingActive');
    clock.advanceBy(1000);
    assertEqual(volLowerCalls, 3, 'No deben emitirse más ticks tras ACTION_UP');
    assertEqual(playPauseCalls, 0, 'No debe disparar PlayPause');
    assertEqual(nextTrackCalls, 0, 'No debe disparar NextTrack');

    // --- Sub-test 6: Deduplicación (foreground + broadcast) e ignorar repeatCount > 0 ---
    resetSpies();
    const eventTimeDown = clock.now();
    // 1. Evento foreground DOWN
    const handledFgDown = controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      downTime: eventTimeDown,
      repeatCount: 0,
      source: 'foreground',
    });
    assertEqual(handledFgDown, true, 'Evento foreground DOWN original debe ser procesado');

    // 2. Evento broadcast idéntico (misma tupla downTime + ACTION_DOWN)
    const handledBcDown = controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      downTime: eventTimeDown,
      repeatCount: 0,
      source: 'broadcast',
    });
    assertEqual(handledBcDown, false, 'Evento broadcast DOWN duplicado debe ser deduplicado/ignorado');

    // 3. Auto-repetición del SO Android (repeatCount > 0)
    const handledRepeat1 = controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      downTime: eventTimeDown,
      repeatCount: 1,
    });
    const handledRepeat2 = controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      downTime: eventTimeDown,
      repeatCount: 2,
    });
    assertEqual(handledRepeat1, false, 'repeatCount=1 debe ser ignorado');
    assertEqual(handledRepeat2, false, 'repeatCount=2 debe ser ignorado');

    clock.advanceBy(50);
    // 4. Evento foreground UP
    const handledFgUp = controller.handleKeyEvent({
      action: 'ACTION_UP',
      downTime: eventTimeDown,
      repeatCount: 0,
      source: 'foreground',
    });
    assertEqual(handledFgUp, true, 'Evento foreground UP debe ser procesado');

    // 5. Evento broadcast UP idéntico
    const handledBcUp = controller.handleKeyEvent({
      action: 'ACTION_UP',
      downTime: eventTimeDown,
      repeatCount: 0,
      source: 'broadcast',
    });
    assertEqual(handledBcUp, false, 'Evento broadcast UP duplicado debe ser deduplicado/ignorado');

    // Avanzar debounce: debe registrar solo UN clic corto (Play/Pause)
    clock.advanceBy(CLICK_WINDOW_MS);
    assertEqual(playPauseCalls, 1, 'Tras deduplicar, sólo 1 PlayPause debe dispararse');
    assertEqual(nextTrackCalls, 0, 'Deduplicación evita interpretar broadcast como 2º clic');

    // --- Sub-test 7: Terminación de seguridad (cancel, canceled: true, dispose) ---
    resetSpies();
    // A. cancel() detiene hold en curso
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });
    clock.advanceBy(HOLD_THRESHOLD_MS);
    assertEqual(volRaiseCalls, 1, 'Hold iniciado');
    controller.cancel();
    assertEqual(controller.isHoldingActive, false, 'cancel() desactiva isHoldingActive');
    clock.advanceBy(VOLUME_REPEAT_INTERVAL_MS * 2);
    assertEqual(volRaiseCalls, 1, 'cancel() detiene el bucle de volumen inmediatamente');

    // B. canceled: true cancela gesto en curso
    controller.handleKeyEvent({ action: 'ACTION_DOWN', downTime: clock.now() });
    clock.advanceBy(100);
    const cancelHandled = controller.handleKeyEvent({
      action: 'ACTION_UP',
      canceled: true,
      downTime: clock.now(),
    });
    assertEqual(cancelHandled, true, 'Evento con canceled: true debe ser manejado');
    clock.advanceBy(CLICK_WINDOW_MS * 2);
    assertEqual(playPauseCalls, 0, 'Evento cancelado no debe disparar clics acumulados');

    // C. dispose() destruye el controlador
    controller.dispose();
    assertEqual(controller.isDisposedState, true, 'dispose() marca isDisposedState');
    const handledAfterDispose = controller.handleKeyEvent({
      action: 'ACTION_DOWN',
      downTime: clock.now(),
    });
    assertEqual(handledAfterDispose, false, 'Eventos tras dispose() son rechazados');

    console.log(
      '  ✓ [7/7] HeadsetGestureController: Clics (1x/2x/3x), Hold Raise/Lower 250ms, deduplicación y terminación de seguridad verificados'
    );
    passed++;
  }

  console.log(`\n✅ [Y1 Max OS Test Suite] ${passed}/7 suites completadas con 0 errores.`);
}

void runAllTests();
