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
    <div className="min-h-screen flex bg-surface">
      {/* Brand panel */}
      <div className="hidden lg:flex w-[46%] bg-brand-600 flex-col justify-between p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-brand-900/20">
            <BoltIcon className="h-6 w-6 text-brand-600" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight leading-none">FitSync</h1>
            <p className="text-xs text-brand-100 mt-1 leading-none">Gym Management System</p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -top-24 right-16 w-40 h-40 rounded-full bg-white/15 blur-3xl" aria-hidden="true" />
          <img
            src={brandFigure}
            alt="Athlete performing a deadlift"
            className="w-64 mx-auto opacity-95 mb-6"
            loading="lazy"
          />
          <h2 className="text-3xl font-bold text-white tracking-tight leading-tight">
            Train hard.
            <br />
            <span className="text-brand-100">Run smart.</span>
          </h2>
          <p className="text-sm text-brand-100 mt-3 max-w-sm leading-relaxed">
            The complete gym operating system for members, trainers and owners.
          </p>
          <div className="mt-8 space-y-4">
            {brandPoints.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <span className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-white/15 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                </span>
                <p className="text-sm text-white/90">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/60">FitSync &middot; Gym Management Platform</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm fade-in">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="h-9 w-9 rounded-lg bg-brand-600 flex items-center justify-center">
              <BoltIcon className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-none">FitSync</h1>
              <p className="text-[11px] text-slate-500 mt-1 leading-none">Gym Management System</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
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
      <Link to={to} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
        {linkText}
      </Link>
    </>
  );
}