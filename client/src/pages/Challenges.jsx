import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import ChallengeCard from '../components/ChallengeCard.jsx';
import { Empty, LoadError, Loading, PageHeader, useLoad } from '../components/ui.jsx';

// FR 5.1 List, FR 5.2 Search by keyword, FR 5.3 Filter by sector, skill and deadline
export default function Challenges() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const meta = useLoad(() => api.get('/challenges/meta'), []);
  const query = params.toString();
  const list = useLoad(() => api.get(`/challenges?${query}`), [query]);

  useEffect(() => {
    setQ(params.get('q') || '');
  }, [params]);

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const onSearch = (e) => {
    e.preventDefault();
    update('q', q.trim());
  };

  const hasFilters = ['q', 'sector', 'skill', 'deadline_before', 'status', 'verified'].some((k) => params.get(k));

  return (
    <div className="container">
      <PageHeader
        title="Challenges"
        subtitle="Real problems in Kigali that need people with global experience and the right skills."
        actions={user && user.role !== 'admin' && <Link to="/challenges/new" className="btn btn-primary">Post a challenge</Link>}
      />

      <form className="filters card" onSubmit={onSearch} role="search">
        <div className="search-row">
          <label htmlFor="search" className="sr-only">Search challenges</label>
          <input id="search" type="search" placeholder="Search by keyword, for example waste, health, coding" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary">Search</button>
        </div>
        <div className="filter-row">
          <div className="filter">
            <label htmlFor="f-sector">Sector</label>
            <select id="f-sector" value={params.get('sector') || ''} onChange={(e) => update('sector', e.target.value)}>
              <option value="">All sectors</option>
              {meta.data?.sectors.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="filter">
            <label htmlFor="f-skill">Skill needed</label>
            <select id="f-skill" value={params.get('skill') || ''} onChange={(e) => update('skill', e.target.value)}>
              <option value="">Any skill</option>
              {meta.data?.skills.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="filter">
            <label htmlFor="f-deadline">Deadline before</label>
            <input id="f-deadline" type="date" value={params.get('deadline_before') || ''} onChange={(e) => update('deadline_before', e.target.value)} />
          </div>
          <div className="filter">
            <label htmlFor="f-status">Status</label>
            <select id="f-status" value={params.get('status') || ''} onChange={(e) => update('status', e.target.value)}>
              <option value="">Open for applications</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </div>
          <label className="check filter-check">
            <input type="checkbox" checked={params.get('verified') === 'true'} onChange={(e) => update('verified', e.target.checked ? 'true' : '')} />
            Verified organisations only
          </label>
        </div>
        {hasFilters && (
          <button type="button" className="link-btn" onClick={() => setParams({}, { replace: true })}>Clear all filters</button>
        )}
      </form>

      {list.loading && <Loading />}
      {list.error && <LoadError error={list.error} reload={list.reload} />}
      {list.data && (
        <>
          <p className="result-count" aria-live="polite">
            {list.data.challenges.length} challenge{list.data.challenges.length === 1 ? '' : 's'} found
          </p>
          {list.data.challenges.length ? (
            <div className="card-grid">
              {list.data.challenges.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
            </div>
          ) : (
            <Empty title="No challenges match your search.">Try a different keyword or clear the filters.</Empty>
          )}
        </>
      )}
    </div>
  );
}
