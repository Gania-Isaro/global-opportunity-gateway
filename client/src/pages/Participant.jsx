import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Empty, LoadError, Loading, PageHeader, StatusBadge, formatDate, useLoad } from '../components/ui.jsx';

function useAction(reload) {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const act = async (url, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setErr(null);
    try {
      const r = await api.post(url, body);
      setMsg(r.message);
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  const alerts = (
    <>
      <Alert type="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert onClose={() => setErr(null)}>{err}</Alert>
    </>
  );
  return { act, alerts };
}

// FR 6.4 Track status, FR 6.5 Withdraw
export function MyApplications() {
  const { data, error, loading, reload } = useLoad(() => api.get('/applications/mine'), []);
  const { act, alerts } = useAction(reload);

  return (
    <div className="container">
      <PageHeader title="My applications" subtitle="Follow the status of every challenge you applied to." />
      {alerts}
      {loading && !data && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && !data.applications.length && (
        <Empty title="You have not applied to any challenges yet.">
          <Link to="/challenges" className="btn btn-primary">Browse challenges</Link>
        </Empty>
      )}
      {data?.applications.length > 0 && (
        <>
          <ol className="status-legend" aria-label="Application stages">
            <li>Submitted</li><li>Under review</li><li>Accepted or rejected</li><li>Invitation</li><li>Team</li>
          </ol>
          <div className="stack">
            {data.applications.map((a) => (
              <article key={a.id} className="card row-card">
                <div className="row-main">
                  <h3><Link to={`/challenges/${a.challenge_id}`}>{a.challenge_title}</Link></h3>
                  <p className="small muted">Applied {formatDate(a.created_at)}{a.decided_at && ` · updated ${formatDate(a.decided_at)}`}</p>
                </div>
                <div className="row-status">
                  <StatusBadge status={a.status} />
                  {a.invitation_status && <StatusBadge status={a.invitation_status} />}
                </div>
                <div className="row-actions">
                  {['submitted', 'under_review'].includes(a.status) && (
                    <button className="btn btn-ghost btn-sm danger-text" onClick={() => act(`/applications/${a.id}/withdraw`, {}, 'Withdraw this application? You cannot apply to the same challenge again.')}>
                      Withdraw
                    </button>
                  )}
                  {a.invitation_status === 'sent' && <Link to="/invitations" className="btn btn-accent btn-sm">Respond to invitation</Link>}
                  {a.project_id && <Link to={`/projects/${a.project_id}`} className="btn btn-primary btn-sm">Open workspace</Link>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// FR 7.4 Confirm or decline an invitation
export function Invitations() {
  const { data, error, loading, reload } = useLoad(() => api.get('/invitations/mine'), []);
  const { act, alerts } = useAction(reload);

  return (
    <div className="container">
      <PageHeader title="Invitations" subtitle="Challenge owners invite accepted applicants to join their team." />
      {alerts}
      {loading && !data && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && !data.invitations.length && <Empty title="You have no invitations yet." />}
      <div className="stack">
        {data?.invitations.map((i) => (
          <article key={i.id} className="card row-card">
            <div className="row-main">
              <h3><Link to={`/challenges/${i.challenge_id}`}>{i.challenge_title}</Link></h3>
              <p className="small muted">From {i.owner_name} · {formatDate(i.created_at)}</p>
            </div>
            <div className="row-status"><StatusBadge status={i.status} /></div>
            <div className="row-actions">
              {i.status === 'sent' && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => act(`/invitations/${i.id}/respond`, { response: 'confirmed' })}>Confirm</button>
                  <button className="btn btn-ghost btn-sm danger-text" onClick={() => act(`/invitations/${i.id}/respond`, { response: 'declined' }, 'Decline this invitation?')}>Decline</button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
