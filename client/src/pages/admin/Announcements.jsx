import { useState, useEffect } from 'react';
import { MegaphoneIcon, BookmarkIcon, CheckCircleIcon, PlusIcon } from '@heroicons/react/24/outline';
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

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/announcements');
      setAnnouncements(res.data.announcements || []);
      setTotal(res.data.total || 0);
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
      } else {
        await api.post('/announcements', payload);
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
      fetchAll();
    } catch (err) {
      toast.error('Failed to deactivate announcement', err.message);
    }
  };

  const activeCount = announcements.filter((a) => a.isActive !== false).length;
  const pinnedCount = announcements.filter((a) => a.pinned).length;

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={MegaphoneIcon} label="Total Announcements" value={total} color="brand" />
        <StatCard icon={CheckCircleIcon} label="Active" value={activeCount} color="green" />
        <StatCard icon={BookmarkIcon} label="Pinned" value={pinnedCount} color="yellow" />
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message="We couldn't load your announcements. Please try again." onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={6} />
      ) : announcements.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} message="No announcements found" description="Create your first announcement to update members." />
      ) : (
        <DataTable headers={['Title', 'Priority', 'Pinned', 'Posted by', 'Created', 'Actions']}>
          {announcements.map((a) => (
            <tr key={a._id} className="odd:bg-transparent even:bg-surface/60">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">{a.title}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`badge capitalize ${priorityBadge(a.priority)}`}>{a.priority}</span>
              </td>
              <td className="px-4 py-3 text-sm">
                {a.pinned ? (
                  <span className="badge badge-warning">Pinned</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{a.createdBy?.name || '—'}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(a.createdAt)}</td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-1">
                  <button onClick={() => openEdit(a)} className="btn btn-sm btn-outline">Edit</button>
                  <button onClick={() => handleDeactivate(a)} className="btn btn-sm text-danger hover:bg-danger/10">Deactivate</button>
                </div>
              </td>
            </tr>
          ))}
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
            <input id="pinned" type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4 text-brand-400 border-slate-300 rounded focus:ring-brand-500" />
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
    </div>
  );
}