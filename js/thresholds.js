// =====================================================================
// THRESHOLDS
// Loads the thresholds for each citizen science metric (phosphate,
// E. coli) from data/thresholds.json - a file in this repo that can be
// edited on GitHub without touching any code (see README, "Thresholds").
// config.js turns the result into METRICS, which the maps, legends,
// league table and charts all read.
//
// The file is checked as it's loaded. A mistake (a missing comma, bands
// out of order, a colour that isn't a colour) stops the dashboard with a
// message saying what's wrong - in the page in a browser, in the terminal
// for the scripts - rather than quietly drawing wrong bands. Run
// `npm run check:thresholds` before committing a change to catch it first.
// =====================================================================

const FILE = new URL("../data/thresholds.json", import.meta.url);
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

// Reads the file: fetched in the browser (always revalidated, so an edit
// shows up as soon as it's deployed), from disk in the scripts.
async function readFile() {
  if (typeof window === "undefined") {
    const { readFile: read } = await import("node:fs/promises");
    return JSON.parse(await read(FILE, "utf8"));
  }
  const response = await fetch(FILE, { cache: "no-cache" });
  if (!response.ok) throw new Error(`data/thresholds.json couldn't be loaded (HTTP ${response.status}).`);
  return response.json();
}

// Throws an Error saying what's wrong, or returns the metrics (every
// entry that isn't the "_about" note).
export function validateThresholds(json) {
  const problems = [];
  const metrics = Object.fromEntries(Object.entries(json).filter(([key]) => !key.startsWith("_")));
  if (!Object.keys(metrics).length) problems.push("no metrics found");

  for (const [name, metric] of Object.entries(metrics)) {
    const at = (text) => problems.push(`${name}: ${text}`);
    for (const field of ["label", "field", "unit"]) {
      if (typeof metric[field] !== "string" || !metric[field]) at(`"${field}" must be some text`);
    }
    if (!Number.isInteger(metric.decimals) || metric.decimals < 0) at(`"decimals" must be a whole number, 0 or more`);
    if (metric.chartMax != null && !(metric.chartMax > 0)) at(`"chartMax" must be a number above 0`);
    if (!Array.isArray(metric.bands) || metric.bands.length < 2) {
      at(`"bands" needs at least two bands`);
      continue;
    }
    const keys = new Set();
    metric.bands.forEach((band, i) => {
      const last = i === metric.bands.length - 1;
      const where = `band ${i + 1}${band.label ? ` ("${band.label}")` : ""}`;
      if (typeof band.key !== "string" || !band.key) at(`${where}: needs a "key"`);
      else if (keys.has(band.key)) at(`${where}: "key" ${band.key} is used twice`);
      else keys.add(band.key);
      if (typeof band.label !== "string" || !band.label) at(`${where}: needs a "label"`);
      if (typeof band.color !== "string" || !HEX_COLOUR.test(band.color)) at(`${where}: "color" must be like #0072b0`);
      if (last) {
        if (band.max != null) at(`${where}: the last band must not have a "max" (it catches everything above)`);
      } else if (typeof band.max !== "number" || Number.isNaN(band.max)) {
        at(`${where}: needs a numeric "max"`);
      } else if (i > 0 && band.max <= metric.bands[i - 1].max) {
        at(`${where}: "max" (${band.max}) must be higher than the band before (${metric.bands[i - 1].max})`);
      }
    });
  }
  if (problems.length) throw new Error(`data/thresholds.json has a problem:\n- ${problems.join("\n- ")}`);
  return metrics;
}

// Loads and checks the file. In a browser a failure is also shown in the
// page, since nothing else will start.
export async function loadThresholds() {
  try {
    return validateThresholds(await readFile());
  } catch (error) {
    const message = error instanceof SyntaxError
      ? `data/thresholds.json isn't valid JSON (${error.message}). Look for a missing or extra comma, bracket or quote.`
      : error.message;
    if (typeof document !== "undefined") {
      const banner = document.createElement("pre");
      banner.setAttribute("role", "alert");
      banner.style.cssText = "margin:0;padding:12px 16px;background:#7a1c14;color:#fff;font:13px/1.4 sans-serif;white-space:pre-wrap";
      banner.textContent = `The dashboard can't start: ${message}`;
      (document.body ?? document.documentElement).prepend(banner);
    }
    throw new Error(message);
  }
}
