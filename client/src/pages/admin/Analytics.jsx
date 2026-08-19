import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Analytics() {
  const [revenue, setRevenue] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [membershipDist, setMembershipDist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [revRes, attRes, peakRes, memRes] = await Promise.all([
          api.get('/analytics/admin/revenue-trend'),
          api.get('/analytics/admin/attendance-trend'),
          api.get('/analytics/admin/peak-hours'),
          api.get('/analytics/admin/membership-distribution'),
        ]);
        const rawRevenue = revRes.data.trend || revRes.data.data || revRes.data || [];
        setRevenue(rawRevenue.map((r) => ({
          month: `${r._id?.year || ''}-${String(r._id?.month || 0).padStart(2, '0')}`,
          revenue: r.total || 0,
        })));

        const rawAttendance = attRes.data.trend || attRes.data.data || attRes.data || [];
        setAttendance(rawAttendance.map((a) => ({ day: a._id || '', count: a.count || 0 })));

        const rawPeak = peakRes.data.peakHours || peakRes.data.data || peakRes.data || [];
        setPeakHours(rawPeak.map((p) => ({ hour: `${p._id ?? ''}:00`, count: p.count || 0 })));

        const rawDist = memRes.data.distribution || memRes.data.data || memRes.data || [];
        setMembershipDist(rawDist.map((d) => ({ plan: d._id || '', count: d.count || 0 })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return <LoadingSpinner size="lg" />;

  const fmtCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Advanced Analytics</h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Revenue Trend</h2>
          {revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmtCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} dot={{ r: 5, fill: '#6366f1' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance Trend</h2>
          {attendance.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={attendance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Peak Hours Analysis</h2>
          {peakHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={peakHours}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Membership Distribution</h2>
          {membershipDist.length > 0 ? (
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
                <Tooltip formatter={(v) => v} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[400px] text-slate-400">
      No data available
    </div>
  );
}
