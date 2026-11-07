/**
 * The product's main journeys from the plan (E1, E2, E3), plus language and the stock file.
 * They run in order against one demo world, like a real day at the chain.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { DEBASISH, FARHANA, IMRAN, OPS, PHONE_360, SANJUKTA, SUDIPTA, expectNoSidewaysScroll, signInCustomer, signInStaff } from './helpers';

test.describe.configure({ mode: 'serial' });

/** The order's own header line, not an order mentioned in the demo guide. */
const orderNumberOn = async (page: Page) => (await page.getByText(/^RX-\d+ · /).first().innerText()).match(/RX-\d+/)![0];

let orderUrl = '';
let orderNumber = '';
// The same customer comes back in E2, still signed in (a new code would hit the resend wait).
let customerSession: Awaited<ReturnType<BrowserContext['storageState']>>;

test('E1: a customer at 360 px uploads a prescription and places an order', async ({ browser }) => {
  const { context, page } = await signInCustomer(browser, SUDIPTA);
  await expectNoSidewaysScroll(page);

  await page.getByRole('link', { name: 'Upload a prescription' }).click();
  await expect(page.getByRole('heading', { name: 'New order' })).toBeVisible();
  await page.getByRole('button', { name: 'Use a sample prescription' }).click();
  await page.getByRole('button', { name: 'Typed prescription' }).click();

  // The AI is off in this run, so the customer is told the pharmacist will read it.
  await expect(page.getByText('your pharmacist will read the prescription', { exact: false }).first()).toBeVisible();
  await expectNoSidewaysScroll(page);

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('2 of 2', { exact: false })).toBeVisible();
  await expectNoSidewaysScroll(page);

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  await expect(page.getByText('Your pharmacist is checking the prescription')).toBeVisible();
  await expectNoSidewaysScroll(page);

  orderUrl = new URL(page.url()).pathname;
  orderNumber = await orderNumberOn(page);
  customerSession = await context.storageState();
  await context.close();
});

test('E2: pharmacist checks it, the customer confirms, the store delivers it', async ({ browser }) => {
  // ── Pharmacist: reads the prescription and adds what's on it ──
  const pharmacist = await signInStaff(browser, IMRAN);
  const staff = pharmacist.page;
  await staff.getByRole('link', { name: orderNumber }).click();
  await expect(staff.getByText('Prescription details')).toBeVisible();

  await staff.getByRole('button', { name: 'Add medicine from the prescription' }).click();
  await staff.getByLabel('Search catalog').fill('Amlora');
  await staff.getByRole('button', { name: /Amlora 5/ }).click();

  // The approve button stays off until everything needed is there.
  const approve = staff.getByRole('button', { name: /Approve & ask customer/ });
  await expect(approve).toBeDisabled();
  await staff.getByLabel('morning').selectOption('1');
  await staff.getByLabel('Duration (days)').fill('30');
  await staff.getByLabel('Prescriber').fill('Dr. S. Banerjee');
  await staff.getByLabel('Registration no.').fill('DEMO-WB-48213');
  await staff.getByLabel('Prescription date').fill('2026-08-12');
  await staff.getByRole('checkbox', { name: /The prescription is valid/ }).check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(staff).toHaveURL(/\/pharmacist$/);

  // ── Customer: sees the change and confirms ──
  const customerContext = await browser.newContext({ viewport: PHONE_360, hasTouch: true, storageState: customerSession });
  const customer = { context: customerContext, page: await customerContext.newPage() };
  await customer.page.goto(orderUrl);
  await expect(customer.page.getByText("Please confirm the pharmacist's changes")).toBeVisible();
  await customer.page.getByRole('button', { name: 'Confirm and continue' }).click();
  await expect(customer.page.getByText(/Being prepared at New Town store/)).toBeVisible();

  // ── Store: pick, pack, hand over, deliver ──
  await staff.goto('/pharmacist/store');
  const scoped = staff.locator('article').filter({ hasText: orderNumber });
  await scoped.getByRole('button', { name: 'Start picking' }).click();
  await scoped.getByLabel('Store invoice number').fill(`E2E/${orderNumber}`);
  await scoped.getByRole('button', { name: 'Mark packed' }).click();

  await staff.getByRole('tab', { name: /^Packed/ }).click();
  await scoped.getByLabel("Delivery person's name").fill('Bapi Das');
  await scoped.getByRole('button', { name: 'Hand over' }).click();

  await staff.getByRole('tab', { name: /^Out for delivery/ }).click();
  await scoped.getByRole('button', { name: 'Mark delivered' }).click();

  // ── Customer: the timeline shows who checked it and that it arrived ──
  await customer.page.reload();
  await expect(customer.page.getByText('Delivered').first()).toBeVisible();
  await expect(customer.page.getByText(/Imran Hossain · Reg\. DEMO-PH-0002/)).toBeVisible();
  await expectNoSidewaysScroll(customer.page);

  await customer.context.close();
  await pharmacist.context.close();
});

test('E3: a reminder goes out, and the customer reorders in one tap', async ({ browser }) => {
  const ops = await signInStaff(browser, OPS);
  await ops.page.getByRole('tab', { name: 'Reminders' }).click();
  await ops.page.getByRole('button', { name: 'Run reminders now' }).click();
  await expect(ops.page.getByText(/\d+ sent/)).toBeVisible();
  await ops.context.close();

  const { context, page } = await signInCustomer(browser, DEBASISH);

  // The reminder arrived in the test inbox.
  await page.getByRole('button', { name: /open test inbox/ }).click();
  await expect(page.getByRole('dialog').getByText(/may run out around/).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Amlora has 4 days left and no order in progress, so it offers a reorder.
  await page.getByRole('link', { name: /^Reorder/ }).first().click();
  await expect(page.getByRole('heading', { name: 'New order' })).toBeVisible();
  await expect(page.getByText(/Amlodipine 5 mg/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText('Your pharmacist is checking the prescription')).toBeVisible();
  const refillNumber = await orderNumberOn(page);
  await context.close();

  // The pharmacist doesn't retype the dose: it's offered from the last fill, then approved.
  const pharmacist = await signInStaff(browser, SANJUKTA);
  await pharmacist.page.getByRole('link', { name: refillNumber }).click();
  await expect(pharmacist.page.getByText('from the last fill')).toBeVisible();
  await expect(pharmacist.page.getByLabel('morning')).toHaveValue('1');
  await pharmacist.page.getByRole('checkbox', { name: /The prescription is valid/ }).check();
  await pharmacist.page.getByRole('button', { name: /Approve & route/ }).click();
  await expect(pharmacist.page).toHaveURL(/\/pharmacist$/);
  await pharmacist.context.close();
});

test('E4: the language saved on the account follows the customer to a new phone', async ({ browser }) => {
  const { context, page } = await signInCustomer(browser, FARHANA);
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('link', { name: 'প্রেসক্রিপশন আপলোড করুন' }).first()).toBeVisible();
  await expectNoSidewaysScroll(page);
  await context.close();
});

test('E6: a reviewer can become anyone in one tap and is told what to try', async ({ browser }) => {
  const context = await browser.newContext({ viewport: PHONE_360 });
  const page = await context.newPage();
  await page.goto('/signin');
  await expectNoSidewaysScroll(page);

  // The real OTP form stays, with the shortcut below it.
  await expect(page.getByLabel('Mobile number')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Try the demo' })).toBeVisible();
  await page.getByRole('button', { name: /Sanjukta Roy/ }).click();
  await expect(page).toHaveURL(/\/pharmacist$/);
  await expect(page.getByText("You're signed in as Sanjukta Roy")).toBeVisible();
  await expect(page.getByText('Try this:')).toBeVisible();
  await expectNoSidewaysScroll(page);

  // Hiding it lasts for this person; the next person gets their own.
  await page.getByRole('button', { name: 'Hide this guide' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Verification queue' })).toBeVisible();
  await expect(page.getByText("You're signed in as")).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /Debasish Ghosh/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("You're signed in as Debasish Ghosh")).toBeVisible();
  await context.close();
});

test('E5: a new stock file routes the order waiting for stock; safety line and H1 register are visible', async ({ browser }) => {
  const { context, page } = await signInStaff(browser, OPS);

  await expect(page.getByText('H/H1 items dispatched without approval: 0')).toBeVisible();
  await expect(page.getByText('RX-50227').first()).toBeVisible();

  // One view of orders across all stores, with filters.
  await expect(page.getByRole('heading', { name: 'All orders' })).toBeVisible();
  await page.getByLabel('Filter by store').selectOption({ label: 'Salt Lake' });
  await expect(page.getByRole('cell', { name: 'RX-50211' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'RX-50214' })).toHaveCount(0);
  await page.getByLabel('Filter by store').selectOption({ label: 'All stores' });

  // Retrying with no stock anywhere leaves the order waiting, and says nothing false.
  await page.getByRole('button', { name: 'Retry routing' }).click();
  await expect(page.getByRole('button', { name: 'Retry routing' })).toBeVisible();

  await page.getByRole('tab', { name: 'Stock' }).click();
  await page.locator('input[type=file]').setInputFiles('docs/demo/stock-with-errors.csv');
  await expect(page.getByRole('button', { name: /^Apply/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Discard' }).click();

  await page.locator('input[type=file]').setInputFiles('docs/demo/stock-valid.csv');
  await page.getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByText(/1 waiting order/)).toBeVisible();

  await page.getByRole('tab', { name: 'Rules' }).click();
  await expect(page.getByRole('heading', { name: 'H1 register' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Cefora 200' }).first()).toBeVisible();
  await expect(page.getByText('never sold online', { exact: false })).toBeVisible();
  await context.close();
});
