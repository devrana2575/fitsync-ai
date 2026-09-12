import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CameraIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';

export default function Progress() {
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
    Promise.all([fetchMeasurements(), fetchPhotos()]);
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
      alert('Photo uploaded successfully');
      fetchPhotos();
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoSubmitting(false);
    }
  };

  const handleDeletePhoto = async (photo) => {
    if (!window.confirm('Delete this progress photo?')) return;
    try {
      await api.delete(`/photos/${photo._id}`);
      alert('Photo deleted');
      fetchPhotos();
    } catch (err) {
      alert(err.message);
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

  const chartData = measurements.map((m) => ({
    date: new Date(m.createdAt || m.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    weight: m.weight || null,
    bmi: m.bmi || (m.weight && m.height ? Math.round((m.weight / ((m.height / 100) ** 2)) * 10) / 10 : null),
    chest: m.chest || null,
    waist: m.waist || null,
    hips: m.hips || null,
  }));

  const points = (key) => chartData.filter((d) => d[key] != null).length;
  const enough = (key, min = 2) => points(key) >= min;

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Progress</h1>
            <p className="text-slate-500 mt-1">{measurements.length} measurement{measurements.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Record Measurement'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Record Body Measurement</h2>
            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Weight (kg)</label>
                  <input type="number" name="weight" value={form.weight} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 75" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Height (cm)</label>
                  <input type="number" name="height" value={form.height} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 175" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Body Fat %</label>
                  <input type="number" name="bodyFat" value={form.bodyFat} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 20" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Chest (cm)</label>
                  <input type="number" name="chest" value={form.chest} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 100" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Waist (cm)</label>
                  <input type="number" name="waist" value={form.waist} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 80" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hips (cm)</label>
                  <input type="number" name="hips" value={form.hips} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 95" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Biceps (cm)</label>
                  <input type="number" name="biceps" value={form.biceps} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 35" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Thighs (cm)</label>
                  <input type="number" name="thighs" value={form.thighs} onChange={handleChange} min="0" step="0.1" placeholder="e.g. 55" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={submitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save Measurement'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Weight Trend</h2>
            {enough('weight') ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} name="Weight (kg)" />
                </LineChart>
              </ResponsiveContainer>
            ) : points('weight') === 1 ? (
              <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">Not enough data to show a trend — record another measurement</div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-slate-400 text-sm">No weight data yet</div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">BMI Trend</h2>
            {enough('bmi') ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Line type="monotone" dataKey="bmi" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="BMI" />
                </LineChart>
              </ResponsiveContainer>
            ) : points('bmi') === 1 ? (
              <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">Not enough data to show a trend — record another measurement</div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-slate-400 text-sm">No BMI data yet (need weight + height)</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Body Measurements Over Time</h2>
          {enough('chest') || enough('waist') || enough('hips') ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="chest" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} name="Chest (cm)" />
                <Line type="monotone" dataKey="waist" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} name="Waist (cm)" />
                <Line type="monotone" dataKey="hips" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Hips (cm)" />
              </LineChart>
            </ResponsiveContainer>
          ) : points('chest') + points('waist') + points('hips') > 0 ? (
            <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">Not enough data to show a trend — record another measurement</div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">No body measurement data yet</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Progress Photos</h2>
            <button
              onClick={() => setShowPhotoForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + Upload Photo
            </button>
          </div>
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map((photo) => (
                <div key={photo._id || photo.url} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <img
                    src={`http://localhost:5000${photo.url}`}
                    alt={photo.caption || 'Progress photo'}
                    className="h-48 w-full object-cover rounded-t-xl"
                  />
                  <div className="p-4">
                    <p className="text-sm font-medium text-slate-900 truncate">{photo.caption || 'Progress photo'}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 capitalize">{photo.angle}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(photo.createdAt || photo.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <button onClick={() => handleDeletePhoto(photo)} className="mt-3 text-xs font-medium text-red-600 hover:text-red-800">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={CameraIcon} message="No progress photos yet. Upload one to track your transformation." />
          )}
        </div>

        <Modal isOpen={showPhotoForm} onClose={() => setShowPhotoForm(false)} title="Upload Progress Photo">
          <form onSubmit={handlePhotoSubmit} className="space-y-4">
            {photoError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{photoError}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Caption</label>
              <input
                type="text"
                name="caption"
                value={photoForm.caption}
                onChange={handlePhotoChange}
                placeholder="e.g. Week 4 check-in"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Angle</label>
              <select
                name="angle"
                value={photoForm.angle}
                onChange={handlePhotoChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="other">Other</option>
                <option value="front">Front</option>
                <option value="side">Side</option>
                <option value="back">Back</option>
                <option value="full">Full</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Photo</label>
              <input
                type="file"
                name="photo"
                accept="image/*"
                onChange={handlePhotoChange}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={photoSubmitting} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {photoSubmitting ? 'Uploading...' : 'Upload Photo'}
              </button>
            </div>
          </form>
        </Modal>

        {measurements.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Measurement History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Weight</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Height</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">BMI</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Body Fat</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Chest</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Waist</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Hips</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Biceps</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thighs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[...measurements].reverse().map((m, idx) => {
                    const bmi = m.bmi || (m.weight && m.height ? Math.round((m.weight / ((m.height / 100) ** 2)) * 10) / 10 : null);
                    return (
                      <tr key={m._id || m.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">
                          {new Date(m.createdAt || m.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.weight ? `${m.weight} kg` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.height ? `${m.height} cm` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{bmi ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.bodyFat ? `${m.bodyFat}%` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.chest ? `${m.chest} cm` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.waist ? `${m.waist} cm` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.hips ? `${m.hips} cm` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.biceps ? `${m.biceps} cm` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{m.thighs ? `${m.thighs} cm` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
