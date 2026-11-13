// Колір кожного з 5 рівнів небезпеки (такі самі змінні є в style.css)
const COLORS = ["#2f9e5b", "#d4c21c", "#f0a21e", "#e5501b", "#a31225"];

// Показник Нестерова: за кожен день без значного дощу додаємо T * (T - Td),
// де T і Td — температура й точка роси о 13:00. Дощ понад 3 мм обнуляє суму.
function nesterov(w) {
  let G = 0, dry = 0;
  w.daily.time.forEach((day, i) => {
    const k = w.hourly.time.indexOf(day + "T13:00");
    if (k < 0) return;
    const T = w.hourly.temperature_2m[k];
    const Td = w.hourly.dew_point_2m[k];
    const rain = w.daily.precipitation_sum[i] || 0;
    if (rain > 3) { G = 0; dry = 0; }
    else { dry++; if (T > 0) G += T * (T - Td); }
  });
  return { G: Math.round(G), dry };
}

// Класи за Нестеровим: до 300, до 1000, до 4000, до 10000, більше
function level(G) {
  return G <= 300 ? 0 : G <= 1000 ? 1 : G <= 4000 ? 2 : G <= 10000 ? 3 : 4;
}

// Збирає все потрібне для показу в один об'єкт
function analyse(w) {
  const n = nesterov(w);
  return {
    temp: w.current.temperature_2m, hum: w.current.relative_humidity_2m,
    wind: w.current.wind_speed_10m, dry: n.dry, G: n.G, lvl: level(n.G)
  };
}
