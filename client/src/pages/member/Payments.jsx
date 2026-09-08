import { useState, useEffect } from 'react';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { toINR, fmtDateTime } from '../../utils/format';

const statusMeta = {
  COMPLETED: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  PENDING: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
  FAILED: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
  REFUNDED: { label: 'Refunded', cls: 'bg-purple-100 text-purple-700' },
};

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/payments/my');
      setPayments(res.data.payments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Payment History</h1>
        <p className="text-slate-500 mb-8">All payments recorded for your membership</p>

        {payments.length === 0 ? (
          <EmptyState icon={BanknotesIcon} message="No payments recorded yet" />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payments.map((p, i) => {
                    const meta = statusMeta[p.status] || statusMeta.PENDING;
                    return (
                      <tr key={p._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-900">{toINR(p.amount)}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{p.membership?.plan?.name || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 capitalize">{p.method || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{fmtDateTime(p.date || p.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}