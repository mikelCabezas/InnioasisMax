import { DeviceEventEmitter } from 'react-native';

/**
 * Constantes de temporización para el hardware Innioasis Y1 (ACCDET 3.5mm Headset Jack).
 */
export const CLICK_WINDOW_MS = 350; // Ventana de debounce tras ACTION_UP para esperar clics subsecuentes
export const HOLD_THRESHOLD_MS = 450; // Umbral de presión continua para detectar HOLD (ignorando repeatCount > 0)
export const VOLUME_REPEAT_INTERVAL_MS = 250; // Frecuencia de repetición del volumen mientras se mantenga pulsado

/**
 * KeyCodes estándar de Android para control de auriculares con botón único.
 */
export const KEYCODE_HEADSETHOOK = 79;
export const KEYCODE_MEDIA_PLAY_PAUSE = 85;
export const KEYCODE_MEDIA_PLAY = 126;
export const KEYCODE_MEDIA_PAUSE = 127;

export type HeadsetAction =
  | 'ACTION_DOWN'
  | 'ACTION_UP'
  | 'DOWN'
  | 'UP'
  | 0
  | 1;

export interface HeadsetKeyEvent {
  action: HeadsetAction;
  keyCode?: number;
  downTime?: number;
  eventTime?: number;
  repeatCount?: number;
  canceled?: boolean;
  isCanceled?: boolean;
  source?: 'foreground' | 'broadcast' | string;
}

export interface HeadsetGestureCallbacks {
  onTogglePlayPause: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onVolumeRaise: () => void;
  onVolumeLower: () => void;
}

export interface HeadsetGestureTimerProvider {
  setTimeout: (fn: () => void, ms: number) => any;
  clearTimeout: (id: any) => void;
  setInterval: (fn: () => void, ms: number) => any;
  clearInterval: (id: any) => void;
  now: () => number;
}

export interface HeadsetGestureControllerOptions {
  clickWindowMs?: number;
  holdThresholdMs?: number;
  volumeRepeatIntervalMs?: number;
  timerProvider?: HeadsetGestureTimerProvider;
}

const defaultTimerProvider: HeadsetGestureTimerProvider = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  now: () => Date.now(),
};

/**
 * Máquina de estados para auriculares de un solo botón (ACCDET 3.5mm) del Innioasis Y1.
 *
 * Tabla de Gestos:
 * - 1 Clic corto: onTogglePlayPause() tras CLICK_WINDOW_MS (350ms)
 * - 2 Clics cortos: onNextTrack() tras CLICK_WINDOW_MS (350ms)
 * - 3 Clics cortos: onPreviousTrack() tras CLICK_WINDOW_MS (350ms)
 * - Hold (0 clics previos + pulsación >= 450ms): bucle repitiendo onVolumeRaise() cada 250ms hasta ACTION_UP o cancel()
 * - 1 Clic + Hold (1 clic previo + 2ª pulsación >= 450ms): bucle repitiendo onVolumeLower() cada 250ms hasta ACTION_UP o cancel()
 *
 * Características:
 * - Deduplicación de eventos foreground + broadcast mediante tupla (downTime, action).
 * - Ignora auto-repeticiones del SO con repeatCount > 0 para no corromper la detección de hold.
 * - Terminación de seguridad inmediata ante ACTION_UP, evento canceled: true o dispose().
 */
export class HeadsetGestureController {
  private readonly callbacks: HeadsetGestureCallbacks;
  private readonly clickWindowMs: number;
  private readonly holdThresholdMs: number;
  private readonly volumeRepeatIntervalMs: number;
  private readonly timerProvider: HeadsetGestureTimerProvider;

  private clickCount = 0;
  private isKeyDown = false;
  private isHolding = false;
  private holdingAction: 'raise' | 'lower' | null = null;
  private isDisposed = false;

  private holdTimer: any = null;
  private clickTimer: any = null;
  private volumeRepeatTimer: any = null;

  private processedEventKeys = new Set<string>();
  private processedKeyHistory: { key: string; time: number }[] = [];
  private subscriptionRemoveFn: (() => void) | null = null;

  constructor(
    callbacks: HeadsetGestureCallbacks,
    options?: HeadsetGestureControllerOptions
  ) {
    this.callbacks = callbacks;
    this.clickWindowMs = options?.clickWindowMs ?? CLICK_WINDOW_MS;
    this.holdThresholdMs = options?.holdThresholdMs ?? HOLD_THRESHOLD_MS;
    this.volumeRepeatIntervalMs =
      options?.volumeRepeatIntervalMs ?? VOLUME_REPEAT_INTERVAL_MS;
    this.timerProvider = options?.timerProvider ?? defaultTimerProvider;
  }

  public get isHoldingActive(): boolean {
    return this.isHolding;
  }

  public get isButtonPressed(): boolean {
    return this.isKeyDown;
  }

  public get currentClickCount(): number {
    return this.clickCount;
  }

  public get isDisposedState(): boolean {
    return this.isDisposed;
  }

  /**
   * Conecta el controlador al bus de eventos nativos de React Native.
   */
  public attach(emitter?: {
    addListener: (event: string, fn: (evt: HeadsetKeyEvent) => void) => { remove: () => void };
  }): () => void {
    if (this.subscriptionRemoveFn) {
      this.subscriptionRemoveFn();
      this.subscriptionRemoveFn = null;
    }

    const targetEmitter = emitter ?? DeviceEventEmitter;
    const sub = targetEmitter.addListener('HeadsetKeyEvent', (evt: HeadsetKeyEvent) => {
      this.handleKeyEvent(evt);
    });

    this.subscriptionRemoveFn = () => {
      sub.remove();
      this.subscriptionRemoveFn = null;
    };

    return this.subscriptionRemoveFn;
  }

  /**
   * Procesa un evento de tecla de auriculares. Retorna true si fue procesado, o false si fue ignorado/deduplicado.
   */
  public handleKeyEvent(event: HeadsetKeyEvent): boolean {
    if (this.isDisposed) {
      return false;
    }

    // 1. Terminación de seguridad si el evento fue cancelado por el sistema operativo
    if (event.canceled === true || event.isCanceled === true) {
      this.cancel();
      return true;
    }

    // 2. Filtrado de KeyCodes si se especificaron
    if (
      event.keyCode !== undefined &&
      event.keyCode !== KEYCODE_HEADSETHOOK &&
      event.keyCode !== KEYCODE_MEDIA_PLAY_PAUSE &&
      event.keyCode !== KEYCODE_MEDIA_PLAY &&
      event.keyCode !== KEYCODE_MEDIA_PAUSE
    ) {
      return false;
    }

    // 3. Ignorar auto-repetición del sistema operativo (repeatCount > 0)
    if (event.repeatCount !== undefined && event.repeatCount > 0) {
      return false;
    }

    // 4. Normalizar acción
    const isDown =
      event.action === 'ACTION_DOWN' ||
      event.action === 'DOWN' ||
      event.action === 0;
    const isUp =
      event.action === 'ACTION_UP' ||
      event.action === 'UP' ||
      event.action === 1;

    if (!isDown && !isUp) {
      return false;
    }

    const normAction = isDown ? 'DOWN' : 'UP';

    // 5. Deduplicación de eventos concurrentes foreground + broadcast
    const timestampKey = event.downTime ?? event.eventTime;
    if (timestampKey !== undefined) {
      const dedupKey = `${timestampKey}_${normAction}`;
      if (this.checkAndRecordDuplicate(dedupKey)) {
        return false;
      }
    }

    // 6. Ejecución de la máquina de estados
    if (isDown) {
      return this.handleActionDown();
    } else {
      return this.handleActionUp();
    }
  }

  private handleActionDown(): boolean {
    // Si ya estaba abajo sin un UP intermedio, limpiar temporizador previo
    if (this.isKeyDown) {
      this.clearHoldTimer();
    }

    this.isKeyDown = true;

    // Si había una ventana de clic pendiente, cancelarla porque el usuario ha vuelto a pulsar
    // Conservamos this.clickCount para evaluar si se convierte en 1 Click + Hold o Double/Triple Click
    this.clearClickTimer();

    // Programar comprobación de HOLD
    this.holdTimer = this.timerProvider.setTimeout(() => {
      this.holdTimer = null;
      this.isHolding = true;

      if (this.clickCount === 0) {
        // Hold (0 clics previos + mantenido >= 450ms) -> Volume Raise
        this.holdingAction = 'raise';
        this.callbacks.onVolumeRaise();
        this.startVolumeRepeat(() => this.callbacks.onVolumeRaise());
      } else if (this.clickCount === 1) {
        // 1 Click + Hold (1 clic previo + 2ª pulsación mantenida >= 450ms) -> Volume Lower
        this.holdingAction = 'lower';
        this.callbacks.onVolumeLower();
        this.startVolumeRepeat(() => this.callbacks.onVolumeLower());
      } else {
        // Más de 1 clic previo antes de hold: sin acción definida en la tabla
        this.holdingAction = null;
      }

      // Consumir el conteo de clics ya que la acción se convirtió en Hold
      this.clickCount = 0;
    }, this.holdThresholdMs);

    return true;
  }

  private handleActionUp(): boolean {
    this.isKeyDown = false;
    this.clearHoldTimer();

    // Si estábamos en modo HOLD, terminar inmediatamente el bucle de volumen
    if (this.isHolding) {
      this.stopVolumeRepeat();
      this.isHolding = false;
      this.holdingAction = null;
      this.clickCount = 0;
      return true;
    }

    // Clic corto (liberado antes de HOLD_THRESHOLD_MS)
    this.clickCount++;

    // Iniciar temporizador de debounce tras ACTION_UP para esperar clics posteriores
    this.scheduleClickWindow();
    return true;
  }

  private scheduleClickWindow(): void {
    this.clearClickTimer();
    this.clickTimer = this.timerProvider.setTimeout(() => {
      const count = this.clickCount;
      this.clickCount = 0;
      this.clickTimer = null;

      if (count === 1) {
        this.callbacks.onTogglePlayPause();
      } else if (count === 2) {
        this.callbacks.onNextTrack();
      } else if (count >= 3) {
        this.callbacks.onPreviousTrack();
      }
    }, this.clickWindowMs);
  }

  private startVolumeRepeat(callback: () => void): void {
    this.stopVolumeRepeat();
    this.volumeRepeatTimer = this.timerProvider.setInterval(() => {
      callback();
    }, this.volumeRepeatIntervalMs);
  }

  private stopVolumeRepeat(): void {
    if (this.volumeRepeatTimer !== null) {
      this.timerProvider.clearInterval(this.volumeRepeatTimer);
      this.volumeRepeatTimer = null;
    }
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      this.timerProvider.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private clearClickTimer(): void {
    if (this.clickTimer !== null) {
      this.timerProvider.clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
  }

  private checkAndRecordDuplicate(key: string): boolean {
    const now = this.timerProvider.now();
    // Podar claves con más de 3000ms de antigüedad
    while (
      this.processedKeyHistory.length > 0 &&
      now - this.processedKeyHistory[0].time > 3000
    ) {
      const expired = this.processedKeyHistory.shift()!;
      this.processedEventKeys.delete(expired.key);
    }

    if (this.processedEventKeys.has(key)) {
      return true;
    }

    this.processedEventKeys.add(key);
    this.processedKeyHistory.push({ key, time: now });
    return false;
  }

  /**
   * Cancela cualquier temporizador o gesto en curso y reinicia la máquina de estados a reposo.
   */
  public cancel(): void {
    this.clearHoldTimer();
    this.clearClickTimer();
    this.stopVolumeRepeat();
    this.isHolding = false;
    this.isKeyDown = false;
    this.holdingAction = null;
    this.clickCount = 0;
  }

  /**
   * Destruye el controlador, desuscribiendo receptores y limpiando todos los temporizadores.
   */
  public dispose(): void {
    this.cancel();
    if (this.subscriptionRemoveFn) {
      this.subscriptionRemoveFn();
      this.subscriptionRemoveFn = null;
    }
    this.processedEventKeys.clear();
    this.processedKeyHistory = [];
    this.isDisposed = true;
  }
}
