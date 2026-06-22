// Build step (dev-only). Bundles src/*.ts into dist/ with esbuild:
//   cli.ts    -> dist/helm.mjs   (Node, executable)
//   server.ts -> dist/server.mjs (Node)
//   board.ts + board.css -> inlined into dist/board.html (browser)
// Runtime stays zero-dependency: dist/ runs with a bare `node` (DEVRULES B1/B3).
// `node build.mjs --check` fails if dist/ is out of sync with src/ (DEVRULES B2).
import { build } from "esbuild";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const SRC = join(root, "src");
const DIST = join(root, "dist");
const checkMode = process.argv.includes("--check");
const SHEBANG = "#!/usr/bin/env node\n";

async function bundleNode(entry) {
  const r = await build({
    entryPoints: [join(SRC, entry)],
    bundle: true, platform: "node", format: "esm", target: "node18",
    write: false, legalComments: "none",
  });
  return r.outputFiles[0].text;
}

async function bundleBrowser(entry) {
  const r = await build({
    entryPoints: [join(SRC, entry)],
    bundle: true, platform: "browser", format: "iife", target: "es2019",
    write: false, legalComments: "none",
  });
  return r.outputFiles[0].text;
}

const cli = SHEBANG + (await bundleNode("cli.ts"));
const server = await bundleNode("server.ts");
const boardJs = await bundleBrowser("board.ts");
const css = await readFile(join(SRC, "board.css"), "utf8");
let html = await readFile(join(SRC, "board.html"), "utf8");
html = html.replace("/*INLINE_CSS*/", () => css).replace("/*INLINE_JS*/", () => boardJs);

const outputs = { "helm.mjs": cli, "server.mjs": server, "board.html": html };

if (checkMode) {
  const stale = [];
  for (const [name, content] of Object.entries(outputs)) {
    const p = join(DIST, name);
    const cur = existsSync(p) ? await readFile(p, "utf8") : null;
    if (cur !== content) stale.push(name);
  }
  if (stale.length) {
    console.error("dist/ out of sync with src/: " + stale.join(", ") + "\nRun `npm run build`.");
    process.exit(1);
  }
  console.log("dist/ is in sync ✓");
} else {
  await mkdir(DIST, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) await writeFile(join(DIST, name), content);
  await chmod(join(DIST, "helm.mjs"), 0o755);
  console.log("built dist/: " + Object.keys(outputs).join(", "));
}
