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
import { fetchSites, fetchCitizenScience, fetchMetals, listSeasons } from "./data/aqua-service.js";
import { initCitizenScienceMap } from "./tabs/citizen-science-map.js";
import { initMetalsMap } from "./tabs/metals-map.js";
import { initDownstreamPlots } from "./tabs/downstream-plots.js";
import { initDataTab } from "./tabs/data-tab.js";

// data-view -> that tab's init.
const TAB_INITS = {
  map: () => initCitizenScienceMap({
    mapEl: document.getElementById("mainMap"),
    metricControlEl: document.getElementById("metricControl"),
    legendEl: document.getElementById("mapLegend"),
    viewControlEl: document.getElementById("csViewControl"),
    leagueEl: document.getElementById("csLeague"),
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
    siteAttributes: sites.map((f) => f.attributes),
    seasons: listSeasons([...citizenScience, ...metals]),
  });
}

initTheme(document.getElementById("themeToggle"));
filtersReady = initHeaderFilters();
filtersReady.catch((error) => console.error("AQuA dashboard: filters failed to start:", error));
initViewSwitching();
startTab("map"); // the tab marked selected in index.html
