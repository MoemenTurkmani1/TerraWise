import { Capacitor } from '@capacitor/core'
import NativeLifecycle from './components/NativeLifecycle'
import ErrorBoundary from './components/ErrorBoundary'
import './components/Mvp.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import { isDemoSessionActive } from './lib/demoSession'
import { DemoProvider } from './context/DemoContext'
import 'leaflet/dist/leaflet.css'
import './index.css'

// Remote typography is optional; Demo Mode uses system fonts without network requests.
if (!isDemoSessionActive()) {
  const font = document.createElement('link')
  font.rel = 'stylesheet'
  font.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;650;700&family=Manrope:wght@400;500;600;650;700;750;800&display=swap'
  document.head.appendChild(font)
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><BrowserRouter><DemoProvider><AuthProvider><AppProvider><NativeLifecycle /><App /></AppProvider></AuthProvider></DemoProvider></BrowserRouter></ErrorBoundary></React.StrictMode>,
)

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { /* The online application still works if offline setup is unavailable. */ }) })
}
