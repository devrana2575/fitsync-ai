import { useState, useEffect, useCallback } from 'react';
import { UsersIcon, BoltIcon, ArrowPathIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import useTrainerDashboard from '../../hooks/useTrainerDashboard';

export default function TrainerDashboard() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error, reload } = useTrainerDashboard({ forceRefresh: true });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [handleRefresh]);

  if (loading) return <LoadingSpinner />;
  if (error) return (
    <div className="p-6 text-center">
      <p className="text-red-600 mb-3">{error}</p>
      <button onClick={handleRefresh} disabled={refreshing} className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50">
        {refreshing ? 'Retrying...' : 'Retry'}
      </button>
    </div>
  );

  const members = data?.members || [];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Trainer Dashboard</h1>
            <p className="text-slate-500 mt-1">Welcome back, {user?.name}</p>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard icon={UsersIcon} label="Total Assigned Members" value={data?.totalAssigned ?? 0} color="indigo" />
          <StatCard icon={ClipboardDocumentCheckIcon} label="Today's Attendance" value={data?.todayAttendance ?? 0} color="green" />
          <StatCard icon={BoltIcon} label="Recent Workouts (30d)" value={data?.recentWorkouts ?? 0} color="blue" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Assigned Members</h2>
          </div>
          {members.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-lg">No members assigned yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Attention</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {members.map((member) => (
                    <tr key={member._id || member.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-sm">
                            {(member.user?.name || member.name || '').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-900">{member.user?.name || member.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {Array.isArray(member.attention) && member.attention.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {member.attention.includes('no_recent_attendance') && (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">No visit in 7+ days</span>
                            )}
                            {member.attention.includes('membership_expiring') && (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Membership expiring</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          member.user?.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {member.user?.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {member.lastVisit
                          ? new Date(member.lastVisit).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
