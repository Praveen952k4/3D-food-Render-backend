const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  orderNumber: {
    type: String,
    required: true,
  },
  // Shop feedback
  shopRating: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  shopFeedback: {
    type: String,
    default: '',
  },
  // Item-specific feedback
  itemFeedbacks: [{
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
    },
    foodName: String,
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      default: '',
    },
  }],
  // Overall experience
  serviceQuality: {
    type: Number,
    min: 1,
    max: 5,
    default: 5,
  },
  deliverySpeed: {
    type: Number,
    min: 1,
    max: 5,
    default: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Feedback', feedbackSchema);
