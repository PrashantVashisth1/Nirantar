import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const PHONE_360 = { width: 360, height: 780 };
export const DESKTOP = { width: 1440, height: 1000 };

export const SUDIPTA = '9000010004';
export const DEBASISH = '9000010001';
export const IMRAN = 'imran.hossain@demo.example';
export const OPS = 'ops@demo.example';
export const STAFF_PASSWORD = 'Nirantar@2026';

/** Signs in through the real screens. The test-mode code comes from the API response. */
export async function signInCustomer(browser: Browser, phone: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: PHONE_360, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/signin');
  await page.getByLabel('Mobile number').fill(phone);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request')),
    page.getByRole('button', { name: 'Send code' }).click(),
  ]);
  const { demoCode } = (await response.json()) as { demoCode: string };
  await page.getByLabel('Code', { exact: true }).fill(demoCode);
  // The sixth digit submits the code on its own.
  await expect(page).toHaveURL(/\/home$/);
  return { context, page };
}

export async function signInStaff(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await page.goto('/signin');
  await page.getByRole('button', { name: 'Staff sign-in' }).or(page.getByRole('link', { name: 'Staff sign-in' })).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(pharmacist|ops)/);
  return { context, page };
}

/** The customer column must never scroll sideways, even at 360 px (plan §3.5). */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
