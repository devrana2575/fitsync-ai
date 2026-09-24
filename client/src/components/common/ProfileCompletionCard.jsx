import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import ProgressBar from './ProgressBar';

export default function ProfileCompletionCard({ completion, member = true }) {
  const navigate = useNavigate();
  const percent = Math.min(100, Math.max(0, completion?.percent ?? 0));
  const missing = Array.isArray(completion?.missing) ? completion.missing : [];
  const path = member ? '/member/profile' : '/trainer/profile';

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-5 text-white overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(#2a3037 1px, transparent 1px), linear-gradient(90deg, #2a3037 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircleIcon className="h-5 w-5 text-brand-400 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-white">Profile Completion</h2>
            </div>
            {missing.length === 0 ? (
              <p className="text-sm text-brand-300 font-medium">Your profile is complete. Great job!</p>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">
                Add {missing.slice(0, 3).join(', ')}
                {missing.length > 3 ? ` and ${missing.length - 3} more` : ''} to finish your profile.
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-2xl font-bold text-brand-400 tabular-nums">{percent}%</span>
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={percent} tone={percent === 100 ? 'success' : 'brand'} />
        </div>
        {missing.length > 0 && (
          <button
            onClick={() => navigate(path)}
            className="btn btn-sm btn-primary mt-4"
          >
            Complete your profile <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}