// =====================================================================
// METRICS
// Turns a reading into its band for a metric defined in config.js.
// =====================================================================

import { METRICS, NO_DATA } from "./config.js";

export function getMetric(key) {
  return METRICS[key] ?? null;
}

export function classify(metricKey, value) {
  const metric = METRICS[metricKey];
  if (!metric || value == null || Number.isNaN(Number(value))) return NO_DATA;
  return metric.bands.find((band) => band.max == null || value <= band.max);
}

// Every band a metric can produce, including NO_DATA last - the order the
// legend and renderer list them in.
export function allBands(metricKey) {
  return [...METRICS[metricKey].bands, NO_DATA];
}
