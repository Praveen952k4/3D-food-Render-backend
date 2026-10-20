const Booking = require('../models/Booking');
const Table = require('../models/Table');
const Order = require('../models/Order');
const TableSession = require('../models/TableSession');
const { emitActivity, emitTableChange, bookingEvent, tableLeftEvent } = require('./activity');

/**
 * The two things nobody is around to do.
 *
 * A party that never arrives would hold its table forever, and a party that
 * has eaten and left would hold it until somebody noticed. Both are freed
 * here: a reservation is written off once its grace period has passed, and a
 * table is let go once its last order has been served and it has been quiet
 * for a while.
 *
 * This runs on a timer in a long-lived process, and is also called at the top
 * of the requests that depend on it being current — on a serverless host the
 * timer may never fire, and availability that is a sweep behind is worse than
 * no sweep at all.
 */

const GRACE_MINUTES = Number(process.env.BOOKING_GRACE_MINUTES || 30);
const IDLE_MINUTES = Number(process.env.TABLE_IDLE_MINUTES || 20);

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000);

/**
 * Reservations nobody turned up for. A booking is given its slot plus the
 * grace period; after that the table goes back to everyone else.
 */
const sweepNoShows = async (io) => {
  const cutoff = minutesAgo(GRACE_MINUTES);
  const late = await Booking.find({ status: 'reserved', scheduledFor: { $lte: cutoff } }).limit(100);

  for (const booking of late) {
    booking.moveTo('no-show', 'system');
    await booking.save();

    // It should not be holding anything — a reservation does not take a table
    // until check-in — but a booking cancelled after check-in could, so this
    // is checked rather than assumed.
    const table = await Table.findOne({ number: booking.tableNumber });
    if (table && String(table.occupiedBy) === String(booking.userId)) {
      table.release();
      await table.save();
      await TableSession.close({ tableNumber: table.number, endedBy: 'no-show' });
      emitTableChange(io, table);
    }

    console.log(`⏰ Booking for table ${booking.tableNumber} written off — ${GRACE_MINUTES} min past its time`);
    emitActivity(io, bookingEvent(booking, 'no-show'));
  }

  return late.length;
};

/**
 * Tables whose party has eaten and gone. The table is let go once its last
 * order was served more than the idle window ago and nothing is still
 * cooking — a party that ordered again is plainly still sitting there.
 */
const sweepIdleTables = async (io) => {
  const cutoff = minutesAgo(IDLE_MINUTES);
  const tables = await Table.find({
    occupiedBy: { $ne: null },
    lastServedAt: { $ne: null, $lte: cutoff },
  }).limit(100);

  let freed = 0;
  for (const table of tables) {
    const stillWorking = await Order.countDocuments({
      tableNumber: { $in: [table.number, `Table ${table.number}`] },
      userId: table.occupiedBy,
      status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] },
    });
    if (stillWorking) continue;

    const leftBy = table.toObject();
    table.release();
    await table.save();
    await TableSession.close({ tableNumber: table.number, endedBy: 'system' });
    emitTableChange(io, table);
    emitActivity(io, tableLeftEvent(leftBy, 'system'));
    freed += 1;
    console.log(`🧹 Table ${table.number} freed — quiet for ${IDLE_MINUTES} min since the last course`);
  }

  return freed;
};

/** Both sweeps. Never throws: a failed sweep must not take a request with it. */
const runHousekeeping = async (io) => {
  try {
    const [noShows, freed] = await Promise.all([sweepNoShows(io), sweepIdleTables(io)]);
    return { noShows, freed };
  } catch (error) {
    console.error('Housekeeping failed:', error.message);
    return { noShows: 0, freed: 0, error: error.message };
  }
};

/**
 * Run it alongside the request rather than before it, so a sweep never adds
 * latency to the page that triggered it. The caller does not wait.
 */
const housekeepingTick = (req) => {
  runHousekeeping(req.app?.get?.('io'));
};

module.exports = { runHousekeeping, housekeepingTick, GRACE_MINUTES, IDLE_MINUTES };
