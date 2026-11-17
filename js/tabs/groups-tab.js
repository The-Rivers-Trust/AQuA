// =====================================================================
// GROUPS TAB
// Top: a card for every citizen science group - where it works and how
// many sites it has. Picking a group (a card here, or the header's group
// filter, which is the same filter) drills down into its profile. Every
// profile has the same three sections - About, Catchment Concerns and
// Questions, Links and Socials - read from data/organisations.json (only
// some groups have filled theirs in so far), with a small map of the
// group's sites beside it. No readings are shown here.
// =====================================================================

import { fetchSites } from "../data/aqua-service.js";
import { onFilterChange, getFilters, setSiteFilter } from "../filters.js";
import { MAP, RIVER_NETWORK } from "../config.js";
import { followBasemap } from "../map/basemaps.js";
import { escapeHtml } from "../utils/format.js";

const ORGANISATIONS_URL = "data/organisations.json";

// The web / social links, in the order shown. Icons are in img/social/
// (Simple Icons; the website globe is drawn to match).
const LINK_TYPES = [
  { key: "website", label: "Website", icon: "img/social/website.svg" },
  { key: "instagram", label: "Instagram", icon: "img/social/instagram.svg" },
  { key: "bluesky", label: "Bluesky", icon: "img/social/bluesky.svg" },
  { key: "x", label: "X", icon: "img/social/x.svg" },
  { key: "facebook", label: "Facebook", icon: "img/social/facebook.svg" },
];

// The small map's look: sites as orange pins (their tips on the site). The
// rivers use the same soft style as every other map (RIVER_NETWORK in config.js).
const PIN_SIZE = 20;
const PIN_SYMBOL = {
  type: "simple-marker",
  style: "path",
  // A map pin with a hole, in a 24 x 24 box
  path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z",
  color: [240, 110, 30, 1],
  outline: { color: [255, 255, 255, 1], width: 1 },
  size: PIN_SIZE,
  yoffset: PIN_SIZE / 2,
};

let sites = [];
let organisations = {};
let containerEl = null;
let mini = null; // the small map: { mapEl, layer, Graphic, Extent }, set up once
let shownGroup = null; // the group the small map is showing
let scrollToDetail = false; // set when a card is clicked, so the detail comes into view

const byName = (a, b) => a.localeCompare(b, "en-GB", { numeric: true });
const isHttps = (url) => typeof url === "string" && /^https:\/\//i.test(url);
const siteCount = (n) => `${n} ${n === 1 ? "site" : "sites"}`;

export async function initGroupsTab({ containerEl: el }) {
  containerEl = el;
  containerEl.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const [siteFeatures, response] = await Promise.all([
      fetchSites(),
      fetch(ORGANISATIONS_URL, { cache: "no-cache" }),
    ]);
    sites = siteFeatures.map((f) => ({ ...f.attributes, geometry: f.geometry })); // WGS84 points, for the small map
    if (response.ok) organisations = (await response.json()).organisations ?? {};
  } catch (error) {
    console.warn("AQuA dashboard: groups tab unavailable:", error);
    containerEl.innerHTML = `<h2>Groups</h2><p class="muted">The groups couldn't be loaded just now. Please try again later.</p>`;
    return;
  }

  containerEl.innerHTML = `
    <h2>Groups</h2>
    <p class="summaryIntro">The citizen science groups taking part in AQuA. Pick a group to read about it.</p>
    <div class="groupGrid" data-grid></div>
    <p class="muted compareHint" data-hint>Pick a group above, or in the filters at the top, to see its profile.</p>
    <section class="groupDetail" data-detail aria-labelledby="groupDetailHeading" hidden>
      <div class="groupDetailHead">
        <div>
          <h3 id="groupDetailHeading" data-title></h3>
          <p class="groupDetailSub" data-sub></p>
        </div>
        <calcite-button appearance="outline" kind="neutral" scale="s" icon-start="x" data-clear-group>Back to all groups</calcite-button>
      </div>
      <div class="groupBody">
        <div class="groupProfile" data-profile></div>
        <aside class="groupMapPanel" aria-label="Map of the group's sites">
          <!-- A picture, not a control: no panning, zooming, pop-ups or keyboard focus (inert). -->
          <arcgis-map class="groupMap" data-map inert center="${MAP.center.join(",")}" zoom="${MAP.zoom}"></arcgis-map>
        </aside>
      </div>
    </section>`;

  containerEl.addEventListener("click", (event) => {
    const card = event.target.closest("[data-group]");
    if (card) {
      const name = card.dataset.group;
      scrollToDetail = getFilters().group !== name;
      setSiteFilter("group", getFilters().group === name ? null : name);
      return;
    }
    if (event.target.closest("[data-clear-group]")) {
      setSiteFilter("group", null);
    }
  });
  onFilterChange(render);
  render();
}

// ---------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------

function groupList() {
  const names = [...new Set(sites.map((s) => s.case_study_group).filter(Boolean))].sort(byName);
  return names.map((name) => {
    const groupSites = sites.filter((s) => s.case_study_group === name);
    return {
      name,
      siteCount: groupSites.length,
      catchments: [...new Set(groupSites.map((s) => s.Catchment).filter(Boolean))].sort(byName),
    };
  });
}

function render() {
  const groups = groupList();
  const selected = groups.find((g) => g.name === getFilters().group) ?? null;

  containerEl.querySelector("[data-grid]").innerHTML = groups.map((g) => groupCardHtml(g, g === selected)).join("");
  containerEl.querySelector("[data-hint]").hidden = Boolean(selected);
  const detail = containerEl.querySelector("[data-detail]");
  detail.hidden = !selected;

  if (selected) {
    const org = organisations[selected.name];
    const where = selected.catchments.map((c) => `${c} Catchment`).join(" and ") || "–";
    containerEl.querySelector("[data-title]").textContent = selected.name;
    containerEl.querySelector("[data-sub]").textContent = `${siteCount(selected.siteCount)} · ${where}`;
    containerEl.querySelector("[data-profile]").innerHTML = hasContent(org)
      ? profileHtml(org)
      : `<p class="muted profileEmpty">This group's profile is coming soon.</p>`;
    showSites(selected.name);
    if (scrollToDetail) detail.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  scrollToDetail = false;
}

// ---------------------------------------------------------------------
// Small map: the picked group's sites
// ---------------------------------------------------------------------

async function ensureMiniMap() {
  if (mini) return mini;
  const mapEl = containerEl.querySelector("[data-map]");
  const [FeatureLayer, GraphicsLayer, Graphic, Extent] = await $arcgis.import([
    "@arcgis/core/layers/FeatureLayer.js",
    "@arcgis/core/layers/GraphicsLayer.js",
    "@arcgis/core/Graphic.js",
    "@arcgis/core/geometry/Extent.js",
  ]);
  followBasemap(mapEl); // starts with, and follows, the shared basemap choice
  await mapEl.viewOnReady();
  mapEl.view.constraints.snapToZoom = false; // lets "fit these sites" land between the usual zoom levels
  mapEl.popupDisabled = true;

  // The Open River Network under the sites (no flow animation here).
  mapEl.map.add(new FeatureLayer({
    url: RIVER_NETWORK.url,
    title: RIVER_NETWORK.title,
    outFields: ["Strahler"],
    popupEnabled: false,
    minScale: RIVER_NETWORK.minScale,
    renderer: {
      type: "simple",
      symbol: { type: "simple-line", color: RIVER_NETWORK.color, cap: "round", join: "round" },
      visualVariables: [{ type: "size", field: "Strahler", stops: RIVER_NETWORK.widthByStrahler }],
    },
  }));
  const layer = new GraphicsLayer({ title: "Group sites" });
  mapEl.map.add(layer);
  mini = { mapEl, layer, Graphic, Extent, fit: null };

  // The map fills the space available, so when its size changes (window
  // resized, layout switching between side-by-side and stacked) the sites
  // are fitted again.
  let timer = null;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => mini.fit?.(), 150);
  }).observe(mapEl);
  return mini;
}

// Puts the group's sites on the small map and zooms to them. A newer pick
// while this is still setting up wins.
let latestPick = 0;
async function showSites(groupName) {
  const request = ++latestPick;
  const { mapEl, layer, Graphic, Extent } = await ensureMiniMap();
  if (request !== latestPick) return;

  const groupSites = sites.filter((s) => s.case_study_group === groupName && s.geometry);
  layer.removeAll();
  layer.addMany(groupSites.map((s) => new Graphic({
    geometry: s.geometry,
    symbol: PIN_SYMBOL,
    attributes: { name: s.Description || s.River_Waterbody || s.site_name, river: s.River_Waterbody ?? "", catchment: s.Catchment ?? "" },
  })));
  if (!groupSites.length) return;

  const xs = groupSites.map((s) => s.geometry.x);
  const ys = groupSites.map((s) => s.geometry.y);
  const extent = new Extent({
    xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys),
    spatialReference: { wkid: 4326 },
  });
  mini.fit = () => mapEl.goTo(
    // A single site has a zero-size extent, so zoom to it instead of fitting.
    groupSites.length === 1 ? { target: extent.center, zoom: 13 } : extent.expand(1.2),
    { animate: false }
  );
  await mini.fit();
}

function groupCardHtml(g, isSelected) {
  const hasProfile = hasContent(organisations[g.name]);
  return `
    <button type="button" class="groupCard${isSelected ? " groupCard--selected" : ""}" data-group="${escapeHtml(g.name)}" aria-pressed="${isSelected}">
      <span class="groupCardName">${escapeHtml(g.name)}</span>
      <span class="groupCardWhere">${escapeHtml(g.catchments.map((c) => `${c} Catchment`).join(" and ") || "–")}</span>
      <span class="groupCardSites">${escapeHtml(siteCount(g.siteCount))}</span>
      ${hasProfile ? `<span class="groupTag">Profile available</span>` : ""}
    </button>`;
}

// ---------------------------------------------------------------------
// One group
// ---------------------------------------------------------------------

// Does an organisation's entry have anything to show yet?
function hasContent(org) {
  if (!org) return false;
  return Boolean(
    (org.about ?? []).length ||
    (org.concernsAndQuestions ?? []).length ||
    LINK_TYPES.some((t) => isHttps(org.links?.[t.key]))
  );
}

// The same three sections for every organisation; a section with nothing
// in it is left out.
function profileHtml(org) {
  const about = (org.about ?? []).length ? `
      <section class="profileSection">
        <h4>About</h4>
        ${org.about.map((t) => `<p>${escapeHtml(t)}</p>`).join("")}
      </section>` : "";

  const concerns = (org.concernsAndQuestions ?? []).length ? `
      <section class="profileSection">
        <h4>Catchment Concerns and Questions</h4>
        <ul class="profileList">${org.concernsAndQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>
      </section>` : "";

  const socials = LINK_TYPES.filter((t) => isHttps(org.links?.[t.key])).map((t) => `
          <a class="socialLink" href="${escapeHtml(org.links[t.key])}" target="_blank" rel="noopener noreferrer">
            <span class="socialIcon" style="--icon:url('${new URL(t.icon, document.baseURI).href}')" aria-hidden="true"></span>
            ${t.label}
          </a>`).join("");
  const links = socials ? `
      <section class="profileSection">
        <h4>Links and Socials</h4>
        <div class="socialLinks">${socials}</div>
      </section>` : "";

  return `<div class="profile">${about}${concerns}${links}</div>`;
}
