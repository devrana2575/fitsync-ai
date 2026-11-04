import { useState, useEffect } from 'react';
import {
  WrenchScrewdriverIcon,
  CogIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
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

const labelize = (value) => (value
  ? String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  : '—');

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
  const [search, setSearch] = useState('');
  const [viewTarget, setViewTarget] = useState(null);
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
        toast.success('Equipment updated', `${payload.name} has been updated.`);
      } else {
        await api.post('/equipment', payload);
        toast.success('Equipment added', `${payload.name} is now tracked.`);
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
      toast.success('Equipment deactivated', `${eq.name} has been removed from the active list.`);
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
      toast.success('Issue reported', `${issueTarget.name} has been flagged for the team.`);
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

  const activeEquipment = equipment.filter((e) => e.isActive !== false);
  const dueIds = new Set(maintenance.map((a) => String(a._id)));
  const isDue = (eq) => dueIds.has(String(eq._id));

  const countCondition = (name) => stats?.byCondition?.find((c) => c._id === name)?.count
    ?? activeEquipment.filter((e) => e.condition?.toLowerCase() === name).length;
  const goodCount = countCondition('good');
  const repairCount = countCondition('poor') + countCondition('needs_repair');

  const searchTerm = search.trim().toLowerCase();
  const isFiltering = conditionFilter !== 'all' || Boolean(searchTerm);
  const clearFilters = () => { setConditionFilter('all'); setSearch(''); };

  const filteredEquipment = activeEquipment.filter((eq) => {
    const condition = eq.condition?.toLowerCase();
    let matchesFilter = true;
    if (conditionFilter === 'repair') {
      matchesFilter = condition === 'poor' || condition === 'needs_repair';
    } else if (conditionFilter === 'due') {
      matchesFilter = isDue(eq);
    } else if (conditionFilter !== 'all') {
      matchesFilter = condition === conditionFilter;
    }
    if (!matchesFilter) return false;
    if (!searchTerm) return true;
    const haystack = `${eq.name || ''} ${eq.category || ''} ${eq.brand || ''} ${eq.model || ''} ${eq.location || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

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
          <StatCard
            icon={CogIcon}
            label="Total Equipment"
            value={stats.total || activeEquipment.length}
            color="ink"
            onClick={() => setConditionFilter('all')}
            active={conditionFilter === 'all'}
            ariaLabel="Show all equipment"
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Good Condition"
            value={goodCount}
            color="green"
            onClick={() => setConditionFilter('good')}
            active={conditionFilter === 'good'}
            ariaLabel="Show equipment in good condition"
          />
          <StatCard
            icon={WrenchScrewdriverIcon}
            label="Maintenance Due"
            value={maintenance.length}
            color="yellow"
            sub="Next 14 days"
            onClick={() => setConditionFilter('due')}
            active={conditionFilter === 'due'}
            ariaLabel="Show equipment due for maintenance"
          />
          <StatCard
            icon={XCircleIcon}
            label="Poor / Needs Repair"
            value={repairCount}
            color="red"
            onClick={() => setConditionFilter('repair')}
            active={conditionFilter === 'repair'}
            ariaLabel="Show equipment that is poor or needs repair"
          />
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
              <button
                key={a._id || i}
                type="button"
                onClick={() => setViewTarget(a)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-left transition-colors hover:bg-warning/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
              >
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">{a.name || a.equipment?.name}</span>
                  <span className="ml-2 text-sm text-slate-500">— {a.message || `Scheduled: ${fmtDate(a.nextMaintenance || a.scheduledDate)}`}</span>
                </div>
                <span className="badge badge-warning shrink-0">Due</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search equipment, category, brand or location..."
            className="input pl-9 pr-9"
            aria-label="Search equipment"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-lg leading-none text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="input w-full sm:w-56"
          aria-label="Filter by condition"
        >
          <option value="all">All conditions</option>
          <option value="due">Maintenance due (14 days)</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="needs_repair">Needs Repair</option>
          <option value="repair">Poor / Needs Repair</option>
        </select>
        {isFiltering && (
          <button type="button" onClick={clearFilters} className="btn btn-sm btn-outline">
            Clear filters
          </button>
        )}
        <span className="text-xs text-slate-500 sm:ml-auto">
          {filteredEquipment.length} of {activeEquipment.length} shown
        </span>
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message="We couldn't load your equipment. Please try again." onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={8} />
      ) : filteredEquipment.length === 0 ? (
        <EmptyState
          icon={CogIcon}
          message={isFiltering ? 'No equipment matches your filters' : 'No equipment found'}
          description={isFiltering ? 'Try a different search or condition, or clear your filters.' : 'Add your first piece of equipment to start tracking maintenance.'}
        />
      ) : (
        <DataTable headers={['Name', 'Category', 'Condition', 'Last Maintenance', 'Next Maintenance', 'Status', 'Actions']}>
          {filteredEquipment.map((eq) => (
            <tr key={eq._id} className="odd:bg-transparent even:bg-surface/60">
              <td className="px-4 py-3 text-sm">
                <button
                  type="button"
                  onClick={() => setViewTarget(eq)}
                  className="text-left font-medium text-slate-900 hover:text-brand-500"
                >
                  {eq.name}
                </button>
                {isDue(eq) && (
                  <p className="mt-0.5 text-xs font-normal text-warning">Maintenance due</p>
                )}
                {eq.status === 'issue_reported' && (
                  <p className="mt-0.5 text-xs font-normal text-warning">Issue: {eq.reportedIssue || 'reported'}{eq.reportedAt ? ` · ${fmtDateShort(eq.reportedAt)}` : ''}</p>
                )}
              </td>
              <td className="px-4 py-3 text-sm capitalize text-slate-600">{eq.category || '—'}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`badge ${conditionBadge(eq.condition)}`}>{labelize(eq.condition)}</span>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDateShort(eq.lastMaintenance)}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDateShort(eq.nextMaintenance)}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`badge ${statusBadge(eq.status)}`}>{labelize(eq.status)}</span>
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setViewTarget(eq)} className="btn btn-sm btn-outline">View</button>
                  <button onClick={() => openIssueReport(eq)} className="btn btn-sm text-warning hover:bg-warning/10">Report Issue</button>
                  <button onClick={() => openEdit(eq)} className="btn btn-sm btn-outline">Edit</button>
                  <button onClick={() => handleDelete(eq)} className="btn btn-sm text-slate-500 hover:text-danger hover:bg-danger/10">Delete</button>
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

      <Modal isOpen={Boolean(viewTarget)} onClose={() => setViewTarget(null)} title={viewTarget?.name || 'Equipment details'}>
        {viewTarget && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className={`badge ${conditionBadge(viewTarget.condition)}`}>{labelize(viewTarget.condition)}</span>
              <span className={`badge ${statusBadge(viewTarget.status)}`}>{labelize(viewTarget.status)}</span>
              {isDue(viewTarget) && <span className="badge badge-warning">Maintenance due</span>}
            </div>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</dt>
                <dd className="mt-0.5 capitalize text-slate-900">{viewTarget.category || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</dt>
                <dd className="mt-0.5 text-slate-900">{viewTarget.location || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Brand / Model</dt>
                <dd className="mt-0.5 text-slate-900">{[viewTarget.brand, viewTarget.model].filter(Boolean).join(' ') || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last maintenance</dt>
                <dd className="mt-0.5 text-slate-900">{fmtDate(viewTarget.lastMaintenance)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Next maintenance</dt>
                <dd className="mt-0.5 text-slate-900">{fmtDate(viewTarget.nextMaintenance)}</dd>
              </div>
            </dl>

            {viewTarget.description && (
              <div>
                <p className="label">Description</p>
                <p className="whitespace-pre-wrap text-sm text-slate-600">{viewTarget.description}</p>
              </div>
            )}

            {viewTarget.notes && (
              <div>
                <p className="label">Notes</p>
                <p className="whitespace-pre-wrap text-sm text-slate-600">{viewTarget.notes}</p>
              </div>
            )}

            {viewTarget.reportedIssue && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-warning">Reported issue</p>
                <p className="mt-1 text-sm text-slate-700">{viewTarget.reportedIssue}</p>
                {viewTarget.reportedAt && <p className="mt-1 text-xs text-slate-500">Reported {fmtDate(viewTarget.reportedAt)}</p>}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { const target = viewTarget; setViewTarget(null); openEdit(target); }}
                className="btn btn-outline btn-md"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => { const target = viewTarget; setViewTarget(null); openIssueReport(target); }}
                className="btn btn-md text-warning hover:bg-warning/10"
              >
                Report issue
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}