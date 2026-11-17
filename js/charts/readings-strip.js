// =====================================================================
// READINGS STRIP CHART (Catchment Explorer tab)
// Every reading of one metric, one row per catchment, so a catchment's
// spread can be seen against all the others: the picked catchment's rows
// and dots are highlighted, the rest are muted. A tick marks each
// catchment's average and dashed lines mark the band limits. E. coli
// readings run from 0 to hundreds, so that axis is log-style (log10 of
// 1 + the reading). Plain SVG, no library.
// =====================================================================

import { escapeHtml, formatNumber } from "../utils/format.js";

const WIDTH = 480;
const ROW = 24;
const LABEL_W = 100;
const PAD_RIGHT = 14;
const PAD_TOP = 6;
const AXIS_H = 30;

// rows: [{ catchment, readings: { [key]: [{ site, value }] }, [`${key}Average`] }]
// metric: the METRICS entry; selected: catchment name or null.
export function readingsStripHtml({ rows, key, metric, selected, log = false }) {
  // Highest average at the top.
  const ordered = rows
    .filter((r) => r.readings[key].length)
    .sort((a, b) => b[`${key}Average`] - a[`${key}Average`]);
  if (!ordered.length) return "";

  const all = ordered.flatMap((r) => r.readings[key].map((x) => x.value));
  const maxValue = Math.max(...all);
  const t = (v) => (log ? Math.log10(1 + v) : v);
  const tMax = t(maxValue) * 1.06 || 1;
  const x0 = LABEL_W;
  const x1 = WIDTH - PAD_RIGHT;
  const x = (v) => x0 + (t(v) / tMax) * (x1 - x0);

  const height = PAD_TOP + ordered.length * ROW + AXIS_H;
  const plotBottom = PAD_TOP + ordered.length * ROW;

  // Axis ticks: 0, 1, 10, 100... for the log axis; round steps otherwise.
  let ticks;
  if (log) {
    ticks = [0, 1, 10, 100, 1000, 10000].filter((v) => t(v) <= tMax);
  } else {
    const step = maxValue > 5 ? 1 : maxValue > 2 ? 0.5 : 0.25;
    ticks = [];
    for (let v = 0; v <= maxValue + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));
  }
  const fmtTick = (v) => formatNumber(v, log || Number.isInteger(v) ? 0 : v * 100 % 10 ? 2 : 1);

  const limits = metric.bands
    .filter((b) => b.max != null)
    .map((b) => (metric.decimals === 0 ? b.max + 0.5 : b.max))
    .filter((v) => t(v) < tMax);

  const grid = ticks.map((v) => `<line class="stripGrid" x1="${x(v)}" x2="${x(v)}" y1="${PAD_TOP}" y2="${plotBottom}"/>
      <text class="stripTick" x="${x(v)}" y="${plotBottom + 14}" text-anchor="middle">${fmtTick(v)}</text>`).join("");
  const limitLines = limits.map((v) => `<line class="stripLimit" x1="${x(v)}" x2="${x(v)}" y1="${PAD_TOP}" y2="${plotBottom}"/>`).join("");

  const rowsSvg = ordered.map((row, i) => {
    const top = PAD_TOP + i * ROW;
    const mid = top + ROW / 2;
    const isSelected = row.catchment === selected;
    const dots = row.readings[key].map((r, j) => {
      const jitter = (((i * 31 + j * 17) % 11) - 5) / 5 * (ROW * 0.27); // spreads overlapping dots, same every draw
      const label = `${r.site} (${row.catchment}): ${formatNumber(r.value, metric.decimals)} ${metric.unit}`;
      return `<circle class="stripDot${isSelected ? " stripDot--sel" : ""}" cx="${x(r.value).toFixed(1)}" cy="${(mid + jitter).toFixed(1)}" r="${isSelected ? 4.5 : 3}"><title>${escapeHtml(label)}</title></circle>`;
    }).join("");
    const avg = row[`${key}Average`];
    return `
      <g class="stripRow${isSelected ? " stripRow--sel" : ""}">
        ${isSelected ? `<rect class="stripBand" x="0" y="${top}" width="${WIDTH}" height="${ROW}" rx="3"/>` : ""}
        <text class="stripName" x="${LABEL_W - 8}" y="${mid + 4}" text-anchor="end">${escapeHtml(row.catchment)}</text>
        ${dots}
        <line class="stripAvg" x1="${x(avg).toFixed(1)}" x2="${x(avg).toFixed(1)}" y1="${mid - 9}" y2="${mid + 9}"><title>${escapeHtml(`${row.catchment} average: ${formatNumber(avg, key === "ecoli" ? 1 : metric.decimals)} ${metric.unit}`)}</title></line>
      </g>`;
  }).join("");

  const summary = `${metric.label} readings for every catchment${selected ? `, with the ${selected} Catchment highlighted` : ""}`;
  return `
    <figure class="readingsStrip">
      <figcaption>Every ${escapeHtml(metric.label)} reading <span class="muted">(${escapeHtml(metric.unit)}${log ? ", log scale" : ""})</span></figcaption>
      <svg viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeHtml(summary)}">
        ${grid}${limitLines}${rowsSvg}
      </svg>
      <p class="stripKey">
        <span><i class="stripKeyDot stripKeyDot--sel"></i>${selected ? `${escapeHtml(selected)} Catchment` : "Picked catchment"}</span>
        <span><i class="stripKeyDot"></i>Other catchments</span>
        <span><i class="stripKeyAvg"></i>Catchment average</span>
        <span><i class="stripKeyLimit"></i>Band limit</span>
      </p>
    </figure>`;
}
