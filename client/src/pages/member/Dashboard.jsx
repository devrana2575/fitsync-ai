import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  ChartBarIcon,
  BoltIcon,
  ClipboardDocumentListIcon,
  FlagIcon,
  MapPinIcon,
  ClipboardDocumentCheckIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  BuildingOffice2Icon,
  AcademicCapIcon,
  CheckCircleIcon,
  ScaleIcon,
  TrophyIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import StatCard from '../../components/common/StatCard';
import ErrorState from '../../components/common/ErrorState';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import Avatar from '../../components/common/Avatar';
import { SkeletonCard } from '../../components/common/Skeleton';
import ProfileCompletionCard from '../../components/common/ProfileCompletionCard';
import exerciseImage from '../../assets/exerciseImage';
import { fmtDate } from '../../utils/format';
import {
  AXIS,
  CHART_COLORS,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from '../../utils/chartTheme';

const TODAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function goalProgress(goal) {
  const target = Number(goal.target);
  const start = goal.start !== undefined && goal.start !== null && goal.start !== '' ? Number(goal.start) : null;
  const current = Number(goal.current ?? 0) || start || 0;
  if (!target) return 0;
  if (target === start) return 100;
  if (start === null) return Math.min(Math.max((current / target) * 100, 0), 100);
  const isDown = String(goal.type || '').toLowerCase() === 'weight_loss';
  const pct = isDown
    ? ((start - current) / (start - target)) * 100
    : ((current - start) / (target - start)) * 100;
  return Math.min(Math.max(pct, 0), 100);
}

function Ring({ value }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="attendance-ring" x1="0" y1="0" x2="1" y2="1">
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
          stroke="url(#attendance-ring)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-slate-900 metric-value">{Math.round(clamped)}%</span>
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">Attendance</span>
      </div>
    </div>
  );
}

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

  const sortedMeasurements = useMemo(
    () => [...measurements].sort((a, b) => new Date(a.createdAt || a.date) - new Date(b.createdAt || b.date)),
    [measurements]
  );

  const weightData = useMemo(
    () => sortedMeasurements.map((m) => ({
      date: new Date(m.createdAt || m.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      weight: m.weight,
    })).filter((d) => d.weight != null),
    [sortedMeasurements]
  );

  const activeGoals = useMemo(
    () => (Array.isArray(goals) ? goals.filter((g) => g.status?.toLowerCase() === 'active') : []),
    [goals]
  );

  const latest = sortedMeasurements[sortedMeasurements.length - 1];
  const earliest = sortedMeasurements[0];
  const composition = useMemo(() => {
    if (!latest) return [];
    const bmi = latest.bmi || (latest.weight && latest.height
      ? Math.round((latest.weight / ((latest.height / 100) ** 2)) * 10) / 10
      : null);
    return [
      { key: 'weight', label: 'Weight', unit: 'kg', digits: 1, value: latest.weight },
      { key: 'bodyFat', label: 'Body fat', unit: '%', digits: 1, value: latest.bodyFat },
      { key: 'bmi', label: 'BMI', unit: '', digits: 1, value: bmi },
      { key: 'waist', label: 'Waist', unit: 'cm', digits: 1, value: latest.waist },
    ]
      .filter((m) => m.value !== undefined && m.value !== null && m.value !== '')
      .map((m) => {
        const first = earliest?.[m.key];
        const delta = earliest && earliest !== latest && first !== undefined && first !== null && first !== ''
          ? Number(latest[m.key]) - Number(first)
          : null;
        return { ...m, delta: Number.isFinite(delta) ? delta : null };
      });
  }, [latest, earliest]);

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <SkeletonCard />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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

  const todayName = () => TODAY_NAMES[new Date().getDay()];
  const firstName = (user?.name || 'Athlete').split(' ')[0];
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

  const latestWeight = weightData[weightData.length - 1]?.weight;
  const weightDelta = weightData.length > 1
    ? Number(weightData[weightData.length - 1].weight) - Number(weightData[0].weight)
    : null;

  return (
    <div className="page-wrap space-y-6">
      {completion && !completion.allRequiredComplete && (
        <ProfileCompletionCard completion={completion} member />
      )}

      {errors.dashboard ? (
        <div className="card p-5">
          <ErrorState message="We couldn't load your dashboard right now. Please try again." onRetry={handleRefresh} />
        </div>
      ) : (
        <>
          {/* Hero command center */}
          <section className="card relative overflow-hidden p-6 sm:p-8">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  'linear-gradient(#55e6dc 1px, transparent 1px), linear-gradient(90deg, #55e6dc 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(34rem 18rem at 88% -10%, rgba(85,230,220,0.14), transparent 65%)',
              }}
              aria-hidden="true"
            />
            <div className="relative grid gap-8 xl:grid-cols-[1.4fr_1fr] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    <CalendarDaysIcon className="h-4 w-4 text-brand-500" aria-hidden="true" />
                    {todayDate}
                  </span>
                  {membership.status ? <StatusBadge value={membership.status} /> : null}
                  <span className={`badge ${dashboard?.todayCheckIn ? 'badge-success' : 'badge-muted'}`}>
                    {dashboard?.todayCheckIn ? (dashboard.todayCheckOut ? 'Visit complete' : 'Checked in') : 'Not checked in'}
                  </span>
                </div>

                <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 font-display">
                  {greetingFor()}, {firstName}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-slate-500">
                  {dashboard?.todayCheckIn
                    ? (dashboard.todayCheckOut
                        ? 'You completed today\u2019s visit. Keep the momentum going.'
                        : 'You are checked in — remember to check out before you leave.')
                    : 'Your command center is ready. Check in to start today\u2019s session.'}
                </p>

                <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:max-w-2xl">
                  <button onClick={handleCheckIn} disabled={refreshing} className="btn btn-md btn-primary justify-start">
                    <MapPinIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="text-left leading-tight">
                      <span className="block font-semibold">Check In</span>
                      <span className="block text-xs font-normal text-primary-fg/70">Mark your attendance</span>
                    </span>
                  </button>
                  <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-outline justify-start">
                    <BuildingOffice2Icon className="h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
                    <span className="text-left leading-tight">
                      <span className="block font-semibold">View Membership</span>
                      <span className="block text-xs font-normal text-slate-500">Plan & renewals</span>
                    </span>
                  </button>
                  <button onClick={() => navigate('/member/workouts')} className="btn btn-md btn-outline justify-start">
                    <BoltIcon className="h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
                    <span className="text-left leading-tight">
                      <span className="block font-semibold">Log Workout</span>
                      <span className="block text-xs font-normal text-slate-500">Record your workout</span>
                    </span>
                  </button>
                  <button onClick={() => navigate('/member/progress')} className="btn btn-md btn-outline justify-start">
                    <ClipboardDocumentCheckIcon className="h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
                    <span className="text-left leading-tight">
                      <span className="block font-semibold">Record Measurement</span>
                      <span className="block text-xs font-normal text-slate-500">Track body metrics</span>
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface/50 p-4">
                  <Ring value={stats.attendancePercentage} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">Consistency</p>
                    <p className="mt-1 text-sm text-slate-700">Attendance across recorded check-ins.</p>
                    <p className="mt-2 text-xs text-slate-500">{stats.recentWorkouts} workouts in the recent window</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border bg-surface/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Days left</p>
                    <p className="mt-1.5 text-2xl font-semibold text-slate-900 metric-value">
                      {membershipDaysLeft !== null ? membershipDaysLeft : '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Membership</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface/50 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Active goals</p>
                    <p className="mt-1.5 text-2xl font-semibold text-slate-900 metric-value">
                      {errors.goals ? '—' : activeGoals.length}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">In progress</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={ChartBarIcon} label="Attendance" value={`${stats.attendancePercentage ?? 0}%`} color="green" sub="Recorded check-ins" />
            <StatCard icon={BoltIcon} label="Total Workouts" value={stats.totalWorkouts ?? 0} color="blue" sub="All time" />
            <StatCard icon={ClipboardDocumentListIcon} label="Recent Workouts" value={stats.recentWorkouts ?? 0} color="brand" sub="Recent window" />
            <StatCard icon={FlagIcon} label="Active Goals" value={errors.goals ? '—' : activeGoals.length} color="yellow" sub="Currently tracking" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="card p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200">
                    <BoltIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
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
                        {totalSets > 0 && <p className="text-xs text-slate-500">{totalSets} total sets planned</p>}
                      </div>
                      <button onClick={() => navigate('/member/workouts')} className="btn btn-sm btn-primary">
                        View Plan <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {workoutExercises.slice(0, 6).map((ex, idx) => {
                        const exData = ex.exercise || ex;
                        return (
                          <div key={idx} className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-2.5">
                            <img
                              src={exerciseImage(exData)}
                              alt={exData?.name || 'Exercise'}
                              loading="lazy"
                              className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/5"
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
                    <div className="mb-3 rounded-full bg-brand-50 p-3 ring-1 ring-inset ring-brand-200">
                      <CheckCircleIcon className="h-6 w-6 text-brand-500" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Rest day — no workout scheduled.</p>
                    <p className="mt-1 text-xs text-slate-500">Check your plans or log a workout and keep the momentum going.</p>
                    <button onClick={() => navigate('/member/workouts')} className="btn btn-md btn-outline mt-4">
                      Browse Workout Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <div className="card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200">
                      <ChartBarIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h2 className="card-title">Weight Trend</h2>
                  </div>
                  {latestWeight != null && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="text-base font-semibold text-slate-900 metric-value">{latestWeight} kg</span>
                      {weightDelta !== null && weightDelta !== 0 && (
                        <span className={`inline-flex items-center gap-0.5 ${weightDelta < 0 ? 'text-success' : 'text-warning'}`}>
                          {weightDelta < 0
                            ? <ArrowTrendingDownIcon className="h-4 w-4" aria-hidden="true" />
                            : <ArrowTrendingUpIcon className="h-4 w-4" aria-hidden="true" />}
                          {Math.abs(weightDelta).toFixed(1)} kg
                        </span>
                      )}
                      <span>· {weightData.length} reading{weightData.length === 1 ? '' : 's'}</span>
                    </div>
                  )}
                </div>
                {errors.measurements ? (
                  <ErrorState message="We couldn't load your measurements right now. Please try again." onRetry={handleRefresh} />
                ) : weightData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={weightData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="weight-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS.brand} stopOpacity={0.32} />
                          <stop offset="100%" stopColor={CHART_COLORS.brand} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
                      <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS.tick }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                      <Area
                        type="monotone"
                        dataKey="weight"
                        stroke={CHART_COLORS.brand}
                        strokeWidth={2.5}
                        fill="url(#weight-fill)"
                        dot={false}
                        activeDot={{ r: 5, fill: CHART_COLORS.brand, stroke: '#04110f', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[240px] flex-col items-center justify-center text-center">
                    <p className="text-sm font-medium text-slate-600">No measurements recorded yet</p>
                    <p className="mt-1 text-xs text-slate-500">Record your first measurement to see your weight trend.</p>
                    <button onClick={() => navigate('/member/progress')} className="btn btn-md btn-primary mt-4">
                      Record Measurement
                    </button>
                  </div>
                )}
              </div>

              <div className="card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200">
                      <TrophyIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h2 className="card-title">Goal Momentum</h2>
                  </div>
                  {activeGoals.length > 0 && (
                    <button onClick={() => navigate('/member/goals')} className="btn btn-ghost btn-sm">
                      All goals <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {activeGoals.length > 0 ? (
                  <ul className="space-y-4">
                    {activeGoals.slice(0, 3).map((goal) => {
                      const pct = goalProgress(goal);
                      return (
                        <li key={goal._id || goal.title}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800">{goal.title}</p>
                            <p className="text-xs text-slate-500 tabular-nums">
                              {goal.current ?? 0}{goal.unit ? ` ${goal.unit}` : ''}
                              {goal.target != null ? ` / ${goal.target}${goal.unit ? ` ${goal.unit}` : ''}` : ''}
                            </p>
                          </div>
                          <ProgressBar value={pct} tone={pct >= 100 ? 'success' : 'brand'} className="mt-2" />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center py-6 text-center">
                    <div className="mb-3 rounded-full bg-brand-50 p-3 ring-1 ring-inset ring-brand-200">
                      <FlagIcon className="h-6 w-6 text-brand-500" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">No active goals</p>
                    <p className="mt-1 text-xs text-slate-500">Set a target to track your momentum.</p>
                    <button onClick={() => navigate('/member/goals')} className="btn btn-md btn-outline mt-4">
                      Create a Goal <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200">
                    <BuildingOffice2Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="card-title">Membership</h2>
                </div>
                {membership.planName ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 font-display">{membership.planName}</h3>
                        <div className="mt-1.5">
                          <StatusBadge value={membership.status} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Plan ends</p>
                        <p className="text-sm font-semibold text-slate-900 tabular-nums">{fmtDate(membership.expiryDate)}</p>
                      </div>
                    </div>
                    {membershipDaysLeft !== null && (
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-baseline gap-1.5">
                          <span className="text-2xl font-semibold text-slate-900 metric-value">{membershipDaysLeft}</span>
                          <span className="text-sm text-slate-500">
                            day{membershipDaysLeft === 1 ? '' : 's'} remaining
                          </span>
                        </div>
                        <ProgressBar value={membershipProgress} tone={progressTone} segments={10} />
                        <p className="mt-1.5 text-[11px] text-slate-500">Membership period elapsed</p>
                      </div>
                    )}
                    <div className="mt-4">
                      <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-outline w-full">
                        Manage Membership <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <div className="mb-3 rounded-full bg-slate-100 p-3 ring-1 ring-inset ring-border">
                      <BuildingOffice2Icon className="h-6 w-6 text-slate-500" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">No active membership</p>
                    <p className="mt-1 text-xs text-slate-500">Pick a plan to keep training and unlock perks.</p>
                    <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-primary mt-4">
                      View Membership Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <div className="card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200">
                    <ScaleIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="card-title">Body Composition</h2>
                </div>
                {composition.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      {composition.map((metric) => (
                        <div key={metric.key} className="rounded-xl border border-border bg-surface/50 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900 metric-value">
                            {Number(metric.value).toFixed(metric.digits)}
                            {metric.unit ? <span className="ml-1 text-xs font-normal text-slate-500">{metric.unit}</span> : null}
                          </p>
                          {metric.delta !== null && metric.delta !== 0 && (
                            <p className={`mt-0.5 inline-flex items-center gap-0.5 text-[11px] ${metric.delta < 0 ? 'text-success' : 'text-warning'}`}>
                              {metric.delta < 0
                                ? <ArrowTrendingDownIcon className="h-3 w-3" aria-hidden="true" />
                                : <ArrowTrendingUpIcon className="h-3 w-3" aria-hidden="true" />}
                              {Math.abs(metric.delta).toFixed(metric.digits)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => navigate('/member/progress')} className="btn btn-sm btn-ghost mt-3 w-full">
                      View measurement history <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-6 text-center">
                    <p className="text-sm font-medium text-slate-600">No measurements yet</p>
                    <p className="mt-1 text-xs text-slate-500">Record weight and body metrics to see trends here.</p>
                    <button onClick={() => navigate('/member/progress')} className="btn btn-md btn-outline mt-4">
                      Record Measurement
                    </button>
                  </div>
                )}
              </div>

              <div className="card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200">
                    <AcademicCapIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
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
                    {trainer.email && (
                      <a href={`mailto:${trainer.email}`} className="btn btn-md btn-outline w-full">
                        <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
                        Contact trainer
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <div className="mb-3 rounded-full bg-slate-100 p-3 ring-1 ring-inset ring-border">
                      <AcademicCapIcon className="h-6 w-6 text-slate-500" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Get assigned a trainer</p>
                    <p className="mt-1 text-xs text-slate-500">Premium plans include dedicated coach support.</p>
                    <button onClick={() => navigate('/member/membership')} className="btn btn-md btn-outline mt-4">
                      View Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
