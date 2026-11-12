import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  EyeIcon,
  CheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
  ClockIcon,
  NoSymbolIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { sickLeaves, openSickLeaveCertificate } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import StatCard from '../../components/common/StatCard';
import { fmtDate } from '../../utils/format';

const STATUS_CARDS = [
  { key: 'ALL', label: 'All Requests', icon: ClipboardDocumentListIcon, color: 'ink' },
  { key: 'PENDING', label: 'Pending', icon: ClockIcon, color: 'yellow' },
  { key: 'APPROVED', label: 'Approved', icon: CheckCircleIcon, color: 'green' },
  { key: 'REJECTED', label: 'Rejected', icon: XCircleIcon, color: 'red' },
  { key: 'CANCELLED', label: 'Cancelled', icon: NoSymbolIcon, color: 'brand' },
  { key: 'COMPLETED', label: 'Completed', icon: ArrowPathIcon, color: 'cyan' },
];

const statusTone = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  CANCELLED: 'badge-muted',
  COMPLETED: 'badge-brand',
};

export default function AdminTrainerLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [detailLeave, setDetailLeave] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [noteModal, setNoteModal] = useState(null); // { leave, action: 'approve' | 'reject' }
  const [note, setNote] = useState('');
  const { toast } = useToast();

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const collected = [];
      let page = 1;
      let pages = 1;
      let totalCount = 0;
      do {
        const res = await sickLeaves.list({ page, limit: 100 });
        collected.push(...(res.data.leaves || []));
        totalCount = res.data.total ?? collected.length;
        pages = Math.max(1, Math.ceil(totalCount / 100));
        page += 1;
      } while (page <= pages);
      setLeaves(collected);
      setTotal(totalCount);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  const openAction = (leave, action) => {
    setNote('');
    setNoteModal({ leave, action });
  };

  const confirmAction = async () => {
    if (!noteModal) return;
    const { leave, action } = noteModal;
    try {
      setBusyId(leave._id);
      const res = action === 'approve'
        ? await sickLeaves.approve(leave._id, note.trim())
        : await sickLeaves.reject(leave._id, note.trim());
      if (action === 'approve') {
        const covered = res.data.coverage?.covered || 0;
        const uncovered = res.data.coverage?.uncovered || 0;
        toast.success('Leave approved', uncovered > 0
          ? `${covered} member(s) covered; ${uncovered} need manual assignment.`
          : `${covered} member(s) moved to a temporary trainer.`);
      } else {
        toast.success('Leave rejected', 'The trainer has been notified.');
      }
      setNoteModal(null);
      setDetailLeave(null);
      fetchLeaves();
    } catch (err) {
      toast.error(action === 'approve' ? 'Approval failed' : 'Rejection failed', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const viewCertificate = async (leaveId) => {
    try {
      await openSickLeaveCertificate(leaveId);
    } catch (err) {
      toast.error('Could not open certificate', err.message);
    }
  };

  const counts = leaves.reduce((acc, leave) => {
    acc[leave.status] = (acc[leave.status] || 0) + 1;
    return acc;
  }, {});
  const countFor = (key) => (key === 'ALL' ? leaves.length : counts[key] || 0);

  const searchTerm = search.trim().toLowerCase();
  const isFiltering = statusFilter !== 'ALL' || Boolean(searchTerm);
  const clearFilters = () => { setStatusFilter('ALL'); setSearch(''); };

  const filteredLeaves = leaves.filter((leave) => {
    if (statusFilter !== 'ALL' && leave.status !== statusFilter) return false;
    if (!searchTerm) return true;
    const haystack = `${leave.trainer?.name || ''} ${leave.trainer?.email || ''} ${leave.reason || ''}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Trainer Sick Leaves"
        subtitle="Review medical certificates, approve time off and track temporary member coverage"
        icon={ClipboardDocumentCheckIcon}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_CARDS.map(({ key, label, icon, color }) => (
          <StatCard
            key={key}
            icon={icon}
            label={label}
            value={countFor(key)}
            color={color}
            onClick={() => setStatusFilter(key)}
            active={statusFilter === key}
            ariaLabel={`Show ${label.toLowerCase()}`}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trainer, email or reason..."
            className="input pl-9 pr-9"
            aria-label="Search sick leave requests"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-lg leading-none text-slate-500 hover:text-slate-600"
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
        {isFiltering && (
          <button type="button" onClick={clearFilters} className="btn btn-sm btn-outline">
            Clear filters
          </button>
        )}
        <span className="text-xs text-slate-500 sm:ml-auto">
          {filteredLeaves.length} of {total} request{total === 1 ? '' : 's'} shown
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
      ) : error ? (
        <ErrorState message="We couldn't load sick-leave requests." onRetry={fetchLeaves} />
      ) : filteredLeaves.length === 0 ? (
        <div className="card py-8">
          <EmptyState
            icon={ClipboardDocumentCheckIcon}
            message={
              searchTerm
                ? 'No requests match your search'
                : statusFilter === 'PENDING'
                  ? 'No pending requests'
                  : 'No requests in this filter'
            }
            description={
              searchTerm
                ? 'Try a different name, email or reason, or clear your filters.'
                : statusFilter === 'PENDING'
                  ? 'Everything is reviewed — nice work.'
                  : 'Try another status filter.'
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Trainer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Dates</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Certificate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Coverage</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLeaves.map((leave) => (
                  <tr key={leave._id} className="odd:bg-transparent even:bg-surface/60">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      <button
                        type="button"
                        onClick={() => setDetailLeave(leave)}
                        className="text-left hover:text-brand-500"
                      >
                        {leave.trainer?.name || '—'}
                      </button>
                      {leave.trainer?.email ? <p className="truncate text-xs font-normal text-slate-500">{leave.trainer.email}</p> : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {fmtDate(leave.startDate)} <span className="text-slate-500">→</span> {fmtDate(leave.endDate)}
                    </td>
                    <td className="max-w-xs truncate px-6 py-4 text-sm text-slate-500">{leave.reason}</td>
                    <td className="px-6 py-4">
                      <StatusBadge value={leave.status} tone={statusTone[leave.status]} />
                      {leave.reviewNote ? <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{leave.reviewNote}</p> : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {leave.hasCertificate ? (
                        <button onClick={() => viewCertificate(leave._id)} className="btn btn-sm btn-outline">
                          <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" /> Review
                        </button>
                      ) : (
                        <span className="badge badge-warning">Missing — required to approve</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {leave.coverage?.covered > 0 && (
                        <span className="badge badge-success">{leave.coverage.covered} covered</span>
                      )}
                      {leave.coverage?.uncovered > 0 && (
                        <span className="badge badge-danger ml-1">{leave.coverage.uncovered} need assignment</span>
                      )}
                      {leave.coverage?.restoredAt && (
                        <p className="mt-1 text-xs text-slate-500">Restored {fmtDate(leave.coverage.restoredAt)}</p>
                      )}
                      {!leave.coverage?.covered && !leave.coverage?.uncovered ? <span className="text-slate-500">—</span> : null}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={() => setDetailLeave(leave)}
                          className="btn btn-sm btn-outline"
                          title="View request details"
                        >
                          <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" /> View
                        </button>
                        {leave.status === 'PENDING' ? (
                          <>
                            <button
                              onClick={() => openAction(leave, 'approve')}
                              disabled={!leave.hasCertificate || busyId === leave._id}
                              className="btn btn-sm btn-primary"
                              title={leave.hasCertificate ? 'Approve leave' : 'A certificate is required before approval'}
                            >
                              {busyId === leave._id ? <LoadingSpinner size="sm" /> : <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                            </button>
                            <button
                              onClick={() => openAction(leave, 'reject')}
                              disabled={busyId === leave._id}
                              className="btn btn-sm btn-outline"
                              title="Reject leave"
                            >
                              <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </>
                        ) : leave.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {leave.coverage?.restoredAt ? 'Completed cover' : 'Cover active / scheduled'}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(detailLeave)}
        onClose={() => setDetailLeave(null)}
        title="Sick leave details"
      >
        {detailLeave && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={detailLeave.status} tone={statusTone[detailLeave.status]} />
              {detailLeave.hasCertificate ? (
                <span className="badge badge-success">Certificate attached</span>
              ) : (
                <span className="badge badge-warning">Certificate required for approval</span>
              )}
            </div>

            <div>
              <p className="text-base font-semibold text-slate-900">{detailLeave.trainer?.name || 'Trainer'}</p>
              {detailLeave.trainer?.email && <p className="text-sm text-slate-500">{detailLeave.trainer.email}</p>}
            </div>

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Leave dates</dt>
                <dd className="mt-0.5 text-slate-900">{fmtDate(detailLeave.startDate)} → {fmtDate(detailLeave.endDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Submitted</dt>
                <dd className="mt-0.5 text-slate-900">{fmtDate(detailLeave.submittedAt || detailLeave.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Covered members</dt>
                <dd className="mt-0.5 text-slate-900">{detailLeave.coverage?.covered || 0}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Need assignment</dt>
                <dd className="mt-0.5 text-slate-900">{detailLeave.coverage?.uncovered || 0}</dd>
              </div>
            </dl>

            <div>
              <p className="label">Reason</p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{detailLeave.reason || '—'}</p>
            </div>

            {(detailLeave.reviewedBy || detailLeave.reviewNote) && (
              <div className="rounded-lg border border-border bg-surface/60 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Review</p>
                {detailLeave.reviewedBy?.name && (
                  <p className="mt-1 text-sm text-slate-700">
                    {detailLeave.reviewedBy.name}
                    {detailLeave.reviewedAt ? ` · ${fmtDate(detailLeave.reviewedAt)}` : ''}
                  </p>
                )}
                {detailLeave.reviewNote && <p className="mt-1 text-sm text-slate-600">{detailLeave.reviewNote}</p>}
              </div>
            )}

            {detailLeave.coverage?.installedAt && (
              <p className="text-xs text-slate-500">
                Cover installed {fmtDate(detailLeave.coverage.installedAt)}
                {detailLeave.coverage.restoredAt ? ` · restored ${fmtDate(detailLeave.coverage.restoredAt)}` : ''}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {detailLeave.hasCertificate && (
                <button
                  type="button"
                  onClick={() => viewCertificate(detailLeave._id)}
                  className="btn btn-outline btn-md"
                >
                  <EyeIcon className="h-4 w-4" aria-hidden="true" /> Review certificate
                </button>
              )}
              {detailLeave.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    onClick={() => { const leave = detailLeave; setDetailLeave(null); openAction(leave, 'approve'); }}
                    disabled={!detailLeave.hasCertificate || busyId === detailLeave._id}
                    className="btn btn-primary btn-md"
                  >
                    <CheckIcon className="h-4 w-4" aria-hidden="true" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => { const leave = detailLeave; setDetailLeave(null); openAction(leave, 'reject'); }}
                    disabled={busyId === detailLeave._id}
                    className="btn btn-outline btn-md"
                  >
                    <XMarkIcon className="h-4 w-4" aria-hidden="true" /> Reject
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(noteModal)}
        onClose={() => { if (busyId !== noteModal?.leave?._id) setNoteModal(null); }}
        title={noteModal?.action === 'approve' ? 'Approve sick leave' : 'Reject sick leave'}
      >
        {noteModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {noteModal.leave.trainer?.name} · {fmtDate(noteModal.leave.startDate)} → {fmtDate(noteModal.leave.endDate)}
            </p>
            {noteModal.action === 'approve' ? (
              <p className="text-sm text-slate-500">
                Approving installs a temporary replacement on every ACTIVE membership this trainer currently coaches.
                A medical certificate is required (and is already attached for this request).
              </p>
            ) : (
              <p className="text-sm text-slate-500">The trainer will be notified with your note.</p>
            )}
            <div>
              <label htmlFor="sl-note" className="mb-1 block text-sm font-medium text-slate-700">
                Note {noteModal.action === 'reject' ? '' : '(optional)'}
              </label>
              <textarea
                id="sl-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={noteModal.action === 'approve' ? 'Get well soon' : 'Certificate incomplete — please re-upload'}
                className="input"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setNoteModal(null)} className="btn btn-md btn-outline" disabled={busyId === noteModal.leave._id}>
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={busyId === noteModal.leave._id}
                className={`btn btn-md ${noteModal.action === 'approve' ? 'btn-primary' : 'btn-danger'}`}
              >
                {busyId === noteModal.leave._id ? <LoadingSpinner size="sm" /> : noteModal.action === 'approve' ? 'Approve & assign cover' : 'Reject'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
