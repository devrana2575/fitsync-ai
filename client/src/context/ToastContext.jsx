import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ToastIcon = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
};

const ToastTone = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

const ToastBarTone = {
  success: 'bg-success',
  error: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

let uid = 0;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((type, title, message, duration = 5000) => {
    const id = ++uid;
    setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  // ---- Confirm / prompt dialogs (promise based, replaces window.confirm/prompt) ----
  const [dialog, setDialog] = useState(null);
  const promptValue = useRef('');

  const openDialog = useCallback((opts) => {
    promptValue.current = opts.initialValue || '';
    return new Promise((resolve) => {
      setDialog({ ...opts, resolve });
    });
  }, []);

  const closeDialog = (result) => {
    dialog?.resolve?.(result);
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeDialog(dialog.promptInput ? null : false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog]);

  const toast = {
    success: (title, message) => push('success', title, message),
    error: (title, message) => push('error', title, message),
    warning: (title, message) => push('warning', title, message),
    info: (title, message) => push('info', title, message),
    confirm: (opts = {}) => openDialog({
      title: opts.title || 'Are you sure?',
      description: opts.description || '',
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      danger: opts.danger,
    }),
    prompt: (opts = {}) => openDialog({
      title: opts.title || 'Enter a value',
      description: opts.description || '',
      confirmLabel: opts.confirmLabel || 'OK',
      cancelLabel: opts.cancelLabel || 'Cancel',
      danger: opts.danger,
      promptInput: true,
      inputLabel: opts.inputLabel || opts.title,
      placeholder: opts.placeholder || '',
      initialValue: opts.initialValue || '',
    }),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast viewport */}
      <div
        className="fixed top-16 right-4 z-[90] space-y-2 w-80 max-w-[calc(100vw-2rem)]"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const TIcon = ToastIcon[t.type] || InformationCircleIcon;
          return (
            <div
              key={t.id}
              role="status"
              className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface-elevated px-3.5 py-3 shadow-pop anim-pop"
            >
              <span className={`absolute inset-y-0 left-0 w-0.5 ${ToastBarTone[t.type] || 'bg-info'}`} aria-hidden="true" />
              <TIcon className={`mt-0.5 h-5 w-5 shrink-0 ${ToastTone[t.type] || 'text-info'}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug">{t.title}</p>
                {t.message && <p className="mt-0.5 text-xs text-slate-500 leading-snug">{t.message}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="p-0.5 text-slate-500 hover:text-slate-500 rounded-md"
                aria-label="Dismiss notification"
              >
                <XMarkIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm / prompt dialog */}
      {dialog && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="absolute inset-0 bg-black/60 anim-fade" onClick={() => closeDialog(dialog.promptInput ? null : false)} aria-hidden="true" />
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-pop anim-pop">
            <div className="px-5 py-4">
              <h3 id="confirm-title" className="text-[15px] font-semibold text-slate-900">
                {dialog.title}
              </h3>
              {dialog.description && (
                <p className="mt-1.5 text-sm text-slate-500 whitespace-pre-line">{dialog.description}</p>
              )}
              {dialog.promptInput && (
                <div className="mt-4">
                  {dialog.inputLabel && <label className="label">{dialog.inputLabel}</label>}
                  <input
                    autoFocus
                    className="input"
                    defaultValue={dialog.initialValue}
                    placeholder={dialog.placeholder}
                    onChange={(e) => { promptValue.current = e.target.value; }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        closeDialog(promptValue.current?.trim() || null);
                      }
                    }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5">
              <button onClick={() => closeDialog(dialog.promptInput ? null : false)} className="btn btn-outline btn-md">
                {dialog.cancelLabel}
              </button>
              <button
                onClick={() => closeDialog(dialog.promptInput ? (promptValue.current?.trim() || null) : true)}
                className={`btn btn-md ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}