import { NavLink } from 'react-router-dom';
import {
  ChartBarIcon,
  UsersIcon,
  UserGroupIcon,
  CreditCardIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
  ChartPieIcon,
  ServerStackIcon,
  BoltIcon,
  TrophyIcon,
  CalendarDaysIcon,
  IdentificationIcon,
  MegaphoneIcon,
  XMarkIcon,
  Cog6ToothIcon,
  BellIcon,
  ScaleIcon,
  HeartIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import Avatar from './Avatar';

const adminMenu = [
  { label: 'Overview', items: [{ to: '/admin', icon: ChartBarIcon, label: 'Dashboard', end: true }] },
  {
    label: 'Management',
    items: [
      { to: '/admin/members', icon: UsersIcon, label: 'Members' },
      { to: '/admin/trainers', icon: UserGroupIcon, label: 'Trainers' },
      { to: '/admin/memberships', icon: CreditCardIcon, label: 'Memberships' },
      { to: '/admin/payments', icon: BanknotesIcon, label: 'Payments' },
      { to: '/admin/attendance', icon: ClipboardDocumentListIcon, label: 'Attendance' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/equipment', icon: WrenchScrewdriverIcon, label: 'Equipment' },
      { to: '/admin/announcements', icon: MegaphoneIcon, label: 'Announcements' },
      { to: '/admin/sick-leaves', icon: HeartIcon, label: 'Trainer Sick Leaves' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/admin/analytics', icon: ChartPieIcon, label: 'Reports & Charts' },
      { to: '/admin/all-data', icon: ServerStackIcon, label: 'All Data' },
    ],
  },
  { label: 'System', items: [{ to: '/admin/settings', icon: Cog6ToothIcon, label: 'Settings' }] },
];

const trainerMenu = [
  { label: 'Overview', items: [{ to: '/trainer', icon: ChartBarIcon, label: 'Dashboard', end: true }] },
  {
    label: 'Management',
    items: [
      { to: '/trainer/members', icon: UsersIcon, label: 'My Members' },
      { to: '/trainer/attendance', icon: CalendarDaysIcon, label: 'Attendance' },
    ],
  },
  {
    label: 'Training',
    items: [
      { to: '/trainer/workouts', icon: BoltIcon, label: 'Workout Plans' },
      { to: '/trainer/templates', icon: ClipboardDocumentListIcon, label: 'Templates' },
    ],
  },
  {
    label: 'Availability',
    items: [
      { to: '/trainer/sick-leave', icon: HeartIcon, label: 'Sick Leave' },
    ],
  },
  { label: 'Account', items: [{ to: '/trainer/profile', icon: IdentificationIcon, label: 'Profile' }] },
];

const memberMenu = [
  { label: 'Overview', items: [{ to: '/member', icon: ChartBarIcon, label: 'Dashboard', end: true }] },
  {
    label: 'Membership',
    items: [
      { to: '/member/membership', icon: CreditCardIcon, label: 'My Membership' },
      { to: '/member/payments', icon: BanknotesIcon, label: 'Payments' },
      { to: '/member/attendance', icon: CalendarDaysIcon, label: 'Attendance' },
    ],
  },
  {
    label: 'Training',
    items: [
      { to: '/member/workouts', icon: BoltIcon, label: 'Workouts' },
      { to: '/member/goals', icon: TrophyIcon, label: 'Goals' },
      { to: '/member/progress', icon: ScaleIcon, label: 'Progress' },
    ],
  },
  {
    label: 'Wellness',
    items: [{ to: '/member/diet', icon: ClipboardDocumentListIcon, label: 'Diet' }],
  },
  {
    label: 'Communication',
    items: [
      { to: '/member/notifications', icon: BellIcon, label: 'Notifications' },
      { to: '/member/announcements', icon: MegaphoneIcon, label: 'Announcements' },
    ],
  },
  { label: 'Account', items: [{ to: '/member/profile', icon: IdentificationIcon, label: 'Profile' }] },
];

const menuMap = { admin: adminMenu, trainer: trainerMenu, member: memberMenu };

export default function Sidebar({ open = false, onClose }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const groups = menuMap[user?.role] || [];
  const [gymName, setGymName] = useState('');
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event) => setIsDesktop(event.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!open || isDesktop) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, isDesktop, onClose]);

  useEffect(() => {
    let cancelled = false;
    api.get('/settings')
      .then((res) => {
        if (!cancelled && res.data?.settings?.name) setGymName(res.data.settings.name);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const close = () => onClose && onClose();

  const handleLogout = async () => {
    close();
    const ok = await toast.confirm({
      title: 'Log out?',
      description: "You'll be signed out of your account.",
      confirmLabel: 'Logout',
      danger: true,
    });
    if (ok) logout();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={`w-72 bg-sidebar border-r border-border flex flex-col min-h-screen fixed left-0 top-0 z-50 transition-transform duration-300 lg:translate-x-0 lg:z-30 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
        inert={!isDesktop && !open ? true : undefined}
      >
        <div className="px-5 py-5 border-b border-border flex items-center gap-3">
          <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shrink-0 shadow-[0_0_24px_-6px_rgba(85,230,220,0.55)]">
            <BoltIcon className="h-5 w-5 text-primary-fg" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-none truncate">
              {gymName || 'FitSync AI'}
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 mt-1.5 leading-none">
              Performance OS
            </p>
          </div>
          <button
            onClick={close}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 hover:bg-surface-raised rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-6 scrollbar-none">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-[0.16em]">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={close}
                    title={item.label}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-nav-active text-slate-900'
                          : 'text-slate-500 hover:bg-surface-hover hover:text-slate-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-500 transition-opacity ${
                            isActive ? 'opacity-100 shadow-[0_0_12px_rgba(85,230,220,0.8)]' : 'opacity-0'
                          }`}
                          aria-hidden="true"
                        />
                        <item.icon
                          className={`h-5 w-5 shrink-0 transition-colors ${
                            isActive ? 'text-brand-500' : 'text-slate-500 group-hover:text-slate-700'
                          }`}
                          aria-hidden="true"
                        />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised/50 px-3 py-2.5">
            <Avatar name={user?.name} src={user?.avatar} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name || 'User'}</p>
              <p className="text-[11px] text-slate-500 capitalize">{user?.role || 'user'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:text-danger hover:bg-danger/10 transition-colors"
              aria-label="Log out"
              title="Log out"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}