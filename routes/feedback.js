const express = require('express');
const router = express.Router();
const Feedback = require('../models/Feedback');
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');

// Submit feedback (customer only)
router.post('/submit', authenticate, async (req, res) => {
  try {
    const { orderId, orderNumber, shopRating, shopFeedback, itemFeedbacks, serviceQuality, deliverySpeed } = req.body;

    // Check if order exists and belongs to user
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check if order is delivered
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Can only submit feedback for delivered orders' });
    }

    // Check if feedback already exists
    if (order.hasFeedback) {
      return res.status(400).json({ message: 'Feedback already submitted for this order' });
    }

    // Create feedback
    const feedback = new Feedback({
      orderId,
      userId: req.user.userId,
      orderNumber,
      shopRating,
      shopFeedback,
      itemFeedbacks,
      serviceQuality,
      deliverySpeed,
    });

    await feedback.save();

    // Update order
    order.hasFeedback = true;
    order.feedbackId = feedback._id;
    await order.save();

    res.status(201).json({ message: 'Feedback submitted successfully', feedback });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all feedback (admin only)
router.get('/all', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const feedbacks = await Feedback.find()
      .populate('userId', 'name email')
      .populate('orderId')
      .populate('itemFeedbacks.foodId', 'name imageUrl')
      .sort({ createdAt: -1 });

    res.json(feedbacks);
  } catch (error) {
    console.error('Get feedbacks error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get feedback by order
router.get('/order/:orderId', authenticate, async (req, res) => {
  try {
    const feedback = await Feedback.findOne({ orderId: req.params.orderId })
      .populate('itemFeedbacks.foodId', 'name imageUrl');

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    // Check if user is admin or order owner
    const order = await Order.findById(req.params.orderId);
    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(feedback);
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get feedback statistics (admin only)
router.get('/stats', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const totalFeedback = await Feedback.countDocuments();
    const avgShopRating = await Feedback.aggregate([
      { $group: { _id: null, avg: { $avg: '$shopRating' } } }
    ]);
    const avgServiceQuality = await Feedback.aggregate([
      { $group: { _id: null, avg: { $avg: '$serviceQuality' } } }
    ]);
    const avgDeliverySpeed = await Feedback.aggregate([
      { $group: { _id: null, avg: { $avg: '$deliverySpeed' } } }
    ]);

    res.json({
      totalFeedback,
      avgShopRating: avgShopRating[0]?.avg || 0,
      avgServiceQuality: avgServiceQuality[0]?.avg || 0,
      avgDeliverySpeed: avgDeliverySpeed[0]?.avg || 0,
    });
  } catch (error) {
    console.error('Get feedback stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
