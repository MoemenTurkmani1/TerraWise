import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { Logo } from '../components/Layout'
import { Badge, Button } from '../components/ui'

function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-page"><div className="auth-image"><Logo /><div><span className="eyebrow">ROOTED IN POSSIBILITY</span><h1>Every season is<br />a new beginning.</h1><p>Make your next one a little wiser.</p></div><span>TerraWise · Thoughtful decisions. Thriving land.</span></div><div className="auth-panel"><Link to="/about" className="text-link"><ArrowLeft size={15} />Back to TerraWise</Link><div className="auth-form-wrap">{children}</div><small>Field and soil recommendations use transparent starter rules and need local agronomic review.</small></div></div>
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'

export function AuthScreen({ signup = false }: { signup?: boolean }) {
  const auth = useAuth()
  const { updatePreferences } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verification, setVerification] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      if (!auth.configured) {
        if (!name.trim()) throw new Error('Enter a name for your local workspace.')
        await updatePreferences({ name: name.trim() }); navigate('/'); return
      }
      if (signup && !name.trim()) throw new Error('Enter your name.')
      if (signup && password.length < 8) throw new Error('Use at least eight characters for your password.')
      if (signup) {
        const result = await auth.signUp(name.trim(), email.trim(), password)
        setPassword('')
        if (result.needsVerification) { setVerification(true); return }
      } else await auth.signIn(email.trim(), password)
      navigate('/')
    } catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  if (verification) return <AuthLayout><Badge tone="green"><ShieldCheck size={12} />Account verification</Badge><h1>Check your inbox.</h1><p>If your provider requires email verification, follow the link in the message before signing in. Email delivery depends on your Supabase project settings.</p><Link to="/login" className="btn btn-primary" style={{ marginTop: 24 }}>Continue to sign in <ArrowRight size={16} /></Link></AuthLayout>
  return <AuthLayout><Badge tone={auth.configured ? 'green' : 'amber'}><LockKeyhole size={12} />{auth.configured ? 'Secure account mode' : 'Local workspace · Authentication not configured'}</Badge><h1>{signup ? 'A fresh start for your farm.' : 'Welcome back to your land.'}</h1><p>{auth.configured ? signup ? 'Create your account to save a private workspace.' : 'Sign in to your private workspace.' : 'Choose a display name to explore the local workspace.'}</p><form onSubmit={event => void submit(event)}>{(signup || !auth.configured) && <label className="form-field">Your name<input className="input" value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="Your name" maxLength={60} required /></label>}{auth.configured && <><label className="form-field">Email address<input className="input" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label><label className="form-field">Password <span style={{ position: 'relative' }}><input className="input" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} required /><button type="button" className="icon-btn" style={{ position: 'absolute', right: 5, top: 4 }} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>{signup && <small>At least eight characters.</small>}</label>{!signup && <Link className="text-link" to="/forgot-password">Forgot your password?</Link>}</>}{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Please wait…' : auth.configured ? signup ? 'Create account' : 'Sign in' : signup ? 'Create local workspace' : 'Enter local workspace'}<ArrowRight size={16} /></Button></form><div className="auth-explanation"><ShieldCheck size={19} /><p>{auth.configured ? 'Accounts use your configured Supabase project. Data isolation depends on the supplied database policies being applied.' : 'This local workspace has no password authentication. Fields, plans and analyses are stored in this browser.'}</p></div>{auth.configured && <p className="auth-switch"><Link to="/">{auth.user ? 'Continue to your workspace' : 'Continue in the current local workspace'}</Link></p>}<p className="auth-switch">{signup ? 'Already exploring?' : 'New to TerraWise?'} <Link to={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link></p></AuthLayout>
}

export function ResetPasswordPage() {
  const auth = useAuth(), [email, setEmail] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { await auth.requestReset(email.trim()); setMessage('If an account exists for this address, a recovery email will be sent. Check your inbox.') } catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) } }
  return <AuthLayout><Badge tone="neutral"><LockKeyhole size={12} />Account recovery</Badge><h1>Reset your password.</h1><p>We’ll send a recovery link through your configured authentication provider.</p>{auth.configured ? <form onSubmit={event => void submit(event)}><label className="form-field">Email address<input className="input" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send recovery link'} <ArrowRight size={16} /></Button></form> : <p>Account recovery is available after Supabase is configured.</p>}<p className="auth-switch"><Link to="/login">Return to sign in</Link></p></AuthLayout>
}

export function UpdatePasswordPage() {
  const auth = useAuth(), navigate = useNavigate(), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { if (password.length < 8) throw new Error('Use at least eight characters.'); await auth.updatePassword(password); setPassword(''); navigate('/') } catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) } }
  return <AuthLayout><Badge tone="neutral"><LockKeyhole size={12} />Account recovery</Badge><h1>Choose a new password.</h1>{auth.session ? <form onSubmit={event => void submit(event)}><label className="form-field">New password<input className="input" type="password" minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'} <ArrowRight size={16} /></Button></form> : <><p>Open a valid password-recovery link to continue. Recovery links can expire.</p><Link to="/forgot-password" className="text-link">Request another recovery link <ArrowRight size={14} /></Link></>}</AuthLayout>
}
