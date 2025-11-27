const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['customer', 'admin', 'chef'],
    default: 'customer',
  },
  otp: {
    type: String,
    default: null,
  },
  otpExpiry: {
    type: Date,
    default: null,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  loginHistory: [{
    timestamp: {
      type: Date,
      default: Date.now,
    },
    ipAddress: String,
    userAgent: String,
  }],
  isOnline: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Auto-assign admin/chef role based on phone number
userSchema.pre('save', function(next) {
  const adminPhones = process.env.ADMIN_PHONES?.split(',') || [];
  const chefPhones = process.env.CHEF_PHONES?.split(',') || ['9999999999']; // Default chef phone
  
  if (adminPhones.includes(this.phone)) {
    this.role = 'admin';
  } else if (chefPhones.includes(this.phone)) {
    this.role = 'chef';
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
