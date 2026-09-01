import { Platform } from 'react-native';

/**
 * Grow design tokens — SPEC §28–29.
 *
 * Sleek, modern, premium, young, fresh, optimistic, tactile, alive, minimal.
 * NOT: old private banking, generic fintech, Binance, crypto casino, childish
 * gamification, Web3 dashboard, neon cyberpunk, luxury-gold wealth branding.
 *
 * Restrained palette — ONE growth accent is enough. No crypto-purple gradients.
 * Money is the protagonist: financial numbers never live in tiny dashboard cards.
 */

export const color = {
  /** Warm off-white ground. Organic, not clinical fintech white. */
  bg: '#FBFAF7',
  /**
   * The same ground at zero alpha, for gradients that fade INTO it.
   *
   * Not `'transparent'`: on several renderers that interpolates through black
   * and leaves a grey bruise halfway down the fade.
   */
  bgFade: 'rgba(251, 250, 247, 0)',
  surface: '#FFFFFF',
  /** Slightly sunken ground for locked and secondary regions. */
  sunken: '#F3F1EC',

  ink: '#14140F',
  inkMuted: '#6B6A61',
  inkFaint: '#A3A199',
  /** Locked milestones — present but clearly not yours yet. */
  inkLocked: '#C9C6BE',

  border: '#E9E6DF',
  borderStrong: '#DBD7CE',

  /** The single growth accent. Everything alive in Grow is this colour. */
  growth: '#0E9F6E',
  growthHover: '#0D9366',
  growthPressed: '#0B8259',
  growthSoft: '#E6F6EF',
  /**
   * The accent at a third strength, for showing what WOULD happen.
   *
   * Translucent rather than a lighter solid: it has to read as the same green
   * not yet earned, and it sits on the progress track where a fourth opaque
   * colour would just look like a second, different measurement.
   */
  growthGhost: 'rgba(14, 159, 110, 0.30)',
  growthMist: '#F1FAF6',

  onGrowth: '#FFFFFF',
  focusRing: '#087D58',

  /** Failure only. Never used for "money went down" — grown never decreases. */
  danger: '#C0392B',

  /**
   * The day's move on ONE position, up or down.
   *
   * ⚠️ Direction, not verdict, and the ONLY place in the app where red means
   * something other than failure. `danger` is for a thing the user must act on;
   * a position down 4% is not that, and painting it `danger` turns a remark into
   * an alarm. `marketUp` is deliberately NOT the growth accent either —
   * everything alive in Grow is that green, and lending it to a rising meme coin
   * would say the market is the thing growing.
   *
   * Use as an ACCENT ONLY: a rail and the figure itself. A whole sentence in
   * either colour is a verdict, and the one thing this notice may never be is a
   * wall in front of saving.
   */
  marketUp: '#12876A',
  marketDown: '#B4544A',

  /** Device frame chrome (web desktop only — never visible on a real phone). */
  frameShell: '#101014',
  frameAmbient: '#18241F',
} as const;

/**
 * Manrope — geometric, clean and modern without the anonymity of a default UI
 * face, and it holds a 64px balance figure without turning brittle.
 *
 * Loaded as a stylesheet in `app/+html.tsx`, so all four weights live under one
 * family and `fontWeight` keeps selecting between them. Undefined on native,
 * where nothing is loaded and an unknown family name is unpredictable.
 */
export const fontFamily = Platform.select({
  web: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  default: undefined,
});

/**
 * Type scale. Large and confident — `$847`, `71%`, `$53 left` instantly readable.
 * `display` is reserved for the grown total; nothing else may use it.
 */
export const font = {
  display: { fontFamily, fontSize: 64, lineHeight: 68, letterSpacing: -2 },
  xl: { fontFamily, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  lg: { fontFamily, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  md: { fontFamily, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontFamily, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
  small: { fontFamily, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Generous whitespace. Minimal information density. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

/**
 * Elevation, as `boxShadow` strings.
 *
 * The `shadow*` style props (shadowColor / shadowOpacity / shadowRadius /
 * shadowOffset) are deprecated in react-native-web and warn on every render;
 * `boxShadow` is the supported form. Kept here rather than inline so shadow
 * colour obeys the same rule as every other colour: it lives in the theme.
 *
 * Never used on the share card — html2canvas drops shadows entirely (Q16).
 */
export const shadow = {
  /** Collection cards: earned objects lift slightly off the ground. */
  card: '0px 8px 14px rgba(20, 20, 15, 0.05)',
  /** The unlock moment, which should feel like it arrived in front of you. */
  moment: '0px 18px 30px rgba(20, 20, 15, 0.10)',
  /** The desktop-only device frame sitting on its dark ground. */
  device: '0px 26px 42px rgba(20, 20, 15, 0.45)',
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 32,
  pill: 999,
} as const;

/**
 * Motion — SPEC §30. Core, not decoration.
 * Tree growth is cumulative: never replay a huge animation for every $1.
 */
export const motion = {
  microGrowMs: 900,
  unlockMs: 1600,
  transitionMs: 260,
  pressMs: 120,
} as const;

/** Reference viewport — iPhone portrait. SPEC §5. */
export const viewport = {
  width: 390,
  height: 844,
  /** At or below this width we are on a real phone: fill the screen, no frame. */
  frameBreakpoint: 480,
} as const;

export const theme = { color, font, weight, space, radius, shadow, motion, viewport } as const;
export type Theme = typeof theme;
