// =====================================================================
// LAYERS PANEL
// The map's contextual layers, switched from a side panel on the right
// of the map (closed until the map's "Map layers" button is pressed).
// Same layers and panel as the NRS dashboard's Map tab:
//   Background - one at a time: WFD waterbody classification (coloured
//     by ecological / ammonia / orthophosphate class), National Soil Map
//   Overlays: Open River Network (+ animated flow direction), live storm
//     overflows (+ "discharging or in the last 48 hours" only)
// and the map's Legend button shows a legend for whatever is switched on.
// This file also handles clicks on the map (see initMapClicks): a site or
// storm overflow opens its own pop-up; otherwise, with the river network
// on, the nearest river does.
//
// Every map gets its own copies of the layers (a layer can only sit in
// one map), but there's one set of switch positions shared by all of
// them - switch storm overflows on in one map and they're on in the
// other too, like the basemap.
//
// A map's panel lives in its tab's <section>:
//   <calcite-panel class="layersPanel" closable closed> (filled in here)
//   <calcite-action class="layersAction"> inside the <arcgis-map>
//   <arcgis-legend data-legend> + <p data-legend-empty> in the map's Legend
//     button (an <arcgis-expand>)
// Call setupLayersPanel(mapEl) right after setupMap, before the tab adds
// its own site layer, so these sit underneath the sites.
// =====================================================================

import { WFD_CATCHMENTS, RIVER_NETWORK } from "../config.js";
import { escapeHtml } from "../utils/format.js";
import { addRiverNetwork } from "./river-network.js";
import { isSiteLayer, hasSitePanel, selectSite, afterLayout, MIN_MAP_WIDTH } from "./site-panel.js";
import {
  createWfdLayer, wfdRenderer, wfdTitle, createSoilLayer, createStormOverflowLayers,
  riverPopupTemplate, RIVER_POPUP_FIELDS,
} from "./contextual-layers.js";

// ---------------------------------------------------------------------
// Shared switch positions
// ---------------------------------------------------------------------

const state = {
  wfd: false,
  wfdField: WFD_CATCHMENTS.fields[0].field,
  soil: false,
  network: false,
  flow: false, // animated flow direction (needs the network)
  storm: false,
  recent: false, // storm overflows: only discharging / discharged lately
};
const maps = new Set(); // each map's { apply }

// A switch changed in one panel: update the shared state, keep it
// consistent, and have every map follow.
function change(patch) {
  Object.assign(state, patch);
  if (patch.wfd === true) state.soil = false; // backgrounds: one at a time
  if (patch.soil === true) state.wfd = false;
  if (patch.network === false) state.flow = false;
  if (patch.flow === true) state.network = true;
  maps.forEach((m) => m.apply());
}

// ---------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------

const DESCRIPTIONS = { network: "Width by stream order", soil: "Soilscapes, LandIS" };
const ZOOM_IN = "Zoom in to view";

function panelMarkup() {
  const wfdOptions = WFD_CATCHMENTS.fields
    .map((f) => `<calcite-option value="${escapeHtml(f.field)}">${escapeHtml(f.label)}</calcite-option>`)
    .join("");
  return `
    <div class="sidePanelBody">
      <calcite-list class="layerList" label="Map layers" selection-mode="none" scale="s">
        <calcite-list-item-group heading="Background - one at a time">
          <calcite-list-item label="WFD waterbody classification" description="Environment Agency, 2025">
            <calcite-switch slot="content-end" data-wfd scale="s" label="WFD waterbody classification"></calcite-switch>
            <div slot="content-bottom" class="layerOptions" data-wfd-options hidden>
              <calcite-label layout="inline-space-between" scale="s">
                Colour by
                <calcite-select data-wfd-field scale="s" label="Classification to colour by">${wfdOptions}</calcite-select>
              </calcite-label>
            </div>
          </calcite-list-item>
          <calcite-list-item data-soil-item label="National Soil Map" description="${DESCRIPTIONS.soil}">
            <calcite-switch slot="content-end" data-soil scale="s" label="National Soil Map"></calcite-switch>
          </calcite-list-item>
        </calcite-list-item-group>

        <calcite-list-item-group heading="Overlays">
          <calcite-list-item data-network-item label="Open River Network" description="${DESCRIPTIONS.network}">
            <calcite-switch slot="content-end" data-network scale="s" label="Open River Network"></calcite-switch>
            <div slot="content-bottom" class="layerOptions" data-flow-options hidden>
              <calcite-label layout="inline" scale="s">
                <calcite-checkbox data-flow scale="s"></calcite-checkbox>
                Animate flow direction
              </calcite-label>
            </div>
          </calcite-list-item>
          <calcite-list-item label="Storm overflows" description="Live from water companies">
            <calcite-switch slot="content-end" data-storm scale="s" label="Storm overflows"></calcite-switch>
            <div slot="content-bottom" class="layerOptions" data-storm-options hidden>
              <calcite-label layout="inline" scale="s">
                <calcite-checkbox data-recent scale="s"></calcite-checkbox>
                Only discharging or in the last 48 hours
              </calcite-label>
            </div>
          </calcite-list-item>
        </calcite-list-item-group>
      </calcite-list>
    </div>`;
}

// ---------------------------------------------------------------------
// Per-map setup
// ---------------------------------------------------------------------

export async function setupLayersPanel(mapEl) {
  const panel = mapEl.closest(".view")?.querySelector(".layersPanel");
  const action = mapEl.querySelector(".layersAction");
  if (!panel || !action) return;

  const [reactiveUtils] = await $arcgis.import(["@arcgis/core/core/reactiveUtils.js"]);
  const [soil, wfd, storm] = await Promise.all([createSoilLayer(), createWfdLayer(), createStormOverflowLayers()]);

  // Bottom to top: backgrounds, river network (+ flow), storm overflows -
  // all under whatever the tab adds afterwards (the sites).
  mapEl.map.addMany([soil, wfd], 0);
  const { network, flow } = await addRiverNetwork(mapEl, 2);
  mapEl.map.addMany(storm.layers, flow ? 4 : 3);

  // ---- panel ----
  panel.innerHTML = panelMarkup();
  const q = (selector) => panel.querySelector(selector);
  const el = {
    wfd: q("[data-wfd]"),
    wfdOptions: q("[data-wfd-options]"),
    wfdField: q("[data-wfd-field]"),
    soil: q("[data-soil]"),
    soilItem: q("[data-soil-item]"),
    network: q("[data-network]"),
    networkItem: q("[data-network-item]"),
    flow: q("[data-flow]"),
    flowOptions: q("[data-flow-options]"),
    storm: q("[data-storm]"),
    stormOptions: q("[data-storm-options]"),
    recent: q("[data-recent]"),
    // In the map's Legend button, not this panel.
    legend: mapEl.querySelector("[data-legend]"),
    legendEmpty: mapEl.querySelector("[data-legend-empty]"),
  };

  const on = (target, event, fn) => target.addEventListener(event, fn);
  on(el.wfd, "calciteSwitchChange", () => change({ wfd: el.wfd.checked }));
  on(el.soil, "calciteSwitchChange", () => change({ soil: el.soil.checked }));
  on(el.network, "calciteSwitchChange", () => change({ network: el.network.checked }));
  on(el.flow, "calciteCheckboxChange", () => change({ flow: el.flow.checked }));
  on(el.storm, "calciteSwitchChange", () => change({ storm: el.storm.checked }));
  on(el.recent, "calciteCheckboxChange", () => change({ recent: el.recent.checked }));
  on(el.wfdField, "calciteSelectChange", () => change({ wfdField: el.wfdField.value }));

  // ---- open / close ----
  const syncAction = () => { action.active = !panel.closed; };
  action.addEventListener("click", () => {
    panel.closed = !panel.closed;
    syncAction();
    if (!panel.closed) afterLayout(panel).then(() => mapEl.dispatchEvent(new CustomEvent("layerspanelopen")));
  });
  // A site was selected and there isn't room for both right-hand panels.
  mapEl.addEventListener("sitepanelopen", () => {
    if (!panel.closed && mapEl.closest(".mapColumn").clientWidth < MIN_MAP_WIDTH) {
      panel.closed = true;
      syncAction();
    }
  });
  panel.addEventListener("calcitePanelClose", syncAction);

  // ---- follow the shared state ----
  let stormShown = false;
  let recentApplied = false;
  let legendKey = "";

  const inRange = () => mapEl.view.scale <= RIVER_NETWORK.minScale;

  // The network and soil map only draw zoomed in past minScale: their
  // switches say so and are disabled until then. Flow is only offered
  // while the network is on and drawing (and the WebGL overlay exists).
  function applyScaleGating() {
    const ok = inRange();
    el.network.disabled = !ok || !network;
    el.soil.disabled = !ok;
    el.networkItem.description = ok ? DESCRIPTIONS.network : ZOOM_IN;
    el.soilItem.description = ok ? DESCRIPTIONS.soil : ZOOM_IN;
    el.flowOptions.hidden = !(ok && state.network && flow);
  }

  function applyLegend() {
    const infos = [];
    if (state.wfd) infos.push({ layer: wfd, title: wfd.title });
    if (state.network) infos.push({ layer: network, title: network.title });
    if (state.soil) infos.push({ layer: soil, title: soil.title });
    if (state.storm) infos.push({ layer: storm.layers[0], title: storm.layers[0].title });
    const key = infos.map((i) => `${i.layer.id}|${i.title}`).join(",");
    if (key !== legendKey) {
      legendKey = key;
      el.legend.layerInfos = infos;
    }
    el.legend.hidden = !infos.length;
    el.legendEmpty.hidden = infos.length > 0;
  }

  function apply() {
    // layers
    wfd.visible = state.wfd;
    soil.visible = state.soil;
    if (wfd.title !== wfdTitle(state.wfdField)) {
      wfd.renderer = wfdRenderer(state.wfdField);
      wfd.title = wfdTitle(state.wfdField);
    }
    if (flow) flow.visible = state.flow && state.network; // off before the network goes
    network.visible = state.network;
    if (stormShown !== state.storm) {
      stormShown = state.storm;
      storm.setVisible(state.storm);
      if (!state.storm) mapEl.closePopup();
    }
    if (recentApplied !== state.recent) {
      recentApplied = state.recent;
      storm.setRecentOnly(state.recent);
    }

    // panel controls
    el.wfd.checked = state.wfd;
    el.wfdOptions.hidden = !state.wfd;
    el.wfdField.value = state.wfdField;
    el.soil.checked = state.soil;
    el.network.checked = state.network;
    el.flow.checked = state.flow;
    el.storm.checked = state.storm;
    el.stormOptions.hidden = !state.storm;
    el.recent.checked = state.recent;
    applyScaleGating();
    applyLegend();
  }

  maps.add({ apply });
  reactiveUtils.watch(() => mapEl.view.scale, applyScaleGating);
  apply();
  initMapClicks(mapEl, network);
}

// ---------------------------------------------------------------------
// Map clicks
// ---------------------------------------------------------------------

// Pop-ups are opened here rather than by the map's own click handling,
// because river lines are only a pixel or two wide: a click near one has
// to be matched to the nearest river by hand. In order: a site under the
// click opens the site panel (site-panel.js); a storm overflow its pop-up;
// failing that, with the network switched on and drawing, the nearest
// river within RIVER_CLICK_TOLERANCE pixels; failing that, nothing, and
// any open pop-up closes.
const RIVER_CLICK_TOLERANCE = 8;

function initMapClicks(mapEl, network) {
  let latest = 0; // a newer click supersedes one still being worked out
  mapEl.popupDisabled = true;

  mapEl.addEventListener("arcgisViewClick", async (event) => {
    const click = event.detail;
    const request = ++latest;
    const { results } = await mapEl.hitTest(click);
    if (request !== latest) return;

    const graphics = results.filter((r) => r.type === "graphic").map((r) => r.graphic);

    // A site: its panel opens under the map (no pop-up).
    const site = graphics.find((g) => isSiteLayer(g.layer));
    if (site && hasSitePanel(mapEl)) {
      mapEl.closePopup();
      // The hit graphic can carry only some fields - use the layer's own.
      const full = site.layer.source?.find((g) => g.attributes.OBJECTID === site.attributes.OBJECTID) ?? site;
      selectSite(mapEl, full);
      return;
    }

    // Anything else with a pop-up (storm overflows): the features the hit
    // test found, rather than asking the map to look them up again (that
    // finds nothing for the storm overflows).
    const hasPopup = (layer) => layer?.popupEnabled !== false && layer?.popupTemplate;
    const clicked = graphics.filter((g) => hasPopup(g.layer));
    if (clicked.length) {
      mapEl.openPopup({ features: clicked, location: click.mapPoint });
      return;
    }

    const view = mapEl.view;
    if (!network.visible || view.scale > network.minScale) {
      mapEl.closePopup();
      return;
    }
    const [distanceOperator] = await $arcgis.import(["@arcgis/core/geometry/operators/distanceOperator.js"]);
    const { features } = await network.queryFeatures({
      geometry: click.mapPoint,
      distance: RIVER_CLICK_TOLERANCE * view.resolution,
      units: "meters",
      spatialRelationship: "intersects",
      outFields: RIVER_POPUP_FIELDS,
      returnGeometry: true,
      outSpatialReference: view.spatialReference,
    });
    if (request !== latest) return;
    const nearest = features
      .map((f) => ({ f, d: distanceOperator.execute(click.mapPoint, f.geometry) }))
      .sort((a, b) => a.d - b.d)[0]?.f;
    if (!nearest) {
      mapEl.closePopup();
      return;
    }
    nearest.popupTemplate = riverPopupTemplate();
    mapEl.openPopup({ features: [nearest], location: click.mapPoint });
  });
}
