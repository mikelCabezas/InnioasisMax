import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { PlaybackState } from '../../domain/models/music';
import { Y1MenuItem } from '../../application/store/useY1Store';
import { Y1ThemePalette } from '../theme/y1Theme';

interface SplitScreenLayoutProps {
  leftMenu: React.ReactNode;
  focusedItem?: Y1MenuItem;
  playback: PlaybackState;
  theme: Y1ThemePalette;
  bluetoothConnected: boolean;
  wifiConnected: boolean;
  batteryPercent: number;
}

/**
 * SplitScreenLayout: Pilar visual principal de Y1 Max OS (Pantalla dividida 50/50).
 * - Mitad izquierda (50%): Lista de navegación controlada por la Click Wheel (`MenuList`).
 * - Mitad derecha (50%): Previsualización contextual dinámica según el ítem en foco:
 *   - Collage 2x2 de álbumes de la biblioteca (`album_collage`)
 *   - Carátula del álbum/pista en reproducción con sombra (`now_playing_artwork`)
 *   - Tarjeta de estado de Spotify (`spotify_hub`)
 *   - Tarjeta de estado de Apple Music (`apple_music_hub`)
 *   - Vista previa 3D de Cover Flow (`cover_flow_teaser`)
 *   - Diagnóstico de hardware del Innioasis Y1 (`device_status`)
 */
export const SplitScreenLayout: React.FC<SplitScreenLayoutProps> = ({
  leftMenu,
  focusedItem,
  playback,
  theme,
  bluetoothConnected,
  wifiConnected,
  batteryPercent,
}) => {
  const renderRightContextualPreview = () => {
    const kind = focusedItem?.previewKind ?? 'now_playing_artwork';
    const collage = focusedItem?.previewAlbumCollage ?? [];
    const singleArtwork =
      focusedItem?.previewArtworkUri ?? playback.currentTrack?.artworkUri;

    if (kind === 'album_collage' && collage.length >= 4) {
      return (
        <View style={styles.previewCenter}>
          <View style={styles.collageGrid}>
            {collage.slice(0, 4).map((uri, index) => (
              <Image
                key={`${uri}-${index}`}
                source={{ uri }}
                style={styles.collageTile}
              />
            ))}
          </View>
          <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>
            {focusedItem?.label}
          </Text>
          {focusedItem?.sublabel ? (
            <Text
              style={[styles.previewSubtitle, { color: theme.textSecondary }]}
            >
              {focusedItem.sublabel}
            </Text>
          ) : null}
        </View>
      );
    }

    if (kind === 'spotify_hub') {
      return (
        <View style={styles.previewCenter}>
          <View
            style={[
              styles.providerEmblem,
              { backgroundColor: theme.accentSpotify },
            ]}
          >
            <Text style={styles.providerEmblemGlyph}>(((•)))</Text>
            <Text style={styles.providerEmblemTitle}>Spotify</Text>
          </View>
          <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>
            Spotify Connect & Direct
          </Text>
          <Text
            style={[styles.previewSubtitle, { color: theme.textSecondary }]}
          >
            Ogg Vorbis 320kbps • Librespot Engine
          </Text>
        </View>
      );
    }

    if (kind === 'apple_music_hub') {
      return (
        <View style={styles.previewCenter}>
          <View
            style={[
              styles.providerEmblem,
              { backgroundColor: theme.accentAppleMusic },
            ]}
          >
            <Text style={styles.providerEmblemGlyph}>♫</Text>
            <Text style={styles.providerEmblemTitle}>Music</Text>
          </View>
          <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>
            Apple Music Lossless
          </Text>
          <Text
            style={[styles.previewSubtitle, { color: theme.textSecondary }]}
          >
            ALAC 24-bit/192kHz • MusicKit API
          </Text>
        </View>
      );
    }

    if (kind === 'cover_flow_teaser') {
      return (
        <View style={styles.previewCenter}>
          <View style={styles.coverFlowTeaserRow}>
            {collage.slice(0, 3).map((uri, idx) => (
              <Image
                key={`cf-${idx}`}
                source={{ uri }}
                style={[
                  styles.coverFlowTeaserCard,
                  idx === 0 && styles.coverFlowLeftCard,
                  idx === 1 && styles.coverFlowCenterCard,
                  idx === 2 && styles.coverFlowRightCard,
                ]}
              />
            ))}
          </View>
          <Text style={[styles.previewTitle, { color: theme.textPrimary }]}>
            Cover Flow
          </Text>
          <Text
            style={[styles.previewSubtitle, { color: theme.textSecondary }]}
          >
            Browse album art with Click Wheel
          </Text>
        </View>
      );
    }

    if (kind === 'device_status') {
      return (
        <View style={styles.previewCenter}>
          <View
            style={[
              styles.deviceCard,
              {
                borderColor: theme.statusBarBorder,
                backgroundColor: theme.background,
              },
            ]}
          >
            <Text style={[styles.deviceModelTitle, { color: theme.textPrimary }]}>
              INNIOASIS Y1 • Y1 MAX OS
            </Text>
            <Text style={[styles.deviceSpecLine, { color: theme.textSecondary }]}>
              Theme: {theme.name}
            </Text>
            <Text style={[styles.deviceSpecLine, { color: theme.textSecondary }]}>
              Bluetooth: {bluetoothConnected ? 'Connected (Wireless Audio)' : 'Off'}
            </Text>
            <Text style={[styles.deviceSpecLine, { color: theme.textSecondary }]}>
              Wi-Fi: {wifiConnected ? 'Connected (5GHz)' : 'Offline'}
            </Text>
            <Text style={[styles.deviceSpecLine, { color: theme.textSecondary }]}>
              Battery: {batteryPercent}% (Hi-Fi DAC Ready)
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.previewCenter}>
        {singleArtwork ? (
          <View style={styles.artworkShadowBox}>
            <Image source={{ uri: singleArtwork }} style={styles.singleArtwork} />
          </View>
        ) : (
          <View
            style={[
              styles.singleArtwork,
              styles.placeholderArtwork,
              { borderColor: theme.statusBarBorder },
            ]}
          >
            <Text style={[styles.placeholderNote, { color: theme.textSecondary }]}>
              ♫
            </Text>
          </View>
        )}
        <Text
          numberOfLines={1}
          style={[styles.previewTitle, { color: theme.textPrimary }]}
        >
          {playback.currentTrack?.title ?? focusedItem?.label ?? 'No Track Playing'}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.previewSubtitle, { color: theme.textSecondary }]}
        >
          {playback.currentTrack?.artist ?? focusedItem?.sublabel ?? 'Y1 Max Audio Engine'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.splitRoot}>
      {/* Mitad Izquierda (50%): Lista Clásica de Alta Densidad */}
      <View
        style={[
          styles.leftPane,
          {
            borderRightColor: theme.statusBarBorder,
            backgroundColor: theme.background,
          },
        ]}
      >
        {leftMenu}
      </View>

      {/* Mitad Derecha (50%): Previsualización Contextual */}
      <View
        style={[
          styles.rightPane,
          { backgroundColor: theme.surfaceRightPane },
        ]}
      >
        {renderRightContextualPreview()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  splitRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    width: '50%',
    height: '100%',
    borderRightWidth: 1,
  },
  rightPane: {
    width: '50%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  previewCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  artworkShadowBox: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 10,
  },
  singleArtwork: {
    width: 156,
    height: 156,
    borderRadius: 4,
  },
  placeholderArtwork: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  placeholderNote: {
    fontSize: 42,
  },
  collageGrid: {
    width: 156,
    height: 156,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 7,
    elevation: 5,
  },
  collageTile: {
    width: 78,
    height: 78,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  previewSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  providerEmblem: {
    width: 142,
    height: 142,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  providerEmblemGlyph: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  providerEmblemTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  coverFlowTeaserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 156,
    marginBottom: 10,
  },
  coverFlowTeaserCard: {
    width: 96,
    height: 96,
    borderRadius: 3,
  },
  coverFlowLeftCard: {
    transform: [{ scale: 0.82 }, { translateX: 18 }],
    opacity: 0.75,
  },
  coverFlowCenterCard: {
    width: 116,
    height: 116,
    zIndex: 2,
  },
  coverFlowRightCard: {
    transform: [{ scale: 0.82 }, { translateX: -18 }],
    opacity: 0.75,
  },
  deviceCard: {
    width: '100%',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    gap: 5,
  },
  deviceModelTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  deviceSpecLine: {
    fontSize: 11,
    fontWeight: '600',
  },
});
