// Shared Recharts theme for the light "professional" design system.
// Keep in sync with the palette defined in src/index.css (@theme block).

export const CHART_COLORS = {
  brand: '#2554d8', // --color-brand-600
  brandSoft: '#8fb0f7', // --color-brand-300
  success: '#15803d', // --color-success
  warning: '#b45309', // --color-warning
  danger: '#dc2626', // --color-danger
  info: '#1d6fd6', // --color-info
  purple: '#7c3aed', // tailwind violet-600
};

export const SERIES_COLORS = [
  CHART_COLORS.brand,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.info,
  CHART_COLORS.purple,
];

export const AXIS = {
  grid: '#e4e8ee', // --color-border
  axis: '#cfd6df', // --color-border-strong
  tick: '#64748b', // --color-slate-500
  label: '#334155', // --color-slate-700
};

export const TOOLTIP_STYLE = {
  backgroundColor: '#ffffff',
  border: '1px solid #e4e8ee',
  borderRadius: '0.75rem',
  color: '#0f172a',
  boxShadow: '0 20px 40px -16px rgb(15 23 42 / 0.18)',
};

export const TOOLTIP_LABEL_STYLE = { color: '#475569' };
export const TOOLTIP_ITEM_STYLE = { color: '#0f172a' };
export const LEGEND_STYLE = { color: '#475569' };
