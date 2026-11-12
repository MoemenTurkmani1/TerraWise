import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchClimateRange } from '../services/nasaPower'
import type { ClimateData, Field } from '../types'
import { needsLegacyReview } from '../services/repository'

const unavailable = (): ClimateData => ({ source: 'unavailable', year: new Date().getUTCFullYear() - 1, monthly: [] })

/** Only data for the current coordinates can be presented while requests race. */
export function useClimate(field: Field | undefined, years = 1) {
  const [result, setResult] = useState<{ key: string; climate: ClimateData } | null>(null)
  const [revision, setRevision] = useState(0)
  const request = useRef(0)
  const needsReview = !!field && needsLegacyReview(field)
  const latitude = needsReview ? undefined : field?.latitude, longitude = needsReview ? undefined : field?.longitude
  const key = `${latitude}:${longitude}:${years}:${revision}`
  useEffect(() => {
    const current = ++request.current
    if (latitude === undefined || longitude === undefined) return
    const controller = new AbortController()
    const endYear = new Date().getUTCFullYear() - 1
    void fetchClimateRange(latitude, longitude, endYear - years + 1, endYear, controller.signal).then(climate => {
      if (current === request.current && !controller.signal.aborted) setResult({ key, climate })
    }).catch(error => {
      if (current === request.current && !controller.signal.aborted) setResult({ key, climate: { ...unavailable(), error: error instanceof Error ? error.message : 'NASA POWER data is unavailable.' } })
    })
    return () => controller.abort()
  }, [latitude, longitude, years, key])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const current = result?.key === key ? result.climate : unavailable()
  return { climate: current, loading: !!field && !needsReview && result?.key !== key, refresh, error: needsReview ? 'This older example-derived field requires review before climate or recommendations can be used.' : current.error || null }
}
