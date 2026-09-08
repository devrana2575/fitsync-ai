import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const GOAL_TYPES = [
  { value: 'weight_loss', label: 'Weight Loss' },
  { value: 'muscle_gain', label: 'Muscle Gain' },
  { value: 'strength', label: 'Strength' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'flexibility', label: 'Flexibility' },
  { value: 'general_fitness', label: 'General Fitness' },
];

export default function Goals() {
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

  useEffect(() => {
    fetchGoals();
  }, []);

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
      alert(err.message);
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

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Goals</h1>
            <p className="text-slate-500 mt-1">{goals.length} goal{goals.length !== 1 ? 's' : ''} set</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Goal'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Create New Goal</h2>
            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Goal Type *</label>
                  <select
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select goal type</option>
                    {GOAL_TYPES.map((gt) => (
                      <option key={gt.value} value={gt.value}>{gt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                  <input
                    type="text"
                    name="title"
                    value={form.title}
                    onChange={handleChange}
                    placeholder="e.g. Lose 5kg"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Describe your goal..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Value *</label>
                  <input
                    type="number"
                    name="target"
                    value={form.target}
                    onChange={handleChange}
                    min="0"
                    step="0.1"
                    placeholder="e.g. 70"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Starting Value</label>
                  <input
                    type="number"
                    name="start"
                    value={form.start}
                    onChange={handleChange}
                    min="0"
                    step="0.1"
                    placeholder="e.g. 80"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current Value</label>
                  <input
                    type="number"
                    name="current"
                    value={form.current}
                    onChange={handleChange}
                    min="0"
                    step="0.1"
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    name="unit"
                    value={form.unit}
                    onChange={handleChange}
                    placeholder="e.g. kg, minutes, reps"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Date</label>
                  <input
                    type="date"
                    name="targetDate"
                    value={form.targetDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {['active', 'completed', 'all'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {filteredGoals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <p className="text-lg">No {tab === 'all' ? '' : tab} goals</p>
            <p className="text-sm mt-1">Click &quot;New Goal&quot; to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGoals.map((goal) => {
              const progress = getProgress(goal);
              const goalType = GOAL_TYPES.find((gt) => gt.value === goal.type);
              return (
                <div key={goal._id || goal.id} className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{goal.title}</h3>
                        {goalType && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                            {goalType.label}
                          </span>
                        )}
                      </div>
                      {goal.description && <p className="text-sm text-slate-500 mt-1">{goal.description}</p>}
                    </div>
                    {goal.targetDate && (
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        Target: {new Date(goal.targetDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-600">
                        {goal.start != null && (
                          <span className="text-slate-400">{goal.start} → </span>
                        )}
                        {goal.current ?? 0} / {goal.target} {goal.unit || ''}
                        {isDownGoal(goal.type) ? ' (lower is better)' : ''}
                      </span>
                      <span className="font-medium text-slate-900">{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5">
                      <div
                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {editingId === (goal._id || goal.id) ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          step="0.1"
                          className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="New value"
                        />
                        <button onClick={() => handleUpdateProgress(goal._id || goal.id)} className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                          Save
                        </button>
                        <button onClick={() => { setEditingId(null); setEditValue(''); }} className="px-3 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(goal._id || goal.id); setEditValue(String(goal.current ?? '')); }}
                        className="px-3 py-1 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
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
    </div>
  );
}
