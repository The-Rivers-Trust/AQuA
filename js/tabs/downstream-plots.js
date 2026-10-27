// =====================================================================
// DOWNSTREAM PLOTS TAB
// For a chosen measure (phosphate, E. coli or a metal), one chart per
// catchment with its sites in upstream -> downstream order. Site order
// comes from the sites layer's Number field: 1 is the top of the
// catchment, counting down the river (tributary sites slot in where they
// join). Follows the header filters - season for citizen science, and
// group / catchment / river for which sites are plotted.
// Two chart styles: line charts (reading against site order) and river
// diagrams (the catchment drawn like a metro map, js/charts/river-schematic.js,
// laid out on the real river network by js/data/river-topology.js).
// =====================================================================

import { AQUA, METRICS, METALS, NO_DATA } from "../config.js";
import { classify } from "../metrics.js";
import { fetchSites, fetchCitizenScience, fetchMetals, recordsBySite, hasSeasons } from "../data/aqua-service.js";
import { onFilterChange, matchesFilters, getSeason } from "../filters.js";
import { escapeHtml, formatNumber, formatSeason, formatSignificant } from "../utils/format.js";
import { renderDownstreamChart } from "../charts/downstream-chart.js";
import { renderRiverSchematic } from "../charts/river-schematic.js";
import { buildRiverTree } from "../data/river-topology.js";

const ORDER_FIELD = "Number"; // 1 = top of the catchment

const state = {
  els: null,
  sites: [],
  citizenScience: [],
  metals: [],
  measure: "phosphate",
  style: "lines", // "lines" | "rivers"
};

export async function initDownstreamPlots({ measureSelectEl, styleControlEl, chartsEl, tooltipEl }) {
  state.els = { measureSelectEl, styleControlEl, chartsEl, tooltipEl };
  state.style = styleControlEl.value || "lines";
  styleControlEl.addEventListener("calciteSegmentedControlChange", () => {
    state.style = styleControlEl.value;
    render();
  });

  const [sites, citizenScience, metals] = await Promise.all([fetchSites(), fetchCitizenScience(), fetchMetals()]);
  state.sites = sites.map((f) => f.attributes);
  state.citizenScience = citizenScience;
  state.metals = metals;

  renderMeasureOptions();
  measureSelectEl.addEventListener("calciteSelectChange", () => {
    state.measure = measureSelectEl.value;
    render();
  });
  onFilterChange(render);

  // Charts are sized to the panel - redraw when it changes width (also
  // covers the first time the tab is shown).
  let lastWidth = 0;
  new ResizeObserver(() => {
    const w = chartsEl.clientWidth;
    if (w && Math.abs(w - lastWidth) > 8) {
      lastWidth = w;
      render();
    }
  }).observe(chartsEl);

  render();
}

// ---------------------------------------------------------------------
// Measures
// ---------------------------------------------------------------------

// Metals with any result (value or LOD flag) - same rule as the metals map.
function availableMetals() {
  return METALS.list.filter((m) =>
    state.metals.some((r) => r[m.key] != null || r[m.key + METALS.lodSuffix] === METALS.lodFlag));
}

function renderMeasureOptions() {
  const { measureSelectEl } = state.els;
  const csOptions = Object.entries(METRICS)
    .map(([key, m]) => `<calcite-option value="${key}">${escapeHtml(m.label)} (${escapeHtml(m.unit)})</calcite-option>`)
    .join("");
  const metalOptions = availableMetals()
    .map((m) => `<calcite-option value="metal:${m.key}">${escapeHtml(m.label)} (${m.symbol})</calcite-option>`)
    .join("");
  measureSelectEl.innerHTML = `
    <calcite-option-group label="Citizen science">${csOptions}</calcite-option-group>
    <calcite-option-group label="Metals (lab results)">${metalOptions}</calcite-option-group>`;
  measureSelectEl.value = state.measure;
  measureSelectEl.disabled = false;
}

// What to plot for the current measure: a per-site reading function plus
// the chart's labels, colours and band washes.
function measureSpec() {
  if (state.measure.startsWith("metal:")) {
    const key = state.measure.slice(6);
    const metal = METALS.list.find((m) => m.key === key);
    const seasonal = hasSeasons(state.metals);
    const bySite = recordsBySite(state.metals, seasonal ? getSeason() : null);
    return {
      label: metal.label,
      unit: METALS.unit,
      note: seasonal ? formatSeason(getSeason()) : "all metals results (not split by season yet)",
      bands: [],
      key: [
        { label: "Detected", swatch: "fill", color: METALS.color },
        { label: "Below limit of detection", swatch: "ring", color: METALS.color },
      ],
      formatValue: (v) => formatSignificant(v),
      reading: (site) => {
        const r = bySite.get(site[AQUA.joinField]);
        if (r?.[key + METALS.lodSuffix] === METALS.lodFlag) return { state: "belowLod", color: METALS.color };
        if (r?.[key] == null) return { state: "none" };
        return { state: "value", value: r[key], color: METALS.color };
      },
    };
  }

  const metric = METRICS[state.measure];
  const bySite = recordsBySite(state.citizenScience, getSeason());
  // Band washes from the metric's thresholds (upper bounds inclusive).
  const bands = metric.bands.map((b, i) => ({
    from: i === 0 ? 0 : metric.bands[i - 1].max,
    to: b.max ?? null,
    color: b.color,
    label: b.label,
  }));
  return {
    label: metric.label,
    unit: metric.unit,
    note: formatSeason(getSeason()),
    bands,
    key: bands.map((b) => ({ label: b.label + bandRangeText(metric, b), swatch: "fill", color: b.color })),
    // Integer metrics (E. coli) still get a decimal on a fractional axis tick.
    formatValue: (v) => formatNumber(v, metric.decimals || (Number.isInteger(v) ? 0 : 1)),
    reading: (site) => {
      const v = bySite.get(site[AQUA.joinField])?.[metric.field];
      if (v == null) return { state: "none" };
      const band = classify(state.measure, v);
      return { state: "value", value: v, color: band.color, bandLabel: band.label };
    },
  };
}

function bandRangeText(metric, band) {
  if (metric.decimals === 0) return "";
  const fmt = (v) => v.toFixed(metric.decimals);
  if (band.to == null) return ` (over ${fmt(band.from)})`;
  if (!band.from) return ` (up to ${fmt(band.to)})`;
  return ` (${fmt(band.from)}–${fmt(band.to)})`;
}

// Shared colour key for every chart on the page - points/stations use
// the band colours, so it's needed in both styles.
function keyHtml(spec) {
  const items = [...spec.key, { label: "No reading", swatch: "none", color: NO_DATA.color }];
  return `<ul class="plotsKey" aria-label="Colour key">${items
    .map((k) => {
      const style = k.swatch === "fill" ? `background:${k.color}` : k.swatch === "ring" ? `border-color:${k.color}` : "";
      return `<li><span class="plotsKeySwatch plotsKeySwatch--${k.swatch}" style="${style}"></span>${escapeHtml(k.label)}</li>`;
    })
    .join("")}</ul>`;
}

// ---------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------

// Bumped on every render, so a slow river-network lookup that finishes
// after the page has been redrawn (new measure, filters...) is dropped.
let renderToken = 0;

function render() {
  const { chartsEl, tooltipEl } = state.els;
  if (!chartsEl.clientWidth) return; // tab hidden - ResizeObserver redraws on show
  tooltipEl.hidden = true;
  const token = ++renderToken;

  const spec = measureSpec();
  const byCatchment = new Map();
  for (const site of state.sites.filter(matchesFilters)) {
    const list = byCatchment.get(site.Catchment) ?? [];
    list.push(site);
    byCatchment.set(site.Catchment, list);
  }
  const catchments = [...byCatchment.keys()].sort((a, b) => a.localeCompare(b, "en-GB"));

  chartsEl.innerHTML = `
    <div class="plotsHeader">
      <h2>${escapeHtml(spec.label)} downstream ${state.style === "rivers" ? "river diagrams" : "plots"}</h2>
      <p class="leagueSubtitle">${escapeHtml(spec.unit)}, ${escapeHtml(spec.note)}. ${state.style === "rivers"
        ? "Each catchment drawn as a schematic, not to scale: the main river flows left to right and tributaries join where they meet it on the Open River Network. * Dashed branches are rivers not on the network, placed from site numbering or a manual correction."
        : "Sites run upstream (left) to downstream (right) by site number. Each catchment has its own y-axis."}</p>
      ${keyHtml(spec)}
    </div>
    ${catchments.length ? catchments.map((c, i) => `<div class="plotCard" data-i="${i}"></div>`).join("") : `<p class="muted">No sites match the current filters.</p>`}`;

  catchments.forEach((catchment, i) => {
    const sites = byCatchment.get(catchment).slice().sort((a, b) => (a[ORDER_FIELD] ?? 0) - (b[ORDER_FIELD] ?? 0));
    const points = sites.map((s) => ({
      number: s[ORDER_FIELD],
      site: s.site_name,
      river: s.River_Waterbody,
      description: s.Description,
      ...spec.reading(s),
    }));
    const withValue = points.filter((p) => p.state === "value").length;
    const card = chartsEl.querySelector(`.plotCard[data-i="${i}"]`);
    if (state.style === "rivers") {
      renderRiverCard(card, { catchment, sites, points, withValue, spec, tooltipEl, token });
      return;
    }
    renderDownstreamChart(chartsEl.querySelector(`.plotCard[data-i="${i}"]`), {
      title: `${catchment} catchment`,
      subtitle: `${spec.label} (${spec.unit}) · ${withValue} of ${points.length} sites with a reading`,
      unit: spec.unit,
      points,
      bands: spec.bands,
      formatValue: spec.formatValue,
      tooltipEl,
    });
  });
}

// River diagram for one catchment. The network lookup takes a moment the
// first time (then it's cached for the session), so the card says so.
async function renderRiverCard(card, { catchment, sites, points, withValue, spec, tooltipEl, token }) {
  card.innerHTML = `<p class="chartSubtitle">${escapeHtml(catchment)} catchment - finding sites on the river network…</p>`;
  const allInCatchment = state.sites.filter((s) => s.Catchment === catchment);
  const { root, source } = await buildRiverTree(catchment, sites, allInCatchment);
  if (token !== renderToken) return;
  renderRiverSchematic(card, {
    title: `${catchment} catchment`,
    subtitle: `${spec.label} (${spec.unit}) · ${withValue} of ${points.length} sites with a reading${source === "numbering" ? " · river network unavailable, laid out from site numbering" : ""}`,
    unit: spec.unit,
    tree: root,
    pointsBySite: new Map(points.map((p) => [p.site, p])),
    formatValue: spec.formatValue,
    tooltipEl,
  });
}
