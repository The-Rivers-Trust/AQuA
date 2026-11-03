// =====================================================================
// CONTEXTUAL LAYERS
// Background/reference layers for the map's Layers panel: WFD
// waterbody classification, National Soil Map and live storm overflows
// (the Open River Network is in river-network.js). All start hidden and
// are switched from the panel (js/map/layers-panel.js). Ported from the NRS
// dashboard.
// =====================================================================

import { WFD_CATCHMENTS, SOIL_MAP, RIVER_NETWORK, STORM_OVERFLOWS } from "../config.js";
import { escapeHtml, sqlTimestamp } from "../utils/format.js";
import { POPUP_STYLESHEET } from "./map-common.js";

async function getFeatureLayerClass() {
  const [FeatureLayer] = await $arcgis.import(["@arcgis/core/layers/FeatureLayer.js"]);
  return FeatureLayer;
}

// ---------------------------------------------------------------------
// WFD waterbody classification
// ---------------------------------------------------------------------

function wfdSymbol(color) {
  return { type: "simple-fill", style: "solid", color, outline: { type: "simple-line", color: [110, 110, 110, 0], width: 0.7 } };
}

// One classification field's renderer. Anything that isn't one of the
// five classes (null, coastal, "Not assessed") falls into one bucket.
export function wfdRenderer(field) {
  return {
    type: "unique-value",
    field,
    uniqueValueInfos: WFD_CATCHMENTS.classes.map((c) => ({ value: c.value, label: c.value, symbol: wfdSymbol(c.color) })),
    defaultSymbol: wfdSymbol(WFD_CATCHMENTS.notAssessedColor),
    defaultLabel: "Not assessed",
  };
}

export function wfdTitle(field) {
  const label = WFD_CATCHMENTS.fields.find((f) => f.field === field)?.label;
  return `${WFD_CATCHMENTS.title} (${label})`;
}

export async function createWfdLayer() {
  const FeatureLayer = await getFeatureLayerClass();
  const field = WFD_CATCHMENTS.fields[0].field;
  return new FeatureLayer({
    url: WFD_CATCHMENTS.url,
    outFields: ["water_body_name", ...WFD_CATCHMENTS.fields.map((f) => f.field)],
    visible: false,
    opacity: WFD_CATCHMENTS.opacity,
    popupEnabled: false,
    renderer: wfdRenderer(field),
    title: wfdTitle(field),
  });
}

// ---------------------------------------------------------------------
// National Soil Map
// ---------------------------------------------------------------------

const SOIL_PLACEHOLDER_SYMBOL = {
  type: "simple-fill",
  color: [170, 168, 158, 0.35],
  outline: { color: [140, 138, 128, 0.6], width: 0.5 },
};

let soilCategories = null; // Promise of the sorted category names

// The soil categories aren't known in advance, so the layer starts with a
// plain fill and swaps in a colour per category once they've been read.
export async function createSoilLayer() {
  const FeatureLayer = await getFeatureLayerClass();
  const layer = new FeatureLayer({
    url: SOIL_MAP.url,
    outFields: [SOIL_MAP.field],
    visible: false,
    popupEnabled: false,
    minScale: RIVER_NETWORK.minScale,
    renderer: { type: "simple", symbol: SOIL_PLACEHOLDER_SYMBOL },
    title: SOIL_MAP.title,
  });

  // Each map has its own copy of the layer, but the categories only need
  // reading once.
  soilCategories ??= layer.load()
    .then(() => layer.queryFeatures({ outFields: [SOIL_MAP.field], returnDistinctValues: true, returnGeometry: false, where: "1=1" }))
    .then((result) => result.features.map((f) => f.attributes[SOIL_MAP.field]).filter(Boolean).sort());
  soilCategories
    .then((values) => { if (values.length) layer.renderer = soilRenderer(values); })
    .catch((error) => console.warn("AQuA dashboard: soil categories unavailable, using a plain fill:", error));

  return layer;
}

// Hues spaced by the golden angle so neighbouring categories never get
// similar colours, however many there are. Assigned in sorted order so
// colours are stable between visits.
function soilRenderer(sortedValues) {
  return {
    type: "unique-value",
    field: SOIL_MAP.field,
    uniqueValueInfos: sortedValues.map((value, i) => ({
      value,
      label: value,
      symbol: { type: "simple-fill", color: [...hslToRgb((i * 137.50776) % 360, 46, 52), 0.55], outline: { color: [255, 255, 255, 0], width: 0 } },
    })),
    defaultSymbol: SOIL_PLACEHOLDER_SYMBOL,
    defaultLabel: "Other / no data",
  };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
}

// ---------------------------------------------------------------------
// Storm overflows
// One layer per water company, switched together as one. Status: 1 =
// discharging, 0 = not, empty = offline. "Recent" = stopped within the
// last recentHours.
// ---------------------------------------------------------------------

const categoryByKey = Object.fromEntries(STORM_OVERFLOWS.categories.map((c) => [c.key, c]));

// Nested ifs rather than IIf(): Arcade evaluates both IIf branches, and
// DateDiff on an empty date throws.
function categoryArcade(fields) {
  return `
    var status = $feature.${fields.status};
    var latestEnd = $feature.${fields.latestEventEnd};
    var category = "offline";
    if (!IsEmpty(status)) {
      if (status == 1) {
        category = "spilling";
      } else if (status == 0) {
        category = "notspilling";
        if (!IsEmpty(latestEnd)) {
          var hours = DateDiff(Now(), latestEnd, "hours");
          if (hours >= 0 && hours <= ${STORM_OVERFLOWS.recentHours}) { category = "recent"; }
        }
      }
    }`;
}

// Same rules in JS, for the pop-up.
function categoryOf(attrs, fields) {
  const status = attrs[fields.status];
  const latestEnd = attrs[fields.latestEventEnd];
  if (status === 1) return "spilling";
  if (status !== 0) return "offline";
  if (latestEnd != null) {
    const hours = (Date.now() - latestEnd) / 3600000;
    if (hours >= 0 && hours <= STORM_OVERFLOWS.recentHours) return "recent";
  }
  return "notspilling";
}

// A text symbol doesn't draw through the WebGL point pipeline, so each
// emoji is rasterised as a tiny SVG picture marker.
export function glyphSymbol(glyph, size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text x="16" y="23" font-size="24" ` +
    `font-family="Arial, &apos;Segoe UI Emoji&apos;, &apos;Noto Color Emoji&apos;, sans-serif" text-anchor="middle">${glyph}</text></svg>`;
  return { type: "picture-marker", url: `data:image/svg+xml,${encodeURIComponent(svg)}`, width: size, height: size };
}

function stormRenderer(fields) {
  return {
    type: "unique-value",
    valueExpression: `${categoryArcade(fields)}\n    return category;`,
    valueExpressionTitle: "Storm overflow status",
    uniqueValueInfos: STORM_OVERFLOWS.categories.map((c) => ({ value: c.key, label: c.label, symbol: glyphSymbol(c.glyph, c.size) })),
    defaultSymbol: glyphSymbol(categoryByKey.offline.glyph, categoryByKey.offline.size),
    defaultLabel: "Unknown",
  };
}

// Which icon wins where outfalls overlap: highest priority drawn on top.
function priorityArcade(fields) {
  const cases = STORM_OVERFLOWS.categories.map((c) => `if (category == "${c.key}") { return ${c.priority}; }`).join("\n    ");
  return `${categoryArcade(fields)}\n    ${cases}\n    return 0;`;
}

// "Discharging / recent only": a SQL version of the two categories. The
// cutoff is a literal timestamp, so it's re-applied every refreshMinutes.
function recentFilterSql(fields) {
  const cutoff = sqlTimestamp(Date.now() - STORM_OVERFLOWS.recentHours * 3600000);
  return `${fields.status} = 1 OR (${fields.status} = 0 AND ${fields.latestEventEnd} >= TIMESTAMP '${cutoff}')`;
}

// Resolves to a controller: { layers, setVisible(on), setRecentOnly(on) }.
export async function createStormOverflowLayers() {
  const FeatureLayer = await getFeatureLayerClass();
  const entries = STORM_OVERFLOWS.sources.map((source, index) => {
    const fields = { ...STORM_OVERFLOWS.defaultFields, ...source.fields };
    const layer = new FeatureLayer({
      url: source.url,
      outFields: Object.values(fields),
      visible: false,
      // Some services set their own scale range; every company should show
      // at every zoom.
      minScale: 0,
      maxScale: 0,
      refreshInterval: STORM_OVERFLOWS.refreshMinutes,
      renderer: stormRenderer(fields),
      orderBy: [{ valueExpression: priorityArcade(fields), order: "descending" }],
      // One legend entry stands for all of them.
      legendEnabled: index === 0,
      title: STORM_OVERFLOWS.title,
      popupTemplate: {
        title: (event) => event.graphic.attributes[fields.company] || STORM_OVERFLOWS.title,
        outFields: Object.values(fields),
        content: (event) => stormPopupContent(event.graphic.attributes, fields),
      },
    });
    return { layer, fields };
  });

  let recentOnly = false;
  let timer = null;
  const applyFilter = () => {
    entries.forEach(({ layer, fields }) => { layer.definitionExpression = recentOnly ? recentFilterSql(fields) : null; });
  };

  return {
    layers: entries.map((e) => e.layer),
    setVisible(on) {
      entries.forEach(({ layer }) => { layer.visible = on; });
    },
    setRecentOnly(on) {
      recentOnly = on;
      applyFilter();
      clearInterval(timer);
      timer = on ? setInterval(applyFilter, STORM_OVERFLOWS.refreshMinutes * 60000) : null;
    },
  };
}

// ---- Pop-up ----

function formatTime(ms) {
  if (ms == null) return null;
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/AM|PM/i, (m) => m.toLowerCase());
}

function formatDateTime(ms) {
  if (ms == null) return null;
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime(ms)}`;
}

function completedDuration(startMs, endMs) {
  if (!startMs || !endMs) return null;
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
  if (minutes < 60) return `${String(minutes).padStart(2, "0")} mins`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
}

function liveDuration(startMs) {
  const total = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  parts.push(`${minutes} ${minutes === 1 ? "min" : "mins"}`);
  parts.push(`${String(total % 60).padStart(2, "0")} secs`);
  return parts.join(" ");
}

function dateBadge(ms) {
  if (ms == null) return "";
  const d = new Date(ms);
  return `<div class="stormDateBadge">
      <span>${d.toLocaleDateString([], { month: "short" })}</span>
      <span class="stormDateBadgeDay">${d.getDate()}</span>
      <span>${d.getFullYear()}</span>
    </div>`;
}

// Built as an element so an ongoing discharge's duration can tick every
// second; the timer stops itself once the pop-up content is removed.
function stormPopupContent(attrs, fields) {
  const category = categoryOf(attrs, fields);
  const c = categoryByKey[category];
  const startMs = attrs[fields.latestEventStart];
  const endMs = attrs[fields.latestEventEnd];
  const updatedMs = attrs[fields.lastUpdated];
  const id = attrs[fields.id];
  const watercourse = attrs[fields.receivingWaterCourse];

  let details;
  if (category === "spilling") {
    details = `
      <div class="stormTime"><span class="stormTimeLabel">Started</span><span class="stormTimeValue">${escapeHtml(formatDateTime(startMs) ?? "–")}</span></div>
      <div class="stormDuration">Duration: <span data-live-duration>${startMs ? liveDuration(startMs) : "–"}</span></div>`;
  } else if (category === "recent") {
    const duration = completedDuration(startMs, endMs);
    details = `
      <div class="stormTimes">
        <div class="stormTime"><span class="stormTimeLabel">Started</span><span class="stormTimeValue">${escapeHtml(formatTime(startMs) ?? "–")}</span></div>
        <div class="stormTime"><span class="stormTimeLabel">Ended</span><span class="stormTimeValue">${escapeHtml(formatTime(endMs) ?? "–")}</span></div>
      </div>
      ${duration ? `<div class="stormDuration">Duration: ${duration}</div>` : ""}`;
  } else {
    details = `<div class="stormNoActivity">No discharge currently recorded for this outfall.</div>`;
  }

  const el = document.createElement("div");
  el.className = "stormPopup";
  el.innerHTML = `${POPUP_STYLESHEET}
    ${id ? `<div class="stormId">${escapeHtml(id)}</div>` : ""}
    ${watercourse ? `<div class="stormFeeds">Feeds into: <strong>${escapeHtml(watercourse)}</strong></div>` : ""}
    <div class="stormCard stormCard--${category}">
      ${dateBadge(category === "notspilling" || category === "offline" ? updatedMs : startMs ?? updatedMs)}
      <div class="stormDetails">
        <div class="stormHeadlineRow">
          <span class="stormHeadline">${escapeHtml(c.headline)} ${c.glyph}</span>
          ${category === "spilling" ? `<span class="stormActivePill">Active</span>` : ""}
        </div>
        ${details}
      </div>
    </div>
    ${updatedMs ? `<div class="stormUpdated">Data last updated ${new Date(updatedMs).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>` : ""}`;

  if (category === "spilling" && startMs) {
    const live = el.querySelector("[data-live-duration]");
    let ticks = 0;
    let seen = false;
    const timer = setInterval(() => {
      ticks++;
      if (el.isConnected) seen = true;
      else if (seen || ticks > 10) return clearInterval(timer); // closed, or never shown
      live.textContent = liveDuration(startMs);
    }, 1000);
  }
  return el;
}

// ---------------------------------------------------------------------
// Open River Network pop-up
// The network layer itself lives in js/map/river-network.js; the map's click
// handler (layers-panel.js) opens this pop-up when a click misses every site
// and storm overflow, so a click on a site sitting on a river still opens the
// site.
// ---------------------------------------------------------------------

export const RIVER_POPUP_FIELDS = ["OBJECTID", "name1", "form", "Strahler", "Dist2Mth", "US_Accum", "CaBA_Catchment", "CaBA_Partnership", "CaBA_Website"];

const RIVER_FORMS = { inlandRiver: "River", tidalRiver: "Tidal river", canal: "Canal", lake: "Lake" };

export function riverPopupTemplate() {
  return {
    title: (event) => event.graphic.attributes.name1?.trim() || "Unnamed watercourse",
    outFields: RIVER_POPUP_FIELDS,
    content: (event) => riverPopupContent(event.graphic.attributes),
  };
}

const km = (metres) => (metres == null ? "–" : `${(metres / 1000).toLocaleString(undefined, { maximumFractionDigits: metres < 10000 ? 1 : 0 })} km`);

function riverPopupContent(attrs) {
  const website = /^https?:\/\//i.test(attrs.CaBA_Website ?? "") ? attrs.CaBA_Website : null;
  const el = document.createElement("div");
  el.className = "riverPopup";
  el.innerHTML = `${POPUP_STYLESHEET}
    <div class="riverForm">${escapeHtml(RIVER_FORMS[attrs.form] ?? "Watercourse")} · Open River Network</div>
    <div class="riverStats">
      <div class="riverStat">
        <span class="riverStatValue">${attrs.Strahler ?? "–"}</span>
        <span class="riverStatLabel">Strahler stream order</span>
      </div>
      <div class="riverStat">
        <span class="riverStatValue">${km(attrs.US_Accum)}</span>
        <span class="riverStatLabel">River network upstream</span>
      </div>
      <div class="riverStat">
        <span class="riverStatValue">${km(attrs.Dist2Mth)}</span>
        <span class="riverStatLabel">Distance to the sea</span>
      </div>
    </div>
    <p class="riverNote">Order 1 is a headwater stream; where two streams of the same order meet, the river below goes up one order.</p>
    ${attrs.CaBA_Catchment ? `
      <div class="riverCatchment">
        <span class="riverStatLabel">CaBA catchment</span>
        <strong>${escapeHtml(attrs.CaBA_Catchment)}</strong>
        ${attrs.CaBA_Partnership ? `<span>${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(attrs.CaBA_Partnership)}</a>` : escapeHtml(attrs.CaBA_Partnership)}</span>` : ""}
      </div>` : ""}`;
  return el;
}
