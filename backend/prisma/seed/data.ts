/**
 * Synthetic demo data (plan §5.1). Everything here is fictional:
 * - Store names are localities; coordinates are approximate (plan A4, A15).
 * - Brand names and manufacturers are invented; prices are synthetic except the
 *   three items in the brief's sample data (plan A9).
 * - Schedule classifications are illustrative, not a regulatory reference (A9).
 * - People, phone numbers, doctors and registration numbers are made up (A14).
 */
import type { ProductForm, Relation, Schedule } from '../../src/generated/prisma/client';

export interface SeedStore {
  code: string;
  name: string;
  localityId: string;
  lat: number;
  lng: number;
}

/** 6 synthetic stores. The first three are the stores named in the brief. */
export const STORES: SeedStore[] = [
  { code: 'SLK', name: 'Salt Lake', localityId: 'salt-lake-2', lat: 22.586, lng: 88.406 },
  { code: 'BHL', name: 'Behala', localityId: 'behala-chowrasta', lat: 22.498, lng: 88.31 },
  { code: 'HWM', name: 'Howrah Maidan', localityId: 'howrah-maidan', lat: 22.587, lng: 88.312 },
  { code: 'GRH', name: 'Gariahat', localityId: 'gariahat', lat: 22.519, lng: 88.367 },
  { code: 'DMD', name: 'Dum Dum', localityId: 'dum-dum', lat: 22.623, lng: 88.42 },
  { code: 'NTN', name: 'New Town', localityId: 'new-town-1', lat: 22.58, lng: 88.46 },
];

export interface SeedProduct {
  sku: string;
  name: string;
  molecule: string;
  strength: string;
  form: ProductForm;
  packLabel: string;
  packUnits: number;
  priceRupees: number;
  schedule: Schedule;
  isGeneric?: boolean;
  manufacturer: string;
  aliases?: string[];
}

const BRAND = 'Hooghly Pharma';
const BRAND_2 = 'Ganga Remedies';
const BRAND_3 = 'Sundarban Labs';
const GENERIC = 'Eastern Generics';

export const PRODUCTS: SeedProduct[] = [
  // ── Diabetes ──
  // Brief sample item (RX-50211): Metformin 500 mg, strip of 15, ₹120, Schedule H.
  { sku: 'MET500-S15', name: 'Glycora 500', molecule: 'Metformin', strength: '500 mg', form: 'TABLET', packLabel: 'Strip of 15', packUnits: 15, priceRupees: 120, schedule: 'H', manufacturer: BRAND, aliases: ['Glycora 500', 'Metformin 500'] },
  { sku: 'MET500-G15', name: 'Metformin 500 mg (generic)', molecule: 'Metformin', strength: '500 mg', form: 'TABLET', packLabel: 'Strip of 15', packUnits: 15, priceRupees: 45, schedule: 'H', isGeneric: true, manufacturer: GENERIC },
  { sku: 'MET1000-S15', name: 'Glycora 1000', molecule: 'Metformin', strength: '1000 mg', form: 'TABLET', packLabel: 'Strip of 15', packUnits: 15, priceRupees: 180, schedule: 'H', manufacturer: BRAND, aliases: ['Glycora 1000', 'Metformin 1000'] },
  { sku: 'GLM1-S10', name: 'Glimora 1', molecule: 'Glimepiride', strength: '1 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 95, schedule: 'H', manufacturer: BRAND_2, aliases: ['Glimora 1', 'Glim 1'] },
  { sku: 'GLM2-S10', name: 'Glimora 2', molecule: 'Glimepiride', strength: '2 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 140, schedule: 'H', manufacturer: BRAND_2, aliases: ['Glimora 2', 'Glim 2'] },
  { sku: 'GLM2-G10', name: 'Glimepiride 2 mg (generic)', molecule: 'Glimepiride', strength: '2 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 55, schedule: 'H', isGeneric: true, manufacturer: GENERIC },
  { sku: 'SIT100-S10', name: 'Sitara 100', molecule: 'Sitagliptin', strength: '100 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 320, schedule: 'H', manufacturer: BRAND_3, aliases: ['Sitara 100'] },

  // ── Blood pressure and heart ──
  // Brief sample item (RX-50214): Telmisartan 40 mg, strip of 10, ₹285, Schedule H.
  { sku: 'TEL40-S10', name: 'Telmora 40', molecule: 'Telmisartan', strength: '40 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 285, schedule: 'H', manufacturer: BRAND_2, aliases: ['Telmora 40', 'Telmi 40'] },
  { sku: 'TEL40-G10', name: 'Telmisartan 40 mg (generic)', molecule: 'Telmisartan', strength: '40 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 120, schedule: 'H', isGeneric: true, manufacturer: GENERIC },
  { sku: 'AML5-S10', name: 'Amlora 5', molecule: 'Amlodipine', strength: '5 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 60, schedule: 'H', manufacturer: BRAND, aliases: ['Amlora 5', 'Amlo 5'] },
  { sku: 'AML5-G10', name: 'Amlodipine 5 mg (generic)', molecule: 'Amlodipine', strength: '5 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 22, schedule: 'H', isGeneric: true, manufacturer: GENERIC },
  { sku: 'LOS50-S10', name: 'Losara 50', molecule: 'Losartan', strength: '50 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 110, schedule: 'H', manufacturer: BRAND_3, aliases: ['Losara 50'] },
  { sku: 'MTP25-S10', name: 'Metora 25', molecule: 'Metoprolol', strength: '25 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 85, schedule: 'H', manufacturer: BRAND_2, aliases: ['Metora 25'] },
  { sku: 'ATV10-S10', name: 'Lipora 10', molecule: 'Atorvastatin', strength: '10 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 130, schedule: 'H', manufacturer: BRAND, aliases: ['Lipora 10'] },
  { sku: 'ATV10-G10', name: 'Atorvastatin 10 mg (generic)', molecule: 'Atorvastatin', strength: '10 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 40, schedule: 'H', isGeneric: true, manufacturer: GENERIC },
  { sku: 'CLO75-S10', name: 'Clopira 75', molecule: 'Clopidogrel', strength: '75 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 150, schedule: 'H', manufacturer: BRAND_3, aliases: ['Clopira 75'] },

  // ── Thyroid ──
  { sku: 'LEV25-B100', name: 'Thyrova 25', molecule: 'Levothyroxine', strength: '25 mcg', form: 'TABLET', packLabel: 'Bottle of 100', packUnits: 100, priceRupees: 150, schedule: 'H', manufacturer: BRAND, aliases: ['Thyrova 25'] },
  // Brief sample item (RX-50219): Levothyroxine 50 mcg, bottle of 100, ₹190, Schedule H.
  { sku: 'LEV50-B100', name: 'Thyrova 50', molecule: 'Levothyroxine', strength: '50 mcg', form: 'TABLET', packLabel: 'Bottle of 100', packUnits: 100, priceRupees: 190, schedule: 'H', manufacturer: BRAND, aliases: ['Thyrova 50', 'Thyroxine 50'] },
  { sku: 'LEV50-G100', name: 'Levothyroxine 50 mcg (generic)', molecule: 'Levothyroxine', strength: '50 mcg', form: 'TABLET', packLabel: 'Bottle of 100', packUnits: 100, priceRupees: 110, schedule: 'H', isGeneric: true, manufacturer: GENERIC },
  { sku: 'LEV100-B100', name: 'Thyrova 100', molecule: 'Levothyroxine', strength: '100 mcg', form: 'TABLET', packLabel: 'Bottle of 100', packUnits: 100, priceRupees: 230, schedule: 'H', manufacturer: BRAND, aliases: ['Thyrova 100'] },

  // ── H1 examples (illustrative classification) ──
  { sku: 'CFX200-S10', name: 'Cefora 200', molecule: 'Cefixime', strength: '200 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 110, schedule: 'H1', manufacturer: BRAND_2, aliases: ['Cefora 200'] },
  { sku: 'LVF500-S5', name: 'Floxira 500', molecule: 'Levofloxacin', strength: '500 mg', form: 'TABLET', packLabel: 'Strip of 5', packUnits: 5, priceRupees: 95, schedule: 'H1', manufacturer: BRAND_3, aliases: ['Floxira 500'] },

  // ── Never sold online (Schedule X / narcotic; illustrative) ──
  { sku: 'MPH10-S10', name: 'Focira 10', molecule: 'Methylphenidate', strength: '10 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 210, schedule: 'X', manufacturer: BRAND_3 },
  { sku: 'MOR10-S10', name: 'Morphine sulfate 10 mg', molecule: 'Morphine', strength: '10 mg', form: 'TABLET', packLabel: 'Strip of 10', packUnits: 10, priceRupees: 160, schedule: 'NDPS', manufacturer: BRAND },

  // ── Over the counter ──
  { sku: 'PCM500-S15', name: 'Paracetamol 500 mg', molecule: 'Paracetamol', strength: '500 mg', form: 'TABLET', packLabel: 'Strip of 15', packUnits: 15, priceRupees: 30, schedule: 'OTC', manufacturer: GENERIC, aliases: ['Paracetamol', 'PCM'] },
  { sku: 'ORS-21G', name: 'ORS sachet, orange', molecule: 'Oral rehydration salts', strength: '21 g', form: 'OTHER', packLabel: 'Sachet', packUnits: 1, priceRupees: 22, schedule: 'OTC', manufacturer: GENERIC, aliases: ['ORS'] },
  { sku: 'GLS-50', name: 'Glucometer test strips', molecule: 'Blood glucose test strips', strength: '50 strips', form: 'DEVICE', packLabel: 'Box of 50', packUnits: 50, priceRupees: 850, schedule: 'OTC', manufacturer: BRAND_3 },
  { sku: 'POV-20G', name: 'Antiseptic cream', molecule: 'Povidone-iodine', strength: '5%', form: 'CREAM', packLabel: 'Tube of 20 g', packUnits: 1, priceRupees: 65, schedule: 'OTC', manufacturer: BRAND_2 },
  { sku: 'MVT-S15', name: 'Multivitamin tablets', molecule: 'Multivitamin', strength: 'Daily', form: 'TABLET', packLabel: 'Strip of 15', packUnits: 15, priceRupees: 90, schedule: 'OTC', manufacturer: BRAND },
  { sku: 'COT-100G', name: 'Cotton roll', molecule: 'Absorbent cotton', strength: '100 g', form: 'DEVICE', packLabel: 'Roll of 100 g', packUnits: 1, priceRupees: 55, schedule: 'OTC', manufacturer: GENERIC },
  // A liquid: refill reminders aren't offered for this form (plan A7).
  { sku: 'DXM-100ML', name: 'Coughra syrup', molecule: 'Dextromethorphan', strength: '10 mg/5 ml', form: 'SYRUP', packLabel: 'Bottle of 100 ml', packUnits: 100, priceRupees: 105, schedule: 'OTC', manufacturer: BRAND_2, aliases: ['Coughra'] },
];

/** Configurable rules for OTC/H/H1 (plan B2). X and NDPS intentionally have no row (B1). */
export const SCHEDULE_RULES = [
  { schedule: 'OTC' as const, rxRequired: false, registerRequired: false, label: 'Over the counter' },
  { schedule: 'H' as const, rxRequired: true, registerRequired: false, label: 'Schedule H: prescription required' },
  { schedule: 'H1' as const, rxRequired: true, registerRequired: true, label: 'Schedule H1: prescription required, register entry at sale' },
];

/** Shared demo password for staff accounts. Not a secret: it's listed in deployment.md. */
export const STAFF_DEMO_PASSWORD = 'Nirantar@2026';

export const PHARMACISTS = [
  { name: 'Sanjukta Roy', email: 'sanjukta.roy@demo.example', regNo: 'DEMO-PH-0001', storeCode: 'SLK' },
  { name: 'Imran Hossain', email: 'imran.hossain@demo.example', regNo: 'DEMO-PH-0002', storeCode: 'NTN' },
  { name: 'Moumita Das', email: 'moumita.das@demo.example', regNo: 'DEMO-PH-0003', storeCode: 'BHL' },
  { name: 'Sourav Pal', email: 'sourav.pal@demo.example', regNo: 'DEMO-PH-0004', storeCode: 'HWM' },
  { name: 'Ananya Bose', email: 'ananya.bose@demo.example', regNo: 'DEMO-PH-0005', storeCode: 'GRH' },
  { name: 'Rahul Dutta', email: 'rahul.dutta@demo.example', regNo: 'DEMO-PH-0006', storeCode: 'DMD' },
];

export const OPS_USER = { name: 'Priya Chatterjee', email: 'ops@demo.example' };

export interface SeedCustomer {
  key: string;
  name: string;
  phone: string;
  locale: 'en' | 'hi' | 'bn';
  /** false = brand-new account that still has to complete onboarding. */
  onboarded: boolean;
  patients: { key: string; fullName: string; relation: Relation; birthYear: number }[];
  address?: { label: string; line1: string; localityId: string; pincode: string };
}

export const CUSTOMERS: SeedCustomer[] = [
  {
    key: 'debasish',
    name: 'Debasish Ghosh',
    phone: '+919000010001',
    locale: 'en',
    onboarded: true,
    patients: [
      { key: 'debasish-self', fullName: 'Debasish Ghosh', relation: 'SELF', birthYear: 1978 },
      { key: 'anjali', fullName: 'Anjali Ghosh', relation: 'PARENT', birthYear: 1956 },
    ],
    address: { label: 'Home', line1: 'BD-112, Salt Lake Sector II', localityId: 'salt-lake-2', pincode: '700091' },
  },
  {
    key: 'rina',
    name: 'Rina Sen',
    phone: '+919000010002',
    locale: 'en',
    onboarded: true,
    patients: [{ key: 'rina-self', fullName: 'Rina Sen', relation: 'SELF', birthYear: 1968 }],
    address: { label: 'Home', line1: '14/2 Diamond Harbour Road', localityId: 'behala-chowrasta', pincode: '700034' },
  },
  {
    key: 'arif',
    name: 'Arif Mondal',
    phone: '+919000010003',
    locale: 'en',
    onboarded: true,
    patients: [{ key: 'arif-self', fullName: 'Arif Mondal', relation: 'SELF', birthYear: 1985 }],
    address: { label: 'Home', line1: '27 Dobson Road', localityId: 'howrah-maidan', pincode: '711101' },
  },
  {
    key: 'sudipta',
    name: 'Sudipta Roy',
    phone: '+919000010004',
    locale: 'en',
    onboarded: true,
    patients: [
      { key: 'sudipta-self', fullName: 'Sudipta Roy', relation: 'SELF', birthYear: 1982 },
      { key: 'haripada', fullName: 'Haripada Roy', relation: 'PARENT', birthYear: 1950 },
    ],
    address: { label: 'Home', line1: 'Tower 3, Flat 8B, Action Area I', localityId: 'new-town-1', pincode: '700156' },
  },
  {
    key: 'farhana',
    name: 'Farhana Begum',
    phone: '+919000010005',
    locale: 'bn',
    onboarded: true,
    patients: [{ key: 'farhana-self', fullName: 'Farhana Begum', relation: 'SELF', birthYear: 1975 }],
    address: { label: 'Home', line1: '9 Darga Road', localityId: 'park-circus', pincode: '700017' },
  },
  {
    key: 'ankit',
    name: 'Ankit Agarwal',
    phone: '+919000010006',
    locale: 'hi',
    onboarded: false,
    patients: [],
  },
  // Background customers: they give the queue and store boards realistic volume.
  {
    key: 'mitali',
    name: 'Mitali Dutta',
    phone: '+919000010007',
    locale: 'en',
    onboarded: true,
    patients: [
      { key: 'mitali-self', fullName: 'Mitali Dutta', relation: 'SELF', birthYear: 1987 },
      { key: 'nirmal', fullName: 'Nirmal Dutta', relation: 'PARENT', birthYear: 1955 },
    ],
    address: { label: 'Home', line1: 'P-41, Lake Town Block A', localityId: 'lake-town', pincode: '700089' },
  },
  {
    key: 'tapas',
    name: 'Tapas Nandi',
    phone: '+919000010008',
    locale: 'en',
    onboarded: true,
    patients: [{ key: 'tapas-self', fullName: 'Tapas Nandi', relation: 'SELF', birthYear: 1964 }],
    address: { label: 'Home', line1: '5 Bondel Road', localityId: 'ballygunge', pincode: '700019' },
  },
  {
    key: 'sharmila',
    name: 'Sharmila Das',
    phone: '+919000010009',
    locale: 'bn',
    onboarded: true,
    patients: [{ key: 'sharmila-self', fullName: 'Sharmila Das', relation: 'SELF', birthYear: 1971 }],
    address: { label: 'Home', line1: '32 Sakherbazar Road', localityId: 'behala-sakherbazar', pincode: '700008' },
  },
  {
    key: 'bikram',
    name: 'Bikram Saha',
    phone: '+919000010010',
    locale: 'hi',
    onboarded: true,
    patients: [{ key: 'bikram-self', fullName: 'Bikram Saha', relation: 'SELF', birthYear: 1979 }],
    address: { label: 'Home', line1: '18 Shibpur Road', localityId: 'shibpur', pincode: '711102' },
  },
];
