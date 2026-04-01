function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Compute wind at (lat,lon) from storm track using exponential decay from each track point.
 */
export function computeWindAtPoint(storm, lat, lon, { scaleKm = 120 } = {}) {
  let best = 0
  for (const p of storm.points ?? []) {
    if (p.wind_kt == null) continue
    const d = haversineKm(lat, lon, Number(p.lat), Number(p.lon))
    const w = p.wind_kt * Math.exp(-d / scaleKm)
    if (w > best) best = w
  }
  return best
}

/**
 * Generate a grid of wind values around the storm track.
 * Returns cells: [{lat, lon, wind_kt}]
 */
export function generateWindField(storm, opts = {}) {
  const {
    paddingDeg = 1.5,
    stepDeg = 0.35,
    minShowWindKt = 25,
    scaleKm = 120
  } = opts

  const pts = storm?.points ?? []
  if (!pts.length) return { cells: [], meta: { reason: 'no_points' } }

  const lats = pts.map(p => Number(p.lat))
  const lons = pts.map(p => Number(p.lon))

  const minLat = Math.min(...lats) - paddingDeg
  const maxLat = Math.max(...lats) + paddingDeg
  const minLon = Math.min(...lons) - paddingDeg
  const maxLon = Math.max(...lons) + paddingDeg

  const cells = []
  for (let lat = minLat; lat <= maxLat; lat += stepDeg) {
    for (let lon = minLon; lon <= maxLon; lon += stepDeg) {
      const wind = computeWindAtPoint(storm, lat, lon, { scaleKm })
      if (wind >= minShowWindKt) {
        cells.push({ lat, lon, wind_kt: wind })
      }
    }
  }

  const maxWind = cells.reduce((m, c) => Math.max(m, c.wind_kt), 0)

  return {
    cells,
    meta: {
      model: 'windFieldModel:v1',
      paddingDeg,
      stepDeg,
      minShowWindKt,
      scaleKm,
      cellCount: cells.length,
      maxWind_kt: Number.isFinite(maxWind) ? maxWind : null
    }
  }
}