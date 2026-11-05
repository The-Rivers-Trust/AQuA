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
  config.js           service URLs, field names, map start position (metric bands come from
                      data/thresholds.json via thresholds.js)
  thresholds.js       loads and checks data/thresholds.json
  metrics.js          classify(metric, value) → band, using the thresholds
  shortcuts.js        keyboard shortcuts on the map tabs: R river network, F flow, S storm overflows, E EDM
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
    tool-panels.js    the right-hand Map layers / Basemap / Legend panels: a button on each map
                      opens its panel, only one open at a time
    basemaps.js       one basemap choice shared by every map (gallery in the Basemap panel);
                      follows the theme until a basemap is picked
    layers-panel.js   the right-hand "Map layers" panel on every map (closed by default):
                      switches (shared between the maps), the Legend panel's contents,
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
                            League table button + bottom drawer over the map
    league-table.js         sortable site league table (phosphate + E. coli readings)
    catchment-summaries.js  AI-assisted catchment summaries read from data/catchment-summaries.json
                            (approved ones only; add ?drafts to the address to review the rest)
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

## Catchment summaries

The **Catchment Summaries** tab shows a short plain-English summary of each catchment's citizen science results for the season picked in the header. The text is written ahead of time with AI and checked by a person before the public sees it - nothing is generated while someone is using the dashboard, and no API key is ever in the browser.

Each new season:

1. `npm run catchment:facts` - works out the numbers for every catchment (sites surveyed, phosphate and E. coli bands, volunteers' pollution notes) into `data/catchment-facts.json`. No key needed.
2. `ANTHROPIC_API_KEY=... npm run catchment:summaries` - writes a summary of each catchment from those facts into `data/catchment-summaries.json`, every one saved with `"approved": false`. A summary whose facts haven't changed is left alone (`--force` redoes all, `--only Foss` redoes one).
3. Review: open the dashboard with `?drafts` on the address (e.g. `http://localhost:8080/?drafts`) to see the drafts. Edit any text in `data/catchment-summaries.json`, then set `"approved": true` and add `"reviewedAt": "2026-09-01"` (and `"reviewedBy"`).
4. Commit the JSON. Only approved summaries are shown on the live dashboard; until there are some it says they are being prepared.

Each summary also has a **metals** note (the lab results, which have no season) with its own `"approved"` flag inside `"metals"` - review and approve it the same way. The metals have no agreed thresholds yet and their units aren't confirmed in the data, so the note only says what was detected and where the highest results were, never whether they are high or safe.

The wording rules the model is given (public audience, no blame, no causes, no health advice, only the supplied numbers) are in `scripts/generate-catchment-summaries.mjs`.

## Thresholds

The bands for phosphate and E. coli - where each band ends, its name and its colour - are in **`data/thresholds.json`**, not in the code. To change one, edit that file on GitHub (or locally), run

```bash
npm run check:thresholds
```

to check it, and commit. The dashboard (maps, legends, league table, bar charts, catchment summaries) reads the file when it loads, so a change shows up as soon as GitHub Pages has redeployed.

- A band's `max` is its own upper limit, inclusive; the last band has no `max` and catches everything above. Bands run from lowest to highest.
- Labels are free text, so if you move a limit also update any number in the label (e.g. "Good (under 10 cfu)" with `"max": 9`).
- If the file has a mistake (a missing comma, bands out of order, a colour that isn't `#rrggbb`) the dashboard shows a red message saying what's wrong instead of starting, and the check above prints the same message.
- The catchment summaries quote thresholds in their text. After changing one, run `npm run catchment:facts` then `npm run catchment:summaries`: summaries written under the old thresholds are rewritten as unapproved drafts to review again.
- Metals have no thresholds yet; when they are agreed they can be added to this file.
