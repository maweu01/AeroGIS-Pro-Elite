/* ════════════════════════════════════════════════════════════════
   AeroGIS Pro v5 — Main Application Script
════════════════════════════════════════════════════════════════ */
'use strict';

const S = {
  map: null, drawControl: null, drawLayer: null,
  aoiLayer: null, flightLinesLayer: null, waypointLayer: null,
  nfzLayer: null, simulatedTrafficLayer: null,
  waypoints: [], flightLines: [],
  currentShape: 'rectangle', currentMod: 'planner',
  currentAssessType: 'realEstate', currentCDType: 'landuse',
  currentBasemap: 'osm', activeOverlays: new Set(),
  demoFlightTimer: null, telemTimer: null,
  telemData: { alt: 0, spd: 0, bat: 100, hdg: 0, sig: 0, dst: 0 },
  telemHistory: { alt: [], bat: [] },
  droneLog: [], aircraftDB: { manned: [], uav: [] },
  sensorDB: [], layersConfig: { basemaps: [], overlays: [] },
  nfzData: [], selectedAircraft: null, selectedSensor: null,
  weatherCache: null, mapCenter: { lat: -1.286389, lng: 36.817223 },
  baseTileLayers: {}
};

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadDatabases().then(() => {
    initAllModules();
    startUTCClock();
    loadDemoLog();
    showToast('AeroGIS Pro v5 ready', 'g');
  });
  document.getElementById('log-date').value = new Date().toISOString().slice(0,10);
  const connSel = document.getElementById('conn-method');
  if (connSel) connSel.addEventListener('change', () => {
    const wOpts = document.getElementById('conn-wifi-opts');
    if (wOpts) wOpts.style.display = ['wifi','mavlink'].includes(connSel.value) ? 'block' : 'none';
  });
});

async function loadDatabases() {
  try {
    const [acR, snR, lyR] = await Promise.all([
      fetch('aircraft_database.json'), fetch('sensor_database.json'), fetch('layers_config.json')
    ]);
    const [ac, sn, ly] = await Promise.all([acR.json(), snR.json(), lyR.json()]);
    S.aircraftDB   = { manned: ac.manned, uav: ac.uav };
    S.sensorDB     = sn.sensors;
    S.layersConfig = ly;
    S.nfzData      = ly.nfz?.east_africa || [];
  } catch(e) { console.warn('DB load failed, using fallback', e); useBuiltinData(); }
}

function useBuiltinData() {
  S.aircraftDB = {
    manned: [
      { id:'c208', name:'Cessna 208 Grand Caravan', manufacturer:'Cessna', type:'Single Turboprop', category:'Heavy Survey', service_ceiling_ft:25000, cruise_speed_kts:185, endurance_hrs:8, payload_kg:680, coverage_km2_per_sortie:800, sensors:['Leica ADS100'], image:'✈' },
      { id:'king_air', name:'Beechcraft King Air B200', manufacturer:'Beechcraft', type:'Twin Turboprop', category:'Heavy Survey', service_ceiling_ft:35000, cruise_speed_kts:289, endurance_hrs:7.5, payload_kg:900, coverage_km2_per_sortie:1800, sensors:['Leica ADS100'], image:'✈' },
      { id:'da42', name:'Diamond DA42 MPP', manufacturer:'Diamond', type:'Twin Diesel', category:'Medium Survey', service_ceiling_ft:18000, cruise_speed_kts:170, endurance_hrs:9, payload_kg:300, coverage_km2_per_sortie:600, sensors:['EO/IR','SAR'], image:'✈' }
    ],
    uav: [
      { id:'dji_m350', name:'DJI Matrice 350 RTK', manufacturer:'DJI', type:'Heavy Multirotor', category:'Enterprise Payload', max_altitude_m:7000, max_speed_ms:23, endurance_min:55, coverage_ha_per_flight:320, rtk:true, sensors:['Zenmuse P1','Zenmuse L2'], gsd_at_100m:'1.5 cm/px', recommended_altitude_m:150, payload_g:2700, image:'🚁', notes:'Industry standard enterprise platform.' },
      { id:'dji_p4rtk', name:'DJI Phantom 4 RTK', manufacturer:'DJI', type:'Multirotor', category:'Professional Mapping', max_altitude_m:6000, max_speed_ms:16, endurance_min:30, coverage_ha_per_flight:100, rtk:true, sensors:['20MP RGB'], gsd_at_100m:'2.74 cm/px', recommended_altitude_m:100, payload_g:0, image:'🚁', notes:'Entry level RTK mapping drone.' },
      { id:'wingtra', name:'WingtraOne GEN II', manufacturer:'Wingtra AG', type:'VTOL Fixed-Wing', category:'Fixed-Wing VTOL', max_altitude_m:4000, max_speed_ms:16, endurance_min:59, coverage_ha_per_flight:1200, rtk:true, sensors:['Sony RX1R II 42MP'], gsd_at_100m:'1.1 cm/px', recommended_altitude_m:200, payload_g:800, image:'✈', notes:'Best-in-class GSD among VTOL platforms.' },
      { id:'ebee_x', name:'senseFly eBee X', manufacturer:'senseFly', type:'Fixed-Wing', category:'Fixed-Wing', max_altitude_m:4875, max_speed_ms:25, endurance_min:90, coverage_ha_per_flight:2000, rtk:false, sensors:['S.O.D.A. RGB','Sequoia+'], gsd_at_100m:'1.9 cm/px', recommended_altitude_m:120, payload_g:300, image:'✈', notes:'Industry-leading coverage. 90min endurance.' }
    ]
  };
  S.sensorDB = [
    { id:'dji_p1', name:'DJI Zenmuse P1', type:'RGB Frame Camera', category:'Photogrammetry', manufacturer:'DJI', resolution_mp:45, pixel_size_um:4.4, focal_lengths_mm:[35], default_focal_mm:35, gsd_at_120m:'1.69 cm/px', weight_g:833, spectral:'RGB', sensor_size_mm:'35.9 × 24.0' },
    { id:'dji_l2', name:'DJI Zenmuse L2', type:'LiDAR + RGB', category:'LiDAR', manufacturer:'DJI', pixel_size_um:null, default_focal_mm:24, gsd_at_120m:'LiDAR 4cm', weight_g:905, spectral:'RGB+LiDAR' },
    { id:'micasense', name:'MicaSense Altum-PT', type:'Multispectral', category:'Multispectral', manufacturer:'AgEagle', resolution_mp:12, pixel_size_um:3.45, default_focal_mm:8, gsd_at_120m:'2.0 cm/px', weight_g:410, spectral:'5-band MS+LWIR', sensor_size_mm:'7.0 × 5.3' }
  ];
  S.layersConfig = {
    basemaps: [
      { id:'osm', name:'OpenStreetMap', url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution:'© OpenStreetMap', maxZoom:19, icon:'🗺', default:true },
      { id:'esri_satellite', name:'Esri Satellite', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution:'© Esri', maxZoom:19, icon:'🛰' },
      { id:'carto_dark', name:'CartoDB Dark', url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution:'© CartoDB', maxZoom:19, icon:'🌑' },
      { id:'esri_topo', name:'Esri Topo', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attribution:'© Esri', maxZoom:18, icon:'🏔' }
    ],
    overlays: [
      { id:'airports', name:'Airports', source:'OurAirports', type:'geojson', category:'Airspace', icon:'✈', color:'#f87171' },
      { id:'admin_bounds', name:'Administrative Boundaries', source:'Natural Earth', type:'geojson', category:'Administrative', icon:'🗂', color:'#c084fc' },
      { id:'esri_hillshade', name:'Esri Hillshade', source:'Esri', type:'tile', url:'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', category:'Terrain', icon:'⛰', color:'#8B4513' },
      { id:'esa_worldcover', name:'ESA WorldCover (10m)', source:'ESA Copernicus', type:'tile', url:'https://services.terrascope.be/wmts/v2?layer=WORLDCOVER_2021_MAP&style=default&tilematrixset=EPSG:3857&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}', category:'Land Cover', icon:'🌍', color:'#27AE60' }
    ]
  };
  S.nfzData = [
    { id:'jkia', name:'JKIA — Jomo Kenyatta International', lat:-1.3192, lng:36.9275, radius_km:8, type:'Class C Controlled Airspace', icao:'HKJK', authority:'KCAA', max_uav_alt_m:0, notes:'Full CTR. UAV operations prohibited within 8 km without ATC clearance.' },
    { id:'wilson', name:'Wilson Airport, Nairobi', lat:-1.3214, lng:36.8147, radius_km:5, type:'Class D Airspace', icao:'HKNW', authority:'KCAA', max_uav_alt_m:0, notes:'General aviation hub. High traffic density.' },
    { id:'nairobi_np', name:'Nairobi National Park', lat:-1.3833, lng:36.8667, radius_km:4, type:'Protected Wildlife Area', icao:null, authority:'KWS', max_uav_alt_m:0, notes:'Wildlife and conservation zone. UAV prohibited without KWS permit.' }
  ];
}

/* ── MAP INIT ─────────────────────────────────────────────────── */
function initMap() {
  S.map = L.map('map', { center:[S.mapCenter.lat, S.mapCenter.lng], zoom:12, zoomControl:true, attributionControl:false });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19 });
  osm.addTo(S.map);
  S.baseTileLayers['osm'] = osm;
  S.drawLayer           = L.featureGroup().addTo(S.map);
  S.aoiLayer            = L.featureGroup().addTo(S.map);
  S.flightLinesLayer    = L.featureGroup().addTo(S.map);
  S.waypointLayer       = L.featureGroup().addTo(S.map);
  S.nfzLayer            = L.featureGroup().addTo(S.map);
  S.simulatedTrafficLayer = L.featureGroup().addTo(S.map);
  S.drawControl = new L.Control.Draw({
    draw:{ polygon:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 }, showArea:true }, rectangle:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 } }, circle:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 } }, polyline:{ shapeOptions:{ color:'#38bdf8' } }, marker:false, circlemarker:false },
    edit:{ featureGroup: S.drawLayer }
  });
  S.map.addControl(S.drawControl);
  S.map.on(L.Draw.Event.CREATED, onShapeDrawn);
  S.map.on('mousemove', e => { document.getElementById('sb-lat').textContent = e.latlng.lat.toFixed(6); document.getElementById('sb-lng').textContent = e.latlng.lng.toFixed(6); });
  S.map.on('zoomend', () => { document.getElementById('sb-zoom').textContent = S.map.getZoom(); });
  S.map.on('moveend', () => { const c = S.map.getCenter(); S.mapCenter = { lat: c.lat, lng: c.lng }; });
}

function onShapeDrawn(e) {
  const lyr = e.layer;
  S.aoiLayer.clearLayers();
  S.aoiLayer.addLayer(lyr);
  let area = 0;
  if (lyr.getLatLngs) {
    const lls = Array.isArray(lyr.getLatLngs()[0]) ? lyr.getLatLngs()[0] : lyr.getLatLngs();
    area = calcPolygonArea(lls);
  } else if (lyr.getRadius) {
    const r = lyr.getRadius(); area = Math.PI * r * r / 10000;
  }
  document.getElementById('sa-area').value = area.toFixed(2);
  document.getElementById('sb-area').textContent = area.toFixed(1) + ' ha';
  setStatus('AOI drawn — ' + area.toFixed(2) + ' ha', 'g');
  calcFlight();
}

function calcPolygonArea(latlngs) {
  if (!latlngs || latlngs.length < 3) return 0;
  let area = 0; const n = latlngs.length;
  for (let i = 0; i < n; i++) {
    const j = (i+1)%n;
    const lat1 = latlngs[i].lat * Math.PI/180, lat2 = latlngs[j].lat * Math.PI/180;
    const dlng = (latlngs[j].lng - latlngs[i].lng) * Math.PI/180;
    area += dlng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(area * 6371000 * 6371000 / 2) / 10000;
}

/* ── MODULE SWITCHING ─────────────────────────────────────────── */
const MOD_MAP = {
  planner:    'sp-planner',    aircraft: 'sp-aircraft',
  layers:     'sp-layers',     weather:  'sp-weather',
  nfz:        'sp-nfz',        assessment:'sp-assessment',
  change:     'sp-change',     log:      'sp-log',
  tracker:    'sp-tracker',    connect:  'sp-connect',
  export:     'sp-export'
};
function switchMod(mod) {
  S.currentMod = mod;
  document.querySelectorAll('.tn').forEach(t => t.classList.toggle('on', t.dataset.mod === mod));
  document.querySelectorAll('.sb-panel').forEach(p => p.classList.remove('on'));
  const pid = MOD_MAP[mod]; if (pid) { const el = document.getElementById(pid); if(el) el.classList.add('on'); }
  setStatus('Module: ' + mod);
}

function initAllModules() {
  initBasemaps(); renderLayerList(); renderAircraftList();
  populateAircraftDropdown(); populateSensorDropdown();
  renderNFZList(); renderNFZBuffers();
  initTelemetry(); liveCalcGSD(); liveCalcCoverage();
}

/* ── SURVEY PLANNER ───────────────────────────────────────────── */
function selectShape(shape) {
  S.currentShape = shape;
  document.querySelectorAll('.shbtn').forEach(b => b.classList.toggle('on', b.dataset.shape === shape));
  try { S.map.removeControl(S.drawControl); } catch(e) {}
  const shapeMap = {
    rectangle: { rectangle:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 } }, polygon:false, circle:false, polyline:false, marker:false, circlemarker:false },
    polygon:   { polygon:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 }, showArea:true }, rectangle:false, circle:false, polyline:false, marker:false, circlemarker:false },
    circle:    { circle:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 } }, polygon:false, rectangle:false, polyline:false, marker:false, circlemarker:false },
    corridor:  { polyline:{ shapeOptions:{ color:'#38bdf8', weight:2 } }, polygon:false, rectangle:false, circle:false, marker:false, circlemarker:false },
    triangle:  { polygon:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 }, showArea:true }, rectangle:false, circle:false, polyline:false, marker:false, circlemarker:false },
    draw:      { polygon:{ shapeOptions:{ color:'#38bdf8', fillOpacity:0.1 }, showArea:true }, rectangle:false, circle:false, polyline:false, marker:false, circlemarker:false }
  };
  S.drawControl = new L.Control.Draw({ draw: shapeMap[shape] || shapeMap.polygon, edit:{ featureGroup:S.drawLayer } });
  S.map.addControl(S.drawControl);
  setStatus('Shape: ' + shape + ' — use the draw toolbar (top-left of map)');
}

function calcFlight() {
  const alt   = parseFloat(document.getElementById('fp-alt').value)   || 120;
  const sovl  = parseFloat(document.getElementById('fp-sovl').value)  / 100 || 0.7;
  const fovl  = parseFloat(document.getElementById('fp-fovl').value)  / 100 || 0.8;
  const focal = parseFloat(document.getElementById('fp-focal').value) || 35;
  const sensw = parseFloat(document.getElementById('fp-sensw').value) || 35.9;
  const speed = parseFloat(document.getElementById('fp-speed').value) || 10;
  const pxSz  = (S.selectedSensor && S.selectedSensor.pixel_size_um) || 4.4;
  const gsd   = (alt * pxSz) / (focal * 10);
  const fw    = (sensw / focal) * alt;
  const fh    = fw * (23.9/35.9);
  const stripSpacing    = fw * (1 - sovl);
  const waypointSpacing = fh * (1 - fovl);
  const aoiArea  = parseFloat(document.getElementById('sa-area').value) || 50;
  const areaM2   = aoiArea * 10000;
  const widthM   = Math.sqrt(areaM2);
  const heightM  = areaM2 / widthM;
  const numStrips   = Math.max(1, Math.ceil(heightM / stripSpacing));
  const wpPerStrip  = Math.max(1, Math.ceil(widthM / waypointSpacing));
  const totalImgs   = numStrips * wpPerStrip;
  const pathKm      = (numStrips * widthM + (numStrips-1) * stripSpacing) / 1000;
  const timeMins    = (pathKm * 1000 / speed) / 60 + numStrips * 0.1;
  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  set('rp-wps',   numStrips * 2);
  set('rp-lines', numStrips);
  set('rp-area',  aoiArea.toFixed(1));
  set('rp-gsd',   gsd.toFixed(1));
  set('rp-swath', fw.toFixed(0));
  set('rp-imgs',  totalImgs);
  set('rp-time',  timeMins.toFixed(0)+' min');
  set('sb-wps',   numStrips * 2);
  return { alt, gsd, fw, fh, stripSpacing, numStrips, wpPerStrip, totalImgs, pathKm, timeMins, aoiArea };
}

function generateFlightPlan() {
  const r = calcFlight();
  S.flightLinesLayer.clearLayers(); S.waypointLayer.clearLayers(); S.waypoints = [];
  let bounds = S.aoiLayer.getLayers().length > 0 ? S.aoiLayer.getBounds() : S.map.getBounds();
  if (S.aoiLayer.getLayers().length === 0) showAlert('No AOI drawn — using current map view. Draw an AOI first for accurate results.', 'a');
  const N = bounds.getNorth(), S2 = bounds.getSouth(), E = bounds.getEast(), W = bounds.getWest();
  const centerLat  = (N+S2)/2;
  const mPerDegLat = 111000;
  const mPerDegLng = 111000 * Math.cos(centerLat * Math.PI/180);
  const heightM    = (N-S2)*mPerDegLat;
  const stripDeg   = r.stripSpacing / mPerDegLat;
  const numStrips  = Math.max(1, Math.ceil(heightM / r.stripSpacing));
  let goEast = true;
  for (let i = 0; i < numStrips; i++) {
    const lat = S2 + (i + 0.5) * stripDeg;
    if (lat > N) break;
    const sLng = goEast ? W : E, eLng = goEast ? E : W;
    S.waypoints.push({ lat, lng: sLng }, { lat, lng: eLng });
    L.polyline([[lat, sLng],[lat, eLng]], { color:'#34d399', weight:1.5, opacity:0.75 }).addTo(S.flightLinesLayer);
    goEast = !goEast;
  }
  if (S.waypoints.length > 1) L.polyline(S.waypoints.map(w=>[w.lat,w.lng]), { color:'#fbbf24', weight:1, opacity:0.4, dashArray:'5 8' }).addTo(S.flightLinesLayer);
  S.waypoints.forEach((wp,i) => {
    const isS = i===0, isE = i===S.waypoints.length-1;
    L.circleMarker([wp.lat,wp.lng],{ radius:isS||isE?7:4, color:isS?'#38bdf8':isE?'#f87171':'#fbbf24', fillColor:isS?'#38bdf8':isE?'#f87171':'#fbbf24', fillOpacity:0.85, weight:2 })
    .bindPopup(`<div class="pop"><div class="pop-title">WP${String(i+1).padStart(3,'0')}</div><div class="pop-type">Survey Waypoint</div>
      <div class="pop-row"><span class="pop-lbl">Lat</span><span class="pop-val">${wp.lat.toFixed(7)}</span></div>
      <div class="pop-row"><span class="pop-lbl">Lng</span><span class="pop-val">${wp.lng.toFixed(7)}</span></div>
      <div class="pop-row"><span class="pop-lbl">Alt</span><span class="pop-val">${document.getElementById('fp-alt').value}m AGL</span></div></div>`)
    .addTo(S.waypointLayer);
  });
  const ms = document.getElementById('mission-summary');
  ms.style.display = 'block';
  document.getElementById('ms-grid').innerHTML = `
    <div class="dc"><div class="dc-val">${S.waypoints.length}</div><div class="dc-lbl">Waypoints</div></div>
    <div class="dc"><div class="dc-val">${r.numStrips}</div><div class="dc-lbl">Strip Lines</div></div>
    <div class="dc gn"><div class="dc-val">${r.aoiArea.toFixed(1)}</div><div class="dc-lbl">Area (ha)</div></div>
    <div class="dc te"><div class="dc-val">${r.fw.toFixed(0)}</div><div class="dc-lbl">Swath (m)</div></div>`;
  document.getElementById('ms-grid2').innerHTML = `
    <div class="dc gn"><div class="dc-val">${r.gsd.toFixed(1)}</div><div class="dc-lbl">GSD cm/px</div></div>
    <div class="dc am"><div class="dc-val">${r.totalImgs}</div><div class="dc-lbl">Est. Images</div></div>
    <div class="dc"><div class="dc-val">${r.timeMins.toFixed(0)}</div><div class="dc-lbl">Time (min)</div></div>`;
  document.getElementById('ms-camera-note').textContent = (S.selectedSensor ? S.selectedSensor.name : 'DJI P1 (default)') + ` · ${document.getElementById('fp-focal').value}mm · ${r.alt}m AGL`;
  document.getElementById('sb-wps').textContent = S.waypoints.length;
  if (S.flightLinesLayer.getLayers().length > 0) S.map.fitBounds(S.flightLinesLayer.getBounds().pad(0.15));
  setStatus('✓ Flight plan: ' + S.waypoints.length + ' waypoints, ' + r.numStrips + ' lines', 'g');
  showToast('Flight plan generated — ' + S.waypoints.length + ' waypoints', 'g');
}

function clearPlan() {
  S.flightLinesLayer.clearLayers(); S.waypointLayer.clearLayers(); S.aoiLayer.clearLayers();
  S.waypoints = []; document.getElementById('mission-summary').style.display = 'none';
  document.getElementById('sb-wps').textContent = '0'; document.getElementById('sb-area').textContent = '—';
  setStatus('Plan cleared'); showToast('Plan cleared', 'a');
}

/* ── AIRCRAFT DATABASE ────────────────────────────────────────── */
function renderAircraftList() {
  const filter = document.getElementById('ac-filter').value;
  const search = (document.getElementById('ac-search').value || '').toLowerCase();
  const container = document.getElementById('aircraft-list');
  let all = [];
  if (filter !== 'uav') all = all.concat((S.aircraftDB.manned||[]).map(a=>({...a,_cat:'manned'})));
  if (filter !== 'manned') all = all.concat((S.aircraftDB.uav||[]).map(a=>({...a,_cat:'uav'})));
  if (search) all = all.filter(a => (a.name+a.manufacturer+a.category+a.type).toLowerCase().includes(search));
  container.innerHTML = '';
  if (!all.length) { container.innerHTML='<div style="font-size:10.5px;color:var(--txt3);padding:8px">No aircraft found.</div>'; return; }
  all.forEach(ac => {
    const div = document.createElement('div'); div.className = 'ac-card';
    div.onclick = () => selectAircraftFromDB(ac, div);
    const isUAV = ac._cat === 'uav';
    const specs = isUAV
      ? `<div class="ac-spec"><div class="ac-spec-item"><div class="ac-spec-val">${ac.max_altitude_m||'—'}m</div><div class="ac-spec-lbl">Alt</div></div><div class="ac-spec-item"><div class="ac-spec-val">${ac.max_speed_ms||'—'}m/s</div><div class="ac-spec-lbl">Speed</div></div><div class="ac-spec-item"><div class="ac-spec-val">${ac.endurance_min||'—'}min</div><div class="ac-spec-lbl">Time</div></div><div class="ac-spec-item"><div class="ac-spec-val">${ac.coverage_ha_per_flight||'—'}ha</div><div class="ac-spec-lbl">Coverage</div></div></div>`
      : `<div class="ac-spec"><div class="ac-spec-item"><div class="ac-spec-val">${ac.service_ceiling_ft?Math.round(ac.service_ceiling_ft/1000)+'k':'—'}ft</div><div class="ac-spec-lbl">Ceiling</div></div><div class="ac-spec-item"><div class="ac-spec-val">${ac.cruise_speed_kts||'—'}kts</div><div class="ac-spec-lbl">Speed</div></div><div class="ac-spec-item"><div class="ac-spec-val">${ac.endurance_hrs||'—'}hr</div><div class="ac-spec-lbl">Time</div></div><div class="ac-spec-item"><div class="ac-spec-val">${ac.payload_kg||'—'}kg</div><div class="ac-spec-lbl">Payload</div></div></div>`;
    div.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">${ac.image||'✈'}</span>
      <div style="flex:1"><div class="ac-name">${ac.name}</div><div class="ac-make">${ac.manufacturer} · ${ac.category}</div></div>
      ${ac.rtk?'<span class="badge g">RTK</span>':''}</div>
      <div class="ac-tags" style="margin-top:4px"><span class="badge b">${ac.type||ac.category}</span>
      ${(ac.sensors||[]).slice(0,2).map(s=>`<span class="badge t">${s}</span>`).join('')}</div>
      ${specs}${ac.notes?`<div style="font-size:9px;color:var(--txt3);margin-top:4px">${ac.notes}</div>`:''}`;
    container.appendChild(div);
  });
}

function selectAircraftFromDB(ac, cardEl) {
  S.selectedAircraft = ac;
  document.querySelectorAll('.ac-card').forEach(c=>c.classList.remove('on'));
  if (cardEl) cardEl.classList.add('on');
  const sel = document.getElementById('fp-aircraft'); if(sel) sel.value = ac.id;
  if (ac.recommended_altitude_m) { document.getElementById('fp-alt').value = ac.recommended_altitude_m; sv('fp-alt','m'); }
  const isUAV = !ac.service_ceiling_ft;
  document.getElementById('rp-aircraft-specs').innerHTML = `
    <div style="font-weight:600;color:var(--txt);margin-bottom:3px">${ac.image||'✈'} ${ac.name}</div>
    <div style="color:var(--txt3);font-size:10px">${ac.manufacturer} · ${ac.type}</div>
    <div class="dc-grid" style="margin-top:6px">
      ${isUAV
        ?`<div class="dc"><div class="dc-val">${ac.max_altitude_m}m</div><div class="dc-lbl">Max Alt</div></div>
          <div class="dc"><div class="dc-val">${ac.endurance_min}min</div><div class="dc-lbl">Endurance</div></div>
          <div class="dc"><div class="dc-val">${ac.coverage_ha_per_flight}ha</div><div class="dc-lbl">Coverage</div></div>
          <div class="dc"><div class="dc-val">${ac.rtk?'Yes':'No'}</div><div class="dc-lbl">RTK</div></div>`
        :`<div class="dc"><div class="dc-val">${ac.service_ceiling_ft}ft</div><div class="dc-lbl">Ceiling</div></div>
          <div class="dc"><div class="dc-val">${ac.cruise_speed_kts}kts</div><div class="dc-lbl">Speed</div></div>
          <div class="dc"><div class="dc-val">${ac.payload_kg}kg</div><div class="dc-lbl">Payload</div></div>
          <div class="dc"><div class="dc-val">${ac.endurance_hrs}hr</div><div class="dc-lbl">Endurance</div></div>`}
    </div>
    ${ac.notes?`<div style="font-size:9.5px;color:var(--txt3);margin-top:6px">${ac.notes}</div>`:''}`;
  calcFlight(); showToast('Platform selected: ' + ac.name, 'b');
}

function populateAircraftDropdown() {
  const sel = document.getElementById('fp-aircraft'); sel.innerHTML='<option value="">— Select Platform —</option>';
  const addGrp = (label, list) => { const og=document.createElement('optgroup'); og.label=label; list.forEach(ac=>{const o=document.createElement('option');o.value=ac.id;o.textContent=ac.name;og.appendChild(o);}); sel.appendChild(og); };
  addGrp('Manned Aircraft', S.aircraftDB.manned||[]);
  addGrp('UAV / Drones', S.aircraftDB.uav||[]);
}

function populateSensorDropdown() {
  const sel = document.getElementById('fp-sensor'); sel.innerHTML='<option value="">— Select Sensor —</option>';
  const cats = {};
  (S.sensorDB||[]).forEach(s=>{ if(!cats[s.category]) cats[s.category]=[]; cats[s.category].push(s); });
  Object.entries(cats).forEach(([cat, sensors]) => {
    const og=document.createElement('optgroup'); og.label=cat;
    sensors.forEach(s=>{ const o=document.createElement('option');o.value=s.id;o.textContent=s.name;og.appendChild(o); });
    sel.appendChild(og);
  });
}

function onAircraftChange() {
  const id = document.getElementById('fp-aircraft').value;
  S.selectedAircraft = [...(S.aircraftDB.manned||[]),...(S.aircraftDB.uav||[])].find(a=>a.id===id)||null;
  if (S.selectedAircraft?.recommended_altitude_m) { document.getElementById('fp-alt').value=S.selectedAircraft.recommended_altitude_m; sv('fp-alt','m'); }
  calcFlight();
}

function onSensorChange() {
  const id = document.getElementById('fp-sensor').value;
  S.selectedSensor = (S.sensorDB||[]).find(s=>s.id===id)||null;
  if (!S.selectedSensor) return;
  if (S.selectedSensor.pixel_size_um) document.getElementById('calc-pxsz').value = S.selectedSensor.pixel_size_um;
  if (S.selectedSensor.default_focal_mm) document.getElementById('fp-focal').value = S.selectedSensor.default_focal_mm;
  if (S.selectedSensor.sensor_size_mm?.includes('×')) { const w=parseFloat(S.selectedSensor.sensor_size_mm.split('×')[0]); if(w) document.getElementById('fp-sensw').value=w; }
  document.getElementById('rp-sensor-specs').innerHTML = `
    <div style="font-weight:600;color:var(--txt);margin-bottom:3px">${S.selectedSensor.name}</div>
    <div style="color:var(--txt3);font-size:10px">${S.selectedSensor.manufacturer} · ${S.selectedSensor.type}</div>
    <div style="margin-top:5px;font-size:10px;color:var(--txt2)">${S.selectedSensor.resolution_mp?S.selectedSensor.resolution_mp+'MP · ':''}${S.selectedSensor.pixel_size_um?S.selectedSensor.pixel_size_um+'µm/px · ':''}${S.selectedSensor.spectral||''}</div>
    ${S.selectedSensor.gsd_at_120m?`<div style="font-size:10px;color:var(--teal)">GSD @ 120m: ${S.selectedSensor.gsd_at_120m}</div>`:''}`;
  calcFlight();
}

/* ── GIS LAYERS ───────────────────────────────────────────────── */
function initBasemaps() {
  const container = document.getElementById('basemap-list'); container.innerHTML='';
  (S.layersConfig.basemaps||[]).forEach(bm => {
    if (!S.baseTileLayers[bm.id]) S.baseTileLayers[bm.id]=L.tileLayer(bm.url,{maxZoom:bm.maxZoom||19,attribution:bm.attribution||''});
    const div=document.createElement('div'); div.className='layer-item';
    div.innerHTML=`<span class="layer-icon">${bm.icon||'🗺'}</span><div style="flex:1"><div class="layer-name">${bm.name}</div></div>
      <input type="radio" name="bm-radio" value="${bm.id}" ${bm.default?'checked':''} onchange="switchBasemap('${bm.id}')"/>`;
    container.appendChild(div);
  });
}

function switchBasemap(id) {
  Object.values(S.baseTileLayers).filter(l=>!l._isOverlay).forEach(l=>{ try{S.map.removeLayer(l);}catch(e){} });
  if (!S.baseTileLayers[id]) {
    const bm=(S.layersConfig.basemaps||[]).find(b=>b.id===id);
    if(bm) S.baseTileLayers[id]=L.tileLayer(bm.url,{maxZoom:bm.maxZoom||19});
  }
  if (S.baseTileLayers[id]) { S.baseTileLayers[id].addTo(S.map); S.baseTileLayers[id].bringToBack(); }
  showToast('Basemap: ' + id.replace(/_/g,' '), 'b');
}

function renderLayerList() {
  const cat=document.getElementById('layer-cat-filter').value;
  const container=document.getElementById('overlay-list'); container.innerHTML='';
  const overlays=(S.layersConfig.overlays||[]).filter(l=>cat==='all'||l.category===cat);
  if (!overlays.length) { container.innerHTML='<div style="font-size:10.5px;color:var(--txt3);padding:6px">No layers in this category.</div>'; return; }
  overlays.forEach(lyr=>{
    const isActive=S.activeOverlays.has(lyr.id);
    const div=document.createElement('div'); div.className='layer-item';
    div.title=lyr.description||lyr.name;
    div.innerHTML=`<span class="layer-icon">${lyr.icon||'🗂'}</span><div style="flex:1"><div class="layer-name">${lyr.name}</div><div class="layer-src">${lyr.source}</div></div>
      <div class="tog-sw ${isActive?'on':''}" id="lyr-${lyr.id}" onclick="toggleOverlayLayer('${lyr.id}',this)"></div>`;
    container.appendChild(div);
  });
}

function toggleOverlayLayer(id, toggleEl) {
  toggleEl.classList.toggle('on');
  const on = toggleEl.classList.contains('on');
  const lyr = (S.layersConfig.overlays||[]).find(l=>l.id===id);
  if (!lyr) return;
  if (on) {
    S.activeOverlays.add(id);
    if (lyr.type==='tile' && lyr.url) {
      const key='ov_'+id;
      if (!S.baseTileLayers[key]) { S.baseTileLayers[key]=L.tileLayer(lyr.url,{maxZoom:18,opacity:0.72}); S.baseTileLayers[key]._isOverlay=true; }
      S.baseTileLayers[key].addTo(S.map);
    }
    showToast('Layer on: ' + lyr.name, 'g');
  } else {
    S.activeOverlays.delete(id);
    const key='ov_'+id;
    if (S.baseTileLayers[key]) { try{S.map.removeLayer(S.baseTileLayers[key]);}catch(e){} }
    showToast('Layer off: ' + lyr.name, 'a');
  }
}

/* ── WEATHER ──────────────────────────────────────────────────── */
async function fetchWeather() {
  const lat = parseFloat(document.getElementById('wx-lat').value)||S.mapCenter.lat;
  const lng = parseFloat(document.getElementById('wx-lng').value)||S.mapCenter.lng;
  const key = document.getElementById('wx-apikey').value.trim();
  setStatus('Fetching weather...', 'b');
  if (key) {
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${key}&units=metric`);
      if (!res.ok) throw new Error('API ' + res.status);
      const d = await res.json();
      displayWeather({ temp:d.main.temp, feelsLike:d.main.feels_like, cond:d.weather[0].description, icon:getWxIcon(d.weather[0].main), wind:d.wind.speed, windDir:d.wind.deg||0, humidity:d.main.humidity, visibility:(d.visibility||10000)/1000, clouds:d.clouds.all, pressure:d.main.pressure, location:d.name+', '+d.sys.country });
      return;
    } catch(e) { showAlert('OpenWeatherMap error: '+e.message+'. Using demo data.','a'); }
  }
  displayWeather({ temp:24+(Math.random()*4-2), feelsLike:23, cond:'Partly cloudy', icon:'⛅', wind:3.5+Math.random()*2, windDir:220, humidity:65, visibility:10, clouds:35, pressure:1013, location:'Nairobi, KE (demo)' });
}

function displayWeather(w) {
  S.weatherCache = w;
  document.getElementById('wx-display').style.display='block';
  document.getElementById('wx-temp').textContent = w.temp.toFixed(1);
  document.getElementById('wx-icon').textContent = w.icon;
  document.getElementById('wx-cond').textContent = (w.cond.charAt(0).toUpperCase()+w.cond.slice(1));
  document.getElementById('wx-loc').textContent  = '📍 ' + w.location;
  document.getElementById('wx-stats-grid').innerHTML = `
    <div class="wx-stat"><div class="wx-stat-val">${w.wind.toFixed(1)}</div><div class="wx-stat-lbl">Wind (m/s)</div></div>
    <div class="wx-stat"><div class="wx-stat-val">${w.humidity}%</div><div class="wx-stat-lbl">Humidity</div></div>
    <div class="wx-stat"><div class="wx-stat-val">${w.visibility}</div><div class="wx-stat-lbl">Vis (km)</div></div>
    <div class="wx-stat"><div class="wx-stat-val">${w.clouds}%</div><div class="wx-stat-lbl">Cloud</div></div>
    <div class="wx-stat"><div class="wx-stat-val">${w.windDir}°</div><div class="wx-stat-lbl">Wind Dir</div></div>
    <div class="wx-stat"><div class="wx-stat-val">${w.pressure}</div><div class="wx-stat-lbl">hPa</div></div>`;
  let score=100; const reasons=[];
  if (w.wind>12){score-=40;reasons.push('⛔ Wind >12 m/s — unsafe');}
  else if (w.wind>8){score-=20;reasons.push('⚠ Wind 8–12 m/s — check limits');}
  else if (w.wind>5){score-=10;reasons.push('⚡ Moderate wind — fixed-wing preferred');}
  if (w.visibility<3){score-=30;reasons.push('⛔ Visibility <3 km — VLOS not possible');}
  else if (w.visibility<5){score-=10;reasons.push('⚠ Reduced visibility');}
  if (w.clouds>80){score-=15;reasons.push('⚠ Heavy cloud — poor imagery quality');}
  else if (w.clouds>50){score-=5;reasons.push('☁ Patchy cloud — monitor lighting');}
  score = Math.max(0, Math.min(100, score));
  const cls=score>=70?'suit-g':score>=40?'suit-a':'suit-r';
  const lbl=score>=70?'✅ Suitable for Flight':score>=40?'⚠ Marginal Conditions':'🚫 Not Recommended';
  document.getElementById('wx-suit-score').textContent=score+'%';
  document.getElementById('wx-suit-score').className='suit-score '+cls;
  document.getElementById('wx-suit-label').textContent=lbl;
  document.getElementById('wx-suit-reasons').innerHTML=reasons.length?reasons.join('<br>'):'✅ All parameters within acceptable ranges.';
  const wx=document.getElementById('wx-widget'); if(wx) wx.classList.add('visible');
  const setMini=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  setMini('wx-mini-temp',w.temp.toFixed(0)+'°C'); setMini('wx-mini-icon',w.icon);
  setMini('wx-mini-cond',w.cond); setMini('wx-mini-wind',w.wind.toFixed(1));
  setMini('wx-mini-vis',w.visibility); setMini('wx-mini-hum',w.humidity+'%');
  setMini('wx-mini-suit',score+'%');
  const ms=document.getElementById('wx-mini-status');
  if(ms){ms.className='wx-suitability wx-suit-'+(score>=70?'g':score>=40?'a':'r');ms.textContent=lbl;}
  document.getElementById('chip-sat').textContent=score>=70?'FLY ✅':score>=40?'CAUTION':'NO-FLY';
  setStatus('Weather: '+w.temp.toFixed(0)+'°C · '+w.cond+' · Suitability: '+score+'%', score>=70?'g':'warn');
}

function getWxIcon(main) {
  return ({Clear:'☀',Clouds:'☁',Rain:'🌧',Drizzle:'🌦',Thunderstorm:'⛈',Snow:'❄',Mist:'🌫',Fog:'🌫',Haze:'🌫'})[main]||'🌤';
}

/* ── NFZ ──────────────────────────────────────────────────────── */
function renderNFZList() {
  const c=document.getElementById('nfz-list'); c.innerHTML='';
  S.nfzData.forEach(nfz=>{
    const div=document.createElement('div'); div.className='nfz-item';
    div.onclick=()=>S.map.flyTo([nfz.lat,nfz.lng],13,{duration:1.5});
    div.innerHTML=`<span class="nfz-icon">${nfz.icao?'✈':nfz.type.includes('Military')?'⚔':nfz.type.includes('Wildlife')?'🦁':'🚫'}</span>
      <div><div class="nfz-name">${nfz.name}</div>
      <div class="nfz-detail">${nfz.type} · ${nfz.radius_km}km · ${nfz.authority}</div>
      <div style="font-size:9px;color:var(--red);margin-top:2px">${nfz.notes}</div></div>`;
    c.appendChild(div);
  });
}

function renderNFZBuffers() {
  S.nfzLayer.clearLayers();
  const buffer = parseFloat(document.getElementById('nfz-buffer').value)||8;
  S.nfzData.forEach(nfz=>{
    const rad=(nfz.radius_km||5)*1000;
    const col=nfz.max_uav_alt_m===0?'#f87171':'#fbbf24';
    L.circle([nfz.lat,nfz.lng],{radius:rad,color:col,weight:1.5,fillColor:col,fillOpacity:0.07,dashArray:'6 4'})
    .bindPopup(`<div class="pop"><div class="pop-title">${nfz.name}</div><div class="pop-type">${nfz.type}</div>
      <div class="pop-row"><span class="pop-lbl">ICAO</span><span class="pop-val">${nfz.icao||'N/A'}</span></div>
      <div class="pop-row"><span class="pop-lbl">Authority</span><span class="pop-val">${nfz.authority}</span></div>
      <div class="pop-row"><span class="pop-lbl">Radius</span><span class="pop-val">${nfz.radius_km}km</span></div>
      <div class="pop-danger">${nfz.notes}</div></div>`,{maxWidth:280}).addTo(S.nfzLayer);
    L.circleMarker([nfz.lat,nfz.lng],{radius:6,color:col,fillColor:col,fillOpacity:0.9,weight:2}).addTo(S.nfzLayer);
  });
  document.getElementById('chip-nfz').textContent=S.nfzData.length+' NFZ';
}

function toggleNFZLayer(show){
  if(show){if(!S.map.hasLayer(S.nfzLayer))S.map.addLayer(S.nfzLayer);}
  else{try{S.map.removeLayer(S.nfzLayer);}catch(e){}}
  showToast('NFZ layer '+(show?'shown':'hidden'),show?'b':'a');
}

/* ── SITE ASSESSMENT ──────────────────────────────────────────── */
function selectAssessType(type){
  S.currentAssessType=type;
  document.querySelectorAll('#assess-type-grid .cd-type-btn').forEach(b=>b.classList.toggle('on',b.dataset.type===type));
}

function runSiteAssessment(){
  const area=parseFloat(document.getElementById('sa-area').value)||50;
  const name=document.getElementById('sa-name').value||'Study Area';
  const region=document.getElementById('sa-region').value;
  const results={
    realEstate:{title:'🏗 Real Estate Suitability',score:78,grade:'B+',metrics:[{l:'Total Area',v:area.toFixed(1)+' ha'},{l:'Buildable (65%)',v:(area*0.65).toFixed(1)+' ha'},{l:'Plot Yield (40×25m)',v:Math.floor(area*0.65*5)+' plots'},{l:'Infra Cost',v:'KSH '+(area*850000/1e6).toFixed(1)+'M'},{l:'Road Access',v:'✅ Available'},{l:'Zoning',v:'Residential R3'}],recs:['County Spatial Plan approval','NEMA EIA required (>0.5ha)','Flood risk drainage study']},
    urban:{title:'🏙 Urban Planning',score:72,grade:'B',metrics:[{l:'Study Area',v:area.toFixed(1)+' ha'},{l:'Population Capacity',v:Math.floor(area*120).toLocaleString()+' persons'},{l:'Road Needed',v:(Math.sqrt(area*10000)*0.012).toFixed(1)+' km'},{l:'Water Demand',v:(Math.floor(area*120)*0.15).toFixed(0)+' m³/day'},{l:'Density Class',v:'Medium R3'},{l:'Green Space',v:(area*0.15).toFixed(1)+' ha'}],recs:['Physical Planning Act Cap.286','Traffic Impact Assessment','Utilities masterplan']},
    solar:{title:'☀ Solar Feasibility',score:85,grade:'A-',metrics:[{l:'Capacity',v:(area*80).toFixed(0)+' kWp'},{l:'Annual Generation',v:(area*80*4.8*365/1000).toFixed(0)+' MWh/yr'},{l:'Annual Revenue',v:'KSH '+(area*80*4.8*365*12/1e6).toFixed(1)+'M/yr'},{l:'Irradiation',v:'5.5–6.2 kWh/m²/day'},{l:'Panel Rows',v:Math.floor(area*8)+' rows'},{l:'CO₂ Offset',v:(area*80*4.8*365*0.5/1e6).toFixed(0)+' t/yr'}],recs:['Solar radiation survey','KPLC grid connection agreement','FiT application to ERC']},
    flood:{title:'🌊 Flood Risk',score:55,grade:'C+',metrics:[{l:'Study Area',v:area.toFixed(1)+' ha'},{l:'10-yr Return',v:'0.8–1.4m depth'},{l:'100-yr Return',v:'1.6–2.9m depth'},{l:'Drainage Coeff.',v:'0.72'},{l:'Risk Class',v:'MEDIUM-HIGH'},{l:'Run-off Est.',v:(area*0.72*25).toFixed(0)+' m³/hr'}],recs:['HEC-RAS hydraulic modelling','Retention pond (min 0.5ha)','Raise FFL +0.5m','WRMA notification']},
    agri:{title:'🌾 Agriculture Suitability',score:82,grade:'A-',metrics:[{l:'Soil Class',v:'Nitisols (Class II)'},{l:'Soil pH',v:'5.8–7.2'},{l:'Annual Rainfall',v:'750–1050mm'},{l:'Irrigable Area',v:(area*0.7).toFixed(1)+' ha'},{l:'Maize Yield',v:(area*3.5).toFixed(0)+' t/yr'},{l:'Horticulture',v:'HIGH Potential'}],recs:['Soil sampling (1/5ha)','Drip irrigation design','Agronomist consultation']},
    infra:{title:'🏗 Infrastructure Analysis',score:69,grade:'B-',metrics:[{l:'Road Network',v:(Math.sqrt(area*10000)*0.008).toFixed(1)+' km tarmac'},{l:'Grid Proximity',v:'2.4 km to substation'},{l:'Water Supply',v:'Municipal — adequate'},{l:'4G Coverage',v:'95% of site'},{l:'Ground Conditions',v:'Stable (CBR>5%)'},{l:'Topography',v:'Gently Undulating'}],recs:['Geotechnical survey','Power line easement (KPLC)','KeNHA road approval']}
  };
  const r=results[S.currentAssessType];
  const gc=r.score>=70?'var(--green)':r.score>=50?'var(--amber)':'var(--red)';
  const el=document.getElementById('assess-result');
  el.style.display='block';
  el.innerHTML=`<div class="results-header">${r.title}</div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <div style="text-align:center"><div style="font-size:36px;font-weight:700;color:${gc};font-family:monospace">${r.score}</div><div style="font-size:9px;color:var(--txt3)">SCORE</div></div>
      <div style="text-align:center"><div style="font-size:36px;font-weight:700;color:${gc}">${r.grade}</div><div style="font-size:9px;color:var(--txt3)">GRADE</div></div>
      <div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--txt)">${name}</div>
        <div style="font-size:10px;color:var(--txt3)">${region} · ${area.toFixed(1)} ha</div>
        <div class="progress-bar" style="margin-top:6px"><div class="progress-fill ${r.score>=70?'g':r.score>=50?'a':'r'}" style="width:${r.score}%"></div></div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
      ${r.metrics.map(m=>`<div style="padding:5px 7px;background:var(--bg4);border-radius:4px;border:1px solid var(--bdr)"><div style="font-size:8.5px;color:var(--txt3)">${m.l}</div><div style="font-size:11px;font-weight:600;color:var(--txt);font-family:monospace">${m.v}</div></div>`).join('')}
    </div>
    <div style="font-size:9px;font-weight:700;color:var(--teal);margin-bottom:4px">RECOMMENDATIONS</div>
    ${r.recs.map(rec=>`<div style="font-size:10px;color:var(--txt2);padding:2px 0">→ ${rec}</div>`).join('')}`;
  setStatus('Site assessment: '+r.grade+' ('+r.score+'/100)'); showToast(r.title+' — '+r.grade, r.score>=70?'g':'a');
}

/* ── CHANGE DETECTION ─────────────────────────────────────────── */
function selectCDType(type){
  S.currentCDType=type;
  document.querySelectorAll('#cd-type-grid .cd-type-btn').forEach(b=>b.classList.toggle('on',b.dataset.type===type));
}

function runChangeDetection(){
  const t1=document.getElementById('cd-t1').value, t2=document.getElementById('cd-t2').value;
  const src=document.getElementById('cd-source').value;
  const el=document.getElementById('cd-result');
  el.innerHTML='<div style="color:var(--blue);font-size:11px;text-align:center;padding:12px">⌛ Processing imagery…</div>';
  el.classList.add('on'); setStatus('Running change detection...','b');
  const defs={
    landuse: {title:'🗺 Land Use Change',sev:'a',metrics:[{l:'Changed Area',v:'42.3 ha'},{l:'Change Rate',v:'8.2%/yr'},{l:'Confidence',v:'94%'},{l:'Source',v:'Sentinel-2 10m'}],detail:'Significant conversion from grassland to built-up land in north-east quadrant. Urban fringe expansion evident.'},
    deforest:{title:'🌳 Deforestation',sev:'a',metrics:[{l:'Canopy Loss',v:'18.7 ha'},{l:'NDVI Δ',v:'-0.34'},{l:'CO₂ Equiv.',v:'3,240 t'},{l:'Alert Class',v:'ORANGE'}],detail:'Forest canopy loss via NDVI differencing. Primary forest edge degradation in south-west extent.'},
    mining:  {title:'⛏ Illegal Mining',sev:'r',metrics:[{l:'Suspect Sites',v:'3 locations'},{l:'Disturbed Area',v:'7.2 ha'},{l:'Active Sites',v:'2'},{l:'NEMA Alert',v:'🔴 SENT'}],detail:'Spectral anomalies consistent with artisanal gold mining. Bare soil patches and water sedimentation visible.'},
    flood:   {title:'🌊 Flood Mapping',sev:'r',metrics:[{l:'Flood Extent',v:'63.5 ha'},{l:'Max Depth',v:'~2.8m'},{l:'Duration Est.',v:'3–5 days'},{l:'Source',v:'Sentinel-1 SAR'}],detail:'SAR backscatter analysis reveals significant inundation along river corridor. Flood water receding from peak.'},
    urban:   {title:'🏙 Urban Expansion',sev:'a',metrics:[{l:'New Built-up',v:'28.4 ha'},{l:'Growth Rate',v:'4.7%/yr'},{l:'Footprint Δ',v:'+23%'},{l:'Confidence',v:'91%'}],detail:'NDBI growth shows expansion along primary road corridors. Informal settlement densification in periurban zone.'},
    lidar:   {title:'📡 Bathymetric LiDAR',sev:'g',metrics:[{l:'Water Depth',v:'0.5–4.2m'},{l:'Point Density',v:'18 pts/m²'},{l:'Coverage',v:'15.2 ha'},{l:'Wavelengths',v:'532nm+1064nm'}],detail:'Dual-wavelength LiDAR bathymetric survey. Shallow water DEM generated at 0.5m resolution.'}
  };
  setTimeout(()=>{
    const r=defs[S.currentCDType]||defs.landuse;
    const col={g:'var(--green)',a:'var(--amber)',r:'var(--red)'}[r.sev];
    el.innerHTML=`<div class="results-header" style="color:${col}">${r.title}</div>
      <div style="font-size:9.5px;color:var(--txt3);margin-bottom:8px">📅 ${t1} → ${t2} · ${src}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px">
        ${r.metrics.map(m=>`<div style="padding:5px 7px;background:var(--bg4);border-radius:4px;border:1px solid var(--bdr)"><div style="font-size:8.5px;color:var(--txt3)">${m.l}</div><div style="font-size:11px;font-weight:600;font-family:monospace;color:${col}">${m.v}</div></div>`).join('')}
      </div>
      <div style="font-size:10px;color:var(--txt2);line-height:1.5;padding:8px;background:var(--bg4);border-radius:4px;border-left:3px solid ${col}">${r.detail}</div>`;
    setStatus('Change detection complete','g'); showToast(r.title+' complete',r.sev);
  },2000);
}

/* ── DRONE LOG ────────────────────────────────────────────────── */
function loadDemoLog(){
  S.droneLog=[
    {id:'LOG001',date:'2025-03-15',platform:'DJI M350 RTK',site:'Nairobi CBD Survey Block 4A',duration:52,images:1240,coverage:78.3,battery:82,status:'complete',notes:'Clear conditions. All waypoints completed.'},
    {id:'LOG002',date:'2025-02-28',platform:'WingtraOne GEN II',site:'Nakuru Rift Valley Agri Survey',duration:88,images:1840,coverage:210.4,battery:91,status:'complete',notes:'Light turbulence WP34. Data quality: excellent.'},
    {id:'LOG003',date:'2025-01-10',platform:'Phantom 4 RTK',site:'Mombasa Port Expansion AOI',duration:31,images:620,coverage:45.2,battery:78,status:'complete',notes:'Sea breeze 7m/s. Minor vibration.'},
    {id:'LOG004',date:'2025-04-01',platform:'DJI M300 RTK',site:'Kisumu Lakeside Dev. Site',duration:24,images:280,coverage:18.7,battery:45,status:'partial',notes:'Battery failure at WP22. Re-fly required.'}
  ];
  renderDroneLog();
}

function renderDroneLog(){
  const container=document.getElementById('log-table-wrap');
  if(!S.droneLog||!S.droneLog.length){container.innerHTML='<div style="font-size:10.5px;color:var(--txt3);padding:8px">No log entries.</div>';return;}
  const icons={complete:'✅',partial:'⚠',aborted:'❌'};
  container.innerHTML=`<table class="log-table"><thead><tr><th>Date</th><th>Platform</th><th>Site</th><th>Dur</th><th>Imgs</th><th>Cov</th><th>Status</th></tr></thead><tbody>
    ${S.droneLog.map(l=>`<tr title="${l.notes||''}"><td style="white-space:nowrap">${l.date}</td><td>${l.platform}</td>
      <td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.site}">${l.site}</td>
      <td>${l.duration}m</td><td>${l.images}</td><td>${l.coverage}ha</td><td>${icons[l.status]||'—'}</td></tr>`).join('')}
  </tbody></table>`;
}

function addLogEntry(){
  const entry={id:'LOG'+String(S.droneLog.length+1).padStart(3,'0'),date:document.getElementById('log-date').value,platform:document.getElementById('log-platform').value,site:document.getElementById('log-site').value||'Unnamed Site',duration:parseInt(document.getElementById('log-dur').value)||0,images:parseInt(document.getElementById('log-imgs').value)||0,coverage:parseFloat(document.getElementById('log-cov').value)||0,battery:parseInt(document.getElementById('log-batt').value)||0,status:document.getElementById('log-status').value,notes:document.getElementById('log-notes').value};
  S.droneLog.unshift(entry); renderDroneLog(); showToast('Log entry '+entry.id+' added','g');
}

function exportLogCSV(){
  if(!S.droneLog.length){showToast('No log entries to export','a');return;}
  const hdrs='ID,Date,Platform,Site,Duration(min),Images,Coverage(ha),Battery(%),Status,Notes';
  const rows=S.droneLog.map(l=>[l.id,l.date,l.platform,'"'+l.site+'"',l.duration,l.images,l.coverage,l.battery,l.status,'"'+(l.notes||'')+'"'].join(','));
  dl('aerogis_drone_log_'+datestamp()+'.csv',[hdrs,...rows].join('\n'),'text/csv');
  showToast('Drone log exported','g');
}

function importLogCSV(){document.getElementById('log-import-file').click();}
function handleLogImport(e){
  const file=e.target.files[0]; if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    const lines=ev.target.result.split('\n').slice(1).filter(l=>l.trim());
    lines.forEach(line=>{const c=line.split(',');if(c.length>=9)S.droneLog.push({id:c[0],date:c[1],platform:c[2],site:c[3].replace(/"/g,''),duration:parseInt(c[4]),images:parseInt(c[5]),coverage:parseFloat(c[6]),battery:parseInt(c[7]),status:c[8],notes:(c[9]||'').replace(/"/g,'')});});
    renderDroneLog(); showToast('Imported '+lines.length+' entries','g');
  };
  r.readAsText(file);
}

/* ── TELEMETRY ────────────────────────────────────────────────── */
function initTelemetry(){
  S.telemData={alt:0,spd:0,bat:100,hdg:0,sig:0,dst:0};
  S.telemHistory={alt:new Array(60).fill(0),bat:new Array(60).fill(100)};
  updateGauges(); drawTelemChart();
}

function connectAircraft(){
  const method=document.getElementById('conn-method').value;
  const status=document.getElementById('conn-status');
  status.style.color='var(--amber)'; status.innerHTML='⌛ Connecting via '+method+'...';
  setTimeout(()=>{
    status.style.color='var(--green)';
    status.innerHTML='✅ Connected — Demo Mode ('+method.toUpperCase()+')<br><span style="font-size:9px;color:var(--txt3)">Real connection requires aircraft + GCS software</span>';
    startTelemDemo(); showToast('Connected (demo mode)','g');
    showAlert('Demo telemetry active. Real flight requires MAVLink-compatible GCS.','b');
  },1800);
}

function disconnectAircraft(){
  stopDemoFlight(); if(S.telemTimer)clearInterval(S.telemTimer);
  document.getElementById('conn-status').style.color='var(--txt3)';
  document.getElementById('conn-status').innerHTML='○ Disconnected'; showToast('Disconnected','a');
}

function startTelemDemo(){
  if(S.telemTimer)clearInterval(S.telemTimer);
  S.telemTimer=setInterval(()=>{
    S.telemData.alt=Math.max(0,S.telemData.alt+(Math.random()*4-1.5));
    S.telemData.spd=Math.max(0,Math.min(25,S.telemData.spd+(Math.random()*2-0.8)));
    S.telemData.bat=Math.max(0,S.telemData.bat-0.05);
    S.telemData.hdg=(S.telemData.hdg+Math.random()*6-2+360)%360;
    S.telemData.sig=85+Math.random()*15; S.telemData.dst+=S.telemData.spd*0.5;
    S.telemHistory.alt.push(Math.round(S.telemData.alt));
    S.telemHistory.bat.push(Math.round(S.telemData.bat));
    if(S.telemHistory.alt.length>60){S.telemHistory.alt.shift();S.telemHistory.bat.shift();}
    updateGauges(); drawTelemChart();
  },500);
}

function updateGauges(){
  const set=(id,val)=>{const el=document.getElementById('g-'+id+'-v');if(el)el.textContent=typeof val==='number'?val.toFixed(val>=100?0:1):val;};
  set('alt',S.telemData.alt); set('spd',S.telemData.spd); set('bat',S.telemData.bat);
  set('hdg',S.telemData.hdg); set('sig',S.telemData.sig); set('dst',S.telemData.dst);
  const bat=document.getElementById('g-bat');
  if(bat){bat.classList.remove('hi','med','lo');bat.classList.add(S.telemData.bat>50?'hi':S.telemData.bat>25?'med':'lo');}
}

function drawTelemChart(){
  const canvas=document.getElementById('telem-chart'); if(!canvas)return;
  const ctx=canvas.getContext('2d'), W=canvas.offsetWidth||300, H=110;
  canvas.width=W; canvas.height=H;
  ctx.clearRect(0,0,W,H); ctx.fillStyle='rgba(22,36,55,.6)'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(56,189,248,.07)'; ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=(H/4)*i;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  const drawLine=(data,max,color,alpha)=>{
    if(!data.length)return; ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.globalAlpha=alpha;
    data.forEach((v,i)=>{const x=(i/(data.length-1))*W,y=H-(v/max)*H*0.85-4;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.stroke(); ctx.globalAlpha=1;
  };
  drawLine(S.telemHistory.alt,200,'#38bdf8',0.85);
  drawLine(S.telemHistory.bat,100,'#34d399',0.7);
  ctx.fillStyle='rgba(56,189,248,.7)'; ctx.font='8px monospace'; ctx.fillText('ALT',4,12);
  ctx.fillStyle='rgba(52,211,153,.7)'; ctx.fillText('BAT%',28,12);
}

function startDemoFlight(){
  if(!S.waypoints.length){showToast('Generate a flight plan first','a');return;}
  let idx=0;
  const icon=L.divIcon({html:'<div style="font-size:20px;filter:drop-shadow(0 0 6px #38bdf8)">🚁</div>',className:'',iconAnchor:[10,10]});
  const drone=L.marker([S.waypoints[0].lat,S.waypoints[0].lng],{icon}).addTo(S.map);
  S.demoFlightTimer=setInterval(()=>{
    if(idx>=S.waypoints.length){clearInterval(S.demoFlightTimer);S.map.removeLayer(drone);showToast('Demo flight complete','g');return;}
    const wp=S.waypoints[idx]; drone.setLatLng([wp.lat,wp.lng]);
    S.telemData.alt=parseFloat(document.getElementById('fp-alt').value)||120;
    S.telemData.spd=parseFloat(document.getElementById('fp-speed').value)||10;
    S.telemData.bat=Math.max(20,S.telemData.bat-0.3); S.telemData.dst=idx*50;
    updateGauges(); idx++;
  },600);
  startTelemDemo(); showToast('Demo flight started','b');
}

function stopDemoFlight(){
  if(S.demoFlightTimer){clearInterval(S.demoFlightTimer);S.demoFlightTimer=null;}
  if(S.telemTimer){clearInterval(S.telemTimer);S.telemTimer=null;}
  showToast('Demo flight stopped','a');
}
 {
  const c = S.map.getCenter();
  const z = S.map.getZoom();
  const url = `https://www.flightradar24.com/${c.lat.toFixed(4)},${c.lng.toFixed(4)}/${z}`;
  window.open(url, '_blank');
  showToast('Opening FlightRadar24 for current map area', 'b');
}

function openADSBLol() {
  const c = S.map.getCenter();
  const url = `https://adsb.lol/?lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&zoom=10`;
  window.open(url, '_blank');
  showToast('Opening ADSB.lol live feed', 'b');
}

function loadSimulatedTraffic() {
  S.simulatedTrafficLayer.clearLayers();
  const c = S.map.getCenter();
  const traffic = [
    { callsign: 'KQA101',  type: 'B737', alt: 8200, spd: 420, hdg: 045, lat: c.lat + 0.12, lng: c.lng + 0.18, op: 'Kenya Airways' },
    { callsign: '5Y-KZW',  type: 'C208', alt: 3500, spd: 180, hdg: 225, lat: c.lat - 0.08, lng: c.lng - 0.12, op: 'Survey Flight' },
    { callsign: 'UAV-G01', type: 'DJI',  alt: 120,  spd:  15, hdg: 090, lat: c.lat + 0.02, lng: c.lng + 0.04, op: 'GeoCart Ops' },
    { callsign: 'ET-ARS',  type: 'B787', alt: 12000, spd: 510, hdg: 180, lat: c.lat + 0.25, lng: c.lng + 0.05, op: 'Ethiopian Airlines' },
    { callsign: 'HKJK-01', type: 'AS350', alt: 600, spd:  90, hdg: 270, lat: c.lat - 0.15, lng: c.lng + 0.22, op: 'Helicopter Survey' }
  ];

  const container = document.getElementById('tracker-list');
  container.innerHTML = '';

  traffic.forEach(ac => {
    const icon = ac.type === 'DJI' ? '🚁' : ac.alt < 1000 ? '🚁' : '✈';
    const altColor = ac.alt < 200 ? 'var(--red)' : ac.alt < 2000 ? 'var(--amber)' : 'var(--green)';

    L.marker([ac.lat, ac.lng], {
      icon: L.divIcon({
        html: `<div style="background:rgba(8,14,26,.85);border:1px solid var(--bdr2);border-radius:4px;padding:3px 6px;font-size:9px;color:#fff;white-space:nowrap;transform:rotate(${ac.hdg}deg)">${icon}</div>`,
        className: '', iconAnchor: [12, 12]
      })
    })
    .bindPopup(`<div class="pop">
      <div class="pop-title">${ac.callsign}</div>
      <div class="pop-type">${ac.type} · ${ac.op}</div>
      <div class="pop-row"><span class="pop-lbl">Altitude</span><span class="pop-val" style="color:${altColor}">${ac.alt.toLocaleString()} ft</span></div>
      <div class="pop-row"><span class="pop-lbl">Speed</span><span class="pop-val">${ac.spd} kts</span></div>
      <div class="pop-row"><span class="pop-lbl">Heading</span><span class="pop-val">${ac.hdg}°</span></div>
    </div>`)
    .addTo(S.simulatedTrafficLayer);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid rgba(56,189,248,.07);cursor:pointer';
    row.innerHTML = `<span style="font-size:14px">${icon}</span>
      <div style="flex:1">
        <div style="font-size:11px;font-weight:600;color:var(--txt)">${ac.callsign}</div>
        <div style="font-size:9px;color:var(--txt3)">${ac.type} · ${ac.op}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:10px;font-family:monospace;color:${altColor}">${ac.alt.toLocaleString()}ft</div>
        <div style="font-size:9px;color:var(--txt3)">${ac.spd}kts ${ac.hdg}°</div>
      </div>`;
    row.onclick = () => S.map.flyTo([ac.lat, ac.lng], 13);
    container.appendChild(row);
  });
  showToast('Demo traffic loaded — ' + traffic.length + ' aircraft', 'b');
}

/* ════════════════════════════════════════════════════════════════
   CONNECT / TELEMETRY
════════════════════════════════════════════════════════════════ */
function initTelemetry() {
  S.telemData = { alt: 0, spd: 0, bat: 100, hdg: 0, sig: 0, dst: 0 };
  S.telemHistory = { alt: new Array(60).fill(0), bat: new Array(60).fill(100) };
  updateGauges();
  drawTelemChart();
}

function connectAircraft() {
  const method = document.getElementById('conn-method').value;
  const status = document.getElementById('conn-status');
  status.style.color = 'var(--amber)';
  status.innerHTML = '⌛ Connecting via ' + method + '...';
  setTimeout(() => {
    status.style.color = 'var(--green)';
    status.innerHTML = '✅ Connected — Demo Mode (' + method.toUpperCase() + ')<br><span style="font-size:9px;color:var(--txt3)">Real connection requires aircraft + matching GCS software</span>';
    startTelemDemo();
    showToast('Connected (demo mode)', 'g');
    showAlert('Demo telemetry active. Real flight requires MAVLink-compatible GCS.', 'b');
  }, 1800);
}

function disconnectAircraft() {
  stopDemoFlight();
  if (S.telemTimer) clearInterval(S.telemTimer);
  document.getElementById('conn-status').style.color = 'var(--txt3)';
  document.getElementById('conn-status').innerHTML = '○ Disconnected';
  showToast('Disconnected', 'a');
}

function startTelemDemo() {
  if (S.telemTimer) clearInterval(S.telemTimer);
  S.telemTimer = setInterval(() => {
    S.telemData.alt = Math.max(0, S.telemData.alt + (Math.random() * 4 - 1.5));
    S.telemData.spd = Math.max(0, Math.min(25, S.telemData.spd + (Math.random() * 2 - 0.8)));
    S.telemData.bat = Math.max(0, S.telemData.bat - 0.05);
    S.telemData.hdg = (S.telemData.hdg + Math.random() * 6 - 2) % 360;
    if (S.telemData.hdg < 0) S.telemData.hdg += 360;
    S.telemData.sig = 85 + Math.random() * 15;
    S.telemData.dst += S.telemData.spd * 0.5;

    S.telemHistory.alt.push(Math.round(S.telemData.alt));
    S.telemHistory.bat.push(Math.round(S.telemData.bat));
    if (S.telemHistory.alt.length > 60) { S.telemHistory.alt.shift(); S.telemHistory.bat.shift(); }

    updateGauges();
    drawTelemChart();
  }, 500);
}

function updateGauges() {
  const set = (id, val, unit) => {
    const el = document.getElementById('g-' + id + '-v');
    if (el) el.textContent = typeof val === 'number' ? val.toFixed(val >= 100 ? 0 : 1) : val;
  };
  set('alt', S.telemData.alt);
  set('spd', S.telemData.spd);
  set('bat', S.telemData.bat);
  set('hdg', S.telemData.hdg);
  set('sig', S.telemData.sig);
  set('dst', S.telemData.dst);

  // Battery colour
  const bat = document.getElementById('g-bat');
  if (bat) {
    bat.classList.remove('hi','med','lo');
    bat.classList.add(S.telemData.bat > 50 ? 'hi' : S.telemData.bat > 25 ? 'med' : 'lo');
  }
}

function drawTelemChart() {
  const canvas = document.getElementById('telem-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 300, H = 110;
  canvas.width = W; canvas.height = H;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(22,36,55,.6)';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(56,189,248,.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  const drawLine = (data, max, color, alpha) => {
    if (!data.length) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha;
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - (v / max) * H * 0.85 - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  drawLine(S.telemHistory.alt, 200, '#38bdf8', 0.85);
  drawLine(S.telemHistory.bat, 100, '#34d399', 0.7);

  // Labels
  ctx.fillStyle = 'rgba(56,189,248,.7)';
  ctx.font = '8px monospace';
  ctx.fillText('ALT', 4, 12);
  ctx.fillStyle = 'rgba(52,211,153,.7)';
  ctx.fillText('BAT%', 28, 12);
}

function startDemoFlight() {
  if (!S.waypoints.length) {
    showToast('Generate a flight plan first', 'a'); return;
  }
  let idx = 0;
  const droneIcon = L.divIcon({
    html: '<div style="font-size:20px;filter:drop-shadow(0 0 6px #38bdf8)">🚁</div>',
    className: '', iconAnchor: [10, 10]
  });
  const droneMarker = L.marker([S.waypoints[0].lat, S.waypoints[0].lng], { icon: droneIcon }).addTo(S.map);

  S.demoFlightTimer = setInterval(() => {
    if (idx >= S.waypoints.length) {
      clearInterval(S.demoFlightTimer);
      S.map.removeLayer(droneMarker);
      showToast('Demo flight complete', 'g');
      return;
    }
    const wp = S.waypoints[idx];
    droneMarker.setLatLng([wp.lat, wp.lng]);
    S.telemData.alt = parseFloat(document.getElementById('fp-alt').value) || 120;
    S.telemData.spd = parseFloat(document.getElementById('fp-speed').value) || 10;
    S.telemData.bat = Math.max(20, S.telemData.bat - 0.3);
    S.telemData.dst = idx * 50;
    updateGauges();
    idx++;
  }, 600);

  startTelemDemo();
  showToast('Demo flight started — ' + S.waypoints.length + ' waypoints', 'b');
}

function stopDemoFlight() {
  if (S.demoFlightTimer) { clearInterval(S.demoFlightTimer); S.demoFlightTimer = null; }
  if (S.telemTimer)      { clearInterval(S.telemTimer);      S.telemTimer = null; }
  showToast('Demo flight stopped', 'a');
}

/* ════════════════════════════════════════════════════════════════
   COORDINATE SYSTEM
════════════════════════════════════════════════════════════════ */
function openCoordModal() { openModal('coord'); }

function switchCoordTab(tab) {
  document.querySelectorAll('.ctab').forEach((t, i) => {
    const tabs = ['dd','dms','utm','bbox','wkt','circle'];
    t.classList.toggle('on', tabs[i] === tab);
  });
  document.querySelectorAll('.coord-panel').forEach(p => p.classList.remove('on'));
  const el = document.getElementById('coord-' + tab);
  if (el) el.classList.add('on');
}

function addDDPoint() {
  const container = document.getElementById('dd-points-container');
  const div = document.createElement('div');
  div.className = 'fg-row';
  div.style.marginBottom = '5px';
  div.innerHTML = `
    <div class="fg"><label>Latitude</label><input type="number" class="dd-lat" step="0.000001" placeholder="e.g. -1.286"/></div>
    <div class="fg"><label>Longitude</label><input type="number" class="dd-lng" step="0.000001" placeholder="e.g. 36.817"/></div>
  `;
  container.appendChild(div);
}

function buildDDPolygon() {
  const lats = Array.from(document.querySelectorAll('.dd-lat')).map(i => parseFloat(i.value)).filter(v => !isNaN(v));
  const lngs = Array.from(document.querySelectorAll('.dd-lng')).map(i => parseFloat(i.value)).filter(v => !isNaN(v));
  if (lats.length < 3) { showToast('Enter at least 3 points', 'a'); return; }
  const coords = lats.map((lat, i) => [lat, lngs[i]]);
  buildPolygonFromCoords(coords);
  closeModal('coord');
  showToast('Polygon built from ' + lats.length + ' DD points', 'g');
}

function convertDMS() {
  const latStr = document.getElementById('dms-lat').value.trim();
  const lngStr = document.getElementById('dms-lng').value.trim();
  const lat = parseDMS(latStr);
  const lng = parseDMS(lngStr);
  if (isNaN(lat) || isNaN(lng)) { showToast('Invalid DMS format', 'a'); return; }
  const res = document.getElementById('dms-result');
  res.style.display = 'block';
  res.textContent = `DD: ${lat.toFixed(7)}, ${lng.toFixed(7)}`;
  S.map.flyTo([lat, lng], 14);
}

function parseDMS(str) {
  const s = str.replace(/[°'"]/g, ' ').replace(/[NSEW]/gi, d => ' ' + d).trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return NaN;
  let deg = parseFloat(parts[0]) + parseFloat(parts[1]) / 60 + parseFloat(parts[2]) / 3600;
  const dir = parts[parts.length - 1].toUpperCase();
  if (dir === 'S' || dir === 'W') deg = -deg;
  return deg;
}

function convertUTM() {
  const zone = parseInt(document.getElementById('utm-zone').value);
  const band = document.getElementById('utm-band').value;
  const E    = parseFloat(document.getElementById('utm-e').value);
  const N    = parseFloat(document.getElementById('utm-n').value);
  // Simplified UTM to WGS84 approximation
  const lon0 = (zone - 1) * 6 - 180 + 3;
  const k0 = 0.9996;
  const a  = 6378137;
  const e2 = 0.00669438;
  const x  = E - 500000;
  const y  = band === 'S' ? N - 10000000 : N;
  const M  = y / k0;
  const mu = M / (a * (1 - e2/4 - 3*e2*e2/64));
  const lat = mu + (3*Math.sqrt(e2)/2 - 27*Math.pow(e2,1.5)/32)*Math.sin(2*mu);
  const C1  = e2*Math.cos(lat)*Math.cos(lat)/(1-e2);
  const T1  = Math.tan(lat)*Math.tan(lat);
  const N1  = a/Math.sqrt(1-e2*Math.sin(lat)*Math.sin(lat));
  const R1  = a*(1-e2)/Math.pow(1-e2*Math.sin(lat)*Math.sin(lat), 1.5);
  const D   = x/(N1*k0);
  const latDD = lat - (N1*Math.tan(lat)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*e2)*D*D*D*D/24);
  const lngDD = lon0*Math.PI/180 + (D-(1+2*T1+C1)*D*D*D/6)/Math.cos(lat);
  const latDeg = latDD * 180/Math.PI;
  const lngDeg = lngDD * 180/Math.PI;
  const res = document.getElementById('utm-result');
  res.style.display = 'block';
  res.textContent = `WGS84: ${latDeg.toFixed(7)}, ${lngDeg.toFixed(7)}`;
  S.map.flyTo([latDeg, lngDeg], 14);
  showToast('UTM converted → WGS84', 'g');
}

function buildBBox() {
  const N = parseFloat(document.getElementById('bb-n').value);
  const S2= parseFloat(document.getElementById('bb-s').value);
  const E = parseFloat(document.getElementById('bb-e').value);
  const W = parseFloat(document.getElementById('bb-w').value);
  if ([N,S2,E,W].some(isNaN)) { showToast('Invalid bounding box values', 'a'); return; }
  const coords = [[S2,W],[N,W],[N,E],[S2,E],[S2,W]];
  buildPolygonFromCoords(coords);
  closeModal('coord');
  S.map.fitBounds([[S2,W],[N,E]], { padding: [40,40] });
  showToast('Bounding box AOI created', 'g');
}

function importWKT() {
  const raw = document.getElementById('wkt-input').value.trim();
  const match = raw.match(/POLYGON\s*\(\s*\(([^)]+)\)/i);
  if (!match) { showToast('Invalid WKT POLYGON format', 'a'); return; }
  const coords = match[1].split(',').map(pair => {
    const [lng, lat] = pair.trim().split(/\s+/).map(parseFloat);
    return [lat, lng];
  }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
  if (coords.length < 3) { showToast('WKT has fewer than 3 valid points', 'a'); return; }
  buildPolygonFromCoords(coords);
  closeModal('coord');
  showToast('WKT polygon imported — ' + coords.length + ' vertices', 'g');
}

function buildCircleAOI() {
  const lat = parseFloat(document.getElementById('circ-lat').value);
  const lng = parseFloat(document.getElementById('circ-lng').value);
  const r   = parseFloat(document.getElementById('circ-r').value) || 500;
  if (isNaN(lat) || isNaN(lng)) { showToast('Invalid coordinates', 'a'); return; }
  S.aoiLayer.clearLayers();
  L.circle([lat, lng], { radius: r, color:'#38bdf8', fillOpacity:0.1, weight:2 }).addTo(S.aoiLayer);
  const areaHa = (Math.PI * r * r) / 10000;
  document.getElementById('sa-area').value = areaHa.toFixed(2);
  document.getElementById('sb-area').textContent = areaHa.toFixed(1) + ' ha';
  S.map.flyTo([lat, lng], 14);
  closeModal('coord');
  showToast(`Circle AOI: r=${r}m (${areaHa.toFixed(1)} ha)`, 'g');
}

function buildPolygonFromCoords(coords) {
  S.aoiLayer.clearLayers();
  const poly = L.polygon(coords, { color: '#38bdf8', fillOpacity: 0.1, weight: 2 });
  S.aoiLayer.addLayer(poly);
  const area = calcPolygonArea(coords.map(c => ({ lat: c[0], lng: c[1] })));
  document.getElementById('sa-area').value = area.toFixed(2);
  document.getElementById('sb-area').textContent = area.toFixed(1) + ' ha';
  S.map.fitBounds(poly.getBounds().pad(0.2));
  calcFlight();
}

/* ════════════════════════════════════════════════════════════════
   ANALYSIS TOOLS (RIGHT PANEL)
════════════════════════════════════════════════════════════════ */
function liveCalcGSD() {
  const alt   = parseFloat(document.getElementById('calc-alt').value)   || 120;
  const pxSz  = parseFloat(document.getElementById('calc-pxsz').value)  || 4.4;
  const focal = parseFloat(document.getElementById('calc-focal').value) || 35;
  const sensW = parseFloat(document.getElementById('calc-sensw').value) || 35.9;
  const gsd   = (alt * pxSz) / (focal * 10);
  const sw    = (sensW / focal) * alt;
  const el1   = document.getElementById('calc-gsd-v');
  const el2   = document.getElementById('calc-sw-v');
  if (el1) el1.textContent = gsd.toFixed(2);
  if (el2) el2.textContent = sw.toFixed(0);
}

function convertCoord() {
  const raw = document.getElementById('conv-dd').value.trim();
  const parts = raw.split(/[\s,]+/);
  if (parts.length < 2) { document.getElementById('conv-out').style.display='none'; return; }
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return;
  const dmsLat = decToDMS(lat, 'lat');
  const dmsLng = decToDMS(lng, 'lng');
  const out = document.getElementById('conv-out');
  out.style.display = 'block';
  out.innerHTML = `
    DD:  ${lat.toFixed(7)}, ${lng.toFixed(7)}<br>
    DMS: ${dmsLat}, ${dmsLng}<br>
    UTM: Zone 37${lat >= 0 ? 'N' : 'S'} (approx)
  `;
}

function decToDMS(dec, axis) {
  const neg = dec < 0;
  const d = Math.floor(Math.abs(dec));
  const m = Math.floor((Math.abs(dec) - d) * 60);
  const s = ((Math.abs(dec) - d - m/60) * 3600).toFixed(2);
  const dir = axis === 'lat' ? (neg ? 'S' : 'N') : (neg ? 'W' : 'E');
  return `${d}°${m}'${s}"${dir}`;
}

function liveCalcCoverage() {
  const area     = parseFloat(document.getElementById('cov-area').value) || 100;
  const cov      = parseFloat(document.getElementById('cov-pf').value)   || 200;
  const end      = parseFloat(document.getElementById('cov-end').value)  || 45;
  const flights  = Math.ceil(area / cov);
  const batts    = Math.ceil(flights * end / 40);   // assume 40min per battery
  const el1 = document.getElementById('cov-flights');
  const el2 = document.getElementById('cov-batt');
  if (el1) el1.textContent = flights;
  if (el2) el2.textContent = batts;
}

/* ════════════════════════════════════════════════════════════════
   EXPORTS
════════════════════════════════════════════════════════════════ */
function chkWP() {
  if (!S.waypoints.length) { showToast('Generate a flight plan first', 'a'); return false; }
  return true;
}

function dl(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

function getAlt() { return document.getElementById('fp-alt').value || 120; }
function getMission() { return document.getElementById('fp-name').value || 'AeroGIS_Mission'; }

function xGeoJSON() {
  if (!chkWP()) return;
  const alt = getAlt();
  const fc = {
    type: 'FeatureCollection',
    name: getMission(),
    generator: 'AeroGIS Pro v5',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    features: [
      { type: 'Feature', properties: { name: 'Flight Path', altitude_m: +alt }, geometry: { type: 'LineString', coordinates: S.waypoints.map(w => [+w.lng.toFixed(7), +w.lat.toFixed(7), +alt]) } },
      ...S.waypoints.map((w, i) => ({ type: 'Feature', properties: { seq: i+1, altitude_m: +alt }, geometry: { type: 'Point', coordinates: [+w.lng.toFixed(7), +w.lat.toFixed(7), +alt] } }))
    ]
  };
  dl(getMission() + '_' + datestamp() + '.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
  showToast('GeoJSON exported — ' + S.waypoints.length + ' waypoints', 'g');
}

function xKML() {
  if (!chkWP()) return;
  const alt = getAlt();
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${getMission()}</name>
  <description>Generated by AeroGIS Pro v5</description>
  <Style id="wp"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon></IconStyle></Style>
  <Placemark><name>Flight Path</name>
    <LineString><altitudeMode>relativeToGround</altitudeMode>
      <coordinates>${S.waypoints.map(w => `${w.lng.toFixed(7)},${w.lat.toFixed(7)},${alt}`).join('\n')}</coordinates>
    </LineString>
  </Placemark>
  ${S.waypoints.map((w,i) => `<Placemark><name>WP${String(i+1).padStart(3,'0')}</name><styleUrl>#wp</styleUrl>
    <Point><altitudeMode>relativeToGround</altitudeMode>
      <coordinates>${w.lng.toFixed(7)},${w.lat.toFixed(7)},${alt}</coordinates>
    </Point></Placemark>`).join('')}
</Document></kml>`;
  dl(getMission() + '_' + datestamp() + '.kml', kml, 'application/vnd.google-earth.kml+xml');
  showToast('KML exported', 'g');
}

function xCSV() {
  if (!chkWP()) return;
  const alt = getAlt();
  const rows = ['seq,lat,lng,altitude_m,action',
    ...S.waypoints.map((w,i) => `${i+1},${w.lat.toFixed(7)},${w.lng.toFixed(7)},${alt},${i===S.waypoints.length-1?'RTH':'WP'}`)];
  dl(getMission() + '_waypoints_' + datestamp() + '.csv', rows.join('\n'), 'text/csv');
  showToast('CSV exported — ' + S.waypoints.length + ' waypoints', 'g');
}

function xMissionPlanner() {
  if (!chkWP()) return;
  const alt = getAlt();
  const lines = ['QGC WPL 110', `0\t1\t0\t16\t0\t0\t0\t0\t${S.waypoints[0].lat}\t${S.waypoints[0].lng}\t${alt}\t1`];
  S.waypoints.forEach((w,i) => lines.push(`${i+1}\t0\t3\t16\t0\t0\t0\t0\t${w.lat.toFixed(7)}\t${w.lng.toFixed(7)}\t${alt}\t1`));
  lines.push(`${S.waypoints.length+1}\t0\t3\t20\t0\t0\t0\t0\t0\t0\t0\t1`); // RTL
  dl(getMission() + '_' + datestamp() + '.waypoints', lines.join('\n'), 'text/plain');
  showToast('Mission Planner .waypoints exported', 'g');
}

function xDJI() {
  if (!chkWP()) return;
  const alt = +getAlt();
  const speed = +document.getElementById('fp-speed').value || 10;
  const plan = {
    version: '1.0.0', author: 'AeroGIS Pro v5', createTime: Date.now(),
    missionConfig: { flyToWaylineMode: 'safely', finishAction: 'goHome', globalTransitionalSpeed: speed, globalRTHHeight: 50 },
    waylines: [{ waylineId: 0, autoFlightSpeed: speed, waypointArray: S.waypoints.map((w,i) => ({ waypointIndex: i, coordinate: [+w.lng.toFixed(7), +w.lat.toFixed(7)], executeHeight: alt, waypointSpeed: speed, waypointActions: i % 2 === 1 ? [{ actionType: 'takePhoto' }] : [] })) }]
  };
  dl(getMission() + '_DJIPilot2_' + datestamp() + '.json', JSON.stringify(plan, null, 2), 'application/json');
  showToast('DJI Pilot 2 mission exported', 'g');
}

function xLitchi() {
  if (!chkWP()) return;
  const alt = getAlt();
  const header = 'latitude,longitude,altitude(m),heading(deg),curvesize(m),rotationdir,gimbalmode,gimbalpitchangle,actiontype1,actionparam1,actiontype2,actionparam2';
  const rows = S.waypoints.map(w => `${w.lat.toFixed(7)},${w.lng.toFixed(7)},${alt},0,0,0,0,-90,1,0,-1,0`);
  dl(getMission() + '_litchi_' + datestamp() + '.csv', [header, ...rows].join('\n'), 'text/csv');
  showToast('Litchi Hub CSV exported', 'g');
}

function xGPX() {
  if (!chkWP()) return;
  const alt = getAlt();
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="AeroGIS Pro v5" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${getMission()}</name><trkseg>
    ${S.waypoints.map(w => `<trkpt lat="${w.lat.toFixed(7)}" lon="${w.lng.toFixed(7)}"><ele>${alt}</ele></trkpt>`).join('\n    ')}
  </trkseg></trk>
  ${S.waypoints.map((w,i) => `<wpt lat="${w.lat.toFixed(7)}" lon="${w.lng.toFixed(7)}"><ele>${alt}</ele><name>WP${String(i+1).padStart(3,'0')}</name></wpt>`).join('\n  ')}
</gpx>`;
  dl(getMission() + '_' + datestamp() + '.gpx', gpx, 'application/gpx+xml');
  showToast('GPX exported', 'g');
}

function xShapefile() {
  if (!chkWP()) return;
  // Shapefile requires binary format — export as GeoJSON with .shp note
  const note = '// Shapefile format requires server-side processing.\n// Import this GeoJSON into QGIS or ArcGIS and export as Shapefile.\n';
  xGeoJSON();
  showToast('Shapefile: import the GeoJSON into QGIS/ArcGIS to export .shp', 'a');
}

function exportAssessReport() {
  const result = document.getElementById('assess-result');
  if (!result || result.style.display === 'none') { showToast('Run a site assessment first', 'a'); return; }
  const name = document.getElementById('sa-name').value || 'Site';
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`<!DOCTYPE html><html><head><title>AeroGIS Site Assessment — ${name}</title>
    <style>body{font-family:Georgia,serif;padding:40px;max-width:800px;margin:0 auto;color:#111;}
    h1{color:#0c4a6e;border-bottom:2px solid #0c4a6e;padding-bottom:8px}
    .metric{display:inline-block;width:45%;margin:4px;padding:8px;border:1px solid #ddd;border-radius:4px;vertical-align:top}
    .val{font-size:16px;font-weight:700;color:#0c4a6e;font-family:monospace}
    .lbl{font-size:11px;color:#666;text-transform:uppercase}
    .rec{padding:4px 0;border-bottom:1px solid #eee}
    @media print{body{padding:20px}}</style></head><body>
    <h1>🗺 AeroGIS Pro v5 — Site Assessment Report</h1>
    <p><strong>Site:</strong> ${name} &nbsp; <strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
    <div>${result.innerHTML}</div>
    <hr><p style="font-size:11px;color:#999">Generated by AeroGIS Pro v5 · Aerial Survey Intelligence Platform · For planning purposes only</p>
    <script>window.print();<\/script></body></html>`);
    win.document.close();
  }
}

function exportMasterPlan() {
  showToast('Master Plan: Run Site Assessment first, then use the Export panel', 'a');
}

function exportGeoJSONZones() {
  const result = document.getElementById('assess-result');
  if (!result || result.style.display === 'none') { showToast('Run a site assessment first', 'a'); return; }
  const bounds = S.map.getBounds();
  const fc = {
    type: 'FeatureCollection', name: 'AeroGIS_Zones_' + datestamp(),
    features: [{
      type: 'Feature',
      properties: { zone: 'Study Area', source: 'AeroGIS Pro v5', date: new Date().toISOString() },
      geometry: { type: 'Polygon', coordinates: [[
        [bounds.getWest(), bounds.getSouth()], [bounds.getEast(), bounds.getSouth()],
        [bounds.getEast(), bounds.getNorth()], [bounds.getWest(), bounds.getNorth()],
        [bounds.getWest(), bounds.getSouth()]
      ]]}
    }]
  };
  dl('AeroGIS_Zones_' + datestamp() + '.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
  showToast('GeoJSON zones exported', 'g');
}

function exportDroneLog() { exportLogCSV(); }

/* ════════════════════════════════════════════════════════════════
   UI UTILITIES
════════════════════════════════════════════════════════════════ */
function sv(id, suffix) {
  const el = document.getElementById(id + '-v');
  if (el) el.textContent = document.getElementById(id).value + suffix;
}

function switchRTab(tab) {
  document.querySelectorAll('.rp-tab').forEach((t, i) => {
    const tabs = ['flight','telem','analysis'];
    t.classList.toggle('on', tabs[i] === tab);
  });
  document.querySelectorAll('.rp-panel').forEach(p => p.classList.remove('on'));
  const el = document.getElementById('rp-' + tab);
  if (el) el.classList.add('on');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function toggleSW(el) { el.classList.toggle('on'); }

function setStatus(msg, type) {
  const el = document.getElementById('sb-status');
  if (!el) return;
  el.textContent = msg;
  el.className = type ? type : '';
}

/* ── MODAL SYSTEM ────────────────────────────────────────────── */
function openModal(id) {
  const m = document.getElementById('modal-' + id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById('modal-' + id);
  if (m) m.classList.remove('open');
}
window.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

/* ── TOAST ───────────────────────────────────────────────────── */
function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  const icon = { g: '✅', a: '⚠', r: '🚫', b: 'ℹ' }[type] || 'ℹ';
  t.textContent = icon + ' ' + msg;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3000);
}

/* ── ALERTS ──────────────────────────────────────────────────── */
function showAlert(msg, type) {
  const bar = document.getElementById('alert-bar');
  const id  = 'al' + Date.now();
  const div = document.createElement('div');
  div.className = 'alert-item ' + (type || 'b');
  div.id = id;
  const icons = { r: '🚫', a: '⚠', g: '✅', b: 'ℹ' };
  div.innerHTML = `<span>${icons[type] || 'ℹ'}</span><div style="flex:1;font-size:11px">${msg}</div><span class="alert-x" onclick="document.getElementById('${id}').remove()">✕</span>`;
  bar.appendChild(div);
  setTimeout(() => { const el = document.getElementById(id); if (el) el.remove(); }, 8000);
}

/* ── UTC CLOCK ───────────────────────────────────────────────── */
function startUTCClock() {
  const tick = () => {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2,'0');
    const m = String(now.getUTCMinutes()).padStart(2,'0');
    const s = String(now.getUTCSeconds()).padStart(2,'0');
    const el = document.getElementById('utc-clock');
    if (el) el.textContent = h + ':' + m + ':' + s + ' UTC';
  };
  tick();
  setInterval(tick, 1000);
}

function datestamp() {
  return new Date().toISOString().slice(0,10).replace(/-/g,'');
}

/* ── CONNECTION METHOD HANDLER ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('conn-method');
  if (sel) {
    sel.addEventListener('change', () => {
      const wifiOpts = document.getElementById('conn-wifi-opts');
      if (wifiOpts) wifiOpts.style.display = ['wifi','mavlink'].includes(sel.value) ? 'block' : 'none';
    });
  }
});

function openFlightRadar() {
  const c = S.map.getCenter(), z = S.map.getZoom();
  window.open(`https://www.flightradar24.com/${c.lat.toFixed(4)},${c.lng.toFixed(4)}/${z}`, '_blank');
  showToast('Opening FlightRadar24 for current map area', 'b');
}

function openADSBLol() {
  const c = S.map.getCenter();
  window.open(`https://adsb.lol/?lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&zoom=10`, '_blank');
  showToast('Opening ADSB.lol live feed', 'b');
}
