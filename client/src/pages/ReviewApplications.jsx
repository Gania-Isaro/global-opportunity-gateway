import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  Alert, Empty, Field, LoadError, Loading, PageHeader, SkillTags, StatusBadge,
  formatDate, useLoad, useSubmit,
} from '../components/ui.jsx';

function ApplicantCard({ a, onAction }) {
  const [open, setOpen] = useState(false);
  const pending = ['submitted', 'under_review'].includes(a.status);
  return (
    <article className="card applicant">
      <div className="applicant-head">
        <div>
          <h3><Link to={`/users/${a.participant_id}`}>{a.full_name}</Link></h3>
          <p className="small muted">{a.location} · applied {formatDate(a.created_at)}</p>
        </div>
        <div className="applicant-status">
          <StatusBadge status={a.status} />
          {a.invitation_status && <StatusBadge status={a.invitation_status} />}
          {a.in_team && <span className="badge badge-active">In team</span>}
        </div>
      </div>
      <blockquote className="motivation">{a.motivation}</blockquote>
      <SkillTags skills={a.skills} />
      <button className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide profile' : 'Show full profile'}
      </button>
      {open && (
        <dl className="profile-dl">
          {a.bio && <><dt>Bio</dt><dd>{a.bio}</dd></>}
          {a.education && <><dt>Education</dt><dd>{a.education}</dd></>}
          {a.experiences && <><dt>Global experiences</dt><dd>{a.experiences}</dd></>}
          {a.interests && <><dt>Interests</dt><dd>{a.interests}</dd></>}
          <dt>Email</dt><dd><a href={`mailto:${a.email}`}>{a.email}</a></dd>
        </dl>
      )}
      <div className="applicant-actions">
        {pending && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => onAction(`/applications/${a.id}/decision`, { decision: 'accepted' })}>Accept</button>
            <button className="btn btn-ghost btn-sm danger-text" onClick={() => onAction(`/applications/${a.id}/decision`, { decision: 'rejected' }, `Reject ${a.full_name}'s application?`)}>Reject</button>
          </>
        )}
        {a.status === 'accepted' && !a.invitation_status && (
          <button className="btn btn-accent btn-sm" onClick={() => onAction(`/applications/${a.id}/invite`)}>Send invitation</button>
        )}
        {a.invitation_status === 'sent' && <span className="small muted">Waiting for {a.full_name.split(' ')[0]} to respond.</span>}
      </div>
    </article>
  );
}

function FormTeam({ challenge, applications, onDone }) {
  const confirmed = applications.filter((a) => a.invitation_status === 'confirmed');
  const [name, setName] = useState(`${challenge.title} team`);
  const [chosen, setChosen] = useState(() => confirmed.map((a) => a.participant_id));
  const { busy, error, fields, submit } = useSubmit();
  const navigate = useNavigate();

  const toggle = (id) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const create = (e) => {
    e.preventDefault();
    submit(async () => {
      const r = await api.post(`/challenges/${challenge.id}/project`, { name, members: chosen });
      onDone?.();
      navigate(`/projects/${r.project.id}`);
    });
  };

  return (
    <form className="card side-card" onSubmit={create} noValidate>
      <h2>Form the team</h2>
      <p className="small muted">Participants who confirmed your invitation can join. A private project workspace is created for the team.</p>
      <Alert>{error}</Alert>
      {confirmed.length === 0 ? (
        <p className="muted">No one has confirmed an invitation yet. Accept applicants and send invitations first.</p>
      ) : (
        <>
          <Field label="Project name" error={fields.name} required>
            {(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <fieldset className="checklist">
            <legend>Team members</legend>
            {confirmed.map((a) => (
              <label key={a.id} className="check">
                <input type="checkbox" checked={chosen.includes(a.participant_id)} onChange={() => toggle(a.participant_id)} />
                {a.full_name}
              </label>
            ))}
          </fieldset>
          <button className="btn btn-primary btn-block" disabled={busy || chosen.length === 0}>
            {busy ? 'Creating...' : 'Form team and create project'}
          </button>
        </>
      )}
    </form>
  );
}

// FR 7 Review and selection, FR 8 Team formation
export default function ReviewApplications() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(() => api.get(`/challenges/${id}/applications`), [id]);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState('all');

  const onAction = async (url, body, confirmText) => {
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

  if (loading && !data) return <div className="container"><Loading /></div>;
  if (error) return <div className="container"><LoadError error={error} /></div>;
  const { challenge, applications, project } = data;
  const shown = applications.filter((a) =>
    filter === 'all' ? true : filter === 'pending' ? ['submitted', 'under_review'].includes(a.status) : a.status === filter
  );
  const counts = {
    pending: applications.filter((a) => ['submitted', 'under_review'].includes(a.status)).length,
    accepted: applications.filter((a) => a.status === 'accepted').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  };

  return (
    <div className="container">
      <PageHeader
        title="Review applications"
        subtitle={<>For <Link to={`/challenges/${challenge.id}`}>{challenge.title}</Link> · team size {challenge.team_size}</>}
        back={{ to: '/my-challenges', label: 'My challenges' }}
      />
      <Alert type="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert onClose={() => setErr(null)}>{err}</Alert>

      <div className="detail-layout">
        <div>
          <div className="tabs" role="tablist" aria-label="Filter applications">
            {[
              ['all', `All (${applications.length})`],
              ['pending', `To review (${counts.pending})`],
              ['accepted', `Accepted (${counts.accepted})`],
              ['rejected', `Rejected (${counts.rejected})`],
            ].map(([key, label]) => (
              <button key={key} role="tab" aria-selected={filter === key} className={`tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          {shown.length ? (
            <div className="stack">
              {shown.map((a) => <ApplicantCard key={a.id} a={a} onAction={onAction} />)}
            </div>
          ) : (
            <Empty title="No applications here yet." />
          )}
        </div>
        <aside>
          {project ? (
            <div className="card side-card">
              <h2>Team formed</h2>
              <p>The project <strong>{project.name}</strong> is <StatusBadge status={project.status} />.</p>
              <Link to={`/projects/${project.id}`} className="btn btn-primary btn-block">Open workspace</Link>
              <p className="small muted">Participants who confirm later can be added from the workspace overview.</p>
            </div>
          ) : (
            <FormTeam challenge={challenge} applications={applications} onDone={reload} />
          )}
        </aside>
      </div>
    </div>
  );
}
