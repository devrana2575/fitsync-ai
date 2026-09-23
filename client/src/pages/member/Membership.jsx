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
  SUSPENDED: { label: 'Suspended', cls: 'bg-orange-100 text-orange-700' },
};

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

const loadRazorpayCheckout = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay failed to load')));
    script.onerror = () => reject(new Error('Razorpay failed to load. Check your connection and try again.'));
    document.body.appendChild(script);
  });

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
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [myProfile, setMyProfile] = useState(null);

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

  const fetchProfile = async () => {
    try {
      const res = await api.get('/auth/me');
      setMyProfile(res.data.profile || null);
    } catch {
      setMyProfile(null);
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

  const fetchPaymentMethod = async () => {
    try {
      const res = await api.get('/settings');
      setPaymentMethod(res.data.payment?.method || null);
    } catch {
      setPaymentMethod(null);
    }
  };

  useEffect(() => { fetchData(); fetchPlans(); fetchPaymentMethod(); fetchProfile(); }, []);

  const planById = new Map(plans.map((p) => [p._id, p]));

  const isCounterUpMode = paymentMethod === 'upi';

  const allocationLabel = (mode) => {
    const map = {
      SHARED: 'Shared trainer pool',
      ASSIGNED: 'Assigned trainer',
      DEDICATED: 'Dedicated trainer',
      NONE: 'No trainer included',
    };
    return map[mode] || 'No trainer included';
  };

  const openRazorpayCheckout = (order) => {
    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      order_id: order.orderId,
      name: 'FitSync AI',
      description: `${order.planName} Membership`,
      handler: async (response) => {
        try {
          setProcessing(true);
          const res = await api.post('/checkout/razorpay/verify', {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });
          alert(res.data.message || 'Payment successful! Your membership is now active.');
          fetchData();
        } catch (err) {
          alert(err.message);
          fetchData();
        } finally {
          setProcessing(false);
        }
      },
      theme: { color: '#16a34a' },
    };
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (failed) => {
      const code = failed?.error?.code || '';
      if (code === 'PAYMENT_CANCELLED') {
        alert('Payment cancelled. No charge was made.');
      } else {
        alert('Payment was not completed at the gateway. No charge was made.');
      }
      fetchData();
    });
    rzp.open();
  };

  const handleRazorpayPay = async (plan) => {
    try {
      try {
        await loadRazorpayCheckout();
      } catch (err) {
        alert(err.message);
        return;
      }
      setProcessing(true);
      const res = await api.post('/checkout/razorpay/order', { planId: plan._id });
      openRazorpayCheckout(res.data);
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handlePay = async (plan) => {
    try {
      setProcessing(true);
      if (paymentMethod === 'razorpay') {
        await handleRazorpayPay(plan);
        return;
      }
      const res = await api.post('/checkout/create', { planId: plan._id });
      const { mode, url, payment } = res.data;
      if (mode === 'stripe' && url) {
        window.location.assign(url);
      } else if (mode === 'razorpay') {
        await handleRazorpayPay(plan);
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
      alert('Payment submitted for verification by the gym. Your membership will activate once the payment is confirmed.');
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
                const progress = Math.min(100, Math.max(0, Number(m.progressPercent) || 0));
                const daysRemaining = m.daysRemaining ?? '—';
                const trainer = m.trainer || myProfile?.assignedTrainer;
                return (
                  <div key={m._id} className="sm:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">{m.plan?.name || 'Membership'}</h2>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{m.membershipId || '—'}</p>
                      </div>
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
                        <p className="text-slate-500">Days remaining</p>
                        <p className="font-medium text-slate-900">{daysRemaining === '—' ? '—' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Auto-renew</p>
                        <p className="font-medium text-slate-900">{m.autoRenew ? 'On' : 'Off'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Your trainer</p>
                        <p className="font-medium text-slate-900">{trainer?.name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Workout plans</p>
                        <p className="font-medium text-slate-900">
                          {planById.get(m.plan?._id)?.workoutPlanIncluded ? 'Included' : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>Plan duration elapsed</span>
                        <span>{m.durationDays ? `${progress}%` : '—'}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-green-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {(m.payments || []).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          Paid ₹{Number(m.paidTotal || 0).toLocaleString('en-IN')}
                        </span>
                        {Number(m.pendingTotal || 0) > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            Pending ₹{Number(m.pendingTotal || 0).toLocaleString('en-IN')}
                          </span>
                        )}
                        {m.paymentStatus && (
                          <span className={`px-2.5 py-0.5 rounded-full font-medium ${m.paymentStatus === 'PAID' ? 'bg-green-50 text-green-700' : m.paymentStatus === 'PARTIAL' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                            {m.paymentStatus === 'PAID' ? 'Fully paid' : m.paymentStatus === 'PARTIAL' ? 'Partially paid' : 'Payment pending'}
                          </span>
                        )}
                        {m.status === 'SUSPENDED' && (
                          <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700">Suspended by the gym</span>
                        )}
                      </div>
                    )}
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
                      {plan.paymentMode === 'INSTALLMENT' && Number(plan.installments) > 1 ? (
                        <p className="text-sm text-amber-700 mb-1">
                          Pay in {plan.installments} installments of ₹{Number(plan.installmentAmount || 0).toLocaleString('en-IN')}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500 mb-1">Payable in full</p>
                      )}
                      <p className="text-sm text-slate-500 mb-2">{plan.duration} days</p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {plan.trainerIncluded && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
                            {allocationLabel(plan.trainerAllocationMode)}
                          </span>
                        )}
                        {plan.workoutPlanIncluded && (
                          <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                            Workout plans included
                          </span>
                        )}
                        {plan.paymentMode === 'INSTALLMENT' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                            Installments
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-4 flex-1">{plan.description}</p>
                      <button
                        onClick={() => handlePay(plan)}
                        disabled={processing}
                        className="w-full rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2 transition-colors"
                      >
                        {isCounterUpMode ? 'Pay at Gym / Direct UPI' : 'Pay Online'}
                      </button>
                      <p className="mt-2 text-xs text-slate-400 text-center">
                        {plan.paymentMode === 'INSTALLMENT'
                          ? (isCounterUpMode ? 'At the gym, this plan is paid in fixed installments' : 'Online payment charges the full plan price in one go')
                          : (isCounterUpMode ? 'Pay directly to the gym UPI account' : 'Pay securely with the gateway')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {memberships[0]?.payments?.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Payment History</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Method</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Reference</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(memberships[0]?.payments || []).map((p) => (
                        <tr key={p._id}>
                          <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(p.date)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">₹{Number(p.amount || 0).toLocaleString('en-IN')}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{(p.method || '—').toUpperCase()}</td>
                          <td className="px-6 py-4 text-sm text-slate-500 font-mono">{p.transactionId || '—'}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              p.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                                : p.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700'
                                : p.status === 'REFUNDED' ? 'bg-orange-100 text-orange-700'
                                : p.status === 'FAILED' ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {p.status?.toLowerCase?.() ? p.status[0] + p.status.slice(1).toLowerCase() : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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

        <Modal isOpen={modalOpen} onClose={() => { if (!processing) closeModal(); }} title={upiInfo ? (isCounterUpMode ? 'Pay at Gym / Direct UPI' : 'Scan QR to Pay') : 'Confirm Payment'}>
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