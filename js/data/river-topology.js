// =====================================================================
// RIVER TOPOLOGY
// Works out how a catchment's sites sit on the real river network, for
// the river diagrams. Uses the Open River Network (ORN):
//
//  1. Snap - each site is matched to a nearby ORN river section (within
//     RIVER_NETWORK.snapDistance), preferring one with the same name as
//     the site's river; a differently named section only counts if it's
//     within otherNameSnapMax. Sites with nothing suitable nearby (urban
//     becks in culverts, park lakes) are "off network".
//  2. Trace - from each snapped section, follow the network downstream
//     (a section's Tnode is the next one's Fnode; ORN lines are digitised
//     in flow direction) until the paths of every site meet.
//  3. Tree - from that meeting point, walk back upstream: the main stem
//     is the branch with the most river upstream of it (ORN US_Accum).
//     Sites on it are stations; every other group of sites becomes a
//     branch joining where its path first meets the stem, built the same
//     way recursively (so a beck joining a tributary hangs off that
//     tributary, not the main river).
//  4. Off-network sites are placed next to their numbered neighbours on
//     the same river; a river with no snapped site at all becomes a
//     branch flagged `approx` (drawn dashed) joining after the previous-
//     numbered site - or, if RIVER_DIAGRAM_JOINS says which river it
//     flows into, off that river's line.
//
// If the network can't be used for a catchment (too few sites snap, or
// their paths never meet, or a request fails), the whole tree is built
// from site numbering instead (fromNumbering below) - the older method.
//
// Tree shape (what js/charts/river-schematic.js draws):
//   line = { river, approx, items: [ { kind: "station", site, networkName? } |
//            { kind: "junction", line } ] }   items upstream -> downstream
// networkName is the ORN name of the section a site snapped to - used to
// name a branch whose sites are labelled with the main river's name
// (e.g. WC02 "River Wharfe" is really on the River Skirfare).
// =====================================================================

import { RIVER_NETWORK, RIVER_DIAGRAM_OVERRIDES, RIVER_DIAGRAM_JOINS } from "../config.js";

const ORN_FIELDS = "OBJECTID,name1,Fnode,Tnode,Strahler,US_Accum";
const TRACE_BUFFER = 5000; // m around a catchment's sites to load for tracing
const BNG = 27700; // sites' Easting/Northing and the ORN's own SR

const networkCache = new Map(); // catchment -> Promise<{ snaps, segments } | null>

// sites: attribute objects (site_name, Number, River_Waterbody, Easting,
// Northing) - the filtered ones to draw. allSites: every site in that
// catchment, so the (cached) network lookup doesn't depend on filters.
export async function buildRiverTree(catchment, sites, allSites) {
  let network = null;
  try {
    if (!networkCache.has(catchment)) networkCache.set(catchment, loadNetwork(allSites));
    network = await networkCache.get(catchment);
  } catch (error) {
    console.warn(`AQuA dashboard: river network lookup failed for ${catchment}:`, error);
    networkCache.delete(catchment); // try again next time
  }
  const tree = network && fromNetwork(sites, network);
  return tree ? { root: tree, source: "network" } : { root: fromNumbering(sites), source: "numbering" };
}

// ---------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------

async function ornQuery(params) {
  const body = new URLSearchParams({ f: "json", inSR: BNG, outSR: BNG, ...params });
  const response = await fetch(`${RIVER_NETWORK.url}/query`, { method: "POST", body });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json;
}

async function loadNetwork(allSites) {
  const located = allSites.filter((s) => s.Easting != null && s.Northing != null);
  if (located.length < 2) return null;

  // 1. Sections near any site, with geometry, for snapping.
  const near = await ornQuery({
    geometry: JSON.stringify({ points: located.map((s) => [s.Easting, s.Northing]), spatialReference: { wkid: BNG } }),
    geometryType: "esriGeometryMultipoint",
    spatialRel: "esriSpatialRelIntersects",
    distance: RIVER_NETWORK.snapDistance,
    units: "esriSRUnit_Meter",
    outFields: ORN_FIELDS,
    returnGeometry: true,
  });
  const snaps = new Map();
  for (const site of located) {
    const snap = snapSite(site, near.features ?? []);
    if (snap) snaps.set(site.site_name, snap);
  }

  // 2. Every section around the catchment (attributes only), for tracing.
  const xs = located.map((s) => s.Easting);
  const ys = located.map((s) => s.Northing);
  const envelope = [Math.min(...xs) - TRACE_BUFFER, Math.min(...ys) - TRACE_BUFFER, Math.max(...xs) + TRACE_BUFFER, Math.max(...ys) + TRACE_BUFFER].join(",");
  const segments = [];
  for (let offset = 0; ; ) {
    const page = await ornQuery({
      geometry: envelope,
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      outFields: ORN_FIELDS,
      returnGeometry: false,
      resultOffset: offset,
      resultRecordCount: 2000,
    });
    segments.push(...page.features.map((f) => f.attributes));
    if (!page.exceededTransferLimit) break;
    offset += page.features.length;
  }
  return { snaps, segments };
}

// Loose name match: "Foss" = "River Foss", "Crimple Beck" = "River Crimple".
const normaliseName = (name) => String(name ?? "").toLowerCase().replace(/\b(river|beck|dike|dyke|brook|the)\b/g, "").replace(/[^a-z]/g, "");

function snapSite(site, features) {
  const override = RIVER_DIAGRAM_OVERRIDES[site.site_name] ?? {};
  if (override.offNetwork) return null;

  const candidates = features
    .map((f) => ({ attrs: f.attributes, ...nearestOnPath(site.Easting, site.Northing, f.geometry?.paths ?? []) }))
    .filter((c) => c.distance <= RIVER_NETWORK.snapDistance)
    .sort((a, b) => a.distance - b.distance);
  if (!candidates.length) return null;

  const wanted = normaliseName(override.snapTo ?? site.River_Waterbody);
  const named = candidates.filter((c) => normaliseName(c.attrs.name1) === wanted);
  if (override.snapTo) return named[0] ? toSnap(named[0]) : null;

  // Same-name sections near the nearest one win; among those, the bigger
  // channel (a side channel can share the main river's name).
  const nearest = candidates[0];
  const goodNamed = named
    .filter((c) => c.distance <= nearest.distance * 3 + 30)
    .sort((a, b) => b.attrs.Strahler - a.attrs.Strahler || a.distance - b.distance);
  if (goodNamed.length) return toSnap(goodNamed[0]);
  return nearest.distance <= RIVER_NETWORK.otherNameSnapMax ? toSnap(nearest) : null;
}

const toSnap = (c) => ({ id: c.attrs.OBJECTID, along: c.along });

// Distance from a point to a polyline, and how far along it (0-1) the
// nearest point is - used to order sites on the same section.
function nearestOnPath(x, y, paths) {
  let best = { distance: Infinity, along: 0 };
  let total = 0;
  const lengths = paths.map((p) => p.slice(1).reduce((sum, pt, i) => sum + Math.hypot(pt[0] - p[i][0], pt[1] - p[i][1]), 0));
  const fullLength = lengths.reduce((a, b) => a + b, 0) || 1;
  paths.forEach((path) => {
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (len * len))) : 0;
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < best.distance) best = { distance: d, along: (total + t * len) / fullLength };
      total += len;
    }
  });
  return best;
}

// ---------------------------------------------------------------------
// Tree from the network
// ---------------------------------------------------------------------

function fromNetwork(sites, { snaps, segments }) {
  const byId = new Map(segments.map((s) => [s.OBJECTID, s]));
  const byFnode = new Map();
  for (const s of segments) (byFnode.get(s.Fnode) ?? byFnode.set(s.Fnode, []).get(s.Fnode)).push(s);

  // Downstream path (section ids) from a section, within what's loaded.
  // At a split (braids, mill leats) follow the bigger channel.
  const downstream = (startId) => {
    const path = [startId];
    const seen = new Set(path);
    for (let current = byId.get(startId); current; ) {
      const next = (byFnode.get(current.Tnode) ?? [])
        .filter((s) => !seen.has(s.OBJECTID))
        .sort((a, b) => b.Strahler - a.Strahler)[0];
      if (!next) break;
      path.push(next.OBJECTID);
      seen.add(next.OBJECTID);
      current = next;
    }
    return path;
  };

  const onNetwork = [];
  const offNetwork = [];
  for (const site of sites) {
    const snap = snaps.get(site.site_name);
    if (snap && byId.has(snap.id)) onNetwork.push({ site, snap, path: downstream(snap.id) });
    else offNetwork.push(site);
  }
  if (onNetwork.length < 2) return null;

  // The sections every path passes through; the first is where they meet.
  const shared = onNetwork[0].path.filter((id) => onNetwork.every((n) => n.path.includes(id)));
  if (!shared.length) return null;

  const root = buildLine(shared[0], onNetwork, byId, segments);
  placeOffNetwork(root, offNetwork, sites);
  return root;
}

// One line of the tree: the stem from `rootId` upstream, its stations,
// and junctions to sub-lines for every other group of sites.
function buildLine(rootId, members, byId, segments) {
  // Only the sections these sites' paths use, up to and including root.
  const used = new Set();
  for (const m of members) {
    for (const id of m.path) {
      used.add(id);
      if (id === rootId) break;
    }
  }
  const byTnode = new Map();
  for (const s of segments) {
    if (used.has(s.OBJECTID)) (byTnode.get(s.Tnode) ?? byTnode.set(s.Tnode, []).get(s.Tnode)).push(s);
  }

  // Stem: from root upstream, always the branch with most river above it.
  const stem = [rootId];
  for (let current = byId.get(rootId); ; ) {
    const up = (byTnode.get(current.Fnode) ?? []).sort((a, b) => b.US_Accum - a.US_Accum)[0];
    if (!up) break;
    stem.unshift(up.OBJECTID);
    current = up;
  }
  const stemIndex = new Map(stem.map((id, i) => [id, i])); // 0 = furthest upstream

  const items = [];
  const groups = new Map(); // entry section -> members joining through it
  for (const m of members) {
    if (stemIndex.has(m.snap.id)) {
      items.push({ kind: "station", site: m.site, networkName: byId.get(m.snap.id)?.name1 || null, key: [stemIndex.get(m.snap.id), m.snap.along, m.site.Number] });
      continue;
    }
    // Where this site's path reaches the stem, and the section it comes in by.
    const at = m.path.findIndex((id) => stemIndex.has(id));
    const entry = m.path[at - 1];
    const group = groups.get(entry) ?? { joinId: m.path[at], members: [] };
    group.members.push(m);
    groups.set(entry, group);
  }
  for (const [entry, group] of groups) {
    // A branch joins at the upstream end of the stem section it flows
    // into - before any station on that section.
    items.push({ kind: "junction", line: buildLine(entry, group.members, byId, segments), key: [stemIndex.get(group.joinId), -1, 0] });
  }
  items.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);

  const stations = items.filter((it) => it.kind === "station");
  return { river: mostCommonRiver(stations.map((it) => it.site)), approx: false, items: items.map(({ key, ...it }) => it) };
}

function mostCommonRiver(sites) {
  const counts = new Map();
  for (const s of sites) counts.set(s.River_Waterbody, (counts.get(s.River_Waterbody) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// Off-network sites: next to the nearest-numbered site on the same river
// if there is one (before the next one downstream, else after the one
// above); otherwise a dashed branch - off the river RIVER_DIAGRAM_JOINS
// names for it, or else after the previous-numbered site.
function placeOffNetwork(root, offNetwork, sites) {
  if (!offNetwork.length) return;
  const where = () => {
    const map = new Map();
    const walk = (line) => line.items.forEach((it, i) => {
      if (it.kind === "station") map.set(it.site.site_name, { line, i, approx: line.approx });
      else walk(it.line);
    });
    walk(root);
    return map;
  };

  const ordered = [...offNetwork].sort((a, b) => a.Number - b.Number);
  const leftover = [];
  for (const site of ordered) {
    const placed = where();
    const sameRiver = sites
      .filter((s) => s !== site && s.River_Waterbody === site.River_Waterbody && placed.has(s.site_name))
      .sort((a, b) => a.Number - b.Number);
    const below = sameRiver.find((s) => s.Number > site.Number);
    const above = [...sameRiver].reverse().find((s) => s.Number < site.Number);
    if (below) {
      const { line, i } = placed.get(below.site_name);
      line.items.splice(i, 0, { kind: "station", site });
    } else if (above) {
      const { line, i } = placed.get(above.site_name);
      line.items.splice(i + 1, 0, { kind: "station", site });
    } else {
      leftover.push(site);
    }
  }

  // Rivers with no network site at all: one dashed branch per river.
  // Ones with a known receiving river go last, so that river's own
  // (possibly also estimated) line is already in the tree.
  const byRiver = new Map();
  for (const site of leftover) (byRiver.get(site.River_Waterbody) ?? byRiver.set(site.River_Waterbody, []).get(site.River_Waterbody)).push(site);
  const joinFor = (river) => Object.entries(RIVER_DIAGRAM_JOINS).find(([name]) => sameName(name, river))?.[1];
  const rivers = [...byRiver.keys()].sort((a, b) => Boolean(joinFor(a)) - Boolean(joinFor(b)));
  for (const river of rivers) {
    const riverSites = byRiver.get(river);
    const branch = { river, approx: true, items: riverSites.map((site) => ({ kind: "station", site })) };
    if (attachByJoin(root, branch, joinFor(river))) continue;
    const placed = where();
    const first = Math.min(...riverSites.map((s) => s.Number));
    // Only hang an estimated branch off a network line - not off another
    // estimate.
    const previous = sites
      .filter((s) => placed.has(s.site_name) && !placed.get(s.site_name).approx && s.Number < first)
      .sort((a, b) => b.Number - a.Number)[0];
    if (previous) {
      const { line, i } = placed.get(previous.site_name);
      line.items.splice(i + 1, 0, { kind: "junction", line: branch });
    } else {
      root.items.unshift({ kind: "junction", line: branch });
    }
  }
}

const sameName = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

// Hangs `branch` off the line of the river it flows into (per
// RIVER_DIAGRAM_JOINS): after the given site, or else at that line's
// upstream end. False if there's no join or that river isn't drawn.
function attachByJoin(root, branch, join) {
  if (!join) return false;
  let target = null;
  const walk = (line) => {
    if (!target && line.items.some((it) => it.kind === "station" && sameName(it.site.River_Waterbody, join.into))) target = line;
    line.items.forEach((it) => { if (it.kind === "junction") walk(it.line); });
  };
  walk(root);
  if (!target) return false;
  const afterIndex = join.after ? target.items.findIndex((it) => it.kind === "station" && it.site.site_name === join.after) : -1;
  target.items.splice(afterIndex + 1, 0, { kind: "junction", line: branch });
  return true;
}

// ---------------------------------------------------------------------
// Fallback: tree from site numbering (the original river-diagram rules)
// ---------------------------------------------------------------------

// Main line = river with most sites (ties: reaching furthest down); a
// river wholly before/after it continues the line; any other river is a
// branch joining after the last main-line site numbered below its own
// last site. One level of branches only.
export function fromNumbering(sites) {
  const byRiver = new Map();
  for (const s of [...sites].sort((a, b) => a.Number - b.Number)) {
    (byRiver.get(s.River_Waterbody) ?? byRiver.set(s.River_Waterbody, []).get(s.River_Waterbody)).push(s);
  }
  const last = (list) => list[list.length - 1].Number;
  const mainName = [...byRiver.keys()].sort((a, b) =>
    byRiver.get(b).length - byRiver.get(a).length || last(byRiver.get(b)) - last(byRiver.get(a)))[0];
  const main = byRiver.get(mainName) ?? [];
  const minMain = main[0]?.Number ?? 0;
  const maxMain = main.length ? last(main) : 0;

  const mainSites = [...main];
  const branches = [];
  for (const [river, list] of byRiver) {
    if (river === mainName) continue;
    if (last(list) < minMain || list[0].Number > maxMain) mainSites.push(...list);
    else branches.push({ river, list });
  }
  mainSites.sort((a, b) => a.Number - b.Number);

  const items = mainSites.map((site) => ({ kind: "station", site, n: site.Number }));
  for (const br of branches) {
    // Junction just after the last main site numbered below the branch's
    // last site (n + 0.5 sorts it there).
    const before = mainSites.filter((s) => s.Number < last(br.list)).at(-1);
    items.push({
      kind: "junction",
      n: (before?.Number ?? -Infinity) + 0.5 + last(br.list) / 1e6,
      line: { river: br.river, approx: true, items: br.list.map((site) => ({ kind: "station", site })) },
    });
  }
  items.sort((a, b) => a.n - b.n);
  return { river: mainName, approx: false, items: items.map(({ n, ...it }) => it) };
}
