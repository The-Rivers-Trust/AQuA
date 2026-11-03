// =====================================================================
// MAP COMMON
// Shared by every map tab: basemap (shared choice, see basemaps.js), the
// focus-ring fix, pop-up docking, zoom-to-sites, marker symbols, and the
// small HTML helpers the legends and pop-ups use.
// =====================================================================

import { MAP } from "../config.js";
import { escapeHtml } from "../utils/format.js";
import { setupBasemap } from "./basemaps.js";

// Shared basemap + selector, focus-ring fix and pop-up docking. Resolves
// once the view is ready. (The contextual layers are added separately by
// setupLayersPanel in layers-panel.js.)
export async function setupMap(mapEl) {
  mapEl.center = MAP.center;
  mapEl.zoom = MAP.zoom;
  await setupBasemap(mapEl);
  initFocusRing(mapEl);

  await mapEl.viewOnReady();

  // Dock the pop-up to the map's edge when the map is narrow OR short
  // (5.x only checks width by default), so it's never cut off.
  mapEl.popup.dockOptions = { ...mapEl.popup.dockOptions, breakpoint: { width: 544, height: 480 } };
}

// Hide the view's focus ring after mouse/touch input, show it again as
// soon as the keyboard is used - see .siteMap.pointerFocus in layout.css.
function initFocusRing(mapEl) {
  mapEl.addEventListener("pointerdown", () => mapEl.classList.add("pointerFocus"));
  mapEl.addEventListener("keydown", () => mapEl.classList.remove("pointerFocus"));
}

export async function zoomToLayer(mapEl, layer) {
  const { extent, count } = await layer.queryExtent();
  if (!extent) return;
  // A single site has a zero-size extent - zoom to it rather than "fit".
  await mapEl.goTo(count === 1 ? { target: extent.center, zoom: 13 } : extent.expand(1.15));
}

export function markerSymbol(color, size = 10, outline = [255, 255, 255, 0.9]) {
  return {
    type: "simple-marker",
    style: "circle",
    size,
    color,
    outline: { color: outline, width: 1 },
  };
}

// Plain (non-interactive) legend row.
export function legendRow(color, label, count) {
  return `
    <li class="legendRow">
      <span class="legendSwatch" style="background:${color}"></span>
      <span class="legendLabel">${escapeHtml(label)}</span>
      <span class="legendCount">${count}</span>
    </li>`;
}

// Legend row that toggles a map filter. While some rows are picked, the
// others are dimmed so it's clear which ones the map is showing.
// swatchHtml lets a row draw its own marker (e.g. a hollow ring).
export function legendToggleRow({ key, swatchHtml, label, count, selected, picking }) {
  return `
    <li>
      <button type="button" class="legendRow legendRow--toggle${picking && !selected ? " isDimmed" : ""}"
        data-band="${escapeHtml(key)}" aria-pressed="${selected}">
        ${swatchHtml}
        <span class="legendLabel">${escapeHtml(label)}</span>
        <span class="legendCount">${count}</span>
      </button>
    </li>`;
}

export function swatch(color) {
  return `<span class="legendSwatch" style="background:${color}"></span>`;
}

// "Showing N sites in the selected band(s). Show all" / "Click a ... ".
export function legendPickNote(picking, shownCount, pickedCount, hint) {
  if (!picking) return `<p class="legendNote">${escapeHtml(hint)}</p>`;
  return `<p class="legendNote">Showing ${shownCount} site${shownCount === 1 ? "" : "s"} in the selected band${pickedCount === 1 ? "" : "s"}.
    <button type="button" class="legendShowAll" data-action="show-all">Show all</button></p>`;
}

// Toggles `set` from a click on a legend built with legendToggleRow /
// legendPickNote. Returns true if the click changed anything (and then
// the caller re-renders and calls restoreLegendFocus).
export function handleLegendPick(event, set) {
  const button = event.target.closest("[data-band]");
  if (button) {
    const key = button.dataset.band;
    if (set.has(key)) set.delete(key);
    else set.add(key);
    return { changed: true, key };
  }
  if (event.target.closest("[data-action='show-all']")) {
    set.clear();
    return { changed: true, key: null };
  }
  return { changed: false };
}

// Re-rendering replaces the buttons - put keyboard focus back.
export function restoreLegendFocus(legendEl, key) {
  const target = key
    ? legendEl.querySelector(`[data-band="${CSS.escape(key)}"]`)
    : legendEl.querySelector("[data-band]");
  target?.focus();
}

// Pop-ups render inside <arcgis-map>'s shadow DOM, where page styles
// don't reach - each pop-up loads css/popup.css itself.
export const POPUP_STYLESHEET = `<link rel="stylesheet" href="css/popup.css" />`;

export function attributeTable(rows) {
  const body = rows
    .filter(([, value]) => value != null && value !== "")
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return body ? `<table class="attributeTable">${body}</table>` : "";
}

// Site fields every joined, client-side sites layer carries.
export const SITE_LAYER_FIELDS = [
  { name: "OBJECTID", type: "oid" },
  { name: "site_name", type: "string" },
  { name: "case_study_group", type: "string" },
  { name: "River_Waterbody", type: "string" },
  { name: "Catchment", type: "string" },
  { name: "OS_Grid_Ref", type: "string" },
  { name: "Description", type: "string" },
];
