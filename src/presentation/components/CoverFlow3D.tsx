import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Y1MenuItem } from '../../application/store/useY1Store';
import { Y1ThemePalette } from '../theme/y1Theme';

export interface CoverFlowProps {
  items: Y1MenuItem[];
  focusedIndex: number;
  theme: Y1ThemePalette;
}

/**
 * CoverFlow3D: Vista horizontal 3D de carátulas de álbumes navegable con la Click Wheel del Innioasis Y1.
 * - El álbum central seleccionado (`offset === 0`) posee el mayor `zIndex` (`100`), mayor `elevation` vertical
 *   y se renderiza al final de la pila 3D para que el álbum siguiente (`offset === 1`) jamás se superponga encima.
 * - Al pulsar el botón Central (`CENTER`), se abre la lista de canciones del álbum seleccionado.
 */
export const CoverFlow3D: React.FC<CoverFlowProps> = ({
  items,
  focusedIndex,
  theme,
}) => {
  const activeItem = items[focusedIndex];

  const visibleEntries = items
    .map((item, idx) => ({ item, offset: idx - focusedIndex }))
    .filter(({ offset }) => Math.abs(offset) <= 3)
    // Ordenar de mayor distancia al centro a menor para que offset === 0 quede siempre encima en Android/iOS/Web
    .sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.stage3D}>
        {visibleEntries.map(({ item, offset }) => {
          const isCenter = offset === 0;
          const sign = offset < 0 ? -1 : 1;
          const translateX = isCenter
            ? 0
            : sign * (38 + Math.abs(offset) * 54);
          const translateY = isCenter ? -6 : 4;
          const scale = isCenter
            ? 1.14
            : Math.max(0.68, 0.86 - Math.abs(offset) * 0.08);
          const rotateY =
            offset < 0 ? '48deg' : offset > 0 ? '-48deg' : '0deg';
          const zIndex = isCenter ? 100 : 10 - Math.abs(offset);
          const elevation = isCenter ? 24 : Math.max(1, 8 - Math.abs(offset));

          return (
            <View
              key={item.id}
              style={[
                styles.coverSlot,
                isCenter && styles.centerSlotShadow,
                {
                  zIndex,
                  elevation,
                  transform: [
                    { perspective: 650 },
                    { translateX },
                    { translateY },
                    { scale },
                    { rotateY },
                  ],
                },
              ]}
            >
              {item.previewArtworkUri ? (
                <Image
                  source={{ uri: item.previewArtworkUri }}
                  style={styles.coverImage}
                />
              ) : (
                <View
                  style={[
                    styles.coverImage,
                    { backgroundColor: theme.surfaceRightPane },
                  ]}
                />
              )}
              {/* Reflejo inferior clásico */}
              {item.previewArtworkUri ? (
                <Image
                  source={{ uri: item.previewArtworkUri }}
                  style={styles.reflectionImage}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Metadatos del Álbum en Foco */}
      <View style={styles.captionBar}>
        <Text
          numberOfLines={1}
          style={[styles.albumTitle, { color: theme.textPrimary }]}
        >
          {activeItem?.label ?? 'No Albums'}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.artistName, { color: theme.textSecondary }]}
        >
          {activeItem?.sublabel ?? ''}
        </Text>
      </View>
    </View>
  );
};

export const CoverFlow = CoverFlow3D;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  stage3D: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  coverSlot: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerSlotShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
  },
  coverImage: {
    width: 144,
    height: 144,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  reflectionImage: {
    width: 144,
    height: 36,
    marginTop: 2,
    opacity: 0.18,
    transform: [{ scaleY: -1 }],
  },
  captionBar: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  albumTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  artistName: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
