// =====================================================================
// FILTERS
// Dashboard-wide filters shown in the header, outside the tabs:
//   - season: which quarter's sampling records to show (every table is
//     tagged with season_year)
//   - group, catchment, river: which sites to show
// Every tab subscribes with onFilterChange and narrows its own data:
// records by getSeason(), sites by matchesFilters / filterWhereClause, and
// tables related on site_name by filteredSiteNames().
//
// The site filters narrow each other in every direction: each dropdown
// only offers values found among the sites matching the OTHER filters
// you've picked (pick the Foss river and Catchment offers only Foss,
// Group only River Foss Society). So no combination can leave the map
// empty. To widen a list again, clear the filter that's narrowing it.
// A broader filter left on "All" that a narrower pick pins down to one
// value is filled in with it (river -> its catchment and group,
// catchment -> its group); where it's ambiguous (the Wharfe has two
// groups) it stays "All". Filling only goes that way - a group never
// fills in a river, so clearing a river always really clears it. A filled-in
// value is "implied": it doesn't narrow the other dropdowns itself, it's
// worked out afresh after every change, and clearing the pick that
// implied it clears it too. Picking it yourself makes it explicit.
// =====================================================================

import { AQUA } from "./config.js";
import { escapeHtml, formatSeason } from "./utils/format.js";

// Site filter key -> field on the sites layer. Order is the header order,
// broadest first (filling in only goes from narrower to broader).
const SITE_FILTER_FIELDS = {
  group: "case_study_group",
  catchment: "Catchment",
  river: "River_Waterbody",
};
const SITE_FILTER_KEYS = Object.keys(SITE_FILTER_FIELDS);

const filters = { season: null, group: null, catchment: null, river: null };
const implied = new Set(); // site filter keys whose value was filled in
const listeners = new Set();
let allSites = [];
let els = null;

export function getFilters() {
  return { ...filters };
}

export function getSeason() {
  return filters.season;
}

// True when a site filter is narrowing the sites. Season isn't counted:
// there's always one selected, so it never "filters out" sites.
export function hasActiveFilters() {
  return SITE_FILTER_KEYS.some((key) => filters[key] != null);
}

// fn(current, previous) - previous lets a tab tell a season change (new
// records needed) from a site filter change (same records, fewer sites).
export function onFilterChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function matchesFilters(attributes) {
  return matchesExcept(attributes, null);
}

// site_name values of every site passing the site filters - for
// filtering the related tables (citizen science, metals, ...).
export function filteredSiteNames() {
  return new Set(allSites.filter(matchesFilters).map((a) => a[AQUA.joinField]));
}

// SQL where clause for the sites layer, e.g. for definitionExpression.
export function filterWhereClause() {
  const parts = SITE_FILTER_KEYS
    .filter((key) => filters[key] != null)
    .map((key) => `${SITE_FILTER_FIELDS[key]} = '${filters[key].replace(/'/g, "''")}'`);
  return parts.length ? parts.join(" AND ") : null;
}

// siteAttributes: plain attribute objects for every site.
// seasons: every season with data, most recent first (the default).
// siteFilterEls: { group, catchment, river } -> calcite-combobox.
export function initFilters({ seasonEl, siteFilterEls, clearEl, siteAttributes, seasons }) {
  els = { seasonEl, siteFilterEls, clearEl };
  allSites = siteAttributes;

  filters.season = seasons[0] ?? null;
  seasonEl.innerHTML = seasons.length
    ? seasons.map((s) => `<calcite-option value="${escapeHtml(s)}">${escapeHtml(formatSeason(s))}</calcite-option>`).join("")
    : `<calcite-option value="">No data yet</calcite-option>`;
  if (filters.season) seasonEl.value = filters.season;
  seasonEl.disabled = seasons.length < 2;

  seasonEl.addEventListener("calciteSelectChange", () => {
    update({ season: seasonEl.value || null });
  });

  for (const key of SITE_FILTER_KEYS) {
    const el = siteFilterEls[key];
    el.disabled = false;
    el.addEventListener("calciteComboboxChange", () => {
      update({ [key]: el.value || null }, key);
    });
  }
  renderSiteFilterOptions();

  // Clears the site filters only - the season stays as chosen.
  clearEl.addEventListener("click", () => {
    update(Object.fromEntries(SITE_FILTER_KEYS.map((key) => [key, null])), null);
  });

  updateClearButton();
}

// changedKey: the site filter the user just changed, if any - it wins
// over any other pick it conflicts with.
function update(changes, changedKey = null) {
  const previous = getFilters();

  if (SITE_FILTER_KEYS.some((key) => key in changes)) {
    // Implied values are re-derived from the explicit picks below.
    for (const key of implied) filters[key] = null;
    implied.clear();
    Object.assign(filters, changes);
    dropUnreachableValues(changedKey);
    fillImpliedValues();
    renderSiteFilterOptions();
  } else {
    Object.assign(filters, changes);
  }
  updateClearButton();

  const current = getFilters();
  listeners.forEach((fn) => fn(current, previous));
}

// Another explicit pick that no longer fits alongside the rest is
// cleared. The filter just changed wins, so it's never the one cleared.
// (Rare - the dropdowns only offer values that fit - but it keeps the
// map from ever ending up empty.)
function dropUnreachableValues(changedKey) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of SITE_FILTER_KEYS) {
      if (key === changedKey || filters[key] == null) continue;
      if (!optionsFor(key).includes(filters[key])) {
        filters[key] = null;
        changed = true;
      }
    }
  }
}

// A broader filter left on "All" with exactly one possible value given
// the explicit picks is filled in with it - only when a narrower filter
// (one to its right) is picked.
function fillImpliedValues() {
  SITE_FILTER_KEYS.forEach((key, i) => {
    if (filters[key] != null) return;
    if (!SITE_FILTER_KEYS.slice(i + 1).some((k) => filters[k] != null)) return;
    const values = optionsFor(key);
    if (values.length === 1) {
      filters[key] = values[0];
      implied.add(key);
    }
  });
}

// Values a site filter can take, given every OTHER explicitly picked
// filter. Implied values are left out: the pick that implied them
// already narrows the list at least as much.
function optionsFor(key) {
  const others = SITE_FILTER_KEYS.filter((k) => k !== key && filters[k] != null && !implied.has(k));
  const sites = allSites.filter((a) => others.every((k) => a[SITE_FILTER_FIELDS[k]] === filters[k]));
  return distinct(sites, SITE_FILTER_FIELDS[key]);
}

function matchesExcept(attributes, skipKey) {
  return SITE_FILTER_KEYS.every(
    (key) => key === skipKey || filters[key] == null || attributes[SITE_FILTER_FIELDS[key]] === filters[key]
  );
}

function renderSiteFilterOptions() {
  for (const key of SITE_FILTER_KEYS) {
    const el = els.siteFilterEls[key];
    const selected = filters[key];
    el.innerHTML = optionsFor(key)
      .map((v) => `<calcite-combobox-item value="${escapeHtml(v)}" heading="${escapeHtml(v)}"${v === selected ? " selected" : ""}></calcite-combobox-item>`)
      .join("");
    if (selected == null) el.value = "";
  }
}

function distinct(sites, field) {
  return [...new Set(sites.map((a) => a[field]).filter((v) => v != null && v !== ""))]
    .sort((a, b) => a.localeCompare(b, "en-GB"));
}

function updateClearButton() {
  els.clearEl.hidden = !hasActiveFilters();
}
