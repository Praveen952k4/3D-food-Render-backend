const mongoose = require('mongoose');

const gstReturnDraftSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    required: true,
    default: 'default_restaurant',
    index: true,
  },
  returnType: {
    type: String,
    enum: ['GSTR-1', 'GSTR-3B'],
    required: true,
  },
  period: {
    type: String, // 'YYYY-MM'
    required: true,
  },
  financialYear: {
    type: String,
    default: '2026-27',
  },
  version: {
    type: Number,
    default: 1,
  },
  status: {
    type: String,
    enum: [
      'draft',
      'validated',
      'ready_for_review',
      'approved',
      'submission_pending',
      'submitted',
      'filed',
      'failed'
    ],
    default: 'draft',
  },
  validationErrors: [{
    code: String,
    field: String,
    message: String,
    severity: {
      type: String,
      enum: ['warning', 'error'],
      default: 'error',
    },
  }],
  // Summary financials
  taxableAmount: {
    type: Number,
    default: 0,
  },
  cgstAmount: {
    type: Number,
    default: 0,
  },
  sgstAmount: {
    type: Number,
    default: 0,
  },
  igstAmount: {
    type: Number,
    default: 0,
  },
  totalTaxAmount: {
    type: Number,
    default: 0,
  },
  eligibleItcAmount: {
    type: Number,
    default: 0,
  },
  netPayableAmount: {
    type: Number,
    default: 0,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed, // Exact GSTN JSON payload schema
    default: {},
  },
  snapshotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GSTCalculationSnapshot',
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  approvalNotes: {
    type: String,
    default: '',
  },
  submissionAttempts: [{
    attemptAt: {
      type: Date,
      default: Date.now,
    },
    provider: {
      type: String,
      default: 'MockProvider',
    },
    correlationId: String,
    status: String,
    providerResponseRef: String,
    errorMessage: String,
  }],
  arn: {
    type: String, // Acknowledgement Reference Number (only set when officially filed)
    default: null,
  },
  filingDate: {
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

gstReturnDraftSchema.index({ restaurantId: 1, returnType: 1, period: 1, version: 1 });

module.exports = mongoose.model('GSTReturnDraft', gstReturnDraftSchema);
