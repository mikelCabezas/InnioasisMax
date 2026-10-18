import { create } from 'zustand';
import {
  Album,
  MusicSourceType,
  PlaybackState,
  Track,
} from '../../domain/models/music';
import { QRAuthSession } from '../../domain/providers/IMusicProvider';
import {
  y1NativeAudio,
  Y1AudioEngine,
} from '../../infrastructure/audio/Y1NativeAudioBridge';
import { WHEEL_KEYBOARD_TOKENS } from '../../presentation/components/Y1WheelSearch';
import { Y1FontScale, Y1ThemeMode } from '../../presentation/theme/y1Theme';
import { musicProviders } from '../services/MusicProviderRegistry';

export type PreviewPaneKind =
  | 'now_playing_artwork'
  | 'album_collage'
  | 'spotify_hub'
  | 'apple_music_hub'
  | 'cover_flow_teaser'
  | 'device_status';

export type WheelVibrationMode = 'off' | 'soft' | 'medium' | 'strong';

export interface Y1MenuItem {
  id: string;
  label: string;
  sublabel?: string;
  badgeText?: string;
  hasChevron?: boolean;
  previewKind?: PreviewPaneKind;
  previewArtworkUri?: string;
  previewAlbumCollage?: string[];
  onSelect: () => Promise<void> | void;
}

export type ActiveScreenType =
  | 'split_menu'
  | 'full_list'
  | 'cover_flow'
  | 'now_playing'
  | 'qr_auth'
  | 'wheel_search';

export interface NavigationStackEntry {
  id: string;
  title: string;
  screenType: ActiveScreenType;
  items: Y1MenuItem[];
  focusedIndex: number;
  providerBadge?: MusicSourceType;
}

interface Y1NavigationState {
  themeMode: Y1ThemeMode;
  fontScale: Y1FontScale;
  isSyncingLibrary: boolean;
  nowPlayingWheelMode: 'volume' | 'scrub';
  stack: NavigationStackEntry[];
  playback: PlaybackState;
  localAlbums: Album[];
  activeQRSession: QRAuthSession | null;
  bluetoothConnected: boolean;
  wifiConnected: boolean;
  batteryPercent: number;

  // Nuevos estados de hardware y configuración de Y1 Max OS
  wifiEnabled: boolean;
  connectedWifiSsid: string | null;
  bluetoothEnabled: boolean;
  brightnessLevel: number;
  wheelVibration: WheelVibrationMode;
  wheelClickSound: boolean;
  isKeypadLocked: boolean;
  autoKeypadLock1Min: boolean;
  autoLockSeconds: number;
  isPoweredOff: boolean;

  // Estado de la Búsqueda Alfabética por Rueda (Y1WheelSearch)
  searchQuery: string;
  searchMode: 'keyboard' | 'results';
  searchWheelKeyIndex: number;
  searchResults: Track[];
  searchFocusedResultIndex: number;
  lastScanStatus: string;

  // Acciones de la Click Wheel
  bootSystem: () => Promise<void>;
  wheelStep: (direction: 1 | -1) => void;
  pressCenter: () => Promise<void>;
  pressMenuBack: () => void;
  pressPlayPause: () => Promise<void>;
  pressNext: () => Promise<void>;
  pressPrevious: () => Promise<void>;

  // Navegación programática y ajustes
  pushMenu: (entry: Omit<NavigationStackEntry, 'focusedIndex'> & { focusedIndex?: number }) => void;
  openNowPlaying: () => void;
  openCoverFlow: () => Promise<void>;
  openWheelSearch: () => Promise<void>;
  runFederatedSearch: (query: string) => Promise<void>;
  openProviderMenu: (source: MusicSourceType) => Promise<void>;
  completeQRAuthSimulation: () => Promise<void>;
  cycleTheme: () => void;
  cycleFontScale: () => void;
  toggleWifi: () => void;
  connectWifiWithPassword: (ssid: string, password: string) => void;
  toggleBluetooth: () => void;
  cycleBrightness: () => void;
  cycleWheelVibration: () => void;
  toggleWheelClickSound: () => void;
  toggleKeypadLock: () => void;
  toggleAutoKeypadLock1Min: () => void;
  cycleAutoLockTimeout: () => void;
  powerOffDevice: () => Promise<void>;
  exitToStockOS: () => Promise<void>;
}

const THEME_ORDER: Y1ThemeMode[] = [
  'classic_color',
  'y1_mono_grey',
  'y1_backlit_blue',
  'y1_dark',
];

const FONT_SCALE_ORDER: Y1FontScale[] = ['compact', 'normal', 'large', 'xl'];

const FONT_SCALE_LABELS: Record<Y1FontScale, string> = {
  compact: 'Compact (8 rows)',
  normal: 'Normal (7 rows)',
  large: 'Large (6 rows)',
  xl: 'Extra Large (5 rows)',
};

const BRIGHTNESS_ORDER = [20, 40, 60, 80, 100] as const;

const WHEEL_VIBRATION_ORDER: WheelVibrationMode[] = [
  'soft',
  'medium',
  'strong',
  'off',
];

const AUTO_LOCK_ORDER = [15, 30, 60, 120, 300, 0] as const;

const formatAutoLockLabel = (seconds: number): string => {
  if (seconds === 0) return 'Never';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
};

export const useY1Store = create<Y1NavigationState>((set, get) => {
  const buildRootMenuItems = (albums: Album[]): Y1MenuItem[] => {
    const collageUris = albums
      .map((a) => a.artworkUri)
      .filter((uri): uri is string => Boolean(uri));

    return [
      {
        id: 'root:music_local',
        label: 'Music',
        sublabel: `${albums.length} Albums • SQLite FTS5`,
        hasChevron: true,
        previewKind: 'album_collage',
        previewAlbumCollage: collageUris,
        onSelect: () => get().openProviderMenu('local'),
      },
      {
        id: 'root:spotify',
        label: 'Spotify',
        sublabel: 'Direct Stream & Connect',
        hasChevron: true,
        previewKind: 'spotify_hub',
        onSelect: () => get().openProviderMenu('spotify'),
      },
      {
        id: 'root:apple_music',
        label: 'Apple Music',
        sublabel: 'Lossless & Cloud Library',
        hasChevron: true,
        previewKind: 'apple_music_hub',
        onSelect: () => get().openProviderMenu('apple_music'),
      },
      {
        id: 'root:cover_flow',
        label: 'Cover Flow',
        sublabel: '3D Album Wall',
        hasChevron: true,
        previewKind: 'cover_flow_teaser',
        previewAlbumCollage: collageUris,
        onSelect: () => get().openCoverFlow(),
      },
      {
        id: 'root:search',
        label: 'Search',
        sublabel: 'Local + Spotify + Apple Music',
        hasChevron: true,
        previewKind: 'album_collage',
        previewAlbumCollage: collageUris,
        onSelect: () => get().openWheelSearch(),
      },
      {
        id: 'root:playlists',
        label: 'Playlists',
        hasChevron: true,
        previewKind: 'album_collage',
        previewAlbumCollage: collageUris,
        onSelect: async () => {
          const playlists = await musicProviders.local.getPlaylists();
          get().pushMenu({
            id: 'local:playlists',
            title: 'Playlists',
            screenType: 'split_menu',
            providerBadge: 'local',
            items: playlists.map((pl) => ({
              id: pl.id,
              label: pl.name,
              sublabel: `${pl.trackCount} songs`,
              hasChevron: true,
              previewKind: 'now_playing_artwork',
              previewArtworkUri: pl.artworkUri,
              onSelect: async () => {
                const tracks = await musicProviders.local.getPlaylistTracks(pl.id);
                pushTrackListMenu(pl.name, 'local', tracks);
              },
            })),
          });
        },
      },
      {
        id: 'root:now_playing',
        label: 'Now Playing',
        hasChevron: true,
        previewKind: 'now_playing_artwork',
        onSelect: () => get().openNowPlaying(),
      },
      {
        id: 'root:settings',
        label: 'Settings',
        sublabel: 'Wi-Fi, Bluetooth, Display & Wheel',
        hasChevron: true,
        previewKind: 'device_status',
        onSelect: () => {
          get().pushMenu({
            id: 'settings:menu',
            title: 'Settings',
            screenType: 'split_menu',
            items: buildSettingsMenuItems(),
          });
        },
      },
    ];
  };

  const refreshSettingsMenuInStack = () => {
    const currentStack = get().stack;
    const updated = currentStack.map((entry) =>
      entry.id === 'settings:menu'
        ? { ...entry, items: buildSettingsMenuItems() }
        : entry
    );
    set({ stack: updated });
  };

  const buildSettingsMenuItems = (): Y1MenuItem[] => [
    {
      id: 'settings:wifi',
      label: 'Wi-Fi',
      sublabel: get().wifiEnabled
        ? get().connectedWifiSsid
          ? `Connected to ${get().connectedWifiSsid}`
          : 'Connected • Press to toggle / scan'
        : 'Disabled',
      badgeText: get().wifiEnabled ? 'ON' : 'OFF',
      hasChevron: true,
      previewKind: 'device_status',
      onSelect: () => get().toggleWifi(),
    },
    {
      id: 'settings:bluetooth',
      label: 'Bluetooth',
      sublabel: get().bluetoothEnabled ? 'Wireless Audio Active' : 'Disabled',
      badgeText: get().bluetoothEnabled ? 'ON' : 'OFF',
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().toggleBluetooth(),
    },
    {
      id: 'settings:brightness',
      label: 'Brightness',
      sublabel: 'LCD Backlight Level',
      badgeText: `${get().brightnessLevel}%`,
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().cycleBrightness(),
    },
    {
      id: 'settings:wheel_vibration',
      label: 'Wheel Vibration',
      sublabel: 'Tactile Haptic Feedback',
      badgeText: get().wheelVibration.toUpperCase(),
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().cycleWheelVibration(),
    },
    {
      id: 'settings:wheel_click_sound',
      label: 'Wheel Click Sound',
      sublabel: 'Piezo / Speaker Click',
      badgeText: get().wheelClickSound ? 'On' : 'Off',
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().toggleWheelClickSound(),
    },
    {
      id: 'settings:lock_keypad',
      label: 'Lock Keypad (Hold)',
      sublabel: get().isKeypadLocked ? 'Keypad Locked 🔒' : 'Press Center to Lock',
      badgeText: get().isKeypadLocked ? 'LOCKED' : 'UNLOCKED',
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().toggleKeypadLock(),
    },
    {
      id: 'settings:auto_keypad_lock_1min',
      label: 'Auto Keypad Lock (1 min)',
      sublabel: 'Lock keys after 60s of inactivity',
      badgeText: get().autoKeypadLock1Min ? 'ON' : 'OFF',
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().toggleAutoKeypadLock1Min(),
    },
    {
      id: 'settings:auto_lock_timeout',
      label: 'Auto-Lock Timeout',
      sublabel: 'Idle Keypad Lock Timer',
      badgeText: formatAutoLockLabel(get().autoLockSeconds),
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().cycleAutoLockTimeout(),
    },
    {
      id: 'settings:theme',
      label: 'LCD Palette / Theme',
      sublabel: 'Press Center to cycle',
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().cycleTheme(),
    },
    {
      id: 'settings:font_scale',
      label: 'Font Size',
      sublabel: FONT_SCALE_LABELS[get().fontScale],
      badgeText: get().fontScale.toUpperCase(),
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => get().cycleFontScale(),
    },
    {
      id: 'settings:rescan_sd',
      label: 'Rescan microSD Card',
      sublabel: get().lastScanStatus,
      badgeText: get().isSyncingLibrary ? 'SYNC ↻' : undefined,
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: async () => {
        if (get().isSyncingLibrary) return;
        set({
          isSyncingLibrary: true,
          lastScanStatus: 'Scanning /storage/sdcard1...',
        });
        refreshSettingsMenuInStack();
        try {
          const count = await musicProviders.local.rescanMicroSD((rep) => {
            set({
              isSyncingLibrary: !rep.isComplete,
              lastScanStatus: rep.isComplete
                ? `Indexed ${rep.indexedTracks} tracks in SQLite`
                : `Scanning (${rep.indexedTracks} tracks)...`,
            });
            refreshSettingsMenuInStack();
          });
          set({
            isSyncingLibrary: false,
            lastScanStatus: `Ready (${count} new tracks indexed)`,
          });
        } finally {
          set({ isSyncingLibrary: false });
          refreshSettingsMenuInStack();
        }
      },
    },
    {
      id: 'settings:about',
      label: 'About Innioasis Y1',
      sublabel: 'Y1 Max OS v1.0 (Android Kiosk)',
      hasChevron: false,
      previewKind: 'device_status',
      onSelect: () => {},
    },
    {
      id: 'settings:power_off_device',
      label: 'Power Off Device',
      sublabel: 'Shut down Innioasis Y1 hardware',
      hasChevron: true,
      previewKind: 'device_status',
      onSelect: () => get().powerOffDevice(),
    },
    {
      id: 'settings:exit_stock_os',
      label: 'Exit to Stock Y1 OS',
      sublabel: 'Return to factory Innioasis launcher',
      hasChevron: true,
      previewKind: 'device_status',
      onSelect: () => get().exitToStockOS(),
    },
  ];

  const pushTrackListMenu = (
    title: string,
    source: MusicSourceType,
    tracks: Track[]
  ) => {
    const provider = musicProviders.getProvider(source);
    get().pushMenu({
      id: `${source}:tracks:${title}`,
      title,
      screenType: 'split_menu',
      providerBadge: source,
      items: tracks.map((track) => ({
        id: track.id,
        label: track.title,
        sublabel: `${track.artist} — ${track.album}`,
        badgeText: `${Math.floor(track.durationMs / 60000)}:${String(
          Math.floor((track.durationMs % 60000) / 1000)
        ).padStart(2, '0')}`,
        hasChevron: true,
        previewKind: 'now_playing_artwork',
        previewArtworkUri: track.artworkUri,
        onSelect: async () => {
          await provider.playTrack(track, tracks);
          const nextPlayback = await provider.getPlaybackState();
          set({ playback: nextPlayback });
          get().openNowPlaying();
        },
      })),
    });
  };

  return {
    themeMode: 'classic_color',
    fontScale: 'large',
    isSyncingLibrary: false,
    nowPlayingWheelMode: 'volume',
    stack: [],
    playback: {
      isPlaying: false,
      currentTrack: null,
      queue: [],
      currentQueueIndex: 0,
      positionMs: 0,
      durationMs: 0,
      shuffleEnabled: false,
      repeatMode: 'off',
      volumePercent: 75,
      activeSource: 'local',
    },
    localAlbums: [],
    activeQRSession: null,
    bluetoothConnected: true,
    wifiConnected: true,
    batteryPercent: 88,

    wifiEnabled: true,
    connectedWifiSsid: null,
    bluetoothEnabled: true,
    brightnessLevel: 80,
    wheelVibration: 'soft',
    wheelClickSound: false,
    isKeypadLocked: false,
    autoKeypadLock1Min: true,
    autoLockSeconds: 60,
    isPoweredOff: false,

    searchQuery: 'DAFT',
    searchMode: 'keyboard',
    searchWheelKeyIndex: 0,
    searchResults: [],
    searchFocusedResultIndex: 0,
    lastScanStatus: 'SQLite FTS5 Ready',

    bootSystem: async () => {
      await musicProviders.initializeAll();
      const albums = await musicProviders.local.getAlbums();
      const initialPlayback = await musicProviders.local.getPlaybackState();

      (['local', 'spotify', 'apple_music'] as MusicSourceType[]).forEach((src) => {
        musicProviders.getProvider(src).subscribePlaybackState((newState) => {
          if (newState.isPlaying || get().playback.activeSource === src) {
            set({ playback: newState });
          }
        });
      });

      set({
        localAlbums: albums,
        playback: initialPlayback,
        stack: [
          {
            id: 'root',
            title: 'Innioasis Y1',
            screenType: 'split_menu',
            items: buildRootMenuItems(albums),
            focusedIndex: 0,
            providerBadge: initialPlayback.activeSource,
          },
        ],
      });
    },

    wheelStep: (direction) => {
      const {
        stack,
        playback,
        nowPlayingWheelMode,
        searchMode,
        searchWheelKeyIndex,
        searchResults,
        searchFocusedResultIndex,
      } = get();
      if (stack.length === 0) return;
      const top = stack[stack.length - 1];

      if (top.screenType === 'wheel_search') {
        if (searchMode === 'keyboard') {
          const totalKeys = WHEEL_KEYBOARD_TOKENS.length;
          const nextKeyIdx =
            (searchWheelKeyIndex + direction + totalKeys) % totalKeys;
          set({ searchWheelKeyIndex: nextKeyIdx });
        } else {
          const maxRow = Math.min(5, Math.max(0, searchResults.length - 1));
          const nextRowIdx = Math.max(
            0,
            Math.min(maxRow, searchFocusedResultIndex + direction)
          );
          set({ searchFocusedResultIndex: nextRowIdx });
        }
        return;
      }

      if (top.screenType === 'now_playing') {
        const activeProvider = musicProviders.getProvider(playback.activeSource);
        if (nowPlayingWheelMode === 'scrub') {
          const maxDuration = Math.max(1, playback.durationMs || 240000);
          const nextPos = Math.max(
            0,
            Math.min(maxDuration, playback.positionMs + direction * 5000)
          );
          set({
            playback: {
              ...playback,
              positionMs: nextPos,
            },
          });
          void activeProvider.seekTo(nextPos);
        } else {
          const nextVol = Math.max(
            0,
            Math.min(100, playback.volumePercent + direction * 4)
          );
          void activeProvider.setVolume(nextVol);
        }
        return;
      }

      const count = top.items.length;
      if (count === 0) return;
      const nextIndex = Math.max(0, Math.min(count - 1, top.focusedIndex + direction));
      if (nextIndex === top.focusedIndex) return;

      const updatedStack = [...stack];
      updatedStack[updatedStack.length - 1] = {
        ...top,
        focusedIndex: nextIndex,
      };
      set({ stack: updatedStack });
    },

    pressCenter: async () => {
      const {
        stack,
        nowPlayingWheelMode,
        searchMode,
        searchWheelKeyIndex,
        searchQuery,
        searchResults,
        searchFocusedResultIndex,
      } = get();
      if (stack.length === 0) return;
      const top = stack[stack.length - 1];

      if (top.screenType === 'wheel_search') {
        if (searchMode === 'keyboard') {
          const token = WHEEL_KEYBOARD_TOKENS[searchWheelKeyIndex];
          if (token === 'RESULTS') {
            if (searchResults.length > 0) {
              set({ searchMode: 'results', searchFocusedResultIndex: 0 });
            }
            return;
          }
          const nextQuery =
            token === 'DEL'
              ? searchQuery.slice(0, -1)
              : token === 'SPACE'
              ? `${searchQuery} `
              : `${searchQuery}${token}`;
          set({ searchQuery: nextQuery });
          await get().runFederatedSearch(nextQuery);
          return;
        } else {
          const pickedTrack = searchResults[searchFocusedResultIndex];
          if (pickedTrack) {
            const provider = musicProviders.getProvider(pickedTrack.source);
            await provider.playTrack(pickedTrack, searchResults);
            const nextPlayback = await provider.getPlaybackState();
            set({ playback: nextPlayback });
            get().openNowPlaying();
          }
          return;
        }
      }

      if (top.screenType === 'qr_auth') {
        await get().completeQRAuthSimulation();
        return;
      }

      if (top.screenType === 'now_playing') {
        set({
          nowPlayingWheelMode:
            nowPlayingWheelMode === 'volume' ? 'scrub' : 'volume',
        });
        return;
      }

      const activeItem = top.items[top.focusedIndex];
      if (activeItem) {
        await activeItem.onSelect();
      }
    },

    pressMenuBack: () => {
      const { stack, searchMode, nowPlayingWheelMode } = get();
      if (stack.length <= 1) return;
      const top = stack[stack.length - 1];

      if (top.screenType === 'now_playing' && nowPlayingWheelMode === 'scrub') {
        set({ nowPlayingWheelMode: 'volume' });
        return;
      }

      if (top.screenType === 'wheel_search' && searchMode === 'results') {
        set({ searchMode: 'keyboard' });
        return;
      }

      set({
        stack: stack.slice(0, -1),
        activeQRSession: null,
        nowPlayingWheelMode: 'volume',
      });
    },

    pressPlayPause: async () => {
      const { stack, searchMode, playback } = get();
      const top = stack[stack.length - 1];

      if (top?.screenType === 'wheel_search') {
        set({
          searchMode: searchMode === 'keyboard' ? 'results' : 'keyboard',
          searchFocusedResultIndex: 0,
        });
        return;
      }

      const provider = musicProviders.getProvider(playback.activeSource);
      await provider.togglePlayPause();
    },

    pressNext: async () => {
      const { playback } = get();
      const provider = musicProviders.getProvider(playback.activeSource);
      await provider.next();
    },

    pressPrevious: async () => {
      const { playback } = get();
      const provider = musicProviders.getProvider(playback.activeSource);
      await provider.previous();
    },

    pushMenu: (entry) => {
      set((state) => ({
        stack: [
          ...state.stack,
          {
            ...entry,
            focusedIndex: entry.focusedIndex ?? 0,
          },
        ],
      }));
    },

    openNowPlaying: () => {
      const { stack, playback } = get();
      const top = stack[stack.length - 1];
      set({ nowPlayingWheelMode: 'volume' });
      if (top?.screenType === 'now_playing') return;

      get().pushMenu({
        id: 'screen:now_playing',
        title: 'Now Playing',
        screenType: 'now_playing',
        providerBadge: playback.activeSource,
        items: [],
      });
    },

    openCoverFlow: async () => {
      const albums = await musicProviders.local.getAlbums();
      get().pushMenu({
        id: 'screen:cover_flow',
        title: 'Cover Flow',
        screenType: 'cover_flow',
        providerBadge: 'local',
        items: albums.map((album) => ({
          id: album.id,
          label: album.title,
          sublabel: album.artist,
          previewArtworkUri: album.artworkUri,
          onSelect: async () => {
            const tracks = await musicProviders.local.getAlbumTracks(album.id);
            pushTrackListMenu(album.title, 'local', tracks);
          },
        })),
      });
    },

    openWheelSearch: async () => {
      await get().runFederatedSearch(get().searchQuery);
      set({ searchMode: 'keyboard', searchWheelKeyIndex: 0 });
      get().pushMenu({
        id: 'screen:wheel_search',
        title: 'Search',
        screenType: 'wheel_search',
        items: [],
      });
    },

    runFederatedSearch: async (query) => {
      const [localRes, spotifyRes, appleRes] = await Promise.all([
        musicProviders.local.search(query),
        musicProviders.spotify.search(query),
        musicProviders.appleMusic.search(query),
      ]);

      const combined: Track[] = [
        ...localRes.tracks,
        ...spotifyRes.tracks,
        ...appleRes.tracks,
      ];
      set({
        searchResults: combined,
        searchFocusedResultIndex: 0,
      });
    },

    openProviderMenu: async (source) => {
      const provider = musicProviders.getProvider(source);
      const isAuthed = await provider.isAuthenticated();

      if (provider.requiresAuth && !isAuthed) {
        const qrSession = await provider.startQRAuthSession();
        set({ activeQRSession: qrSession });
        get().pushMenu({
          id: `qr:${source}`,
          title: `${provider.displayName} Sign In`,
          screenType: 'qr_auth',
          providerBadge: source,
          items: [],
        });
        return;
      }

      const [playlists, albums, likedTracks] = await Promise.all([
        provider.getPlaylists(),
        provider.getAlbums(),
        provider.getLikedTracks(),
      ]);

      const collageUris = albums
        .map((a) => a.artworkUri)
        .filter((u): u is string => Boolean(u));

      const previewKindForSource: PreviewPaneKind =
        source === 'spotify'
          ? 'spotify_hub'
          : source === 'apple_music'
          ? 'apple_music_hub'
          : 'album_collage';

      get().pushMenu({
        id: `provider:hub:${source}`,
        title: provider.displayName,
        screenType: 'split_menu',
        providerBadge: source,
        items: [
          {
            id: `${source}:playlists`,
            label: 'Playlists',
            sublabel: `${playlists.length} playlists`,
            hasChevron: true,
            previewKind: previewKindForSource,
            previewAlbumCollage: collageUris,
            onSelect: () => {
              get().pushMenu({
                id: `${source}:playlists:list`,
                title: `${provider.displayName} Playlists`,
                screenType: 'split_menu',
                providerBadge: source,
                items: playlists.map((pl) => ({
                  id: pl.id,
                  label: pl.name,
                  sublabel: pl.description || `${pl.trackCount} tracks`,
                  hasChevron: true,
                  previewKind: 'now_playing_artwork',
                  previewArtworkUri: pl.artworkUri,
                  onSelect: async () => {
                    const tracks = await provider.getPlaylistTracks(pl.id);
                    pushTrackListMenu(pl.name, source, tracks);
                  },
                })),
              });
            },
          },
          {
            id: `${source}:albums`,
            label: 'Albums',
            sublabel: `${albums.length} saved albums`,
            hasChevron: true,
            previewKind: 'album_collage',
            previewAlbumCollage: collageUris,
            onSelect: () => {
              get().pushMenu({
                id: `${source}:albums:list`,
                title: `${provider.displayName} Albums`,
                screenType: 'split_menu',
                providerBadge: source,
                items: albums.map((alb) => ({
                  id: alb.id,
                  label: alb.title,
                  sublabel: alb.artist,
                  hasChevron: true,
                  previewKind: 'now_playing_artwork',
                  previewArtworkUri: alb.artworkUri,
                  onSelect: async () => {
                    const tracks = await provider.getAlbumTracks(alb.id);
                    pushTrackListMenu(alb.title, source, tracks);
                  },
                })),
              });
            },
          },
          {
            id: `${source}:artists`,
            label: 'Artists',
            hasChevron: true,
            previewKind: previewKindForSource,
            onSelect: async () => {
              const artists = await provider.getArtists();
              get().pushMenu({
                id: `${source}:artists:list`,
                title: `${provider.displayName} Artists`,
                screenType: 'split_menu',
                providerBadge: source,
                items: artists.map((ar) => ({
                  id: ar.id,
                  label: ar.name,
                  sublabel: `${ar.albumCount ?? 1} albums`,
                  hasChevron: true,
                  previewKind: previewKindForSource,
                  onSelect: async () => {
                    const artistAlbums = await provider.getArtistAlbums(ar.id);
                    const tracks = await provider.getAlbumTracks(
                      artistAlbums[0]?.id ?? ''
                    );
                    pushTrackListMenu(ar.name, source, tracks);
                  },
                })),
              });
            },
          },
          {
            id: `${source}:liked`,
            label: source === 'spotify' ? 'Liked Songs' : 'Favorite Songs',
            sublabel: `${likedTracks.length} tracks`,
            hasChevron: true,
            previewKind: 'now_playing_artwork',
            previewArtworkUri: likedTracks[0]?.artworkUri,
            onSelect: () =>
              pushTrackListMenu(
                source === 'spotify' ? 'Liked Songs' : 'Favorite Songs',
                source,
                likedTracks
              ),
          },
          {
            id: `${source}:search`,
            label: 'Search',
            sublabel: 'Wheel Alphabet Keyboard',
            hasChevron: true,
            previewKind: previewKindForSource,
            onSelect: () => get().openWheelSearch(),
          },
        ],
      });
    },

    completeQRAuthSimulation: async () => {
      const { activeQRSession, stack } = get();
      if (!activeQRSession) return;
      const source = activeQRSession.provider;

      if (source === 'spotify') {
        musicProviders.spotify.simulateQRScanSuccess();
      } else if (source === 'apple_music') {
        musicProviders.appleMusic.simulateQRScanSuccess();
      }

      set({
        stack: stack.slice(0, -1),
        activeQRSession: null,
      });
      await get().openProviderMenu(source);
    },

    cycleTheme: () => {
      const current = get().themeMode;
      const nextIdx = (THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length;
      set({ themeMode: THEME_ORDER[nextIdx] });
    },

    cycleFontScale: () => {
      const current = get().fontScale;
      const nextIdx =
        (FONT_SCALE_ORDER.indexOf(current) + 1) % FONT_SCALE_ORDER.length;
      set({ fontScale: FONT_SCALE_ORDER[nextIdx] });
      refreshSettingsMenuInStack();
    },

    toggleWifi: () => {
      const next = !get().wifiEnabled;
      set({
        wifiEnabled: next,
        wifiConnected: next,
        connectedWifiSsid: next ? get().connectedWifiSsid : null,
      });
      void y1NativeAudio.setWifiEnabled(next);
      if (next) {
        void y1NativeAudio.openWifiSettings();
      }
      refreshSettingsMenuInStack();
    },

    connectWifiWithPassword: (ssid: string, password: string) => {
      const cleanSsid = ssid.trim();
      if (!cleanSsid) return;
      set({
        wifiEnabled: true,
        wifiConnected: true,
        connectedWifiSsid: cleanSsid,
      });
      void Y1AudioEngine.connectWifiWithPassword(cleanSsid, password);
      refreshSettingsMenuInStack();
    },

    toggleBluetooth: () => {
      const next = !get().bluetoothEnabled;
      set({ bluetoothEnabled: next, bluetoothConnected: next });
      void y1NativeAudio.setBluetoothEnabled(next);
      refreshSettingsMenuInStack();
    },

    cycleBrightness: () => {
      const current = get().brightnessLevel;
      const idx = BRIGHTNESS_ORDER.indexOf(
        current as (typeof BRIGHTNESS_ORDER)[number]
      );
      const next =
        BRIGHTNESS_ORDER[(idx === -1 ? 0 : idx + 1) % BRIGHTNESS_ORDER.length];
      set({ brightnessLevel: next });
      void y1NativeAudio.setBrightness(next);
      refreshSettingsMenuInStack();
    },

    cycleWheelVibration: () => {
      const current = get().wheelVibration;
      const nextIdx =
        (WHEEL_VIBRATION_ORDER.indexOf(current) + 1) %
        WHEEL_VIBRATION_ORDER.length;
      const next = WHEEL_VIBRATION_ORDER[nextIdx];
      set({ wheelVibration: next });
      void y1NativeAudio.setWheelVibration(next);
      refreshSettingsMenuInStack();
    },

    toggleWheelClickSound: () => {
      const next = !get().wheelClickSound;
      set({ wheelClickSound: next });
      void y1NativeAudio.setWheelClickSound(next);
      refreshSettingsMenuInStack();
    },

    toggleKeypadLock: () => {
      set((s) => ({ isKeypadLocked: !s.isKeypadLocked }));
      refreshSettingsMenuInStack();
    },

    toggleAutoKeypadLock1Min: () => {
      const next = !get().autoKeypadLock1Min;
      set({
        autoKeypadLock1Min: next,
        autoLockSeconds: next ? 60 : 0,
      });
      void Y1AudioEngine.setAutoKeypadLock1Min(next);
      refreshSettingsMenuInStack();
    },

    cycleAutoLockTimeout: () => {
      const current = get().autoLockSeconds;
      const idx = AUTO_LOCK_ORDER.indexOf(
        current as (typeof AUTO_LOCK_ORDER)[number]
      );
      const next =
        AUTO_LOCK_ORDER[(idx === -1 ? 0 : idx + 1) % AUTO_LOCK_ORDER.length];
      set({
        autoLockSeconds: next,
        autoKeypadLock1Min: next === 60,
      });
      refreshSettingsMenuInStack();
    },

    powerOffDevice: async () => {
      set({ isPoweredOff: true });
      await Y1AudioEngine.shutdownDevice();
    },

    exitToStockOS: async () => {
      await y1NativeAudio.exitToStockOS();
    },
  };
});
