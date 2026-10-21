/** Spacing on a 4-point grid, in density-independent pixels. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  /** Buttons, inputs, small tiles. */
  lg: 12,
  /** Cards and sheets. */
  xl: 20,
  full: 9999,
} as const;

/** Minimum size of anything tappable (WCAG 2.5.5, Apple HIG: 44×44 pt). */
export const touchTarget = {
  min: 44,
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;
