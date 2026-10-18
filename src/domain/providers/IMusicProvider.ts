import {
  Album,
  Artist,
  MusicSourceType,
  PlaybackState,
  Playlist,
  RepeatMode,
  SearchResults,
  Track,
} from '../models/music';

/**
 * Estado del flujo de autenticación sin teclado mediante Código QR en la pantalla del Innioasis Y1.
 * Cubre tanto OAuth 2.0 Device Authorization / PKCE Bridge (Spotify) como MusicKit Web Pairing Bridge (Apple Music).
 */
export type QRAuthStatus =
  | 'idle'
  | 'generating_qr'
  | 'awaiting_user_scan'
  | 'authorized'
  | 'expired'
  | 'error';

export interface QRAuthSession {
  provider: MusicSourceType;
  /** URL completa codificada dentro del QR para abrir directamente en el smartphone del usuario */
  verificationUriComplete: string;
  /** URL corta legible por si el usuario prefiere escribirla */
  verificationUri: string;
  /** Código de emparejamiento corto (ej. "Y1MX-8492") */
  userCode: string;
  /** Código interno de dispositivo o sesión para hacer polling */
  deviceCode: string;
  expiresInSeconds: number;
  pollIntervalSeconds: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Para Apple Music: Developer JWT + Music-User-Token */
  musicUserToken?: string;
  storefront?: string;
  expiresAtMs: number;
}

export type PlaybackEventListener = (state: PlaybackState) => void;

/**
 * Contrato común (Adapter Pattern) que deben implementar todos los motores musicales de Y1 Max OS:
 * 1. LocalProvider (SQLite + ID3v2/FLAC Scanner + Media3/ExoPlayer Local)
 * 2. SpotifyProvider (Spotify Web API + PKCE/Device QR Auth + Librespot Native Daemon / Connect API)
 * 3. AppleMusicProvider (Apple Music API + MusicKit QR Bridge + Media3 Widevine L3 / HLS Streamer)
 */
export interface IMusicProvider {
  readonly source: MusicSourceType;
  readonly displayName: string;
  readonly requiresAuth: boolean;

  // --- Ciclo de Vida y Autenticación Sin Teclado (QR Flow) ---
  initialize(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  /**
   * Inicia una sesión de emparejamiento sin teclado y devuelve los datos para renderizar el QR en el Y1.
   */
  startQRAuthSession(): Promise<QRAuthSession>;
  /**
   * Consulta el estado de la sesión QR (polling contra el servicio OAuth / relay local) hasta obtener tokens.
   */
  pollQRAuthStatus(deviceCode: string): Promise<{
    status: QRAuthStatus;
    tokens?: AuthTokens;
    errorMessage?: string;
  }>;
  logout(): Promise<void>;

  // --- Catálogo Unificado (Renderizado en las listas nativas de Y1 Max OS) ---
  getPlaylists(limit?: number, offset?: number): Promise<Playlist[]>;
  getPlaylistTracks(playlistId: string): Promise<Track[]>;
  getAlbums(limit?: number, offset?: number): Promise<Album[]>;
  getAlbumTracks(albumId: string): Promise<Track[]>;
  getArtists(limit?: number, offset?: number): Promise<Artist[]>;
  getArtistAlbums(artistId: string): Promise<Album[]>;
  getLikedTracks(limit?: number, offset?: number): Promise<Track[]>;
  search(query: string, limit?: number): Promise<SearchResults>;

  // --- Control de Reproducción y Eventos hacia "Now Playing" ---
  playTrack(track: Track, queue?: Track[]): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlayPause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;
  setVolume(volumePercent: number): Promise<void>;
  getPlaybackState(): Promise<PlaybackState>;
  subscribePlaybackState(listener: PlaybackEventListener): () => void;
}
