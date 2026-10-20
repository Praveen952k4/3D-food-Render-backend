const mongoose = require('mongoose');

/**
 * One party's stay at one table: when they sat down, when the table went back
 * on the floor, and who let it go.
 *
 * The seating time used to live only on the party's own record, which worked
 * while every diner was a throwaway guest account created at that moment. A
 * signed-in customer has had an account since long before they walked in, so
 * there was nothing on it to read a seating time from, and the admin timeline
 * lost that step as soon as the page was reloaded.
 *
 * Keeping it here means a stay is recorded in its own right: it survives the
 * party leaving, it covers guests and account holders alike, and the timeline
 * can be rebuilt from the database rather than from whatever happened to be
 * on screen.
 */
const tableSessionSchema = new mongoose.Schema({
  tableNumber: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    default: '',
  },
  // How they came to the table: walked in, or arrived on a booking.
  via: {
    type: String,
    enum: ['walk-in', 'booking', ''],
    default: '',
  },
  seatedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  leftAt: {
    type: Date,
    default: null,
  },
  // 'guest' when the party said they were leaving, 'system' when housekeeping
  // found the table quiet, otherwise the staff role that cleared it.
  endedBy: {
    type: String,
    default: '',
  },
});

/** Minutes at the table, or so far if they are still sitting. */
tableSessionSchema.virtual('minutes').get(function () {
  const end = this.leftAt || new Date();
  return Math.round((end - this.seatedAt) / 60000);
});

/** Start a stay. Any stay left open for this party is closed first. */
tableSessionSchema.statics.open = async function ({ tableNumber, userId, name, via }) {
  await this.updateMany(
    { userId, leftAt: null },
    { $set: { leftAt: new Date(), endedBy: 'superseded' } }
  );
  return this.create({ tableNumber, userId, name: name || '', via: via || '' });
};

/** End the open stay at a table. Quietly does nothing if there is none. */
tableSessionSchema.statics.close = async function ({ tableNumber, userId, endedBy }) {
  const query = { leftAt: null };
  if (tableNumber) query.tableNumber = tableNumber;
  if (userId) query.userId = userId;

  return this.updateMany(query, { $set: { leftAt: new Date(), endedBy: endedBy || 'system' } });
};

module.exports = mongoose.model('TableSession', tableSessionSchema);
