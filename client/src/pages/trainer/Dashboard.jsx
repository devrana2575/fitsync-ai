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
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/common/StatCard';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import Skeleton, { SkeletonCard, SkeletonRow } from '../../components/common/Skeleton';
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

const memberName = (m) => m.user?.name || m.name || 'Member';
const memberId = (m) => m.user?._id || m._id || m.id;

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
        <div className="space-y-2">
          <Skeleton width="w-64" height="h-8" />
          <Skeleton width="w-80" height="h-4" />
        </div>
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
  const needsAttention = members.filter((m) => Array.isArray(m.attention) && m.attention.length > 0);

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Trainer Dashboard"
        subtitle={`Welcome back, ${user?.name} — here's how your members are doing today.`}
        icon={UsersIcon}
        actions={
          <button onClick={handleRefresh} disabled={refreshing} className="btn btn-sm btn-outline">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      {completion && !completion.allRequiredComplete && (
        <ProfileCompletionCard completion={completion} member={false} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-4">
            <span className="shrink-0 p-3 rounded-lg ring-1 bg-brand-500/15 text-brand-400 ring-brand-500/25">
              <UserGroupIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-500">Member Capacity</p>
              <p className="mt-0.5 text-2xl font-semibold text-slate-900 tracking-tight tabular-nums">
                {maxMembers ? `${totalAssigned} / ${maxMembers}` : totalAssigned}
                <span className="ml-1.5 text-sm font-normal text-slate-500">{maxMembers ? 'members' : 'assigned'}</span>
              </p>
              {maxMembers ? (
                <ProgressBar
                  value={capacityPct}
                  tone={capacityPct >= 90 ? 'danger' : capacityPct >= 75 ? 'warning' : 'brand'}
                  className="mt-2"
                />
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">Assigned member count</p>
              )}
            </div>
          </div>
        </div>
        <StatCard icon={UsersIcon} label="Total Assigned Members" value={totalAssigned} color="brand" />
        <StatCard icon={ClipboardDocumentCheckIcon} label="Today's Attendance" value={data?.todayAttendance ?? 0} color="green" />
        <StatCard icon={BoltIcon} label="Recent Workouts (30d)" value={data?.recentWorkouts ?? 0} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="card-title">Needs attention</h2>
              {needsAttention.length > 0 && (
                <span className="badge badge-warning">{needsAttention.length} member{needsAttention.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {needsAttention.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-400">
                All assigned members are on track. Nothing needs your attention.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {needsAttention.map((m) => (
                  <li key={memberId(m)}>
                    <button
                      onClick={() => navigate(`/trainer/members/${memberId(m)}`)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-100/40 transition-colors"
                    >
                      <Avatar name={memberName(m)} src={m.user?.avatar} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 truncate">{memberName(m)}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {m.lastVisit ? `Last visit ${fmtDate(m.lastVisit)}` : 'No visits yet'}
                        </span>
                      </span>
                      <span className="shrink-0 flex flex-wrap justify-end gap-1.5">
                        {m.attention.includes('no_recent_attendance') && (
                          <span className="badge badge-warning">No visit in 7+ days</span>
                        )}
                        {m.attention.includes('membership_expiring') && (
                          <span className="badge bg-warning/15 text-warning">Membership expiring</span>
                        )}
                      </span>
                      <ArrowRightIcon className="h-4 w-4 text-slate-300 shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="card-title">Assigned Members</h2>
              <span className="text-xs text-slate-400">{members.length} total</span>
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
                    <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Last Visit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((m, i) => {
                      const active = m.user?.isActive !== false;
                      return (
                        <tr
                          key={memberId(m)}
                          onClick={() => navigate(`/trainer/members/${memberId(m)}`)}
                          className={`cursor-pointer hover:bg-slate-100/40 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-slate-100/40'}`}
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
                          <td className="px-5 py-3 text-xs text-slate-500">{m.lastVisit ? fmtDate(m.lastVisit) : '—'}</td>
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
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <span className="shrink-0 p-2 rounded-lg bg-brand-500/15 text-brand-400">
                    <action.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{action.label}</span>
                    <span className="block text-xs text-slate-500">{action.hint}</span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}