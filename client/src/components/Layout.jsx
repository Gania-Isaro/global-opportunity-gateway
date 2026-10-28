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

export default function Layout() {
  const { user, logout, sessionExpired, setSessionExpired } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <button
            className="menu-btn"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="sr-only">Menu</span>
            <span className="menu-icon" aria-hidden="true" />
          </button>
          <nav id="main-nav" className={`nav ${open ? 'open' : ''}`} aria-label="Main">
            <ul className="nav-links">
              {navLinks(user).map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to}>{l.label}</NavLink>
                </li>
              ))}
            </ul>
            <div className="nav-user">
              {user ? (
                <>
                  <NavLink to="/notifications" className="bell" aria-label={`Notifications, ${user.unread_notifications} unread`}>
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z" />
                    </svg>
                    {user.unread_notifications > 0 && <span className="bell-count">{user.unread_notifications}</span>}
                  </NavLink>
                  {user.role !== 'admin' && (
                    <NavLink to="/profile" className="nav-profile">{user.full_name?.split(' ')[0] || 'Profile'}</NavLink>
                  )}
                  <NavLink to="/help" className="nav-help">Help</NavLink>
                  <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Log out</button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className="btn btn-ghost btn-sm">Log in</NavLink>
                  <NavLink to="/register" className="btn btn-primary btn-sm">Sign up</NavLink>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main id="main" className="main">
        {sessionExpired && (
          <div className="container">
            <Alert type="warning" onClose={() => setSessionExpired(false)}>
              Your session ended after 30 minutes without activity. Please <Link to="/login">log in again</Link>.
            </Alert>
          </div>
        )}
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <p>
            <strong>GOG</strong> turns global experience into local impact in Kigali.
          </p>
          <ul>
            <li><Link to="/challenges">Challenges</Link></li>
            <li><Link to="/help">Help and FAQ</Link></li>
            <li><Link to="/help#privacy">Privacy</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
