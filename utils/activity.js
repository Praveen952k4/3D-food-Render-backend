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

/** A booking's own stages, in the same words the timeline uses for orders. */
const BOOKING_STAGE = {
  reserved: 'Table reserved in advance',
  seated: 'Guest checked in',
  completed: 'Visit completed',
  cancelled: 'Booking cancelled',
  'no-show': 'Booking marked no-show',
};

/** One timeline event for a booking, shaped like an order's. */
const bookingEvent = (booking, stage) => ({
  id: `booking-${booking._id}-${stage}`,
  key: stage === 'seated' ? 'guest-checked-in' : 'table-reserved',
  label: BOOKING_STAGE[stage] || 'Booking updated',
  at: stage === 'seated' ? booking.checkedInAt || new Date() : new Date(),
  tableNumber: booking.tableNumber || '',
  customerName: booking.customerName || 'Guest',
  orderNumber: '',
  orderId: booking.orderId || null,
  by: 'customer',
  scheduledFor: booking.scheduledFor,
  partySize: booking.partySize,
  estimatedPrepMinutes: booking.estimatedPrepMinutes || 0,
  itemCount: (booking.preOrderItems || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
});

/**
 * Push one event to every admin screen that is open. Admins join no room, so
 * this goes to all sockets; only the admin dashboard listens for it.
 */
const emitActivity = (io, event) => {
  if (!io || !event) return;
  io.emit('activity', event);
};

/**
 * Tell every open sign-in page that a table has been taken or let go, so the
 * list of free tables stays honest while someone is looking at it. Two people
 * picking the same table seconds apart is the case this exists for: the
 * second one sees it go grey, and the server still refuses it either way.
 */
const emitTableChange = (io, table) => {
  if (!io || !table) return;
  io.emit('tableChange', {
    number: table.number,
    label: table.label,
    seats: table.seats,
    isOccupied: Boolean(table.occupiedBy),
    occupiedAt: table.occupiedAt,
    heldVia: table.heldVia,
  });
};

/** Older orders stored the table as "Table 5", newer ones as "5". */
const tableNumberOf = (order) => {
  const raw = String(order?.tableNumber ?? '').trim();
  if (!raw) return '';
  return raw.toLowerCase().startsWith('table') ? raw.slice(5).trim() : raw;
};

/**
 * Note that a table's food has arrived. The hold is not ended here: a party
 * is usually still eating, and often orders again. The table is let go when
 * they say they are leaving, when staff clear it, or when housekeeping finds
 * it quiet — serving the food only starts that clock.
 */
const markOrderServed = async (Table, order, io) => {
  const number = tableNumberOf(order);
  if (!number) return;

  const table = await Table.findOne({ number });
  if (!table || !table.occupiedBy) return;

  // Only the party who holds it, so serving one order cannot start the clock
  // on a table that has already turned over to somebody else.
  if (String(table.occupiedBy) !== String(order.userId)) return;

  table.lastServedAt = new Date();
  await table.save();
  console.log(`🍽️  Table ${number} served (${order.orderNumber}) — idle clock started`);
  emitTableChange(io, table);
};

module.exports = {
  STAGE,
  BOOKING_STAGE,
  bookingEvent,
  seatingEvent,
  orderEvents,
  orderTimeline,
  minutesBetween,
  emitActivity,
  emitTableChange,
  markOrderServed,
  tableNumberOf,
};
