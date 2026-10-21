const mongoose = require('mongoose');

const gstCalculationSnapshotSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    required: true,
    default: 'default_restaurant',
    index: true,
  },
  period: {
    type: String, // 'YYYY-MM' e.g. '2026-10'
    required: true,
    index: true,
  },
  financialYear: {
    type: String,
    default: '2026-27',
  },
  ruleVersion: {
    type: String,
    default: 'v1.0-2026',
  },
  totalEligibleOrders: {
    type: Number,
    default: 0,
  },
  grossSales: {
    type: Number,
    default: 0,
  },
  totalDiscounts: {
    type: Number,
    default: 0,
  },
  taxableTurnover: {
    type: Number,
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
  totalOutputTax: {
    type: Number,
    default: 0,
  },
  sourceOrderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  }],
  categoryBreakdown: [{
    category: String,
    hsnCode: String,
    count: Number,
    taxableAmount: Number,
    taxAmount: Number,
  }],
  status: {
    type: String,
    enum: ['calculated', 'needs_reconciliation', 'locked'],
    default: 'calculated',
  },
  calculatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

gstCalculationSnapshotSchema.index({ restaurantId: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('GSTCalculationSnapshot', gstCalculationSnapshotSchema);
