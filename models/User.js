const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    enum: ['guest', 'customer', 'admin', 'chef'],
    default: 'customer',
  },

  // --- staff sign-in (chef, and any other staff role later) ---------------
  // Staff do not use the phone + OTP flow; they sign in with a staff ID and a
  // password, both checked against this record.
  staffId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    lowercase: true,
  },
  passwordHash: {
    type: String,
    default: null,
    select: false,
  },

  // --- guest sign-in -------------------------------------------------------
  // A guest signs in with a table number only, so the session is tied to the
  // table they are sitting at rather than to an account.
  tableNumber: {
    type: String,
    default: '',
  },

  isActive: {
    type: Boolean,
    default: true,
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

// Auto-assign admin/chef role based on phone number. Guests are excluded:
// their "phone" is a generated session id, never a real number.
userSchema.pre('save', function(next) {
  if (this.role === 'guest') return next();

  const adminPhones = process.env.ADMIN_PHONES?.split(',') || [];
  const chefPhones = process.env.CHEF_PHONES?.split(',') || ['9999999999']; // Default chef phone

  if (adminPhones.includes(this.phone)) {
    this.role = 'admin';
  } else if (chefPhones.includes(this.phone)) {
    this.role = 'chef';
  }
  next();
});

/** Set the staff password. Call `save()` afterwards. */
userSchema.methods.setPassword = async function(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

/** Check a staff password against the stored hash. */
userSchema.methods.verifyPassword = async function(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
