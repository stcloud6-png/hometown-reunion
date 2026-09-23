import { build } from "esbuild";
import { mkdir, copyFile, readdir, writeFile } from "node:fs/promises";
const outdir = "/tmp/reunion-plan-qa";
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ["tests/event-plan-harness.tsx"],
  bundle: true, outfile: `${outdir}/test.js`, jsx: "automatic",
  alias: { "@": `${process.cwd()}/client/src` },
  define: {
    "import.meta.env.VITE_STUB_DATA": '"true"',
    "import.meta.env.VITE_SUPABASE_URL": '"https://reunion-test.invalid"',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '"synthetic-anon-key"',
    "import.meta.env.BASE_URL": '"/"',
    "process.env.NODE_ENV": '"development"',
  },
});
const css = (await readdir("dist/public/assets")).find((file) => file.endsWith(".css"));
await copyFile(`dist/public/assets/${css}`, `${outdir}/test.css`);
await writeFile(`${outdir}/index.html`, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>');
console.log(`Isolated harness built at ${outdir}. REST requests must be mocked.`);
