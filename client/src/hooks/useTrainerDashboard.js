import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const TTL_MS = 60 * 1000;
let cache = null;
let cacheAt = 0;
let inflight = null;

const loadDashboard = async () => {
  const [dashboard, alerts] = await Promise.allSettled([
    api.get('/analytics/trainer/dashboard'),
    api.get('/retention/trainer/alerts'),
  ]);
  if (dashboard.status === 'rejected') throw dashboard.reason;
  return {
    ...dashboard.value.data,
    retentionAlerts: alerts.status === 'fulfilled' ? alerts.value.data : { members: [] },
  };
};

export default function useTrainerDashboard({ forceRefresh = false } = {}) {
  const [data, setData] = useState(cache);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      cache = await loadDashboard();
      cacheAt = Date.now();
      setData(cache);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stale = cache === null || Date.now() - cacheAt >= TTL_MS;
    if (!forceRefresh && !stale) return undefined;

    if (!inflight) {
      inflight = loadDashboard();
    }
    let active = true;
    inflight
      .then((result) => {
        cache = result;
        cacheAt = Date.now();
        if (active) {
          setData(cache);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        inflight = null;
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [forceRefresh]);

  return { data, loading, error, reload };
}
