import {
  DeliveryDiscountSelectionStrategy,
  DiscountClass,
} from '../generated/api';

/**
 * @typedef {import("../generated/api").DeliveryInput} DeliveryInput
 * @typedef {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult} CartDeliveryOptionsDiscountsGenerateRunResult
 */

// Lines that must not count toward the threshold.
// - SavedBy: shipping protection / returns add-on, not merchandise.
// - _gwp_gift: free gift added by the GWP app.
const EXCLUDED_VENDORS = ['SavedBy'];
const GIFT_ATTRIBUTE_VALUE = 'true';

const DEFAULT_PERCENTAGE = 100;
const MESSAGE = 'FREE SHIPPING';

const NO_CHANGES = { operations: [] };

/**
 * Free shipping when the merchandise subtotal BEFORE product/order discounts
 * reaches the configured minimum.
 *
 * Shopify's native options (price-based shipping rate, or a free-shipping
 * discount with a minimum purchase) compare the minimum against the subtotal
 * AFTER other discounts, so applying a code could take free shipping away from
 * a customer who already spent the minimum. Here the subtotal is built from
 * each line's `cost.subtotalAmount`, which is the line cost before discounts,
 * so codes, automatic discounts and loyalty rewards do not affect eligibility.
 *
 * Config lives in two discount metafields written by the admin UI extension:
 * - minimum_subtotal: minimum in the shop's currency (e.g. "120.00")
 * - shipping_discount_percentage: 1-100, 100 = free shipping
 *
 * @param {DeliveryInput} input
 * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
 */
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses.includes(DiscountClass.Shipping)) {
    return NO_CHANGES;
  }

  const minimum = parseAmount(input.discount.minimumSubtotal?.value);
  if (minimum === null) {
    // Not configured: never give free shipping by accident.
    return NO_CHANGES;
  }

  const percentage = parsePercentage(input.discount.shippingPercentage?.value);
  if (percentage === 0) {
    return NO_CHANGES;
  }

  const deliveryGroups = input.cart.deliveryGroups ?? [];
  if (deliveryGroups.length === 0) {
    return NO_CHANGES;
  }

  // The metafield is in the shop's currency; cart amounts are in the
  // buyer's presentment currency.
  const rate = Number(input.presentmentCurrencyRate) || 1;
  const minimumInPresentment = minimum * rate;

  const subtotal = qualifyingSubtotal(input.cart.lines);
  if (subtotal < minimumInPresentment) {
    return NO_CHANGES;
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message: MESSAGE,
              targets: deliveryGroups.map((group) => ({
                deliveryGroup: { id: group.id },
              })),
              value: { percentage: { value: percentage } },
            },
          ],
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

/**
 * Sum of line costs before any discount, skipping lines that are not
 * merchandise the customer paid for.
 */
export function qualifyingSubtotal(lines) {
  return (lines ?? []).reduce((total, line) => {
    if (isExcludedLine(line)) return total;
    return total + Number(line.cost?.subtotalAmount?.amount ?? 0);
  }, 0);
}

function isExcludedLine(line) {
  if (line.gwpGift?.value === GIFT_ATTRIBUTE_VALUE) return true;
  const vendor = line.merchandise?.product?.vendor;
  return vendor != null && EXCLUDED_VENDORS.includes(vendor);
}

function parseAmount(value) {
  if (value == null || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parsePercentage(value) {
  if (value == null || value === '') return DEFAULT_PERCENTAGE;
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return DEFAULT_PERCENTAGE;
  return Math.min(100, Math.max(0, percentage));
}
