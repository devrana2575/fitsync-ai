import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  ArrowPathIcon,
  UsersIcon,
  CheckCircleIcon,
  UserGroupIcon,
  CreditCardIcon,
  ClockIcon,
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  ChartBarIcon,
  PlusIcon,
  UserPlusIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/common/StatCard';
import ErrorState from '../../components/common/ErrorState';
import Skeleton, { SkeletonCard } from '../../components/common/Skeleton';
import { fmtDate, toINR, fmtDateShort, daysUntil } from '../../utils/format';
import {
  AXIS,
  CHART_COLORS,
  LEGEND_STYLE,
  SERIES_COLORS,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from '../../utils/chartTheme';

const PIE_COLORS = SERIES_COLORS;

const RETENTION_TONES = {
  at_risk: 'badge-danger',
  attendance_declining: 'badge-warning',
  membership_expiring: 'badge-warning',
  payment_pending: 'badge-warning',
  progress_review: 'badge-info',
  low_attendance: 'badge-info',
};

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [membershipDist, setMembershipDist] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const [dashResult, revResult, attResult, memResult, peakResult, retentionResult] = await Promise.allSettled([
      api.get('/analytics/admin/dashboard'),
      api.get('/analytics/admin/revenue-trend'),
      api.get('/analytics/admin/attendance-trend'),
      api.get('/analytics/admin/membership-distribution'),
      api.get('/analytics/admin/peak-hours'),
      api.get('/retention/admin/at-risk'),
    ]);

    const newErrors = {};

    if (dashResult.status === 'fulfilled') {
      setStats(dashResult.value.data);
    } else {
      newErrors.stats = dashResult.reason?.message;
    }

    if (revResult.status === 'fulfilled') {
      const rawRevenue = revResult.value.data.trend || revResult.value.data.data || revResult.value.data || [];
      setRevenue(rawRevenue.map((r) => ({
        month: `${r._id?.year || ''}-${String(r._id?.month || 0).padStart(2, '0')}`,
        revenue: r.total || 0,
      })));
    } else {
      newErrors.revenue = revResult.reason?.message;
    }

    if (attResult.status === 'fulfilled') {
      const rawAttendance = attResult.value.data.trend || attResult.value.data.data || attResult.value.data || [];
      setAttendance(rawAttendance.map((a) => ({ day: a._id || '', count: a.count || 0 })));
    } else {
      newErrors.attendance = attResult.reason?.message;
    }

    if (memResult.status === 'fulfilled') {
      const rawDist = memResult.value.data.distribution || memResult.value.data.data || memResult.value.data || [];
      setMembershipDist(rawDist
        .filter((d) => d && d._id)
        .map((d) => ({ status: String(d._id), count: d.count || 0 })));
    } else {
      newErrors.membershipDist = memResult.reason?.message;
    }

    if (peakResult.status === 'fulfilled') {
      const rawPeak = peakResult.value.data.peakHours || peakResult.value.data.data || peakResult.value.data || [];
      setPeakHours(rawPeak
        .filter((p) => p && p._id !== null && p._id !== undefined)
        .map((p) => ({ hour: `${String(p._id).padStart(2, '0')}:00`, count: p.count || 0, sortKey: Number(p._id) }))
        .sort((a, b) => a.sortKey - b.sortKey));
    } else {
      newErrors.peakHours = peakResult.reason?.message;
    }

    if (retentionResult.status === 'fulfilled') {
      setRetention(retentionResult.value.data);
    } else {
      newErrors.retention = retentionResult.reason?.message;
    }

    setErrors(newErrors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAll(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchAll]);

  const handleRefresh = () => fetchAll(true);

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
  const todayDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const firstName = (user?.name || 'Admin').split(' ')[0];

  return (
    <div className="page-wrap space-y-6">
      {/* Operations command center */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(#55e6dc 1px, transparent 1px), linear-gradient(90deg, #55e6dc 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(36rem 20rem at 92% -20%, rgba(85,230,220,0.14), transparent 65%)',
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
              <span className="badge badge-brand">Admin</span>
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-display">
              {greetingFor()}, {firstName}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-500">
              A live view of membership health, revenue and club activity.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/admin/members', { state: { openCreate: true } })}
                className="btn btn-sm btn-primary"
              >
                <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
                Add Member
              </button>
              <button
                onClick={() => navigate('/admin/payments', { state: { openCreate: true } })}
                className="btn btn-sm btn-outline"
              >
                <BanknotesIcon className="h-4 w-4" aria-hidden="true" />
                Record Payment
              </button>
              <button
                onClick={() => navigate('/admin/memberships', { state: { openCreate: true } })}
                className="btn btn-sm btn-outline"
              >
                <CreditCardIcon className="h-4 w-4" aria-hidden="true" />
                Assign Membership
              </button>
              <button onClick={handleRefresh} disabled={refreshing} className="btn btn-sm btn-ghost">
                <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 xl:min-w-[26rem]">
            <div className="rounded-2xl border border-border bg-surface/50 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Revenue</p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 metric-value truncate">{toINR(stats?.totalRevenue)}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Collected</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface/50 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Memberships</p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 metric-value">{fmt(stats?.activeMemberships)}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Active plans</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface/50 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Today</p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 metric-value">{fmt(stats?.todayAttendance)}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Check-ins</p>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : errors.stats ? (
        <ErrorState message="Failed to load dashboard stats" onRetry={handleRefresh} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon={UsersIcon}
            label="Total Members"
            value={fmt(stats?.totalMembers)}
            color="brand"
            sub="All registered"
            onClick={() => navigate('/admin/members')}
            ariaLabel="View all members"
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Active Members"
            value={fmt(stats?.activeMembers)}
            color="green"
            sub="With active access"
            onClick={() => navigate('/admin/members?status=active')}
            ariaLabel="View active members"
          />
          <StatCard
            icon={UserGroupIcon}
            label="Total Trainers"
            value={fmt(stats?.totalTrainers)}
            color="blue"
            sub="Coaching staff"
            onClick={() => navigate('/admin/trainers')}
            ariaLabel="View all trainers"
          />
          <StatCard
            icon={CreditCardIcon}
            label="Active Memberships"
            value={fmt(stats?.activeMemberships)}
            color="cyan"
            sub="Independent plans"
            onClick={() => navigate('/admin/memberships')}
            ariaLabel="View memberships"
          />
          <StatCard
            icon={ClockIcon}
            label="Expiring Soon"
            value={fmt(stats?.expiringSoon)}
            color="yellow"
            sub="Next 30 days"
            onClick={() => navigate('/admin/memberships')}
            ariaLabel="View memberships expiring soon"
          />
          <StatCard
            icon={BanknotesIcon}
            label="Total Revenue"
            value={toINR(stats?.totalRevenue)}
            color="ink"
            sub="Collected"
            onClick={() => navigate('/admin/payments')}
            ariaLabel="View payments and revenue"
          />
          <StatCard
            icon={ClipboardDocumentCheckIcon}
            label="Today's Attendance"
            value={fmt(stats?.todayAttendance)}
            color="green"
            sub="Check-ins today"
            onClick={() => navigate('/admin/attendance')}
            ariaLabel="View today's attendance"
          />
          <StatCard
            icon={ChartBarIcon}
            label="Monthly Attendance"
            value={fmt(stats?.monthlyAttendance)}
            color="red"
            sub="This month"
            onClick={() => navigate('/admin/attendance')}
            ariaLabel="View attendance records"
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Revenue Trend" loading={loading} error={errors.revenue && 'Failed to load revenue data'} onRetry={handleRefresh} hasData={revenue.length > 0}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <Tooltip formatter={(v) => toINR(v)} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS.brand} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.brand, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Attendance Trend (last 90 days)" loading={loading} error={errors.attendance && 'Failed to load attendance data'} onRetry={handleRefresh} hasData={attendance.length > 0}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={attendance}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={{ stroke: AXIS.axis }}
                tick={{ fontSize: 12, fill: AXIS.tick }}
                tickFormatter={(value) => (value ? String(value).slice(5) : '')}
                minTickGap={16}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="count" name="Check-ins" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Members by Status" loading={loading} error={errors.membershipDist && 'Failed to load membership data'} onRetry={handleRefresh} hasData={membershipDist.length > 0}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={membershipDist}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={58}
                paddingAngle={2}
                dataKey="count"
                nameKey="status"
                label={({ status, percent }) => `${status} (${((percent || 0) * 100).toFixed(0)}%)`}
              >
                {membershipDist.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#10191d" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Peak Hours (last 90 days)" loading={loading} error={errors.peakHours && 'Failed to load peak hours data'} onRetry={handleRefresh} hasData={peakHours.length > 0}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} vertical={false} />
              <XAxis dataKey="hour" tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} interval={1} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="count" name="Check-ins" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-soft text-warning ring-1 ring-inset ring-warning/25">
                <ClockIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="card-title">At-Risk Members</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">Follow up on attendance, renewals, payments and progress reviews.</p>
          </div>
          {!loading && !errors.retention && (
            <span className="badge badge-warning">{retention?.count || 0} flagged</span>
          )}
        </div>
        {loading ? (
          <div className="p-5"><SkeletonCard /></div>
        ) : errors.retention ? (
          <div className="p-5"><ErrorState message="Failed to load at-risk members" onRetry={handleRefresh} /></div>
        ) : (retention?.members || []).length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            No members need follow-up right now.
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-[30rem] overflow-y-auto">
            {retention.members.map((m) => {
              const lastAttendance = m.lastAttendanceAt
                ? `${fmtDate(m.lastAttendanceAt)}${m.daysSinceAttendance !== null && m.daysSinceAttendance !== undefined ? ` (${m.daysSinceAttendance}d ago)` : ''}`
                : 'No attendance yet';
              return (
                <li key={m.memberId}>
                  <button
                    onClick={() => navigate(`/admin/members/${m.memberId}`)}
                    className="w-full px-5 py-4 text-left hover:bg-surface-raised/50 transition-colors"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                        <p className="text-xs text-slate-500 truncate">{m.email || '—'}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(m.alerts || []).map((alert) => (
                            <span key={alert.code} className={RETENTION_TONES[alert.code] || 'badge-muted'}>
                              {alert.label}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>Membership: <span className="font-medium text-slate-700">{m.membershipStatus || '—'}</span></span>
                          <span>Last attendance: <span className="font-medium text-slate-700">{lastAttendance}</span></span>
                          <span>Expires: <span className="font-medium text-slate-700">{m.membershipEndDate ? fmtDateShort(m.membershipEndDate) : '—'}</span></span>
                          {m.pendingPayment && (
                            <span>Pending payment: <span className="font-medium text-warning">{toINR(m.pendingPaymentAmount)}</span></span>
                          )}
                          {m.progressReviewNeeded && (
                            <span className="font-medium text-info">Progress review needed</span>
                          )}
                        </div>
                      </div>
                      <div className="sm:max-w-[16rem] sm:text-right">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Recommended action</p>
                        <p className="text-xs text-slate-700 mt-1">{m.recommendedAction || 'Review member follow-up'}</p>
                      </div>
                      <ArrowRightIcon className="hidden sm:block h-4 w-4 text-slate-500 shrink-0 mt-1" aria-hidden="true" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title">Expiring Soon</h2>
            <button
              onClick={() => navigate('/admin/memberships')}
              className="btn btn-ghost btn-sm text-brand-500"
            >
              View all
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {loading ? (
            <SkeletonCard />
          ) : errors.stats ? (
            <ErrorState message="Failed to load dashboard stats" onRetry={handleRefresh} />
          ) : (stats?.expiringMembers || []).length > 0 ? (
            <ul className="divide-y divide-border">
              {(stats.expiringMembers || []).map((m) => {
                const daysLeft = daysUntil(m?.endDate);
                return (
                  <li key={m?._id}>
                    <button
                      onClick={() => m?.user?._id && navigate(`/admin/members/${m.user._id}`)}
                      className="w-full flex items-center justify-between py-3 text-left hover:bg-surface-raised/50 rounded-lg px-2 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 truncate">
                          {m?.user?.name || 'Unknown member'}
                        </span>
                        <span className="block text-xs text-slate-500">{m?.plan?.name || 'Membership'}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {m?.endDate ? <span className="text-xs text-slate-500">{fmtDateShort(m.endDate)}</span> : null}
                        {m?.endDate && daysLeft !== null ? (
                          <span className={daysLeft >= 0 ? 'badge badge-warning' : 'badge badge-danger'}>
                            {daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center justify-center h-24 text-slate-500 text-sm">
              No memberships expiring in the next 30 days
            </div>
          )}
        </div>

        <div className="card relative overflow-hidden p-5">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: 'radial-gradient(22rem 12rem at 100% 0%, rgba(85,230,220,0.08), transparent 65%)' }}
            aria-hidden="true"
          />
          <div className="relative">
            <h2 className="card-title mb-4">Pending Payments</h2>
            {loading ? (
              <SkeletonCard />
            ) : errors.stats ? (
              <ErrorState message="Failed to load dashboard stats" onRetry={handleRefresh} />
            ) : (
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-bold text-slate-900 metric-value">{toINR(stats?.pendingPayments)}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Outstanding amount awaiting collection
                  </p>
                </div>
                <button
                  onClick={() => navigate('/admin/payments')}
                  className="btn btn-outline btn-md"
                >
                  Record payment
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="card-title mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/admin/members', { state: { openCreate: true } })}
            className="btn btn-outline btn-sm group"
          >
            <UserPlusIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Add Member
          </button>
          <button
            onClick={() => navigate('/admin/payments', { state: { openCreate: true } })}
            className="btn btn-outline btn-sm group"
          >
            <BanknotesIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Record Payment
          </button>
          <button
            onClick={() => navigate('/admin/memberships', { state: { openCreate: true } })}
            className="btn btn-outline btn-sm group"
          >
            <CreditCardIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Assign Membership
          </button>
          <button
            onClick={() => navigate('/admin/attendance')}
            className="btn btn-outline btn-sm group"
          >
            <ClipboardDocumentCheckIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Check In Member
          </button>
          <button
            onClick={() => navigate('/admin/trainers', { state: { openCreate: true } })}
            className="btn btn-outline btn-sm group"
          >
            <PlusIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Add Trainer
          </button>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, loading, error, onRetry, hasData, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
        <h2 className="card-title">{title}</h2>
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton width="w-2/3" height="h-3" />
          <Skeleton height="h-[300px]" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !hasData ? (
        <EmptyChart />
      ) : (
        children
      )}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[300px] text-slate-500">
      No data available
    </div>
  );
}
