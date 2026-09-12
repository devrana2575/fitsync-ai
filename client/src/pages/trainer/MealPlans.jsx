import { useState, useEffect, useRef } from 'react';
import { ClipboardDocumentListIcon, PlusIcon, TrashIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

const freshMeals = () => MEAL_TYPES.reduce((acc, mt) => ({ ...acc, [mt]: [] }), {});
const freshDrafts = () => MEAL_TYPES.reduce((acc, mt) => ({ ...acc, [mt]: { food: '', quantity: 1, filter: '' } }), {});

export default function MealPlans() {
  const [plans, setPlans] = useState([]);
  const [foods, setFoods] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', assignedTo: '', meals: freshMeals() });
  const [drafts, setDrafts] = useState(freshDrafts());
  const [toast, setToast] = useState(null);
  const [editPlan, setEditPlan] = useState(null);
  const [assignForm, setAssignForm] = useState({ assignedTo: '' });
  const [assigning, setAssigning] = useState(false);

  const toastTimer = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, foodsRes, membersRes] = await Promise.all([
        api.get('/nutrition/plans'),
        api.get('/nutrition/foods'),
        api.get('/members/by-trainer'),
      ]);
      setPlans(plansRes.data.plans || []);
      setFoods(foodsRes.data.foods || []);
      setMembers(membersRes.data.members || []);
    } catch (err) {
      setError(err.message || 'Failed to load meal plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

  const assignedCount = plans.filter((p) => p.assignedTo && p.assignedTo._id).length;
  const mealItemCount = plans.reduce((s, p) => s + (p.meals || []).reduce((m, meal) => m + (meal.items?.length || 0), 0), 0);

  const mealCount = (plan) => (plan.meals || []).reduce((s, m) => s + (m.items?.length || 0), 0);

  const statusBadge = (plan) => (plan.assignedTo && plan.assignedTo._id ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600');

  const itemFood = (it) => (typeof it.food === 'object' ? it.food : foods.find((f) => f._id === it.food));

  const foodOptions = (mt) => {
    const d = drafts[mt];
    return foods.filter((f) => f.name.toLowerCase().includes(d.filter.toLowerCase()) || f._id === d.food);
  };

  const openCreate = () => {
    setForm({ name: '', description: '', assignedTo: '', meals: freshMeals() });
    setDrafts(freshDrafts());
    setShowCreate(true);
  };

  const handleDraftChange = (mt, key, value) => {
    setDrafts({ ...drafts, [mt]: { ...drafts[mt], [key]: value } });
  };

  const addItem = (mt) => {
    const d = drafts[mt];
    if (!d.food) return showToast(`Select a food for ${MEAL_LABELS[mt]}`, 'error');
    setForm({
      ...form,
      meals: { ...form.meals, [mt]: [...form.meals[mt], { food: d.food, quantity: Number(d.quantity) || 1 }] },
    });
    setDrafts({ ...drafts, [mt]: { food: '', quantity: 1, filter: '' } });
  };

  const removeItem = (mt, idx) => {
    setForm({ ...form, meals: { ...form.meals, [mt]: form.meals[mt].filter((_, i) => i !== idx) } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Plan name is required', 'error');
    if (!form.assignedTo) return showToast('Please select a member', 'error');
    const payloadMeals = MEAL_TYPES
      .map((mt) => ({ mealType: mt, items: form.meals[mt], notes: '' }))
      .filter((m) => m.items.length > 0);
    if (payloadMeals.length === 0) return showToast('Add at least one meal item', 'error');
    try {
      setSaving(true);
      await api.post('/nutrition/plans', {
        name: form.name,
        description: form.description,
        assignedTo: form.assignedTo,
        meals: payloadMeals,
      });
      setShowCreate(false);
      setForm({ name: '', description: '', assignedTo: '', meals: freshMeals() });
      setDrafts(freshDrafts());
      showToast('Meal plan created successfully');
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to create meal plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEditAssignment = (plan) => {
    setEditPlan(plan);
    setAssignForm({ assignedTo: plan.assignedTo?._id || '' });
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    try {
      setAssigning(true);
      await api.put(`/nutrition/plans/${editPlan._id}`, { assignedTo: assignForm.assignedTo });
      setEditPlan(null);
      showToast('Plan assignment updated');
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to update assignment', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleDeactivate = async (plan) => {
    if (!window.confirm(`Deactivate plan "${plan.name}"? This will permanently remove it.`)) return;
    try {
      await api.delete(`/nutrition/plans/${plan._id}`);
      showToast('Meal plan deactivated');
      fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to deactivate plan', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Meal Plans</h1>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Create Plan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={ClipboardDocumentListIcon} label="Total Plans" value={plans.length} color="indigo" />
        <StatCard icon={CheckCircleIcon} label="Assigned Plans" value={assignedCount} color="green" />
        <StatCard icon={PlusIcon} label="Meal Items" value={mealItemCount} color="blue" />
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchData} />
        </div>
      ) : loading ? (
        <LoadingSpinner size="lg" />
      ) : plans.length === 0 ? (
        <EmptyState icon={ClipboardDocumentListIcon} message="No meal plans created yet" />
      ) : (
        <DataTable headers={['Name', 'Assigned To', 'Daily Calories', 'Daily Protein', 'Meals', 'Status', 'Actions']}>
          {plans.map((p, i) => (
            <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4 font-medium text-slate-900">{p.name}</td>
              <td className="px-6 py-4 text-slate-600">{p.assignedTo?.name || '—'}</td>
              <td className="px-6 py-4 text-slate-600">{fmt(p.dailyCalories)}</td>
              <td className="px-6 py-4 text-slate-600">{p.dailyProtein ? `${fmt(p.dailyProtein)} g` : '—'}</td>
              <td className="px-6 py-4 text-slate-600">{mealCount(p)}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(p)}`}>
                  {p.assignedTo && p.assignedTo._id ? 'Assigned' : 'Unassigned'}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-3">
                  <button onClick={() => openEditAssignment(p)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Edit</button>
                  <button onClick={() => handleDeactivate(p)} className="text-red-600 hover:text-red-800 font-medium text-sm">Deactivate</button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Meal Plan" maxWidth="max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
            <select required value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">Select a member</option>
              {members.map((m) => (
                <option key={m._id || m.user?._id} value={m.user?._id || m._id}>{m.user?.name || m.name || 'Member'}</option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {MEAL_TYPES.map((mt) => (
              <div key={mt} className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">{MEAL_LABELS[mt]}</h3>
                {form.meals[mt].length > 0 && (
                  <ul className="space-y-2 mb-3">
                    {form.meals[mt].map((it, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 text-sm bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-800 truncate">{itemFood(it)?.name || 'Food'}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-slate-500">× {it.quantity}</span>
                          <button type="button" onClick={() => removeItem(mt, i)} className="text-red-600 hover:text-red-800">
                            <TrashIcon className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_auto] gap-2 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Food</label>
                    <select value={drafts[mt].food} onChange={(e) => handleDraftChange(mt, 'food', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                      <option value="">Select food</option>
                      {foodOptions(mt).map((f) => (
                        <option key={f._id} value={f._id}>{f.name}</option>
                      ))}
                    </select>
                    <input
                      value={drafts[mt].filter}
                      onChange={(e) => handleDraftChange(mt, 'filter', e.target.value)}
                      placeholder="Type to filter foods..."
                      className="mt-1.5 w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={drafts[mt].quantity}
                      onChange={(e) => handleDraftChange(mt, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <button type="button" onClick={() => addItem(mt)} className="h-[38px] px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 whitespace-nowrap">
                    Add item
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!editPlan} onClose={() => setEditPlan(null)} title="Edit Plan Assignment">
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
            <select required value={assignForm.assignedTo} onChange={(e) => setAssignForm({ ...assignForm, assignedTo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">Select a member</option>
              {members.map((m) => (
                <option key={m._id || m.user?._id} value={m.user?._id || m._id}>{m.user?.name || m.name || 'Member'}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditPlan(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={assigning} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {assigning ? 'Saving...' : 'Save Assignment'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.type === 'error' ? (
            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}