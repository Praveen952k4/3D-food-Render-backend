/**
 * The service timeline the admin dashboard shows.
 *
 * Every step of a visit is already recorded somewhere — a guest session holds
 * the moment a table was taken, an order holds the moment it was placed, and
 * its statusHistory holds each kitchen stage with the staff member who moved
 * it. This turns those three sources into one list of events sorted by time,
 * so the admin sees a visit as it unfolded rather than as three screens.
 */

/** What each order status means in the dining room, in plain words. */
const STAGE = {
  pending: { key: 'order-placed', label: 'Order placed', by: 'customer' },
  confirmed: { key: 'order-accepted', label: 'Order taken by staff', by: 'staff' },
  preparing: { key: 'order-preparing', label: 'Kitchen started cooking', by: 'staff' },
  ready: { key: 'order-ready', label: 'Food ready to serve', by: 'staff' },
  delivered: { key: 'order-served', label: 'Food served to customer', by: 'staff' },
  cancelled: { key: 'order-cancelled', label: 'Order cancelled', by: 'staff' },
};

/** A table being taken: the guest session is the seating record. */
const seatingEvent = (guest) => ({
  id: `seat-${guest._id}`,
  key: 'table-booked',
  label: 'Table taken',
  at: guest.createdAt,
  tableNumber: guest.tableNumber || '',
  customerName: guest.name || 'Guest',
  orderNumber: '',
  orderId: null,
  by: 'customer',
});

/** Every stage an order has been through, oldest first. */
const orderEvents = (order) =>
  (order.statusHistory || [])
    .filter((entry) => STAGE[entry.status])
    .map((entry, index) => ({
      id: `order-${order._id}-${index}`,
      key: STAGE[entry.status].key,
      label: STAGE[entry.status].label,
      at: entry.timestamp,
      tableNumber: order.tableNumber || '',
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      orderId: order._id,
      by: STAGE[entry.status].by,
      updatedBy: entry.updatedBy || 'system',
      estimatedPrepMinutes: order.estimatedPrepMinutes || 0,
      itemCount: (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
      grandTotal: order.grandTotal,
    }));

/** Minutes between two timestamps, or null when either is missing. */
const minutesBetween = (from, to) => {
  if (!from || !to) return null;
  return Math.round((new Date(to) - new Date(from)) / 60000);
};

/**
 * One row per order: when it was placed, taken, cooked, ready and served,
 * plus how long each handover took. This is what the dashboard table reads.
 */
const orderTimeline = (order) => {
  const at = (status) => {
    const entry = (order.statusHistory || []).find((e) => e.status === status);
    return entry ? entry.timestamp : null;
  };

  const placedAt = at('pending') || order.createdAt;
  const acceptedAt = at('confirmed');
  const cookingAt = at('preparing');
  const readyAt = at('ready');
  const servedAt = at('delivered');

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    tableNumber: order.tableNumber || '',
    orderType: order.orderType,
    status: order.status,
    itemCount: (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
    grandTotal: order.grandTotal,
    estimatedPrepMinutes: order.estimatedPrepMinutes || 0,
    placedAt,
    acceptedAt,
    cookingAt,
    readyAt,
    servedAt,
    waitToAccept: minutesBetween(placedAt, acceptedAt || cookingAt),
    timeInKitchen: minutesBetween(cookingAt || acceptedAt, readyAt),
    waitToServe: minutesBetween(readyAt, servedAt),
    totalMinutes: minutesBetween(placedAt, servedAt),
  };
};

/**
 * Push one event to every admin screen that is open. Admins join no room, so
 * this goes to all sockets; only the admin dashboard listens for it.
 */
const emitActivity = (io, event) => {
  if (!io || !event) return;
  io.emit('activity', event);
};

module.exports = { STAGE, seatingEvent, orderEvents, orderTimeline, minutesBetween, emitActivity };
