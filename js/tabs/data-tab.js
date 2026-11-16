// =====================================================================
// DATA TAB
// Two sections, for the season and sites picked in the header:
//   1. Sites tested - how many of the sites were sampled, and how many
//      phosphate and E. coli tests that gave, by catchment.
//   2. Quality assurance - the control blanks. Some samples are chosen for
//      a control blank: clean water handled like a real sample, to check
//      the kit and the process haven't added contamination. A blank can be
//      for E. coli, for organic contaminants, or both. The E. coli blanks'
//      results (expected: 0 cfu) and their plate photos are shown here; the
//      organic contaminant blanks are only counted until their results are
//      available.
// =====================================================================

import { METRICS, QUALITY_CONTROL } from "../config.js";
import { fetchSites, fetchCitizenScience, recordsBySite } from "../data/aqua-service.js";
import { onFilterChange, matchesFilters, getSeason } from "../filters.js";
import { openPhotos } from "../map/photo-viewer.js";
import { escapeHtml, formatDate, formatNumber, formatSeason } from "../utils/format.js";

let sites = [];
let records = [];
let containerEl = null;
let shownBlanks = []; // the E. coli control blanks in the table, for the photo viewer

export async function initDataTab({ containerEl: el }) {
  containerEl = el;
  containerEl.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    [sites, records] = await Promise.all([
      fetchSites().then((features) => features.map((f) => f.attributes)),
      fetchCitizenScience(),
    ]);
  } catch (error) {
    console.warn("AQuA dashboard: data tab unavailable:", error);
    containerEl.innerHTML = `<h2>Data</h2><p class="muted">The data couldn't be loaded just now. Please try again later.</p>`;
    return;
  }
  containerEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-blank]");
    if (button) openBlankPhoto(Number(button.dataset.blank));
    const header = event.target.closest("th[data-sort]");
    if (header) sortCatchments(header.dataset.sort);
  });
  containerEl.addEventListener("keydown", (event) => {
    const header = event.target.closest?.("th[data-sort]");
    if (header && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      sortCatchments(header.dataset.sort);
    }
  });
  onFilterChange(render);
  render();
}

const byName = (a, b) => a.localeCompare(b, "en-GB", { numeric: true });
const isHttps = (url) => typeof url === "string" && /^https:\/\//i.test(url);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function render() {
  const season = getSeason();
  const inFilters = sites.filter(matchesFilters);
  const bySite = recordsBySite(records, season);
  const surveys = inFilters.filter((s) => bySite.has(s.site_name)).map((s) => ({ site: s, record: bySite.get(s.site_name) }));

  containerEl.innerHTML = `
    <h2>Data</h2>
    <p class="dataIntro">What was tested in ${escapeHtml(formatSeason(season) || "the chosen season")}, and the checks that show the results can be trusted. It follows the filters at the top.</p>
    ${sitesTestedHtml(inFilters, surveys)}
    ${qualityAssuranceHtml(surveys)}`;
}

// ---------------------------------------------------------------------
// 1. Sites tested
// ---------------------------------------------------------------------

// The catchment table's columns. Averages are the mean of the readings
// from the sites tested in that catchment.
const CATCHMENT_COLUMNS = [
  { field: "catchment", label: "Catchment", type: "text" },
  { field: "sites", label: "Sites", type: "number" },
  { field: "tested", label: "Sites tested", type: "number" },
  { field: "phosphateTests", label: "Phosphate tests", type: "number" },
  { field: "ecoliTests", label: "E. coli tests", type: "number" },
  { field: "phosphateAverage", label: `Average phosphate (${METRICS.phosphate.unit})`, type: "number", decimals: METRICS.phosphate.decimals },
  { field: "ecoliAverage", label: `Average E. coli (${METRICS.ecoli.unit})`, type: "number", decimals: 1 },
];

let catchmentRows = [];
let catchmentSort = { field: "catchment", direction: "asc" };

const mean = (values) => (values.length ? values.reduce((sum, v) => sum + Number(v), 0) / values.length : null);

function sitesTestedHtml(inFilters, surveys) {
  const phosphate = surveys.filter((x) => x.record.phosphate_ppm != null).length;
  const ecoli = surveys.filter((x) => x.record.ecoli_cfu != null).length;
  const catchments = new Set(surveys.map((x) => x.site.Catchment));

  catchmentRows = [...new Set(inFilters.map((s) => s.Catchment))].map((catchment) => {
    const tested = surveys.filter((x) => x.site.Catchment === catchment);
    const phosphateValues = tested.map((x) => x.record.phosphate_ppm).filter((v) => v != null);
    const ecoliValues = tested.map((x) => x.record.ecoli_cfu).filter((v) => v != null);
    return {
      catchment: catchment ?? "–",
      sites: inFilters.filter((s) => s.Catchment === catchment).length,
      tested: tested.length,
      phosphateTests: phosphateValues.length,
      ecoliTests: ecoliValues.length,
      phosphateAverage: mean(phosphateValues),
      ecoliAverage: mean(ecoliValues),
    };
  });

  return `
    <section class="dataSection" aria-labelledby="sitesTestedHeading">
      <h3 id="sitesTestedHeading">Sites tested</h3>
      <div class="dataStats">
        ${stat(`${surveys.length}<small> of ${inFilters.length}</small>`, "Sites tested")}
        ${stat(catchments.size, catchments.size === 1 ? "Catchment covered" : "Catchments covered")}
        ${stat(phosphate, "Phosphate tests")}
        ${stat(ecoli, "E. coli tests")}
      </div>
      <div class="dataTableScroll" id="catchmentTable">${catchmentTableHtml()}</div>
    </section>`;
}

// The table, sorted by the chosen column (text A-Z, numbers highest first
// to begin with; click a header again to flip). A catchment with no
// average (no readings) always sorts last.
function catchmentTableHtml() {
  if (!catchmentRows.length) return `<p class="muted">No sites match the current filters.</p>`;
  const { field, direction } = catchmentSort;
  const sorted = catchmentRows.slice().sort((a, b) => {
    const missingA = a[field] == null;
    const missingB = b[field] == null;
    if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
    const cmp = typeof a[field] === "string" ? byName(a[field], b[field]) : a[field] - b[field];
    return (direction === "asc" ? cmp : -cmp) || byName(a.catchment, b.catchment);
  });

  const header = CATCHMENT_COLUMNS.map((col) => {
    const active = col.field === field;
    const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
    return `<th data-sort="${col.field}" tabindex="0" role="button" aria-sort="${ariaSort}">${escapeHtml(col.label)}${active ? `<span class="sortArrow" aria-hidden="true">${direction === "asc" ? " ▲" : " ▼"}</span>` : ""}</th>`;
  }).join("");

  const body = sorted.map((row) => `<tr>${CATCHMENT_COLUMNS.map((col, i) => {
    const value = row[col.field];
    const text = value == null ? "–" : col.decimals != null ? formatNumber(value, col.decimals) : value;
    return i === 0 ? `<th scope="row">${escapeHtml(text)}</th>` : `<td>${escapeHtml(text)}</td>`;
  }).join("")}</tr>`).join("");

  return `<table class="dataTable dataTable--equal"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function sortCatchments(field) {
  // A new column starts highest first for numbers, A-Z for text; clicking
  // the same column again flips it.
  const column = CATCHMENT_COLUMNS.find((c) => c.field === field);
  catchmentSort = catchmentSort.field === field
    ? { field, direction: catchmentSort.direction === "asc" ? "desc" : "asc" }
    : { field, direction: column.type === "number" ? "desc" : "asc" };
  const holder = containerEl.querySelector("#catchmentTable");
  holder.innerHTML = catchmentTableHtml();
  holder.querySelector(`th[data-sort="${field}"]`)?.focus();
}

function stat(value, label, tone = "") {
  return `<div class="dataStat${tone ? ` dataStat--${tone}` : ""}"><span class="dataStatValue">${value}</span><span class="dataStatLabel">${escapeHtml(label)}</span></div>`;
}

// ---------------------------------------------------------------------
// 2. Quality assurance: control blanks
// ---------------------------------------------------------------------

// A control blank's status field lists what it was collected for, e.g.
// "E.coli", "Organic Contaminants Quality Control, E.coli", "None collected".
function blankFor(record) {
  const status = String(record.qcb_analysis_status ?? "").toLowerCase();
  const collected = String(record.qcb_collected ?? "").trim().toLowerCase() === "yes";
  return { collected, ecoli: collected && status.includes("e.coli"), organics: collected && status.includes("organic") };
}

function qualityAssuranceHtml(surveys) {
  const blanks = surveys.map((x) => ({ ...x, blank: blankFor(x.record) })).filter((x) => x.blank.collected);
  const ecoli = blanks.filter((x) => x.blank.ecoli);
  const organics = blanks.filter((x) => x.blank.organics);

  const results = ecoli.map((x) => x.record.qcb_ecoli_cfu);
  const awaiting = results.filter((v) => v == null).length;
  const clean = results.filter((v) => v != null && v <= QUALITY_CONTROL.ecoliBlankMaxCfu).length;
  const contaminated = results.filter((v) => v != null && v > QUALITY_CONTROL.ecoliBlankMaxCfu).length;

  shownBlanks = ecoli
    .slice()
    .sort((a, b) => byName(a.site.site_name, b.site.site_name))
    .map((x) => ({ ...x, photo: isHttps(x.record.qcb_plate_photo) ? x.record.qcb_plate_photo : null }));

  const verdict = !ecoli.length
    ? ""
    : contaminated
      ? `<p class="dataVerdict dataVerdict--warn"><strong>${plural(contaminated, "E. coli control blank", "E. coli control blanks")} grew colonies.</strong> Results from the same batch of samples should be treated with care.</p>`
      : `<p class="dataVerdict dataVerdict--ok"><strong>All ${clean} E. coli control blanks with a result were ${QUALITY_CONTROL.ecoliBlankMaxCfu} cfu, as expected</strong>, so there is no sign of contamination from the kit or the way samples were handled.${awaiting ? ` ${plural(awaiting, "is", "are")} still awaiting a result.` : ""}</p>`;

  return `
    <section class="dataSection" aria-labelledby="qaHeading">
      <h3 id="qaHeading">Quality assurance</h3>
      <p class="dataExplain">Some samples are chosen for a <strong>control blank</strong>: clean water that is collected and tested in the same way as a real sample. If anything grows or is detected in a blank, the kit or the way samples were handled may have added contamination, so a good blank gives confidence in the real results. A blank can be for <strong>E. coli</strong>, for <strong>organic contaminants</strong>, or both.</p>
      <div class="dataStats">
        ${stat(`${blanks.length}<small> of ${surveys.length}</small>`, "Samples with a control blank")}
        ${stat(ecoli.length, "E. coli control blanks")}
        ${stat(organics.length, "Organic contaminant control blanks")}
      </div>

      <h4>E. coli control blanks</h4>
      ${verdict}
      ${ecoli.length ? blankTableHtml() : `<p class="muted">No E. coli control blanks for the current selection.</p>`}

      <h4>Organic contaminants control blanks</h4>
      <p class="muted">${organics.length
        ? `${plural(organics.length, "control blank was", "control blanks were")} collected for organic contaminants. Their results aren't available yet.`
        : "No control blanks were collected for organic contaminants for the current selection."}</p>
    </section>`;
}

function blankTableHtml() {
  const limit = QUALITY_CONTROL.ecoliBlankMaxCfu;
  const rows = shownBlanks.map((x, i) => {
    const cfu = x.record.qcb_ecoli_cfu;
    const result = cfu == null
      ? `<span class="dataResult dataResult--wait">Awaiting result</span>`
      : cfu <= limit
        ? `<span class="dataResult dataResult--ok">${cfu} cfu · as expected</span>`
        : `<span class="dataResult dataResult--warn">${cfu} cfu · above expected</span>`;
    const photo = x.photo
      ? `<calcite-button data-blank="${i}" appearance="outline" kind="neutral" scale="s" icon-start="camera" aria-label="View plate photo for ${escapeHtml(x.site.site_name)}">View</calcite-button>`
      : `<span class="muted">No photo</span>`;
    return `<tr>
      <th scope="row">${escapeHtml(x.site.site_name)}</th>
      <td>${escapeHtml(x.site.Catchment ?? "–")}</td>
      <td>${escapeHtml(formatDate(x.record.field_date))}</td>
      <td>${x.blank.organics ? "E. coli and organic contaminants" : "E. coli"}</td>
      <td>${result}</td>
      <td>${photo}</td>
    </tr>`;
  }).join("");
  return `
    <div class="dataTableScroll">
      <table class="dataTable">
        <thead><tr><th>Site</th><th>Catchment</th><th>Collected</th><th>Blank for</th><th>Result (expected ${limit} cfu)</th><th>Plate photo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Opens the plate photos of every blank that has one, starting at the
// one clicked, so Previous / Next steps through them.
function openBlankPhoto(index) {
  const withPhotos = shownBlanks.filter((x) => x.photo);
  const start = withPhotos.indexOf(shownBlanks[index]);
  if (start < 0) return;
  openPhotos(
    withPhotos.map((x) => ({
      url: x.photo,
      caption: `E. coli control blank plate · ${x.site.site_name}${x.record.field_date ? `, ${formatDate(x.record.field_date)}` : ""}`,
      alt: `E. coli control blank plate for ${x.site.site_name}`,
    })),
    start,
    "E. coli control blanks"
  );
}
