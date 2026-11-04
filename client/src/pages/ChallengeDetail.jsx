import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ReportButton from '../components/ReportButton.jsx';
import {
  Alert, Field, LoadError, Loading, SkillTags, StatusBadge, VerifiedBadge,
  daysLeft, formatDate, useLoad, useSubmit,
} from '../components/ui.jsx';

function ApplyBox({ challenge, myApplication, isOwner, reload }) {
  const { user } = useAuth();
  const location = useLocation();
  const [motivation, setMotivation] = useState('');
  const [message, setMessage] = useState(null);
  const { busy, error, fields, submit } = useSubmit();

  if (!user) {
    return (
      <div className="card side-card">
        <h2>Interested?</h2>
        <p>Log in or create a free account to apply to this challenge.</p>
        <Link to="/login" state={{ from: location.pathname }} className="btn btn-primary btn-block">Log in to apply</Link>
        <Link to="/register" className="btn btn-ghost btn-block">Create an account</Link>
      </div>
    );
  }
  if (isOwner) {
    return (
      <div className="card side-card">
        <h2>You own this challenge</h2>
        <p>You cannot apply to your own challenge. Manage it from here.</p>
        <Link to={`/my-challenges/${challenge.id}/applications`} className="btn btn-primary btn-block">Review applications</Link>
        {challenge.status !== 'closed' && (
          <Link to={`/challenges/${challenge.id}/edit`} className="btn btn-ghost btn-block">Edit challenge</Link>
        )}
      </div>
    );
  }
  if (user.role === 'admin') return null;
  if (myApplication) {
    return (
      <div className="card side-card">
        <h2>Your application</h2>
        <p>Status: <StatusBadge status={myApplication.status} /></p>
        <p className="small muted">Submitted {formatDate(myApplication.created_at)}</p>
        <Link to="/applications" className="btn btn-outline btn-block">Track my applications</Link>
      </div>
    );
  }
  if (challenge.status !== 'published') {
    return (
      <div className="card side-card">
        <h2>Applications closed</h2>
        <p>This challenge no longer accepts applications.</p>
      </div>
    );
  }

  const apply = (e) => {
    e.preventDefault();
    submit(async () => {
      const r = await api.post(`/challenges/${challenge.id}/applications`, { motivation });
      setMessage(r.message);
      reload();
    });
  };

  return (
    <form className="card side-card" onSubmit={apply} noValidate>
      <h2>Apply to this challenge</h2>
      <Alert type="success">{message}</Alert>
      <Alert>{error}</Alert>
      {!user.email_verified && <Alert type="warning">Confirm your email address before applying.</Alert>}
      <Field
        label="Why do you want to join?"
        error={fields.motivation}
        hint="Share the experience or skills you would bring. Two or three sentences is enough."
        required
      >
        {(p) => <textarea {...p} rows={6} maxLength={1500} value={motivation} onChange={(e) => setMotivation(e.target.value)} />}
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Submitting...' : 'Submit application'}</button>
      <p className="small muted">The owner will see your full profile once you apply.</p>
    </form>
  );
}

export default function ChallengeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get(`/challenges/${id}`), [id]);

  if (loading) return <div className="container"><Loading /></div>;
  if (error) return <div className="container"><LoadError error={error} /></div>;
  const { challenge: c, isOwner, myApplication, project } = data;

  return (
    <div className="container">
      <Link to="/challenges" className="back-link">← All challenges</Link>
      <div className="detail-layout">
        <article className="detail-main">
          <div className="detail-tags">
            <span className="sector">{c.sector}</span>
            <StatusBadge status={c.status} />
          </div>
          <h1>{c.title}</h1>
          <p className="owner-line">
            Posted by{' '}
            {c.org_id ? <Link to={`/organisations/${c.org_id}`}>{c.org_name}</Link> : c.owner_name}
            {c.verified && <VerifiedBadge />}
            {!c.org_id && <span className="muted"> (individual)</span>}
          </p>

          <dl className="facts">
            <div><dt>Application deadline</dt><dd>{formatDate(c.deadline)} {c.status === 'published' && <span className="muted">({daysLeft(c.deadline)})</span>}</dd></div>
            <div><dt>Team size</dt><dd>{c.team_size} people</dd></div>
            <div><dt>Applications</dt><dd>{c.application_count}</dd></div>
          </dl>

          <section>
            <h2>The challenge</h2>
            <p className="prose">{c.description}</p>
          </section>
          <section>
            <h2>Expected outcome</h2>
            <p className="prose">{c.outcome}</p>
          </section>
          <section>
            <h2>Skills needed</h2>
            <SkillTags skills={c.skills} />
          </section>
          {project && (
            <Alert type="info">A team has been formed for this challenge: {project.name}.</Alert>
          )}
          {user && !isOwner && (
            <p className="report-line"><ReportButton targetType="challenge" targetId={c.id} /></p>
          )}
        </article>
        <aside>
          <ApplyBox challenge={c} myApplication={myApplication} isOwner={isOwner} reload={reload} />
        </aside>
      </div>
    </div>
  );
}
