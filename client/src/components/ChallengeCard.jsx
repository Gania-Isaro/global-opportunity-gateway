import { Link } from 'react-router-dom';
import { SkillTags, StatusBadge, VerifiedBadge, daysLeft, formatDate } from './ui.jsx';

export default function ChallengeCard({ challenge: c }) {
  return (
    <article className="card challenge-card">
      <div className="card-top">
        <span className="sector">{c.sector}</span>
        {c.status !== 'published' && <StatusBadge status={c.status} />}
      </div>
      <h3>
        <Link to={`/challenges/${c.id}`} className="stretched">{c.title}</Link>
      </h3>
      <p className="owner-line">
        {c.org_name || c.owner_name} {c.verified && <VerifiedBadge />}
      </p>
      <p className="excerpt">{c.description.length > 150 ? `${c.description.slice(0, 150)}...` : c.description}</p>
      <SkillTags skills={c.skills.slice(0, 4)} />
      <div className="card-meta">
        <span title={`Deadline ${formatDate(c.deadline)}`}>
          {c.status === 'published' ? daysLeft(c.deadline) : `Deadline ${formatDate(c.deadline)}`}
        </span>
        <span>Team of {c.team_size}</span>
      </div>
    </article>
  );
}
