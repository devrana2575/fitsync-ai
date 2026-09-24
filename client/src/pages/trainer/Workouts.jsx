import { useState, useEffect } from 'react';
import { PlusIcon, ClipboardDocumentListIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Skeleton, { SkeletonRow } from '../../components/common/Skeleton';
import useTrainerDashboard from '../../hooks/useTrainerDashboard';
import exerciseImage from '../../assets/exerciseImage';
import { fmtDate } from '../../utils/format';

const emptyExercise = { exercise: '', sets: '', reps: '', weight: '', duration: '', restTime: '' };

const SOURCE_TONE = { trainer: 'badge-info', doctor: 'badge-warning', system: 'badge-muted' };

const inputCls = 'input';
const labelCls = 'label';

export default function Workouts() {
  const [plans, setPlans] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const { data: dashboard } = useTrainerDashboard();
  const members = dashboard?.members || [];

  const [form, setForm] = useState({
    name: '',
    description: '',
    member: '',
    goal: '',
    hoursPerDay: '',
    totalHours: '',
    recommendationSource: 'trainer',
    exercises: [{ ...emptyExercise }],
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [workoutsRes, exercisesRes] = await Promise.all([
        api.get('/workouts'),
        api.get('/exercises'),
      ]);
      const plansData = workoutsRes.data?.plans || workoutsRes.data || [];
      setPlans(Array.isArray(plansData) ? plansData : []);
      const exercisesData = exercisesRes.data?.exercises || exercisesRes.data || [];
      setExercises(Array.isArray(exercisesData) ? exercisesData : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleExerciseChange = (index, e) => {
    const updated = [...form.exercises];
    updated[index] = { ...updated[index], [e.target.name]: e.target.value };
    setForm({ ...form, exercises: updated });
  };

  const addExercise = () => {
    setForm({ ...form, exercises: [...form.exercises, { ...emptyExercise }] });
  };

  const removeExercise = (index) => {
    if (form.exercises.length <= 1) return;
    const updated = form.exercises.filter((_, i) => i !== index);
    setForm({ ...form, exercises: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) return setFormError('Plan name is required');
    if (!form.member) return setFormError('Please select a member');

    const validExercises = form.exercises.filter((ex) => ex.exercise);
    if (validExercises.length === 0) return setFormError('Add at least one exercise');

    try {
      setSubmitting(true);
      await api.post('/workouts', {
        name: form.name,
        description: form.description,
        member: form.member,
        goal: form.goal || undefined,
        hoursPerDay: form.hoursPerDay === '' ? undefined : Number(form.hoursPerDay),
        totalHours: form.totalHours === '' ? undefined : Number(form.totalHours),
        recommendationSource: form.recommendationSource || 'trainer',
        exercises: validExercises.map((ex) => ({
          exercise: ex.exercise,
          sets: Number(ex.sets) || 0,
          reps: Number(ex.reps) || 0,
          weight: Number(ex.weight) || 0,
          duration: Number(ex.duration) || 0,
          restTime: Number(ex.restTime) || 0,
        })),
      });
      setForm({ name: '', description: '', member: '', goal: '', hoursPerDay: '', totalHours: '', recommendationSource: 'trainer', exercises: [{ ...emptyExercise }] });
      setShowForm(false);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <div className="space-y-2">
          <Skeleton width="w-56" height="h-8" />
          <Skeleton width="w-72" height="h-4" />
        </div>
        <SkeletonRow rows={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="Workout Plans" subtitle="Create and manage member workout plans" icon={ClipboardDocumentListIcon} />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Workout Plans"
        subtitle={`${plans.length} plan${plans.length !== 1 ? 's' : ''} created`}
        icon={ClipboardDocumentListIcon}
        actions={
          <button onClick={() => setShowForm(!showForm)} className="btn btn-md btn-primary">
            {showForm ? (
              'Cancel'
            ) : (
              <>
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                New Plan
              </>
            )}
          </button>
        }
      />

      {showForm && (
        <div className="card p-6">
          <h2 className="card-title mb-4">Create Workout Plan</h2>
          {formError && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/25 rounded-lg text-sm text-danger">{formError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Plan Name *</label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Strength Program Week 1"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Member *</label>
                <select
                  name="member"
                  value={form.member}
                  onChange={handleChange}
                  className={inputCls}
                >
                  <option value="">Select a member</option>
                  {members.map((m) => (
                    <option key={m.user?._id || m._id} value={m.user?._id || m._id}>{m.user?.name || m.name || 'Member'}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={2}
                placeholder="Brief description of the plan..."
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Goal</label>
                <input
                  type="text"
                  name="goal"
                  value={form.goal}
                  onChange={handleChange}
                  placeholder="e.g. Fat loss"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Hours / Day</label>
                <input
                  type="number"
                  name="hoursPerDay"
                  value={form.hoursPerDay}
                  onChange={handleChange}
                  min="0"
                  step="0.5"
                  placeholder="e.g. 1"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Total Hours</label>
                <input
                  type="number"
                  name="totalHours"
                  value={form.totalHours}
                  onChange={handleChange}
                  min="0"
                  step="0.5"
                  placeholder="e.g. 20"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Recommendation Source</label>
                <select
                  name="recommendationSource"
                  value={form.recommendationSource}
                  onChange={handleChange}
                  className={inputCls}
                >
                  <option value="trainer">Trainer</option>
                  <option value="doctor">Doctor</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Exercises</h3>
                <button
                  type="button"
                  onClick={addExercise}
                  className="btn btn-sm btn-outline text-brand-400 border-brand-500/30 hover:bg-brand-500/120/10"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                  Add Exercise
                </button>
              </div>
              <div className="space-y-3">
                {form.exercises.map((ex, idx) => (
                  <div key={idx} className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-200">
                    <div className="col-span-2 md:col-span-2">
                      <label className={labelCls}>Exercise</label>
                      <select
                        name="exercise"
                        value={ex.exercise}
                        onChange={(e) => handleExerciseChange(idx, e)}
                        className={inputCls}
                      >
                        <option value="">Select exercise</option>
                        {exercises.map((e) => (
                          <option key={e._id || e.id} value={e._id || e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Sets</label>
                      <input type="number" name="sets" value={ex.sets} onChange={(e) => handleExerciseChange(idx, e)} min="0" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Reps</label>
                      <input type="number" name="reps" value={ex.reps} onChange={(e) => handleExerciseChange(idx, e)} min="0" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Weight (kg)</label>
                      <input type="number" name="weight" value={ex.weight} onChange={(e) => handleExerciseChange(idx, e)} min="0" step="0.5" className={inputCls} />
                    </div>
                    <div className="flex items-end">
                      {form.exercises.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeExercise(idx)}
                          className="btn btn-sm btn-ghost text-danger hover:text-danger hover:bg-danger/10"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-md btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn btn-md btn-primary">
                {submitting ? 'Creating...' : 'Create Plan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {plans.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardDocumentListIcon}
            message="No workout plans yet"
            description="Create a workout plan to start guiding your members' training."
            action={
              <button onClick={() => setShowForm(true)} className="btn btn-md btn-primary">
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                New Plan
              </button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Plan Name</th>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Goal</th>
                  <th className="px-6 py-3">Hours / Day</th>
                  <th className="px-6 py-3">Total Hours</th>
                  <th className="px-6 py-3">Exercises</th>
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((plan, i) => {
                  const firstExercise = plan.exercises?.[0]?.exercise;
                  return (
                    <tr key={plan._id || plan.id} className={i % 2 === 0 ? 'bg-transparent' : 'bg-slate-100/40'}>
                      <td className="px-6 py-4">
                        <div className="min-w-0 max-w-xs">
                          <p className="text-sm font-semibold text-slate-900 break-words">{plan.name}</p>
                          {plan.description && (
                            <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{plan.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={plan.member?.name || plan.memberName} size="sm" />
                          <span className="text-sm text-slate-600">{plan.member?.name || plan.memberName || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{plan.goal || '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 tabular-nums">{plan.hoursPerDay != null ? plan.hoursPerDay : '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 tabular-nums">{plan.totalHours != null ? plan.totalHours : '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <img
                            src={exerciseImage(firstExercise)}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-md bg-slate-100 object-cover"
                          />
                          <span className="text-sm text-slate-600 tabular-nums">{plan.exercises?.length || 0}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`badge ${SOURCE_TONE[plan.recommendationSource] || 'badge-muted'}`}>
                          {plan.recommendationSource ? plan.recommendationSource.charAt(0).toUpperCase() + plan.recommendationSource.slice(1) : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge value={plan.isActive} label={plan.isActive ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{fmtDate(plan.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-400">
            <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Plans are created for members assigned to you.
          </div>
        </div>
      )}
    </div>
  );
}