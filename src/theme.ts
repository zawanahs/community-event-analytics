// Neutral default theme. Adopters can replace the core colors in config.ts or
// with Vite environment variables without changing chart code.

import { communityConfig } from './config';

export const C = {
  surface: communityConfig.branding.surface,
  card: communityConfig.branding.card,
  ink: communityConfig.branding.ink,
  ink2: '#55525e',
  muted: '#8a8781',
  grid: '#ece7ea',
  axis: '#c9c4c8',
  border: 'rgba(11, 11, 11, 0.10)',

  green: communityConfig.branding.chart[1],
  orange: communityConfig.branding.chart[2],
  blue: communityConfig.branding.chart[0],
  jasper: communityConfig.branding.chart[4],
  blueLight: communityConfig.branding.chart[3],
  notStated: '#bcb8c0', // neutral for "missing" buckets, deliberately low-chroma

  // brand originals, for chrome/headers only (outside the lightness band)
  brandGreen: communityConfig.branding.primary,
  brandBlue: communityConfig.branding.secondary,
  brandOrange: communityConfig.branding.accent,

  // sentiment wears status colors, never mixed with series in one chart
  pos: '#0B6E4F',
  neu: '#8a8781',
  neg: '#b23a20',
};

export const GENDER_ORDER = [...communityConfig.segments.gender.order];
export const GENDER_COLORS = {
  Female: C.blue,
  Male: C.orange,
  Other: C.green,
  'Not stated': C.notStated,
};

// Adjacent-pair order validated: blue, green, blueLight, orange, jasper (+ gray)
export const SECTOR_ORDER = [...communityConfig.segments.sector.order];
export const SECTOR_COLORS = {
  Private: C.blue,
  Public: C.green,
  Academia: C.blueLight,
  'Non-profit': C.orange,
  'Self-employed': C.jasper,
  'Not stated': C.notStated,
};

export const SENTIMENT_COLORS = { positive: C.pos, neutral: C.neu, negative: C.neg };

// Sequential blue ramp (single hue, monotone lightness) for the treemap
export const SEQ_BLUE = ['#bfd1f6', '#9cb7ef', '#7a9de6', '#5982dd', '#3663cf', '#1b49c5', '#0930a5'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// shared ECharts scaffolding, recessive grid/axes, ink text
export const baseAxis = {
  axisLine: { lineStyle: { color: C.axis } },
  axisTick: { show: false },
  axisLabel: { color: C.muted, fontFamily: FONT, fontSize: 11 },
  splitLine: { lineStyle: { color: C.grid } },
  nameTextStyle: { color: C.ink2, fontFamily: FONT, fontSize: 11 },
};

export const baseTooltip = {
  backgroundColor: '#ffffff',
  borderColor: C.border,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: C.ink, fontFamily: FONT, fontSize: 12 },
  extraCssText: 'box-shadow: 0 4px 16px rgba(11,11,11,0.12); border-radius: 8px;',
};

export const baseChart = {
  textStyle: { fontFamily: FONT, color: C.ink },
  animationDuration: 400,
};
