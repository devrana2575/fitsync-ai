export default function EmptyState({ icon: Icon, message = 'No data found', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center fade-in">
      {Icon ? (
        <div className="mb-4 p-4 rounded-2xl bg-ink-900 ring-1 ring-ink-700">
          <Icon className="h-8 w-8 text-brand-400" aria-hidden="true" />
        </div>
      ) : null}
      <p className="text-slate-700 text-base font-medium max-w-sm">{message}</p>
      {description && <p className="text-slate-400 text-sm mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}