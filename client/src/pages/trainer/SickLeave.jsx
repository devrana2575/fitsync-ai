import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDaysIcon,
  DocumentArrowUpIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { sickLeaves, openSickLeaveCertificate } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { fmtDate } from '../../utils/format';

const toDateInput = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const statusTone = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  CANCELLED: 'badge-muted',
  COMPLETED: 'badge-brand',
};

export default function TrainerSickLeave() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [endDate, setEndDate] = useState(toDateInput(new Date()));
  const [reason, setReason] = useState('');
  const [certificate, setCertificate] = useState(null);
  const [uploadFor, setUploadFor] = useState(null);
  const uploadInputRef = useRef(null);
  const { toast } = useToast();

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await sickLeaves.mine();
      setLeaves(res.data.leaves || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Reason is required', 'Tell the gym briefly why you need leave.');
      return;
    }
    try {
      setSubmitting(true);
      const form = new FormData();
      form.append('startDate', startDate);
      form.append('endDate', endDate);
      form.append('reason', reason.trim());
      if (certificate) form.append('certificate', certificate);
      const res = await sickLeaves.create(form);
      toast.success('Leave requested', 'An admin will review your request shortly.');
      setReason('');
      setCertificate(null);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      setLeaves((prev) => [res.data.leave, ...prev]);
      fetchLeaves();
    } catch (err) {
      toast.error('Could not submit leave', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (leaveId, file) => {
    if (!file) return;
    try {
      const form = new FormData();
      form.append('certificate', file);
      await sickLeaves.uploadCertificate(leaveId, form);
      toast.success('Certificate uploaded', 'Stored securely — only admins can review it.');
      fetchLeaves();
    } catch (err) {
      toast.error('Upload failed', err.message);
    } finally {
      setUploadFor(null);
    }
  };

  const handleCancel = async (leaveId) => {
    try {
      await sickLeaves.cancel(leaveId);
      toast.success('Leave cancelled');
      fetchLeaves();
    } catch (err) {
      toast.error('Could not cancel leave', err.message);
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
        title="Sick Leave"
        subtitle="Request time off — your members are covered by a temporary trainer while you're away"
        icon={CalendarDaysIcon}
      />

      <div className="card p-5">
        <h2 className="card-title">Request Sick Leave</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sl-start" className="mb-1 block text-sm font-medium text-slate-700">Start date</label>
            <input
              id="sl-start"
              type="date"
              required
              value={startDate}
              min={toDateInput(new Date())}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="sl-end" className="mb-1 block text-sm font-medium text-slate-700">End date</label>
            <input
              id="sl-end"
              type="date"
              required
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sl-reason" className="mb-1 block text-sm font-medium text-slate-700">Reason</label>
            <textarea
              id="sl-reason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fever, recovery, personal emergency…"
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sl-cert" className="mb-1 block text-sm font-medium text-slate-700">
              Medical certificate <span className="text-xs font-normal text-slate-500">(JPEG, PNG or PDF — required before approval)</span>
            </label>
            <input
              id="sl-cert"
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setCertificate(e.target.files?.[0] || null)}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500">
              Your certificate is stored privately — it is never shown to other members or trainers.
            </p>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting} className="btn btn-md btn-primary">
              {submitting ? <LoadingSpinner size="sm" /> : <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />}
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
      ) : error ? (
        <ErrorState message="We couldn't load your leave requests." onRetry={fetchLeaves} />
      ) : leaves.length === 0 ? (
        <div className="card py-8">
          <EmptyState icon={CalendarDaysIcon} message="No leave requests yet" description="Submitted requests and their approval status will appear here." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="card-title">My Requests</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Dates</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Certificate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Cover</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaves.map((leave) => {
                  const canManage = ['PENDING', 'APPROVED'].includes(leave.status);
                  return (
                    <tr key={leave._id} className="odd:bg-transparent even:bg-surface/60">
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
                            <EyeIcon className="h-3.5 w-3.5" aria-hidden="true" /> View
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">None attached</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {leave.coverage?.covered > 0 ? (
                          <span className="badge badge-success">{leave.coverage.covered} member{leave.coverage.covered === 1 ? '' : 's'} covered</span>
                        ) : leave.status === 'APPROVED' ? (
                          <span className="badge badge-muted">No cover yet</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {canManage && (
                            <button onClick={() => setUploadFor(uploadFor === leave._id ? null : leave._id)} className="btn btn-sm btn-outline" title="Attach or replace certificate">
                              <DocumentArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {canManage && (
                            <button onClick={() => handleCancel(leave._id)} className="btn btn-sm btn-outline" title="Cancel this leave">
                              <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {uploadFor === leave._id && (
                          <input
                            type="file"
                            accept="image/jpeg,image/png,application/pdf"
                            autoFocus
                            onChange={(e) => handleUpload(leave._id, e.target.files?.[0])}
                            className="mt-2 w-full text-xs text-slate-500"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
