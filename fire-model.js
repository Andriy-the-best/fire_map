// Модель поширення лісової пожежі: клітинний автомат з ймовірностями переходу.
// Основа — модель Alexandridis та ін. (2008, «A cellular automata model for forest fire spread prediction»):
//   p_burn = p_h · (1 + p_veg) · (1 + p_den) · p_wind · p_slope
// Параметри пального — умовні (навчальна модель, не прогноз для реальної пожежі).
// Файл не залежить від браузера, тому його можна перевіряти окремо.

const FUEL = {
  grass:   { pveg: 0.0, pden: -0.1, burn: 2 },    // трава: спалахує легко, згоряє швидко
  shrub:   { pveg: 0.1, pden: 0.0,  burn: 4 },    // чагарник
  forest:  { pveg: 0.2, pden: 0.0,  burn: 8 },    // мішаний ліс
  conifer: { pveg: 0.4, pden: 0.3,  burn: 10 }    // густий хвойний ліс
};
const WIND_C1 = 0.045, WIND_C2 = 0.131, SLOPE_A = 0.078, P_H = 0.58;
const UNBURNT = 0, BURNING = 1, BURNT = 2;

function mulberry32(seed) {                       // простий генератор випадкових чисел із зерном
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Сухість пального за температурою й вологістю повітря: 0.15 (мокре) … 1.4 (дуже сухе)
function dryness(temp, hum) {
  return Math.min(1.4, Math.max(0.15, 1.25 - hum / 80 + (temp - 20) / 80));
}

// opts: brk (необов'язково), n (клітинок за стороною), cell (метрів), elev (Float32Array n*n), fuel, temp, hum,
//       wind (м/с), dir (звідки дує, градуси від півночі), seed
function createModel(o) {
  const n = o.n, N = n * n, cell = o.cell;
  const rand = mulberry32(o.seed || 1);
  const fuel = FUEL[o.fuel] || FUEL.forest;
  const brk = o.brk || new Uint8Array(N);          // протипожежні смуги можна передати ззовні й зберегти між запусками
  const state = new Uint8Array(N), age = new Uint16Array(N), when = new Float32Array(N).fill(-1);
  const elev = o.elev || new Float32Array(N);
  const ph = Math.min(0.95, P_H * dryness(o.temp, o.hum));
  const V = o.wind, windTo = ((o.dir + 180) % 360) * Math.PI / 180;     // вогонь зносить за вітром
  const dt = cell / 10;                                                  // хвилин на один крок (умовно)
  let burning = [], time = 0, steps = 0, burnedCount = 0;

  // сусіди: зміщення, відстань, множник для діагоналей, напрямок розповсюдження
  const nb = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const diag = dx && dy, dist = cell * (diag ? Math.SQRT2 : 1);
    nb.push({ dx, dy, dist, w: diag ? 0.7 : 1, bearing: Math.atan2(dx, -dy) });   // dy<0 = північ
  }
  const pWind = nb.map(q => Math.exp(WIND_C1 * V) * Math.exp(V * WIND_C2 * (Math.cos(q.bearing - windTo) - 1)));

  function ignite(x, y) {
    const i = y * n + x;
    if (x < 0 || y < 0 || x >= n || y >= n || state[i] !== UNBURNT || brk[i]) return false;
    state[i] = BURNING; when[i] = time; burning.push(i); burnedCount++;
    return true;
  }
  function step() {
    const next = [];
    for (const i of burning) {
      const x = i % n, y = (i - x) / n;
      nb.forEach((q, k) => {
        const xx = x + q.dx, yy = y + q.dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) return;
        const j = yy * n + xx;
        if (state[j] !== UNBURNT || brk[j]) return;
        const ang = Math.atan2(elev[j] - elev[i], q.dist) * 180 / Math.PI;      // + = вгору схилом
        const ps = Math.exp(SLOPE_A * ang);
        const p = Math.min(0.98, ph * (1 + fuel.pveg) * (1 + fuel.pden) * pWind[k] * ps * q.w);
        if (rand() < p) { state[j] = BURNING; when[j] = time + dt; next.push(j); burnedCount++; }
      });
      age[i]++;
      if (age[i] >= fuel.burn) state[i] = BURNT; else next.push(i);
    }
    burning = next; time += dt; steps++;
  }
  return {
    n, cell, state, brk, when, elev, fuel,
    ignite, step,
    get burning() { return burning.length; },
    get time() { return time; },
    get steps() { return steps; },
    get burnedCells() { return burnedCount; },
    get burnedHa() { return burnedCount * cell * cell / 10000; },
    get active() { return burning.length > 0; },
    dryness: () => dryness(o.temp, o.hum), baseP: ph
  };
}

// Декодування висоти з плиток Terrarium (AWS Terrain Tiles): метри над рівнем моря
const decodeTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

if (typeof module !== "undefined") module.exports = { createModel, FUEL, dryness, decodeTerrarium, mulberry32 };