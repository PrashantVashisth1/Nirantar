/**
 * Refill reminders (plan §6.5). Run daily by GitHub Actions and on demand by
 * operations. Safe to run any number of times: the unique key
 * (subscription, cycle, offset) means a reminder is decided only once.
 */
import {
  REMINDER_OFFSETS_DAYS,
  RX_VALIDITY_DAYS,
  TERMINAL_ORDER_STATUSES,
  addDays,
  todayIst,
} from '@nirantar/shared';
import { dueReminderOffset } from '../../domain/refill-math';
import { prisma } from '../../lib/db';

export interface ReminderRunResult {
  asOf: string;
  checked: number;
  sent: number;
  suppressed: number;
  skipped: number;
}

const TEMPLATES = {
  en: {
    due: (who: string, med: string, date: string) =>
      `Nirantar (test): ${who} ${med} may run out around ${date}, based on the dose on the prescription. Reorder in one tap in the app. If the dose has changed, upload the new prescription.`,
    renew: (who: string, med: string, date: string) =>
      `Nirantar (test): ${who} ${med} may run out around ${date}. The prescription on file has expired, so please upload a new one to reorder.`,
  },
  hi: {
    due: (who: string, med: string, date: string) =>
      `निरंतर (टेस्ट): ${who} ${med} लगभग ${date} को ख़त्म हो सकती है (पर्चे की खुराक के हिसाब से)। ऐप में एक टैप में फिर से ऑर्डर करें। खुराक बदली हो तो नया पर्चा अपलोड करें।`,
    renew: (who: string, med: string, date: string) =>
      `निरंतर (टेस्ट): ${who} ${med} लगभग ${date} को ख़त्म हो सकती है। रखे गए पर्चे की अवधि ख़त्म हो गई है, फिर से ऑर्डर करने के लिए नया पर्चा अपलोड करें।`,
  },
  bn: {
    due: (who: string, med: string, date: string) =>
      `নিরন্তর (টেস্ট): ${who} ${med} মোটামুটি ${date} তারিখে ফুরিয়ে যেতে পারে (প্রেসক্রিপশনের ডোজ অনুযায়ী)। অ্যাপে এক ট্যাপে আবার অর্ডার করুন। ডোজ বদলে থাকলে নতুন প্রেসক্রিপশন আপলোড করুন।`,
    renew: (who: string, med: string, date: string) =>
      `নিরন্তর (টেস্ট): ${who} ${med} মোটামুটি ${date} তারিখে ফুরিয়ে যেতে পারে। রাখা প্রেসক্রিপশনের মেয়াদ শেষ, আবার অর্ডার করতে নতুন প্রেসক্রিপশন আপলোড করুন।`,
  },
} as const;

const OWNER = { en: (name: string) => `${name}'s`, hi: (name: string) => `${name} की`, bn: (name: string) => `${name}-এর` };
const YOUR = { en: 'Your', hi: 'आपकी', bn: 'আপনার' };

function formatDate(date: Date, locale: 'en' | 'hi' | 'bn') {
  const intl = locale === 'en' ? 'en-IN' : `${locale}-IN-u-nu-latn`;
  return new Intl.DateTimeFormat(intl, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

export async function runReminders(asOf: Date = todayIst()): Promise<ReminderRunResult> {
  const subscriptions = await prisma.refillSubscription.findMany({
    where: { isActive: true, remindersEnabled: true, account: { remindersOptIn: true, isActive: true } },
    include: {
      account: { select: { id: true, locale: true } },
      patient: { select: { fullName: true, relation: true } },
      product: { select: { molecule: true, strength: true } },
      prescription: { select: { prescribedOn: true } },
    },
  });

  const result: ReminderRunResult = { asOf: asOf.toISOString().slice(0, 10), checked: subscriptions.length, sent: 0, suppressed: 0, skipped: 0 };

  for (const sub of subscriptions) {
    const offset = dueReminderOffset(sub.runOutOn, asOf);
    if (offset === null) continue;

    const existing = await prisma.reminder.findUnique({
      where: { subscriptionId_cycle_offsetDays: { subscriptionId: sub.id, cycle: sub.cycle, offsetDays: offset } },
    });
    if (existing) continue; // already decided on an earlier run

    // Older offsets that were never sent (e.g. job didn't run that day): mark skipped, don't burst.
    const older = REMINDER_OFFSETS_DAYS.filter((o) => o > offset);
    const skippedRows = await prisma.reminder.createMany({
      data: older.map((o) => ({ subscriptionId: sub.id, cycle: sub.cycle, offsetDays: o, status: 'SKIPPED' as const, reason: 'A later reminder was due' })),
      skipDuplicates: true,
    });
    result.skipped += skippedRows.count;

    const openOrder = await prisma.order.findFirst({
      where: {
        patientId: sub.patientId,
        status: { notIn: [...TERMINAL_ORDER_STATUSES] },
        items: { some: { productId: sub.productId, status: 'ACTIVE' } },
      },
      select: { number: true },
    });

    try {
      if (openOrder) {
        await prisma.reminder.create({
          data: { subscriptionId: sub.id, cycle: sub.cycle, offsetDays: offset, status: 'SUPPRESSED', reason: `Order ${openOrder.number} already in progress` },
        });
        result.suppressed += 1;
        continue;
      }

      const locale = sub.account.locale;
      const who = sub.patient.relation === 'SELF' ? YOUR[locale] : OWNER[locale](sub.patient.fullName);
      const med = `${sub.product.molecule} ${sub.product.strength}`;
      const prescribedOn = sub.prescription?.prescribedOn;
      const valid = prescribedOn ? addDays(prescribedOn, RX_VALIDITY_DAYS) >= sub.runOutOn : false;
      const body = (valid ? TEMPLATES[locale].due : TEMPLATES[locale].renew)(who, med, formatDate(sub.runOutOn, locale));

      await prisma.$transaction(async (tx) => {
        const message = await tx.message.create({ data: { accountId: sub.account.id, channel: 'SMS', body } });
        await tx.reminder.create({
          data: { subscriptionId: sub.id, cycle: sub.cycle, offsetDays: offset, status: 'SENT', messageId: message.id },
        });
      });
      result.sent += 1;
    } catch (error) {
      // A parallel run decided this reminder first (unique key). That's the point: skip it.
      if ((error as { code?: string }).code === 'P2002') continue;
      throw error;
    }
  }
  return result;
}

export async function recentReminders(limit = 50) {
  const reminders = await prisma.reminder.findMany({
    // SKIPPED rows are bookkeeping (older offsets never sent); not useful to show.
    where: { status: { not: 'SKIPPED' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      subscription: {
        include: {
          patient: { select: { fullName: true } },
          product: { select: { molecule: true, strength: true } },
        },
      },
      message: { select: { body: true } },
    },
  });
  return reminders.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    status: r.status,
    offsetDays: r.offsetDays,
    reason: r.reason,
    patient: r.subscription.patient.fullName,
    medicine: `${r.subscription.product.molecule} ${r.subscription.product.strength}`,
    runOutOn: r.subscription.runOutOn.toISOString().slice(0, 10),
    message: r.message?.body ?? null,
  }));
}
