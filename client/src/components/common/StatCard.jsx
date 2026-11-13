import { ChevronRightIcon } from '@heroicons/react/24/outline';

const toneMap = {
  brand: 'bg-brand-50 text-brand-500 ring-brand-200',
  ink: 'bg-brand-50 text-brand-500 ring-brand-200',
  indigo: 'bg-info/12 text-info ring-info/25',
  blue: 'bg-info/12 text-info ring-info/25',
  green: 'bg-success/12 text-success ring-success/25',
  yellow: 'bg-warning/12 text-warning ring-warning/25',
  red: 'bg-danger/12 text-danger ring-danger/25',
  purple: 'bg-brand-50 text-brand-500 ring-brand-200',
  cyan: 'bg-info/12 text-info ring-info/25',
  orange: 'bg-warning/12 text-warning ring-warning/25',
};

export default function StatCard({ icon: Icon, label, value, color = 'brand', sub, onClick, ariaLabel, active = false }) {
  const tone = toneMap[color] || toneMap.brand;
  const Tag = onClick ? 'button' : 'div';
  const interactiveProps = onClick
    ? { type: 'button', onClick, 'aria-label': ariaLabel || label, title: ariaLabel || label }
    : {};

  return (
    <Tag
      {...interactiveProps}
      aria-pressed={onClick ? active : undefined}
      className={`card group p-4 sm:p-5 card-hover ${
        onClick
          ? 'w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60'
          : ''
      } ${active ? 'border-brand-400 ring-2 ring-brand-500/20' : ''}`}
    >
      <div className="flex items-center gap-3.5">
        <div className={`shrink-0 p-2.5 rounded-lg ring-1 ring-inset ${tone}`}>
          {typeof Icon === 'function' ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-[0.12em]">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 metric-value truncate">
            {value}
          </p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        {onClick && (
          <ChevronRightIcon
            className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-brand-500"
            aria-hidden="true"
          />
        )}
      </div>
    </Tag>
  );
}