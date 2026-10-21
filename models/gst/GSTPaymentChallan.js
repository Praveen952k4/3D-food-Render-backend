const mongoose = require('mongoose');

const gstPaymentChallanSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    required: true,
    default: 'default_restaurant',
    index: true,
  },
  period: {
    type: String, // 'YYYY-MM'
    required: true,
  },
  cpin: {
    type: String, // 14-digit Common Portal Identification Number
    required: true,
    unique: true,
  },
  returnType: {
    type: String,
    default: 'GSTR-3B',
  },
  challanDate: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    required: true,
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
  feeAmount: {
    type: Number,
    default: 0,
  },
  penaltyAmount: {
    type: Number,
    default: 0,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: [
      'challan_generated',
      'payment_initiated',
      'paid',
      'offset_completed',
      'expired'
    ],
    default: 'challan_generated',
  },
  paymentMethod: {
    type: String,
    enum: ['neft_rtgs', 'net_banking', 'over_the_counter', 'manual_portal'],
    default: 'net_banking',
  },
  cin: {
    type: String, // Challan Identification Number (from bank upon payment confirmation)
    default: '',
  },
  brn: {
    type: String, // Bank Reference Number
    default: '',
  },
  paidAt: {
    type: Date,
    default: null,
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('GSTPaymentChallan', gstPaymentChallanSchema);
