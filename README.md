# GOG (Global Opportunity Gateway)

GOG is a web platform I built for people in Kigali who have global experience, knowledge and connections, and for anyone else who can contribute. A challenge owner (an organisation or an individual) publishes a real local challenge, participants apply, the owner selects people and forms a team, and the team works together in a private project workspace.

**Core journey:** Challenge → Application → Selection → Team → Private Project Workspace

| Link | |
|---|---|
| Live app | _add your Render URL here_ |
| Demo video | _add your video link here_ |
| SRS and system design | _add your SRS document link here_ |

---

## The problem

People in Kigali gain more and more knowledge, ideas and connections through study abroad, exchanges, conferences, research and professional networks. Once those experiences end, there is no structured path to turn that learning into local action. In May 2026 youth unemployment in Rwanda was 15.7% and labour underutilisation was 59.7% (NISR, 2026), which shows that many skills are still unused.

Someone may come back with an idea and ask "Could this work here?", but not know how to study the local problem, find people with complementary skills, reach mentors or organisations, form a team and test the idea. Organisations have the same problem from the other side: they have real challenges but no structured way to find the right people. Platforms like LinkedIn and AIESEC each cover part of the journey, but none offers one path from global learning to collaboration, project development and local impact.

## My solution

GOG gives that journey a structure:

1. **Challenge owners** (organisations or individuals) publish real challenges with the skills needed, the expected outcome, a deadline and a team size. Organisations can be verified by an administrator and receive a **Verified** badge.
2. **Participants** build a profile with their skills and global experiences, discover challenges with search and filters, and apply with a short motivation.
3. **Owners** review applicants, accept or reject them, and send invitations.
4. **Participants** confirm or decline. The owner then forms the team, and a **private project workspace** is created.
5. **The team** works in the workspace with tasks, research notes, files, discussions and milestones, and progress is calculated automatically.
6. **Administrators** verify organisations, moderate reported content, suspend accounts, and see an audit log and a pilot report.

## Features (mapped to my SRS)

| SRS | Feature |
|---|---|
| FR 1 | Register, confirm email, log in and out, reset password, role based access on every request |
| FR 2 | Profiles with bio, skills, education, location, interests and global experiences. Full profile visible to an owner only after the participant applies |
| FR 3 | Organisation registration with supporting documents, pending status, admin approve or reject with a reason, Verified badge, decision notification |
| FR 4 | Create, save as draft, edit, publish and close challenges. Auto close when the deadline passes. Only the owner can change a challenge |
| FR 5 | Public challenge list, keyword search, filters by sector, skill, deadline, status and verified organisations, challenge detail page |
| FR 6 | Apply with a motivation, no duplicates, no applying to your own challenge, status tracking (Submitted, Under review, Accepted, Rejected, Withdrawn), withdraw |
| FR 7 | Owner reviews applications, accepts or rejects, applicants are notified, invitations are sent and confirmed or declined |
| FR 8 | Owner forms the team from confirmed participants, a project is created and linked to one challenge, owner assigns roles |
| FR 9 | Private workspace: overview, tasks (create, assign, update, complete), research notes and links, file sharing up to 10 MB, discussions with replies, milestones, automatic progress |
| FR 10 | In app notifications, email for high priority events, mark as read |
| FR 11 | Participant, challenge owner and administrator dashboards |
| FR 12 | Suspend and unlock accounts, remove challenges, report content, audit log, pilot report against the SMART targets |

Security and quality requirements I implemented:

- Passwords stored only as salted bcrypt hashes (NFR 2)
- Role checks on the server for every request, not only in the interface (NFR 3, NFR 4)
- Sessions end after 30 minutes without activity (NFR 5)
- Account locked for 15 minutes after 5 failed logins (Section 5.3)
- CSRF protection, parameterised SQL queries (no SQL injection), React output escaping (no XSS), approved file types only (Section 5.3)
- HTTPS redirect and security headers in production
- Append only audit log of all administrator decisions (NFR 11, BR 10)
- Responsive from 360 px phones to 1920 px desktops, keyboard navigation, labelled form fields and plain English validation messages next to each field (Section 3.1, NFR 10)

## Tech stack

| Layer | Technology |
|---|---|
| Front end | React 19, React Router, Vite |
| Back end | Node.js, Express 5 (REST API with JSON) |
| Database | PostgreSQL |
| Email | Nodemailer over SMTP (optional, emails are printed to the server log when SMTP is not set) |
| File storage | Stored in PostgreSQL (10 MB limit per file) |
| Hosting | Render (web service) and Neon (PostgreSQL), both on free plans |

This follows the three tier design in my component diagram: the browser (client tier) talks to the REST API (application tier), which uses the PostgreSQL database (data tier) and the email service.

---

## Demo accounts

When the app starts with an empty database it adds demo data. Every demo account uses the password **`Demo1234`**.

| Role | Email | What to try |
|---|---|---|
| Administrator | `admin@gog.rw` | Verify Afya Hub, review the open report, see the audit log and pilot report |
| Challenge owner (verified organisation) | `owner@greenkigali.rw` | Owns the Kimironko smart waste project with a full workspace |
| Challenge owner (organisation pending verification) | `owner@afyahub.rw` | Has two new applications waiting for review |
| Challenge owner (individual) | `diane@gog.rw` | Has a draft challenge and one application |
| Participant | `participant@gog.rw` | Team member in the smart waste project |
| Participant | `grace@gog.rw` | Has applications in different states |
| Participant | `patrick@gog.rw`, `sandrine@gog.rw` | Extra participants |

You can also register a new account. While `DEMO_MODE=true`, the confirmation link is shown on screen right after you sign up, so you do not need a real mailbox.

---

