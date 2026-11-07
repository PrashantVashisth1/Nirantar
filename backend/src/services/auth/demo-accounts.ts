import type { DemoAccountDto, DemoGuideDto } from '@nirantar/shared';
import { isDemoMode } from '../../config/env';

/**
 * The people a reviewer can become with one tap in test mode, and what each of
 * them does. Phones and emails stay on the server: the browser only ever gets a
 * key, so the sign-in page doesn't need any credentials.
 */
interface DemoAccount extends DemoAccountDto {
  phone?: string;
  email?: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: 'debasish',
    phone: '+919000010001',
    name: 'Debasish Ghosh',
    group: 'CUSTOMER',
    headline: 'Reorders monthly medicines',
    job: 'A customer who orders regular medicines for themselves and a parent.',
    tryThis: 'Tap Reorder on Amlodipine 5 mg, then place the order. It goes to the pharmacist queue; Sanjukta can check it.',
  },
  {
    key: 'sudipta',
    phone: '+919000010004',
    name: 'Sudipta Roy',
    group: 'CUSTOMER',
    headline: 'Uploads a new prescription',
    job: 'A customer with a new paper prescription, also ordering for a parent.',
    tryThis:
      'Upload a prescription, then Use a sample prescription: the AI drafts the cart (try the blurry one too). Imran can check the order. RX-50226 lets you choose a cheaper generic.',
  },
  {
    key: 'arif',
    phone: '+919000010003',
    name: 'Arif Mondal',
    group: 'CUSTOMER',
    headline: 'Asked for a clearer photo',
    job: 'A customer whose prescription photo was too blurry for the pharmacist.',
    tryThis: 'Open RX-50219 and upload a new photo. The order goes back to the pharmacist queue.',
  },
  {
    key: 'farhana',
    phone: '+919000010005',
    name: 'Farhana Begum',
    group: 'CUSTOMER',
    headline: 'Uses the app in Bengali',
    job: 'A customer whose prescription on file has expired, with an order waiting for stock.',
    tryThis: 'See the Bengali screens and the upload needed in place of Reorder. RX-50227 is waiting until a new stock file arrives.',
  },
  {
    key: 'ankit',
    phone: '+919000010006',
    name: 'Ankit Agarwal',
    group: 'CUSTOMER',
    headline: 'Brand-new customer',
    job: 'A first-time customer with no orders yet.',
    tryThis: 'Give consent and set up the profile, then see the empty home screen and add an address at checkout.',
  },
  {
    key: 'sanjukta',
    email: 'sanjukta.roy@demo.example',
    name: 'Sanjukta Roy',
    group: 'PHARMACIST',
    headline: 'Pharmacist, Salt Lake store',
    job: 'A registered pharmacist. Checks every medicine on any order in the queue, then picks, packs and dispatches orders for the Salt Lake store.',
    tryThis: "Queue: open Debasish's order, check it and approve it. Store orders: pick, pack with an invoice number, hand over, deliver.",
  },
  {
    key: 'imran',
    email: 'imran.hossain@demo.example',
    name: 'Imran Hossain',
    group: 'PHARMACIST',
    headline: 'Pharmacist, New Town store',
    job: 'A registered pharmacist. Checks every medicine on any order in the queue, then dispatches orders for the New Town store.',
    tryThis:
      'RX-50231 is Schedule H1: approve and hand it over, and a register row is written. RX-50230: reject with a reason. RX-50228: no draft, so try Retry AI.',
  },
  {
    key: 'priya',
    email: 'ops@demo.example',
    name: 'Priya Chatterjee',
    group: 'OPS',
    headline: 'Central operations',
    job: 'Sees orders across all stores and manages stock files and reminders. Cannot approve or dispatch an order: only a pharmacist can.',
    tryThis:
      'Overview: the safety line and all orders. Rules: the H1 register. Reminders: Run reminders now. Stock: upload docs/demo/stock-valid.csv from the repository. Reset demo starts everything over.',
  },
];

const publicFields = ({ key, name, group, headline, job, tryThis }: DemoAccount): DemoAccountDto => ({
  key,
  name,
  group,
  headline,
  job,
  tryThis,
});

export function listDemoAccounts(): DemoAccountDto[] | undefined {
  return isDemoMode() ? DEMO_ACCOUNTS.map(publicFields) : undefined;
}

export function findDemoAccount(key: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((account) => account.key === key);
}

export function demoGuideFor(user: { phone: string | null; email: string | null }): DemoGuideDto | null {
  if (!isDemoMode()) return null;
  const account = DEMO_ACCOUNTS.find((a) => (a.phone && a.phone === user.phone) || (a.email && a.email === user.email));
  return account ? { name: account.name, job: account.job, tryThis: account.tryThis } : null;
}
