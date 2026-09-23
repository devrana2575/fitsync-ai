/* Lightweight skeleton blocks for loading states. */
function Skeleton({ height = 'h-4', width = 'w-full', className = '', rounded = true }) {
  return <div className={`skeleton ${height} ${width} ${rounded ? 'rounded-lg' : ''} ${className}`} aria-hidden="true" />;
}

export { Skeleton };
export default Skeleton;

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card p-5 space-y-3 ${className}`} aria-hidden="true">
      <Skeleton width="w-1/3" height="h-5" />
      <Skeleton height="h-3" />
      <Skeleton width="w-2/3" height="h-3" />
    </div>
  );
}

export function SkeletonRow({ rows = 5, className = '' }) {
  return (
    <div className={`card overflow-hidden ${className}`} aria-hidden="true">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton width="w-8" height="h-8" rounded className="rounded-full!" />
            <div className="flex-1 space-y-2">
              <Skeleton width="w-1/2" height="h-3.5" />
              <Skeleton width="w-1/3" height="h-3" />
            </div>
            <Skeleton width="w-16" height="h-6" />
          </div>
        ))}
      </div>
    </div>
  );
}