const Table = require('../models/Table');
const TableSession = require('../models/TableSession');
const Order = require('../models/Order');
const { emitTableChange, emitActivity, tableLeftEvent } = require('./activity');

/**
 * A review is the last thing a party does before they stand up, so it is the
 * clearest signal the restaurant gets that a table is about to come free.
 *
 * Acting on it hands the table back now instead of after the idle window,
 * which on a busy evening is a table — and the diner has already told us they
 * are done, so nothing is being guessed at here.
 *
 * Food still on its way is the one case where that would be wrong: a party
 * rating their starters is plainly still sitting there. Those tables are left
 * alone, and housekeeping picks them up as it always did.
 *
 * Returns true only if a table actually went back on the floor.
 */
const clearTableAfterReview = async (io, userId) => {
  if (!userId) return false;

  const table = await Table.findOne({ occupiedBy: userId });
  if (!table) return false;

  const stillCooking = await Order.countDocuments({
    tableNumber: { $in: [table.number, `Table ${table.number}`] },
    userId,
    status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] },
  });
  if (stillCooking) return false;

  const leftBy = table.toObject();
  table.release();
  await table.save();
  await TableSession.close({ tableNumber: table.number, userId, endedBy: 'review' });

  emitTableChange(io, table);
  emitActivity(io, tableLeftEvent(leftBy, 'review'));

  console.log(`🧹 Table ${table.number} freed — the party left a review`);
  return true;
};

module.exports = { clearTableAfterReview };
