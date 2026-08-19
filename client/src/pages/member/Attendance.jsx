import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('table');

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const res = await api.get('/attendance/my');
      const data = res.data?.attendance || res.data?.records || res.data || [];
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    try {
      setChecking(true);
      await api.post('/attendance/qr-checkin');
      fetchAttendance();
    } catch (err) {
      alert(err.message);
    } finally {
      setChecking(false);
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getMonthlyCount = () => {
    const now = new Date();
    const thisMonth = records.filter((r) => {
      const d = new Date(r.checkInTime || r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return thisMonth.length;
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  const monthlyCount = getMonthlyCount();

  const groupedByMonth = records.reduce((acc, record) => {
    const date = new Date(record.checkInTime || record.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Attendance</h1>
            <p className="text-slate-500 mt-1">{records.length} total check-ins</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm">
              <span className="text-slate-500">This Month:</span>{' '}
              <span className="font-semibold text-slate-900">{monthlyCount}</span>
            </div>
            <button
              onClick={handleCheckIn}
              disabled={checking}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {checking ? 'Checking in...' : '📍 Check In'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView('table')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'table' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            Table View
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'calendar' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            Summary View
          </button>
        </div>

        {records.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <p className="text-lg">No attendance records yet</p>
            <p className="text-sm mt-1">Click Check In to mark your attendance</p>
          </div>
        ) : view === 'table' ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Check-in</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Check-out</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {records.map((r, idx) => (
                    <tr key={r._id || r.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {new Date(r.checkInTime || r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDuration(r.duration)}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          {r.method || r.checkInMethod || 'manual'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([monthKey, monthRecords]) => {
              const [year, month] = monthKey.split('-');
              const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
              return (
                <div key={monthKey} className="bg-white rounded-xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-900">{monthName}</h3>
                    <span className="text-sm text-slate-500">{monthRecords.length} visit{monthRecords.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {monthRecords.map((r, idx) => (
                      <div key={idx} className="aspect-square bg-green-100 rounded-lg flex items-center justify-center" title={new Date(r.checkInTime || r.date).toLocaleDateString()}>
                        <span className="text-xs font-medium text-green-700">
                          {new Date(r.checkInTime || r.date).getDate()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
