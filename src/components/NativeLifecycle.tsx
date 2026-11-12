import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { supabase } from '../services/supabase'
import { nativeCallback } from '../lib/nativeAuth'
export default function NativeLifecycle() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true
    const handle = async (url: string) => {
      const callback = nativeCallback(url)
      if (!callback || !supabase) return
      try {
        if (callback.code) { const { error } = await supabase.auth.exchangeCodeForSession(callback.code); if (error) throw error }
        else if (callback.accessToken && callback.refreshToken) { const { error } = await supabase.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken }); if (error) throw error }
        if (active) navigate(callback.path)
      } catch { if (active) navigate('/forgot-password') }
    }
    const urls = App.addListener('appUrlOpen', event => { void handle(event.url) })
    const state = App.addListener('appStateChange', event => { if (event.isActive) supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh() })
    const back = App.addListener('backButton', event => { if (event.canGoBack) window.history.back(); else void App.exitApp() })
    void App.getLaunchUrl().then(result => { if (active && result?.url) void handle(result.url) })
    return () => { active = false; void urls.then(listener => listener.remove()); void state.then(listener => listener.remove()); void back.then(listener => listener.remove()) }
  }, [navigate])
  return null
}
