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

## Run it on your computer

### 1. Install the requirements

- **Node.js 20 or newer** (I used Node 24): https://nodejs.org
- **Git**: https://git-scm.com
- **PostgreSQL**, using one of these options:
  - **Option A (easiest): Docker Desktop**: https://www.docker.com/products/docker-desktop
  - **Option B: PostgreSQL installed directly**: https://www.postgresql.org/download
  - **Option C: a free hosted database on Neon**: https://neon.tech (no install needed)

Check that Node and npm are installed:

```bash
node --version
npm --version
```

### 2. Get the code

```bash
git clone https://github.com/Gania-Isaro/global-opportunity-gateway.git
cd global-opportunity-gateway
```

### 3. Install the packages

This installs the server packages and then the front end packages:

```bash
npm install
npm install --prefix client
```

### 4. Create the database

**Option A, Docker:** make sure Docker Desktop is running, then start the database from the project folder:

```bash
docker compose up -d
```

This starts PostgreSQL on port 5432 with user `gog`, password `gog` and database `gog`, which matches the default settings.

**Option B, local PostgreSQL:** open `psql` as the `postgres` user and run:

```sql
CREATE USER gog WITH PASSWORD 'gog';
CREATE DATABASE gog OWNER gog;
```

**Option C, Neon:** create a free project at https://neon.tech, copy the connection string (it looks like `postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require`) and use it as `DATABASE_URL` in the next step with `DATABASE_SSL=true`.

### 5. Create the settings file

Copy the example settings file:

```bash
cp .env.example .env
```

On Windows Command Prompt use `copy .env.example .env` instead.

The defaults work with Option A and Option B. Open `.env` and change `DATABASE_URL` only if your database is different. All the settings are explained inside the file.

### 6. Start the app

```bash
npm run dev
```

This starts two things at once:

- the API server on http://localhost:4000
- the React app on http://localhost:5173

Open **http://localhost:5173** in your browser. On the first start the server creates all the tables and adds the demo data, and you will see `Demo data added` in the terminal.

### 7. (Optional) Run it the way it runs in production

This builds the React app and serves everything from one server on port 4000:

```bash
npm run build
npm start
```

Then open http://localhost:4000. If you use this mode, set `APP_URL=http://localhost:4000` in `.env` so the links in emails point to the right place.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the API and the React app for development |
| `npm run build` | Build the React app for production |
| `npm start` | Start the production server |
| `npm run seed` | Add the demo data if the database is empty |
| `npm run seed -- --reset` | Delete all data and add the demo data again |
| `npm test` | Run the end to end tests (the server must be running) |

### Tests

The file `tests/journey.test.js` walks through the whole journey through the API and checks the business rules: registration and email confirmation, profile completeness, challenge creation and publishing, search, applying, duplicate and self application blocking, profile visibility, withdrawal, review and invitations, team formation, workspace privacy, tasks, milestones, progress, file type checks, notifications, dashboards, admin actions, audit log and account locking.

Start the server first (step 6), then in a second terminal run:

```bash
npm test
```

### Troubleshooting

- **`Failed to start the server: connect ECONNREFUSED`**: the database is not running. Start Docker Desktop and run `docker compose up -d`, or check `DATABASE_URL` in `.env`.
- **Port 5432 is already in use**: change the left side of the port in `docker-compose.yml` (for example `"55432:5432"`) and use that port in `DATABASE_URL`.
- **I want a clean start**: run `npm run seed -- --reset`.

---

## Deployment (Render and Neon)

This is how I deployed the live version for free.

### 1. Create the database on Neon

1. Sign up at https://neon.tech and create a project.
2. Copy the connection string from the dashboard. It ends with `?sslmode=require`.

### 2. Create the web service on Render

1. Sign up at https://render.com with GitHub.
2. Click **New** → **Blueprint** and choose this repository. Render reads `render.yaml`.
3. When asked, fill in:
   - `DATABASE_URL`: the Neon connection string
   - `APP_URL`: the address Render gives the service, for example `https://global-opportunity-gateway.onrender.com`
4. Click **Apply**. Render runs `npm install && npm run build` and then `npm start`.
5. When the deploy finishes, open the URL. The tables and the demo data are created on the first start.

If you prefer to create the service by hand instead of with the blueprint, use **New** → **Web Service**, runtime Node, build command `npm install && npm run build`, start command `npm start`, and add these environment variables: `NODE_ENV=production`, `DATABASE_URL`, `DATABASE_SSL=true`, `SESSION_SECRET` (any long random text), `APP_URL`, `DEMO_MODE=true`, `SEED_DEMO_DATA=true`.

Note: the free Render plan sleeps after 15 minutes without visits, so the first page load after a break can take up to a minute.

### Real emails (optional)

To send real emails, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` from any SMTP provider (for example Brevo or a Gmail app password). Without them, emails are printed to the server log and the links are shown on screen in demo mode.

---

## Project structure

```
global-opportunity-gateway/
├── server/                 Express REST API
│   ├── index.js            App setup, sessions, security headers, routes
│   ├── config.js           Settings read from .env
│   ├── db.js               PostgreSQL connection and helpers
│   ├── schema.sql          Database tables
│   ├── seed.js             Demo data
│   ├── middleware.js       Login, role checks, CSRF guard, error handling
│   ├── validate.js         Input validation with plain English messages
│   ├── uploads.js          File upload limits and allowed types
│   ├── mailer.js           Email sending
│   ├── notify.js           Notifications and audit log
│   └── routes/             One file per feature area (FR 1 to FR 12)
├── client/                 React front end (Vite)
│   └── src/
│       ├── pages/          One file per screen
│       ├── components/     Shared layout and UI pieces
│       ├── api.js          REST API client
│       └── styles.css      One visual style for all screens
├── tests/                  End to end journey tests
├── docker-compose.yml      Local PostgreSQL
├── render.yaml             Render deployment blueprint
└── .env.example            Settings template
```

## Out of scope for this MVP

As stated in my SRS, these are planned for future increments: global experience journals, mentors, international connections, investor features, contribution tracking, benefit agreements, impact measurement, payments, native mobile apps, video calls, single sign on and multiple languages.

## Author

Gania Isaro Kayumba, Bachelor of Software Engineering, African Leadership University
