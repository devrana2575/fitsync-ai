import { Link } from 'react-router-dom';
import { BoltIcon, BellAlertIcon, ChartBarIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import brandFigure from '../../assets/brand-figure.svg';

const brandPoints = [
  { icon: ShieldCheckIcon, text: 'Membership, payments and access handled with financial integrity' },
  { icon: ChartBarIcon, text: 'Live dashboards for revenue, attendance and member progress' },
  { icon: BellAlertIcon, text: 'Trainer allocation, workout plans and real-time notifications' },
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex ambient-bg">
      {/* Brand panel */}
      <div className="hidden lg:flex w-[46%] bg-surface/50 border-r border-border flex-col justify-between p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(#55e6dc 1px, transparent 1px), linear-gradient(90deg, #55e6dc 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-brand-700/5 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-[0_0_32px_-8px_rgba(85,230,220,0.6)]">
            <BoltIcon className="h-6 w-6 text-primary-fg" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none font-display">FitSync AI</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500 mt-1.5 leading-none">
              Performance OS
            </p>
          </div>
        </div>

        <div className="relative">
          <img
            src={brandFigure}
            alt="Athlete performing a deadlift"
            className="w-64 mx-auto opacity-90 mb-6 drop-shadow-[0_0_36px_rgba(85,230,220,0.18)]"
            loading="lazy"
          />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-700 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            Performance intelligence
          </span>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight font-display">
            Train hard.
            <br />
            <span className="bg-gradient-to-r from-brand-500 to-brand-700 bg-clip-text text-transparent">
              Run smart.
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-3 max-w-sm leading-relaxed">
            The complete gym operating system for members, trainers and owners.
          </p>
          <div className="mt-8 space-y-4">
            {brandPoints.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <span className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-surface-raised ring-1 ring-inset ring-border flex items-center justify-center">
                  <Icon className="h-4 w-4 text-brand-500" aria-hidden="true" />
                </span>
                <p className="text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">FitSync &middot; Gym Management Platform</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="w-full max-w-sm fade-in">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-[0_0_24px_-6px_rgba(85,230,220,0.55)]">
              <BoltIcon className="h-5 w-5 text-primary-fg" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none font-display">FitSync AI</h1>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-none uppercase tracking-[0.14em]">Performance OS</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-display">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function AuthFooter({ text, linkText, to }) {
  return (
    <>
      <span className="text-sm text-slate-500">{text} </span>
      <Link to={to} className="text-sm font-semibold text-brand-600 hover:text-brand-800">
        {linkText}
      </Link>
    </>
  );
}
