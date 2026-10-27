// =====================================================================
// DOWNSTREAM CHART
// One catchment's sites in upstream -> downstream order (x) against a
// reading (y), drawn as plain SVG. Single series, so no legend box - the
// chart title names it. Marks follow the dataviz rules: 2px line, 10px
// points with a 2px surface ring, hairline grid, band washes at ~10%
// opacity. A site with no reading leaves a gap in the line rather than
// being drawn as zero; a below-limit-of-detection result is a hollow
// ring on the baseline. Every point has a 24px+ hit column with a
// hover/focus tooltip, and the same values are in a data table below.
// =====================================================================

import { escapeHtml } from "../utils/format.js";
import { valueText, ariaLabel, showTooltip } from "./chart-common.js";

const HEIGHT = 240;
const MARGIN = { top: 12, right: 16, bottom: 64, left: 56 };
const POINT_R = 5;

// points: [{ site, river, description, value, state: "value"|"belowLod"|"none",
//            color, bandLabel }] in downstream order.
// bands: optional [{ from, to, color, label }] background washes.
// formatValue: number -> string. tooltipEl: shared tooltip element.
export function renderDownstreamChart(containerEl, { title, subtitle, unit, points, bands = [], formatValue, tooltipEl }) {
  const width = Math.max(360, containerEl.clientWidth || 600);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const values = points.filter((p) => p.state === "value").map((p) => p.value);
  const yMax = niceCeil(Math.max(...values, 0) * 1.05 || 1);
  const ticks = niceTicks(yMax);
  const top = ticks[ticks.length - 1];
  const y = (v) => MARGIN.top + plotH - (Math.min(v, top) / top) * plotH;
  const step = plotW / Math.max(points.length, 1);
  const x = (i) => MARGIN.left + step * (i + 0.5);

  // Band washes, clipped to the axis range.
  const washes = bands
    .filter((b) => b.from < top)
    .map((b) => {
      const y1 = y(Math.min(b.to ?? top, top));
      const y2 = y(b.from);
      return `<rect x="${MARGIN.left}" y="${y1}" width="${plotW}" height="${Math.max(0, y2 - y1)}" fill="${b.color}" opacity="0.1"><title>${escapeHtml(b.label)}</title></rect>`;
    })
    .join("");

  const grid = ticks
    .map((t) => `
      <line class="chartGrid" x1="${MARGIN.left}" x2="${MARGIN.left + plotW}" y1="${y(t)}" y2="${y(t)}" />
      <text class="chartTick" x="${MARGIN.left - 8}" y="${y(t)}" text-anchor="end" dominant-baseline="middle">${escapeHtml(formatValue(t))}</text>`)
    .join("");

  // Line segments between consecutive sites that both have a value - a
  // missing or below-LOD site breaks the line.
  const segments = [];
  let current = [];
  points.forEach((p, i) => {
    if (p.state === "value") current.push(`${x(i)},${y(p.value)}`);
    else { if (current.length > 1) segments.push(current); current = []; }
  });
  if (current.length > 1) segments.push(current);
  const lines = segments.map((s) => `<polyline class="chartLine" points="${s.join(" ")}" />`).join("");

  const marks = points
    .map((p, i) => {
      if (p.state === "value") {
        return `<circle class="chartPoint" cx="${x(i)}" cy="${y(p.value)}" r="${POINT_R}" fill="${p.color}" />`;
      }
      if (p.state === "belowLod") {
        // Inline style: the .chartPoint surface-ring stroke would win over
        // a stroke attribute.
        return `<circle class="chartPoint chartPoint--lod" cx="${x(i)}" cy="${y(0)}" r="${POINT_R}" style="stroke:${p.color}" />`;
      }
      return "";
    })
    .join("");

  const xLabels = points
    .map((p, i) => `<text class="chartTick chartTick--x" transform="translate(${x(i)},${MARGIN.top + plotH + 10}) rotate(-45)" text-anchor="end">${escapeHtml(p.site)}</text>`)
    .join("");

  // Hit columns: the whole width of each site's slot, full plot height.
  const hits = points
    .map((p, i) => `<rect class="chartHit" data-i="${i}" x="${x(i) - step / 2}" y="${MARGIN.top}" width="${Math.max(step, 24)}" height="${plotH}" tabindex="0" role="img" aria-label="${escapeHtml(ariaLabel(p, unit, formatValue))}" />`)
    .join("");

  const tableRows = points
    .map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(p.site)}</td><td>${escapeHtml(p.river ?? "")}</td><td class="leagueColNum">${escapeHtml(valueText(p, unit, formatValue))}</td><td>${escapeHtml(p.bandLabel ?? "")}</td></tr>`)
    .join("");

  containerEl.innerHTML = `
    <figure class="chartFigure">
      <figcaption class="chartCaption">
        <span class="chartTitle">${escapeHtml(title)}</span>
        <span class="chartSubtitle">${escapeHtml(subtitle)}</span>
      </figcaption>
      <svg class="chartSvg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="group" aria-label="${escapeHtml(`${title}: ${subtitle}`)}">
        ${washes}
        ${grid}
        <line class="chartAxis" x1="${MARGIN.left}" x2="${MARGIN.left + plotW}" y1="${y(0)}" y2="${y(0)}" />
        <text class="chartAxisLabel" transform="translate(14,${MARGIN.top + plotH / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(unit)}</text>
        ${lines}
        <line class="chartCrosshair" y1="${MARGIN.top}" y2="${MARGIN.top + plotH}" visibility="hidden" />
        ${marks}
        ${xLabels}
        ${hits}
      </svg>
      <details class="chartTable">
        <summary>Data table</summary>
        <div class="tableScroll">
          <table class="leagueTable">
            <thead><tr><th>Order</th><th>Site</th><th>River / waterbody</th><th class="leagueColNum">Reading</th><th>Band</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </details>
    </figure>`;

  // Tooltip + crosshair on hover/focus of a site's column.
  const svg = containerEl.querySelector("svg");
  const crosshair = svg.querySelector(".chartCrosshair");
  const show = (rect) => {
    const i = Number(rect.dataset.i);
    const p = points[i];
    crosshair.setAttribute("x1", x(i));
    crosshair.setAttribute("x2", x(i));
    crosshair.setAttribute("visibility", "visible");
    showTooltip(tooltipEl, rect, p, unit, formatValue);
  };
  const hide = () => {
    crosshair.setAttribute("visibility", "hidden");
    tooltipEl.hidden = true;
  };
  svg.querySelectorAll(".chartHit").forEach((rect) => {
    rect.addEventListener("pointerenter", () => show(rect));
    rect.addEventListener("focus", () => show(rect));
    rect.addEventListener("pointerleave", hide);
    rect.addEventListener("blur", hide);
  });
}

// ---- axis helpers --------------------------------------------------

function niceStep(raw) {
  const exp = Math.floor(Math.log10(raw));
  const f = raw / 10 ** exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function niceCeil(v) {
  const step = niceStep(v / 4);
  return Math.ceil(v / step) * step;
}

function niceTicks(max) {
  const step = niceStep(max / 4);
  const ticks = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}
