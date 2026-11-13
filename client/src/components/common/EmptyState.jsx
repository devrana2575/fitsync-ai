export default function EmptyState({ icon: Icon, message = 'No data found', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center fade-in">
      {Icon ? (
        <div className="mb-4 p-4 rounded-2xl bg-brand-50 ring-1 ring-inset ring-brand-200 shadow-[0_0_32px_-12px_rgba(85,230,220,0.35)]">
          <Icon className="h-8 w-8 text-brand-500" aria-hidden="true" />
        </div>
      ) : null}
      <p className="text-slate-800 text-base font-medium max-w-sm">{message}</p>
      {description && <p className="text-slate-500 text-sm mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}