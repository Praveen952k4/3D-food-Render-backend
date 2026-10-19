/**
 * GST helpers.
 *
 * Restaurant service in India is taxed at 5% GST with no input tax credit,
 * split evenly between CGST and SGST for an intra-state supply. Orders store
 * the total tax amount, so the split is derived from it here rather than being
 * recomputed from the subtotal (older orders keep whatever tax they were
 * charged with).
 */

const GST_RATE = 0.05;
const CGST_RATE = 0.025;
const SGST_RATE = 0.025;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Break one order down into its taxable value and GST components.
 * `taxableValue` is what the tax was charged on: subtotal less any discount.
 */
const gstForOrder = (order) => {
  const subtotal = Number(order.subtotal) || 0;
  const discount = (Number(order.discount) || 0) + (Number(order.couponDiscount) || 0);
  const taxableValue = round2(Math.max(subtotal - discount, 0));
  const total = round2(order.tax);
  const cgst = round2(total / 2);

  return {
    taxableValue,
    cgst,
    sgst: round2(total - cgst),
    total,
    rate: GST_RATE,
  };
};

/** Sum the GST of a list of orders. */
const gstTotals = (orders) =>
  orders.reduce(
    (acc, order) => {
      const g = gstForOrder(order);
      acc.taxableValue = round2(acc.taxableValue + g.taxableValue);
      acc.cgst = round2(acc.cgst + g.cgst);
      acc.sgst = round2(acc.sgst + g.sgst);
      acc.total = round2(acc.total + g.total);
      return acc;
    },
    { taxableValue: 0, cgst: 0, sgst: 0, total: 0, rate: GST_RATE }
  );

/** Orders that count as earned revenue. */
const isPaid = (order) =>
  order.paymentStatus === 'success' || order.paymentStatus === 'completed';

module.exports = { GST_RATE, CGST_RATE, SGST_RATE, round2, gstForOrder, gstTotals, isPaid };
