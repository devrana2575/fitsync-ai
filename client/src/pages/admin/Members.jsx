import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import useDebounce from '../../hooks/useDebounce';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';

const initialForm = { name: '', email: '', password: '', phone: '', gender: '' };

export default function Members() {
  const navigate = useNavigate();
  const location = useLocation();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const fetchMembers = async (cancelled = () => false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/members', { params: { search: debouncedSearch, page, limit: 10 } });
      if (!cancelled()) {
        setMembers(res.data.data || res.data.members || []);
        setTotalPages(res.data.pages || 1);
      }
    } catch (err) {
      if (!cancelled()) setError(err.message || 'Failed to load members');
    } finally {
      if (!cancelled()) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchMembers(() => cancelled);
    return () => { cancelled = true; };
  }, [page, debouncedSearch]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchMembers(() => false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

  const openAdd = () => { setEditing(null); setForm(initialForm); setShowModal(true); };

  useEffect(() => {
    if (location.state?.openCreate) {
      openAdd();
      navigate('.', { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openEdit = (m) => { setEditing(m); setForm({ name: m.name, email: m.email, password: '', phone: m.profile?.phone || m.phone || '', gender: m.profile?.gender || m.gender || '' }); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.put(`/members/${editing._id}`, payload);
      } else {
        await api.post('/members', form);
      }
      setShowModal(false);
      fetchMembers();
    } catch (err) {
      alert(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleDeactivate = async (m) => {
    if (m.isActive) {
      const proceed = confirm(`Deactivate ${m.name}? They will not be able to log in until reactivated.`);
      if (!proceed) return;
    }
    try {
      await api.put(`/users/${m._id}/${m.isActive ? 'deactivate' : 'activate'}`);
      fetchMembers();
    } catch (err) {
      alert(err.message || 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Members</h1>
        <button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Add Member
        </button>
      </div>

      <input
        type="text"
        placeholder="Search members..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full md:w-96 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
      />

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={() => fetchMembers()} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : members.length === 0 ? (
        <EmptyState icon={UserIcon} message="No members found" />
      ) : (
        <>
          <DataTable headers={['Name', 'Email', 'Membership', 'Status', 'Trainer', 'Phone', 'Actions']}>
            {members.map((m, i) => (
              <tr key={m._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-6 py-4 font-medium text-slate-900">{m.name}</td>
                <td className="px-6 py-4 text-slate-600">{m.email}</td>
                <td className="px-6 py-4">
                  {m.membership ? (
                    <div>
                      <p className="text-sm font-medium text-slate-900">{m.membership.plan?.name || 'Membership'}</p>
                      <p className="text-xs text-slate-500">Until {m.membership.endDate ? new Date(m.membership.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</p>
                    </div>
                  ) : (
                    <span className="text-slate-400">No active plan</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    {m.membership ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
                        m.membership.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                        m.membership.status === 'EXPIRED' ? 'bg-amber-100 text-amber-700' :
                        m.membership.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {m.membership.status.charAt(0)}{m.membership.status.slice(1).toLowerCase()}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium w-fit bg-slate-100 text-slate-500">
                        No Plan
                      </span>
                    )}
                    {!m.isActive && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium w-fit bg-red-100 text-red-700">
                        Deactivated
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-600">{m.profile?.assignedTrainer?.name || '—'}</td>
                <td className="px-6 py-4 text-slate-600">{m.profile?.phone || m.phone || '—'}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-3">
                    <button onClick={() => navigate(`/admin/members/${m._id}`)} className="text-slate-600 hover:text-slate-900 font-medium text-sm">View</button>
                    <button onClick={() => openEdit(m)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Edit</button>
                    <button onClick={() => toggleDeactivate(m)} className={`font-medium text-sm ${m.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                      {m.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>

          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium disabled:opacity-50 hover:bg-slate-50">
              Previous
            </button>
            <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium disabled:opacity-50 hover:bg-slate-50">
              Next
            </button>
          </div>
        </>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Member' : 'Add Member'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input required={!editing} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
