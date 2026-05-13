<script setup>
import { ref, onMounted, watch } from 'vue'
import L from 'leaflet'

const mapEl = ref(null)
const rainfall = ref(0)

// hourly rainfall data from Open-Meteo
const hourlyTimes = ref([])
const hourlyRain = ref([])
const selectedHourIndex = ref(0)

let map = null
let roadsLayer = null
let roadsData = null

let parishesLayer = null
let parishesData = null

function getRoadStress(rain) {
  if (rain >= 150) return 3
  if (rain >= 100) return 2
  if (rain >= 50) return 1
  return 0
}

function getRoadStyle(feature) {
  const stress = getRoadStress(rainfall.value)

  let color = 'green'
  if (stress === 1) color = 'yellow'
  else if (stress === 2) color = 'orange'
  else if (stress === 3) color = 'red'

  return {
    color,
    weight: 4,
    opacity: 0.9
  }
}

function redrawRoads() {
  if (!map || !roadsData) return

  if (roadsLayer) roadsLayer.remove()

  roadsLayer = L.geoJSON(roadsData, {
    filter: (feature) => {
      const type = feature.geometry?.type
      return type === 'LineString' || type === 'MultiLineString'
    },
    style: (feature) => getRoadStyle(feature),
    onEachFeature: (feature, layer) => {
      const name = feature.properties?.name || 'Unnamed road'
      const highway = feature.properties?.highway || 'road'
      const stress = getRoadStress(rainfall.value)

      const stressLabel =
        stress === 3 ? 'High' :
        stress === 2 ? 'Moderate' :
        stress === 1 ? 'Low' :
        'Normal'

      layer.bindPopup(`
        <div>
          <strong>${name}</strong><br/>
          Type: ${highway}<br/>
          Rainfall: ${rainfall.value} mm<br/>
          Stress: ${stressLabel}
        </div>
      `)
    }
  }).addTo(map)
}

async function loadRainfallForecast() {
  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({
      latitude: '13.1645',
      longitude: '-59.5517',
      hourly: 'precipitation',
      timezone: 'auto'
    }).toString()

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status}`)
  }

  const data = await res.json()

  hourlyTimes.value = data.hourly?.time ?? []
  hourlyRain.value = data.hourly?.precipitation ?? []

  // start with the first hour
  selectedHourIndex.value = 0
  rainfall.value = Number(hourlyRain.value[0] ?? 0)
}

function getParishStyle() {
  return {
    color: '#2563eb',
    weight: 2,
    opacity: 0.9,
    fillColor: '#60a5fa',
    fillOpacity: 0.12
  }
}

function redrawParishes() {
  if (!map || !parishesData) return

  if (parishesLayer) parishesLayer.remove()

  parishesLayer = L.geoJSON(parishesData, {
    style: getParishStyle,
    onEachFeature: (feature, layer) => {
      const name =
        feature.properties?.name ||
        feature.properties?.NAME ||
        feature.properties?.Name ||
        feature.properties?.parish ||
        'Unknown parish'

      layer.bindPopup(`
        <div>
          <strong>${name}</strong><br/>
          Area type: Parish boundary
        </div>
      `)
    }
  }).addTo(map)

  // keep parish polygons behind the roads
  parishesLayer.bringToBack()
}

onMounted(async () => {
  const barbados = [13.1939, -59.5432]

  map = L.map(mapEl.value).setView(barbados, 12)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)

  try {
    const parishesRes = await fetch('/data/parishes.geojson')
    parishesData = await parishesRes.json()
    redrawParishes()

    const roadsRes = await fetch('/data/roads.geojson')
    roadsData = await roadsRes.json()

    await loadRainfallForecast()
    redrawRoads()
  } catch (err) {
    console.error(err)
  }
})

watch(selectedHourIndex, () => {
  rainfall.value = Number(hourlyRain.value[selectedHourIndex.value] ?? 0)
  redrawRoads()
})
</script>

<template>
  <div class="h-dvh w-full relative">
    <div class="absolute top-3 right-3 z-[1000] bg-white p-4 rounded-xl shadow-md w-80">
      <h2 class="font-semibold text-lg mb-3">Road Risk Digital Twin</h2>

      <div class="text-sm mb-2">
        Hour:
        <strong>
          {{ hourlyTimes[selectedHourIndex] || 'Loading...' }}
        </strong>
      </div>

      <div class="text-sm mb-3">
        Rainfall: <strong>{{ rainfall }} mm</strong>
      </div>

      <input
        v-if="hourlyRain.length"
        v-model="selectedHourIndex"
        type="range"
        min="0"
        :max="hourlyRain.length - 1"
        step="1"
        class="w-full"
      />

      <div class="mt-4 text-sm">
        <div class="font-medium mb-2">Stress level</div>
        <div><span class="inline-block w-3 h-3 bg-green-500 mr-2"></span>Normal</div>
        <div><span class="inline-block w-3 h-3 bg-yellow-400 mr-2"></span>Low stress</div>
        <div><span class="inline-block w-3 h-3 bg-orange-500 mr-2"></span>Moderate stress</div>
        <div><span class="inline-block w-3 h-3 bg-red-600 mr-2"></span>High stress</div>
      </div>
    </div>

    <div ref="mapEl" class="h-full w-full"></div>
  </div>
</template>