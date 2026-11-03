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

function ProjectsSection({ projects }) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>Ongoing projects</h2>
        <Link to="/projects">See all</Link>
      </div>
      {projects.length ? (
        <ul className="list">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`}><strong>{p.name}</strong></Link>
              <div className="small muted">{p.challenge_title}{p.is_owner && ' · you own this project'}</div>
              <ProgressBar value={p.progress} label={`${p.name} progress`} />
            </li>
          ))}
        </ul>
      ) : <p className="muted">No active projects yet.</p>}
    </section>
  );
}

// FR 11 Role specific dashboards
export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get('/dashboard'), []);

  if (loading) return <div className="container"><Loading /></div>;
  if (error) return <div className="container"><LoadError error={error} reload={reload} /></div>;
  if (data.role === 'admin') return <div className="container"><AdminDashboard admin={data.admin} /></div>;

  const isOwner = data.role === 'owner';
  const first = user.full_name?.split(' ')[0];

  return (
    <div className="container">
      <PageHeader
        title={`Hello, ${first}`}
        subtitle={isOwner ? 'Your challenges, applicants and teams in one place.' : 'Your applications, invitations and projects in one place.'}
        actions={
          isOwner
            ? <Link to="/challenges/new" className="btn btn-primary">Post a challenge</Link>
            : <Link to="/challenges" className="btn btn-primary">Find challenges</Link>
        }
      />
      {!data.profile.complete && (
        <Alert type="warning">
          Your profile is missing: {data.profile.missing.join(', ')}. A complete profile helps owners choose you and is needed to post a challenge.{' '}
          <Link to="/profile">Complete my profile</Link>
        </Alert>
      )}
      {data.organisation && (
        <Alert type={data.organisation.status === 'verified' ? 'success' : data.organisation.status === 'rejected' ? 'error' : 'info'}>
          Organisation <strong>{data.organisation.name}</strong>: <StatusBadge status={data.organisation.status} />
          {data.organisation.rejection_reason && ` Reason: ${data.organisation.rejection_reason}`} <Link to="/organisation">View</Link>
        </Alert>
      )}

      <div className="stats">
        {isOwner ? (
          <>
            <StatCard label="My challenges" value={data.owner.challenges.length} to="/my-challenges" />
            <StatCard label="Applications to review" value={data.owner.received.pending} to="/my-challenges" />
            <StatCard label="Active projects" value={data.participant.projects.length} to="/projects" />
          </>
        ) : (
          <>
            <StatCard label="Applications" value={data.participant.applications.length} to="/applications" />
            <StatCard label="Invitations waiting" value={data.participant.invitations.length} to="/invitations" />
            <StatCard label="Active projects" value={data.participant.projects.length} to="/projects" />
          </>
        )}
      </div>

      <div className="dash-grid">
        {isOwner ? (
          <>
            <OwnerSection o={data.owner} />
            <ProjectsSection projects={data.participant.projects} />
            {data.participant.applications.length > 0 && <ParticipantSection p={data.participant} />}
            {!data.organisation && (
              <section className="card panel">
                <h2>Representing an organisation?</h2>
                <p className="muted">Register it to get a Verified badge on your challenges. Individuals can post challenges without one.</p>
                <Link to="/organisation" className="btn btn-outline">Register organisation</Link>
              </section>
            )}
          </>
        ) : (
          <>
            <ParticipantSection p={data.participant} />
            <ProjectsSection projects={data.participant.projects} />
            {data.owner.challenges.length > 0 && <OwnerSection o={data.owner} />}
          </>
        )}
      </div>
      {!isOwner && data.participant.applications.length === 0 && (
        <Empty title="Start your first application">
          Browse open challenges and apply with a short motivation. It only takes a few minutes.
        </Empty>
      )}
    </div>
  );
}
