import { useState, useEffect } from 'react';
import { ClipboardDocumentCheckIcon, CalendarDaysIcon, CheckCircleIcon, MapPinIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import StatCard from '../../components/common/StatCard';
import { fmtDate } from '../../utils/format';
import useTrainerDashboard from '../../hooks/useTrainerDashboard';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMember, setSelectedMember] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutId, setCheckOutId] = useState('');
  const { data: dashboard } = useTrainerDashboard();

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const assigned = dashboard?.members || [];
      const memberList = assigned.map((row) => row.user || row);

      const memberIds = memberList.map((m) => m._id).filter(Boolean);
      const batchRes = memberIds.length
        ? await api.get('/attendance/batch-today', { params: { userIds: memberIds.join(','), date: today } })
        : { data: { records: [] } };

      setMembers(memberList);
      setRecords(batchRes.data.records || []);
    } catch (err) {
      setError(err.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dashboard) fetchResults();
  }, [dashboard]);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;
    setCheckInLoading(true);
    try {
      await api.post('/attendance/checkin', { userId: selectedMember, memberId: selectedMember });
      setSelectedMember('');
      fetchResults();
    } catch (err) {
      alert(err.message || 'Check-in failed');
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCheckOut = async (id) => {
    setCheckOutId(id);
    try {
      await api.post(`/attendance/checkout/${id}`);
      fetchResults();
    } catch (err) {
      alert(err.message || 'Check-out failed');
    } finally {
      setCheckOutId('');
    }
  };

  const checkedInIds = new Set(records.map((r) => String(r.user?._id || r.member?._id || '')));
  const availableMembers = members.filter((m) => !checkedInIds.has(String(m._id)));
  const filteredMembers = memberSearch
    ? availableMembers.filter((m) =>
        `${m.name || ''} ${m.email || ''} ${m.phone || ''}`.toLowerCase().includes(memberSearch.toLowerCase())
      )
    : [];

  const handleMemberSelect = (m) => {
    setSelectedMember(m._id);
    setMemberSearch('');
  };

  if (error) {
    return <div className="space-y-6"><h1 className="text-2xl font-bold text-slate-900">Attendance</h1><ErrorState message={error} onRetry={fetchResults} /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Today's Attendance</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={ClipboardDocumentCheckIcon} label="Checked In Today" value={records.length} color="indigo" />
        <StatCard icon={CheckCircleIcon} label="Checked Out" value={records.filter((r) => r.checkOutTime).length} color="green" />
        <StatCard icon={CalendarDaysIcon} label="Date" value={fmtDate(new Date().toISOString())} color="blue" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Check In a Member</h2>
        <form onSubmit={handleCheckIn} className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Assigned Member</label>
            <div className="relative">
              {selectedMember ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-slate-50">
                  <span className="flex-1 text-sm text-slate-900">
                    {availableMembers.find((m) => String(m._id) === String(selectedMember))?.name || 'Member selected'}
                  </span>
                  <button type="button" onClick={() => setSelectedMember('')} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
                </div>
              ) : (
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search assigned member (name, email or phone)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              )}
              {memberSearch && !selectedMember && filteredMembers.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredMembers.slice(0, 20).map((m) => (
                    <li key={m._id} onClick={() => handleMemberSelect(m)} className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer">
                      {m.name} <span className="text-slate-500">({m.email})</span>
                    </li>
                  ))}
                </ul>
              )}
              {memberSearch && !selectedMember && filteredMembers.length === 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-500">No matching member found</div>
              )}
            </div>
          </div>
          <button type="submit" disabled={checkInLoading || !selectedMember} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
            {checkInLoading ? 'Checking in...' : 'Check In'}
          </button>
        </form>
      </div>

      {loading ? <LoadingSpinner size="lg" /> : records.length === 0 ? (
        <EmptyState icon={MapPinIcon} message="No members have checked in today yet" />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Member</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Check-in</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Check-out</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((r, i) => (
                  <tr key={r._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-4 font-medium text-slate-900">{r.user?.name || r.member?.name || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : (
                        <button onClick={() => handleCheckOut(r._id)} disabled={checkOutId === r._id} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                          {checkOutId === r._id ? 'Checking out...' : 'Check Out'}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600 capitalize">{r.method || 'manual'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}