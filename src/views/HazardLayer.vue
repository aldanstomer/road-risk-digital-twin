<script setup>
import { ref, onMounted } from 'vue'
import L from 'leaflet'

const mapEl = ref(null)
let map = null

onMounted(() => {
  const barbados = [13.1939, -59.5432]

  map = L.map(mapEl.value).setView(barbados, 12)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '&copy; OpenStreetMap contributors'}).addTo(map)

})
</script>

<template>
    <div class="h-dvh w-full">
    <div ref="mapEl" class="h-full w-full"></div>
  </div>
</template>