import { useState, useEffect } from 'react';
import { WrenchScrewdriverIcon, CogIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, PlusIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';
import { SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate, fmtDateShort } from '../../utils/format';
import { useToast } from '../../context/ToastContext';

const initialForm = { name: '', category: '', condition: 'good', lastMaintenance: '', nextMaintenance: '', status: 'available', description: '' };

const conditionBadge = (c) => {
  const map = { excellent: 'badge-success', good: 'badge-info', fair: 'badge-warning', poor: 'badge-danger', needs_repair: 'badge-danger' };
  return map[c?.toLowerCase()] || 'badge-muted';
};

const statusBadge = (s) => {
  const map = { available: 'badge-success', in_use: 'badge-info', under_maintenance: 'badge-warning', out_of_order: 'badge-danger', issue_reported: 'badge-warning' };
  return map[s?.toLowerCase()] || 'badge-muted';
};

export default function Equipment() {
  const { toast } = useToast();
  const [equipment, setEquipment] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [conditionFilter, setConditionFilter] = useState('all');
  const [issueTarget, setIssueTarget] = useState(null);
  const [issueText, setIssueText] = useState('');
  const [issueSaving, setIssueSaving] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [eqRes, mtRes, stRes] = await Promise.all([
        api.get('/equipment'),
        api.get('/equipment/maintenance'),
        api.get('/equipment/stats'),
      ]);
      setEquipment(eqRes.data.data || eqRes.data.equipment || []);
      setMaintenance(mtRes.data.equipment || []);
      setStats(stRes.data.data || stRes.data);
    } catch (err) {
      setError(err.message || 'Failed to load equipment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      ['lastMaintenance', 'nextMaintenance'].forEach((k) => { if (!payload[k]) delete payload[k]; });
      if (editing) {
        await api.put(`/equipment/${editing._id}`, payload);
      } else {
        await api.post('/equipment', payload);
      }
      setShowModal(false);
      setEditing(null);
      setForm(initialForm);
      fetchAll();
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => { setEditing(null); setForm(initialForm); setShowModal(true); };

  const openEdit = (eq) => {
    setEditing(eq);
    setForm({
      name: eq.name || '',
      category: eq.category || '',
      condition: eq.condition || 'good',
      lastMaintenance: eq.lastMaintenance ? eq.lastMaintenance.slice(0, 10) : '',
      nextMaintenance: eq.nextMaintenance ? eq.nextMaintenance.slice(0, 10) : '',
      status: eq.status || 'available',
      description: eq.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (eq) => {
    const proceed = await toast.confirm({ title: 'Delete equipment', description: `Delete "${eq.name}"?`, confirmLabel: 'Delete', danger: true });
    if (!proceed) return;
    try {
      await api.delete(`/equipment/${eq._id}`);
      fetchAll();
    } catch (err) {
      toast.error('Delete failed', err.message);
    }
  };

  const openIssueReport = (eq) => {
    setIssueTarget(eq);
    setIssueText(eq.status === 'issue_reported' ? eq.reportedIssue || '' : '');
    setShowIssueModal(true);
  };

  const submitIssueReport = async (e) => {
    e.preventDefault();
    if (!issueText.trim()) return;
    setIssueSaving(true);
    try {
      await api.post(`/equipment/${issueTarget._id}/issue-report`, { reportedIssue: issueText.trim() });
      setShowIssueModal(false);
      setIssueTarget(null);
      setIssueText('');
      fetchAll();
    } catch (err) {
      toast.error('Failed to report issue', err.message);
    } finally {
      setIssueSaving(false);
    }
  };

  const filteredEquipment = conditionFilter === 'all' ? equipment : equipment.filter(e => e.condition?.toLowerCase() === conditionFilter);

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Equipment"
        subtitle="Track gym equipment condition and maintenance"
        icon={CogIcon}
        actions={
          <button onClick={openCreate} className="btn btn-md btn-primary">
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
            Add Equipment
          </button>
        }
      />

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={CogIcon} label="Total Equipment" value={stats.total || equipment.length} color="ink" />
          <StatCard icon={CheckCircleIcon} label="Good Condition" value={stats.byCondition?.find(c => c._id === 'good')?.count || 0} color="green" />
          <StatCard icon={WrenchScrewdriverIcon} label="Needs Maintenance" value={stats.needsMaintenance || 0} color="yellow" />
          <StatCard icon={XCircleIcon} label="Poor / Needs Repair" value={(stats.byCondition?.find(c => c._id === 'poor')?.count || 0) + (stats.byCondition?.find(c => c._id === 'needs_repair')?.count || 0)} color="red" />
        </div>
      )}

      {maintenance.length > 0 && (
        <div className="bg-warning/10 border border-warning/25 rounded-xl p-5">
          <h2 className="text-base font-semibold text-warning mb-3 flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
            Maintenance Alerts
          </h2>
          <div className="space-y-2">
            {maintenance.map((a, i) => (
              <div key={a._id || i} className="flex items-center justify-between gap-3 bg-warning/10 rounded-lg px-4 py-3 border border-warning/25">
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">{a.name || a.equipment?.name}</span>
                  <span className="text-sm text-slate-500 ml-2">— {a.message || `Scheduled: ${fmtDate(a.nextMaintenance || a.scheduledDate)}`}</span>
                </div>
                <span className="badge badge-warning shrink-0">Due</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Condition:</label>
        <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)} className="input md:max-w-xs">
          <option value="all">All</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="needs_repair">Needs Repair</option>
        </select>
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message="We couldn't load your equipment. Please try again." onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={8} />
      ) : filteredEquipment.length === 0 ? (
        <EmptyState icon={CogIcon} message="No equipment found" description="Try a different condition filter or add your first piece of equipment." />
      ) : (
        <DataTable headers={['Name', 'Category', 'Condition', 'Last Maintenance', 'Next Maintenance', 'Status', 'Actions']}>
          {filteredEquipment.map((eq) => (
            <tr key={eq._id} className="odd:bg-transparent even:bg-slate-100/40">
              <td className="px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">{eq.name}</p>
                {eq.status === 'issue_reported' && (
                  <p className="text-xs font-normal text-warning mt-0.5">Issue: {eq.reportedIssue || 'reported'}{eq.reportedAt ? ` · ${fmtDateShort(eq.reportedAt)}` : ''}</p>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 capitalize">{eq.category || '—'}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`badge ${conditionBadge(eq.condition)}`}>{eq.condition}</span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDateShort(eq.lastMaintenance)}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDateShort(eq.nextMaintenance)}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`badge ${statusBadge(eq.status)}`}>{eq.status?.replace('_', ' ')}</span>
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-1">
                  <button onClick={() => openIssueReport(eq)} className="btn btn-sm text-warning hover:bg-warning/10">Report Issue</button>
                  <button onClick={() => openEdit(eq)} className="btn btn-sm btn-outline">Edit</button>
                  <button onClick={() => handleDelete(eq)} className="btn btn-sm text-danger hover:bg-danger/10">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Equipment' : 'Add Equipment'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Category</label>
            <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Cardio, Strength" className="input" />
          </div>
          <div>
            <label className="label">Condition</label>
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="input">
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
              <option value="needs_repair">Needs Repair</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Last Maintenance</label>
              <input type="date" value={form.lastMaintenance} onChange={(e) => setForm({ ...form, lastMaintenance: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Next Maintenance</label>
              <input type="date" value={form.nextMaintenance} onChange={(e) => setForm({ ...form, nextMaintenance: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              <option value="available">Available</option>
              <option value="in_use">In Use</option>
              <option value="under_maintenance">Under Maintenance</option>
              <option value="out_of_order">Out of Order</option>
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline btn-md">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-md btn-primary">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showIssueModal} onClose={() => setShowIssueModal(false)} title={`Report Issue — ${issueTarget?.name || 'Equipment'}`}>
        <form onSubmit={submitIssueReport} className="space-y-4">
          <div>
            <label className="label">What's wrong?</label>
            <textarea required value={issueText} onChange={(e) => setIssueText(e.target.value)} rows={3} placeholder="e.g. Treadmill belt slipping, loose handlebar" className="input" />
          </div>
          <p className="text-xs text-slate-500 -mt-2">
            The equipment is flagged as having a reported issue and the admins are notified to schedule maintenance and follow up.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowIssueModal(false)} className="btn btn-outline btn-md">Cancel</button>
            <button type="submit" disabled={issueSaving} className="btn btn-md btn-danger">
              {issueSaving ? 'Reporting...' : 'Report Issue'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}