import type { Field } from '../types';

/** Calendar-year convention: Winter is the start-of-year window, before Spring.
 * A winter crop entered as 2027 therefore follows Autumn 2026 and precedes
 * Spring 2027. Planning uses Spring/Autumn; history supports all four seasons.
 */
export function historySerial(entry: { season: string; year: number }): number {
  const order: Record<string, number> = { Winter: 0, Spring: 1, Summer: 2, Autumn: 3 };
  return entry.year * 4 + (Object.hasOwn(order, entry.season) ? order[entry.season] : 0);
}

/** Most recent first; does not mutate farmer-entered history. */
export function sortedHistory(history: Field['previousCrops']): Field['previousCrops'] {
  return [...history].sort((a, b) => historySerial(b) - historySerial(a));
}
