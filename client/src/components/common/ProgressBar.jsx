/* Bar showing progress toward a goal/level. `value` clamped 0-100. */
export default function ProgressBar({ value = 0, tone = 'brand', className = '', label }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const toneClasses = {
    brand: 'bg-brand-500',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    muted: 'bg-slate-300',
  };
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-500">{label}</span>
          <span className="text-xs font-semibold text-slate-400 tabular-nums">{Math.round(clamped)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${toneClasses[tone] || toneClasses.brand}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}