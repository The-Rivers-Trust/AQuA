// =====================================================================
// AQUA SERVICE
// Reads from the AQuA feature service: the sites and the citizen science
// table. Query results are cached per session, so switching season or
// metric doesn't re-download anything.
// =====================================================================

import { AQUA } from "../config.js";

let sitesCache = null;
let citizenScienceCache = null;
let metalsCache = null;

async function getFeatureLayerClass() {
  const [FeatureLayer] = await $arcgis.import(["@arcgis/core/layers/FeatureLayer.js"]);
  return FeatureLayer;
}

// Pages through a layer/table until every matching record is returned,
// so a table growing past the service's maxRecordCount (2000) each
// quarter doesn't silently get cut short.
async function queryAll(layer, params) {
  const pageSize = 1000;
  const features = [];
  for (let start = 0; ; start += pageSize) {
    const result = await layer.queryFeatures({ ...params, start, num: pageSize, orderByFields: ["OBJECTID"] });
    features.push(...result.features);
    if (!result.exceededTransferLimit && result.features.length < pageSize) return features;
  }
}

// The service stores sites in British National Grid; they're requested
// in WGS84 so the same cached result serves the map and the filters
// (which only need attributes) without waiting for the map view.
export const SITES_SPATIAL_REFERENCE = { wkid: 4326 };

export async function fetchSites() {
  if (!sitesCache) {
    const FeatureLayer = await getFeatureLayerClass();
    const layer = new FeatureLayer({ url: AQUA.sitesUrl });
    sitesCache = queryAll(layer, {
      where: "1=1",
      outFields: AQUA.siteFields,
      returnGeometry: true,
      outSpatialReference: SITES_SPATIAL_REFERENCE,
    });
  }
  return sitesCache;
}

// All citizen science records, as plain attribute objects.
export async function fetchCitizenScience() {
  if (!citizenScienceCache) {
    const FeatureLayer = await getFeatureLayerClass();
    const table = new FeatureLayer({ url: AQUA.citizenScienceUrl });
    citizenScienceCache = queryAll(table, {
      where: "1=1",
      outFields: AQUA.citizenScienceFields,
      returnGeometry: false,
    }).then((features) => features.map((f) => f.attributes));
  }
  return citizenScienceCache;
}

// All metals records, as plain attribute objects (every field, so a
// season_year field added later comes through without a code change).
export async function fetchMetals() {
  if (!metalsCache) {
    const FeatureLayer = await getFeatureLayerClass();
    const table = new FeatureLayer({ url: AQUA.metalsUrl });
    metalsCache = queryAll(table, {
      where: "1=1",
      outFields: ["*"],
      returnGeometry: false,
    }).then((features) => features.map((f) => f.attributes));
  }
  return metalsCache;
}

// True if a table's records carry a season (the metals table doesn't yet).
export function hasSeasons(records) {
  return records.some((r) => r[AQUA.seasonField] != null);
}

// Distinct seasons in the records, most recent first (by latest
// field_date in each, so naming like "Summer26"/"Winter26" never needs
// to be parsed).
export function listSeasons(records) {
  const latest = new Map();
  for (const r of records) {
    const season = r[AQUA.seasonField];
    if (!season) continue;
    const date = r.field_date ?? "";
    if (!latest.has(season) || date > latest.get(season)) latest.set(season, date);
  }
  return [...latest.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([season]) => season);
}

// site_name -> that site's record for one season (season null = every
// record, for tables without seasons). If a site somehow has more than
// one record, the latest field_date wins.
export function recordsBySite(records, season) {
  const bySite = new Map();
  for (const r of records) {
    if (season != null && r[AQUA.seasonField] !== season) continue;
    const key = r[AQUA.joinField];
    const existing = bySite.get(key);
    if (!existing || (r.field_date ?? "") > (existing.field_date ?? "")) bySite.set(key, r);
  }
  return bySite;
}
