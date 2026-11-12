// Optional read-only integration check at a public test coordinate.
// The elevation is a synthetic test input, not a claim about any field.
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { fetchWaterClimate } = await server.ssrLoadModule('/src/services/nasaPowerWater.ts')
  const result = await fetchWaterClimate(33.85, 35.9, 1000, '2025-07-01', '2025-07-03')
  const accepted = result.days.filter(day => day.eto.status === 'ok').length
  console.log(`NASA water-climate live test: ${result.days.length} days received, ${accepted} ETo inputs accepted; elevation is a synthetic test assumption.`)
  if (result.days.length !== 3 || accepted !== 3) process.exitCode = 1
} catch {
  console.error('NASA water-climate live test failed or was unavailable; no substitute data was used.')
  process.exitCode = 1
} finally { await server.close() }
