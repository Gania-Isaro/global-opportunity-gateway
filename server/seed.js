// Demo data for the GOG prototype.
// Run with: npm run seed           (adds data only if the database is empty)
//           npm run seed -- --reset (wipes everything and seeds again)
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool, one, initSchema, tx } from './db.js';

export const DEMO_PASSWORD = 'Demo1234';

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const USERS = [
  { key: 'admin', email: 'admin@gog.rw', role: 'admin', name: 'GOG Administrator', bio: 'Platform administrator.', skills: ['Moderation'], location: 'Kigali' },
  {
    key: 'green', email: 'owner@greenkigali.rw', role: 'owner', name: 'Aline Uwase',
    bio: 'Programme lead at Green Kigali Initiative, working on waste and clean energy in Kigali neighbourhoods.',
    skills: ['Project management', 'Sustainability'], location: 'Kigali, Gasabo',
    education: 'MSc Environmental Management, University of Rwanda',
    experiences: 'Visited circular economy projects in Ghent, Belgium during a 2025 exchange.',
  },
  {
    key: 'health', email: 'owner@afyahub.rw', role: 'owner', name: 'Eric Mugisha',
    bio: 'Founder of Afya Hub, a community health organisation in Nyarugenge.',
    skills: ['Public health', 'Partnerships'], location: 'Kigali, Nyarugenge',
    education: 'MPH, University of Global Health Equity',
  },
  {
    key: 'indiv', email: 'diane@gog.rw', role: 'owner', name: 'Diane Ingabire',
    bio: 'Teacher who wants to bring coding clubs to public schools after visiting schools in Kenya.',
    skills: ['Teaching', 'Curriculum design'], location: 'Kigali, Kicukiro',
    experiences: 'Attended a STEM education conference in Nairobi in 2026.',
  },
  {
    key: 'p1', email: 'participant@gog.rw', role: 'participant', name: 'Jean Paul Habimana',
    bio: 'Software engineering student who studied abroad in Singapore and saw smart waste systems in action.',
    skills: ['JavaScript', 'React', 'Data analysis'], location: 'Kigali, Kicukiro',
    education: 'BSc Software Engineering, African Leadership University',
    interests: 'Smart cities, climate tech, education technology',
    experiences: 'Semester exchange at NUS Singapore (2025). Volunteered on a recycling app project there.',
  },
  {
    key: 'p2', email: 'grace@gog.rw', role: 'participant', name: 'Grace Mukamana',
    bio: 'Designer focused on simple interfaces for low bandwidth users.',
    skills: ['UI/UX design', 'Figma', 'User research'], location: 'Kigali, Gasabo',
    education: 'BA Design, University of Rwanda',
    interests: 'Inclusive design, health tech',
    experiences: 'AIESEC volunteer in Ghana working on maternal health awareness (2024).',
  },
  {
    key: 'p3', email: 'patrick@gog.rw', role: 'participant', name: 'Patrick Niyonzima',
    bio: 'Agronomist interested in sharing what I learned about cooperatives in the Netherlands.',
    skills: ['Agronomy', 'Data analysis', 'Community mobilisation'], location: 'Musanze',
    education: 'MSc Plant Sciences, Wageningen University',
    experiences: 'Two years of study in Wageningen. Visited farmer cooperatives and greenhouse projects.',
  },
  {
    key: 'p4', email: 'sandrine@gog.rw', role: 'participant', name: 'Sandrine Umutoni',
    bio: 'Business student who loves turning ideas into simple business models.',
    skills: ['Business modelling', 'Finance', 'Research'], location: 'Kigali, Gasabo',
    education: 'BBA, University of Kigali',
    experiences: 'Attended the YouthConnekt Africa summit and a startup bootcamp in Cape Town.',
  },
];

export async function seedDemoData({ onlyIfEmpty = true, reset = false } = {}) {
  if (reset) {
    await pool.query(`TRUNCATE users, organisations, challenges, applications, invitations, projects,
      project_members, tasks, research_notes, project_files, discussion_posts, milestones,
      notifications, reports, audit_log, email_outbox, auth_tokens RESTART IDENTITY CASCADE`);
  } else if (onlyIfEmpty) {
    const row = await one('SELECT count(*)::int AS n FROM users');
    if (row.n > 0) return false;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await tx(async (c) => {
    const q = (text, params) => c.query(text, params).then((r) => r.rows[0]);
    const id = {};

    for (const u of USERS) {
      const row = await q(
        'INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1,$2,$3,TRUE) RETURNING id',
        [u.email, hash, u.role]
      );
      id[u.key] = row.id;
      await q(
        `INSERT INTO profiles (user_id, full_name, bio, skills, education, location, interests, experiences)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [row.id, u.name, u.bio || '', u.skills || [], u.education || '', u.location || '', u.interests || '', u.experiences || '']
      );
    }

    // Organisations: one verified, one waiting for the administrator
    const green = await q(
      `INSERT INTO organisations (rep_user_id, name, sector, description, contact_person, status, reviewed_at)
       VALUES ($1, 'Green Kigali Initiative', 'Environment',
         'A Kigali based non-profit working with neighbourhoods on waste sorting, recycling and clean energy.',
         'Aline Uwase', 'verified', now()) RETURNING id`,
      [id.green]
    );
    const afya = await q(
      `INSERT INTO organisations (rep_user_id, name, sector, description, contact_person)
       VALUES ($1, 'Afya Hub', 'Health',
         'Community health organisation running awareness campaigns and health clinics in Nyarugenge.',
         'Eric Mugisha') RETURNING id`,
      [id.health]
    );
    await q(
      `INSERT INTO organisation_documents (org_id, filename, mime, size, data)
       VALUES ($1, 'afya-hub-registration.txt', 'text/plain', 64, $2)`,
      [afya.id, Buffer.from('Afya Hub registration certificate (demo document for verification).')]
    );
    await q(
      `INSERT INTO audit_log (admin_id, action, target_type, target_id, details)
       VALUES ($1, 'verify_organisation', 'organisation', $2, 'Green Kigali Initiative')`,
      [id.admin, green.id]
    );

    const ch = async (owner, org, title, sector, skills, deadline, size, status, description, outcome) =>
      q(
        `INSERT INTO challenges (owner_id, org_id, title, description, sector, skills, outcome, deadline, team_size, status, published_at, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                 CASE WHEN $10 <> 'draft' THEN now() - interval '10 days' END,
                 CASE WHEN $10 = 'closed' THEN now() - interval '1 day' END) RETURNING id`,
        [owner, org, title, description, sector, skills, outcome, deadline, size, status]
      );

    const waste = await ch(id.green, green.id, 'Smart waste collection for Kimironko market', 'Environment',
      ['JavaScript', 'Data analysis', 'UI/UX design'], day(21), 4, 'published',
      'Kimironko market produces tonnes of mixed waste every week and collection trucks often arrive when bins are already overflowing. In Singapore and Ghent, simple fill level reporting helped plan collection routes. We want a team to study the market, test a low cost reporting method with vendors and propose a collection schedule.',
      'A tested reporting prototype used by at least 20 vendors and a proposed collection schedule for the market committee.');

    const clinic = await ch(id.health, afya.id, 'SMS reminders for antenatal clinic visits', 'Health',
      ['UI/UX design', 'User research', 'Public health'], day(14), 3, 'published',
      'Many expectant mothers in Nyarugenge miss follow up antenatal visits. Programmes in Ghana use simple SMS reminders with good results. We need a team to understand why visits are missed and design a reminder service that works on basic phones.',
      'Research findings from at least 30 mothers and a clickable prototype of the reminder flow.');

    const coding = await ch(id.indiv, null, 'After school coding clubs for public schools', 'Education',
      ['Teaching', 'JavaScript', 'Curriculum design'], day(30), 5, 'published',
      'Public schools in Kicukiro have computer labs that sit unused after classes. Inspired by coding clubs I saw in Nairobi, I want to start weekly after school clubs run by volunteers.',
      'A six week starter curriculum, a volunteer schedule and a pilot club running in one school.');

    await ch(id.green, green.id, 'Solar drying for small scale farmers', 'Agriculture',
      ['Agronomy', 'Engineering', 'Community mobilisation'], day(40), 4, 'published',
      'Farmers around Kigali lose part of their harvest because they cannot dry produce fast enough in the rainy season. Low cost solar dryers are used widely in the Netherlands and East Africa. We want to test one design with a cooperative.',
      'One working solar dryer tested with a cooperative and a short cost and benefit report.');

    await ch(id.health, afya.id, 'Mapping clean water points in Nyamirambo', 'Health',
      ['Data analysis', 'Research'], day(-3), 3, 'closed',
      'We need an up to date map of public water points and their condition.',
      'A shared map and a list of water points that need repair.');

    await ch(id.indiv, null, 'Reading corners in community libraries', 'Education',
      ['Teaching', 'Community mobilisation'], day(45), 3, 'draft',
      'Draft idea: set up reading corners with donated books in three community libraries.',
      'Three reading corners and a volunteer reading schedule.');

    const app = (challenge, participant, status, motivation) =>
      q('INSERT INTO applications (challenge_id, participant_id, motivation, status, decided_at) VALUES ($1,$2,$3,$4, CASE WHEN $4 IN (\'accepted\',\'rejected\') THEN now() END) RETURNING id',
        [challenge, participant, motivation, status]);

    // Smart waste: full journey done, team formed and working
    const a1 = await app(waste.id, id.p1, 'accepted', 'During my exchange in Singapore I worked on a recycling app and saw how fill level data changed collection routes. I would love to test a simple version with vendors in Kimironko.');
    const a2 = await app(waste.id, id.p2, 'accepted', 'I design simple interfaces for low bandwidth users. Vendors will need a very easy way to report, and I can run the user research with them.');
    const a3 = await app(waste.id, id.p4, 'rejected', 'I can help with the business case for the collection schedule.');
    await q("INSERT INTO invitations (application_id, status, responded_at) VALUES ($1, 'confirmed', now())", [a1.id]);
    await q("INSERT INTO invitations (application_id, status, responded_at) VALUES ($1, 'confirmed', now())", [a2.id]);

    const project = await q(
      "INSERT INTO projects (challenge_id, owner_id, name, created_at) VALUES ($1, $2, 'Kimironko Smart Waste Team', now() - interval '6 days') RETURNING id",
      [waste.id, id.green]
    );
    await q("INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'Project owner'),($1,$3,'Technical lead'),($1,$4,'Research and design')",
      [project.id, id.green, id.p1, id.p2]);

    const task = (title, assignee, status, due) =>
      q(`INSERT INTO tasks (project_id, title, assignee_id, status, due_date, created_by, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $4 = 'done' THEN now() END)`,
        [project.id, title, assignee, status, due, id.green]);
    await task('Visit the market and map bin locations', id.p2, 'done', day(-2));
    await task('Interview 10 vendors about waste problems', id.p2, 'done', day(-1));
    await task('Build a simple reporting form prototype', id.p1, 'in_progress', day(5));
    await task('Draft a collection schedule proposal', id.green, 'todo', day(12));

    await q("INSERT INTO milestones (project_id, title, due_date, done, done_at) VALUES ($1,'Research complete',$2,TRUE,now()),($1,'Prototype tested with vendors',$3,FALSE,NULL),($1,'Proposal presented to market committee',$4,FALSE,NULL)",
      [project.id, day(-1), day(10), day(20)]);

    await q("INSERT INTO research_notes (project_id, author_id, title, body, link) VALUES ($1,$2,'Ghent waste sorting programme','Ghent uses colour coded bags and a collection calendar app. Useful idea: vendors could report full bins by SMS instead of an app.','https://stad.gent/en'),($1,$3,'Vendor interview summary','Most vendors throw waste at the end of the day. Bins near the fruit section fill up first. Vendors prefer a phone call or SMS over an app.',NULL)",
      [project.id, id.p1, id.p2]);

    const post = await q("INSERT INTO discussion_posts (project_id, author_id, body) VALUES ($1,$2,'Welcome to the team. Our first goal is to understand how waste moves through the market. Please add what you find to Research.') RETURNING id",
      [project.id, id.green]);
    await q("INSERT INTO discussion_posts (project_id, author_id, parent_id, body) VALUES ($1,$2,$3,'Thanks Aline. I will start the vendor interviews on Saturday morning.')",
      [project.id, id.p2, post.id]);
    await q("INSERT INTO project_files (project_id, uploader_id, filename, mime, size, data) VALUES ($1,$2,'bin-locations.csv','text/csv',96,$3)",
      [project.id, id.p2, Buffer.from('bin_id,section,distance_to_gate_m\n1,Fruit,40\n2,Vegetables,65\n3,Clothing,120\n4,Food court,30\n')]);

    // SMS reminders: applications waiting for review (good for a live demo)
    await app(clinic.id, id.p2, 'submitted', 'I volunteered with AIESEC in Ghana on maternal health awareness and saw SMS reminders work. I can lead the user research with mothers and design the reminder flow.');
    await app(clinic.id, id.p4, 'under_review', 'I can research costs and a sustainable model for running the SMS service with clinics.');

    // Coding clubs: one application
    await app(coding.id, id.p1, 'submitted', 'I teach JavaScript to younger students on weekends and would love to help design the first six weeks of the curriculum.');

    const note = (u, type, msg, link) =>
      q('INSERT INTO notifications (user_id, type, message, link) VALUES ($1,$2,$3,$4)', [u, type, msg, link]);
    await note(id.p1, 'team_formed', 'The team for "Smart waste collection for Kimironko market" has been formed. Your private workspace is ready.', `/projects/${project.id}`);
    await note(id.health, 'new_application', 'Grace Mukamana applied to "SMS reminders for antenatal clinic visits".', `/my-challenges/${clinic.id}/applications`);
    await note(id.admin, 'org_submitted', 'Afya Hub is waiting for verification.', '/admin/organisations');

    // One open report for the admin to review
    await q("INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1, 'challenge', $2, 'The description asks participants to pay a registration fee, which breaks platform rules.')",
      [id.p3, coding.id]);
  });

  console.log(`Demo data added. Every demo account uses the password ${DEMO_PASSWORD}`);
  return true;
}

// Allow running this file directly: node server/seed.js [--reset]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const reset = process.argv.includes('--reset');
  initSchema()
    .then(() => seedDemoData({ onlyIfEmpty: !reset, reset }))
    .then((added) => {
      if (!added) console.log('The database already has data. Use "npm run seed -- --reset" to start fresh.');
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
