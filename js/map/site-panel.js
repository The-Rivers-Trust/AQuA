// =====================================================================
// SITE PANEL
// What happens when a site is clicked: a panel opens down the right of
// the map with the site's details, trends and surveys (built by each map
// tab from site-sections.js), and the site is highlighted on the map. It
// replaces the site pop-up on both maps.
//
// A map's panel lives beside it in its tab's <section>, after the map
// and the Layers panel:
//   <calcite-panel class="sitePanel" closable closed>   (filled in here)
//
// Both right-hand panels can be open together, but if that would leave the
// map too narrow the one opened first makes way (they tell each other with
// "sitepanelopen" / "layerspanelopen" events on the map).
//
// A tab sets it up with initSitePanel(mapEl, { render }) and registers
// each sites layer it creates with registerSiteLayer(layer); the map's
// click handler (layers-panel.js) calls selectSite(). After a tab
// rebuilds its layer (season change) or changes what the content depends
// on (the Metals map's chosen metal) it calls refreshSite().
// =====================================================================

import { matchesFilters, onFilterChange } from "../filters.js";

const siteLayers = new WeakSet();
const panels = new WeakMap(); // mapEl -> controller

export function registerSiteLayer(layer) {
  siteLayers.add(layer);
}

export function isSiteLayer(layer) {
  return siteLayers.has(layer);
}

export function hasSitePanel(mapEl) {
  return panels.has(mapEl);
}

// graphic: a site graphic from one of the registered sites layers.
export function selectSite(mapEl, graphic) {
  panels.get(mapEl)?.select(graphic);
}

// Closes the panel and deselects the site.
export function clearSite(mapEl) {
  panels.get(mapEl)?.clear();
}

// Narrower than this and the map isn't much use - see the header comment.
export const MIN_MAP_WIDTH = 480;

// Resolves once a calcite panel whose open/closed state was just changed
// has actually been laid out (it re-renders a moment after the change), so
// the map's width can be measured.
export async function afterLayout(panelEl) {
  try {
    await panelEl?.updateComplete;
  } catch (error) {
    // not a component that reports it - the frame below will do
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

// Re-draws the open panel (or closes it if the site is gone).
// findGraphic(siteName) returns the site's graphic in the current layer.
export function refreshSite(mapEl, findGraphic) {
  panels.get(mapEl)?.refresh(findGraphic);
}

// render(attributes) -> the panel's content element, or a promise of it.
export function initSitePanel(mapEl, { render }) {
  const panelEl = mapEl.closest(".view")?.querySelector(".sitePanel");
  if (!panelEl) return;

  let selected = null; // the selected site's graphic
  let highlight = null;
  let token = 0; // a newer selection supersedes a slower render

  async function show(graphic, { pan }) {
    const mine = ++token;
    selected = graphic;
    panelEl.heading = graphic.attributes.site_name;
    panelEl.description = graphic.attributes.Description ?? "";
    panelEl.closed = false;
    afterLayout(panelEl).then(() => mapEl.dispatchEvent(new CustomEvent("sitepanelopen")));
    highlightSite(graphic);
    if (pan) keepInView(graphic);

    let content;
    try {
      content = await render(graphic.attributes);
    } catch (error) {
      console.warn("AQuA dashboard: site panel failed to build:", error);
      content = Object.assign(document.createElement("p"), { className: "muted", textContent: "This site's details couldn't be loaded." });
    }
    if (token === mine) panelEl.replaceChildren(content);
  }

  async function highlightSite(graphic) {
    highlight?.remove();
    highlight = null;
    try {
      const layerView = await mapEl.view.whenLayerView(graphic.layer);
      if (selected === graphic) highlight = layerView.highlight(graphic.attributes.OBJECTID);
    } catch (error) {
      // The layer was replaced while we waited - nothing to highlight.
    }
  }

  // Opening the panel shortens the map, so a site near the bottom edge
  // can end up under it - bring it back into view (keeping the zoom).
  function keepInView(graphic) {
    setTimeout(() => {
      if (selected !== graphic) return;
      const view = mapEl.view;
      const p = view.toScreen(graphic.geometry);
      const margin = 40;
      if (p.x < margin || p.y < margin || p.x > view.width - margin || p.y > view.height - margin) {
        mapEl.goTo({ center: graphic.geometry });
      }
    }, 400);
  }

  function clear() {
    token++;
    selected = null;
    highlight?.remove();
    highlight = null;
    panelEl.closed = true;
  }

  panelEl.addEventListener("calcitePanelClose", clear);
  // The Layers panel was opened and there isn't room for both.
  mapEl.addEventListener("layerspanelopen", () => {
    if (selected && mapEl.closest(".mapColumn").clientWidth < MIN_MAP_WIDTH) clear();
  });
  // A site the filters have now hidden shouldn't stay selected.
  onFilterChange(() => {
    if (selected && !matchesFilters(selected.attributes)) clear();
  });

  panels.set(mapEl, {
    clear,
    select: (graphic) => show(graphic, { pan: true }),
    refresh(findGraphic) {
      if (!selected) return;
      const next = findGraphic(selected.attributes.site_name);
      if (next) show(next, { pan: false });
      else clear();
    },
  });
}
