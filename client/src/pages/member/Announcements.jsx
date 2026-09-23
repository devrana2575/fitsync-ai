import { useState, useEffect } from 'react';
import { MegaphoneIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonRow } from '../../components/common/Skeleton';
import { fmtDate } from '../../utils/format';

const priorityStyles = {
  info: { border: 'border-l-sky-500', badge: 'badge-info', label: 'Info' },
  warning: { border: 'border-l-amber-500', badge: 'badge-warning', label: 'Warning' },
  critical: { border: 'border-l-red-500', badge: 'badge-danger', label: 'Critical' },
};

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

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="Announcements" subtitle="Stay updated with the latest from the gym" icon={MegaphoneIcon} />
        <SkeletonRow rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="Announcements" subtitle="Stay updated with the latest from the gym" icon={MegaphoneIcon} />
        <div className="card p-5">
          <ErrorState message={error} onRetry={fetchData} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader title="Announcements" subtitle="Stay updated with the latest from the gym" icon={MegaphoneIcon} />

      {announcements.length === 0 ? (
        <EmptyState icon={MegaphoneIcon} message="No announcements" />
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const style = priorityStyles[a.priority?.toLowerCase()] || priorityStyles.info;
            return (
              <div key={a._id} className={`card p-5 border-l-4 ${style.border}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.pinned && (
                        <span className="badge badge-warning">Pinned</span>
                      )}
                      <span className={`badge ${style.badge}`}>{style.label}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">{a.title}</h2>
                    <p className="mt-1 text-slate-600 whitespace-pre-wrap">{a.message}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{fmtDate(a.createdAt || a.createdAAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}