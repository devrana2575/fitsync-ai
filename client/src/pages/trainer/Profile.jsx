import { useState, useEffect } from 'react';
import { CameraIcon, TrashIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ProfileCompletionCard from '../../components/common/ProfileCompletionCard';
import { fmtDate } from '../../utils/format';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GENDER_LABELS = { male: 'Male', female: 'Female', other: 'Other' };

const toDate = (value) => (value ? String(value).slice(0, 10) : '');

const toForm = (user, profile) => ({
  name: user?.name || '',
  phone: profile?.phone || '',
  dateOfBirth: toDate(profile?.dateOfBirth),
  gender: profile?.gender || '',
  address: profile?.address || '',
  specializations: Array.isArray(profile?.specializations) ? profile.specializations : [],
  experience: profile?.experience ?? '',
  bio: profile?.bio || '',
  languages: Array.isArray(profile?.languages) ? profile.languages : [],
  certifications: Array.isArray(profile?.certifications) ? profile.certifications.map((c) => ({
    name: c?.name || '',
    issuer: c?.issuer || '',
    year: c?.year ?? '',
  })) : [],
  heightCm: profile?.heightCm ?? '',
  weightKg: profile?.weightKg ?? '',
  workingDays: Array.isArray(profile?.workingDays) ? profile.workingDays : [],
  workingStart: profile?.workingHours?.start || '',
  workingEnd: profile?.workingHours?.end || '',
  maxMembers: profile?.maxMembers ?? '',
});

export default function TrainerProfile() {
  const [me, setMe] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(toForm(null, null));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const fetchMe = async () => {
    try {
      setLoading(true);
      const res = await api.get('/auth/me');
      const { user, profile: trainerProfile, completion: profileCompletion } = res.data;
      setMe(user);
      setProfile(toForm(user, trainerProfile));
      setCompletion(profileCompletion);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMe(); }, []);

  const toggleDay = (day) => {
    const days = profile.workingDays.includes(day)
      ? profile.workingDays.filter((d) => d !== day)
      : [...profile.workingDays, day];
    setProfile({ ...profile, workingDays: days });
  };

  const addSpecialization = () => {
    setProfile({ ...profile, specializations: [...profile.specializations, ''] });
  };

  const removeSpecialization = (index) => {
    setProfile({
      ...profile,
      specializations: profile.specializations.filter((_, i) => i !== index),
    });
  };

  const setSpecialization = (index, value) => {
    const list = [...profile.specializations];
    list[index] = value;
    setProfile({ ...profile, specializations: list });
  };

  const addLanguage = () => {
    setProfile({ ...profile, languages: [...profile.languages, ''] });
  };

  const removeLanguage = (index) => {
    setProfile({ ...profile, languages: profile.languages.filter((_, i) => i !== index) });
  };

  const setLanguage = (index, value) => {
    const list = [...profile.languages];
    list[index] = value;
    setProfile({ ...profile, languages: list });
  };

  const addCertification = () => {
    setProfile({ ...profile, certifications: [...profile.certifications, { name: '', issuer: '', year: '' }] });
  };

  const removeCertification = (index) => {
    setProfile({ ...profile, certifications: profile.certifications.filter((_, i) => i !== index) });
  };

  const setCertification = (index, patch) => {
    const list = [...profile.certifications];
    list[index] = { ...list[index], ...patch };
    setProfile({ ...profile, certifications: list });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const workingHours = profile.workingStart || profile.workingEnd
        ? { start: profile.workingStart || undefined, end: profile.workingEnd || undefined }
        : undefined;
      const res = await api.put('/auth/me', {
        name: profile.name,
        phone: profile.phone || undefined,
        dateOfBirth: profile.dateOfBirth || undefined,
        gender: profile.gender || undefined,
        address: profile.address,
        specializations: profile.specializations.map((s) => s.trim()).filter(Boolean),
        experience: profile.experience === '' ? undefined : Number(profile.experience),
        bio: profile.bio,
        languages: profile.languages.map((l) => l.trim()).filter(Boolean),
        certifications: profile.certifications.map((c) => ({
          name: c.name.trim(),
          issuer: c.issuer.trim(),
          year: c.year === '' ? undefined : Number(c.year),
        })).filter((c) => c.name),
        heightCm: profile.heightCm === '' ? undefined : Number(profile.heightCm),
        weightKg: profile.weightKg === '' ? undefined : Number(profile.weightKg),
        workingDays: profile.workingDays,
        workingHours,
        maxMembers: profile.maxMembers === '' ? undefined : Number(profile.maxMembers),
      });
      setMe((prev) => ({ ...prev, name: res.data.user?.name || prev.name }));
      setCompletion(res.data.completion || completion);
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

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  const inputCls = () =>
    'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const labelCls = () => 'block mb-1 text-sm font-medium text-slate-700';

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">My Profile</h1>
        <p className="text-slate-500 mb-6">Your professional details and availability</p>

        <div className="mb-6">
          <ProfileCompletionCard completion={completion} member={false} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Personal Details</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls()}>Full Name</label>
                    <input
                      required
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className={inputCls()}
                    />
                  </div>
                  <div>
                    <label className={labelCls()}>Phone</label>
                    <input
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                      className={inputCls()}
                    />
                  </div>
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
                  <label className={labelCls()}>Address</label>
                  <input
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    className={inputCls()}
                  />
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-md font-semibold text-slate-900 mb-3">Professional</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls()}>Years of Experience</label>
                      <input
                        type="number"
                        min="0"
                        max="80"
                        value={profile.experience}
                        onChange={(e) => setProfile({ ...profile, experience: e.target.value })}
                        className={inputCls()}
                      />
                    </div>
                    <div>
                      <label className={labelCls()}>Languages Spoken</label>
                      <div className="space-y-1.5">
                        {profile.languages.map((lang, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              value={lang}
                              onChange={(e) => setLanguage(i, e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="e.g. English"
                            />
                            <button type="button" onClick={() => removeLanguage(i)} className="text-red-500 hover:text-red-700" aria-label="Remove language">
                              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                        <button type="button" onClick={addLanguage} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Add language</button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className={labelCls()}>Specializations</label>
                    <div className="space-y-1.5">
                      {profile.specializations.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={s}
                            onChange={(e) => setSpecialization(i, e.target.value)}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="e.g. Strength Training"
                          />
                          <button type="button" onClick={() => removeSpecialization(i)} className="text-red-500 hover:text-red-700" aria-label="Remove specialization">
                            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={addSpecialization} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Add specialization</button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className={labelCls()}>Certifications</label>
                    <div className="space-y-2">
                      {profile.certifications.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={c.name}
                            onChange={(e) => setCertification(i, { name: e.target.value })}
                            placeholder="Certification name"
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <input
                            value={c.issuer}
                            onChange={(e) => setCertification(i, { issuer: e.target.value })}
                            placeholder="Issuer"
                            className="w-32 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <input
                            value={c.year}
                            onChange={(e) => setCertification(i, { year: e.target.value })}
                            placeholder="Year"
                            type="number"
                            min="1950"
                            className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <button type="button" onClick={() => removeCertification(i)} className="text-red-500 hover:text-red-700" aria-label="Remove certification">
                            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={addCertification} className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                        <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add certification
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className={labelCls()}>Bio</label>
                    <textarea
                      value={profile.bio}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      rows={3}
                      maxLength={500}
                      placeholder="Short professional bio shown to members"
                      className={inputCls()}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-md font-semibold text-slate-900 mb-3">Physical</h3>
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
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <h3 className="text-md font-semibold text-slate-900 mb-3">Availability</h3>
                  <div>
                    <label className={labelCls()}>Working Days</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDay(d)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            profile.workingDays.includes(d)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className={labelCls()}>Working Start</label>
                      <input
                        type="time"
                        value={profile.workingStart}
                        onChange={(e) => setProfile({ ...profile, workingStart: e.target.value })}
                        className={inputCls()}
                      />
                    </div>
                    <div>
                      <label className={labelCls()}>Working End</label>
                      <input
                        type="time"
                        value={profile.workingEnd}
                        onChange={(e) => setProfile({ ...profile, workingEnd: e.target.value })}
                        className={inputCls()}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className={labelCls()}>Maximum Members (booking capacity)</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={profile.maxMembers}
                      onChange={(e) => setProfile({ ...profile, maxMembers: e.target.value })}
                      className={inputCls()}
                    />
                    <p className="text-xs text-slate-400 mt-1">Memberships will only assign you up to this many active members.</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm">
                    {saveMsg && <p className="text-green-600 font-medium">{saveMsg}</p>}
                  </div>
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Changes'}
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
                  <dt className="text-slate-500">Trainer since</dt>
                  <dd className="font-medium text-slate-900">{fmtDate(me?.createdAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-medium text-slate-900 capitalize">{profile?.isAvailable === false ? 'Unavailable' : 'Available'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}