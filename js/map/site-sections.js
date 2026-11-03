// =====================================================================
// SITE SECTIONS
// What the site panel (site-panel.js, down the right of the map) shows
// for a site, top to bottom:
//   1. Site details - river, catchment, group, grid reference.
//   2. A middle section the map tab chooses: on the Citizen Science map,
//      phosphate and E. coli bar charts over every survey
//      (trendsSection; click an E. coli bar to see that survey's plate
//      photo); on the Metals map, the site's lab results.
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
    el.append(createSeasonBars({ metricKey, view, onBarClick: metricKey === "ecoli" ? platePhotoClick : undefined }));
  }
  return el;
}

// The E. coli chart: a survey's bar opens its plate photo, if it has one.
const platePhotoClick = {
  label: "View E. coli plate photo",
  enabled: (survey) => isHttps(survey.ecoli_plate_photo),
  open(survey) {
    const when = survey.field_date ? ` on ${formatDate(survey.field_date)}` : "";
    openPhotos(
      [{ url: survey.ecoli_plate_photo, caption: "E. coli plate", alt: `E. coli plate, ${survey.site_name}${when}` }],
      0,
      `${survey.site_name}${survey.field_date ? ` · ${formatDate(survey.field_date)}` : ""}`
    );
  },
};

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

function surveyCard(s) {
  const when = [s.field_date && formatDate(s.field_date), s.field_time?.slice(0, 5)].filter(Boolean).join(" · ");
  const top = document.createElement("div");
  top.className = "surveyCardTop";
  top.innerHTML = `
    <span class="surveyDate">${escapeHtml(when || "Undated survey")}</span>
    ${s.season_year ? `<span class="surveySeason">${escapeHtml(formatSeason(s.season_year))}</span>` : ""}`;

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

  const parts = [top, body, photoStrip(s)];
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

// A reading with the band it falls in (colour and name), as on the map.
function readingRow(metricKey, value, qa) {
  const metric = METRICS[metricKey];
  const band = classify(metricKey, value);
  return `
    <div class="surveyReading">
      <span class="surveyReadingSwatch" style="background:${band.color}"></span>
      <span class="surveyReadingText">
        <span class="surveyReadingLabel">${escapeHtml(metric.label)}</span>
        <span class="surveyReadingBand">${escapeHtml(band.label)}${qa ? ` · ${escapeHtml(qa.toLowerCase())}` : ""}</span>
      </span>
      <span class="surveyReadingValue">${formatNumber(value, metric.decimals)}${value == null ? "" : `<small> ${escapeHtml(metric.unit)}</small>`}</span>
    </div>`;
}

// ---------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------

// The survey's three site photos, as thumbnails that enlarge in the page
// (photo-viewer.js), where the others can be stepped through. (The E. coli
// plate photo isn't here - it opens from the E. coli chart's bar.) Only
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
