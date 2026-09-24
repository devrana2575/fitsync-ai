import { useState, useEffect } from 'react';
import { TrophyIcon, PlusIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import { SkeletonCard } from '../../components/common/Skeleton';
import { fmtDate } from '../../utils/format';

const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'muscle_gain', label: 'Muscle Gain' },
  { value: 'strength', label: 'Strength' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'flexibility', label: 'Flexibility' },
  { value: 'general_fitness', label: 'General Fitness' },
];

export default function Goals() {
  const { toast } = useToast();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('active');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const [form, setForm] = useState({
    type: '',
    title: '',
    description: '',
    target: '',
    current: '',
    start: '',
    unit: '',
    targetDate: '',
  });

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const res = await api.get('/goals/my');
      const data = res.data?.goals || res.data || [];
      setGoals(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.type) return setFormError('Please select a goal type');
    if (!form.title.trim()) return setFormError('Title is required');
    if (!form.target) return setFormError('Target value is required');

    try {
      setSubmitting(true);
      await api.post('/goals', {
        type: form.type,
        title: form.title,
        description: form.description,
        target: Number(form.target),
        current: Number(form.current) || 0,
        start: form.start !== '' ? Number(form.start) : undefined,
        unit: form.unit,
        targetDate: form.targetDate || undefined,
      });
      setForm({ type: '', title: '', description: '', target: '', current: '', start: '', unit: '', targetDate: '' });
      setShowForm(false);
      fetchGoals();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProgress = async (goalId) => {
    const value = Number(editValue);
    if (isNaN(value)) return;
    try {
      await api.put(`/goals/${goalId}/progress`, { current: value });
      setEditingId(null);
      setEditValue('');
      fetchGoals();
    } catch (err) {
      toast.error('Update failed', err.message);
    }
  };

  const isDownGoal = (type) => ['weight_loss'].includes((type || '').toLowerCase());

  const getProgress = (goal) => {
    const target = Number(goal.target);
    const start = goal.start ? Number(goal.start) : null;
    const current = Number(goal.current ?? 0) || start || 0;
    if (!target) return 0;
    if (target === start) return 100;
    if (start == null) return Math.min(Math.max((current / target) * 100, 0), 100);
    const pct = isDownGoal(goal.type)
      ? ((start - current) / (start - target)) * 100
      : ((current - start) / (target - start)) * 100;
    return Math.min(Math.max(pct, 0), 100);
  };

  const filteredGoals = goals.filter((g) => {
    const s = (g.status || '').toUpperCase();
    if (tab === 'active') return s === 'ACTIVE' || s === '' || !g.completedAt;
    if (tab === 'completed') return s === 'COMPLETED' || s === 'PAUSED' || g.completedAt;
    return true;
  });

  const emptyState = {
    active: { message: 'You\'re all caught up — no active goals right now' },
    completed: { message: 'No completed goals yet' },
    all: { message: 'No goals yet — set your first goal to get started' },
  }[tab];

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader
          title="My Goals"
          subtitle={`${goals.length} goal${goals.length !== 1 ? 's' : ''} set`}
          icon={TrophyIcon}
        />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader
          title="My Goals"
          subtitle={`${goals.length} goal${goals.length !== 1 ? 's' : ''} set`}
          icon={TrophyIcon}
        />
        <div className="p-6 text-center text-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="My Goals"
        subtitle={`${goals.length} goal${goals.length !== 1 ? 's' : ''} set`}
        icon={TrophyIcon}
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-md btn-primary"
          >
            {showForm ? 'Cancel' : (<><PlusIcon className="h-5 w-5" aria-hidden="true" /> New Goal</>)}
          </button>
        }
      />

      {showForm && (
        <div className="card p-6">
          <h2 className="card-title mb-5">Create New Goal</h2>
          {formError && (
            <div className="mb-4 rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-danger">{formError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Goal Type *</label>
                <select name="type" value={form.type} onChange={handleChange} className="input">
                  <option value="">Select goal type</option>
                  {GOAL_TYPES.map((gt) => (
                    <option key={gt.value} value={gt.value}>{gt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="e.g. Lose 5kg"
                  className="input"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Describe your goal..."
                  className="input"
                />
              </div>
              <div>
                <label className="label">Target Value *</label>
                <input
                  type="number"
                  name="target"
                  value={form.target}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                  placeholder="e.g. 70"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Starting Value</label>
                <input
                  type="number"
                  name="start"
                  value={form.start}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                  placeholder="e.g. 80"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Current Value</label>
                <input
                  type="number"
                  name="current"
                  value={form.current}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                  placeholder="0"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Unit</label>
                <input
                  type="text"
                  name="unit"
                  value={form.unit}
                  onChange={handleChange}
                  placeholder="e.g. kg, minutes, reps"
                  className="input"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Target Date</label>
                <input
                  type="date"
                  name="targetDate"
                  value={form.targetDate}
                  onChange={handleChange}
                  className="input"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting} className="btn btn-md btn-primary disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Goal'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {['active', 'completed', 'all'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`btn btn-sm capitalize ${tab === t ? 'btn-primary' : 'btn-outline'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {filteredGoals.length === 0 ? (
        <EmptyState
          icon={TrophyIcon}
          message={emptyState.message}
          action={
            <button onClick={() => setShowForm(true)} className="btn btn-md btn-primary">
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              New Goal
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredGoals.map((goal) => {
            const progress = getProgress(goal);
            const goalType = GOAL_TYPES.find((gt) => gt.value === goal.type);
            const isCompleted = (goal.status || '').toUpperCase() === 'COMPLETED';
            return (
              <div key={goal._id || goal.id} className="card p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{goal.title}</h3>
                      {goalType && <span className="badge badge-brand">{goalType.label}</span>}
                      <StatusBadge value={goal.status} />
                    </div>
                    {goal.description && <p className="mt-1 text-sm text-slate-500">{goal.description}</p>}
                  </div>
                  {goal.targetDate && (
                    <span className="shrink-0 text-xs text-slate-400">Target: {fmtDate(goal.targetDate)}</span>
                  )}
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {goal.start != null && <span className="text-slate-400">{goal.start} → </span>}
                      {goal.current ?? 0} / {goal.target} {goal.unit || ''}
                    </span>
                    <span className="font-medium text-slate-900 tabular-nums">{Math.round(progress)}%</span>
                  </div>
                  <ProgressBar value={progress} tone={isCompleted ? 'success' : 'brand'} />
                  {isDownGoal(goal.type) && <span className="badge badge-muted mt-2">Lower is better</span>}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {editingId === (goal._id || goal.id) ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        step="0.1"
                        className="input w-28"
                        placeholder="New value"
                      />
                      <button onClick={() => handleUpdateProgress(goal._id || goal.id)} className="btn btn-sm btn-primary">
                        Save
                      </button>
                      <button onClick={() => { setEditingId(null); setEditValue(''); }} className="btn btn-sm btn-outline">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingId(goal._id || goal.id); setEditValue(String(goal.current ?? '')); }}
                      className="btn btn-sm btn-outline"
                    >
                      Update Progress
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}