import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import { LandingPage, DataSourcesPage, NotFoundPage } from './pages/General'
import { AuthScreen, ResetPasswordPage, UpdatePasswordPage } from './pages/Auth'
import SettingsPage from './pages/Settings'
const FieldListPage = lazy(() => import('./pages/Fields').then(m => ({ default: m.FieldListPage })))
const FieldWizardPage = lazy(() => import('./pages/Fields').then(m => ({ default: m.FieldWizardPage })))
const FieldDetailPage = lazy(() => import('./pages/Fields').then(m => ({ default: m.FieldDetailPage })))
const RecommendationsPage = lazy(() => import('./pages/Recommendations'))
const AgronomistPage = lazy(() => import('./pages/Agronomist'))
const PlannerPage = lazy(() => import('./pages/Planner'))
const AnalysisPage = lazy(() => import('./pages/Analysis').then(m => ({ default: m.AnalysisPage })))
const HistoryPage = lazy(() => import('./pages/Analysis').then(m => ({ default: m.HistoryPage })))
const AnalysisDetailPage = lazy(() => import('./pages/Analysis').then(m => ({ default: m.AnalysisDetailPage })))

export default function App() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return <Suspense fallback={<div className="page-loading" role="status"><span className="loading-leaf" /><p>Preparing AgriLumina…</p></div>}><Routes>
    <Route path="/about" element={<LandingPage />} />
    <Route path="/login" element={<AuthScreen />} />
    <Route path="/signup" element={<AuthScreen signup />} />
    <Route path="/forgot-password" element={<ResetPasswordPage />} />
    <Route path="/update-password" element={<UpdatePasswordPage />} />
    <Route element={<Layout />}>
      <Route index element={<Dashboard />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="fields" element={<FieldListPage />} />
      <Route path="fields/new" element={<FieldWizardPage />} />
      <Route path="fields/:id/edit" element={<FieldWizardPage />} />
      <Route path="fields/:id" element={<FieldDetailPage />} />
      <Route path="recommendations" element={<RecommendationsPage />} />
      <Route path="planner" element={<PlannerPage />} />
      <Route path="agronomist" element={<AgronomistPage />} />
      <Route path="analysis" element={<AnalysisPage />} />
      <Route path="history" element={<HistoryPage />} />
      <Route path="history/:id" element={<AnalysisDetailPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="data-sources" element={<DataSourcesPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes></Suspense>
}
