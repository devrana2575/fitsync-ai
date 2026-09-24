import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BoltIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  PlusIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Skeleton, { SkeletonCard, SkeletonRow } from '../../components/common/Skeleton';
import exerciseImage from '../../assets/exerciseImage';
import { fmtDate } from '../../utils/format';

export default function Workouts() {
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [recContext, setRecContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('plans');
  const [showLogForm, setShowLogForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logError, setLogError] = useState('');

  const [logForm, setLogForm] = useState({
    exercise: '',
    sets: '',
    reps: '',
    weight: '',
    duration: '',
    notes: '',
  });

  const fetchRecommendations = async () => {
    try {
      const res = await api.get('/recommendations/my');
      const data = res.data?.recommendations || [];
      setRecommendations(Array.isArray(data) ? data.slice(0, 4) : []);
      setRecContext(res.data?.context || null);
    } catch {
      setRecommendations([]);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [plansRes, historyRes, statsRes, exercisesRes] = await Promise.allSettled([
        api.get('/workouts/my'),
        api.get('/workout-logs/my'),
        api.get('/workout-logs/stats'),
        api.get('/exercises'),
      ]);
      const plansData = plansRes.status === 'fulfilled' ? (plansRes.value.data?.plans || plansRes.value.data || []) : [];
      setPlans(Array.isArray(plansData) ? plansData : []);
      const historyData = historyRes.status === 'fulfilled' ? (historyRes.value.data?.logs || historyRes.value.data || []) : [];
      setHistory(Array.isArray(historyData) ? historyData : []);
      setStats(statsRes.status === 'fulfilled' ? statsRes.value.data : null);
      const exercisesData = exercisesRes.status === 'fulfilled' ? (exercisesRes.value.data?.exercises || exercisesRes.value.data || []) : [];
      setExercises(Array.isArray(exercisesData) ? exercisesData : []);
      const failed = [plansRes, historyRes, statsRes, exercisesRes].filter((r) => r.status === 'rejected');
      if (failed.length > 0) setError(failed.map((r) => r.reason?.message).filter(Boolean).join('; '));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchRecommendations();
  }, []);

  const handleLogChange = (e) => {
    setLogForm({ ...logForm, [e.target.name]: e.target.value });
  };

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    setLogError('');
    if (!logForm.exercise) return setLogError('Please select an exercise');

    try {
      setSubmitting(true);
      await api.post('/workout-logs', {
        exercise: logForm.exercise,
        sets: Number(logForm.sets) || 0,
        reps: Number(logForm.reps) || 0,
        weight: Number(logForm.weight) || 0,
        duration: Number(logForm.duration) || 0,
        notes: logForm.notes,
      });
      setLogForm({ exercise: '', sets: '', reps: '', weight: '', duration: '', notes: '' });
      setShowLogForm(false);
      fetchData();
    } catch (err) {
      setLogError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <Skeleton width="w-2/3" height="h-8" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="space-y-3">
          <Skeleton width="w-1/3" height="h-5" />
          <Skeleton width="w-2/3" height="h-3" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={`rec-${i}`} />)}
        </div>
        <SkeletonRow rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader
          title="My Workouts"
          subtitle="Track your fitness journey"
          icon={ClipboardDocumentListIcon}
        />
        <div className="card p-5">
          <ErrorState message={error} onRetry={fetchData} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="My Workouts"
        subtitle="Track your fitness journey"
        icon={ClipboardDocumentListIcon}
        actions={
          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="btn btn-md btn-primary"
          >
            {showLogForm ? (
              <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            )}
            {showLogForm ? 'Cancel' : '+ Log Workout'}
          </button>
        }
      />

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={BoltIcon} label="Completed Workouts" value={stats.completedWorkouts ?? stats.totalWorkouts ?? 0} color="green" />
          <StatCard icon={CalendarDaysIcon} label="Recent 30d" value={stats.recentWorkouts ?? 0} color="blue" />
          <StatCard
            icon={ChartBarIcon}
            label="Weekly Frequency"
            value={Array.isArray(stats.weeklyFrequency) ? (stats.weeklyFrequency.length > 0 ? Math.round(stats.weeklyFrequency.reduce((sum, w) => sum + (w.count || 0), 0) / stats.weeklyFrequency.length * 10) / 10 : 0) : (stats.weeklyFrequency ?? 0)}
            color="cyan"
          />
        </div>
      )}

      {recommendations && (
        <section className="space-y-4">
          <div className="card-dark relative overflow-hidden rounded-xl border-ink-700 p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-brand-400">
              <SparklesIcon className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-white">Recommended For You</h2>
            </div>
            {recContext && (
              <p className="mt-2 text-sm text-slate-400">
                {[
                  recContext.primaryGoal ? `Based on your ${recContext.primaryGoal} goal` : null,
                  recContext.difficulty ? `${recContext.difficulty} level` : null,
                  typeof recContext.attendancePct === 'number' ? `${Math.round(recContext.attendancePct)}% 30-day attendance` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {recommendations.length === 0 ? (
            <div className="card p-5">
              <EmptyState
                icon={SparklesIcon}
                message="No recommendations available right now. Check back once you have more workout history."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
              {recommendations.map((rec) => {
                const pct = Math.min(100, Math.max(0, Math.round(Number(rec.score) || 0)));
                return (
                  <div key={rec.id} className="card p-5 flex flex-col">
                    <div>
                      <h3 className="font-semibold text-slate-900">{rec.name}</h3>
                      {rec.description && <p className="text-sm text-slate-500 mt-1">{rec.description}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {rec.goal && <span className="badge badge-info">{rec.goal}</span>}
                        {rec.difficulty && <span className="badge badge-brand">{rec.difficulty}</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">{rec.exerciseCount ?? 0} exercises · assigned {rec.timesAssigned ?? 0} times</p>
                    </div>
                    {rec.reasons && rec.reasons.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-600">Why recommended</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {rec.reasons.slice(0, 2).map((reason, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded-full bg-brand-500/12 px-2.5 py-1 text-xs text-brand-400"
                            >
                              <SparklesIcon className="h-3 w-3" aria-hidden="true" />
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {typeof rec.score === 'number' && (
                      <div className="mt-auto pt-3">
                        <ProgressBar value={pct} tone="brand" label="Match" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showLogForm && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Log Workout</h2>
          {logError && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/25 rounded-lg text-sm text-danger">{logError}</div>
          )}
          <form onSubmit={handleLogSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Exercise *</label>
                <select
                  name="exercise"
                  value={logForm.exercise}
                  onChange={handleLogChange}
                  className="w-full px-3 py-2 input"
                >
                  <option value="">Select exercise</option>
                  {exercises.map((e) => (
                    <option key={e._id || e.id} value={e._id || e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Duration (min)</label>
                <input
                  type="number"
                  name="duration"
                  value={logForm.duration}
                  onChange={handleLogChange}
                  min="0"
                  placeholder="0"
                  className="w-full px-3 py-2 input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sets</label>
                <input
                  type="number"
                  name="sets"
                  value={logForm.sets}
                  onChange={handleLogChange}
                  min="0"
                  placeholder="0"
                  className="w-full px-3 py-2 input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reps</label>
                <input
                  type="number"
                  name="reps"
                  value={logForm.reps}
                  onChange={handleLogChange}
                  min="0"
                  placeholder="0"
                  className="w-full px-3 py-2 input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  name="weight"
                  value={logForm.weight}
                  onChange={handleLogChange}
                  min="0"
                  step="0.5"
                  placeholder="0"
                  className="w-full px-3 py-2 input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  name="notes"
                  value={logForm.notes}
                  onChange={handleLogChange}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 input"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting} className="btn btn-md btn-primary disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save Workout Log'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-2">
        {['plans', 'history'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`btn btn-md ${tab === t ? 'btn-primary' : 'btn-outline'}`}
          >
            {t === 'plans' ? 'Workout Plans' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'plans' && (
        <>
          {plans.length === 0 ? (
            <div className="card p-5">
              <EmptyState
                icon={BoltIcon}
                message="No workout plan yet"
                description="Your trainer hasn't assigned a workout plan yet."
                action={
                  <Link to="/member/membership" className="btn btn-md btn-primary">
                    View membership
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => (
                <div key={plan._id || plan.id} className="card overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
                        {plan.exercises && plan.exercises.length > 0 && (
                          <span className="badge badge-muted">
                            {plan.exercises.length} exercise{plan.exercises.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      {plan.description && <p className="text-sm text-slate-500 mt-0.5">{plan.description}</p>}
                    </div>
                    <StatusBadge value={plan.isActive !== false ? 'ACTIVE' : 'INACTIVE'} />
                  </div>
                  {plan.exercises && plan.exercises.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {plan.exercises.map((ex, idx) => {
                        const exData = ex.exercise || ex;
                        const name = exData?.name || ex.name || `Exercise ${idx + 1}`;
                        return (
                          <div key={idx} className="flex items-center gap-4 px-6 py-3">
                            <img
                              src={exerciseImage(ex.exercise || ex)}
                              loading="lazy"
                              className="h-12 w-12 rounded-lg object-cover"
                              alt={name}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {ex.sets} × {ex.reps}
                                {ex.weight ? ` · ${ex.weight} kg` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-slate-500">
                              {ex.duration > 0 && <span>{ex.duration} min</span>}
                              {ex.rest > 0 && <span>{ex.rest}s rest</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-6 py-6 text-sm text-slate-500">
                      No exercises have been added to this plan yet.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <>
          {history.length === 0 ? (
            <div className="card p-5">
              <EmptyState
                icon={ClockIcon}
                message="No workout history"
                description="Start logging your workouts to see them here"
              />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exercise</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Sets × Reps</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Weight</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {history.map((log, idx) => (
                      <tr key={log._id || log.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-900">
                          {fmtDate(log.createdAt || log.date)}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                          {log.exercise?.name || log.exerciseName || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{log.sets} × {log.reps}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{log.weight ? `${log.weight}kg` : '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">{log.duration ? `${log.duration}min` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}