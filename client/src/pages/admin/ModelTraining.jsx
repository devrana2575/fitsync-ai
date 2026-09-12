import { useState, useEffect } from 'react';
import { CpuChipIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import StatCard from '../../components/common/StatCard';

export default function ModelTraining() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retraining, setRetraining] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/training/jobs');
      setJobs(res.data.jobs || []);
    } catch (err) {
      setError(err.message || 'Failed to load training jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleRetrain = async () => {
    setRetraining(true);
    setFeedback(null);
    try {
      const res = await api.post('/training/retrain', null, { timeout: 600000 });
      setFeedback({ type: 'success', text: res.data.message || 'Retraining completed successfully.' });
      fetchJobs();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Retraining failed.' });
    } finally {
      setRetraining(false);
    }
  };

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter((j) => j.status === 'completed').length;
  const failedJobs = jobs.filter((j) => j.status === 'failed').length;
  const mostRecentDate = jobs.length > 0 ? new Date(jobs[0].startedAt || jobs[0].finishedAt).toLocaleDateString('en-IN') : '—';

  const typeBadge = (t) => {
    const map = { scheduled: 'bg-sky-100 text-sky-700', manual: 'bg-violet-100 text-violet-700' };
    return map[t] || 'bg-slate-100 text-slate-700';
  };

  const statusBadge = (s) => {
    const map = { running: 'bg-amber-100 text-amber-700', completed: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700' };
    return map[s] || 'bg-slate-100 text-slate-700';
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN') : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Model Training</h1>
        <button onClick={handleRetrain} disabled={retraining} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
          {retraining && <LoadingSpinner size="sm" />}
          {retraining ? 'Retraining...' : '+ Retrain Models Now'}
        </button>
      </div>

      {feedback && (
        <div className={`rounded-xl p-4 text-sm font-medium ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {feedback.text}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={CpuChipIcon} label="Total Jobs" value={totalJobs} color="indigo" />
          <StatCard icon={CheckCircleIcon} label="Completed" value={completedJobs} color="green" />
          <StatCard icon={XCircleIcon} label="Failed" value={failedJobs} color="red" />
          <StatCard icon={ClockIcon} label="Most Recent Run" value={mostRecentDate} color="blue" />
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-4">{error}</p>
          <button onClick={fetchJobs} className="text-indigo-600 hover:text-indigo-800 font-medium">Retry</button>
        </div>
      ) : loading ? <LoadingSpinner size="lg" /> : jobs.length === 0 ? (
        <EmptyState icon={CpuChipIcon} message="No training jobs found" />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Members</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Models</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Started</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job, i) => (
                <tr key={job._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeBadge(job.jobType)}`}>{job.jobType}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${statusBadge(job.status)}`}>
                      {job.status === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{job.memberCount ?? '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{job.models?.length ?? 0}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(job.startedAt)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(job.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {jobs[0]?.details && (
            <div className="border-t border-slate-200 px-6 py-4">
              <details open>
                <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:text-slate-900">Latest Job Details</summary>
                <pre className="mt-2 text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-4">{typeof jobs[0].details === 'string' ? jobs[0].details : JSON.stringify(jobs[0].details, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
