// =====================================================================
// ARCGIS SETUP
// Gives the ArcGIS SDK the API key for Esri's basemaps. It is imported
// first by main.js, before any map is started.
// The key is public by design (it is visible to anyone who views the
// page): its safety is that it is restricted, in the Rivers Trust's
// ArcGIS account, to the dashboard's own web addresses (referrers) and to
// the basemap privilege only. To change it, replace ESRI_API_KEY in
// config.js. It expires on 17 November 2027 and a new one is needed by
// then (the maps' background tiles stop loading otherwise).
// =====================================================================

import { ESRI_API_KEY } from "./config.js";

const esriConfig = await $arcgis.import("@arcgis/core/config.js");
esriConfig.apiKey = ESRI_API_KEY;
