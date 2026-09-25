import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const baseURL = process.env.SITE_URL ?? 'http://127.0.0.1:4321';
const browser = await chromium.launch({ headless: true });

try {
  const routes = ['/', '/leadership', '/projects', '/research', '/work-with-me', '/record', '/ventures'];
  for (const width of [320, 390, 768, 980, 1440, 1600]) {
    const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 }, colorScheme: 'light' });
    const page = await context.newPage();
    for (const route of routes) {
      await page.goto(new URL(route, baseURL).href, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${route} at ${width}px has ${overflow}px horizontal overflow`);
    }
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    if (width === 390 || width === 1440) {
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      for (const link of await page.locator('.hero-actions a').all()) {
        const box = await link.boundingBox();
        assert.ok(box && box.y + box.height <= viewportHeight, `Hero action is below the ${width}px first viewport`);
      }
    }
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: 'Implementation' }).click();
  await expectText(page.locator('[data-stage-title]'), 'Build for coordinated change.');
  assert.equal(await page.getByRole('tab', { name: 'Implementation' }).getAttribute('aria-selected'), 'true');

  await page.getByRole('tab', { name: 'Architecture' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Implementation' }).getAttribute('aria-selected'), 'true');

  await page.locator('[data-theme-toggle]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.locator('[data-theme-toggle]').getAttribute('aria-label'), 'Switch to light theme');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');

  const axe = await new AxeBuilder({ page }).analyze();
  const materialViolations = axe.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
  assert.deepEqual(materialViolations.map(({ id, impact }) => ({ id, impact })), [], 'Serious accessibility violations found');
  await context.close();

  const auditContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const auditPage = await auditContext.newPage();
  for (const route of routes) {
    await auditPage.goto(new URL(route, baseURL).href, { waitUntil: 'networkidle' });
    const result = await new AxeBuilder({ page: auditPage }).analyze();
    const blocking = result.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
    assert.deepEqual(blocking.map(({ id, impact }) => ({ id, impact })), [], `${route} has serious accessibility violations`);
  }
  await auditContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(baseURL, { waitUntil: 'networkidle' });
  await mobilePage.getByRole('button', { name: 'Open navigation' }).click();
  assert.equal(await mobilePage.getByRole('button', { name: 'Close navigation' }).getAttribute('aria-expanded'), 'true');
  assert.equal(await mobilePage.locator('#mobile-navigation').getAttribute('data-open'), 'true');
  await mobileContext.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(await reducedPage.locator('[data-framework]').getAttribute('data-entered'), 'true');
  await reducedContext.close();

  console.log('Vertical slice interaction, viewport, theme, and accessibility checks passed.');
} finally {
  await browser.close();
}

async function expectText(locator, expected) {
  const actual = (await locator.textContent())?.trim();
  assert.equal(actual, expected);
}
