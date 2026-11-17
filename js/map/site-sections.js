// =====================================================================
// SITE SECTIONS
// What the site panel (site-panel.js, down the right of the map) shows
// for a site, top to bottom:
//   1. Site details - river, catchment, group, grid reference.
//   2. A middle section the map tab chooses: on the Citizen Science map,
//      phosphate and E. coli bar charts over every survey
//      (trendsSection; a link under the E. coli chart opens the plate
//      photo of the survey showing); on the Metals map, the site's lab
//      results.
//   3. Surveys (Citizen Science map only) - the site's individual surveys,
//      one at a time, cycled with newer / older buttons like the NRS
//      dashboard's "Recent surveys": date, weather, flow and level, the
//      phosphate and E. coli readings with their band, photos (which
//      enlarge in the page - photo-viewer.js), and any pollution sources
//      noted.
// The charts and the surveys share one "survey view"
// (js/data/surveys.js): moving to another survey highlights its bars.
// Each site has one survey so far, so the cycling controls only appear
// once there's more than one.
// =====================================================================

import { METRICS } from "../config.js";
import { classify } from "../metrics.js";
import { createSurveyView } from "../data/surveys.js";
import { createSeasonBars } from "../charts/season-bars.js";
import { escapeHtml, formatDate, formatNumber, formatSeason } from "../utils/format.js";
import { POPUP_STYLESHEET } from "./map-common.js";
import { openPhotos } from "./photo-viewer.js";

// surveys: the site's records, oldest first (surveysForSite), or omitted
// for a panel without a Surveys section (the Metals map).
// season: the header's season - the survey to start on.
// middle(view) -> the middle section's element (view is null with no
// surveys).
export function buildSitePanelContent(a, { surveys, season, middle }) {
  const view = surveys ? createSurveyView(surveys, a.site_name, season) : null;
  const root = document.createElement("div");
  root.className = "siteSections";
  root.insertAdjacentHTML("afterbegin", POPUP_STYLESHEET);
  root.append(siteDetailsSection(a), middle(view));
  if (view) root.append(surveysSection(view));
  return root;
}

// A titled block of the panel. `end` (optional) sits at the right of the
// title row.
export function section(className, heading, end) {
  const el = document.createElement("section");
  el.className = `siteSection ${className}`;
  const head = document.createElement("div");
  head.className = "sectionHead";
  const h = document.createElement("h3");
  h.textContent = heading;
  head.append(h);
  if (end) head.append(end);
  el.append(head);
  return el;
}

const mutedText = (text) => Object.assign(document.createElement("p"), { className: "muted", textContent: text });

// ---------------------------------------------------------------------
// 1. Site details
// ---------------------------------------------------------------------

function siteDetailsSection(a) {
  const el = section("siteSection--details", "Site details");
  const facts = [
    ["River / waterbody", a.River_Waterbody, false],
    ["Catchment", a.Catchment, false],
    ["Case study group", a.case_study_group, true],
    ["OS grid reference", a.OS_Grid_Ref, false],
  ].filter(([, value]) => value != null && value !== "");
  el.insertAdjacentHTML("beforeend", `
    <dl class="siteFacts">
      ${facts.map(([label, value, wide]) => `
        <div${wide ? ` class="siteFact--wide"` : ""}>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>`).join("")}
    </dl>`);
  return el;
}

// ---------------------------------------------------------------------
// 2. Trends (Citizen Science map)
// ---------------------------------------------------------------------

export function trendsSection(view) {
  const el = section("siteSection--trends", "Trends");
  if (!view.surveys.length) {
    el.append(mutedText("No surveys recorded for this site yet."));
    return el;
  }
  for (const metricKey of Object.keys(METRICS)) {
    el.append(createSeasonBars({ metricKey, view }));
    if (metricKey === "ecoli") el.append(platePhotoLink(view));
  }
  return el;
}

// Text under the E. coli chart that opens the plate photo of the survey
// showing (the one the Surveys section below is on). Hidden when that
// survey has no plate photo.
function platePhotoLink(view) {
  const p = document.createElement("p");
  p.className = "platePhotoLink";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "platePhotoButton";
  button.textContent = "Open E. coli plate photo";
  p.append(button);

  const update = () => { p.hidden = !isHttps(view.current?.ecoli_plate_photo); };
  button.addEventListener("click", () => {
    const survey = view.current;
    if (!survey || !isHttps(survey.ecoli_plate_photo)) return;
    const when = survey.field_date ? ` on ${formatDate(survey.field_date)}` : "";
    openPhotos(
      [{ url: survey.ecoli_plate_photo, caption: "E. coli plate", alt: `E. coli plate, ${survey.site_name}${when}` }],
      0,
      `${survey.site_name}${survey.field_date ? ` · ${formatDate(survey.field_date)}` : ""}`
    );
  });
  view.onChange(update);
  update();
  return p;
}

// Photo links come from the survey data, so only https ones are used.
const isHttps = (url) => typeof url === "string" && /^https:\/\//i.test(url);

// ---------------------------------------------------------------------
// 3. Surveys
// ---------------------------------------------------------------------

function surveysSection(view) {
  const count = view.surveys.length;
  if (!count) {
    const empty = section("siteSection--surveys", "Surveys");
    empty.append(mutedText("No surveys recorded for this site yet."));
    return empty;
  }

  // Newest first, as in the NRS dashboard: the left button goes to a
  // newer survey, the right to an older one (the view itself is oldest
  // first, which is the order the charts want).
  let nav = null;
  if (count > 1) {
    nav = document.createElement("div");
    nav.className = "surveyNav";
    nav.innerHTML = `
      <calcite-action data-newer icon="chevron-left" text="Newer survey" scale="s"></calcite-action>
      <span class="surveyPosition" aria-live="polite"></span>
      <calcite-action data-older icon="chevron-right" text="Older survey" scale="s"></calcite-action>`;
  } else {
    nav = Object.assign(document.createElement("span"), { className: "sectionHeadNote", textContent: "1 survey" });
  }
  const el = section("siteSection--surveys", "Surveys", nav);
  const card = document.createElement("div");
  card.className = "surveyCard";
  el.append(card);

  if (count > 1) {
    const newer = nav.querySelector("[data-newer]");
    const older = nav.querySelector("[data-older]");
    newer.addEventListener("click", () => view.select(view.index + 1));
    older.addEventListener("click", () => view.select(view.index - 1));
    view.onChange(syncNav);
    syncNav();

    function syncNav() {
      nav.querySelector(".surveyPosition").textContent = `${count - view.index} of ${count}`;
      newer.disabled = view.index >= count - 1;
      older.disabled = view.index <= 0;
    }
  }

  const render = () => card.replaceChildren(...surveyCard(view.current));
  view.onChange(render);
  render();
  return el;
}

const weatherPills = (text) => String(text ?? "").split(",").map((t) => t.trim()).filter(Boolean);

// A date-only and a time-only field as one moment on the wall clock
// ("2026-08-22" + "15:55:00"); null if either is missing. Both come from
// the same place, so the gap between two of them is just their difference
// in the browser's own clock.
function wallClock(date, time) {
  if (date == null || !time) return null;
  const day = typeof date === "number" ? new Date(date).toISOString().slice(0, 10) : String(date).slice(0, 10);
  const moment = new Date(`${day}T${String(time).slice(0, 8)}`);
  return Number.isNaN(moment.getTime()) ? null : moment;
}

const dateAndTime = (date, time) => (date == null ? "" : [formatDate(date), time?.slice(0, 5)].filter(Boolean).join(", "));

// Whole hours from collection to analysis, rounded to the nearest hour.
function gapText(from, to) {
  if (!from || !to || to < from) return null;
  const hours = Math.round((to - from) / 3600000);
  return hours === 0 ? "Under an hour" : `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

// When the water sample was taken and when it was tested in the lab, and
// how long it waited between the two.
function sampleTimes(s) {
  const collected = dateAndTime(s.field_date, s.field_time);
  const analysed = dateAndTime(s.analysis_date, s.analysis_time);
  const gap = gapText(wallClock(s.field_date, s.field_time), wallClock(s.analysis_date, s.analysis_time));
  const el = document.createElement("dl");
  el.className = "sampleTimes";
  el.innerHTML = `
    <div><dt>Sample collected</dt><dd>${escapeHtml(collected || "Not recorded")}</dd></div>
    <div><dt>Sample analysed</dt><dd>${escapeHtml(analysed || "Not recorded")}</dd></div>
    <div class="sampleGap"><dt>Time to analysis</dt><dd>${escapeHtml(gap ?? "–")}</dd></div>`;
  return el;
}

function surveyCard(s) {
  const top = document.createElement("div");
  top.className = "surveyCardTop";
  top.innerHTML = s.season_year ? `<span class="surveySeason">${escapeHtml(formatSeason(s.season_year))}</span>` : "";

  const body = document.createElement("div");
  const pills = weatherPills(s.current_weather);
  body.innerHTML = `
    ${pills.length ? `<div class="weatherTags">${pills.map((t) => `<span class="weatherTag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    <dl class="surveyFields">
      ${[["Water flow", s.water_flow], ["Water level", s.water_level], ["Last 24 hours", s.weather_last_24h]]
        .map(([label, value], i) => `<div${i === 2 ? ` class="surveyField--wide"` : ""}><dt>${label}</dt><dd>${escapeHtml(value || "–")}</dd></div>`)
        .join("")}
    </dl>
    <div class="surveyReadings">
      ${readingRow("phosphate", s.phosphate_ppm, s.phosphate_qa)}
      ${readingRow("ecoli", s.ecoli_cfu, s.ecoli_qa)}
    </div>`;

  const parts = [top, sampleTimes(s), body, photoStrip(s)];
  // Free text, sometimes a paragraph - scrolled in its own small box.
  if (s.pollution_sources_combined) {
    const note = document.createElement("div");
    note.className = "surveyNote";
    const label = document.createElement("div");
    label.className = "surveyNoteLabel";
    label.textContent = "Pollution sources noted";
    const text = document.createElement("p");
    text.textContent = s.pollution_sources_combined;
    note.append(label, text);
    parts.push(note);
  }
  return parts;
}

// The data's quality flag for a reading (phosphate_qa / ecoli_qa) is only
// shown when it tells the reader something: a zero reading, or one above
// the test's detection limit. The ordinary values ("OKAY", "DETECTED") and
// "NOT COLLECTED" (the reading already says "No reading") are left out.
const QA_FLAGS = {
  "ZERO READING": { text: "Zero reading", hint: "The test read zero." },
  "NO E.COLI DETECTED": { text: "Zero reading", hint: "No E. coli was detected." },
  "AT UPPER LIMIT": { text: "Above detection limit", hint: "The reading was at the top of what the test can measure, so the true value may be higher." },
};

// A reading with the band it falls in (colour and name), as on the map.
function readingRow(metricKey, value, qa) {
  const metric = METRICS[metricKey];
  const band = classify(metricKey, value);
  const flag = QA_FLAGS[String(qa ?? "").trim().toUpperCase()];
  return `
    <div class="surveyReading">
      <span class="surveyReadingSwatch" style="background:${band.color}"></span>
      <span class="surveyReadingText">
        <span class="surveyReadingLabel">${escapeHtml(metric.label)}</span>
        <span class="surveyReadingBand">${escapeHtml(band.label)}${flag ? ` <span class="readingFlag" title="${escapeHtml(flag.hint)}">${escapeHtml(flag.text)}</span>` : ""}</span>
      </span>
      <span class="surveyReadingValue">${formatNumber(value, metric.decimals)}${value == null ? "" : `<small> ${escapeHtml(metric.unit)}</small>`}</span>
    </div>`;
}

// ---------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------

// The survey's three site photos, as thumbnails that enlarge in the page
// (photo-viewer.js), where the others can be stepped through. (The E. coli
// plate photo isn't here - it opens from the link under the E. coli chart.) Only
// https links are used, and one that won't load says so rather than
// leaving a hole.
function photoStrip(s) {
  const wanted = [
    [s.site_photo_1, "Photo 1", "Site photo 1"],
    [s.site_photo_2, "Photo 2", "Site photo 2"],
    [s.site_photo_3, "Photo 3", "Site photo 3"],
  ].filter(([url]) => isHttps(url));

  const strip = document.createElement("div");
  strip.className = "surveyPhotos";
  if (!wanted.length) {
    strip.append(mutedText("No photos for this survey."));
    return strip;
  }
  const viewerPhotos = wanted.map(([url, caption, alt]) => ({
    url,
    caption,
    alt: `${alt}, ${s.site_name}${s.field_date ? ` on ${formatDate(s.field_date)}` : ""}`,
  }));
  const heading = `${s.site_name}${s.field_date ? ` · ${formatDate(s.field_date)}` : ""}`;
  const list = document.createElement("ul");
  list.className = "photoList";
  viewerPhotos.forEach((photo, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photoThumb";
    button.title = `Enlarge ${photo.caption.toLowerCase()}`;
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = photo.alt;
    img.loading = "lazy";
    img.addEventListener("error", () => item.replaceChildren(mutedText(`${photo.caption} couldn't be loaded.`)));
    const label = document.createElement("span");
    label.className = "photoCaption";
    label.textContent = photo.caption;
    button.append(img, label);
    button.addEventListener("click", () => openPhotos(viewerPhotos, index, heading));
    item.append(button);
    list.append(item);
  });
  strip.append(list);
  return strip;
}
