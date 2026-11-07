// Captures the screens used in the TDD, from the real app on its own ports and
// test database. Needs Docker up and the demo seeded into nirantar_test.
// Run: node scripts/capture-tdd-screens.cjs
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'tdd', 'screens');
fs.mkdirSync(OUT, { recursive: true });
const DB = 'postgresql://nirantar:nirantar_local_only@localhost:15433/nirantar_test';
const WEB = 'http://localhost:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = { ...process.env, DATABASE_URL: DB, PORT: '4100', APP_ORIGIN: WEB, API_PROXY_TARGET: 'http://localhost:4100' };
execSync('npm run db:seed', { cwd: ROOT, env, stdio: 'pipe' });
const api = spawn('npx tsx --env-file=.env src/server.ts', { cwd: path.join(ROOT, 'backend'), env, shell: true, stdio: 'ignore' });
const web = spawn('npm run dev -w frontend -- --port 5174 --strictPort', { cwd: ROOT, env, shell: true, stdio: 'ignore' });
const stop = () => {
  for (const p of [api, web]) {
    try {
      execSync(`taskkill /pid ${p.pid} /t /f`, { stdio: 'ignore' });
    } catch {
      // Already gone.
    }
  }
};

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 };
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

(async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${WEB}/api/health`)).ok) break;
    } catch {
      // Still starting.
    }
    await sleep(1000);
  }
  const browser = await chromium.launch();
  const as = async (key, device) => {
    const context = await browser.newContext(device);
    const res = await context.request.post(`${WEB}/api/auth/demo-login`, { headers: { Origin: WEB }, data: { key } });
    const { user } = await res.json();
    // Product screens without the reviewer guide on top.
    await context.addInitScript((id) => sessionStorage.setItem(`nirantar.demoGuide.dismissed.${id}`, '1'), user.id);
    return { context, page: await context.newPage() };
  };
  const shot = async (page, name, fullPage = false) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 78, fullPage });
    console.log('captured', name);
  };
  const reading = async (page) => {
    await page.getByText('Reading your prescription').waitFor({ timeout: 15000 }).catch(() => {});
    await page.getByText('Reading your prescription').waitFor({ state: 'hidden', timeout: 125000 });
  };

  let s = await browser.newContext({ ...PHONE, viewport: { width: 390, height: 1140 } });
  let p = await s.newPage();
  await p.goto(`${WEB}/signin`);
  await p.getByRole('heading', { name: 'Try the demo' }).waitFor();
  await shot(p, 'c1-signin');
  await s.close();

  let a = await as('debasish', PHONE);
  await a.page.goto(`${WEB}/home`);
  await a.page.getByRole('link', { name: /^Reorder/ }).first().waitFor();
  await shot(a.page, 'c2-home');
  await a.context.close();

  a = await as('sudipta', { ...PHONE, viewport: { width: 390, height: 900 } });
  await a.page.goto(`${WEB}/order/new`);
  await a.page.getByRole('button', { name: 'Use a sample prescription' }).click();
  await a.page.getByRole('button', { name: 'Handwritten prescription', exact: true }).click();
  await reading(a.page);
  await a.page.evaluate(() => window.scrollTo(0, 300));
  await shot(a.page, 'c3-ai-draft');
  await a.page.goto(`${WEB}/order/new`);
  await a.page.getByRole('button', { name: 'Use a sample prescription' }).click();
  await a.page.getByRole('button', { name: 'Blurry photo', exact: true }).click();
  await reading(a.page);
  await a.page.evaluate(() => window.scrollTo(0, 300));
  await shot(a.page, 'c3-blurry');
  await a.page.goto(`${WEB}/home`);
  await a.page.getByRole('link', { name: /RX-50226/ }).click();
  await a.page.getByText('Your pharmacist checked your order').waitFor();
  await shot(a.page, 'c4-generic');
  await a.context.close();

  a = await as('farhana', PHONE);
  await a.page.goto(`${WEB}/home`);
  await a.page.getByRole('link', { name: /RX-50227/ }).waitFor();
  await shot(a.page, 'c2-bengali');
  await a.context.close();

  a = await as('sanjukta', DESK);
  await a.page.goto(`${WEB}/pharmacist`);
  await a.page.getByRole('link', { name: 'RX-50214' }).waitFor();
  await shot(a.page, 'p1-queue');
  await a.page.getByRole('link', { name: 'RX-50214' }).click();
  await a.page.locator('section[aria-label="Prescription image"] img').waitFor();
  await shot(a.page, 'p2-workspace');
  await a.page.goto(`${WEB}/pharmacist/store`);
  await a.page.getByText('RX-50220').waitFor();
  await shot(a.page, 's1-store');
  await a.context.close();

  a = await as('priya', { ...DESK, viewport: { width: 1440, height: 1000 } });
  await a.page.goto(`${WEB}/ops`);
  await a.page.getByText('H/H1 items dispatched without approval').waitFor();
  await shot(a.page, 'o1-overview');
  await a.page.getByRole('tab', { name: 'Rules' }).click();
  await a.page.getByRole('heading', { name: 'H1 register' }).waitFor();
  await shot(a.page, 'o1-rules');
  await a.context.close();

  await browser.close();
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(stop);
