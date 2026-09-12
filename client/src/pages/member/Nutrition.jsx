import { useState, useEffect, useRef } from 'react';
import { FireIcon, BoltIcon, CpuChipIcon, BeakerIcon, ClipboardDocumentListIcon, PlusIcon, MinusIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import StatCard from '../../components/common/StatCard';

const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export default function Nutrition() {
  const [foods, setFoods] = useState([]);
  const [plans, setPlans] = useState([]);
  const [log, setLog] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [addFood, setAddFood] = useState(null);
  const [addForm, setAddForm] = useState({ mealType: 'breakfast', quantity: 1 });
  const [saving, setSaving] = useState(false);

  const addSectionRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [foodsRes, logRes, plansRes, statsRes] = await Promise.all([
        api.get('/nutrition/foods'),
        api.get('/nutrition/log', { params: { date: today } }),
        api.get('/nutrition/plans'),
        api.get('/nutrition/stats'),
      ]);
      setFoods(foodsRes.data.foods || []);
      setLog((logRes.data.logs || [])[0] || null);
      setPlans(plansRes.data.plans || []);
      setStats(statsRes.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load nutrition data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const plan = plans[0] || null;

  const categories = [...new Set(foods.map((f) => f.category).filter(Boolean))];

  const filteredFoods = foods.filter((f) => {
    const matchCategory = category === 'all' || f.category === category;
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const fmt = (n) => (n == null ? '0' : Number(n).toLocaleString('en-IN'));

  const goalStr = (cur, goal, unit) => (goal ? `${fmt(cur)} / ${fmt(goal)} ${unit}` : `${fmt(cur)} ${unit}`);

  const groupedLogs = MEAL_TYPES.map((mt) => ({
    mealType: mt,
    entries: (log?.meals || []).filter((m) => m.mealType === mt),
  })).filter((g) => g.entries.length > 0);

  const planMeals = MEAL_TYPES.map((mt) => ({
    mealType: mt,
    meals: (plan?.meals || []).filter((m) => m.mealType === mt),
  }));

  const itemCalories = (it) => Math.round((it.food?.calories || 0) * it.quantity);

  const handleDelete = async (entryId) => {
    if (!window.confirm("Remove this food from today's log?")) return;
    try {
      await api.delete(`/nutrition/log/${entryId}`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to remove food');
    }
  };

  const handleAddFood = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/nutrition/log', {
        mealType: addForm.mealType,
        foodId: addFood._id,
        quantity: Number(addForm.quantity) || 1,
      });
      setAddFood(null);
      setAddForm({ mealType: 'breakfast', quantity: 1 });
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to add food');
    } finally {
      setSaving(false);
    }
  };

  const updateWater = async (delta) => {
    const next = Math.max(0, (log?.waterGlasses || 0) + delta);
    setLog({ ...(log || {}), waterGlasses: next });
    try {
      await api.put('/nutrition/log/water', { date: today, waterGlasses: next });
    } catch (err) {
      alert(err.message || 'Failed to update water');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Nutrition</h1>
        <button onClick={() => addSectionRef.current?.scrollIntoView({ behavior: 'smooth' })} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Add Food
        </button>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <LoadingSpinner size="lg" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={FireIcon} label="Calories (today / goal)" value={goalStr(log?.totalCalories, plan?.dailyCalories, 'kcal')} color="indigo" />
            <StatCard icon={BoltIcon} label="Protein (today / goal)" value={goalStr(log?.totalProtein, plan?.dailyProtein, 'g')} color="purple" />
            <StatCard icon={CpuChipIcon} label="Carbs (today / goal)" value={goalStr(log?.totalCarbs, plan?.dailyCarbs, 'g')} color="yellow" />
            <StatCard icon={BeakerIcon} label="Water" value={`${log?.waterGlasses || 0} glasses`} color="cyan" />
          </div>

          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between">
                <span className="text-sm text-slate-500">Days logged</span>
                <span className="text-lg font-semibold text-slate-900">{stats.totalDays ?? '—'}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between">
                <span className="text-sm text-slate-500">Avg calories / day</span>
                <span className="text-lg font-semibold text-slate-900">{stats.avgCalories ?? '—'}</span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-center justify-between">
                <span className="text-sm text-slate-500">Avg protein / day</span>
                <span className="text-lg font-semibold text-slate-900">{stats.avgProtein ?? '—'}</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Water Tracker</h2>
            <div className="flex items-center justify-between max-w-md mx-auto">
              <button onClick={() => updateWater(-1)} disabled={(log?.waterGlasses || 0) <= 0} className="p-3 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                <MinusIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="text-center">
                <span className="text-3xl font-bold text-slate-900">{log?.waterGlasses || 0}</span>
                <span className="text-sm text-slate-500 ml-2">glasses</span>
              </div>
              <button onClick={() => updateWater(1)} className="p-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                <PlusIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Today's Log</h2>
            {groupedLogs.length === 0 ? (
              <EmptyState icon={ClipboardDocumentListIcon} message="No food logged today yet" />
            ) : (
              <div className="space-y-6">
                {groupedLogs.map(({ mealType, entries }) => (
                  <div key={mealType}>
                    <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">{MEAL_LABELS[mealType]}</h3>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                      {entries.map((e) => (
                        <div key={e._id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-sm font-medium text-slate-900 truncate">{e.food?.name || 'Food'}</span>
                            <span className="text-xs text-slate-500">× {e.quantity}</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-sm text-slate-600">{Math.round(e.calories || 0)} kcal</span>
                            <button onClick={() => handleDelete(e._id)} className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium text-sm">
                              <TrashIcon className="h-4 w-4" aria-hidden="true" /> Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div ref={addSectionRef} className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Add Food</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search foods..."
                    className="w-full sm:w-56 pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            {filteredFoods.length === 0 ? (
              <EmptyState icon={MagnifyingGlassIcon} message="No foods match your filters" />
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {filteredFoods.map((f) => (
                  <div key={f._id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{f.name}</p>
                      <p className="text-xs text-slate-500 capitalize">
                        {f.category} · {f.servingSize} {f.servingUnit} · {Math.round(f.calories || 0)} kcal
                      </p>
                    </div>
                    <button
                      onClick={() => { setAddFood(f); setAddForm({ mealType: 'breakfast', quantity: 1 }); }}
                      className="shrink-0 text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">My Meal Plan</h2>
            {!plan ? (
              <EmptyState icon={ClipboardDocumentListIcon} message="No meal plan assigned yet" />
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-6">
                  {[
                    { label: 'Calories', value: plan.dailyCalories },
                    { label: 'Protein', value: plan.dailyProtein ? `${plan.dailyProtein} g` : '—' },
                    { label: 'Carbs', value: plan.dailyCarbs ? `${plan.dailyCarbs} g` : '—' },
                    { label: 'Fat', value: plan.dailyFat ? `${plan.dailyFat} g` : '—' },
                  ].map((t) => (
                    <span key={t.label} className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {t.label}: {t.value}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {planMeals.map(({ mealType, meals }) => (
                    <div key={mealType} className="rounded-xl border border-slate-200 p-4">
                      <h3 className="text-sm font-semibold text-slate-900 mb-3">{MEAL_LABELS[mealType]}</h3>
                      {meals.length === 0 ? (
                        <p className="text-sm text-slate-400">No {MEAL_LABELS[mealType].toLowerCase()} planned</p>
                      ) : (
                        <ul className="space-y-2">
                          {meals.map((m, i) => (
                            <li key={i} className="text-sm">
                              <span className="text-slate-800">{m.food?.name}</span>
                              <span className="text-slate-500 text-xs"> × {m.quantity} · {itemCalories(m)} kcal</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Modal isOpen={!!addFood} onClose={() => setAddFood(null)} title={addFood ? `Add ${addFood.name}` : ''}>
        <form onSubmit={handleAddFood} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Serving</label>
            <p className="text-sm text-slate-500">
              {addFood?.servingSize} {addFood?.servingUnit} · {Math.round(addFood?.calories || 0)} kcal
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Meal Type</label>
            <select value={addForm.mealType} onChange={(e) => setAddForm({ ...addForm, mealType: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              {MEAL_TYPES.map((mt) => (
                <option key={mt} value={mt}>{MEAL_LABELS[mt]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quantity (servings)</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              required
              value={addForm.quantity}
              onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAddFood(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Adding...' : 'Add to Log'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}