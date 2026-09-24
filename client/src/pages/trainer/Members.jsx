import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UsersIcon, MagnifyingGlassIcon, InboxIcon } from '@heroicons/react/24/outline';
import PageHeader from '../../components/common/PageHeader';
import Avatar from '../../components/common/Avatar';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Skeleton, { SkeletonCard } from '../../components/common/Skeleton';
import useTrainerDashboard from '../../hooks/useTrainerDashboard';

const ATTENTION_META = {
  no_recent_attendance: { label: 'No visit in 7+ days', cls: 'badge-warning' },
  membership_expiring: { label: 'Membership expiring', cls: 'bg-warning/15 text-warning' },
};

const memberName = (m) => m.user?.name || 'Member';
const memberId = (m) => m.user?._id || m._id || m.id;

export default function Members() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { data, loading, error, reload } = useTrainerDashboard();

  useEffect(() => {
    if (data?.members) setMembers(data.members);
  }, [data]);

  const filtered = members.filter(
    (m) =>
      (m.user?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.user?.email || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <div className="space-y-2">
          <Skeleton width="w-64" height="h-8" />
          <Skeleton width="w-80" height="h-4" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        <PageHeader title="Assigned Members" subtitle="Manage the members assigned to you" icon={UsersIcon} />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Assigned Members"
        subtitle={`${members.length} member${members.length !== 1 ? 's' : ''} assigned to you`}
        icon={UsersIcon}
        actions={
          <div className="relative w-full sm:w-72">
            <MagnifyingGlassIcon
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
        }
      />

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={search ? MagnifyingGlassIcon : InboxIcon}
            message={search ? 'No members match your search' : 'No members assigned yet'}
            description={search ? 'Try a different name or email.' : 'Members assigned to you will appear here.'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const active = m.user?.isActive !== false;
            const attention = Array.isArray(m.attention) ? m.attention : [];
            return (
              <button
                key={memberId(m)}
                onClick={() => navigate(`/trainer/members/${memberId(m)}`)}
                className="card p-5 text-left hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <Avatar name={memberName(m)} src={m.user?.avatar} size="lg" />
                  <StatusBadge value={active} label={active ? 'Active' : 'Inactive'} />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900 truncate">{memberName(m)}</p>
                <p className="text-sm text-slate-500 truncate">{m.user?.email || '—'}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Phone: <span className="text-slate-700">{m.phone || '—'}</span>
                </p>
                {attention.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {attention.map((a) => (
                      <span key={a} className={`badge ${ATTENTION_META[a]?.cls || 'badge-muted'}`}>
                        {ATTENTION_META[a]?.label || a}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}