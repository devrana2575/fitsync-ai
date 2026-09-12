import { useState, useEffect } from 'react';
import { AcademicCapIcon, CalendarDaysIcon, UsersIcon, ClockIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

const CATEGORIES = ['strength', 'cardio', 'yoga', 'hiit', 'crossfit', 'dance', 'core', 'flexibility', 'boxing', 'group_fitness', 'other'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'all_levels'];

const initialClassForm = { name: '', category: 'strength', difficulty: 'all_levels', description: '', defaultDuration: 60, defaultCapacity: 20 };
const initialSessionForm = { gymClass: '', trainer: '', startsAt: '', duration: 60, location: '', capacity: 20, waitlistLimit: 5, repeatWeekly: false, repeatCount: 1 };

export default function Classes() {
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [classModal, setClassModal] = useState(false);
  const [sessionModal, setSessionModal] = useState(false);
  const [bookingsModal, setBookingsModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState(initialClassForm);
  const [sessionForm, setSessionForm] = useState(initialSessionForm);
  const [saving, setSaving] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingsSessionId, setBookingsSessionId] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clsRes, sessRes, stRes, trRes] = await Promise.all([
        api.get('/classes'),
        api.get('/classes/sessions'),
        api.get('/classes/stats'),
        api.get('/trainers/all'),
      ]);
      setClasses(clsRes.data.classes || []);
      setSessions(sessRes.data.sessions || []);
      setStats(stRes.data);
      setTrainers(trRes.data.trainers || []);
    } catch (err) {
      setError(err.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleClassSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...classForm };
      if (editingClass) {
        await api.put(`/classes/${editingClass._id}`, payload);
      } else {
        await api.post('/classes', payload);
      }
      setClassModal(false);
      setEditingClass(null);
      setClassForm(initialClassForm);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to save class');
    } finally {
      setSaving(false);
    }
  };

  const openCreateClass = () => { setEditingClass(null); setClassForm(initialClassForm); setClassModal(true); };

  const openEditClass = (cls) => {
    setEditingClass(cls);
    setClassForm({
      name: cls.name || '',
      category: cls.category || 'strength',
      difficulty: cls.difficulty || 'all_levels',
      description: cls.description || '',
      defaultDuration: cls.defaultDuration || 60,
      defaultCapacity: cls.defaultCapacity || 20,
    });
    setClassModal(true);
  };

  const handleDeleteClass = async (cls) => {
    if (!window.confirm(`Deactivate "${cls.name}"?`)) return;
    try {
      await api.delete(`/classes/${cls._id}`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to deactivate class');
    }
  };

  const openCreateSession = () => {
    setSessionForm({ ...initialSessionForm, startsAt: new Date(Date.now() + 3600000).toISOString().slice(0, 16) });
    setSessionModal(true);
  };

  const handleSessionSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/classes/sessions', sessionForm);
      setSessionModal(false);
      setSessionForm(initialSessionForm);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to create session');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelSession = async (sess) => {
    if (!window.confirm(`Cancel this session?`)) return;
    try {
      await api.delete(`/classes/sessions/${sess._id}`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to cancel session');
    }
  };

  const openBookings = async (sess) => {
    setBookingsSessionId(sess._id);
    setBookingsModal(true);
    try {
      const res = await api.get(`/classes/sessions/${sess._id}/bookings`);
      setBookings(res.data.bookings || []);
    } catch (err) {
      alert(err.message || 'Failed to load bookings');
      setBookings([]);
    }
  };

  const handleCheckIn = async (bookingId) => {
    try {
      await api.post(`/classes/sessions/${bookingsSessionId}/checkin`, { userId: bookingId });
      const res = await api.get(`/classes/sessions/${bookingsSessionId}/bookings`);
      setBookings(res.data.bookings || []);
    } catch (err) {
      alert(err.message || 'Failed to check in');
    }
  };

  const sessionStatusColor = (s) => {
    const map = { scheduled: 'bg-green-100 text-green-700', full: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-red-100 text-red-700', completed: 'bg-slate-100 text-slate-700' };
    return map[s?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  const bookingStatusColor = (s) => {
    const map = { booked: 'bg-green-100 text-green-700', waitlisted: 'bg-yellow-100 text-yellow-700' };
    return map[s?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
        <div className="flex gap-3">
          <button onClick={openCreateSession} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            + New Session
          </button>
          <button onClick={openCreateClass} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
            + New Class
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={AcademicCapIcon} label="Total Classes" value={stats.classCount || classes.length} color="indigo" />
          <StatCard icon={CalendarDaysIcon} label="Upcoming Sessions" value={stats.upcomingSessions || 0} color="green" />
          <StatCard icon={UsersIcon} label="Total Bookings" value={stats.totalBookings || 0} color="blue" />
          <StatCard icon={ClockIcon} label="Waitlist" value={stats.waitlistCount || 0} color="yellow" />
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Class Definitions</h2>
            </div>
            {classes.length === 0 ? (
              <EmptyState icon={AcademicCapIcon} message="No classes defined" />
            ) : (
              <DataTable headers={['Name', 'Category', 'Difficulty', 'Duration', 'Capacity', 'Status', 'Actions']}>
                {classes.map((cls, i) => (
                  <tr key={cls._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-4 font-medium text-slate-900">{cls.name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 capitalize">{cls.category?.replace('_', ' ')}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 capitalize">{cls.difficulty?.replace('_', ' ')}</td>
                    <td className="px-6 py-4 text-slate-600">{cls.defaultDuration} min</td>
                    <td className="px-6 py-4 text-slate-600">{cls.defaultCapacity}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${cls.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {cls.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button onClick={() => openEditClass(cls)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">Edit</button>
                        <button onClick={() => handleDeleteClass(cls)} className="text-red-600 hover:text-red-800 font-medium text-sm">Deactivate</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Sessions</h2>
            </div>
            {sessions.length === 0 ? (
              <EmptyState icon={CalendarDaysIcon} message="No sessions found" />
            ) : (
              <DataTable headers={['Class', 'Trainer', 'Date & Time', 'Duration', 'Location', 'Booked', 'Waitlist', 'Status', 'Actions']}>
                {sessions.map((sess, i) => (
                  <tr key={sess._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-4 font-medium text-slate-900">{sess.gymClass?.name || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{sess.trainer?.name || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{sess.startsAt ? new Date(sess.startsAt).toLocaleString('en-IN') : '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{sess.duration} min</td>
                    <td className="px-6 py-4 text-slate-600">{sess.location || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{sess.bookedCount}/{sess.capacity}</td>
                    <td className="px-6 py-4 text-slate-600">{sess.waitlistedCount || 0}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${sessionStatusColor(sess.status)}`}>{sess.status}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button onClick={() => openBookings(sess)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">View Bookings</button>
                        <button onClick={() => handleCancelSession(sess)} className="text-red-600 hover:text-red-800 font-medium text-sm">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        </>
      )}

      <Modal isOpen={classModal} onClose={() => setClassModal(false)} title={editingClass ? 'Edit Class' : 'Create Class'}>
        <form onSubmit={handleClassSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input required value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select value={classForm.category} onChange={(e) => setClassForm({ ...classForm, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none capitalize">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Difficulty</label>
              <select value={classForm.difficulty} onChange={(e) => setClassForm({ ...classForm, difficulty: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none capitalize">
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={classForm.description} onChange={(e) => setClassForm({ ...classForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Duration (min)</label>
              <input type="number" min={1} required value={classForm.defaultDuration} onChange={(e) => setClassForm({ ...classForm, defaultDuration: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Capacity</label>
              <input type="number" min={1} required value={classForm.defaultCapacity} onChange={(e) => setClassForm({ ...classForm, defaultCapacity: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setClassModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Saving...' : editingClass ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={sessionModal} onClose={() => setSessionModal(false)} title="Create Session">
        <form onSubmit={handleSessionSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
            <select required value={sessionForm.gymClass} onChange={(e) => setSessionForm({ ...sessionForm, gymClass: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">Select class</option>
              {classes.filter((c) => c.isActive).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Trainer</label>
            <select required value={sessionForm.trainer} onChange={(e) => setSessionForm({ ...sessionForm, trainer: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">Select trainer</option>
              {trainers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Starts At</label>
              <input type="datetime-local" required value={sessionForm.startsAt} onChange={(e) => setSessionForm({ ...sessionForm, startsAt: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (min)</label>
              <input type="number" min={1} required value={sessionForm.duration} onChange={(e) => setSessionForm({ ...sessionForm, duration: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
            <input required value={sessionForm.location} onChange={(e) => setSessionForm({ ...sessionForm, location: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Capacity</label>
              <input type="number" min={1} required value={sessionForm.capacity} onChange={(e) => setSessionForm({ ...sessionForm, capacity: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Waitlist Limit</label>
              <input type="number" min={0} value={sessionForm.waitlistLimit} onChange={(e) => setSessionForm({ ...sessionForm, waitlistLimit: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="repeatWeekly" checked={sessionForm.repeatWeekly} onChange={(e) => setSessionForm({ ...sessionForm, repeatWeekly: e.target.checked })} className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500" />
            <label htmlFor="repeatWeekly" className="text-sm font-medium text-slate-700">Repeat Weekly</label>
            {sessionForm.repeatWeekly && (
              <input type="number" min={1} max={52} value={sessionForm.repeatCount} onChange={(e) => setSessionForm({ ...sessionForm, repeatCount: Number(e.target.value) })} className="w-20 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setSessionModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={bookingsModal} onClose={() => setBookingsModal(false)} title="Session Bookings">
        {bookings.length === 0 ? (
          <EmptyState icon={UsersIcon} message="No bookings yet" />
        ) : (
          <div className="space-y-2">
            {bookings.map((b, i) => (
              <div key={b._id || i} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                <div>
                  <span className="font-medium text-slate-900">{b.user?.name || '—'}</span>
                  <span className="text-sm text-slate-500 ml-2">{b.user?.email || ''}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${bookingStatusColor(b.status)}`}>{b.status}</span>
                  {b.status === 'booked' && !b.checkedIn && (
                    <button onClick={() => handleCheckIn(b.user?._id)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">
                      Check In
                    </button>
                  )}
                  {b.checkedIn && <span className="text-xs text-green-600 font-medium">Checked In</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
