// Shared Recharts theme for the dark "charcoal + cyan" design system.
// Keep in sync with the palette defined in src/index.css (@theme block).

export const CHART_COLORS = {
  brand: '#55e6dc', // primary cyan
  brandSoft: '#2fafa6', // muted turquoise for secondary series
  teal: '#35cfc5', // turquoise
  silver: '#839296', // cool grey
  success: '#6be3a8', // refined green
  warning: '#f0c86a', // warm amber
  danger: '#f49a9a', // restrained coral
  info: '#7fd3f0', // sky
  violet: '#9c8ce0', // muted violet (never neon purple)
  purple: '#9c8ce0', // legacy alias
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
  grid: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.12)',
  tick: '#839296', // --color-slate-400
  label: '#a4b4b8', // --color-slate-500
};

export const TOOLTIP_STYLE = {
  backgroundColor: '#10191d',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '0.75rem',
  color: '#f2f7f7',
  boxShadow: '0 24px 48px -20px rgb(0 0 0 / 0.9)',
};

export const TOOLTIP_LABEL_STYLE = { color: '#a4b4b8' };
export const TOOLTIP_ITEM_STYLE = { color: '#f2f7f7' };
export const LEGEND_STYLE = { color: '#a4b4b8' };
export const PIE_LABEL_STYLE = { fill: '#bdcbce', fontSize: 12 };
