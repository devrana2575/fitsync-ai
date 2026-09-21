import { useState, useEffect } from 'react';
import { IdentificationIcon, CameraIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
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
      alert('At least one phone number is required');
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
    } catch (err) {
      setSaveMsg(null);
      alert(err.message || 'Failed to update profile');
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
    } catch (err) {
      alert(err.message || 'Failed to upload photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = async () => {
    setPhotoBusy(true);
    try {
      await api.delete('/auth/me/avatar');
      setMe((prev) => ({ ...prev, avatar: '' }));
    } catch (err) {
      alert(err.message || 'Failed to remove photo');
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

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  const inputCls = (withIcon = false) =>
    `w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none${withIcon ? ' pl-9' : ''}`;
  const labelCls = (withIcon = false) =>
    `block mb-1 text-sm font-medium text-slate-700${withIcon ? ' flex items-center gap-1.5' : ''}`;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">My Profile</h1>
        <p className="text-slate-500 mb-6">Your account details and health &amp; fitness profile</p>

        <div className="mb-6">
          <ProfileCompletionCard completion={completion} member />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Personal Details</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className={labelCls()}>Full Name</label>
                  <input
                    required
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className={inputCls()}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls()}>Date of Birth</label>
                    <input
                      type="date"
                      value={profile.dateOfBirth}
                      onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })}
                      max={new Date().toISOString().slice(0, 10)}
                      className={inputCls()}
                    />
                  </div>
                  <div>
                    <label className={labelCls()}>Gender</label>
                    <select
                      value={profile.gender}
                      onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                      className={inputCls()}
                    >
                      <option value="">Select gender</option>
                      {Object.entries(GENDER_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls()}>Phone Numbers</label>
                  <div className="space-y-2">
                    {profile.phoneNumbers.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={p.number}
                          onChange={(e) => setPhoneRow(i, { number: e.target.value })}
                          placeholder="Phone number"
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                        <select
                          value={p.label}
                          onChange={(e) => setPhoneRow(i, { label: e.target.value })}
                          className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        >
                          {CONTACT_LABELS.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                        {profile.phoneNumbers.length > 1 && (
                          <button type="button" onClick={() => removePhoneRow(i)} className="text-red-500 hover:text-red-700 text-lg leading-none" aria-label="Remove phone number">
                            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addPhoneRow} className="mt-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Add another number</button>
                  <p className="text-xs text-slate-400 mt-1">The Primary number is the main contact for gym notifications and messaging.</p>
                </div>
                <div>
                  <label className={labelCls()}>Address</label>
                  <input
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    className={inputCls()}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls()}>Emergency Contact Name</label>
                    <input
                      value={profile.emergencyName}
                      onChange={(e) => setProfile({ ...profile, emergencyName: e.target.value })}
                      className={inputCls()}
                    />
                  </div>
                  <div>
                    <label className={labelCls()}>Emergency Contact Phone</label>
                    <input
                      value={profile.emergencyPhone}
                      onChange={(e) => setProfile({ ...profile, emergencyPhone: e.target.value })}
                      className={inputCls()}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls()}>Emergency Contact Relationship</label>
                  <input
                    value={profile.emergencyRelationship}
                    onChange={(e) => setProfile({ ...profile, emergencyRelationship: e.target.value })}
                    placeholder="e.g. Spouse, Parent"
                    className={inputCls()}
                  />
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-md font-semibold text-slate-900 mb-3">Body &amp; Fitness</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls()}>Height (cm)</label>
                      <input
                        type="number"
                        min="40"
                        max="300"
                        value={profile.heightCm}
                        onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })}
                        className={inputCls()}
                      />
                    </div>
                    <div>
                      <label className={labelCls()}>Weight (kg)</label>
                      <input
                        type="number"
                        min="2"
                        max="500"
                        step="0.1"
                        value={profile.weightKg}
                        onChange={(e) => setProfile({ ...profile, weightKg: e.target.value })}
                        className={inputCls()}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={labelCls()}>Activity Level</label>
                    <select
                      value={profile.activityLevel}
                      onChange={(e) => setProfile({ ...profile, activityLevel: e.target.value })}
                      className={inputCls()}
                    >
                      <option value="">Select activity level</option>
                      {ACTIVITY_LEVELS.map((l) => (
                        <option key={l} value={l}>{ACTIVITY_LABELS[l]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-4">
                    <label className={labelCls()}>Preferred Workout Days</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(d)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            profile.preferredWorkoutDays.includes(d)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={labelCls()}>Preferred Workout Duration (minutes)</label>
                    <input
                      type="number"
                      min="15"
                      max="300"
                      value={profile.preferredWorkoutDuration}
                      onChange={(e) => setProfile({ ...profile, preferredWorkoutDuration: e.target.value })}
                      className={inputCls()}
                    />
                  </div>
                  <div className="mt-4">
                    <label className={labelCls()}>Goals (comma-separated)</label>
                    <input
                      value={profile.goals}
                      onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
                      placeholder="e.g. Fat loss, Strength, Endurance"
                      className={inputCls()}
                    />
                  </div>
                  <div className="mt-4">
                    <label className={labelCls()}>Current Injuries (comma-separated)</label>
                    <input
                      value={profile.injuries}
                      onChange={(e) => setProfile({ ...profile, injuries: e.target.value })}
                      placeholder="e.g. Knee strain, Shoulder impingement"
                      className={inputCls()}
                    />
                    <p className="text-xs text-slate-400 mt-1">Helps your trainer adapt exercises. This is not a substitute for medical advice.</p>
                  </div>
                </div>

                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-3">
                  <p className="text-xs font-semibold text-red-700 mb-2">Health &amp; Safety (informational)</p>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Medical Conditions</label>
                      <input
                        value={profile.medicalConditions}
                        onChange={(e) => setProfile({ ...profile, medicalConditions: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Allergies (comma-separated)</label>
                      <input
                        value={profile.allergies}
                        onChange={(e) => setProfile({ ...profile, allergies: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Medical Restrictions</label>
                      <input
                        value={profile.medicalRestrictions}
                        onChange={(e) => setProfile({ ...profile, medicalRestrictions: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Medical Notes</label>
                      <textarea
                        value={profile.medicalNotes}
                        onChange={(e) => setProfile({ ...profile, medicalNotes: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {(doctorRecommendation || trainerRecommendation) && (
                  <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-2">Recommendations on file</p>
                    {doctorRecommendation && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-indigo-600">Doctor&apos;s recommendation</p>
                        <p className="text-sm text-slate-700">{doctorRecommendation}</p>
                      </div>
                    )}
                    {trainerRecommendation && (
                      <div>
                        <p className="text-xs font-medium text-indigo-600">Trainer&apos;s recommendation</p>
                        <p className="text-sm text-slate-700">{trainerRecommendation}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm">
                    {saveMsg && <p className="text-green-600 font-medium">{saveMsg}</p>}
                    {savedAt && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Saved {savedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Change Password</h2>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className={labelCls()}>Current Password</label>
                  <input
                    required
                    type="password"
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    className={inputCls()}
                  />
                </div>
                <div>
                  <label className={labelCls()}>New Password</label>
                  <input
                    required
                    type="password"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    className={inputCls()}
                  />
                  <p className="text-xs text-slate-400 mt-1">At least 8 characters, with letters and numbers.</p>
                </div>
                <div>
                  <label className={labelCls()}>Confirm New Password</label>
                  <input
                    required
                    type="password"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    className={inputCls()}
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm">
                    {pwMsg && <p className="text-green-600 font-medium">{pwMsg}</p>}
                    {pwErr && <p className="text-red-600 font-medium">{pwErr}</p>}
                  </div>
                  <button type="submit" disabled={pwSaving} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium transition-colors disabled:opacity-50">
                    {pwSaving ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="relative shrink-0">
                  {me?.avatar ? (
                    <img
                      src={me.avatar}
                      alt="Profile"
                      className="h-14 w-14 rounded-full object-cover border border-slate-200"
                    />
                  ) : (
                    <div className="h-14 w-14 bg-indigo-600 text-white rounded-full flex items-center justify-center text-lg font-semibold">
                      {me?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{me?.name}</p>
                  <p className="text-sm text-slate-500 truncate">{me?.email}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
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
                    onClick={handlePhotoRemove}
                    disabled={photoBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Role</dt>
                  <dd className="font-medium text-slate-900 capitalize">{me?.role}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Member since</dt>
                  <dd className="font-medium text-slate-900">{fmtDate(me?.createdAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 flex items-start gap-2.5">
              <IdentificationIcon className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium text-indigo-900">Account status</p>
                <p className="text-sm text-indigo-700 mt-1">
                  Your account is active. Keep your contact, fitness and health details up to date so staff can plan your training safely.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}