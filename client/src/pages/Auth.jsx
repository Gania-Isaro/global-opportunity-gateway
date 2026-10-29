import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Field, Loading, useSubmit } from '../components/ui.jsx';

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

// In demo mode the server returns the email link so the prototype can be tested without a mailbox.
function DemoLink({ link, label }) {
  if (!link) return null;
  const path = link.replace(/^https?:\/\/[^/]+/, '');
  return (
    <div className="demo-box">
      <strong>Demo mode:</strong> the email has been sent. To test without opening a mailbox, use this link:
      <Link to={path} className="btn btn-primary btn-sm">{label}</Link>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { busy, error, fields, submit } = useSubmit();
  const [form, setForm] = useState({ email: '', password: '' });
  const [resent, setResent] = useState(null);

  const onSubmit = (e) => {
    e.preventDefault();
    submit(async () => {
      await login(form.email, form.password);
      navigate(location.state?.from || '/dashboard', { replace: true });
    });
  };

  const resend = async () => {
    const r = await api.post('/auth/resend-confirmation', { email: form.email }).catch((e) => ({ message: e.message }));
    setResent(r);
  };

  return (
    <AuthCard title="Log in" subtitle="Welcome back to GOG.">
      <Alert>{error}</Alert>
      {error?.includes('confirm your email') && (
        <p>
          <button className="link-btn" onClick={resend}>Send me a new confirmation link</button>
        </p>
      )}
      {resent && <Alert type="success">{resent.message}</Alert>}
      <DemoLink link={resent?.demoLink} label="Confirm my email" />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email address" error={fields.email} required>
          {(p) => <input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Password" error={fields.password} required>
          {(p) => <input {...p} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <div className="form-row-between">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
      </form>
      <p className="auth-foot">New to GOG? <Link to="/register">Create an account</Link></p>
    </AuthCard>
  );
}

export function Register() {
  const [params] = useSearchParams();
  const { busy, error, fields, submit } = useSubmit();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: params.get('role') === 'owner' ? 'owner' : 'participant',
  });
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = (e) => {
    e.preventDefault();
    submit(async () => setDone(await api.post('/auth/register', form)));
  };

  if (done) {
    return (
      <AuthCard title="Check your email">
        <Alert type="success">{done.message}</Alert>
        <p>Open the link in the email to activate your account, then log in.</p>
        <DemoLink link={done.demoLink} label="Confirm my email" />
        <p className="auth-foot"><Link to="/login">Go to log in</Link></p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="It takes less than a minute.">
      <Alert>{error}</Alert>
      <form onSubmit={onSubmit} noValidate>
        <fieldset className="role-pick">
          <legend>I mainly want to</legend>
          <label className={`role-option ${form.role === 'participant' ? 'selected' : ''}`}>
            <input type="radio" name="role" value="participant" checked={form.role === 'participant'} onChange={set('role')} />
            <span><strong>Solve challenges</strong><small>Apply and join teams as a participant</small></span>
          </label>
          <label className={`role-option ${form.role === 'owner' ? 'selected' : ''}`}>
            <input type="radio" name="role" value="owner" checked={form.role === 'owner'} onChange={set('role')} />
            <span><strong>Post challenges</strong><small>As an organisation or an individual</small></span>
          </label>
        </fieldset>
        <Field label="Full name" error={fields.fullName} required>
          {(p) => <input {...p} autoComplete="name" value={form.fullName} onChange={set('fullName')} />}
        </Field>
        <Field label="Email address" error={fields.email} required>
          {(p) => <input {...p} type="email" autoComplete="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Password" error={fields.password} hint="At least 8 characters with a letter and a number." required>
          {(p) => <input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />}
        </Field>
        <p className="small muted">
          By signing up you agree that GOG stores the details you give us only to run the platform, in line with
          Rwanda's Law No. 058/2021 on personal data. <Link to="/help#privacy">Read more</Link>.
        </p>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
      </form>
      <p className="auth-foot">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthCard>
  );
}

