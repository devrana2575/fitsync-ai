import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const initialForm = { name: '', category: '', condition: 'good', lastMaintenance: '', nextMaintenance: '', status: 'available', description: '' };

export default function Equipment() {
  const [equipment, setEquipment] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [conditionFilter, setConditionFilter] = useState('all');

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [eqRes, mtRes, stRes] = await Promise.all([
        api.get('/equipment'),
        api.get('/equipment/maintenance'),
        api.get('/equipment/stats'),
      ]);
      setEquipment(eqRes.data.data || eqRes.data.equipment || []);
      setMaintenance(mtRes.data.data || mtRes.data.alerts || []);
      setStats(stRes.data.data || stRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/equipment', form);
      setShowModal(false);
      setForm(initialForm);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to add equipment');
    } finally {
      setSaving(false);
    }
  };

  const conditionColor = (c) => {
    const map = { excellent: 'bg-green-100 text-green-700', good: 'bg-blue-100 text-blue-700', fair: 'bg-yellow-100 text-yellow-700', poor: 'bg-red-100 text-red-700', needs_repair: 'bg-red-100 text-red-700' };
    return map[c?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  const statusColor = (s) => {
    const map = { available: 'bg-green-100 text-green-700', in_use: 'bg-blue-100 text-blue-700', under_maintenance: 'bg-yellow-100 text-yellow-700', out_of_order: 'bg-red-100 text-red-700' };
    return map[s?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  const filteredEquipment = conditionFilter === 'all' ? equipment : equipment.filter(e => e.condition?.toLowerCase() === conditionFilter);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Equipment</h1>
        <button onClick={() => { setForm(initialForm); setShowModal(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Add Equipment
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="🏋️" label="Total Equipment" value={stats.total || equipment.length} color="indigo" />
          <StatCard icon="✅" label="Good Condition" value={stats.byCondition?.find(c => c._id === 'good')?.count || 0} color="green" />
          <StatCard icon="🔧" label="Needs Maintenance" value={stats.needsMaintenance || 0} color="yellow" />
          <StatCard icon="❌" label="Poor / Needs Repair" value={(stats.byCondition?.find(c => c._id === 'poor')?.count || 0) + (stats.byCondition?.find(c => c._id === 'needs_repair')?.count || 0)} color="red" />
        </div>
      )}

      {maintenance.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-3">⚠️ Maintenance Alerts</h2>
          <div className="space-y-2">
            {maintenance.map((a, i) => (
              <div key={a._id || i} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-yellow-100">
                <div>
                  <span className="font-medium text-slate-900">{a.name || a.equipment?.name}</span>
                  <span className="text-sm text-slate-500 ml-2">— {a.message || `Scheduled: ${fmtDate(a.nextMaintenance || a.scheduledDate)}`}</span>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">Due</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Condition:</label>
        <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
          <option value="all">All</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="needs_repair">Needs Repair</option>
        </select>
      </div>

      {loading ? <LoadingSpinner size="lg" /> : filteredEquipment.length === 0 ? (
        <EmptyState icon="🏋️" message="No equipment found" />
      ) : (
        <DataTable headers={['Name', 'Category', 'Condition', 'Last Maintenance', 'Next Maintenance', 'Status']}>
          {filteredEquipment.map((eq, i) => (
            <tr key={eq._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4 font-medium text-slate-900">{eq.name}</td>
              <td className="px-6 py-4 text-slate-600 capitalize">{eq.category || '—'}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${conditionColor(eq.condition)}`}>{eq.condition}</span>
              </td>
              <td className="px-6 py-4 text-slate-600">{fmtDate(eq.lastMaintenance)}</td>
              <td className="px-6 py-4 text-slate-600">{fmtDate(eq.nextMaintenance)}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(eq.status)}`}>{eq.status?.replace('_', ' ')}</span>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Equipment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Cardio, Strength" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Condition</label>
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
              <option value="needs_repair">Needs Repair</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Maintenance</label>
              <input type="date" value={form.lastMaintenance} onChange={(e) => setForm({ ...form, lastMaintenance: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Next Maintenance</label>
              <input type="date" value={form.nextMaintenance} onChange={(e) => setForm({ ...form, nextMaintenance: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="available">Available</option>
              <option value="in_use">In Use</option>
              <option value="under_maintenance">Under Maintenance</option>
              <option value="out_of_order">Out of Order</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
