# AuraRoute AI — Navigatore Cognitivo con AI e Waypoints

Un prototipo di navigatore intelligente che traduce i desideri e le preferenze qualitative del guidatore (es. *"autostrada anche se allungo", "evita passi montani", "strade panoramiche"*) in **punti di passaggio geografici strategici (waypoints)**, calcolando l'itinerario perfetto con servizi cartografici liberi e gratuiti.

---

## 🚀 Architettura del Progetto

1. **Frontend:** HTML5, CSS3 moderno (Glassmorphism, Dark UI, Mobile-First), JavaScript Vanilla.
2. **Mappe e Rendering 3D:** [Leaflet.js](https://leafletjs.com/) con cartografia vettoriale/raster [OpenStreetMap](https://www.openstreetmap.org/) e tile [CartoDB Voyager](https://carto.com/).
3. **Geocoding Gratuito (Indirizzi & Città):** [Photon API by Komoot](https://photon.komoot.io/) (OpenStreetMap-based).
4. **Motore di Calcolo Percorsi (Routing):** [OSRM (Open Source Routing Machine)](https://project-osrm.org/) con supporto per via-points multipli concatenati.
5. **Integrazione Google Maps:** Generazione dinamica di deep-link con parametri `origin`, `destination` e `waypoints` per avviare la guida turn-by-turn su Google Maps.

---

## 📱 Come convertire questo sito in App Mobile (iOS & Android)

### Metodo 1: Con Capacitor (Consigliato per pubblicare su Play Store / App Store)
Capacitor trasforma qualsiasi progetto web in un'app nativa in pochi minuti:

```bash
# 1. Inizializza un progetto npm nella cartella
npm init -y

# 2. Installa Capacitor
npm install @capacitor/core @capacitor/cli

# 3. Inizializza Capacitor
npx cap init AuraRoute com.auraroute.app --web-dir .

# 4. Aggiungi le piattaforme native
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios

# 5. Sincronizza e apri in Android Studio / Xcode
npx cap sync
npx cap open android
```

### Metodo 2: PWA (Progressive Web App)
Aggiungendo un file `manifest.json` e registrando un `service-worker.js`, il sito può essere installato istantaneamente da qualsiasi smartphone senza passare dagli store.
