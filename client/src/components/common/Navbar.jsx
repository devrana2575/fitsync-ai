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
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import Avatar from './Avatar';

const roleStyles = {
  admin: 'bg-ink-900 text-brand-400 ring-1 ring-ink-700',
  trainer: 'bg-ink-100 text-ink-800 ring-1 ring-ink-200',
  member: 'bg-brand-500 text-ink-950',
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
  info: 'text-sky-500',
  warning: 'text-amber-500',
  success: 'text-emerald-500',
  error: 'text-red-500',
  membership: 'text-brand-600',
  attendance: 'text-slate-500',
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const notifRef = useRef(null);
  const toastId = useRef(0);

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
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-2), { id, ...n }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    };
    socket.registerOnNotification(handler);
    return () => socket.registerOnNotification(null);
  }, [socket]);

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
    <header className="h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
      {toasts.length > 0 && (
        <div className="fixed top-16 right-4 z-[60] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
          {toasts.map((t) => {
            const TIcon = typeIcons[t.type] || BellIcon;
            const tone = typeTones[t.type] || 'text-brand-600';
            return (
              <div key={t.id} className="bg-white rounded-xl shadow-lg shadow-slate-200/70 border border-slate-200 px-4 py-3 flex items-start gap-3 fade-in">
                <TIcon className={`h-5 w-5 mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 leading-snug">{t.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{t.message}</p>
                </div>
                <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} className="text-slate-300 hover:text-slate-500" aria-label="Dismiss">
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        aria-label="Open menu"
      >
        <Bars3Icon className="h-5 w-5" aria-hidden="true" />
      </button>
      <div />
      <div className="flex items-center gap-3">
        {/* Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications((prev) => !prev);
              setShowDropdown(false);
            }}
            className="relative p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Notifications"
          >
            <BellIcon className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center leading-none px-1 ring-2 ring-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg shadow-slate-200/60 border border-slate-200 z-50 max-h-[28rem] flex flex-col fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-brand-700 hover:text-brand-800 font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                  {notifLoading && notifications.length === 0 && (
                    <p className="px-4 py-6 text-sm text-slate-400 text-center">Loading...</p>
                  )}
                  {notifError && !notifLoading && (
                    <p className="px-4 py-6 text-sm text-red-400 text-center">
                      Couldn&apos;t load notifications
                    </p>
                  )}
                  {!notifLoading && !notifError && notifications.length === 0 && (
                    <p className="px-4 py-6 text-sm text-slate-400 text-center">No notifications</p>
                  )}
                  {notifications.map((n) => {
                    const TypeIcon = typeIcons[n.type] || BellIcon;
                    return (
                      <button
                        key={n._id}
                        onClick={() => {
                          if (!n.isRead) handleMarkRead(n._id);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                          !n.isRead ? 'bg-brand-50/50' : ''
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
                                  !n.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'
                                }`}
                              >
                                {n.title}
                              </p>
                              {!n.isRead && (
                                <span className="shrink-0 h-2 w-2 bg-brand-500 rounded-full" />
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
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

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowDropdown(!showDropdown);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Avatar name={user?.name} src={user?.avatar} size="sm" />
            <div className="text-left hidden md:block">
              <p className="text-sm font-medium text-slate-900 leading-tight">
                {user?.name || 'User'}
              </p>
              <span
                className={`inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded-md font-medium capitalize ${roleStyles[user?.role] || 'bg-slate-100 text-slate-600'}`}
              >
                {user?.role || 'user'}
              </span>
            </div>
            <ChevronDownIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg shadow-slate-200/60 border border-slate-200 py-1 z-50 fade-in">
                {confirmingLogout ? (
                  <div className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">Log out?</p>
                    <p className="text-xs text-slate-500 mt-1">You'll be signed out of your account.</p>
                    <div className="flex items-center justify-end gap-2 mt-3">
                      <button
                        onClick={() => setConfirmingLogout(false)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={logout}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => setConfirmingLogout(true)}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
                      Logout
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}