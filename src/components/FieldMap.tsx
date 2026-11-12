import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface FieldMapProps {
  latitude: number
  longitude: number
  name?: string
  onLocationChange?: (latitude: number, longitude: number) => void
}

function MapPosition({ latitude, longitude, onLocationChange }: FieldMapProps) {
  const map = useMap()
  useEffect(() => { map.setView([latitude, longitude], map.getZoom()) }, [map, latitude, longitude])
  useMapEvents({ click(event) { onLocationChange?.(Number(event.latlng.lat.toFixed(5)), Number(event.latlng.lng.toFixed(5))) } })
  return null
}

export default function FieldMap({ latitude, longitude, name = 'Field location', onLocationChange }: FieldMapProps) {
  const hasPosition = Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180
  const lat = hasPosition ? latitude : 33.85
  const lon = hasPosition ? longitude : 35.9
  return <div className="field-location-map" aria-label={`OpenStreetMap showing ${name}. Coordinates can also be entered in the form.`}>
    <MapContainer center={[lat, lon]} zoom={11} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapPosition latitude={lat} longitude={lon} onLocationChange={onLocationChange} />
      {hasPosition && <CircleMarker center={[lat, lon]} radius={12} pathOptions={{ color: '#214f3d', fillColor: '#7a9d62', fillOpacity: 0.8, weight: 3 }}><Tooltip>{name}</Tooltip></CircleMarker>}
    </MapContainer>
  </div>
}
