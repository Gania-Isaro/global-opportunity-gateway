import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fileUrl } from '../api.js';
import {
  Alert, Empty, LoadError, Loading, Modal, PageHeader, StatusBadge,
  formatDate, formatDateTime, formatSize, useLoad,
} from '../components/ui.jsx';

function useFlash(reload) {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (fn) => {
    setErr(null);
    try {
      const r = await fn();
      setMsg(r.message);
      reload();
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  };
  const view = (
    <>
      <Alert type="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert onClose={() => setErr(null)}>{err}</Alert>
    </>
  );
  return { run, view };
}

function ReasonModal({ title, label, onCancel, onSubmit, danger }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }}>
        <div className="field">
          <label htmlFor="reason">{label}</label>
          <textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!reason.trim()}>Confirm</button>
        </div>
      </form>
    </Modal>
  );
}

// FR 3.3 Approve or reject organisations
export function AdminOrganisations() {
  const [status, setStatus] = useState('pending');
  const { data, error, loading, reload } = useLoad(() => api.get(`/admin/organisations${status ? `?status=${status}` : ''}`), [status]);
  const { run, view } = useFlash(reload);
  const [rejecting, setRejecting] = useState(null);

  return (
    <div className="container">
      <PageHeader title="Organisation verification" subtitle="Check the details and documents, then verify or reject with a reason." />
      {view}
      <div className="tabs" role="tablist">
        {[['pending', 'Pending'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['', 'All']].map(([k, l]) => (
          <button key={l} role="tab" aria-selected={status === k} className={`tab ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && !data.organisations.length && <Empty title="Nothing here." />}
      <div className="stack">
        {data?.organisations.map((o) => (
          <article key={o.id} className="card panel">
            <div className="org-head">
              <h2>{o.name}</h2>
              <StatusBadge status={o.status} />
            </div>
            <dl className="profile-dl">
              <dt>Sector</dt><dd>{o.sector}</dd>
              <dt>Representative</dt><dd>{o.rep_name} ({o.rep_email})</dd>
              <dt>Contact person</dt><dd>{o.contact_person}</dd>
              <dt>Description</dt><dd>{o.description}</dd>
              <dt>Submitted</dt><dd>{formatDate(o.created_at)}</dd>
              <dt>Documents</dt>
              <dd>
                {o.documents.length ? (
                  <ul className="file-list">
                    {o.documents.map((d) => (
                      <li key={d.id}><a href={fileUrl(`/organisations/${o.id}/documents/${d.id}`)}>{d.filename}</a> <span className="muted">({formatSize(d.size)})</span></li>
                    ))}
                  </ul>
                ) : 'None uploaded'}
              </dd>
              {o.rejection_reason && <><dt>Rejection reason</dt><dd>{o.rejection_reason}</dd></>}
            </dl>
            {o.status === 'pending' && (
              <div className="form-actions">
                <button className="btn btn-ghost danger-text" onClick={() => setRejecting(o)}>Reject</button>
                <button className="btn btn-primary" onClick={() => run(() => api.post(`/admin/organisations/${o.id}/decision`, { decision: 'verified' }))}>Verify</button>
              </div>
            )}
          </article>
        ))}
      </div>
      {rejecting && (
        <ReasonModal
          title={`Reject ${rejecting.name}`}
          label="Reason (sent to the representative)"
          danger
          onCancel={() => setRejecting(null)}
          onSubmit={async (reason) => {
            await run(() => api.post(`/admin/organisations/${rejecting.id}/decision`, { decision: 'rejected', reason }));
            setRejecting(null);
          }}
        />
      )}
    </div>
  );
}

