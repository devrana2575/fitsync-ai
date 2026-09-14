import { useState, useEffect } from 'react';
import { CakeIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';

const CATEGORIES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'protein', label: 'Protein' },
  { value: 'vegetable', label: 'Vegetable' },
  { value: 'fruit', label: 'Fruit' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'grains', label: 'Grains' },
  { value: 'beverage', label: 'Beverage' },
  { value: 'other', label: 'Other' },
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const initialForm = { name: '', category: 'other', servingSize: '100', servingUnit: 'g', calories: '', protein: '', carbs: '', fat: '' };

export default function FoodDatabase() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/nutrition/foods');
      setFoods(res.data.foods || []);
    } catch (err) {
      setError(err.message || 'Failed to load foods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        servingSize: Number(form.servingSize) || 100,
        servingUnit: form.servingUnit || 'g',
        calories: Number(form.calories) || 0,
        protein: Number(form.protein) || 0,
        carbs: Number(form.carbs) || 0,
        fat: Number(form.fat) || 0,
      };
      if (editing) {
        await api.put(`/nutrition/foods/${editing._id}`, payload);
        showToast('Food updated successfully');
      } else {
        await api.post('/nutrition/foods', payload);
        showToast('Food created successfully');
      }
      setShowModal(false);
      setEditing(null);
      setForm(initialForm);
      fetchAll();
    } catch (err) {
      showToast(err.message || 'Failed to save food', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (food) => {
    if (!window.confirm(`Disable "${food.name}"? It will no longer appear in the food database.`)) return;
    try {
      await api.delete(`/nutrition/foods/${food._id}`);
      showToast('Food disabled');
      fetchAll();
    } catch (err) {
      showToast(err.message || 'Failed to disable food', 'error');
    }
  };

  const openCreate = () => { setEditing(null); setForm(initialForm); setShowModal(true); };

  const openEdit = (food) => {
    setEditing(food);
    setForm({
      name: food.name || '',
      category: food.category || 'other',
      servingSize: String(food.servingSize ?? 100),
      servingUnit: food.servingUnit || 'g',
      calories: food.calories ? String(food.calories) : '',
      protein: food.protein ? String(food.protein) : '',
      carbs: food.carbs ? String(food.carbs) : '',
      fat: food.fat ? String(food.fat) : '',
    });
    setShowModal(true);
  };

  const filtered = foods.filter((f) => {
    const mc = categoryFilter === 'all' || f.category === categoryFilter;
    const ms = f.name.toLowerCase().includes(search.toLowerCase());
    return mc && ms;
  });

  const stats = CATEGORIES.map((c) => ({ label: c.label, count: foods.filter((f) => f.category === c.value).length })).filter((s) => s.count > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Food Database</h1>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Add Food
        </button>
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{s.count}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search foods..."
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-full sm:w-64"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <LoadingSpinner size="lg" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={CakeIcon} message="No foods found" action={
          <button onClick={openCreate} className="text-indigo-600 hover:text-indigo-800 font-medium">Add first food</button>
        } />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable headers={['Name', 'Category', 'Serving', 'Calories', 'Protein', 'Carbs', 'Fat', 'Actions']}>
              {filtered.map((f, i) => (
                <tr key={f._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-6 py-4 font-medium text-slate-900">{f.name}</td>
                  <td className="px-6 py-4 text-slate-600 capitalize">{CATEGORY_LABELS[f.category] || f.category}</td>
                  <td className="px-6 py-4 text-slate-600">{f.servingSize} {f.servingUnit}</td>
                  <td className="px-6 py-4 text-slate-600">{Math.round(f.calories || 0)} kcal</td>
                  <td className="px-6 py-4 text-slate-600">{f.protein || 0} g</td>
                  <td className="px-6 py-4 text-slate-600">{f.carbs || 0} g</td>
                  <td className="px-6 py-4 text-slate-600">{f.fat || 0} g</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(f)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Edit</button>
                      <button onClick={() => handleDelete(f)} className="text-red-600 hover:text-red-800 font-medium text-sm">Disable</button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Food' : 'Add Food'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Serving Size *</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  required
                  min="1"
                  value={form.servingSize}
                  onChange={(e) => setForm({ ...form, servingSize: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <select value={form.servingUnit} onChange={(e) => setForm({ ...form, servingUnit: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="cup">cup</option>
                  <option value="piece">piece</option>
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: 'calories', label: 'Calories (kcal)' },
              { key: 'protein', label: 'Protein (g)' },
              { key: 'carbs', label: 'Carbs (g)' },
              { key: 'fat', label: 'Fat (g)' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
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