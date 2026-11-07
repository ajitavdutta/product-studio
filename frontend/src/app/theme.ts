import { createTheme } from '@mui/material/styles';
import tokens from '../../../shared/design-tokens.json';

/**
 * The MUI theme, built only from `shared/design-tokens.json` (the same tokens the
 * export renderer reads). No colour, size or shadow is written here by hand.
 */

type StatusTokenKey = keyof typeof tokens.status;
type CamelCase<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;
export type StatusKey = CamelCase<StatusTokenKey>;
export type StatusPalette = Record<StatusKey, (typeof tokens.status)[StatusTokenKey]>;

function camelCase<S extends string>(key: S): CamelCase<S> {
  return key.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()) as CamelCase<S>;
}

function buildStatusPalette(): StatusPalette {
  const entries = Object.entries(tokens.status).map(([key, value]) => [camelCase(key), value]);
  return Object.fromEntries(entries) as StatusPalette;
}

const {
  primary,
  primaryHover,
  danger,
  success,
  warning,
  text,
  textSecondary,
  textMuted,
  background,
  surface,
  border,
  ...otherColors
} = tokens.color;

/** Every `color.*` token that has no standard MUI palette slot. */
export const neutralPalette = { muted: textMuted, ...otherColors };
export type NeutralPalette = typeof neutralPalette;

const { family, mono, size, weights } = tokens.font;

// Prototype `.eyebrow`: 11px, medium, letter-spaced capitals.
const EYEBROW_LETTER_SPACING = '0.6px';
const FOCUS_RING_WIDTH = 2;
const FOCUS_RING_OFFSET = 2;

export const custom = {
  radius: tokens.radius,
  shadow: tokens.shadow,
  layout: tokens.layout,
  // Use `theme.custom.media.mobile` for the 720px layout, never `theme.breakpoints.down(...)`.
  // MUI's breakpoints keep their defaults (600/900), and `down(n)` stops at n − 0.05px, so it
  // would exclude the boundary; the prototype's mobile layout includes 720px.
  media: { mobile: `@media (max-width:${String(tokens.layout.breakpointMobile)}px)` },
};
export type CustomTheme = typeof custom;

export const theme = createTheme({
  palette: {
    primary: { main: primary, dark: primaryHover },
    error: { main: danger },
    success: { main: success },
    warning: { main: warning },
    text: { primary: text, secondary: textSecondary },
    background: { default: background, paper: surface },
    divider: border,
    status: buildStatusPalette(),
    team: tokens.team,
    lane: tokens.lane,
    milestone: tokens.milestone,
    timeline: tokens.timeline,
    diagram: tokens.diagram,
    watermark: tokens.watermark,
    neutral: neutralPalette,
  },
  typography: {
    fontFamily: family,
    fontFamilyMono: mono,
    fontWeightRegular: weights.regular,
    fontWeightMedium: weights.medium,
    fontWeightBold: weights.bold,
    h1: { fontSize: size.h1, fontWeight: weights.medium },
    subtitle1: { fontSize: size.title, fontWeight: weights.medium },
    subtitle2: { fontSize: size.subtitle, fontWeight: weights.medium },
    body1: { fontSize: size.subtitle },
    body2: { fontSize: size.body },
    caption: { fontSize: size.caption },
    overline: {
      fontSize: size.eyebrow,
      fontWeight: weights.medium,
      letterSpacing: EYEBROW_LETTER_SPACING,
      lineHeight: 'normal',
    },
  },
  shape: { borderRadius: tokens.radius.sm },
  custom,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // NF-2: a visible focus ring on every keyboard-focused element.
        '*:focus-visible': {
          outline: `${String(FOCUS_RING_WIDTH)}px solid ${primary}`,
          outlineOffset: FOCUS_RING_OFFSET,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
        contained: { boxShadow: tokens.shadow.button },
      },
    },
    MuiMenu: { styleOverrides: { paper: { boxShadow: tokens.shadow.menu } } },
    MuiPopover: { styleOverrides: { paper: { boxShadow: tokens.shadow.menu } } },
    MuiDialog: { styleOverrides: { paper: { boxShadow: tokens.shadow.dialog } } },
  },
});
