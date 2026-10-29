// Capture every screen of a page at 1440x900 and 390x844 into a new, empty directory.
// Exits 1 on an error page, a blank frame, or text on screen that is invisible.
// These checks catch some failures, not all: open every frame before judging it.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [url, outArg] = process.argv.slice(2);
if (!url || !outArg) {
  console.error('usage: node scripts/shoot.mjs <url> <new-out-dir>');
  process.exit(2);
}
const out = resolve(outArg);
if (existsSync(out) && readdirSync(out).length) {
  console.error(`${out} is not empty; use a new directory per run so old frames never mix in`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const sizes = [
  { tag: 'd', viewport: { width: 1440, height: 900 } },
  { tag: 'm', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const MAX_FRAMES = 12;
const problems = [];
const browser = await chromium.launch();

for (const { tag, ...context } of sizes) {
  const page = await (await browser.newContext(context)).newPage();
  const response = await page.goto(url, { waitUntil: 'networkidle' }).catch(error => {
    problems.push(`${tag}: ${error.message.split('\n')[0]}`);
    return null;
  });
  if (!response) continue;
  if (!response.ok()) problems.push(`${tag}: HTTP ${response.status()}`);
  await page.waitForTimeout(1200);

  const screen = await page.evaluate(() => innerHeight);
  let frame = 0;
  for (let y = 0; ; y += screen) {
    if (frame === MAX_FRAMES) {
      problems.push(`${tag}: stopped at ${MAX_FRAMES} screens before the end of the page`);
      break;
    }
    await page.evaluate(top => window.scrollTo(0, top), y);
    await page.waitForTimeout(900);
    const file = join(out, `${tag}-${++frame}.png`);
    await page.screenshot({ path: file });

    const { channels } = await sharp(file).stats();
    if (Math.max(...channels.map(c => c.stdev)) < 3) problems.push(`${file}: blank frame`);

    const invisible = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,p,a,li,blockquote,figcaption,button')]
      .filter(el => {
        const box = el.getBoundingClientRect();
        if (!el.textContent.trim() || box.bottom <= 0 || box.top >= innerHeight || box.width === 0) return false;
        // Closed menus and dialogs hide text on purpose; text stuck at zero opacity does not.
        if (el.closest('[aria-hidden="true"],[inert],[hidden],dialog:not([open])')) return false;
        if (getComputedStyle(el).visibility === 'hidden') return false;
        if (el.closest('.map--home.map--wide .stn:not(.stn--big)')) return false; // home map: a line's stations show when the line is focused
        let opacity = 1;
        for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        return opacity < 0.05;
      }).length);
    if (invisible) problems.push(`${file}: ${invisible} text elements on screen are invisible`);
    console.log(file);

    // Height is re-read each time: lazy sections can grow the page while scrolling.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    if (y + screen >= height) break;
  }
}

await browser.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
