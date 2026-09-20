import { useState, useEffect, useMemo } from 'react';
import { ServerStackIcon, ChevronDownIcon, ChevronRightIcon, ArrowPathIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import StatCard from '../../components/common/StatCard';
import Modal from '../../components/common/Modal';

const IGNORED_KEYS = new Set(['__v']);

function formatValue(value, isId = false) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && value.startsWith('data:image')) return '[image]';
  if (isId) return String(value).slice(-8);
  if (value instanceof Date) return value.toLocaleString('en-IN');
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 60 ? `${json.slice(0, 57)}...` : json;
  }
  return String(value);
}

function pickColumns(row) {
  const keys = Object.keys(row).filter((k) => !IGNORED_KEYS.has(k));
  const isRef = (k) => /Id$/.test(k) || ['user', 'trainer', 'member', 'createdBy', 'plan'].includes(k);
  return keys.slice(0, 7).map((k) => ({ key: k, isId: /(^|_)(id|Id)$/.test(k) || isRef(k) || row[k] && /^[a-f0-9]{24}$/i.test(String(row[k])) }));
}

function EditModal({ collectionLabel, id, fields, onClose, onSave, saving }) {
  const [values, setValues] = useState(() =>
    fields.reduce((acc, f) => {
      try {
        acc[f.key] = typeof f.value === 'object' && f.value !== null ? JSON.stringify(f.value, null, 2) : String(f.value ?? '');
      } catch {
        acc[f.key] = '';
      }
      return acc;
    }, {})
  );
  const [error, setError] = useState(null);

  const setValue = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    const payload = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (typeof f.value === 'boolean') {
        payload[f.key] = raw === 'true';
      } else if (typeof f.value === 'number') {
        payload[f.key] = raw === '' ? null : Number(raw);
      } else if (Array.isArray(f.value) || (f.value !== null && typeof f.value === 'object')) {
        try {
          payload[f.key] = JSON.parse(raw);
        } catch {
          return setError(`"${f.key}" must be valid JSON`);
        }
      } else if (f.value === null && raw === '') {
        payload[f.key] = null;
      } else {
        payload[f.key] = raw;
      }
    }
    onSave(payload);
  };

  const inputFor = (f) => {
    if (typeof f.value === 'boolean') {
      return (
        <select value={values[f.key]} onChange={(e) => setValue(f.key, e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    const Tag = typeof f.value === 'object' && f.value !== null ? 'textarea' : 'input';
    return (
      <Tag
        type={typeof f.value === 'number' ? 'number' : 'text'}
        value={values[f.key]}
        onChange={(e) => setValue(f.key, e.target.value)}
        rows={typeof f.value === 'object' && f.value !== null ? 4 : undefined}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-xs"
      />
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={`Edit ${collectionLabel}`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Record ID: <span className="font-mono text-xs">{id}</span>
        </p>
        <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{f.key}</label>
              {inputFor(f)}
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CollectionCard({ collection, expanded, onToggle, onEdit, onDelete }) {
  const { label, count, rows } = collection;
  const columns = useMemo(() => (rows.length > 0 ? pickColumns(rows[0]) : []), [rows]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDownIcon className="h-4 w-4 text-slate-400" /> : <ChevronRightIcon className="h-4 w-4 text-slate-400" />}
          <span className="font-semibold text-slate-900">{label}</span>
          <span className="text-xs font-medium px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">{count} records</span>
          {count > rows.length && <span className="text-xs text-slate-400">showing latest {rows.length}</span>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {rows.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">No records.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {columns.map((c, i) => (
                      <th key={c.key} className={`${i === 0 ? 'pl-5' : 'pl-4'} pr-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap`}>
                        {c.key}
                      </th>
                    ))}
                    <th className="pl-4 pr-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, ri) => (
                    <tr key={row._id || ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {columns.map((c, ci) => (
                        <td key={c.key} className={`${ci === 0 ? 'pl-5' : 'pl-4'} pr-4 py-2.5 text-slate-700 whitespace-nowrap ${ci === 0 ? 'font-medium text-slate-900' : ''}`}>
                          {formatValue(row[c.key], c.isId)}
                        </td>
                      ))}
                      <td className="pl-4 pr-5 py-2.5 whitespace-nowrap">
                        <div className="flex gap-3">
                          <button onClick={() => onEdit(row)} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-sm">
                            <PencilSquareIcon className="h-4 w-4" /> Edit
                          </button>
                          <button onClick={() => onDelete(row)} className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium text-sm">
                            <TrashIcon className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AllData() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/all');
      setData(res.data.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(data.map((c) => c.key)));
  const collapseAll = () => setExpanded(new Set());

  const totalRecords = data.reduce((sum, c) => sum + (c.count || 0), 0);

  const refresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const openEdit = (collectionKey, row) => {
    const collection = data.find((c) => c.key === collectionKey);
    const allowed = new Set(collection.editableFields || []);
    const fields = Object.entries(row)
      .filter(([k]) => allowed.has(k))
      .map(([key, value]) => ({ key, value }));
    setEditing({ collectionKey, row, fields });
  };

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      await api.put(`/admin/all/${editing.collectionKey}/${editing.row._id}`, payload);
      setEditing(null);
    } catch (err) {
      alert(err.message || 'Failed to update record');
    } finally {
      setSaving(false);
      await fetchAll();
    }
  };

  const handleDelete = async (collectionKey, row) => {
    const collection = data.find((c) => c.key === collectionKey);
    const label = collection?.label || collectionKey;
    if (!window.confirm(`Delete this ${label} record?\nID: ${row._id}\n\nThis cannot be undone.`)) return;
    try {
      await api.delete(`/admin/all/${collectionKey}/${row._id}`);
    } catch (err) {
      alert(err.message || 'Failed to delete record');
    }
    await fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">All Data</h1>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Expand All</button>
          <button onClick={collapseAll} className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Collapse All</button>
          <button onClick={refresh} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard icon={ServerStackIcon} label="Collections" value={data.length} color="indigo" />
          <StatCard icon={ServerStackIcon} label="Total Records" value={totalRecords} color="green" />
        </div>
      )}

      {error ? (
        <div className="bg-white rounded-xl border border-slate-200">
          <ErrorState message={error} onRetry={fetchAll} />
        </div>
      ) : loading ? (
        <LoadingSpinner size="lg" />
      ) : (
        <div className="space-y-3">
          {data.map((c) => (
            <CollectionCard key={c.key} collection={c} expanded={expanded.has(c.key)} onToggle={() => toggle(c.key)} onEdit={(row) => openEdit(c.key, row)} onDelete={(row) => handleDelete(c.key, row)} />
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          collectionLabel={data.find((c) => c.key === editing.collectionKey)?.label}
          id={editing.row._id}
          fields={editing.fields}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}