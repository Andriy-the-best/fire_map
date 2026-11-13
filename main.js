// Запуск: з'єднує кнопки, пошук і мову з рештою коду.
function buildLegend() {
  document.getElementById("legend").innerHTML =
    t("levels").map((name, i) => `<span><b style="background:${COLORS[i]}"></b>${name}</span>`).join("");
}

// Блок під картою: пояснення рівнів, методу й джерел (створюється тут, тому index.html міняти не треба)
function buildAbout() {
  let s = document.getElementById("about");
  if (!s) { s = document.createElement("section"); s.id = "about"; document.querySelector("main").after(s); }
  const list = a => a.map(x => `<li>${x}</li>`).join("");
  s.innerHTML = `<h2>${t("aboutTitle")}</h2>
    <div class="lv-cards">${t("levels").map((n, i) =>
      `<div class="lv-card" style="--c:${COLORS[i]}"><b>${i + 1}</b><strong>${n}</strong><span>${t("idx")}: ${t("ranges")[i]}</span></div>`).join("")}</div>
    <div class="about-cols">
      <article><h3>${t("howTitle")}</h3><ol>${list(t("howSteps"))}</ol></article>
      <article><h3>${t("limitTitle")}</h3><ul>${list(t("limitItems"))}</ul></article>
      <article><h3>${t("srcTitle")}</h3><ul>${list(t("srcItems"))}</ul></article>
    </div>`;
}

// Кнопка «Симулятор пожежі» в шапці (створюється тут, тому index.html міняти не треба)
const simBtn = document.createElement("a");
simBtn.id = "btn-sim"; simBtn.className = "hbtn";
document.getElementById("btn-lang").before(simBtn);
simBtn.addEventListener("click", () => {                       // веде на симулятор: обране місце або центр карти
  if (selected) { simBtn.href = simUrl(selected); return; }
  simBtn.href = "simulator.html?" + new URLSearchParams({ lang });      // місце не обране: у симуляторі стартова територія за замовчуванням
});
simBtn.href = "simulator.html";

function refresh() {
  simBtn.textContent = t("simBtn");
  applyLang(); buildLegend(); buildAbout(); refreshTooltips(); updateCountryLabels(); render();
}

// Клік по карті
map.on("click", e => pick(e.latlng.lat, e.latlng.lng));

// Наскільки наближати: країна далеко, велике місто близько, село ще ближче
function zoomFor(c) {
  const code = c.code;
  if (code.startsWith("PCL")) return 5;       // країна
  if (code.startsWith("ADM1")) return 7;      // область
  if (code.startsWith("ADM2")) return 9;      // район
  if (code === "PPLC" || c.pop > 1e6) return 11;
  if (c.pop > 1e5) return 12;
  if (c.pop > 1e4) return 13;
  return 14;
}

// Пульсуючі кільця на знайденому місці
let foundMarker = null;
function showFound(lat, lon) {
  if (foundMarker) foundMarker.remove();
  foundMarker = L.marker([lat, lon], {
    interactive: false, keyboard: false,
    icon: L.divIcon({ className: "found", html: "<i></i><i></i>", iconSize: [0, 0] })
  }).addTo(map);
  setTimeout(() => { if (foundMarker) { foundMarker.remove(); foundMarker = null; } }, 6000);
}

// Пошук міста (спільний для шапки й для панелі порівняння)
function showMsg(text) {
  const m = document.getElementById("cmp-msg");
  if (compareMode && m) m.textContent = text;
  else panel.innerHTML = `<p class="hint">${text}</p>`;
}
async function doSearch(q, btn) {
  q = q.trim();
  if (!q) return;
  btn.disabled = true;
  try {
    const city = await findCity(q);
    if (!city) { showMsg(t("notfound")); return; }
    // У порівнянні: якщо перше місце вже обране, летимо не в нове місто, а так, щоб було видно обидва (один плавний рух)
    const other = compareMode ? slots[1 - nextSlot] : null;
    if (other) {
      map.flyToBounds(L.latLngBounds([[other.lat, other.lon], [city.lat, city.lon]]),
        { padding: [90, 90], maxZoom: 8, duration: 2 });
    } else {
      map.flyTo([city.lat, city.lon], zoomFor(city), { duration: 2.2 });
    }
    const snap = nearCityDot(city.lat, city.lon, 0.15);       // чи є поруч наша точка міста
    const at = snap ? snap.d.getLatLng() : { lat: city.lat, lng: city.lon };
    map.once("moveend", () => showFound(at.lat, at.lng));
    await pick(city.lat, city.lon, city.name.split(",")[0], true);
  } catch (err) {
    console.error(err);
    showMsg(t("error"));
  } finally { btn.disabled = false; }
}
document.getElementById("search").addEventListener("submit", e => {
  e.preventDefault();
  doSearch(document.getElementById("q").value, e.target.querySelector("button"));
});

// Пошук усередині панелі порівняння: викликається після кожного малювання таблиці
function bindCompareSearch() {
  const f = document.getElementById("cmp-search");
  if (!f) return;
  f.addEventListener("submit", e => {
    e.preventDefault();
    doSearch(f.querySelector("input").value, f.querySelector("button"));
  });
}

document.getElementById("btn-compare").addEventListener("click", toggleCompare);
document.getElementById("btn-lang").addEventListener("click", () => {
  lang = lang === "uk" ? "en" : "uk";
  try { localStorage.setItem("lang", lang); } catch (e) {}
  refresh();
});

refresh();
loadCities();