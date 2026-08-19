import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const initialPlan = { name: '', price: '', duration: '', features: '', description: '' };

export default function Memberships() {
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState(initialPlan);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [planRes, memRes, statRes] = await Promise.all([
        api.get('/membership-plans/all'),
        api.get('/memberships'),
        api.get('/memberships/stats'),
      ]);
      setPlans(planRes.data.data || planRes.data.plans || []);
      setMemberships(memRes.data.data || memRes.data.memberships || []);
      setStats(statRes.data.data || statRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openAddPlan = () => { setEditingPlan(null); setPlanForm(initialPlan); setShowPlanModal(true); };
  const openEditPlan = (p) => {
    setEditingPlan(p);
    setPlanForm({
      name: p.name, price: p.price, duration: p.duration,
      features: Array.isArray(p.features) ? p.features.join(', ') : (p.features || ''),
      description: p.description || '',
    });
    setShowPlanModal(true);
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...planForm,
        price: Number(planForm.price),
        duration: Number(planForm.duration),
        features: planForm.features.split(',').map(f => f.trim()).filter(Boolean),
      };
      if (editingPlan) {
        await api.put(`/membership-plans/${editingPlan._id}`, payload);
      } else {
        await api.post('/membership-plans', payload);
      }
      setShowPlanModal(false);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const renewMembership = async (m) => {
    try {
      await api.put(`/memberships/${m._id}/renew`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to renew');
    }
  };

  const cancelMembership = async (m) => {
    if (!confirm('Cancel this membership?')) return;
    try {
      await api.put(`/memberships/${m._id}/cancel`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to cancel');
    }
  };

  const statusColor = (s) => {
    const map = { active: 'bg-green-100 text-green-700', expired: 'bg-red-100 text-red-700', pending: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-gray-100 text-gray-700' };
    return map[s?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Memberships</h1>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon="✅" label="Active" value={stats.active || 0} color="green" />
          <StatCard icon="❌" label="Expired" value={stats.expired || 0} color="red" />
          <StatCard icon="⏳" label="Pending" value={stats.pending || 0} color="yellow" />
          <StatCard icon="🚫" label="Cancelled" value={stats.cancelled || 0} color="blue" />
          <StatCard icon="⏰" label="Expiring Soon" value={stats.expiringSoon || 0} color="purple" />
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('plans')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'plans' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Plans
        </button>
        <button onClick={() => setTab('memberships')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'memberships' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Active Memberships
        </button>
      </div>

      {loading ? <LoadingSpinner size="lg" /> : (
        tab === 'plans' ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={openAddPlan} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">+ Add Plan</button>
            </div>
            {plans.length === 0 ? <EmptyState icon="📋" message="No plans created yet" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((p) => (
                  <div key={p._id} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
                      <button onClick={() => openEditPlan(p)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Edit</button>
                    </div>
                    <p className="text-3xl font-bold text-indigo-600 mb-1">₹{Number(p.price).toLocaleString('en-IN')}</p>
                    <p className="text-sm text-slate-500 mb-3">{p.duration} days</p>
                    {p.description && <p className="text-sm text-slate-600 mb-3">{p.description}</p>}
                    {p.features?.length > 0 && (
                      <ul className="space-y-1">
                        {p.features.map((f, i) => (
                          <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                            <span className="text-green-500">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          memberships.length === 0 ? <EmptyState icon="📋" message="No active memberships" /> : (
            <DataTable headers={['Member', 'Plan', 'Start Date', 'End Date', 'Status', 'Actions']}>
              {memberships.map((m, i) => (
                <tr key={m._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-6 py-4 font-medium text-slate-900">{m.user?.name || m.member?.name || '—'}</td>
                  <td className="px-6 py-4 text-slate-600">{m.plan?.name || '—'}</td>
                  <td className="px-6 py-4 text-slate-600">{m.startDate ? new Date(m.startDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-6 py-4 text-slate-600">{m.endDate ? new Date(m.endDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(m.status)}`}>{m.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {m.status?.toLowerCase() === 'active' && (
                        <>
                          <button onClick={() => renewMembership(m)} className="text-green-600 hover:text-green-800 font-medium text-sm">Renew</button>
                          <button onClick={() => cancelMembership(m)} className="text-red-600 hover:text-red-800 font-medium text-sm">Cancel</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          )
        )
      )}

      <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title={editingPlan ? 'Edit Plan' : 'Add Plan'}>
        <form onSubmit={handlePlanSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan Name</label>
            <input required value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Price (₹)</label>
            <input required type="number" min="0" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Duration (days)</label>
            <input required type="number" min="1" value={planForm.duration} onChange={(e) => setPlanForm({ ...planForm, duration: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Features (comma-separated)</label>
            <input value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} placeholder="e.g. Access to gym, Locker, Sauna" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowPlanModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Saving...' : editingPlan ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
