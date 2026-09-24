import { useState, useEffect } from 'react';
import {
  UserCircleIcon,
  CameraIcon,
  TrashIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import Skeleton, { SkeletonCard } from '../../components/common/Skeleton';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import ProfileCompletionCard from '../../components/common/ProfileCompletionCard';
import { fmtDate } from '../../utils/format';

const CONTACT_LABELS = ['Primary', 'Secondary', 'Emergency', 'Work', 'Home', 'Other'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];

const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other' };
const ACTIVITY_LABELS = {
  sedentary: 'Sedentary (mostly sitting)',
  light: 'Lightly active (1–3 sessions/week)',
  moderate: 'Moderately active (3–5 sessions/week)',
  active: 'Active (5–7 sessions/week)',
  very_active: 'Very active (athlete / daily hard training)',
};

const join = (arr) => (Array.isArray(arr) ? arr.join(', ') : arr || '');
const split = (val) => (typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : Array.isArray(val) ? val : []);

const toDate = (value) => (value ? String(value).slice(0, 10) : '');

const toForm = (user, profile) => ({
  name: user?.name || '',
  dateOfBirth: toDate(profile?.dateOfBirth),
  gender: profile?.gender || '',
  phoneNumbers: (Array.isArray(profile?.phoneNumbers) ? profile.phoneNumbers : [])
    .map((n) => ({ number: n.number || '', label: n.label || 'Primary' })),
  address: profile?.address || '',
  emergencyName: profile?.emergencyContact?.name || '',
  emergencyPhone: profile?.emergencyContact?.phone || '',
  emergencyRelationship: profile?.emergencyContact?.relationship || '',
  heightCm: profile?.heightCm ?? '',
  weightKg: profile?.weightKg ?? '',
  goals: join(profile?.goals),
  activityLevel: profile?.activityLevel || '',
  preferredWorkoutDays: Array.isArray(profile?.preferredWorkoutDays) ? profile.preferredWorkoutDays : [],
  preferredWorkoutDuration: profile?.preferredWorkoutDuration ?? '',
  injuries: profile?.injuries || '',
  medicalConditions: profile?.medicalConditions || '',
  medicalNotes: profile?.medicalNotes || '',
  allergies: join(profile?.allergies),
  medicalRestrictions: profile?.medicalRestrictions || '',
});

export default function Profile() {
  const { toast } = useToast();
  const [me, setMe] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(toForm(null, null));
  const [doctorRecommendation, setDoctorRecommendation] = useState('');
  const [trainerRecommendation, setTrainerRecommendation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwErr, setPwErr] = useState(null);

  const [photoBusy, setPhotoBusy] = useState(false);

  const fetchMe = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/auth/me');
      const { user, profile: memberProfile, completion: profileCompletion } = res.data;
      setMe(user);
      setProfile(toForm(user, memberProfile));
      setCompletion(profileCompletion);
      setDoctorRecommendation(memberProfile?.doctorRecommendation || '');
      setTrainerRecommendation(memberProfile?.trainerRecommendation || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMe(); }, []);

  const setPhoneRow = (index, patch) => {
    const rows = [...profile.phoneNumbers];
    rows[index] = { ...rows[index], ...patch };
    setProfile({ ...profile, phoneNumbers: rows });
  };

  const addPhoneRow = () => {
    setProfile({ ...profile, phoneNumbers: [...profile.phoneNumbers, { number: '', label: 'Secondary' }] });
  };

  const removePhoneRow = (index) => {
    setProfile({ ...profile, phoneNumbers: profile.phoneNumbers.filter((_, i) => i !== index) });
  };

  const toggleDay = (day) => {
    const days = profile.preferredWorkoutDays.includes(day)
      ? profile.preferredWorkoutDays.filter((d) => d !== day)
      : [...profile.preferredWorkoutDays, day];
    setProfile({ ...profile, preferredWorkoutDays: days });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const phones = profile.phoneNumbers.map((p) => ({ number: p.number.trim(), label: p.label })).filter((p) => p.number);
    if (phones.length === 0) {
      toast.warning('Phone number required', 'At least one phone number is required');
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await api.put('/auth/me', {
        name: profile.name,
        dateOfBirth: profile.dateOfBirth || undefined,
        gender: profile.gender || undefined,
        phoneNumbers: phones,
        address: profile.address,
        emergencyContact: {
          name: profile.emergencyName,
          phone: profile.emergencyPhone,
          relationship: profile.emergencyRelationship,
        },
        heightCm: profile.heightCm === '' ? undefined : Number(profile.heightCm),
        weightKg: profile.weightKg === '' ? undefined : Number(profile.weightKg),
        goals: split(profile.goals),
        activityLevel: profile.activityLevel || undefined,
        preferredWorkoutDays: profile.preferredWorkoutDays,
        preferredWorkoutDuration: profile.preferredWorkoutDuration === '' ? undefined : Number(profile.preferredWorkoutDuration),
        injuries: profile.injuries,
        medicalConditions: profile.medicalConditions,
        medicalNotes: profile.medicalNotes,
        allergies: split(profile.allergies),
        medicalRestrictions: profile.medicalRestrictions,
      });
      setMe((prev) => ({ ...prev, name: res.data.user?.name || prev.name }));
      setCompletion(res.data.completion || completion);
      setSavedAt(new Date());
      setSaveMsg('Profile updated successfully');
      toast.success('Profile updated', 'Your changes have been saved.');
    } catch (err) {
      setSaveMsg(null);
      toast.error('Update failed', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await api.post('/auth/me/avatar', form);
      setMe((prev) => ({ ...prev, avatar: res.data.user?.avatar }));
      toast.success('Photo uploaded', 'Your photo has been updated.');
    } catch (err) {
      toast.error('Upload failed', err.message || 'Failed to upload photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = async () => {
    setPhotoBusy(true);
    try {
      await api.delete('/auth/me/avatar');
      setMe((prev) => ({ ...prev, avatar: '' }));
      toast.success('Photo removed', 'Your photo has been removed.');
    } catch (err) {
      toast.error('Remove failed', err.message || 'Failed to remove photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwErr('New passwords do not match');
      return;
    }
    setPwSaving(true);
    try {
      const res = await api.put('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      const msg = res.data.message || 'Password updated successfully';
      setPwMsg(msg);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwErr(err.message || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <div className="space-y-2">
          <Skeleton width="w-56" height="h-8" />
          <Skeleton width="w-72" height="h-4" />
        </div>
        <SkeletonCard />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="space-y-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="My Profile" subtitle="Your account details and health &amp; fitness profile" icon={UserCircleIcon} />
        <ErrorState message={error} onRetry={fetchMe} />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader title="My Profile" subtitle="Your account details and health &amp; fitness profile" icon={UserCircleIcon} />

      <ProfileCompletionCard completion={completion} member />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="card p-6">
              <h2 className="section-title mb-4">Personal Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Full Name</label>
                  <input
                    required
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Date of Birth</label>
                  <input
                    type="date"
                    value={profile.dateOfBirth}
                    onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })}
                    max={new Date().toISOString().slice(0, 10)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Gender</label>
                  <select
                    value={profile.gender}
                    onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                    className="input"
                  >
                    <option value="">Select gender</option>
                    {Object.entries(GENDER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="section-title mb-4">Contact Information</h2>
              <div>
                <label className="label">Phone Numbers</label>
                <div className="space-y-2">
                  {profile.phoneNumbers.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={p.number}
                        onChange={(e) => setPhoneRow(i, { number: e.target.value })}
                        placeholder="Phone number"
                        className="input flex-1"
                      />
                      <select
                        value={p.label}
                        onChange={(e) => setPhoneRow(i, { label: e.target.value })}
                        className="input w-auto"
                      >
                        {CONTACT_LABELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                      {profile.phoneNumbers.length > 1 && (
                        <button type="button" onClick={() => removePhoneRow(i)} className="btn btn-sm btn-ghost text-danger hover:text-danger" aria-label="Remove phone number">
                          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addPhoneRow} className="btn btn-sm btn-outline text-brand-300 border-brand-200 hover:bg-brand-50 mt-1">
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                  Add another number
                </button>
                <p className="field-hint mt-2">The Primary number is the main contact for gym notifications and messaging.</p>
              </div>
              <div className="mt-4">
                <label className="label">Address</label>
                <input
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="input"
                />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Emergency Contact Name</label>
                  <input
                    value={profile.emergencyName}
                    onChange={(e) => setProfile({ ...profile, emergencyName: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Emergency Contact Phone</label>
                  <input
                    value={profile.emergencyPhone}
                    onChange={(e) => setProfile({ ...profile, emergencyPhone: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="label">Emergency Contact Relationship</label>
                <input
                  value={profile.emergencyRelationship}
                  onChange={(e) => setProfile({ ...profile, emergencyRelationship: e.target.value })}
                  placeholder="e.g. Spouse, Parent"
                  className="input"
                />
              </div>
            </div>

            <div className="card p-6">
              <h2 className="section-title mb-4">Body &amp; Fitness</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Height (cm)</label>
                  <input
                    type="number"
                    min="40"
                    max="300"
                    value={profile.heightCm}
                    onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Weight (kg)</label>
                  <input
                    type="number"
                    min="2"
                    max="500"
                    step="0.1"
                    value={profile.weightKg}
                    onChange={(e) => setProfile({ ...profile, weightKg: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="label">Activity Level</label>
                <select
                  value={profile.activityLevel}
                  onChange={(e) => setProfile({ ...profile, activityLevel: e.target.value })}
                  className="input"
                >
                  <option value="">Select activity level</option>
                  {ACTIVITY_LEVELS.map((l) => (
                    <option key={l} value={l}>{ACTIVITY_LABELS[l]}</option>
                  ))}
                </select>
              </div>
              <div className="mt-4">
                <label className="label">Preferred Workout Days</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`btn btn-sm ${profile.preferredWorkoutDays.includes(d) ? 'btn-primary' : 'btn-outline'}`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <label className="label">Preferred Workout Duration (minutes)</label>
                <input
                  type="number"
                  min="15"
                  max="300"
                  value={profile.preferredWorkoutDuration}
                  onChange={(e) => setProfile({ ...profile, preferredWorkoutDuration: e.target.value })}
                  className="input"
                />
              </div>
              <div className="mt-4">
                <label className="label">Goals (comma-separated)</label>
                <input
                  value={profile.goals}
                  onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
                  placeholder="e.g. Fat loss, Strength, Endurance"
                  className="input"
                />
              </div>
              <div className="mt-4">
                <label className="label">Current Injuries (comma-separated)</label>
                <input
                  value={profile.injuries}
                  onChange={(e) => setProfile({ ...profile, injuries: e.target.value })}
                  placeholder="e.g. Knee strain, Shoulder impingement"
                  className="input"
                />
                <p className="field-hint mt-1">Helps your trainer adapt exercises. This is not a substitute for medical advice.</p>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="section-title mb-4">Health &amp; Safety</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Medical Conditions</label>
                  <input
                    value={profile.medicalConditions}
                    onChange={(e) => setProfile({ ...profile, medicalConditions: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Allergies (comma-separated)</label>
                  <input
                    value={profile.allergies}
                    onChange={(e) => setProfile({ ...profile, allergies: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Medical Restrictions</label>
                  <input
                    value={profile.medicalRestrictions}
                    onChange={(e) => setProfile({ ...profile, medicalRestrictions: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Medical Notes</label>
                  <textarea
                    value={profile.medicalNotes}
                    onChange={(e) => setProfile({ ...profile, medicalNotes: e.target.value })}
                    rows={2}
                    className="input"
                  />
                </div>
              </div>
            </div>

            {(doctorRecommendation || trainerRecommendation) && (
              <div className="card p-6">
                <h2 className="section-title mb-4">Recommendations on file</h2>
                {doctorRecommendation && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-brand-400">Doctor&apos;s recommendation</p>
                    <p className="text-sm text-slate-700">{doctorRecommendation}</p>
                  </div>
                )}
                {trainerRecommendation && (
                  <div>
                    <p className="text-xs font-medium text-brand-400">Trainer&apos;s recommendation</p>
                    <p className="text-sm text-slate-700">{trainerRecommendation}</p>
                  </div>
                )}
              </div>
            )}

            <div className="card p-6 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                {saveMsg && <p className="text-success font-medium">{saveMsg}</p>}
                {savedAt && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Saved {savedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <button type="submit" disabled={saving} className="btn btn-md btn-primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          <div className="card p-6">
            <h2 className="section-title mb-4">Change Password</h2>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="label">Current Password</label>
                <input
                  required
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">New Password</label>
                <input
                  required
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  className="input"
                />
                <p className="field-hint mt-1">At least 8 characters, with letters and numbers.</p>
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input
                  required
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                  className="input"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="text-sm">
                  {pwMsg && <p className="text-success font-medium">{pwMsg}</p>}
                  {pwErr && <p className="text-danger font-medium">{pwErr}</p>}
                </div>
                <button type="submit" disabled={pwSaving} className="btn btn-md btn-outline">
                  {pwSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <Avatar name={me?.name} src={me?.avatar} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{me?.name}</p>
                <p className="text-sm text-slate-500 truncate">{me?.email}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <label className="btn btn-sm btn-outline w-full">
                <CameraIcon className="h-4 w-4" aria-hidden="true" />
                {photoBusy ? 'Uploading...' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={photoBusy}
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    e.target.value = '';
                    handlePhoto(file);
                  }}
                />
              </label>
              {me?.avatar && (
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  disabled={photoBusy}
                  className="btn btn-sm btn-ghost text-danger hover:text-danger w-full"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="section-title mb-4">Account</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium text-slate-900 capitalize">{me?.role}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Member since</dt>
                <dd className="font-medium text-slate-900">{fmtDate(me?.createdAt)}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusBadge
                    value={me?.isActive === false ? 'inactive' : 'active'}
                    label={me?.isActive === false ? 'Inactive' : 'Active'}
                    tone={me?.isActive === false ? 'muted' : 'success'}
                  />
                </dd>
              </div>
            </dl>
          </div>

          {Array.isArray(completion?.requiredSections) && completion.requiredSections.length > 0 && (
            <div className="card p-6">
              <h2 className="section-title mb-4">Profile Sections</h2>
              <ul className="space-y-2.5">
                {completion.requiredSections.map((s) => (
                  <li key={s.key || s.label} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700">{s.label}</span>
                    <StatusBadge
                      value={s.complete ? 'complete' : 'missing'}
                      label={s.complete ? 'Complete' : 'Missing'}
                      tone={s.complete ? 'success' : 'warning'}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}