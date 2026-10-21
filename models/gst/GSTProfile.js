const mongoose = require('mongoose');

const gstProfileSchema = new mongoose.Schema({
  restaurantId: {
    type: String,
    required: true,
    unique: true,
    default: 'default_restaurant',
    index: true,
  },
  isGstRegistered: {
    type: Boolean,
    default: false,
  },
  gstin: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
    validate: {
      validator: function(v) {
        if (!this.isGstRegistered || !v) return true;
        // Standard Indian GSTIN regex format: 2 digits state code, 10 char PAN, 1 entity code, 1 Z, 1 check digit
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: props => `${props.value} is not a valid GSTIN format.`
    }
  },
  legalBusinessName: {
    type: String,
    trim: true,
    default: '',
  },
  tradeName: {
    type: String,
    trim: true,
    default: 'AR Food Restaurant',
  },
  registrationType: {
    type: String,
    enum: ['regular', 'composition', 'unregistered'],
    default: 'regular',
  },
  state: {
    type: String,
    default: 'Tamil Nadu',
  },
  stateCode: {
    type: String,
    default: '33', // Tamil Nadu GST state code
  },
  restaurantCategory: {
    type: String,
    enum: [
      'standalone_restaurant',
      'hotel_restaurant_below_7500',
      'hotel_restaurant_above_7500',
      'food_court_takeaway'
    ],
    default: 'standalone_restaurant',
  },
  taxTreatment: {
    type: String,
    enum: ['5_percent_no_itc', '18_percent_with_itc', 'composition_1_percent'],
    default: '5_percent_no_itc',
  },
  itcEligible: {
    type: Boolean,
    default: false, // Per Notification No. 11/2017-CT(R), standalone restaurants cannot claim ITC
  },
  inHotelPremises: {
    type: Boolean,
    default: false,
  },
  hotelRoomTariffExceeds7500: {
    type: Boolean,
    default: false,
  },
  invoiceSeriesPrefix: {
    type: String,
    default: 'INV',
    trim: true,
  },
  financialYear: {
    type: String,
    default: '2026-27',
  },
  reviewStatus: {
    type: String,
    enum: ['draft', 'pending_review', 'verified'],
    default: 'draft',
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

gstProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Automatically validate ITC consistency
  if (this.restaurantCategory === 'standalone_restaurant' && this.taxTreatment === '5_percent_no_itc') {
    this.itcEligible = false;
  }
  next();
});

module.exports = mongoose.model('GSTProfile', gstProfileSchema);
