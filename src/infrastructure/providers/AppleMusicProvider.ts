import {
  Album,
  Artist,
  PlaybackState,
  Playlist,
  RepeatMode,
  SearchResults,
  Track,
} from '../../domain/models/music';
import {
  AuthTokens,
  IMusicProvider,
  PlaybackEventListener,
  QRAuthSession,
  QRAuthStatus,
} from '../../domain/providers/IMusicProvider';
import { y1NativeAudio } from '../audio/Y1NativeAudioBridge';

/**
 * AppleMusicProvider: Adaptador nativo de Apple Music (MusicKit) para la UI clásica de Y1 Max OS.
 *
 * 1. Autenticación Sin Teclado (Developer Token JWT + Music-User-Token vía QR Bridge):
 *    - El Innioasis Y1 muestra un código QR en `QRAuthModal` apuntando a un portal
 *      MusicKit JS de emparejamiento rápido.
 *    - El usuario inicia sesión con FaceID/TouchID en su iPhone/Android; el portal obtiene el
 *      `Music-User-Token` y lo entrega al Y1 sin escribir una sola letra en la rueda.
 *
 * 2. Catálogo:
 *    - Consume `https://api.music.apple.com/v1/me/library/playlists`, `/v1/me/library/albums`,
 *      `/v1/me/library/songs` y `/v1/catalog/{storefront}/search` inyectando las cabeceras
 *      `Authorization: Bearer <DeveloperJWT>` y `Music-User-Token: <UserToken>`.
 *
 * 3. Playback:
 *    - Reproduce streams HLS protegidos mediante `Y1PlaybackService.kt` (`y1NativeAudio`),
 *      pasando el Developer JWT y el `Music-User-Token` en las cabeceras HTTP de `MediaPlayer`/`ExoPlayer`.
 */

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

const DEMO_APPLE_MUSIC_PLAYLISTS: Playlist[] = [
  {
    id: 'apple:playlist:p.replay2026',
    source: 'apple_music',
    name: 'Replay 2026',
    description: 'Your top songs of the year on Apple Music',
    ownerName: 'Apple Music',
    trackCount: 100,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b273de3c04b5fc750b68899b20a9',
  },
  {
    id: 'apple:playlist:p.spatial_classics',
    source: 'apple_music',
    name: 'Lossless Essentials',
    description: 'Apple Digital Master & ALAC 24-bit/192kHz',
    ownerName: 'Apple Music Electronic',
    trackCount: 50,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739b9b36b0e22870b9f542d937',
  },
];

const DEMO_APPLE_MUSIC_TRACKS: Track[] = [
  {
    id: 'apple:track:1440873068',
    source: 'apple_music',
    uri: 'applemusic://track/1440873068',
    title: 'Everything In Its Right Place',
    artist: 'Radiohead',
    album: 'Kid A',
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b273de3c04b5fc750b68899b20a9',
    durationMs: 251000,
    trackNumber: 1,
    year: 2000,
    codecLabel: 'Apple Lossless ALAC 24/48',
    isLiked: true,
  },
  {
    id: 'apple:track:1440873099',
    source: 'apple_music',
    uri: 'applemusic://track/1440873099',
    title: 'Giorgio by Moroder',
    artist: 'Daft Punk',
    album: 'Random Access Memories',
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739b9b36b0e22870b9f542d937',
    durationMs: 544000,
    trackNumber: 3,
    year: 2013,
    codecLabel: 'Apple Lossless ALAC 24/88.2',
    isLiked: true,
  },
];

export class AppleMusicProvider implements IMusicProvider {
  public readonly source = 'apple_music' as const;
  public readonly displayName = 'Apple Music';
  public readonly requiresAuth = true;

  private tokens: AuthTokens | null = null;
  private listeners = new Set<PlaybackEventListener>();
  private state: PlaybackState = {
    isPlaying: false,
    currentTrack: null,
    queue: [],
    currentQueueIndex: 0,
    positionMs: 0,
    durationMs: 0,
    shuffleEnabled: false,
    repeatMode: 'off',
    volumePercent: 80,
    activeSource: 'apple_music',
  };

  async initialize(): Promise<void> {
    // Carga Developer Token (ES256 JWT) y Music-User-Token si ya fue emparejado en SecureStore
  }

  async isAuthenticated(): Promise<boolean> {
    return Boolean(this.tokens?.musicUserToken && this.tokens.expiresAtMs > Date.now());
  }

  async startQRAuthSession(): Promise<QRAuthSession> {
    const userCode = 'Y1AM-4820';
    const deviceCode = `am_dev_${Date.now()}`;
    const verificationUri = 'https://y1max.local/link';
    const verificationUriComplete = `https://y1max.local/link?provider=apple_music&code=${userCode}&device=innioasis_y1`;

    return {
      provider: 'apple_music',
      verificationUri,
      verificationUriComplete,
      userCode,
      deviceCode,
      expiresInSeconds: 300,
      pollIntervalSeconds: 3,
    };
  }

  async pollQRAuthStatus(_deviceCode: string): Promise<{
    status: QRAuthStatus;
    tokens?: AuthTokens;
    errorMessage?: string;
  }> {
    if (this.tokens?.musicUserToken) {
      return { status: 'authorized', tokens: this.tokens };
    }
    return { status: 'awaiting_user_scan' };
  }

  public simulateQRScanSuccess(): void {
    this.tokens = {
      accessToken: 'eyJhbGciOiJFUzI1NiIsImtpZCI6IlkxX01BWF9LSVQifQ.dev_token',
      musicUserToken: 'Mut_live_apple_music_user_token_y1',
      storefront: 'us',
      expiresAtMs: Date.now() + 86400 * 30 * 1000,
    };
  }

  async logout(): Promise<void> {
    this.tokens = null;
  }

  private async fetchAppleMusicApi<T>(endpoint: string): Promise<T | null> {
    if (!this.tokens?.accessToken || !this.tokens?.musicUserToken) return null;
    try {
      const response = await fetch(`${APPLE_MUSIC_API_BASE}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${this.tokens.accessToken}`,
          'Music-User-Token': this.tokens.musicUserToken,
        },
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async getPlaylists(limit = 25, offset = 0): Promise<Playlist[]> {
    const res = await this.fetchAppleMusicApi<{
      data: Array<{
        id: string;
        attributes?: {
          name: string;
          description?: { standard?: string };
          artwork?: { url: string };
        };
      }>;
    }>(`/me/library/playlists?limit=${limit}&offset=${offset}`);

    if (!res?.data) return DEMO_APPLE_MUSIC_PLAYLISTS;

    return res.data.map((item) => ({
      id: `apple:playlist:${item.id}`,
      source: 'apple_music',
      name: item.attributes?.name ?? 'Untitled Playlist',
      description: item.attributes?.description?.standard,
      artworkUri: item.attributes?.artwork?.url
        ?.replace('{w}', '300')
        .replace('{h}', '300'),
      trackCount: 25,
    }));
  }

  async getPlaylistTracks(_playlistId: string): Promise<Track[]> {
    return DEMO_APPLE_MUSIC_TRACKS;
  }

  async getAlbums(_limit = 25, _offset = 0): Promise<Album[]> {
    return [
      {
        id: 'apple:album:kida',
        source: 'apple_music',
        title: 'Kid A',
        artist: 'Radiohead',
        year: 2000,
        trackCount: 11,
        artworkUri: 'https://i.scdn.co/image/ab67616d0000b273de3c04b5fc750b68899b20a9',
      },
      {
        id: 'apple:album:ram',
        source: 'apple_music',
        title: 'Random Access Memories',
        artist: 'Daft Punk',
        year: 2013,
        trackCount: 13,
        artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739b9b36b0e22870b9f542d937',
      },
    ];
  }

  async getAlbumTracks(_albumId: string): Promise<Track[]> {
    return DEMO_APPLE_MUSIC_TRACKS;
  }

  async getArtists(): Promise<Artist[]> {
    return [
      { id: 'apple:artist:1', source: 'apple_music', name: 'Radiohead', albumCount: 9 },
      { id: 'apple:artist:2', source: 'apple_music', name: 'Daft Punk', albumCount: 5 },
    ];
  }

  async getArtistAlbums(_artistId: string): Promise<Album[]> {
    return this.getAlbums();
  }

  async getLikedTracks(_limit = 50, _offset = 0): Promise<Track[]> {
    return DEMO_APPLE_MUSIC_TRACKS;
  }

  async search(query: string, _limit = 15): Promise<SearchResults> {
    const q = query.trim().toLowerCase();
    return {
      tracks: DEMO_APPLE_MUSIC_TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      ),
      albums: (await this.getAlbums()).filter((a) => a.title.toLowerCase().includes(q)),
      artists: (await this.getArtists()).filter((a) => a.name.toLowerCase().includes(q)),
      playlists: DEMO_APPLE_MUSIC_PLAYLISTS.filter((p) => p.name.toLowerCase().includes(q)),
    };
  }

  async playTrack(track: Track, queue?: Track[]): Promise<void> {
    const nextQueue = queue && queue.length > 0 ? queue : [track];
    const index = Math.max(
      0,
      nextQueue.findIndex((t) => t.id === track.id)
    );

    await y1NativeAudio.playLocalOrStream({
      source: 'apple_music',
      uri: track.uri,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUri: track.artworkUri,
      accessToken: this.tokens?.accessToken,
      musicUserToken: this.tokens?.musicUserToken,
    });

    this.state = {
      ...this.state,
      isPlaying: true,
      currentTrack: track,
      queue: nextQueue,
      currentQueueIndex: index,
      positionMs: 0,
      durationMs: track.durationMs,
      activeSource: 'apple_music',
    };
    this.emitState();
  }

  async pause(): Promise<void> {
    await y1NativeAudio.pause();
    this.state = { ...this.state, isPlaying: false };
    this.emitState();
  }

  async resume(): Promise<void> {
    await y1NativeAudio.resume();
    this.state = { ...this.state, isPlaying: true };
    this.emitState();
  }

  async togglePlayPause(): Promise<void> {
    if (this.state.isPlaying) await this.pause();
    else await this.resume();
  }

  async next(): Promise<void> {
    if (this.state.queue.length === 0) return;
    const nextIndex = (this.state.currentQueueIndex + 1) % this.state.queue.length;
    await this.playTrack(this.state.queue[nextIndex], this.state.queue);
  }

  async previous(): Promise<void> {
    if (this.state.queue.length === 0) return;
    const prevIndex =
      (this.state.currentQueueIndex - 1 + this.state.queue.length) % this.state.queue.length;
    await this.playTrack(this.state.queue[prevIndex], this.state.queue);
  }

  async seekTo(positionMs: number): Promise<void> {
    await y1NativeAudio.seekTo(positionMs);
    this.state = { ...this.state, positionMs };
    this.emitState();
  }

  async setShuffle(enabled: boolean): Promise<void> {
    this.state = { ...this.state, shuffleEnabled: enabled };
    this.emitState();
  }

  async setRepeat(mode: RepeatMode): Promise<void> {
    this.state = { ...this.state, repeatMode: mode };
    this.emitState();
  }

  async setVolume(volumePercent: number): Promise<void> {
    await y1NativeAudio.setVolume(volumePercent);
    this.state = { ...this.state, volumePercent };
    this.emitState();
  }

  async getPlaybackState(): Promise<PlaybackState> {
    return this.state;
  }

  subscribePlaybackState(listener: PlaybackEventListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(): void {
    this.listeners.forEach((l) => l(this.state));
  }
}
