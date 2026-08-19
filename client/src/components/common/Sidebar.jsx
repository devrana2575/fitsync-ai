import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const adminMenu = [
  { to: '/admin', icon: '📊', label: 'Dashboard', end: true },
  { to: '/admin/members', icon: '👥', label: 'Members' },
  { to: '/admin/trainers', icon: '🏋️', label: 'Trainers' },
  { to: '/admin/memberships', icon: '💳', label: 'Memberships' },
  { to: '/admin/payments', icon: '💰', label: 'Payments' },
  { to: '/admin/attendance', icon: '📋', label: 'Attendance' },
  { to: '/admin/equipment', icon: '🔧', label: 'Equipment' },
  { to: '/admin/analytics', icon: '📈', label: 'Analytics' },
  { to: '/admin/ml-insights', icon: '🤖', label: 'ML Insights' },
];

const trainerMenu = [
  { to: '/trainer', icon: '📊', label: 'Dashboard', end: true },
  { to: '/trainer/members', icon: '👥', label: 'My Members' },
  { to: '/trainer/workouts', icon: '💪', label: 'Workouts' },
];

const memberMenu = [
  { to: '/member', icon: '📊', label: 'Dashboard', end: true },
  { to: '/member/attendance', icon: '📋', label: 'Attendance' },
  { to: '/member/workouts', icon: '💪', label: 'Workouts' },
  { to: '/member/goals', icon: '🎯', label: 'Goals' },
  { to: '/member/progress', icon: '📈', label: 'Progress' },
];

const menuMap = { admin: adminMenu, trainer: trainerMenu, member: memberMenu };

export default function Sidebar() {
  const { user } = useAuth();
  const items = menuMap[user?.role] || [];

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen fixed left-0 top-0 z-30">
      <div className="px-6 py-5 border-b border-slate-700">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-indigo-400">Fit</span>Sync <span className="text-indigo-400">AI</span>
        </h1>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">FitSync AI v1.0</p>
      </div>
    </aside>
  );
}
