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
import { useToast } from '../../context/ToastContext';

const initialForm = {
  name: '', email: '', password: '', phone: '', gender: '',
  phoneNumbers: [], dateOfBirth: '', address: '', heightCm: '', weightKg: '',
  goals: '', activityLevel: '', preferredWorkoutDays: [], preferredWorkoutDuration: '', injuries: '',
  medicalConditions: '', medicalNotes: '', allergies: '', medicalRestrictions: '', doctorRecommendation: '',
};

const join = (arr) => (Array.isArray(arr) ? arr.join(', ') : arr || '');
const split = (val) => (typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : Array.isArray(val) ? val : []);

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

const toForm = (m) => {
  const p = m.profile || {};
  return {
    name: m.name, email: m.email, password: '',
    phone: p.phone || (Array.isArray(p.phoneNumbers) ? p.phoneNumbers[0]?.number || '' : ''),
    phoneNumbers: (Array.isArray(p.phoneNumbers) ? p.phoneNumbers : []).map((n) => ({ number: n.number || '', label: n.label || 'Primary' })),
    gender: p.gender || m.gender || '',
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
    address: p.address || '',
    heightCm: p.heightCm ?? '',
    weightKg: p.weightKg ?? '',
    goals: join(p.goals),
    activityLevel: p.activityLevel || '',
    preferredWorkoutDays: Array.isArray(p.preferredWorkoutDays) ? p.preferredWorkoutDays : [],
    preferredWorkoutDuration: p.preferredWorkoutDuration ?? '',
    injuries: p.injuries || '',
    medicalConditions: p.medicalConditions || '',
    medicalNotes: p.medicalNotes || '',
    allergies: join(p.allergies),
    medicalRestrictions: p.medicalRestrictions || '',
    doctorRecommendation: p.doctorRecommendation || '',
  };
};

export default function Members() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
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
  const openEdit = (m) => { setEditing(m); setForm(toForm(m)); setShowModal(true); };

  const addPhoneRow = () => {
    const rows = [...form.phoneNumbers];
    rows.push({ number: '', label: 'Secondary' });
    setForm({ ...form, phoneNumbers: rows });
  };

  const setPhoneRow = (index, patch) => {
    const rows = [...form.phoneNumbers];
    rows[index] = { ...rows[index], ...patch };
    setForm({ ...form, phoneNumbers: rows });
  };

  const removePhoneRow = (index) => {
    const rows = form.phoneNumbers.filter((_, i) => i !== index);
    setForm({ ...form, phoneNumbers: rows });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const phones = [...form.phoneNumbers];
      if (form.phone && !phones.some((p) => p.number === form.phone)) {
        phones.unshift({ number: form.phone, label: 'Primary' });
      }
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        phoneNumbers: phones.length > 0 ? phones.map((p) => ({ number: p.number, label: p.label })) : undefined,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth || undefined,
        address: form.address,
        heightCm: form.heightCm === '' ? undefined : Number(form.heightCm),
        weightKg: form.weightKg === '' ? undefined : Number(form.weightKg),
        goals: split(form.goals),
        activityLevel: form.activityLevel || undefined,
        preferredWorkoutDays: form.preferredWorkoutDays,
        preferredWorkoutDuration: form.preferredWorkoutDuration === '' ? undefined : Number(form.preferredWorkoutDuration),
        injuries: form.injuries,
        medicalConditions: form.medicalConditions,
        medicalNotes: form.medicalNotes,
        allergies: split(form.allergies),
        medicalRestrictions: form.medicalRestrictions,
        doctorRecommendation: form.doctorRecommendation,
      };
      for (const key of Object.keys(payload)) {
        if (payload[key] === undefined) delete payload[key];
      }
      if (editing) {
        if (!form.password) delete payload.password;
        await api.put(`/members/${editing._id}`, payload);
      } else {
        payload.password = form.password;
        await api.post('/members', payload);
      }
      setShowModal(false);
      fetchMembers();
    } catch (err) {
      toast.error('Operation failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleDeactivate = async (m) => {
    if (m.isActive) {
      const proceed = await toast.confirm({ title: 'Deactivate member', description: 'They will not be able to log in until reactivated.', confirmLabel: 'Deactivate', danger: true });
      if (!proceed) return;
    }
    try {
      await api.put(`/users/${m._id}/${m.isActive ? 'deactivate' : 'activate'}`);
      fetchMembers();
    } catch (err) {
      toast.error('Failed', err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Members</h1>
        <button onClick={openAdd} className="btn btn-md btn-primary">
          + Add Member
        </button>
      </div>

      <input
        type="text"
        placeholder="Search members..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="w-full md:w-96 px-4 py-2 input"
      />

      {error ? (
        <div className="bg-surface-elevated border border-border rounded-xl">
          <ErrorState message={error} onRetry={() => fetchMembers()} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : members.length === 0 ? (
        <EmptyState icon={UserIcon} message="No members found" />
      ) : (
        <>
          <DataTable headers={['Name', 'Email', 'Membership', 'Status', 'Trainer', 'Phone', 'Actions']}>
            {members.map((m, i) => (
              <tr key={m._id} className={i % 2 === 0 ? 'bg-transparent' : 'bg-slate-100/40'}>
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
                        m.membership.status === 'ACTIVE' ? 'bg-success/10 text-success' :
                        m.membership.status === 'EXPIRED' ? 'bg-warning/10 text-warning' :
                        m.membership.status === 'CANCELLED' ? 'bg-danger/10 text-danger' :
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
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium w-fit bg-danger/10 text-danger">
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
                    <button onClick={() => openEdit(m)} className="text-brand-400 hover:text-brand-300 font-medium text-sm">Edit</button>
                    <button onClick={() => toggleDeactivate(m)} className={`font-medium text-sm ${m.isActive ? 'text-danger hover:text-danger' : 'text-success hover:text-success'}`}>
                      {m.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>

          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg border border-border text-sm font-medium bg-surface text-slate-400 disabled:opacity-50 hover:bg-surface-hover">
              Previous
            </button>
            <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded-lg border border-border text-sm font-medium bg-surface text-slate-400 disabled:opacity-50 hover:bg-surface-hover">
              Next
            </button>
          </div>
        </>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Member' : 'Add Member'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 input" />
          </div>
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input required={!editing} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 input" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Primary Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 input" />
          </div>
          {form.phoneNumbers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Additional Contacts</label>
              <div className="space-y-2">
                {form.phoneNumbers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={p.number}
                      onChange={(e) => setPhoneRow(i, { number: e.target.value })}
                      placeholder="Phone number"
                      className="flex-1 px-3 py-2 input"
                    />
                    <select
                      value={p.label}
                      onChange={(e) => setPhoneRow(i, { label: e.target.value })}
                      className="px-3 py-2 input"
                    >
                      {['Primary', 'Secondary', 'Emergency', 'Work', 'Home', 'Other'].map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removePhoneRow(i)} className="text-danger hover:text-danger text-lg leading-none">&times;</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addPhoneRow} className="mt-1 text-sm text-brand-400 hover:text-brand-300 font-medium">+ Add another number</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-3 py-2 input">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
              <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="w-full px-3 py-2 input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Height (cm)</label>
              <input type="number" min="40" max="300" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} className="w-full px-3 py-2 input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
              <input type="number" min="2" max="500" step="0.1" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className="w-full px-3 py-2 input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Goals (comma-separated)</label>
            <input value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} placeholder="e.g. Fat loss, Strength" className="w-full px-3 py-2 input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Activity Level</label>
            <select value={form.activityLevel} onChange={(e) => setForm({ ...form, activityLevel: e.target.value })} className="w-full px-3 py-2 input">
              <option value="">Select</option>
              {ACTIVITY_LEVELS.map((l) => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Workout Days</label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setForm({
                    ...form,
                    preferredWorkoutDays: form.preferredWorkoutDays.includes(d)
                      ? form.preferredWorkoutDays.filter((x) => x !== d)
                      : [...form.preferredWorkoutDays, d],
                  })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.preferredWorkoutDays.includes(d)
                      ? 'bg-brand-500 text-ink-950 border-brand-500'
                      : 'bg-surface text-slate-400 border-border hover:bg-surface-hover'
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Workout Duration (minutes)</label>
            <input type="number" min="15" max="300" value={form.preferredWorkoutDuration} onChange={(e) => setForm({ ...form, preferredWorkoutDuration: e.target.value })} className="w-full px-3 py-2 input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Injuries</label>
            <input value={form.injuries} onChange={(e) => setForm({ ...form, injuries: e.target.value })} placeholder="e.g. Knee strain" className="w-full px-3 py-2 input" />
          </div>
          <div className="rounded-lg bg-danger/10 border border-danger/25 px-3 py-2">
            <p className="text-xs font-semibold text-danger mb-2">Health & Safety (informational)</p>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Medical Conditions</label>
                <input value={form.medicalConditions} onChange={(e) => setForm({ ...form, medicalConditions: e.target.value })} className="w-full px-3 py-2 input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Allergies (comma-separated)</label>
                <input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="w-full px-3 py-2 input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Medical Restrictions</label>
                <input value={form.medicalRestrictions} onChange={(e) => setForm({ ...form, medicalRestrictions: e.target.value })} className="w-full px-3 py-2 input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Medical Notes</label>
                <textarea value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} rows={2} className="w-full px-3 py-2 input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Doctor Recommendation</label>
                <textarea value={form.doctorRecommendation} onChange={(e) => setForm({ ...form, doctorRecommendation: e.target.value })} rows={2} className="w-full px-3 py-2 input" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-md btn-primary w-full disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
// writetest $(Get-Date -Format o)
