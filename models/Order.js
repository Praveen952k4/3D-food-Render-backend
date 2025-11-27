const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: false, // Will be auto-generated in pre-save hook
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  customerPhone: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  orderType: {
    type: String,
    enum: ['dine-in', 'takeaway'],
    required: true,
  },
  items: [{
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
    },
    name: String,
    price: Number,
    quantity: Number,
    subtotal: Number,
    customizations: [{
      spiceLevel: {
        type: String,
        enum: ['mild', 'medium', 'spicy', 'extra-spicy'],
        default: 'medium',
      },
      extras: [String],
      specialInstructions: String,
    }],
  }],
  subtotal: {
    type: Number,
    required: true,
  },
  tax: {
    type: Number,
    default: 0,
  },
  discount: {
    type: Number,
    default: 0,
  },
  couponCode: {
    type: String,
    default: '',
  },
  couponDiscount: {
    type: Number,
    default: 0,
  },
  grandTotal: {
    type: Number,
    required: true,
  },
  tableNumber: {
    type: String,
    default: '',
  },
  comment: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
    default: 'pending',
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: String,
      default: 'system',
    },
  }],
  paymentStatus: {
    type: String,
    enum: ['pending', 'incomplete', 'completed', 'success', 'failed'],
    default: 'pending',
  },
  paymentMethod: {
    type: String,
    enum: ['phonepe', 'card', 'cash', 'online'],
    default: 'cash',
  },
  paymentId: {
    type: String,
    default: '',
  },
  linkId: {
    type: String,
    default: '',
  },
  // Customer feedback fields
  hasFeedback: {
    type: Boolean,
    default: false,
  },
  feedbackId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feedback',
    default: null,
  },
  customerFeedback: {
    type: String,
    default: '',
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
  feedbackDate: {
    type: Date,
    default: null,
  },
  // Admin feedback tracking
  shopFeedback: {
    type: String,
    default: '',
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

// Generate unique order number
orderSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  // Initialize statusHistory if it doesn't exist
  if (!this.statusHistory || this.statusHistory.length === 0) {
    this.statusHistory = [{
      status: this.status || 'pending',
      timestamp: new Date(),
      updatedBy: 'system',
    }];
  }
  
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.orderNumber = `ORD${year}${month}${day}${random}`;
  }
  
  next();
});

module.exports = mongoose.model('Order', orderSchema);
