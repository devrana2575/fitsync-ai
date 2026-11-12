// Shared Recharts theme for the light "slate + steel blue" design system.
// Keep in sync with the palette defined in src/index.css (@theme block).

export const CHART_COLORS = {
  brand: '#2f6fae', // steel blue
  brandSoft: '#7ea7cc', // muted blue for inactive series
  teal: '#0e8f83', // deep teal
  silver: '#94a3b8', // cool silver
  success: '#15803d', // green
  warning: '#b45309', // amber
  danger: '#dc2626', // red
  info: '#1d6fb8', // sky blue
  violet: '#7c6bb0', // muted violet (never neon purple)
  purple: '#7c6bb0', // legacy alias
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
  grid: '#e2e8f0', // --color-border
  axis: '#cbd5e1', // --color-border-strong
  tick: '#5b6879', // --color-slate-500
  label: '#475569', // --color-slate-600
};

export const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '0.75rem',
  color: '#0f172a',
  boxShadow: '0 10px 30px -12px rgb(15 23 42 / 0.35)',
};

export const TOOLTIP_LABEL_STYLE = { color: '#64748b' };
export const TOOLTIP_ITEM_STYLE = { color: '#0f172a' };
export const LEGEND_STYLE = { color: '#64748b' };
export const PIE_LABEL_STYLE = { fill: '#475569', fontSize: 12 };
