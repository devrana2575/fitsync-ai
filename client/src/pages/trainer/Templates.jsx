import { useState, useEffect } from 'react';
import { DocumentDuplicateIcon, CheckCircleIcon, ExclamationTriangleIcon, PlusIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import { SkeletonRow } from '../../components/common/Skeleton';
import useTrainerDashboard from '../../hooks/useTrainerDashboard';
import exerciseImage from '../../assets/exerciseImage';

const GOALS = ['strength', 'hypertrophy', 'endurance', 'weight_loss', 'general_fitness'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const GOAL_LABELS = { strength: 'Strength', hypertrophy: 'Hypertrophy', endurance: 'Endurance', weight_loss: 'Weight Loss', general_fitness: 'General Fitness' };
const DIFF_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const GOAL_COLORS = { strength: 'badge-info', hypertrophy: 'badge-brand', endurance: 'badge-warning', weight_loss: 'badge-danger', general_fitness: 'badge-muted' };
const DIFF_COLORS = { beginner: 'badge-success', intermediate: 'badge-warning', advanced: 'badge-danger' };

const emptyExercise = { exercise: '', sets: '', reps: '', weight: '', duration: '', restTime: '' };

const inputCls = 'input';
const labelCls = 'label';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [exercises, setExercises] = useState([]);
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
  const { data: dashboard } = useTrainerDashboard();
  const members = dashboard?.members || [];

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (goalFilter !== 'all') params.goal = goalFilter;
      if (diffFilter !== 'all') params.difficulty = diffFilter;
      const [tplRes, exRes] = await Promise.all([
        api.get('/templates', { params }),
        api.get('/exercises'),
      ]);
      setTemplates(tplRes.data?.templates || []);
      setExercises(exRes.data?.exercises || []);
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
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Workout Templates"
        subtitle="Reusable plans you can assign to your members"
        icon={DocumentDuplicateIcon}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn btn-md btn-primary">
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            New Template
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)} className="input sm:w-auto">
          <option value="all">All Goals</option>
          {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
        </select>
        <select value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)} className="input sm:w-auto">
          <option value="all">All Difficulties</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFF_LABELS[d]}</option>)}
        </select>
      </div>

      {error ? (
        <div className="card">
          <ErrorState message={error} onRetry={fetchData} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={6} />
      ) : templates.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={DocumentDuplicateIcon}
            message="No workout templates found"
            description="Create a template once and assign it to members any time."
            action={
              <button onClick={() => setShowCreate(true)} className="btn btn-md btn-primary">
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                New Template
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
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Goal</th>
                  <th className="px-6 py-3">Difficulty</th>
                  <th className="px-6 py-3">Exercises</th>
                  <th className="px-6 py-3">Assigned</th>
                  <th className="px-6 py-3">Created By</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((tpl, i) => (
                  <tr key={tpl._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">{tpl.name}</p>
                      {tpl.description && <p className="mt-0.5 text-xs text-slate-500 line-clamp-1 max-w-xs">{tpl.description}</p>}
                    </td>
                    <td className="px-6 py-4">
                      {tpl.goal ? <span className={`badge ${GOAL_COLORS[tpl.goal] || 'badge-muted'}`}>{GOAL_LABELS[tpl.goal] || tpl.goal}</span> : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {tpl.difficulty ? <span className={`badge ${DIFF_COLORS[tpl.difficulty] || 'badge-muted'}`}>{DIFF_LABELS[tpl.difficulty] || tpl.difficulty}</span> : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 tabular-nums">{tpl.exercises?.length || 0}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 tabular-nums">{tpl.timesAssigned || 0}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={tpl.createdBy?.name} size="sm" />
                        <span className="text-sm text-slate-600">{tpl.createdBy?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => { setAssignTemplate(tpl); setAssignMember(''); }}
                          className="btn btn-sm btn-primary"
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => handleDeactivate(tpl)}
                          className="btn btn-sm btn-danger"
                        >
                          Delete
                        </button>
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
              <label className={labelCls}>Template Name *</label>
              <input type="text" name="name" value={form.name} onChange={handleFormChange} placeholder="e.g. Push Day A" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Goal</label>
                <select name="goal" value={form.goal} onChange={handleFormChange} className={inputCls}>
                  <option value="">Select goal</option>
                  {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Difficulty</label>
                <select name="difficulty" value={form.difficulty} onChange={handleFormChange} className={inputCls}>
                  <option value="">Select level</option>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFF_LABELS[d]}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea name="description" value={form.description} onChange={handleFormChange} rows={2} placeholder="Brief description..." className={inputCls} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Exercises *</h3>
              <button type="button" onClick={addExercise} className="btn btn-sm btn-outline text-brand-700 border-brand-200 hover:bg-brand-50">
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
                Add Exercise
              </button>
            </div>
            <div className="space-y-3">
              {form.exercises.map((ex, idx) => {
                const selectedEx = exercises.find((e) => (e._id || e.id) === ex.exercise);
                return (
                  <div key={idx} className="grid grid-cols-2 md:grid-cols-7 gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-200">
                    <div className="col-span-2 md:col-span-2">
                      <label className={labelCls}>Exercise</label>
                      <div className="flex items-center gap-2">
                        {selectedEx && (
                          <img
                            src={exerciseImage(selectedEx)}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 object-cover"
                          />
                        )}
                        <select name="exercise" value={ex.exercise} onChange={(e) => handleExerciseChange(idx, e)} className={inputCls}>
                          <option value="">Select exercise</option>
                          {exercises.map((e) => <option key={e._id || e.id} value={e._id || e.id}>{e.name}</option>)}
                        </select>
                      </div>
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
                    <div>
                      <label className={labelCls}>Duration</label>
                      <input type="number" name="duration" value={ex.duration} onChange={(e) => handleExerciseChange(idx, e)} min="0" className={inputCls} />
                    </div>
                    <div className="flex items-end">
                      {form.exercises.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeExercise(idx)}
                          className="btn btn-sm btn-ghost text-red-600 hover:text-red-800 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-md btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-md btn-primary">
              {saving ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!assignTemplate} onClose={() => setAssignTemplate(null)} title={`Assign "${assignTemplate?.name || ''}" to Member`}>
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className={labelCls}>Select Member</label>
            <select required value={assignMember} onChange={(e) => setAssignMember(e.target.value)} className={inputCls}>
              <option value="">Select a member</option>
              {members.map((m) => (
                <option key={m.user?._id || m._id} value={m.user?._id || m._id}>{m.user?.name || m.name || 'Member'}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAssignTemplate(null)} className="btn btn-md btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={assigning} className="btn btn-md btn-primary">
              {assigning ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && (
        <div className="anim-pop fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
          <span className={`shrink-0 rounded-full p-1.5 ${toast.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {toast.type === 'error' ? <ExclamationTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
          </span>
          <p className="text-sm font-medium text-slate-800">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}