import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Alert } from './ui.jsx';

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="GOG home">
      <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="currentColor" />
        <circle cx="32" cy="32" r="16" fill="none" stroke="#f5b83d" strokeWidth="5" />
        <path d="M32 16v32M16 32h32" stroke="#f5b83d" strokeWidth="3" />
      </svg>
      <span className="logo-text">
        GOG <small>Global Opportunity Gateway</small>
      </span>
    </Link>
  );
}

// Navigation only shows options that apply to the user's role (Section 3.1).
function navLinks(user) {
  if (!user) {
    return [
      { to: '/challenges', label: 'Challenges' },
      { to: '/help', label: 'How it works' },
    ];
  }
  if (user.role === 'admin') {
    return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/admin/organisations', label: 'Verification' },
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/reports', label: 'Reports' },
      { to: '/admin/audit', label: 'Audit log' },
      { to: '/admin/pilot-report', label: 'Pilot report' },
      { to: '/challenges', label: 'Challenges' },
    ];
  }
  const links = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/challenges', label: 'Challenges' },
  ];
  if (user.role === 'owner') {
    links.push({ to: '/my-challenges', label: 'My challenges' });
    links.push({ to: '/applications', label: 'My applications' });
  } else {
    links.push({ to: '/applications', label: 'My applications' });
    links.push({ to: '/my-challenges', label: 'My challenges' });
  }
  links.push({ to: '/projects', label: 'Projects' });
  return links;
}

