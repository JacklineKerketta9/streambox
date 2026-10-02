import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { errorMessage } from '../api.js';

export default function Login() {
  const { user, login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await signup(form.email, form.password, form.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="logo">STREAMBOX</h1>
        <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
        {mode === 'signup' && <input placeholder="Name (optional)" value={form.name} onChange={set('name')} />}
        <input type="email" placeholder="Email" required value={form.email} onChange={set('email')} />
        <input type="password" placeholder="Password (min 8 characters)" required minLength={8} value={form.password} onChange={set('password')} />
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Sign up'}</button>
        <div className="divider"><span>or</span></div>
        {/* Full-page navigation: the backend starts the OAuth flow and redirects back here. */}
        <a className="btn ghost" href="/auth/google">Continue with Google</a>
        <p className="muted small">
          {mode === 'login' ? 'New here? ' : 'Already have an account? '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  );
}
