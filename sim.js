// Сторінка симулятора: вибір території на карті -> цифрова модель рельєфу -> симуляція пожежі.
// Модель поширення вогню лежить у fire-model.js.
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let lang = Q.get("lang") === "en" ? "en" : "uk";

const TEXT = {
  uk: {
    title: "Симулятор поширення пожежі", back: "← До карти",
        newMap: "🎲 Нова місцевість",
    size: "Розмір ділянки", 
    step2: "Постав вогонь",
    hintFire: "Клікни на ділянку, щоб підпалити. Намалюй смугу, щоб спробувати зупинити вогонь.",
    toolIgnite: "🔥 Займання", toolBrk: "🧱 Протипожежна смуга",
    run: "▶ Старт", pause: "⏸ Пауза", one: "Крок", reset: "↺ Скинути",
    clearIgn: "Прибрати вогонь", clearBrk: "Прибрати смуги", speed: "Швидкість",
    time: "Умовний час", burned: "Вигоріло", share: "Частка ділянки", now: "Горить клітинок",
    terrain: "Рельєф", cellsize: "Клітинка",
    cond: "Умови", fuel: "Тип рослинності", temp: "Температура, °C", hum: "Вологість повітря, %",
    wind: "Швидкість вітру, м/с", dir: "Вітер дме з",
    fromMap: "Умови взято з карти: ", ha: "га", min: "хв", h: "год", m: "м", slope: "середній схил",
    fuels: { grass: "Трава", shrub: "Чагарник", forest: "Мішаний ліс", conifer: "Густий хвойний ліс" },
    runs: "Результати запусків", cols: ["#", "Рослини", "T/RH", "Вітер", "Смуги", "Га", "Час"], yes: "так", no: "ні",
    compass: ["Пн", "ПнС", "С", "ПдС", "Пд", "ПдЗ", "З", "ПнЗ"],
    note: "Навчальна модель: імовірності, тип пального й час умовні, це не прогноз реальної пожежі. Основа — клітинковий автомат Alexandridis та ін. (2008) з урахуванням вітру й схилу. Місцевість вигадана: її рельєф генерується програмою."
  },
  en: {
    title: "Fire spread simulator", back: "← Back to the map",
        newMap: "🎲 New terrain",
    size: "Area size", 
    step2: "Start a fire",
    hintFire: "Click the area to ignite it. Draw a firebreak to try to stop the fire.",
    toolIgnite: "🔥 Ignition", toolBrk: "🧱 Firebreak",
    run: "▶ Start", pause: "⏸ Pause", one: "Step", reset: "↺ Reset",
    clearIgn: "Remove fire", clearBrk: "Remove breaks", speed: "Speed",
    time: "Model time", burned: "Burned", share: "Share of the area", now: "Cells burning",
    terrain: "Terrain", cellsize: "Cell",
    cond: "Conditions", fuel: "Vegetation", temp: "Temperature, °C", hum: "Air humidity, %",
    wind: "Wind speed, m/s", dir: "Wind blows from",
    fromMap: "Conditions taken from the map: ", ha: "ha", min: "min", h: "h", m: "m", slope: "mean slope",
    fuels: { grass: "Grass", shrub: "Shrubs", forest: "Mixed forest", conifer: "Dense conifer forest" },
    runs: "Run results", cols: ["#", "Fuel", "T/RH", "Wind", "Breaks", "Ha", "Time"], yes: "yes", no: "no",
    compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    note: "A learning model: probabilities, fuel type and time are conditional and this is not a forecast of a real fire. Based on the Alexandridis et al. (2008) cellular automaton with wind and slope. The terrain is invented: the program generates it."
  }
};
const T = k => TEXT[lang][k];

// Число з адреси сторінки (з обмеженням діапазону); якщо його немає — значення за замовчуванням
const num = (k, d, lo, hi) => Q.has(k) && isFinite(+Q.get(k)) ? Math.round(Math.min(hi, Math.max(lo, +Q.get(k)))) : d;

// ---------- Стан ----------
const N = 100;                                   // клітинок за стороною
const S = {
  mapSeed: Math.floor(Math.random() * 1e9),
  size: num("size", 4, 1, 8), fuel: "forest", temp: num("temp", 30, -10, 50), hum: num("hum", 30, 5, 100),
  wind: num("wind", 5, 0, 25), dir: num("dir", 270, 0, 359),
  model: null, elev: null, brk: new Uint8Array(N * N), ign: [], chart: [], runs: [], recorded: true, seed: 1
};
const fromMap = Q.has("temp");
let running = false;

// ---------- Мова ----------
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach(e => { e.textContent = T(e.dataset.t); });
  $("btn-lang").textContent = lang === "uk" ? "EN" : "UA";
  $("back").href = "index.html?lang=" + lang;
  const sel = $("fuel"), cur = S.fuel;
  sel.innerHTML = Object.keys(T("fuels")).map(k => `<option value="${k}">${T("fuels")[k]}</option>`).join("");
  sel.value = cur;
  $("run").textContent = running ? T("pause") : T("run");
  $("fromMap").textContent = fromMap ? T("fromMap").replace(/:\s*$/, "") : "";
  $("fromMap").hidden = !fromMap;
  labels(); stats(); drawChart(); renderRuns();
}
function labels() {
  $("o-size").textContent = `${S.size} × ${S.size} ` + (lang === "uk" ? "км" : "km");
  $("o-temp").textContent = S.temp + " °C";
  $("o-hum").textContent = S.hum + " %";
  $("o-wind").textContent = S.wind + " " + (lang === "uk" ? "м/с" : "m/s");
  const c = T("compass")[Math.round(S.dir / 45) % 8];
  $("o-dir").textContent = `${c} · ${S.dir}°`;
}
$("btn-lang").onclick = () => { lang = lang === "uk" ? "en" : "uk"; applyLang(); };

// ---------- Вигадана місцевість: пагорби й долини з плавного шуму (це не реальне місце) ----------
function makeElevation(n, km, seed) {
  const layers = [[3, 1], [6, 0.5], [12, 0.25], [24, 0.12]].map(([g, w], i) => ({ f: makeNoise(seed + i * 101, g), w }));
  const norm = layers.reduce((a, l) => a + l.w, 0), relief = 120 + 60 * km;      // перепад висот росте з розміром ділянки
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    layers.forEach(l => { v += l.w * l.f(x / n, y / n); });
    out[y * n + x] = 250 + relief * Math.pow(v / norm, 1.4);
  }
  return out;
}

// ---------- Намальована карта ділянки: рельєф, рослинність за обраним типом, горизонталі ----------
const ART = 720;                                   // розмір малюнка в пікселях
const terrainC = document.createElement("canvas"); terrainC.width = terrainC.height = ART;
const fireC = document.createElement("canvas"); fireC.width = fireC.height = N;

// Кольори для кожного типу рослинності: ґрунт, кольори крон, густота й розмір малюнків
const LOOK = {
  grass:   { ground: [150, 162, 84],  cols: ["#b9c566", "#a0b150", "#cfd67c", "#8ea646"], step: 5,  kind: "grass" },
  shrub:   { ground: [128, 138, 76],  cols: ["#728d41", "#839a42", "#5f7c38", "#92a04c"], step: 11, kind: "blob" },
  forest:  { ground: [64, 98, 58],    cols: ["#2f6b36", "#3b7a3c", "#285c30", "#4a8a44"], step: 9,  kind: "crown" },
  conifer: { ground: [42, 72, 62],    cols: ["#1f4d3b", "#245a42", "#1a4333", "#2c6b4f"], step: 8,  kind: "fir" }
};
// Плавний «шум» для плям: дає галявини й густіші ділянки замість рівномірної текстури
function makeNoise(seed, G = 24) {
  const r = mulberry32(seed), v = Array.from({ length: (G + 1) * (G + 1) }, () => r());
  return (x, y) => {                               // x, y у 0..1
    const fx = x * G, fy = y * G, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), q = (a, b) => v[Math.min(G, b) * (G + 1) + Math.min(G, a)];
    return (q(ix, iy) * (1 - sx) + q(ix + 1, iy) * sx) * (1 - sy) + (q(ix, iy + 1) * (1 - sx) + q(ix + 1, iy + 1) * sx) * sy;
  };
}
function buildTerrain() {                          // аналіз рельєфу: освітленість схилів і підсумки для панелі
  const e = S.elev, cell = S.size * 1000 / N;
  let lo = Infinity, hi = -Infinity, slopeSum = 0;
  e.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
  const zen = 45 * Math.PI / 180, az = 315 * Math.PI / 180, ex = 2;     // світло зверху-ліворуч, висоту підсилюємо ×2
  const at = (x, y) => e[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
  S.shade = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * cell), dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * cell);
    const g = Math.hypot(dzdx, dzdy); slopeSum += Math.atan(g);
    const sl = Math.atan(g * ex), asp = Math.atan2(dzdy, -dzdx);
    S.shade[y * N + x] = Math.max(0, Math.cos(zen) * Math.cos(sl) + Math.sin(zen) * Math.sin(sl) * Math.cos(az - asp));
  }
  S.lo = lo; S.hi = hi; S.meanSlope = slopeSum / (N * N) * 180 / Math.PI;
  S.artSeed = S.mapSeed | 0;
  paintTerrain();
}
function paintTerrain() {                          // малюємо карту під обраний тип рослинності
  const look = LOOK[S.fuel] || LOOK.forest, g = terrainC.getContext("2d"), W = ART, px = W / N;
  const rnd = mulberry32(S.artSeed + 7), noise = makeNoise(S.artSeed + 13);
  const shadeAt = (x, y) => S.shade[Math.min(N - 1, Math.max(0, Math.floor(y / px))) * N + Math.min(N - 1, Math.max(0, Math.floor(x / px)))];
  const elevT = (x, y) => S.hi > S.lo ? (S.elev[Math.min(N - 1, Math.max(0, Math.floor(y / px))) * N + Math.min(N - 1, Math.max(0, Math.floor(x / px)))] - S.lo) / (S.hi - S.lo) : 0.3;

  // 1) ґрунт: колір рослинності + світлішає з висотою + освітлення схилів; малюємо мале зображення й плавно розтягуємо
  const base = document.createElement("canvas"); base.width = base.height = N;
  const bg = base.getContext("2d"), img = bg.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const t = S.hi > S.lo ? (S.elev[y * N + x] - S.lo) / (S.hi - S.lo) : 0.3, f = 0.4 + 0.85 * S.shade[y * N + x], k = (y * N + x) * 4;
    for (let c = 0; c < 3; c++) img.data[k + c] = Math.min(255, (look.ground[c] + t * 38) * f);
    img.data[k + 3] = 255;
  }
  bg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.clearRect(0, 0, W, W); g.drawImage(base, 0, 0, W, W);

  // 2) рослинність: малюнки дерев, кущів або трави з відтінком від освітлення схилу
  const shadeCol = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.min(255, (n >> 16) * f) | 0},${Math.min(255, ((n >> 8) & 255) * f) | 0},${Math.min(255, (n & 255) * f) | 0})`;
  };
  const st = look.step;
  for (let y = 0; y < W; y += st) for (let x = 0; x < W; x += st) {
    const jx = x + (rnd() - 0.5) * st * 1.2, jy = y + (rnd() - 0.5) * st * 1.2, q = noise(jx / W, jy / W);
    const f = 0.45 + 0.8 * shadeAt(jx, jy), col = look.cols[(rnd() * look.cols.length) | 0];
    if (look.kind === "crown") {                   // листяні: круглі крони з тінню й світлим боком
      if (q < 0.22 && rnd() < 0.8) continue;       // галявини
      const r = st * (0.55 + rnd() * 0.45) * (0.8 + q * 0.5);
      g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(jx + r * 0.35, jy + r * 0.45, r, r * 0.85, 0, 0, 7); g.fill();
      g.fillStyle = shadeCol(col, f); g.beginPath(); g.arc(jx, jy, r, 0, 7); g.fill();
      g.fillStyle = shadeCol(col, f * 1.35); g.beginPath(); g.arc(jx - r * 0.3, jy - r * 0.3, r * 0.5, 0, 7); g.fill();
    } else if (look.kind === "fir") {              // хвойні: гострі «ялинки», густіше
      if (q < 0.15 && rnd() < 0.7) continue;
      const r = st * (0.5 + rnd() * 0.4) * (0.85 + q * 0.4);
      g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.moveTo(jx + r * 0.5, jy - r); g.lineTo(jx + r * 1.6, jy + r * 0.8); g.lineTo(jx - r * 0.2, jy + r * 0.8); g.fill();
      g.fillStyle = shadeCol(col, f); g.beginPath(); g.moveTo(jx, jy - r * 1.5); g.lineTo(jx - r * 0.85, jy + r * 0.7); g.lineTo(jx + r * 0.85, jy + r * 0.7); g.closePath(); g.fill();
      g.fillStyle = shadeCol(col, f * 0.7); g.beginPath(); g.moveTo(jx, jy - r * 1.5); g.lineTo(jx + r * 0.85, jy + r * 0.7); g.lineTo(jx, jy + r * 0.7); g.closePath(); g.fill();
    } else if (look.kind === "blob") {             // чагарник: окремі кущі, між ними видно землю
      if (q < 0.35 || rnd() < 0.3) continue;
      const r = st * (0.3 + rnd() * 0.4);
      g.fillStyle = "rgba(0,0,0,.22)"; g.beginPath(); g.ellipse(jx + r * 0.3, jy + r * 0.4, r, r * 0.8, 0, 0, 7); g.fill();
      g.fillStyle = shadeCol(col, f); g.beginPath(); g.ellipse(jx, jy, r, r * 0.85, rnd() * 3, 0, 7); g.fill();
    } else {                                       // трава: короткі штрихи
      g.strokeStyle = shadeCol(col, f * (0.85 + q * 0.3)); g.lineWidth = 1.2;
      const a = -Math.PI / 2 + (rnd() - 0.5) * 0.9, len = 3 + rnd() * 3;
      g.beginPath(); g.moveTo(jx, jy); g.lineTo(jx + Math.cos(a) * len, jy + Math.sin(a) * len); g.stroke();
    }
  }

  // 3) горизонталі: тонкі світлі лінії через рівні проміжки висоти (кожна п'ята жирніша)
  if (S.hi - S.lo > 3) {
    const raw = (S.hi - S.lo) / 12, interval = raw < 5 ? 5 : raw < 10 ? 10 : raw < 20 ? 20 : raw < 50 ? 50 : 100;
    const ec = document.createElement("canvas"); ec.width = ec.height = W;
    const eg = ec.getContext("2d"), ei = eg.createImageData(W, W), d = ei.data;
    const h = (x, y) => {                          // висота з білінійною інтерполяцією між клітинками
      const fx = Math.min(N - 1.001, Math.max(0, x / px - 0.5)), fy = Math.min(N - 1.001, Math.max(0, y / px - 0.5));
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, e = S.elev;
      return (e[iy * N + ix] * (1 - tx) + e[iy * N + ix + 1] * tx) * (1 - ty) + (e[(iy + 1) * N + ix] * (1 - tx) + e[(iy + 1) * N + ix + 1] * tx) * ty;
    };
    let row = new Float32Array(W), next = new Float32Array(W);
    for (let x = 0; x < W; x++) row[x] = h(x, 0);
    for (let y = 0; y < W - 1; y++) {
      for (let x = 0; x < W; x++) next[x] = h(x, y + 1);
      for (let x = 0; x < W - 1; x++) {
        const l0 = Math.floor(row[x] / interval), l1 = Math.floor(row[x + 1] / interval), l2 = Math.floor(next[x] / interval);
        if (l0 !== l1 || l0 !== l2) {
          const major = Math.max(l0, l1, l2) % 5 === 0, k = (y * W + x) * 4;
          d[k] = 255; d[k + 1] = 238; d[k + 2] = 200; d[k + 3] = major ? 150 : 70;
        }
      }
      [row, next] = [next, row];
    }
    eg.putImageData(ei, 0, 0); g.drawImage(ec, 0, 0);
  }
}

// ---------- Модель ----------
function newModel() {
  S.model = createModel({ n: N, cell: S.size * 1000 / N, elev: S.elev, fuel: S.fuel, temp: S.temp, hum: S.hum,
                          wind: S.wind, dir: S.dir, seed: S.seed, brk: S.brk });
  S.ign.forEach(([x, y]) => S.model.ignite(x, y));
  S.chart = [[0, S.model.burnedHa]]; S.recorded = S.model.steps > 0 || !S.model.active;
}
function setRunning(v) { running = v; $("run").textContent = v ? T("pause") : T("run"); }
function restart() { setRunning(false); S.seed++; newModel(); stats(); drawChart(); }

// Нова місцевість: генеруємо рельєф і малюємо карту під обраний тип рослинності
function loadTerritory() {
  setRunning(false);
  S.elev = makeElevation(N, S.size, S.mapSeed);
  S.brk = new Uint8Array(N * N); S.ign = [];
  buildTerrain(); newModel(); S.runs.length = 0; renderRuns(); stats();
}
$("new-map").onclick = () => { S.mapSeed = Math.floor(Math.random() * 1e9); loadTerritory(); };

// ---------- Керування ----------
$("run").onclick = () => { if (!S.model) return; setRunning(!running); };
$("one").onclick = () => { setRunning(false); stepOnce(); };
$("reset").onclick = restart;
$("clear-ign").onclick = () => { S.ign = []; restart(); };
$("clear-brk").onclick = () => { S.brk.fill(0); restart(); };

$("size").value = S.size;
$("size").addEventListener("input", e => { S.size = +e.target.value; labels(); });
$("size").addEventListener("change", loadTerritory);     // інший розмір: будуємо місцевість заново

["fuel", "temp", "hum", "wind", "dir"].forEach(id => {
  $(id).value = S[id];
  $(id).addEventListener("input", e => { S[id] = id === "fuel" ? e.target.value : +e.target.value; labels(); });
  $(id).addEventListener("change", () => {
    if (!S.model) return;
    if (id === "fuel") paintTerrain();             // інший тип рослинності — інша намальована карта
    restart();                                     // нові умови: починаємо спочатку
  });
});

function stepOnce() {
  const m = S.model; if (!m) return;
  m.step(); S.chart.push([m.time, m.burnedHa]);
  if (!m.active) finish();
}
function finish() {
  setRunning(false);
  if (S.recorded || !S.model.steps) return;
  S.recorded = true;
  S.runs.push({ fuel: S.fuel, temp: S.temp, hum: S.hum, wind: S.wind, dir: S.dir, brk: S.brk.some(v => v), ha: S.model.burnedHa, time: S.model.time });
  renderRuns();
}
function renderRuns() {
  $("runs").hidden = !S.runs.length;
  const c = T("compass");
  $("runs-table").innerHTML = "<tr>" + T("cols").map(x => `<th>${x}</th>`).join("") + "</tr>" +
    S.runs.map((r, i) => `<tr><td>${i + 1}</td><td>${T("fuels")[r.fuel]}</td><td>${r.temp}°/${r.hum}%</td>
      <td>${r.wind} ${c[Math.round(r.dir / 45) % 8]}</td><td>${r.brk ? T("yes") : T("no")}</td><td>${r.ha.toFixed(1)}</td><td>${fmtTime(r.time)}</td></tr>`).join("");
}
const fmtTime = min => min >= 60 ? `${Math.floor(min / 60)} ${T("h")} ${Math.round(min % 60)} ${T("min")}` : `${Math.round(min)} ${T("min")}`;

// ---------- Малювання ----------
const canvas = $("canvas"), ctx = canvas.getContext("2d");
function draw() {
  const W = canvas.width;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, W, W);
  if (!S.model) return;
  ctx.drawImage(terrainC, 0, 0, W, W);
  const m = S.model, fc = fireC.getContext("2d"), img = fc.createImageData(N, N), d = img.data;
  for (let i = 0; i < N * N; i++) {
    const k = i * 4, st = m.state[i];
    if (st === 1) { d[k] = 255; d[k + 1] = 90 + Math.random() * 130; d[k + 2] = 20; d[k + 3] = 245; }        // горить, мерехтить
    else if (st === 2) { d[k] = 26; d[k + 1] = 20; d[k + 2] = 18; d[k + 3] = 205; }                          // вигоріло
    else if (m.brk[i]) { d[k] = 205; d[k + 1] = 225; d[k + 2] = 235; d[k + 3] = 235; }                       // протипожежна смуга
  }
  fc.putImageData(img, 0, 0);
  ctx.drawImage(fireC, 0, 0, W, W);
  const px = W / N;
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  S.ign.forEach(([x, y]) => { const cx = (x + .5) * px, cy = (y + .5) * px;       // позначка точки займання
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx + 6, cy + 6); ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx - 6, cy + 6); ctx.stroke(); });
  drawCompass(W); drawScale(W);
}
function drawCompass(W) {                           // стрілка показує, КУДИ дме вітер
  const cx = 52, cy = 52, r = 34, a = (S.dir + 180) * Math.PI / 180;
  ctx.save();
  ctx.fillStyle = "rgba(20,24,27,.7)"; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px Onest, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(lang === "uk" ? "Пн" : "N", cx, cy - r - 1);
  ctx.translate(cx, cy); ctx.rotate(a);
  const L2 = Math.max(10, Math.min(r - 4, 8 + S.wind * 1.2));
  ctx.strokeStyle = "#f0a21e"; ctx.fillStyle = "#f0a21e"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, L2); ctx.lineTo(0, -L2 + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -L2); ctx.lineTo(-7, -L2 + 12); ctx.lineTo(7, -L2 + 12); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawScale(W) {
  const total = S.size * 1000, m = total <= 2000 ? 500 : total <= 5000 ? 1000 : 2000, len = m / total * W, x = 16, y = W - 22;
  ctx.save(); ctx.fillStyle = "rgba(20,24,27,.7)"; ctx.fillRect(x - 8, y - 20, len + 16, 34);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "bold 13px Onest, sans-serif"; ctx.textAlign = "left";
  ctx.fillText(m >= 1000 ? m / 1000 + " " + (lang === "uk" ? "км" : "km") : m + " " + T("m"), x, y - 6);
  ctx.restore();
}
function drawChart() {
  const c = $("chart"), g = c.getContext("2d"), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const pts = S.chart;
  if (pts.length < 2) return;
  const tMax = Math.max(1, pts[pts.length - 1][0]), hMax = Math.max(0.1, pts[pts.length - 1][1]);
  g.strokeStyle = "#f0a21e"; g.lineWidth = 2; g.beginPath();
  pts.forEach(([t, v], i) => { const x = 8 + t / tMax * (w - 16), y = h - 14 - v / hMax * (h - 28); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  g.fillStyle = "rgba(255,255,255,.6)"; g.font = "11px Onest, sans-serif";
  g.fillText(T("ha") + " / " + T("time").toLowerCase(), 8, 12);
}
function stats() {
  const m = S.model;
  $("s-time").textContent = m ? fmtTime(m.time) : "0";
  $("s-ha").textContent = m ? m.burnedHa.toFixed(1) + " " + T("ha") : "0";
  $("s-pct").textContent = m ? (m.burnedCells / (N * N) * 100).toFixed(1) + " %" : "0";
  $("s-now").textContent = m ? m.burning : "0";
  $("s-ter").textContent = S.elev ? `${Math.round(S.lo)}–${Math.round(S.hi)} ${T("m")}, ${T("slope")} ${S.meanSlope.toFixed(1)}°` : "–";
  $("s-cell").textContent = S.elev ? Math.round(S.size * 1000 / N) + " " + T("m") : "–";
}

// ---------- Миша / дотик по ділянці ----------
let painting = false;
function cellAt(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * N), Math.floor((e.clientY - r.top) / r.height * N)];
}
function applyTool(e, first) {
  if (!S.model) return;
  const [x, y] = cellAt(e), tool = document.querySelector('input[name=tool]:checked').value;
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  if (tool === "ignite") {
    if (!first) return;
    if (S.model.ignite(x, y)) { S.ign.push([x, y]); S.recorded = false; setRunning(true); }
  } else {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && S.model.state[yy * N + xx] === 0) S.brk[yy * N + xx] = 1;
    }
  }
}
canvas.addEventListener("pointerdown", e => { painting = true; canvas.setPointerCapture(e.pointerId); applyTool(e, true); });
canvas.addEventListener("pointermove", e => { if (painting) applyTool(e, false); });
canvas.addEventListener("pointerup", () => { painting = false; });

// ---------- Цикл анімації ----------
let last = 0, acc = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.2, (ts - last) / 1000); last = ts;
  if (S.model && running) {
    acc += dt * +$("speed").value;
    while (acc >= 1 && running) { stepOnce(); acc -= 1; }
    stats(); drawChart();
  } else acc = 0;
  draw();
}
applyLang();
loadTerritory();
requestAnimationFrame(loop);