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

// FR 12.1 Suspend or unlock accounts
export function AdminUsers() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useLoad(() => api.get(`/admin/users?q=${encodeURIComponent(search)}`), [search]);
  const { run, view } = useFlash(reload);
  const [banning, setBanning] = useState(null);

  return (
    <div className="container">
      <PageHeader title="Users" subtitle="Temporarily suspend accounts that break platform rules, or unlock them." />
      {view}
      <form className="search-row card filters" onSubmit={(e) => { e.preventDefault(); setSearch(q); }} role="search">
        <label htmlFor="user-search" className="sr-only">Search users</label>
        <input id="user-search" type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary">Search</button>
      </form>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Email confirmed</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Name"><Link to={`/users/${u.id}`}>{u.full_name}</Link><div className="small muted">{u.email}</div></td>
                  <td data-label="Role">{u.role === 'owner' ? 'Challenge owner' : u.role === 'admin' ? 'Administrator' : 'Participant'}</td>
                  <td data-label="Email confirmed">{u.email_verified ? 'Yes' : 'No'}</td>
                  <td data-label="Status">{u.banned ? <span className="badge badge-rejected">Suspended</span> : <span className="badge badge-active">Active</span>}</td>
                  <td className="row-actions">
                    {u.role !== 'admin' && (u.banned
                      ? <button className="btn btn-outline btn-sm" onClick={() => run(() => api.post(`/admin/users/${u.id}/ban`, {}))}>Unlock</button>
                      : <button className="btn btn-ghost btn-sm danger-text" onClick={() => setBanning(u)}>Suspend</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {banning && (
        <ReasonModal
          title={`Suspend ${banning.full_name}`}
          label="Reason (recorded in the audit log)"
          danger
          onCancel={() => setBanning(null)}
          onSubmit={async (reason) => {
            await run(() => api.post(`/admin/users/${banning.id}/ban`, { reason }));
            setBanning(null);
          }}
        />
      )}
    </div>
  );
}

// FR 12.2 Remove content, FR 12.3 Review reports
export function AdminReports() {
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/reports'), []);
  const { run, view } = useFlash(reload);
  const [removing, setRemoving] = useState(null);
  const [banning, setBanning] = useState(null);

  return (
    <div className="container">
      <PageHeader title="Reported content" subtitle="Challenges and accounts reported by users." />
      {view}
      {loading && !data && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && !data.reports.length && <Empty title="No reports. Everything looks fine." />}
      <div className="stack">
        {data?.reports.map((r) => (
          <article key={r.id} className="card row-card">
            <div className="row-main">
              <h3>
                {r.target_type === 'challenge'
                  ? <>Challenge: <Link to={`/challenges/${r.target_id}`}>{r.target_name || 'Deleted challenge'}</Link></>
                  : <>Account: <Link to={`/users/${r.target_id}`}>{r.target_name || 'Deleted user'}</Link></>}
              </h3>
              <p>{r.reason}</p>
              <p className="small muted">Reported by {r.reporter_name || 'a user'} · {formatDateTime(r.created_at)}</p>
            </div>
            <div className="row-status"><StatusBadge status={r.status} /></div>
            {r.status === 'open' && (
              <div className="row-actions">
                {r.target_type === 'challenge'
                  ? <button className="btn btn-danger btn-sm" onClick={() => setRemoving(r)}>Remove challenge</button>
                  : <button className="btn btn-danger btn-sm" onClick={() => setBanning(r)}>Suspend account</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => run(() => api.post(`/admin/reports/${r.id}/dismiss`))}>Dismiss</button>
              </div>
            )}
          </article>
        ))}
      </div>
      {removing && (
        <ReasonModal
          title="Remove challenge"
          label="Reason (sent to the owner and recorded in the audit log)"
          danger
          onCancel={() => setRemoving(null)}
          onSubmit={async (reason) => {
            await run(() => api.post(`/admin/challenges/${removing.target_id}/remove`, { reason }));
            setRemoving(null);
          }}
        />
      )}
      {banning && (
        <ReasonModal
          title="Suspend account"
          label="Reason (recorded in the audit log)"
          danger
          onCancel={() => setBanning(null)}
          onSubmit={async (reason) => {
            const ok = await run(() => api.post(`/admin/users/${banning.target_id}/ban`, { reason }));
            if (ok) await api.post(`/admin/reports/${banning.id}/dismiss`).catch(() => {});
            setBanning(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// FR 12.4 Audit log (read only)
export function AdminAudit() {
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/audit'), []);
  const labels = {
    verify_organisation: 'Verified organisation',
    reject_organisation: 'Rejected organisation',
    suspend_user: 'Suspended account',
    unlock_user: 'Unlocked account',
    remove_challenge: 'Removed challenge',
    dismiss_report: 'Dismissed report',
  };
  return (
    <div className="container">
      <PageHeader title="Audit log" subtitle="Every administrator decision is recorded here. Entries cannot be edited or deleted." />
      {loading && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && !data.entries.length && <Empty title="No administrator actions yet." />}
      {data?.entries.length > 0 && (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th scope="col">When</th><th scope="col">Administrator</th><th scope="col">Action</th><th scope="col">Details</th></tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td data-label="When">{formatDateTime(e.created_at)}</td>
                  <td data-label="Administrator">{e.admin_name}</td>
                  <td data-label="Action">{labels[e.action] || e.action}</td>
                  <td data-label="Details">{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// FR 12.5 Pilot report against the SMART targets
export function AdminPilotReport() {
  const { data, error, loading, reload } = useLoad(() => api.get('/admin/pilot-report'), []);

  const download = () => {
    const rows = [['Measure', 'Target', 'Actual', 'Met', 'Note'], ...data.targets.map((t) => [t.label, t.target, t.actual, t.met ? 'Yes' : 'No', t.note || ''])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `gog-pilot-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <PageHeader
        title="Pilot report"
        subtitle="Progress against the six month pilot targets for Kigali."
        actions={data && (
          <>
            <button className="btn btn-outline" onClick={() => window.print()}>Print</button>
            <button className="btn btn-primary" onClick={download}>Download CSV</button>
          </>
        )}
      />
      {loading && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && (
        <>
          <p className="small muted">Generated {formatDateTime(data.generated_at)}</p>
          <div className="report-grid">
            {data.targets.map((t) => {
              const pct = t.lowerIsBetter ? (t.met ? 100 : 0) : Math.min(100, Math.round((t.actual / t.target) * 100));
              return (
                <article key={t.label} className={`card report-card ${t.met ? 'met' : ''}`}>
                  <h2>{t.label}</h2>
                  <p className="report-num"><strong>{t.actual}</strong> <span className="muted">/ target {t.lowerIsBetter ? `${t.target}` : `${t.target}+`}</span></p>
                  <div className="progress" aria-hidden="true"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                  <p className="small">{t.met ? 'Target met' : 'Not yet met'}{t.note && ` · ${t.note}`}</p>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
