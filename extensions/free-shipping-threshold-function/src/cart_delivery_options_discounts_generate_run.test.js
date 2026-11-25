import { describe, it, expect } from 'vitest';

import { cartDeliveryOptionsDiscountsGenerateRun } from './cart_delivery_options_discounts_generate_run';
import { DiscountClass } from '../generated/api';

function line(amount, { vendor = 'Parks Project', gift = false } = {}) {
  return {
    quantity: 1,
    cost: { subtotalAmount: { amount: String(amount) } },
    gwpGift: gift ? { value: 'true' } : null,
    merchandise: { __typename: 'ProductVariant', product: { vendor } },
  };
}

function buildInput({
  lines,
  minimum = '120.00',
  percentage = '100',
  classes = [DiscountClass.Shipping],
  rate = '1.0',
  groups = [{ id: 'gid://shopify/CartDeliveryGroup/0' }],
} = {}) {
  return {
    presentmentCurrencyRate: rate,
    cart: { lines, deliveryGroups: groups },
    discount: {
      discountClasses: classes,
      minimumSubtotal: minimum == null ? null : { value: minimum },
      shippingPercentage: percentage == null ? null : { value: percentage },
    },
  };
}

const run = cartDeliveryOptionsDiscountsGenerateRun;

describe('free shipping threshold', () => {
  it('applies free shipping when the pre-discount subtotal reaches the minimum', () => {
    // Same case as the real checkout: $120.67 socks + $4.95 SavedBy, -$20 code.
    // Line cost is pre-discount, so the code does not matter.
    const result = run(buildInput({ lines: [line(120.67), line(4.95, { vendor: 'SavedBy' })] }));

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].deliveryDiscountsAdd.candidates[0]).toMatchObject({
      message: 'FREE SHIPPING',
      targets: [{ deliveryGroup: { id: 'gid://shopify/CartDeliveryGroup/0' } }],
      value: { percentage: { value: 100 } },
    });
  });

  it('applies on exactly the minimum', () => {
    expect(run(buildInput({ lines: [line(120)] })).operations).toHaveLength(1);
  });

  it('does not apply below the minimum', () => {
    expect(run(buildInput({ lines: [line(119.99)] })).operations).toHaveLength(0);
  });

  it('does not count SavedBy toward the minimum', () => {
    const result = run(buildInput({ lines: [line(116), line(4.95, { vendor: 'SavedBy' })] }));
    expect(result.operations).toHaveLength(0);
  });

  it('does not count the GWP gift toward the minimum', () => {
    const result = run(buildInput({ lines: [line(100), line(30, { gift: true })] }));
    expect(result.operations).toHaveLength(0);
  });

  it('uses the configured percentage', () => {
    const result = run(buildInput({ lines: [line(150)], percentage: '50' }));
    expect(result.operations[0].deliveryDiscountsAdd.candidates[0].value).toEqual({
      percentage: { value: 50 },
    });
  });

  it('defaults to 100% when the percentage metafield is missing', () => {
    const result = run(buildInput({ lines: [line(150)], percentage: null }));
    expect(result.operations[0].deliveryDiscountsAdd.candidates[0].value).toEqual({
      percentage: { value: 100 },
    });
  });

  it('does nothing when the minimum is not configured', () => {
    expect(run(buildInput({ lines: [line(500)], minimum: null })).operations).toHaveLength(0);
    expect(run(buildInput({ lines: [line(500)], minimum: '0' })).operations).toHaveLength(0);
  });

  it('does nothing when the discount has no shipping class', () => {
    const result = run(buildInput({ lines: [line(500)], classes: [DiscountClass.Order] }));
    expect(result.operations).toHaveLength(0);
  });

  it('converts the minimum to the presentment currency', () => {
    // 120 USD * 1.4 = 168 CAD
    expect(run(buildInput({ lines: [line(160)], rate: '1.4' })).operations).toHaveLength(0);
    expect(run(buildInput({ lines: [line(170)], rate: '1.4' })).operations).toHaveLength(1);
  });

  it('targets every delivery group', () => {
    const result = run(
      buildInput({
        lines: [line(200)],
        groups: [{ id: 'gid://shopify/CartDeliveryGroup/0' }, { id: 'gid://shopify/CartDeliveryGroup/1' }],
      }),
    );
    expect(result.operations[0].deliveryDiscountsAdd.candidates[0].targets).toHaveLength(2);
  });
});
