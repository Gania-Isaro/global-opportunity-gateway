import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { PageHeader } from '../components/ui.jsx';

const FAQ = [
  {
    q: 'Who can use GOG?',
    a: 'Anyone in Kigali with skills, knowledge or global experience they want to use on real local problems. Organisations and individuals can post challenges.',
  },
  {
    q: 'Do I need to be verified to post a challenge?',
    a: 'No. You need a confirmed email address and a complete profile. Organisations can also ask an administrator to verify them and get a Verified badge, which helps participants trust their challenges.',
  },
  {
    q: 'Who can see my profile?',
    a: 'Other users see only your name and skills. A challenge owner sees your full profile only after you apply to their challenge. Your teammates can also see it.',
  },
  {
    q: 'Can I apply to the same challenge twice?',
    a: 'No. You can apply to as many different challenges as you like, but only once to each. You cannot apply to a challenge you own.',
  },
  {
    q: 'What do the application statuses mean?',
    a: 'Submitted: the owner has not opened it yet. Under review: the owner is looking at it. Accepted or Rejected: the owner has decided. Withdrawn: you took it back before a decision.',
  },
  {
    q: 'How is a team formed?',
    a: 'The owner accepts applicants and sends them an invitation. Once at least one person confirms, the owner forms the team and a private project workspace is created.',
  },
  {
    q: 'Who can see a project workspace?',
    a: 'Only the team members, the project owner and GOG administrators. Every request is checked on the server.',
  },
  {
    q: 'What happens when the deadline passes?',
    a: 'The challenge closes automatically and stops accepting applications. The owner can also close it earlier.',
  },
  {
    q: 'Can a challenge ask participants to pay?',
    a: 'No. Asking participants for payment breaks the platform rules. Use the "Report this challenge" link and an administrator will remove it.',
  },
  {
    q: 'I forgot my password or my account is locked.',
    a: 'Use "Forgot password" on the log in page. After 5 failed log in attempts an account is locked for 15 minutes to keep it safe.',
  },
];

export default function Help() {
  const { user } = useAuth();
  return (
    <div className="container narrow">
      <PageHeader title="Help and FAQ" subtitle="A short guide to using GOG." />

      <section className="card form-card guide">
        <h2>Quick guide for participants</h2>
        <ol>
          <li><Link to="/register">Create an account</Link> and confirm your email.</li>
          <li>Fill in your <Link to="/profile">profile</Link>: skills, education and global experiences.</li>
          <li><Link to="/challenges">Browse challenges</Link>, use search and filters, and open one that fits you.</li>
          <li>Apply with a short motivation and follow its status in <Link to="/applications">My applications</Link>.</li>
          <li>When invited, confirm in <Link to="/invitations">Invitations</Link>. Your team workspace appears in <Link to="/projects">Projects</Link>.</li>
          <li>In the workspace, update your tasks, add research notes, share files and join discussions.</li>
          <li>Check <Link to="/notifications">Notifications</Link> for decisions, invitations and team updates.</li>
          <li>Changed your mind before a decision? Withdraw the application from My applications.</li>
        </ol>

        <h2>Quick guide for challenge owners</h2>
        <ol>
          <li>Create an account as a challenge owner and complete your profile.</li>
          <li>If you represent an organisation, <Link to="/organisation">register it</Link> for the Verified badge (optional).</li>
          <li><Link to="/challenges/new">Post a challenge</Link>. Save it as a draft or publish it.</li>
          <li>Review applications, accept the best fit and send invitations.</li>
          <li>Form the team once at least one person confirms. A private workspace is created for it.</li>
          <li>Assign team roles, then add tasks and milestones. Progress is calculated automatically.</li>
          <li>Close a challenge early if you have enough applicants. It also closes by itself after the deadline.</li>
          <li>Mark the project complete when the work is finished.</li>
        </ol>

        <p><a className="btn btn-outline" href="/GOG-user-guide.pdf" download>Download the user guide (PDF)</a></p>
      </section>

      {user?.role === 'admin' && (
        <section className="card form-card guide" aria-labelledby="admin-guide">
          <h2 id="admin-guide">Administrator guide</h2>
          <ol>
            <li><strong>Verify organisations.</strong> In <Link to="/admin/organisations">Verification</Link>, read the details and documents, then verify or reject. A rejection needs a clear reason, because the organisation sees it and can resubmit.</li>
            <li><strong>Review reports.</strong> In <Link to="/admin/reports">Reports</Link>, open each item. Remove a challenge that breaks the rules, or dismiss the report if it does not.</li>
            <li><strong>Manage accounts.</strong> In <Link to="/admin/users">Users</Link>, suspend an account that breaks the rules. A suspended person loses access at once. Use the same button to unlock them.</li>
            <li><strong>Check the audit log.</strong> <Link to="/admin/audit">Audit log</Link> records every administrator decision and cannot be edited.</li>
            <li><strong>Follow the pilot.</strong> <Link to="/admin/pilot-report">Pilot report</Link> compares progress with the six month targets. You can print it or download a CSV.</li>
          </ol>
          <p>On the public demo, this login can only see and change demo data, and it cannot suspend accounts.</p>
        </section>
      )}

      <h2 className="section-title small-title">Frequently asked questions</h2>
      <div className="faq">
        {FAQ.map((f) => (
          <details key={f.q} className="card">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>

      <section id="privacy" className="card form-card">
        <h2>Privacy</h2>
        <p>
          GOG collects only the personal data needed to run the platform: your name, email, and the profile details
          you choose to share. Passwords are stored as salted bcrypt hashes and never in plain text. Data is handled in
          line with Rwanda's Law No. 058/2021 on the protection of personal data and privacy. Sessions end after 30 minutes
          without activity.
        </p>
      </section>
    </div>
  );
}
