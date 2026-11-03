// =====================================================================
// CONFIG
// Everything that is "data" rather than "behaviour": service URLs, field
// names, thresholds, starting extent, basemaps. When a service moves, a
// field is renamed or a threshold is agreed, this should be the only
// file that changes.
// =====================================================================

export const APP_TITLE = "AQuA Dashboard";

export const MAP = {
  // Roughly centred on Yorkshire.
  center: [-1.4, 54.0],
  zoom: 8,
  // Starting basemap, following the dark/light theme until the user picks
  // one from the basemap selector.
  basemap: {
    dark: "dark-gray-vector",
    light: "gray-vector",
  },
  // The selector's choices, in gallery order: Esri basemap ids (all load
  // without an API key; the gallery shows Esri's own name and thumbnail
  // for each). Keep the two theme defaults above in the list.
  basemaps: [
    "gray-vector",
    "dark-gray-vector",
    "streets-vector",
    "topo-vector",
    "terrain",
    "osm",
    "satellite",
    "hybrid",
  ],
};

// ---------------------------------------------------------------------
// AQuA feature service
// Sites (points) relate one-to-many to each sampling table on site_name.
// Every table gains a new batch of records each quarter, tagged by
// season_year (e.g. "Summer26").
// ---------------------------------------------------------------------
const AQUA_SERVICE = "https://services3.arcgis.com/Bb8lfThdhugyc4G3/arcgis/rest/services/AQuA_Data/FeatureServer";

export const AQUA = {
  sitesUrl: `${AQUA_SERVICE}/0`,
  metalsUrl: `${AQUA_SERVICE}/1`,
  citizenScienceUrl: `${AQUA_SERVICE}/2`,
  joinField: "site_name",
  seasonField: "season_year",

  // Number = the site's order within its catchment, 1 at the top (used by
  // the downstream plots).
  siteFields: ["OBJECTID", "site_name", "Number", "case_study_group", "River_Waterbody", "Catchment", "OS_Grid_Ref", "Description", "Easting", "Northing"],
  // Everything a survey shows in the site panel (js/map/site-sections.js).
  citizenScienceFields: [
    "OBJECTID", "site_name", "season_year", "field_date", "field_time",
    "current_weather", "weather_last_24h", "water_flow", "water_level", "pollution_sources_combined",
    "phosphate_ppm", "phosphate_qa", "ecoli_cfu", "ecoli_qa",
    // Epicollect photo links (not every survey has all of them).
    "site_photo_1", "site_photo_2", "site_photo_3", "ecoli_plate_photo",
  ],
};

// ---------------------------------------------------------------------
// Map metrics
// Each metric colours the sites by bands of one citizen science field.
// A band's `max` is its own upper bound, INCLUSIVE (same convention as
// the NRS dashboard); the last band has no max and catches everything
// above. Readings that are missing (not collected / no visit that
// season) fall into the shared NO_DATA band instead.
// ---------------------------------------------------------------------
export const NO_DATA = { key: "noData", label: "No reading", color: "#8a8a8a" };

export const METRICS = {
  phosphate: {
    label: "Phosphate",
    field: "phosphate_ppm",
    unit: "mg/l",
    decimals: 2,
    // Same thresholds and colours as the NRS dashboard's phosphate bands.
    bands: [
      { key: "low", label: "Low", max: 0.1, color: "#0072b0" },
      { key: "slightlyElevated", label: "Slightly Elevated", max: 0.3, color: "#56d5e8" },
      { key: "elevated", label: "Elevated", max: 0.75, color: "#e6b800" },
      { key: "high", label: "High", max: 1, color: "#f08c00" },
      { key: "veryHigh", label: "Very High", color: "#d63129" },
    ],
  },
  ecoli: {
    label: "E. coli",
    field: "ecoli_cfu",
    unit: "cfu",
    decimals: 0,
    // The per-site bar chart's fixed top of axis: counts run from 0 to
    // hundreds, so a higher bar is clipped (and labelled) rather than
    // squashing the 10 cfu line into the floor.
    chartMax: 100,
    // Good below 10 cfu, bad at 10 or more. Integer counts, so "max: 9"
    // is the same as "< 10".
    // Colours: Okabe-Ito blue / vermillion, a colour-blind-safe pair (stays
    // clearly distinct under protan, deutan and tritan simulation, unlike
    // red/green). Blue also matches phosphate's "Low", so blue = good on
    // both metrics.
    bands: [
      { key: "good", label: "Good (under 10 cfu)", max: 9, color: "#0072B2" },
      { key: "bad", label: "Bad (10 cfu or more)", color: "#D55E00" },
    ],
  },
};

// Plain symbol colour for the "Sites" view (no metric selected).
export const SITE_COLOR = "#009af2";

// ---------------------------------------------------------------------
// Metals (lab results)
// Each metal has a value field (<key>) and a "<key>_below_lod" field set
// to "Yes" when the reading was under the lab's limit of detection (the
// value is then empty). No thresholds agreed yet, so the map sizes
// points by value instead of colouring by band.
// Units aren't in the service - mg/l is inferred from the values (e.g.
// calcium 6-119, sodium 4-74, which only make sense as mg/l). Check with
// the lab.
// ---------------------------------------------------------------------
export const METALS = {
  unit: "mg/l",
  lodSuffix: "_below_lod",
  lodFlag: "Yes",
  color: "#009E73", // Okabe-Ito bluish green - neutral, no good/bad meaning
  minSize: 6,
  maxSize: 30,
  // The metals the catchment summaries single out (js/tabs/catchment-summaries.js,
  // scripts/catchment-facts.mjs): the ones people ask about. The rest are
  // mostly ordinary minerals (calcium, sodium...) or rarely detected.
  focus: ["aluminium", "cadmium", "chromium", "copper", "iron", "lead", "manganese", "nickel", "zinc"],
  list: [
    { key: "aluminium", label: "Aluminium", symbol: "Al" },
    { key: "barium", label: "Barium", symbol: "Ba" },
    { key: "bismuth", label: "Bismuth", symbol: "Bi" },
    { key: "boron", label: "Boron", symbol: "B" },
    { key: "cadmium", label: "Cadmium", symbol: "Cd" },
    { key: "caesium", label: "Caesium", symbol: "Cs" },
    { key: "calcium", label: "Calcium", symbol: "Ca" },
    { key: "chromium", label: "Chromium", symbol: "Cr" },
    { key: "cobalt", label: "Cobalt", symbol: "Co" },
    { key: "copper", label: "Copper", symbol: "Cu" },
    { key: "gallium", label: "Gallium", symbol: "Ga" },
    { key: "indium", label: "Indium", symbol: "In" },
    { key: "iron", label: "Iron", symbol: "Fe" },
    { key: "lead", label: "Lead", symbol: "Pb" },
    { key: "lithium", label: "Lithium", symbol: "Li" },
    { key: "magnesium", label: "Magnesium", symbol: "Mg" },
    { key: "manganese", label: "Manganese", symbol: "Mn" },
    { key: "nickel", label: "Nickel", symbol: "Ni" },
    { key: "potassium", label: "Potassium", symbol: "K" },
    { key: "silver", label: "Silver", symbol: "Ag" },
    { key: "sodium", label: "Sodium", symbol: "Na" },
    { key: "strontium", label: "Strontium", symbol: "Sr" },
    { key: "thallium", label: "Thallium", symbol: "Tl" },
    { key: "zinc", label: "Zinc", symbol: "Zn" },
  ],
};

// ---------------------------------------------------------------------
// Open River Network (reference layer on every map) - same service and
// styling as the NRS dashboard: one fixed blue, width by Strahler order,
// only drawn once zoomed in past ~1:1,000,000 (183k segments nationally).
// Its lines are digitised in flow direction (the service's `flow` field
// reads "in direction" for 99.996% of segments), which the animated
// flow-direction overlay relies on.
// ---------------------------------------------------------------------
export const RIVER_NETWORK = {
  url: "https://services3.arcgis.com/Bb8lfThdhugyc4G3/arcgis/rest/services/OpenRiverNetwork_CaBA_ID/FeatureServer/0",
  title: "Open River Network",
  flowTitle: "River flow direction",
  color: "#0277bd",
  minScale: 1000000,
  // The flow animation is heavier (it draws every section in view), so it
  // only runs zoomed in much further - roughly city / river-reach level.
  flowMinScale: 150000,
  // River diagrams: how sites are matched to the network (see
  // js/data/river-topology.js). A site snaps to the nearest river section
  // within snapDistance metres, preferring one whose name matches the
  // site's river; a section with a different name is only accepted within
  // otherNameSnapMax metres (stops e.g. a small beck site snapping onto
  // the main river 150 m away).
  snapDistance: 250,
  otherNameSnapMax: 100,
  widthByStrahler: [
    { value: 1, size: 0.4 },
    { value: 2, size: 0.8 },
    { value: 3, size: 1.3 },
    { value: 4, size: 2 },
    { value: 5, size: 3 },
    { value: 7, size: 5 },
  ],
};

// ---------------------------------------------------------------------
// Contextual layers (the map's Layers panel) - ported from the NRS
// dashboard: WFD waterbody classification and the National Soil Map as
// switchable backgrounds, live storm overflows from every water company,
// and the Open River Network (RIVER_NETWORK above).
// ---------------------------------------------------------------------
export const WFD_CATCHMENTS = {
  url: "https://services3.arcgis.com/Bb8lfThdhugyc4G3/arcgis/rest/services/WFD_River_Water_Body_Catchments_Cycle_4_With_Coastal/FeatureServer/0",
  title: "WFD Waterbody Classification 2025",
  opacity: 0.4,
  fields: [
    { field: "ecological_class", label: "Ecological" },
    { field: "ammonia_phys_chem_class", label: "Ammonia" },
    { field: "phosphate_class", label: "Orthophosphate" },
  ],
  // Same colours as the EA's own ecological_class renderer.
  classes: [
    { value: "High", color: [0, 114, 176, 255] },
    { value: "Good", color: [86, 213, 232, 255] },
    { value: "Moderate", color: [230, 184, 0, 255] },
    { value: "Poor", color: [240, 140, 0, 255] },
    { value: "Bad", color: [214, 49, 41, 255] },
  ],
  notAssessedColor: [156, 156, 156, 255],
};

export const SOIL_MAP = {
  url: "https://utility.arcgis.com/usrsvcs/servers/608cab5c64ae44789d65582007fb2350/rest/services/NationalSoilMap/FeatureServer/0",
  title: "National Soil Map",
  field: "SOILSCAPE",
};

export const STORM_OVERFLOWS = {
  title: "Storm Overflows",
  refreshMinutes: 5,
  recentHours: 48,
  defaultFields: {
    id: "Id",
    company: "Company",
    status: "Status",
    statusStart: "StatusStart",
    latestEventStart: "LatestEventStart",
    latestEventEnd: "LatestEventEnd",
    receivingWaterCourse: "ReceivingWaterCourse",
    lastUpdated: "LastUpdated",
  },
  sources: [
    { url: "https://services-eu1.arcgis.com/MSNNjkZ51iVh8yBj/arcgis/rest/services/Northumbrian_Water_Storm_Overflow_Activity_2_view/FeatureServer/0" },
    { url: "https://services3.arcgis.com/VCOY1atHWVcDlvlJ/arcgis/rest/services/stream_service_outfall_locations_view/FeatureServer/0" },
    { url: "https://services1.arcgis.com/NO7lTIlnxRMMG9Gw/arcgis/rest/services/Severn_Trent_Water_Storm_Overflow_Activity/FeatureServer/0" },
    { url: "https://services-eu1.arcgis.com/6qJmARkS2dt2IjVA/arcgis/rest/services/SouthernWater_StormOverflowActivity_PROD_view/FeatureServer/0" },
    {
      // camelCase field names throughout
      url: "https://services-eu1.arcgis.com/OMdMOtfhATJPcHe3/arcgis/rest/services/NEH_outlets_PROD/FeatureServer/0",
      fields: {
        company: "company",
        status: "status",
        statusStart: "statusStart",
        latestEventStart: "latestEventStart",
        latestEventEnd: "latestEventEnd",
        receivingWaterCourse: "receivingWaterCourse",
        lastUpdated: "lastUpdated",
      },
    },
    { url: "https://services2.arcgis.com/g6o32ZDQ33GpCIu3/arcgis/rest/services/Thames_Water_Storm_Overflow_Activity_(Production)_view/FeatureServer/0" },
    { url: "https://services5.arcgis.com/5eoLvR0f8HKb7HWP/arcgis/rest/services/United_Utilities_Storm_Overflow_Activity/FeatureServer/0" },
    { url: "https://services.arcgis.com/3SZ6e0uCvPROr4mS/arcgis/rest/services/Wessex_Water_Storm_Overflow_Activity/FeatureServer/0" },
    { url: "https://services-eu1.arcgis.com/1WqkK5cDKUbF0CkH/arcgis/rest/services/Yorkshire_Water_Storm_Overflow_Activity/FeatureServer/0" },
    {
      // The end-of-discharge field is LatestEventFinish (LatestEventEnd is
      // only its alias, which queries can't use).
      url: "https://services-eu1.arcgis.com/zat3uNEZelYVksuM/arcgis/rest/services/STREAM_Data/FeatureServer/0",
      fields: { latestEventEnd: "LatestEventFinish" },
    },
  ],
  // Emoji rather than dots so outfalls never read as survey sites. The
  // two states that need attention draw larger and on top.
  categories: [
    { key: "spilling", label: "Currently discharging", headline: "Discharging Now", glyph: "\u{1F4A9}", size: 20, priority: 3 },
    { key: "recent", label: "Discharged in last 48 hours", headline: "Discharged in last 48 hours", glyph: "⚠️", size: 20, priority: 2 },
    { key: "notspilling", label: "Not discharged in last 48 hours", headline: "Not discharged in last 48 hours", glyph: "✅", size: 8, priority: 0 },
    { key: "offline", label: "Offline", headline: "Offline", glyph: "❓", size: 8, priority: 1 },
  ],
};

// Event Duration Monitoring 2025 (England and Wales): every storm overflow's
// annual return to the EA / NRW - how many times it spilled and for how
// long. One hosted layer of ~16,500 outfalls; points are sized by spill
// count in the same classes as the service's own styling.
export const EDM_2025 = {
  url: "https://services3.arcgis.com/Bb8lfThdhugyc4G3/arcgis/rest/services/Event_Duration_Monitoring_Storm_Overflows_2025/FeatureServer/0",
  title: "Event Duration Monitoring 2025",
  color: [99, 79, 63, 190],
  // Spill counts: [highest count in the class, label, symbol size].
  classes: [
    [0, "No spills", 4],
    [19, "1 - 19 spills", 7],
    [39, "20 - 39 spills", 10],
    [59, "40 - 59 spills", 13],
    [99, "60 - 99 spills", 16],
    [366, "100 or more spills", 19],
  ],
};

// Hand corrections for the river diagrams, keyed by site_name:
//   { snapTo: "River Ribble" } - match this site to the nearest network
//                                section with that name instead
//   { offNetwork: true }       - don't use the network for this site;
//                                place it from its site number instead
export const RIVER_DIAGRAM_OVERRIDES = {};

// Where a river that isn't on the Open River Network flows, for the
// river diagrams - keyed by the sites' River_Waterbody name:
//   { into: "<river>" }               joins that river's line at its upstream end
//   { into: "<river>", after: "SITE" } joins just downstream of that site
// Without an entry, such a river is placed from site numbering.
export const RIVER_DIAGRAM_JOINS = {
  "Ram Wood Beck": { into: "Roundhay park upper lake" },
};

// Extra static layers (overlays etc.). js/layers.js turns these into
// FeatureLayers; the `id` is how the rest of the code refers to each one
// (getLayer("rivers"), etc.), so keep ids stable even if titles change.
//
// Example entry:
// {
//   id: "rivers",
//   title: "River network",
//   url: "https://services.arcgis.com/<org>/arcgis/rest/services/<name>/FeatureServer/0",
//   visible: false,
// },
export const LAYERS = [];
