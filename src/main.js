import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'leaflet/dist/leaflet.css'

const app = createApp(App).use(router).mount('#app')
