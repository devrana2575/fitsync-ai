import { useState, useEffect } from 'react';
import {
  ClipboardDocumentCheckIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';
import Avatar from '../../components/common/Avatar';
import { SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate, fmtTime, formatDuration } from '../../utils/format';
import { useToast } from '../../context/ToastContext';

export default function Attendance() {
  const { toast } = useToast();
  const [records, setRecords] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMember, setSelectedMember] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutId, setCheckOutId] = useState('');
  const [todayStats, setTodayStats] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
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
      setError(err.message || 'Failed to load attendance');
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
      toast.error('Check-in failed', err.message);
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleCheckOut = async (id) => {
    setCheckOutId(id);
    try {
      await api.post(`/attendance/checkout/${id}`);
      fetchAll();
    } catch (err) {
      toast.error('Check-out failed', err.message);
    } finally {
      setCheckOutId('');
    }
  };

  const checkedTodayIds = new Set(todayRecords.map((r) => String(r.user?._id || r.member?._id || '')));
  const availableMembers = members.filter((m) => !checkedTodayIds.has(String(m._id)));
  const filteredMembers = memberSearch
    ? availableMembers.filter((m) =>
        `${m.name || ''} ${m.email || ''} ${m.phone || ''}`.toLowerCase().includes(memberSearch.toLowerCase())
      )
    : [];

  const handleMemberSelect = (m) => {
    setSelectedMember(m._id);
    setMemberSearch('');
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Check members in and out, review daily records"
        icon={ClipboardDocumentCheckIcon}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={ClipboardDocumentCheckIcon} label="Today's Count" value={todayStats?.count || todayRecords.length} color="brand" />
        <StatCard icon={CalendarDaysIcon} label="Date" value={fmtDate(date)} color="blue" />
        <StatCard icon={CheckCircleIcon} label="Checked Out" value={todayRecords.filter(r => r.checkOutTime).length} color="green" />
      </div>

      <div className="card p-5">
        <h2 className="card-title mb-4">Manual Check-In</h2>
        <form onSubmit={handleCheckIn} className="flex items-end gap-4">
          <div className="flex-1">
            <label className="label">Select Member</label>
            <div className="relative">
              {selectedMember ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-surface">
                  <span className="flex-1 text-sm text-slate-900">
                    {availableMembers.find((m) => String(m._id) === String(selectedMember))?.name || 'Member selected'}
                  </span>
                  <button type="button" onClick={() => setSelectedMember('')} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
                </div>
              ) : (
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search member (name, email or phone)..."
                  className="input"
                />
              )}
              {memberSearch && !selectedMember && filteredMembers.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full bg-surface-elevated border border-border rounded-lg shadow-pop max-h-48 overflow-y-auto">
                  {filteredMembers.slice(0, 20).map((m) => (
                    <li key={m._id} onClick={() => handleMemberSelect(m)} className="px-3 py-2 text-sm hover:bg-brand-500/12 cursor-pointer">
                      {m.name} <span className="text-slate-500">({m.email})</span>
                    </li>
                  ))}
                </ul>
              )}
              {memberSearch && !selectedMember && filteredMembers.length === 0 && (
                <div className="absolute z-10 mt-1 w-full bg-surface-elevated border border-border rounded-lg shadow-pop px-3 py-2 text-sm text-slate-500">No matching member found</div>
              )}
            </div>
          </div>
          <button type="submit" disabled={checkInLoading || !selectedMember} className="btn btn-md btn-primary whitespace-nowrap">
            {checkInLoading ? 'Checking in...' : 'Check In'}
          </button>
        </form>
      </div>

      <div className="flex items-center gap-4">
        <label className="label mb-0">Filter by Date:</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto" />
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={8} />
      ) : records.length === 0 ? (
        <EmptyState icon={MapPinIcon} message={`No attendance records for ${date}`} />
      ) : (
        <DataTable headers={['Member', 'Check-in', 'Check-out', 'Duration', 'Method', 'Date']}>
          {records.map((r) => (
            <tr key={r._id} className="odd:bg-transparent even:bg-surface/60">
              <td className="px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar name={r.user?.name || r.member?.name} size="sm" />
                  <span className="font-medium text-slate-900">{r.user?.name || r.member?.name || '—'}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtTime(r.checkInTime)}</td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {r.checkOutTime ? fmtTime(r.checkOutTime) : (
                  <button onClick={() => handleCheckOut(r._id)} disabled={checkOutId === r._id} className="btn btn-sm btn-primary">
                    {checkOutId === r._id ? 'Checking out...' : 'Check Out'}
                  </button>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{formatDuration(new Date(r.checkOutTime) - new Date(r.checkInTime))}</td>
              <td className="px-4 py-3 text-sm text-slate-600 capitalize">{r.method || 'manual'}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(r.checkInTime)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}