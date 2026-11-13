/* Bar showing progress toward a goal/level. `value` clamped 0-100.
   `segments` renders a segmented meter (illuminated blocks) instead of a
   continuous bar — the accessible progressbar semantics stay identical. */
export default function ProgressBar({ value = 0, tone = 'brand', className = '', label, segments = 0 }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const toneClasses = {
    brand: 'bg-gradient-to-r from-brand-600 to-brand-500 shadow-[0_0_12px_rgba(85,230,220,0.35)]',
    success: 'bg-gradient-to-r from-success/70 to-success',
    warning: 'bg-gradient-to-r from-warning/70 to-warning',
    danger: 'bg-gradient-to-r from-danger/70 to-danger',
    info: 'bg-gradient-to-r from-info/70 to-info',
    muted: 'bg-slate-400',
  };
  const fill = toneClasses[tone] || toneClasses.brand;

  const commonProps = {
    role: 'progressbar',
    'aria-valuenow': Math.round(clamped),
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-label': label || 'Progress',
  };

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-500">{label}</span>
          <span className="text-xs font-semibold text-slate-700 tabular-nums">{Math.round(clamped)}%</span>
        </div>
      )}
      {segments > 0 ? (
        <div
          {...commonProps}
          className="flex h-2 w-full gap-1"
        >
          {Array.from({ length: segments }).map((_, i) => {
            const threshold = ((i + 1) / segments) * 100;
            const on = clamped > 0 && clamped >= threshold - 100 / segments / 2;
            return (
              <span
                key={i}
                aria-hidden="true"
                className={`h-full flex-1 rounded-full transition-colors duration-500 ${
                  on ? fill : 'bg-white/10'
                }`}
              />
            );
          })}
        </div>
      ) : (
        <div
          {...commonProps}
          className="h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-border"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${fill}`}
            style={{ width: `${clamped}%` }}
          />
        </div>
      )}
    </div>
  );
}
