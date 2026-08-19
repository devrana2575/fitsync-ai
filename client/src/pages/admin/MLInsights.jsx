import { useState, useEffect } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import DataTable from '../../components/common/DataTable';

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
  const [progressResult, setProgressResult] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [predRes, insRes] = await Promise.all([
        api.get('/ml/predictions'),
        api.get('/ml/insights'),
      ]);
      setPredictions(predRes.data.data || predRes.data.predictions || []);
      setInsights(insRes.data.data || insRes.data.insights || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await api.get('/ml/health');
      setHealth(res.data.data || res.data);
    } catch (err) {
      setHealth({ status: 'error', message: err.message });
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
      alert(err.message || 'Engagement risk analysis failed');
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

  const runProgressAnomaly = async () => {
    if (!memberId.trim()) return;
    setProgressLoading(true);
    try {
      const res = await api.post('/ml/predict/progress', { memberId: memberId.trim() });
      setProgressResult(res.data.data || res.data);
    } catch (err) {
      alert(err.message || 'Progress anomaly detection failed');
    } finally {
      setProgressLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">ML Insights</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">System Health</h2>
        <div className="flex items-center gap-4">
          <button onClick={checkHealth} disabled={healthLoading} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
            {healthLoading ? 'Checking...' : 'Health Check'}
          </button>
          {health && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${health.status === 'ok' || health.status === 'healthy' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span className={`w-2 h-2 rounded-full ${health.status === 'ok' || health.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`} />
              {health.status || 'Unknown'} {health.message ? `— ${health.message}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-md font-semibold text-slate-900 mb-3">Member Segmentation</h3>
          <p className="text-sm text-slate-500 mb-4">Cluster members into behavioral segments using ML.</p>
          <button onClick={runSegmentation} disabled={segmentLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
            {segmentLoading ? 'Running...' : 'Run All Segmentation'}
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-md font-semibold text-slate-900 mb-3">Engagement Risk</h3>
          <p className="text-sm text-slate-500 mb-4">Identify members at risk of disengagement.</p>
          <button onClick={runEngagementRisk} disabled={engagementLoading} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
            {engagementLoading ? 'Running...' : 'Run All Engagement Risk'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Attendance Forecast</h2>
        <button onClick={runAttendanceForecast} disabled={forecastLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 mb-4">
          {forecastLoading ? 'Forecasting...' : 'Run Attendance Forecast'}
        </button>
        {forecast && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 mt-3">
            <h4 className="font-medium text-cyan-800 mb-2">Forecast Results</h4>
            <pre className="text-sm text-cyan-900 whitespace-pre-wrap">{typeof forecast === 'string' ? forecast : JSON.stringify(forecast, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Progress Anomaly Detection</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Member ID</label>
            <input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="Enter member ID" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
          </div>
          <button onClick={runProgressAnomaly} disabled={progressLoading || !memberId.trim()} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 whitespace-nowrap">
            {progressLoading ? 'Running...' : 'Run Prediction'}
          </button>
        </div>
        {progressResult && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-4">
            <h4 className="font-medium text-purple-800 mb-2">Result</h4>
            <pre className="text-sm text-purple-900 whitespace-pre-wrap">{typeof progressResult === 'string' ? progressResult : JSON.stringify(progressResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {loading ? <LoadingSpinner size="lg" /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Predictions</h2>
            {predictions.length === 0 ? (
              <EmptyState icon="🤖" message="No predictions yet. Run segmentation or engagement risk analysis." />
            ) : (
              <DataTable headers={['Member', 'Type', 'Result', 'Date']}>
                {predictions.map((p, i) => (
                  <tr key={p._id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-4 font-medium text-slate-900">{p.user?.name || p.member?.name || p.memberId || '—'}</td>
                    <td className="px-6 py-4 text-slate-600 capitalize">{p.type || p.predictionType || '—'}</td>
                    <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate">{p.result || p.prediction || p.label || JSON.stringify(p).slice(0, 60)}</td>
                    <td className="px-6 py-4 text-slate-600">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">AI Insights</h2>
            {insights.length === 0 ? (
              <EmptyState icon="💡" message="No insights generated yet" />
            ) : (
              <div className="space-y-3">
                {insights.map((ins, i) => (
                  <div key={ins._id || i} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ins.severity === 'high' ? 'bg-red-100 text-red-700' : ins.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ins.severity || 'info'}
                      </span>
                      <span className="text-xs text-slate-400">{ins.createdAt ? new Date(ins.createdAt).toLocaleDateString('en-IN') : ''}</span>
                    </div>
                    <h4 className="font-medium text-slate-900 mb-1">{ins.title || ins.type || 'Insight'}</h4>
                    <p className="text-sm text-slate-600">{ins.message || ins.description || JSON.stringify(ins)}</p>
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
