import { useState, useEffect } from 'react';
import { IdentificationIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { fmtDate } from '../../utils/format';

const CONTACT_LABELS = ['Primary', 'Secondary', 'Emergency', 'Work', 'Home', 'Other'];

const join = (arr) => (Array.isArray(arr) ? arr.join(', ') : arr || '');
const split = (val) => (typeof val === 'string' ? val.split(',').map((s) => s.trim()).filter(Boolean) : Array.isArray(val) ? val : []);

const toForm = (user, profile) => ({
  name: user?.name || '',
  phoneNumbers: (Array.isArray(profile?.phoneNumbers) ? profile.phoneNumbers : [])
    .map((n) => ({ number: n.number || '', label: n.label || 'Primary' })),
  address: profile?.address || '',
  emergencyName: profile?.emergencyContact?.name || '',
  emergencyPhone: profile?.emergencyContact?.phone || '',
  emergencyRelationship: profile?.emergencyContact?.relationship || '',
  heightCm: profile?.heightCm ?? '',
  weightKg: profile?.weightKg ?? '',
  goals: join(profile?.goals),
  medicalConditions: profile?.medicalConditions || '',
  medicalNotes: profile?.medicalNotes || '',
  allergies: join(profile?.allergies),
  medicalRestrictions: profile?.medicalRestrictions || '',
});

export default function Profile() {
  const [me, setMe] = useState(null);
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

  const fetchMe = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/me');
      const { user, profile: memberProfile } = res.data;
      setMe(user);
      setProfile(toForm(user, memberProfile));
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
        medicalConditions: profile.medicalConditions,
        medicalNotes: profile.medicalNotes,
        allergies: split(profile.allergies),
        medicalRestrictions: profile.medicalRestrictions,
      });
      setMe((prev) => ({ ...prev, name: res.data.user?.name || prev.name }));
      setSavedAt(new Date());
      setSaveMsg('Profile updated successfully');
    } catch (err) {
      setSaveMsg(null);
      alert(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
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

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">My Profile</h1>
        <p className="text-slate-500 mb-8">Your account details and health & fitness profile</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Personal Details</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    required
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Numbers</label>
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
                          <button type="button" onClick={() => removePhoneRow(i)} className="text-red-500 hover:text-red-700 text-lg leading-none">&times;</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addPhoneRow} className="mt-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Add another number</button>
                  <p className="text-xs text-slate-400 mt-1">The Primary number is the main contact for gym notifications and messaging.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <input
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Name</label>
                    <input
                      value={profile.emergencyName}
                      onChange={(e) => setProfile({ ...profile, emergencyName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Phone</label>
                    <input
                      value={profile.emergencyPhone}
                      onChange={(e) => setProfile({ ...profile, emergencyPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Relationship</label>
                  <input
                    value={profile.emergencyRelationship}
                    onChange={(e) => setProfile({ ...profile, emergencyRelationship: e.target.value })}
                    placeholder="e.g. Spouse, Parent"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Height (cm)</label>
                    <input
                      type="number"
                      min="40"
                      max="300"
                      value={profile.heightCm}
                      onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
                    <input
                      type="number"
                      min="2"
                      max="500"
                      step="0.1"
                      value={profile.weightKg}
                      onChange={(e) => setProfile({ ...profile, weightKg: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Goals (comma-separated)</label>
                  <input
                    value={profile.goals}
                    onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
                    placeholder="e.g. Fat loss, Strength, Endurance"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-3">
                  <p className="text-xs font-semibold text-red-700 mb-2">Health & Safety (informational)</p>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                  <input
                    required
                    type="password"
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                  <input
                    required
                    type="password"
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">At least 8 characters, with letters and numbers.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                  <input
                    required
                    type="password"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
                <div className="h-12 w-12 bg-indigo-600 text-white rounded-full flex items-center justify-center text-lg font-semibold">
                  {me?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{me?.name}</p>
                  <p className="text-sm text-slate-500">{me?.email}</p>
                </div>
              </div>
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

            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
              <div className="flex items-start gap-2.5 mb-2">
                <IdentificationIcon className="h-5 w-5 text-indigo-500 shrink-0" aria-hidden="true" />
                <p className="font-medium text-indigo-900">Account status</p>
              </div>
              <p className="text-sm text-indigo-700">
                Your account is active. Keep your contact and health details up to date so staff can plan your training safely.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}