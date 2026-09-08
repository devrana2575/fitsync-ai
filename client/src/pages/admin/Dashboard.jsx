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
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { fmtDateShort } from '../../utils/format';

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [membershipDist, setMembershipDist] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const [dashResult, revResult, attResult, memResult, peakResult] = await Promise.allSettled([
      api.get('/analytics/admin/dashboard'),
      api.get('/analytics/admin/revenue-trend'),
      api.get('/analytics/admin/attendance-trend'),
      api.get('/analytics/admin/membership-distribution'),
      api.get('/analytics/admin/peak-hours'),
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
      setMembershipDist(rawDist.map((d) => ({ plan: d._id || '', count: d.count || 0 })));
    } else {
      newErrors.membershipDist = memResult.reason?.message;
    }

    if (peakResult.status === 'fulfilled') {
      const rawPeak = peakResult.value.data.peakHours || peakResult.value.data.data || peakResult.value.data || [];
      setPeakHours(rawPeak.map((p) => ({ hour: `${p._id ?? ''}:00`, count: p.count || 0 })));
    } else {
      newErrors.peakHours = peakResult.reason?.message;
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

  if (loading) return <LoadingSpinner size="lg" />;

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
  const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {errors.stats ? (
        <ErrorState message="Failed to load dashboard stats" onRetry={handleRefresh} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={UsersIcon} label="Total Members" value={fmt(stats?.totalMembers)} color="indigo" />
          <StatCard icon={CheckCircleIcon} label="Active Members" value={fmt(stats?.activeMembers)} color="green" />
          <StatCard icon={UserGroupIcon} label="Total Trainers" value={fmt(stats?.totalTrainers)} color="blue" />
          <StatCard icon={CreditCardIcon} label="Active Memberships" value={fmt(stats?.activeMemberships)} color="cyan" />
          <StatCard icon={ClockIcon} label="Expiring Soon" value={fmt(stats?.expiringSoon)} color="yellow" />
          <StatCard icon={BanknotesIcon} label="Total Revenue" value={fmtCurrency(stats?.totalRevenue)} color="purple" />
          <StatCard icon={ClipboardDocumentCheckIcon} label="Today's Attendance" value={fmt(stats?.todayAttendance)} color="green" />
          <StatCard icon={ChartBarIcon} label="Monthly Attendance" value={fmt(stats?.monthlyAttendance)} color="red" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/admin/members', { state: { openCreate: true } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
            Add Member
          </button>
          <button
            onClick={() => navigate('/admin/payments', { state: { openCreate: true } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <BanknotesIcon className="h-4 w-4" aria-hidden="true" />
            Record Payment
          </button>
          <button
            onClick={() => navigate('/admin/memberships', { state: { openCreate: true } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <CreditCardIcon className="h-4 w-4" aria-hidden="true" />
            Assign Membership
          </button>
          <button
            onClick={() => navigate('/admin/attendance')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <ClipboardDocumentCheckIcon className="h-4 w-4" aria-hidden="true" />
            Check In Member
          </button>
          <button
            onClick={() => navigate('/admin/trainers', { state: { openCreate: true } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add Trainer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Expiring Soon</h2>
            <button
              onClick={() => navigate('/admin/memberships')}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              View all
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {(stats?.expiringMembers || []).length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {(stats.expiringMembers || []).map((m) => (
                <li key={m?._id}>
                  <button
                    onClick={() => m?.user?._id && navigate(`/admin/members/${m.user._id}`)}
                    className="w-full flex items-center justify-between py-3 text-left hover:bg-slate-50 rounded-lg px-2 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">
                        {m?.user?.name || 'Unknown member'}
                      </span>
                      <span className="block text-xs text-slate-500">{m?.plan?.name || 'Membership'}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-amber-600">
                      {m?.endDate ? `Until ${fmtDateShort(m.endDate)}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
              No memberships expiring in the next 30 days
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Pending Payments</h2>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-bold text-slate-900">{fmtCurrency(stats?.pendingPayments)}</p>
              <p className="text-sm text-slate-500 mt-1">
                Outstanding amount awaiting collection
              </p>
            </div>
            <button
              onClick={() => navigate('/admin/payments')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Record payment
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Revenue Trend</h2>
          {errors.revenue ? (
            <ErrorState message="Failed to load revenue data" onRetry={handleRefresh} />
          ) : revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmtCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance Trend</h2>
          {errors.attendance ? (
            <ErrorState message="Failed to load attendance data" onRetry={handleRefresh} />
          ) : attendance.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={attendance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Members by Status</h2>
          {errors.membershipDist ? (
            <ErrorState message="Failed to load membership data" onRetry={handleRefresh} />
          ) : membershipDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={membershipDist}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="count"
                  nameKey="plan"
                  label={({ plan, percent }) => `${plan} (${(percent * 100).toFixed(0)}%)`}
                >
                  {membershipDist.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Peak Hours</h2>
          {errors.peakHours ? (
            <ErrorState message="Failed to load peak hours data" onRetry={handleRefresh} />
          ) : peakHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={peakHours}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[300px] text-slate-400">
      No data available
    </div>
  );
}
