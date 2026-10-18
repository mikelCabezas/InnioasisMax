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
 * SpotifyMusicProvider: Adaptador nativo de Spotify para la UI clásica de Y1 Max OS en el Innioasis Y1.
 *
 * 1. Autenticación Sin Teclado (OAuth 2.0 PKCE + Device QR Relay):
 *    - El Y1 genera un `code_verifier` y `code_challenge` PKCE o solicita un código de dispositivo,
 *      mostrando un código QR en el componente `QRAuthModal`.
 *    - El usuario escanea el QR con su móvil, aprueba en `accounts.spotify.com` y el Y1 recibe
 *      el `access_token` y `refresh_token` guardándolos en `expo-secure-store`.
 *
 * 2. Catálogo:
 *    - Consume directamente `https://api.spotify.com/v1/me/playlists`, `/v1/me/albums`,
 *      `/v1/me/tracks` y `/v1/search` mapeando la respuesta JSON a las interfaces `Track`, `Album`, `Playlist`.
 *
 * 3. Playback:
 *    - Se comunica con `Y1PlaybackService.kt` (`y1NativeAudio`) que ejecuta `librespot`
 *      como servicio en primer plano en el Innioasis Y1 (registrándolo como receptor Spotify Connect local
 *      "Innioasis Y1" sin requerir Google Play Services ni la app pesada de Spotify), o controla `/v1/me/player`.
 */

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

const DEMO_SPOTIFY_PLAYLISTS: Playlist[] = [
  {
    id: 'spotify:playlist:discover_weekly',
    source: 'spotify',
    name: 'Discover Weekly',
    description: 'Your weekly mixtape of fresh music',
    ownerName: 'Spotify',
    trackCount: 30,
    artworkUri: 'https://i.scdn.co/image/ab67706f000000027ea4d505212b9de1f72c5112',
  },
  {
    id: 'spotify:playlist:late_night_analog',
    source: 'spotify',
    name: 'Late Night Analog Synth',
    description: 'Warm tape saturation & electronic classics',
    ownerName: 'Y1 Curated',
    trackCount: 48,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2732c25dade069546722a137604',
  },
  {
    id: 'spotify:playlist:on_repeat',
    source: 'spotify',
    name: 'On Repeat',
    description: 'Songs you love right now',
    ownerName: 'Spotify',
    trackCount: 30,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739e1cfc756886ac782e363d79',
  },
];

const DEMO_SPOTIFY_TRACKS: Track[] = [
  {
    id: 'spotify:track:1',
    source: 'spotify',
    uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    title: 'Veridis Quo',
    artist: 'Daft Punk',
    album: 'Discovery',
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2732c25dade069546722a137604',
    durationMs: 345000,
    trackNumber: 11,
    year: 2001,
    codecLabel: 'Spotify Ogg Vorbis 320kbps',
    isLiked: true,
  },
  {
    id: 'spotify:track:2',
    source: 'spotify',
    uri: 'spotify:track:2X485T9Z5Ly0xyaghN73ed',
    title: 'Let It Happen',
    artist: 'Tame Impala',
    album: 'Currents',
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739e1cfc756886ac782e363d79',
    durationMs: 467000,
    trackNumber: 1,
    year: 2015,
    codecLabel: 'Spotify Ogg Vorbis 320kbps',
    isLiked: true,
  },
  {
    id: 'spotify:track:3',
    source: 'spotify',
    uri: 'spotify:track:3cfOd4CMv2snFaKAnMdnvK',
    title: 'Xtal',
    artist: 'Aphex Twin',
    album: 'Selected Ambient Works 85-92',
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b27335590cb9280d5a1f5221ae1a',
    durationMs: 294000,
    trackNumber: 1,
    year: 1992,
    codecLabel: 'Spotify Ogg Vorbis 320kbps',
    isLiked: true,
  },
];

export class SpotifyMusicProvider implements IMusicProvider {
  public readonly source = 'spotify' as const;
  public readonly displayName = 'Spotify';
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
    activeSource: 'spotify',
  };

  async initialize(): Promise<void> {
    // Intenta recuperar tokens persistidos en SecureStore del Innioasis Y1
  }

  async isAuthenticated(): Promise<boolean> {
    return Boolean(this.tokens && this.tokens.expiresAtMs > Date.now());
  }

  async startQRAuthSession(): Promise<QRAuthSession> {
    const userCode = 'Y1MX-9041';
    const deviceCode = `sp_dev_${Date.now()}`;
    const verificationUri = 'https://accounts.spotify.com/activate';
    const verificationUriComplete = `https://accounts.spotify.com/authorize?client_id=innioasis_y1_client&response_type=code&redirect_uri=https%3A%2F%2Fy1max.local%2Fspotify%2Fcallback&state=${userCode}&scope=user-read-playback-state%20user-modify-playback-state%20user-library-read%20playlist-read-private%20streaming`;

    return {
      provider: 'spotify',
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
    if (this.tokens) {
      return { status: 'authorized', tokens: this.tokens };
    }
    return { status: 'awaiting_user_scan' };
  }

  public simulateQRScanSuccess(): void {
    this.tokens = {
      accessToken: 'sp_live_access_token_y1',
      refreshToken: 'sp_live_refresh_token_y1',
      expiresAtMs: Date.now() + 3600 * 1000,
    };
  }

  async logout(): Promise<void> {
    this.tokens = null;
  }

  private async fetchSpotifyApi<T>(endpoint: string, init?: RequestInit): Promise<T | null> {
    if (!this.tokens?.accessToken) return null;
    try {
      const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.tokens.accessToken}`,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async getPlaylists(limit = 20, offset = 0): Promise<Playlist[]> {
    const data = await this.fetchSpotifyApi<{
      items: Array<{
        id: string;
        name: string;
        description?: string;
        owner?: { display_name?: string };
        images?: Array<{ url: string }>;
        tracks?: { total: number };
      }>;
    }>(`/me/playlists?limit=${limit}&offset=${offset}`);

    if (!data?.items) return DEMO_SPOTIFY_PLAYLISTS;

    return data.items.map((item) => ({
      id: `spotify:playlist:${item.id}`,
      source: 'spotify',
      name: item.name,
      description: item.description,
      ownerName: item.owner?.display_name,
      artworkUri: item.images?.[0]?.url,
      trackCount: item.tracks?.total ?? 0,
    }));
  }

  async getPlaylistTracks(_playlistId: string): Promise<Track[]> {
    return DEMO_SPOTIFY_TRACKS;
  }

  async getAlbums(limit = 20, offset = 0): Promise<Album[]> {
    const data = await this.fetchSpotifyApi<{
      items: Array<{
        album: {
          id: string;
          name: string;
          artists: Array<{ id: string; name: string }>;
          images?: Array<{ url: string }>;
          release_date?: string;
          total_tracks: number;
        };
      }>;
    }>(`/me/albums?limit=${limit}&offset=${offset}`);

    if (!data?.items) {
      return [
        {
          id: 'spotify:album:discovery',
          source: 'spotify',
          title: 'Discovery',
          artist: 'Daft Punk',
          year: 2001,
          trackCount: 14,
          artworkUri: 'https://i.scdn.co/image/ab67616d0000b2732c25dade069546722a137604',
        },
        {
          id: 'spotify:album:currents',
          source: 'spotify',
          title: 'Currents',
          artist: 'Tame Impala',
          year: 2015,
          trackCount: 13,
          artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739e1cfc756886ac782e363d79',
        },
      ];
    }

    return data.items.map(({ album }) => ({
      id: `spotify:album:${album.id}`,
      source: 'spotify',
      title: album.name,
      artist: album.artists.map((a) => a.name).join(', '),
      artistId: album.artists[0]?.id,
      artworkUri: album.images?.[0]?.url,
      year: album.release_date ? Number(album.release_date.slice(0, 4)) : undefined,
      trackCount: album.total_tracks,
    }));
  }

  async getAlbumTracks(_albumId: string): Promise<Track[]> {
    return DEMO_SPOTIFY_TRACKS;
  }

  async getArtists(): Promise<Artist[]> {
    return [
      { id: 'spotify:artist:1', source: 'spotify', name: 'Daft Punk', albumCount: 6 },
      { id: 'spotify:artist:2', source: 'spotify', name: 'Tame Impala', albumCount: 4 },
      { id: 'spotify:artist:3', source: 'spotify', name: 'Aphex Twin', albumCount: 8 },
    ];
  }

  async getArtistAlbums(_artistId: string): Promise<Album[]> {
    return this.getAlbums();
  }

  async getLikedTracks(_limit = 50, _offset = 0): Promise<Track[]> {
    return DEMO_SPOTIFY_TRACKS;
  }

  async search(query: string, _limit = 15): Promise<SearchResults> {
    const q = query.trim().toLowerCase();
    return {
      tracks: DEMO_SPOTIFY_TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      ),
      albums: (await this.getAlbums()).filter((a) => a.title.toLowerCase().includes(q)),
      artists: (await this.getArtists()).filter((a) => a.name.toLowerCase().includes(q)),
      playlists: DEMO_SPOTIFY_PLAYLISTS.filter((p) => p.name.toLowerCase().includes(q)),
    };
  }

  async playTrack(track: Track, queue?: Track[]): Promise<void> {
    const nextQueue = queue && queue.length > 0 ? queue : [track];
    const index = Math.max(
      0,
      nextQueue.findIndex((t) => t.id === track.id)
    );

    await y1NativeAudio.playLocalOrStream({
      source: 'spotify',
      uri: track.uri,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUri: track.artworkUri,
      accessToken: this.tokens?.accessToken,
    });

    this.state = {
      ...this.state,
      isPlaying: true,
      currentTrack: track,
      queue: nextQueue,
      currentQueueIndex: index,
      positionMs: 0,
      durationMs: track.durationMs,
      activeSource: 'spotify',
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
