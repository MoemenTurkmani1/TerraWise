import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { useDemo } from '../context/DemoContext'
import { demoFarms, DEMO_NOTICE } from '../data/demo'
import type { DemoFarmId } from '../lib/demoSession'
import './DemoControls.css'

export function DemoEntry() {
  const demo = useDemo()
  const [error, setError] = useState('')
  if (!demo.available || demo.active) return null
  return <div className="demo-entry"><button className="btn btn-secondary" onClick={() => { try { demo.start() } catch { setError('Demo Mode needs browser session storage. Enable storage for localhost and try again.') } }}><FlaskConical size={17} />Try Demo Farm</button><small>Three synthetic farms · no account or data entry</small>{error && <p role="alert">{error}</p>}</div>
}
export default function DemoControls() {
  const demo = useDemo(), navigate = useNavigate()
  const [error, setError] = useState('')
  const farm = demoFarms.find(item => item.id === demo.farmId)!
  if (!demo.active) return null
  function action(run: () => void) { try { run(); setError('') } catch (caught) { setError(caught instanceof Error ? caught.message : 'Browser storage is unavailable.') } }
  return <section className="demo-banner" aria-label="Local demo controls">
    <div className="demo-banner-copy"><strong><FlaskConical size={18} />LOCAL DEMO / SYNTHETIC</strong><p>{DEMO_NOTICE}</p><small>{farm.description} Account sync is disabled.</small></div>
    <div className="demo-banner-actions"><label>Demo farm<select className="select" aria-label="Demo farm" value={demo.farmId} onChange={event => action(() => { demo.switchFarm(event.target.value as DemoFarmId); navigate('/') })}>{demoFarms.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="button-row"><button className="btn btn-secondary" onClick={() => action(() => { demo.reset(); navigate('/') })}><RotateCcw size={15} />Reset Demo Data</button><button className="btn btn-ghost" onClick={() => action(demo.exit)}>Exit Demo</button></div></div>
    {demo.revision > 0 && <p role="status" className="demo-reset-status">Demo Data reset. All three synthetic farms have been restored.</p>}{error && <p role="alert">{error}</p>}
  </section>
}
export function DemoAuthNotice() {
  const demo = useDemo()
  const [error, setError] = useState('')
  return <div className="demo-entry"><p>{DEMO_NOTICE}</p><Link className="btn btn-primary" to="/">Explore Demo Farm</Link><button className="btn btn-secondary" onClick={() => { try { demo.exit() } catch { setError('Browser session storage is unavailable. Please enable it to exit Demo Mode.') } }}>Exit Demo</button>{error && <p role="alert">{error}</p>}</div>
}
