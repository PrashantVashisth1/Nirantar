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
}

export interface OrderSummaryDto {
  id: string;
  number: string;
  status: OrderStatus;
  source: OrderSource;
  patient: { id: string; fullName: string; relation: Relation };
  /** e.g. "Metformin 500 mg × 4" or "Metformin 500 mg × 4 and 1 more" */
  itemsSummary: string;
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

export interface OrderItemDto {
  id: string;
  product: ProductSummaryDto;
  quantity: number;
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
}
