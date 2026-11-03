// =====================================================================
// MAIN
// App start-up: theme, tab switching, the header filters, then each
// tab's own init. Filters are set up first so every tab can read them
// (and subscribe with onFilterChange) from the start. Only the first tab
// is initialised up front; the others the first time they're opened, so
// a map that's never looked at never loads.
// To add a tab: a <calcite-tab-title data-view="x"> and a
// <section data-view="x"> in index.html, a module in js/tabs/, and an
// entry in TAB_INITS below.
// =====================================================================

import { initTheme } from "./theme.js";
import { initFilters } from "./filters.js";
import { initShortcuts } from "./shortcuts.js";
import { fetchSites, fetchCitizenScience, fetchMetals, listSeasons } from "./data/aqua-service.js";
import { initCitizenScienceMap } from "./tabs/citizen-science-map.js";
import { initMetalsMap } from "./tabs/metals-map.js";
import { initDownstreamPlots } from "./tabs/downstream-plots.js";
import { initCatchmentSummaries } from "./tabs/catchment-summaries.js";
import { initDataTab } from "./tabs/data-tab.js";

// data-view -> that tab's init.
const TAB_INITS = {
  map: () => initCitizenScienceMap({
    mapEl: document.getElementById("mainMap"),
    metricControlEl: document.getElementById("metricControl"),
    legendEl: document.getElementById("mapLegend"),
    leagueEl: document.getElementById("csLeague"),
    leagueButtonEl: document.getElementById("leagueButton"),
    leagueDrawerEl: document.getElementById("csLeagueDrawer"),
    leagueCloseEl: document.getElementById("leagueClose"),
    hintEl: document.getElementById("csHint"),
  }),
  metals: () => initMetalsMap({
    mapEl: document.getElementById("metalsMap"),
    metalSelectEl: document.getElementById("metalSelect"),
    legendEl: document.getElementById("metalsLegend"),
  }),
  downstream: () => initDownstreamPlots({
    measureSelectEl: document.getElementById("downstreamMeasure"),
    styleControlEl: document.getElementById("downstreamStyle"),
    chartsEl: document.getElementById("downstreamCharts"),
    tooltipEl: document.getElementById("downstreamTooltip"),
  }),
  catchments: () => initCatchmentSummaries({ containerEl: document.getElementById("catchmentSummaries") }),
  data: () => initDataTab({ containerEl: document.getElementById("dataView") }),
};

const started = new Map(); // data-view -> init promise
let filtersReady = null;

function startTab(view) {
  if (!started.has(view) && TAB_INITS[view]) {
    const run = filtersReady
      .then(() => TAB_INITS[view]())
      .catch((error) => console.error(`AQuA dashboard: "${view}" tab failed to start:`, error));
    started.set(view, run);
  }
  return started.get(view);
}

function initViewSwitching() {
  const nav = document.getElementById("viewTabs");
  const views = document.querySelectorAll(".view[data-view]");

  nav.addEventListener("calciteTabChange", () => {
    const selectedTitle = nav.selectedTitle;
    const selected = selectedTitle?.dataset.view;
    // A standalone calcite-tab-nav (no calcite-tabs around it) tracks the
    // selection but never updates each title's own `selected`, so the
    // underline would stay on the first tab - set it here.
    nav.querySelectorAll("calcite-tab-title").forEach((title) => {
      title.selected = title === selectedTitle;
    });
    views.forEach((view) => {
      view.hidden = view.dataset.view !== selected;
    });
    startTab(selected);
  });

  // Same as the maps: no focus box after a mouse click, but keep it for
  // keyboard users - see .viewTabs.pointerFocus in layout.css.
  nav.addEventListener("pointerdown", () => nav.classList.add("pointerFocus"));
  nav.addEventListener("keydown", () => nav.classList.remove("pointerFocus"));
}

async function initHeaderFilters() {
  // Seasons come from every sampling table, so a season that only exists
  // in one of them still appears. (Metals has no season field yet - it
  // contributes nothing until it does.)
  const [sites, citizenScience, metals] = await Promise.all([fetchSites(), fetchCitizenScience(), fetchMetals()]);
  initFilters({
    seasonEl: document.getElementById("seasonFilter"),
    siteFilterEls: {
      group: document.getElementById("groupFilter"),
      catchment: document.getElementById("catchmentFilter"),
      river: document.getElementById("riverFilter"),
    },
    clearEl: document.getElementById("clearFilters"),
    countEl: document.getElementById("siteCount"),
    siteAttributes: sites.map((f) => f.attributes),
    seasons: listSeasons([...citizenScience, ...metals]),
  });
}

// A dropdown or filter box shouldn't stay selected (highlighted, list open)
// once a choice is made: close it and let go of focus. Waits a tick so the
// choice's own handlers run first.
function releaseFocusAfterSelect() {
  const release = (event) => {
    const box = event.target;
    setTimeout(() => {
      if ("open" in box) box.open = false;
      box.blur?.();
      if (document.activeElement && box.contains(document.activeElement)) document.activeElement.blur();
    });
  };
  document.addEventListener("calciteComboboxChange", release);
  document.addEventListener("calciteSelectChange", release);
}

// Clicking a switch, tick box, button or tab with the mouse leaves it
// focused, which Calcite draws as a blue ring. After pointer input, let go
// of focus on those (keyboard use is untouched: no pointer event, so the
// ring still shows where focus is). Text-entry components keep focus.
const RELEASE_AFTER_POINTER = [
  "calcite-switch", "calcite-checkbox", "calcite-radio-button", "calcite-button", "calcite-action",
  "calcite-segmented-control", "calcite-segmented-control-item", "calcite-tab-title", "calcite-list-item",
  "calcite-chip", "calcite-navigation-logo",
].join(",");

function releaseFocusAfterPointer() {
  document.addEventListener("pointerup", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active?.matches?.(RELEASE_AFTER_POINTER)) active.blur();
    }, 60);
  }, true);
}

initTheme(document.getElementById("themeToggle"));
releaseFocusAfterSelect();
releaseFocusAfterPointer();
initShortcuts();
filtersReady = initHeaderFilters();
filtersReady.catch((error) => console.error("AQuA dashboard: filters failed to start:", error));
initViewSwitching();
startTab("map"); // the tab marked selected in index.html
