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

