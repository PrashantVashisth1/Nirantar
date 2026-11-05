import type {
  OrderDetailDto,
  OrderSummaryDto,
  ProductSummaryDto,
} from '@nirantar/shared';
import type { Prisma, Product } from '../../generated/prisma/client';

/**
 * Medicines are shown by molecule and strength ("Metformin 500 mg"), which is
 * what's on the prescription and on the brief's sample data; the brand is
 * secondary. Over-the-counter items are shown by their product name.
 */
export function toProductSummary(product: Product): ProductSummaryDto {
  const isMedicine = product.schedule !== 'OTC';
  return {
    id: product.id,
    displayName: isMedicine ? `${product.molecule} ${product.strength}` : product.name,
    brandName: product.name,
    packLabel: product.packLabel,
    schedule: product.schedule,
    pricePaise: product.pricePaise,
    isGeneric: product.isGeneric,
  };
}

export const orderSummaryInclude = {
  patient: { select: { id: true, fullName: true, relation: true } },
  store: { select: { name: true } },
  items: { where: { status: 'ACTIVE' }, include: { product: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderForSummary = Prisma.OrderGetPayload<{ include: typeof orderSummaryInclude }>;

export function toOrderSummary(order: OrderForSummary): OrderSummaryDto {
  const [first, ...rest] = order.items;
  const firstText = first ? `${toProductSummary(first.product).displayName} × ${first.quantity}` : 'Medicines to be added by the pharmacist';
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    source: order.source,
    patient: order.patient,
    itemsSummary: rest.length > 0 ? `${firstText} and ${rest.length} more` : firstText,
    // Parts of the same summary, so the customer's screen can say it in their language.
    firstItem: firstText,
    moreItems: rest.length,
    itemCount: order.items.length,
    totalPaise: order.totalPaise,
    storeName: order.store?.name ?? null,
    placedAt: order.placedAt.toISOString(),
  };
}

export const orderDetailInclude = {
  patient: { select: { id: true, fullName: true, relation: true } },
  store: { select: { name: true } },
  previewStore: { select: { name: true } },
  verifiedBy: { select: { name: true, pharmacistRegNo: true } },
  prescription: { select: { file: { select: { prescriptionId: true } } } },
  items: {
    include: { product: true, approvedGeneric: true },
    orderBy: { createdAt: 'asc' },
  },
  events: { include: { actor: { select: { name: true } } }, orderBy: { at: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderForDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export function toOrderDetail(order: OrderForDetail): OrderDetailDto {
  const activeItems = order.items.filter((item) => item.status === 'ACTIVE');
  return {
    ...toOrderSummary({ ...order, items: activeItems }),
    version: order.version,
    items: order.items.map((item) => ({
      id: item.id,
      product: toProductSummary(item.product),
      quantity: item.quantity,
      requestedQuantity: item.requestedQuantity,
      requestedProductId: item.requestedProductId,
      unitPricePaise: item.unitPricePaise,
      status: item.status,
      removedReason: item.removedReason,
      approved: item.approvedById !== null,
      offeredGeneric: item.approvedGeneric ? toProductSummary(item.approvedGeneric) : null,
      customerChoice: item.customerChoice,
    })),
    events: order.events.map((event) => ({
      toStatus: event.toStatus,
      at: event.at.toISOString(),
      actorRole: event.actorRole,
      actorName: event.actor?.name ?? null,
      note: event.note,
    })),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    invoiceNo: order.invoiceNo,
    reuploadReason: order.reuploadReason,
    rejectionReason: order.rejectionReason,
    rejectionNote: order.rejectionNote,
    verifiedBy: order.verifiedBy
      ? { name: order.verifiedBy.name, regNo: order.verifiedBy.pharmacistRegNo }
      : null,
    deliveryAddress: order.deliveryAddress,
    previewStoreName: order.previewStore?.name ?? null,
    prescriptionId: order.prescriptionId,
    prescriptionHasImage: Boolean(order.prescription?.file),
    promisedBy: order.promisedBy?.toISOString() ?? null,
    routingNote: order.status === 'AWAITING_STOCK' ? order.routingNote : null,
  };
}
