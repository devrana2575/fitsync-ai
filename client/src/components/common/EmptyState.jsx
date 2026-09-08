export default function EmptyState({ icon: Icon, message = 'No data found', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center fade-in">
      {Icon ? (
        <div className="mb-4 p-4 rounded-xl bg-slate-100 ring-1 ring-slate-200">
          <Icon className="h-8 w-8 text-slate-400" aria-hidden="true" />
        </div>
      ) : null}
      <p className="text-slate-500 text-base mb-4 max-w-sm">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
}