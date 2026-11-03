// =====================================================================
// KEYBOARD SHORTCUTS
// Single keys, active on the map tabs (Citizen Science, Metals):
//   R  Open River Network on / off      F  flow direction (network on)
//   S  storm overflows on / off         E  Event Duration Monitoring 2025
// They flip the same shared switches as the Map layers panel (see
// toggleOverlay in js/map/layers-panel.js), so the panel stays in step.
// Ignored while typing in a field, with Ctrl / Cmd / Alt held, or while a
// dialog (the photo viewer) is open.
// =====================================================================

import { toggleOverlay } from "./map/layers-panel.js";

const KEYS = { r: "network", f: "flow", s: "storm", e: "edm" };

// Typing somewhere - the key is for the field, not a shortcut. The event
// path is checked because Calcite's inputs keep the real <input> inside
// their shadow DOM.
function isTyping(event) {
  return event.composedPath().some((node) => {
    if (!(node instanceof HTMLElement)) return false;
    const tag = node.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable
      || tag === "CALCITE-COMBOBOX" || tag === "CALCITE-SELECT" || tag === "CALCITE-INPUT" || tag === "CALCITE-TEXT-AREA";
  });
}

export function initShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const key = KEYS[event.key.toLowerCase()];
    if (!key || isTyping(event)) return;
    if (document.querySelector("calcite-dialog[open]")) return;

    // The map on the tab being shown.
    const mapEl = document.querySelector(".view:not([hidden]) arcgis-map");
    if (!mapEl?.view) return;
    if (toggleOverlay(key, mapEl)) event.preventDefault();
  });
}
