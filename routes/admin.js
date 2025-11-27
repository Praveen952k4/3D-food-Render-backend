const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const FoodItem = require('../models/FoodItem');
const { authenticate, isAdmin } = require('../middleware/auth');

// Apply authentication and admin check to all routes
router.use(authenticate);
router.use(isAdmin);

// GET /api/admin/orders - Get all orders
router.get('/orders', async (req, res) => {
  try {
    const { status, date } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      query.createdAt = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    const orders = await Order.find(query)
      .populate('items.foodId')
      .populate('userId')
      .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      count: orders.length,
      orders 
    });
  } catch (error) {
    console.error('Get admin orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders' 
    });
  }
});

// PUT /api/admin/orders/:id - Update order status
router.put('/orders/:id', async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const previousStatus = order.status;
    let statusChanged = false;
    let paymentStatusChanged = false;

    // Update status and add to history
    if (status && status !== order.status) {
      console.log(`📝 Admin updating order ${order.orderNumber} status: ${order.status} → ${status}`);
      order.status = status;
      order.statusHistory.push({
        status: status,
        timestamp: new Date(),
        updatedBy: 'admin',
      });
      statusChanged = true;
    }
    
    if (paymentStatus && paymentStatus !== order.paymentStatus) {
      console.log(`💳 Admin updating order ${order.orderNumber} payment status: ${order.paymentStatus} → ${paymentStatus}`);
      order.paymentStatus = paymentStatus;
      paymentStatusChanged = true;
    }

    await order.save();
    
    console.log(`✅ Order ${order.orderNumber} updated successfully`);

    // Emit socket event for real-time notification to customer (only for status changes)
    const io = req.app.get('io');
    if (io && statusChanged) {
      const populatedOrder = await Order.findById(order._id).populate('items.foodId');
      io.to(`user_${order.userId}`).emit('orderUpdate', {
        type: 'statusChange',
        order: {
          _id: populatedOrder._id,
          orderNumber: populatedOrder.orderNumber,
          status: populatedOrder.status,
          statusHistory: populatedOrder.statusHistory,
          grandTotal: populatedOrder.grandTotal,
          items: populatedOrder.items,
          createdAt: populatedOrder.createdAt,
          updatedAt: populatedOrder.updatedAt
        },
        previousStatus: previousStatus,
        newStatus: status,
        message: `Order ${order.orderNumber} status updated to ${status}`
      });
      console.log(`🔔 Socket notification sent to user ${order.userId} for order ${order.orderNumber}`);
    }

    res.json({ 
      success: true, 
      message: 'Order updated successfully',
      order 
    });
  } catch (error) {
    console.error('Update order error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update order',
      error: error.message
    });
  }
});

// GET /api/admin/customers - Get all customers
router.get('/customers', async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' })
      .select('-otp -otpExpiry')
      .sort({ lastLogin: -1 });

    res.json({ 
      success: true, 
      count: customers.length,
      customers 
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch customers' 
    });
  }
});

// GET /api/admin/users/online - Get online users
router.get('/users/online', async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true })
      .select('name phone email role lastLogin')
      .sort({ lastLogin: -1 });

    res.json({
      success: true,
      count: onlineUsers.length,
      users: onlineUsers
    });
  } catch (error) {
    console.error('Get online users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch online users'
    });
  }
});

// GET /api/admin/users/login-history - Get login history
router.get('/users/login-history', async (req, res) => {
  try {
    const users = await User.find()
      .select('name phone email role loginHistory lastLogin isOnline')
      .sort({ lastLogin: -1 });

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get login history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch login history'
    });
  }
});

// POST /api/admin/food - Create food item
router.post('/food', async (req, res) => {
  try {
    const foodItem = new FoodItem(req.body);
    await foodItem.save();

    res.json({ 
      success: true, 
      message: 'Food item created successfully',
      foodItem 
    });
  } catch (error) {
    console.error('Create food item error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create food item' 
    });
  }
});

// PUT /api/admin/food/:id - Update food item
router.put('/food/:id', async (req, res) => {
  try {
    const foodItem = await FoodItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!foodItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food item not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Food item updated successfully',
      foodItem 
    });
  } catch (error) {
    console.error('Update food item error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update food item' 
    });
  }
});

// DELETE /api/admin/food/:id - Delete food item
router.delete('/food/:id', async (req, res) => {
  try {
    const foodItem = await FoodItem.findByIdAndDelete(req.params.id);

    if (!foodItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food item not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Food item deleted successfully' 
    });
  } catch (error) {
    console.error('Delete food item error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete food item' 
    });
  }
});

// GET /api/admin/food - Get all food items (including unavailable)
router.get('/food', async (req, res) => {
  try {
    const foodItems = await FoodItem.find().sort({ name: 1 });

    res.json({ 
      success: true, 
      count: foodItems.length,
      foodItems 
    });
  } catch (error) {
    console.error('Get food items error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch food items' 
    });
  }
});

// PUT /api/admin/orders/:id/feedback - Add admin feedback/notes to order
router.put('/orders/:id/feedback', async (req, res) => {
  try {
    const { shopFeedback } = req.body;
    
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.shopFeedback = shopFeedback || '';
    await order.save();

    res.json({
      success: true,
      message: 'Shop feedback added successfully',
      order
    });
  } catch (error) {
    console.error('Add shop feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add shop feedback'
    });
  }
});

// GET /api/admin/feedback-summary - Get aggregated feedback statistics
router.get('/feedback-summary', async (req, res) => {
  try {
    // Get all orders with ratings
    const ordersWithRatings = await Order.find({ 
      rating: { $ne: null } 
    });

    // Calculate statistics
    const totalFeedback = ordersWithRatings.length;
    const avgRating = totalFeedback > 0
      ? ordersWithRatings.reduce((sum, order) => sum + order.rating, 0) / totalFeedback
      : 0;

    // Rating distribution
    const ratingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    ordersWithRatings.forEach((order) => {
      if (order.rating) {
        ratingDistribution[order.rating]++;
      }
    });

    // Recent feedback (last 10)
    const recentFeedback = await Order.find({ 
      rating: { $ne: null } 
    })
    .populate('items.foodId')
    .populate('userId')
    .sort({ feedbackDate: -1 })
    .limit(10);

    res.json({
      success: true,
      summary: {
        totalFeedback,
        avgRating: parseFloat(avgRating.toFixed(2)),
        ratingDistribution,
      },
      recentFeedback,
    });
  } catch (error) {
    console.error('Get feedback summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback summary'
    });
  }
});

module.exports = router;
