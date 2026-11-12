/** Demo activation is per tab; account tokens and guest keys are never changed. */
export const DEMO_ACTIVE_KEY = 'terrawise.demo.active.v1'
export const DEMO_FARM_IDS = ['bekaa', 'north', 'coast'] as const
export type DemoFarmId = typeof DEMO_FARM_IDS[number]
export const demoWorkspaceKey = (farm: DemoFarmId) => `terrawise.demo.v1.workspace:${farm}`
export function isDemoAvailable(): boolean {
  return import.meta.env.DEV || (typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
}
export function activeDemoFarm(): DemoFarmId | null {
  if (!isDemoAvailable()) return null
  try {
    const value = sessionStorage.getItem(DEMO_ACTIVE_KEY)
    return DEMO_FARM_IDS.includes(value as DemoFarmId) ? value as DemoFarmId : null
  } catch { return null }
}
export const isDemoSessionActive = () => activeDemoFarm() !== null
export function assertRealSession() {
  if (isDemoSessionActive()) throw new Error('DEMO / SYNTHETIC mode cannot access account services or real report storage.')
}
/** Defense at persistence boundaries, including empty demo workspaces and copies. */
export function containsSyntheticData(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsSyntheticData)
  const item = value as Record<string, unknown>
  return item.dataClassification === 'demo-synthetic' || item.source === 'demo' || item.dataSource === 'demo'
    || item.provenance === 'synthetic' || (typeof item.id === 'string' && item.id.startsWith('demo:')) || Object.values(item).some(containsSyntheticData)
}
export function assertRealData(value: unknown) {
  if (containsSyntheticData(value)) throw new Error('DEMO / SYNTHETIC records cannot be saved as real farmer data or synchronized.')
}
