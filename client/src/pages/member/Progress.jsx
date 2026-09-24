import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CameraIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import Skeleton, { SkeletonCard, SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate } from '../../utils/format';

export default function Progress() {
  const { toast } = useToast();
  const [measurements, setMeasurements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [photos, setPhotos] = useState([]);
  const [showPhotoForm, setShowPhotoForm] = useState(false);
  const [photoForm, setPhotoForm] = useState({ caption: '', angle: 'other', file: null });
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const [form, setForm] = useState({
    weight: '',
    height: '',
    bodyFat: '',
    chest: '',
    waist: '',
    hips: '',
    biceps: '',
    thighs: '',
  });

  useEffect(() => {
    refetch();
  }, []);

  async function fetchMeasurements() {
    try {
      setLoading(true);
      const res = await api.get('/measurements/my');
      const data = res.data?.measurements || res.data || [];
      setMeasurements(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPhotos() {
    try {
      const res = await api.get('/photos/my');
      const data = res.data?.photos || res.data || [];
      setPhotos(Array.isArray(data) ? data : []);
    } catch {
      setPhotos([]);
    }
  }

  async function refetch() {
    setError(null);
    await Promise.all([fetchMeasurements(), fetchPhotos()]);
  }

  const handlePhotoChange = (e) => {
    const { name, value, files } = e.target;
    setPhotoForm((prev) => ({ ...prev, [name]: name === 'photo' ? files[0] : value }));
  };

  const handlePhotoSubmit = async (e) => {
    e.preventDefault();
    setPhotoError('');
    if (!photoForm.file) {
      return setPhotoError('Please select a photo to upload');
    }
    try {
      setPhotoSubmitting(true);
      const fd = new FormData();
      fd.append('photo', photoForm.file);
      fd.append('caption', photoForm.caption);
      fd.append('angle', photoForm.angle);
      await api.post('/photos', fd);
      setPhotoForm({ caption: '', angle: 'other', file: null });
      setShowPhotoForm(false);
      toast.success('Photo uploaded', 'Your photo has been updated.');
      fetchPhotos();
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoSubmitting(false);
    }
  };

  const handleDeletePhoto = async (photo) => {
    const proceed = await toast.confirm({
      title: 'Delete this progress photo?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!proceed) return;
    try {
      await api.delete(`/photos/${photo._id}`);
      toast.success('Photo deleted');
      fetchPhotos();
    } catch (err) {
      toast.error('Delete failed', err.message);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.weight && !form.height) {
      return setFormError('Please enter at least weight or height');
    }

    try {
      setSubmitting(true);
      const payload = {};
      Object.entries(form).forEach(([key, val]) => {
        if (val !== '') payload[key] = Number(val);
      });
      await api.post('/measurements', payload);
      setForm({ weight: '', height: '', bodyFat: '', chest: '', waist: '', hips: '', biceps: '', thighs: '' });
      setShowForm(false);
      fetchMeasurements();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const chartData = useMemo(() => measurements.map((m) => ({
    date: new Date(m.createdAt || m.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    weight: m.weight || null,
    bmi: m.bmi || (m.weight && m.height ? Math.round((m.weight / ((m.height / 100) ** 2)) * 10) / 10 : null),
    chest: m.chest || null,
    waist: m.waist || null,
    hips: m.hips || null,
  })), [measurements]);

  const points = (key) => chartData.filter((d) => d[key] != null).length;
  const enough = (key, min = 2) => points(key) >= min;

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <div className="space-y-2">
          <Skeleton width="w-56" height="h-8" />
          <Skeleton width="w-72" height="h-4" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonRow rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="My Progress" subtitle="Your body measurements and progress photos" icon={ChartBarIcon} />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="My Progress"
        subtitle={`${measurements.length} measurement${measurements.length !== 1 ? 's' : ''} recorded`}
        icon={ChartBarIcon}
        actions={
          <button onClick={() => setShowForm(!showForm)} className="btn btn-md btn-primary">
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            {showForm ? 'Cancel' : 'Record Measurement'}
          </button>
        }
      />

      {showForm && (
        <div className="card p-6">
          <h2 className="section-title mb-4">Record Body Measurement</h2>
          {formError && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/25 rounded-lg text-sm text-danger">{formError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="label">Weight (kg)</label>
                <input type="number" name="weight" value={form.weight} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 75" className="input" />
              </div>
              <div>
                <label className="label">Height (cm)</label>
                <input type="number" name="height" value={form.height} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 175" className="input" />
              </div>
              <div>
                <label className="label">Body Fat %</label>
                <input type="number" name="bodyFat" value={form.bodyFat} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 20" className="input" />
              </div>
              <div>
                <label className="label">Chest (cm)</label>
                <input type="number" name="chest" value={form.chest} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 100" className="input" />
              </div>
              <div>
                <label className="label">Waist (cm)</label>
                <input type="number" name="waist" value={form.waist} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 80" className="input" />
              </div>
              <div>
                <label className="label">Hips (cm)</label>
                <input type="number" name="hips" value={form.hips} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 95" className="input" />
              </div>
              <div>
                <label className="label">Biceps (cm)</label>
                <input type="number" name="biceps" value={form.biceps} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 35" className="input" />
              </div>
              <div>
                <label className="label">Thighs (cm)</label>
                <input type="number" name="thighs" value={form.thighs} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 55" className="input" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting} className="btn btn-md btn-primary">
                {submitting ? 'Saving...' : 'Save Measurement'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="section-title mb-4">Weight Trend</h2>
          {enough('weight') ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
                <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
                <YAxis tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
                <Tooltip contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
                <Line type="monotone" dataKey="weight" stroke="#B7F34A" strokeWidth={2} dot={{ fill: '#B7F34A' }} name="Weight (kg)" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex min-h-[250px] items-center justify-center">
              <EmptyState
                icon={ChartBarIcon}
                message="Not enough measurements yet."
                description="Complete your next fitness assessment to see your trend."
                action={
                  <button onClick={() => setShowForm(true)} className="btn btn-md btn-primary">
                    Record Measurement
                  </button>
                }
              />
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="section-title mb-4">BMI Trend</h2>
          {enough('bmi') ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
                <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
                <YAxis tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
                <Tooltip contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
                <Line type="monotone" dataKey="bmi" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="BMI" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex min-h-[250px] items-center justify-center">
              <EmptyState
                icon={ChartBarIcon}
                message="Not enough measurements yet."
                description="Complete your next fitness assessment to see your trend."
                action={
                  <button onClick={() => setShowForm(true)} className="btn btn-md btn-primary">
                    Record Measurement
                  </button>
                }
              />
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="section-title mb-4">Body Measurements Over Time</h2>
        {enough('chest') || enough('waist') || enough('hips') ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
              <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
              <YAxis tickLine={false} axisLine={{ stroke: "#292f35" }} tick={{ fontSize: 12, fill: "#6f7983" }} />
              <Tooltip contentStyle={{ backgroundColor: '#181c20', border: '1px solid #292f35', borderRadius: '0.75rem', color: '#f3f5f4' }} labelStyle={{ color: '#9aa4ad' }} itemStyle={{ color: '#f3f5f4' }} />
              <Legend wrapperStyle={{ color: '#9aa4ad' }} />
              <Line type="monotone" dataKey="chest" stroke="#B7F34A" strokeWidth={2} dot={{ fill: '#B7F34A' }} name="Chest (cm)" />
              <Line type="monotone" dataKey="waist" stroke="#F4B740" strokeWidth={2} dot={{ fill: '#F4B740' }} name="Waist (cm)" />
              <Line type="monotone" dataKey="hips" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Hips (cm)" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex min-h-[300px] items-center justify-center">
            <EmptyState
              icon={ClipboardDocumentListIcon}
              message="Not enough measurements yet."
              description="Complete your next fitness assessment to see your trend."
              action={
                <button onClick={() => setShowForm(true)} className="btn btn-md btn-primary">
                  Record Measurement
                </button>
              }
            />
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Progress Photos</h2>
          <button onClick={() => setShowPhotoForm(true)} className="btn btn-md btn-primary">
            <CameraIcon className="h-4 w-4" aria-hidden="true" />
            Upload Photo
          </button>
        </div>
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <div key={photo._id || photo.url} className="card overflow-hidden">
                <img
                  src={photo.url}
                  alt={photo.caption || 'Progress photo'}
                  className="h-48 w-full object-cover"
                />
                <div className="p-4">
                  <p className="text-sm font-medium text-slate-900 truncate">{photo.caption || 'Progress photo'}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="badge badge-brand capitalize">{photo.angle}</span>
                    <span className="text-xs text-slate-500">{fmtDate(photo.createdAt || photo.date)}</span>
                  </div>
                  <button onClick={() => handleDeletePhoto(photo)} className="btn btn-sm btn-danger mt-3">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CameraIcon}
            message="No progress photos yet"
            description="Upload one to track your transformation."
          />
        )}
      </div>

      <Modal isOpen={showPhotoForm} onClose={() => setShowPhotoForm(false)} title="Upload Progress Photo">
        <form onSubmit={handlePhotoSubmit} className="space-y-4">
          {photoError && (
            <div className="p-3 bg-danger/10 border border-danger/25 rounded-lg text-sm text-danger">{photoError}</div>
          )}
          <div>
            <label className="label">Caption</label>
            <input
              type="text"
              name="caption"
              value={photoForm.caption}
              onChange={handlePhotoChange}
              placeholder="e.g. Week 4 check-in"
              className="input"
            />
          </div>
          <div>
            <label className="label">Angle</label>
            <select
              name="angle"
              value={photoForm.angle}
              onChange={handlePhotoChange}
              className="input"
            >
              <option value="other">Other</option>
              <option value="front">Front</option>
              <option value="side">Side</option>
              <option value="back">Back</option>
              <option value="full">Full</option>
            </select>
          </div>
          <div>
            <label className="label">Photo</label>
            <input
              type="file"
              name="photo"
              accept="image/*"
              onChange={handlePhotoChange}
              className="input file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand-500 file:text-ink-950"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={photoSubmitting} className="btn btn-md btn-primary">
              {photoSubmitting ? 'Uploading...' : 'Upload Photo'}
            </button>
          </div>
        </form>
      </Modal>

      {measurements.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="section-title">Measurement History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Weight</th>
                  <th className="px-6 py-3">Height</th>
                  <th className="px-6 py-3">BMI</th>
                  <th className="px-6 py-3">Body Fat</th>
                  <th className="px-6 py-3">Chest</th>
                  <th className="px-6 py-3">Waist</th>
                  <th className="px-6 py-3">Hips</th>
                  <th className="px-6 py-3">Biceps</th>
                  <th className="px-6 py-3">Thighs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...measurements].reverse().map((m, idx) => {
                  const bmi = m.bmi || (m.weight && m.height ? Math.round((m.weight / ((m.height / 100) ** 2)) * 10) / 10 : null);
                  return (
                    <tr key={m._id || m.id || idx} className="odd:bg-transparent even:bg-slate-100/40 hover:bg-slate-100/40 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">{fmtDate(m.createdAt || m.date)}</td>
                      <td className="px-6 py-3 text-slate-600">{m.weight ? `${m.weight} kg` : '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{m.height ? `${m.height} cm` : '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{bmi ?? '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{m.bodyFat ? `${m.bodyFat}%` : '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{m.chest ? `${m.chest} cm` : '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{m.waist ? `${m.waist} cm` : '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{m.hips ? `${m.hips} cm` : '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{m.biceps ? `${m.biceps} cm` : '—'}</td>
                      <td className="px-6 py-3 text-slate-600">{m.thighs ? `${m.thighs} cm` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}