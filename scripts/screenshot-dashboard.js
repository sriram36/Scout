'use strict';

/**
 * Screenshot the dashboard in demo mode (no backend needed).
 *
 *   node scripts/screenshot-dashboard.js http://localhost:3000 [outDir]
 *
 * Writes dashboard-dark.png, dashboard-light.png, dashboard-drawer.png and
 * dashboard-mobile.png to outDir (default docs/screenshots).
 */

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const base = (process.argv[2] || '').replace(/\/+$/, '');
const outDir = path.resolve(process.argv[3] || path.join(__dirname, '..', 'docs', 'screenshots'));

if (!base) {
  console.error('Usage: node scripts/screenshot-dashboard.js <base-url> [outDir]');
  process.exit(1);
}

const url = `${base}/?demo=1`;

async function open(browser, { theme, viewport }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme });
  await context.addInitScript(t => { try { localStorage.setItem('scout-theme', t); } catch (_) { /* ignore */ } }, theme);
  const page = await context.newPage();
  page.on('pageerror', err => console.error('page error:', err.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { context, page };
}

async function shot(page, name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file });
  console.log(`${name}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const desktop = { width: 1440, height: 900 };

    let s = await open(browser, { theme: 'dark', viewport: desktop });
    await shot(s.page, 'dashboard-dark.png');

    // Drawer: open the application with the detailed fill report and scroll to it.
    await s.page.locator('.card', { hasText: 'Stripe' }).locator('.card-hit').click();
    await s.page.waitForSelector('.drawer');
    await s.page.evaluate(() => {
      const drawer = document.querySelector('.drawer');
      const report = document.getElementById('sec-report');
      if (drawer && report) drawer.scrollTop += report.getBoundingClientRect().top - drawer.getBoundingClientRect().top - 64;
    });
    await s.page.waitForTimeout(200);
    await shot(s.page, 'dashboard-drawer.png');
    await s.context.close();

    s = await open(browser, { theme: 'light', viewport: desktop });
    await shot(s.page, 'dashboard-light.png');
    await s.context.close();

    s = await open(browser, { theme: 'dark', viewport: { width: 390, height: 844 } });
    await s.page.getByRole('tab', { name: /Review/ }).click();
    await s.page.waitForTimeout(200);
    await shot(s.page, 'dashboard-mobile.png');
    await s.context.close();
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
