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

// FR 9.4 Research notes and links
function Research({ projectId }) {
  const { user } = useAuth();
  const { data, loading, reload } = useLoad(() => api.get(`/projects/${projectId}/notes`), [projectId]);
  const [form, setForm] = useState({ title: '', body: '', link: '' });
  const s = useSubmit();
  const { run, view } = useFlash();

  const create = (e) => {
    e.preventDefault();
    s.submit(async () => {
      await api.post(`/projects/${projectId}/notes`, { ...form, link: form.link || null });
      setForm({ title: '', body: '', link: '' });
      reload();
    });
  };

  return (
    <div className="ws-grid">
      <form className="card panel" onSubmit={create} noValidate>
        <h2>Add a research note</h2>
        <Alert>{s.error}</Alert>
        <Field label="Title" error={s.fields.title} required>
          {(p) => <input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
        </Field>
        <Field label="Findings" error={s.fields.body}>
          {(p) => <textarea {...p} rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />}
        </Field>
        <Field label="Link" error={s.fields.link} hint="Optional source, for example https://...">
          {(p) => <input {...p} type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />}
        </Field>
        <button className="btn btn-primary" disabled={s.busy}>Save note</button>
      </form>
      <section>
        {view}
        {loading && !data && <Loading />}
        {data && !data.notes.length && <Empty title="No research notes yet." />}
        <div className="stack">
          {data?.notes.map((n) => (
            <article key={n.id} className="card note">
              <h3>{n.title}</h3>
              <p className="small muted">{n.author_name} · {formatDateTime(n.created_at)}</p>
              {n.body && <p className="prose">{n.body}</p>}
              {n.link && <a href={n.link} target="_blank" rel="noopener noreferrer">{n.link}</a>}
              {n.author_id === user.id && (
                <button className="link-btn danger-link" onClick={async () => { await run(() => api.del(`/projects/${projectId}/notes/${n.id}`)); reload(); }}>
                  Delete
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

// FR 9.5 Files (up to 10 MB)
function Files({ projectId }) {
  const { data, loading, reload } = useLoad(() => api.get(`/projects/${projectId}/files`), [projectId]);
  const input = useRef(null);
  const s = useSubmit();
  const { run, view } = useFlash();

  const upload = (e) => {
    e.preventDefault();
    const file = input.current.files[0];
    if (!file) return s.setError('Choose a file to upload.');
    if (file.size > 10 * 1024 * 1024) return s.setError('File is too large. The maximum size is 10 MB.');
    s.submit(async () => {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/projects/${projectId}/files`, fd);
      input.current.value = '';
      reload();
    });
  };

  return (
    <div>
      {view}
      <form className="card add-row" onSubmit={upload}>
        <Alert>{s.error}</Alert>
        <div className="upload-row">
          <label htmlFor="file-input">Upload a file <span className="muted small">(PDF, Office, images, text or CSV, up to 10 MB)</span></label>
          <input id="file-input" ref={input} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.txt,.csv" />
          <button className="btn btn-primary" disabled={s.busy}>{s.busy ? 'Uploading...' : 'Upload'}</button>
        </div>
      </form>
      {loading && !data && <Loading />}
      {data && !data.files.length && <Empty title="No files shared yet." />}
      {data?.files.length > 0 && (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr><th scope="col">File</th><th scope="col">Size</th><th scope="col">Uploaded by</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.files.map((f) => (
                <tr key={f.id}>
                  <td data-label="File"><a href={fileUrl(`/projects/${projectId}/files/${f.id}`)}>{f.filename}</a></td>
                  <td data-label="Size">{formatSize(f.size)}</td>
                  <td data-label="Uploaded by">{f.uploader_name} <span className="muted small">{formatDate(f.created_at)}</span></td>
                  <td className="row-actions">
                    <a className="btn btn-outline btn-sm" href={fileUrl(`/projects/${projectId}/files/${f.id}`)}>Download</a>
                    <button className="btn btn-ghost btn-sm danger-text" onClick={async () => {
                      if (window.confirm('Delete this file?')) { await run(() => api.del(`/projects/${projectId}/files/${f.id}`)); reload(); }
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// FR 9.6 Discussions
function Discussions({ projectId }) {
  const { data, loading, reload } = useLoad(() => api.get(`/projects/${projectId}/posts`), [projectId]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const s = useSubmit();

  const post = (text, parentId) =>
    s.submit(async () => {
      await api.post(`/projects/${projectId}/posts`, { body: text, parent_id: parentId || null });
      if (parentId) {
        setReply('');
        setReplyTo(null);
      } else setBody('');
      reload();
    });

  const posts = data?.posts || [];
  const top = posts.filter((p) => !p.parent_id);
  const replies = (id) => posts.filter((p) => p.parent_id === id);

  return (
    <div className="narrow-left">
      <form className="card add-row" onSubmit={(e) => { e.preventDefault(); post(body); }} noValidate>
        <Alert>{s.error}</Alert>
        <Field label="Start a discussion" error={!replyTo ? s.fields.body : undefined}>
          {(p) => <textarea {...p} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share an update or ask the team a question" />}
        </Field>
        <button className="btn btn-primary" disabled={s.busy}>Post</button>
      </form>
      {loading && !data && <Loading />}
      {data && !top.length && <Empty title="No messages yet. Start the conversation." />}
      <div className="stack">
        {top.map((p) => (
          <article key={p.id} className="card post">
            <header><strong>{p.author_name}</strong> <span className="small muted">{formatDateTime(p.created_at)}</span></header>
            <p className="prose">{p.body}</p>
            <div className="replies">
              {replies(p.id).map((r) => (
                <div key={r.id} className="reply">
                  <header><strong>{r.author_name}</strong> <span className="small muted">{formatDateTime(r.created_at)}</span></header>
                  <p className="prose">{r.body}</p>
                </div>
              ))}
            </div>
            {replyTo === p.id ? (
              <form className="reply-form" onSubmit={(e) => { e.preventDefault(); post(reply, p.id); }}>
                <label htmlFor={`reply-${p.id}`} className="sr-only">Your reply</label>
                <textarea id={`reply-${p.id}`} rows={2} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus />
                <div className="form-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyTo(null)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" disabled={s.busy}>Reply</button>
                </div>
              </form>
            ) : (
              <button className="link-btn" onClick={() => { setReplyTo(p.id); setReply(''); }}>Reply</button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

// FR 9.7 Milestones
function Milestones({ projectId, canManage, onChange }) {
  const { data, loading, reload } = useLoad(() => api.get(`/projects/${projectId}/milestones`), [projectId]);
  const [form, setForm] = useState({ title: '', due_date: '' });
  const s = useSubmit();
  const { run, view } = useFlash();

  const refresh = () => {
    reload();
    onChange();
  };

  return (
    <div className="narrow-left">
      {view}
      {canManage ? (
        <form className="card add-row" noValidate onSubmit={(e) => {
          e.preventDefault();
          s.submit(async () => {
            await api.post(`/projects/${projectId}/milestones`, { title: form.title, due_date: form.due_date || null });
            setForm({ title: '', due_date: '' });
            refresh();
          });
        }}>
          <Alert>{s.error}</Alert>
          <div className="add-grid add-grid-3">
            <Field label="New milestone" error={s.fields.title} required>
              {(p) => <input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
            </Field>
            <Field label="Target date" error={s.fields.due_date}>
              {(p) => <input {...p} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />}
            </Field>
            <button className="btn btn-primary" disabled={s.busy}>Add milestone</button>
          </div>
        </form>
      ) : (
        <p className="muted">The project owner sets milestones and checks them off.</p>
      )}
      {loading && !data && <Loading />}
      {data && !data.milestones.length && <Empty title="No milestones yet." />}
      <ol className="timeline">
        {data?.milestones.map((m) => (
          <li key={m.id} className={m.done ? 'done' : ''}>
            <span className="dot" aria-hidden="true" />
            <div className="timeline-body">
              {canManage ? (
                <label className="check">
                  <input type="checkbox" checked={m.done} onChange={async () => { await run(() => api.post(`/projects/${projectId}/milestones/${m.id}/toggle`)); refresh(); }} />
                  <strong>{m.title}</strong>
                </label>
              ) : (
                <strong>{m.done ? '✓ ' : ''}{m.title}</strong>
              )}
              <div className="small muted">
                {m.due_date && `Target ${formatDate(m.due_date)}`}{m.done && ` · completed ${formatDate(m.done_at)}`}
              </div>
            </div>
            {canManage && (
              <button className="icon-btn danger-text" aria-label={`Delete ${m.title}`} onClick={async () => {
                if (window.confirm('Delete this milestone?')) { await run(() => api.del(`/projects/${projectId}/milestones/${m.id}`)); refresh(); }
              }}>×</button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
