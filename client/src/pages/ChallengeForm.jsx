import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Field, LoadError, Loading, PageHeader, useLoad, useSubmit } from '../components/ui.jsx';

const EMPTY = { title: '', description: '', sector: '', skills: '', outcome: '', deadline: '', team_size: 3 };

// FR 4.1 Create, FR 4.2 Draft / edit / publish
export default function ChallengeForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState('draft');
  const { busy, error, fields, submit } = useSubmit();

  const meta = useLoad(() => api.get('/challenges/meta'), []);
  const profile = useLoad(() => api.get('/profile'), []);
  const existing = useLoad(() => (editing ? api.get(`/challenges/${id}`) : Promise.resolve(null)), [id]);

  useEffect(() => {
    const c = existing.data?.challenge;
    if (c) {
      setForm({ ...c, skills: c.skills.join(', ') });
      setStatus(c.status);
    }
  }, [existing.data]);

  if (meta.loading || profile.loading || existing.loading) return <div className="container"><Loading /></div>;
  if (existing.error) return <div className="container"><LoadError error={existing.error} /></div>;
  if (editing && existing.data && !existing.data.isOwner) {
    return <div className="container"><Alert>Only the owner of this challenge can edit it.</Alert></div>;
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const today = new Date().toISOString().slice(0, 10);
  const blockers = [];
  if (!user.email_verified) blockers.push('confirm your email address');
  if (!profile.data?.status.complete) blockers.push(`complete your profile (missing: ${profile.data?.status.missing.join(', ')})`);

  const save = (publish) => (e) => {
    e.preventDefault();
    submit(async () => {
      const body = { ...form, team_size: Number(form.team_size), skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean) };
      if (editing) {
        await api.put(`/challenges/${id}`, body);
        if (publish && status === 'draft') await api.post(`/challenges/${id}/publish`);
        navigate(`/challenges/${id}`);
      } else {
        const r = await api.post('/challenges', { ...body, publish });
        navigate(publish ? `/challenges/${r.challenge.id}` : '/my-challenges');
      }
    });
  };

  return (
    <div className="container narrow">
      <PageHeader
        title={editing ? 'Edit challenge' : 'Post a challenge'}
        subtitle="Describe a real problem in Kigali so the right people can apply."
        back={{ to: '/my-challenges', label: 'My challenges' }}
      />
      {blockers.length > 0 && (
        <Alert type="warning">
          Before you can create a challenge, please {blockers.join(' and ')}. <Link to="/profile">Go to my profile</Link>
        </Alert>
      )}
      <Alert>{error}</Alert>
      <form className="card form-card" onSubmit={save(true)} noValidate>
        <Field label="Title" error={fields.title} required>
          {(p) => <input {...p} maxLength={160} value={form.title} onChange={set('title')} placeholder="For example: Smart waste collection for Kimironko market" />}
        </Field>
        <Field label="Description" error={fields.description} hint="What is the problem, who does it affect, and what have you seen work elsewhere?" required>
          {(p) => <textarea {...p} rows={7} value={form.description} onChange={set('description')} />}
        </Field>
        <div className="grid-2">
          <Field label="Sector" error={fields.sector} required>
            {(p) => (
              <select {...p} value={form.sector} onChange={set('sector')}>
                <option value="">Choose a sector</option>
                {meta.data.sectors.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
          </Field>
          <Field label="Skills needed" error={fields.skills} hint="Separate skills with commas." required>
            {(p) => <input {...p} value={form.skills} onChange={set('skills')} placeholder="Data analysis, UI/UX design" />}
          </Field>
        </div>
        <Field label="Expected outcome" error={fields.outcome} hint="What should the team deliver?" required>
          {(p) => <textarea {...p} rows={3} value={form.outcome} onChange={set('outcome')} />}
        </Field>
        <div className="grid-2">
          <Field label="Application deadline" error={fields.deadline} required>
            {(p) => <input {...p} type="date" min={today} value={form.deadline} onChange={set('deadline')} />}
          </Field>
          <Field label="Team size" error={fields.team_size} hint="How many participants do you need?" required>
            {(p) => <input {...p} type="number" min={1} max={50} value={form.team_size} onChange={set('team_size')} />}
          </Field>
        </div>
        <div className="form-actions">
          {status === 'draft' && (
            <button type="button" className="btn btn-outline" disabled={busy || blockers.length > 0} onClick={save(false)}>
              Save as draft
            </button>
          )}
          <button className="btn btn-primary" disabled={busy || blockers.length > 0}>
            {busy ? 'Saving...' : status === 'draft' ? 'Publish challenge' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
