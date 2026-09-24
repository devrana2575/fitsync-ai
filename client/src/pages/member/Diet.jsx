import { useState, useEffect } from 'react';
import { CheckIcon, ClipboardDocumentCheckIcon, FireIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import StatCard from '../../components/common/StatCard';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDay = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function Diet() {
  const { toast } = useToast();
  const [dietTypes, setDietTypes] = useState([]);
  const [log, setLog] = useState(null);
  const [stats, setStats] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [typesRes, logRes, statsRes] = await Promise.all([
        api.get('/diet/types'),
        api.get('/diet/log', { params: { date } }),
        api.get('/diet/stats'),
      ]);
      setDietTypes(typesRes.data.diets || []);
      setLog((logRes.data.logs || [])[0] || null);
      setStats(statsRes.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load diet data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [date]);

  const completed = new Set(log?.completedDiets || []);

  const handleToggle = async (type, checked) => {
    setSaving(true);
    setLog((prev) => {
      const set = new Set(prev?.completedDiets || []);
      if (checked) set.add(type); else set.delete(type);
      return { ...(prev || {}), completedDiets: [...set] };
    });
    try {
      await api.put('/diet/log', { date, dietType: type, completed: checked });
    } catch (err) {
      toast.error('Update failed', err.message || 'Failed to update diet checklist');
      fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const completedCount = completed.size;
  const totalDiets = dietTypes.length;

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Diet"
        subtitle="Check off the diet types you completed on a given day."
        icon={ClipboardDocumentCheckIcon}
      />

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <div className="py-10">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={ClipboardDocumentCheckIcon} label="Completed Today" value={totalDiets ? `${completedCount} / ${totalDiets}` : '—'} color="brand" />
            <StatCard icon={FireIcon} label="Day Streak" value={stats?.streak ?? '—'} color="orange" />
            <StatCard icon={CalendarDaysIcon} label="Days Tracked (7d)" value={stats?.last7Days?.length ?? '—'} color="cyan" />
          </div>

          <div className="card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="card-title">Daily Diet Checklist</h2>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input sm:w-auto"
              />
            </div>

            <div className="mt-5">
              {dietTypes.length === 0 ? (
                <p className="text-sm text-slate-400">No diet types available.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dietTypes.map((d) => {
                    const isChecked = completed.has(d.value);
                    return (
                      <label
                        key={d.value}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                          isChecked ? 'border-brand-500/40 bg-brand-500/10' : 'border-border bg-surface hover:bg-surface-hover'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={saving}
                          onChange={(e) => handleToggle(d.value, e.target.checked)}
                          className="h-5 w-5 rounded border-slate-300 text-brand-400 focus:ring-brand-500"
                        />
                        <span className={`text-sm font-medium flex-1 ${isChecked ? 'text-brand-400' : 'text-slate-700'}`}>
                          {d.label}
                        </span>
                        {isChecked && <CheckIcon className="h-5 w-5 text-brand-400 shrink-0" aria-hidden="true" />}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="card-title mb-5">Last 7 Days</h2>
            {!stats || stats.last7Days.length === 0 ? (
              <p className="text-sm text-slate-400">No diet checklist entries in the last week.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {stats.last7Days.map((day) => (
                  <div key={new Date(day.date).toISOString()} className="rounded-xl border border-border px-4 py-3 text-center min-w-[96px] bg-surface-elevated">
                    <p className="text-xs text-slate-500">{fmtDay(day.date)}</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1 tabular-nums">{day.count}</p>
                    <p className="text-[11px] text-slate-400">completed</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}