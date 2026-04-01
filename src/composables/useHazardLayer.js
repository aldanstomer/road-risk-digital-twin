import { ref, computed, watch, onBeforeUnmount } from 'vue'

// Caribbean bbox
export const CARIB_BBOX = { minLat: 10, maxLat: 23, minLon: -86, maxLon: -59 }

function inCaribbeanBox(lat, lon, bbox = CARIB_BBOX) {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon
}

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

export function useHazardLayer({ islands }) {
  const storms = ref([])
  const error = ref('')
  const selectedIndex = ref(0)

  // playback
  const playbackIndex = ref(0)
  const isPlaying = ref(false)
  let timer = null

  const selectedStorm = computed(() => storms.value[selectedIndex.value] ?? null)
  const points = computed(() => selectedStorm.value?.points ?? [])

  const stats = computed(() => {
    const pts = points.value
    const winds = pts.map(p => p.wind_kt).filter(v => v != null)
    const pressures = pts.map(p => p.pressure_mb).filter(v => v != null)
    const categories = pts.map(p => p.category).filter(v => v != null)

    const maxWind = winds.length ? Math.max(...winds) : null
    const minPressure = pressures.length ? Math.min(...pressures) : null
    const maxCat = categories.length ? Math.max(...categories) : null

    const isMajor = (maxCat != null && maxCat >= 3) || (maxWind != null && maxWind >= 96)
    const enteredCaribbean = pts.some(p => inCaribbeanBox(Number(p.lat), Number(p.lon)))

    return {
      points: pts.length,
      start: pts[0]?.time ?? '—',
      end: pts[pts.length - 1]?.time ?? '—',
      maxWind,
      minPressure,
      maxCat,
      triggers: { isMajor, enteredCaribbean }
    }
  })

  const triggerTimeline = computed(() => {
    const pts = points.value
    if (!pts.length) return []

    let enteredTime = null
    for (const p of pts) {
      if (inCaribbeanBox(Number(p.lat), Number(p.lon))) {
        enteredTime = p.time
        break
      }
    }

    let majorTime = null
    for (const p of pts) {
      const cat = p.category
      const w = p.wind_kt
      if ((cat != null && cat >= 3) || (w != null && w >= 96)) {
        majorTime = p.time
        break
      }
    }

    let peakWindTime = null
    let peakWind = -Infinity
    for (const p of pts) {
      if (p.wind_kt != null && p.wind_kt > peakWind) {
        peakWind = p.wind_kt
        peakWindTime = p.time
      }
    }
    if (!Number.isFinite(peakWind)) {
      peakWind = null
      peakWindTime = null
    }

    let minPressTime = null
    let minPress = Infinity
    for (const p of pts) {
      if (p.pressure_mb != null && p.pressure_mb < minPress) {
        minPress = p.pressure_mb
        minPressTime = p.time
      }
    }
    if (!Number.isFinite(minPress)) {
      minPress = null
      minPressTime = null
    }

    const events = []
    if (enteredTime) events.push({ label: 'Entered Caribbean box', time: enteredTime })
    if (majorTime) events.push({ label: 'Became major (Cat 3+)', time: majorTime })
    if (peakWindTime) events.push({ label: `Peak wind (${peakWind} kt)`, time: peakWindTime })
    if (minPressTime) events.push({ label: `Min pressure (${minPress} mb)`, time: minPressTime })
    return events
  })

  // islands selection
  const selectedIslandKeys = ref(islands.map(i => i.key))

  const closestApproach = computed(() => {
    const pts = points.value
    if (!pts.length) return []

    const islandList = islands.filter(i => selectedIslandKeys.value.includes(i.key))

    return islandList
      .map(island => {
        let bestKm = Infinity
        let bestTime = null
        let bestPoint = null

        for (const p of pts) {
          const d = haversineKm(island.lat, island.lon, Number(p.lat), Number(p.lon))
          if (d < bestKm) {
            bestKm = d
            bestTime = p.time
            bestPoint = p
          }
        }

        return {
          key: island.key,
          name: island.name,
          km: Number.isFinite(bestKm) ? bestKm : null,
          time: bestTime,
          wind_kt: bestPoint?.wind_kt ?? null,
          pressure_mb: bestPoint?.pressure_mb ?? null
        }
      })
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
  })

  // data loading
async function fetchStorms(url = '/hazards/storms.json') {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`)

  const data = await res.json()

  // ✅ allow either: [storm, storm, ...] OR single storm object
  storms.value = Array.isArray(data) ? data : [data]

  selectedIndex.value = 0
  playbackIndex.value = 0
}

  // playback controls
  function stopPlayback() {
    isPlaying.value = false
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function startPlayback() {
    const storm = selectedStorm.value
    if (!storm?.points?.length) return
    isPlaying.value = true
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      const max = storm.points.length - 1
      playbackIndex.value = playbackIndex.value + 1 > max ? 0 : playbackIndex.value + 1
    }, 700)
  }

  function setStormIndex(idx) {
    stopPlayback()
    selectedIndex.value = idx
    playbackIndex.value = 0
  }

  function setPlaybackIndex(idx) {
    stopPlayback()
    playbackIndex.value = idx
  }

  function toggleIsland(key) {
    const set = new Set(selectedIslandKeys.value)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    selectedIslandKeys.value = Array.from(set)
  }

  watch(selectedIndex, () => {
    // reset playback whenever storm changes
    stopPlayback()
    playbackIndex.value = 0
  })

  onBeforeUnmount(() => stopPlayback())

  return {
    storms,
    error,
    selectedIndex,
    selectedStorm,
    stats,
    triggerTimeline,
    closestApproach,
    islands,
    selectedIslandKeys,

    playbackIndex,
    isPlaying,
    fetchStorms,
    startPlayback,
    stopPlayback,
    setStormIndex,
    setPlaybackIndex,
    toggleIsland
  }
}