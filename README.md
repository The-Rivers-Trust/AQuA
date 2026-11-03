# AQuA Dashboard

Spatial dashboard built with the [ArcGIS Maps SDK for JavaScript](https://developers.arcgis.com/javascript/latest/) 5.1 and [Calcite](https://developers.arcgis.com/calcite-design-system/) components, both loaded from Esri's CDN. Plain HTML, CSS and JavaScript modules, so there's no build step.

## Running it locally

The page is split into ES modules, which browsers won't load straight from disk (`file://`), so it needs a small local web server. Pick one:

- **npm** (Node.js installed): `npm start`. It serves on http://localhost:8080 and opens the browser. Caching is off, so a refresh always picks up your edits.
- **VS Code**: install the *Live Server* extension, open `index.html`, and click **Go Live**.
- **Python**: `python -m http.server 8080`, then open http://localhost:8080.

## Project layout

```
index.html            page structure: header, tabs, map, panels
css/
  theme.css           app colour/spacing tokens, built on Calcite's variables
  layout.css          page layout
  popup.css           site pop-up styles (loaded inside the pop-up - it's in the map's shadow DOM)
js/
  main.js             start-up: theme, tab switching, each tab's init
  config.js           service URLs, field names, metric thresholds, map start position
  metrics.js          classify(metric, value) → band, using thresholds in config.js
  filters.js          header filters (season, group, catchment, river) shared by every tab;
                      site filters narrow left to right
  layers.js           builds extra static FeatureLayers from config.js; getLayer(id)
  theme.js            dark/light switching
  data/
    surveys.js        a site's records as surveys (oldest first) + the shared "which survey is
                      showing" state for the charts and the survey browser
    aqua-service.js   queries the AQuA service (sites, citizen science, metals), seasons, join helpers
  map/
    map-common.js     shared map setup (basemap/theme, focus fix, pop-up docking, zoom),
                      legend + pop-up helpers used by every map tab
    basemaps.js       one basemap choice shared by every map (selector on each map's
                      controls); follows the theme until a basemap is picked
    layers-panel.js   the right-hand "Map layers" panel on every map (closed by default):
                      switches (shared between the maps), the Legend button's contents,
                      and the map's click handling (site panel / storm overflow / river pop-up)
    site-panel.js     the panel down the right of the map that opens when a site is
                      clicked, and the site's highlight on the map
    site-sections.js  what's in it, top to bottom: site details, trends (phosphate + E. coli
                      bar charts) or the lab metals, and on the Citizen Science map the
                      surveys (cycle newer / older through each visit: weather, flow,
                      readings, photos)
    photo-viewer.js   survey photos enlarge in a dialog in the page, with previous / next
    contextual-layers.js  WFD classification, National Soil Map, storm overflows, Event Duration Monitoring 2025, river
                      network pop-up - ported from NRS
    river-network.js  Open River Network + animated "River flow direction" layers
                      (WebGL, ported from NRS) - on every map's layer list
  tabs/
    citizen-science-map.js  sites joined to a season's records, coloured by phosphate /
                            E. coli band, clickable legend filter, site panel,
                            Map / League table view switch
    league-table.js         sortable site league table (phosphate + E. coli readings)
    downstream-plots.js     one chart per catchment, sites upstream -> downstream by the
                            sites layer's Number field; phosphate, E. coli or any metal
  charts/
    season-bars.js          per-site bar chart of a metric over its surveys, bars coloured by
                            threshold band on soft band stripes (NRS thresholds; not clickable)
    chart-common.js         reading text + hover/focus tooltip shared by the charts
    downstream-chart.js     plain-SVG downstream line chart (tooltip, data table)
    river-schematic.js      metro-map style river diagram, drawn from a river tree
  data/river-topology.js    builds that tree from the Open River Network: snaps sites to
                            the network, traces downstream, main stem = most river upstream;
                            falls back to site numbering. Corrections: RIVER_DIAGRAM_OVERRIDES
                            in config.js
    metals-map.js           sites joined to lab metals results, sized by value, hollow
                            ring = below limit of detection, clickable legend filter
    data-tab.js       placeholder for a table/summary view
  utils/
    format.js         escapeHtml, formatNumber, formatDate
data/                 any static data files (GeoJSON, lookups)
```

### Adding a layer

Add an entry to `LAYERS` in `js/config.js` with an `id`, `title` and `url`. It'll appear on the map and in the layer list. Elsewhere, get it with `getLayer("<id>")` from `js/layers.js`.

### Adding a tab

1. In `index.html`, add `<calcite-tab-title data-view="x">` to the tab bar and a `<section class="view" data-view="x" hidden>` in `<main>`.
2. Create `js/tabs/x-tab.js` exporting an `initXTab` function.
3. Add it to `TAB_INITS` in `js/main.js` (it's initialised the first time the tab is opened).
4. Respect the header filters: subscribe with `onFilterChange(fn)` from `js/filters.js`. Then either test sites with `matchesFilters(attributes)` / `filterWhereClause()`, or, for tables related on `site_name` (metals etc.), keep rows whose site is in `filteredSiteNames()`.
