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

