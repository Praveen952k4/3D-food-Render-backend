const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
  },
  minOrderValue: {
    type: Number,
    default: 0,
  },
  maxDiscount: {
    type: Number,
    default: null,
  },
  usageLimit: {
    type: Number,
    default: null, // null means unlimited
  },
  usedCount: {
    type: Number,
    default: 0,
  },
  validFrom: {
    type: Date,
    default: Date.now,
  },
  validUntil: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  applicableCategories: [{
    type: String,
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
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

// Update timestamp on save
couponSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if coupon is valid
couponSchema.methods.isValid = function() {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.validFrom > now) return false;
  if (this.validUntil < now) return false;
  if (this.usageLimit && this.usedCount >= this.usageLimit) return false;
  return true;
};

// Method to calculate discount
couponSchema.methods.calculateDiscount = function(orderValue) {
  if (!this.isValid()) return 0;
  if (orderValue < this.minOrderValue) return 0;

  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = (orderValue * this.discountValue) / 100;
    if (this.maxDiscount && discount > this.maxDiscount) {
      discount = this.maxDiscount;
    }
  } else {
    discount = this.discountValue;
  }

  return Math.min(discount, orderValue);
};

module.exports = mongoose.model('Coupon', couponSchema);
