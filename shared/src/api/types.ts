/**
 * Shapes of the JSON the API returns. The backend builds them in its
 * "presenters" and the frontend reads them, so both sides use the same types.
 */
import type {
  CustomerChoice,
  Locale,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Relation,
  Role,
  Schedule,
} from '../enums';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export interface MeDto {
  id: string;
  role: Role;
  name: string;
  locale: Locale;
  /** Customers: masked phone. Staff: null. */
  phoneMasked: string | null;
  email: string | null;
  /** True for a customer who still has to give consent and their name. */
  needsOnboarding: boolean;
  remindersOptIn: boolean;
  store: { id: string; name: string } | null;
  pharmacistRegNo: string | null;
}

export interface OtpRequestResult {
  expiresAt: string;
  resendAfterSeconds: number;
  /** Only present in demo/test environments (plan A16). Never in production. */
  demoCode?: string;
}

export interface PatientDto {
  id: string;
  fullName: string;
  relation: Relation;
  birthYear: number | null;
}

export interface ProductSummaryDto {
  id: string;
  /** e.g. "Metformin 500 mg" */
  displayName: string;
  /** e.g. "Glycora 500" */
  brandName: string;
  packLabel: string;
  schedule: Schedule;
  pricePaise: number;
  isGeneric: boolean;
  /** Schedule X / NDPS: shown, but never sold online (plan B1). */
  blocked?: boolean;
}

export interface OrderSummaryDto {
  id: string;
  number: string;
  status: OrderStatus;
  source: OrderSource;
  patient: { id: string; fullName: string; relation: Relation };
  /** e.g. "Metformin 500 mg × 4" or "Metformin 500 mg × 4 and 1 more" */
  itemsSummary: string;
  firstItem: string;
  moreItems: number;
  itemCount: number;
  totalPaise: number;
  storeName: string | null;
  placedAt: string;
}

export interface RefillDto {
  id: string;
  patient: { id: string; fullName: string; relation: Relation };
  product: ProductSummaryDto;
  runOutOn: string;
  /** Negative when the estimated run-out date has passed. */
  daysLeft: number;
  /** Days the last fill was meant to last (for the supply bar). */
  daysSupply: number;
  remindersEnabled: boolean;
  /** False when the prescription on file is older than the validity policy (plan A3). */
  prescriptionValid: boolean;
  /** An open order that already contains this medicine for this patient. */
  orderInProgress: { id: string; number: string } | null;
}

export interface HomeDto {
  patients: PatientDto[];
  refills: RefillDto[];
  activeOrders: OrderSummaryDto[];
  pastOrders: OrderSummaryDto[];
}

export type MatchQuality = 'STRONG' | 'CHECK' | 'NONE';

/** One medicine line the AI read, matched to our catalog by our own code. */
export interface DraftLineDto {
  lineIndex: number;
  asWritten: string;
  medicineName: string | null;
  strength: string | null;
  dosageText: string | null;
  durationText: string | null;
  /** True when the AI said it wasn't sure about the name, strength or dose. */
  uncertain: boolean;
  quality: MatchQuality;
  product: ProductSummaryDto | null;
  candidates: ProductSummaryDto[];
  suggestedQuantity: number;
  dose: { morning: number; noon: number; night: number } | null;
  durationDays: number | null;
}

export interface DraftField {
  value: string | null;
  uncertain: boolean;
}

export interface PrescriptionDto {
  id: string;
  patientId: string;
  aiStatus: 'READING' | 'READY' | 'UNSURE' | 'UNREADABLE' | 'FAILED';
  reviewStatus: 'PENDING' | 'VERIFIED' | 'REUPLOAD_ASKED' | 'REJECTED';
  createdAt: string;
  hasImage: boolean;
  draft: {
    isPrescription: boolean;
    legibility: 'clear' | 'partly_legible' | 'illegible';
    prescriberName: DraftField;
    prescriberRegNo: DraftField;
    prescribedOn: DraftField;
    patientName: DraftField;
    lines: DraftLineDto[];
    unreadableLineCount: number;
  } | null;
  prescriberName: string | null;
  prescriberRegNo: string | null;
  prescribedOn: string | null;
  /** prescribed date + validity policy (A3). */
  validUntil: string | null;
}

export interface QuoteDto {
  lines: { product: ProductSummaryDto; quantity: number; lineTotalPaise: number; needsPrescription: boolean }[];
  subtotalPaise: number;
  totalPaise: number;
  needsPrescription: boolean;
  blocked: { productId: string; reason: string }[];
  delivery: { storeName: string; distanceKm: number; promisedBy: string } | null;
}

export interface AddressDto {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  localityId: string;
  localityName: string;
  pincode: string;
  isDefault: boolean;
}

export interface QueueRowDto extends OrderSummaryDto {
  aiStatus: PrescriptionDto['aiStatus'] | null;
  hasH1: boolean;
  reupload: boolean;
  reviewingBy: string | null;
  ageYears: number | null;
}

export interface WorkspaceItemDto {
  id: string;
  product: ProductSummaryDto & { molecule: string; strength: string; packUnits: number; form: string };
  quantity: number;
  requestedQuantity: number;
  status: 'ACTIVE' | 'REMOVED';
  dose: { morning: number; noon: number; night: number } | null;
  asNeeded: boolean;
  durationDays: number | null;
  genericOptions: ProductSummaryDto[];
  offeredGenericId: string | null;
  /** The dose confirmed on this patient's last fill (refill orders only). */
  lastFill: { dose: { morning: number; noon: number; night: number }; durationDays: number | null } | null;
}

export interface WorkspaceDto {
  order: {
    id: string;
    number: string;
    status: OrderStatus;
    version: number;
    source: OrderSource;
    placedAt: string;
    customerNote: string | null;
    previewStoreName: string | null;
  };
  patient: { fullName: string; relation: Relation; ageYears: number | null };
  customer: { name: string; phoneMasked: string | null };
  prescription: PrescriptionDto | null;
  items: WorkspaceItemDto[];
  reviewingBy: string | null;
}

export interface StoreOrderDto {
  id: string;
  number: string;
  status: OrderStatus;
  version: number;
  patientName: string;
  items: { name: string; brand: string; packLabel: string; quantity: number; schedule: Schedule }[];
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totalPaise: number;
  promisedBy: string | null;
  approvedBy: { name: string; regNo: string | null } | null;
  invoiceNo: string | null;
  riderName: string | null;
}

export interface MessageDto {
  id: string;
  channel: 'SMS' | 'WHATSAPP' | 'IN_APP';
  body: string;
  createdAt: string;
  orderId: string | null;
}

export interface OrderItemDto {
  id: string;
  product: ProductSummaryDto;
  quantity: number;
  requestedQuantity: number;
  requestedProductId: string;
  unitPricePaise: number;
  status: 'ACTIVE' | 'REMOVED';
  removedReason: string | null;
  approved: boolean;
  offeredGeneric: ProductSummaryDto | null;
  customerChoice: CustomerChoice | null;
}

export interface OrderEventDto {
  toStatus: OrderStatus;
  at: string;
  actorRole: string;
  actorName: string | null;
  note: string | null;
}

export interface OrderDetailDto extends OrderSummaryDto {
  version: number;
  items: OrderItemDto[];
  events: OrderEventDto[];
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  invoiceNo: string | null;
  reuploadReason: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  verifiedBy: { name: string; regNo: string | null } | null;
  deliveryAddress: unknown;
  previewStoreName: string | null;
  prescriptionId: string | null;
  prescriptionHasImage: boolean;
  promisedBy: string | null;
  routingNote: string | null;
}
