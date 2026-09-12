import { useState, useEffect } from 'react';
import { MapPinIcon, UserCircleIcon, CheckCircleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const initialForm = { name: '', code: '', address: '', phone: '', email: '', manager: '', operatingHours: '' };

export default function Branches() {
  const [branches, setBranches] = useState([]);
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
      const res = await api.get('/branches');
      setBranches(res.data.branches || []);
    } catch (err) {
      setError(err.message || 'Failed to load branches');
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
      ['address', 'phone', 'email', 'manager', 'operatingHours'].forEach((k) => { if (!payload[k]) delete payload[k]; });
      if (editing) {
        await api.put(`/branches/${editing._id}`, payload);
      } else {
        await api.post('/branches', payload);
      }
      setShowModal(false);
      setEditing(null);
      setForm(initialForm);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => { setEditing(null); setForm(initialForm); setShowModal(true); };

  const openEdit = (br) => {
    setEditing(br);
    setForm({
      name: br.name || '',
      code: br.code || '',
      address: br.address || '',
      phone: br.phone || '',
      email: br.email || '',
      manager: br.manager?.email || '',
      operatingHours: br.operatingHours || '',
    });
    setShowModal(true);
  };

  const handleDeactivate = async (br) => {
    if (!window.confirm(`Deactivate branch "${br.name}"?`)) return;
    try {
      await api.delete(`/branches/${br._id}`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to deactivate branch');
    }
  };

  const activeCount = branches.filter((b) => b.isActive).length;
  const managerCount = branches.filter((b) => b.manager).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Branches</h1>
        <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          + New Branch
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={MapPinIcon} label="Total Branches" value={branches.length} color="indigo" />
        <StatCard icon={CheckCircleIcon} label="Active Branches" value={activeCount} color="green" />
        <StatCard icon={UserCircleIcon} label="Managers Assigned" value={managerCount} color="blue" />
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : branches.length === 0 ? (
        <EmptyState icon={MapPinIcon} message="No branches found" />
      ) : (
        <DataTable headers={['Branch', 'Address', 'Phone', 'Hours', 'Manager', 'Status', 'Actions']}>
          {branches.map((br, i) => (
            <tr key={br._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4">
                <span className="font-medium text-slate-900">{br.name}</span>
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">{br.code}</span>
              </td>
              <td className="px-6 py-4 text-slate-600">{br.address || '—'}</td>
              <td className="px-6 py-4 text-slate-600">{br.phone || '—'}</td>
              <td className="px-6 py-4 text-slate-600">{br.operatingHours || '—'}</td>
              <td className="px-6 py-4 text-slate-600">{br.manager?.name || '—'}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${br.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                  {br.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex gap-3">
                  <button onClick={() => openEdit(br)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Edit</button>
                  <button onClick={() => handleDeactivate(br)} className="text-red-600 hover:text-red-800 font-medium text-sm">Deactivate</button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Branch' : 'New Branch'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. BR-001" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Manager email</label>
            <input type="email" value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} placeholder="manager@gym.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Operating Hours</label>
            <input value={form.operatingHours} onChange={(e) => setForm({ ...form, operatingHours: e.target.value })} placeholder="e.g. Mon–Sat: 6am–10pm" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
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