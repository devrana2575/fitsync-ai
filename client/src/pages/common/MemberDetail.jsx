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
  LightBulbIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';

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
  no_recent_attendance: { label: 'No recent attendance (7+ days)', cls: 'bg-amber-100 text-amber-700' },
  membership_expiring: { label: 'Membership expiring soon (≤30 days)', cls: 'bg-orange-100 text-orange-700' },
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

  if (loading) return <LoadingSpinner />;
  if (error) return (
    <div className="p-6">
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <ErrorState message={error} onRetry={fetchDetail} />
    </div>
  );
  if (!data || !data.member) return <EmptyState icon={UserIcon} message="Member not found" />;

  const { member, profile, membership, attendance, payments, workoutPlans, workoutLogs, goals, measurements, insights, attention } = data;
  void member;

  const section = (title, Icon, children, emptyMsg) => (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
        <Icon className="h-5 w-5 text-slate-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="px-6 py-4">
        {children ?? <p className="text-sm text-slate-400">{emptyMsg || 'No data available'}</p>}
      </div>
    </div>
  );

  return (
    <div className="p-1">
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xl">
            {(data.member.name || 'M').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{data.member.name}</h1>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${data.member.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {data.member.isActive !== false ? 'Active' : 'Inactive'}
              </span>
              {membership && (
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                  {membership.plan?.name || membership.status} · {fmtDate(membership.endDate)}
                </span>
              )}
            </div>
            <p className="text-slate-500 mt-1">{data.member.email}{profile?.phone ? ` · ${profile.phone}` : ''}</p>
            {attention && attention.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {attention.map((a) => {
                  const info = attentionMap[a];
                  if (!info) return null;
                  return (
                    <span key={a} className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
                      {info.label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-sm text-slate-500 text-right">
            <p>Joined: {fmtDate(profile?.joinDate || data.member.createdAt)}</p>
            {profile?.assignedTrainer && <p className="mt-1">Trainer: {profile.assignedTrainer.name || profile.assignedTrainer.email}</p>}
          </div>
        </div>
        {profile?.medicalConditions && (
          <p className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Medical conditions: {profile.medicalConditions}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {section('Membership', CreditCardIcon, (
          (memberships || []).length > 0 ? (
            <div className="space-y-2">
              {(memberships || []).map((m) => (
                <div key={m._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{m.plan?.name || 'Membership'}</p>
                    <p className="text-xs text-slate-500">{fmtDate(m.startDate)} → {fmtDate(m.endDate)}</p>
                  </div>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${m.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          ) : null,
          'No membership assigned'
        ))}

        {section('Attendance', ClipboardDocumentListIcon, (
          (attendance || []).length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(attendance || []).map((r) => {
                const active = !r.checkOutTime;
                return (
                  <div key={r._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{fmtDateTime(r.checkInTime || r.date)}</p>
                      <p className="text-xs text-slate-500">
                        {active ? 'Active session' : `Checkout: ${fmtDateTime(r.checkOutTime)} · Duration ${formatDuration(r.checkInTime, r.checkOutTime)}`}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
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
          'No attendance records'
        ))}

        {section('Payments', BanknotesIcon, (
          (payments || []).length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(payments || []).map((p) => (
                <div key={p._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-900">₹{p.amount?.toLocaleString?.('en-IN') ?? p.amount}</p>
                    <p className="text-xs text-slate-500">
                      {fmtDate(p.date)} · {p.method || '—'}{p.membership?.plan?.name ? ` · ${p.membership.plan.name}` : ''}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${String(p.status || '').toUpperCase() === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {p.status === 'COMPLETED' ? (
                      <><CheckCircleIcon className="h-3 w-3" aria-hidden="true" /> {p.status}</>
                    ) : (
                      <><ClockIcon className="h-3 w-3" aria-hidden="true" /> {p.status || 'PENDING'}</>
                    )}
                  </span>
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
                <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
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
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(m.date || m.createdAt)}</td>
                        <td className="px-3 py-2 text-slate-900 font-medium">{m.weight ? `${m.weight} kg` : '—'}</td>
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
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(goals || []).map((g) => (
                <div key={g._id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{g.title}</p>
                    <p className="text-xs text-slate-500">
                      {g.current ?? 0} / {g.target} {g.unit || ''} · {fmtDate(g.targetDate)}
                    </p>
                  </div>
                  <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{g.status}</span>
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
                <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
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
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(log.date || log.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-900 font-medium">{log.exercise?.name || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{log.sets} × {log.reps}</td>
                      <td className="px-3 py-2">
                        {log.isCompleted === false ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><XCircleIcon className="h-3 w-3" aria-hidden="true" /> Incomplete</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600"><CheckCircleIcon className="h-3 w-3" aria-hidden="true" /> Completed</span>
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
      </div>

      <div className="space-y-6">
        {section('Workout Plans', ClipboardDocumentListIcon, (
          (workoutPlans || []).length > 0 ? (
            <div className="space-y-3">
              {(workoutPlans || []).map((plan) => (
                <div key={plan._id} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{plan.name}</p>
                    {plan.trainer?.name && <p className="text-xs text-slate-500">by {plan.trainer.name}</p>}
                  </div>
                  {plan.description && <p className="text-xs text-slate-500 mt-1">{plan.description}</p>}
                  {Array.isArray(plan.dayOfWeek) && plan.dayOfWeek.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">Days: {plan.dayOfWeek.join(', ')}</p>
                  )}
                  {Array.isArray(plan.exercises) && plan.exercises.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">{plan.exercises.length} exercises</p>
                  )}
                </div>
              ))}
            </div>
          ) : null,
          'No active workout plans'
        ))}

        {section('Insights', LightBulbIcon, (
          (insights || []).length > 0 ? (
            <div className="space-y-2">
              {(insights || []).map((insight, idx) => (
                <div key={insight._id || idx} className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <p className="text-sm font-medium text-slate-800">{insight.title}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{insight.description || insight.message}</p>
                </div>
              ))}
            </div>
          ) : null,
          'No insights yet'
        ))}
      </div>
    </div>
  );
}