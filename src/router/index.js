import { createRouter, createWebHistory } from 'vue-router'
import HazardLayer from '../views/HazardLayer.vue'

const routes = [
  { path: '/', name: 'hazards', component: HazardLayer},
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
