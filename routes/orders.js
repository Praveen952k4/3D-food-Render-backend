const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');

// GET /api/orders - Get user orders
router.get('/', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ 
      userId: req.user.id 
    })
    .populate('items.foodId')
    .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      orders 
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders' 
    });
  }
});

// POST /api/orders - Create new order
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      items,
      subtotal,
      tax,
      discount,
      grandTotal,
      tableNumber,
      comment,
      paymentMethod,
      customerName,
      customerPhone,
      orderType,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order must contain at least one item' 
      });
    }

    if (!customerName || !customerPhone) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and phone are required'
      });
    }

    if (!orderType || !['dine-in', 'takeaway'].includes(orderType)) {
      return res.status(400).json({
        success: false,
        message: 'Order type must be either dine-in or takeaway'
      });
    }

    if (orderType === 'dine-in' && !tableNumber) {
      return res.status(400).json({
        success: false,
        message: 'Table number is required for dine-in orders'
      });
    }

    const order = new Order({
      userId: req.user.id,
      customerPhone,
      customerName,
      orderType,
      items,
      subtotal,
      tax: tax || 0,
      discount: discount || 0,
      grandTotal,
      tableNumber: orderType === 'dine-in' ? tableNumber : '',
      comment,
      paymentMethod: paymentMethod || 'cash',
      status: 'pending',
      paymentStatus: 'pending',
    });

    await order.save();

    res.json({ 
      success: true, 
      message: 'Order created successfully',
      order,
      orderNumber: order.orderNumber
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// PUT /api/orders/:id - Update order status
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { status, paymentStatus, paymentId } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (paymentId) order.paymentId = paymentId;

    await order.save();

    res.json({ 
      success: true, 
      message: 'Order updated successfully',
      order 
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update order' 
    });
  }
});

// GET /api/orders/:id - Get single order
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.foodId')
      .populate('userId');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    res.json({ 
      success: true, 
      order 
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch order' 
    });
  }
});

// GET /api/orders/history/:phone - Get order history by phone number
router.get('/history/:phone', authenticate, async (req, res) => {
  try {
    const { phone } = req.params;
    
    const orders = await Order.find({ 
      customerPhone: phone 
    })
    .populate('items.foodId')
    .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      orders,
      count: orders.length
    });
  } catch (error) {
    console.error('Get order history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch order history' 
    });
  }
});

// POST /api/orders/:id/feedback - Submit customer feedback
router.post('/:id/feedback', authenticate, async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Feedback can only be submitted for delivered orders'
      });
    }

    order.rating = rating;
    order.customerFeedback = feedback || '';
    order.feedbackDate = new Date();

    await order.save();

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      order
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback'
    });
  }
});

module.exports = router;
