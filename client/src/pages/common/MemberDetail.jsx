import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  UserIcon,
  CreditCardIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  BoltIcon,
  StarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CalendarDaysIcon,
  EnvelopeIcon,
  PhoneIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import Avatar from '../../components/common/Avatar';
import { Skeleton, SkeletonCard, SkeletonRow } from '../../components/common/Skeleton';
import exerciseImage from '../../assets/exerciseImage';
import { toINR } from '../../utils/format';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '—';
  const mins = Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const attentionMap = {
  no_recent_attendance: { label: 'No recent attendance (7+ days)', cls: 'badge-warning' },
  membership_expiring: { label: 'Membership expiring soon (≤30 days)', cls: 'badge-warning' },
};

const goalProgress = (goal) => {
  const target = Number(goal.target);
  if (!target) return 0;
  const current = Number(goal.current ?? 0);
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
};

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/members/${id}`);
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load member details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <Skeleton width="w-32" height="h-9" />
        <SkeletonCard className="py-10" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkeletonRow rows={4} />
          <SkeletonRow rows={4} />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <button onClick={() => navigate(-1)} className="btn btn-md btn-ghost">
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Back
        </button>
        <ErrorState message={error} onRetry={fetchDetail} />
      </div>
    );
  }
  if (!data || !data.member) return <EmptyState icon={UserIcon} message="Member not found" />;

  const { member, profile, membership, memberships, attendance, payments, workoutPlans, workoutLogs, goals, measurements, attention } = data;
  void member;

  const section = (title, Icon, children, emptyMsg) => (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
        <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
        <h2 className="section-title">{title}</h2>
      </div>
      <div className="flex-1 p-5">
        {children ?? (
          <EmptyState icon={Icon} message={emptyMsg || 'No data available'} />
        )}
      </div>
    </div>
  );

  return (
    <div className="page-wrap space-y-6">
      <div className="page-header">
        <div>
          <button onClick={() => navigate(-1)} className="btn btn-md btn-ghost">
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Back
          </button>
        </div>
      </div>

      <div className="card-dark relative overflow-hidden rounded-xl border-ink-700 p-6 sm:p-7">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#a3e635 1px, transparent 1px), linear-gradient(90deg, #a3e635 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={data.member.name} src={data.member.avatar} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{data.member.name}</h1>
              <StatusBadge
                value={data.member.isActive !== false ? 'active' : 'inactive'}
                label={data.member.isActive !== false ? 'Active' : 'Inactive'}
                tone={data.member.isActive !== false ? 'success' : 'muted'}
              />
              {membership && (
                <>
                  <StatusBadge value={membership.status} />
                  {membership.plan?.name && <span className="badge badge-dark">{membership.plan.name}</span>}
                </>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <EnvelopeIcon className="h-4 w-4 text-brand-400" aria-hidden="true" />
                {data.member.email}
              </span>
              {profile?.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <PhoneIcon className="h-4 w-4 text-brand-400" aria-hidden="true" />
                  {profile.phone}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <CalendarDaysIcon className="h-4 w-4 text-brand-400" aria-hidden="true" />
                Joined {fmtDate(profile?.joinDate || data.member.createdAt)}
              </span>
              {profile?.assignedTrainer && (
                <span className="badge badge-dark">
                  Trainer: {profile.assignedTrainer.name || profile.assignedTrainer.email}
                </span>
              )}
              {membership?.endDate && (
                <span className="badge badge-dark">Plan ends {fmtDate(membership.endDate)}</span>
              )}
            </div>

            {attention && attention.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {attention.map((a) => {
                  const info = attentionMap[a];
                  if (!info) return null;
                  return <span key={a} className={info.cls}>{info.label}</span>;
                })}
              </div>
            )}

            {profile?.medicalConditions && (
              <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
                <span className="font-semibold">Medical conditions:</span> {profile.medicalConditions}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {section('Membership', CreditCardIcon, (
          (memberships || []).length > 0 ? (
            <div className="space-y-2">
              {(memberships || []).map((m) => (
                <div key={m._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{m.plan?.name || 'Membership'}</p>
                    <p className="text-xs text-slate-500">{fmtDate(m.startDate)} → {fmtDate(m.endDate)}</p>
                  </div>
                  <StatusBadge value={m.status} />
                </div>
              ))}
            </div>
          ) : null,
          'No membership assigned'
        ))}

        {section('Attendance', ClipboardDocumentListIcon, (
          (attendance || []).length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(attendance || []).map((r) => {
                const active = !r.checkOutTime;
                return (
                  <div key={r._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{fmtDateTime(r.checkInTime || r.date)}</p>
                      <p className="text-xs text-slate-500">
                        {active ? 'Active session' : `Checkout: ${fmtDateTime(r.checkOutTime)} · Duration ${formatDuration(r.checkInTime, r.checkOutTime)}`}
                      </p>
                    </div>
                    <span className={active ? 'badge badge-success' : 'badge badge-muted'}>
                      {active ? (
                        <>
                          <ClockIcon className="h-3 w-3" aria-hidden="true" /> Active
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="h-3 w-3" aria-hidden="true" /> Completed
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null,
          'No attendance recorded yet'
        ))}

        {section('Payments', BanknotesIcon, (
          (payments || []).length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(payments || []).map((p) => (
                <div key={p._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">{toINR(p.amount)}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(p.date)} · {p.method || '—'}{p.membership?.plan?.name ? ` · ${p.membership.plan.name}` : ''}
                    </p>
                  </div>
                  <StatusBadge value={p.status} />
                </div>
              ))}
            </div>
          ) : null,
          'No payment records'
        ))}

        {section('Health Data', StarIcon, (
          (measurements || []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Weight</th>
                    <th className="px-3 py-2">BMI</th>
                    <th className="px-3 py-2">Body Fat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(measurements || []).slice(0, 5).map((m) => {
                    const bmi = m.bmi || (m.weight && m.height ? Math.round((m.weight / ((m.height / 100) ** 2)) * 10) / 10 : null);
                    return (
                      <tr key={m._id}>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDate(m.date || m.createdAt)}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{m.weight ? `${m.weight} kg` : '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{bmi ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{m.bodyFat ? `${m.bodyFat}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null,
          'No measurements recorded'
        ))}

        {section('Goals', BoltIcon, (
          (goals || []).length > 0 ? (
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {(goals || []).map((g) => (
                <div key={g._id} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{g.title}</p>
                    <StatusBadge value={g.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {g.current ?? 0} / {g.target} {g.unit || ''} · {fmtDate(g.targetDate)}
                  </p>
                  <div className="mt-2">
                    <ProgressBar value={goalProgress(g)} tone={g.status === 'COMPLETED' ? 'success' : 'brand'} />
                  </div>
                </div>
              ))}
            </div>
          ) : null,
          'No goals set'
        ))}

        {section('Workout Logs', BoltIcon, (
          (workoutLogs || []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Exercise</th>
                    <th className="px-3 py-2">Sets × Reps</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(workoutLogs || []).slice(0, 6).map((log) => (
                    <tr key={log._id}>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDate(log.date || log.createdAt)}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{log.exercise?.name || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{log.sets} × {log.reps}</td>
                      <td className="px-3 py-2">
                        {log.isCompleted === false ? (
                          <span className="badge badge-warning"><XCircleIcon className="h-3 w-3" aria-hidden="true" /> Incomplete</span>
                        ) : (
                          <span className="badge badge-success"><CheckCircleIcon className="h-3 w-3" aria-hidden="true" /> Completed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null,
          'No workout logs'
        ))}

        {section('Workout Plans', ClipboardDocumentListIcon, (
          (workoutPlans || []).length > 0 ? (
            <div className="space-y-3">
              {(workoutPlans || []).map((plan) => (
                <div key={plan._id} className="rounded-lg bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{plan.name}</p>
                    {plan.trainer?.name && <p className="text-xs text-slate-500">by {plan.trainer.name}</p>}
                  </div>
                  {plan.description && <p className="mt-1 text-xs text-slate-500">{plan.description}</p>}
                  {Array.isArray(plan.dayOfWeek) && plan.dayOfWeek.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">Days: {plan.dayOfWeek.join(', ')}</p>
                  )}
                  {Array.isArray(plan.exercises) && plan.exercises.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plan.exercises.slice(0, 6).map((ex, idx) => {
                        const exData = ex.exercise || ex;
                        return (
                          <span key={idx} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                            <img src={exerciseImage(exData)} alt={exData?.name || 'Exercise'} loading="lazy" className="h-4 w-4 rounded-full bg-white object-cover" />
                            {exData?.name || 'Exercise'}
                          </span>
                        );
                      })}
                      {plan.exercises.length > 6 && <span className="self-center text-xs text-slate-400">+{plan.exercises.length - 6} more</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null,
          'No active workout plans'
        ))}
      </div>
    </div>
  );
}