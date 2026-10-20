const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Table = require('../models/Table');
const TableSession = require('../models/TableSession');
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');
const { authenticate, isAdmin } = require('../middleware/auth');
const { emitActivity, emitTableChange, bookingEvent } = require('../utils/activity');
const { housekeepingTick } = require('../utils/housekeeping');

const DEFAULT_DURATION = Number(process.env.BOOKING_DURATION_MINUTES || 90);

/** Reject a date that is unusable or already past. */
const parseSlot = (value) => {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return { error: 'That date and time could not be read.' };
  if (when.getTime() < Date.now() - 60000) return { error: 'That time has already passed. Please pick a later one.' };
  return { when };
};

/**
 * Take the dishes a customer chose and snapshot them, so a later menu edit
 * does not rewrite what they were promised. Prices and preparation times are
 * read from the menu rather than trusted from the request.
 */
const snapshotPreOrder = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { preOrderItems: [], estimatedPrepMinutes: 0 };
  }

  const ids = items.map((item) => item.foodId).filter(Boolean);
  const dishes = await FoodItem.find({ _id: { $in: ids } });
  const byId = new Map(dishes.map((dish) => [String(dish._id), dish]));

  const preOrderItems = [];
  for (const item of items) {
    const dish = byId.get(String(item.foodId));
    if (!dish) continue;
    const quantity = Math.max(Number(item.quantity) || 0, 0);
    if (!quantity) continue;
    preOrderItems.push({
      foodId: dish._id,
      name: dish.name,
      price: dish.price,
      quantity,
      subtotal: dish.price * quantity,
      prepTimeMinutes: dish.prepTimeMinutes ?? 15,
    });
  }

  const estimatedPrepMinutes = preOrderItems.reduce(
    (longest, item) => Math.max(longest, item.prepTimeMinutes || 0),
    0
  );

  return { preOrderItems, estimatedPrepMinutes };
};

// GET /api/bookings/availability?scheduledFor=&partySize=
//
// Which tables are free for a slot. A table is free when no booking for it
// overlaps the window and — for a slot starting now — when nobody is sitting
// at it. Taken tables are returned too, with a reason, so the booking page can
// show them greyed out rather than silently dropping them.
router.get('/availability', async (req, res) => {
  try {
    // A reservation past its grace period is not holding anything, and a table
    // that has been quiet is free. Availability that is a sweep behind is
    // worse than no sweep at all.
    housekeepingTick(req);
    const { when, error } = parseSlot(req.query.scheduledFor);
    if (error) return res.status(400).json({ success: false, message: error });

    const partySize = Math.max(Number(req.query.partySize) || 1, 1);
    const durationMinutes = Number(req.query.durationMinutes) || DEFAULT_DURATION;

    const tables = await Table.find({ isActive: true }).sort({ number: 1 });
    const slotStartsNow = when.getTime() <= Date.now() + 15 * 60000;

    const availability = [];
    for (const table of tables) {
      const clashes = await Booking.clashingWith({
        tableNumber: table.number,
        scheduledFor: when,
        durationMinutes,
      });

      let unavailableReason = '';
      if (table.seats < partySize) unavailableReason = `Seats ${table.seats}`;
      else if (clashes.length) unavailableReason = 'Reserved';
      else if (slotStartsNow && table.occupiedBy) unavailableReason = 'Occupied';

      availability.push({
        number: table.number,
        label: table.label,
        seats: table.seats,
        isAvailable: !unavailableReason,
        unavailableReason,
      });
    }

    res.json({
      success: true,
      scheduledFor: when,
      partySize,
      durationMinutes,
      tables: availability,
      availableCount: availability.filter((t) => t.isAvailable).length,
    });
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ success: false, message: 'Could not check table availability.' });
  }
});

// POST /api/bookings - reserve a table for a slot
router.post('/', authenticate, async (req, res) => {
  try {
    // Guests sign in by table number for the visit they are already on, so a
    // future booking is not theirs to make.
    if (req.user.role === 'guest') {
      return res.status(403).json({
        success: false,
        message: 'Please sign in with your phone number to book a table in advance.',
      });
    }

    const { when, error } = parseSlot(req.body.scheduledFor);
    if (error) return res.status(400).json({ success: false, message: error });

    const tableNumber = String(req.body.tableNumber ?? '').trim();
    const partySize = Math.max(Number(req.body.partySize) || 0, 0);
    const durationMinutes = Number(req.body.durationMinutes) || DEFAULT_DURATION;

    if (!tableNumber) return res.status(400).json({ success: false, message: 'Please choose a table.' });
    if (!partySize) return res.status(400).json({ success: false, message: 'How many people are coming?' });

    const table = await Table.findOne({ number: tableNumber });
    if (!table || !table.isActive) {
      return res.status(404).json({ success: false, message: `Table ${tableNumber} is not available to book.` });
    }
    if (table.seats < partySize) {
      return res.status(400).json({
        success: false,
        message: `Table ${tableNumber} seats ${table.seats}. Please pick a larger one.`,
      });
    }

    // Checked again here, not just when the list was drawn, so two people
    // booking the same slot seconds apart cannot both succeed.
    const clashes = await Booking.clashingWith({ tableNumber, scheduledFor: when, durationMinutes });
    if (clashes.length) {
      return res.status(409).json({
        success: false,
        message: `Table ${tableNumber} is already reserved around that time. Please pick another table or time.`,
      });
    }

    const { preOrderItems, estimatedPrepMinutes } = await snapshotPreOrder(req.body.preOrderItems);

    const booking = new Booking({
      userId: req.user.id,
      customerPhone: req.body.customerPhone || req.user.phone,
      customerName: String(req.body.customerName ?? '').trim(),
      partySize,
      tableNumber,
      scheduledFor: when,
      durationMinutes,
      preOrderItems,
      estimatedPrepMinutes,
      notes: String(req.body.notes ?? '').trim(),
    });
    await booking.save();

    console.log(`📅 Table ${tableNumber} reserved for ${when.toISOString()} (party of ${partySize})`);
    emitActivity(req.app.get('io'), bookingEvent(booking, 'reserved'));

    res.json({ success: true, message: `Table ${tableNumber} is reserved`, booking });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, message: 'Could not make that booking.' });
  }
});

// GET /api/bookings/mine - the signed-in customer's own bookings
router.get('/mine', authenticate, async (req, res) => {
  try {
    housekeepingTick(req);
    const bookings = await Booking.find({ userId: req.user.id }).sort({ scheduledFor: -1 }).limit(50);
    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({ success: false, message: 'Could not load your bookings.' });
  }
});

/** Load a booking and check the caller is allowed to touch it. */
const loadOwned = async (req) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return { error: { status: 404, message: 'That booking could not be found.' } };

  const isStaff = ['admin', 'chef'].includes(req.user.role);
  if (!isStaff && String(booking.userId) !== String(req.user.id)) {
    return { error: { status: 403, message: 'That booking is not yours.' } };
  }
  return { booking, isStaff };
};

// PUT /api/bookings/:id/pre-order - set or replace the dishes for a booking
router.put('/:id/pre-order', authenticate, async (req, res) => {
  try {
    const { booking, error } = await loadOwned(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (booking.status !== 'reserved') {
      return res.status(400).json({
        success: false,
        message: 'This booking can no longer be changed. Please order at the table instead.',
      });
    }

    const { preOrderItems, estimatedPrepMinutes } = await snapshotPreOrder(req.body.preOrderItems);
    booking.preOrderItems = preOrderItems;
    booking.estimatedPrepMinutes = estimatedPrepMinutes;
    await booking.save();

    res.json({ success: true, message: 'Pre-order saved', booking });
  } catch (error) {
    console.error('Save pre-order error:', error);
    res.status(500).json({ success: false, message: 'Could not save the pre-order.' });
  }
});

// POST /api/bookings/:id/check-in
//
// The party has arrived. This is where a booking becomes the live visit: the
// table is held for real, and a pre-order becomes an order the kitchen can see.
router.post('/:id/check-in', authenticate, async (req, res) => {
  try {
    const { booking, error } = await loadOwned(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (booking.status === 'seated') {
      return res.status(400).json({ success: false, message: 'This booking is already checked in.' });
    }
    if (booking.status !== 'reserved') {
      return res.status(400).json({ success: false, message: `This booking was ${booking.status}.` });
    }

    const table = await Table.findOne({ number: booking.tableNumber });
    if (!table) {
      return res.status(404).json({ success: false, message: 'That table no longer exists.' });
    }
    // Somebody else is sitting there. Staff need to know now, while they can
    // still move the party, rather than after the kitchen has started.
    if (table.occupiedBy && String(table.occupiedBy) !== String(booking.userId)) {
      return res.status(409).json({
        success: false,
        message: `Table ${booking.tableNumber} is still in use. Please ask a member of staff to seat you.`,
      });
    }

    const guest = { _id: booking.userId, name: booking.customerName };
    table.hold(guest, 'booking');
    await table.save();
    await TableSession.open({
      tableNumber: table.number,
      userId: booking.userId,
      name: booking.customerName,
      via: 'booking',
    });

    let order = null;
    if (booking.preOrderItems.length > 0) {
      const subtotal = booking.preOrderItems.reduce((sum, item) => sum + item.subtotal, 0);
      const tax = Math.round(subtotal * 0.05 * 100) / 100;

      order = new Order({
        userId: booking.userId,
        customerPhone: booking.customerPhone,
        customerName: booking.customerName || `Table ${booking.tableNumber}`,
        orderType: 'dine-in',
        items: booking.preOrderItems.map((item) => ({
          foodId: item.foodId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
          prepTimeMinutes: item.prepTimeMinutes,
        })),
        subtotal,
        tax,
        grandTotal: subtotal + tax,
        tableNumber: booking.tableNumber,
        estimatedPrepMinutes: booking.estimatedPrepMinutes,
        bookingId: booking._id,
        status: 'pending',
        statusHistory: [{ status: 'pending', timestamp: new Date(), updatedBy: 'pre-order' }],
      });
      await order.save();
      booking.orderId = order._id;
    }

    booking.checkedInAt = new Date();
    booking.moveTo('seated', req.user.role === 'customer' ? 'customer' : req.user.role);
    await booking.save();

    const io = req.app.get('io');
    console.log(`🪑 Booking for table ${booking.tableNumber} checked in${order ? ` with pre-order ${order.orderNumber}` : ''}`);
    emitActivity(io, bookingEvent(booking, 'seated'));
    emitTableChange(io, table);
    if (order && io) {
      // The kitchen's queue is driven by the same event a walk-in order sends.
      io.emit('orderUpdate', { type: 'created', order, newStatus: 'pending' });
    }

    res.json({
      success: true,
      message: order
        ? `Checked in. Your pre-order ${order.orderNumber} has gone to the kitchen.`
        : 'Checked in. Your table is ready.',
      booking,
      order,
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ success: false, message: 'Could not check you in.' });
  }
});

// PATCH /api/bookings/:id/cancel
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { booking, isStaff, error } = await loadOwned(req);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (!['reserved', 'seated'].includes(booking.status)) {
      return res.status(400).json({ success: false, message: `This booking was already ${booking.status}.` });
    }

    booking.moveTo('cancelled', isStaff ? req.user.role : 'customer');
    await booking.save();

    // A cancelled booking that had already been seated leaves its table held,
    // so let it go here.
    if (booking.checkedInAt) {
      const table = await Table.findOne({ number: booking.tableNumber });
      if (table && String(table.occupiedBy) === String(booking.userId)) {
        table.release();
        await table.save();
        await TableSession.close({ tableNumber: table.number, endedBy: 'cancelled' });
        emitTableChange(req.app.get('io'), table);
      }
    }

    res.json({ success: true, message: 'Booking cancelled', booking });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, message: 'Could not cancel that booking.' });
  }
});

// GET /api/bookings - every booking, for the admin
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    housekeepingTick(req);
    const days = Math.min(Number(req.query.days) || 7, 90);
    const from = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const bookings = await Booking.find({ scheduledFor: { $gte: from, $lte: to } })
      .sort({ scheduledFor: 1 })
      .limit(200);

    res.json({
      success: true,
      bookings,
      counts: {
        reserved: bookings.filter((b) => b.status === 'reserved').length,
        seated: bookings.filter((b) => b.status === 'seated').length,
        cancelled: bookings.filter((b) => ['cancelled', 'no-show'].includes(b.status)).length,
      },
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, message: 'Could not load the bookings.' });
  }
});

// PATCH /api/bookings/:id/status - admin marks a booking no-show or completed
router.patch('/:id/status', authenticate, isAdmin, async (req, res) => {
  try {
    const status = String(req.body.status ?? '');
    if (!['no-show', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'A booking can be marked no-show or completed.' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'That booking could not be found.' });

    booking.moveTo(status, 'admin');
    await booking.save();

    // Finishing or writing off a booking frees whatever it was holding.
    const table = await Table.findOne({ number: booking.tableNumber });
    if (table && String(table.occupiedBy) === String(booking.userId)) {
      table.release();
      await table.save();
      await TableSession.close({ tableNumber: table.number, endedBy: status });
      emitTableChange(req.app.get('io'), table);
    }

    emitActivity(req.app.get('io'), bookingEvent(booking, status));
    res.json({ success: true, message: `Booking marked ${status}`, booking });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ success: false, message: 'Could not update that booking.' });
  }
});

module.exports = router;
