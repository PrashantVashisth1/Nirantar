/** Brief: Bengali, Hindi and English. Order messages follow the language on the account. */
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db';
import { orderMessages } from '../src/services/orders/order-messages';
import { notify } from '../src/services/orders/order-helpers';
import { createCustomer, createOrder, createProduct, createStore, resetDb } from './helpers/factory';
import { randomPhone } from './helpers/auth';

beforeEach(async () => {
  await resetDb();
});

async function sendTo(locale: 'en' | 'hi' | 'bn') {
  await createStore();
  const product = await createProduct('OTC');
  const customer = await createCustomer(randomPhone());
  await prisma.user.update({ where: { id: customer.user.id }, data: { locale } });
  const order = await createOrder({ customer, status: 'AWAITING_PHARMACIST', items: [{ productId: product.id }] });
  await prisma.$transaction((tx) => notify(tx, customer.user.id, order.id, orderMessages.delivered('RX-1')));
  return (await prisma.message.findFirstOrThrow({ where: { accountId: customer.user.id } })).body;
}

describe('order messages', () => {
  it('uses the language on the account', async () => {
    expect(await sendTo('bn')).toBe('Nirantar (test): অর্ডার RX-1 পৌঁছে গেছে।');
  });

  it('uses Hindi for a Hindi account and English for an English one', async () => {
    expect(await sendTo('hi')).toContain('पहुँच गया');
    await resetDb();
    expect(await sendTo('en')).toBe('Nirantar (test): Order RX-1 has been delivered.');
  });

  it('has every message in all three languages, carrying the order number', () => {
    const samples = [
      orderMessages.approved('RX-9'),
      orderMessages.changes('RX-9'),
      orderMessages.rejected('RX-9'),
      orderMessages.reupload('RX-9'),
      orderMessages.onTheWay('RX-9', 'Bapi'),
      orderMessages.delivered('RX-9'),
      orderMessages.paid('RX-9'),
      orderMessages.paymentFailed('RX-9'),
    ];
    for (const message of samples) {
      for (const text of [message.en, message.hi, message.bn]) expect(text).toContain('RX-9');
    }
  });
});
