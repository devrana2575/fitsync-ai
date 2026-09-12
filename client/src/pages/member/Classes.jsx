import { useState, useEffect } from 'react';
import { CalendarDaysIcon, MapPinIcon, UserIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

export default function Classes() {
  const [sessions, setSessions] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, bookRes] = await Promise.all([
        api.get('/classes/sessions'),
        api.get('/classes/my/bookings'),
      ]);
      setSessions(sessRes.data.sessions || []);
      setMyBookings(bookRes.data.bookings || []);
    } catch (err) {
      setError(err.message || 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleBook = async (sessionId) => {
    setActionLoading(sessionId);
    try {
      await api.post(`/classes/sessions/${sessionId}/book`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to book session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (sessionId) => {
    if (!window.confirm('Cancel this booking?')) return;
    setActionLoading(sessionId);
    try {
      await api.post(`/classes/sessions/${sessionId}/cancel`);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to cancel booking');
    } finally {
      setActionLoading(null);
    }
  };

  const categories = [...new Set(sessions.map((s) => s.gymClass?.category).filter(Boolean))];
  const filtered = categoryFilter === 'all' ? sessions : sessions.filter((s) => s.gymClass?.category === categoryFilter);

  const myBookingMap = {};
  myBookings.forEach((b) => { if (b.session?._id) myBookingMap[b.session._id] = b.status; });

  const categoryBadge = (c) => {
    const map = { strength: 'bg-indigo-100 text-indigo-700', cardio: 'bg-red-100 text-red-700', yoga: 'bg-purple-100 text-purple-700', hiit: 'bg-orange-100 text-orange-700', crossfit: 'bg-blue-100 text-blue-700', dance: 'bg-pink-100 text-pink-700', core: 'bg-teal-100 text-teal-700', flexibility: 'bg-cyan-100 text-cyan-700', boxing: 'bg-amber-100 text-amber-700', group_fitness: 'bg-green-100 text-green-700', other: 'bg-slate-100 text-slate-700' };
    return map[c?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  const difficultyBadge = (d) => {
    const map = { beginner: 'bg-green-100 text-green-700', intermediate: 'bg-yellow-100 text-yellow-700', advanced: 'bg-red-100 text-red-700', all_levels: 'bg-blue-100 text-blue-700' };
    return map[d?.toLowerCase()] || 'bg-slate-100 text-slate-700';
  };

  const activeBookings = myBookings.filter((b) => b.session);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Group Classes</h1>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : (
        <>
          {activeBookings.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><CheckCircleIcon className="h-5 w-5 text-green-600" /> My Bookings</h2>
              <div className="space-y-3">
                {activeBookings.map((b, i) => (
                  <div key={b._id || i} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                    <div>
                      <span className="font-medium text-slate-900">{b.session?.gymClass?.name || 'Class'}</span>
                      <span className="text-sm text-slate-500 ml-2">{b.session?.startsAt ? new Date(b.session.startsAt).toLocaleString('en-IN') : ''}</span>
                      {b.session?.location && <span className="text-sm text-slate-500 ml-2">at {b.session.location}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${b.status === 'booked' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{b.status}</span>
                      <button onClick={() => handleCancel(b.session?._id)} disabled={actionLoading === b.session?._id} className="text-red-600 hover:text-red-800 font-medium text-sm">
                        {actionLoading === b.session?._id ? 'Cancelling...' : 'Cancel Booking'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-slate-700">Category:</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none capitalize">
              <option value="all">All</option>
              {categories.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={CalendarDaysIcon} message="No upcoming classes found" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((sess) => {
                const myStatus = myBookingMap[sess._id] || null;
                const isFull = sess.spotsLeft <= 0;
                const hasWaitlist = (sess.waitlistLimit || 0) > 0;
                const progressPct = sess.capacity > 0 ? Math.min(100, Math.round((sess.bookedCount / sess.capacity) * 100)) : 0;
                return (
                  <div key={sess._id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-slate-900 text-lg">{sess.gymClass?.name || 'Class'}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryBadge(sess.gymClass?.category)}`}>{(sess.gymClass?.category || '').replace('_', ' ')}</span>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium w-fit ${difficultyBadge(sess.gymClass?.difficulty)}`}>{(sess.gymClass?.difficulty || '').replace('_', ' ')}</span>
                    {sess.trainer?.name && (
                      <div className="flex items-center gap-1 text-sm text-slate-600"><UserIcon className="h-4 w-4" /> {sess.trainer.name}</div>
                    )}
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <CalendarDaysIcon className="h-4 w-4" />
                      {sess.startsAt ? new Date(sess.startsAt).toLocaleString('en-IN') : '—'}
                    </div>
                    {sess.location && (
                      <div className="flex items-center gap-1 text-sm text-slate-600"><MapPinIcon className="h-4 w-4" /> {sess.location}</div>
                    )}
                    <div className="mt-auto pt-2">
                      <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
                        <span>{sess.bookedCount}/{sess.capacity} booked</span>
                        <span>{sess.spotsLeft > 0 ? `${sess.spotsLeft} spots left` : 'Full'}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
                        <div className={`h-2 rounded-full ${progressPct >= 100 ? 'bg-red-500' : 'bg-indigo-600'}`} style={{ width: `${progressPct}%` }} />
                      </div>
                      {myStatus ? (
                        <button onClick={() => handleCancel(sess._id)} disabled={actionLoading === sess._id} className="w-full bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors border border-red-200">
                          {actionLoading === sess._id ? 'Cancelling...' : `Cancel Booking (${myStatus})`}
                        </button>
                      ) : (
                        <button onClick={() => handleBook(sess._id)} disabled={actionLoading === sess._id || (isFull && hasWaitlist)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {actionLoading === sess._id ? 'Booking...' : isFull && hasWaitlist ? 'Join Waitlist (Full)' : 'Book Now'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
