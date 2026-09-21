import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

export default function ProfileCompletionCard({ completion, member = true }) {
  const navigate = useNavigate();
  const percent = Math.min(100, Math.max(0, completion?.percent ?? 0));
  const missing = Array.isArray(completion?.missing) ? completion.missing : [];
  const path = member ? '/member/profile' : '/trainer/profile';

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="h-5 w-5 text-indigo-500 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900">Profile Completion</h2>
          </div>
          {missing.length === 0 ? (
            <p className="text-sm text-green-700 font-medium">Your profile is complete. Great job!</p>
          ) : (
            <p className="text-xs text-slate-600 mt-0.5">
              Add {missing.slice(0, 3).join(', ')}
              {missing.length > 3 ? ` and ${missing.length - 3} more` : ''} to finish your profile.
            </p>
          )}
        </div>
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e0e7ff" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke={percent === 100 ? '#059669' : '#6366f1'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * 100} 100`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">
            {percent}%
          </span>
        </div>
      </div>
      {missing.length > 0 && (
        <button
          onClick={() => navigate(path)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          Complete your profile <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}