// Builds docs/tdd/TDD.pdf from docs/tdd/tdd.html. Run: node scripts/build-tdd.cjs
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const dir = path.join(__dirname, '..', 'docs', 'tdd');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file:///${path.join(dir, 'tdd.html').replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: path.join(dir, 'TDD.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '17mm', bottom: '17mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:7.5pt;color:#6B7570;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>Nirantar · Technical Design Document</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  await browser.close();
})();
