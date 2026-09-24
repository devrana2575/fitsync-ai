import { useState, useEffect } from 'react';
import {
  BellIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  SparklesIcon,
  ClipboardDocumentCheckIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { SkeletonRow } from '../../components/common/Skeleton';

const NOTIFICATION_TYPES = [
  { value: 'membership_expiry', label: 'Membership expiry' },
  { value: 'high_risk', label: 'High risk alerts' },
  { value: 'progress_anomaly', label: 'Progress anomalies' },
  { value: 'payment_due', label: 'Payment reminders' },
  { value: 'announcement', label: 'Announcements' },
];

const typeIcons = {
  membership_expiry: SparklesIcon,
  payment_due: ExclamationTriangleIcon,
  low_attendance: InformationCircleIcon,
  high_risk: XCircleIcon,
  progress_anomaly: ExclamationTriangleIcon,
  equipment_maintenance: WrenchScrewdriverIcon,
  general: InformationCircleIcon,
  workout_reminder: ClipboardDocumentCheckIcon,
};

const typeTones = {
  membership_expiry: 'text-brand-400',
  payment_due: 'text-warning',
  low_attendance: 'text-info',
  high_risk: 'text-danger',
  progress_anomaly: 'text-warning',
  equipment_maintenance: 'text-slate-500',
  general: 'text-info',
  workout_reminder: 'text-success',
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
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    smsNotifications: false,
    notifyTypes: [],
  });
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefError, setPrefError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications', { params: { limit: 50, unreadOnly: unreadOnly ? 'true' : undefined } });
      setNotifications(res.data.notifications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const res = await api.get('/auth/me');
      const pref = res.data?.user?.preferences;
      if (pref) {
        setPreferences({
          emailNotifications: pref.emailNotifications ?? true,
          smsNotifications: pref.smsNotifications ?? false,
          notifyTypes: Array.isArray(pref.notifyTypes) ? pref.notifyTypes : [],
        });
      }
    } catch {
      // silent
    }
  };

  useEffect(() => { fetchData(); }, [unreadOnly]);

  useEffect(() => { fetchPreferences(); }, []);

  const handleMarkRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // silent
    }
  };

  const handleSavePreferences = async () => {
    try {
      setPrefError(null);
      await api.put('/auth/preferences', preferences);
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 3000);
    } catch (err) {
      setPrefError(err.message);
    }
  };

  const setToggle = (key) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleNotifyType = (value) => {
    setPreferences((prev) => ({
      ...prev,
      notifyTypes: prev.notifyTypes.includes(value)
        ? prev.notifyTypes.filter((v) => v !== value)
        : [...prev.notifyTypes, value],
    }));
  };

  const header = (
    <PageHeader
      title="Notifications"
      subtitle="Updates about your membership, attendance and goals"
      icon={BellIcon}
      actions={
        <>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-400 focus:ring-brand-500"
            />
            Unread only
          </label>
          {notifications.some((n) => !n.isRead) && (
            <button onClick={handleMarkAllRead} className="btn btn-sm btn-outline">
              Mark all read
            </button>
          )}
        </>
      }
    />
  );

  if (loading && notifications.length === 0) {
    return (
      <div className="page-wrap space-y-6">
        {header}
        <SkeletonRow rows={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrap space-y-6">
        {header}
        <div className="card p-5">
          <ErrorState message={error} onRetry={fetchData} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6">
      {header}

      <div className="card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="card-title">Notification Preferences</h2>
            <p className="text-sm text-slate-500">Choose how you want to be notified</p>
          </div>
          <button
            onClick={handleSavePreferences}
            className="btn btn-md btn-primary self-start sm:self-auto"
          >
            Save
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Email notifications</p>
              <p className="text-xs text-slate-500">Receive updates via email</p>
            </div>
            <button
              type="button"
              onClick={() => setToggle('emailNotifications')}
              className={`relative inline-flex h-5 w-10 shrink-0 rounded-full transition-colors ${preferences.emailNotifications ? 'bg-brand-500' : 'bg-surface-elevated'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${preferences.emailNotifications ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">SMS notifications</p>
              <p className="text-xs text-slate-500">Receive updates via text message</p>
            </div>
            <button
              type="button"
              onClick={() => setToggle('smsNotifications')}
              className={`relative inline-flex h-5 w-10 shrink-0 rounded-full transition-colors ${preferences.smsNotifications ? 'bg-brand-500' : 'bg-surface-elevated'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${preferences.smsNotifications ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-800 mb-2">Notify me about</p>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_TYPES.map((t) => {
                const active = preferences.notifyTypes.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleNotifyType(t.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-brand-500 bg-brand-500 text-slate-400' : 'border-border bg-surface text-slate-400 hover:bg-surface-hover'}`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {prefSaved && (
          <div className="mt-5 rounded-lg border border-success/25 bg-success/10 px-4 py-2 text-sm text-success">
            Preferences saved successfully
          </div>
        )}
        {prefError && (
          <div className="mt-5 rounded-lg border border-danger/25 bg-danger/10 px-4 py-2 text-sm text-danger">
            {prefError}
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={BellIcon} message={unreadOnly ? "You're all caught up" : 'No notifications yet'} />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const TypeIcon = typeIcons[n.type] || BellIcon;
            const unread = !n.isRead;
            return (
              <button
                key={n._id}
                onClick={() => { if (unread) handleMarkRead(n._id); }}
                className={`card w-full p-5 text-left transition-colors hover:bg-surface/60 ${unread ? 'border-l-4 border-l-brand-500' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <TypeIcon className={`h-5 w-5 mt-0.5 shrink-0 ${typeTones[n.type] || 'text-slate-400'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {unread && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                        )}
                        <p className={`truncate text-sm leading-snug ${unread ? 'font-medium text-slate-900' : 'text-slate-700'}`}>
                          {n.title}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">{n.message}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}