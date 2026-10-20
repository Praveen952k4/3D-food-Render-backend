const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const FoodItem = require('../models/FoodItem');
const { authenticate } = require('../middleware/auth');
const { orderEvents, emitActivity } = require('../utils/activity');

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
    console.log('📝 Creating order for user:', req.user.id);
    console.log('📦 Order data received:', JSON.stringify(req.body, null, 2));
    
    const {
      items,
      subtotal,
      tax,
      discount,
      couponCode,
      couponDiscount,
      grandTotal,
      tableNumber,
      comment,
      paymentMethod,
      customerName,
      customerPhone,
      orderType,
    } = req.body;

    if (!items || items.length === 0) {
      console.error('❌ Validation failed: No items in order');
      return res.status(400).json({ 
        success: false, 
        message: 'Order must contain at least one item' 
      });
    }

    if (!customerName || !customerPhone) {
      console.error('❌ Validation failed: Missing customer details');
      return res.status(400).json({
        success: false,
        message: 'Customer name and phone are required'
      });
    }

    if (!orderType || !['dine-in', 'takeaway'].includes(orderType)) {
      console.error('❌ Validation failed: Invalid order type:', orderType);
      return res.status(400).json({
        success: false,
        message: 'Order type must be either dine-in or takeaway'
      });
    }

    if (orderType === 'dine-in' && !tableNumber) {
      console.error('❌ Validation failed: Missing table number for dine-in');
      return res.status(400).json({
        success: false,
        message: 'Table number is required for dine-in orders'
      });
    }

    // Validate and increment coupon usage if provided
    if (couponCode && couponCode.trim() !== '') {
      console.log('🎟️ Validating coupon:', couponCode);
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      
      if (!coupon) {
        console.error('❌ Invalid coupon code');
        return res.status(400).json({
          success: false,
          message: 'Invalid coupon code'
        });
      }

      if (!coupon.isValid()) {
        console.error('❌ Coupon is not valid or expired');
        return res.status(400).json({
          success: false,
          message: 'This coupon is not valid or has expired'
        });
      }

      if (subtotal < coupon.minOrderValue) {
        console.error('❌ Order value below minimum required');
        return res.status(400).json({
          success: false,
          message: `Minimum order value of ₹${coupon.minOrderValue} required for this coupon`
        });
      }

      // Increment usage count
      coupon.usedCount += 1;
      await coupon.save();
      console.log(`✅ Coupon ${couponCode} applied, usage count: ${coupon.usedCount}`);
    }

    console.log('✅ All validations passed, creating order...');

    // Stamp each line with the kitchen's current time for that dish, so the
    // customer's estimate is fixed at the moment they ordered. The order's own
    // estimate is the longest dish, because the kitchen cooks in parallel.
    const foodIds = items.map((item) => item.foodId).filter(Boolean);
    const dishes = foodIds.length ? await FoodItem.find({ _id: { $in: foodIds } }).select('prepTimeMinutes') : [];
    const prepTimeById = new Map(dishes.map((dish) => [String(dish._id), dish.prepTimeMinutes ?? 15]));

    const itemsWithPrepTime = items.map((item) => ({
      ...item,
      prepTimeMinutes: item.prepTimeMinutes ?? prepTimeById.get(String(item.foodId)) ?? 15,
    }));

    const estimatedPrepMinutes = itemsWithPrepTime.reduce(
      (longest, item) => Math.max(longest, item.prepTimeMinutes || 0),
      0
    );

    const order = new Order({
      userId: req.user.id,
      customerPhone,
      customerName,
      orderType,
      items: itemsWithPrepTime,
      estimatedPrepMinutes,
      subtotal,
      tax: tax || 0,
      discount: discount || 0,
      couponCode: couponCode || '',
      couponDiscount: couponDiscount || 0,
      grandTotal,
      tableNumber: orderType === 'dine-in' ? tableNumber : '',
      comment,
      paymentMethod: paymentMethod || 'cash',
      status: 'pending',
      paymentStatus: 'pending',
      statusHistory: [{
        status: 'pending',
        timestamp: new Date(),
        updatedBy: 'customer',
      }],
    });

    await order.save();
    console.log('✅ Order saved successfully:', order.orderNumber);

    // Emit socket event for real-time notification
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.id}`).emit('orderUpdate', {
        type: 'created',
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          grandTotal: order.grandTotal,
          items: order.items,
          createdAt: order.createdAt
        },
        message: `Order ${order.orderNumber} placed successfully!`
      });
      console.log('🔔 Socket notification sent to user:', req.user.id);
    }

    // Tell the admin dashboard a table has just ordered, so the service
    // timeline fills in without waiting for a refresh.
    emitActivity(io, orderEvents(order).slice(-1)[0]);

    res.json({ 
      success: true, 
      message: 'Order created successfully',
      order,
      orderNumber: order.orderNumber
    });
  } catch (error) {
    console.error('❌ Create order error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.errors) {
      console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
    }
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create order',
      error: error.message,
      details: error.errors ? Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      })) : undefined
    });
  }
});

// GET /api/orders/active/notifications - Get active orders for notifications
router.get('/active/notifications', authenticate, async (req, res) => {
  try {
    console.log('🔍 Fetching active orders for user:', req.user.id);
    console.log('👤 User object:', JSON.stringify(req.user, null, 2));
    console.log('🔑 UserId type:', typeof req.user.id);
    
    // First, let's see ALL orders for this user
    const allUserOrders = await Order.find({ userId: req.user.id });
    console.log(`📊 Total orders for user: ${allUserOrders.length}`);
    
    if (allUserOrders.length > 0) {
      console.log('📋 Order statuses:', allUserOrders.map(o => ({ 
        orderNumber: o.orderNumber, 
        status: o.status,
        userId: o.userId?.toString(),
        created: o.createdAt
      })));
    } else {
      // Try to find ANY recent orders to help debug
      const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(3);
      console.log('🔍 Recent orders in DB:', recentOrders.map(o => ({
        orderNumber: o.orderNumber,
        userId: o.userId?.toString(),
        status: o.status
      })));
    }
    
    const orders = await Order.find({ 
      userId: req.user.id,
      status: { $in: ['pending', 'confirmed', 'preparing', 'ready', 'delivered'] }
    })
    .populate('items.foodId')
    .sort({ createdAt: -1 });

    // Filter out delivered orders that already have feedback
    const activeOrders = orders.filter(order => {
      if (order.status === 'delivered') {
        // Only include delivered orders without feedback (for 1 polling cycle)
        return !order.hasFeedback;
      }
      return true;
    });

    console.log(`✅ Active orders found: ${activeOrders.length}`);
    if (activeOrders.length > 0) {
      console.log('📦 Active orders:', activeOrders.map(o => ({ 
        orderNumber: o.orderNumber, 
        status: o.status,
        hasFeedback: o.hasFeedback
      })));
    }
    
    res.json({ 
      success: true, 
      orders: activeOrders
    });
  } catch (error) {
    console.error('❌ Get active orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch active orders' 
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

    if (status && status !== order.status) {
      order.status = status;
      order.statusHistory.push({
        status: status,
        timestamp: new Date(),
        updatedBy: req.user.role || 'admin',
      });
    }
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
