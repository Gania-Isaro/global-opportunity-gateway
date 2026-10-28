import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLoad } from '../components/ui.jsx';
import ChallengeCard from '../components/ChallengeCard.jsx';

const STEPS = [
  { title: 'Challenge', text: 'An organisation or individual publishes a real problem in Kigali.' },
  { title: 'Application', text: 'People with global experience and useful skills apply with a short motivation.' },
  { title: 'Selection', text: 'The challenge owner reviews applicants and invites the best fit.' },
  { title: 'Team', text: 'Invited participants confirm, and the owner forms the team.' },
  { title: 'Workspace', text: 'The team works in a private space with tasks, research, files and milestones.' },
];

export default function Home() {
  const { user } = useAuth();
  const { data } = useLoad(() => api.get('/challenges'), []);
  const featured = data?.challenges?.slice(0, 3) || [];

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">Kigali, Rwanda</p>
            <h1>Turn global experience into local impact.</h1>
            <p className="lead">
              You studied abroad, attended a conference, or saw a smart solution somewhere else. GOG gives you
              a clear path to use that knowledge on real challenges in Kigali, with the right team and partners.
            </p>
            <div className="hero-actions">
              <Link to="/challenges" className="btn btn-accent btn-lg">Browse challenges</Link>
              {user ? (
                <Link to="/dashboard" className="btn btn-outline-light btn-lg">Go to dashboard</Link>
              ) : (
                <Link to="/register" className="btn btn-outline-light btn-lg">Create a free account</Link>
              )}
            </div>
          </div>
          <div className="hero-panel" aria-hidden="true">
            <div className="hero-stat"><strong>15.7%</strong><span>youth unemployment in Rwanda (NISR, May 2026)</span></div>
            <div className="hero-stat"><strong>59.7%</strong><span>labour underutilisation: skills waiting to be used</span></div>
            <div className="hero-stat"><strong>1 path</strong><span>from challenge to team to working project</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">How GOG works</h2>
          <p className="section-sub">One structured journey from a local problem to a working team.</p>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-head">
            <div>
              <h2 className="section-title">Open challenges</h2>
              <p className="section-sub">Real problems from organisations and individuals in Kigali.</p>
            </div>
            <Link to="/challenges" className="btn btn-outline">See all challenges</Link>
          </div>
          <div className="card-grid">
            {featured.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container two-col">
          <div className="audience">
            <h2>For participants</h2>
            <p>Show your skills and global experience, apply to challenges that matter to you, and join a team with a private workspace to get things done.</p>
            {!user && <Link to="/register?role=participant" className="btn btn-primary">Join as a participant</Link>}
          </div>
          <div className="audience">
            <h2>For challenge owners</h2>
            <p>Post a real challenge, review applicants, invite the right people and follow the project to completion. Organisations can get a Verified badge.</p>
            {!user && <Link to="/register?role=owner" className="btn btn-primary">Post a challenge</Link>}
          </div>
        </div>
      </section>
    </>
  );
}
