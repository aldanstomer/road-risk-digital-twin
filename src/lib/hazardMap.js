import L from 'leaflet'

export function createHazardMap(mapEl, { center = [13.2, -59.6], zoom = 6 } = {}) {
  const map = L.map(mapEl).setView(center, zoom)
  let simLayer = null
  let islandRiskLayer = null

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)

  // Internal layer refs
  let trackLayer = null
  let pastTrackLayer = null
  let pointsLayer = null
  let currentPointMarker = null
  let coneLayer = null
  let caribBoxLayer = null

function clearIslandRiskMarkers() {
  if (islandRiskLayer) islandRiskLayer.remove()
  islandRiskLayer = null
}

function scoreToTier(score) {
  if (score >= 80) return 'Extreme'
  if (score >= 60) return 'High'
  if (score >= 30) return 'Moderate'
  return 'Low'
}

// We avoid specifying fancy colors; keep it simple and readable.
// (If you want brand colors later, say so and I’ll map them.)
function tierStyle(tier) {
  // Using basic, easily distinguishable fills
  if (tier === 'Extreme') return { fillOpacity: 0.55 }
  if (tier === 'High') return { fillOpacity: 0.45 }
  if (tier === 'Moderate') return { fillOpacity: 0.35 }
  return { fillOpacity: 0.25 }
}

/**
 * Draw island markers based on islandRisk results.
 * islandRiskResults: [{key,name,score,max_wind_kt}, ...]
 * islands: [{key,name,lat,lon}]
 */
function drawIslandRiskMarkers(islandRiskResults, islands) {
  clearIslandRiskMarkers()
  islandRiskLayer = L.layerGroup().addTo(map)

  const islandByKey = new Map((islands ?? []).map(i => [i.key, i]))

  for (const r of islandRiskResults ?? []) {
    const island = islandByKey.get(r.key)
    if (!island) continue

    const tier = scoreToTier(r.score ?? 0)

    // Radius scales with score
    const radius = Math.max(6, Math.min(16, 6 + (r.score ?? 0) / 10))

    const marker = L.circleMarker([island.lat, island.lon], {
      radius,
      weight: 2,
      ...tierStyle(tier)
    }).addTo(islandRiskLayer)

    marker.bindTooltip(
      `
      <div style="font-size:12px; line-height:1.25;">
        <div style="font-weight:600;">${island.name}</div>
        <div>Risk: <b>${r.score ?? '—'}</b> (${tier})</div>
        <div>Max wind: <b>${r.max_wind_kt ?? '—'}</b> kt</div>
      </div>
      `,
      { sticky: true }
    )
  }
}
  function clearStormLayers() {
    if (trackLayer) trackLayer.remove()
    if (pastTrackLayer) pastTrackLayer.remove()
    if (pointsLayer) pointsLayer.remove()
    if (currentPointMarker) currentPointMarker.remove()
    if (coneLayer) coneLayer.remove()

    trackLayer = null
    pastTrackLayer = null
    pointsLayer = null
    currentPointMarker = null
    coneLayer = null
  }

  function drawCaribbeanBox(bbox) {
    if (caribBoxLayer) caribBoxLayer.remove()
    const bounds = [
      [bbox.minLat, bbox.minLon],
      [bbox.maxLat, bbox.maxLon]
    ]
    caribBoxLayer = L.rectangle(bounds, { weight: 1, dashArray: '4 4', fillOpacity: 0 }).addTo(map)
  }

  function drawStormBase(storm, { onPointClick } = {}) {
    if (!storm?.points?.length) return
    clearStormLayers()

    const latlngs = storm.points.map(p => [Number(p.lat), Number(p.lon)])

    trackLayer = L.polyline(latlngs, { weight: 3 }).addTo(map)

    pointsLayer = L.layerGroup().addTo(map)
    storm.points.forEach((p, idx) => {
      const marker = L.circleMarker([Number(p.lat), Number(p.lon)], {
        radius: 4,
        weight: 1,
        fillOpacity: 0.85
      }).addTo(pointsLayer)

      marker.bindTooltip(
        `
        <div style="font-size:12px; line-height:1.25;">
          <div><b>${storm.name}</b> (${storm.season})</div>
          <div><b>t:</b> ${p.time}</div>
          <div><b>Wind:</b> ${p.wind_kt ?? '—'} kt</div>
          <div><b>Pressure:</b> ${p.pressure_mb ?? '—'} mb</div>
          <div><b>Cat:</b> ${p.category ?? '—'}</div>
          <div style="opacity:.75;">Point #${idx + 1}</div>
        </div>
        `,
        { direction: 'top', sticky: true }
      )

      marker.on('click', () => onPointClick?.(idx))
    })

    map.fitBounds(trackLayer.getBounds(), { padding: [30, 30] })
  }

  function drawPlayback(storm, idx) {
    if (!storm?.points?.length) return

    if (pastTrackLayer) pastTrackLayer.remove()
    if (currentPointMarker) currentPointMarker.remove()

    const past = storm.points.slice(0, idx + 1).map(p => [Number(p.lat), Number(p.lon)])
    pastTrackLayer = L.polyline(past, { weight: 5, opacity: 0.75 }).addTo(map)

    const p = storm.points[idx]
    currentPointMarker = L.circleMarker([Number(p.lat), Number(p.lon)], {
      radius: 8,
      weight: 2,
      fillOpacity: 0.95
    }).addTo(map)

    currentPointMarker.bindTooltip(
      `
      <div style="font-size:12px; line-height:1.25;">
        <div><b>Playback:</b> ${storm.name}</div>
        <div>${p.time}</div>
        <div>Wind: ${p.wind_kt ?? '—'} kt</div>
        <div>Pressure: ${p.pressure_mb ?? '—'} mb</div>
      </div>
      `,
      { direction: 'top', sticky: true }
    )
  }

  function drawMockCone(storm, idx) {
    if (!storm?.points?.length) return
    if (coneLayer) coneLayer.remove()
    coneLayer = L.layerGroup().addTo(map)

    const pts = storm.points
    const maxFuture = Math.min(pts.length - 1, idx + 10)

    for (let i = idx; i <= maxFuture; i++) {
      const p = pts[i]
      const lead = i - idx
      const baseKm = 30 + lead * 25
      const wind = p.wind_kt ?? 0
      const scaledKm = baseKm + Math.min(40, wind * 0.2)

      L.circle([Number(p.lat), Number(p.lon)], {
        radius: scaledKm * 1000,
        weight: 1,
        opacity: 0.35,
        fillOpacity: 0.06
      }).addTo(coneLayer)
    }
  }

  function destroy() {
    map.remove()
  }
function clearSimulation() {
  if (simLayer) simLayer.remove()
  simLayer = null
}

function drawWindFieldOverlay(windfield) {
  clearSimulation()
  simLayer = L.layerGroup().addTo(map)

  const cells = windfield?.cells ?? []
  for (const c of cells) {
    // Visual: radius scales with wind
    const r = Math.max(3, Math.min(16, c.wind_kt / 10))

    L.circleMarker([c.lat, c.lon], {
      radius: r,
      weight: 0,
      fillOpacity: 0.35
    })
      .bindTooltip(
        `<div style="font-size:12px;"><b>Wind:</b> ${c.wind_kt.toFixed(0)} kt</div>`,
        { sticky: true }
      )
      .addTo(simLayer)
  }
}
return {
  map,
  clearStormLayers,
  drawCaribbeanBox,
  drawStormBase,
  drawPlayback,
  drawMockCone,

  // simulation
  clearSimulation,
  drawWindFieldOverlay,

  // ✅ impact visuals
  clearIslandRiskMarkers,
  drawIslandRiskMarkers,

  destroy
}
}