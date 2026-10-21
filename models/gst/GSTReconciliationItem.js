const mongoose = require('mongoose');

const gstReconciliationItemSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    required: true,
    default: 'default_restaurant',
    index: true,
  },
  period: {
    type: String, // 'YYYY-MM'
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['purchase_invoice', 'credit_note', 'debit_note', 'prior_period_adjustment'],
    required: true,
  },
  referenceNumber: {
    type: String,
    required: true,
  },
  referenceDate: {
    type: Date,
    default: Date.now,
  },
  partyGstin: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
  },
  partyName: {
    type: String,
    default: '',
  },
  taxableValue: {
    type: Number,
    required: true,
    default: 0,
  },
  cgst: {
    type: Number,
    default: 0,
  },
  sgst: {
    type: Number,
    default: 0,
  },
  igst: {
    type: Number,
    default: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0,
  },
  itcEligibility: {
    type: String,
    enum: ['ineligible', 'eligible', 'blocked_sec_17_5'],
    default: 'ineligible', // Safe default for standalone restaurant
  },
  reconciliationStatus: {
    type: String,
    enum: ['reconciled', 'unmatched', 'requires_review'],
    default: 'reconciled',
  },
  notes: {
    type: String,
    default: '',
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('GSTReconciliationItem', gstReconciliationItemSchema);
