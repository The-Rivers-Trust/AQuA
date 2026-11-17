// =====================================================================
// GUIDED TOUR
// A short walk through the dashboard for first-time users: a dimmed page
// with a spotlight on one part of it and a card that explains it, with
// Back / Next / Skip. Wording is in STEPS below - edit it there.
//
// It is not offered on phones (the layout is different and there is no
// room for the spotlight), and the first time someone visits on a bigger
// screen a small card offers it; after that it is only the "?" button in
// the header. "Seen it" is remembered in the browser (localStorage) - if
// that isn't available the offer just shows again next time.
//
// Keys while it is open: right / left arrow or Enter go forward / back,
// Esc closes it. Other keys (including the map shortcuts) do nothing.
// =====================================================================

const SEEN_KEY = "aqua-tour-seen";
const PHONE = "(max-width: 720px)";
const GAP = 14; // card to spotlight
const PAD = 6; // spotlight around its target

const $ = (selector, root = document) => root.querySelector(selector);

// What a step can point at. Each returns an element, or a rectangle
// ({ left, top, right, bottom }), or null for a step with no target.
const visibleView = () => $(".view:not([hidden])");
const tabTitle = (view) => () => $(`calcite-tab-title[data-view="${view}"]`);
const mapButtons = () => {
  const els = [".basemapAction", ".layersAction", ".legendAction"].map((s) => $(s, visibleView())).filter(Boolean);
  if (!els.length) return null;
  const rects = els.map((e) => e.getBoundingClientRect());
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
};

// tab: the tab to be on for this step. placement: where the card sits
// relative to the target (bottom, top, left, right, inside, or center for
// a step with no target).
const STEPS = [
  {
    tab: "map",
    placement: "center",
    title: "Welcome to the AQuA dashboard",
    body: "Volunteers across Yorkshire test their local rivers for phosphate and E. coli, and some sites are also tested in a lab for metals. This dashboard brings those results together. This short tour shows you around - it takes about a minute.",
  },
  {
    tab: "map",
    target: tabTitle("map"),
    placement: "bottom",
    title: "Citizen Science Map",
    body: "Where the volunteers tested. Every site is coloured by its phosphate or E. coli reading, so you can see at a glance where the river is in good shape and where it isn't.",
  },
  {
    tab: "map",
    target: tabTitle("metals"),
    placement: "bottom",
    title: "Metals Map",
    body: "Lab results for metals such as iron, copper and lead at the sites that were sampled. Pick a metal and the sites are sized by how much was found.",
  },
  {
    tab: "map",
    target: tabTitle("downstream"),
    placement: "bottom",
    title: "Downstream Plots",
    body: "Follow a river from upstream to downstream. One chart per catchment shows how phosphate, E. coli or a metal changes along the way.",
  },
  {
    tab: "map",
    target: tabTitle("catchments"),
    placement: "bottom",
    title: "Catchment Explorer",
    body: "Ranks the catchments against each other and gives a plain-English summary of each one.",
  },
  {
    tab: "map",
    target: tabTitle("groups"),
    placement: "bottom",
    title: "Groups",
    body: "Introduces each citizen science group and shows where its sites are.",
  },
  {
    tab: "map",
    target: tabTitle("data"),
    placement: "bottom",
    title: "Quality Assurance",
    body: "The checks that show the results can be trusted, such as control blanks: clean water tested in the same way as a real sample.",
  },
  {
    tab: "map",
    target: () => $(".headerFilters"),
    placement: "bottom",
    title: "Filter everything from here",
    body: "Choose a season, a group, a catchment or a river. These filters apply on every tab, and the count shows how many sites are left. Reset filters puts everything back.",
  },
  {
    tab: "map",
    target: () => $(".sidePanel", visibleView()),
    placement: "right",
    title: "Choose what the map shows",
    body: "Colour the sites by phosphate or E. coli, or just show where they are. Click an item in the key to show only the sites in that band.",
  },
  {
    tab: "map",
    target: () => $("arcgis-map", visibleView()),
    placement: "inside",
    title: "Click a site for its story",
    body: "Click any site on the map to open its details: where it is, its readings over time, and each survey with weather, photos and the E. coli plate photo.",
  },
  {
    tab: "map",
    target: mapButtons,
    placement: "left",
    title: "Change the map",
    body: "Use these buttons to open the background map choice (for example aerial imagery), add contextual layers (for example land use), and view the legend.",
  },
  {
    tab: "map",
    placement: "center",
    title: "You're ready to explore",
    body: "You can take this tour again at any time from the ? button at the top right.",
  },
];

let state = null; // { index, els, opener, onKey, onResize } while the tour is open

export function isPhone() {
  return window.matchMedia(PHONE).matches;
}

// ---------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------

export function startTour() {
  if (state || isPhone()) return;
  dismissOffer();
  const opener = document.activeElement;

  const backdrop = el("div", "tourBackdrop");
  const spotlight = el("div", "tourSpotlight");
  const card = el("div", "tourCard");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "tourTitle");
  card.setAttribute("aria-describedby", "tourBody");
  card.innerHTML = `
    <button type="button" class="tourClose" data-tour="close" aria-label="Close the tour">&times;</button>
    <p class="tourProgress" data-progress></p>
    <h2 id="tourTitle" class="tourTitle"></h2>
    <p id="tourBody" class="tourText"></p>
    <div class="tourActions">
      <button type="button" class="tourBtn tourBtn--quiet" data-tour="close">Skip tour</button>
      <span class="tourDots" data-dots aria-hidden="true"></span>
      <button type="button" class="tourBtn" data-tour="back">Back</button>
      <button type="button" class="tourBtn tourBtn--primary" data-tour="next">Next</button>
    </div>`;
  document.body.append(backdrop, spotlight, card);

  const onKey = (event) => {
    // Nothing else (the map shortcuts, say) should react while the tour is open.
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); stopTour(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    else if (event.key === "Tab") trapFocus(event, card);
  };
  const onResize = () => {
    if (isPhone()) stopTour();
    else show(state.index, { switchTab: false });
  };
  card.addEventListener("click", (event) => {
    const action = event.target.closest("[data-tour]")?.dataset.tour;
    if (action === "next") go(1);
    else if (action === "back") go(-1);
    else if (action === "close") stopTour();
  });
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);

  state = { index: 0, els: { backdrop, spotlight, card }, opener, onKey, onResize };
  markSeen();
  show(0, { switchTab: true });
}

export function stopTour() {
  if (!state) return;
  const { els, opener, onKey, onResize } = state;
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", onResize);
  Object.values(els).forEach((e) => e.remove());
  state = null;
  if (opener?.isConnected) opener.focus?.();
}

function go(step) {
  const next = state.index + step;
  if (next < 0) return;
  if (next >= STEPS.length) { stopTour(); return; }
  state.index = next;
  show(next, { switchTab: true });
}

// ---------------------------------------------------------------------
// One step
// ---------------------------------------------------------------------

async function show(index, { switchTab }) {
  const step = STEPS[index];
  const { spotlight, card } = state.els;

  if (switchTab && step.tab) await selectTab(step.tab);
  if (!state || state.index !== index) return; // closed or moved on while the tab changed

  $("[data-progress]", card).textContent = `Step ${index + 1} of ${STEPS.length}`;
  $("#tourTitle", card).textContent = step.title;
  $("#tourBody", card).textContent = step.body;
  $("[data-dots]", card).innerHTML = STEPS.map((_, i) => `<i class="${i === index ? "isOn" : ""}"></i>`).join("");
  const back = $('[data-tour="back"]', card);
  const next = $('[data-tour="next"]', card);
  back.hidden = index === 0;
  next.textContent = index === STEPS.length - 1 ? "Done" : index === 0 ? "Start tour" : "Next";

  const rect = toRect(step.target?.());
  if (rect) {
    spotlight.hidden = false;
    Object.assign(spotlight.style, {
      left: `${rect.left - PAD}px`, top: `${rect.top - PAD}px`,
      width: `${rect.right - rect.left + PAD * 2}px`, height: `${rect.bottom - rect.top + PAD * 2}px`,
    });
  } else {
    spotlight.hidden = true;
  }
  // A target as wide as the screen (the side panel on a tablet, where it sits
  // under the map) has no room beside it, so the card goes above it.
  let placement = rect ? step.placement : "center";
  if ((placement === "left" || placement === "right") && rect.right - rect.left > window.innerWidth * 0.5) placement = "top";
  place(card, rect, placement);
  next.focus({ preventScroll: true });
}

// Makes the tab current the way a click would, and waits for it to show.
async function selectTab(view) {
  if (visibleView()?.dataset.view === view) return;
  tabTitle(view)()?.click();
  await new Promise((resolve) => setTimeout(resolve, 450));
}

function toRect(target) {
  if (!target) return null;
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
  return r.right - r.left > 0 && r.bottom - r.top > 0 ? r : null;
}

// Puts the card next to the target, kept on screen; flips to the other
// side when there isn't room.
function place(card, rect, placement) {
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  let left;
  let top;

  if (!rect || placement === "center") {
    left = (vw - w) / 2;
    top = (vh - h) / 2;
  } else if (placement === "inside") {
    left = rect.left + (rect.right - rect.left - w) / 2;
    top = rect.top + (rect.bottom - rect.top - h) / 2;
  } else if (placement === "left" || placement === "right") {
    const roomRight = vw - rect.right - GAP - margin;
    const roomLeft = rect.left - GAP - margin;
    const useRight = placement === "right" ? roomRight >= w || roomRight >= roomLeft : roomLeft < w && roomRight > roomLeft;
    left = useRight ? rect.right + GAP + PAD : rect.left - w - GAP - PAD;
    top = rect.top;
  } else {
    const roomBelow = vh - rect.bottom - GAP - margin;
    const below = placement === "bottom" ? roomBelow >= h || roomBelow >= rect.top : roomBelow >= h && rect.top < h;
    top = below ? rect.bottom + GAP + PAD : rect.top - h - GAP - PAD;
    left = rect.left + (rect.right - rect.left - w) / 2;
  }
  card.style.left = `${Math.min(Math.max(margin, left), Math.max(margin, vw - w - margin))}px`;
  card.style.top = `${Math.min(Math.max(margin, top), Math.max(margin, vh - h - margin))}px`;
}

function trapFocus(event, card) {
  const focusable = [...card.querySelectorAll("button:not([hidden])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!card.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

// ---------------------------------------------------------------------
// First visit
// ---------------------------------------------------------------------

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch (error) { /* private window etc. - it will just be offered again */ }
}

function hasSeen() {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch (error) { return false; }
}

function dismissOffer() {
  $(".tourOffer")?.remove();
}

// A small card in the corner, once, on a screen big enough for the tour.
function offerTour() {
  if (hasSeen() || isPhone() || $(".tourOffer")) return;
  const offer = el("div", "tourOffer");
  offer.setAttribute("role", "region");
  offer.setAttribute("aria-label", "Dashboard tour");
  offer.innerHTML = `
    <p class="tourOfferTitle">New here?</p>
    <p class="tourOfferText">Take a one-minute tour of the dashboard.</p>
    <div class="tourOfferActions">
      <button type="button" class="tourBtn tourBtn--quiet" data-offer="no">Not now</button>
      <button type="button" class="tourBtn tourBtn--primary" data-offer="yes">Take the tour</button>
    </div>`;
  offer.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-offer]")?.dataset.offer;
    if (choice === "yes") startTour();
    else if (choice === "no") { markSeen(); dismissOffer(); }
  });
  document.body.append(offer);
}

// Wires the header button and, after a pause for the page to settle,
// makes the first-visit offer.
export function initTour(buttonEl) {
  buttonEl?.addEventListener("click", startTour);
  setTimeout(offerTour, 2500);
}
