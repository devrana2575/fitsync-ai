import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMember, setSelectedMember] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [todayStats, setTodayStats] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [todayRes, dateRes, memRes] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance', { params: { date } }),
        api.get('/members', { params: { limit: 200 } }),
      ]);
      const todayData = todayRes.data.records || todayRes.data.data || todayRes.data.attendance || todayRes.data || [];
      setTodayRecords(Array.isArray(todayData) ? todayData : todayData.attendance || []);
      setRecords(dateRes.data.records || dateRes.data.data || dateRes.data.attendance || []);
      setMembers(memRes.data.data || memRes.data.members || []);
      setTodayStats({ count: Array.isArray(todayData) ? todayData.length : 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [date]);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;
    setCheckInLoading(true);
    try {
      await api.post('/attendance/checkin', { userId: selectedMember, memberId: selectedMember });
      setSelectedMember('');
      fetchAll();
    } catch (err) {
      alert(err.message || 'Check-in failed');
    } finally {
      setCheckInLoading(false);
    }
  };

  const formatDuration = (checkIn, checkOut) => {
    if (!checkOut) return '—';
    const diff = new Date(checkOut) - new Date(checkIn);
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon="📍" label="Today's Count" value={todayStats?.count || todayRecords.length} color="indigo" />
        <StatCard icon="📅" label="Date" value={date} color="blue" />
        <StatCard icon="🏃" label="Checked Out" value={todayRecords.filter(r => r.checkOutTime).length} color="green" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Manual Check-In</h2>
        <form onSubmit={handleCheckIn} className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Member</label>
            <select required value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
              <option value="">Choose a member...</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>{m.name} ({m.email})</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={checkInLoading || !selectedMember} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
            {checkInLoading ? 'Checking in...' : 'Check In'}
          </button>
        </form>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Filter by Date:</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
      </div>

      {loading ? <LoadingSpinner size="lg" /> : records.length === 0 ? (
        <EmptyState icon="📍" message={`No attendance records for ${date}`} />
      ) : (
        <DataTable headers={['Member', 'Check-in', 'Check-out', 'Duration', 'Method', 'Date']}>
          {records.map((r, i) => (
            <tr key={r._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-6 py-4 font-medium text-slate-900">{r.user?.name || r.member?.name || '—'}</td>
              <td className="px-6 py-4 text-slate-600">{r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
              <td className="px-6 py-4 text-slate-600">{r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : <span className="text-yellow-600 font-medium">Still in</span>}</td>
              <td className="px-6 py-4 text-slate-600">{formatDuration(r.checkInTime, r.checkOutTime)}</td>
              <td className="px-6 py-4 text-slate-600 capitalize">{r.method || 'manual'}</td>
              <td className="px-6 py-4 text-slate-600">{r.checkInTime ? new Date(r.checkInTime).toLocaleDateString('en-IN') : '—'}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
