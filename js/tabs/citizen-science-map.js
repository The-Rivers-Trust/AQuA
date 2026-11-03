// =====================================================================
// CITIZEN SCIENCE MAP TAB
// The AQuA sites, joined client-side to one season of citizen science
// records, so they can be coloured by a metric (phosphate, E. coli) or
// shown plain. Side panel: metric picker and a legend with counts, whose
// band rows double as a filter (click to show only those bands).
// Clicking a site opens a panel under the map (js/map/site-sections.js). The header filters
// (js/filters.js) pick the season and narrow which sites are drawn and
// counted. A View switch swaps the map for a league table of the same
// sites (js/tabs/league-table.js) - same filters, legend and band picks.
// =====================================================================

import { AQUA, METRICS, SITE_COLOR } from "../config.js";
import { createLayers } from "../layers.js";
import { classify, allBands } from "../metrics.js";
import { fetchSites, fetchCitizenScience, recordsBySite, SITES_SPATIAL_REFERENCE } from "../data/aqua-service.js";
import { onFilterChange, matchesFilters, filterWhereClause, hasActiveFilters, getSeason } from "../filters.js";
import { escapeHtml, formatSeason } from "../utils/format.js";
import { renderLeagueTable } from "./league-table.js";
import {
  setupMap, zoomToLayer, markerSymbol, legendRow, legendToggleRow, swatch, legendPickNote,
  handleLegendPick, restoreLegendFocus, SITE_LAYER_FIELDS,
} from "../map/map-common.js";
import { setupLayersPanel } from "../map/layers-panel.js";
import { initSitePanel, registerSiteLayer, selectSite, refreshSite, clearSite } from "../map/site-panel.js";
import { buildSitePanelContent, trendsSection } from "../map/site-sections.js";
import { surveysForSite } from "../data/surveys.js";

const SITES_VIEW = "sites"; // metric picker value for plain site markers

// Fields of the joined, client-side sites layer. Band fields (one per
// metric, "<metric>_band") are added from METRICS so a new metric in
// config.js gets one automatically.
const JOINED_FIELDS = [
  ...SITE_LAYER_FIELDS,
  { name: "has_record", type: "integer" },
  { name: "season_year", type: "string" },
  { name: "field_date", type: "string" },
  { name: "current_weather", type: "string" },
  { name: "water_flow", type: "string" },
  { name: "water_level", type: "string" },
  { name: "phosphate_ppm", type: "double" },
  { name: "phosphate_qa", type: "string" },
  { name: "ecoli_cfu", type: "integer" },
  { name: "ecoli_qa", type: "string" },
  ...Object.keys(METRICS).map((key) => ({ name: `${key}_band`, type: "string" })),
];

const state = {
  mapEl: null,
  els: null,
  sites: [],
  records: [],
  season: null,
  metric: SITES_VIEW,
  bands: new Set(), // legend bands picked for the current metric; empty = all
  view: "map", // "map" | "league"
  layer: null,
};

const HINTS = {
  map: "Click a site on the map to see its details.",
  league: "Click a site in the table to see it on the map.",
};

export async function initCitizenScienceMap({ mapEl, metricControlEl, legendEl, viewControlEl, leagueEl, hintEl }) {
  state.mapEl = mapEl;
  state.els = { metricControlEl, legendEl, viewControlEl, leagueEl, hintEl };

  await setupMap(mapEl);
  // Clicking a site opens its panel under the map: site details, phosphate
  // and E. coli over every survey, and the surveys to flick through.
  initSitePanel(mapEl, {
    render: (a) => buildSitePanelContent(a, {
      surveys: surveysForSite(state.records, a.site_name),
      season: getSeason(),
      middle: trendsSection,
    }),
  });
  // Contextual layers + their panel - extras, so never stop the map loading.
  await setupLayersPanel(mapEl).catch((error) => console.warn("AQuA dashboard: map layers unavailable:", error));
  mapEl.map.addMany(await createLayers());

  const [sites, records] = await Promise.all([fetchSites(), fetchCitizenScience()]);
  state.sites = sites;
  state.records = records;
  state.season = getSeason();

  metricControlEl.addEventListener("calciteSegmentedControlChange", () => {
    state.metric = metricControlEl.value;
    // Band picks belong to one metric's bands - start fresh.
    state.bands.clear();
    applyWhereClause();
    applyRenderer();
  });
  legendEl.addEventListener("click", onLegendClick);
  viewControlEl.addEventListener("calciteSegmentedControlChange", () => showView(viewControlEl.value));

  onFilterChange(async (current, previous) => {
    if (current.season !== previous.season) {
      // New season = new records joined to the sites; the sites (and so
      // the map extent) are unchanged.
      state.season = current.season;
      await rebuildLayer();
      return;
    }
    applyFilters();
    await zoomToLayer(mapEl, state.layer);
  });

  // Pick up a metric / view chosen while the data was still loading.
  state.metric = metricControlEl.value || SITES_VIEW;
  await rebuildLayer();
  showView(viewControlEl.value || "map");
  await zoomToLayer(mapEl, state.layer);
}

// ---------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------

async function buildGraphics() {
  const [Graphic] = await $arcgis.import(["@arcgis/core/Graphic.js"]);
  const bySite = recordsBySite(state.records, state.season);

  return state.sites.map((site) => {
    const record = bySite.get(site.attributes[AQUA.joinField]);
    const attributes = {
      ...site.attributes,
      has_record: record ? 1 : 0,
      season_year: state.season,
      field_date: record?.field_date ?? null,
      current_weather: record?.current_weather ?? null,
      water_flow: record?.water_flow ?? null,
      water_level: record?.water_level ?? null,
      phosphate_ppm: record?.phosphate_ppm ?? null,
      phosphate_qa: record?.phosphate_qa ?? null,
      ecoli_cfu: record?.ecoli_cfu ?? null,
      ecoli_qa: record?.ecoli_qa ?? null,
    };
    for (const [key, metric] of Object.entries(METRICS)) {
      attributes[`${key}_band`] = classify(key, attributes[metric.field]).key;
    }
    return new Graphic({ geometry: site.geometry, attributes });
  });
}

// Recreated whenever the season changes - simpler than editing the
// client-side source in place, and there are only ~100 sites.
async function rebuildLayer() {
  const [FeatureLayer] = await $arcgis.import(["@arcgis/core/layers/FeatureLayer.js"]);
  const map = state.mapEl.map;

  const layer = new FeatureLayer({
    id: "aquaSites",
    title: "AQuA sites",
    source: await buildGraphics(),
    fields: JOINED_FIELDS,
    objectIdField: "OBJECTID",
    outFields: ["*"],
    geometryType: "point",
    spatialReference: SITES_SPATIAL_REFERENCE,
    definitionExpression: layerWhereClause(),
    popupEnabled: false, // a click opens the site panel instead
  });

  registerSiteLayer(layer);
  if (state.layer) map.remove(state.layer);
  map.add(layer);
  state.layer = layer;
  // The selected site (if any) is now a graphic in the new layer.
  refreshSite(state.mapEl, findSite);

  applyRenderer();
}

const findSite = (name) => state.layer?.source.find((g) => g.attributes.site_name === name);

function applyFilters() {
  if (!state.layer) return;
  applyWhereClause();
  refreshViews();
}

// Header site filters AND any legend bands picked for the current metric.
function layerWhereClause() {
  const parts = [filterWhereClause()];
  if (state.metric !== SITES_VIEW && state.bands.size) {
    const keys = [...state.bands].map((key) => `'${key}'`).join(", ");
    parts.push(`${state.metric}_band IN (${keys})`);
  }
  const clause = parts.filter(Boolean).join(" AND ");
  return clause || null;
}

function applyWhereClause() {
  if (state.layer) state.layer.definitionExpression = layerWhereClause();
}

function applyRenderer() {
  if (!state.layer) return;

  if (state.metric === SITES_VIEW) {
    state.layer.renderer = { type: "simple", symbol: markerSymbol(SITE_COLOR), label: "AQuA site" };
    state.layer.orderBy = null;
  } else {
    const metric = METRICS[state.metric];
    state.layer.renderer = {
      type: "unique-value",
      field: `${state.metric}_band`,
      legendOptions: { title: `${metric.label} (${metric.unit})` },
      uniqueValueInfos: allBands(state.metric).map((band) => ({
        value: band.key,
        label: band.label,
        symbol: markerSymbol(band.color, band.key === "noData" ? 7 : 10),
      })),
    };
    // Draw "No reading" underneath real readings where points overlap.
    state.layer.orderBy = [{ valueExpression: `IIf($feature.${state.metric}_band == "noData", 0, 1)` }];
  }
  refreshViews();
}

// ---------------------------------------------------------------------
// Map / league table
// ---------------------------------------------------------------------

function showView(view) {
  state.view = view;
  const { leagueEl, hintEl, viewControlEl } = state.els;
  if (viewControlEl.value !== view) viewControlEl.value = view;
  // The map and the panel under it go together.
  state.mapEl.closest(".mapColumn").hidden = view !== "map";
  leagueEl.hidden = view !== "league";
  hintEl.textContent = HINTS[view];
  if (view === "league") {
    clearSite(state.mapEl); // its panel belongs beside the map
    renderLeague();
  }
}

// Legend always; the league table too while it's showing.
function refreshViews() {
  if (!state.layer) return;
  renderLegend();
  if (state.view === "league") renderLeague();
}

// The sites the map is drawing: header filters plus any legend bands.
function visibleSites() {
  const bandField = `${state.metric}_band`;
  const picking = state.metric !== SITES_VIEW && state.bands.size > 0;
  return state.layer.source.toArray()
    .map((g) => g.attributes)
    .filter((a) => matchesFilters(a) && (!picking || state.bands.has(a[bandField])));
}

function renderLeague() {
  const rows = visibleSites();
  const notes = [];
  if (hasActiveFilters()) notes.push("site filters");
  if (state.metric !== SITES_VIEW && state.bands.size) notes.push("legend bands");
  renderLeagueTable(state.els.leagueEl, {
    rows,
    metric: state.metric,
    season: state.season,
    filteredNote: notes.length
      ? `<p class="legendNote">Showing ${rows.length} of ${state.sites.length} sites (filtered by ${notes.join(" and ")}).</p>`
      : "",
    onSelectSite: showSiteOnMap,
  });
}

// From the league table: back to the map, zoomed to the site, its panel open.
async function showSiteOnMap(siteName) {
  const graphic = state.layer.source.find((g) => g.attributes.site_name === siteName);
  if (!graphic) return;
  showView("map");
  selectSite(state.mapEl, graphic);
  await state.mapEl.goTo({ target: graphic.geometry, zoom: 13 });
}

// ---------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------

function renderLegend() {
  const { legendEl } = state.els;
  const graphics = state.layer.source.toArray().filter((g) => matchesFilters(g.attributes));
  const withRecord = graphics.filter((g) => g.attributes.has_record).length;
  const season = escapeHtml(formatSeason(state.season) || "–");
  const filteredNote = hasActiveFilters()
    ? `<p class="legendNote">Showing ${graphics.length} of ${state.sites.length} sites (filtered).</p>`
    : "";

  if (state.metric === SITES_VIEW) {
    legendEl.innerHTML = `
      <ul class="legendList">
        ${legendRow(SITE_COLOR, "AQuA site", graphics.length)}
      </ul>
      <p class="legendNote">${withRecord} of ${graphics.length} sites have a citizen science record for ${season}.</p>
      ${filteredNote}`;
    return;
  }

  const metric = METRICS[state.metric];
  const bandField = `${state.metric}_band`;
  const counts = new Map();
  for (const g of graphics) {
    const band = g.attributes[bandField];
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  const picking = state.bands.size > 0;
  const rows = allBands(state.metric)
    .map((band) => legendToggleRow({
      key: band.key,
      swatchHtml: swatch(band.color),
      label: band.label + bandRange(metric, band),
      count: counts.get(band.key) ?? 0,
      selected: state.bands.has(band.key),
      picking,
    }))
    .join("");
  const shown = graphics.filter((g) => state.bands.has(g.attributes[bandField])).length;
  legendEl.innerHTML = `
    <p class="legendTitle">${escapeHtml(metric.label)} (${escapeHtml(metric.unit)}), ${season}</p>
    <ul class="legendList" aria-label="Filter the map by ${escapeHtml(metric.label)} band">${rows}</ul>
    ${legendPickNote(picking, shown, state.bands.size, "Click a band to show only those sites.")}
    ${filteredNote}`;
}

function onLegendClick(event) {
  const { changed, key } = handleLegendPick(event, state.bands);
  if (!changed) return;
  applyWhereClause();
  refreshViews();
  restoreLegendFocus(state.els.legendEl, key);
}

// " (0.10–0.30)" style range text for banded metrics whose labels don't
// already spell out the threshold (E. coli's do).
function bandRange(metric, band) {
  if (band.key === "noData" || metric.decimals === 0) return "";
  const i = metric.bands.indexOf(band);
  const fmt = (v) => v.toFixed(metric.decimals);
  const prev = i > 0 ? metric.bands[i - 1].max : null;
  if (band.max == null) return ` (over ${fmt(prev)})`;
  if (prev == null) return ` (up to ${fmt(band.max)})`;
  return ` (${fmt(prev)}–${fmt(band.max)})`;
}

