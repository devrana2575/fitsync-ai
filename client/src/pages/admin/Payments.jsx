import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BanknotesIcon, CalendarDaysIcon, CreditCardIcon, ClockIcon, ArrowPathIcon, CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import useDebounce from '../../hooks/useDebounce';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';
import Avatar from '../../components/common/Avatar';
import { SkeletonRow } from '../../components/common/Skeleton';
import { toINR, fmtDate } from '../../utils/format';

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

  const statusColor = (s) => {
    const map = { completed: 'badge-success', pending: 'badge-warning', failed: 'badge-danger', refunded: 'badge-brand' };
    return map[s?.toLowerCase()] || 'badge-muted';
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Record and verify member payments"
        icon={BanknotesIcon}
        actions={
          <>
            <button onClick={() => fetchAll(true)} disabled={refreshing} className="btn btn-outline btn-md">
              <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button onClick={() => { setForm(initialForm); setSelectedMember(null); setMemberMemberships([]); setMemberSearch(''); setShowModal(true); }} className="btn btn-md btn-primary">
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              Add Payment
            </button>
          </>
        }
      />

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={BanknotesIcon} label="Total Revenue" value={toINR(stats.totalRevenue || stats.total)} color="brand" />
          <StatCard icon={CalendarDaysIcon} label="Monthly Revenue" value={toINR(stats.monthlyRevenue || stats.monthly)} color="green" />
          <StatCard icon={ClockIcon} label="Pending Amount" value={toINR(stats.pending || stats.pendingAmount)} color="yellow" />
        </div>
      )}

      <div className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="label">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input">
              <option value="">All statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
          <div>
            <label className="label">Member</label>
            <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="input">
              <option value="">All members</option>
              {allMembers.map((m) => (
                <option key={m._id} value={m._id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input" />
          </div>
          <div className="flex items-end">
            <button onClick={() => { setStatusFilter(''); setMemberFilter(''); setDateFrom(''); setDateTo(''); }} className="btn btn-outline btn-md w-full">
              Clear
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={8} />
      ) : payments.length === 0 ? (
        <EmptyState icon={CreditCardIcon} message="No payments recorded yet" action={
          <button onClick={() => { setForm(initialForm); setSelectedMember(null); setMemberMemberships([]); setMemberSearch(''); setShowModal(true); }} className="btn btn-md btn-primary">
            Add first payment
          </button>
        } />
      ) : (
        <DataTable headers={['Receipt', 'Member', 'Membership / Plan', 'Amount', 'Method', 'Gateway', 'Status', 'Date', 'Actions']}>
          {payments.map((p) => (
            <tr key={p._id} className="odd:bg-white even:bg-slate-50/50">
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.transactionId || p._id || '—'}</td>
              <td className="px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar name={p.user?.name || p.member?.name} size="sm" />
                  <span className="font-medium text-slate-900">{p.user?.name || p.member?.name || '—'}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {p.membership ? (
                  <div>
                    <p className="font-medium text-slate-900">{p.membership.plan?.name || 'Membership'}</p>
                    <p className="text-xs text-slate-400 capitalize">{p.membership.status || ''}</p>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 font-semibold text-slate-900">{toINR(p.amount)}</td>
              <td className="px-4 py-3 text-sm text-slate-600 capitalize">{p.method || '—'}</td>
              <td className="px-4 py-3 text-sm">
                {p.gateway ? (
                  <div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700">
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
              <td className="px-4 py-3 text-sm">
                <span className={`badge ${statusColor(p.status)}`}>{p.status}</span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(p.createdAt)}</td>
              <td className="px-4 py-3 text-sm">
                {p.status === 'PENDING' && !p.gateway && (
                  <button onClick={() => handleVerify(p)} className="btn btn-sm btn-primary">
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
            <label className="label">Select Member</label>
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
                className="input"
              />
            )}
            {memberSearch && !selectedMember && filteredMembers.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredMembers.slice(0, 20).map((m) => (
                  <li key={m._id} onClick={() => handleMemberSelect(m)} className="px-3 py-2 text-sm hover:bg-brand-50 cursor-pointer">
                    {m.name} <span className="text-slate-500">({m.email})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="label">Membership (optional)</label>
            {!selectedMember ? (
              <input disabled placeholder="Select a member first" className="input bg-slate-50 text-slate-400" />
            ) : loadingMemberships ? (
              <input disabled placeholder="Loading memberships..." className="input bg-slate-50 text-slate-400" />
            ) : memberMemberships.length === 0 ? (
              <div className="px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm text-slate-500">No memberships found for this member</div>
            ) : (
              <select value={form.membershipId} onChange={(e) => setForm({ ...form, membershipId: e.target.value, planId: '' })} className="input">
                <option value="">None</option>
                {memberMemberships.map((m) => (
                  <option key={m._id} value={m._id}>{m.plan?.name || 'Membership'} — {(m.status || '').toUpperCase()}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label">Plan (optional — creates new membership)</label>
            {!selectedMember ? (
              <input disabled placeholder="Select a member first" className="input bg-slate-50 text-slate-400" />
            ) : (
              <select value={form.planId} onChange={handlePlanChange} className="input">
                <option value="">None</option>
                {plans.map((pla) => (
                  <option key={pla._id} value={pla._id}>
                    {pla.name} — {toINR(pla.price)} / {pla.duration} days
                    {pla.paymentMode === 'INSTALLMENT' && pla.installments > 1 ? ` (${pla.installments} × ${toINR(pla.installmentAmount || 0)})` : ''}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-slate-400 mt-1">Pick this when the member is buying a plan at the counter — a new membership is created automatically and activated when the cumulative paid amount reaches the plan price.</p>
          </div>
          <div>
            <label className="label">Amount (₹)</label>
            <input required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" />
            {form.planId && form.status === 'completed' && (
              <p className="text-xs text-slate-400 mt-1">Plan-based completed payments must match the plan price exactly (or the fixed installment amount for installment plans).</p>
            )}
          </div>
          <div>
            <label className="label">Method</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Net Banking</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline btn-md">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-md btn-primary">
              {saving ? 'Saving...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}