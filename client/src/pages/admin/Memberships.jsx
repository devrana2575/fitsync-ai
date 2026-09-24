import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { XCircleIcon, ClipboardDocumentListIcon, CheckCircleIcon, ClockIcon, BellAlertIcon, PlusIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import useDebounce from '../../hooks/useDebounce';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';
import ProgressBar from '../../components/common/ProgressBar';
import Avatar from '../../components/common/Avatar';
import { SkeletonCard, SkeletonRow } from '../../components/common/Skeleton';
import { toINR, fmtDate } from '../../utils/format';
import { useToast } from '../../context/ToastContext';

const initialPlan = {
  name: '', price: '', duration: '', features: '', description: '',
  trainerIncluded: false, trainerAllocationMode: 'SHARED', requiredSpecialization: '',
  workoutPlanIncluded: false, paymentMode: 'FULL', installments: 1,
};
const initialAssignForm = { selectedMember: null, selectedPlan: null, startDate: new Date().toISOString().split('T')[0], complimentary: false };

const ALLOCATION_MODES = ['NONE', 'SHARED', 'ASSIGNED', 'DEDICATED'];

export default function Memberships() {
  const location = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState('plans');
  const [plans, setPlans] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState(initialPlan);
  const [saving, setSaving] = useState(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState(initialAssignForm);
  const [assignSaving, setAssignSaving] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const debouncedMemberSearch = useDebounce(memberSearch, 300);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const fetchMembers = async () => {
    try {
      const res = await api.get('/members', { params: { limit: 200 } });
      setAllMembers(res.data.data || res.data.members || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchAll(); fetchMembers(); }, []);

  useEffect(() => {
    if (location.state?.openCreate) {
      setTab('memberships');
      openAssignModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddPlan = () => { setEditingPlan(null); setPlanForm(initialPlan); setShowPlanModal(true); };
  const openEditPlan = (p) => {
    setEditingPlan(p);
    setPlanForm({
      name: p.name, price: p.price, duration: p.duration,
      features: Array.isArray(p.features) ? p.features.join(', ') : (p.features || ''),
      description: p.description || '',
      trainerIncluded: Boolean(p.trainerIncluded),
      trainerAllocationMode: p.trainerAllocationMode || 'SHARED',
      requiredSpecialization: p.requiredSpecialization || '',
      workoutPlanIncluded: Boolean(p.workoutPlanIncluded),
      paymentMode: p.paymentMode || 'FULL',
      installments: p.installments || 1,
    });
    setShowPlanModal(true);
  };

  const viewMembership = async (m) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await api.get(`/memberships/${m._id}`);
      setDetail(res.data);
    } catch (err) {
      toast.error('Failed to load membership details', err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredMembers = allMembers.filter((m) => {
    if (!debouncedMemberSearch) return true;
    const q = debouncedMemberSearch.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

  const openAssignModal = () => {
    setAssignForm(initialAssignForm);
    setMemberSearch('');
    setShowAssignModal(true);
  };

  const handleAssignMemberSelect = (member) => {
    setAssignForm({ ...assignForm, selectedMember: member });
    setMemberSearch('');
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    const { selectedMember, selectedPlan, startDate } = assignForm;
    if (!selectedMember || !selectedPlan) return;
    try {
      const activeRes = await api.get(`/memberships/active/${selectedMember._id}`);
      const activeMembership = activeRes.data.data || activeRes.data.membership;
      if (activeMembership) {
        const proceed = await toast.confirm({ title: 'Replace active membership', description: 'This member already has an active membership — it will be replaced. Continue?', danger: true });
        if (!proceed) return;
      }
    } catch {
      // If the check fails, proceed anyway
    }
    setAssignSaving(true);
    try {
      const payload = {
        userId: selectedMember._id,
        planId: selectedPlan._id,
        startDate,
        complimentary: assignForm.complimentary,
      };
      await api.post('/memberships', payload);
      setShowAssignModal(false);
      setAssignForm(initialAssignForm);
      fetchAll();
    } catch (err) {
      toast.error('Failed to assign membership', err.message);
    } finally {
      setAssignSaving(false);
    }
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...planForm,
        price: Number(planForm.price),
        duration: Number(planForm.duration),
        installments: Number(planForm.installments) || 1,
        features: planForm.features.split(',').map(f => f.trim()).filter(Boolean),
        trainerIncluded: planForm.trainerIncluded,
        workoutPlanIncluded: planForm.workoutPlanIncluded,
        paymentMode: planForm.paymentMode,
      };
      if (editingPlan) {
        await api.put(`/membership-plans/${editingPlan._id}`, payload);
      } else {
        await api.post('/membership-plans', payload);
      }
      setShowPlanModal(false);
      fetchAll();
    } catch (err) {
      toast.error('Failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const renewMembership = async (m) => {
    const proceed = await toast.confirm({
      title: 'Renew membership',
      description:
        `Renew "${m.plan?.name || 'membership'}" for ${m.user?.name || 'this member'}?\n\n` +
        'Renewing here grants ACTIVE status without an online payment. ' +
        'Confirm the payment was collected at the counter (cash/UPI).\n',
      confirmLabel: 'Renew',
    });
    if (!proceed) return;
    try {
      await api.put(`/memberships/${m._id}/renew`, { acknowledged: true });
      fetchAll();
    } catch (err) {
      toast.error('Failed to renew', err.message);
    }
  };

  const cancelMembership = async (m) => {
    const proceed = await toast.confirm({ title: 'Cancel membership', description: 'Cancel this membership?', confirmLabel: 'Cancel', danger: true });
    if (!proceed) return;
    try {
      await api.put(`/memberships/${m._id}/cancel`);
      fetchAll();
    } catch (err) {
      toast.error('Failed to cancel', err.message);
    }
  };

  const statusColor = (s) => {
    const map = { active: 'badge-success', expired: 'badge-danger', pending: 'badge-warning', cancelled: 'badge-muted' };
    return map[s?.toLowerCase()] || 'badge-muted';
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Memberships"
        subtitle="Manage membership plans and active memberships"
        icon={ClipboardDocumentListIcon}
      />

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={CheckCircleIcon} label="Active" value={stats.active || 0} color="green" />
          <StatCard icon={XCircleIcon} label="Expired" value={stats.expired || 0} color="red" />
          <StatCard icon={ClockIcon} label="Pending" value={stats.pending || 0} color="yellow" />
          <StatCard icon={XCircleIcon} label="Cancelled" value={stats.cancelled || 0} color="blue" />
          <StatCard icon={BellAlertIcon} label="Expiring Soon" value={stats.expiringSoon || 0} color="purple" />
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setTab('plans')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'plans' ? 'border-brand-600 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Plans
        </button>
        <button onClick={() => setTab('memberships')} className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'memberships' ? 'border-brand-600 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Memberships
        </button>
      </div>

      {loading ? (
        tab === 'plans' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <SkeletonRow rows={8} />
        )
      ) : (
        tab === 'plans' ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={openAddPlan} className="btn btn-md btn-primary">
                <PlusIcon className="h-5 w-5" aria-hidden="true" />
                Add Plan
              </button>
            </div>
            {plans.length === 0 ? <EmptyState icon={ClipboardDocumentListIcon} message="No plans created yet" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((p) => (
                  <div key={p._id} className="card p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
                      <button onClick={() => openEditPlan(p)} className="btn btn-sm btn-outline">Edit</button>
                    </div>
                    <p className="text-2xl font-semibold tabular-nums text-brand-400 mb-1">{toINR(p.price)}</p>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">{p.duration} DAYS</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.paymentMode === 'INSTALLMENT' && (
                        <span className="badge badge-warning">
                          {p.installments || 2} × {toINR(p.installmentAmount || 0)}
                        </span>
                      )}
                      {p.trainerIncluded ? (
                        <span className="badge badge-brand">
                          Trainer: {p.trainerAllocationMode || 'SHARED'}
                        </span>
                      ) : (
                        <span className="badge badge-muted">No trainer</span>
                      )}
                      {p.workoutPlanIncluded && (
                        <span className="badge badge-success">Workout plan</span>
                      )}
                      {p.requiredSpecialization && (
                        <span className="badge badge-info">Specialty: {p.requiredSpecialization}</span>
                      )}
                    </div>
                    {p.description && <p className="text-sm text-slate-600 mb-3">{p.description}</p>}
                    {p.features?.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {p.features.map((f, i) => (
                          <li key={i} className="badge badge-muted">{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={openAssignModal} className="btn btn-md btn-primary">
                <PlusIcon className="h-5 w-5" aria-hidden="true" />
                Assign Membership
              </button>
            </div>
            {memberships.length === 0 ? <EmptyState icon={ClipboardDocumentListIcon} message="No active memberships" /> : (
              <DataTable headers={['Member', 'Plan', 'Start Date', 'End Date', 'Status', 'Actions']}>
                {memberships.map((m) => (
                  <tr key={m._id} className="odd:bg-transparent even:bg-surface/60">
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Avatar name={m.user?.name || m.member?.name} size="sm" />
                        <span className="font-medium text-slate-900">{m.user?.name || m.member?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{m.plan?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(m.startDate)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(m.endDate)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`badge ${statusColor(m.status)}`}>{m.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => viewMembership(m)} className="btn btn-sm btn-outline">View</button>
                        {m.status?.toLowerCase() === 'active' && (
                          <>
                            <button onClick={() => renewMembership(m)} className="btn btn-sm text-success hover:bg-success/10">Renew</button>
                            <button onClick={() => cancelMembership(m)} className="btn btn-sm text-danger hover:bg-danger/10">Cancel</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        )
      )}

      <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title={editingPlan ? 'Edit Plan' : 'Add Plan'}>
        <form onSubmit={handlePlanSubmit} className="space-y-4">
          <div>
            <label className="label">Plan Name</label>
            <input required value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Price (₹)</label>
            <input required type="number" min="0" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Duration (days)</label>
            <input required type="number" min="1" value={planForm.duration} onChange={(e) => setPlanForm({ ...planForm, duration: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} rows={2} className="input" />
          </div>
          <div>
            <label className="label">Features (comma-separated)</label>
            <input value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} placeholder="e.g. Access to gym, Locker, Sauna" className="input" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Payment Mode</label>
              <select value={planForm.paymentMode} onChange={(e) => setPlanForm({ ...planForm, paymentMode: e.target.value })} className="input">
                <option value="FULL">Pay in full</option>
                <option value="INSTALLMENT">Installments</option>
              </select>
            </div>
            <div>
              <label className="label">Installments (if applicable)</label>
              <input type="number" min="1" value={planForm.installments} onChange={(e) => setPlanForm({ ...planForm, installments: e.target.value })} disabled={planForm.paymentMode !== 'INSTALLMENT'} className="input bg-surface disabled:opacity-50" />
            </div>
          </div>
          {planForm.paymentMode === 'INSTALLMENT' && Number(planForm.installments) > 1 && (
            <p className="text-xs text-warning bg-warning/10 border border-warning/25 rounded-lg px-3 py-2">
              Installment amount = ₹{(Number(planForm.price) / Number(planForm.installments)).toFixed(2)} per installment (the last installment may differ by a few rupees). The membership activates only after the full price is covered.
            </p>
          )}

          <div className="flex items-center gap-2">
            <input id="plan-trainer" type="checkbox" checked={planForm.trainerIncluded} onChange={(e) => setPlanForm({ ...planForm, trainerIncluded: e.target.checked })} className="h-4 w-4 text-brand-400 border-slate-300 rounded focus:ring-brand-500" />
            <label htmlFor="plan-trainer" className="text-sm font-medium text-slate-700">Includes personal trainer</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Trainer Allocation</label>
              <select value={planForm.trainerAllocationMode} onChange={(e) => setPlanForm({ ...planForm, trainerAllocationMode: e.target.value })} disabled={!planForm.trainerIncluded} className="input bg-surface disabled:opacity-50">
                {ALLOCATION_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Required Specialization</label>
              <input value={planForm.requiredSpecialization} onChange={(e) => setPlanForm({ ...planForm, requiredSpecialization: e.target.value })} disabled={!planForm.trainerIncluded} placeholder="e.g. Strength" className="input disabled:opacity-50" />
            </div>
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            SHARED: any trainer can coach this member. ASSIGNED/DEDICATED: a trainer is assigned after payment and only they (or admins) plan workouts for this member.
          </p>

          <div className="flex items-center gap-2">
            <input id="plan-workouts" type="checkbox" checked={planForm.workoutPlanIncluded} onChange={(e) => setPlanForm({ ...planForm, workoutPlanIncluded: e.target.checked })} className="h-4 w-4 text-brand-400 border-slate-300 rounded focus:ring-brand-500" />
            <label htmlFor="plan-workouts" className="text-sm font-medium text-slate-700">Includes workout plans</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowPlanModal(false)} className="btn btn-outline btn-md">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-md btn-primary">
              {saving ? 'Saving...' : editingPlan ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign Membership">
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <div className="relative">
            <label className="label">Select Member</label>
            {assignForm.selectedMember ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-surface">
                <span className="flex-1 text-sm text-slate-900">{assignForm.selectedMember.name} ({assignForm.selectedMember.email})</span>
                <button type="button" onClick={() => setAssignForm({ ...assignForm, selectedMember: null })} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
              </div>
            ) : (
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search member..."
                className="input"
              />
            )}
            {memberSearch && !assignForm.selectedMember && filteredMembers.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-surface-elevated border border-border rounded-lg shadow-pop max-h-48 overflow-y-auto">
                {filteredMembers.slice(0, 20).map((m) => (
                  <li key={m._id} onClick={() => handleAssignMemberSelect(m)} className="px-3 py-2 text-sm hover:bg-brand-500/12 cursor-pointer">
                    {m.name} <span className="text-slate-500">({m.email})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="label">Plan</label>
            <select required value={assignForm.selectedPlan?._id || ''} onChange={(e) => {
              const plan = plans.find((p) => p._id === e.target.value) || null;
              setAssignForm({ ...assignForm, selectedPlan: plan });
            }} className="input">
              <option value="">Choose a plan...</option>
              {plans.map((p) => (
                <option key={p._id} value={p._id}>{p.name} — {toINR(p.price)} ({p.duration} days)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start Date (optional)</label>
            <input type="date" value={assignForm.startDate} onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })} className="input" />
          </div>
          <div className="flex items-center gap-2">
            <input id="complimentary" type="checkbox" checked={assignForm.complimentary} onChange={(e) => setAssignForm({ ...assignForm, complimentary: e.target.checked })} className="h-4 w-4 text-brand-400 border-slate-300 rounded focus:ring-brand-500" />
            <label htmlFor="complimentary" className="text-sm font-medium text-slate-700">Complementary / free grant (activate immediately)</label>
          </div>
          <div className={`rounded-lg px-3 py-2 text-xs ${assignForm.complimentary ? 'bg-warning/10 text-warning border border-warning/25' : 'bg-surface text-slate-500 border border-slate-200'}`}>
            {assignForm.complimentary
              ? 'A complimentary/offline grant activates the membership immediately — use only for free or counter-collected memberships.'
              : 'This membership is created as PENDING and does not grant access yet. Record the payment on the Payments page (Plan-based entry) to activate it.'}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAssignModal(false)} className="btn btn-outline btn-md">Cancel</button>
            <button type="submit" disabled={assignSaving || !assignForm.selectedMember || !assignForm.selectedPlan} className="btn btn-md btn-primary">
              {assignSaving ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={detailLoading || detail !== null} onClose={() => { if (!detailLoading) setDetail(null); }} title={`Membership — ${detail?.membership?.plan?.name || 'Details'}`}>
        {detailLoading ? (
          <div className="space-y-4">
            <SkeletonCard />
          </div>
        ) : detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-slate-500">Member</p>
                <p className="font-medium text-slate-900">{detail.membership?.user?.name || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">Plan</p>
                <p className="font-medium text-slate-900">{detail.membership?.plan?.name || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">Status</p>
                <span className={`badge ${statusColor(detail.membership?.status)}`}>{detail.membership?.status}</span>
              </div>
              <div>
                <p className="text-slate-500">Payment</p>
                <p className="font-medium text-slate-900">{detail.membership?.plan?.paymentMode || 'FULL'}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-slate-500">Paid</p>
                <p className="font-semibold text-success">{toINR(detail.paidTotal)}</p>
              </div>
              <div>
                <p className="text-slate-500">Price</p>
                <p className="font-semibold text-slate-900">{toINR(detail.membership?.plan?.price)}</p>
              </div>
              <div>
                <p className="text-slate-500">Remaining</p>
                <p className={`font-semibold ${Number(detail.remaining) > 0 ? 'text-warning' : 'text-success'}`}>{toINR(detail.remaining)}</p>
              </div>
            </div>
            {detail.membership?.plan?.paymentMode === 'INSTALLMENT' && Number(detail.membership?.plan?.price) > 0 && (
              <ProgressBar
                value={(Number(detail.paidTotal || 0) / Number(detail.membership?.plan?.price || 1)) * 100}
                tone="success"
                label={`${toINR(detail.paidTotal)} of ${toINR(detail.membership?.plan?.price)} paid`}
              />
            )}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Receipt</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Method</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(detail.payments || []).length === 0 ? (
                      <tr><td colSpan="5" className="px-4 py-3 text-sm text-slate-400 text-center">No payments recorded for this membership</td></tr>
                    ) : detail.payments.map((p) => (
                      <tr key={p._id}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.transactionId || '—'}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{toINR(p.amount)}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 capitalize">{p.method || '—'}</td>
                        <td className="px-4 py-3 text-sm"><span className={`badge ${statusColor(p.status)}`}>{p.status}</span></td>
                        <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(p.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setDetail(null)} className="btn btn-outline btn-md">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}