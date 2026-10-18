import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useY1Store } from '../../application/store/useY1Store';
import { PlaybackState } from '../../domain/models/music';
import { Y1ThemePalette } from '../theme/y1Theme';

interface NowPlayingProps {
  playback: PlaybackState;
  theme: Y1ThemePalette;
  wheelMode?: 'volume' | 'scrub';
}

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * NowPlaying: Pantalla "En Reproducción" clásica para Y1 Max OS (480x360).
 * - Izquierda: Carátula del álbum ampliada a 196x196 con sombra clásica.
 * - Derecha: Contador de pista (`1 of 12`), Título, Artista, Álbum, e indicador de fuente/calidad.
 * - Inferior: Única barra deslizante con transiciones suaves (`Animated.Value`):
 *   1. Barra de Posición de la Canción por defecto con bolita (escala `1.0` en reposo y `1.5` en modo `'scrub'`).
 *   2. Crossfade animado hacia la Barra de Volumen al girar la rueda en modo `'volume'`.
 */
export const NowPlaying: React.FC<NowPlayingProps> = ({
  playback,
  theme,
  wheelMode,
}) => {
  const storeWheelMode = useY1Store((s) => s.nowPlayingWheelMode);
  const activeWheelMode = wheelMode ?? storeWheelMode;
  const isScrubFocused = activeWheelMode === 'scrub';

  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const prevVolumeRef = useRef(playback.volumePercent);

  const track = playback.currentTrack;
  const progressRatio =
    playback.durationMs > 0
      ? Math.min(1, Math.max(0, playback.positionMs / playback.durationMs))
      : 0;
  const volumeRatio = Math.min(
    1,
    Math.max(0, (playback.volumePercent ?? 0) / 100)
  );
  const remainingMs = Math.max(0, playback.durationMs - playback.positionMs);

  const isVolumeBarVisible = !isScrubFocused && showVolumeOverlay;

  // Valores animados para el ancho de barra, escala de la bolita y crossfade entre canción/volumen
  const progressAnim = useRef(new Animated.Value(progressRatio)).current;
  const volumeAnim = useRef(new Animated.Value(volumeRatio)).current;
  const bolitaScaleAnim = useRef(
    new Animated.Value(isScrubFocused ? 1.5 : 1.0)
  ).current;
  const barCrossfadeAnim = useRef(
    new Animated.Value(isVolumeBarVisible ? 1 : 0)
  ).current;

  useEffect(() => {
    if (prevVolumeRef.current !== playback.volumePercent && !isScrubFocused) {
      prevVolumeRef.current = playback.volumePercent;
      setShowVolumeOverlay(true);
      const timer = setTimeout(() => setShowVolumeOverlay(false), 2200);
      return () => clearTimeout(timer);
    }
    prevVolumeRef.current = playback.volumePercent;
    return undefined;
  }, [playback.volumePercent, isScrubFocused]);

  useEffect(() => {
    if (isScrubFocused) {
      setShowVolumeOverlay(false);
    }
  }, [isScrubFocused]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressRatio,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [progressAnim, progressRatio]);

  useEffect(() => {
    Animated.timing(volumeAnim, {
      toValue: volumeRatio,
      duration: 140,
      useNativeDriver: false,
    }).start();
  }, [volumeAnim, volumeRatio]);

  useEffect(() => {
    Animated.spring(bolitaScaleAnim, {
      toValue: isScrubFocused ? 1.5 : 1.0,
      friction: 6,
      tension: 80,
      useNativeDriver: false,
    }).start();
  }, [bolitaScaleAnim, isScrubFocused]);

  useEffect(() => {
    Animated.timing(barCrossfadeAnim, {
      toValue: isVolumeBarVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [barCrossfadeAnim, isVolumeBarVisible]);

  const animatedProgressPercent = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const animatedVolumePercent = volumeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const songBarOpacity = barCrossfadeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const sourceLabel =
    playback.activeSource === 'spotify'
      ? 'Spotify Stream'
      : playback.activeSource === 'apple_music'
      ? 'Apple Music'
      : 'Local Audio';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Cuerpo Superior: Carátula 196x196 a la izquierda + Metadatos limpios a la derecha */}
      <View style={styles.upperRow}>
        <View style={styles.artworkColumn}>
          {track?.artworkUri ? (
            <Image
              source={{ uri: track.artworkUri }}
              style={styles.artworkImage}
            />
          ) : (
            <View
              style={[
                styles.artworkImage,
                styles.artworkFallback,
                { borderColor: theme.statusBarBorder },
              ]}
            >
              <Text style={{ fontSize: 44, color: theme.textSecondary }}>♫</Text>
            </View>
          )}
        </View>

        <View style={styles.metadataColumn}>
          <Text style={[styles.trackCounter, { color: theme.textSecondary }]}>
            {playback.queue.length > 0
              ? `${playback.currentQueueIndex + 1} of ${playback.queue.length}`
              : '1 of 1'}
          </Text>

          <Text
            numberOfLines={2}
            style={[styles.trackTitle, { color: theme.textPrimary }]}
          >
            {track?.title ?? 'Nothing Playing'}
          </Text>

          <Text
            numberOfLines={1}
            style={[styles.artistName, { color: theme.textSecondary }]}
          >
            {track?.artist ?? 'Select a song'}
          </Text>

          <Text
            numberOfLines={1}
            style={[styles.albumName, { color: theme.textSecondary }]}
          >
            {track?.album ?? ''}
          </Text>

          <View
            style={[
              styles.codecPill,
              {
                borderColor: theme.statusBarBorder,
                backgroundColor: theme.surfaceRightPane,
              },
            ]}
          >
            <Text style={[styles.codecText, { color: theme.textPrimary }]}>
              {sourceLabel} • {track?.codecLabel ?? 'PCM 16/44.1'}
            </Text>
          </View>
        </View>
      </View>

      {/* Única Barra Inferior con Crossfade Animado entre Posición de Canción y Volumen */}
      <View style={styles.bottomBarsSection}>
        {isVolumeBarVisible ? (
          <Animated.View
            style={[
              styles.barRowContainer,
              styles.focusedBarContainer,
              { borderColor: 'transparent', opacity: barCrossfadeAnim },
            ]}
          >
            <Text style={[styles.sideLabelText, { color: theme.textPrimary }]}>
              {playback.volumePercent === 0 ? '🔇' : '🔊'}
            </Text>

            <View style={styles.trackBarWrapper}>
              <View
                style={[
                  styles.trackBar,
                  {
                    borderColor: theme.statusBarBorder,
                    backgroundColor: theme.surfaceRightPane,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.trackFill,
                    { width: animatedVolumePercent },
                  ]}
                >
                  <LinearGradient
                    colors={[
                      theme.selectionGradientTop,
                      theme.selectionGradientBottom,
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                </Animated.View>
              </View>

              <Animated.View
                style={[
                  styles.volumeThumbHandle,
                  {
                    left: animatedVolumePercent,
                    borderColor: theme.selectionGradientBottom,
                  },
                ]}
              />
            </View>

            <Text style={[styles.sideLabelText, { color: theme.textPrimary }]}>
              {playback.volumePercent}%
            </Text>
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.barRowContainer,
              styles.focusedBarContainer,
              { borderColor: 'transparent', opacity: songBarOpacity },
            ]}
          >
            <Text
              style={[
                styles.sideLabelText,
                {
                  color: isScrubFocused
                    ? theme.textPrimary
                    : theme.textSecondary,
                },
              ]}
            >
              {formatDuration(playback.positionMs)}
            </Text>

            <View style={styles.trackBarWrapper}>
              <View
                style={[
                  styles.trackBar,
                  {
                    borderColor: isScrubFocused
                      ? theme.selectionGradientBottom
                      : theme.statusBarBorder,
                    backgroundColor: theme.surfaceRightPane,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.trackFill,
                    { width: animatedProgressPercent },
                  ]}
                >
                  <LinearGradient
                    colors={[
                      theme.selectionGradientTop,
                      theme.selectionGradientBottom,
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                </Animated.View>
              </View>

              <Animated.View
                style={[
                  styles.volumeThumbHandle,
                  {
                    left: animatedProgressPercent,
                    borderColor: theme.selectionGradientBottom,
                    backgroundColor: isScrubFocused
                      ? theme.selectionGradientBottom
                      : '#FFFFFF',
                    transform: [{ scale: bolitaScaleAnim }],
                  },
                ]}
              />
            </View>

            <Text
              style={[
                styles.sideLabelText,
                {
                  color: isScrubFocused
                    ? theme.textPrimary
                    : theme.textSecondary,
                },
              ]}
            >
              -{formatDuration(remainingMs)}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  upperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  artworkColumn: {
    marginRight: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  artworkImage: {
    width: 196,
    height: 196,
    borderRadius: 6,
  },
  artworkFallback: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metadataColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  trackCounter: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  trackTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  artistName: {
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 5,
  },
  albumName: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
  },
  codecPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  codecText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  bottomBarsSection: {
    marginTop: 14,
    paddingBottom: 8,
    gap: 6,
  },
  barRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  focusedBarContainer: {
    opacity: 1,
  },
  unfocusedBarContainer: {
    borderColor: 'transparent',
    opacity: 0.52,
  },
  sideLabelText: {
    fontSize: 11,
    fontWeight: '700',
    width: 40,
    textAlign: 'center',
  },
  trackBarWrapper: {
    flex: 1,
    height: 16,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBar: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
  },
  scrubDiamondHandle: {
    position: 'absolute',
    width: 12,
    height: 12,
    marginLeft: -6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  volumeThumbHandle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
  },
});
