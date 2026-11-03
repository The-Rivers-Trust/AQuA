// =====================================================================
// METALS MAP TAB
// The AQuA sites joined client-side to the lab metals results. Pick a
// metal and sites are sized by its value (area proportional to value);
// sites where the lab flagged the reading below the limit of detection
// (LOD) are drawn as hollow rings. No thresholds yet, so colour carries
// no good/bad meaning here. Legend categories (detected / below LOD /
// no result) double as a filter, same as the citizen science legend.
// =====================================================================

import { AQUA, METALS, NO_DATA, SITE_COLOR } from "../config.js";
import { fetchSites, fetchMetals, fetchCitizenScience, recordsBySite, hasSeasons, SITES_SPATIAL_REFERENCE } from "../data/aqua-service.js";
import { onFilterChange, matchesFilters, filterWhereClause, hasActiveFilters, getSeason } from "../filters.js";
import { escapeHtml, formatSeason, formatSignificant } from "../utils/format.js";
import {
  setupMap, zoomToLayer, markerSymbol, legendRow, legendToggleRow, swatch, legendPickNote,
  handleLegendPick, restoreLegendFocus, SITE_LAYER_FIELDS,
} from "../map/map-common.js";
import { setupLayersPanel } from "../map/layers-panel.js";
import { initSitePanel, registerSiteLayer, refreshSite } from "../map/site-panel.js";
import { buildSitePanelContent, section } from "../map/site-sections.js";
import { surveysForSite } from "../data/surveys.js";

const SITES_VIEW = "sites"; // metal picker value for plain site markers
const LOD_RING_SIZE = 10;
const NO_RESULT_SIZE = 6;

// Per-site state for one metal, stored as "<metal>_state" so the legend
// filter can use it in a definitionExpression.
const STATES = {
  detected: { label: "Detected (sized by value)" },
  belowLod: { label: "Below limit of detection" },
  noResult: { label: "No result" },
};

const state = {
  mapEl: null,
  els: null,
  sites: [],
  records: [],
  seasonal: false, // does the metals table carry seasons yet?
  season: null,
  metals: [], // METALS.list entries that have any data, with stats
  metal: SITES_VIEW,
  picked: new Set(), // legend states picked; empty = all
  layer: null,
};

export async function initMetalsMap({ mapEl, metalSelectEl, legendEl }) {
  state.mapEl = mapEl;
  state.els = { metalSelectEl, legendEl };

  await setupMap(mapEl);
  // Clicking a site opens its panel under the map: site details, the
  // site's lab results, and its citizen science surveys to flick through.
  initSitePanel(mapEl, {
    render: async (a) => buildSitePanelContent(a, {
      surveys: surveysForSite(await fetchCitizenScience(), a.site_name),
      season: getSeason(),
      middle: () => metalsSection(a),
    }),
  });
  // Contextual layers + their panel - extras, so never stop the map loading.
  await setupLayersPanel(mapEl).catch((error) => console.warn("AQuA dashboard: map layers unavailable:", error));

  const [sites, records] = await Promise.all([fetchSites(), fetchMetals()]);
  state.sites = sites;
  state.records = records;
  state.seasonal = hasSeasons(records);
  state.season = getSeason();

  metalSelectEl.addEventListener("calciteSelectChange", () => {
    state.metal = metalSelectEl.value;
    state.picked.clear();
    applyWhereClause();
    applyRenderer();
    refreshSite(mapEl, findSite); // the panel highlights the chosen metal
  });
  legendEl.addEventListener("click", onLegendClick);

  onFilterChange(async (current, previous) => {
    if (current.season !== previous.season) {
      state.season = current.season;
      // Untagged metals results don't change with the season.
      if (state.seasonal) await rebuildLayer();
      else renderLegend();
      return;
    }
    applyWhereClause();
    renderLegend();
    await zoomToLayer(mapEl, state.layer);
  });

  await rebuildLayer();
  await zoomToLayer(mapEl, state.layer);
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

function seasonRecords() {
  return recordsBySite(state.records, state.seasonal ? state.season : null);
}

// Metals with at least one value or LOD flag, plus the stats the size
// scale needs. Metals the lab returned nothing for (e.g. caesium) are
// left out of the picker entirely.
function metalStats(bySite) {
  const records = [...bySite.values()];
  return METALS.list
    .map((metal) => {
      const values = records.map((r) => r[metal.key]).filter((v) => v != null);
      const belowLod = records.filter((r) => isBelowLod(r, metal.key)).length;
      return { ...metal, detected: values.length, belowLod, max: values.length ? Math.max(...values) : null, min: values.length ? Math.min(...values) : null };
    })
    .filter((m) => m.detected + m.belowLod > 0);
}

function isBelowLod(record, key) {
  return record?.[key + METALS.lodSuffix] === METALS.lodFlag;
}

function metalState(record, key) {
  if (isBelowLod(record, key)) return "belowLod";
  return record?.[key] != null ? "detected" : "noResult";
}

// ---------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------

function layerFields() {
  return [
    ...SITE_LAYER_FIELDS,
    { name: "has_sample", type: "integer" },
    ...state.metals.flatMap((m) => [
      { name: m.key, type: "double" },
      { name: `${m.key}_state`, type: "string" },
    ]),
  ];
}

async function buildGraphics(bySite) {
  const [Graphic] = await $arcgis.import(["@arcgis/core/Graphic.js"]);
  return state.sites.map((site) => {
    const record = bySite.get(site.attributes[AQUA.joinField]);
    const attributes = { ...site.attributes, has_sample: record ? 1 : 0 };
    for (const m of state.metals) {
      attributes[m.key] = record?.[m.key] ?? null;
      attributes[`${m.key}_state`] = metalState(record, m.key);
    }
    return new Graphic({ geometry: site.geometry, attributes });
  });
}

async function rebuildLayer() {
  const [FeatureLayer] = await $arcgis.import(["@arcgis/core/layers/FeatureLayer.js"]);
  const bySite = seasonRecords();
  state.metals = metalStats(bySite);
  renderMetalOptions();

  const layer = new FeatureLayer({
    id: "aquaMetalsSites",
    title: "AQuA sites (metals)",
    source: await buildGraphics(bySite),
    fields: layerFields(),
    objectIdField: "OBJECTID",
    outFields: ["*"],
    geometryType: "point",
    spatialReference: SITES_SPATIAL_REFERENCE,
    popupEnabled: false, // a click opens the site panel instead
  });

  registerSiteLayer(layer);
  if (state.layer) state.mapEl.map.remove(state.layer);
  state.mapEl.map.add(layer);
  state.layer = layer;
  refreshSite(state.mapEl, findSite);

  applyWhereClause();
  applyRenderer();
}

const findSite = (name) => state.layer?.source.find((g) => g.attributes.site_name === name);

function currentMetal() {
  return state.metals.find((m) => m.key === state.metal) ?? null;
}

function layerWhereClause() {
  const parts = [filterWhereClause()];
  if (currentMetal() && state.picked.size) {
    const keys = [...state.picked].map((key) => `'${key}'`).join(", ");
    parts.push(`${state.metal}_state IN (${keys})`);
  }
  return parts.filter(Boolean).join(" AND ") || null;
}

function applyWhereClause() {
  if (state.layer) state.layer.definitionExpression = layerWhereClause();
}

// Marker diameter for a detected value: area proportional to the value
// (diameter ~ sqrt), relative to the largest reading of that metal, and
// never smaller than minSize so tiny readings stay clickable.
function sizeFor(metal, value) {
  if (!metal.max) return METALS.minSize;
  return Math.max(METALS.minSize, METALS.maxSize * Math.sqrt(value / metal.max));
}

function applyRenderer() {
  if (!state.layer) return;
  const metal = currentMetal();

  if (!metal) {
    state.layer.renderer = { type: "simple", symbol: markerSymbol(SITE_COLOR), label: "AQuA site" };
    state.layer.orderBy = null;
    renderLegend();
    return;
  }

  // Same sizing as sizeFor, in Arcade so the map can size each point.
  const sizeExpression = `
    var s = $feature.${metal.key}_state;
    if (s == "detected") {
      return Max(${METALS.minSize}, ${METALS.maxSize} * Sqrt($feature.${metal.key} / ${metal.max}));
    }
    if (s == "belowLod") { return ${LOD_RING_SIZE}; }
    return ${NO_RESULT_SIZE};`;

  state.layer.renderer = {
    type: "unique-value",
    field: `${metal.key}_state`,
    uniqueValueInfos: [
      {
        value: "detected",
        label: STATES.detected.label,
        symbol: markerSymbol([...hexToRgb(METALS.color), 0.85], 10),
      },
      {
        value: "belowLod",
        label: STATES.belowLod.label,
        symbol: {
          type: "simple-marker",
          style: "circle",
          color: [0, 0, 0, 0],
          outline: { color: METALS.color, width: 2 },
        },
      },
      {
        value: "noResult",
        label: STATES.noResult.label,
        symbol: markerSymbol(NO_DATA.color, NO_RESULT_SIZE),
      },
    ],
    visualVariables: [
      {
        type: "size",
        valueExpression: sizeExpression,
        valueExpressionTitle: `${metal.label} (${METALS.unit})`,
        // Identity mapping: the expression already returns pixels.
        stops: [{ value: 0, size: 0 }, { value: 100, size: 100 }],
        legendOptions: { showLegend: false },
      },
    ],
  };
  // Small markers on top of big ones, so no site gets buried.
  state.layer.orderBy = [{ valueExpression: sizeExpression, order: "ascending" }];
  renderLegend();
}

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// ---------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------

function renderMetalOptions() {
  const { metalSelectEl } = state.els;
  const option = (m) => `<calcite-option value="${m.key}">${escapeHtml(m.label)} (${m.symbol})</calcite-option>`;

  metalSelectEl.innerHTML = `
    <calcite-option value="${SITES_VIEW}">Sites only</calcite-option>
    ${state.metals.map(option).join("")}`;

  // Keep the current pick if that metal is still in the list.
  if (!currentMetal()) state.metal = SITES_VIEW;
  metalSelectEl.value = state.metal;
  metalSelectEl.disabled = false;
}

function renderLegend() {
  const { legendEl } = state.els;
  const graphics = state.layer.source.toArray().filter((g) => matchesFilters(g.attributes));
  const filteredNote = hasActiveFilters()
    ? `<p class="legendNote">Showing ${graphics.length} of ${state.sites.length} sites (filtered).</p>`
    : "";
  const seasonNote = state.seasonal
    ? ""
    : `<p class="legendNote">Metals results aren't split by season yet, so every result is shown whatever season is picked above.</p>`;

  const metal = currentMetal();
  if (!metal) {
    const withSample = graphics.filter((g) => g.attributes.has_sample).length;
    legendEl.innerHTML = `
      <ul class="legendList">${legendRow(SITE_COLOR, "AQuA site", graphics.length)}</ul>
      <p class="legendNote">${withSample} of ${graphics.length} sites have metals results${state.seasonal ? ` for ${escapeHtml(formatSeason(state.season))}` : ""}.</p>
      ${seasonNote}
      ${filteredNote}`;
    return;
  }

  const stateField = `${metal.key}_state`;
  const counts = new Map();
  for (const g of graphics) counts.set(g.attributes[stateField], (counts.get(g.attributes[stateField]) ?? 0) + 1);

  const picking = state.picked.size > 0;
  const swatches = {
    detected: swatch(METALS.color),
    belowLod: `<span class="legendSwatch legendSwatch--ring" style="border-color:${METALS.color}"></span>`,
    noResult: swatch(NO_DATA.color),
  };
  const rows = Object.entries(STATES)
    .filter(([key]) => key !== "noResult" || counts.get(key))
    .map(([key, s]) => legendToggleRow({
      key,
      swatchHtml: swatches[key],
      label: s.label,
      count: counts.get(key) ?? 0,
      selected: state.picked.has(key),
      picking,
    }))
    .join("");
  const shown = graphics.filter((g) => state.picked.has(g.attributes[stateField])).length;

  legendEl.innerHTML = `
    <p class="legendTitle">${escapeHtml(metal.label)} (${escapeHtml(METALS.unit)})</p>
    ${metal.detected ? sizeKey(metal) : `<p class="legendNote">Below the limit of detection at every site with a result.</p>`}
    <ul class="legendList" aria-label="Filter the map by ${escapeHtml(metal.label)} result">${rows}</ul>
    ${legendPickNote(picking, shown, state.picked.size, "Click a row to show only those sites.")}
    ${seasonNote}
    ${filteredNote}`;
}

// Example circles for the size scale: the largest reading, a quarter of
// it, and the smallest. Sizes come from sizeFor, so they match the map.
function sizeKey(metal) {
  const samples = metal.max === metal.min
    ? [metal.max]
    : [...new Set([metal.max, metal.max / 4, metal.min])].filter((v) => v >= metal.min);
  const items = samples.map((v) => {
    const size = sizeFor(metal, v);
    return `
      <li class="sizeKeyItem">
        <span class="sizeKeyCircle" style="width:${size}px;height:${size}px;background:${METALS.color}"></span>
        <span class="sizeKeyLabel">${formatSignificant(v)}</span>
      </li>`;
  });
  return `<ul class="sizeKey" aria-label="Marker size key">${items.join("")}</ul>`;
}

function onLegendClick(event) {
  const { changed, key } = handleLegendPick(event, state.picked);
  if (!changed) return;
  applyWhereClause();
  renderLegend();
  restoreLegendFocus(state.els.legendEl, key);
}

// ---------------------------------------------------------------------
// Lab results (the site panel's middle section)
// ---------------------------------------------------------------------

function resultText(a, key) {
  const s = a[`${key}_state`];
  if (s === "belowLod") return "Below LOD";
  if (s === "detected") return `${formatSignificant(a[key])} ${METALS.unit}`;
  return "–";
}

function metalsSection(a) {
  const metal = currentMetal();
  let body;
  if (!a.has_sample) {
    body = `<p class="muted">No metals results for this site.</p>`;
  } else {
    const card = metal
      ? `
        <div class="metricCards metricCards--single">
          <div class="metricCard" style="--band-color:${METALS.color}">
            <span class="metricCardLabel">${escapeHtml(metal.label)} (${metal.symbol})</span>
            <span class="metricCardValue">${a[`${metal.key}_state`] === "detected" ? formatSignificant(a[metal.key]) : "&lt; LOD"}<small> ${escapeHtml(METALS.unit)}</small></span>
            ${a[`${metal.key}_state`] === "belowLod" ? `<span class="metricCardQa">below limit of detection</span>` : ""}
          </div>
        </div>`
      : "";
    const rows = state.metals
      .map((m) => {
        const belowLod = a[`${m.key}_state`] === "belowLod";
        return `<tr${m.key === metal?.key ? ` class="isCurrent"` : ""}>
          <th>${escapeHtml(m.label)} <span class="muted">(${m.symbol})</span></th>
          <td${belowLod ? ` class="muted"` : ""}>${escapeHtml(resultText(a, m.key))}</td>
        </tr>`;
      })
      .join("");
    body = `${card}<div class="metalsScroll"><table class="attributeTable metalsTable">${rows}</table></div>`;
  }

  const el = section("siteSection--metals", "Metals (lab results)");
  el.insertAdjacentHTML("beforeend", body);
  return el;
}
