import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useY1Store } from '../../application/store/useY1Store';
import { MusicSourceType } from '../../domain/models/music';
import { getScaledMetrics, Y1_METRICS, Y1ThemePalette } from '../theme/y1Theme';

interface Y1StatusBarProps {
  title: string;
  isPlaying: boolean;
  activeProvider: MusicSourceType;
  bluetoothConnected: boolean;
  wifiConnected: boolean;
  batteryPercent: number;
  isSyncingLibrary?: boolean;
  theme: Y1ThemePalette;
}

const STREAMING_SHORT_LABELS: Partial<Record<MusicSourceType, string>> = {
  spotify: 'SP',
  apple_music: 'AM',
};

/**
 * Y1StatusBar: Cabecera fija superior de 28px estilo reproductor clásico para el Innioasis Y1.
 * - Izquierda: Título de la sección actual en tipografía semi-bold legible.
 * - Derecha: Indicador de bloqueo de rueda (🔒), Badge de indexación activa ("SYNC ↻"),
 *   Indicador Play/Pause, Badge de streaming (si aplica), icono Bluetooth (`ᛒ` o `BT̸`),
 *   Wi-Fi (`≋` o `WiFi̸`) y batería con relleno proporcional.
 */
export const Y1StatusBar: React.FC<Y1StatusBarProps> = ({
  title,
  isPlaying,
  activeProvider,
  bluetoothConnected,
  wifiConnected,
  batteryPercent,
  isSyncingLibrary: isSyncingProp,
  theme,
}) => {
  const storeIsSyncing = useY1Store((s) => s.isSyncingLibrary);
  const fontScale = useY1Store((s) => s.fontScale);
  const wifiEnabled = useY1Store((s) => s.wifiEnabled);
  const bluetoothEnabled = useY1Store((s) => s.bluetoothEnabled);
  const isKeypadLocked = useY1Store((s) => s.isKeypadLocked);
  const isSyncingLibrary = isSyncingProp ?? storeIsSyncing;
  const metrics = getScaledMetrics(fontScale);

  const [currentTime, setCurrentTime] = React.useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  React.useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      );
    };
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const streamingLabel = STREAMING_SHORT_LABELS[activeProvider];
  const providerColor =
    activeProvider === 'spotify'
      ? theme.accentSpotify
      : theme.accentAppleMusic;

  return (
    <LinearGradient
      colors={[theme.statusBarBgTop, theme.statusBarBgBottom]}
      style={[
        styles.container,
        {
          height: metrics.statusBarHeight,
          borderBottomColor: theme.statusBarBorder,
        },
      ]}
    >
      {/* Título de la sección a la izquierda */}
      <Text
        numberOfLines={1}
        style={[
          styles.titleText,
          {
            color: theme.textPrimary,
            fontSize: metrics.statusBarFontSize,
          },
        ]}
      >
        {title}
      </Text>

      {/* Iconos de estado del sistema a la derecha */}
      <View style={styles.rightCluster}>
        {/* Candado de bloqueo de botonera / Hold */}
        {isKeypadLocked && (
          <Text style={[styles.lockGlyph, { color: theme.accentLocal }]}>
            🔒
          </Text>
        )}

        {/* Badge de indexación de biblioteca activa */}
        {isSyncingLibrary && (
          <View
            style={[
              styles.syncBadge,
              { backgroundColor: theme.selectionGradientBottom },
            ]}
          >
            <Text style={styles.syncBadgeText}>SYNC ↻</Text>
          </View>
        )}

        {/* Indicador Play / Pause clásico */}
        <Text style={[styles.playGlyph, { color: theme.accentLocal }]}>
          {isPlaying ? '▶' : '❚❚'}
        </Text>

        {/* Píldora del proveedor de streaming activo (sin badge 'LOCAL SD' ya que el Y1 tiene una única unidad) */}
        {streamingLabel ? (
          <View
            style={[styles.providerBadge, { backgroundColor: providerColor }]}
          >
            <Text style={styles.providerBadgeText}>{streamingLabel}</Text>
          </View>
        ) : null}

        {/* Indicador Bluetooth (tachado BT̸ cuando está desactivado) */}
        {bluetoothEnabled ? (
          bluetoothConnected ? (
            <Text style={[styles.statusGlyph, { color: theme.textPrimary }]}>
              ᛒ
            </Text>
          ) : null
        ) : (
          <Text
            style={[
              styles.statusGlyphDisabled,
              { color: theme.textSecondary },
            ]}
          >
            BT̸
          </Text>
        )}

        {/* Indicador Wi-Fi (tachado WiFi̸ cuando está desactivado) */}
        {wifiEnabled ? (
          wifiConnected ? (
            <Text style={[styles.statusGlyph, { color: theme.textPrimary }]}>
              ≋
            </Text>
          ) : null
        ) : (
          <Text
            style={[
              styles.statusGlyphDisabled,
              { color: theme.textSecondary },
            ]}
          >
            WiFi̸
          </Text>
        )}

        {/* Icono de Batería Clásico */}
        <View style={styles.batteryWrapper}>
          <View
            style={[
              styles.batteryBody,
              { borderColor: theme.textPrimary },
            ]}
          >
            <View
              style={[
                styles.batteryFill,
                {
                  width: `${Math.max(10, Math.min(100, batteryPercent))}%`,
                  backgroundColor:
                    batteryPercent > 20 ? '#24B44C' : '#E53935',
                },
              ]}
            />
          </View>
          <View
            style={[
              styles.batteryTip,
              { backgroundColor: theme.textPrimary },
            ]}
          />
        </View>

        {/* Hora actual HH:mm a la derecha de la batería */}
        <Text
          style={[
            styles.timeText,
            {
              color: theme.textPrimary,
              fontSize: metrics.statusBarFontSize * 0.95,
            },
          ]}
        >
          {currentTime}
        </Text>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    height: Y1_METRICS.statusBarHeight,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  titleText: {
    fontSize: Y1_METRICS.statusBarFontSize,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
    marginRight: 8,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  lockGlyph: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  syncBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  syncBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  playGlyph: {
    fontSize: 10,
    fontWeight: '800',
  },
  providerBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  providerBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusGlyph: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusGlyphDisabled: {
    fontSize: 9.5,
    fontWeight: '800',
    opacity: 0.72,
  },
  batteryWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryBody: {
    width: 22,
    height: 11,
    borderWidth: 1.2,
    borderRadius: 2,
    padding: 1.2,
    justifyContent: 'center',
  },
  batteryFill: {
    height: '100%',
    borderRadius: 1,
  },
  batteryTip: {
    width: 2,
    height: 5,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
    marginLeft: 0.5,
  },
  timeText: {
    fontWeight: '700',
    letterSpacing: -0.2,
    marginLeft: 3,
  },
});
