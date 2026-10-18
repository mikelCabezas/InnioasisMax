import { DeviceEventEmitter, NativeModules } from 'react-native';
import { MusicSourceType } from '../../domain/models/music';

interface NativePlayOptions {
  source: MusicSourceType;
  uri: string;
  title?: string;
  artist?: string;
  album?: string;
  artworkUri?: string;
  accessToken?: string;
  musicUserToken?: string;
}

interface IY1AudioNativeModule {
  playTrack(options: NativePlayOptions): Promise<boolean>;
  pause(): Promise<boolean>;
  resume(): Promise<boolean>;
  seekTo(positionMs: number): Promise<boolean>;
  setVolume(percent: number): Promise<boolean>;
  setBrightness?(percent: number): Promise<boolean>;
  setWheelVibration?(mode: 'off' | 'soft' | 'medium' | 'strong'): Promise<boolean>;
  setWheelClickSound?(enabled: boolean): Promise<boolean>;
  setWifiEnabled?(enabled: boolean): Promise<boolean>;
  openWifiSettings?(): Promise<boolean>;
  connectWifiWithPassword?(ssid: string, password: string): Promise<boolean>;
  setBluetoothEnabled?(enabled: boolean): Promise<boolean>;
  setAutoKeypadLock1Min?(enabled: boolean): Promise<boolean>;
  shutdownDevice?(): Promise<boolean>;
  exitToStockOS?(): Promise<boolean>;
}

/**
 * Y1NativeAudioBridge: Envoltorio TypeScript seguro para `Y1AudioModule` (Kotlin).
 * - Si el binario nativo está montado en el Innioasis Y1, delega el control a `Y1PlaybackService.kt`
 *   (MediaPlayer/ExoPlayer + Librespot + control de volumen hardware `AudioManager.STREAM_MUSIC`).
 * - Si se ejecuta en un simulador/Web sin el módulo nativo compilado, hace fallback silencioso para no romper la UI.
 */
class Y1NativeAudioBridge {
  private get native(): IY1AudioNativeModule | undefined {
    return NativeModules.Y1AudioModule as IY1AudioNativeModule | undefined;
  }

  public async playLocalOrStream(options: NativePlayOptions): Promise<void> {
    try {
      await this.native?.playTrack(options);
    } catch {
      // Fallback silencioso en modo desarrollo sin servicio nativo adjunto
    }
  }

  public async pause(): Promise<void> {
    try {
      await this.native?.pause();
    } catch {}
  }

  public async resume(): Promise<void> {
    try {
      await this.native?.resume();
    } catch {}
  }

  public async seekTo(positionMs: number): Promise<void> {
    try {
      await this.native?.seekTo(positionMs);
    } catch {}
  }

  public async setVolume(percent: number): Promise<void> {
    try {
      await this.native?.setVolume(percent);
    } catch {}
  }

  public async setBrightness(percent: number): Promise<void> {
    try {
      await this.native?.setBrightness?.(percent);
    } catch {}
  }

  public async setWheelVibration(
    mode: 'off' | 'soft' | 'medium' | 'strong'
  ): Promise<void> {
    try {
      await this.native?.setWheelVibration?.(mode);
    } catch {}
  }

  public async setWheelClickSound(enabled: boolean): Promise<void> {
    try {
      await this.native?.setWheelClickSound?.(enabled);
    } catch {}
  }

  public async setWifiEnabled(enabled: boolean): Promise<void> {
    try {
      await this.native?.setWifiEnabled?.(enabled);
    } catch {}
  }

  public async openWifiSettings(): Promise<void> {
    try {
      await this.native?.openWifiSettings?.();
    } catch {}
  }

  public async connectWifiWithPassword(
    ssid: string,
    password: string
  ): Promise<void> {
    try {
      await this.native?.connectWifiWithPassword?.(ssid, password);
    } catch {}
  }

  public async setBluetoothEnabled(enabled: boolean): Promise<void> {
    try {
      await this.native?.setBluetoothEnabled?.(enabled);
    } catch {}
  }

  public async setAutoKeypadLock1Min(enabled: boolean): Promise<void> {
    try {
      await this.native?.setAutoKeypadLock1Min?.(enabled);
    } catch {}
  }

  public async shutdownDevice(): Promise<void> {
    try {
      await this.native?.shutdownDevice?.();
    } catch {}
  }

  public async exitToStockOS(): Promise<void> {
    try {
      await this.native?.exitToStockOS?.();
    } catch {}
  }

  public onProgress(
    callback: (event: {
      positionMs: number;
      durationMs: number;
      isPlaying: boolean;
    }) => void
  ): () => void {
    const sub = DeviceEventEmitter.addListener(
      'Y1NativePlaybackProgress',
      callback
    );
    return () => sub.remove();
  }

  public onTrackEnded(callback: () => void): () => void {
    const sub = DeviceEventEmitter.addListener(
      'Y1NativeTrackEnded',
      callback
    );
    return () => sub.remove();
  }
}

export const y1NativeAudio = new Y1NativeAudioBridge();
export const Y1AudioEngine = y1NativeAudio;
