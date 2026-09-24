import { useState, useEffect } from 'react';
import {
  MapPinIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import StatusBadge from '../../components/common/StatusBadge';
import Skeleton, { SkeletonCard, SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate, fmtTime } from '../../utils/format';

export default function Attendance() {
  const { toast } = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkingOutId, setCheckingOutId] = useState('');
  const [error, setError] = useState(null);
  const [view, setView] = useState('table');

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/attendance/my');
      const data = res.data?.attendance || res.data?.records || res.data || [];
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const handleCheckIn = async () => {
    try {
      setChecking(true);
      await api.post('/attendance/qr-checkin');
      fetchAttendance();
    } catch (err) {
      toast.error('Check-in failed', err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleCheckOut = async (id) => {
    try {
      setCheckingOutId(id);
      await api.post(`/attendance/checkout/${id}`);
      fetchAttendance();
    } catch (err) {
      toast.error('Check-out failed', err.message);
    } finally {
      setCheckingOutId('');
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

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <div className="space-y-2">
          <Skeleton width="w-56" height="h-8" />
          <Skeleton width="w-72" height="h-4" />
        </div>
        <SkeletonCard />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonRow rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="My Attendance" subtitle="Your gym check-ins" icon={ClipboardDocumentListIcon} />
        <ErrorState message={error} onRetry={fetchAttendance} />
      </div>
    );
  }

  const now = new Date();
  const todayRecords = records.filter((r) => {
    const d = new Date(r.checkInTime || r.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  });
  const todayRecord = todayRecords[0];
  const checkedIn = Boolean(todayRecord && !todayRecord.checkOutTime);

  const monthlyCount = getMonthlyCount();

  const groupedByMonth = records.reduce((acc, record) => {
    const date = new Date(record.checkInTime || record.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {});

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="My Attendance"
        subtitle={`${records.length} total check-ins`}
        icon={ClipboardDocumentListIcon}
      />

      <div className={`card p-6 ${checkedIn ? 'border-success/25 bg-success/10' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          {checkedIn ? (
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-success/15 p-2.5">
                <CheckCircleIcon className="h-6 w-6 text-success" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-success">CHECKED IN</p>
                <p className="text-sm text-slate-600">
                  {todayRecord?.checkInTime ? `Checked in at ${fmtTime(todayRecord.checkInTime)}` : 'Checked in today'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-brand-500/15 p-2.5">
                <MapPinIcon className="h-6 w-6 text-brand-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Not checked in yet</p>
                <p className="text-sm text-slate-500">Check in when you arrive at the gym.</p>
              </div>
            </div>
          )}
          {!checkedIn && (
            <button onClick={handleCheckIn} disabled={checking} className="btn btn-md btn-primary">
              <MapPinIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {checking ? 'Checking in...' : 'Check In'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={MapPinIcon} label="Today" value={todayRecords.length} color="brand" />
        <StatCard icon={CalendarDaysIcon} label="This Month" value={monthlyCount} color="blue" />
        <StatCard icon={ClipboardDocumentListIcon} label="Total Check-ins" value={records.length} color="green" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setView('table')}
          className={`btn btn-md ${view === 'table' ? 'btn-primary' : 'btn-outline'}`}
        >
          Table View
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`btn btn-md ${view === 'calendar' ? 'btn-primary' : 'btn-outline'}`}
        >
          Summary View
        </button>
      </div>

      {records.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={MapPinIcon}
            message="No check-ins yet"
            description="Check in when you arrive at the gym."
          />
        </div>
      ) : view === 'table' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Check-in</th>
                  <th className="px-6 py-3">Check-out</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r, idx) => (
                  <tr key={r._id || r.id || idx} className="odd:bg-transparent even:bg-surface/60 hover:bg-surface/60 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                      {fmtDate(r.checkInTime || r.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{r.checkInTime ? fmtTime(r.checkInTime) : '—'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {r.checkOutTime ? (
                        fmtTime(r.checkOutTime)
                      ) : (
                        <button
                          onClick={() => handleCheckOut(r._id || r.id)}
                          disabled={checkingOutId === (r._id || r.id)}
                          className="btn btn-sm btn-primary"
                        >
                          {checkingOutId === (r._id || r.id) ? 'Checking out...' : 'Check Out'}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{formatDuration(r.duration)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge value={r.method || r.checkInMethod || 'manual'} />
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
            const monthName = new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            return (
              <div key={monthKey} className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-900">{monthName}</h3>
                  <span className="text-sm text-slate-500">{monthRecords.length} visit{monthRecords.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {monthRecords.map((r, idx) => (
                    <div key={idx} className="aspect-square bg-success/15 rounded-lg flex items-center justify-center" title={new Date(r.checkInTime || r.date).toLocaleDateString()}>
                      <span className="text-xs font-medium text-success">
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
  );
}