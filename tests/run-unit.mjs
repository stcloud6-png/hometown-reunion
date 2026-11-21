// Runs the plain-assert unit tests with no network and no database.
// Usage: node tests/run-unit.mjs
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";

const tests = ["tests/event-review.test.ts", "tests/class-events.test.ts", "tests/weather-estimate.test.ts"];
const outdir = "/tmp/reunion-unit";
await mkdir(outdir, { recursive: true });
let failed = 0;
for (const entry of tests) {
  const outfile = `${outdir}/${entry.split("/").pop().replace(/\.ts$/, ".mjs")}`;
  await build({
    entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile, logLevel: "error",
    alias: { "@": `${process.cwd()}/client/src` },
    define: { "import.meta.env": "{}", "import.meta.env.VITE_STUB_DATA": '"true"', "import.meta.env.BASE_URL": '"/"' },
  });
  try {
    process.stdout.write(execFileSync("node", [outfile], { encoding: "utf8" }));
  } catch (e) {
    failed++;
    process.stdout.write(`FAIL ${entry}\n${e.stdout ?? ""}${e.stderr ?? ""}\n`);
  }
}
process.exit(failed ? 1 : 0);
