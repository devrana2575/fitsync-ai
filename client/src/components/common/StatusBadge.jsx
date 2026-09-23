const TONE_MAP = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  brand: 'badge-brand',
  muted: 'badge-muted',
  dark: 'badge-dark',
};

/* Maps business status values to a consistent tone so color alone never
   carries meaning (accessibility) — the label text is always shown. */
const STATUS_TONE = {
  // membership
  ACTIVE: 'success',
  PENDING: 'warning',
  EXPIRED: 'muted',
  CANCELLED: 'danger',
  SUSPENDED: 'danger',
  // payment
  COMPLETED: 'success',
  FAILED: 'danger',
  REFUNDED: 'warning',
  // goals
  PAUSED: 'warning',
  // user / general
  true: 'success',
  false: 'muted',
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
  yes: 'success',
  no: 'muted',
};

const STATUS_LABEL = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  SUSPENDED: 'Suspended',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PAUSED: 'Paused',
  PAID: 'Paid',
  PARTIAL: 'Partial',
  UNPAID: 'Unpaid',
};

const toSentence = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return '—';
  return s.toLowerCase().replace(/_/g, ' ').replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
};

export default function StatusBadge({ value, tone, label }) {
  if (value === null || value === undefined || value === '') return null;
  const toneClass = tone || TONE_MAP[STATUS_TONE[value] || STATUS_TONE[String(value).toLowerCase()] || 'muted'] || 'badge-muted';
  const text = label !== undefined ? label : STATUS_LABEL[value] || toSentence(value);
  return <span className={toneClass}>{text}</span>;
}