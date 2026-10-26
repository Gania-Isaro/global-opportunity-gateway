import { useCallback, useEffect, useState, useId } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api.js';

// Loads data from the API and exposes loading / error / reload.
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}

// Wraps a form submit: tracks busy state, field errors and the top message.
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const submit = async (fn) => {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      return await fn();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      if (err instanceof ApiError) setFields(err.fields || {});
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, submit, setError };
}

export function Field({ label, error, hint, children, required }) {
  const id = useId();
  const child = typeof children === 'function'
    ? children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined })
    : children;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label} {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {child}
      {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

export function Alert({ type = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Dismiss message">
          ×
        </button>
      )}
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" /> {label}...
    </div>
  );
}

export function LoadError({ error, reload }) {
  return (
    <Alert>
      {error?.message || 'Could not load this page.'}{' '}
      {reload && (
        <button className="link-btn" onClick={reload}>
          Try again
        </button>
      )}
    </Alert>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

const STATUS_LABELS = {
  submitted: 'Submitted',
  under_review: 'Under review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed',
  removed: 'Removed',
  sent: 'Invitation sent',
  confirmed: 'Confirmed',
  declined: 'Declined',
  active: 'Active',
  completed: 'Completed',
  pending: 'Pending review',
  verified: 'Verified',
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  open: 'Open',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const statusLabel = (s) => STATUS_LABELS[s] || s;

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}

