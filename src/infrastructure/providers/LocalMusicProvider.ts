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
  IMusicProvider,
  PlaybackEventListener,
  QRAuthSession,
  QRAuthStatus,
} from '../../domain/providers/IMusicProvider';
import {
  LocalLibraryDatabase,
  ScanProgressReport,
} from '../storage/LocalLibraryDatabase';
import { y1NativeAudio } from '../audio/Y1NativeAudioBridge';

/**
 * LocalMusicProvider: Motor de almacenamiento local del Innioasis Y1.
 * - Integra `LocalLibraryDatabase` (SQLite WAL + FTS5) y `AudioTagParser` (ID3v2 / FLAC STREAMINFO + Vorbis).
 * - Si la base de datos SQLite está vacía en el primer arranque, siembra el catálogo demostrativo Hi-Fi
 *   y permite disparar el escáner real de la tarjeta microSD (`/storage/sdcard1/Music`).
 * - Delega la reproducción de bajo nivel al servicio nativo `Y1PlaybackService` (Media3/ExoPlayer)
 *   mediante `y1NativeAudio`.
 */

const SEED_LOCAL_ALBUMS: Album[] = [
  {
    id: 'local:album:1',
    source: 'local',
    title: 'Random Access Memories',
    artist: 'Daft Punk',
    artistId: 'local:artist:1',
    year: 2013,
    trackCount: 13,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739b9b36b0e22870b9f542d937',
  },
  {
    id: 'local:album:2',
    source: 'local',
    title: 'In Rainbows',
    artist: 'Radiohead',
    artistId: 'local:artist:2',
    year: 2007,
    trackCount: 10,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b273de3c04b5fc750b68899b20a9',
  },
  {
    id: 'local:album:3',
    source: 'local',
    title: 'Discovery',
    artist: 'Daft Punk',
    artistId: 'local:artist:1',
    year: 2001,
    trackCount: 14,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2732c25dade069546722a137604',
  },
  {
    id: 'local:album:4',
    source: 'local',
    title: 'Untrue',
    artist: 'Burial',
    artistId: 'local:artist:3',
    year: 2007,
    trackCount: 13,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2737c68b132b4f2b5a4d5c627b7',
  },
  {
    id: 'local:album:5',
    source: 'local',
    title: 'Selected Ambient Works 85-92',
    artist: 'Aphex Twin',
    artistId: 'local:artist:4',
    year: 1992,
    trackCount: 13,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b27335590cb9280d5a1f5221ae1a',
  },
  {
    id: 'local:album:6',
    source: 'local',
    title: 'Currents',
    artist: 'Tame Impala',
    artistId: 'local:artist:5',
    year: 2015,
    trackCount: 13,
    artworkUri: 'https://i.scdn.co/image/ab67616d0000b2739e1cfc756886ac782e363d79',
  },
];

const SEED_LOCAL_TRACKS: Track[] = [
  {
    id: 'local:track:101',
    source: 'local',
    uri: 'file:///storage/sdcard1/Music/Daft Punk/Random Access Memories/01 - Give Life Back to Music.flac',
    title: 'Give Life Back to Music',
    artist: 'Daft Punk',
    artistId: 'local:artist:1',
    album: 'Random Access Memories',
    albumId: 'local:album:1',
    artworkUri: SEED_LOCAL_ALBUMS[0].artworkUri,
    durationMs: 275000,
    trackNumber: 1,
    year: 2013,
    codecLabel: 'FLAC 24-bit/88.2kHz',
    isLiked: true,
  },
  {
    id: 'local:track:102',
    source: 'local',
    uri: 'file:///storage/sdcard1/Music/Daft Punk/Random Access Memories/06 - Lose Yourself to Dance.flac',
    title: 'Lose Yourself to Dance',
    artist: 'Daft Punk',
    artistId: 'local:artist:1',
    album: 'Random Access Memories',
    albumId: 'local:album:1',
    artworkUri: SEED_LOCAL_ALBUMS[0].artworkUri,
    durationMs: 353000,
    trackNumber: 6,
    year: 2013,
    codecLabel: 'FLAC 24-bit/88.2kHz',
    isLiked: true,
  },
  {
    id: 'local:track:103',
    source: 'local',
    uri: 'file:///storage/sdcard1/Music/Daft Punk/Random Access Memories/08 - Get Lucky.flac',
    title: 'Get Lucky (feat. Pharrell Williams)',
    artist: 'Daft Punk',
    artistId: 'local:artist:1',
    album: 'Random Access Memories',
    albumId: 'local:album:1',
    artworkUri: SEED_LOCAL_ALBUMS[0].artworkUri,
    durationMs: 369000,
    trackNumber: 8,
    year: 2013,
    codecLabel: 'FLAC 24-bit/88.2kHz',
    isLiked: true,
  },
  {
    id: 'local:track:201',
    source: 'local',
    uri: 'file:///storage/sdcard1/Music/Radiohead/In Rainbows/01 - 15 Step.flac',
    title: '15 Step',
    artist: 'Radiohead',
    artistId: 'local:artist:2',
    album: 'In Rainbows',
    albumId: 'local:album:2',
    artworkUri: SEED_LOCAL_ALBUMS[1].artworkUri,
    durationMs: 237000,
    trackNumber: 1,
    year: 2007,
    codecLabel: 'FLAC 16-bit/44.1kHz',
    isLiked: true,
  },
  {
    id: 'local:track:202',
    source: 'local',
    uri: 'file:///storage/sdcard1/Music/Radiohead/In Rainbows/04 - Weird Fishes Arpeggi.flac',
    title: 'Weird Fishes / Arpeggi',
    artist: 'Radiohead',
    artistId: 'local:artist:2',
    album: 'In Rainbows',
    albumId: 'local:album:2',
    artworkUri: SEED_LOCAL_ALBUMS[1].artworkUri,
    durationMs: 318000,
    trackNumber: 4,
    year: 2007,
    codecLabel: 'FLAC 16-bit/44.1kHz',
    isLiked: true,
  },
  {
    id: 'local:track:401',
    source: 'local',
    uri: 'file:///storage/sdcard1/Music/Burial/Untrue/02 - Archangel.flac',
    title: 'Archangel',
    artist: 'Burial',
    artistId: 'local:artist:3',
    album: 'Untrue',
    albumId: 'local:album:4',
    artworkUri: SEED_LOCAL_ALBUMS[3].artworkUri,
    durationMs: 238000,
    trackNumber: 2,
    year: 2007,
    codecLabel: 'FLAC 16-bit/44.1kHz',
    isLiked: true,
  },
];

export class LocalMusicProvider implements IMusicProvider {
  public readonly source = 'local' as const;
  public readonly displayName = 'Local Library (microSD)';
  public readonly requiresAuth = false;

  public readonly db = new LocalLibraryDatabase();
  private listeners = new Set<PlaybackEventListener>();
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  private state: PlaybackState = {
    isPlaying: false,
    currentTrack: SEED_LOCAL_TRACKS[0],
    queue: SEED_LOCAL_TRACKS,
    currentQueueIndex: 0,
    positionMs: 42000,
    durationMs: SEED_LOCAL_TRACKS[0].durationMs,
    shuffleEnabled: false,
    repeatMode: 'off',
    volumePercent: 75,
    activeSource: 'local',
  };

  async initialize(): Promise<void> {
    await this.db.openAndMigrate();
    if (this.db.isReady()) {
      const existingAlbums = await this.db.queryAlbums(1, 0);
      if (existingAlbums.length === 0) {
        await this.db.upsertTracksBatch(SEED_LOCAL_TRACKS);
      }
    }
  }

  public async rescanMicroSD(
    onProgress?: (report: ScanProgressReport) => void
  ): Promise<number> {
    return this.db.scanStorageDirectories(
      ['file:///storage/sdcard1/Music', 'file:///storage/emulated/0/Music'],
      onProgress
    );
  }

  async isAuthenticated(): Promise<boolean> {
    return true;
  }

  async startQRAuthSession(): Promise<QRAuthSession> {
    throw new Error('LocalMusicProvider no requiere autenticación por QR.');
  }

  async pollQRAuthStatus(): Promise<{ status: QRAuthStatus }> {
    return { status: 'authorized' };
  }

  async logout(): Promise<void> {
    // No-op para almacenamiento local
  }

  async getPlaylists(): Promise<Playlist[]> {
    return [
      {
        id: 'local:playlist:on_the_go',
        source: 'local',
        name: 'On-The-Go 1',
        description: 'Lista clásica en memoria del dispositivo',
        trackCount: SEED_LOCAL_TRACKS.length,
        artworkUri: SEED_LOCAL_ALBUMS[0].artworkUri,
      },
      {
        id: 'local:playlist:lossless_hi_res',
        source: 'local',
        name: 'Hi-Fi Lossless (FLAC)',
        description: 'Pistas sin compresión en microSD',
        trackCount: SEED_LOCAL_TRACKS.length,
        artworkUri: SEED_LOCAL_ALBUMS[1].artworkUri,
      },
    ];
  }

  async getPlaylistTracks(_playlistId: string): Promise<Track[]> {
    return SEED_LOCAL_TRACKS;
  }

  async getAlbums(limit = 200, offset = 0): Promise<Album[]> {
    if (this.db.isReady()) {
      const dbAlbums = await this.db.queryAlbums(limit, offset);
      if (dbAlbums.length > 0) return dbAlbums;
    }
    return SEED_LOCAL_ALBUMS;
  }

  async getAlbumTracks(albumId: string): Promise<Track[]> {
    if (this.db.isReady()) {
      const dbTracks = await this.db.queryAlbumTracks(albumId);
      if (dbTracks.length > 0) return dbTracks;
    }
    const filtered = SEED_LOCAL_TRACKS.filter((t) => t.albumId === albumId);
    return filtered.length > 0 ? filtered : SEED_LOCAL_TRACKS;
  }

  async getArtists(limit = 200, offset = 0): Promise<Artist[]> {
    if (this.db.isReady()) {
      const dbArtists = await this.db.queryArtists(limit, offset);
      if (dbArtists.length > 0) return dbArtists;
    }
    return [
      { id: 'local:artist:1', source: 'local', name: 'Daft Punk', albumCount: 2 },
      { id: 'local:artist:2', source: 'local', name: 'Radiohead', albumCount: 1 },
      { id: 'local:artist:3', source: 'local', name: 'Burial', albumCount: 1 },
      { id: 'local:artist:4', source: 'local', name: 'Aphex Twin', albumCount: 1 },
      { id: 'local:artist:5', source: 'local', name: 'Tame Impala', albumCount: 1 },
    ];
  }

  async getArtistAlbums(artistId: string): Promise<Album[]> {
    const allAlbums = await this.getAlbums();
    return allAlbums.filter((a) => a.artistId === artistId);
  }

  async getLikedTracks(): Promise<Track[]> {
    return SEED_LOCAL_TRACKS.filter((t) => t.isLiked);
  }

  async search(query: string, limit = 25): Promise<SearchResults> {
    if (this.db.isReady()) {
      const ftsResults = await this.db.searchFts(query, limit);
      if (
        ftsResults.tracks.length > 0 ||
        ftsResults.albums.length > 0 ||
        ftsResults.artists.length > 0
      ) {
        return ftsResults;
      }
    }

    const q = query.trim().toLowerCase();
    return {
      tracks: SEED_LOCAL_TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      ),
      albums: SEED_LOCAL_ALBUMS.filter(
        (a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
      ),
      artists: (await this.getArtists()).filter((ar) =>
        ar.name.toLowerCase().includes(q)
      ),
      playlists: [],
    };
  }

  async playTrack(track: Track, queue?: Track[]): Promise<void> {
    const nextQueue = queue && queue.length > 0 ? queue : [track];
    const index = Math.max(
      0,
      nextQueue.findIndex((item) => item.id === track.id)
    );

    await y1NativeAudio.playLocalOrStream({
      source: 'local',
      uri: track.uri,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUri: track.artworkUri,
    });

    this.state = {
      ...this.state,
      isPlaying: true,
      currentTrack: track,
      queue: nextQueue,
      currentQueueIndex: index,
      positionMs: 0,
      durationMs: track.durationMs,
      activeSource: 'local',
    };
    this.startProgressLoop();
    this.emitState();
  }

  async pause(): Promise<void> {
    await y1NativeAudio.pause();
    this.state = { ...this.state, isPlaying: false };
    this.stopProgressLoop();
    this.emitState();
  }

  async resume(): Promise<void> {
    if (!this.state.currentTrack) return;
    await y1NativeAudio.resume();
    this.state = { ...this.state, isPlaying: true };
    this.startProgressLoop();
    this.emitState();
  }

  async togglePlayPause(): Promise<void> {
    if (this.state.isPlaying) {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  async next(): Promise<void> {
    if (this.state.queue.length === 0) return;
    const nextIndex = (this.state.currentQueueIndex + 1) % this.state.queue.length;
    const nextTrack = this.state.queue[nextIndex];
    await this.playTrack(nextTrack, this.state.queue);
  }

  async previous(): Promise<void> {
    if (this.state.positionMs > 3500) {
      await this.seekTo(0);
      return;
    }
    if (this.state.queue.length === 0) return;
    const prevIndex =
      (this.state.currentQueueIndex - 1 + this.state.queue.length) %
      this.state.queue.length;
    const prevTrack = this.state.queue[prevIndex];
    await this.playTrack(prevTrack, this.state.queue);
  }

  async seekTo(positionMs: number): Promise<void> {
    const clamped = Math.max(0, Math.min(this.state.durationMs, positionMs));
    await y1NativeAudio.seekTo(clamped);
    this.state = {
      ...this.state,
      positionMs: clamped,
    };
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
    const clamped = Math.max(0, Math.min(100, volumePercent));
    await y1NativeAudio.setVolume(clamped);
    this.state = {
      ...this.state,
      volumePercent: clamped,
    };
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

  private startProgressLoop(): void {
    this.stopProgressLoop();
    this.progressTimer = setInterval(() => {
      if (!this.state.isPlaying || !this.state.currentTrack) return;
      const nextPos = this.state.positionMs + 1000;
      if (nextPos >= this.state.durationMs) {
        void this.next();
      } else {
        this.state = { ...this.state, positionMs: nextPos };
        this.emitState();
      }
    }, 1000);
  }

  private stopProgressLoop(): void {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private emitState(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }
}
