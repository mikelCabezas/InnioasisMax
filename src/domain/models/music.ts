/**
 * Dominio de Modelos Unificados de Audio para Y1 Max OS (Innioasis Y1).
 * Garantiza que la UI clásica del Y1 sea 100% agnóstica de si la pista
 * proviene de la tarjeta microSD (SQLite/ID3), Spotify API o Apple Music (MusicKit).
 */

export type MusicSourceType = 'local' | 'spotify' | 'apple_music';

export interface Track {
  /** ID único prefijado por fuente, ej: "local:1042", "spotify:track:4uLU6hMCjMI75M1A2tKUQC", "apple:i.12345" */
  id: string;
  source: MusicSourceType;
  uri: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  /** URL remota (HTTPS) o ruta cacheada local (file:///...) de la carátula */
  artworkUri?: string;
  /** Duración en milisegundos */
  durationMs: number;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  /** Metadatos de calidad para mostrar en Now Playing (ej. "FLAC 24/96", "Spotify Ogg 320k", "AAC 256k") */
  codecLabel?: string;
  isLiked?: boolean;
}

export interface Album {
  id: string;
  source: MusicSourceType;
  title: string;
  artist: string;
  artistId?: string;
  artworkUri?: string;
  year?: number;
  trackCount: number;
}

export interface Artist {
  id: string;
  source: MusicSourceType;
  name: string;
  artworkUri?: string;
  albumCount?: number;
}

export interface Playlist {
  id: string;
  source: MusicSourceType;
  name: string;
  description?: string;
  ownerName?: string;
  artworkUri?: string;
  trackCount: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: Track | null;
  queue: Track[];
  /** Índice basado en 0 dentro de la cola actual (NowPlaying muestra index + 1 of queue.length) */
  currentQueueIndex: number;
  positionMs: number;
  durationMs: number;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  volumePercent: number;
  activeSource: MusicSourceType;
  isBuffering?: boolean;
}

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}
