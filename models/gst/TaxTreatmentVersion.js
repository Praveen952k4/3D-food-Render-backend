const mongoose = require('mongoose');

const taxTreatmentVersionSchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
    unique: true,
    default: 'v1.0-2026',
  },
  description: {
    type: String,
    default: 'Standard GST Notification No. 11/2017-CT(R) for standalone restaurant services',
  },
  effectiveFrom: {
    type: Date,
    default: () => new Date('2024-04-01'),
  },
  effectiveTo: {
    type: Date,
    default: null, // null means indefinitely in effect
  },
  category: {
    type: String,
    default: 'standalone_restaurant',
  },
  cgstRate: {
    type: Number,
    required: true,
    default: 2.5,
  },
  sgstRate: {
    type: Number,
    required: true,
    default: 2.5,
  },
  igstRate: {
    type: Number,
    required: true,
    default: 5.0,
  },
  itcAllowed: {
    type: Boolean,
    default: false,
  },
  hsnCode: {
    type: String,
    default: '996331', // Restaurant service SAC/HSN
  },
  statutoryReference: {
    type: String,
    default: 'CBIC Notification No. 11/2017-Central Tax (Rate)',
  },
  reviewedBy: {
    type: String,
    default: 'Tax Professional',
  },
  reviewStatus: {
    type: String,
    enum: ['draft', 'reviewed', 'active', 'archived'],
    default: 'active',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('TaxTreatmentVersion', taxTreatmentVersionSchema);
