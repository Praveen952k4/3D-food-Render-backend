/**
 * How long food actually takes, read off the orders themselves.
 *
 * The clock starts when staff confirm the order and stops when it reaches
 * the table. Before the confirmation an order is sitting in a queue nobody
 * has looked at, which says nothing about the food; after it, everything
 * that happens is the wait the diner is actually sitting through.
 *
 * Every dish on a ticket wears that same gap. A ticket goes to the kitchen
 * whole and leaves whole, so the slow dish on it holds up the rest — and the
 * diner waiting for the quick one waited just as long.
 */

/** Longer than this is a ticket somebody left open, not a dish. */
const MAX_REASONABLE_MINUTES = 240;

const timestampOf = (order, status) => {
  const entry = (order.statusHistory || []).find((e) => e.status === status);
  return entry ? new Date(entry.timestamp) : null;
};

/**
 * Minutes from confirmed to served, or null when the order cannot say:
 * it was never confirmed, never served, or its stages were recorded out of
 * order — a negative gap is a bookkeeping error, not a fast kitchen.
 */
const orderPrepMinutes = (order) => {
  const confirmedAt = timestampOf(order, 'confirmed');
  const deliveredAt = timestampOf(order, 'delivered');
  if (!confirmedAt || !deliveredAt) return null;

  const minutes = (deliveredAt - confirmedAt) / 60000;
  if (minutes < 0 || minutes > MAX_REASONABLE_MINUTES) return null;
  return minutes;
};

/**
 * One row per dish: how long it averages, over how many orders, and the
 * menu's own estimate where the order recorded one. Slowest first, because
 * that is the row anyone opening this is looking for.
 */
const dishTimings = (orders) => {
  const rows = {};

  orders.forEach((order) => {
    const minutes = orderPrepMinutes(order);
    if (minutes === null) return;

    (order.items || []).forEach((item) => {
      const name = item.name || item.foodId?.name || 'Unnamed item';
      const row = (rows[name] = rows[name] || {
        name,
        category: item.foodId?.category || 'Other',
        orders: 0,
        totalMinutes: 0,
        fastestMinutes: Infinity,
        slowestMinutes: 0,
        quotedMinutes: item.prepTimeMinutes ?? item.foodId?.prepTimeMinutes ?? null,
      });
      row.orders += 1;
      row.totalMinutes += minutes;
      row.fastestMinutes = Math.min(row.fastestMinutes, minutes);
      row.slowestMinutes = Math.max(row.slowestMinutes, minutes);
    });
  });

  return Object.values(rows)
    .map((row) => ({
      name: row.name,
      category: row.category,
      orders: row.orders,
      averageMinutes: Math.round((row.totalMinutes / row.orders) * 10) / 10,
      fastestMinutes: Math.round(row.fastestMinutes),
      slowestMinutes: Math.round(row.slowestMinutes),
      quotedMinutes: row.quotedMinutes,
    }))
    .sort((a, b) => b.averageMinutes - a.averageMinutes);
};

module.exports = { MAX_REASONABLE_MINUTES, orderPrepMinutes, dishTimings };
