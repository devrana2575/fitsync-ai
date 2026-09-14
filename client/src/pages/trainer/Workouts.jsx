import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const emptyExercise = { exercise: '', sets: '', reps: '', weight: '', duration: '', restTime: '' };

export default function Workouts() {
  const [plans, setPlans] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    member: '',
    exercises: [{ ...emptyExercise }],
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [workoutsRes, exercisesRes, dashboardRes] = await Promise.all([
        api.get('/workouts'),
        api.get('/exercises'),
        api.get('/analytics/trainer/dashboard'),
      ]);
      const plansData = workoutsRes.data?.plans || workoutsRes.data || [];
      setPlans(Array.isArray(plansData) ? plansData : []);
      const exercisesData = exercisesRes.data?.exercises || exercisesRes.data || [];
      setExercises(Array.isArray(exercisesData) ? exercisesData : []);
      const membersData = dashboardRes.data?.members || [];
      setMembers(Array.isArray(membersData) ? membersData : []);
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
        exercises: validExercises.map((ex) => ({
          exercise: ex.exercise,
          sets: Number(ex.sets) || 0,
          reps: Number(ex.reps) || 0,
          weight: Number(ex.weight) || 0,
          duration: Number(ex.duration) || 0,
          restTime: Number(ex.restTime) || 0,
        })),
      });
      setForm({ name: '', description: '', member: '', exercises: [{ ...emptyExercise }] });
      setShowForm(false);
      fetchData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Workout Plans</h1>
            <p className="text-slate-500 mt-1">{plans.length} plan{plans.length !== 1 ? 's' : ''} created</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Plan'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Create Workout Plan</h2>
            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Strength Program Week 1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Member *</label>
                  <select
                    name="member"
                    value={form.member}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select a member</option>
                    {members.map((m) => (
                      <option key={m.user?._id || m._id} value={m.user?._id || m._id}>{m.user?.name || m.name || 'Member'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Brief description of the plan..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Exercises</h3>
                  <button type="button" onClick={addExercise} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                    + Add Exercise
                  </button>
                </div>
                <div className="space-y-3">
                  {form.exercises.map((ex, idx) => (
                    <div key={idx} className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="col-span-2 md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Exercise</label>
                        <select
                          name="exercise"
                          value={ex.exercise}
                          onChange={(e) => handleExerciseChange(idx, e)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Select exercise</option>
                          {exercises.map((e) => (
                            <option key={e._id || e.id} value={e._id || e.id}>{e.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Sets</label>
                        <input type="number" name="sets" value={ex.sets} onChange={(e) => handleExerciseChange(idx, e)} min="0" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Reps</label>
                        <input type="number" name="reps" value={ex.reps} onChange={(e) => handleExerciseChange(idx, e)} min="0" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Weight (kg)</label>
                        <input type="number" name="weight" value={ex.weight} onChange={(e) => handleExerciseChange(idx, e)} min="0" step="0.5" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="flex items-end">
                        {form.exercises.length > 1 && (
                          <button type="button" onClick={() => removeExercise(idx)} className="px-2 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {plans.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <p className="text-lg">No workout plans yet</p>
            <p className="text-sm mt-1">Click &quot;New Plan&quot; to create your first workout plan</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Plan Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Member</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exercises</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {plans.map((plan) => (
                    <tr key={plan._id || plan.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{plan.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{plan.member?.name || plan.memberName || '—'}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{plan.exercises?.length || 0}</td>
                       <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          plan.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {plan.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {plan.createdAt
                          ? new Date(plan.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
