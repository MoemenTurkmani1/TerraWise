import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Database, Sprout, type LucideIcon } from 'lucide-react'

export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{children && <div className="page-heading-actions">{children}</div>}</div>
}
export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'amber' | 'neutral' | 'blue' }) { return <span className={`badge badge-${tone}`}>{children}</span> }
export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) { return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button> }
export function EmptyState({ icon: Icon = Sprout, title, description, children }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode }) { return <div className="empty-state"><div className="empty-state-icon"><Icon size={28} /></div><h2>{title}</h2><p>{description}</p>{children}</div> }
export function SourceNote({ source, year, cached, partial }: { source: 'demo' | 'nasa-power' | 'unavailable'; year?: number; cached?: boolean; partial?: boolean }) { return <span className={`source-note source-${source}`}><Database size={12} />{source === 'unavailable' ? 'Data unavailable' : source === 'demo' ? 'Legacy simulated data' : `NASA POWER · historical${cached ? ' · cached' : ''}${partial ? ' · partial' : ''}`}{year && source !== 'unavailable' ? ` · ${year}` : ''}</span> }
export function CropIcon({ className = '' }: { className?: string }) { return <span className={`crop-icon ${className}`}><Sprout size={21} /></span> }
