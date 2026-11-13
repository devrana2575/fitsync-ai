import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UsersIcon,
  BoltIcon,
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  ArrowRightIcon,
  PlusIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/common/StatCard';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import { SkeletonCard, SkeletonRow } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import ProfileCompletionCard from '../../components/common/ProfileCompletionCard';
import useTrainerDashboard from '../../hooks/useTrainerDashboard';
import api from '../../services/api';
import { fmtDate } from '../../utils/format';

const QUICK_ACTIONS = [
  { label: 'View Members', hint: 'Browse your assigned roster', path: '/trainer/members', icon: UsersIcon },
  { label: 'Create Work Plan', hint: 'Build a training plan for a member', path: '/trainer/workouts', icon: PlusIcon },
  { label: 'Check Member Progress', hint: 'Review attendance and progress', path: '/trainer/members', icon: ChartBarIcon },
];

const ALERT_TONES = {
  at_risk: 'badge-danger',
  attendance_declining: 'badge-warning',
  membership_expiring: 'badge-warning',
  progress_review: 'badge-info',
  low_attendance: 'badge-info',
};

const memberName = (m) => m.user?.name || m.name || 'Member';
const memberId = (m) => m.user?._id || m._id || m.id;

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function CapacityRing({ value, label }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="capacity-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7bf0e7" />
            <stop offset="1" stopColor="#13a89e" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#capacity-ring)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-slate-900 metric-value">{Math.round(clamped)}%</span>
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">{label}</span>
      </div>
    </div>
  );
}

export default function TrainerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [completion, setCompletion] = useState(null);
  const { data, loading, error, reload } = useTrainerDashboard({ forceRefresh: true });

  const loadCompletion = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setCompletion(res.data?.completion || null);
    } catch {
      setCompletion(null);
    }
  }, []);

  useEffect(() => {
    loadCompletion();
  }, [loadCompletion]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
      await loadCompletion();
    } finally {
      setRefreshing(false);
    }
  }, [reload, loadCompletion]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [handleRefresh]);

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <SkeletonCard />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonRow rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="Trainer Dashboard" subtitle={`Welcome back, ${user?.name}`} icon={UsersIcon} />
        <ErrorState message={error} onRetry={handleRefresh} />
      </div>
    );
  }

  const members = data?.members || [];
  const totalAssigned = data?.totalAssigned ?? members.length;
  const maxMembers = data?.maxMembers;
  const capacityPct = maxMembers ? Math.round((totalAssigned / maxMembers) * 100) : null;
  const needsAttention = data?.retentionAlerts?.members || [];
  const todayAttendance = data?.todayAttendance ?? 0;
  const recentWorkouts = data?.recentWorkouts ?? 0;
  const firstName = (user?.name || 'Coach').split(' ')[0];
  const todayDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const capacityTone = capacityPct === null
    ? 'brand'
    : capacityPct >= 90
      ? 'danger'
      : capacityPct >= 75
        ? 'warning'
        : 'brand';

  return (
    <div className="page-wrap space-y-6">
      {completion && !completion.allRequiredComplete && (
        <ProfileCompletionCard completion={completion} member={false} />
      )}

      {/* Trainer workspace hero */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(#55e6dc 1px, transparent 1px), linear-gradient(90deg, #55e6dc 1px, transparent 1px)',
            backgroundSize: '34px 34px',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(36rem 20rem at 90% -16%, rgba(85,230,220,0.14), transparent 65%)',
          }}
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                <CalendarDaysIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
                {todayDate}
              </span>
              <span className="badge badge-info">Trainer</span>
              {needsAttention.length > 0 && (
                <span className="badge badge-warning">
                  {needsAttention.length} need{needsAttention.length === 1 ? 's' : ''} attention
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-display">
              {greetingFor()}, {firstName}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-500">
              Here&apos;s how your roster is performing today — attendance, plans and follow-ups.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => navigate('/trainer/members')} className="btn btn-sm btn-primary">
                <UsersIcon className="h-4 w-4" aria-hidden="true" />
                View Members
              </button>
              <button onClick={() => navigate('/trainer/workouts')} className="btn btn-sm btn-outline">
                <PlusIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
                Create Work Plan
              </button>
              <button onClick={handleRefresh} disabled={refreshing} className="btn btn-sm btn-ghost">
                <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1 xl:min-w-[19rem]">
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface/50 p-4">
              <CapacityRing value={capacityPct ?? totalAssigned} label={maxMembers ? 'Capacity' : 'Assigned'} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Workload</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 metric-value">
                  {totalAssigned}{maxMembers ? ` / ${maxMembers}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {maxMembers ? 'Assigned member slots' : 'Assigned members'}
                </p>
                {maxMembers && (
                  <ProgressBar value={capacityPct} tone={capacityTone} className="mt-2" />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface/50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Today</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-900 metric-value">{todayAttendance}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Member check-ins</p>
              </div>
              <div className="rounded-2xl border border-border bg-surface/50 p-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">30 days</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-900 metric-value">{recentWorkouts}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Workouts logged</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={UserGroupIcon}
          label="Assigned Members"
          value={totalAssigned}
          color="brand"
          sub={maxMembers ? `of ${maxMembers} capacity` : 'Your roster'}
        />
        <StatCard
          icon={ClipboardDocumentCheckIcon}
          label="Today's Attendance"
          value={todayAttendance}
          color="green"
          sub="Member check-ins"
        />
        <StatCard
          icon={BoltIcon}
          label="Recent Workouts"
          value={recentWorkouts}
          color="blue"
          sub="Last 30 days"
        />
        <StatCard
          icon={ExclamationTriangleIcon}
          label="Needs Attention"
          value={needsAttention.length}
          color="yellow"
          sub="Members to follow up"
          onClick={() => navigate('/trainer/members')}
          ariaLabel="View members needing attention"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-soft text-warning ring-1 ring-inset ring-warning/25">
                    <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="card-title">Needs attention</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">Attendance drops and reviews that need a nudge.</p>
              </div>
              {needsAttention.length > 0 && (
                <span className="badge badge-warning">
                  {needsAttention.length} member{needsAttention.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {needsAttention.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                All assigned members are on track. Nothing needs your attention.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {needsAttention.map((m) => (
                  <li key={m.memberId}>
                    <button
                      onClick={() => navigate(`/trainer/members/${m.memberId}`)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-raised/50 transition-colors"
                    >
                      <Avatar name={m.name} src={m.avatar} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 truncate">{m.name}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {m.lastAttendanceAt ? `Last visit ${fmtDate(m.lastAttendanceAt)}` : 'No visits yet'}
                          {m.daysSinceAttendance !== null && m.daysSinceAttendance !== undefined
                            ? ` · ${m.daysSinceAttendance} day${m.daysSinceAttendance === 1 ? '' : 's'} ago`
                            : ''}
                        </span>
                        {m.recommendedAction && (
                          <span className="block text-xs text-slate-500 mt-1">{m.recommendedAction}</span>
                        )}
                      </span>
                      <span className="shrink-0 flex max-w-[45%] flex-wrap justify-end gap-1.5">
                        {(m.alerts || []).map((alert) => (
                          <span key={alert.code} className={ALERT_TONES[alert.code] || 'badge-muted'}>
                            {alert.label}
                          </span>
                        ))}
                      </span>
                      <ArrowRightIcon className="h-4 w-4 text-slate-500 shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <div>
                <h2 className="card-title">Assigned Members</h2>
                <p className="mt-1 text-sm text-slate-500">Your active roster and last recorded visit.</p>
              </div>
              <span className="badge badge-muted">{members.length} total</span>
            </div>
            {members.length === 0 ? (
              <EmptyState
                icon={UsersIcon}
                message="No members assigned yet"
                description="Members assigned to you will show up here with their attendance and status."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface/50 border-b border-border text-left">
                      <th scope="col" className="px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.12em]">Name</th>
                      <th scope="col" className="px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.12em]">Status</th>
                      <th scope="col" className="px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.12em]">Last Visit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {members.map((m) => {
                      const active = m.user?.isActive !== false;
                      return (
                        <tr
                          key={memberId(m)}
                          onClick={() => navigate(`/trainer/members/${memberId(m)}`)}
                          className="cursor-pointer transition-colors hover:bg-surface-raised/50"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={memberName(m)} src={m.user?.avatar} size="sm" />
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 truncate">{memberName(m)}</p>
                                <p className="text-xs text-slate-500 truncate">{m.user?.email || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge value={active} label={active ? 'Active' : 'Inactive'} />
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {m.lastVisit ? fmtDate(m.lastVisit) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="card-title mb-4">Quick Actions</h2>
            <div className="space-y-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3 text-left transition-colors hover:border-brand-200 hover:bg-surface-raised"
                >
                  <span className="shrink-0 rounded-lg bg-brand-50 p-2 text-brand-500 ring-1 ring-inset ring-brand-200">
                    <action.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{action.label}</span>
                    <span className="block text-xs text-slate-500">{action.hint}</span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="card-title mb-3">Workload</h2>
            <p className="text-sm text-slate-500">
              {maxMembers
                ? `You are using ${capacityPct}% of your assigned member capacity.`
                : 'No capacity limit is set for your account.'}
            </p>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-bold text-slate-900 metric-value">{totalAssigned}</p>
                <p className="text-xs text-slate-500">assigned member{totalAssigned === 1 ? '' : 's'}</p>
              </div>
              {needsAttention.length > 0 && (
                <span className="badge badge-warning">{needsAttention.length} follow-up</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
