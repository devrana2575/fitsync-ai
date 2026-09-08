import { useState, useEffect } from 'react';
import { CreditCardIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { fmtDate } from '../../utils/format';

const statusMeta = {
  ACTIVE: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  EXPIRED: { label: 'Expired', cls: 'bg-slate-200 text-slate-600' },
  PENDING: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};

export default function Membership() {
  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/memberships/my');
      setMemberships(res.data.memberships || []);
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
        <h1 className="text-2xl font-bold text-slate-900 mb-1">My Membership</h1>
        <p className="text-slate-500 mb-8">Current plan, validity and renewal status</p>

        {memberships.length === 0 ? (
          <EmptyState icon={CreditCardIcon} message="No membership assigned yet" />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {memberships.slice(0, 1).map((m) => {
                const meta = statusMeta[m.status] || statusMeta.PENDING;
                return (
                  <div key={m._id} className="sm:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between mb-2">
                      <h2 className="text-lg font-semibold text-slate-900">{m.plan?.name || 'Membership'}</h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                      {m.plan?.description || `${m.plan?.duration || '—'} day plan`}
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Starts</p>
                        <p className="font-medium text-slate-900">{fmtDate(m.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Ends</p>
                        <p className="font-medium text-slate-900">{fmtDate(m.endDate)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Plan price</p>
                        <p className="font-medium text-slate-900">₹{Number(m.plan?.price || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Auto-renew</p>
                        <p className="font-medium text-slate-900">{m.autoRenew ? 'On' : 'Off'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Membership History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Start</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">End</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {memberships.map((m, i) => {
                      const meta = statusMeta[m.status] || statusMeta.PENDING;
                      return (
                        <tr key={m._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{m.plan?.name || '—'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(m.startDate)}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(m.endDate)}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}