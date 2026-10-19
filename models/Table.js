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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Table', tableSchema);
