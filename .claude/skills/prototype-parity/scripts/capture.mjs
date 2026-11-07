#!/usr/bin/env node
// Capture the HTML prototype and the running app side by side for parity review.
// Usage: node .claude/skills/prototype-parity/scripts/capture.mjs <route|all> [--app http://localhost:5173] [--proto-only] [--out parity]
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PROTO = join(ROOT, 'docs/design/prototype/index.html');

// Prototype hash route -> app path. Keep in step with frontend/src/app/router.tsx.
const ROUTES = {
  home: '/',
  import: '/import',
  map: '/import?step=map&sample=1',
  roadmap: '/roadmaps/0d3c9a52-6f0b-4b7e-8a51-2f1e9c7d6b31',
  swimlanes: '/diagrams/5b1f6c0e-2c1d-4c8e-9d43-7a1b2f3e4d50',
  export: '/exports',
};
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const VALUE_FLAGS = new Set(['--app', '--out']);
const route = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1])) ?? 'all';
const appBase = opt('--app', 'http://localhost:5173');
const outDir = resolve(ROOT, opt('--out', 'parity'));
const protoOnly = args.includes('--proto-only');
const routes = route === 'all' ? Object.keys(ROUTES) : [route];
for (const r of routes) {
  if (!(r in ROUTES)) {
    console.error(`Unknown route "${r}". Use one of: ${Object.keys(ROUTES).join(', ')}, all`);
    process.exit(2);
  }
}

function loadPlaywright() {
  const bases = [join(ROOT, 'frontend/package.json'), join(ROOT, 'package.json')];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    const req = createRequire(base);
    for (const mod of ['playwright', '@playwright/test', 'playwright-core']) {
      try {
        return req(mod);
      } catch {}
    }
  }
  console.error('Playwright not found. Run `pnpm -C frontend add -D @playwright/test && pnpm -C frontend exec playwright install chromium`.');
  process.exit(2);
}

const { chromium } = loadPlaywright();
const launch = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launch);
mkdirSync(outDir, { recursive: true });

let appUp = !protoOnly;
if (appUp) {
  try {
    const res = await fetch(appBase, { signal: AbortSignal.timeout(3000) });
    appUp = res.ok;
  } catch {
    appUp = false;
  }
  if (!appUp) console.warn(`App not reachable at ${appBase} — capturing the prototype only. Start it with \`make dev\`.`);
}

const written = [];
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const r of routes) {
    await page.goto(`${pathToFileURL(PROTO).href}#${r}`);
    await page.waitForTimeout(300);
    const hide = page.locator('.guide [data-act="guide"][data-v="0"]');
    if ((await hide.count()) && (await hide.first().isVisible())) await hide.first().click();
    if (r === 'map') {
      const sample = page.locator('[data-act="sample"]');
      if (await sample.count()) await sample.first().click();
    }
    await page.waitForTimeout(150);
    const p = join(outDir, `${r}-${vp.width}-proto.png`);
    await page.screenshot({ path: p });
    written.push(p);
    if (appUp) {
      await page.goto(new URL(ROUTES[r], appBase).href, { waitUntil: 'networkidle' });
      const a = join(outDir, `${r}-${vp.width}-app.png`);
      await page.screenshot({ path: a });
      written.push(a);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(written.map((w) => w.replace(ROOT + '/', '')).join('\n'));
