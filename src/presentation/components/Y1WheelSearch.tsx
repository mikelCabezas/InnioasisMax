import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Track } from '../../domain/models/music';
import { Y1ThemePalette } from '../theme/y1Theme';

export const WHEEL_KEYBOARD_TOKENS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'SPACE', 'DEL', 'RESULTS',
] as const;

interface Y1WheelSearchProps {
  query: string;
  mode: 'keyboard' | 'results';
  wheelKeyIndex: number;
  results: Track[];
  focusedResultIndex: number;
  theme: Y1ThemePalette;
}

const SOURCE_BADGE_MAP: Record<Track['source'], string> = {
  local: 'SD',
  spotify: 'SP',
  apple_music: 'AM',
};

/**
 * Y1WheelSearch: Teclado alfabético en cinta horizontal controlado por la Click Wheel del Innioasis Y1
 * con búsqueda federada en vivo sobre SQLite FTS5 (Local), Spotify API y Apple Music API.
 */
export const Y1WheelSearch: React.FC<Y1WheelSearchProps> = ({
  query,
  mode,
  wheelKeyIndex,
  results,
  focusedResultIndex,
  theme,
}) => {
  const visibleRadius = 5;
  const totalKeys = WHEEL_KEYBOARD_TOKENS.length;
  const visibleKeys: Array<{ token: string; globalIdx: number }> = [];

  for (let offset = -visibleRadius; offset <= visibleRadius; offset++) {
    const idx = (wheelKeyIndex + offset + totalKeys) % totalKeys;
    visibleKeys.push({
      token: WHEEL_KEYBOARD_TOKENS[idx],
      globalIdx: idx,
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Cabecera de Búsqueda: Campo de texto actual + Indicador de modo */}
      <View
        style={[
          styles.queryBar,
          {
            borderColor: theme.statusBarBorder,
            backgroundColor: theme.surfaceRightPane,
          },
        ]}
      >
        <Text style={[styles.searchIcon, { color: theme.textSecondary }]}>
          ⌕
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.queryText, { color: theme.textPrimary }]}
        >
          {query || 'Rotate wheel to type...'}
          <Text style={{ color: theme.accentLocal }}>|</Text>
        </Text>
        <View
          style={[
            styles.modeBadge,
            {
              backgroundColor:
                mode === 'keyboard'
                  ? theme.selectionGradientBottom
                  : theme.accentSpotify,
            },
          ]}
        >
          <Text style={styles.modeBadgeText}>
            {mode === 'keyboard' ? 'WHEEL KEYBOARD' : 'RESULTS LIST'}
          </Text>
        </View>
      </View>

      {/* Cinta Alfabética Horizontal gobernada por la Click Wheel */}
      <View
        style={[
          styles.ribbonContainer,
          {
            borderBottomColor: theme.statusBarBorder,
            backgroundColor: theme.surfaceRightPane,
          },
        ]}
      >
        {visibleKeys.map(({ token, globalIdx }, posIdx) => {
          const isFocusedKey =
            mode === 'keyboard' && posIdx === visibleRadius;

          const label =
            token === 'SPACE'
              ? '␣'
              : token === 'DEL'
              ? '⌫'
              : token === 'RESULTS'
              ? 'DONE ↵'
              : token;

          if (isFocusedKey) {
            return (
              <LinearGradient
                key={`${token}-${globalIdx}-${posIdx}`}
                colors={[
                  theme.selectionGradientTop,
                  theme.selectionGradientBottom,
                ]}
                style={[
                  styles.keyCap,
                  styles.focusedKeyCap,
                  token === 'RESULTS' && styles.wideKeyCap,
                ]}
              >
                <Text style={[styles.keyText, { color: theme.textFocused }]}>
                  {label}
                </Text>
              </LinearGradient>
            );
          }

          return (
            <View
              key={`${token}-${globalIdx}-${posIdx}`}
              style={[
                styles.keyCap,
                token === 'RESULTS' && styles.wideKeyCap,
              ]}
            >
              <Text style={[styles.keyText, { color: theme.textPrimary }]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Lista Federada de Resultados (Local SD + Spotify + Apple Music) */}
      <View style={styles.resultsArea}>
        {results.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
              No matching songs for "{query}"
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Searching across Local microSD (FTS5), Spotify & Apple Music
            </Text>
          </View>
        ) : (
          results.slice(0, 6).map((track, idx) => {
            const isFocusedRow =
              mode === 'results' && idx === focusedResultIndex;
            const badgeColor =
              track.source === 'spotify'
                ? theme.accentSpotify
                : track.source === 'apple_music'
                ? theme.accentAppleMusic
                : theme.accentLocal;

            const inner = (
              <View style={styles.resultRowInner}>
                <View
                  style={[styles.sourceTag, { backgroundColor: badgeColor }]}
                >
                  <Text style={styles.sourceTagText}>
                    {SOURCE_BADGE_MAP[track.source]}
                  </Text>
                </View>

                <View style={styles.resultTextCol}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.resultTitle,
                      {
                        color: isFocusedRow
                          ? theme.textFocused
                          : theme.textPrimary,
                      },
                    ]}
                  >
                    {track.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.resultMeta,
                      {
                        color: isFocusedRow
                          ? 'rgba(255,255,255,0.85)'
                          : theme.textSecondary,
                      },
                    ]}
                  >
                    {track.artist} • {track.album}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.chevron,
                    {
                      color: isFocusedRow
                        ? theme.textFocused
                        : theme.textSecondary,
                    },
                  ]}
                >
                  ›
                </Text>
              </View>
            );

            if (isFocusedRow) {
              return (
                <LinearGradient
                  key={track.id}
                  colors={[
                    theme.selectionGradientTop,
                    theme.selectionGradientBottom,
                  ]}
                  style={styles.resultRow}
                >
                  {inner}
                </LinearGradient>
              );
            }

            return (
              <View
                key={track.id}
                style={[
                  styles.resultRow,
                  { borderBottomColor: theme.divider },
                ]}
              >
                {inner}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  queryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 6,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 5,
    borderWidth: 1,
  },
  searchIcon: {
    fontSize: 14,
    fontWeight: '800',
    marginRight: 6,
  },
  queryText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  modeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  modeBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  ribbonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    marginTop: 6,
    borderBottomWidth: 1,
    paddingHorizontal: 6,
    gap: 4,
  },
  keyCap: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideKeyCap: {
    minWidth: 58,
  },
  focusedKeyCap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  keyText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  resultsArea: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 11,
    marginTop: 4,
  },
  resultRow: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceTag: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    marginRight: 8,
  },
  sourceTagText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
  },
  resultTextCol: {
    flex: 1,
    marginRight: 6,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultMeta: {
    fontSize: 10,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 16,
    fontWeight: '800',
  },
});
