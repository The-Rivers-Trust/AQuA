// =====================================================================
// TOOL PANELS
// The map's right-hand tool panels - Map layers, Basemap and Legend. Each
// has a button on the map (top right) and a panel beside it, closed until
// its button is pressed. Only one is open at a time: opening one closes
// the others. Pressing an open panel's button, or its close icon, closes
// it.
//
// A map's markup, in its tab's <section>:
//   <calcite-action class="mapAction layersAction"> (+ basemapAction,
//   legendAction) inside the <arcgis-map>, and after the map
//   <calcite-panel class="toolPanel layersPanel" closable closed> (+
//   basemapPanel, legendPanel). What fills each is set up elsewhere:
//   layers-panel.js, basemaps.js (the gallery) and layers-panel.js again
//   (the legend).
//
// Opening one tells the site panel ("layerspanelopen" on the map, see
// site-panel.js), which makes way if the map would be left too narrow;
// and if a site panel opens when there isn't room for both, the tool
// panel closes.
// =====================================================================

import { afterLayout, MIN_MAP_WIDTH } from "./site-panel.js";

const TOOLS = [
  { panel: ".layersPanel", action: ".layersAction" },
  { panel: ".basemapPanel", action: ".basemapAction" },
  { panel: ".legendPanel", action: ".legendAction" },
];

export function setupToolPanels(mapEl) {
  const view = mapEl.closest(".view");
  if (!view) return;
  const tools = TOOLS
    .map((t) => ({ panel: view.querySelector(t.panel), action: mapEl.querySelector(t.action) }))
    .filter((t) => t.panel && t.action);

  const sync = () => tools.forEach((t) => { t.action.active = !t.panel.closed; });

  function open(tool) {
    tools.forEach((t) => { t.panel.closed = t !== tool; });
    sync();
    afterLayout(tool.panel).then(() => mapEl.dispatchEvent(new CustomEvent("layerspanelopen")));
  }

  for (const tool of tools) {
    tool.action.addEventListener("click", () => {
      if (tool.panel.closed) {
        open(tool);
      } else {
        tool.panel.closed = true;
        sync();
      }
    });
    tool.panel.addEventListener("calcitePanelClose", sync);
  }

  // A site was selected and there isn't room for it beside the open panel.
  mapEl.addEventListener("sitepanelopen", () => {
    if (mapEl.closest(".mapColumn").clientWidth < MIN_MAP_WIDTH) {
      tools.forEach((t) => { t.panel.closed = true; });
      sync();
    }
  });
}
