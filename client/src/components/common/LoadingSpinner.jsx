export default function LoadingSpinner({ size = 'md' }) {
  const sizeClasses = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
  };

  return (
    <div className="flex items-center justify-center" role="status" aria-label="Loading">
      <div className={`${sizeClasses[size]} animate-spin rounded-full border-slate-200 border-t-brand-500`} />
    </div>
  );
}