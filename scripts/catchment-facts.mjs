// =====================================================================
// CATCHMENT FACTS
// Step 1 of the catchment summaries (see README, "Catchment summaries").
// Reads the AQuA sites and citizen science records from the feature
// service and works out, for every catchment and season, the numbers a
// summary may talk about: how many sites were surveyed, phosphate and
// E. coli readings and their bands, and any pollution notes volunteers
// recorded. The bands come from js/config.js, the same thresholds the
// dashboard draws.
//
//   node scripts/catchment-facts.mjs
//
// Writes data/catchment-facts.json. No API key needed. The summaries are
// then written from these facts by scripts/generate-catchment-summaries.mjs
// - the model is only given what's in this file, so every number in a
// summary can be traced to it.
// =====================================================================

import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AQUA, METRICS, METALS } from "../js/config.js";
import { classify } from "../js/metrics.js";

const OUTPUT = new URL("../data/catchment-facts.json", import.meta.url);
const NOTE_LIMIT = 8; // pollution notes passed on per catchment
const NOTE_LENGTH = 240;

async function queryAll(url, outFields) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const body = new URLSearchParams({
      f: "json", where: "1=1", outFields, returnGeometry: "false",
      orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: "1000",
    });
    const json = await (await fetch(`${url}/query`, { method: "POST", body })).json();
    if (json.error) throw new Error(`${url}: ${json.error.message}`);
    rows.push(...json.features.map((f) => f.attributes));
    if (!json.exceededTransferLimit && json.features.length < 1000) return rows;
  }
}

// A volunteer answering "None identified" is an answer, not a note.
const hasRealNote = (text) => !!text?.trim() && !/^(none|no|nothing|n\/a|na)( (identified|observed|noted|seen))?\.?$/i.test(text.trim());

const unique = (values) => [...new Set(values.filter((v) => v != null && v !== ""))].sort((a, b) => a.localeCompare(b, "en-GB"));
const round = (value, decimals) => (value == null ? null : Number(value.toFixed(decimals)));

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// One metric over a catchment's surveys: how many readings, their spread
// and how many fall in each band.
function metricFacts(metricKey, surveys) {
  const metric = METRICS[metricKey];
  const readings = surveys.filter((s) => s[metric.field] != null);
  const values = readings.map((s) => Number(s[metric.field]));
  const bands = Object.fromEntries(metric.bands.map((b) => [b.label, 0]));
  for (const s of readings) bands[classify(metricKey, s[metric.field]).label] += 1;
  const sorted = readings.slice().sort((a, b) => a[metric.field] - b[metric.field]);
  const point = (s) => ({ site: s.site_name, river: s.river, value: round(Number(s[metric.field]), metric.decimals) });
  return {
    unit: metric.unit,
    readings: readings.length,
    lowest: sorted.length ? point(sorted[0]) : null,
    highest: sorted.length ? point(sorted.at(-1)) : null,
    median: round(median(values), metric.decimals + 1),
    bands,
  };
}

// A catchment's lab metals results. The metals table has one set of
// results per site and no season, so these don't vary by season. A metal
// is "detected" at a site when it has a value, "below the limit of
// detection" when the lab flagged it. There are no agreed thresholds, so
// the facts are only counts and where the highest value was found.
function metalsFacts(sampled, catchmentSites) {
  if (!sampled.length) return null;
  const metal = (m) => {
    const detected = sampled.filter((r) => r[m.key] != null);
    const belowLod = sampled.filter((r) => r[m.key] == null && r[`${m.key}${METALS.lodSuffix}`] === METALS.lodFlag);
    const top = detected.slice().sort((a, b) => b[m.key] - a[m.key])[0];
    return {
      metal: m.label,
      detectedAtSites: detected.length,
      belowLimitOfDetectionAtSites: belowLod.length,
      highest: top ? { site: top.site_name, river: top.river, value: Number(Number(top[m.key]).toPrecision(2)) } : null,
    };
  };
  const all = METALS.list.map(metal);
  return {
    sitesSampled: sampled.length,
    sitesInCatchment: catchmentSites.length,
    metalsMeasured: METALS.list.length,
    focusMetals: all.filter((m) => METALS.list.some((l) => l.label === m.metal && METALS.focus.includes(l.key))),
    detectedAtEverySampledSite: all.filter((m) => m.detectedAtSites === sampled.length).map((m) => m.metal),
    neverDetected: all.filter((m) => m.detectedAtSites === 0).map((m) => m.metal),
  };
}

const [sites, records, metalRows] = await Promise.all([
  queryAll(AQUA.sitesUrl, "site_name,Catchment,River_Waterbody,case_study_group"),
  queryAll(AQUA.citizenScienceUrl, "site_name,season_year,field_date,water_flow,pollution_sources_combined,phosphate_ppm,ecoli_cfu"),
  queryAll(AQUA.metalsUrl, "*"),
]);

const siteByName = new Map(sites.map((s) => [s.site_name, s]));
const seasons = unique(records.map((r) => r[AQUA.seasonField]));
const catchments = unique(sites.map((s) => s.Catchment));

const facts = {
  generatedAt: new Date().toISOString(),
  seasons,
  // Changes whenever data/thresholds.json does, so the summaries written
  // under the old thresholds can be told apart (and rewritten).
  thresholdsHash: createHash("sha256").update(JSON.stringify(METRICS)).digest("hex").slice(0, 16),
  thresholds: {
    ...Object.fromEntries(Object.entries(METRICS).map(([key, metric]) => [
      key,
      { unit: metric.unit, bands: metric.bands.map((b) => ({ band: b.label, upTo: b.max ?? null })) },
    ])),
  },
  catchments: {},
};

for (const catchment of catchments) {
  const catchmentSites = sites.filter((s) => s.Catchment === catchment);
  facts.catchments[catchment] = {
    sites: catchmentSites.length,
    rivers: unique(catchmentSites.map((s) => s.River_Waterbody)),
    groups: unique(catchmentSites.map((s) => s.case_study_group)),
    metals: metalsFacts(
      metalRows
        .filter((r) => siteByName.get(r.site_name)?.Catchment === catchment)
        .map((r) => ({ ...r, river: siteByName.get(r.site_name).River_Waterbody })),
      catchmentSites
    ),
    seasons: {},
  };
  for (const season of seasons) {
    const surveys = records
      .filter((r) => r[AQUA.seasonField] === season && siteByName.get(r.site_name)?.Catchment === catchment)
      .map((r) => ({ ...r, river: siteByName.get(r.site_name).River_Waterbody }));
    if (!surveys.length) continue;
    const notes = surveys
      .filter((s) => hasRealNote(s.pollution_sources_combined))
      .slice(0, NOTE_LIMIT)
      .map((s) => ({ site: s.site_name, note: s.pollution_sources_combined.trim().slice(0, NOTE_LENGTH) }));
    facts.catchments[catchment].seasons[season] = {
      sitesSurveyed: new Set(surveys.map((s) => s.site_name)).size,
      surveys: surveys.length,
      surveyDates: unique(surveys.map((s) => s.field_date && new Date(s.field_date).toISOString().slice(0, 10))),
      phosphate: metricFacts("phosphate", surveys),
      ecoli: metricFacts("ecoli", surveys),
      volunteerNotes: notes,
    };
  }
}

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(facts, null, 2)}\n`);
const withData = Object.values(facts.catchments).filter((c) => Object.keys(c.seasons).length).length;
console.log(`Wrote ${OUTPUT.pathname}: ${catchments.length} catchments (${withData} with surveys), seasons ${seasons.join(", ") || "none"}.`);
