import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowPathIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import { Skeleton } from '../../components/common/Skeleton';

const COLORS = ['#B7F34A', '#35C979', '#F4B740', '#EF5B63', '#5EA7FF', '#A78BFA'];

export default function Analytics() {
  const [revenue, setRevenue] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [membershipDist, setMembershipDist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const [revResult, attResult, peakResult, memResult] = await Promise.allSettled([
      api.get('/analytics/admin/revenue-trend'),
      api.get('/analytics/admin/attendance-trend'),
      api.get('/analytics/admin/peak-hours'),
      api.get('/analytics/admin/membership-distribution'),
    ]);

    const newErrors = {};

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

    if (peakResult.status === 'fulfilled') {
      const rawPeak = peakResult.value.data.peakHours || peakResult.value.data.data || peakResult.value.data || [];
      setPeakHours(rawPeak.map((p) => ({ hour: `${p._id ?? ''}:00`, count: p.count || 0 })));
    } else {
      newErrors.peakHours = peakResult.reason?.message;
    }

    if (memResult.status === 'fulfilled') {
      const rawDist = memResult.value.data.distribution || memResult.value.data.data || memResult.value.data || [];
      setMembershipDist(rawDist.map((d) => ({ plan: d._id || '', count: d.count || 0 })));
    } else {
      newErrors.membershipDist = memResult.reason?.message;
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

  const fmtCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Advanced Analytics"
        subtitle="Deep-dive trends across revenue, attendance and usage"
        icon={ChartBarIcon}
        actions={
          <button onClick={handleRefresh} disabled={refreshing} className="btn btn-outline btn-md">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard
          title="Revenue Trend"
          subtitle="Monthly revenue from the gym"
          loading={loading}
          error={errors.revenue && "We couldn't load the revenue trend."}
          onRetry={handleRefresh}
          hasData={revenue.length > 0}
        >
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
              <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
              <YAxis tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmtCurrency(v)} contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
              <Legend wrapperStyle={{ color: '#9aa4ad' }} />
              <Line type="monotone" dataKey="revenue" stroke="#B7F34A" strokeWidth={3} dot={{ r: 5, fill: '#B7F34A' }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Attendance Trend"
          subtitle="Daily check-ins over the selected window"
          loading={loading}
          error={errors.attendance && "We couldn't load the attendance trend."}
          onRetry={handleRefresh}
          hasData={attendance.length > 0}
        >
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={attendance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
              <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
              <YAxis tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
              <Tooltip contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
              <Legend wrapperStyle={{ color: '#9aa4ad' }} />
              <Bar dataKey="count" fill="#B7F34A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Peak Hours Analysis"
          subtitle="Busiest hours of the day across the gym"
          loading={loading}
          error={errors.peakHours && "We couldn't load the peak hours data."}
          onRetry={handleRefresh}
          hasData={peakHours.length > 0}
        >
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
              <XAxis dataKey="hour" tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
              <YAxis tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
              <Tooltip contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
              <Legend wrapperStyle={{ color: '#9aa4ad' }} />
              <Bar dataKey="count" fill="#5EA7FF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Membership Distribution"
          subtitle="Current memberships split across plan types"
          loading={loading}
          error={errors.membershipDist && "We couldn't load the membership breakdown."}
          onRetry={handleRefresh}
          hasData={membershipDist.length > 0}
        >
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={membershipDist}
                cx="50%"
                cy="50%"
                outerRadius={140}
                innerRadius={60}
                dataKey="count"
                nameKey="plan"
                paddingAngle={2}
                label={({ plan, percent }) => `${plan} (${(percent * 100).toFixed(0)}%)`}
              >
                {membershipDist.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v} contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
              <Legend wrapperStyle={{ color: '#9aa4ad' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, loading, error, onRetry, hasData, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton width="w-2/3" height="h-3" />
          <Skeleton height="h-[340px]" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !hasData ? (
        <EmptyState icon={ChartBarIcon} message="No data available" />
      ) : (
        children
      )}
    </div>
  );
}