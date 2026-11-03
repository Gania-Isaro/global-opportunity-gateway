import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Empty, LoadError, Loading, PageHeader, ProgressBar, StatCard, StatusBadge,
  formatDate, useLoad,
} from '../components/ui.jsx';

function AdminDashboard({ admin }) {
  const { counts, pending } = admin;
  return (
    <>
      <PageHeader title="Administrator dashboard" subtitle="Verify organisations, moderate content and follow the pilot." />
      <div className="stats">
        <StatCard label="Users" value={counts.users} to="/admin/users" />
        <StatCard label="Published challenges" value={counts.published_challenges} to="/challenges" />
        <StatCard label="Projects" value={counts.projects} />
        <StatCard label="Applications" value={counts.applications} />
        <StatCard label="Pending verifications" value={counts.pending_organisations} to="/admin/organisations" />
        <StatCard label="Open reports" value={counts.open_reports} to="/admin/reports" />
      </div>
      <div className="dash-grid">
        <section className="card panel">
          <div className="panel-head">
            <h2>Pending verifications</h2>
            <Link to="/admin/organisations">Open verification</Link>
          </div>
          {pending.length ? (
            <ul className="list">
              {pending.map((o) => (
                <li key={o.id}>
                  <strong>{o.name}</strong> <span className="muted">· {o.sector} · {o.rep_name}</span>
                  <div className="small muted">Submitted {formatDate(o.created_at)}</div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No organisations are waiting.</p>}
        </section>
        <section className="card panel">
          <h2>Quick links</h2>
          <ul className="list">
            <li><Link to="/admin/reports">Review reported content</Link></li>
            <li><Link to="/admin/users">Suspend or unlock accounts</Link></li>
            <li><Link to="/admin/audit">View the audit log</Link></li>
            <li><Link to="/admin/pilot-report">Generate the pilot report</Link></li>
          </ul>
        </section>
      </div>
    </>
  );
}

function ParticipantSection({ p }) {
  return (
    <>
      <section className="card panel">
        <div className="panel-head">
          <h2>My applications</h2>
          <Link to="/applications">See all</Link>
        </div>
        {p.applications.length ? (
          <ul className="list">
            {p.applications.slice(0, 5).map((a) => (
              <li key={a.id} className="list-row">
                <Link to={`/challenges/${a.challenge_id}`}>{a.challenge_title}</Link>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No applications yet. <Link to="/challenges">Find a challenge</Link></p>
        )}
      </section>
      <section className="card panel">
        <div className="panel-head">
          <h2>Invitations</h2>
          <Link to="/invitations">See all</Link>
        </div>
        {p.invitations.length ? (
          <ul className="list">
            {p.invitations.map((i) => (
              <li key={i.id} className="list-row">
                <span>{i.challenge_title}</span>
                <Link to="/invitations" className="btn btn-accent btn-sm">Respond</Link>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No invitations waiting for you.</p>}
      </section>
    </>
  );
}

function OwnerSection({ o }) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>My challenges</h2>
        <Link to="/my-challenges">Manage</Link>
      </div>
      <p className="small muted">{o.received.total} applications received · {o.received.pending} waiting for review</p>
      {o.challenges.length ? (
        <ul className="list">
          {o.challenges.slice(0, 5).map((c) => (
            <li key={c.id} className="list-row">
              <span>
                <Link to={`/challenges/${c.id}`}>{c.title}</Link>
                {c.pending_count > 0 && <span className="pill-new">{c.pending_count} new</span>}
              </span>
              <span className="row-inline">
                <StatusBadge status={c.status} />
                {c.status !== 'draft' && <Link to={`/my-challenges/${c.id}/applications`} className="btn btn-outline btn-sm">Review</Link>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">You have not posted a challenge. <Link to="/challenges/new">Post one</Link></p>
      )}
    </section>
  );
}

