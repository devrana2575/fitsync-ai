const toneMap = {
  brand: 'bg-brand-500/12 text-brand-400 ring-brand-500/25',
  ink: 'bg-ink-800 text-brand-400 ring-ink-600',
  indigo: 'bg-info/12 text-info ring-info/25',
  blue: 'bg-info/12 text-info ring-info/25',
  green: 'bg-success/12 text-success ring-success/25',
  yellow: 'bg-warning/12 text-warning ring-warning/25',
  red: 'bg-danger/12 text-danger ring-danger/25',
  purple: 'bg-brand-500/12 text-brand-400 ring-brand-500/25',
  cyan: 'bg-info/12 text-info ring-info/25',
};

export default function StatCard({ icon: Icon, label, value, color = 'brand', sub }) {
  const tone = toneMap[color] || toneMap.brand;
  return (
    <div className="card p-4 sm:p-5 hover:border-border-strong transition-colors duration-200">
      <div className="flex items-center gap-3.5">
        <div className={`shrink-0 p-2.5 rounded-lg ring-1 ring-inset ${tone}`}>
          {typeof Icon === 'function' ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100 tracking-tight tabular-nums truncate">
            {value}
          </p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}