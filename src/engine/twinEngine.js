import { generateWindField } from './models/windFieldModel'
import { computeIslandRisk } from './impacts/islandRiskModel'

/**
 * Twin Engine v1
 * Input: hazard object (storm)
 * Output: simulation products (windfield)
 */
export async function runTwinEngine(storm, config = {}) {
  // In future: event triggers, job queue, caching, persistence, etc.
  // For now: run synchronous simulation.

  const startedAt = new Date().toISOString()

  const windfield = generateWindField(storm, {
    paddingDeg: config.paddingDeg ?? 1.5,
    stepDeg: config.stepDeg ?? 0.35,
    minShowWindKt: config.minShowWindKt ?? 25,
    scaleKm: config.scaleKm ?? 120
  })
  const islandRisk = computeIslandRisk(windfield, config.islands ?? [], {
    radiusKm: config.islandRadiusKm ?? 80
  })

  const finishedAt = new Date().toISOString()

    return {
    engine: {
      name: 'CIMH-TwinEngine',
      version: 'v1',
      startedAt,
      finishedAt
    },
    hazard: {
      storm_id: storm.storm_id,
      name: storm.name,
      season: storm.season
    },
    products: {
      windfield,
      impact: {
        islandRisk
      }
    }
  }
}