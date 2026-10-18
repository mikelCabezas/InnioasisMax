import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useY1Store } from '../../application/store/useY1Store';
import { useWheelNavigation } from '../../infrastructure/hardware/useWheelNavigation';
import { CoverFlow3D } from '../components/CoverFlow3D';
import { MenuList } from '../components/MenuList';
import { NowPlaying } from '../components/NowPlaying';
import { QRAuthModal } from '../components/QRAuthModal';
import { SplitScreenLayout } from '../components/SplitScreenLayout';
import { Y1StatusBar } from '../components/Y1StatusBar';
import { Y1WheelSearch } from '../components/Y1WheelSearch';
import { Y1_THEMES } from '../theme/y1Theme';

/**
 * Y1ShellScreen: Orquestador principal a pantalla completa (480x360) para el Innioasis Y1.
 * - Oculta cualquier barra de sistema de Android AOSP.
 * - Conecta el interceptor global de la Click Wheel (`useWheelNavigation`).
 * - Renderiza la cabecera fija `Y1StatusBar` y conmuta sin parpadeos entre:
 *   1. `SplitScreenLayout` (Menú Principal y Submenús con previsualización en la mitad derecha)
 *   2. `CoverFlow3D` (Navegación 3D horizontal de álbumes)
 *   3. `NowPlaying` (Vista de reproducción con barra de progreso, barra de volumen y contador `1 of N`)
 *   4. `QRAuthModal` (Emparejamiento sin teclado para Spotify y Apple Music)
 *   5. `Y1WheelSearch` (Teclado alfabético rotatorio para búsqueda federada en Local + Spotify + Apple Music)
 */
export const Y1ShellScreen: React.FC = () => {
  useWheelNavigation();

  const bootSystem = useY1Store((s) => s.bootSystem);
  const themeMode = useY1Store((s) => s.themeMode);
  const stack = useY1Store((s) => s.stack);
  const playback = useY1Store((s) => s.playback);
  const activeQRSession = useY1Store((s) => s.activeQRSession);
  const bluetoothConnected = useY1Store((s) => s.bluetoothConnected);
  const wifiConnected = useY1Store((s) => s.wifiConnected);
  const batteryPercent = useY1Store((s) => s.batteryPercent);

  const searchQuery = useY1Store((s) => s.searchQuery);
  const searchMode = useY1Store((s) => s.searchMode);
  const searchWheelKeyIndex = useY1Store((s) => s.searchWheelKeyIndex);
  const searchResults = useY1Store((s) => s.searchResults);
  const searchFocusedResultIndex = useY1Store((s) => s.searchFocusedResultIndex);

  useEffect(() => {
    void bootSystem();
  }, [bootSystem]);

  const theme = Y1_THEMES[themeMode];
  const currentEntry = stack[stack.length - 1];

  if (!currentEntry) {
    return <View style={[styles.viewport, { backgroundColor: theme.background }]} />;
  }

  const focusedItem = currentEntry.items[currentEntry.focusedIndex];
  const activeProviderBadge =
    currentEntry.providerBadge ?? playback.activeSource;

  const renderMainBody = () => {
    switch (currentEntry.screenType) {
      case 'cover_flow':
        return (
          <CoverFlow3D
            items={currentEntry.items}
            focusedIndex={currentEntry.focusedIndex}
            theme={theme}
          />
        );

      case 'now_playing':
        return <NowPlaying playback={playback} theme={theme} />;

      case 'qr_auth':
        if (activeQRSession) {
          return <QRAuthModal session={activeQRSession} theme={theme} />;
        }
        return null;

      case 'wheel_search':
        return (
          <Y1WheelSearch
            query={searchQuery}
            mode={searchMode}
            wheelKeyIndex={searchWheelKeyIndex}
            results={searchResults}
            focusedResultIndex={searchFocusedResultIndex}
            theme={theme}
          />
        );

      case 'split_menu':
      default:
        return (
          <SplitScreenLayout
            leftMenu={
              <MenuList
                items={currentEntry.items}
                focusedIndex={currentEntry.focusedIndex}
                theme={theme}
              />
            }
            focusedItem={focusedItem}
            playback={playback}
            theme={theme}
            bluetoothConnected={bluetoothConnected}
            wifiConnected={wifiConnected}
            batteryPercent={batteryPercent}
          />
        );
    }
  };

  return (
    <View style={[styles.viewport, { backgroundColor: theme.background }]}>
      <StatusBar hidden translucent />
      <Y1StatusBar
        title={currentEntry.title}
        isPlaying={playback.isPlaying}
        activeProvider={activeProviderBadge}
        bluetoothConnected={bluetoothConnected}
        wifiConnected={wifiConnected}
        batteryPercent={batteryPercent}
        theme={theme}
      />
      <View style={styles.bodyContainer}>{renderMainBody()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  bodyContainer: {
    flex: 1,
  },
});
