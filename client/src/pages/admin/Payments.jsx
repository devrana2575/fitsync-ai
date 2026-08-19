import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const initialForm = { userId: '', membershipId: '', amount: '', method: 'cash', status: 'completed', notes: '' };

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [payRes, statRes] = await Promise.all([
        api.get('/payments'),
        api.get('/payments/stats'),
      ]);
      setPayments(payRes.data.data || payRes.data.payments || []);
      setStats(statRes.data.data || statRes.data);
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
      await api.post('/payments', { ...form, amount: Number(form.amount) });
      setShowModal(false);
      setForm(initialForm);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to add payment');
    } finally {
      setSaving(false);
    }
  };

  const fmtCurrency = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  const statusColor = (s) => {
    const map = { completed: 'bg-green-100 text-green-700', pending: 'bg-yellow-100 text-yellow-700', failed: 'bg-red-100 text-red-700', refunded: 'bg-purple-100 text-purple-700' };
    return map[s?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <button onClick={() => { setForm(initialForm); setShowModal(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Add Payment
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon="💰" label="Total Revenue" value={fmtCurrency(stats.totalRevenue || stats.total)} color="indigo" />
          <StatCard icon="📅" label="Monthly Revenue" value={fmtCurrency(stats.monthlyRevenue || stats.monthly)} color="green" />
          <StatCard icon="⏳" label="Pending" value={fmtCurrency(stats.pending || stats.pendingAmount)} color="yellow" />
        </div>
      )}

      {loading ? <LoadingSpinner size="lg" /> : payments.length === 0 ? (
        <EmptyState icon="💳" message="No payments recorded yet" action={
          <button onClick={() => { setForm(initialForm); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 font-medium">Add first payment</button>
        } />
      ) : (
        <DataTable headers={['Member', 'Amount', 'Method', 'Status', 'Date', 'Notes']}>
          {payments.map((p, i) => (
            <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4 font-medium text-slate-900">{p.user?.name || p.member?.name || '—'}</td>
              <td className="px-6 py-4 font-semibold text-slate-900">{fmtCurrency(p.amount)}</td>
              <td className="px-6 py-4 text-slate-600 capitalize">{p.method || '—'}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(p.status)}`}>{p.status}</span>
              </td>
              <td className="px-6 py-4 text-slate-600">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '—'}</td>
              <td className="px-6 py-4 text-slate-500 text-sm max-w-[200px] truncate">{p.notes || '—'}</td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Payment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">User ID</label>
            <input required value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} placeholder="Member user ID" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Membership ID</label>
            <input value={form.membershipId} onChange={(e) => setForm({ ...form, membershipId: e.target.value })} placeholder="Membership ID (optional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
            <input required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="net_banking">Net Banking</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
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
