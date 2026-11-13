// Запити до Open-Meteo (безкоштовно, без ключа).
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";

// points = [[lat, lon], ...] -> масив відповідей (по одній на точку)
async function getWeather(points) {
  const lats = points.map(p => p[0]).join(",");
  const lons = points.map(p => p[1]).join(",");
  const url = `${WEATHER_URL}?latitude=${lats}&longitude=${lons}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m" +
    "&hourly=temperature_2m,dew_point_2m" +      // для індексу Нестерова
    "&daily=precipitation_sum" +                  // щоб знайти дні з дощем
    "&past_days=10&forecast_days=1&wind_speed_unit=ms&timezone=auto";
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {      // при ліміті (429) трохи чекаємо й пробуємо ще
    res = await fetch(url);
    if (res.ok || res.status !== 429) break;
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!res.ok) throw new Error("weather " + res.status);
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// Пошук міста за назвою -> {name, lat, lon, code, pop} або null
async function findCity(name) {
  const url = `${GEO_URL}?name=${encodeURIComponent(name)}&count=1&language=${lang}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("geo " + res.status);
  const data = await res.json();
  if (!data.results || !data.results.length) return null;
  const r = data.results[0];
  return {
    name: r.name + (r.country ? ", " + r.country : ""),
    lat: r.latitude, lon: r.longitude,
    code: r.feature_code || "", pop: r.population || 0
  };
}