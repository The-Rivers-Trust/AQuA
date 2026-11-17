# How the AQuA dashboard is put together

This document explains how the dashboard works, what it depends on, and how to look after it. The [README](../README.md) covers running it locally and the day-to-day data jobs; this goes further into the design and the reasons behind it.

## 1. What it is

A single-page web dashboard for the AQuA citizen science project. It shows what volunteers found when they tested Yorkshire rivers for phosphate and E. coli (plus lab results for metals), on maps, charts and tables.

It is a **static website**: HTML, CSS and JavaScript files, with no server of our own and **no build step**. Whatever is in the repository is what the browser runs. It is hosted on GitHub Pages (repository `The-Rivers-Trust/AQuA`, branch `main`); pushing to `main` publishes it after a minute or two.

Everything is loaded in the visitor's browser:

```
Visitor's browser
 |-- GitHub Pages ........ the dashboard's own files (HTML, CSS, JS, JSON data files)
 |-- js.arcgis.com ....... the ArcGIS Maps SDK and Calcite UI components (Esri's CDN)
 |-- ArcGIS Online ....... the AQuA data and other map layers (feature services)
 |-- basemapstyles-api ... Esri's background maps (needs the API key, see section 5)
 '-- UKCEH ............... the Land Cover Map (WMS service)
```

## 2. Technology choices

| Choice | Why |
|---|---|
| **Plain ES modules, no framework or bundler** | Nothing to install or compile, so anyone can edit a file on GitHub and see the result. Fewer things to break or go out of date. |
| **ArcGIS Maps SDK for JavaScript 5.1** (web components such as `<arcgis-map>`) | The data already lives in ArcGIS Online feature services, and the SDK queries them, draws them and handles pop-ups, legends and basemaps. |
| **Calcite Design System 5.1.1** | Esri's UI components (tabs, buttons, panels, selects). They match the maps and handle accessibility and dark/light themes. |
| **Plain SVG charts** (written in `js/charts/`) | The charts are simple, so a charting library was not worth the weight. |
| **JSON files for content** (`data/`) | Text and settings that people edit (thresholds, group profiles, summaries) live in files, not code. |

Versions are pinned in `index.html` (`js.arcgis.com/5.1/` and `calcite-components/5.1.1`). Moving to a newer Esri version means changing those and re-testing.

## 3. Where things are

```
index.html          page structure: header, filters, tab bar, one section per tab
css/                theme.css (colours/spacing), layout.css (everything else), popup.css, tour.css
js/main.js          start-up (see section 4)
js/config.js        all "data rather than behaviour": service URLs, field names, map settings, API key
js/arcgis-setup.js  gives the SDK the Esri API key
js/filters.js       the header filters (season, group, catchment, river), shared by every tab
js/theme.js         dark/light theme
js/deep-link.js     ?group=<slug> web addresses
js/tour.js          the first-visit guided tour
js/map/             everything map-related (basemaps, layers, panels, site panel, river flow)
js/tabs/            one file per tab
js/charts/          the SVG charts
js/data/            reading data from the services and shaping it
data/               JSON files edited by people (see section 6)
scripts/            Node scripts run by hand (see section 7)
img/social/         social media icons for the Groups tab
```

The README's project layout lists every file with a one-line description.

## 4. How it starts and how tabs work

1. `index.html` loads the Esri SDK and styles from the CDN, then `js/main.js`.
2. `main.js` first imports `arcgis-setup.js` (sets the API key), then sets up the theme, keyboard shortcuts, tab switching and the **header filters**.
3. Only the first tab (Citizen Science Map) starts immediately. Every other tab is initialised **the first time it is opened**, so a map nobody looks at is never loaded. This is the `TAB_INITS` table in `main.js`.
4. The header filters are set up first and every tab subscribes to them with `onFilterChange`. Picking a group, catchment or river in the header changes every tab at once; picking a group on the Groups tab, or a catchment card on the Catchment Explorer, simply sets the same filter.

### The tabs

| Tab | What it does |
|---|---|
| **Citizen Science Map** | Sites coloured by phosphate or E. coli band; click a site for its panel (details, trends, each survey with photos); a league table drawer. |
| **Metals Map** | Lab metals results, sites sized by value. |
| **Downstream Plots** | One chart per catchment, sites running upstream to downstream. |
| **Catchment Explorer** | A card per catchment, a comparison panel, an all-catchments table, and the AI-assisted summaries. |
| **Groups** | A card per citizen science group and a profile with a small map of its sites. |
| **Quality Assurance** | Control blank counts and the E. coli blanks with their plate photos. |

### Shared pieces worth knowing

- **Thresholds** (what counts as "Low" or "High" phosphate and "Good" or "Bad" E. coli) are in `data/thresholds.json`, loaded and checked by `js/thresholds.js`. If the file has a mistake the dashboard shows a red message instead of starting.
- **One basemap choice** is shared by every map (`js/map/basemaps.js`). It follows the dark/light theme until someone picks one.
- **Map layers, legend and basemap** open as panels over the map from the buttons at the top right (`js/map/tool-panels.js`); the same switches apply on every map (`js/map/layers-panel.js`).
- **The river flow animation** is a custom WebGL layer (`js/map/river-network.js`), adapted from the NRS dashboard. It exists only for the flat map.

## 5. The Esri API key: what it is and why it is needed

### Why it is needed

The data layers (sites, river network and so on) are public feature services and need no key. The **background maps** (light gray, dark gray, streets, topographic, terrain, outdoor, imagery) are different: they are Esri's own paid-for service, and Esri expects an app that uses its current basemap styles to identify itself with an **API key**. The key tells Esri which account the usage belongs to, so Esri can apply that account's terms and its free monthly allowance.

Before the key was added, the dashboard used Esri's older basemap names, which happened to work without one. Esri does not document that as a supported route, so it could have stopped working without notice. Using the key puts the dashboard on the documented, supported route.

### Where it lives

- The key is `ESRI_API_KEY` in `js/config.js`.
- `js/arcgis-setup.js` hands it to the SDK (`esriConfig.apiKey`). It is imported first in `main.js` so it is set before any map starts.
- The basemaps themselves are listed in `MAP.basemaps` in `config.js`, as Esri style ids such as `arcgis/topographic`. `MAP.basemap` sets the light and dark defaults, and `MAP.darkBasemaps` lists the dark ones (the river flow trails are drawn white on these and dark on the others).

### Why it is safe to have in a public repository

The key is **not a secret and cannot be one**. Everything a web page uses is delivered to the visitor's browser, so anyone can read the key from the page whether or not the repository is public. What protects it is how it was created in the Trust's ArcGIS account:

- **Referrer restriction.** It only works for requests from the web addresses listed on the key: the GitHub Pages site and the local test addresses. Another site using it is refused ("Token Invalid", error 498). This prevents casual copying, though it is not a lock against a determined person.
- **Basemaps privilege only.** It cannot read or change private data, create content, or use paid services such as routing or geocoding.
- **No item access.** It cannot open any private item in the account.
- **Expiry.** It stops working on **17 November 2027**.

Never put an account password or a client secret in this repository. This key is a different kind of thing and is designed to be public.

### Cost

Esri lists basemap tiles as free up to a monthly allowance (2 million tiles a month on ArcGIS Location Platform at the time of writing, then pay-as-you-go), which is far above what a dashboard of this size is likely to use. Check Esri's pricing page and the account's usage report from time to time. It is worth confirming with whoever manages the Trust's Esri account whether this key's usage counts against ArcGIS Online credits.

### Looking after the key

| Task | What to do |
|---|---|
| **Replace it before 17 November 2027** | In the ArcGIS account, open the credential, generate a new key (a credential can hold two, so add the new one first), copy it into `ESRI_API_KEY` in `js/config.js`, commit and push. Put a reminder in the calendar for early November 2027. |
| **Add a web address** (new domain, or testing on another port) | Add it to the key's referrer list in the ArcGIS account. No code change. Entries are exact: `http://127.0.0.1:5500` and `http://localhost:8080` are different, and there must be no trailing slash. |
| **Basemaps are blank or the page is slow** | Almost always the key is being rejected. Open the browser's developer tools (F12), look at the Network tab for a failing request to `basemapstyles-api.arcgis.com`, and check for "Token Invalid" / 498. Check the address you are on is on the referrer list, and that the key has not expired. |
| **The key is abused or leaks somewhere it shouldn't** | Delete or regenerate it in the credential. Only the one line in `config.js` changes. |

## 6. Data and content files

### Data from ArcGIS Online (read live)

All set in `js/config.js`:

- **AQuA feature service**: the sites, citizen science records and metals results. Each sampling table relates to the sites on `site_name`, and gains a batch of records each quarter, tagged by `season_year` (e.g. `Summer26`).
- **Open River Network** (Rivers Trust service): the blue river lines on every map; its lines are digitised in flow direction, which the flow animation relies on.
- **Reference layers**: WFD classification, National Soil Map, Event Duration Monitoring 2025, and the water companies' storm overflow services.
- **UKCEH Land Cover Map 2024**: a WMS service, shown with the credit "Based upon LCM2024 © UKCEH 2025".

If a service moves or a field is renamed, `config.js` should be the only file that needs changing.

### Files in `data/` (edited by people, read by the browser)

| File | What it holds | Who changes it, and how |
|---|---|---|
| `thresholds.json` | Band limits, names and colours for phosphate and E. coli. | Edit, run `npm run check:thresholds`, commit. |
| `organisations.json` | Each group's slug, About text, Catchment Concerns and Questions, and web / social links. | Edit on GitHub and commit. See the README's "Organisation profiles". |
| `catchment-facts.json` | Numbers worked out per catchment. | Generated by `npm run catchment:facts`. |
| `catchment-summaries.json` | The AI-assisted catchment summaries and whether each is approved. | Generated, then reviewed by a person (see section 7). |

## 7. Routine jobs

**Each new season** (summaries). Full steps are in the README under "Catchment summaries": generate the facts, generate draft summaries, review them with `?drafts` on the address, mark the good ones `"approved": true`, commit. Nothing is generated while someone is using the dashboard, and no AI key is ever in the browser. The `ANTHROPIC_API_KEY` used by the generator script is a different, private key held only on the machine running the script; it must never be committed.

**Group links.** Every group has a `slug` in `organisations.json`, and `?group=<slug>` on the address opens the Groups tab on that group (`js/deep-link.js`). Keep a slug fixed once it has been shared.

**Adding a layer, adding a tab.** Steps are in the README ("Adding a layer", "Adding a tab").

## 8. Third-party services, licences and credits

Esri's licensing does not cover everything on the map. Each of these has its own terms and credit:

| Item | Notes |
|---|---|
| **Esri SDK, basemaps and Calcite** | Governed by Esri's product-specific terms of use. The "Powered by Esri" text and data credits on each map must stay visible; do not cover or remove them. |
| **UKCEH Land Cover Map** | Credit line "Based upon LCM2024 © UKCEH 2025" is shown with the layer. |
| **National Soil Map** | Cranfield University / LandIS data, served through an ArcGIS service. Check its licence for any required credit. |
| **Water company storm overflow data** | Each company's published service. |
| **Open River Network** | Rivers Trust data. |
| **Social icons** | From Simple Icons (`img/social/`). |
| **River flow animation code** | Adapted from an Esri sample (via the NRS dashboard). Check the sample's licence if the code is reused elsewhere. |

If anything here is uncertain, ask whoever manages the Trust's Esri account before relying on it.

## 9. Known limits

- **The key expires** on 17 November 2027 and must be replaced (section 5).
- **Not tested** on real phones or other browsers, in the light theme overall, or with screen readers.
- **The tour is not shown on phones**, by design.
- **The animated flow layer is 2D only.** A 3D view was considered and not built.
- **Address and filters:** picking a group anywhere puts `?group=` in the address, so reloading that address always opens the Groups tab.
- **All data is read in the browser**, so a very large increase in sites or records could slow the page down.
