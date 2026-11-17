// =====================================================================
// QUALITY ASSURANCE TAB
// The control blanks, for the season and sites picked in the header. Some
// samples are chosen for a control blank: clean water handled like a real
// sample, to check the kit and the process haven't added contamination. A
// blank can be for E. coli, for organic contaminants, or both. The E. coli
// blanks' results (expected: 0 cfu) and their plate photos are shown here;
// the organic contaminant blanks are only counted until their results are
// available.
// =====================================================================

import { QUALITY_CONTROL } from "../config.js";
import { fetchSites, fetchCitizenScience, recordsBySite } from "../data/aqua-service.js";
import { onFilterChange, matchesFilters, getSeason } from "../filters.js";
import { openPhotos } from "../map/photo-viewer.js";
import { escapeHtml, formatDate } from "../utils/format.js";

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
    console.warn("AQuA dashboard: quality assurance tab unavailable:", error);
    containerEl.innerHTML = `<h2>Quality Assurance</h2><p class="muted">The data couldn't be loaded just now. Please try again later.</p>`;
    return;
  }
  containerEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-blank]");
    if (button) openBlankPhoto(Number(button.dataset.blank));
  });
  onFilterChange(render);
  render();
}

const byName = (a, b) => a.localeCompare(b, "en-GB", { numeric: true });
const isHttps = (url) => typeof url === "string" && /^https:\/\//i.test(url);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function render() {
  const season = getSeason();
  const bySite = recordsBySite(records, season);
  const surveys = sites
    .filter(matchesFilters)
    .filter((s) => bySite.has(s.site_name))
    .map((s) => ({ site: s, record: bySite.get(s.site_name) }));

  containerEl.innerHTML = qualityAssuranceHtml(surveys);
}

function stat(value, label, tone = "") {
  return `<div class="dataStat${tone ? ` dataStat--${tone}` : ""}"><span class="dataStatValue">${value}</span><span class="dataStatLabel">${escapeHtml(label)}</span></div>`;
}

// ---------------------------------------------------------------------
// Quality assurance: control blanks
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
      <h2 id="qaHeading">Quality Assurance</h2>
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
