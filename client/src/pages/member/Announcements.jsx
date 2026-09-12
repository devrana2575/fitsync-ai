import { useState, useEffect } from 'react';
import { MegaphoneIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

const priorityStyles = {
  info: { border: 'border-l-sky-500', badge: 'bg-sky-100 text-sky-700', label: 'Info' },
  warning: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700', label: 'Warning' },
  critical: { border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', label: 'Critical' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/announcements');
      setAnnouncements(res.data.announcements || []);
    } catch (err) {
      setError(err.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Announcements</h1>
          <p className="text-slate-500">Stay updated with the latest from the gym</p>
        </div>

        {announcements.length === 0 ? (
          <EmptyState icon={MegaphoneIcon} message="No announcements right now" />
        ) : (
          <div className="space-y-4">
            {announcements.map((a) => {
              const style = priorityStyles[a.priority?.toLowerCase()] || priorityStyles.info;
              return (
                <div key={a._id} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${style.border} shadow-sm p-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {a.pinned && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-400 text-yellow-900">Pinned</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>{style.label}</span>
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-slate-900">{a.title}</h2>
                      <p className="mt-1 text-slate-600 whitespace-pre-wrap">{a.message}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{fmtDate(a.createdAAt || a.createdAt)}</span>
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