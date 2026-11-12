import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ClimateData } from '../types'

export default function ClimateChart({ climate, compact = false }: { climate: ClimateData; compact?: boolean }) {
  if (climate.source !== 'nasa-power' || climate.monthly.length !== 12) return <p role="status">Climate data unavailable. Retrieve historical NASA POWER data to view this chart.</p>
  return <>
    <div className="climate-chart-key"><span><i className="rain-key" /> Rainfall (mm/month)</span><span><i className="temp-key" /> Temperature (°C)</span></div>
    <div className="field-climate-chart" style={compact ? { height: 180 } : undefined} role="img" aria-label={`Monthly precipitation and mean temperature for ${climate.year}. NASA POWER historical data. Exact values are available in the table below.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={climate.monthly} margin={{ top: 12, right: 0, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#edf0e9" strokeDasharray="3 3" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#7b8479', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis yAxisId="rain" axisLine={false} tickLine={false} tick={{ fill: '#7b8479', fontSize: 11 }} />
          <YAxis yAxisId="temp" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#7b8479', fontSize: 11 }} unit="°" width={35} />
          <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e0e5db', fontSize: 12 }} />
          <Bar name="Rainfall (mm)" dataKey="rainfall" yAxisId="rain" fill="#d7e4cb" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Line name="Temperature (°C)" dataKey="temperature" yAxisId="temp" type="monotone" stroke="#bc8f56" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <details className="climate-data-table"><summary>View monthly data</summary><div className="table-scroll"><table><caption>Climate data · {climate.year} · NASA POWER historical{climate.provenance?.cache === 'cached' ? ' (cached)' : ''}</caption><thead><tr><th>Month</th><th>Mean °C</th><th>Rainfall mm</th><th>Solar kWh/m²/day</th><th>Humidity %</th></tr></thead><tbody>{climate.monthly.map(month => <tr key={month.month}><th scope="row">{month.month}</th><td>{month.temperature.toFixed(1)}</td><td>{month.rainfall.toFixed(1)}</td><td>{month.solar.toFixed(1)}</td><td>{month.humidity == null ? 'Not available' : month.humidity.toFixed(1)}</td></tr>)}</tbody></table></div></details>
  </>
}
