import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';

const initialForm = { name: '', email: '', password: '', specializations: '', experience: '' };

export default function Trainers() {
  const location = useLocation();
  const navigate = useNavigate();
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const fetchTrainers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/trainers');
      setTrainers(res.data.data || res.data.trainers || []);
    } catch (err) {
      setError(err.message || 'Failed to load trainers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrainers(); }, []);

  const openAdd = () => { setEditing(null); setForm(initialForm); setShowModal(true); };

  useEffect(() => {
    if (location.state?.openCreate) {
      openAdd();
      navigate('.', { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name, email: t.email, password: '',
      specializations: Array.isArray(t.profile?.specializations) ? t.profile.specializations.join(', ') : (t.profile?.specializations || ''),
      experience: t.profile?.experience || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        specializations: form.specializations.split(',').map(s => s.trim()).filter(Boolean),
        experience: Number(form.experience),
      };
      if (editing && !payload.password) delete payload.password;
      if (editing) {
        await api.put(`/trainers/${editing._id}`, payload);
      } else {
        await api.post('/trainers', payload);
      }
      setShowModal(false);
      fetchTrainers();
    } catch (err) {
      alert(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleDeactivate = async (t) => {
    if (t.isActive !== false) {
      const proceed = confirm(`Deactivate ${t.name}? They will not be able to log in until reactivated.`);
      if (!proceed) return;
    }
    try {
      await api.put(`/users/${t._id}/${t.isActive !== false ? 'deactivate' : 'activate'}`);
      fetchTrainers();
    } catch (err) {
      alert(err.message || 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Trainers</h1>
        <button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + Add Trainer
        </button>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchTrainers} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : trainers.length === 0 ? (
        <EmptyState icon={UserGroupIcon} message="No trainers found" />
      ) : (
        <DataTable headers={['Name', 'Email', 'Specializations', 'Experience', 'Members Assigned', 'Status', 'Actions']}>
          {trainers.map((t, i) => (
            <tr key={t._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4 font-medium text-slate-900">{t.name}</td>
              <td className="px-6 py-4 text-slate-600">{t.email}</td>
              <td className="px-6 py-4 text-slate-600">
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(t.profile?.specializations) ? t.profile.specializations : [t.profile?.specializations]).filter(Boolean).map((s, j) => (
                    <span key={j} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-medium">{s}</span>
                  ))}
                </div>
              </td>
              <td className="px-6 py-4 text-slate-600">{t.profile?.experience ? `${t.profile.experience} yrs` : '—'}</td>
              <td className="px-6 py-4 text-slate-600">{t.memberCount ?? t.assignedMembers?.length ?? '—'}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {t.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <button onClick={() => openEdit(t)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Edit</button>
                  <button onClick={() => toggleDeactivate(t)} className={`font-medium text-sm ${t.isActive !== false ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                    {t.isActive !== false ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Trainer' : 'Add Trainer'}>
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
              <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Specializations (comma-separated)</label>
            <input value={form.specializations} onChange={(e) => setForm({ ...form, specializations: e.target.value })} placeholder="e.g. Strength, Cardio, Yoga" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Experience (years)</label>
            <input required type="number" min="0" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
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
