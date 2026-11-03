// =====================================================================
// GENERATE CATCHMENT SUMMARIES
// Step 2 of the catchment summaries (see README, "Catchment summaries").
// Writes a short plain-English summary of each catchment's citizen
// science results with Claude, from the numbers in data/catchment-facts.json
// (run scripts/catchment-facts.mjs first), and saves them to
// data/catchment-summaries.json.
//
//   ANTHROPIC_API_KEY=... node scripts/generate-catchment-summaries.mjs
//   node scripts/generate-catchment-summaries.mjs --force        redo every summary
//   node scripts/generate-catchment-summaries.mjs --only Foss    redo one catchment
//
// Every summary is saved with "approved": false. The dashboard only shows
// approved summaries to the public: read each one, edit the text if you
// like, and set "approved": true (and "reviewedBy" / "reviewedAt"). A
// summary whose facts haven't changed is left alone on re-runs, so an
// approved one is never overwritten by accident.
// Each entry also has a separate "metals" part (a short note on the lab
// metals results, with its own "approved" flag, reviewed the same way).
// =====================================================================

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const FACTS = new URL("../data/catchment-facts.json", import.meta.url);
const OUTPUT = new URL("../data/catchment-summaries.json", import.meta.url);
const MODEL = "claude-sonnet-5-5";

const SYSTEM_PROMPT = `You write short summaries of river water quality results for the public, for a dashboard run by The Rivers Trust. The results come from volunteer citizen scientists who test sites with simple field kits.

Rules:
- Write 70 to 110 words of plain, friendly UK English in one or two short paragraphs. No headings, bullet points or markdown.
- Use only the facts you are given. Never invent or estimate a number, site, river or cause. Every number you quote must appear in the facts.
- Explain the results in everyday terms. Phosphate is a nutrient that can come from sewage and farmland and, in excess, harms river life. E. coli is a bacterium found in human and animal waste; the dashboard counts a reading of 10 cfu or more as "bad".
- Do not blame, name or imply any person, business, farm or water company. Never say what caused a result. If volunteers' notes mention possible pollution sources, say only that volunteers noted things such as that (in general terms), without naming who or where it might come from.
- Do not give health advice, and do not add a disclaimer about the results being snapshots or unofficial (the dashboard page already says so).
- Mention the season the results are from, how many sites were surveyed, and the overall picture for phosphate and E. coli, picking out the clearest highs and lows.
- Be balanced: say what is going well as well as what is a concern.`;

// The metals have no agreed thresholds, and the lab's units aren't confirmed
// in the data, so this prompt keeps to what was detected - never what is safe.
const METALS_PROMPT = `You write a short note on the lab metals results for a catchment, for the public, on a dashboard run by The Rivers Trust. Water samples from each site were tested in a lab for 24 metals.

Rules:
- Write 50 to 90 words of plain, friendly UK English in one paragraph. No headings, bullet points or markdown.
- Use only the facts you are given. Never invent a number, site or river. Every count you quote must appear in the facts.
- "Detected" means the metal was found above the lab's limit of detection. Say what was found at how many sites, and where the highest results were (name the site and river). Do not quote the measured values or any units - the units are not yet confirmed.
- There are no agreed thresholds, so never say a result is high, low, safe, unsafe, good or bad, and do not compare with any standard. End by saying that thresholds for these metals have not yet been established, so it is not yet possible to say whether a result is good or bad.
- Everyday minerals (calcium, magnesium, sodium, potassium) are normal in river water: mention that they were found at every site if they were.
- Do not say what caused any result, and do not blame or imply any person, business, farm or water company. Do not give health advice.`;

const hashOf = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

async function askClaude(system, content) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? `HTTP ${response.status}`);
  return json.content.filter((block) => block.type === "text").map((block) => block.text).join("").trim();
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return fallback;
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first, e.g.  ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-catchment-summaries.mjs");
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const facts = await readJson(FACTS, null);
if (!facts) {
  console.error("data/catchment-facts.json not found - run scripts/catchment-facts.mjs first.");
  process.exit(1);
}
const output = await readJson(OUTPUT, { summaries: [] });
const existing = new Map(output.summaries.map((s) => [`${s.catchment}|${s.season}`, s]));

for (const [catchment, catchmentFacts] of Object.entries(facts.catchments)) {
  if (only && catchment !== only) continue;
  for (const [season, seasonFacts] of Object.entries(catchmentFacts.seasons)) {
    const key = `${catchment}|${season}`;
    const factsHash = hashOf({ catchment, season, seasonFacts, sites: catchmentFacts.sites });
    const current = existing.get(key);
    let entry = current;
    if (current && current.factsHash === factsHash && !force && !only) {
      console.log(`${catchment} ${season}: unchanged, kept`);
    } else {
      process.stdout.write(`${catchment} ${season}: writing... `);
      const summary = await askClaude(
        SYSTEM_PROMPT,
        `Write the summary for the ${catchment} catchment, season ${season}.\n\nFacts (JSON):\n${JSON.stringify({
          catchment, season, sites: catchmentFacts.sites, rivers: catchmentFacts.rivers, groups: catchmentFacts.groups, ...seasonFacts, thresholds: facts.thresholds,
        }, null, 2)}`
      );
      entry = {
        catchment,
        season,
        summary,
        facts: {
          sitesInCatchment: catchmentFacts.sites,
          sitesSurveyed: seasonFacts.sitesSurveyed,
          phosphate: seasonFacts.phosphate,
          ecoli: seasonFacts.ecoli,
        },
        factsHash,
        model: MODEL,
        generatedAt: new Date().toISOString(),
        approved: false,
        ...(current?.metals ? { metals: current.metals } : {}),
      };
      console.log("done (draft - needs review)");
    }

    // The metals note, reviewed separately from the main summary.
    const metalsFacts = catchmentFacts.metals;
    if (metalsFacts) {
      const metalsHash = hashOf({ catchment, metalsFacts });
      if (!entry.metals || entry.metals.factsHash !== metalsHash || force || only) {
        process.stdout.write(`${catchment} metals: writing... `);
        const note = await askClaude(
          METALS_PROMPT,
          `Write the metals note for the ${catchment} catchment.\n\nFacts (JSON):\n${JSON.stringify({ catchment, ...metalsFacts }, null, 2)}`
        );
        entry.metals = {
          summary: note,
          facts: {
            sitesSampled: metalsFacts.sitesSampled,
            sitesInCatchment: metalsFacts.sitesInCatchment,
            focusMetals: metalsFacts.focusMetals.map((m) => ({ metal: m.metal, detectedAtSites: m.detectedAtSites })),
          },
          factsHash: metalsHash,
          model: MODEL,
          generatedAt: new Date().toISOString(),
          approved: false,
        };
        console.log("done (draft - needs review)");
      }
    }
    existing.set(key, entry);
  }
}

const summaries = [...existing.values()].sort((a, b) => a.catchment.localeCompare(b.catchment, "en-GB") || a.season.localeCompare(b.season));
await writeFile(OUTPUT, `${JSON.stringify({ summaries }, null, 2)}\n`);
console.log(`Saved ${summaries.length} summaries to data/catchment-summaries.json (${summaries.filter((s) => s.approved).length} approved).`);
