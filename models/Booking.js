const mongoose = require('mongoose');

/**
 * A table reserved for a slot in the future, before anyone sits down.
 *
 * This is the step the rest of the system was missing: a visit used to begin
 * at the moment a guest took a table, so there was no way to hold Friday at
 * 7:30, and no way for the kitchen to know what was coming. A booking holds
 * the slot; checking in turns it into the live visit everything downstream
 * already understands.
 *
 * The dishes a customer pre-orders are kept here rather than as an Order. An
 * order that existed before the visit would show up in the kitchen queue, in
 * revenue and in the service timeline days early — all of which would be
 * wrong. The order is created at check-in, from the snapshot below.
 */
const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  customerPhone: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    default: '',
  },
  partySize: {
    type: Number,
    required: true,
    min: 1,
  },
  tableNumber: {
    type: String,
    required: true,
  },

  // When they are expected, and how long the table is kept for them. Together
  // these are the window two bookings for one table must not overlap in.
  scheduledFor: {
    type: Date,
    required: true,
  },
  durationMinutes: {
    type: Number,
    default: 90,
    min: 15,
  },

  status: {
    type: String,
    enum: ['reserved', 'seated', 'completed', 'cancelled', 'no-show'],
    default: 'reserved',
  },
  // Same shape as an order's history, so the admin timeline can read both.
  statusHistory: [{
    status: {
      type: String,
      enum: ['reserved', 'seated', 'completed', 'cancelled', 'no-show'],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: String,
      default: 'customer',
    },
  }],

  // The pre-order, snapshotted when it is saved so a later menu edit does not
  // rewrite what this customer chose. Empty when they decided to order on
  // arrival instead.
  preOrderItems: [{
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
    },
    name: String,
    price: Number,
    quantity: Number,
    subtotal: Number,
    prepTimeMinutes: Number,
  }],
  // The longest dish on the pre-order, as on an order: the kitchen cooks in
  // parallel, so that is how long the whole thing takes.
  estimatedPrepMinutes: {
    type: Number,
    default: 0,
  },

  notes: {
    type: String,
    default: '',
  },

  // Set at check-in — the live order this booking turned into.
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  checkedInAt: {
    type: Date,
    default: null,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

bookingSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (!this.statusHistory || this.statusHistory.length === 0) {
    this.statusHistory = [{
      status: this.status || 'reserved',
      timestamp: new Date(),
      updatedBy: 'customer',
    }];
  }
  next();
});

/** When the table stops being kept for this booking. */
bookingSchema.virtual('endsAt').get(function () {
  return new Date(this.scheduledFor.getTime() + this.durationMinutes * 60000);
});

/** Move the booking on, recording who did it. */
bookingSchema.methods.moveTo = function (status, updatedBy) {
  this.status = status;
  this.statusHistory.push({ status, timestamp: new Date(), updatedBy: updatedBy || 'system' });
};

/**
 * The bookings that would clash with a slot. Only `reserved` and `seated`
 * count — a cancelled or finished booking holds nothing. `exclude` lets a
 * booking be checked against every other one but itself.
 */
bookingSchema.statics.clashingWith = function ({ tableNumber, scheduledFor, durationMinutes = 90, exclude }) {
  const start = new Date(scheduledFor);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const query = {
    tableNumber,
    status: { $in: ['reserved', 'seated'] },
    // Two windows overlap when each starts before the other ends. Mongo cannot
    // compare two fields of the same document in a plain query, so the end of
    // a stored booking is matched on its start: anything starting before this
    // slot ends is a candidate, and the duration is checked in code below.
    scheduledFor: { $lt: end },
  };
  if (exclude) query._id = { $ne: exclude };

  return this.find(query).then((candidates) =>
    candidates.filter((booking) => booking.endsAt > start)
  );
};

module.exports = mongoose.model('Booking', bookingSchema);
