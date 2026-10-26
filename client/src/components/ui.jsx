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

export function VerifiedBadge() {
  return (
    <span className="badge badge-verified-org" title="This organisation was verified by a GOG administrator">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path fill="currentColor" d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 5-5L12.6 5z" />
      </svg>
      Verified
    </span>
  );
}

export function ProgressBar({ value, label = 'Progress' }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-fill" style={{ width: `${value}%` }} />
      <span className="progress-text">{value}%</span>
    </div>
  );
}

export function SkillTags({ skills = [] }) {
  if (!skills?.length) return null;
  return (
    <ul className="tags" aria-label="Skills">
      {skills.map((s) => (
        <li key={s} className="tag">{s}</li>
      ))}
    </ul>
  );
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <Link to={back.to} className="back-link">
            ← {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, to }) {
  const inner = (
    <>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </>
  );
  return to ? <Link to={to} className="stat-card">{inner}</Link> : <div className="stat-card">{inner}</div>;
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const formatDate = (d) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export function daysLeft(deadline) {
  const end = new Date(`${deadline}T23:59:59`);
  const diff = Math.ceil((end - new Date()) / 86400000);
  if (diff < 0) return 'Deadline passed';
  if (diff === 0) return 'Closes today';
  return `${diff} day${diff === 1 ? '' : 's'} left`;
}

export const formatSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
