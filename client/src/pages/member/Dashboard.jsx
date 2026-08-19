import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function MemberDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [insights, setInsights] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [dashRes, measRes, insRes, goalsRes] = await Promise.all([
        api.get('/analytics/member/dashboard').catch(() => ({ data: {} })),
        api.get('/measurements/my').catch(() => ({ data: {} })),
        api.get('/ml/insights').catch(() => ({ data: {} })),
        api.get('/goals/my').catch(() => ({ data: {} })),
      ]);
      setDashboard(dashRes.data);
      const measData = measRes.data?.measurements || measRes.data || [];
      setMeasurements(Array.isArray(measData) ? measData.slice(-10) : []);
      setInsights(insRes.data?.insights || insRes.data || []);
      setGoals(goalsRes.data?.goals || goalsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    try {
      await api.post('/attendance/qr-checkin');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  const stats = {
    attendancePercentage: dashboard?.attendancePercentage ?? 0,
    totalWorkouts: dashboard?.totalWorkouts ?? 0,
    recentWorkouts: dashboard?.recentWorkouts ?? 0,
  };
  const membership = {
    planName: dashboard?.membership?.plan?.name || '',
    expiryDate: dashboard?.membership?.endDate || '',
    status: dashboard?.membership?.status || '',
  };
  const weightData = measurements.map((m) => ({
    date: new Date(m.createdAt || m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: m.weight,
  }));

  const activeGoals = Array.isArray(goals) ? goals.filter((g) => g.status?.toLowerCase() === 'active') : [];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">My Dashboard</h1>
          <p className="text-slate-500 mt-1">Welcome back, {user?.name}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard icon="📊" label="Attendance %" value={`${stats.attendancePercentage ?? 0}%`} color="green" />
          <StatCard icon="🏋️" label="Total Workouts" value={stats.totalWorkouts ?? 0} color="blue" />
          <StatCard icon="📝" label="Recent Workouts" value={stats.recentWorkouts ?? 0} color="indigo" />
          <StatCard icon="🎯" label="Active Goals" value={activeGoals.length} color="purple" />
        </div>

        {membership.planName && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Membership</h2>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-sm text-slate-500">Plan</p>
                <p className="text-base font-medium text-slate-900">{membership.planName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Expiry</p>
                <p className="text-base font-medium text-slate-900">
                  {membership.expiryDate
                    ? new Date(membership.expiryDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Status</p>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  membership.status?.toLowerCase() === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {membership.status || 'unknown'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Weight Trend</h2>
            {weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-slate-400 text-sm">
                No measurement data yet. Record your first measurement!
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button onClick={handleCheckIn} className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors text-left flex items-center gap-3">
                <span className="text-lg">📍</span>
                <div>
                  <p className="font-semibold">Check In</p>
                  <p className="text-indigo-200 text-xs">Mark your attendance</p>
                </div>
              </button>
              <button onClick={() => navigate('/member/workouts')} className="w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors text-left flex items-center gap-3">
                <span className="text-lg">🏋️</span>
                <div>
                  <p className="font-semibold">Log Workout</p>
                  <p className="text-slate-500 text-xs">Record your workout</p>
                </div>
              </button>
              <button onClick={() => navigate('/member/progress')} className="w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors text-left flex items-center gap-3">
                <span className="text-lg">📏</span>
                <div>
                  <p className="font-semibold">Record Measurement</p>
                  <p className="text-slate-500 text-xs">Track body metrics</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {Array.isArray(insights) && insights.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">AI Insights</h2>
            <div className="space-y-3">
              {insights.slice(0, 5).map((insight, idx) => (
                <div key={idx} className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <p className="text-sm text-slate-700">{insight.message || insight.text || insight}</p>
                  {insight.type && (
                    <span className="inline-block mt-1 text-xs text-indigo-600 font-medium">{insight.type}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
