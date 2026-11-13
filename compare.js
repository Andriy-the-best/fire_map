// Режим «Порівняй регіони»: два місця поруч у таблиці.
let compareMode = false;
let slots = [null, null];
let nextSlot = 0; // у яку комірку піде наступний клік

function toggleCompare() {
  compareMode = !compareMode;
  slots = [null, null]; nextSlot = 0;
  document.body.classList.toggle("cmp", compareMode);
  document.getElementById("btn-compare").classList.toggle("on", compareMode);
  markPicked([]);
  if (!compareMode) selected = null;
  render();
  map.invalidateSize(); // карта змінила розмір
}

function addToCompare(place) {
  slots[nextSlot] = place;
  nextSlot = 1 - nextSlot;
  markPicked(slots);
  renderCompare();
}

function renderCompare() {
  const [a, b] = slots;
  const cell = (p, fn) => `<td>${p ? fn(p) : '<span class="hint">' + t("empty") + "</span>"}</td>`;
  const labels = rows({ temp: 0, hum: 0, wind: 0, dry: 0, G: 0 }).map(r => r[0]);
  panel.innerHTML = `<p class="hint">${t("cmpHint")}</p>
    <form id="cmp-search" class="cmp-search"><input type="text" placeholder="${t("placeholder")}" aria-label="${t("placeholder")}"><button type="submit">${t("go")}</button></form>
    <p id="cmp-msg" class="hint"></p><table>
    <tr><th>${t("place")}</th>${[a, b].map(p => cell(p, x => `<span class="name">${esc(x.name)}</span>${gauge(x.lvl)}
      <b style="color:${COLORS[x.lvl]}">${t("levels")[x.lvl]} · ${x.lvl + 1}/5</b>`)).join("")}</tr>
    ${labels.map((label, i) => `<tr><th>${label}</th>${[a, b].map(p => cell(p, x => rows(x)[i][1])).join("")}</tr>`).join("")}
  </table>`;
  bindCompareSearch();
}