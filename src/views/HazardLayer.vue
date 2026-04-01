<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { createHazardMap } from '../lib/hazardMap'
import { useHazardLayer, CARIB_BBOX } from '../composables/useHazardLayer'
import { runTwinEngine } from '../engine/twinEngine'

const mapEl = ref(null)
let hazardMap = null

const simOutput = ref(null)
const simRunning = ref(false)
const simError = ref('')

// islands list
const islands = [
  { key: 'barbados', name: 'Barbados', lat: 13.1939, lon: -59.5432 },
  { key: 'st_lucia', name: 'St Lucia', lat: 13.9094, lon: -60.9789 },
  { key: 'dominica', name: 'Dominica', lat: 15.414999, lon: -61.370976 },
  { key: 'martinique', name: 'Martinique', lat: 14.6415, lon: -61.0242 },
  { key: 'grenada', name: 'Grenada', lat: 12.1165, lon: -61.6790 },
  { key: 'trinidad', name: 'Trinidad', lat: 10.6918, lon: -61.2225 },
  { key: 'jamaica', name: 'Jamaica', lat: 18.1096, lon: -77.2975 }
]

const top3Risks = computed(() => {
  const rows = simOutput.value?.products?.impact?.islandRisk?.results ?? []
  return rows.slice(0, 3)
})

async function runSimulation() {
  const storm = hazard.selectedStorm.value
  if (!storm) return

  simRunning.value = true
  simError.value = ''
  try {
   const out = await runTwinEngine(storm, {
  stepDeg: 0.35,
  minShowWindKt: 25,
  scaleKm: 120,

  // ✅ impact coupling inputs
  islands,
  islandRadiusKm: 80
})
    simOutput.value = out
    hazardMap.drawWindFieldOverlay(out.products.windfield)
    const riskResults = out.products?.impact?.islandRisk?.results ?? []
    hazardMap.drawIslandRiskMarkers(riskResults, islands)
  } catch (e) {
    simError.value = e?.message ?? String(e)
    console.error(e)
  } finally {
    simRunning.value = false
  }
}

function clearSimulation() {
  simOutput.value = null
  simError.value = ''
  hazardMap?.clearSimulation()
  hazardMap?.clearIslandRiskMarkers()
}

// logic in composable
const hazard = useHazardLayer({ islands })

function redrawStorm() {
  const storm = hazard.selectedStorm.value
  if (!storm || !hazardMap) return

  hazardMap.drawStormBase(storm, {
    onPointClick: (idx) => hazard.setPlaybackIndex(idx)
  })
  hazardMap.drawPlayback(storm, hazard.playbackIndex.value)
  hazardMap.drawMockCone(storm, hazard.playbackIndex.value)
}

onMounted(async () => {
  // create map
  hazardMap = createHazardMap(mapEl.value)
  hazardMap.drawCaribbeanBox(CARIB_BBOX)

  try {
    await hazard.fetchStorms('/hazards/beryl_2024.json')
    redrawStorm()
  } catch (e) {
    hazard.error.value = e?.message ?? String(e)
    console.error(e)
  }
})

// redraw when storm changes
watch(() => hazard.selectedIndex.value, () => {
  redrawStorm()
})

// redraw when playback changes
watch(() => hazard.playbackIndex.value, (idx) => {
  const storm = hazard.selectedStorm.value
  if (!storm || !hazardMap) return
  hazardMap.drawPlayback(storm, idx)
  hazardMap.drawMockCone(storm, idx)
})

onBeforeUnmount(() => {
  hazardMap?.destroy()
  hazardMap = null
})
</script>

<template>
  <div style="height: 100vh; width: 100%; position: relative;">
    <!-- Panel -->
    <div
      style="position:absolute; z-index:1000; top:12px; right:12px; background:white; padding:12px; border-radius:10px; box-shadow:0 6px 18px rgba(0,0,0,0.12); width:340px; max-height:calc(100vh - 24px); overflow:auto;"
    >
      <div style="font-weight:700;">Hazard Layer</div>

      <div v-if="hazard.error.value" style="margin-top:8px; color:#b91c1c;">
        {{ hazard.error.value }}
      </div>

      <div v-else style="margin-top:10px;">
        <!-- selector -->
        <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">Storm</div>
        <select
          v-if="hazard.storms.value.length"
          :value="hazard.selectedIndex.value"
          @change="hazard.setStormIndex(Number($event.target.value))"
          style="width:100%; padding:8px; border:1px solid #e5e7eb; border-radius:8px;"
        >
          <option v-for="(s, idx) in hazard.storms.value" :key="s.storm_id" :value="idx">
            {{ s.name }} ({{ s.season }})
          </option>
        </select>

        <!-- details -->
        <div v-if="hazard.selectedStorm.value" style="margin-top:12px; font-size:13px;">
          <div style="font-size:12px; opacity:.8; margin-bottom:6px;">Details</div>
          <div><b>ID:</b> {{ hazard.selectedStorm.value.storm_id }}</div>
          <div><b>Track points:</b> {{ hazard.stats.value.points }}</div>
          <div style="margin-top:8px;">
            <div><b>Start:</b> {{ hazard.stats.value.start }}</div>
            <div><b>End:</b> {{ hazard.stats.value.end }}</div>
          </div>
          <div style="margin-top:8px;">
            <div><b>Max wind:</b> {{ hazard.stats.value.maxWind ?? '—' }} kt</div>
            <div><b>Min pressure:</b> {{ hazard.stats.value.minPressure ?? '—' }} mb</div>
            <div><b>Max cat:</b> {{ hazard.stats.value.maxCat ?? '—' }}</div>
          </div>

          <!-- triggers -->
          <div style="margin-top:12px;">
            <div style="font-size:12px; opacity:.8; margin-bottom:6px;">Triggers</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <span
                :style="{
                  padding:'4px 8px', borderRadius:'999px', fontSize:'12px', border:'1px solid #e5e7eb',
                  background: hazard.stats.value.triggers.isMajor ? '#dcfce7' : '#fee2e2'
                }"
              >
                Major: {{ hazard.stats.value.triggers.isMajor ? 'YES' : 'NO' }}
              </span>
              <span
                :style="{
                  padding:'4px 8px', borderRadius:'999px', fontSize:'12px', border:'1px solid #e5e7eb',
                  background: hazard.stats.value.triggers.enteredCaribbean ? '#dcfce7' : '#fee2e2'
                }"
              >
                Caribbean box: {{ hazard.stats.value.triggers.enteredCaribbean ? 'YES' : 'NO' }}
              </span>
            </div>
          </div>

          <!-- playback -->
          <div style="margin-top:14px;">
            <div style="font-size:12px; opacity:.8; margin-bottom:6px;">Playback</div>
            <input
              type="range"
              :min="0"
              :max="Math.max(0, (hazard.selectedStorm.value.points?.length ?? 1) - 1)"
              :value="hazard.playbackIndex.value"
              @input="hazard.setPlaybackIndex(Number($event.target.value))"
              style="width:100%;"
            />
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button
                @click="hazard.isPlaying.value ? hazard.stopPlayback() : hazard.startPlayback()"
                style="flex:1; padding:8px; border-radius:8px; border:1px solid #e5e7eb; background:#111827; color:white;"
              >
                {{ hazard.isPlaying.value ? 'Pause' : 'Play' }}
              </button>
              <button
                @click="hazard.setPlaybackIndex(0)"
                style="flex:1; padding:8px; border-radius:8px; border:1px solid #e5e7eb; background:white;"
              >
                Reset
              </button>
            </div>
          </div>

          <div
  v-if="top3Risks.length"
  style="margin-top: 10px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 12px;"
>
  <div style="font-size: 12px; opacity: .8; margin-bottom: 6px;">
    Top 3 at risk (from simulation)
  </div>

  <div v-for="(r, idx) in top3Risks" :key="r.key" style="font-size: 12px; margin-bottom: 6px;">
    <b>#{{ idx + 1 }} {{ r.name }}</b>
    — Score: <b>{{ r.score }}</b>/100
    <span style="opacity:.8;">(Max wind: {{ r.max_wind_kt ?? '—' }} kt)</span>
  </div>
</div>
<div style="margin-top: 14px;">
  <div style="font-size: 12px; opacity: .8; margin-bottom: 6px;">Twin Engine</div>

  <button
    @click="runSimulation"
    :disabled="simRunning"
    style="width:100%; padding:8px; border-radius:8px; border:1px solid #e5e7eb; background:#111827; color:white;"
  >
    {{ simRunning ? 'Running…' : 'Run Simulation (Wind Field)' }}
  </button>

  <button
    @click="clearSimulation"
    style="width:100%; margin-top:8px; padding:8px; border-radius:8px; border:1px solid #e5e7eb; background:white;"
  >
    Clear Simulation
  </button>

  <div v-if="simError" style="margin-top:8px; color:#b91c1c; font-size:12px;">
    {{ simError }}
  </div>

  <div v-if="simOutput" style="margin-top:8px; font-size:12px; opacity:.85;">
    <div><b>Cells:</b> {{ simOutput.products.windfield.meta.cellCount }}</div>
    <div><b>Max wind:</b> {{ simOutput.products.windfield.meta.maxWind_kt?.toFixed(0) }} kt</div>
    <div><b>Step:</b> {{ simOutput.products.windfield.meta.stepDeg }}°</div>
  </div>
  <div v-if="simOutput?.products?.impact?.islandRisk" style="margin-top: 10px;">
  <div style="font-size: 12px; opacity: .8; margin-bottom: 6px;">
    Impact Coupling — Island Risk ({{ simOutput.products.impact.islandRisk.radius_km }} km)
  </div>

  <div
    v-for="r in simOutput.products.impact.islandRisk.results"
    :key="r.key"
    style="padding: 8px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px; font-size: 12px;"
  >
    <div style="font-weight: 600;">{{ r.name }}</div>
    <div>Risk score: <b>{{ r.score }}</b> / 100</div>
    <div>Max wind: <b>{{ r.max_wind_kt ?? '—' }}</b> kt</div>
    <div v-if="r.nearest_cell" style="opacity:.8;">
      Closest cell: {{ r.nearest_cell.distance_km }} km away
    </div>
  </div>
</div>
</div>
          <!-- closest approach -->
          <div style="margin-top:14px;">
            <div style="font-size:12px; opacity:.8; margin-bottom:6px;">Closest approach</div>

            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
              <button
                v-for="i in hazard.islands"
                :key="i.key"
                @click="hazard.toggleIsland(i.key)"
                :style="{
                  padding:'6px 8px', borderRadius:'999px', fontSize:'12px', border:'1px solid #e5e7eb',
                  background: hazard.selectedIslandKeys.value.includes(i.key) ? '#eef2ff' : 'white'
                }"
              >
                {{ i.name }}
              </button>
            </div>

            <div v-for="a in hazard.closestApproach.value" :key="a.key"
              style="padding:8px; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:8px; font-size:12px;"
            >
              <div style="font-weight:600;">{{ a.name }}</div>
              <div>Min dist: <b>{{ a.km?.toFixed(0) ?? '—' }} km</b></div>
              <div>Time: {{ a.time ?? '—' }}</div>
              <div style="opacity:.8;">Wind/Pressure: {{ a.wind_kt ?? '—' }} kt / {{ a.pressure_mb ?? '—' }} mb</div>
            </div>
          </div>

          <!-- timeline -->
          <div style="margin-top:14px;">
            <div style="font-size:12px; opacity:.8; margin-bottom:6px;">Event timeline</div>

            <div v-for="(ev, idx) in hazard.triggerTimeline.value" :key="idx"
              style="padding:8px; border:1px solid #e5e7eb; border-radius:10px; margin-bottom:8px; font-size:12px;"
            >
              <div style="font-weight:600;">{{ ev.label }}</div>
              <div style="opacity:.85;">{{ ev.time }}</div>
            </div>

            <div v-if="!hazard.triggerTimeline.value.length" style="font-size:12px; opacity:.75;">
              No events detected.
            </div>
          </div>

          <div style="margin-top:14px; font-size:12px; opacity:.75;">
            Mock uncertainty “cone” is drawn as widening circles ahead of the current playback step.
          </div>
        </div>
      </div>
    </div>

    <!-- Map -->
    <div ref="mapEl" style="height: 100vh; width: 100%;"></div>
  </div>
</template>