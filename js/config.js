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
  basemap: {
    dark: "dark-gray-vector",
    light: "gray-vector",
  },
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
  citizenScienceFields: [
    "site_name", "season_year", "field_date", "current_weather", "water_flow", "water_level",
    "phosphate_ppm", "phosphate_qa", "ecoli_cfu", "ecoli_qa",
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
