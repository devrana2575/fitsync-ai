import { useState, useEffect } from 'react';
import { ClipboardDocumentCheckIcon, CalendarDaysIcon, CheckCircleIcon, MapPinIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import Avatar from '../../components/common/Avatar';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import { SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate, fmtTime } from '../../utils/format';
import useTrainerDashboard from '../../hooks/useTrainerDashboard';
import { useToast } from '../../context/ToastContext';

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
  const { toast } = useToast();

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
      toast.error('Check-in failed', err.message);
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
      toast.error('Check-out failed', err.message);
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
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="Today's Attendance" subtitle="Check your assigned members in and out" icon={ClipboardDocumentCheckIcon} />
        <ErrorState message={error} onRetry={fetchResults} />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Today's Attendance"
        subtitle={fmtDate(new Date().toISOString())}
        icon={ClipboardDocumentCheckIcon}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={ClipboardDocumentCheckIcon} label="Checked In Today" value={records.length} color="brand" />
        <StatCard icon={CheckCircleIcon} label="Checked Out" value={records.filter((r) => r.checkOutTime).length} color="green" />
        <StatCard icon={CalendarDaysIcon} label="Gym Day" value={fmtDate(new Date().toISOString())} color="blue" />
      </div>

      <div className="card p-6">
        <h2 className="card-title mb-4">Check In a Member</h2>
        <form onSubmit={handleCheckIn} className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label className="label">Select Assigned Member</label>
            <div className="relative">
              {selectedMember ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50">
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
                  className="input"
                />
              )}
              {memberSearch && !selectedMember && filteredMembers.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full card p-1 max-h-48 overflow-y-auto shadow-lg">
                  {filteredMembers.slice(0, 20).map((m) => (
                    <li
                      key={m._id}
                      onClick={() => handleMemberSelect(m)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-brand-50 cursor-pointer"
                    >
                      <Avatar name={m.name} size="sm" />
                      <span className="font-medium text-slate-800">{m.name}</span>
                      <span className="text-slate-500">({m.email})</span>
                    </li>
                  ))}
                </ul>
              )}
              {memberSearch && !selectedMember && filteredMembers.length === 0 && (
                <div className="absolute z-10 mt-1 w-full card px-3 py-2 text-sm text-slate-500 shadow-lg">
                  No matching member found
                </div>
              )}
            </div>
          </div>
          <button type="submit" disabled={checkInLoading || !selectedMember} className="btn btn-md btn-primary whitespace-nowrap">
            {checkInLoading ? 'Checking in...' : 'Check In'}
          </button>
        </form>
      </div>

      {loading ? (
        <SkeletonRow rows={5} />
      ) : records.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={MapPinIcon}
            message="No members have checked in today yet"
            description="Member check-ins will appear here as members arrive."
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Check-in</th>
                  <th className="px-6 py-3">Check-out</th>
                  <th className="px-6 py-3">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r, i) => (
                  <tr key={r._id} className={i % 2 === 0 ? 'bg-transparent' : 'bg-slate-100/40'}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.user?.name || r.member?.name} size="sm" />
                        <span className="font-medium text-slate-900">{r.user?.name || r.member?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 tabular-nums">
                      {r.checkInTime ? fmtTime(r.checkInTime) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      {r.checkOutTime ? (
                        <span className="text-slate-600 tabular-nums">{fmtTime(r.checkOutTime)}</span>
                      ) : (
                        <button
                          onClick={() => handleCheckOut(r._id)}
                          disabled={checkOutId === r._id}
                          className="btn btn-sm btn-primary"
                        >
                          {checkOutId === r._id ? 'Checking out...' : 'Check Out'}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge badge-muted capitalize">{r.method || 'manual'}</span>
                    </td>
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