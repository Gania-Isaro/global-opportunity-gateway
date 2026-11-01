import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Empty, LoadError, Loading, PageHeader, StatusBadge, VerifiedBadge, formatDate, useLoad } from '../components/ui.jsx';

export default function MyChallenges() {
  const { data, error, loading, reload } = useLoad(() => api.get('/challenges/mine'), []);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const act = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setErr(null);
    try {
      const r = await fn();
      setMsg(r.message);
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="container">
      <PageHeader
        title="My challenges"
        subtitle="Create, publish and close your challenges, then review who applied."
        actions={<Link to="/challenges/new" className="btn btn-primary">Post a challenge</Link>}
      />
      <Alert type="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert onClose={() => setErr(null)}>{err}</Alert>
      {loading && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && !data.challenges.length && (
        <Empty title="You have not posted any challenges yet.">
          <Link to="/challenges/new" className="btn btn-primary">Post your first challenge</Link>
        </Empty>
      )}
      {data && data.challenges.length > 0 && (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Challenge</th>
                <th scope="col">Status</th>
                <th scope="col">Deadline</th>
                <th scope="col">Applications</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.challenges.map((c) => (
                <tr key={c.id}>
                  <td data-label="Challenge">
                    <Link to={`/challenges/${c.id}`}><strong>{c.title}</strong></Link>
                    <div className="small muted">{c.sector} {c.verified && <VerifiedBadge />}</div>
                  </td>
                  <td data-label="Status"><StatusBadge status={c.status} /></td>
                  <td data-label="Deadline">{formatDate(c.deadline)}</td>
                  <td data-label="Applications">
                    {c.application_count}
                    {c.pending_count > 0 && <span className="pill-new">{c.pending_count} to review</span>}
                  </td>
                  <td className="row-actions">
                    {c.status !== 'draft' && c.status !== 'removed' && (
                      <Link to={`/my-challenges/${c.id}/applications`} className="btn btn-primary btn-sm">Review</Link>
                    )}
                    {c.project_id && <Link to={`/projects/${c.project_id}`} className="btn btn-outline btn-sm">Workspace</Link>}
                    {['draft', 'published'].includes(c.status) && (
                      <Link to={`/challenges/${c.id}/edit`} className="btn btn-ghost btn-sm">Edit</Link>
                    )}
                    {c.status === 'draft' && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => act(() => api.post(`/challenges/${c.id}/publish`))}>Publish</button>
                        <button className="btn btn-ghost btn-sm danger-text" onClick={() => act(() => api.del(`/challenges/${c.id}`), 'Delete this draft?')}>Delete</button>
                      </>
                    )}
                    {c.status === 'published' && (
                      <button className="btn btn-ghost btn-sm danger-text" onClick={() => act(() => api.post(`/challenges/${c.id}/close`), 'Close this challenge? It will stop accepting applications.')}>
                        Close
                      </button>
                    )}
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
