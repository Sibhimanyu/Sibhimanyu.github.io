// Refreshes the project screenshots in assets/. Run: npm run capture
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const TALL = { w: 640, h: 1200, dsf: 2 };
const SITES = [
  ['rasanai', 'https://sibhimanyu.github.io/rasanai/', 'rasanai-tall.jpg'],
  ['flotilla', 'https://sibhimanyu.github.io/flotilla/', 'flotilla-tall.jpg'],
  ['heresay', 'https://sibhimanyu.github.io/heresay/', 'heresay-tall.jpg'],
  ['squeak', 'https://sibhimanyu.github.io/squeak/', 'squeak-tall.jpg'],
  ['imago', 'https://imago.onslate.in/', 'imago-tall.jpg'],
  ['greenroom', 'https://sibhimanyu.github.io/greenroom/', 'greenroom-tall.jpg'],
  ['abhishri', 'https://abhishri-academy.web.app/public-calendar', 'abhishri-tall.jpg'],
  ['snof', 'https://snof-live.web.app/', 'snof-shot.jpg', { w: 990, h: 495, dsf: 2, wide: true }],
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function capture(browser, [name, url, file, vp = TALL]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dsf,
    reducedMotion: 'reduce',
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    // dismiss cookie/consent banners (click Accept, else hide anything that looks like one)
    await page.getByRole('button', { name: /^(accept|accept all|allow all|i agree|got it)$/i }).first().click({ timeout: 1500 }).catch(() => {});
    await page.addStyleTag({ content: '#zcb-banner,[class*="cookie" i],[id*="cookie" i],[class*="consent" i],[id*="consent" i]{display:none !important}' });
    // scroll down and back to trigger lazy content and scroll reveals
    await page.evaluate(async () => {
      const h = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      for (let y = 0; y < Math.min(h(), 6000); y += 300) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await sleep(1500);
    const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    const opts = { type: 'jpeg', quality: 82 };
    let buf;
    if (vp.wide) buf = await page.screenshot(opts);
    else if (height >= TALL.h) buf = await page.screenshot({ ...opts, fullPage: true, clip: { x: 0, y: 0, width: TALL.w, height: TALL.h } });
    else buf = await page.screenshot({ ...opts, fullPage: true });
    if (buf.length < 5000) throw new Error(`suspiciously small image (${buf.length} bytes)`);
    await writeFile(path.join(assets, file), buf);
    return `${file} (page height ${height}px)`;
  } finally {
    await ctx.close();
  }
}

const browser = await chromium.launch({ headless: true });
let ok = 0;
for (const site of SITES) {
  try { console.log(`OK   ${site[0]}: ${await capture(browser, site)}`); ok++; }
  catch (e) { console.log(`FAIL ${site[0]}: ${e.message.split('\n')[0]}`); }
}
await browser.close();
process.exit(ok === 0 ? 1 : 0);
