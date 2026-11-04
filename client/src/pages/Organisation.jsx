import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fileUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Empty, Field, LoadError, Loading, PageHeader, StatusBadge, VerifiedBadge,
  formatDate, formatSize, useLoad, useSubmit,
} from '../components/ui.jsx';

const SECTORS = ['Agriculture', 'Education', 'Health', 'Environment', 'Technology', 'Finance', 'Energy', 'Transport', 'Tourism', 'Community', 'Other'];

// FR 3.1 Submit organisation details, FR 3.2 pending status, FR 3.5 decision
export function Organisation() {
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get('/organisations/mine'), []);
  const [form, setForm] = useState({ name: '', sector: '', description: '', contact_person: '' });
  const [files, setFiles] = useState([]);
  const [editing, setEditing] = useState(false);
  const s = useSubmit();

  if (loading) return <div className="container"><Loading /></div>;
  if (error) return <div className="container"><LoadError error={error} /></div>;
  const org = data.organisation;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    s.submit(async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      for (const f of files) fd.append('documents', f);
      await api.post('/organisations', fd);
      setEditing(false);
      refresh();
      reload();
    });
  };

  const startResubmit = () => {
    setForm({ name: org.name, sector: org.sector, description: org.description, contact_person: org.contact_person });
    setEditing(true);
  };

  if (org && !editing) {
    return (
      <div className="container narrow">
        <PageHeader title="My organisation" back={{ to: '/dashboard', label: 'Dashboard' }} />
        <div className="card form-card">
          <div className="org-head">
            <h2>{org.name} {org.status === 'verified' && <VerifiedBadge />}</h2>
            <StatusBadge status={org.status} />
          </div>
          {org.status === 'pending' && <Alert type="info">An administrator is reviewing your organisation. You will get a notification and an email when a decision is made. You can still post challenges as an individual in the meantime.</Alert>}
          {org.status === 'verified' && <Alert type="success">Your organisation is verified. Your challenges show the Verified badge.</Alert>}
          {org.status === 'rejected' && (
            <Alert>
              Your organisation was not verified. Reason: {org.rejection_reason}{' '}
              <button className="link-btn" onClick={startResubmit}>Fix and submit again</button>
            </Alert>
          )}
          <dl className="profile-dl">
            <dt>Sector</dt><dd>{org.sector}</dd>
            <dt>Contact person</dt><dd>{org.contact_person}</dd>
            <dt>Description</dt><dd>{org.description}</dd>
            <dt>Submitted</dt><dd>{formatDate(org.created_at)}</dd>
            <dt>Supporting documents</dt>
            <dd>
              {data.documents.length ? (
                <ul className="file-list">
                  {data.documents.map((d) => (
                    <li key={d.id}><a href={fileUrl(`/organisations/${org.id}/documents/${d.id}`)}>{d.filename}</a> <span className="muted">({formatSize(d.size)})</span></li>
                  ))}
                </ul>
              ) : 'None uploaded'}
            </dd>
          </dl>
          <Link to={`/organisations/${org.id}`}>View public page</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container narrow">
      <PageHeader
        title="Register your organisation"
        subtitle="Verified organisations get a badge on their profile and challenges. Verification is optional: anyone with a complete profile can post challenges."
        back={{ to: '/dashboard', label: 'Dashboard' }}
      />
      <Alert>{s.error}</Alert>
      <form className="card form-card" onSubmit={submit} noValidate>
        <Field label="Organisation name" error={s.fields.name} required>
          {(p) => <input {...p} value={form.name} onChange={set('name')} />}
        </Field>
        <div className="grid-2">
          <Field label="Sector" error={s.fields.sector} required>
            {(p) => (
              <select {...p} value={form.sector} onChange={set('sector')}>
                <option value="">Choose a sector</option>
                {SECTORS.map((x) => <option key={x}>{x}</option>)}
              </select>
            )}
          </Field>
          <Field label="Contact person" error={s.fields.contact_person} required>
            {(p) => <input {...p} value={form.contact_person} onChange={set('contact_person')} />}
          </Field>
        </div>
        <Field label="Description" error={s.fields.description} hint="What does your organisation do?" required>
          {(p) => <textarea {...p} rows={4} value={form.description} onChange={set('description')} />}
        </Field>
        <Field label="Supporting documents" hint="For example a registration certificate. PDF, Word or image files, up to 10 MB each, maximum 5 files.">
          {(p) => <input {...p} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt" onChange={(e) => setFiles([...e.target.files])} />}
        </Field>
        <div className="form-actions">
          {editing && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          <button className="btn btn-primary" disabled={s.busy}>{s.busy ? 'Submitting...' : 'Submit for verification'}</button>
        </div>
      </form>
    </div>
  );
}

// FR 3.4 Public organisation page with the Verified badge
export function OrganisationPublic() {
  const { id } = useParams();
  const { data, error, loading } = useLoad(() => api.get(`/organisations/${id}`), [id]);
  if (loading) return <div className="container"><Loading /></div>;
  if (error) return <div className="container"><LoadError error={error} /></div>;
  const o = data.organisation;
  return (
    <div className="container narrow">
      <div className="card profile-card">
        <div className="avatar" aria-hidden="true">{o.name[0]}</div>
        <h1>{o.name} {o.verified && <VerifiedBadge />}</h1>
        <p className="muted">{o.sector} · on GOG since {formatDate(o.created_at)}</p>
        {!o.verified && <p className="small muted">This organisation has not been verified by GOG yet.</p>}
        <p className="prose">{o.description}</p>
      </div>
      <h2 className="section-title small-title">Challenges</h2>
      {data.challenges.length ? (
        <ul className="list card panel">
          {data.challenges.map((c) => (
            <li key={c.id} className="list-row">
              <Link to={`/challenges/${c.id}`}>{c.title}</Link>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      ) : <Empty title="No public challenges yet." />}
    </div>
  );
}
