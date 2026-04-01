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
 * Convert wind (kt) to a simple risk score (0-100).
 * You can tune these thresholds later.
 */
function windToRiskScore(windKt) {
  if (windKt == null) return 0
  if (windKt < 34) return 10           // below TS
  if (windKt < 64) return 30           // TS
  if (windKt < 96) return 60           // Cat 1-2 approx
  return 90                            // Cat 3+ approx
}

/**
 * Compute island risk using a windfield grid.
 * For each island, find max wind within radiusKm.
 *
 * Inputs:
 * - windfield: { cells: [{lat, lon, wind_kt}], meta: {...} }
 * - islands: [{ key, name, lat, lon }]
 */
export function computeIslandRisk(windfield, islands, opts = {}) {
  const radiusKm = opts.radiusKm ?? 80

  const cells = windfield?.cells ?? []
  const results = []

  for (const island of islands ?? []) {
    let maxWind = null
    let bestCell = null
    let bestDist = null

    for (const c of cells) {
      const d = haversineKm(island.lat, island.lon, c.lat, c.lon)
      if (d <= radiusKm) {
        if (maxWind == null || c.wind_kt > maxWind) {
          maxWind = c.wind_kt
          bestCell = c
          bestDist = d
        }
      }
    }

    const score = windToRiskScore(maxWind)

    results.push({
      key: island.key,
      name: island.name,
      radius_km: radiusKm,
      max_wind_kt: maxWind != null ? Number(maxWind.toFixed(1)) : null,
      score,
      nearest_cell: bestCell
        ? {
            lat: Number(bestCell.lat.toFixed(3)),
            lon: Number(bestCell.lon.toFixed(3)),
            distance_km: bestDist != null ? Number(bestDist.toFixed(1)) : null
          }
        : null
    })
  }

  // Sort: highest risk first
  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return {
    model: 'islandRiskModel:v1',
    radius_km: radiusKm,
    results
  }
}