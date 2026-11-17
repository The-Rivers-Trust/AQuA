// =====================================================================
// CATCHMENT TABLE + COMPARISON (Catchment Explorer tab)
// One row per catchment for the season picked in the header: sites, sites
// tested, tests and average readings. The header's site filters don't
// narrow it: picking a catchment highlights its row instead, and a
// comparison panel shows where that catchment sits among the others
// (average rank, its highest reading, the share of readings in the worst
// bands). Higher is worse for both phosphate and E. coli.
// =====================================================================

import { METRICS } from "../config.js";
import { recordsBySite } from "../data/aqua-service.js";
import { readingsStripHtml } from "../charts/readings-strip.js";
import { escapeHtml, formatNumber } from "../utils/format.js";

const COLUMNS = [
  { field: "catchment", label: "Catchment", type: "text" },
  { field: "sites", label: "Sites", type: "number" },
  { field: "tested", label: "Sites tested", type: "number" },
  { field: "phosphateTests", label: "Phosphate tests", type: "number" },
  { field: "ecoliTests", label: "E. coli tests", type: "number" },
  { field: "phosphateAverage", label: `Average phosphate (${METRICS.phosphate.unit})`, type: "number", decimals: METRICS.phosphate.decimals },
  { field: "ecoliAverage", label: `Average E. coli (${METRICS.ecoli.unit})`, type: "number", decimals: 1 },
];

// Sort state lives here: text A-Z, numbers highest first to begin with.
let sort = { field: "catchment", direction: "asc" };

const byName = (a, b) => a.localeCompare(b, "en-GB", { numeric: true });
const mean = (values) => (values.length ? values.reduce((sum, v) => sum + Number(v), 0) / values.length : null);

// ---------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------

// sites: plain attribute objects for every site; records: citizen science
// records. Every catchment is included (the header filters aren't applied).
export function computeCatchments(sites, records, season) {
  const bySite = recordsBySite(records, season);
  const names = [...new Set(sites.map((s) => s.Catchment).filter(Boolean))];
  return names.map((catchment) => {
    const inCatchment = sites.filter((s) => s.Catchment === catchment);
    const readingsFor = (field) => inCatchment
      // the site's common name (e.g. "Howl Beck"), not its ID (FC06)
      .map((s) => ({ site: s.Description || s.River_Waterbody || s.site_name, value: bySite.get(s.site_name)?.[field] }))
      .filter((r) => r.value != null)
      .map((r) => ({ ...r, value: Number(r.value) }));
    const tested = inCatchment.filter((s) => bySite.has(s.site_name)).length;
    const phosphate = readingsFor(METRICS.phosphate.field);
    const ecoli = readingsFor(METRICS.ecoli.field);
    return {
      catchment,
      sites: inCatchment.length,
      tested,
      phosphateTests: phosphate.length,
      ecoliTests: ecoli.length,
      phosphateAverage: mean(phosphate.map((r) => r.value)),
      ecoliAverage: mean(ecoli.map((r) => r.value)),
      readings: { phosphate, ecoli },
    };
  });
}

// ---------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------

export function catchmentTableHtml(rows, selected) {
  if (!rows.length) return `<p class="muted">No catchments to show.</p>`;
  const { field, direction } = sort;
  const sorted = rows.slice().sort((a, b) => {
    const missingA = a[field] == null;
    const missingB = b[field] == null;
    if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
    const cmp = typeof a[field] === "string" ? byName(a[field], b[field]) : a[field] - b[field];
    return (direction === "asc" ? cmp : -cmp) || byName(a.catchment, b.catchment);
  });

  const header = COLUMNS.map((col) => {
    const active = col.field === field;
    const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
    return `<th data-sort="${col.field}" tabindex="0" role="button" aria-sort="${ariaSort}">${escapeHtml(col.label)}${active ? `<span class="sortArrow" aria-hidden="true">${direction === "asc" ? " ▲" : " ▼"}</span>` : ""}</th>`;
  }).join("");

  const body = sorted.map((row) => {
    const isSelected = row.catchment === selected;
    const cells = COLUMNS.map((col, i) => {
      const value = row[col.field];
      const text = value == null ? "–" : col.decimals != null ? formatNumber(value, col.decimals) : value;
      return i === 0 ? `<th scope="row">${escapeHtml(text)}</th>` : `<td>${escapeHtml(text)}</td>`;
    }).join("");
    return `<tr${isSelected ? ` class="dataRow--selected" aria-current="true"` : ""}>${cells}</tr>`;
  }).join("");

  return `<table class="dataTable dataTable--equal"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

// A header was clicked: a new column starts highest first for numbers and
// A-Z for text; clicking the same column again flips it.
export function sortCatchmentsBy(field) {
  const column = COLUMNS.find((c) => c.field === field);
  if (!column) return;
  sort = sort.field === field
    ? { field, direction: sort.direction === "asc" ? "desc" : "asc" }
    : { field, direction: column.type === "number" ? "desc" : "asc" };
}

// ---------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------

function ordinal(n) {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

// Where a value sits among `allValues`, counting from the highest; ties
// share a rank. null when there is nothing to compare with.
function rankInfo(value, allValues, unitOfThing) {
  const total = allValues.length;
  if (total < 2) return null;
  const above = allValues.filter((v) => v > value).length;
  const same = allValues.filter((v) => v === value).length;
  const rank = above + 1;
  const extreme = rank === 1 ? "highest" : above + same === total ? "lowest" : null;
  return { rank, total, joint: same > 1, extreme, unitOfThing };
}

// The sentence form: "3rd highest average phosphate of 9 catchments".
function rankText(info, what) {
  if (!info) return "";
  const { rank, total, joint, extreme, unitOfThing } = info;
  if (extreme) return `${joint ? "Joint " + extreme : extreme[0].toUpperCase() + extreme.slice(1)} ${what} of all ${total} ${unitOfThing}`;
  return `${joint ? "Joint " : ""}${ordinal(rank)} highest ${what} of ${total} ${unitOfThing}`;
}

// The badge beside a tile's title: "7th highest of 9", coloured by how
// bad the position is (top third red, bottom third green, else amber).
function rankBadge(info) {
  if (!info) return "";
  const { rank, total, joint, extreme } = info;
  const text = extreme
    ? `${joint ? "Joint " : ""}${extreme} of ${total}`
    : `${joint ? "Joint " : ""}${ordinal(rank)} highest of ${total}`;
  const position = (rank - 1) / (total - 1);
  const tone = extreme === "lowest" || position >= 2 / 3 ? "good" : extreme === "highest" || position <= 1 / 3 ? "bad" : "mid";
  return `<span class="rankBadge rankBadge--${tone}">${escapeHtml(text[0].toUpperCase() + text.slice(1))}</span>`;
}

// Index of the band a value falls in (bands run lowest to highest).
function bandIndex(metric, value) {
  const i = metric.bands.findIndex((b) => b.max == null || value <= b.max);
  return i < 0 ? metric.bands.length - 1 : i;
}

// The bands counted as "worst": phosphate High and Very High, E. coli Bad.
function worstBandStart(metric) {
  return Math.max(1, metric.bands.length - 2);
}

function compareMetric(rows, row, key) {
  const metric = METRICS[key];
  const decimals = key === "ecoli" ? 1 : metric.decimals;
  const name = key === "ecoli" ? metric.label : metric.label.toLowerCase();
  const fmt = (v, d = decimals) => `${formatNumber(v, d)} ${metric.unit}`;
  const mine = row.readings[key];
  if (!mine.length) {
    return `<div class="compareCard"><h4>${escapeHtml(metric.label)}</h4><p class="muted">No ${escapeHtml(name)} readings in this catchment for the chosen season.</p></div>`;
  }

  const average = row[`${key}Average`];
  const withData = rows.filter((r) => r[`${key}Average`] != null);
  const allReadings = rows.flatMap((r) => r.readings[key].map((x) => ({ ...x, catchment: r.catchment })));
  const overall = mean(allReadings.map((r) => r.value));

  // Highest reading in the catchment, and where it sits among every reading.
  const top = mine.reduce((best, r) => (r.value > best.value ? r : best), mine[0]);
  const readingValues = allReadings.map((r) => r.value);

  // Share of readings in the worst bands, ranked against the other catchments.
  const start = worstBandStart(metric);
  const worstLabels = metric.bands.slice(start).map((b) => b.label).join(" or ");
  const inWorst = (readings) => readings.filter((r) => bandIndex(metric, r.value) >= start).length;
  const share = (readings) => inWorst(readings) / readings.length;
  const shares = rows.filter((r) => r.readings[key].length).map((r) => share(r.readings[key]));

  // Each tile: title with its rank badge beside it, the figure, a small note.
  const tile = (value, label, info, what, note) => `
    <li class="compareTile">
      <div class="compareHead">
        <span class="compareLabel">${escapeHtml(label)}</span>
        <span title="${escapeHtml(rankText(info, what))}">${rankBadge(info)}</span>
      </div>
      <span class="compareValue">${value}</span>
      ${note ? `<span class="compareNote">${escapeHtml(note)}</span>` : ""}
    </li>`;

  return `
    <div class="compareCard">
      <h4>${escapeHtml(metric.label)}</h4>
      <ul class="compareList">
        ${tile(escapeHtml(fmt(average)), "Average reading",
          rankInfo(average, withData.map((r) => r[`${key}Average`]), "catchments"), `average ${name}`,
          `Ranked against ${withData.length} catchments · all-site average ${fmt(overall)}`)}
        ${tile(escapeHtml(fmt(top.value, metric.decimals)), `Highest reading · ${top.site}`,
          rankInfo(top.value, readingValues, "readings"), `${name} reading`,
          `Ranked against all ${readingValues.length} readings`)}
        ${tile(`${inWorst(mine)} of ${mine.length} <small>(${Math.round(share(mine) * 100)}%)</small>`, `Readings in ${worstLabels}`,
          rankInfo(share(mine), shares, "catchments"), "share of readings in these bands",
          `Ranked against ${shares.length} catchments`)}
      </ul>
      ${readingsStripHtml({ rows, key, metric, selected: row.catchment, log: key === "ecoli" })}
    </div>`;
}

// The panel above the table. `selected` is the catchment picked in the
// header (null when none is).
export function comparisonHtml(rows, selected) {
  if (!selected) {
    return "";
  }
  const row = rows.find((r) => r.catchment === selected);
  if (!row) return "";
  return `
    <section class="compare" aria-label="How the ${escapeHtml(selected)} Catchment compares">
      <h3>How the ${escapeHtml(selected)} Catchment compares</h3>
      <div class="compareGrid">
        ${compareMetric(rows, row, "phosphate")}
        ${compareMetric(rows, row, "ecoli")}
      </div>
    </section>`;
}
