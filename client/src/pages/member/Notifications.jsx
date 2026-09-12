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
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';

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
  membership_expiry: 'text-indigo-500',
  payment_due: 'text-amber-500',
  low_attendance: 'text-sky-500',
  high_risk: 'text-red-500',
  progress_anomaly: 'text-amber-500',
  equipment_maintenance: 'text-slate-500',
  general: 'text-sky-500',
  workout_reminder: 'text-emerald-500',
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

  if (loading && notifications.length === 0) return <LoadingSpinner />;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Notifications</h1>
            <p className="text-slate-500">Updates about your membership, attendance and goals</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
              />
              Unread only
            </label>
            {notifications.some((n) => !n.isRead) && (
              <button onClick={handleMarkAllRead} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                Mark all read
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
              <p className="text-sm text-slate-500">Choose how you want to be notified</p>
            </div>
            <button
              onClick={handleSavePreferences}
              className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-4 py-2 transition-colors"
            >
              Save
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Email notifications</p>
                <p className="text-xs text-slate-500">Receive updates via email</p>
              </div>
              <button
                type="button"
                onClick={() => setToggle('emailNotifications')}
                className={`relative inline-flex h-5 w-10 shrink-0 rounded-full transition-colors ${preferences.emailNotifications ? 'bg-indigo-600' : 'bg-slate-300'}`}
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
                className={`relative inline-flex h-5 w-10 shrink-0 rounded-full transition-colors ${preferences.smsNotifications ? 'bg-indigo-600' : 'bg-slate-300'}`}
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
                      className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {prefSaved && (
            <div className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
              Preferences saved successfully
            </div>
          )}
          {prefError && (
            <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {prefError}
            </div>
          )}
        </div>

        {notifications.length === 0 ? (
          <EmptyState icon={BellIcon} message={unreadOnly ? 'No unread notifications' : 'No notifications yet'} />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {notifications.map((n) => {
              const TypeIcon = typeIcons[n.type] || BellIcon;
              return (
                <button
                  key={n._id}
                  onClick={() => { if (!n.isRead) handleMarkRead(n._id); }}
                  className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors ${!n.isRead ? 'bg-indigo-50/40' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <TypeIcon className={`h-5 w-5 mt-0.5 shrink-0 ${typeTones[n.type] || 'text-slate-400'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                          {n.title}
                        </p>
                        <span className="text-xs text-slate-400 shrink-0">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}