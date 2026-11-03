// =====================================================================
// SEASON BARS
// One site's readings of one metric (phosphate, E. coli) over its
// surveys, as bars over the metric's threshold bands - the same
// thresholds as the NRS dashboard's scorecard bar charts, drawn in a
// lighter style: soft tinted band stripes inside a rounded plot, hairline
// threshold lines, and slim rounded bars coloured by the band their
// reading falls in (so a bar reads the same as the map and the reading
// cards). The y-axis is fixed rather than fitted to the data, so the bands
// keep their true proportions: it tops out at the next threshold above the
// data (METRICS[x].chartMax instead where set - a bar above it is clipped
// and its label carries a ▲). A survey with no reading has no bar.
//
// It's a picture of the history, and only interactive when asked to be:
// with `onBarClick` (see createSeasonBars) the bars of surveys it accepts
// can be clicked - the E. coli chart uses it to open that survey's plate
// photo. The survey the browser beside it is showing is drawn at full
// strength (the others a little softer) and its label is emphasised; the
// charts redraw when the survey view (js/data/surveys.js) changes.
// =====================================================================

import { METRICS } from "../config.js";
import { classify } from "../metrics.js";
import { formatDate, formatNumber, formatSeason } from "../utils/format.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEIGHT = 132;
const MARGIN = { left: 34, right: 4, top: 18, bottom: 20 };
const BAND_OPACITY = 0.13;
const LINE_OPACITY = 0.4;
const MAX_BAR = 28;
const BAR_RADIUS = 5;
const MIN_BAR = 3; // so a zero reading is still a visible stub
const LABEL_WIDTH = 74; // room a full label ("Summer 2026") needs under its bar
const SHORT_LABEL_WIDTH = 42; // ...and a short one ("Sum 26")

let chartCount = 0; // gives each chart's clip path its own id

// Where each band ends on the axis (the last band has no end). A count's
// inclusive "max: 9" really ends at 10, between 9 and 10 cfu.
function boundaries(metric) {
  const step = metric.decimals === 0 ? 1 : 0;
  return metric.bands.filter((b) => b.max != null).map((b) => b.max + step);
}

function axisMax(metric, dataMax) {
  if (metric.chartMax) return metric.chartMax;
  const bounds = boundaries(metric);
  const next = bounds.find((t) => t >= dataMax);
  return (next ?? Math.max(dataMax, bounds.at(-1)) * 1.15) * 1.08;
}

const tickText = (v) => String(Number(v.toFixed(2)));

// A bar with only its top corners rounded (it grows from a flat baseline).
function barPath(x, top, width, bottom) {
  const r = Math.min(BAR_RADIUS, width / 2, bottom - top);
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${bottom} Z`;
}

// Each survey's label under its bar: its season - or its date, when a
// season has more than one survey. `short` is for when bars are close.
function barLabels(surveys) {
  const perSeason = new Map();
  surveys.forEach((s) => perSeason.set(s.season_year, (perSeason.get(s.season_year) ?? 0) + 1));
  return surveys.map((s) => {
    if (perSeason.get(s.season_year) > 1 && s.field_date) {
      const full = formatDate(s.field_date);
      return { full, short: full.replace(/ \d{4}$/, "") };
    }
    const full = formatSeason(s.season_year) || "–";
    const m = full.match(/^(\S+) (\d{4})$/);
    return { full, short: m ? `${m[1].slice(0, 3)} ${m[2].slice(2)}` : full };
  });
}

const svgEl = (tag, attrs = {}, text) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
};

// Returns the chart's element. It draws itself once it's in the page (so
// it can size to its space) and again when that space changes.
// onBarClick (optional): { enabled(survey) -> boolean, open(survey),
// label } - a survey's whole column (not just its slim bar) becomes a
// button when enabled(survey) is true; label says what it opens.
export function createSeasonBars({ metricKey, view, onBarClick }) {
  const metric = METRICS[metricKey];
  const clipId = `seasonBars${++chartCount}`;
  const card = document.createElement("div");
  card.className = "barChart";
  const title = document.createElement("div");
  title.className = "barChartTitle";
  const unit = document.createElement("span");
  unit.className = "barChartUnit";
  unit.textContent = metric.unit;
  title.append(metric.label, unit);
  const svg = svgEl("svg", { class: "barChartSvg", role: "img" });
  card.append(title, svg);

  const values = view.surveys.map((s) => (s[metric.field] == null ? null : Number(s[metric.field])));
  const names = barLabels(view.surveys);

  // Screen readers get the readings rather than the picture.
  svg.setAttribute("aria-label", `${metric.label} (${metric.unit}) by survey: ${view.surveys
    .map((s, i) => `${names[i].full} ${values[i] == null ? "no reading" : formatNumber(values[i], metric.decimals)}`)
    .join("; ")}`);

  function draw() {
    const width = Math.round(svg.getBoundingClientRect().width);
    if (width < 120) return; // not laid out yet
    svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
    svg.replaceChildren();

    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const dataMax = Math.max(0, ...values.filter((v) => v != null));
    const yMax = axisMax(metric, dataMax);
    const y = (v) => MARGIN.top + plotH - (Math.min(v, yMax) / yMax) * plotH;
    const y0 = y(0);
    const slot = plotW / view.surveys.length;
    const x = (i) => MARGIN.left + slot * (i + 0.5);

    // The plot is a rounded panel; the band stripes are clipped to it.
    const clip = svgEl("clipPath", { id: clipId });
    clip.append(svgEl("rect", { x: MARGIN.left, y: MARGIN.top, width: plotW, height: plotH, rx: 8 }));
    const stripes = svgEl("g", { "clip-path": `url(#${clipId})` });
    const bounds = boundaries(metric);
    let lower = 0;
    metric.bands.forEach((band, i) => {
      const top = Math.min(i < bounds.length ? bounds[i] : Infinity, yMax);
      if (top > lower) {
        stripes.append(svgEl("rect", { x: MARGIN.left, y: y(top), width: plotW, height: y(lower) - y(top), fill: band.color, "fill-opacity": BAND_OPACITY }));
      }
      lower = top;
    });
    svg.append(clip, stripes);

    // Hairlines where one band becomes the next, and y labels at 0 and each
    // threshold (skipping any too close to the last).
    const ticks = [0];
    metric.bands.forEach((band, i) => {
      if (i >= bounds.length || bounds[i] >= yMax) return;
      svg.append(svgEl("line", { x1: MARGIN.left, x2: width - MARGIN.right, y1: y(bounds[i]), y2: y(bounds[i]), stroke: band.color, "stroke-width": 1, "stroke-opacity": LINE_OPACITY }));
      ticks.push(bounds[i]);
    });
    let lastY = Infinity;
    for (const t of ticks) {
      if (Math.abs(lastY - y(t)) < 8.5) continue;
      lastY = y(t);
      svg.append(svgEl("text", { x: MARGIN.left - 7, y: y(t) + 3, "text-anchor": "end", class: "barTick" }, tickText(t)));
    }

    // Bars, value labels, x labels.
    const barW = Math.min(slot * 0.55, MAX_BAR);
    const useShort = slot < LABEL_WIDTH;
    const labelEvery = Math.max(1, Math.ceil((useShort ? SHORT_LABEL_WIDTH : LABEL_WIDTH) / slot));
    const several = view.surveys.length > 1;
    // A clickable survey: a transparent button over its column, so a
    // slim bar (or the "–" of a missing reading) is easy to hit.
    // Only the bar itself lights up (on hover, or keyboard focus).
    function addHit(survey, i, summary, bar = null) {
      if (!onBarClick?.enabled(survey)) return;
      const hit = svgEl("rect", {
        x: x(i) - slot / 2, y: MARGIN.top, width: slot, height: plotH + 1,
        class: "barHit", role: "button", tabindex: 0, "aria-label": `${onBarClick.label}: ${summary}`,
      });
      hit.append(svgEl("title", {}, `${summary} - click to ${onBarClick.label.toLowerCase()}`));
      hit.addEventListener("click", () => onBarClick.open(survey));
      if (bar) {
        const light = (on) => bar.classList.toggle("barFill--hover", on);
        hit.addEventListener("mouseenter", () => light(true));
        hit.addEventListener("mouseleave", () => light(false));
        hit.addEventListener("focus", () => light(hit.matches(":focus-visible")));
        hit.addEventListener("blur", () => light(false));
      }
      hit.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onBarClick.open(survey);
        }
      });
      svg.append(hit);
    }

    view.surveys.forEach((survey, i) => {
      const v = values[i];
      const current = i === view.index;
      const reading = v == null ? "no reading" : `${formatNumber(v, metric.decimals)} ${metric.unit}`;
      const summary = `${names[i].full}${survey.field_date ? `, ${formatDate(survey.field_date)}` : ""}: ${reading}`;

      if (v != null) {
        const top = Math.min(y(v), y0 - MIN_BAR);
        const band = classify(metricKey, v);
        const bar = svgEl("path", {
          d: barPath(x(i) - barW / 2, top, barW, y0),
          fill: band.color,
          class: several && !current ? "barFill barFill--soft" : "barFill",
        });
        bar.append(svgEl("title", {}, `${summary} (${band.label})`));
        svg.append(bar);
        addHit(survey, i, summary, bar);
        if (slot >= 34 || current) {
          svg.append(svgEl("text", { x: x(i), y: top - 5, "text-anchor": "middle", class: current ? "barValue barValue--current" : "barValue" }, `${formatNumber(v, metric.decimals)}${v > yMax ? " ▲" : ""}`));
        }
      } else {
        const none = svgEl("text", { x: x(i), y: y0 - 6, "text-anchor": "middle", class: "barTick" }, "–");
        none.append(svgEl("title", {}, summary));
        svg.append(none);
        addHit(survey, i, summary);
      }

      if (i % labelEvery === 0 || i === view.surveys.length - 1 || current) {
        svg.append(svgEl("text", { x: x(i), y: HEIGHT - 5, "text-anchor": "middle", class: current && several ? "barTick barTick--current" : "barTick" }, useShort ? names[i].short : names[i].full));
      }
    });
  }

  view.onChange(draw);
  new ResizeObserver(draw).observe(svg);
  return card;
}
