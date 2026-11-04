// Shared Recharts theme for the dark "graphite + steel blue" design system.
// Keep in sync with the palette defined in src/index.css (@theme block).

export const CHART_COLORS = {
  brand: '#5aa9ff', // vivid steel blue
  brandSoft: '#4b7fb8', // subdued blue for inactive series
  teal: '#3ecfbf', // bright teal
  silver: '#b8c5d6', // cool silver
  success: '#72d98d', // vivid green
  warning: '#f5b74e', // warm amber
  danger: '#f27f7f', // coral red
  info: '#7cc7ff', // light sky blue
  violet: '#b3a0e0', // soft lavender (never neon purple)
  purple: '#b3a0e0', // legacy alias
};

export const SERIES_COLORS = [
  CHART_COLORS.brand,
  CHART_COLORS.teal,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.success,
  CHART_COLORS.violet,
  CHART_COLORS.silver,
];

export const AXIS = {
  grid: '#303b48', // --color-border-subtle
  axis: '#455365', // --color-border-strong
  tick: '#aab5c2', // --color-slate-500
  label: '#d0d7e0', // --color-slate-600
};

export const TOOLTIP_STYLE = {
  backgroundColor: '#303b48',
  border: '1px solid #455365',
  borderRadius: '0.75rem',
  color: '#f3f5f7',
  boxShadow: '0 20px 40px -16px rgb(0 0 0 / 0.65)',
};

export const TOOLTIP_LABEL_STYLE = { color: '#aab5c2' };
export const TOOLTIP_ITEM_STYLE = { color: '#f3f5f7' };
export const LEGEND_STYLE = { color: '#aab5c2' };
export const PIE_LABEL_STYLE = { fill: '#d0d7e0', fontSize: 12 };
