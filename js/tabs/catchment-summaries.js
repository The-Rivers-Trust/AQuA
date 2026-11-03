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
import { fetchSites } from "../data/aqua-service.js";
import { onFilterChange, matchesFilters, getSeason } from "../filters.js";
import { escapeHtml, formatDate, formatSeason } from "../utils/format.js";

const SUMMARIES_URL = "data/catchment-summaries.json";
const showDrafts = new URLSearchParams(location.search).has("drafts");

let summaries = [];
let siteAttributes = [];
let containerEl = null;

export async function initCatchmentSummaries({ containerEl: el }) {
  containerEl = el;
  containerEl.innerHTML = `<p class="muted">Loading summaries…</p>`;
  try {
    const [response, sites] = await Promise.all([fetch(SUMMARIES_URL, { cache: "no-cache" }), fetchSites()]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    summaries = (await response.json()).summaries ?? [];
    siteAttributes = sites.map((f) => f.attributes);
  } catch (error) {
    console.warn("AQuA dashboard: catchment summaries unavailable:", error);
    containerEl.innerHTML = `<h2>Catchment summaries</h2><p class="muted">The summaries couldn't be loaded just now. Please try again later.</p>`;
    return;
  }
  onFilterChange(render);
  render();
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
    <h2>Catchment summaries</h2>
    <p class="summaryIntro">A plain-English look at what volunteers found in each catchment in ${escapeHtml(formatSeason(season) || "the chosen season")}.
      Each summary is written with AI from the volunteers' readings and checked by The Rivers Trust before it is published.
      They are snapshots from single visits, not official classifications.</p>
    ${showDrafts ? `<p class="summaryDraftNote">Review mode: unapproved summaries are shown and marked as drafts.</p>` : ""}`;

  containerEl.innerHTML = `${intro}${
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
        <h3>${escapeHtml(s.catchment)}</h3>
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
