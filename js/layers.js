// =====================================================================
// LAYERS
// Builds the FeatureLayers listed in config.js and keeps them in one
// registry so any tab can get at a layer by id without passing it around.
// Renderers, labels and definition expressions for a specific layer go
// here too, keyed by the same id.
// =====================================================================

import { LAYERS } from "./config.js";

const registry = new Map();

export async function createLayers() {
  const [FeatureLayer] = await $arcgis.import(["@arcgis/core/layers/FeatureLayer.js"]);

  for (const { id, ...props } of LAYERS) {
    registry.set(id, new FeatureLayer({ id, outFields: ["*"], ...props }));
  }
  return [...registry.values()];
}

export function getLayer(id) {
  const layer = registry.get(id);
  if (!layer) throw new Error(`No layer with id "${id}" - check LAYERS in config.js`);
  return layer;
}
