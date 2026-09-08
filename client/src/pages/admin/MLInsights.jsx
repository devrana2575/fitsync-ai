import { useState, useEffect } from 'react';
import { LightBulbIcon, UserGroupIcon, ChartBarSquareIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import useDebounce from '../../hooks/useDebounce';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import DataTable from '../../components/common/DataTable';

const MODEL_LABELS = {
  segmentation: 'Member segment',
  engagement_risk: 'Engagement',
  attendance: 'Attendance',
  progress_anomaly: 'Progress pattern',
};

const friendlyForecast = (data) => {
  if (!data) return null;
  if (typeof data === 'string') {
    return [{ label: 'Forecast', value: data }];
  }
  if (Array.isArray(data)) {
    return data.map((row, i) => ({
      label: typeof row === 'object' && row !== null ? (row.date || row.day || row.label || row._id || `Day ${i + 1}`) : `Day ${i + 1}`,
      value: typeof row === 'object' && row !== null ? (row.count ?? row.predicted ?? row.expected ?? row.value ?? '—') : row,
    }));
  }
  const arr = [];
  for (const key of Object.keys(data)) {
    const v = data[key];
    if (Array.isArray(v) && v.length <= 31) {
      arr.push(...v.map((n) => ({ label: `${key} ${arr.length + 1}`, value: n })));
    } else {
      arr.push({ label: key.replace(/[_-]+/g, ' '), value: v });
    }
  }
  return arr;
};

const friendlyProgress = (res) => {
  if (!res) return null;
  const anomaly = res.isAnomaly ?? res.anomaly ?? res.unusual;
  const reason = res.reason || res.message || res.notes;
  if (typeof res === 'string') {
    return { anomaly: null, reason: res };
  }
  return { anomaly, reason: reason || (anomaly ? 'Unusual progress pattern detected for this member.' : 'No unusual changes detected in this member\'s progress.') };
};

export default function MLInsights() {
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [memberId, setMemberId] = useState('');
  const [allMembers, setAllMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const debouncedMemberSearch = useDebounce(memberSearch, 300);
  const [selectedMember, setSelectedMember] = useState(null);
  const [progressResult, setProgressResult] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [predRes, insRes] = await Promise.all([
        api.get('/ml/predictions'),
        api.get('/ml/insights'),
      ]);
      setPredictions(predRes.data.predictions || predRes.data.data || []);
      setInsights(insRes.data.insights || insRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await api.get('/members', { params: { limit: 200 } });
        setAllMembers(res.data.data || res.data.members || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchMembers();
  }, []);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await api.get('/ml/health');
      const data = res.data;
      const status = data.mlService || data.status;
      setHealth({
        available: status === 'running' || status === 'healthy' || status === 'ok',
        message: data.error || data.message || data.data?.message || null,
      });
    } catch (err) {
      setHealth({ available: false, message: err.message });
    } finally {
      setHealthLoading(false);
    }
  };

  const runSegmentation = async () => {
    setSegmentLoading(true);
    try {
      await api.post('/ml/predict/segment-all');
      fetchData();
    } catch (err) {
      alert(err.message || 'Segmentation failed');
    } finally {
      setSegmentLoading(false);
    }
  };

  const runEngagementRisk = async () => {
    setEngagementLoading(true);
    try {
      await api.post('/ml/predict/engagement-risk-all');
      fetchData();
    } catch (err) {
      alert(err.message || 'Engagement analysis failed');
    } finally {
      setEngagementLoading(false);
    }
  };

  const runAttendanceForecast = async () => {
    setForecastLoading(true);
    try {
      const res = await api.post('/ml/predict/attendance');
      setForecast(res.data.data || res.data);
    } catch (err) {
      alert(err.message || 'Forecast failed');
    } finally {
      setForecastLoading(false);
    }
  };

  const runProgressCheck = async () => {
    if (!memberId.trim()) return;
    setProgressLoading(true);
    try {
      const res = await api.post('/ml/predict/progress-anomaly', { memberId: memberId.trim() });
      setProgressResult(res.data.data || res.data);
    } catch (err) {
      alert(err.message || 'Progress check failed');
    } finally {
      setProgressLoading(false);
    }
  };

  const filteredMembers = allMembers.filter((m) => {
    if (!debouncedMemberSearch) return true;
    const q = debouncedMemberSearch.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q);
  });

  const handleMLMemberSelect = (member) => {
    setSelectedMember(member);
    setMemberId(member._id);
    setMemberSearch('');
  };

  const forecastRows = friendlyForecast(forecast);
  const progressRows = friendlyProgress(progressResult);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Member Insights</h1>
        <p className="text-sm text-slate-500 mt-1">Automated analysis to support member engagement, attendance planning and early follow-up.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Insights Service</h2>
        <div className="flex items-center gap-4">
          <button onClick={checkHealth} disabled={healthLoading} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
            {healthLoading ? 'Checking...' : 'Check service status'}
          </button>
          {health && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${health.available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {health.available
                ? <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
                : <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />}
              {health.available ? 'Service is available' : `Service unavailable${health.message ? ` — ${health.message}` : ''}`}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <UserGroupIcon className="h-5 w-5 text-indigo-500" aria-hidden="true" />
            <h3 className="text-md font-semibold text-slate-900">Member Segments</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">Updates membership groups based on recent activity.</p>
          <button onClick={runSegmentation} disabled={segmentLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
            {segmentLoading ? 'Updating...' : 'Update segments'}
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <h3 className="text-md font-semibold text-slate-900">Engagement Analysis</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">Flags members who may be losing interest so you can follow up early.</p>
          <button onClick={runEngagementRisk} disabled={engagementLoading} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
            {engagementLoading ? 'Updating...' : 'Update analysis'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Attendance Forecast</h2>
        <p className="text-sm text-slate-500 mb-4">Estimate expected attendance so you can plan staffing and busy periods.</p>
        <button onClick={runAttendanceForecast} disabled={forecastLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 mb-4">
          {forecastLoading ? 'Forecasting...' : 'Forecast attendance'}
        </button>
        {forecastRows && forecastRows.length > 0 && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {forecastRows.map((row, i) => (
                <div key={i} className="bg-white rounded-lg border border-cyan-100 px-4 py-3">
                  <p className="text-xs text-slate-500 capitalize truncate">{row.label === 'Day' ? `${row.label} ${i + 1}` : row.label}</p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5 capitalize">{String(row.value)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Progress Pattern Check</h2>
        <p className="text-sm text-slate-500 mb-4">Review whether a member's recent progress shows unusual changes worth discussing.</p>
        <div className="flex items-end gap-4">
          <div className="flex-1 relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Select Member</label>
            {selectedMember ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg bg-slate-50">
                <span className="flex-1 text-sm text-slate-900">{selectedMember.name} ({selectedMember.email})</span>
                <button type="button" onClick={() => { setSelectedMember(null); setMemberId(''); }} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
              </div>
            ) : (
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search member..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            )}
            {memberSearch && !selectedMember && filteredMembers.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredMembers.slice(0, 20).map((m) => (
                  <li key={m._id} onClick={() => handleMLMemberSelect(m)} className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer">
                    {m.name} <span className="text-slate-500">({m.email})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={runProgressCheck} disabled={progressLoading || !memberId.trim()} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
            {progressLoading ? 'Running...' : 'Run check'}
          </button>
        </div>
        {progressRows && (
          <div className={`${progressRows.anomaly ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'} border rounded-lg p-4 mt-4`}>
            <div className="flex items-start gap-2">
              {progressRows.anomaly
                ? <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                : <CheckCircleIcon className="h-5 w-5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />}
              <p className={`text-sm font-medium ${progressRows.anomaly ? 'text-amber-800' : 'text-green-800'}`}>
                {progressRows.reason}
              </p>
            </div>
          </div>
        )}
      </div>

      {loading ? <LoadingSpinner size="lg" /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Findings</h2>
            {predictions.length === 0 ? (
              <EmptyState icon={LightBulbIcon} message="No findings yet. Update segments or engagement analysis to get started." />
            ) : (
              <DataTable headers={['Member', 'Finding', 'Result', 'Date']}>
                {predictions.map((p, i) => (
                  <tr key={p._id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-4 font-medium text-slate-900">{p.member?.name || p.user?.name || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{MODEL_LABELS[p.model] || p.predictionType || p.model || '—'}</td>
                    <td className="px-6 py-4 text-slate-600 max-w-[220px] truncate">
                      {p.model === 'engagement_risk'
                        ? (p.riskLevel || p.prediction || '—')
                        : (p.reason || p.prediction || '—')}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{p.predictedAt ? new Date(p.predictedAt).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Insights</h2>
            {insights.length === 0 ? (
              <EmptyState icon={ChartBarSquareIcon} message="No insights generated yet" />
            ) : (
              <div className="space-y-3">
                {insights.map((ins, i) => (
                  <div key={ins._id || i} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ins.severity === 'high' ? 'bg-red-100 text-red-700' : ins.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ins.severity === 'high' ? 'Needs attention' : ins.severity === 'medium' ? 'Review' : 'Info'}
                      </span>
                      <span className="text-xs text-slate-400">{ins.createdAt ? new Date(ins.createdAt).toLocaleDateString('en-IN') : ''}</span>
                    </div>
                    <h4 className="font-medium text-slate-900 mb-1">{ins.title || ins.type || 'Insight'}</h4>
                    <p className="text-sm text-slate-600">{ins.message || ins.description || 'No details available'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}