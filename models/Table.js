const mongoose = require('mongoose');

/**
 * A table in the restaurant. Guests sign in by table number, so this is what
 * that number is checked against — an unknown or retired table is refused
 * rather than silently accepted.
 */
const tableSchema = new mongoose.Schema({
  number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  label: {
    type: String,
    default: '',
  },
  seats: {
    type: Number,
    default: 4,
  },
  isActive: {
    type: Boolean,
    default: true,
  },

  // --- who is sitting here right now ---------------------------------------
  // A table is held from the moment a guest takes it until their order is
  // served, so nobody else can sign in at it meanwhile. Held tables are
  // offered to no one: the guest door greys them out and the server refuses
  // them, which is what stops two parties sharing one table session.
  occupiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  occupiedAt: {
    type: Date,
    default: null,
  },
  occupantName: {
    type: String,
    default: '',
  },
  // 'walk-in' for someone already sitting down, 'booking' for a table
  // reserved from the booking door before arriving.
  heldVia: {
    type: String,
    enum: ['walk-in', 'booking', ''],
    default: '',
  },
  // When this table's most recent order was served. A party is usually still
  // eating for a while after that, so the table is let go once it has been
  // quiet since — not the moment the plate lands.
  lastServedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});



/** True while someone holds this table. */
tableSchema.virtual('isOccupied').get(function () {
  return Boolean(this.occupiedBy);
});

/** Hand the table to a guest. Call save() afterwards. */
tableSchema.methods.hold = function (guest, via) {
  this.occupiedBy = guest._id;
  this.occupiedAt = new Date();
  this.occupantName = guest.name || '';
  this.heldVia = via;
  this.lastServedAt = null;
};

/** Let the table go once the visit is over. Call save() afterwards. */
tableSchema.methods.release = function () {
  this.occupiedBy = null;
  this.occupiedAt = null;
  this.occupantName = '';
  this.heldVia = '';
  this.lastServedAt = null;
};

module.exports = mongoose.model('Table', tableSchema);
