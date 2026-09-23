import { useState, useEffect } from 'react';
import {
  CreditCardIcon,
  CheckCircleIcon,
  AcademicCapIcon,
  UserIcon,
  ClockIcon,
  BuildingOffice2Icon,
  BanknotesIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import ProgressBar from '../../components/common/ProgressBar';
import Avatar from '../../components/common/Avatar';
import { Skeleton, SkeletonCard } from '../../components/common/Skeleton';
import { toINR, fmtDate } from '../../utils/format';

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

  const scrollToPlans = () => {
    document.getElementById('buy-membership')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="page-wrap space-y-6">
        <Skeleton width="w-48" height="h-8" />
        <Skeleton width="w-80" height="h-4" />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-wrap">
        <ErrorState message="We couldn't load your membership right now. Please try again." onRetry={fetchData} />
      </div>
    );
  }

  const current = memberships[0] || null;
  const currentPlan = current?.plan || {};
  const currentPlanPrice = Number(currentPlan.price) > 0 ? toINR(currentPlan.price) : null;
  const daysRemaining = current?.daysRemaining ?? null;
  const progressPercent = Math.min(100, Math.max(0, Number(current?.progressPercent) || 0));
  const progressTone = daysRemaining === 0 ? 'danger' : daysRemaining !== null && daysRemaining <= 7 ? 'warning' : 'brand';

  const buildIncludes = (plan) => {
    const items = [];
    if (Array.isArray(plan?.features)) items.push(...plan.features);
    if (plan?.trainerIncluded) items.push(`${allocationLabel(plan.trainerAllocationMode)}`);
    if (plan?.workoutPlanIncluded) items.push('Workout plan');
    if (plan?.paymentMode === 'INSTALLMENT' && Number(plan.installments) > 1) {
      items.push(`${plan.installments} installments of ${toINR(plan.installmentAmount)}`);
    }
    return items;
  };

  const renderTrainerSection = () => {
    const trainer = current?.trainer || myProfile?.assignedTrainer;
    const status = current?.trainerAssignmentStatus || myProfile?.trainerAssignmentStatus;
    if (trainer?.name) {
      return (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={trainer.name} src={trainer.avatar} size="lg" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900">{trainer.name}</p>
              {Array.isArray(trainer.profile?.specializations) && trainer.profile.specializations.length > 0 && (
                <p className="truncate text-xs text-slate-500">{trainer.profile.specializations.join(', ')}</p>
              )}
              {trainer.email && <p className="truncate text-xs text-slate-400">{trainer.email}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {trainer.profile?.isAvailable === false ? <span className="badge badge-muted">Away</span> : <span className="badge badge-success">Available</span>}
            {trainer.profile?.experience ? <span className="badge badge-brand">{trainer.profile.experience} yr experience</span> : null}
          </div>
        </div>
      );
    }
    if (String(status).toUpperCase() === 'PENDING') {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Trainer assignment pending</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Your plan entitles you to a trainer. Our team is matching you with the right fit — you'll see them here as soon as they're assigned.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-3 rounded-full bg-slate-100 p-3">
          <UserIcon className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-slate-700">No trainer assigned yet</p>
        <p className="mt-1 text-xs text-slate-400">Pick a plan that includes coach support to get one.</p>
        <button onClick={scrollToPlans} className="btn btn-md btn-primary mt-4">
          Browse Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  const currentPlanId = currentPlan._id;

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="My Membership"
        subtitle="Your plan, payments and renewals at a glance"
        icon={CreditCardIcon}
      />

      {!current ? (
        <div className="card">
          <EmptyState
            icon={BuildingOffice2Icon}
            message="You don't have a membership yet"
            description="Choose a plan below to get full access to the gym and its perks."
            action={
              <button onClick={scrollToPlans} className="btn btn-md btn-primary">
                Explore Membership Plans <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="card-dark relative overflow-hidden rounded-xl border-ink-700 p-6 sm:p-7">
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: 'linear-gradient(#a3e635 1px, transparent 1px), linear-gradient(90deg, #a3e635 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
              aria-hidden="true"
            />
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="section-title text-slate-400">Current Membership</p>
                  <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{currentPlan.name || 'Membership'}</h2>
                  <p className="mt-1 font-mono text-xs text-slate-400">{current.membershipId || '—'}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <StatusBadge value={current.status} />
                    <StatusBadge value="yes" label={current.autoRenew ? 'Auto-renew on' : 'Auto-renew off'} tone={current.autoRenew ? 'success' : 'muted'} />
                    <StatusBadge value={current.paymentStatus} />
                  </div>
                </div>
                {currentPlanPrice && (
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Plan value</p>
                    <p className="text-2xl font-bold text-brand-400 tabular-nums">{currentPlanPrice}</p>
                  </div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-ink-800/70 p-4">
                  <p className="text-xs text-slate-400">Plan validity</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {fmtDate(current.startDate)} <span className="text-slate-500">→</span> {fmtDate(current.endDate)}
                  </p>
                </div>
                <div className="rounded-lg bg-ink-800/70 p-4">
                  <p className="text-xs text-slate-400">Days remaining</p>
                  <p className="mt-1 text-2xl font-bold text-brand-400 tabular-nums">
                    {daysRemaining === null ? '—' : `${daysRemaining} DAY${daysRemaining === 1 ? '' : 'S'}`}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <ProgressBar value={progressPercent} tone={progressTone} label="Plan period elapsed" />
              </div>

              {(current.payments || []).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="badge badge-success">Paid {toINR(current.paidTotal)}</span>
                  {Number(current.pendingTotal || 0) > 0 && (
                    <span className="badge badge-warning">
                      <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" /> Pending {toINR(current.pendingTotal)}
                    </span>
                  )}
                  {current.status === 'SUSPENDED' && <span className="badge badge-danger">Suspended by the gym</span>}
                </div>
              )}

              {(current.payments || []).length === 0 && Number(currentPlan.price || 0) > 0 && (
                <div className="mt-4">
                  <span className="badge badge-warning">Pending {toINR(current.pendingTotal)}</span>
                </div>
              )}

              <div className="mt-6">
                <p className="section-title text-slate-400">What your plan includes</p>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {buildIncludes(currentPlan)
                    .filter(Boolean)
                    .map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-200">
                        <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <AcademicCapIcon className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 className="card-title">Your Trainer</h2>
            </div>
            {renderTrainerSection()}
          </div>
        </>
      )}

      <div id="buy-membership" className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <h2 className="card-title">Buy / Renew Membership</h2>
          <span className="text-xs text-slate-400">Prices in INR, inclusive of applicable charges</span>
        </div>
        {plansLoading ? (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = currentPlanId && String(plan._id) === String(currentPlanId);
              return (
                <div key={plan._id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                    {isCurrent && <span className="badge badge-success">Current plan</span>}
                  </div>
                  <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{toINR(plan.price)}</p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">{plan.duration} DAYS</p>

                  {plan.paymentMode === 'INSTALLMENT' && Number(plan.installments) > 1 ? (
                    <p className="mt-1 text-sm text-amber-700">
                      Pay in {plan.installments} installments of {toINR(plan.installmentAmount)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">Payable in full</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {plan.trainerIncluded && (
                      <span className="badge badge-brand">{allocationLabel(plan.trainerAllocationMode)}</span>
                    )}
                    {plan.workoutPlanIncluded && (
                      <span className="badge badge-success">Workout plans included</span>
                    )}
                    {plan.paymentMode === 'INSTALLMENT' && (
                      <span className="badge badge-warning">Installments</span>
                    )}
                    {Array.isArray(plan.features) && plan.features.slice(0, 3).map((f, i) => (
                      <span key={i} className="badge badge-muted">{f}</span>
                    ))}
                  </div>

                  <p className="mt-3 flex-1 text-sm text-slate-600">{plan.description}</p>

                  {isCurrent ? (
                    <div className="mt-4 w-full">
                      <button onClick={() => handlePay(plan)} disabled={processing} className="btn btn-md btn-outline w-full">
                        Renew
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handlePay(plan)}
                      disabled={processing}
                      className="btn btn-md btn-primary mt-4 w-full"
                    >
                      {isCounterUpMode ? 'Pay at Gym / Direct UPI' : 'Pay Online'}
                    </button>
                  )}
                  <p className="mt-2 text-center text-xs text-slate-400">
                    {plan.paymentMode === 'INSTALLMENT'
                      ? (isCounterUpMode ? 'At the gym, this plan is paid in fixed installments' : 'Online payment charges the full plan price in one go')
                      : (isCounterUpMode ? 'Pay directly to the gym UPI account' : 'Pay securely with the gateway')}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {current && (
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <BanknotesIcon className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h2 className="card-title">Payment Summary</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-slate-500">Total</p>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">{currentPlanPrice || toINR(0)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Paid</p>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">{toINR(current.paidTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Pending</p>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">{toINR(current.pendingTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Status</p>
              <div className="mt-1.5"><StatusBadge value={current.paymentStatus} /></div>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="card-title">Payment History</h2>
        </div>
        {(current?.payments || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(current.payments || []).map((p) => (
                  <tr key={p._id} className="odd:bg-white even:bg-slate-50/60">
                    <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(p.date)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900 tabular-nums">{toINR(p.amount)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 capitalize">{(p.method || '—').toUpperCase()}</td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-500">{p.transactionId || '—'}</td>
                    <td className="px-6 py-4"><StatusBadge value={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6">
            <EmptyState icon={BanknotesIcon} message="No payments yet" description="Once you make a payment, it will show up here." />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="card-title">Membership History</h2>
        </div>
        {memberships.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Start</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">End</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {memberships.map((m) => (
                  <tr key={m._id} className="odd:bg-white even:bg-slate-50/60">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{m.plan?.name || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(m.startDate)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{fmtDate(m.endDate)}</td>
                    <td className="px-6 py-4"><StatusBadge value={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6">
            <EmptyState icon={CreditCardIcon} message="No memberships yet" description="Your membership history will appear here." />
          </div>
        )}
      </div>

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
  );
}