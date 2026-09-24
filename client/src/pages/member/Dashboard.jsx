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
  ArrowRightIcon,
  CalendarDaysIcon,
  BuildingOffice2Icon,
  AcademicCapIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import StatCard from '../../components/common/StatCard';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import Avatar from '../../components/common/Avatar';
import { SkeletonCard } from '../../components/common/Skeleton';
import ProfileCompletionCard from '../../components/common/ProfileCompletionCard';
import exerciseImage from '../../assets/exerciseImage';
import { fmtDate } from '../../utils/format';

export default function MemberDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
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
      toast.error('Check-in failed', err.message);
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

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    );
  }

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

  const greeting = user?.name || 'Athlete';
  const todayDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const msStart = dashboard?.membership?.startDate ? new Date(dashboard.membership.startDate) : null;
  const msEnd = membership.expiryDate ? new Date(membership.expiryDate) : null;
  const now = new Date();
  const membershipDaysLeft = msEnd ? Math.max(0, Math.ceil((msEnd - now) / 86400000)) : null;
  const membershipProgress = msStart && msEnd && msEnd > msStart
    ? Math.min(100, Math.max(0, Math.round(((now - msStart) / (msEnd - msStart)) * 100)))
    : (String(membership.status).toLowerCase() === 'active' ? 100 : 0);
  const progressTone = membershipDaysLeft === 0 ? 'danger' : membershipDaysLeft !== null && membershipDaysLeft <= 7 ? 'warning' : 'brand';

  const trainer = dashboard?.trainer;

  const workoutExercises = todayWorkout?.exercises || [];
  const totalSets = workoutExercises.reduce((sum, ex) => sum + (Number(ex.sets) || 0), 0);

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="My Dashboard"
        subtitle={`Welcome back, ${user?.name || 'Athlete'} — here's your command center.`}
        icon={ChartBarIcon}
        actions={
          <button onClick={handleRefresh} disabled={refreshing} className="btn btn-md btn-outline">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {completion && !completion.allRequiredComplete && (
        <ProfileCompletionCard completion={completion} member />
      )}

      {errors.dashboard ? (
        <div className="card p-5">
          <ErrorState message="We couldn't load your dashboard right now. Please try again." onRetry={handleRefresh} />
        </div>
      ) : (
        <>
          <div className="card-dark relative overflow-hidden rounded-xl border-ink-700 p-6 sm:p-8">
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage: 'linear-gradient(#a3e635 1px, transparent 1px), linear-gradient(90deg, #a3e635 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
              aria-hidden="true"
            />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2 text-brand-400">
                <CalendarDaysIcon className="h-5 w-5" aria-hidden="true" />
                <p className="text-sm font-medium">{todayDate}</p>
              </div>
              <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Welcome back, {greeting}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {dashboard?.todayCheckIn
                  ? (dashboard.todayCheckOut
                      ? 'Checked in and completed today\u2019s visit. Great work!'
                      : 'Checked in — remember to check out before you leave.')
                  : 'You haven\u2019t checked in yet today.'}
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <button onClick={handleCheckIn} disabled={refreshing} className="btn btn-md btn-primary justify-start">
                  <MapPinIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="text-left leading-tight">
                    <span className="block font-semibold">Check In</span>
                    <span className="block text-xs font-normal text-ink-900/70">Mark your attendance</span>
                  </span>
                </button>
                <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-outline-dark justify-start">
                  <BuildingOffice2Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="text-left leading-tight">
                    <span className="block font-semibold">View Membership</span>
                    <span className="block text-xs font-normal text-slate-400">Plan & renewals</span>
                  </span>
                </button>
                <button onClick={() => navigate('/member/workouts')} className="btn btn-md btn-outline-dark justify-start">
                  <BoltIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="text-left leading-tight">
                    <span className="block font-semibold">Log Workout</span>
                    <span className="block text-xs font-normal text-slate-400">Record your workout</span>
                  </span>
                </button>
                <button onClick={() => navigate('/member/progress')} className="btn btn-md btn-outline-dark justify-start">
                  <ClipboardDocumentCheckIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="text-left leading-tight">
                    <span className="block font-semibold">Record Measurement</span>
                    <span className="block text-xs font-normal text-slate-400">Track body metrics</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={ChartBarIcon} label="Attendance %" value={`${stats.attendancePercentage ?? 0}%`} color="green" />
            <StatCard icon={BoltIcon} label="Total Workouts" value={stats.totalWorkouts ?? 0} color="blue" />
            <StatCard icon={ClipboardDocumentListIcon} label="Recent Workouts" value={stats.recentWorkouts ?? 0} color="brand" />
            <StatCard icon={FlagIcon} label="Active Goals" value={errors.goals ? '—' : activeGoals.length} color="ink" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <BoltIcon className="h-5 w-5 text-brand-400" aria-hidden="true" />
                  <h2 className="card-title">Today&apos;s Workout</h2>
                  <span className="badge badge-info ml-auto">{todayName()}</span>
                </div>
                {todayWorkout ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{todayWorkout.name}</h3>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {workoutExercises.length} exercises{todayWorkout.description ? ` · ${todayWorkout.description}` : ''}
                        </p>
                        {totalSets > 0 && <p className="text-xs text-slate-400">{totalSets} total sets planned</p>}
                      </div>
                      <button onClick={() => navigate('/member/workouts')} className="btn btn-sm btn-primary">
                        View Plan <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {workoutExercises.slice(0, 6).map((ex, idx) => {
                        const exData = ex.exercise || ex;
                        return (
                          <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                            <img
                              src={exerciseImage(exData)}
                              alt={exData?.name || 'Exercise'}
                              loading="lazy"
                              className="h-10 w-10 shrink-0 rounded-lg bg-surface object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">{exData?.name || 'Exercise'}</p>
                              <p className="text-xs text-slate-500">
                                {ex.sets ? `${ex.sets} sets` : ''}{ex.sets && ex.reps ? ' × ' : ''}{ex.reps ? `${ex.reps} reps` : ''}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <div className="mb-3 rounded-full bg-brand-100 p-3">
                      <CheckCircleIcon className="h-6 w-6 text-brand-400" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Rest day — no workout scheduled.</p>
                    <p className="mt-1 text-xs text-slate-400">Check your plans or log a workout and keep the momentum going.</p>
                    <button onClick={() => navigate('/member/workouts')} className="btn btn-md btn-outline mt-4">
                      Browse Workout Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <div className="card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <BuildingOffice2Icon className="h-5 w-5 text-brand-400" aria-hidden="true" />
                  <h2 className="card-title">Membership</h2>
                </div>
                {membership.planName ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">{membership.planName}</h3>
                        <div className="mt-1.5">
                          <StatusBadge value={membership.status} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">Plan ends</p>
                        <p className="text-base font-semibold text-slate-900 tabular-nums">{fmtDate(membership.expiryDate)}</p>
                      </div>
                    </div>
                    {membershipDaysLeft !== null && (
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-baseline gap-1.5">
                          <span className="text-2xl font-semibold text-slate-900 tabular-nums">{membershipDaysLeft}</span>
                          <span className="text-sm text-slate-500">
                            day{membershipDaysLeft === 1 ? '' : 's'} remaining
                          </span>
                        </div>
                        <ProgressBar value={membershipProgress} tone={progressTone} />
                      </div>
                    )}
                    <div className="mt-4">
                      <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-outline w-full sm:w-auto">
                        Manage Membership <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <div className="mb-3 rounded-full bg-slate-100 p-3">
                      <BuildingOffice2Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">No active membership</p>
                    <p className="mt-1 text-xs text-slate-400">Pick a plan to keep training and unlock perks.</p>
                    <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-primary mt-4">
                      View Membership Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="card p-5 self-start">
              <div className="mb-4 flex items-center gap-2">
                <AcademicCapIcon className="h-5 w-5 text-brand-400" aria-hidden="true" />
                <h2 className="card-title">Your Trainer</h2>
              </div>
              {trainer && trainer.name ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={trainer.name} src={trainer.avatar} size="lg" />
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-900">{trainer.name}</p>
                      {Array.isArray(trainer.profile?.specializations) && trainer.profile.specializations.length > 0 && (
                        <p className="truncate text-xs text-slate-500">{trainer.profile.specializations.join(', ')}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {trainer.profile?.isAvailable !== false && <span className="badge badge-success">Available</span>}
                    {trainer.profile?.isAvailable === false && <span className="badge badge-muted">Away</span>}
                    {trainer.profile?.experience ? <span className="badge badge-brand">{trainer.profile.experience} yr experience</span> : null}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="mb-3 rounded-full bg-slate-100 p-3">
                    <AcademicCapIcon className="h-6 w-6 text-slate-400" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Get assigned a trainer</p>
                  <p className="mt-1 text-xs text-slate-400">Premium plans include dedicated coach support.</p>
                  <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-outline mt-4">
                    View Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ChartBarIcon className="h-5 w-5 text-brand-400" aria-hidden="true" />
                <h2 className="card-title">Weight Trend</h2>
              </div>
              {weightData.length > 0 && <span className="text-xs text-slate-400">{weightData.length} measurement{weightData.length === 1 ? '' : 's'}</span>}
            </div>
            {errors.measurements ? (
              <ErrorState message="We couldn't load your measurements right now. Please try again." onRetry={handleRefresh} />
            ) : weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={weightData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
                  <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
                  <YAxis tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
                  <Tooltip contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
                  <Line type="monotone" dataKey="weight" stroke="#B7F34A" strokeWidth={2} dot={{ fill: '#B7F34A' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] flex-col items-center justify-center text-center">
                <p className="text-sm font-medium text-slate-600">No measurements recorded yet</p>
                <p className="mt-1 text-xs text-slate-400">Record your first measurement to see your weight trend.</p>
                <button onClick={() => navigate('/member/progress')} className="btn btn-md btn-primary mt-4">
                  Record Measurement
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}