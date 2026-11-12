import { useState, useEffect } from 'react';
import {
  ClipboardDocumentCheckIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  MapPinIcon,
  MagnifyingGlassIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatCard from '../../components/common/StatCard';
import Avatar from '../../components/common/Avatar';
import { SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate, fmtTime, formatDuration, todayKey } from '../../utils/format';
import { useToast } from '../../context/ToastContext';

export default function Attendance() {
  const { toast } = useToast();
  const [records, setRecords] = useState([]);
  const [todayRecords, setTodayRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(todayKey());
  const [selectedMember, setSelectedMember] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [showIneligible, setShowIneligible] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkOutId, setCheckOutId] = useState('');
  const [todayStats, setTodayStats] = useState(null);

  const fetchAllMembers = async () => {
    const collected = [];
    let page = 1;
    let pages = 1;
    do {
      const res = await api.get('/members', { params: { page, limit: 100 } });
      collected.push(...(res.data.data || res.data.members || []));
      pages = res.data.pages || 1;
      page += 1;
    } while (page <= pages);
    return collected;
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayRes, dateRes, memberList] = await Promise.all([
        api.get('/attendance/today'),
        api.get('/attendance', { params: { date } }),
        fetchAllMembers(),
      ]);
      const todayData = todayRes.data.records || todayRes.data.data || todayRes.data.attendance || todayRes.data || [];
      setTodayRecords(Array.isArray(todayData) ? todayData : todayData.attendance || []);
      setRecords(dateRes.data.records || dateRes.data.data || dateRes.data.attendance || []);
      setMembers(memberList);
      setTodayStats({
        count: todayRes.data.count ?? (Array.isArray(todayData) ? todayData.length : 0),
      });
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
      const memberName = members.find((m) => String(m._id) === String(selectedMember))?.name || 'Member';
      await api.post('/attendance/checkin', { userId: selectedMember, memberId: selectedMember });
      toast.success('Checked in', `${memberName} is now checked in.`);
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

  const hasActiveMembership = (m) => {
    const membership = m.membership;
    if (!membership || String(membership.status).toUpperCase() !== 'ACTIVE') return false;
    return !membership.endDate || new Date(membership.endDate) >= new Date();
  };

  const checkInCandidates = members
    .filter((m) => m.isActive !== false && !checkedTodayIds.has(String(m._id)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const eligibleMembers = checkInCandidates.filter(hasActiveMembership);
  const availableMembers = showIneligible ? checkInCandidates : eligibleMembers;

  const memberSearchTerm = memberSearch.trim().toLowerCase();
  const filteredMembers = availableMembers.filter((m) => {
    if (!memberSearchTerm) return true;
    const phone = m.phone || m.profile?.phone || '';
    return `${m.name || ''} ${m.email || ''} ${phone}`.toLowerCase().includes(memberSearchTerm);
  });

  const selectedMemberObj = members.find((m) => String(m._id) === String(selectedMember)) || null;

  const recordSearchTerm = recordSearch.trim().toLowerCase();
  const filteredRecords = records.filter((r) => {
    if (!recordSearchTerm) return true;
    const name = r.user?.name || r.member?.name || '';
    const email = r.user?.email || '';
    return `${name} ${email}`.toLowerCase().includes(recordSearchTerm);
  });

  const handleMemberSelect = (m) => {
    if (!hasActiveMembership(m)) return;
    setSelectedMember(m._id);
  };

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Check members in and out, review daily records"
        icon={ClipboardDocumentCheckIcon}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ClipboardDocumentCheckIcon} label="Today's Count" value={todayStats?.count || todayRecords.length} color="brand" />
        <StatCard icon={CheckCircleIcon} label="Checked Out" value={todayRecords.filter((r) => r.checkOutTime).length} color="green" />
        <StatCard icon={ClockIcon} label="Still in Gym" value={todayRecords.filter((r) => !r.checkOutTime).length} color="yellow" />
        <StatCard icon={CalendarDaysIcon} label="Date" value={fmtDate(date)} color="blue" />
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="card-title">Manual Check-In</h2>
            <p className="mt-0.5 text-xs text-slate-500">Choose a member from the list or search by name, email or phone.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={showIneligible}
                onChange={(e) => setShowIneligible(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-control text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
              />
              Show members without an active plan
            </label>
            <span className="text-xs text-slate-500">
              {eligibleMembers.length} eligible · {checkInCandidates.length} not checked in
            </span>
          </div>
        </div>

        <form onSubmit={handleCheckIn} className="mt-4 space-y-3">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members by name, email or phone..."
              className="input pl-9 pr-9"
            />
            {memberSearch && (
              <button
                type="button"
                onClick={() => setMemberSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-lg leading-none text-slate-500 hover:text-slate-600"
                aria-label="Clear search"
              >
                &times;
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface/50">
            {availableMembers.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                {checkInCandidates.length === 0
                  ? 'All eligible members have already checked in today.'
                  : 'No members with an active membership are available. Tick the option above to show everyone.'}
              </p>
            ) : filteredMembers.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No members match "{memberSearch}".</p>
            ) : (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {filteredMembers.map((m) => {
                  const active = hasActiveMembership(m);
                  const isSelected = String(selectedMember) === String(m._id);
                  return (
                    <li key={m._id}>
                      <button
                        type="button"
                        onClick={() => handleMemberSelect(m)}
                        disabled={!active}
                        title={active ? `Check in ${m.name}` : 'This member needs an active membership before check-in'}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          isSelected ? 'bg-brand-50' : active ? 'hover:bg-surface-hover' : 'cursor-not-allowed opacity-60'
                        }`}
                      >
                        <Avatar name={m.name} src={m.avatar} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{m.name}</span>
                          <span className="block truncate text-xs text-slate-500">{m.email}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {active ? (
                            <span className="badge badge-success">{m.membership?.plan?.name || 'Active'}</span>
                          ) : (
                            <span className="badge badge-warning">No active plan</span>
                          )}
                          {isSelected && <span className="text-[11px] font-medium text-brand-500">Selected</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {filteredMembers.length} of {availableMembers.length} shown
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {selectedMemberObj && (
                <p className="text-sm text-slate-600">
                  Selected: <span className="font-medium text-slate-900">{selectedMemberObj.name}</span>
                </p>
              )}
              <button type="submit" disabled={checkInLoading || !selectedMember} className="btn btn-md btn-primary whitespace-nowrap">
                {checkInLoading ? 'Checking in...' : 'Check In'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="label mb-0">Filter by Date:</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto" />
        </div>
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={recordSearch}
            onChange={(e) => setRecordSearch(e.target.value)}
            placeholder="Search records by member..."
            className="input pl-9"
          />
        </div>
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <SkeletonRow rows={8} />
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          icon={MapPinIcon}
          message={records.length === 0 ? `No attendance records for ${date}` : 'No records match your search'}
          description={records.length > 0 ? 'Try another name or clear the search.' : undefined}
        />
      ) : (
        <DataTable headers={['Member', 'Check-in', 'Check-out', 'Duration', 'Method', 'Date']}>
          {filteredRecords.map((r) => (
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
                  <button onClick={() => handleCheckOut(r._id)} disabled={checkOutId === r._id} className="btn btn-sm btn-outline">
                    {checkOutId === r._id ? 'Checking out...' : 'Check Out'}
                  </button>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {r.checkOutTime ? formatDuration(new Date(r.checkOutTime) - new Date(r.checkInTime)) : <span className="text-slate-500">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 capitalize">{r.method || 'manual'}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{fmtDate(r.checkInTime)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}