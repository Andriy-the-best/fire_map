// Усі тексти сайту. Щоб додати мову, скопіюй блок "en" і переклади.
const TEXT = {
  uk: {
    title: "Карта пожежної небезпеки світу",
    placeholder: "Місто…", go: "Знайти", compare: "Порівняй регіони",
    legend: "Небезпека:", hint: "Клікни на карту або знайди місто.",
    cmpHint: "Обери на карті два місця, щоб порівняти їх.",
    loading: "Завантаження…", error: "Не вдалося отримати дані. Спробуй ще раз.",
    notfound: "Такого місця не знайдено.", empty: "Ще не обрано",
    temp: "Температура", hum: "Вологість", wind: "Вітер", ms: "м/с",
    dry: "Днів без дощу", idx: "Індекс Нестерова", place: "Місце",
    near: "біля", simBtn: "Симулятор пожежі", simHere: "Симулювати пожежу тут →", sea: "Це море або океан. Пожежної небезпеки тут немає — обери місце на суші.", emFire: "Пожежна служба", emGen: "Єдиний екстрений номер", hotTitle: "Небезпечні місця (рівень 4–5)", hotShown: "Показано точок",
    kind_city: "Місто", kind_town: "Містечко", kind_village: "Село", kind_hamlet: "Хутір",
    levels: ["Низький", "Помірний", "Високий", "Дуже високий", "Надзвичайний"],
    advice: [
      "Ризик мінімальний. Вогонь розпалюйте лише в дозволених місцях і не залишайте без нагляду.",
      "Ризик помірний. Гасіть вогнище водою до кінця й не залишайте його без нагляду.",
      "Ризик високий. Не розпалюйте вогнищ у лісі та на сухій траві, не кидайте недопалків.",
      "Ризик дуже високий. Уникайте відкритого вогню та повідомляйте про дим екстреним службам.",
      "Ризик надзвичайний. Не заходьте в ліс і стежте за повідомленнями місцевої влади."
    ],
    emerg: "Екстрені служби: 112 / 911 / 101 залежно від країни.",
    ranges: ["до 300", "301–1000", "1001–4000", "4001–10000", "понад 10000"],
    aboutTitle: "Як читати карту",
    howTitle: "Як рахується небезпека",
    howSteps: [
      "Беремо температуру й точку роси о 13:00 за останні 10 днів.",
      "За кожен день без дощу додаємо T × (T − Td): чим повітря спекотніше й суше, тим більший внесок.",
      "Дощ понад 3 мм обнуляє суму. Підсумок, індекс Нестерова, визначає один із п'яти рівнів."
    ],
    limitTitle: "Що варто знати",
    limitItems: [
      "Індекс враховує лише погоду, а не те, чи є що горіти. У пустелях він високий, хоча там немає ні лісу, ні трави.",
      "Небезпечні точки — це сітка приблизно через 330 км, яка оновлюється кілька разів на добу. Клік по карті дає дані для будь-якого місця."
    ],
    srcTitle: "Джерела даних",
    srcItems: [
      "Погода: Open-Meteo.com",
      "Карта й назви місць: OpenStreetMap, Nominatim",
      "Кордони країн: Natural Earth",
      "Супутникові й рельєфні шари: Esri, OpenTopoMap",
      "Метод: індекс Нестерова, який використовують в Україні та сусідніх країнах"
    ]
  },
  en: {
    title: "World fire danger map",
    placeholder: "City…", go: "Search", compare: "Compare regions",
    legend: "Danger:", hint: "Click the map or search for a city.",
    cmpHint: "Pick two places on the map to compare them.",
    loading: "Loading…", error: "Could not get the data. Please try again.",
    notfound: "Place not found.", empty: "Not selected yet",
    temp: "Temperature", hum: "Humidity", wind: "Wind", ms: "m/s",
    dry: "Days without rain", idx: "Nesterov index", place: "Place",
    near: "near", simBtn: "Fire simulator", simHere: "Simulate a fire here →", sea: "This is a sea or ocean. There is no fire danger here — pick a place on land.", emFire: "Fire service", emGen: "Emergency number", hotTitle: "Danger hot spots (level 4–5)", hotShown: "Points shown",
    kind_city: "City", kind_town: "Town", kind_village: "Village", kind_hamlet: "Hamlet",
    levels: ["Low", "Moderate", "High", "Very high", "Extreme"],
    advice: [
      "Minimal risk. Light fires only in permitted places and never leave them unattended.",
      "Moderate risk. Put out any fire completely with water and never leave it unattended.",
      "High risk. No fires in forests or on dry grass, and do not throw away cigarette butts.",
      "Very high risk. Avoid open fire entirely and report smoke to the emergency services.",
      "Extreme risk. Stay out of forests and follow announcements from local authorities."
    ],
    emerg: "Emergency services: 112 / 911 / 101 depending on the country.",
    ranges: ["up to 300", "301–1000", "1001–4000", "4001–10000", "over 10000"],
    aboutTitle: "How to read the map",
    howTitle: "How the danger is calculated",
    howSteps: [
      "We take the temperature and dew point at 13:00 for the last 10 days.",
      "For every day without rain we add T × (T − Td): the hotter and drier the air, the bigger the contribution.",
      "Rain over 3 mm resets the sum. The result, the Nesterov index, gives one of five levels."
    ],
    limitTitle: "Good to know",
    limitItems: [
      "The index only looks at weather, not at whether there is anything to burn. It is high in deserts, even though there is no forest or grass.",
      "The danger points are a grid roughly every 330 km, updated several times a day. Clicking the map gives data for any place."
    ],
    srcTitle: "Data sources",
    srcItems: [
      "Weather: Open-Meteo.com",
      "Map and place names: OpenStreetMap, Nominatim",
      "Country borders: Natural Earth",
      "Satellite and terrain layers: Esri, OpenTopoMap",
      "Method: the Nesterov index, used in Ukraine and neighbouring countries"
    ]
  }
};

let lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "uk";   // мову можна передати в адресі (?lang=en)
try { lang = localStorage.getItem("lang") || "uk"; } catch (e) {}

function t(key) { return TEXT[lang][key]; }

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
  document.getElementById("q").placeholder = t("placeholder");
  document.getElementById("btn-lang").textContent = lang === "uk" ? "EN" : "UA";
  document.title = t("title");
}