import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ReportButton from '../components/ReportButton.jsx';
import { Alert, Field, LoadError, Loading, PageHeader, SkillTags, VerifiedBadge, formatDate, useLoad, useSubmit } from '../components/ui.jsx';

// FR 2.1 Manage profile, FR 2.2 Interests and experiences
export function Profile() {
  const { refresh } = useAuth();
  const { data, error, loading } = useLoad(() => api.get('/profile'), []);
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState(null);
  const s = useSubmit();

  useEffect(() => {
    if (data) {
      setForm({ ...data.profile, skills: data.profile.skills.join(', ') });
      setStatus(data.status);
    }
  }, [data]);

  if (loading || !form) return <div className="container">{error ? <LoadError error={error} /> : <Loading />}</div>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = (e) => {
    e.preventDefault();
    setMsg(null);
    s.submit(async () => {
      const r = await api.put('/profile', { ...form, skills: form.skills.split(',') });
      setStatus(r.status);
      setMsg(r.message);
      refresh();
      window.scrollTo(0, 0);
    });
  };

  return (
    <div className="container narrow">
      <PageHeader
        title="My profile"
        subtitle="Owners see your full profile only after you apply to their challenge."
        actions={<Link to="/organisation" className="btn btn-ghost">My organisation</Link>}
      />
      {status && !status.complete && (
        <Alert type="warning">To post challenges, add your {status.missing.join(', ')}.</Alert>
      )}
      <Alert type="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert>{s.error}</Alert>
      <form className="card form-card" onSubmit={save} noValidate>
        <h2 className="form-section">About you</h2>
        <Field label="Full name" error={s.fields.full_name} required>
          {(p) => <input {...p} value={form.full_name} onChange={set('full_name')} />}
        </Field>
        <Field label="Short bio" error={s.fields.bio} hint="One or two sentences about who you are.">
          {(p) => <textarea {...p} rows={3} maxLength={600} value={form.bio} onChange={set('bio')} />}
        </Field>
        <div className="grid-2">
          <Field label="Location" error={s.fields.location} hint="For example: Kigali, Gasabo">
            {(p) => <input {...p} value={form.location} onChange={set('location')} />}
          </Field>
          <Field label="Education" error={s.fields.education}>
            {(p) => <input {...p} value={form.education} onChange={set('education')} />}
          </Field>
        </div>
        <Field label="Skills" error={s.fields.skills} hint="Separate skills with commas, for example: Data analysis, React, Public speaking">
          {(p) => <input {...p} value={form.skills} onChange={set('skills')} />}
        </Field>
        <h2 className="form-section">Global experience</h2>
        <Field label="Experiences" error={s.fields.experiences} hint="Study abroad, exchanges, conferences, research or work in other countries. What did you learn?">
          {(p) => <textarea {...p} rows={4} value={form.experiences} onChange={set('experiences')} />}
        </Field>
        <Field label="Interests" error={s.fields.interests} hint="Topics and problems you care about.">
          {(p) => <textarea {...p} rows={2} value={form.interests} onChange={set('interests')} />}
        </Field>
        <div className="form-actions">
          <button className="btn btn-primary" disabled={s.busy}>{s.busy ? 'Saving...' : 'Save profile'}</button>
        </div>
      </form>
    </div>
  );
}

// FR 2.3 Restricted profile view
export function UserProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading } = useLoad(() => api.get(`/users/${id}`), [id]);
  if (loading) return <div className="container"><Loading /></div>;
  if (error) return <div className="container"><LoadError error={error} /></div>;
  const p = data.profile;

  return (
    <div className="container narrow">
      <div className="card profile-card">
        <div className="avatar" aria-hidden="true">{p.full_name?.[0]}</div>
        <h1>{p.full_name}</h1>
        <p className="muted">
          {p.role === 'owner' ? 'Challenge owner' : 'Participant'}
          {p.org_name && <> · {p.org_name} {p.org_status === 'verified' && <VerifiedBadge />}</>}
          {p.location && ` · ${p.location}`}
        </p>
        <SkillTags skills={p.skills} />
        {data.restricted ? (
          <Alert type="info">Only part of this profile is visible. Full profiles are shown to challenge owners after the person applies to their challenge, and to teammates.</Alert>
        ) : (
          <dl className="profile-dl">
            {p.bio && <><dt>Bio</dt><dd>{p.bio}</dd></>}
            {p.education && <><dt>Education</dt><dd>{p.education}</dd></>}
            {p.experiences && <><dt>Global experiences</dt><dd>{p.experiences}</dd></>}
            {p.interests && <><dt>Interests</dt><dd>{p.interests}</dd></>}
            {p.member_since && <><dt>Member since</dt><dd>{formatDate(p.member_since)}</dd></>}
          </dl>
        )}
        {user.id !== Number(id) && <p className="report-line"><ReportButton targetType="user" targetId={Number(id)} label="Report this account" /></p>}
      </div>
    </div>
  );
}
