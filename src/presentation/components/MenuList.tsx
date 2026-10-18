import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useY1Store, Y1MenuItem } from '../../application/store/useY1Store';
import { getScaledMetrics, Y1_METRICS, Y1ThemePalette } from '../theme/y1Theme';

interface MenuListProps {
  items: Y1MenuItem[];
  focusedIndex: number;
  theme: Y1ThemePalette;
}

/**
 * MenuList: Lista de alta densidad estilo reproductor clásico para Y1 Max OS.
 * - Cero dependencia táctil: la ventana de visualización (`windowStart` -> `windowEnd`)
 *   desplaza automáticamente los ítems cuando el cursor controlado por la Click Wheel
 *   supera el número de filas visibles según la escala de fuente (`getScaledMetrics(fontScale)`).
 * - Barra de selección sólida con degradado azul clásico (o inversión LCD),
 *   texto blanco en peso semi-bold y chevron `>` a la derecha.
 * - Incluye la barra de desplazamiento vertical cuando hay más filas que las visibles.
 */
export const MenuList: React.FC<MenuListProps> = ({
  items,
  focusedIndex,
  theme,
}) => {
  const fontScale = useY1Store((s) => s.fontScale);
  const metrics = getScaledMetrics(fontScale);
  const maxVisible = metrics.visibleMenuRows;

  const { visibleItems, startIndex } = useMemo(() => {
    if (items.length <= maxVisible) {
      return { visibleItems: items, startIndex: 0 };
    }
    const halfWindow = Math.floor(maxVisible / 2);
    let start = Math.max(0, focusedIndex - halfWindow);
    if (start + maxVisible > items.length) {
      start = Math.max(0, items.length - maxVisible);
    }
    return {
      visibleItems: items.slice(start, start + maxVisible),
      startIndex: start,
    };
  }, [items, focusedIndex, maxVisible]);

  const showScrollbar = items.length > maxVisible;
  const scrollbarThumbHeightPct = showScrollbar
    ? Math.max(12, (maxVisible / items.length) * 100)
    : 100;
  const scrollbarThumbTopPct = showScrollbar
    ? (startIndex / Math.max(1, items.length - maxVisible)) *
      (100 - scrollbarThumbHeightPct)
    : 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.rowsContainer}>
        {visibleItems.map((item, localIdx) => {
          const globalIndex = startIndex + localIdx;
          const isFocused = globalIndex === focusedIndex;

          const rowContent = (
            <View style={styles.rowInner}>
              <View style={styles.textColumn}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.label,
                    {
                      fontSize: metrics.labelFontSize,
                      color: isFocused ? theme.textFocused : theme.textPrimary,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {item.sublabel ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.sublabel,
                      {
                        fontSize: metrics.sublabelFontSize,
                        color: isFocused
                          ? 'rgba(255,255,255,0.85)'
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {item.sublabel}
                  </Text>
                ) : null}
              </View>

              <View style={styles.rightAccessories}>
                {item.badgeText ? (
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        fontSize: metrics.badgeFontSize,
                        color: isFocused
                          ? theme.textFocused
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {item.badgeText}
                  </Text>
                ) : null}
                {item.hasChevron !== false && (
                  <Text
                    style={[
                      styles.chevron,
                      {
                        fontSize: metrics.chevronFontSize,
                        lineHeight: metrics.chevronFontSize + 2,
                        color: isFocused
                          ? theme.textFocused
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    ›
                  </Text>
                )}
              </View>
            </View>
          );

          if (isFocused) {
            return (
              <LinearGradient
                key={item.id}
                colors={[
                  theme.selectionGradientTop,
                  theme.selectionGradientBottom,
                ]}
                style={[
                  styles.row,
                  styles.focusedRow,
                  {
                    height: metrics.menuRowHeight,
                    borderTopColor: theme.selectionBorderTop,
                    borderBottomColor: theme.selectionBorderBottom,
                  },
                ]}
              >
                {rowContent}
              </LinearGradient>
            );
          }

          return (
            <View
              key={item.id}
              style={[
                styles.row,
                {
                  height: metrics.menuRowHeight,
                  borderBottomColor: theme.divider,
                },
              ]}
            >
              {rowContent}
            </View>
          );
        })}
      </View>

      {/* Barra de scroll vertical clásica */}
      {showScrollbar && (
        <View
          style={[
            styles.scrollbarTrack,
            {
              borderColor: theme.statusBarBorder,
              backgroundColor: theme.surfaceRightPane,
            },
          ]}
        >
          <LinearGradient
            colors={[theme.selectionGradientTop, theme.selectionGradientBottom]}
            style={[
              styles.scrollbarThumb,
              {
                height: `${scrollbarThumbHeightPct}%`,
                top: `${scrollbarThumbTopPct}%`,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  rowsContainer: {
    flex: 1,
  },
  row: {
    height: Y1_METRICS.menuRowHeight,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  focusedRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textColumn: {
    flex: 1,
    marginRight: 6,
  },
  label: {
    fontSize: Y1_METRICS.labelFontSize,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sublabel: {
    fontSize: Y1_METRICS.sublabelFontSize,
    fontWeight: '600',
    marginTop: 1,
  },
  rightAccessories: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badgeText: {
    fontSize: Y1_METRICS.badgeFontSize,
    fontWeight: '600',
  },
  chevron: {
    fontSize: Y1_METRICS.chevronFontSize,
    fontWeight: '800',
    lineHeight: 22,
  },
  scrollbarTrack: {
    width: 7,
    marginVertical: 3,
    marginRight: 2,
    borderWidth: 1,
    borderRadius: 3.5,
    overflow: 'hidden',
    position: 'relative',
  },
  scrollbarThumb: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 3,
  },
});
