import { useState, useEffect } from 'react';
import { BanknotesIcon, ShieldCheckIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import StatCard from '../../components/common/StatCard';
import { SkeletonRow } from '../../components/common/Skeleton';
import { toINR, fmtDateTime } from '../../utils/format';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);
  const [recentActivity, setRecentActivity] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/payments/my');
      setPayments(res.data.payments || []);
      return res.data.payments || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // The URL `?checkout=...` is only a *return hint* from the gateway. It is
    // never honored as proof of payment by itself - the banner message is
    // derived from what the server actually recorded, so a redirect can never
    // fake success (or cancel) on this page.
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    setRecentActivity(Boolean(checkout));
    if (checkout) {
      params.delete('checkout');
      const qs = params.toString();
      const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  useEffect(() => {
    if (!recentActivity) return;
    const deriveBanner = async () => {
      const list = await fetchData();
      const recentWindow = Date.now() - 5 * 60 * 1000;
      const recent = list.filter((p) => {
        const at = new Date(p.date || p.createdAt).getTime();
        return at >= recentWindow;
      });
      if (recent.some((p) => p.status === 'COMPLETED')) {
        setBanner('success');
      } else if (recent.some((p) => p.status === 'PENDING')) {
        setBanner('pending');
      } else {
        setBanner(null);
      }
    };
    deriveBanner();
  }, [recentActivity]);

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <SkeletonRow rows={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-wrap">
        <ErrorState message="We couldn't load your payments right now. Please try again." onRetry={fetchData} />
      </div>
    );
  }

  const paidTotal = payments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pendingTotal = payments
    .filter((p) => p.status === 'PENDING')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Payment History"
        subtitle="Every payment recorded against your membership — verified, in one place."
        icon={BanknotesIcon}
      />

      {banner === 'success' && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success ring-1 ring-success/25">
          <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          Payment received and verified. Your membership is active.
        </div>
      )}
      {banner === 'pending' && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-4 py-3 text-sm font-medium text-warning ring-1 ring-amber-200">
          <ClockIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          We received your payment request. Your membership activates once the payment is confirmed and verified.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={CheckCircleIcon} label="Total Paid" value={toINR(paidTotal)} color="green" />
        <StatCard icon={ClockIcon} label="Pending" value={toINR(pendingTotal)} color="yellow" />
        <StatCard icon={BanknotesIcon} label="Total Recorded" value={toINR(total)} color="ink" />
      </div>

      {payments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={BanknotesIcon}
            message="No payments yet"
            description="Once you make a payment, it will be recorded here with its status and reference."
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <h2 className="card-title">Payment records</h2>
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <ShieldCheckIcon className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Verified against gateway records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payments.map((p) => (
                  <tr key={p._id} className="odd:bg-transparent even:bg-slate-100/40">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 tabular-nums">{toINR(p.amount)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{p.membership?.plan?.name || '—'}</td>
                    <td className="px-6 py-4 text-sm capitalize text-slate-600">{p.method || '—'}</td>
                    <td className="px-6 py-4"><StatusBadge value={p.status} /></td>
                    <td className="px-6 py-4 text-sm text-slate-600">{fmtDateTime(p.date || p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}