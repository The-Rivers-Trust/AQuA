// =====================================================================
// RIVER SCHEMATIC
// A catchment drawn like a metro map from a river tree (built by
// js/data/river-topology.js): the main river as a horizontal line flowing
// left (upstream) to right (downstream), each tributary a branch bending
// in at 45 degrees to where it joins - and tributaries of tributaries
// branching off those, further out. Sites are the stations, coloured by
// the reading's band. A branch whose position is estimated (its river
// isn't on the network) is dashed.
//
// Branches off the main line alternate above / below it; nested ones stay
// on their parent's side, one level further out, stepping out again if
// they'd overlap something already drawn there. Lines are neutral and
// named in text - the stations are the only coloured (data) marks.
// =====================================================================

import { escapeHtml } from "../utils/format.js";
import { ariaLabel, showTooltip } from "./chart-common.js";

const STEP = 56; // gap between neighbouring stations / junctions
const ROW = 56; // vertical gap per branch level (also the 45-degree run)
const STATION_R = 7;
const PAD = 24;
const CHAR_W = 6.6; // rough label width per character at 12px
const LABEL_GAP = STATION_R + 10;

// tree: { river, approx, items: [{ kind: "station", site } | { kind: "junction", line }] }
// pointsBySite: site_name -> chart point (see chart-common.js).
export function renderRiverSchematic(containerEl, { title, subtitle, unit, tree, pointsBySite, formatValue, tooltipEl }) {
  const layout = layoutTree(tree);

  const minX = Math.min(...layout.spans.map((s) => s[0]));
  const maxX = Math.max(...layout.spans.map((s) => s[1]));
  const dx = PAD - minX;
  const mainY = PAD + 20 + layout.levels[-1] * ROW;
  const height = mainY + layout.levels[1] * ROW + 44 + PAD;
  const width = maxX - minX + PAD * 2 + 90; // + the "Downstream" label
  const X = (x) => x + dx;
  const Y = (side, level) => mainY + side * level * ROW;

  const lines = [];
  const junctions = [];
  const labels = [];
  const stations = [];

  for (const ln of layout.lines) {
    const y = Y(ln.side, ln.level);
    const xs = ln.itemXs;
    const dashed = ln.line.approx ? " schemLine--approx" : "";
    if (ln.isMain) {
      lines.push(`<line class="schemLine schemLine--main" x1="${X(xs[0])}" y1="${y}" x2="${X(xs[xs.length - 1])}" y2="${y}" />`);
      labels.push(`<text class="schemFlow" x="${X(xs[xs.length - 1]) + STATION_R + 12}" y="${y}" dominant-baseline="middle">Downstream →</text>`);
    } else {
      const parentY = Y(ln.side, ln.parentLevel);
      lines.push(`<polyline class="schemLine${dashed}" points="${X(xs[0])},${y} ${X(ln.bendX)},${y} ${X(ln.junctionX)},${parentY}" />`);
      junctions.push(`<circle class="schemJunction" cx="${X(ln.junctionX)}" cy="${parentY}" r="4" />`);
    }

    // River name at the start of the line; where the name changes along
    // it (a beck becoming a river, a lake below its feeder), the new name
    // above the line where that stretch begins.
    const stationItems = ln.line.items.map((it, i) => ({ it, x: xs[i] })).filter(({ it }) => it.kind === "station");
    const firstName = lineName(ln.line, ln.parent);
    labels.push(`<text class="schemRiver" x="${X(xs[0]) - LABEL_GAP}" y="${y}" text-anchor="end" dominant-baseline="middle">${escapeHtml(firstName)}${ln.line.approx ? " *" : ""}</text>`);
    stationItems.forEach(({ it, x }, i) => {
      if (i > 0 && it.site.River_Waterbody !== stationItems[i - 1].it.site.River_Waterbody) {
        const labelY = ln.isMain ? y - STATION_R - 12 : y - ln.side * (STATION_R + 12);
        labels.push(`<text class="schemRiver schemRiver--stretch" x="${X(x) - STATION_R}" y="${labelY}" dominant-baseline="middle">${escapeHtml(it.site.River_Waterbody)}</text>`);
      }
      const p = pointsBySite.get(it.site.site_name);
      if (p) stations.push({ p, x: X(x), y, side: ln.isMain ? 1 : ln.side });
    });
  }

  const stationMarks = stations.map(({ p, x, y }) => stationMark(p, x, y)).join("");
  // Site codes: below main-line stations, on the outer side of branches.
  const siteLabels = stations
    .map(({ p, x, y, side }) => `<text class="schemSite" x="${x}" y="${y + side * (STATION_R + 14)}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(p.site)}</text>`)
    .join("");
  const hits = stations
    .map(({ p, x, y }, i) => `<circle class="chartHit schemHit" data-i="${i}" cx="${x}" cy="${y}" r="16" tabindex="0" role="img" aria-label="${escapeHtml(ariaLabel(p, unit, formatValue))}" />`)
    .join("");

  containerEl.innerHTML = `
    <figure class="chartFigure">
      <figcaption class="chartCaption">
        <span class="chartTitle">${escapeHtml(title)}</span>
        <span class="chartSubtitle">${escapeHtml(subtitle)}</span>
      </figcaption>
      <div class="schemScroll">
        <svg class="chartSvg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeHtml(`${title} river diagram: ${subtitle}`)}">
          ${lines.join("")}
          ${junctions.join("")}
          ${labels.join("")}
          ${stationMarks}
          ${siteLabels}
          ${hits}
        </svg>
      </div>
    </figure>`;

  containerEl.querySelectorAll(".schemHit").forEach((hit) => {
    const show = () => showTooltip(tooltipEl, hit, stations[Number(hit.dataset.i)].p, unit, formatValue);
    const hide = () => { tooltipEl.hidden = true; };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("focus", show);
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("blur", hide);
  });
}

function stationMark(p, x, y) {
  if (p.state === "value") return `<circle class="schemStation" cx="${x}" cy="${y}" r="${STATION_R}" style="fill:${p.color}" />`;
  if (p.state === "belowLod") return `<circle class="schemStation schemStation--hollow" cx="${x}" cy="${y}" r="${STATION_R}" style="stroke:${p.color}" />`;
  return `<circle class="schemStation schemStation--none" cx="${x}" cy="${y}" r="${STATION_R}" />`;
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------

// Positions every line. Main line items sit at 0, STEP, 2*STEP, ... left
// to right; a branch's items run leftwards (upstream) from its bend, so
// it ends just before the 45-degree run into its junction.
function layoutTree(tree) {
  const lines = [];
  const occupied = { [-1]: [], [1]: [] }; // side -> [{ level, span }]
  const levels = { [-1]: 0, [1]: 0 };

  const mainXs = tree.items.map((_, i) => i * STEP);
  const mainLabel = labelWidth(firstStationName(tree));
  lines.push({ line: tree, isMain: true, side: 1, level: 0, itemXs: mainXs });
  const spans = [[mainXs[0] - mainLabel - LABEL_GAP, mainXs[mainXs.length - 1]]];

  let nextSide = -1;
  const placeChildren = (line, itemXs, side, level) => {
    line.items.forEach((it, i) => {
      if (it.kind !== "junction") return;
      const childSide = level === 0 ? nextSide : side;
      if (level === 0) nextSide = -nextSide;
      placeBranch(it.line, itemXs[i], childSide, level, line);
    });
  };

  const placeBranch = (line, junctionX, side, parentLevel, parent) => {
    const n = line.items.length;
    const label = labelWidth(lineName(line, parent)) + LABEL_GAP;
    let level = parentLevel + 1;
    let itemXs;
    let bendX;
    let span;
    for (;; level++) {
      bendX = junctionX - (level - parentLevel) * ROW;
      itemXs = line.items.map((_, k) => bendX - STEP / 2 - (n - 1 - k) * STEP);
      span = [itemXs[0] - label, junctionX];
      const clash = occupied[side].some((o) => o.level === level && span[0] < o.span[1] + 12 && o.span[0] < span[1] + 12);
      if (!clash) break;
    }
    occupied[side].push({ level, span });
    levels[side] = Math.max(levels[side], level);
    spans.push(span);
    lines.push({ line, parent, isMain: false, side, level, parentLevel, junctionX, bendX, itemXs });
    placeChildren(line, itemXs, side, level);
  };

  placeChildren(tree, mainXs, 1, 0);
  return { lines, spans, levels };
}

function firstStationName(line) {
  return line.items.find((it) => it.kind === "station")?.site.River_Waterbody ?? line.river;
}

// A branch is named after its first site's river - unless that's the
// same name as the line it joins (a site labelled with the main river's
// name but actually on a tributary), then the river network's own name.
function lineName(line, parent) {
  const name = firstStationName(line);
  if (!parent || name !== lineName(parent, null)) return name;
  return line.items.find((it) => it.kind === "station" && it.networkName)?.networkName ?? name;
}

function labelWidth(text) {
  return (String(text ?? "").length + 2) * CHAR_W;
}
