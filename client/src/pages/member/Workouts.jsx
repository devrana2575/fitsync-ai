import { useState, useEffect } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

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

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        {recommendations && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Recommended For You</h2>
            {recContext && (
              <p className="text-sm text-slate-500 mt-1 mb-4">
                {[
                  recContext.primaryGoal ? `Based on your ${recContext.primaryGoal} goal` : null,
                  recContext.difficulty ? `${recContext.difficulty} level` : null,
                  typeof recContext.attendancePct === 'number' ? `${Math.round(recContext.attendancePct)}% 30-day attendance` : null,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
            {recommendations.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200">
                <EmptyState message="No recommendations available right now. Check back once you have more workout history." />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
                {recommendations.map((rec) => {
                  const pct = Math.min(100, Math.max(0, Math.round(Number(rec.score) || 0)));
                  return (
                  <div key={rec.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
                    <div>
                      <h3 className="font-semibold text-slate-900">{rec.name}</h3>
                      {rec.description && <p className="text-sm text-slate-500 mt-1">{rec.description}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {rec.goal && <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{rec.goal}</span>}
                        {rec.difficulty && <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{rec.difficulty}</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">{rec.exerciseCount ?? 0} exercises · assigned {rec.timesAssigned ?? 0} times</p>
                    </div>
                    {rec.reasons && rec.reasons.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-600">Why recommended</p>
                        <ul className="mt-1 space-y-1">
                          {rec.reasons.slice(0, 2).map((reason, idx) => (
                            <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-500">
                              <SparklesIcon className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {typeof rec.score === 'number' && (
                      <div className="mt-auto pt-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-slate-500">Match</span>
                          <span className="text-xs font-semibold text-indigo-600">{pct}%</span>
                        </div>
                        <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Workouts</h1>
            <p className="text-slate-500 mt-1">Track your fitness journey</p>
          </div>
          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {showLogForm ? 'Cancel' : '+ Log Workout'}
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Completed Workouts</p>
              <p className="text-2xl font-bold text-slate-900">{stats.completedWorkouts ?? stats.totalWorkouts ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Recent (30d)</p>
              <p className="text-2xl font-bold text-slate-900">{stats.recentWorkouts ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">Weekly Frequency</p>
              <p className="text-2xl font-bold text-slate-900">{Array.isArray(stats.weeklyFrequency) ? (stats.weeklyFrequency.length > 0 ? Math.round(stats.weeklyFrequency.reduce((sum, w) => sum + (w.count || 0), 0) / stats.weeklyFrequency.length * 10) / 10 : 0) : (stats.weeklyFrequency ?? 0)}</p>
            </div>
          </div>
        )}

        {showLogForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Log Workout</h2>
            {logError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{logError}</div>
            )}
            <form onSubmit={handleLogSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Exercise *</label>
                  <select
                    name="exercise"
                    value={logForm.exercise}
                    onChange={handleLogChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save Workout Log'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {['plans', 'history'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t === 'plans' ? 'Workout Plans' : 'History'}
            </button>
          ))}
        </div>

        {tab === 'plans' && (
          <>
            {plans.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <p className="text-lg">No workout plans assigned</p>
                <p className="text-sm mt-1">Your trainer will assign workout plans to you</p>
              </div>
            ) : (
              <div className="space-y-4">
                {plans.map((plan) => (
                  <div key={plan._id || plan.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
                        {plan.description && <p className="text-sm text-slate-500 mt-0.5">{plan.description}</p>}
                      </div>
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        plan.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {plan.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {plan.exercises && plan.exercises.length > 0 && (
                      <div className="p-6">
                        <div className="space-y-2">
                          {plan.exercises.map((ex, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <div>
                                <p className="text-sm font-medium text-slate-900">{ex.exercise?.name || ex.name || `Exercise ${idx + 1}`}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {ex.sets} sets × {ex.reps} reps
                                  {ex.weight ? ` @ ${ex.weight}kg` : ''}
                                </p>
                              </div>
                              {ex.duration > 0 && (
                                <span className="text-xs text-slate-500">{ex.duration}min</span>
                              )}
                            </div>
                          ))}
                        </div>
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
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <p className="text-lg">No workout history</p>
                <p className="text-sm mt-1">Start logging your workouts to see them here</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                            {new Date(log.createdAt || log.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
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
    </div>
  );
}
