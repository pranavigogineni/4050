import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { accountApi } from '../api/account'
import { Field, ProfileFields, CardFields, PasswordFields, Notice, emptyProfile, emptyCard } from '../components/AccountFields'
import './AccountPages.css'

function Shell({ title, description, children }) {
  return <main className="account-page auth-page"><div className="account-heading"><span className="eyebrow">YOUR CINEMAX</span><h1>{title}</h1><p>{description}</p></div><section className="account-panel">{children}</section></main>
}
export function RegisterPage() {
  const [form, setForm] = useState({ ...emptyProfile, email: '', password: '', confirm_password: '' })
  const [card, setCard] = useState(emptyCard)
  const [withCard, setWithCard] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const data = await accountApi('/auth/register', { method: 'POST', body: { ...form, ...(withCard ? { card } : {}) } })
      setMessage(data.message); setForm({ ...emptyProfile, email: '', password: '', confirm_password: '' }); setCard(emptyCard)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Shell title="Make movie night yours." description="Create an account to save favorites and manage your profile.">
    <Notice error={error} message={message} />
    {message ? <div className="form-links"><Link to="/login">Continue to login</Link><Link to="/resend-verification">Resend verification email</Link></div> :
      <form onSubmit={submit}>
        <p className="form-help">Fields marked * are required.</p>
        <Field name="email" label="Email address" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={v => setForm({ ...form, email: v })} />
        <ProfileFields value={form} setValue={setForm} />
        <PasswordFields value={form} setValue={setForm} />
        <label className="check-field"><input type="checkbox" checked={withCard} onChange={e => setWithCard(e.target.checked)} />Add a payment card now (optional)</label>
        {withCard && <CardFields value={card} setValue={setCard} />}
        <button className="btn-primary" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
        <p className="form-help">We’ll email a verification link. Your account stays inactive until you confirm your email.</p>
      </form>}
    <div className="form-links"><Link to="/login">Already have an account? Log in</Link></div>
  </Shell>
}
export function LoginPage() {
  const { user, setUser, notice, setNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const destination = account => {
    const from = location.state?.from
    return account.role === 'admin' ? '/admin'
      : (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.includes('\\') && from !== '/admin' ? from : '/')
  }
  if (user) return <Navigate to={destination(user)} replace />
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const data = await accountApi('/auth/login', { method: 'POST', body: form })
      setNotice('')
      setUser(data.user)
      navigate(destination(data.user), { replace: true })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Shell title="Welcome back." description="Log in to your next movie night.">
    <Notice error={error} message={notice || location.state?.message} />
    <form onSubmit={submit}>
      <p className="form-help">Fields marked * are required.</p>
      <Field name="email" label="Email address" type="email" autoComplete="username" required maxLength={254} value={form.email} onChange={v => setForm({ ...form, email: v })} />
      <Field name="password" label="Password" type="password" autoComplete="current-password" required maxLength={128} value={form.password} onChange={v => setForm({ ...form, password: v })} />
      <button className="btn-primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
    <div className="form-links"><Link to="/forgot-password">Forgot your password?</Link><Link to="/resend-verification">Resend verification email</Link><Link to="/register">Create an account</Link></div>
  </Shell>
}
export function RecoveryPage({ verification = false }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try { setMessage((await accountApi(`/auth/${verification ? 'resend-verification' : 'forgot-password'}`, { method: 'POST', body: { email } })).message) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Shell title={verification ? 'Verify your email.' : 'Let’s get you back in.'} description={verification ? 'Request a fresh activation link.' : 'We’ll email you a secure link to reset your password.'}>
    <Notice error={error} message={message} />
    <form onSubmit={submit}><Field name="email" label="Email address" type="email" autoComplete="email" required maxLength={254} value={email} onChange={setEmail} />
      <button className="btn-primary" disabled={busy}>{busy ? 'Requesting…' : verification ? 'Send verification email' : 'Send reset link'}</button></form>
    <div className="form-links"><Link to="/login">Back to login</Link></div>
  </Shell>
}
export function TokenPage({ verification = false }) {
  const { setUser, setFavorites } = useAuth()
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const [form, setForm] = useState({ password: '', confirm_password: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      const data = await accountApi(`/auth/${verification ? 'verify-email' : 'reset-password'}`, { method: 'POST', body: { ...form, token } })
      setMessage(data.message); setForm({ password: '', confirm_password: '' })
      if (!verification) { setUser(null); setFavorites([]) }
      window.history.replaceState(null, '', window.location.pathname)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Shell title={verification ? 'One last step.' : 'Choose a new password.'} description={verification ? 'Confirm your email address to activate your CineMax account.' : 'Resetting your password also logs out your existing sessions.'}>
    <Notice error={error || (!token ? 'This link is incomplete. Request a new email below.' : '')} message={message} />
    {!message && token && <form onSubmit={submit}>
      {!verification && <PasswordFields value={form} setValue={setForm} />}
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : verification ? 'Verify email' : 'Reset password'}</button>
    </form>}
    <div className="form-links"><Link to="/login">Log in</Link>{!message && <Link to={verification ? '/resend-verification' : '/forgot-password'}>Request a new link</Link>}</div>
  </Shell>
}
