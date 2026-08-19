export default function EmptyState({ icon = '📭', message = 'No data found', action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <p className="text-slate-500 text-lg mb-4">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
