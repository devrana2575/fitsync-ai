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
  ChartBarSquareIcon,
  BoltIcon,
  TrophyIcon,
  CalendarDaysIcon,
  ClockIcon,
  IdentificationIcon,
  CakeIcon,
  MegaphoneIcon,
  CpuChipIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const adminMenu = [
  { to: '/admin', icon: ChartBarIcon, label: 'Dashboard', end: true },
  { to: '/admin/members', icon: UsersIcon, label: 'Members' },
  { to: '/admin/trainers', icon: UserGroupIcon, label: 'Trainers' },
  { to: '/admin/memberships', icon: CreditCardIcon, label: 'Memberships' },
  { to: '/admin/payments', icon: BanknotesIcon, label: 'Payments' },
  { to: '/admin/attendance', icon: ClipboardDocumentListIcon, label: 'Attendance' },
  { to: '/admin/classes', icon: CalendarDaysIcon, label: 'Classes' },
  { to: '/admin/equipment', icon: WrenchScrewdriverIcon, label: 'Equipment' },
  { to: '/admin/announcements', icon: MegaphoneIcon, label: 'Announcements' },
  { to: '/admin/analytics', icon: ChartPieIcon, label: 'Analytics' },
  { to: '/admin/ml-insights', icon: ChartBarSquareIcon, label: 'Member Insights' },
  { to: '/admin/model-training', icon: CpuChipIcon, label: 'Model Training' },
];

const trainerMenu = [
  { to: '/trainer', icon: ChartBarIcon, label: 'Dashboard', end: true },
  { to: '/trainer/members', icon: UsersIcon, label: 'My Members' },
  { to: '/trainer/classes', icon: CalendarDaysIcon, label: 'Classes' },
  { to: '/trainer/attendance', icon: ClipboardDocumentListIcon, label: 'Attendance' },
  { to: '/trainer/workouts', icon: BoltIcon, label: 'Workouts' },
  { to: '/trainer/templates', icon: ClipboardDocumentListIcon, label: 'Templates' },
  { to: '/trainer/meal-plans', icon: CakeIcon, label: 'Meal Plans' },
];

const memberMenu = [
  { to: '/member', icon: ChartBarIcon, label: 'Dashboard', end: true },
  { to: '/member/membership', icon: CreditCardIcon, label: 'Membership' },
  { to: '/member/payments', icon: BanknotesIcon, label: 'Payments' },
  { to: '/member/classes', icon: CalendarDaysIcon, label: 'Classes' },
  { to: '/member/attendance', icon: ClockIcon, label: 'Attendance' },
  { to: '/member/workouts', icon: BoltIcon, label: 'Workouts' },
  { to: '/member/nutrition', icon: CakeIcon, label: 'Nutrition' },
  { to: '/member/goals', icon: TrophyIcon, label: 'Goals' },
  { to: '/member/announcements', icon: MegaphoneIcon, label: 'Announcements' },
  { to: '/member/progress', icon: ChartBarSquareIcon, label: 'Progress' },
  { to: '/member/notifications', icon: ClockIcon, label: 'Notifications' },
  { to: '/member/profile', icon: IdentificationIcon, label: 'Profile' },
];

const menuMap = { admin: adminMenu, trainer: trainerMenu, member: memberMenu };

export default function Sidebar({ open = false, onClose }) {
  const { user } = useAuth();
  const items = menuMap[user?.role] || [];
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
    <aside className={`w-64 bg-white border-r border-slate-200 flex flex-col min-h-screen fixed left-0 top-0 z-40 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-5 py-5 border-b border-slate-100 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <BoltIcon className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 leading-none">
            {gymName || 'FitSync'}
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-none">Gym Management</p>
        </div>
        <button onClick={close} className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg" aria-label="Close menu">
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={close}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">Gym Management System</p>
      </div>
    </aside>
  );
}