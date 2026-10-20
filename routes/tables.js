const express = require('express');
const router = express.Router();
const Table = require('../models/Table');
const TableSession = require('../models/TableSession');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const { authenticate, isAdmin } = require('../middleware/auth');
const { emitTableChange, emitActivity, seatingEvent, tableLeftEvent } = require('../utils/activity');
const { housekeepingTick, IDLE_MINUTES, GRACE_MINUTES } = require('../utils/housekeeping');

/**
 * Tables as they stand right now: who is at them, how long they have been
 * there, and whether anyone can leave yet.
 *
 * A table frees itself three ways — the party says they are leaving, staff
 * clear it, or housekeeping finds it quiet since the last course. This is
 * where the first two live.
 */

/** Everything the floor needs to know about one table. */
const describe = async (table) => {
  const activeOrders = table.occupiedBy
    ? await Order.countDocuments({
        tableNumber: { $in: [table.number, `Table ${table.number}`] },
        userId: table.occupiedBy,
        status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] },
      })
    : 0;

  const servedMinutesAgo = table.lastServedAt
    ? Math.round((Date.now() - new Date(table.lastServedAt)) / 60000)
    : null;

  return {
    number: table.number,
    label: table.label,
    seats: table.seats,
    isOccupied: Boolean(table.occupiedBy),
    occupantName: table.occupantName,
    heldVia: table.heldVia,
    occupiedAt: table.occupiedAt,
    sittingMinutes: table.occupiedAt
      ? Math.round((Date.now() - new Date(table.occupiedAt)) / 60000)
      : null,
    lastServedAt: table.lastServedAt,
    servedMinutesAgo,
    // Nothing still cooking and the food has arrived: the party is free to go
    // whenever they like, and the table will free itself if they just walk out.
    canLeave: Boolean(table.occupiedBy) && activeOrders === 0 && Boolean(table.lastServedAt),
    activeOrders,
    freesItselfInMinutes:
      servedMinutesAgo !== null && activeOrders === 0
        ? Math.max(IDLE_MINUTES - servedMinutesAgo, 0)
        : null,
  };
};

// GET /api/tables - the floor, as it stands (staff)
router.get('/', authenticate, async (req, res) => {
  try {
    housekeepingTick(req);
    if (!['admin', 'chef'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Staff only.' });
    }

    const tables = await Table.find({ isActive: true }).sort({ number: 1 });
    const described = await Promise.all(tables.map(describe));

    res.json({
      success: true,
      tables: described,
      occupied: described.filter((t) => t.isOccupied).length,
      settings: { idleMinutes: IDLE_MINUTES, graceMinutes: GRACE_MINUTES },
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ success: false, message: 'Could not load the tables.' });
  }
});

// GET /api/tables/mine - the table the signed-in diner is sitting at
router.get('/mine', authenticate, async (req, res) => {
  try {
    const table = await Table.findOne({ occupiedBy: req.user.id });
    if (!table) return res.json({ success: true, table: null });
    res.json({ success: true, table: await describe(table) });
  } catch (error) {
    console.error('Get my table error:', error);
    res.status(500).json({ success: false, message: 'Could not load your table.' });
  }
});

// POST /api/tables/:number/take - sit down at a table
//
// How a signed-in diner starts a visit now: they pick their table after
// signing in, and the moment they take it is the start of everything the
// admin timeline measures afterwards.
router.post('/:number/take', authenticate, async (req, res) => {
  try {
    const User = require('../models/User');
    const table = await Table.findOne({ number: req.params.number });

    if (!table || !table.isActive) {
      return res.status(404).json({ success: false, message: 'That table is not available.' });
    }

    // Already here: say so rather than failing, so a reload is harmless.
    if (table.occupiedBy && String(table.occupiedBy) === String(req.user.id)) {
      return res.json({ success: true, message: `You are already at table ${table.number}`, table });
    }

    if (table.occupiedBy) {
      return res.status(409).json({
        success: false,
        message: `Table ${table.number} is taken. Please choose another one.`,
      });
    }

    // One table at a time: leaving the old one keeps the floor honest.
    const previous = await Table.findOne({ occupiedBy: req.user.id });
    if (previous) {
      previous.release();
      await previous.save();
      await TableSession.close({ userId: req.user.id, endedBy: 'moved' });
      emitTableChange(req.app.get('io'), previous);
    }

    const diner = await User.findById(req.user.id).select('name phone');
    table.hold({ _id: req.user.id, name: diner?.name || '' }, 'walk-in');
    await table.save();
    await TableSession.open({
      tableNumber: table.number,
      userId: req.user.id,
      name: diner?.name || diner?.phone || '',
      via: 'walk-in',
    });

    const io = req.app.get('io');
    emitTableChange(io, table);
    emitActivity(io, seatingEvent({
      _id: req.user.id,
      createdAt: table.occupiedAt,
      tableNumber: table.number,
      name: diner?.name || diner?.phone || 'Guest',
    }));

    console.log(`🪑 Table ${table.number} taken by ${diner?.phone || req.user.id}`);
    res.json({ success: true, message: `You are at table ${table.number}`, table });
  } catch (error) {
    console.error('Take table error:', error);
    res.status(500).json({ success: false, message: 'Could not seat you at that table.' });
  }
});

// POST /api/tables/leave - the party is leaving
//
// The honest version of "are they still here": the people at the table say so.
// Housekeeping catches the ones who just walk out, but this frees the table at
// once rather than twenty minutes later, which on a busy evening is a table.
router.post('/leave', authenticate, async (req, res) => {
  try {
    const table = await Table.findOne({ occupiedBy: req.user.id });
    if (!table) {
      return res.status(404).json({ success: false, message: 'You are not at a table right now.' });
    }

    // Walking out on food that is still coming is almost always a mistake, so
    // it is refused rather than quietly done.
    const activeOrders = await Order.countDocuments({
      tableNumber: { $in: [table.number, `Table ${table.number}`] },
      userId: req.user.id,
      status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] },
    });
    if (activeOrders > 0) {
      return res.status(409).json({
        success: false,
        message: 'You still have food on the way. Please ask a member of staff before leaving.',
      });
    }

    const number = table.number;
    const leftBy = { ...table.toObject(), number };
    table.release();
    await table.save();
    await TableSession.close({ tableNumber: number, userId: req.user.id, endedBy: 'guest' });
    emitTableChange(req.app.get('io'), table);
    emitActivity(req.app.get('io'), tableLeftEvent(leftBy, 'guest'));

    // A booking that ran this visit is finished, not abandoned.
    await Booking.updateMany(
      { userId: req.user.id, tableNumber: number, status: 'seated' },
      { $set: { status: 'completed', updatedAt: new Date() } }
    );

    console.log(`👋 Table ${number} freed — the party left`);
    res.json({ success: true, message: `Thanks for visiting. Table ${number} is free.` });
  } catch (error) {
    console.error('Leave table error:', error);
    res.status(500).json({ success: false, message: 'Could not close your visit.' });
  }
});

// POST /api/tables/:number/free - staff clear a table
router.post('/:number/free', authenticate, isAdmin, async (req, res) => {
  try {
    const table = await Table.findOne({ number: req.params.number });
    if (!table) return res.status(404).json({ success: false, message: 'No such table.' });
    if (!table.occupiedBy) {
      return res.status(400).json({ success: false, message: `Table ${table.number} is already free.` });
    }

    const guestId = table.occupiedBy;
    const leftBy = table.toObject();
    table.release();
    await table.save();
    await TableSession.close({ tableNumber: table.number, endedBy: req.user.role });
    emitTableChange(req.app.get('io'), table);
    emitActivity(req.app.get('io'), tableLeftEvent(leftBy, req.user.role));

    await Booking.updateMany(
      { userId: guestId, tableNumber: table.number, status: 'seated' },
      { $set: { status: 'completed', updatedAt: new Date() } }
    );

    console.log(`🧹 Table ${table.number} cleared by ${req.user.role}`);
    res.json({ success: true, message: `Table ${table.number} is free` });
  } catch (error) {
    console.error('Free table error:', error);
    res.status(500).json({ success: false, message: 'Could not clear that table.' });
  }
});

module.exports = router;
