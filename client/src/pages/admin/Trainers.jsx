import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserGroupIcon, PlusIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { SkeletonRow } from '../../components/common/Skeleton';
import { useToast } from '../../context/ToastContext';

const initialForm = { name: '', email: '', password: '', specializations: '', experience: '', maxMembers: '' };

export default function Trainers() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [membersModal, setMembersModal] = useState({ open: false, trainer: null, members: [], loading: false, error: null });

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
      maxMembers: t.profile?.maxMembers ?? '',
    });
    setShowModal(true);
  };

  const openMembers = async (t) => {
    setMembersModal({ open: true, trainer: t, members: [], loading: true, error: null });
    try {
      const res = await api.get(`/trainers/${t._id}`);
      setMembersModal({ open: true, trainer: t, members: res.data.members || [], loading: false, error: null });
    } catch (err) {
      setMembersModal({ open: true, trainer: t, members: [], loading: false, error: err.message || 'Failed to load assigned members' });
    }
  };

  const closeMembers = () => setMembersModal((prev) => ({ ...prev, open: false }));

  const toggleAvailability = async (t) => {
    const available = t.profile?.isAvailable !== false;
    const reason = available
      ? await toast.prompt({ title: 'Mark unavailable', description: 'Enter a reason for the absence:', inputLabel: 'Reason', placeholder: 'e.g. On leave until next Friday', confirmLabel: 'Mark unavailable' })
      : null;
    if (available && !reason) return;
    try {
      await api.put(`/trainers/${t._id}/availability`, {
        isAvailable: !available,
        reason: reason || undefined,
      });
      fetchTrainers();
    } catch (err) {
      toast.error('Failed to update availability', err.message);
    }
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
      if (payload.maxMembers !== '') payload.maxMembers = Number(payload.maxMembers);
      else delete payload.maxMembers;
      if (editing && !payload.password) delete payload.password;
      if (editing) {
        await api.put(`/trainers/${editing._id}`, payload);
      } else {
        await api.post('/trainers', payload);
      }
      setShowModal(false);
      fetchTrainers();
    } catch (err) {
      toast.error('Operation failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleDeactivate = async (t) => {
    if (t.isActive !== false) {
      const proceed = await toast.confirm({ title: 'Deactivate trainer', description: 'They will not be able to log in until reactivated.', confirmLabel: 'Deactivate', danger: true });
      if (!proceed) return;
    }
    try {
      await api.put(`/users/${t._id}/${t.isActive !== false ? 'deactivate' : 'activate'}`);
      fetchTrainers();
    } catch (err) {
      toast.error('Failed', err.message);
    }
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Trainers"
        subtitle="Manage your coaching staff and their availability"
        icon={UserGroupIcon}
        actions={
          <button onClick={openAdd} className="btn btn-md btn-primary">
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add Trainer
          </button>
        }
      />

      {error ? (
        <div className="card p-5">
          <ErrorState message={error} onRetry={fetchTrainers} />
        </div>
      ) : loading ? <SkeletonRow rows={5} /> : trainers.length === 0 ? (
        <EmptyState icon={UserGroupIcon} message="No trainers found" />
      ) : (
        <DataTable headers={['Name', 'Email', 'Specializations', 'Experience', 'Members Assigned', 'Availability', 'Status', 'Actions']}>
          {trainers.map((t, i) => (
            <tr key={t._id} className={i % 2 === 0 ? 'bg-transparent' : 'bg-surface/60'}>
              <td className="px-6 py-4">
                <button
                  type="button"
                  onClick={() => openMembers(t)}
                  title={`View members assigned to ${t.name}`}
                  className="group flex items-center gap-3 text-left"
                >
                  <Avatar name={t.name} src={t.avatar} size="sm" />
                  <span className="font-medium text-slate-900 group-hover:text-brand-700 group-hover:underline">{t.name}</span>
                </button>
              </td>
              <td className="px-6 py-4 text-slate-600">{t.email}</td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(t.profile?.specializations) ? t.profile.specializations : [t.profile?.specializations]).filter(Boolean).map((s, j) => (
                    <span key={j} className="badge badge-brand">{s}</span>
                  ))}
                </div>
              </td>
              <td className="px-6 py-4 text-slate-600">{t.profile?.experience ? `${t.profile.experience} yrs` : '—'}</td>
              <td className="px-6 py-4">
                <button
                  type="button"
                  onClick={() => openMembers(t)}
                  className="font-medium text-sm text-brand-600 hover:text-brand-700"
                  title={`View members assigned to ${t.name}`}
                >
                  {t.memberCount ?? t.assignedMembers?.length ?? 0}
                  <span className="text-xs text-slate-500"> / {t.profile?.maxMembers ?? '—'}</span>
                </button>
              </td>
              <td className="px-6 py-4">
                <StatusBadge value={t.profile?.isAvailable !== false} tone={t.profile?.isAvailable !== false ? 'success' : 'warning'} label={t.profile?.isAvailable !== false ? 'Available' : 'Away'} />
                {t.profile?.isAvailable === false && t.profile?.absenceReason && (
                  <p className="text-xs text-slate-500 mt-1 max-w-[180px] truncate" title={t.profile.absenceReason}>{t.profile.absenceReason}</p>
                )}
              </td>
              <td className="px-6 py-4">
                <StatusBadge value={t.isActive !== false} tone={t.isActive !== false ? 'success' : 'danger'} label={t.isActive !== false ? 'Active' : 'Inactive'} />
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => openMembers(t)} className="btn btn-sm btn-outline">Members</button>
                  <button onClick={() => openEdit(t)} className="btn btn-sm btn-outline">Edit</button>
                  <button onClick={() => toggleAvailability(t)} className={`btn btn-sm btn-ghost ${t.profile?.isAvailable !== false ? 'text-warning hover:text-warning hover:bg-warning/10' : 'text-success hover:text-success hover:bg-success/10'}`}>
                    {t.profile?.isAvailable !== false ? 'Mark Unavailable' : 'Back Available'}
                  </button>
                  <button onClick={() => toggleDeactivate(t)} className={t.isActive !== false ? 'btn btn-sm btn-ghost text-slate-500 hover:text-danger hover:bg-danger/10' : 'btn btn-sm btn-ghost text-success hover:text-success hover:bg-success/10'}>
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
            <label className="label">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          {!editing && (
            <div>
              <label className="label">Password</label>
              <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" />
            </div>
          )}
          <div>
            <label className="label">Specializations (comma-separated)</label>
            <input value={form.specializations} onChange={(e) => setForm({ ...form, specializations: e.target.value })} placeholder="e.g. Strength, Cardio, Yoga" className="input" />
          </div>
          <div>
            <label className="label">Experience (years)</label>
            <input required type="number" min="0" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Max Members</label>
            <input type="number" min="0" value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: e.target.value })} className="input" />
            <p className="text-xs text-slate-500 mt-1">Caps how many members can be assigned to this trainer.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline btn-md">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-md btn-primary">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={membersModal.open}
        onClose={closeMembers}
        title={membersModal.trainer ? `Members assigned to ${membersModal.trainer.name}` : 'Assigned members'}
      >
        {membersModal.loading ? (
          <div className="py-10"><LoadingSpinner size="lg" /></div>
        ) : membersModal.error ? (
          <ErrorState message={membersModal.error} onRetry={() => membersModal.trainer && openMembers(membersModal.trainer)} />
        ) : membersModal.members.length === 0 ? (
          <EmptyState
            icon={UserGroupIcon}
            message="No members assigned"
            description="Assign members to this trainer from the Members section."
          />
        ) : (
          <ul className="divide-y divide-border">
            {membersModal.members.map((m) => {
              const memberUser = m.user || {};
              const active = memberUser.isActive !== false;
              return (
                <li key={m._id}>
                  <button
                    type="button"
                    onClick={() => memberUser._id && navigate(`/admin/members/${memberUser._id}`)}
                    className="w-full flex items-center justify-between gap-3 py-3 px-2 text-left rounded-lg hover:bg-surface transition-colors"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Avatar name={memberUser.name || 'Member'} src={memberUser.avatar} size="sm" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900 truncate">
                          {memberUser.name || 'Unknown member'}
                        </span>
                        <span className="block text-xs text-slate-500 truncate">{memberUser.email || '—'}</span>
                      </span>
                    </span>
                    <StatusBadge
                      value={active}
                      tone={active ? 'success' : 'danger'}
                      label={active ? 'Active' : 'Inactive'}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </div>
  );
}