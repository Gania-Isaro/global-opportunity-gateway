import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, fileUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Alert, Empty, Field, LoadError, Loading, PageHeader, ProgressBar, SkillTags, StatusBadge,
  VerifiedBadge, formatDate, formatDateTime, formatSize, useLoad, useSubmit,
} from '../components/ui.jsx';

export function Projects() {
  const { data, error, loading } = useLoad(() => api.get('/projects/mine'), []);
  return (
    <div className="container">
      <PageHeader title="My projects" subtitle="Private workspaces for the teams you belong to." />
      {loading && <Loading />}
      {error && <LoadError error={error} />}
      {data && !data.projects.length && (
        <Empty title="You are not part of a project yet.">
          Projects are created when a challenge owner forms a team. <Link to="/challenges">Find a challenge</Link>
        </Empty>
      )}
      <div className="card-grid">
        {data?.projects.map((p) => (
          <article key={p.id} className="card challenge-card">
            <div className="card-top">
              <span className="sector">{p.role}</span>
              <StatusBadge status={p.status} />
            </div>
            <h3><Link to={`/projects/${p.id}`} className="stretched">{p.name}</Link></h3>
            <p className="small muted">{p.challenge_title}</p>
            <ProgressBar value={p.progress} label={`${p.name} progress`} />
          </article>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  ['overview', 'Overview'],
  ['tasks', 'Tasks'],
  ['research', 'Research'],
  ['files', 'Files'],
  ['discussions', 'Discussions'],
  ['milestones', 'Milestones'],
];

// FR 9 Private project workspace
export function Workspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';
  const overview = useLoad(() => api.get(`/projects/${id}`), [id]);

  if (overview.loading && !overview.data) return <div className="container"><Loading /></div>;
  if (overview.error) {
    return (
      <div className="container">
        <Alert>{overview.error.message}</Alert>
        <Link to="/projects">Back to my projects</Link>
      </div>
    );
  }
  const d = overview.data;

  return (
    <div className="container">
      <PageHeader
        title={d.project.name}
        subtitle={<>Private workspace for <Link to={`/challenges/${d.challenge.id}`}>{d.challenge.title}</Link></>}
        back={{ to: '/projects', label: 'My projects' }}
        actions={<span className="lock-note"><StatusBadge status={d.project.status} /> Only the team can see this</span>}
      />
      <div className="workspace-progress card">
        <span>Project progress</span>
        <ProgressBar value={d.progress.percent} />
        <span className="small muted">
          {d.progress.tasks_done}/{d.progress.tasks_total} tasks · {d.progress.milestones_done}/{d.progress.milestones_total} milestones
        </span>
      </div>
      <div className="tabs" role="tablist" aria-label="Workspace sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && <Overview d={d} reload={overview.reload} />}
        {tab === 'tasks' && <Tasks projectId={id} members={d.members} onChange={overview.reload} />}
        {tab === 'research' && <Research projectId={id} />}
        {tab === 'files' && <Files projectId={id} />}
        {tab === 'discussions' && <Discussions projectId={id} />}
        {tab === 'milestones' && <Milestones projectId={id} canManage={d.access.canManage} onChange={overview.reload} />}
      </div>
    </div>
  );
}

function useFlash() {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (fn) => {
    setErr(null);
    try {
      const r = await fn();
      setMsg(r?.message || null);
      return r;
    } catch (e) {
      setErr(e.message);
      return null;
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

// FR 9.2 Overview, FR 8.3 roles
function Overview({ d, reload }) {
  const { run, view } = useFlash();
  const [addId, setAddId] = useState('');
  const canManage = d.access.canManage;

  const setRole = async (userId, current) => {
    const role = window.prompt('Role for this member (for example: Technical lead, Researcher, Designer)', current);
    if (role === null || !role.trim()) return;
    await run(() => api.put(`/projects/${d.project.id}/members/${userId}`, { role }));
    reload();
  };

  return (
    <div className="ws-grid">
      <section className="card panel">
        {view}
        <h2>Challenge summary</h2>
        <p className="owner-line">{d.challenge.org_name} {d.challenge.verified && <VerifiedBadge />}</p>
        <p className="prose">{d.challenge.description}</p>
        <h3>Expected outcome</h3>
        <p className="prose">{d.challenge.outcome}</p>
        <SkillTags skills={d.challenge.skills} />
        {canManage && (
          <div className="form-actions">
            <button
              className="btn btn-outline btn-sm"
              onClick={async () => {
                const done = d.project.status === 'active';
                if (window.confirm(done ? 'Mark this project as completed?' : 'Reopen this project?')) {
                  await run(() => api.post(`/projects/${d.project.id}/complete`));
                  reload();
                }
              }}
            >
              {d.project.status === 'active' ? 'Mark project completed' : 'Reopen project'}
            </button>
          </div>
        )}
      </section>
      <section className="card panel">
        <h2>Team members</h2>
        <ul className="members">
          {d.members.map((m) => (
            <li key={m.user_id}>
              <span className="avatar sm" aria-hidden="true">{m.full_name[0]}</span>
              <div>
                <Link to={`/users/${m.user_id}`}><strong>{m.full_name}</strong></Link>
                <div className="small muted">{m.role}</div>
              </div>
              {canManage && !m.is_owner && (
                <button className="btn btn-ghost btn-sm" onClick={() => setRole(m.user_id, m.role)}>Set role</button>
              )}
            </li>
          ))}
        </ul>
        {canManage && d.available.length > 0 && (
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!addId) return;
              await run(() => api.post(`/projects/${d.project.id}/members`, { user_id: Number(addId) }));
              setAddId('');
              reload();
            }}
          >
            <label htmlFor="add-member" className="sr-only">Add a confirmed participant</label>
            <select id="add-member" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">Add a confirmed participant</option>
              {d.available.map((a) => <option key={a.user_id} value={a.user_id}>{a.full_name}</option>)}
            </select>
            <button className="btn btn-outline btn-sm">Add</button>
          </form>
        )}
      </section>
    </div>
  );
}

// FR 9.3 Tasks
function Tasks({ projectId, members, onChange }) {
  const { data, loading, error, reload } = useLoad(() => api.get(`/projects/${projectId}/tasks`), [projectId]);
  const [form, setForm] = useState({ title: '', assignee_id: '', due_date: '' });
  const s = useSubmit();
  const { run, view } = useFlash();

  const refresh = () => {
    reload();
    onChange();
  };

  const create = (e) => {
    e.preventDefault();
    s.submit(async () => {
      await api.post(`/projects/${projectId}/tasks`, {
        title: form.title,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        due_date: form.due_date || null,
      });
      setForm({ title: '', assignee_id: '', due_date: '' });
      refresh();
    });
  };

  const update = async (t, changes) => {
    await run(() => api.put(`/projects/${projectId}/tasks/${t.id}`, changes));
    refresh();
  };

  const columns = [['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Done']];

  return (
    <div>
      {view}
      <form className="card add-row" onSubmit={create} noValidate>
        <Alert>{s.error}</Alert>
        <div className="add-grid">
          <Field label="New task" error={s.fields.title} required>
            {(p) => <input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" />}
          </Field>
          <Field label="Assign to">
            {(p) => (
              <select {...p} value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Due date" error={s.fields.due_date}>
            {(p) => <input {...p} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />}
          </Field>
          <button className="btn btn-primary" disabled={s.busy}>Add task</button>
        </div>
      </form>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && (
        <div className="board">
          {columns.map(([status, label]) => {
            const items = data.tasks.filter((t) => t.status === status);
            return (
              <section key={status} className="board-col">
                <h3>{label} <span className="count">{items.length}</span></h3>
                {items.map((t) => (
                  <article key={t.id} className={`task card ${t.status === 'done' ? 'done' : ''}`}>
                    <label className="check">
                      <input type="checkbox" checked={t.status === 'done'} onChange={() => update(t, { status: t.status === 'done' ? 'todo' : 'done' })} />
                      <span className="task-title">{t.title}</span>
                    </label>
                    <div className="task-meta small">
                      <select
                        aria-label={`Assignee for ${t.title}`}
                        value={t.assignee_id || ''}
                        onChange={(e) => update(t, { assignee_id: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                      </select>
                      {t.due_date && <span className="muted">Due {formatDate(t.due_date)}</span>}
                    </div>
                    <div className="task-actions">
                      <select aria-label={`Status for ${t.title}`} value={t.status} onChange={(e) => update(t, { status: e.target.value })}>
                        {columns.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button
                        className="icon-btn danger-text"
                        aria-label={`Delete ${t.title}`}
                        onClick={async () => {
                          if (window.confirm('Delete this task?')) {
                            await run(() => api.del(`/projects/${projectId}/tasks/${t.id}`));
                            refresh();
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </article>
                ))}
                {!items.length && <p className="muted small">Nothing here.</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

