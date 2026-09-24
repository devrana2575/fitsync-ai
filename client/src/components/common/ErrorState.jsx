export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center fade-in">
      <div className="mb-3 h-11 w-11 rounded-xl bg-danger/12 ring-1 ring-danger/25 flex items-center justify-center">
        <svg className="h-5 w-5 text-danger" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </div>
      <p className="text-slate-500 text-sm max-w-sm">{message || 'We couldn\x27t load this right now. Please try again.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-md btn-primary mt-4">
          Try again
        </button>
      )}
    </div>
  );
}