import { useState, useEffect } from 'react';
import { MapPinIcon, CreditCardIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import StatCard from '../../components/common/StatCard';

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
].sort();

const initialForm = { name: '', address: '', phone: '', email: '', currency: 'INR', timezone: 'Asia/Kolkata', operatingHours: '' };

const paymentMeta = {
  razorpay: { label: 'Razorpay (online payments)', cls: 'bg-blue-100 text-blue-700' },
  stripe: { label: 'Stripe (card payments)', cls: 'bg-green-100 text-green-700' },
  upi: { label: 'UPI (scan-to-pay)', cls: 'bg-sky-100 text-sky-700' },
  unconfigured: { label: 'Not configured — online payments disabled', cls: 'bg-amber-100 text-amber-700' },
};

export default function Settings() {
  const [form, setForm] = useState(initialForm);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/settings');
      const s = res.data.settings || {};
      setForm({
        name: s.name || '',
        address: s.address || '',
        phone: s.phone || '',
        email: s.email || '',
        currency: s.currency || 'INR',
        timezone: s.timezone || 'Asia/Kolkata',
        operatingHours: s.operatingHours || '',
      });
      setPayment(res.data.payment || null);
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/settings', form);
      setSaved(true);
      fetchSettings();
    } catch (err) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

  if (loading) return <LoadingSpinner size="lg" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Gym Settings</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard icon={GlobeAltIcon} label="Gym Timezone" value={form.timezone || '—'} color="indigo" />
        <StatCard icon={MapPinIcon} label="Location" value={form.address || '—'} color="blue" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
        <div className={`shrink-0 p-3 rounded-lg ring-1 ${payment ? paymentMeta[payment.method].cls : 'bg-slate-100 text-slate-500 ring-slate-100'}`}>
          <CreditCardIcon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">Online Payments</p>
          <p className="text-base font-semibold text-slate-900">
            {payment ? paymentMeta[payment.method]?.label : '—'}
          </p>
          {payment && payment.method === 'razorpay' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${payment.live ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {payment.live ? 'Live keys' : 'Test keys'}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${payment.webhookConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {payment.webhookConfigured ? 'Webhook configured' : 'Webhook NOT configured'}
              </span>
              {payment.keyId && (
                <span className="font-mono text-slate-400">{payment.keyId}</span>
              )}
            </div>
          )}
          {payment && payment.method !== 'razorpay' && payment.webhookConfigured !== undefined && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${payment.live ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {payment.live ? 'Live' : 'Not live'}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${payment.webhookConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {payment.webhookConfigured ? 'Webhook configured' : 'Webhook NOT configured'}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchSettings} />
        </div>
      )}

      {payment && payment.method === 'unconfigured' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          Online payments are not configured, so members cannot complete Razorpay/UPI/Stripe checkout online.
          Counter payments are still supported — record them from the Payments page. In production the
          server refuses to start without a real gateway.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gym Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Powerhouse Gym" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <input
                list="timezone-options"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className={inputCls}
              />
              <datalist id="timezone-options">
                {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
              </datalist>
              <p className="text-xs text-slate-400 mt-1">Used for gym-day boundaries, attendance day-keys, stats and revenue months.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Operating Hours</label>
              <input value={form.operatingHours} onChange={(e) => setForm({ ...form, operatingHours: e.target.value })} className={inputCls} placeholder="e.g. Mon–Sat 6:00 AM – 10:00 PM" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className={inputCls} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {saved && <span className="text-sm text-green-600 font-medium">Settings saved</span>}
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}