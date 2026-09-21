import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  ChartBarIcon,
  BoltIcon,
  ClipboardDocumentListIcon,
  FlagIcon,
  MapPinIcon,
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import ProfileCompletionCard from '../../components/common/ProfileCompletionCard';

export default function MemberDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [goals, setGoals] = useState([]);
  const [completion, setCompletion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const [dashResult, measResult, goalsResult, meResult] = await Promise.allSettled([
      api.get('/analytics/member/dashboard'),
      api.get('/measurements/my'),
      api.get('/goals/my'),
      api.get('/auth/me'),
    ]);

    const newErrors = {};

    if (dashResult.status === 'fulfilled') {
      setDashboard(dashResult.value.data);
    } else {
      newErrors.dashboard = dashResult.reason?.message;
    }

    if (measResult.status === 'fulfilled') {
      const measData = measResult.value.data?.measurements || measResult.value.data || [];
      setMeasurements(Array.isArray(measData) ? measData.slice(-10) : []);
    } else {
      newErrors.measurements = measResult.reason?.message;
    }

    if (goalsResult.status === 'fulfilled') {
      setGoals(goalsResult.value.data?.goals || goalsResult.value.data || []);
    } else {
      newErrors.goals = goalsResult.reason?.message;
    }

    if (meResult.status === 'fulfilled') {
      setCompletion(meResult.value.data?.completion || null);
    }

    setErrors(newErrors);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchData]);

  const handleRefresh = () => fetchData(true);

  const handleCheckIn = async () => {
    try {
      await api.post('/attendance/qr-checkin');
      fetchData(true);
    } catch (err) {
      alert(err.message);
    }
  };

  const weightData = useMemo(
    () => measurements.map((m) => ({
      date: new Date(m.createdAt || m.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      weight: m.weight,
    })),
    [measurements]
  );

  const activeGoals = useMemo(
    () => (Array.isArray(goals) ? goals.filter((g) => g.status?.toLowerCase() === 'active') : []),
    [goals]
  );

  if (loading) return <LoadingSpinner />;

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
  const todayWorkout = dashboard?.todayWorkout;

  const todayName = () => {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return names[new Date().getDay()];
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Dashboard</h1>
            <p className="text-slate-500 mt-1">Welcome back, {user?.name}</p>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>

        {completion && !completion.allRequiredComplete && (
          <div className="mb-6">
            <ProfileCompletionCard completion={completion} member />
          </div>
        )}

        {errors.dashboard ? (
          <ErrorState message="Failed to load dashboard data" onRetry={handleRefresh} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard icon={ChartBarIcon} label="Attendance %" value={`${stats.attendancePercentage ?? 0}%`} color="green" />
              <StatCard icon={BoltIcon} label="Total Workouts" value={stats.totalWorkouts ?? 0} color="blue" />
              <StatCard icon={ClipboardDocumentListIcon} label="Recent Workouts" value={stats.recentWorkouts ?? 0} color="indigo" />
              <StatCard icon={FlagIcon} label="Active Goals" value={errors.goals ? '—' : activeGoals.length} color="purple" />
            </div>

            {(todayWorkout || dashboard?.todayCheckIn === true || dashboard?.todayCheckIn === false) && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <ClipboardDocumentListIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">Today ({todayName()})</h2>
                      {dashboard.todayCheckIn ? (
                        dashboard.todayCheckOut ? (
                          <p className="text-sm text-green-600">Checked in and completed today&apos;s visit</p>
                        ) : (
                          <p className="text-sm text-green-600">Checked in — remember to check out</p>
                        )
                      ) : (
                        <p className="text-sm text-slate-500">You haven&apos;t checked in yet today</p>
                      )}
                    </div>
                  </div>
                  {todayWorkout ? (
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{todayWorkout.name}</p>
                      <p className="text-xs text-slate-500">{todayWorkout.exercises?.length || 0} exercises</p>
                      <button onClick={() => navigate('/member/workouts')} className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">View plan</button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No workout scheduled today</p>
                  )}
                </div>
              </div>
            )}

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
                        ? new Date(membership.expiryDate).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Status</p>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${membership.status?.toLowerCase() === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {membership.status || 'unknown'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Weight Trend</h2>
            {errors.measurements ? (
              <ErrorState message="Failed to load measurement data" onRetry={handleRefresh} />
            ) : weightData.length > 0 ? (
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
                <MapPinIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Check In</p>
                  <p className="text-indigo-200 text-xs">Mark your attendance</p>
                </div>
              </button>
              <button onClick={() => navigate('/member/workouts')} className="w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors text-left flex items-center gap-3">
                <BoltIcon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Log Workout</p>
                  <p className="text-slate-500 text-xs">Record your workout</p>
                </div>
              </button>
              <button onClick={() => navigate('/member/progress')} className="w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors text-left flex items-center gap-3">
                <ClipboardDocumentCheckIcon className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Record Measurement</p>
                  <p className="text-slate-500 text-xs">Track body metrics</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
