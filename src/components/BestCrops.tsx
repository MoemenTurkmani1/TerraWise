import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { screenCrops, type ScreenResult } from '../lib/ecologicalScreen'
import { SourceNote, Button } from './ui'
import type { ClimateData, Field } from '../types'
import './BestCrops.css'

interface Props {
  field: Field; climate: ClimateData; loading: boolean; error: string | null; refresh: () => void;
  compact?: boolean; season?: string; onSeasonChange?: (season: string) => void; result?: ScreenResult;
}
export default function BestCrops({ field, climate, loading, error, refresh, compact = false, season, onSeasonChange, result }: Props) {
  const [window, setWindow] = useState('Autumn')
  const id = useId()
  const selected = season ?? window
  const screen = result ?? screenCrops(field, climate, selected, 8)
  const ranked = loading ? [] : screen.ranked
  const shown = compact ? ranked.slice(0, 3) : ranked
  return <section className="best-crops card" aria-labelledby={id} data-field-id={field.id} data-season={selected}>
    <div className="best-crops-heading"><div><span className="eyebrow">CROP RECOMMENDATIONS</span><h2 id={id}>Best Crops for This Field</h2><p>{field.name}</p></div>
      <Link className="btn btn-primary" to={`/recommendations?field=${encodeURIComponent(field.id)}&season=${selected}`}>View Full Ranking</Link></div>
    <div className="best-crops-toolbar"><label>Screening window<select aria-label="Screening window" className="select" value={selected} onChange={event => onSeasonChange ? onSeasonChange(event.target.value) : setWindow(event.target.value)}><option>Autumn</option><option>Spring</option></select></label><SourceNote source={climate.source} year={climate.year} cached={climate.provenance?.cache === 'cached'} partial={climate.provenance?.quality === 'partial'} /></div>
    <p className="ranking-scope"><strong>Provisional pH + Temperature Screen /100</strong> · Low confidence. Only soil pH and historical monthly mean temperatures are evaluated. Overall suitability and planting recommendations remain unknown. {climate.source === 'demo' && <strong>DEMO / SYNTHETIC inputs; computed test results, not NASA observations.</strong>}</p>
    {loading ? <div className="ranking-state" role="status"><h3>Loading climate data…</h3><p>Scores will appear after temperatures for this field pass the source checks.</p></div>
      : screen.unavailable.length > 0 ? <div className="ranking-state" role="status"><h3>Insufficient Data</h3><ul>{screen.unavailable.map(reason => <li key={reason}>{reason}</li>)}</ul>{error && <p>{error}</p>}<div className="button-row"><Link className="btn btn-primary" to={`/fields/${field.id}/edit`}>Add or correct field inputs</Link><Button variant="secondary" onClick={refresh}>Retry climate data</Button></div></div>
      : <>{error && <p role="status">{error} The labeled climate cache is being used.</p>}
        <p className="ranking-count">{ranked.length} passing screens · {screen.excluded.length} outside the screening range · {ranked.length + screen.excluded.length} crops assessed. Descending score; ties use alphabetical order.</p>
        {!ranked.length && <div className="ranking-state" role="status"><h3>No crops pass this limited screen</h3><p>Inputs are available, but every catalog crop is at or outside an absolute pH or temperature boundary. Review the exclusions and discuss local conditions with an agronomist.</p></div>}
        <ol className="crop-ranking-list">{shown.map((item, index) => <li className="ranked-crop alternative-crop" data-crop-id={item.crop.id} data-score={item.score} key={item.crop.id}>
          <div className="ranked-crop-top"><span className="crop-rank">#{index + 1}</span><img src={item.crop.image} alt={item.crop.name} /><div><h3>{item.crop.name}</h3><small>{item.crop.scientificName} · {item.crop.family}</small></div><div className="ecological-score"><strong>{item.score}/100</strong><span>Provisional pH + Temperature Screen /100</span></div></div>
          <dl className="screen-breakdown"><div><dt>Soil pH</dt><dd>{item.phScore}/100</dd></div><div><dt>Historical temperature</dt><dd>{item.temperatureScore}/100</dd></div></dl>
          <p><strong>Why this rank:</strong> The lower of the pH and temperature factors determines the score. Lowest temperature fit: {item.limitingMonth}, {item.limitingTemperature.toFixed(1)}°C. {index === 0 ? 'Highest available screening score.' : shown[index - 1].score === item.score ? `Tied with ${shown[index - 1].crop.name}; alphabetical order.` : `${shown[index - 1].crop.name} scores ${shown[index - 1].score - item.score} points higher.`}</p>
          <p className="ranking-unknown"><strong>Overall suitability unknown.</strong> Water suitability is unknown. This rank is not a planting recommendation.</p>
          <details><summary>Risks, missing data and scientific references</summary><h4>Important risks and limitations</h4><ul>{item.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul><h4>Needed for a complete assessment</h4><p>Validated daily water balance, net irrigation supply, effective rainfall, crop-stage needs, local planting calendar, disease-specific rotation constraints and laboratory nutrient interpretation. {field.soil.nitrogen === null || field.soil.phosphorus === null || field.soil.potassium === null ? 'One or more soil N/P/K tests are missing.' : 'Entered N/P/K values are not evaluated in this screen.'}</p><h4>Scientific source and ranges</h4><a className="text-link" href={item.requirement.source} target="_blank" rel="noreferrer">FAO ECOCROP · {item.requirement.scientificName}</a><p>pH absolute {item.requirement.ph[0]}–{item.requirement.ph[3]}, optimal {item.requirement.ph[1]}–{item.requirement.ph[2]}; temperature absolute {item.requirement.temperature[0]}–{item.requirement.temperature[3]}°C, optimal {item.requirement.temperature[1]}–{item.requirement.temperature[2]}°C.</p><p>Trapezoidal membership, linear transitions, minimum across the selected four monthly temperatures, then minimum of both factors. No weights are added. These species ranges are not field- or cultivar-validated.</p></details>
          <Link className="text-link" to={`/planner?field=${field.id}&crop=${item.crop.id}&season=${selected}`}>Explore in a rotation</Link>
        </li>)}</ol>
        {screen.excluded.length > 0 && <details className="excluded-crops"><summary>Outside the screening range ({screen.excluded.length})</summary><p>Excluded from this two-factor screen; not proven impossible to grow.</p><ul>{screen.excluded.map(item => <li key={item.crop.id}><strong>{item.crop.name}:</strong> {item.reasons.join(' ')}</li>)}</ul></details>}
      </>}
    <p className="ranking-footnote">Spring = March–June; Autumn = September–December. These are exploratory interface windows, not validated planting calendars. Changing the window can change the ranking.</p>
  </section>
}
