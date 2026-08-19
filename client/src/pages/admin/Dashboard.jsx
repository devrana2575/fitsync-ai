import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [membershipDist, setMembershipDist] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [dashRes, revRes, attRes, memRes, peakRes] = await Promise.all([
          api.get('/analytics/admin/dashboard'),
          api.get('/analytics/admin/revenue-trend'),
          api.get('/analytics/admin/attendance-trend'),
          api.get('/analytics/admin/membership-distribution'),
          api.get('/analytics/admin/peak-hours'),
        ]);
        setStats(dashRes.data);

        const rawRevenue = revRes.data.trend || revRes.data.data || revRes.data || [];
        setRevenue(rawRevenue.map((r) => ({
          month: `${r._id?.year || ''}-${String(r._id?.month || 0).padStart(2, '0')}`,
          revenue: r.total || 0,
        })));

        const rawAttendance = attRes.data.trend || attRes.data.data || attRes.data || [];
        setAttendance(rawAttendance.map((a) => ({ day: a._id || '', count: a.count || 0 })));

        const rawDist = memRes.data.distribution || memRes.data.data || memRes.data || [];
        setMembershipDist(rawDist.map((d) => ({ plan: d._id || '', count: d.count || 0 })));

        const rawPeak = peakRes.data.peakHours || peakRes.data.data || peakRes.data || [];
        setPeakHours(rawPeak.map((p) => ({ hour: `${p._id ?? ''}:00`, count: p.count || 0 })));
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
  const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="👥" label="Total Members" value={fmt(stats?.totalMembers)} color="indigo" />
        <StatCard icon="✅" label="Active Members" value={fmt(stats?.activeMembers)} color="green" />
        <StatCard icon="🏋️" label="Total Trainers" value={fmt(stats?.totalTrainers)} color="blue" />
        <StatCard icon="📋" label="Active Memberships" value={fmt(stats?.activeMemberships)} color="cyan" />
        <StatCard icon="⏰" label="Expiring Soon" value={fmt(stats?.expiringSoon)} color="yellow" />
        <StatCard icon="💰" label="Total Revenue" value={fmtCurrency(stats?.totalRevenue)} color="purple" />
        <StatCard icon="📍" label="Today's Attendance" value={fmt(stats?.todayAttendance)} color="green" />
        <StatCard icon="📊" label="Monthly Attendance" value={fmt(stats?.monthlyAttendance)} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Revenue Trend</h2>
          {revenue.length > 0 ? (
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
          {attendance.length > 0 ? (
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
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Membership Distribution</h2>
          {membershipDist.length > 0 ? (
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
          {peakHours.length > 0 ? (
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
