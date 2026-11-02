import { useState, useEffect } from 'react';
import {
  MegaphoneIcon,
  BookmarkIcon,
  CheckCircleIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';
import { SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate } from '../../utils/format';
import { useToast } from '../../context/ToastContext';

const initialForm = { title: '', message: '', priority: 'info', pinned: false, expiresAt: '' };

const priorityBadge = (p) => {
  const map = { info: 'badge-info', warning: 'badge-warning', critical: 'badge-danger' };
  return map[p?.toLowerCase()] || 'badge-muted';
};

export default function Announcements() {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [viewTarget, setViewTarget] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const collected = [];
      let page = 1;
      let pages = 1;
      let totalCount = 0;
      do {
        const res = await api.get('/announcements', { params: { page, limit: 100 } });
        collected.push(...(res.data.announcements || []));
        totalCount = res.data.total ?? collected.length;
        pages = Math.max(1, res.data.pages || 1);
        page += 1;
      } while (page <= pages);
      setAnnouncements(collected);
      setTotal(totalCount);
      setNow(Date.now());
    } catch (err) {
      setError(err.message || 'Failed to load announcements');
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
      if (!payload.expiresAt) delete payload.expiresAt;
      if (editing) {
        await api.put(`/announcements/${editing._id}`, payload);
        toast.success('Announcement updated', `"${payload.title}" has been updated.`);
      } else {
        await api.post('/announcements', payload);
        toast.success('Announcement published', `"${payload.title}" is now live.`);
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

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      title: a.title || '',
      message: a.message || '',
      priority: a.priority || 'info',
      pinned: !!a.pinned,
      expiresAt: a.expiresAt ? a.expiresAt.slice(0, 10) : '',
    });
    setShowModal(true);
  };

  const handleDeactivate = async (a) => {
    const proceed = await toast.confirm({ title: 'Deactivate announcement', description: `Deactivate "${a.title}"?`, confirmLabel: 'Deactivate', danger: true });
    if (!proceed) return;
    try {
      await api.delete(`/announcements/${a._id}`);
      toast.success('Announcement deactivated', `"${a.title}" is no longer visible to members.`);
      fetchAll();
    } catch (err) {
      toast.error('Failed to deactivate announcement', err.message);
    }
  };

  const handleReactivate = async (a) => {
    try {
      await api.put(`/announcements/${a._id}`, { isActive: true });
      toast.success('Announcement reactivated', `"${a.title}" is live again.`);
      fetchAll();
    } catch (err) {
      toast.error('Failed to reactivate announcement', err.message);
    }
  };

  const handleTogglePin = async (a) => {
    try {
      await api.put(`/announcements/${a._id}`, { pinned: !a.pinned });
      setViewTarget((current) => (current && String(current._id) === String(a._id)
        ? { ...current, pinned: !a.pinned }
        : current));
      toast.success(a.pinned ? 'Announcement unpinned' : 'Announcement pinned', `"${a.title}" has been updated.`);
      fetchAll();
    } catch (err) {
      toast.error('Failed to update announcement', err.message);
    }
  };

  const isExpired = (a) => Boolean(a.expiresAt && new Date(a.expiresAt).getTime() < now);
  const isLive = (a) => a.isActive !== false && !isExpired(a);
  const activeCount = announcements.filter(isLive).length;
  const pinnedCount = announcements.filter((a) => a.pinned && isLive(a)).length;
  const expiredCount = announcements.filter(isExpired).length;

  const searchTerm = search.trim().toLowerCase();
  const isFiltering = filter !== 'all' || Boolean(searchTerm);
  const clearFilters = () => { setFilter('all'); setSearch(''); };

  const filteredAnnouncements = announcements.filter((a) => {
    let matchesFilter = true;
    if (filter === 'active') matchesFilter = isLive(a);
    else if (filter === 'pinned') matchesFilter = Boolean(a.pinned && isLive(a));
    else if (filter === 'expired') matchesFilter = isExpired(a);
    if (!matchesFilter) return false;
    if (!searchTerm) return true;
    return `${a.title || ''} ${a.message || ''} ${a.createdBy?.name || ''}`.toLowerCase().includes(searchTerm);
  });

  const announcementStatus = (a) => {
    if (a.isActive === false) return { label: 'Inactive', badge: 'badge-muted' };
    if (isExpired(a)) return { label: 'Expired', badge: 'badge-danger' };
    return { label: 'Active', badge: 'badge-success' };
  };
  const viewStatus = viewTarget ? announcementStatus(viewTarget) : null;

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Announcements"
        subtitle="Broadcast updates to members and trainers"
        icon={MegaphoneIcon}
        actions={
          <button onClick={openCreate} className="btn btn-md btn-primary">
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
            New Announcement
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={MegaphoneIcon}
          label="Total Announcements"
          value={total}
          color="brand"
          onClick={() => setFilter('all')}
          active={filter === 'all'}
          ariaLabel="Show all announcements"
        />
        <StatCard
          icon={CheckCircleIcon}
          label="Active"
          value={activeCount}
          color="green"
          onClick={() => setFilter('active')}
          active={filter === 'active'}
          ariaLabel="Show active announcements"
        />
        <StatCard
          icon={BookmarkIcon}
          label="Pinned"
          value={pinnedCount}
          color="yellow"
          onClick={() => setFilter('pinned')}
          active={filter === 'pinned'}
          ariaLabel="Show pinned announcements"
        />
        <StatCard
          icon={ClockIcon}
          label="Expired"
          value={expiredCount}
          color="red"
          onClick={() => setFilter('expired')}
          active={filter === 'expired'}
          ariaLabel="Show expired announcements"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, message or author..."
            className="input pl-9 pr-9"
            aria-label="Search announcements"
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
        {isFiltering && (
          <button type="button" onClick={clearFilters} className="btn btn-sm btn-outline">
            Clear filters
          </button>
        )}
        <span className="text-xs text-slate-500 sm:ml-auto">
          {filteredAnnouncements.length} of {announcements.length} shown
        </span>
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message="We couldn't load your announcements. Please try again." onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={6} />
      ) : filteredAnnouncements.length === 0 ? (
        <EmptyState
          icon={MegaphoneIcon}
          message={isFiltering ? 'No announcements match your filters' : 'No announcements found'}
          description={isFiltering ? 'Try a different search or filter, or clear your filters.' : 'Create your first announcement to update members.'}
        />
      ) : (
        <DataTable headers={['Title', 'Priority', 'Status', 'Pinned', 'Posted by', 'Created', 'Actions']}>
          {filteredAnnouncements.map((a) => {
            const status = announcementStatus(a);
            return (
              <tr key={a._id} className="odd:bg-transparent even:bg-surface/60">
                <td className="px-4 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setViewTarget(a)}
                    className="text-left font-medium text-slate-900 hover:text-brand-600"
                  >
                    {a.title}
                  </button>
                  {a.message && (
                    <p className="mt-0.5 line-clamp-1 max-w-md text-xs font-normal text-slate-500">{a.message}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`badge capitalize ${priorityBadge(a.priority)}`}>{a.priority}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {a.pinned ? (
                    <span className="badge badge-warning">Pinned</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{a.createdBy?.name || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {fmtDate(a.createdAt)}
                  {a.expiresAt && <p className="text-xs text-slate-500">Expires {fmtDate(a.expiresAt)}</p>}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setViewTarget(a)} className="btn btn-sm btn-outline">View</button>
                    <button onClick={() => openEdit(a)} className="btn btn-sm btn-outline">Edit</button>
                    {a.isActive === false ? (
                      <button onClick={() => handleReactivate(a)} className="btn btn-sm text-success hover:bg-success/10">Reactivate</button>
                    ) : (
                      <button onClick={() => handleDeactivate(a)} className="btn btn-sm text-slate-500 hover:text-danger hover:bg-danger/10">Deactivate</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Announcement' : 'New Announcement'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} className="input" />
          </div>
          <div>
            <label className="label">Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="label">Expires At</label>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="input" />
          </div>
          <div className="flex items-center gap-2">
            <input id="pinned" type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 focus:ring-offset-0" />
            <label htmlFor="pinned" className="text-sm font-medium text-slate-700">Pinned</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline btn-md">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-md btn-primary">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(viewTarget)} onClose={() => setViewTarget(null)} title="Announcement details">
        {viewTarget && viewStatus && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{viewTarget.title}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`badge capitalize ${priorityBadge(viewTarget.priority)}`}>{viewTarget.priority}</span>
                <span className={`badge ${viewStatus.badge}`}>{viewStatus.label}</span>
                {viewTarget.pinned && <span className="badge badge-warning">Pinned</span>}
              </div>
            </div>

            <p className="whitespace-pre-wrap text-sm text-slate-600">{viewTarget.message}</p>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Posted by</dt>
                <dd className="mt-0.5 text-slate-900">{viewTarget.createdBy?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</dt>
                <dd className="mt-0.5 text-slate-900">{fmtDate(viewTarget.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Expires</dt>
                <dd className="mt-0.5 text-slate-900">{viewTarget.expiresAt ? fmtDate(viewTarget.expiresAt) : 'No expiry'}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleTogglePin(viewTarget)}
                className="btn btn-outline btn-md"
              >
                {viewTarget.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                onClick={() => { const target = viewTarget; setViewTarget(null); openEdit(target); }}
                className="btn btn-outline btn-md"
              >
                Edit
              </button>
              {viewTarget.isActive === false ? (
                <button
                  type="button"
                  onClick={() => { const target = viewTarget; setViewTarget(null); handleReactivate(target); }}
                  className="btn btn-md text-success hover:bg-success/10"
                >
                  Reactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { const target = viewTarget; setViewTarget(null); handleDeactivate(target); }}
                  className="btn btn-md text-slate-500 hover:text-danger hover:bg-danger/10"
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}