const toneMap = {
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  blue: 'bg-blue-50 text-blue-600 ring-blue-100',
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  yellow: 'bg-amber-50 text-amber-600 ring-amber-100',
  red: 'bg-red-50 text-red-600 ring-red-100',
  purple: 'bg-purple-50 text-purple-600 ring-purple-100',
  cyan: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
};

export default function StatCard({ icon: Icon, label, value, color = 'indigo' }) {
  return (
    <div className="card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-4">
        <div
          className={`shrink-0 p-3 rounded-lg ring-1 ${toneMap[color] || toneMap.indigo}`}
        >
          {typeof Icon === 'function' ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold text-slate-900 tracking-tight tabular-nums">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}