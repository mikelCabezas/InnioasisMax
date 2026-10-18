/**
 * Sistema de Diseño de Y1 Max OS (Interfaz clásica Split-Screen para Innioasis Y1).
 * Optimizado para la pantalla LCD 480x360 (4:3) del Innioasis Y1.
 */

export type Y1ThemeMode = 'classic_color' | 'y1_mono_grey' | 'y1_backlit_blue' | 'y1_dark';

export interface Y1ThemePalette {
  id: Y1ThemeMode;
  name: string;
  background: string;
  surfaceRightPane: string;
  statusBarBgTop: string;
  statusBarBgBottom: string;
  statusBarBorder: string;
  textPrimary: string;
  textSecondary: string;
  textFocused: string;
  selectionGradientTop: string;
  selectionGradientBottom: string;
  selectionBorderTop: string;
  selectionBorderBottom: string;
  divider: string;
  accentLocal: string;
  accentSpotify: string;
  accentAppleMusic: string;
}

export const Y1_THEMES: Record<Y1ThemeMode, Y1ThemePalette> = {
  /**
   * Estética Clásica Split-Screen en color con barra de selección azul brillante
   */
  classic_color: {
    id: 'classic_color',
    name: 'Y1 Classic (Color)',
    background: '#FFFFFF',
    surfaceRightPane: '#F5F6F8',
    statusBarBgTop: '#F9FAFB',
    statusBarBgBottom: '#DCE1E7',
    statusBarBorder: '#A3ABB6',
    textPrimary: '#111418',
    textSecondary: '#636B75',
    textFocused: '#FFFFFF',
    selectionGradientTop: '#5CA4FF',
    selectionGradientBottom: '#1665D8',
    selectionBorderTop: '#3C89F5',
    selectionBorderBottom: '#0E4DA8',
    divider: '#E6E9EF',
    accentLocal: '#3A88FE',
    accentSpotify: '#1DB954',
    accentAppleMusic: '#FA243C',
  },

  /**
   * Paleta LCD Monocroma Clásica (Gris Oliva / Papel LCD)
   */
  y1_mono_grey: {
    id: 'y1_mono_grey',
    name: 'Y1 LCD Grey',
    background: '#E0E1D3',
    surfaceRightPane: '#D5D6C6',
    statusBarBgTop: '#E0E1D3',
    statusBarBgBottom: '#CFD0C0',
    statusBarBorder: '#47483B',
    textPrimary: '#47483B',
    textSecondary: '#6F705E',
    textFocused: '#E0E1D3',
    selectionGradientTop: '#47483B',
    selectionGradientBottom: '#47483B',
    selectionBorderTop: '#47483B',
    selectionBorderBottom: '#47483B',
    divider: '#C2C3B2',
    accentLocal: '#47483B',
    accentSpotify: '#47483B',
    accentAppleMusic: '#47483B',
  },

  /**
   * Paleta LCD con Retroiluminación Azul Fría
   */
  y1_backlit_blue: {
    id: 'y1_backlit_blue',
    name: 'Y1 Backlit Blue',
    background: '#D9E6F4',
    surfaceRightPane: '#CBE0F5',
    statusBarBgTop: '#D9E6F4',
    statusBarBgBottom: '#C1D7EE',
    statusBarBorder: '#353A76',
    textPrimary: '#353A76',
    textSecondary: '#5B629E',
    textFocused: '#D9E6F4',
    selectionGradientTop: '#353A76',
    selectionGradientBottom: '#282C5E',
    selectionBorderTop: '#353A76',
    selectionBorderBottom: '#282C5E',
    divider: '#B5CBE3',
    accentLocal: '#353A76',
    accentSpotify: '#353A76',
    accentAppleMusic: '#353A76',
  },

  /**
   * Modo Nocturno de alto contraste
   */
  y1_dark: {
    id: 'y1_dark',
    name: 'Y1 Dark Mode',
    background: '#0E1013',
    surfaceRightPane: '#15181D',
    statusBarBgTop: '#1E2229',
    statusBarBgBottom: '#12151A',
    statusBarBorder: '#2C313A',
    textPrimary: '#F0ECE8',
    textSecondary: '#8A919E',
    textFocused: '#FFFFFF',
    selectionGradientTop: '#3A88FE',
    selectionGradientBottom: '#1659C7',
    selectionBorderTop: '#569BFF',
    selectionBorderBottom: '#0E4299',
    divider: '#1E222A',
    accentLocal: '#3A88FE',
    accentSpotify: '#1B9E4B',
    accentAppleMusic: '#FA243C',
  },
};

export type Y1FontScale = 'compact' | 'normal' | 'large' | 'xl';

export interface Y1ScaledMetrics {
  screenWidth: number;
  screenHeight: number;
  statusBarHeight: number;
  visibleMenuRows: number;
  menuRowHeight: number;
  titleFontSize: number;
  labelFontSize: number;
  sublabelFontSize: number;
  badgeFontSize: number;
  chevronFontSize: number;
  statusBarFontSize: number;
  splitLeftRatio: number;
  splitRightRatio: number;
}

export const Y1_METRICS: Y1ScaledMetrics = {
  /** Resolución nativa del Innioasis Y1 (4:3 Landscape) */
  screenWidth: 480,
  screenHeight: 360,
  statusBarHeight: 28,
  /** Número de filas visibles por defecto ('large') para lectura cómoda en LCD 480x360 */
  visibleMenuRows: 6,
  menuRowHeight: 54,
  titleFontSize: 17,
  labelFontSize: 17,
  sublabelFontSize: 13,
  badgeFontSize: 13,
  chevronFontSize: 20,
  statusBarFontSize: 14,
  splitLeftRatio: 0.5,
  splitRightRatio: 0.5,
} as const;

const FONT_SCALE_PRESETS: Record<Y1FontScale, Y1ScaledMetrics> = {
  compact: {
    ...Y1_METRICS,
    visibleMenuRows: 8,
    menuRowHeight: 40,
    titleFontSize: 14,
    labelFontSize: 14,
    sublabelFontSize: 11,
    badgeFontSize: 11,
    chevronFontSize: 17,
    statusBarFontSize: 13,
  },
  normal: {
    ...Y1_METRICS,
    visibleMenuRows: 7,
    menuRowHeight: 46,
    titleFontSize: 15.5,
    labelFontSize: 15.5,
    sublabelFontSize: 12,
    badgeFontSize: 12,
    chevronFontSize: 18,
    statusBarFontSize: 13.5,
  },
  large: {
    ...Y1_METRICS,
  },
  xl: {
    ...Y1_METRICS,
    visibleMenuRows: 5,
    menuRowHeight: 64,
    titleFontSize: 19,
    labelFontSize: 19,
    sublabelFontSize: 14.5,
    badgeFontSize: 14,
    chevronFontSize: 22,
    statusBarFontSize: 15,
  },
};

export function getScaledMetrics(scale: Y1FontScale = 'large'): Y1ScaledMetrics {
  return FONT_SCALE_PRESETS[scale] ?? FONT_SCALE_PRESETS.large;
}
