// Сервер карти пожежної небезпеки. Без бібліотек: потрібен лише Node.js 18 або новіший.
// Запуск:  node server.js   ->  http://localhost:3000/api/hotspots?min=3
//
// Що робить: раз на кілька годин перевіряє погоду в сітці точок по всій суші світу,
// рахує індекс Нестерова й зберігає результат. Сайт бере готові дані й не чіпає Open-Meteo.
const http = require("http");
const fs = require("fs");
const path = require("path");

const CFG = {
  port: +process.env.PORT || 3000,
  step: 3,              // крок сітки в градусах (≈ 330 км). Менший крок = більше запитів
  batch: 50,            // скільки точок в одному запиті до Open-Meteo
  pauseMs: 6000,        // пауза між запитами: пачка з 50 точок рахується як 50 запитів, ліміт Open-Meteo ≈ 600 запитів за хвилину
  retryMinutes: 30,     // через скільки пробувати знову, якщо вичерпано ліміт
  refreshHours: 12,     // як часто оновлювати (2 рази на добу ≈ 3000 запитів з ліміту 10000)
  latMin: -50, latMax: 66,   // далі до полюсів пожеж майже немає — не витрачаємо запити
  dataDir: path.join(__dirname, "data")
};
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const WEATHER = "https://api.open-meteo.com/v1/forecast";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- Індекс Нестерова (така сама логіка, як у js/risk.js на сайті) ----------
function nesterov(w) {
  let G = 0, dry = 0;
  w.daily.time.forEach((day, i) => {
    const k = w.hourly.time.indexOf(day + "T13:00");
    if (k < 0) return;
    const T = w.hourly.temperature_2m[k], Td = w.hourly.dew_point_2m[k];
    const rain = w.daily.precipitation_sum[i] || 0;
    if (rain > 3) { G = 0; dry = 0; } else { dry++; if (T > 0) G += T * (T - Td); }
  });
  return { G: Math.round(G), dry };
}
const level = G => (G <= 300 ? 0 : G <= 1000 ? 1 : G <= 4000 ? 2 : G <= 10000 ? 3 : 4);

// ---------- Завантаження файлів з інтернету з кешем на диску ----------
async function getJson(file, url) {
  const p = path.join(CFG.dataDir, file);
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) {}
  log("завантажую", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " -> " + res.status);
  const text = await res.text();
  fs.mkdirSync(CFG.dataDir, { recursive: true });
  fs.writeFileSync(p, text);
  return JSON.parse(text);
}

// ---------- Яка точка лежить на суші? (точка в багатокутнику країн) ----------
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function buildLandTest(countries) {
  const polys = [];
  countries.features.forEach(f => {
    const g = f.geometry;
    const list = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    list.forEach(rings => {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      rings[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
      polys.push({ rings, x0, x1, y0, y1 });
    });
  });
  return (lat, lng) => polys.some(p =>
    lng >= p.x0 && lng <= p.x1 && lat >= p.y0 && lat <= p.y1 &&
    inRing(lng, lat, p.rings[0]) && !p.rings.slice(1).some(h => inRing(lng, lat, h)));
}
function landGrid(isLand) {
  const pts = [];
  for (let lat = CFG.latMin; lat <= CFG.latMax; lat += CFG.step)
    for (let lng = -180; lng < 180; lng += CFG.step)
      if (isLand(lat, lng)) pts.push([+lat.toFixed(2), +lng.toFixed(2)]);
  return pts;
}

// ---------- Погода пачками ----------
async function fetchBatch(points) {
  const url = `${WEATHER}?latitude=${points.map(p => p[0]).join(",")}&longitude=${points.map(p => p[1]).join(",")}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=temperature_2m,dew_point_2m" +
    "&daily=precipitation_sum&past_days=10&forecast_days=1&wind_speed_unit=ms&timezone=auto";
  const res = await fetch(url);
  if (res.ok) { const d = await res.json(); return Array.isArray(d) ? d : [d]; }
  const err = new Error("Open-Meteo відповів " + res.status);
  err.limit = res.status === 429;      // 429 = ліміт запитів вичерпано
  throw err;
}

let STATE = { updated: null, points: [], running: false, progress: "" };
let PLACES = [];

async function refresh() {
  if (STATE.running) return;
  STATE.running = true;
  try {
    const isLand = buildLandTest(await getJson("countries.geojson", NE + "ne_110m_admin_0_countries.geojson"));
    const grid = landGrid(isLand);
    log("точок на суші:", grid.length);
    const out = [];
    for (let i = 0; i < grid.length; i += CFG.batch) {
      const part = grid.slice(i, i + CFG.batch);
      let tries = 0;
      while (true) {
        try {
          const list = await fetchBatch(part);
          list.forEach((w, k) => {
            const n = nesterov(w);
            out.push({ lat: part[k][0], lng: part[k][1], lvl: level(n.G), G: n.G, dry: n.dry,
                       temp: Math.round(w.current.temperature_2m), hum: Math.round(w.current.relative_humidity_2m) });
          });
          break;
        } catch (e) {
          if (e.limit) {   // ліміт за хвилину: чекаємо хвилину й повторюємо ту саму пачку, зібране не втрачаємо
            if (++tries > 3) {   // не допомогло (ліміт за годину чи добу): зупиняємось і пробуємо пізніше
              log("ЛІМІТ Open-Meteo вичерпано. Зупиняюсь, спробую ще раз через", CFG.retryMinutes, "хв");
              STATE.running = false; setTimeout(refresh, CFG.retryMinutes * 60e3); return;
            }
            log("ліміт за хвилину, чекаю 65 с і повторюю пачку", i);
            await sleep(65e3);
            continue;
          }
          log("пропускаю пачку", i, e.message);
          break;
        }
      }
      STATE.progress = `${Math.min(i + CFG.batch, grid.length)}/${grid.length}`;
      await sleep(CFG.pauseMs);
    }
    if (out.length) {
      STATE = { updated: new Date().toISOString(), points: out, running: false, progress: "готово" };
      fs.mkdirSync(CFG.dataDir, { recursive: true });
      fs.writeFileSync(path.join(CFG.dataDir, "hotspots.json"), JSON.stringify({ updated: STATE.updated, points: out }));
      log("оновлено:", out.length, "точок, небезпечних (4–5):", out.filter(p => p.lvl >= 3).length);
    }
  } catch (e) { log("помилка оновлення:", e.message); }
  STATE.running = false;
}

// ---------- Назви: найближче місто з бази Natural Earth (до 300 км) ----------
function nearestName(lat, lng) {
  let best = null, bd = 300;
  for (const p of PLACES) {
    const dy = (p.lat - lat) * 111, dx = (p.lng - lng) * 111 * Math.cos(lat * Math.PI / 180);
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { en: best.en, uk: best.uk } : null;
}

// ---------- HTTP ----------
function handler(req, res) {
  const u = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");          // сайт на GitHub Pages зможе звертатися сюди
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (u.pathname === "/api/hotspots") {
    const min = Math.max(0, Math.min(4, +(u.searchParams.get("min") || 3)));
    const pts = STATE.points.filter(p => p.lvl >= min).map(p => Object.assign({}, p, nearestName(p.lat, p.lng) || {}));
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.end(JSON.stringify({ updated: STATE.updated, total: STATE.points.length, count: pts.length, points: pts }));
  }
  if (u.pathname === "/api/status") {
    return res.end(JSON.stringify({ updated: STATE.updated, points: STATE.points.length, running: STATE.running, progress: STATE.progress }));
  }
  res.statusCode = 404; res.end(JSON.stringify({ error: "not found" }));
}

async function start() {
  try { // готові дані з диска, щоб після перезапуску сайт одразу працював
    const c = JSON.parse(fs.readFileSync(path.join(CFG.dataDir, "hotspots.json"), "utf8"));
    STATE = { updated: c.updated, points: c.points, running: false, progress: "з кешу" };
    log("кеш з диска:", c.points.length, "точок, від", c.updated);
  } catch (e) {}
  getJson("places.geojson", NE + "ne_50m_populated_places.geojson").then(g => {
    PLACES = g.features.map(f => {
      const p = f.properties, pick = k => p[k] || p[k.toLowerCase()];
      return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], en: pick("NAME"), uk: pick("NAME_UK") || pick("NAME") };
    });
    log("назв міст:", PLACES.length);
  }).catch(e => log("назви міст не завантажено:", e.message));

  http.createServer(handler).listen(CFG.port, () => log("сервер: http://localhost:" + CFG.port + "/api/hotspots?min=3"));
  const age = STATE.updated ? (Date.now() - new Date(STATE.updated)) / 36e5 : Infinity;
  if (age > CFG.refreshHours) refresh();
  setInterval(refresh, CFG.refreshHours * 36e5);
}

if (require.main === module) start();
module.exports = { nesterov, level, buildLandTest, landGrid, CFG, handler };