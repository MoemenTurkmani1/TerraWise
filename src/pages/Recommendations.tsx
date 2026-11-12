import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronDown, CircleHelp, ExternalLink, Info, SlidersHorizontal, Sprout, TriangleAlert } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useClimate } from '../hooks/useClimate'
import { needsLegacyReview } from '../services/repository'
import { assessCrops, rankCrops } from '../lib/recommendations'
import { compareEvidence } from '../lib/constraints'
import { Badge, Button, EmptyState, PageHeading, SourceNote } from '../components/ui'
import type { Recommendation } from '../types'
import './Decisions.css'

export function SuitabilityScore({ value, large = false }: { value: number | null; large?: boolean }) {
  if (value === null) return <Badge tone="amber">Overall suitability unknown</Badge>
  return <div className={`suitability-score ${large ? 'suitability-score-large' : ''}`} role="img" aria-label={`${value} out of 100 provisional suitability`}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" className="score-track" /><circle cx="50" cy="50" r="43" className="score-progress" strokeDasharray={`${value * 2.7} 270`} /></svg><span>{value}<small>/ 100</small></span>
  </div>
}

function RecommendationDetails({ recommendation }: { recommendation: Recommendation }) {
  return <details className="recommendation-details"><summary>View factor evidence and limitations <ChevronDown size={16} /></summary>
    <p className="decision-fineprint">Individual scores and the historical weights are unvalidated starter assumptions. They are not combined into an overall score while critical evidence is unknown.</p>
    <div className="factor-list">{recommendation.factors.map(factor => <div className="factor-item" key={factor.name}>
      <div className="factor-heading"><strong>{factor.name}</strong><span>{factor.score === null ? 'Unknown / unscored' : `${factor.score}/100 · provisional factor`} · {Math.round(factor.weight * 100)}% previous weight</span></div>
      {factor.score !== null && <div className="factor-track"><span style={{ width: `${Math.max(0, Math.min(100, factor.score))}%` }} /></div>}<p>{factor.explanation}</p>
    </div>)}</div>
    {!!recommendation.constraints?.length && <div className="recommendation-warnings"><strong>Critical constraints</strong>{recommendation.constraints.map(item => <p key={item.id}><CircleHelp size={15} />{item.status}: {item.explanation}</p>)}</div>}
    {recommendation.warnings.length > 0 && <div className="recommendation-warnings">{recommendation.warnings.map(warning => <p key={warning}><TriangleAlert size={15} />{warning}</p>)}</div>}
    {recommendation.missingInputs.length > 0 && <div className="decision-callout amber"><CircleHelp size={18} /><div><strong>Missing inputs</strong><p>{recommendation.missingInputs.join(' · ')}</p></div></div>}
    <div className="recommendation-confidence"><Badge tone="neutral">{recommendation.confidence} confidence</Badge><Badge tone="neutral">{recommendation.completeness ?? 'Not available'}% tracked inputs provided</Badge><SourceNote source={recommendation.dataSource} /></div>
    <p className="decision-fineprint">Completeness counts eight tracked inputs, including the unavailable water balance. It is not scientific validation or a probability.</p>
    <div className="crop-knowledge"><h4>Crop details and references</h4><p><strong>Botanical name:</strong> {recommendation.crop.scientificName ?? 'Not available'} · <strong>Family:</strong> {recommendation.crop.family}</p><p><strong>Unvalidated starter screens:</strong> pH {recommendation.crop.ph.join('–')}, temperature {recommendation.crop.temperature.join('–')} °C.</p><p>{recommendation.crop.soilNotes} {recommendation.crop.durationNotes} {recommendation.crop.diseaseNotes}</p><p>{recommendation.crop.geographicApplicability}</p><p>References accessed {recommendation.crop.referenceUpdated}; the numeric screens are not independently sourced or agronomist-reviewed.</p>{recommendation.crop.references?.map(reference => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.title} <ExternalLink size={12} /></a>)}</div>
  </details>
}

function CropComparison({ profiles, season }: { profiles: Recommendation[]; season: string }) {
  const [selected, setSelected] = useState(() => profiles.slice(0, 2).map(item => item.crop.id))
  const chosen = profiles.filter(item => selected.includes(item.crop.id))
  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 3 ? [...current, id] : current) }
  return <section className="card crop-comparison" aria-labelledby="comparison-heading"><div className="section-heading"><div><h2 id="comparison-heading">Compare crop evidence</h2><p>Select up to three profiles. A ranking is shown only when critical evidence is sufficient.</p></div><Badge tone="neutral">{chosen.length} / 3 selected</Badge></div>
    <fieldset className="comparison-choices"><legend>Select crops to compare</legend>{profiles.map(item => <label key={item.crop.id}><input type="checkbox" checked={selected.includes(item.crop.id)} disabled={!selected.includes(item.crop.id) && selected.length >= 3} onChange={() => toggle(item.crop.id)} />{item.crop.name}</label>)}</fieldset>
    {chosen.length > 0 && <div className="comparison-scroll"><table><caption className="sr-only">Exploratory crop evidence for {season}</caption><thead><tr><th scope="col">Factor</th>{chosen.map(item => <th scope="col" key={item.crop.id}>{item.crop.name}<small>{item.crop.scientificName}</small></th>)}</tr></thead><tbody><tr><th scope="row">Overall suitability</th>{chosen.map(item => <td key={item.crop.id}>{item.score === null ? 'Unknown' : `${item.score}/100 · provisional`}</td>)}</tr>{profiles[0]?.factors.map(factor => <tr key={factor.name}><th scope="row">{factor.name}</th>{chosen.map(item => { const value = item.factors.find(entry => entry.name === factor.name); return <td key={item.crop.id}>{value?.score == null ? 'Unknown / unscored' : `${value.score}/100 · provisional`}</td> })}</tr>)}<tr><th scope="row">Data completeness</th>{chosen.map(item => <td key={item.crop.id}>{item.completeness}% tracked inputs</td>)}</tr></tbody></table></div>}
    {chosen.length >= 2 && <div className="decision-callout methodology-note"><Info size={18} /><div><strong>Evidence comparison: {chosen[0].crop.name} and {chosen[1].crop.name}</strong>{compareEvidence(chosen[0], chosen[1]).map(line => <p key={line}>{line}</p>)}</div></div>}
  </section>
}

export default function RecommendationsPage() {
  const { fields, selectedFieldId, setSelectedFieldId } = useApp()
  const [params, setParams] = useSearchParams()
  const activeFields = fields.filter(item => !item.archived && !needsLegacyReview(item))
  const field = activeFields.find(item => item.id === params.get('field')) ?? activeFields.find(item => item.id === selectedFieldId) ?? activeFields[0]
  const [season, setSeason] = useState('Autumn')
  const [cropType, setCropType] = useState('All crops')
  const [page, setPage] = useState(0)
  const { climate, loading, error, refresh } = useClimate(field)
  const profiles = useMemo(() => field ? assessCrops(field, climate, season) : [], [field, climate, season])
  const ranked = useMemo(() => field ? rankCrops(field, climate, season) : [], [field, climate, season])
  const shown = ranked.length ? ranked : profiles
  const filtered = shown.filter(item => cropType === 'All crops' || item.crop.type === cropType)
  const pageCount = Math.max(1, Math.ceil(filtered.length / 4))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * 4, safePage * 4 + 4)
  const types = [...new Set(profiles.map(item => item.crop.type))]
  function changeField(id: string) { setSelectedFieldId(id); setParams({ field: id }); setPage(0) }

  return <div className="decisions-page"><PageHeading eyebrow="MAKE AN INFORMED NEXT MOVE" title="Crop recommendations" description="Explore the evidence available for your field." />
    {!field ? <EmptyState icon={Sprout} title={fields.length ? 'No active fields available' : 'Start with your first field'} description={fields.length ? 'Restore or review a field, or add a new field.' : 'Add soil, water availability and crop history to explore crop profiles.'}><Link className="btn btn-primary" to={fields.length ? '/fields' : '/fields/new'}>{fields.length ? 'Manage fields' : 'Add a field'} <ArrowRight size={16} /></Link></EmptyState> : <>
      <div className="decision-toolbar card"><div className="decision-select"><label htmlFor="recommendation-field">Your field</label><select id="recommendation-field" value={field.id} onChange={event => changeField(event.target.value)}>{activeFields.map(item => <option value={item.id} key={item.id}>{item.name} · {item.area} ha</option>)}</select></div><div className="decision-select"><label htmlFor="recommendation-season">Planting window</label><select id="recommendation-season" value={season} onChange={event => { setSeason(event.target.value); setCropType('All crops'); setPage(0) }}><option>Autumn</option><option>Spring</option></select></div><div className="decision-toolbar-source"><SourceNote source={climate.source} year={climate.year} cached={climate.provenance?.cache === 'cached'} partial={climate.provenance?.quality === 'partial'} />{climate.provenance && <small>Retrieved {new Date(climate.provenance.retrievedAt).toLocaleString()} · {climate.provenance.period.start}–{climate.provenance.period.end} · {climate.provenance.quality} · {climate.provenance.coordinates.latitude}, {climate.provenance.coordinates.longitude}</small>}</div></div>
      {loading && <p className="decision-status" role="status">Loading historical NASA POWER climate data…</p>}
      {error && <div className="decision-callout amber" role="status"><TriangleAlert size={19} /><div><strong>Latest NASA POWER request unavailable</strong><p>{error} {climate.source === 'nasa-power' ? 'The labeled historical cache is in use.' : 'Crop profiles require historical climate data.'}</p><Button variant="ghost" onClick={refresh}>Try again</Button></div></div>}
      <div className="decision-callout amber"><TriangleAlert size={18} /><div><strong>{ranked.length ? 'Provisional ranking' : 'No ranked recommendations: insufficient evidence'}</strong><p>Water compatibility and crop-specific critical rules are unknown. Do not treat an exploratory profile as a planting recommendation. Local agronomic review is required.</p><Link to={`/fields/${field.id}/edit`}>Review field inputs</Link></div></div>
      <div className="recommendation-intro"><div><h2>{ranked.length ? 'Provisional ranked crops' : 'Explore unranked crop profiles'}</h2><p>{filtered.length} profiles · {ranked.length ? 'ranked using comparable reviewed evidence' : 'alphabetical order, not suitability'} · up to four per page</p></div><label className="crop-filter"><SlidersHorizontal size={15} /><span className="sr-only">Filter crop type</span><select aria-label="Filter crop type" value={cropType} onChange={event => { setCropType(event.target.value); setPage(0) }}><option>All crops</option>{types.map(type => <option key={type}>{type}</option>)}</select></label></div>
      <div className="alternative-crops">{visible.map(profile => <article className="alternative-crop card" key={profile.crop.id}><div className="alternative-crop-photo"><img src={profile.crop.image} alt={`${profile.crop.name} crop illustration`} /></div><div className="alternative-crop-content"><div className="alternative-crop-heading"><div><span className="crop-category">{profile.crop.type} · {profile.crop.family}</span><h3>{profile.crop.name}</h3></div><SuitabilityScore value={profile.score} /></div><p className="alternative-description">{ranked.length ? 'Provisional result based on the available reviewed evidence.' : 'Water compatibility: unknown. This profile is not a ranked recommendation.'}</p><div className="crop-traits"><Badge tone="amber">{ranked.length ? 'Provisional' : 'Insufficient evidence'}</Badge><Badge tone="neutral">{profile.confidence} confidence</Badge><Badge tone="neutral">{profile.completeness}% tracked inputs</Badge></div><RecommendationDetails recommendation={profile} /><Link to={`/planner?field=${field.id}&crop=${profile.crop.id}&season=${season}`} className="alternative-crop-link">Explore in a rotation <ArrowRight size={15} /></Link></div></article>)}</div>
      {pageCount > 1 && <div className="button-row"><Button variant="secondary" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous profiles</Button><span>Page {safePage + 1} of {pageCount}</span><Button variant="secondary" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next profiles</Button></div>}
      {visible.length > 0 && <CropComparison key={`${field.id}-${season}-${cropType}-${safePage}`} profiles={visible} season={season} />}
      <div className="decision-callout methodology-note"><Info size={20} /><div><strong>What this means</strong><p>Factor values are exploratory starter comparisons, not validated evidence of suitability. Overall ranking is withheld until required critical evidence and reviewed rules exist. <Link to="/data-sources">Explore our methodology <ArrowRight size={13} /></Link></p></div></div>
    </>}
  </div>
}
