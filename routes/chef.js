const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');

// Get orders for chef - show all orders except cancelled/delivered
router.get('/orders', authenticate, async (req, res) => {
  try {
    // Check if user is chef or admin
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Chef role required.' });
    }

    // Fetch all orders except cancelled and delivered
    const orders = await Order.find({
      status: { $nin: ['cancelled', 'delivered'] }, // Show pending, confirmed, preparing, ready
    })
      .populate('items.foodId', 'name price imageUrl')
      .populate('userId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(100); // Limit to last 100 orders

    console.log(`📋 Chef orders found: ${orders.length}`);
    
    // Log detailed customization info for debugging
    orders.forEach((order, idx) => {
      console.log(`\n  Order ${idx + 1}: ${order.orderNumber}`);
      order.items.forEach((item, itemIdx) => {
        console.log(`    Item ${itemIdx + 1}: ${item.name} x${item.quantity}`);
        if (item.customizations && item.customizations.length > 0) {
          console.log(`      ✨ Has ${item.customizations.length} customizations:`, JSON.stringify(item.customizations, null, 2));
        } else {
          console.log(`      ℹ️  No customizations`);
        }
      });
    });
    
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching chef orders:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update order status (chef can move orders through preparation stages)
router.patch('/orders/:orderId/status', authenticate, async (req, res) => {
  try {
    // Check if user is chef or admin
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Chef role required.' });
    }

    const { orderId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['confirmed', 'preparing', 'ready', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Find and update order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if order is in a valid state for chef to modify
    if (!['confirmed', 'preparing', 'ready'].includes(order.status)) {
      return res.status(400).json({ 
        message: 'Order cannot be modified in its current state' 
      });
    }

    // Update order status
    order.status = status;
    
    // Add to status history
    order.statusHistory.push({
      status: status,
      timestamp: new Date(),
      updatedBy: req.user.id,
    });

    await order.save();

    // Emit socket event for real-time updates
    if (req.app.get('io')) {
      const io = req.app.get('io');
      
      // Notify customer
      io.to(`user_${order.userId}`).emit('orderUpdate', {
        type: 'statusChange',
        order: order,
        newStatus: status,
        message: `Your order ${order.orderNumber} is now ${status}`,
      });

      // Notify admin
      io.emit('orderUpdate', {
        type: 'statusChange',
        order: order,
        newStatus: status,
      });
    }

    res.json({ 
      success: true, 
      message: `Order status updated to ${status}`,
      order 
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get order details by ID
router.get('/orders/:orderId', authenticate, async (req, res) => {
  try {
    // Check if user is chef or admin
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Chef role required.' });
    }

    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('items.foodId', 'name price imageUrl');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Mark order as delivered (simple one-click action)
router.put('/orders/:id/deliver', authenticate, async (req, res) => {
  try {
    // Check if user is chef or admin
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Chef role required.' });
    }

    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Update order status to delivered
    order.status = 'delivered';
    
    // Add to status history
    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    order.statusHistory.push({
      status: 'delivered',
      timestamp: new Date(),
      updatedBy: req.user.id || 'chef',
    });

    await order.save();

    // Emit socket event for real-time updates
    if (req.app.get('io')) {
      const io = req.app.get('io');
      
      // Notify customer
      io.to(`user_${order.userId}`).emit('orderUpdate', {
        type: 'delivered',
        order: order,
        message: `Your order ${order.orderNumber} has been delivered!`,
      });

      // Notify all connected clients
      io.emit('orderUpdate', {
        type: 'delivered',
        orderId: order._id,
        orderNumber: order.orderNumber,
      });
    }

    console.log(`✅ Order ${order.orderNumber} marked as delivered by chef`);
    
    res.json({ 
      success: true, 
      message: 'Order marked as delivered',
      order 
    });
  } catch (error) {
    console.error('❌ Error marking order as delivered:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// Get chef statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Check if user is chef or admin
    if (req.user.role !== 'chef' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Chef role required.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const formattedStats = {
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });

    res.json({ success: true, stats: formattedStats });
  } catch (error) {
    console.error('Error fetching chef stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
