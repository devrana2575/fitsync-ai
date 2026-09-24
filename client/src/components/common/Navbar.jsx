import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BellIcon,
  ChevronDownIcon,
  ArrowRightOnRectangleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon,
  ClipboardDocumentCheckIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import Avatar from './Avatar';

const roleStyles = {
  admin: 'bg-brand-500/15 text-brand-400 ring-1 ring-inset ring-brand-500/25',
  trainer: 'bg-info/12 text-info ring-1 ring-inset ring-info/25',
  member: 'bg-surface-elevated text-slate-400 ring-1 ring-inset ring-slate-300/50',
};

const typeIcons = {
  info: InformationCircleIcon,
  warning: ExclamationTriangleIcon,
  success: CheckCircleIcon,
  error: XCircleIcon,
  membership: SparklesIcon,
  attendance: ClipboardDocumentCheckIcon,
};

const typeTones = {
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  error: 'text-danger',
  membership: 'text-brand-400',
  attendance: 'text-slate-400',
};

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const socket = useSocket();
  const { toast } = useToast();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const notifRef = useRef(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications?limit=1');
      const data = res.data;
      setUnreadCount(data.unreadCount ?? 0);
      setNotifError(false);
    } catch {
      setNotifError(true);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError(false);
    try {
      const res = await api.get('/notifications?limit=10');
      const data = res.data;
      setNotifications(data.notifications || data.data?.notifications || []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      setNotifError(true);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!socket?.socket) return;
    const handler = (n) => {
      setUnreadCount((prev) => prev + 1);
      setNotifications((prev) => (n ? [n, ...prev].slice(0, 20) : prev));
      if (!n) return;
      toast.info(n.title, n.message);
    };
    socket.registerOnNotification(handler);
    return () => socket.registerOnNotification(null);
  }, [socket, toast]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
        if (showNotifications) fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchUnreadCount, fetchNotifications, showNotifications]);

  useEffect(() => {
    if (showNotifications) fetchNotifications();
  }, [showNotifications, fetchNotifications]);

  useEffect(() => {
    if (!showNotifications) return;
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  const handleMarkRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  return (
    <header className="h-16 bg-base/85 backdrop-blur border-b border-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-surface-hover rounded-lg transition-colors"
        aria-label="Open menu"
      >
        <Bars3Icon className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="hidden lg:block text-sm text-slate-500">
        {user?.role ? (
          <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${roleStyles[user.role] || 'bg-surface text-slate-400'}`}>
            {user.role} console
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications((prev) => !prev);
              setShowDropdown(false);
            }}
            className="relative p-2 text-slate-400 hover:text-white hover:bg-surface-hover rounded-lg transition-colors"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          >
            <BellIcon className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] bg-danger text-white text-[10px] font-semibold rounded-full flex items-center justify-center leading-none px-1 ring-2 ring-base">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface-elevated rounded-xl shadow-pop border border-border z-50 max-h-[28rem] flex flex-col anim-pop">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-brand-400 hover:text-brand-300 font-medium">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-border">
                  {notifLoading && notifications.length === 0 && (
                    <p className="px-4 py-6 text-sm text-slate-500 text-center">Loading...</p>
                  )}
                  {notifError && !notifLoading && (
                    <p className="px-4 py-6 text-sm text-danger text-center">
                      Couldn&apos;t load notifications
                    </p>
                  )}
                  {!notifLoading && !notifError && notifications.length === 0 && (
                    <p className="px-4 py-6 text-sm text-slate-500 text-center">No notifications</p>
                  )}
                  {notifications.map((n) => {
                    const TypeIcon = typeIcons[n.type] || BellIcon;
                    return (
                      <button
                        key={n._id}
                        onClick={() => {
                          if (!n.isRead) handleMarkRead(n._id);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors ${
                          !n.isRead ? 'bg-brand-500/8' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <TypeIcon
                            className={`h-5 w-5 mt-0.5 shrink-0 ${typeTones[n.type] || 'text-slate-400'}`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={`text-sm leading-snug ${
                                  !n.isRead ? 'font-semibold text-slate-900' : 'text-slate-400'
                                }`}
                              >
                                {n.title}
                              </p>
                              {!n.isRead && (
                                <span className="shrink-0 h-2 w-2 bg-brand-500 rounded-full" />
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{timeAgo(n.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile separator */}
        <span className="hidden sm:block h-6 w-px bg-border" aria-hidden="true" />

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowDropdown(!showDropdown);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-surface-hover rounded-lg transition-colors"
            aria-expanded={showDropdown}
            aria-haspopup="menu"
          >
            <Avatar name={user?.name} src={user?.avatar} size="sm" />
            <div className="text-left hidden md:block">
              <p className="text-sm font-medium text-slate-500 leading-tight">
                {user?.name || 'User'}
              </p>
              <span
                className={`inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded-md font-medium capitalize ${roleStyles[user?.role] || 'bg-surface text-slate-400'}`}
              >
                {user?.role || 'user'}
              </span>
            </div>
            <ChevronDownIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-surface-elevated rounded-xl shadow-pop border border-border py-1 z-50 anim-pop" role="menu">
              <div className="px-4 py-2.5 border-b border-border">
                <p className="text-sm font-medium text-slate-500 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${roleStyles[user?.role] || 'bg-surface text-slate-400'}`}>
                  {user?.role || 'user'}
                </span>
              </div>
              <button
                onClick={async () => {
                  const ok = await toast.confirm({
                    title: 'Log out?',
                    description: "You'll be signed out of your account.",
                    confirmLabel: 'Logout',
                    danger: true,
                  });
                  if (ok) logout();
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/10 flex items-center gap-2"
                role="menuitem"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}