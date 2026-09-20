import { useState, useEffect } from 'react';
import { CreditCardIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
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
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [upiInfo, setUpiInfo] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

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

  const fetchPlans = async () => {
    try {
      setPlansLoading(true);
      const res = await api.get('/membership-plans');
      setPlans(res.data.plans || []);
    } catch {
    } finally {
      setPlansLoading(false);
    }
  };

  useEffect(() => { fetchData(); fetchPlans(); }, []);

  const handlePay = async (plan) => {
    try {
      setProcessing(true);
      const res = await api.post('/checkout/create', { planId: plan._id });
      const { mode, url, payment } = res.data;
      if (mode === 'stripe' && url) {
        window.location.assign(url);
      } else if (mode === 'upi') {
        setSelectedPlan({ ...plan, paymentId: payment });
        setUpiInfo(res.data);
        setModalOpen(true);
        setQrLoading(true);
        try {
          const qr = await api.get(`/checkout/upi/qr/${payment}`, { responseType: 'blob' });
          setQrUrl(URL.createObjectURL(qr.data));
        } catch (err) {
          alert(err.message || 'Failed to load payment QR');
        } finally {
          setQrLoading(false);
        }
      } else if (mode === 'demo') {
        setSelectedPlan({ ...plan, paymentId: payment });
        setModalOpen(true);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    if (qrUrl) { URL.revokeObjectURL(qrUrl); setQrUrl(null); }
    setSelectedPlan(null);
    setUpiInfo(null);
  };

  const handleConfirmUpi = async () => {
    try {
      setProcessing(true);
      await api.post(`/checkout/upi/confirm/${upiInfo.payment}`);
      alert('Payment recorded! Your membership is now active.');
      closeModal();
      fetchData();
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmDemo = async () => {
    try {
      setProcessing(true);
      await api.post(`/checkout/confirm/${selectedPlan.paymentId}`);
      alert('Payment successful! Your membership is now active.');
      setModalOpen(false);
      setSelectedPlan(null);
      fetchData();
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

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
                <h3 className="font-semibold text-slate-900">Buy / Renew Membership</h3>
              </div>
              {plansLoading ? (
                <div className="py-10 flex justify-center"><LoadingSpinner /></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
                  {plans.map((plan) => (
                    <div key={plan._id} className="border border-slate-200 rounded-xl p-5 flex flex-col">
                      <h4 className="font-semibold text-slate-900 mb-1">{plan.name}</h4>
                      <p className="text-2xl font-bold text-slate-900 mb-1">₹{Number(plan.price || 0).toLocaleString('en-IN')}</p>
                      <p className="text-sm text-slate-500 mb-2">{plan.duration} days</p>
                      <p className="text-sm text-slate-600 mb-4 flex-1">{plan.description}</p>
                      <button
                        onClick={() => handlePay(plan)}
                        disabled={processing}
                        className="w-full rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 transition-colors"
                      >
                        Pay Online
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

        <Modal isOpen={modalOpen} onClose={() => { if (!processing) closeModal(); }} title={upiInfo ? 'Scan QR to Pay' : 'Confirm Payment'}>
          {upiInfo ? (
            <div className="flex flex-col items-center">
              <p className="text-sm text-slate-500 mb-4">
                Pay <span className="font-semibold text-slate-900">₹{Number(upiInfo.amount || selectedPlan?.price || 0).toLocaleString('en-IN')}</span> for {upiInfo.planName || selectedPlan?.name} using any UPI app (GPay, PhonePe, Paytm).
              </p>
              <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4">
                {qrLoading ? (
                  <div className="h-56 w-56 flex items-center justify-center"><LoadingSpinner /></div>
                ) : qrUrl ? (
                  <img src={qrUrl} alt="UPI payment QR" className="h-56 w-56" />
                ) : (
                  <p className="h-56 w-56 flex items-center justify-center text-sm text-slate-400">QR unavailable</p>
                )}
              </div>
              <table className="text-sm w-full max-w-sm mb-4">
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="py-1.5 text-slate-500">Pay to</td><td className="py-1.5 text-right font-medium text-slate-900">{upiInfo.upiId}</td></tr>
                  <tr><td className="py-1.5 text-slate-500">Name</td><td className="py-1.5 text-right font-medium text-slate-900">{upiInfo.upiName || '—'}</td></tr>
                  <tr><td className="py-1.5 text-slate-500">Amount</td><td className="py-1.5 text-right font-medium text-slate-900">₹{Number(upiInfo.amount || 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td className="py-1.5 text-slate-500">Reference</td><td className="py-1.5 text-right font-mono text-xs text-slate-700">{upiInfo.reference}</td></tr>
                  <tr><td className="py-1.5 text-slate-500">Note</td><td className="py-1.5 text-right text-slate-700">{upiInfo.note || '—'}</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-slate-500 text-center mb-4">
                After you complete the payment in your UPI app, tap confirm below. Our team verifies the transaction against your UPI reference.
              </p>
              <div className="flex justify-end gap-3 w-full">
                <button
                  onClick={closeModal}
                  disabled={processing}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmUpi}
                  disabled={processing}
                  className="rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 text-sm text-white"
                >
                  {processing ? 'Processing…' : 'I have paid'}
                </button>
              </div>
            </div>
          ) : (
            selectedPlan && (
            <div>
              <p className="text-sm text-slate-600 mb-4">
                Demo Mode – Your payment of ₹{Number(selectedPlan.price || 0).toLocaleString('en-IN')} for {selectedPlan.name} is ready. This simulates a successful payment gateway.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={closeModal}
                  disabled={processing}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  onClick={handleConfirmDemo}
                  disabled={processing}
                  className="rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 text-sm text-white"
                >
                  {processing ? 'Processing…' : 'Simulate Payment'}
                </button>
              </div>
            </div>
            )
          )}
        </Modal>
      </div>
    </div>
  );
}