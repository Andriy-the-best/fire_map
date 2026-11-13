// Карта Leaflet: країни, області, міста й села, кольорові точки, клік по місцю, бічна панель.
const map = L.map("map", { minZoom: 2, worldCopyJump: true, markerZoomAnimation: false }).setView([30, 10], 2);

// ---------- Справжня карта (без ключів) ----------
const SHOW_LABELS = false;   // на справжній карті підписи вже є; true — повернути наші
const baseMaps = {
  "Карта / Map": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
  "Супутник / Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18, attribution: "Tiles &copy; Esri" }),
  "Рельєф / Terrain": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17, attribution: '&copy; OpenStreetMap, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>' })
};
baseMaps["Карта / Map"].addTo(map);
L.control.layers(baseMaps, null, { position: "topright", collapsed: true }).addTo(map);

// ---------- Підписи на карті ----------
const labels = [];   // усі підписи (країни, міста, області, села)

function prop(p, k) { return p[k] ?? p[k.toLowerCase()] ?? p[k.toUpperCase()]; }

// prio: що менше число, то важливіший підпис (при накладанні лишається важливіший)
function addLabel(lat, lng, o, cls, prio) {
  if (!SHOW_LABELS) return;
  o.prio = prio; o.lat = lat; o.lng = lng;
  o.marker = L.marker([lat, lng], {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: "lbl " + cls, html: "<span></span>", iconSize: [0, 0] })
  }).addTo(map);
  labels.push(o);
}

function nameOf(o) { return lang === "uk" ? (o.uk || o.en) : o.en; }

// Показує потрібні підписи: лише для цього масштабу й лише ті, що зараз на екрані
function updateCountryLabels() {
  const z = map.getZoom();
  map.getContainer().style.setProperty("--z", z);   // CSS бере розмір шрифту звідси
  const view = map.getBounds().pad(0.25);
  labels.forEach(o => {
    const el = o.marker.getElement();
    if (!el) return;
    const show = z >= o.minZoom && z <= o.maxZoom && view.contains([o.lat, o.lng]);
    el.style.display = show ? "" : "none";
    if (show) {
      const n = nameOf(o);
      if (o.last !== n) { el.firstChild.textContent = n; o.last = n; }
    }
    o.shown = show;
  });
  declutter();
}

// Не частіше одного разу на кадр (щоб карта не гальмувала під час руху)
let labelTick = false;
function scheduleLabels() {
  if (labelTick) return;
  labelTick = true;
  requestAnimationFrame(() => { labelTick = false; updateCountryLabels(); });
}

// Ховає підписи, які налізають на важливіші (як у Google Maps)
function declutter() {
  const placed = [];
  const box = r => ({ l: r.left - 4, r: r.right + 4, t: r.top - 2, b: r.bottom + 2 });
  document.querySelectorAll(".leaflet-tooltip.city-label").forEach(el => placed.push(box(el.getBoundingClientRect())));
  labels.filter(o => o.shown).sort((a, b) => a.prio - b.prio).forEach(o => {
    const el = o.marker.getElement(), b = box(el.firstChild.getBoundingClientRect());
    const hit = placed.some(p => b.l < p.r && b.r > p.l && b.t < p.b && b.b > p.t);
    el.style.visibility = hit ? "hidden" : "visible";
    if (!hit) placed.push(b);
  });
}

// Центр і межі найбільшої частини країни
function labelSpot(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let best = { area: -1 };
  polys.forEach(poly => {
    let w = 180, e = -180, s = 90, n = -90;
    poly[0].forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); });
    const area = (e - w) * (n - s);
    if (area > best.area) best = { area, lat: (s + n) / 2, lng: (w + e) / 2, bounds: L.latLngBounds([s, w], [n, e]) };
  });
  return best;
}

let landFeats = [];       // контури країн: за ними визначаємо, чи клікнули на суші
const countryList = [];   // для завантаження областей інших країн
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";

// Країни: контури + назви
fetch(NE + "ne_110m_admin_0_countries.geojson")
  .then(r => r.json())
  .then(g => {
    landFeats = g.features;
    L.geoJSON(g, {
      style: { fill: false, color: "#6b5b4b", weight: 1.2, opacity: 0.8 },
      interactive: false
    }).addTo(map);
    g.features.forEach(f => {
      const s = labelSpot(f.geometry);
      const minZoom = s.area > 300 ? 2 : s.area > 60 ? 3 : s.area > 15 ? 4 : 5;
      const p = f.properties;
      addLabel(s.lat, s.lng, { en: prop(p, "NAME_EN") || prop(p, "NAME"), uk: prop(p, "NAME_UK"), minZoom, maxZoom: 7 }, "country", 2);
      countryList.push({ iso: prop(p, "ADM0_A3"), bounds: s.bounds });
    });
    updateCountryLabels();
  })
  .catch(e => console.error("countries", e));

// Великі міста світу (Natural Earth): столиці видно раніше
fetch(NE + "ne_50m_populated_places.geojson")
  .then(r => r.json())
  .then(g => {
    g.features.forEach(f => {
      const p = f.properties, [lng, lat] = f.geometry.coordinates;
      if (nearDot(lat, lng, 0.7)) return;   // міста з кольоровими точками мають свої підписи
      const pop = prop(p, "POP_MAX") || 0, kind = String(prop(p, "FEATURECLA") || "");
      const cap = /Admin-0 capital/i.test(kind), reg = /Admin-1 capital/i.test(kind);
      if (!cap && !reg && pop < 3e5) return;   // дрібні міста не завантажуємо: так легше
      const minZoom = cap || pop > 5e6 ? 3 : pop > 1.5e6 ? 4 : reg || pop > 5e5 ? 5 : 6;
      addLabel(lat, lng, { en: prop(p, "NAME"), uk: prop(p, "NAME_UK"), minZoom, maxZoom: 18, ne: true },
               "city" + (cap ? " cap" : reg ? " reg" : ""), cap ? 1 : minZoom <= 4 ? 3 : reg ? 4 : 5);
    });
    updateCountryLabels();
    loadCapitals(g);
  })
  .catch(e => console.error("cities", e));

// ---------- Області України: контури завжди на карті ----------
const UA_BASE = "https://raw.githubusercontent.com/EugeneBorshch/ukraine_geojson/master/UA_";
const UA_REGIONS = [   // [файл, назва українською, назва англійською]
  ["05_Vinnytska","Вінницька область","Vinnytsia Oblast"], ["07_Volynska","Волинська область","Volyn Oblast"],
  ["09_Luhanska","Луганська область","Luhansk Oblast"], ["12_Dnipropetrovska","Дніпропетровська область","Dnipropetrovsk Oblast"],
  ["14_Donetska","Донецька область","Donetsk Oblast"], ["18_Zhytomyrska","Житомирська область","Zhytomyr Oblast"],
  ["21_Zakarpatska","Закарпатська область","Zakarpattia Oblast"], ["23_Zaporizka","Запорізька область","Zaporizhzhia Oblast"],
  ["26_Ivano_Frankivska","Івано-Франківська область","Ivano-Frankivsk Oblast"], ["32_Kyivska","Київська область","Kyiv Oblast"],
  ["35_Kirovohradska","Кіровоградська область","Kirovohrad Oblast"], ["43_Avtonomna_Respublika_Krym","АР Крим","Crimea"],
  ["46_Lvivska","Львівська область","Lviv Oblast"], ["48_Mykolaivska","Миколаївська область","Mykolaiv Oblast"],
  ["51_Odeska","Одеська область","Odesa Oblast"], ["53_Poltavska","Полтавська область","Poltava Oblast"],
  ["56_Rivnenska","Рівненська область","Rivne Oblast"], ["59_Sumska","Сумська область","Sumy Oblast"],
  ["61_Ternopilska","Тернопільська область","Ternopil Oblast"], ["63_Kharkivska","Харківська область","Kharkiv Oblast"],
  ["65_Khersonska","Херсонська область","Kherson Oblast"], ["68_Khmelnytska","Хмельницька область","Khmelnytskyi Oblast"],
  ["71_Cherkaska","Черкаська область","Cherkasy Oblast"], ["74_Chernihivska","Чернігівська область","Chernihiv Oblast"],
  ["77_Chernivetska","Чернівецька область","Chernivtsi Oblast"]
];
const OBL_OFF = { fill: false, color: "#4a4a4a", weight: 1.4, dashArray: "6 4", opacity: 0.9 };
const OBL_ON  = { fill: true, fillColor: "#f0a21e", fillOpacity: 0.22, color: "#f0a21e", weight: 2.5, dashArray: null, opacity: 1 };
const oblasts = [];                           // { layer, geoms }
const oblRenderer = L.canvas({ padding: 0.5 }); // canvas легший за SVG

UA_REGIONS.forEach(([file, uk, en]) =>
  fetch(UA_BASE + file + ".geojson").then(r => r.json()).then(g => {
    const layer = L.geoJSON(g, { style: OBL_OFF, interactive: false, renderer: oblRenderer }).addTo(map);
    oblasts.push({ layer, g });
    const c = layer.getBounds().getCenter();
    addLabel(c.lat, c.lng, { en, uk, minZoom: 6, maxZoom: 10 }, "region", 3.5);
    scheduleLabels();
  }).catch(e => console.error("oblast", file, e))
);

// Чи лежить точка всередині полігона (метод променя)
function inRing(ring, x, y) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inPolygon(poly, x, y) { return inRing(poly[0], x, y) && !poly.slice(1).some(h => inRing(h, x, y)); }
function inGeom(geom, x, y) {
  if (!geom) return false;
  if (geom.type === "Polygon") return inPolygon(geom.coordinates, x, y);
  if (geom.type === "MultiPolygon") return geom.coordinates.some(p => inPolygon(p, x, y));
  if (geom.type === "GeometryCollection") return geom.geometries.some(q => inGeom(q, x, y));
  return false;
}
function findOblast(lat, lon) {
  return oblasts.find(o => (o.g.features || [o.g]).some(f => inGeom(f.geometry || f, lon, lat)));
}

map.on("zoomend", () => { scheduleLabels(); refreshTooltips(); });
map.on("moveend", scheduleLabels);

map.setMaxBounds([[-85, -200], [85, 200]]);   // щоб не з'їжджати за край світу

// ---------- Великі міста з кольоровими точками ----------
// [укр, англ, широта, довгота]
const CITIES = [
  ["Київ","Kyiv",50.45,30.52], ["Осло","Oslo",59.91,10.75], ["Мадрид","Madrid",40.42,-3.70],
  ["Афіни","Athens",37.98,23.73], ["Стамбул","Istanbul",41.01,28.98], ["Каїр","Cairo",30.04,31.24],
  ["Найробі","Nairobi",-1.29,36.82], ["Йоганнесбург","Johannesburg",-26.20,28.05], ["Делі","Delhi",28.61,77.21],
  ["Пекін","Beijing",39.90,116.40], ["Токіо","Tokyo",35.68,139.69], ["Бангкок","Bangkok",13.76,100.50],
  ["Сідней","Sydney",-33.87,151.21], ["Перт","Perth",-31.95,115.86], ["Лос-Анджелес","Los Angeles",34.05,-118.24],
  ["Торонто","Toronto",43.65,-79.38], ["Мехіко","Mexico City",19.43,-99.13],
  ["Ріо-де-Жанейро","Rio de Janeiro",-22.91,-43.17], ["Буенос-Айрес","Buenos Aires",-34.60,-58.38]
];
const nearDot = (lat, lng, d) => CITIES.some(c => Math.abs(c[2] - lat) < d && Math.abs(c[3] - lng) < d);
const cityDots = [];
const picked = L.layerGroup().addTo(map);
const regionGroup = L.layerGroup().addTo(map);   // контур обраного регіону
let selected = null; // обране місце в звичайному режимі

const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const panel = document.getElementById("panel");

function dot(lat, lon, lvl, radius, weight, renderer) {
  const o = { radius, weight, color: "#fff", fillColor: COLORS[lvl], fillOpacity: 0.92 };
  if (renderer) o.renderer = renderer;          // багато точок малюємо на canvas: так значно легше для браузера
  else o.className = "hot-dot l" + lvl;         // окремі точки — SVG зі стилями (сяйво, пульсація) з style.css
  return L.circleMarker([lat, lon], o);
}

// Завантажує всі міста одним запитом і фарбує точки
async function loadCities() {
  try {
    const list = await getWeather(CITIES.map(c => [c[2], c[3]]));
    list.forEach((w, i) => {
      const c = CITIES[i], r = analyse(w);
      const d = dot(c[2], c[3], r.lvl, 9, 2);
      d.on("click", e => { L.DomEvent.stopPropagation(e); pick(c[2], c[3], lang === "uk" ? c[0] : c[1]); });
      cityDots.push({ d, c, lvl: r.lvl });
    });
    applyHotFilter(); refreshTooltips();
  } catch (e) { console.error(e); }
}

// Від масштабу 3 назви міст видно постійно, на далекому масштабі — при наведенні
function refreshTooltips() {
  refreshHotCtl();
  const show = map.getZoom() >= 3;
  cityDots.forEach(o => {
    const name = lang === "uk" ? o.c[0] : o.c[1];
    o.d.unbindTooltip();
    o.d.bindTooltip(show ? name : `${name}: ${t("levels")[o.lvl]}`,
      { permanent: show, direction: "right", offset: [10, 0], className: "city-label" });
  });
}

// ---------- Найнебезпечніші місця: столиці та міста-мільйонники, фільтр за рівнем ----------
// Адреса власного сервера (папка server). Порожній рядок "" = без сервера, тоді беремо міста напряму з Open-Meteo.
// Локально: "http://localhost:3000". Після розміщення сервера в інтернеті встав сюди його адресу.
const HOTSPOTS_API = "http://localhost:3000";
const capDots = [];
const HOT_CELL = 2;               // у кожній клітинці 2°×2° лишаємо найбільше місто
const HOT_MAX = 300;              // не більше 300 місць: інакше Open-Meteo блокує запити
let hotMin = 3;                   // показуємо рівні від hotMin (0..4); 3 = «4 з 5» і вище
let hotCtl = null;
const HOT_CACHE = "hotRisk-v4", HOT_TTL = 3 * 3600e3;   // кеш у браузері на 3 години

const hotRenderer = L.canvas({ padding: 0.5 });
const ZONE_ZOOM = 5;          // від цього масштабу замість точок малюється м'яка «тепло-карта»
const ZONE_KM = 190;          // скільки кілометрів розтікається колір навколо точки сітки
const zoneMode = () => map.getZoom() >= ZONE_ZOOM;

function styleHot(o) {
  o.d.setStyle({ stroke: true, color: "#fff", weight: 1.2, fillOpacity: 0.92 });
  o.d.setRadius(4 + o.lvl);
}

function addHot(c) {
  const d = dot(c.lat, c.lng, c.lvl, 4 + c.lvl, 1.2, hotRenderer);
  d.on("click", ev => {
    L.DomEvent.stopPropagation(ev);
    pick(c.lat, c.lng, c.near ? null : (lang === "uk" ? c.uk : c.en));
  });
  // підказка створюється лише при наведенні й одразу в потрібній мові
  d.bindTooltip(() => (c.near ? t("near") + " " : "") + (lang === "uk" ? c.uk : c.en) + ": " + t("levels")[c.lvl],
    { direction: "top", offset: [0, -6], className: "city-label" });
  const o = { d, c, lvl: c.lvl };
  capDots.push(o);
  styleHot(o);
}

async function loadCapitals(g) {
  // 1) Власний сервер: готові небезпечні точки по всій суші, без запитів до Open-Meteo з браузера
  if (HOTSPOTS_API) {
    try {
      const r = await fetch(HOTSPOTS_API + "/api/hotspots?min=" + hotMin);
      if (!r.ok) throw new Error("server " + r.status);
      const j = await r.json();
      j.points.sort((a, b) => a.lvl - b.lvl).forEach(p => {
        const xy = `${p.lat}, ${p.lng}`;
        addHot({ lat: p.lat, lng: p.lng, lvl: p.lvl, en: p.en || xy, uk: p.uk || xy, near: !!p.en });
      });
      console.info("hotspots from server:", j.count, "of", j.total, "updated", j.updated);
      applyHotFilter(); refreshTooltips();
      return;
    } catch (e) { console.warn("сервер недоступний — беру міста напряму з Open-Meteo", e); }
  }
  // 2) Запасний варіант без сервера
  // Беремо всі міста з бази (не лише столиці): по одному найбільшому в кожній клітинці 2°×2°, але не більше HOT_MAX
  const places = [], seen = new Set(), cells = new Set();
  const feats = g.features.slice().sort((a, b) => (prop(b.properties, "POP_MAX") || 0) - (prop(a.properties, "POP_MAX") || 0));
  feats.forEach(f => {
    const p = f.properties, [lng, lat] = f.geometry.coordinates;
    const isCap = /Admin-0 capital/i.test(String(prop(p, "FEATURECLA") || ""));
    const cell = Math.floor(lat / HOT_CELL) + "," + Math.floor(lng / HOT_CELL);
    if (!isCap && cells.has(cell)) return;
    if (nearDot(lat, lng, 0.7)) return;                     // там уже є велика точка міста
    const key = lat.toFixed(1) + "," + lng.toFixed(1);
    if (seen.has(key)) return;
    seen.add(key); cells.add(cell);
    places.push({ en: prop(p, "NAME"), uk: prop(p, "NAME_UK") || prop(p, "NAME"), lat, lng });
  });
  places.length = Math.min(places.length, HOT_MAX);

  let cached = null;
  try {
    const c = JSON.parse(localStorage.getItem(HOT_CACHE));
    if (c && Date.now() - c.t < HOT_TTL && c.n === places.length) cached = c.d;
  } catch (e) {}

  if (cached) {
    cached.forEach(addHot);
  } else {
    const all = [];
    for (let i = 0; i < places.length; i += 40) {           // по 40 місць за запит, точки з'являються поступово
      const part = places.slice(i, i + 40);
      try {
        const list = await getWeather(part.map(c => [c.lat, c.lng]));
        list.forEach((w, k) => { const c = Object.assign({}, part[k], { lvl: analyse(w).lvl }); all.push(c); addHot(c); });
      } catch (e) { console.error("hotspots", e); break; }   // при помилці (ліміт) одразу зупиняємось і не повторюємо
      applyHotFilter(); refreshHotCtl();
      if (i + 40 < places.length) await new Promise(r => setTimeout(r, 3000));
    }
    // зберігаємо навіть частковий результат, щоб оновлення сторінки не витрачало запити знову
    try { localStorage.setItem(HOT_CACHE, JSON.stringify({ t: Date.now(), n: places.length, d: all })); } catch (e) {}
  }
  console.info("hotspots loaded:", capDots.length, "of", places.length);
  applyHotFilter(); refreshTooltips();
}

function applyHotFilter() {
  capDots.forEach(styleHot);
  // На далекому масштабі в кожній клітинці лишаємо лише найнебезпечнішу точку: менше точок — легше сайту
  const z = map.getZoom(), cell = z <= 2 ? 10 : z === 3 ? 6 : z === 4 ? 3 : 0;
  const all = (zoneMode() ? cityDots : cityDots.concat(capDots)).filter(o => o.lvl >= hotMin);
  let keep = new Set(all);
  if (cell) {
    const best = new Map();
    all.forEach(o => {
      const ll = o.d.getLatLng(), k = Math.floor(ll.lat / cell) + "," + Math.floor(ll.lng / cell), b = best.get(k);
      if (!b || o.lvl > b.lvl) best.set(k, o);
    });
    keep = new Set(best.values());
  }
  cityDots.concat(capDots).forEach(o => {
    if (keep.has(o)) { if (!map.hasLayer(o.d)) o.d.addTo(map); }
    else if (map.hasLayer(o.d)) map.removeLayer(o.d);
  });
  drawHeat();
}
map.on("zoomend", applyHotFilter);

// Під час збільшення Leaflet розтягує точки разом із картою, а потім вони «стрибають» назад до свого розміру.
// Щоб цього не було видно, на час анімації ховаємо обране місце й м'яко гасимо точки.
function fadeHot(on) {
  const c = hotRenderer._container;
  if (c) { c.style.transition = "opacity .15s"; c.style.opacity = on ? 1 : 0; }
  heatCanvas.style.opacity = on ? 1 : 0;
}
map.on("zoomstart", () => map.removeLayer(picked));
map.on("zoomanim", () => fadeHot(false));
map.on("zoomend", () => { map.addLayer(picked); drawHeat(); fadeHot(true); });

// ---------- Тепло-карта для великих масштабів: м'які плями без видимої сітки, обрізані по суші ----------
const HEAT_RGB = ["61,220,132", "242,225,46", "255,177,51", "255,90,36", "255,45,63"];
const heatCanvas = document.createElement("canvas");
heatCanvas.style.cssText = "position:absolute;pointer-events:none;transition:opacity .15s";
map.createPane("heat").style.zIndex = 250;      // над плитками карти (200), під лініями й точками (400+)
map.getPane("heat").appendChild(heatCanvas);
let heatQueued = false;
function drawHeat() {
  heatQueued = false;
  const size = map.getSize(), dpr = window.devicePixelRatio || 1;
  if (heatCanvas.width !== size.x * dpr || heatCanvas.height !== size.y * dpr) {
    heatCanvas.width = size.x * dpr; heatCanvas.height = size.y * dpr;
    heatCanvas.style.width = size.x + "px"; heatCanvas.style.height = size.y + "px";
  }
  L.DomUtil.setPosition(heatCanvas, map.containerPointToLayerPoint([0, 0]));   // полотно завжди накриває видиму частину карти
  const ctx = heatCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.x, size.y);
  if (!zoneMode() || !capDots.length) return;
  ctx.save();
  if (landFeats.length) {                                   // малюємо лише над сушею
    ctx.beginPath();
    landFeats.forEach(f => {
      const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      polys.forEach(rings => rings.forEach(ring => ring.forEach(([x, y], i) => {
        const p = map.latLngToContainerPoint([y, x]);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      })));
    });
    ctx.clip("evenodd");
  }
  const z = map.getZoom();
  capDots.filter(o => o.lvl >= hotMin).sort((a, b) => a.lvl - b.lvl).forEach(o => {
    const p = map.latLngToContainerPoint([o.c.lat, o.c.lng]);
    const r = Math.max(24, 1.7 * ZONE_KM * 1000 / (156543.03 * Math.cos(o.c.lat * Math.PI / 180) / Math.pow(2, z)));
    if (p.x < -r || p.y < -r || p.x > size.x + r || p.y > size.y + r) return;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(${HEAT_RGB[o.lvl]},.5)`);
    g.addColorStop(0.55, `rgba(${HEAT_RGB[o.lvl]},.24)`);
    g.addColorStop(1, `rgba(${HEAT_RGB[o.lvl]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
  });
  ctx.restore();
}
const queueHeat = () => { if (!heatQueued) { heatQueued = true; requestAnimationFrame(drawHeat); } };
map.on("move resize", queueHeat);

// Підпис на карті: показуємо лише небезпечні місця (рівень 4–5)
const hotControl = L.control({ position: "topright" });
hotControl.onAdd = () => {
  hotCtl = L.DomUtil.create("div", "hot-ctl");
  L.DomEvent.disableClickPropagation(hotCtl);
  hotCtl.innerHTML = "<b></b><span></span>";
  refreshHotCtl();
  return hotCtl;
};
hotControl.addTo(map);
function refreshHotCtl() {
  if (!hotCtl) return;
  hotCtl.querySelector("b").textContent = t("hotTitle");
  hotCtl.querySelector("span").textContent = `${t("hotShown")}: ${cityDots.concat(capDots).filter(o => o.lvl >= hotMin).length}`;
}

// Рядки з даними — спільні для звичайної панелі й порівняння
function rows(p) {
  return [
    [t("temp"), Math.round(p.temp) + " °C"], [t("hum"), Math.round(p.hum) + " %"],
    [t("wind"), p.wind.toFixed(1) + " " + t("ms")], [t("dry"), p.dry], [t("idx"), p.G]
  ];
}
function gauge(lvl) {
  return '<div class="gauge">' + COLORS.map((c, i) => `<i style="background:${i <= lvl ? c : "#e3e6e0"}"></i>`).join("") + "</div>";
}

// Екстрені номери: [пожежна служба, єдиний екстрений номер]. null = такого окремого номера немає.
const EMERG = {
  ua:["101","112"], pl:["998","112"], ro:[null,"112"], de:[null,"112"], fr:["18","112"], es:[null,"112"], it:["115","112"],
  gb:["999","112"], ie:["999","112"], pt:[null,"112"], gr:["199","112"], tr:["110","112"], nl:[null,"112"], be:[null,"112"],
  at:["122","112"], ch:["118","112"], cz:["150","112"], sk:["150","112"], hu:["105","112"], bg:[null,"112"], hr:["193","112"],
  rs:["193","112"], si:[null,"112"], se:[null,"112"], fi:[null,"112"], dk:[null,"112"], no:["110","112"], is:[null,"112"],
  lt:[null,"112"], lv:[null,"112"], ee:[null,"112"], lu:[null,"112"], cy:[null,"112"], mt:[null,"112"], md:[null,"112"],
  al:["128","112"], ba:["123","112"], mk:["193","112"], me:["123","112"],
  ru:["101","112"], by:["101","112"], kz:["101","112"], ge:[null,"112"], am:["101","112"], az:[null,"112"],
  us:[null,"911"], ca:[null,"911"], mx:[null,"911"], br:["193",null], ar:["100",null], cl:["132",null], co:[null,"123"], pe:["116",null],
  au:[null,"000"], nz:[null,"111"], jp:["119",null], cn:["119",null], kr:["119",null], in:["101","112"],
  id:["113","112"], ph:[null,"911"], th:["199",null], vn:["114",null], my:["994","999"],
  il:["102","112"], sa:["998","911"], ae:["997","999"], eg:["180","122"]
};
function emergLine(cc) {
  const e = EMERG[cc];
  if (!e) return t("emerg");                                   // країни немає в списку — загальна підказка
  return [e[0] && `${t("emFire")}: ${e[0]}`, e[1] && `${t("emGen")}: ${e[1]}`].filter(Boolean).join(" · ");
}

// Посилання на симулятор: умови з карти передаються в адресі сторінки
function simUrl(p) {
  const q = new URLSearchParams({ lat: p.lat, lon: p.lon, temp: Math.round(p.temp), hum: Math.round(p.hum),
    wind: (+p.wind).toFixed(1), dir: Math.round(p.dir == null ? 270 : p.dir), name: p.name, lang });
  return "simulator.html?" + q;
}

function renderSingle() {
  if (!selected) { panel.innerHTML = `<p class="hint">${t("hint")}</p>`; return; }
  const p = selected;
  const kindName = p.kind ? t("kind_" + p.kind) : null;
  const where = [kindName, p.region && p.region !== p.name ? p.region : null, p.country].filter(Boolean).join(" · ");
  panel.innerHTML = `<h2>${esc(p.name)}</h2>${where ? `<p class="where">${esc(where)}</p>` : ""}${gauge(p.lvl)}
    <p class="level" style="color:${COLORS[p.lvl]}">${t("levels")[p.lvl]} · ${p.lvl + 1}/5</p>
    <dl>${rows(p).map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join("")}</dl>
    <p class="advice">${t("advice")[p.lvl]}</p><a class="sim-link" href="${simUrl(p)}">${t("simHere")}</a><p class="emerg">${emergLine(p.cc)}</p>`;
}
function render() { compareMode ? renderCompare() : renderSingle(); }

// Яка велика точка міста вже стоїть поруч? (щоб не було двох точок на одному місці)
// deg — пошук у градусах (для пошуку міста); без нього — у пікселях на екрані (для кліків)
function nearCityDot(lat, lon, deg) {
  let best = null, bestD = Infinity;
  cityDots.concat(zoneMode() ? [] : capDots).filter(o => map.hasLayer(o.d)).forEach(o => {   // зблизька зони не чіпаємо
    const ll = o.d.getLatLng();
    const d = deg
      ? (Math.abs(ll.lat - lat) < deg && Math.abs(ll.lng - lon) < deg ? Math.hypot(ll.lat - lat, ll.lng - lon) : Infinity)
      : map.latLngToContainerPoint(ll).distanceTo(map.latLngToContainerPoint([lat, lon])) < 16
        ? Math.hypot(ll.lat - lat, ll.lng - lon) : Infinity;
    if (d < bestD) { bestD = d; best = o; }
  });
  return best;
}

// Показує на карті обведені точки й підсвічує область обраних місць
function markPicked(list) {
  picked.clearLayers(); regionGroup.clearLayers();
  cityDots.forEach(o => o.d.setStyle({ opacity: 1, fillOpacity: 0.9 }));   // повертаємо всі точки міст
  capDots.forEach(o => { o.d.setStyle({ opacity: 1 }); styleHot(o); });
  oblasts.forEach(o => o.layer.setStyle(OBL_OFF));
  list.filter(Boolean).forEach(p => {
    const ob = findOblast(p.lat, p.lon);
    if (ob) { ob.layer.setStyle(OBL_ON); ob.layer.bringToFront(); }
    else if (p.geo) L.geoJSON(p.geo, { style: { color: "#f0a21e", weight: 2.5, fillColor: "#f0a21e", fillOpacity: 0.22 }, interactive: false }).addTo(regionGroup);
  });
  list.filter(Boolean).forEach(p => {
    const c = nearCityDot(p.lat, p.lon, p.snap ? 0.15 : 0);
    let pos = L.latLng(p.lat, p.lon);
    if (c) { pos = c.d.getLatLng(); c.d.setStyle({ opacity: 0, fillOpacity: 0 }); }   // мала точка міста ховається
    L.circleMarker(pos, { radius: 13, weight: 2.5, fill: false, interactive: false, className: "sel-ring l" + p.lvl }).addTo(picked);   // хвиля навколо обраного місця
    dot(pos.lat, pos.lng, p.lvl, 13, 3).setStyle({ color: "#1d2327" }).addTo(picked);
  });
}

// Який це населений пункт і область? (OpenStreetMap Nominatim, 1 запит на клік)
// withPolygon — просимо контур області лише там, де в нас немає власних меж
async function getRegion(lat, lon, withPolygon) {
  const base = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1" +
    `&accept-language=${lang}&lat=${lat}&lon=${lon}`;
  const out = {};
  try {
    const r = await (await fetch(base + "&zoom=14")).json();
    const a = r.address || {};
    out.settlement = a.village || a.town || a.city || a.municipality || a.hamlet || a.suburb || a.city_district || a.county;
    out.kind = a.village ? "village" : a.town ? "town" : a.city ? "city" : a.hamlet ? "hamlet" : null;
    out.region = a.state || a.region;
    out.country = a.country;
    out.cc = (a.country_code || "").toLowerCase();
  } catch (e) { console.error("settlement", e); }
  if (withPolygon) {
    try {
      const r = await (await fetch(base + "&zoom=5&polygon_geojson=1&polygon_threshold=0.02")).json();
      out.geo = r.geojson;
      if (!out.region) out.region = (r.address || {}).state || r.name;
    } catch (e) { console.error("region", e); }
  }
  return out;
}

// Головна дія: отримати погоду й регіон для точки й показати
// Клік у морі: ризик не рахуємо, лише пояснюємо
function showSea() {
  if (compareMode) { renderCompare(); return; }
  selected = null; markPicked([]);
  panel.innerHTML = `<p class="hint">${t("sea")}</p>`;
}

// Чи лежить точка на суші? Контури країн грубі (дрібні острови пропускають), тому для моря
// додатково перевіряємо відповідь Nominatim: «море» = ні в контурах, ні в адресах.
const onLand = (lat, lon) => landFeats.some(f => inGeom(f.geometry, lon, lat));

async function pick(lat, lon, name, fromSearch) {
  lat = +lat.toFixed(2);
  lon = +((((lon + 540) % 360) - 180).toFixed(2)); // якщо карта прокручена по горизонталі
  document.body.style.cursor = "progress";
  if (!compareMode) panel.innerHTML = `<p class="hint">${t("loading")}</p>`;
  try {
    let w, reg;
    if (landFeats.length && !onLand(lat, lon)) {
      reg = await getRegion(lat, lon, false);
      if (!reg.country) { showSea(); return; }          // ні суша, ні адреса — це море чи океан
      [w] = await getWeather([[lat, lon]]);
    } else {
      [[w], reg] = await Promise.all([getWeather([[lat, lon]]), getRegion(lat, lon, !findOblast(lat, lon))]);
    }
    const place = Object.assign({ name: name || reg.settlement || reg.region || `${lat}, ${lon}`, lat, lon, snap: !!fromSearch }, reg, analyse(w), { dir: w.current.wind_direction_10m });
    if (compareMode) addToCompare(place);
    else { selected = place; markPicked([place]); renderSingle(); }
  } catch (e) {
    console.error(e);
    panel.innerHTML = `<p class="hint">${t("error")}</p>`;
  } finally { document.body.style.cursor = ""; }
}