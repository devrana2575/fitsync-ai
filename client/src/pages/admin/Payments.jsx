import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BanknotesIcon, CalendarDaysIcon, CreditCardIcon, ClockIcon, ArrowPathIcon, CheckBadgeIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import useDebounce from '../../hooks/useDebounce';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const initialForm = { userId: '', membershipId: '', planId: '', amount: '', method: 'cash', status: 'completed', notes: '' };

export default function Payments() {
  const location = useLocation();
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [allMembers, setAllMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const debouncedMemberSearch = useDebounce(memberSearch, 300);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberMemberships, setMemberMemberships] = useState([]);
  const [error, setError] = useState(null);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [plans, setPlans] = useState([]);

  const fetchAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter.toUpperCase();
      if (memberFilter) params.userId = memberFilter;
      if (dateFrom) params.startDate = new Date(`${dateFrom}T00:00:00`).toISOString();
      if (dateTo) params.endDate = new Date(`${dateTo}T23:59:59`).toISOString();
      const [payRes, statRes] = await Promise.all([
        api.get('/payments', { params }),
        api.get('/payments/stats'),
      ]);
      setPayments(payRes.data.data || payRes.data.payments || []);
      setStats(statRes.data.data || statRes.data);
    } catch (err) {
      setError(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, [statusFilter, memberFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (location.state?.openCreate) {
      setForm(initialForm);
      setSelectedMember(null);
      setMemberMemberships([]);
      setMemberSearch('');
      setShowModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await api.get('/members', { params: { limit: 200 } });
        setAllMembers(res.data.data || res.data.members || []);
      } catch (err) {
        console.error(err);
      }
    };
    const fetchPlans = async () => {
      try {
        const res = await api.get('/membership-plans');
        setPlans(res.data.plans || res.data.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchMembers();
    fetchPlans();
  }, []);

  const fetchMemberMemberships = async (memberId) => {
    setLoadingMemberships(true);
    setMemberMemberships([]);
    try {
      const res = await api.get('/memberships', { params: { userId: memberId } });
      setMemberMemberships(res.data.data || res.data.memberships || []);
    } catch (err) {
      console.error(err);
      setMemberMemberships([]);
    } finally {
      setLoadingMemberships(false);
    }
  };

  const filteredMembers = allMembers.filter((m) => {
    if (!debouncedMemberSearch) return true;
    const q = debouncedMemberSearch.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

  const handleMemberSelect = (member) => {
    setSelectedMember(member);
    setMemberSearch('');
    setForm((f) => ({ ...f, userId: member._id, membershipId: '', planId: '' }));
    fetchMemberMemberships(member._id);
  };

  const handleSubmittedMemberChange = () => {
    setSelectedMember(null);
    setMemberMemberships([]);
    setForm((f) => ({ ...f, userId: '', membershipId: '', planId: '' }));
  };

  const handlePlanChange = (e) => {
    const planId = e.target.value;
    const plan = plans.find((p) => p._id === planId) || null;
    setForm((f) => ({
      ...f,
      planId,
      membershipId: '',
      // Auto-fill the exact required amount - the server rejects a completed
      // plan payment whose amount differs from the plan price (or, for
      // installment plans, from the fixed per-installment amount).
      amount: plan ? String(plan.paymentMode === 'INSTALLMENT' && plan.installmentAmount ? plan.installmentAmount : plan.price) : f.amount,
    }));
  };

  const handleVerify = async (payment) => {
    if (!window.confirm('Verify and complete this pending payment?\n\nThe member\'s membership will be activated.')) return;
    try {
      await api.post(`/payments/${payment._id}/verify`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to verify payment');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/payments', { ...form, amount: Number(form.amount) });
      setShowModal(false);
      setForm(initialForm);
      setSelectedMember(null);
      setMemberMemberships([]);
      setMemberSearch('');
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
        <div className="flex items-center gap-2">
          <button onClick={() => fetchAll(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <button onClick={() => { setForm(initialForm); setSelectedMember(null); setMemberMemberships([]); setMemberSearch(''); setShowModal(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            + Add Payment
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">All statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Member</label>
            <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">All members</option>
              {allMembers.map((m) => (
                <option key={m._id} value={m._id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="flex items-end">
            <button onClick={() => { setStatusFilter(''); setMemberFilter(''); setDateFrom(''); setDateTo(''); }} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium">
              Clear
            </button>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={BanknotesIcon} label="Total Revenue" value={fmtCurrency(stats.totalRevenue || stats.total)} color="indigo" />
          <StatCard icon={CalendarDaysIcon} label="Monthly Revenue" value={fmtCurrency(stats.monthlyRevenue || stats.monthly)} color="green" />
          <StatCard icon={ClockIcon} label="Pending" value={fmtCurrency(stats.pending || stats.pendingAmount)} color="yellow" />
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : payments.length === 0 ? (
        <EmptyState icon={CreditCardIcon} message="No payments recorded yet" action={
          <button onClick={() => { setForm(initialForm); setSelectedMember(null); setMemberMemberships([]); setMemberSearch(''); setShowModal(true); }} className="text-indigo-600 hover:text-indigo-800 font-medium">Add first payment</button>
        } />
      ) : (
        <DataTable headers={['Receipt', 'Member', 'Membership / Plan', 'Amount', 'Method', 'Gateway', 'Status', 'Date', 'Actions']}>
          {payments.map((p, i) => (
            <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4 font-mono text-xs text-slate-600">{p.transactionId || p._id || '—'}</td>
              <td className="px-6 py-4 font-medium text-slate-900">{p.user?.name || p.member?.name || '—'}</td>
              <td className="px-6 py-4 text-slate-600">
                {p.membership ? (
                  <div>
                    <p className="font-medium text-slate-900">{p.membership.plan?.name || 'Membership'}</p>
                    <p className="text-xs text-slate-400 capitalize">{p.membership.status || ''}</p>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-6 py-4 font-semibold text-slate-900">{fmtCurrency(p.amount)}</td>
              <td className="px-6 py-4 text-slate-600 capitalize">{p.method || '—'}</td>
              <td className="px-6 py-4">
                {p.gateway ? (
                  <div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
                      {p.gateway === 'razorpay' ? 'Razorpay' : p.gateway}
                    </span>
                    {p.gatewayOrderId && (
                      <p className="font-mono text-[10px] text-slate-400">{p.gatewayOrderId}</p>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(p.status)}`}>{p.status}</span>
              </td>
              <td className="px-6 py-4 text-slate-600">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '—'}</td>
              <td className="px-6 py-4">
                {p.status === 'PENDING' && !p.gateway && (
                  <button onClick={() => handleVerify(p)} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-sm">
                    <CheckBadgeIcon className="h-4 w-4" aria-hidden="true" />
                    Verify
                  </button>
                )}
                {p.status === 'PENDING' && p.gateway && (
                  <span className="text-xs text-slate-400">Gateway pending</span>
                )}
                {p.status === 'COMPLETED' && p.gateway && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                    <CheckBadgeIcon className="h-4 w-4" aria-hidden="true" />
                    Gateway verified
                  </span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Payment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Member</label>
            {selectedMember ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-slate-50">
                <span className="flex-1 text-sm text-slate-900">{selectedMember.name} ({selectedMember.email})</span>
                <button type="button" onClick={handleSubmittedMemberChange} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
              </div>
            ) : (
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search member..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            )}
            {memberSearch && !selectedMember && filteredMembers.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredMembers.slice(0, 20).map((m) => (
                  <li key={m._id} onClick={() => handleMemberSelect(m)} className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer">
                    {m.name} <span className="text-slate-500">({m.email})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Membership (optional)</label>
            {!selectedMember ? (
              <input disabled placeholder="Select a member first" className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-400" />
            ) : loadingMemberships ? (
              <input disabled placeholder="Loading memberships..." className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-400" />
            ) : memberMemberships.length === 0 ? (
              <div className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm text-slate-500">No memberships found for this member</div>
            ) : (
              <select value={form.membershipId} onChange={(e) => setForm({ ...form, membershipId: e.target.value, planId: '' })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                <option value="">None</option>
                {memberMemberships.map((m) => (
                  <option key={m._id} value={m._id}>{m.plan?.name || 'Membership'} — {(m.status || '').toUpperCase()}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan (optional — creates new membership)</label>
            {!selectedMember ? (
              <input disabled placeholder="Select a member first" className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-400" />
            ) : (
              <select value={form.planId} onChange={handlePlanChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                <option value="">None</option>
                {plans.map((pla) => (
                  <option key={pla._id} value={pla._id}>
                    {pla.name} — ₹{Number(pla.price || 0).toLocaleString('en-IN')} / {pla.duration} days
                    {pla.paymentMode === 'INSTALLMENT' && pla.installments > 1 ? ` (${pla.installments} × ₹${Number(pla.installmentAmount || 0).toLocaleString('en-IN')})` : ''}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-slate-400 mt-1">Pick this when the member is buying a plan at the counter — a new membership is created automatically and activated when the cumulative paid amount reaches the plan price.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
            <input required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            {form.planId && form.status === 'completed' && (
              <p className="text-xs text-slate-400 mt-1">Plan-based completed payments must match the plan price exactly (or the fixed installment amount for installment plans).</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Net Banking</option>
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
