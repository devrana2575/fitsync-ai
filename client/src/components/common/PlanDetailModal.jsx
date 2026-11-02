import {
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import Modal from './Modal';
import { toINR } from '../../utils/format';
import { buildPlanInclusions, buildPlanInsights, planTypeLabel } from '../../utils/plans';

export default function PlanDetailModal({ plan, isOpen, onClose, onEdit }) {
  if (!plan) return null;

  const insights = buildPlanInsights(plan);
  const inclusions = buildPlanInclusions(plan);
  const installment = plan.paymentMode === 'INSTALLMENT' && Number(plan.installments) > 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={plan.name}
      description={`${planTypeLabel(plan.duration)} plan · ${plan.duration} days`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">{toINR(insights.price)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                About {toINR(insights.monthly)} per month · {toINR(insights.perDay)} per day
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="badge badge-brand">{insights.tierLabel}</span>
              <span className="badge badge-muted">
                <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {plan.duration} days
              </span>
              {installment ? (
                <span className="badge badge-warning">
                  <BanknotesIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {plan.installments} installments
                </span>
              ) : (
                <span className="badge badge-success">Pay in full</span>
              )}
            </div>
          </div>
        </div>

        {(plan.description || plan.details) && (
          <div>
            <p className="section-title">About this plan</p>
            {plan.description && <p className="mt-1.5 text-sm text-slate-600">{plan.description}</p>}
            {plan.details && <p className="mt-2 text-sm text-slate-600">{plan.details}</p>}
          </div>
        )}

        <div>
          <p className="section-title">What's included</p>
          {inclusions.length === 0 ? (
            <p className="mt-1.5 text-sm text-slate-500">This plan's inclusions have not been detailed yet.</p>
          ) : (
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {inclusions.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="section-title">Best for</p>
            <p className="mt-1.5 text-sm text-slate-600">{insights.idealFor}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="section-title">Payment</p>
            <p className="mt-1.5 text-sm text-slate-600">
              {installment
                ? `Pay in ${plan.installments} installments of ${toINR(plan.installmentAmount)} at the gym counter. The membership activates once the full ${toINR(insights.price)} is covered.`
                : `Pay the full ${toINR(insights.price)} in one payment.`}
            </p>
          </div>
        </div>

        {insights.notes.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="section-title flex items-center gap-1.5">
              <InformationCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Good to know
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
              {insights.notes.map((note) => (
                <li key={note} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {onEdit && (
            <button type="button" onClick={onEdit} className="btn btn-outline btn-md">
              Edit plan
            </button>
          )}
          <button type="button" onClick={onClose} className="btn btn-primary btn-md">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
