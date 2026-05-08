/**
 * Acceptance token map transcribed from docs/DESIGN.md front matter.
 * These exports are contract scaffolding only; they do not implement a design system runtime.
 */
export const colors = {
  primary: '#24231E',
  background: '#F3F0E7',
  backgroundDark: '#171A18',
  surface: '#FBF8EF',
  surfaceActive: '#ECE6D8',
  surfaceDark: '#20231F',
  text: '#24231E',
  textDark: '#E8E2D4',
  muted: '#68645B',
  mutedDark: '#B8B1A2',
  border: '#D7D0C0',
  borderDark: '#3B3E37',
  accent: '#7A4600',
  accentContrast: '#FFF2D0',
  focus: '#2F6F7E',
  focusDark: '#8ED1DD',
  danger: '#9E2A20',
  warning: '#7E5B00',
  success: '#276749'
} as const;

export const typography = {
  chrome: "500 14px/20px 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  metadata: "500 12px/16px 'IBM Plex Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  feedTitle: "600 18px/24px Newsreader, Georgia, 'Times New Roman', serif",
  feedSummary: "400 14px/20px Newsreader, Georgia, 'Times New Roman', serif",
  payload: "400 18px/28px Newsreader, Georgia, 'Times New Roman', serif",
  sectionTitle: "600 24px/32px Newsreader, Georgia, 'Times New Roman', serif",
  inspectorTitle: "600 28px/32px Newsreader, Georgia, 'Times New Roman', serif",
  display: "700 32px/40px Newsreader, Georgia, 'Times New Roman', serif"
} as const;

export const rounded = {
  none: '0px',
  xs: '2px',
  sm: '4px',
  md: '8px',
  pill: '999px'
} as const;

export const spacing = {
  none: '0px',
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  row: '12px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  column: '64px'
} as const;

export const componentTokens = {
  appShell: {
    backgroundColor: colors.background,
    textColor: colors.primary,
    typography: typography.chrome,
    width: '100%',
    rounded: rounded.none
  },
  ownerTokenPrompt: {
    backgroundColor: colors.background,
    textColor: colors.text,
    typography: typography.chrome,
    padding: spacing.xl,
    rounded: rounded.none
  },
  firstUseEmpty: {
    backgroundColor: colors.background,
    textColor: colors.text,
    typography: typography.chrome,
    padding: spacing.xl,
    rounded: rounded.none
  },
  feedItem: {
    backgroundColor: colors.background,
    textColor: colors.text,
    typography: typography.feedTitle,
    padding: `${spacing.row} ${spacing.row} 11px 0`,
    rounded: rounded.none
  },
  inspectorPane: {
    backgroundColor: colors.surface,
    textColor: colors.text,
    typography: typography.payload,
    padding: spacing.xl,
    rounded: rounded.none
  },
  sourceLedger: {
    backgroundColor: colors.surface,
    textColor: colors.text,
    typography: typography.chrome,
    padding: spacing.md,
    rounded: rounded.none
  },
  statePortabilityWarning: {
    backgroundColor: colors.surface,
    textColor: colors.warning,
    typography: typography.chrome,
    padding: spacing.sm,
    rounded: rounded.none
  }
} as const;

export type ResoFeedColorToken = keyof typeof colors;
export type ResoFeedTypographyToken = keyof typeof typography;
export type ResoFeedSpacingToken = keyof typeof spacing;
