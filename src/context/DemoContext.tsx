import { createContext, useContext, useState, type ReactNode } from 'react'
import { activeDemoFarm, DEMO_ACTIVE_KEY, isDemoAvailable, type DemoFarmId } from '../lib/demoSession'
import { resetDemoStorage } from '../services/demoWorkspace'
interface DemoState {
  active: boolean; available: boolean; farmId: DemoFarmId; revision: number;
  start: () => void; exit: () => void; switchFarm: (id: DemoFarmId) => void; reset: () => void;
}
const DemoContext = createContext<DemoState | null>(null)
export function DemoProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(activeDemoFarm)
  const [farmId, setFarmId] = useState<DemoFarmId>(initial ?? 'bekaa')
  const [revision, setRevision] = useState(0)
  function start() {
    if (!isDemoAvailable()) throw new Error('Demo Mode is available in development and on localhost.')
    sessionStorage.setItem(DEMO_ACTIVE_KEY, farmId)
    // Reload drops in-flight account requests and creates no Supabase client in demo.
    window.location.assign('/')
  }
  function exit() { sessionStorage.removeItem(DEMO_ACTIVE_KEY); window.location.assign('/login') }
  function switchFarm(id: DemoFarmId) { sessionStorage.setItem(DEMO_ACTIVE_KEY, id); setFarmId(id) }
  function reset() { resetDemoStorage(localStorage, sessionStorage); setRevision(value => value + 1) }
  return <DemoContext.Provider value={{ active: !!initial, available: isDemoAvailable(), farmId, revision, start, exit, switchFarm, reset }}>{children}</DemoContext.Provider>
}
export function useDemo() { const value = useContext(DemoContext); if (!value) throw new Error('useDemo requires DemoProvider'); return value }
