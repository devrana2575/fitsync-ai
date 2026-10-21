import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardDocumentCheckIcon,
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { sickLeaves, openSickLeaveCertificate } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import { fmtDate } from '../../utils/format';

const STATUS_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'];

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
  const [busyId, setBusyId] = useState(null);
  const [noteModal, setNoteModal] = useState(null); // { leave, action: 'approve' | 'reject' }
  const [note, setNote] = useState('');
  const { toast } = useToast();

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { limit: 100 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const res = await sickLeaves.list(params);
      setLeaves(res.data.leaves || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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
        toast.success('Leave rejected');
      }
      setNoteModal(null);
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

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Trainer Sick Leaves"
        subtitle="Review medical certificates, approve time off and track temporary member coverage"
        icon={ClipboardDocumentCheckIcon}
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`btn btn-md ${statusFilter === s ? 'btn-primary' : 'btn-outline'}`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">{total} request{total === 1 ? '' : 's'}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
      ) : error ? (
        <ErrorState message="We couldn't load sick-leave requests." onRetry={fetchLeaves} />
      ) : leaves.length === 0 ? (
        <div className="card py-8">
          <EmptyState
            icon={ClipboardDocumentCheckIcon}
            message={statusFilter === 'PENDING' ? 'No pending requests' : 'No requests in this filter'}
            description={statusFilter === 'PENDING' ? 'Everything is reviewed — nice work.' : 'Try another status filter.'}
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
                {leaves.map((leave) => (
                  <tr key={leave._id} className="odd:bg-transparent even:bg-surface/60">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {leave.trainer?.name || '—'}
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
                      {leave.status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
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
                        </div>
                      ) : leave.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          {leave.coverage?.restoredAt ? 'Completed cover' : 'Cover active / scheduled'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
