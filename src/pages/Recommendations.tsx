import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useClimate } from '../hooks/useClimate'
import { needsLegacyReview } from '../services/repository'
import { PageHeading, EmptyState } from '../components/ui'
import BestCrops from '../components/BestCrops'
import WaterDemandSection from '../components/WaterDemandSection'
import { screenBekaaWheat } from '../lib/localSeason'
import BekaaSeasonPanel from './BekaaSeasonPanel'
import './Decisions.css'

export default function RecommendationsPage() {
  const { fields, selectedFieldId, setSelectedFieldId } = useApp()
  const [params, setParams] = useSearchParams()
  const available = fields.filter(field => !field.archived && !needsLegacyReview(field))
  const requestedField = params.get('field')
  const field = requestedField ? available.find(field => field.id === requestedField) : available.find(field => field.id === selectedFieldId) ?? available[0]
  const season = params.get('season') === 'Spring' ? 'Spring' : 'Autumn'
  const localContext = params.get('reference') === 'bekaa'
  const { climate, loading, error, refresh } = useClimate(field, localContext ? 2 : 1)
  function change(key: string, value: string) {
    setParams(current => { const next = new URLSearchParams(current); next.set(key, value); return next })
  }
  const local = field && localContext ? screenBekaaWheat(field, climate, season) : undefined
  return <div className="decisions-page"><PageHeading title="Crop recommendations" eyebrow="YOUR FIELD, ITS BEST AVAILABLE SCREENS" description="Compare crops ranked by the existing scientific pH and temperature screen." />
    {!field ? <EmptyState title="Add or review a field to see its ranking" description="A valid field, soil pH and matching climate data are required."><Link to="/fields" className="btn btn-primary">Manage fields</Link></EmptyState> : <>
      <div className="decision-toolbar card"><div className="decision-select"><label htmlFor="recommendation-field">Your field</label><select id="recommendation-field" value={field.id} onChange={event => { setSelectedFieldId(event.target.value); setParams({ field: event.target.value, season }) }}>{available.map(item => <option key={item.id} value={item.id}>{item.name} · {item.area} ha</option>)}</select></div><div className="decision-select"><label htmlFor="recommendation-season">Planting window</label><select id="recommendation-season" value={season} onChange={event => change('season', event.target.value)}><option>Autumn</option><option>Spring</option></select></div></div>
      <BestCrops field={field} climate={climate} loading={loading} error={error} refresh={refresh} season={season} onSeasonChange={value => change('season', value)} result={local?.screen} />
      <details className="card season-context"><summary>Optional regional study reference</summary><label htmlFor="season-context">Season reference</label><select id="season-context" value={localContext ? 'bekaa' : 'general'} onChange={event => change('reference', event.target.value)}><option value="general">General four-month exploratory windows</option><option value="bekaa">My field is in Bekaa Valley, Lebanon: wheat study reference</option></select><p>This optional study covers wheat only. Location and local planting suitability remain unverified.</p></details>
      {local ? <BekaaSeasonPanel field={field} result={local} /> : <WaterDemandSection key={field.id} field={field} />}
    </>}
  </div>
}
