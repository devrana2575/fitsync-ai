import { useState, useEffect } from 'react';
import { DocumentDuplicateIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';

const GOALS = ['strength', 'hypertrophy', 'endurance', 'weight_loss', 'general_fitness'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const GOAL_LABELS = { strength: 'Strength', hypertrophy: 'Hypertrophy', endurance: 'Endurance', weight_loss: 'Weight Loss', general_fitness: 'General Fitness' };
const DIFF_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const GOAL_COLORS = { strength: 'bg-blue-100 text-blue-700', hypertrophy: 'bg-purple-100 text-purple-700', endurance: 'bg-orange-100 text-orange-700', weight_loss: 'bg-red-100 text-red-700', general_fitness: 'bg-teal-100 text-teal-700' };
const DIFF_COLORS = { beginner: 'bg-green-100 text-green-700', intermediate: 'bg-yellow-100 text-yellow-700', advanced: 'bg-red-100 text-red-700' };

const emptyExercise = { exercise: '', sets: '', reps: '', weight: '', duration: '', restTime: '' };

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [goalFilter, setGoalFilter] = useState('all');
  const [diffFilter, setDiffFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', goal: '', difficulty: '', exercises: [{ ...emptyExercise }] });
  const [assignTemplate, setAssignTemplate] = useState(null);
  const [assignMember, setAssignMember] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (goalFilter !== 'all') params.goal = goalFilter;
      if (diffFilter !== 'all') params.difficulty = diffFilter;
      const [tplRes, exRes, memRes] = await Promise.all([
        api.get('/templates', { params }),
        api.get('/exercises'),
        api.get('/analytics/trainer/dashboard'),
      ]);
      setTemplates(tplRes.data?.templates || []);
      setExercises(exRes.data?.exercises || []);
      setMembers(memRes.data?.members || []);
    } catch (err) {
      setError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [goalFilter, diffFilter]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleFormChange = (e) => { setForm({ ...form, [e.target.name]: e.target.value }); };

  const handleExerciseChange = (index, e) => {
    const updated = [...form.exercises];
    updated[index] = { ...updated[index], [e.target.name]: e.target.value };
    setForm({ ...form, exercises: updated });
  };

  const addExercise = () => setForm({ ...form, exercises: [...form.exercises, { ...emptyExercise }] });

  const removeExercise = (index) => {
    if (form.exercises.length <= 1) return;
    setForm({ ...form, exercises: form.exercises.filter((_, i) => i !== index) });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Template name is required', 'error');
    const validExercises = form.exercises.filter((ex) => ex.exercise);
    if (validExercises.length === 0) return showToast('Add at least one exercise', 'error');
    try {
      setSaving(true);
      await api.post('/templates', {
        name: form.name,
        description: form.description,
        goal: form.goal,
        difficulty: form.difficulty,
        exercises: validExercises.map((ex) => ({
          exercise: ex.exercise,
          sets: Number(ex.sets) || 0,
          reps: Number(ex.reps) || 0,
          weight: Number(ex.weight) || 0,
          duration: Number(ex.duration) || 0,
          restTime: Number(ex.restTime) || 0,
        })),
      });
      setShowCreate(false);
      setForm({ name: '', description: '', goal: '', difficulty: '', exercises: [{ ...emptyExercise }] });
      showToast('Template created successfully');
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to create template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignMember) return showToast('Select a member', 'error');
    try {
      setAssigning(true);
      await api.post(`/templates/${assignTemplate._id}/assign`, { memberId: assignMember });
      setAssignTemplate(null);
      setAssignMember('');
      showToast('Template assigned successfully');
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to assign template', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleDeactivate = async (tpl) => {
    if (!window.confirm(`Deactivate template "${tpl.name}"?`)) return;
    try {
      await api.delete(`/templates/${tpl._id}`);
      showToast('Template deactivated');
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to deactivate template', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Workout Templates</h1>
        <button onClick={() => setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + New Template
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
          <option value="all">All Goals</option>
          {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
        </select>
        <select value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
          <option value="all">All Difficulties</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFF_LABELS[d]}</option>)}
        </select>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchData} />
        </div>
      ) : loading ? (
        <LoadingSpinner size="lg" />
      ) : templates.length === 0 ? (
        <EmptyState icon={DocumentDuplicateIcon} message="No workout templates found" />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Goal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Difficulty</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exercises</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Assigned</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created By</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {templates.map((tpl) => (
                  <tr key={tpl._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{tpl.name}</td>
                    <td className="px-6 py-4">
                      {tpl.goal ? <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${GOAL_COLORS[tpl.goal] || 'bg-slate-100 text-slate-600'}`}>{GOAL_LABELS[tpl.goal] || tpl.goal}</span> : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {tpl.difficulty ? <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${DIFF_COLORS[tpl.difficulty] || 'bg-slate-100 text-slate-600'}`}>{DIFF_LABELS[tpl.difficulty] || tpl.difficulty}</span> : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{tpl.exercises?.length || 0}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{tpl.timesAssigned || 0}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{tpl.createdBy?.name || '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button onClick={() => { setAssignTemplate(tpl); setAssignMember(''); }} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Assign</button>
                        <button onClick={() => handleDeactivate(tpl)} className="text-red-600 hover:text-red-800 font-medium text-sm">Deactivate</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Workout Template" maxWidth="max-w-3xl">
        <form onSubmit={handleCreate} className="space-y-4">
          {toast && toast.type === 'error' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{toast.msg}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Template Name *</label>
              <input type="text" name="name" value={form.name} onChange={handleFormChange} placeholder="e.g. Push Day A" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
                <select name="goal" value={form.goal} onChange={handleFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                  <option value="">Select goal</option>
                  {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Difficulty</label>
                <select name="difficulty" value={form.difficulty} onChange={handleFormChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                  <option value="">Select level</option>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFF_LABELS[d]}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea name="description" value={form.description} onChange={handleFormChange} rows={2} placeholder="Brief description..." className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Exercises *</h3>
              <button type="button" onClick={addExercise} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Add Exercise</button>
            </div>
            <div className="space-y-3">
              {form.exercises.map((ex, idx) => (
                <div key={idx} className="grid grid-cols-2 md:grid-cols-7 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="col-span-2 md:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Exercise</label>
                    <select name="exercise" value={ex.exercise} onChange={(e) => handleExerciseChange(idx, e)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="">Select exercise</option>
                      {exercises.map((e) => <option key={e._id || e.id} value={e._id || e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Sets</label>
                    <input type="number" name="sets" value={ex.sets} onChange={(e) => handleExerciseChange(idx, e)} min="0" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Reps</label>
                    <input type="number" name="reps" value={ex.reps} onChange={(e) => handleExerciseChange(idx, e)} min="0" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Weight (kg)</label>
                    <input type="number" name="weight" value={ex.weight} onChange={(e) => handleExerciseChange(idx, e)} min="0" step="0.5" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Duration</label>
                    <input type="number" name="duration" value={ex.duration} onChange={(e) => handleExerciseChange(idx, e)} min="0" className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="flex items-end">
                    {form.exercises.length > 1 && (
                      <button type="button" onClick={() => removeExercise(idx)} className="px-2 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!assignTemplate} onClose={() => setAssignTemplate(null)} title={`Assign "${assignTemplate?.name || ''}" to Member`}>
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Member</label>
            <select required value={assignMember} onChange={(e) => setAssignMember(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">Select a member</option>
              {members.map((m) => (
                <option key={m.user?._id || m._id} value={m.user?._id || m._id}>{m.user?.name || m.name || 'Member'}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAssignTemplate(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={assigning} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {assigning ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.type === 'error' ? <ExclamationTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
