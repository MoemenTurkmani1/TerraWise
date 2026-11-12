import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigurationError } from '../services/supabase'

interface AuthState {
  configured: boolean
  configurationError: string | null
  authError: string | null
  loading: boolean
  session: Session | null
  user: User | null
  recovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<{ needsVerification: boolean }>
  requestReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
  retryInitialization: () => void
  enterDemo: () => void
}
const AuthContext = createContext<AuthState | null>(null)
const requireClient = () => { if (!supabase) throw new Error('Secure accounts are not configured. Use local storage or configure Supabase.'); return supabase }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [recovery, setRecovery] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const demoOverride = useRef(false)
  useEffect(() => {
    if (!supabase) return
    let active = true
    let initialized = false
    let failed = false
    let queued: { event: string; session: Session | null } | null = null
    const applyEvent = (event: string, next: Session | null) => {
      if (!active || failed || demoOverride.current) return
      setAuthError(null)
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setLoading(false)
    }
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active || demoOverride.current) return
      if (!initialized) { if (event !== 'INITIAL_SESSION') queued = { event, session: next }; return }
      applyEvent(event, next)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || demoOverride.current) return
      initialized = true
      if (error) { failed = true; setSession(null); setAuthError('The secure session could not be checked. Retry or explicitly choose the local workspace.'); setLoading(false); return }
      const nextEvent: { event: string; session: Session | null } | null = queued
      if (nextEvent) applyEvent(nextEvent.event, nextEvent.session)
      else applyEvent('INITIAL_SESSION', data.session)
    }).catch(() => { if (active && !demoOverride.current) { initialized = true; failed = true; setSession(null); setAuthError('The secure session could not be checked. Retry or explicitly choose the local workspace.'); setLoading(false) } })
    return () => { active = false; subscription.subscription.unsubscribe() }
  }, [attempt])
  async function signIn(email: string, password: string) { demoOverride.current = false; const { data, error } = await requireClient().auth.signInWithPassword({ email, password }); if (error) throw error; setSession(data.session); setAuthError(null); setAttempt(value => value + 1) }
  async function signUp(name: string, email: string, password: string) {
    demoOverride.current = false
    const { data, error } = await requireClient().auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${window.location.origin}/login` } })
    if (error) throw error
    if (data.session) { setSession(data.session); setAuthError(null); setAttempt(value => value + 1) }
    return { needsVerification: !data.session }
  }
  async function requestReset(email: string) {
    const { error } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/update-password` })
    if (error) throw error
  }
  async function updatePassword(password: string) {
    const { error } = await requireClient().auth.updateUser({ password })
    if (error) throw error
    setRecovery(false)
  }
  async function signOut() { const { error } = await requireClient().auth.signOut(); if (error) throw error }
  function retryInitialization() { demoOverride.current = false; setAuthError(null); setLoading(true); setAttempt(value => value + 1) }
  function enterDemo() { demoOverride.current = true; setSession(null); setRecovery(false); setAuthError(null); setLoading(false) }
  return <AuthContext.Provider value={{ configured: !!supabase, configurationError: supabaseConfigurationError, authError, loading, session, user: session?.user ?? null, recovery, signIn, signUp, requestReset, updatePassword, signOut, retryInitialization, enterDemo }}>{children}</AuthContext.Provider>
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth requires AuthProvider'); return context }
