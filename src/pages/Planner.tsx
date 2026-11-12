import { canExploreClimate } from '../lib/demoEvidence';
import { useDemo } from '../context/DemoContext';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, Check, CircleCheck, Download, Droplets, Info, Leaf, RefreshCw, Save, Sprout, TriangleAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useClimate } from '../hooks/useClimate';
import { needsLegacyReview } from '../services/repository';
import { assessEligibility, assessCrops, buildRotation, buildRotationAlternatives } from '../lib/recommendations';
import { historySerial, sortedHistory } from '../lib/history';
import { crops } from '../data/crops';
import { Badge, Button, EmptyState, PageHeading, SourceNote } from '../components/ui';
import type { Field, RotationStep } from '../types';
import './Decisions.css';

export default function PlannerPage() {
  const demo = useDemo();
  const { fields, selectedFieldId, setSelectedFieldId, plans, savePlan } = useApp();
  const [params, setParams] = useSearchParams();
  const activeFields = fields.filter(item => !item.archived && !needsLegacyReview(item));
  const field = activeFields.find(item => item.id === params.get('field')) ?? activeFields.find(item => item.id === selectedFieldId) ?? activeFields[0];
  const { climate, loading, error, refresh } = useClimate(field);
  const [draft, setDraft] = useState<{ fieldId: string; queryCrop: string | null; querySeason: string | null; steps: RotationStep[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [selectedAlternative, setSelectedAlternative] = useState<string | null>(null);
  const proposed = useMemo(() => {
    if (!field) return [];
    const initial = generateRotation(field);
    const preferredCrop = params.get('crop');
    if (!preferredCrop) return initial;
    return recalculate(field, initial, 0, preferredCrop);
  // Query values intentionally identify the selected candidate and field.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, climate, params]);
  const rawSteps = field ? (draft?.fieldId === field.id && draft.queryCrop === params.get('crop') && draft.querySeason === params.get('season') ? draft.steps : params.get('crop') ? proposed : plans[field.id] ?? proposed) : [];
  const steps = useMemo(() => {
    if (!field || !canExploreClimate(field, climate)) return [];
    let previousWindow = Math.max(-1, ...field.previousCrops.map(historySerial));
    const valid = rawSteps.length > 0 && rawSteps.length <= 8 && rawSteps.every(step => {
      const window = historySerial(step);
      const chronological = Number.isInteger(step.year) && step.year >= 1900 && step.year <= 2205 && (step.season === 'Spring' || step.season === 'Autumn') && window > previousWindow;
      previousWindow = window;
      return chronological;
    });
    // Saved plans retain crop choices, not trusted copies of scores or sources.
    // Rebuilding from the current catalog also tolerates old browser snapshots.
    return valid ? recalculate(field, rawSteps, Infinity, '') : proposed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, climate, rawSteps, proposed]);

  function generateRotation(selectedField: Field): RotationStep[] {
    const requestedSeason = params.get('season');
    const currentYear = new Date().getFullYear();
    if (requestedSeason !== 'Spring' && requestedSeason !== 'Autumn') return buildRotation(selectedField, climate, 4, 'Autumn', currentYear);
    const latestHistory = sortedHistory(selectedField.previousCrops)[0];
    let startYear = Math.max(currentYear, latestHistory?.year ?? currentYear);
    if (latestHistory && historySerial({ year: startYear, season: requestedSeason }) <= historySerial(latestHistory)) startYear += 1;
    return buildRotation(selectedField, climate, 4, requestedSeason, startYear);
  }

  function recalculate(selectedField: Field, current: RotationStep[], changedIndex: number, cropId: string): RotationStep[] {
    let rolling: Field = { ...selectedField, previousCrops: [...selectedField.previousCrops] };
    return current.map((step, index) => {
      const ranked = assessCrops(rolling, climate, step.season);
      const previousEntry = sortedHistory(rolling.previousCrops)[0];
      const previousCrop = ranked.find(item => item.crop.id === previousEntry?.cropId)?.crop;
      const nextCompatible = ranked.find(item => item.crop.seasons.includes(step.season) && item.crop.family !== previousCrop?.family) ?? ranked[0];
      const desired = index < changedIndex ? step.recommendation.crop.id : index === changedIndex ? cropId : nextCompatible?.crop.id;
      const recommendation = ranked.find(item => item.crop.id === desired) ?? nextCompatible;
      if (!recommendation) return step;
      rolling = { ...rolling, previousCrops: [...rolling.previousCrops, { cropId: recommendation.crop.id, season: step.season, year: step.year }] };
      return { ...step, recommendation };
    });
  }
  function changeCrop(index: number, cropId: string) {
    if (!field) return;
    setDraft({ fieldId: field.id, queryCrop: params.get('crop'), querySeason: params.get('season'), steps: recalculate(field, steps, index, cropId) });
    setSaved(false);
    setSelectedAlternative(null);
    setAnnouncement('Crop updated. Later exploratory choices were recalculated from the revised crop history; suitability remains unknown.');
  }
  function regenerate() {
    if (!field) return;
    setDraft({ fieldId: field.id, queryCrop: params.get('crop'), querySeason: params.get('season'), steps: generateRotation(field) });
    setSaved(false);
    setSelectedAlternative(null);
    setAnnouncement('An unranked exploratory sequence was generated. Water and critical crop constraints remain unknown.');
  }
  async function persistPlan() {
    if (!field || saving) return;
    setSaving(true);
    try {
      await savePlan(field.id, steps);
      setDraft({ fieldId: field.id, queryCrop: null, querySeason: null, steps });
      setParams({ field: field.id });
      setSaved(true);
      setAnnouncement('Rotation saved to your current workspace.');
    } catch (error) {
      setSaved(false);
      setAnnouncement(error instanceof Error ? error.message : 'Could not save the rotation. Please try again.');
    } finally { setSaving(false); }
  }
  function downloadPlan() {
    if (!field) return;
    const body = JSON.stringify({ application: 'AgriLumina', dataClassification: demo.active ? 'demo-synthetic' : 'farmer-entered', climateSource: climate.source, climateFixture: climate.fixture, field: field.name, generatedAt: new Date().toISOString(), limitation: 'Unranked exploratory planning; water and critical constraints are unknown. Not a planting prescription.', climateYear: climate.year, steps }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `agrilumina-${demo.active ? 'DEMO-SYNTHETIC-' : ''}${field.id}-rotation.json`; link.click(); URL.revokeObjectURL(url);
  }
  const families = new Set(steps.map(step => step.recommendation.crop.family)).size;
  const legumes = steps.filter(step => step.recommendation.crop.fixesNitrogen).length;
  const lowWater = steps.filter(step => step.recommendation.crop.waterNeed === 'low').length;
  const planSource = steps[0]?.recommendation.dataSource ?? climate.source;
  const alternatives = field && steps[0] ? buildRotationAlternatives(field, climate, steps.length, steps[0].season, steps[0].year) : [];
  const incompatible = rawSteps.filter(step => { const crop = crops.find(candidate => candidate.id === step.recommendation.crop.id); return !crop || !assessEligibility(crop, step.season).supported; });
  const requestedCrop = crops.find(crop => crop.id === params.get('crop'));
  const requestedUnavailable = requestedCrop && steps[0] && !assessEligibility(requestedCrop, steps[0].season).supported;
  function chooseAlternative(id: string) {
    if (!field) return;
    const option = alternatives.find(candidate => candidate.id === id);
    if (!option) return;
    setDraft({ fieldId: field.id, queryCrop: params.get('crop'), querySeason: params.get('season'), steps: option.steps });
    setSelectedAlternative(id);
    setSaved(false);
    setAnnouncement(`${option.title} selected. Review and edit each season before saving.`);
  }

  return <div className="decisions-page planner-page"><PageHeading eyebrow="THINK BEYOND THE NEXT HARVEST" title="Rotation planner" description="Give every season a purpose. Build a thoughtful plan for healthier land."><Button variant="secondary" disabled={!field || !steps.length} onClick={downloadPlan}><Download size={16} />Export plan</Button></PageHeading>
    {!field ? <EmptyState icon={Sprout} title={fields.length ? 'No active fields available' : 'A great rotation begins with a field'} description={fields.length ? 'Restore an archived field or add a new field to plan its next seasons.' : 'Add your field information and crop history to start a multi-season plan.'}><Link to={fields.length ? '/fields' : '/fields/new'} className="btn btn-primary">{fields.length ? 'Manage fields' : 'Add a field'} <ArrowRight size={16} /></Link></EmptyState> : <>
      <div className="decision-toolbar card"><div className="decision-select"><label htmlFor="planner-field">Plan for your field</label><select id="planner-field" value={field.id} onChange={event => { setSelectedFieldId(event.target.value); setParams({ field: event.target.value }); setSaved(false); setSelectedAlternative(null); setAnnouncement(''); }}>{activeFields.map(item => <option value={item.id} key={item.id}>{item.name} · {item.area} ha</option>)}</select></div><div className="planner-window"><span>Planning horizon</span><strong>{steps.length} planting windows · {steps[0]?.year}–{steps.at(-1)?.year}</strong></div><div className="decision-toolbar-source"><SourceNote source={planSource} year={climate.year} cached={climate.provenance?.cache === 'cached'} partial={climate.provenance?.quality === 'partial'} />{climate.provenance && <small>Retrieved {new Date(climate.provenance.retrievedAt).toLocaleString()} · {climate.provenance.period.start}–{climate.provenance.period.end} · {climate.provenance.quality} · {climate.provenance.coordinates.latitude}, {climate.provenance.coordinates.longitude}</small>}</div></div>
      {loading && <p role="status" className="decision-status">Loading NASA POWER data. Plans will appear when validated climate data is available.</p>}
      {error && <div role="status" className="decision-callout amber"><TriangleAlert size={18} /><div><strong>{climate.source === 'nasa-power' ? 'Using historical cached climate' : 'Climate data unavailable'}</strong><p>{error}</p><Button variant="ghost" onClick={refresh} disabled={loading}>Try again</Button></div></div>}
      {canExploreClimate(field, climate) && <>{(incompatible.length > 0 || requestedUnavailable) && <div className="decision-callout amber" role="status"><TriangleAlert size={18} /><div><strong>Some saved choices are unavailable in this interface</strong><p>{incompatible.map(step => `${step.recommendation.crop.name} (${step.season} ${step.year})`).join(', ')}{requestedUnavailable ? ` ${requestedCrop.name} cannot be shown for the ${steps[0].season} interface window.` : ''} The preview uses an available substitute; review it before saving.</p></div></div>}
      <div className="decision-callout amber"><TriangleAlert size={18} /><div><strong>Exploratory sequences, not ranked recommendations</strong><p>Water compatibility and critical crop constraints are unknown. Starting crops are chosen alphabetically and family changes are illustrative. Confirm each choice with an agronomist.</p></div></div><div className="planner-summary"><div><Badge tone="green"><Leaf size={13} /> YOUR LONGER VIEW</Badge><h2>Better together, season after season.</h2><p>An alphabetical exploration that tries different crop families. Choices are not ranked or verified for your land; adjust them and consult an agronomist.</p></div><Button variant="secondary" onClick={regenerate}><RefreshCw size={16} />Generate plan</Button></div>
      {alternatives.length > 0 && <section className="rotation-alternatives" aria-labelledby="alternatives-heading"><div className="section-heading"><div><h2 id="alternatives-heading">Explore alternative rotations</h2><p>Distinct alphabetical starting crops and unranked profiles for {field.name}.</p></div></div><div className="rotation-alternative-grid">{alternatives.map(option => <article className={`card rotation-alternative ${selectedAlternative === option.id ? 'selected' : ''}`} key={option.id}><h3>{option.title}</h3><ol>{option.steps.map(step => <li key={`${step.year}-${step.season}`}><span>{step.season} {step.year}</span><strong>{step.recommendation.crop.name}</strong><small>{step.recommendation.crop.family}</small></li>)}</ol><p>{option.explanation}</p><details><summary>Assumptions, trade-offs and risks</summary><ul>{option.tradeoffs.map(item => <li key={item}>{item}</li>)}</ul></details><Button variant="secondary" aria-pressed={selectedAlternative === option.id} onClick={() => chooseAlternative(option.id)}>{selectedAlternative === option.id ? 'Selected' : 'Use this rotation'} <ArrowRight size={14} /></Button></article>)}</div></section>}
      <div className="rotation-timeline">{steps.map((step, index) => <div className="rotation-timeline-item" key={`${step.year}-${step.season}`}><div className="timeline-marker"><span>{String(index + 1).padStart(2, '0')}</span><div /></div><article className="rotation-season card"><div className="rotation-season-date"><span>{step.season}</span><strong>{step.year}</strong><small>{index === 0 ? 'NEXT PLANTING' : `SEASON ${index + 1}`}</small></div><img className="rotation-season-image" src={step.recommendation.crop.image} alt={`${step.recommendation.crop.name} crop`} /><div className="rotation-season-body"><div className="rotation-season-heading"><div><span className="crop-category">{step.recommendation.crop.type} · {step.recommendation.crop.family}</span><h3>{step.recommendation.crop.name}</h3></div><span className="rotation-match">Suitability unknown</span></div><p>{step.recommendation.reasons[0] ?? step.recommendation.crop.description}</p><div className="rotation-season-tags"><span><Droplets size={13} />{step.recommendation.crop.waterNeed} water</span>{step.recommendation.crop.fixesNitrogen && <span><Leaf size={13} />Legume</span>}<span>{step.recommendation.confidence} confidence</span></div>{step.recommendation.warnings.length > 0 && <p className="crop-warning"><TriangleAlert size={14} />{step.recommendation.warnings[0]}</p>}<details className="rotation-explanation"><summary>View seasonal reasoning</summary><ul>{step.recommendation.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>{step.recommendation.warnings.map(warning => <p className="crop-warning" key={warning}>{warning}</p>)}{step.recommendation.missingInputs.length > 0 && <p>Missing: {step.recommendation.missingInputs.join(', ')}</p>}</details></div><div className="rotation-change"><label htmlFor={`crop-${index}`}>Change crop</label><select id={`crop-${index}`} value={step.recommendation.crop.id} onChange={event => changeCrop(index, event.target.value)}>{assessCrops({ ...field, previousCrops: [...field.previousCrops, ...steps.slice(0, index).map(previous => ({ cropId: previous.recommendation.crop.id, season: previous.season, year: previous.year }))] }, climate, step.season).map(option => <option key={option.crop.id} value={option.crop.id}>{option.crop.name}</option>)}</select></div></article>{index < steps.length - 1 && <ArrowDown className="timeline-down" size={16} aria-hidden="true" />}</div>)}</div>
      <div className="planner-indicators"><div className="card planner-indicator"><span className="indicator-icon"><Sprout size={20} /></span><div><strong>{families} crop families</strong><p>Planned diversity across {steps.length} windows</p></div></div><div className="card planner-indicator"><span className="indicator-icon"><Leaf size={20} /></span><div><strong>{legumes} legume window{legumes !== 1 ? 's' : ''}</strong><p>Potential support for nitrogen cycling</p></div></div><div className="card planner-indicator"><span className="indicator-icon"><Droplets size={20} /></span><div><strong>{lowWater} lower-water crop{lowWater !== 1 ? 's' : ''}</strong><p>Based on relative crop water demand</p></div></div></div>
      <div className="plan-save-bar card"><div><CircleCheck size={21} /><div><strong>{saved ? 'Your rotation is saved' : 'Save this exploratory plan'}</strong><p>{saved ? 'Available in your current workspace.' : 'Save your plan to your current workspace and revisit it as conditions change.'}</p></div></div><Button disabled={saving} onClick={() => void persistPlan()}><Save size={16} />{saving ? 'Saving...' : saved ? 'Saved' : 'Save rotation'}{saved && <Check size={16} />}</Button></div><p role="status" className="decision-status">{announcement}</p>
      <div className="decision-callout methodology-note"><Info size={20} /><div><strong>An exploratory plan, not a planting recommendation</strong><p>These are unranked illustrative autumn and spring planting windows, not a sowing or harvest calendar. Nutrient and water indicators describe crop traits; they are not projected soil changes, measured savings, or yield forecasts. Confirm local varieties, timing, irrigation, and pest risks with an agronomist. <Link to={`/recommendations?field=${field.id}`}>Compare crop evidence <ArrowRight size={13} /></Link></p></div></div>
    </>}</>}
  </div>;
}
