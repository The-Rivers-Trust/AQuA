// =====================================================================
// CATCHMENT SUMMARIES TAB
// A plain-English summary of each catchment's citizen science results for
// the season picked in the header, with the numbers it's based on. The
// text is written ahead of time with AI from the volunteers' readings
// (scripts/catchment-facts.mjs and generate-catchment-summaries.mjs) and
// saved in data/catchment-summaries.json; only summaries a person has
// reviewed ("approved": true) are shown to the public. Add ?drafts to the
// page address to see unapproved ones too, marked as drafts, when
// reviewing.
// Each card can also carry a Metals note (lab results, no season) with its
// own approval, shown the same way: public once approved, with ?drafts before.
// The header filters narrow which catchments are listed.
// =====================================================================

import { METRICS } from "../config.js";
import { fetchSites, fetchCitizenScience } from "../data/aqua-service.js";
import { onFilterChange, matchesFilters, getFilters, getSeason, setSiteFilter } from "../filters.js";
import { escapeHtml, formatDate, formatSeason } from "../utils/format.js";
import { computeCatchments, catchmentTableHtml, comparisonHtml, sortCatchmentsBy } from "./catchment-table.js";

const SUMMARIES_URL = "data/catchment-summaries.json";
const showDrafts = new URLSearchParams(location.search).has("drafts");

let summaries = [];
let siteAttributes = [];
let records = [];
let containerEl = null;

export async function initCatchmentSummaries({ containerEl: el }) {
  containerEl = el;
  containerEl.innerHTML = `<p class="muted">Loading summaries…</p>`;
  try {
    const [response, sites, citizenScience] = await Promise.all([
      fetch(SUMMARIES_URL, { cache: "no-cache" }),
      fetchSites(),
      fetchCitizenScience(),
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    summaries = (await response.json()).summaries ?? [];
    siteAttributes = sites.map((f) => f.attributes);
    records = citizenScience;
  } catch (error) {
    console.warn("AQuA dashboard: catchment summaries unavailable:", error);
    containerEl.innerHTML = `<h2>Catchment Explorer</h2><p class="muted">The summaries couldn't be loaded just now. Please try again later.</p>`;
    return;
  }
  // Sorting the catchment table redraws just the table, in place.
  containerEl.addEventListener("click", (event) => {
    const header = event.target.closest("th[data-sort]");
    if (header) { resortTable(header.dataset.sort); return; }
    const card = event.target.closest("[data-catchment]");
    if (card) {
      const name = card.dataset.catchment;
      const same = getFilters().catchment === name;
      setSiteFilter("catchment", same ? null : name);
      return;
    }
    if (event.target.closest("[data-clear-catchment]")) { setSiteFilter("catchment", null); return; }
  });
  containerEl.addEventListener("keydown", (event) => {
    const header = event.target.closest?.("th[data-sort]");
    if (header && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      resortTable(header.dataset.sort);
    }
  });
  onFilterChange(render);
  render();
}

let catchmentRows = [];

// A card for every catchment (with its site count); picking one is the
// same as picking it in the header.
function catchmentCardsHtml(selected) {
  const counts = new Map();
  for (const a of siteAttributes) if (a.Catchment) counts.set(a.Catchment, (counts.get(a.Catchment) ?? 0) + 1);
  const cards = [...counts.keys()].sort((a, b) => a.localeCompare(b, "en-GB")).map((name) => {
    const n = counts.get(name);
    return `<button type="button" class="groupCard${name === selected ? " groupCard--selected" : ""}" data-catchment="${escapeHtml(name)}" aria-pressed="${name === selected}">
      <span class="groupCardName">${escapeHtml(name)} Catchment</span>
      <span class="groupCardSites">${n} ${n === 1 ? "site" : "sites"}</span>
    </button>`;
  }).join("");
  const buttons = selected ? `<div class="groupDetailButtons catchmentButtons">
      <calcite-button appearance="outline" kind="neutral" scale="s" icon-start="x" data-clear-catchment>Back to all catchments</calcite-button>
    </div>` : "";
  return `<p class="summaryIntro">Select a catchment below to see how it compares with the others.</p>
    <div class="groupGrid">${cards}</div>${buttons}`;
}

function resortTable(field) {
  sortCatchmentsBy(field);
  const holder = containerEl.querySelector("#catchmentTable");
  if (!holder) return;
  holder.innerHTML = catchmentTableHtml(catchmentRows, getFilters().catchment);
  holder.querySelector(`th[data-sort="${field}"]`)?.focus();
}

// Catchments with at least one site passing the header's site filters.
function catchmentsInFilters() {
  return new Set(siteAttributes.filter(matchesFilters).map((a) => a.Catchment));
}

function render() {
  const season = getSeason();
  const inFilters = catchmentsInFilters();
  const visible = summaries
    .filter((s) => s.season === season && inFilters.has(s.catchment) && (s.approved || showDrafts))
    .sort((a, b) => a.catchment.localeCompare(b.catchment, "en-GB"));

  const intro = `
    <h2>Catchment Explorer</h2>
    ${showDrafts ? `<p class="summaryDraftNote">Review mode: unapproved summaries are shown and marked as drafts.</p>` : ""}`;

  // The table lists every catchment: picking one highlights its row and
  // shows how it compares, rather than filtering the table.
  const selected = getFilters().catchment;
  catchmentRows = computeCatchments(siteAttributes, records, season);
  const overview = `
    ${catchmentCardsHtml(selected)}
    ${comparisonHtml(catchmentRows, selected)}
    <section class="dataSection" aria-labelledby="catchmentTableHeading">
      <h3 id="catchmentTableHeading">All catchments</h3>
      <div class="dataTableScroll" id="catchmentTable">${catchmentTableHtml(catchmentRows, selected)}</div>
    </section>`;

  const aiNote = `
    <h3 class="summariesTitle">AI summaries</h3>
    <p class="summaryIntro">Each summary is written with AI from the volunteers' readings and checked by The Rivers Trust before it is published.</p>`;

  containerEl.innerHTML = `${intro}${overview}${aiNote}${
    visible.length
      ? `<div class="summaryGrid">${visible.map(cardHtml).join("")}</div>`
      : `<p class="muted">${emptyMessage(season, inFilters)}</p>`
  }`;

  gridWatcher.disconnect();
  const grid = containerEl.querySelector(".summaryGrid");
  if (grid) {
    alignCards(grid);
    gridWatcher.observe(grid);
  }
}

// Cards hold different amounts of text, which would leave each one's bars
// and Metals section at a different height. Every card's summary text and
// Metals section is given the height of the tallest, so the sections
// start at the same place across all the cards. Redone when the grid's
// width changes (text re-wraps).
const gridWatcher = new ResizeObserver(() => {
  const grid = containerEl?.querySelector(".summaryGrid");
  if (grid) alignCards(grid);
});

function alignCards(grid) {
  for (const selector of [".summaryCard > .summaryText", ".summaryMetals"]) {
    const blocks = [...grid.querySelectorAll(selector)];
    blocks.forEach((b) => { b.style.minHeight = ""; });
    const tallest = Math.max(0, ...blocks.map((b) => b.offsetHeight));
    blocks.forEach((b) => { b.style.minHeight = `${tallest}px`; });
  }
}

function emptyMessage(season, inFilters) {
  if (!inFilters.size) return "No catchments match the current filters.";
  const any = summaries.some((s) => s.season === season && (s.approved || showDrafts));
  return any
    ? "No summaries for the catchments selected."
    : "Summaries for this season are still being prepared. Please check back soon.";
}

// ---------------------------------------------------------------------
// One catchment's card
// ---------------------------------------------------------------------

function cardHtml(s) {
  const f = s.facts;
  const paragraphs = s.summary.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  const draft = !s.approved;
  return `
    <article class="summaryCard${draft ? " summaryCard--draft" : ""}">
      <header class="summaryHead">
        <h3>${escapeHtml(s.catchment)} Catchment</h3>
        <span class="summaryMeta">${f.sitesSurveyed} of ${f.sitesInCatchment} sites surveyed</span>
        ${draft ? `<span class="summaryDraftTag">Draft - not reviewed</span>` : ""}
      </header>
      <div class="summaryText">${paragraphs}</div>
      <div class="summaryBars">
        ${bandBar("phosphate", f.phosphate)}
        ${bandBar("ecoli", f.ecoli)}
      </div>
      ${s.metals && (s.metals.approved || showDrafts) ? metalsHtml(s.metals) : ""}
      <footer class="summaryFoot">
        AI-assisted summary${s.approved && s.reviewedAt ? `, reviewed ${escapeHtml(formatDate(s.reviewedAt))}` : ""}.
        Based on ${f.sitesSurveyed} surveys in ${escapeHtml(formatSeason(s.season))}.
      </footer>
    </article>`;
}

// The lab metals note: the text, then how many of the sampled sites each
// metal people ask about was detected at (no thresholds, so counts only).
function metalsHtml(m) {
  const f = m.facts;
  const chips = f.focusMetals
    .map((x) => `<li class="${x.detectedAtSites ? "" : "summaryChip--none"}">${escapeHtml(x.metal)} <strong>${x.detectedAtSites}/${f.sitesSampled}</strong></li>`)
    .join("");
  return `
    <section class="summaryMetals" aria-label="Metals">
      <div class="summaryBarTitle">Metals (lab results)
        ${m.approved ? "" : `<span class="summaryDraftTag">Draft - not reviewed</span>`}
      </div>
      <div class="summaryText">${m.summary.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</div>
      <p class="summaryChipsLabel">Sites where each was detected, out of ${f.sitesSampled} sampled</p>
      <ul class="summaryChips">${chips}</ul>
    </section>`;
}

// Band names shortened so each legend fits on one line (the bar's
// accessible label keeps the full names).
const shortBand = (label) => label.replace("Slightly Elevated", "S. Elevated").replace(" cfu", "");

// A reading's bands as one stacked bar (coloured exactly as on the maps)
// with a count for each band underneath, so it doesn't rely on colour.
function bandBar(metricKey, facts) {
  const metric = METRICS[metricKey];
  const total = facts.readings;
  if (!total) {
    return `<div class="summaryBar"><div class="summaryBarTitle">${escapeHtml(metric.label)}</div><p class="muted">No readings.</p></div>`;
  }
  const parts = metric.bands.map((band) => ({ band, count: facts.bands[band.label] ?? 0 }));
  const segments = parts
    .filter((p) => p.count)
    .map((p) => `<span class="summarySegment" style="flex:${p.count};background:${p.band.color}"></span>`)
    .join("");
  const legend = parts
    .filter((p) => p.count)
    .map((p) => `<li><span class="legendSwatch" style="background:${p.band.color}" aria-hidden="true"></span>${escapeHtml(shortBand(p.band.label))} <strong>${p.count}</strong></li>`)
    .join("");
  const label = parts.filter((p) => p.count).map((p) => `${p.count} ${p.band.label}`).join(", ");
  return `
    <div class="summaryBar">
      <div class="summaryBarTitle">${escapeHtml(metric.label)} <span class="muted">${total} ${total === 1 ? "reading" : "readings"}</span></div>
      <div class="summaryStack" role="img" aria-label="${escapeHtml(`${metric.label}: ${label}`)}">${segments}</div>
      <ul class="summaryLegend">${legend}</ul>
    </div>`;
}
