import { useState, useEffect } from 'react';
import { MegaphoneIcon, PinIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const initialForm = { title: '', message: '', priority: 'info', pinned: false, expiresAt: '' };

export default function Announcements() {
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
      alert(err.message || 'Failed to save announcement');
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
    if (!window.confirm(`Deactivate "${a.title}"?`)) return;
    try {
      await api.delete(`/announcements/${a._id}`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to deactivate announcement');
    }
  };

  const priorityColor = (p) => {
    const map = { info: 'bg-sky-100 text-sky-700', warning: 'bg-amber-100 text-amber-700', critical: 'bg-red-100 text-red-700' };
    return map[p?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  const activeCount = announcements.filter((a) => a.isActive !== false).length;
  const pinnedCount = announcements.filter((a) => a.pinned).length;

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Announcements</h1>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + New Announcement
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={MegaphoneIcon} label="Total Announcements" value={total} color="indigo" />
        <StatCard icon={CheckCircleIcon} label="Active" value={activeCount} color="green" />
        <StatCard icon={PinIcon} label="Pinned" value={pinnedCount} color="yellow" />
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : announcements.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} message="No announcements found" />
      ) : (
        <DataTable headers={['Title', 'Priority', 'Pinned', 'Posted by', 'Created', 'Actions']}>
          {announcements.map((a, i) => (
            <tr key={a._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4 font-medium text-slate-900">{a.title}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${priorityColor(a.priority)}`}>{a.priority}</span>
              </td>
              <td className="px-6 py-4">
                {a.pinned ? (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pinned</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-6 py-4 text-slate-600">{a.createdBy?.name || '—'}</td>
              <td className="px-6 py-4 text-slate-600">{fmtDate(a.createdAAt || a.createdAt)}</td>
              <td className="px-6 py-4">
                <div className="flex gap-3">
                  <button onClick={() => openEdit(a)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Edit</button>
                  <button onClick={() => handleDeactivate(a)} className="text-red-600 hover:text-red-800 font-medium text-sm">Deactivate</button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Announcement' : 'New Announcement'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Expires At</label>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <input id="pinned" type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" />
            <label htmlFor="pinned" className="text-sm font-medium text-slate-700">Pinned</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}