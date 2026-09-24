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
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
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
  const { user } = useAuth();
  const groups = menuMap[user?.role] || [];
  const [gymName, setGymName] = useState('');

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

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={close} aria-hidden="true" />
      )}
      <aside
        className={`w-72 bg-ink-950 border-r border-ink-800 flex flex-col min-h-screen fixed left-0 top-0 z-50 transition-transform lg:translate-x-0 lg:z-30 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="px-5 py-5 border-b border-ink-800 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
            <BoltIcon className="h-5 w-5 text-slate-400" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white leading-none truncate">
              {gymName || 'FitSync AI'}
            </h1>
            <p className="text-[11px] text-slate-500 mt-1 leading-none">Gym Management</p>
          </div>
          <button
            onClick={close}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-ink-800 rounded-lg"
            aria-label="Close menu"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={close}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-500/12 text-brand-400'
                          : 'text-slate-400 hover:bg-ink-800 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand-500 transition-opacity ${
                            isActive ? 'opacity-100' : 'opacity-0'
                          }`}
                          aria-hidden="true"
                        />
                        <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-ink-800">
          <div className="flex items-center gap-3 px-2">
            <Avatar name={user?.name} src={user?.avatar} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
              <p className="text-[11px] text-slate-500 capitalize">{user?.role || 'user'}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}