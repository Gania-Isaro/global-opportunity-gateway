import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import { Login, Register, ConfirmEmail, ForgotPassword, ResetPassword } from './pages/Auth.jsx';
import Challenges from './pages/Challenges.jsx';
import ChallengeDetail from './pages/ChallengeDetail.jsx';
import ChallengeForm from './pages/ChallengeForm.jsx';
import MyChallenges from './pages/MyChallenges.jsx';
import ReviewApplications from './pages/ReviewApplications.jsx';
import { MyApplications, Invitations } from './pages/Participant.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { Profile, UserProfile } from './pages/Profile.jsx';
import { Organisation, OrganisationPublic } from './pages/Organisation.jsx';
import { Projects, Workspace } from './pages/Workspace.jsx';
import Notifications from './pages/Notifications.jsx';
import { AdminOrganisations, AdminUsers, AdminReports, AdminAudit, AdminPilotReport } from './pages/Admin.jsx';
import Help from './pages/Help.jsx';
import NotFound from './pages/NotFound.jsx';

// Route guards. The server enforces the same rules on every request (NFR 3).
function RequireAuth({ children, role }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <div className="container"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <div className="container"><Loading /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { refresh, user } = useAuth();
  const location = useLocation();

  // Keep the notification count fresh as the user moves around.
  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const auth = (el, role) => <RequireAuth role={role}>{el}</RequireAuth>;

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
          <Route path="confirm-email" element={<ConfirmEmail />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="help" element={<Help />} />

          <Route path="challenges" element={<Challenges />} />
          <Route path="challenges/new" element={auth(<ChallengeForm />)} />
          <Route path="challenges/:id" element={<ChallengeDetail />} />
          <Route path="challenges/:id/edit" element={auth(<ChallengeForm />)} />
          <Route path="organisations/:id" element={<OrganisationPublic />} />

          <Route path="dashboard" element={auth(<Dashboard />)} />
          <Route path="profile" element={auth(<Profile />)} />
          <Route path="users/:id" element={auth(<UserProfile />)} />
          <Route path="organisation" element={auth(<Organisation />)} />
          <Route path="my-challenges" element={auth(<MyChallenges />)} />
          <Route path="my-challenges/:id/applications" element={auth(<ReviewApplications />)} />
          <Route path="applications" element={auth(<MyApplications />)} />
          <Route path="invitations" element={auth(<Invitations />)} />
          <Route path="projects" element={auth(<Projects />)} />
          <Route path="projects/:id" element={auth(<Workspace />)} />
          <Route path="notifications" element={auth(<Notifications />)} />

          <Route path="admin/organisations" element={auth(<AdminOrganisations />, 'admin')} />
          <Route path="admin/users" element={auth(<AdminUsers />, 'admin')} />
          <Route path="admin/reports" element={auth(<AdminReports />, 'admin')} />
          <Route path="admin/audit" element={auth(<AdminAudit />, 'admin')} />
          <Route path="admin/pilot-report" element={auth(<AdminPilotReport />, 'admin')} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
