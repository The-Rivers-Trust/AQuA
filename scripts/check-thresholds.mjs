// =====================================================================
// CHECK THRESHOLDS
// Checks data/thresholds.json the way the dashboard does when it loads it,
// and prints the bands as they will appear, so an edit can be checked
// before it's committed:
//
//   npm run check:thresholds
// =====================================================================

import { loadThresholds } from "../js/thresholds.js";

try {
  const metrics = await loadThresholds();
  for (const [name, metric] of Object.entries(metrics)) {
    console.log(`${name} (${metric.label}, ${metric.unit}):`);
    let lower = null;
    for (const band of metric.bands) {
      const range = band.max == null ? `above ${lower}` : lower == null ? `up to ${band.max}` : `above ${lower}, up to ${band.max}`;
      console.log(`  ${band.color}  ${band.label.padEnd(24)} ${range}`);
      lower = band.max ?? lower;
    }
  }
  console.log("\ndata/thresholds.json is fine.");
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}
