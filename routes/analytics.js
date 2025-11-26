const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticate, isAdmin } = require('../middleware/auth');

// Apply authentication and admin check
router.use(authenticate);
router.use(isAdmin);

// GET /api/analytics/dashboard - Get dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Today's stats
    const todayOrders = await Order.find({
      createdAt: { $gte: today, $lt: tomorrow },
    });

    const todayRevenue = todayOrders
      .filter(order => order.paymentStatus === 'success')
      .reduce((sum, order) => sum + order.grandTotal, 0);

    // This month's stats
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const monthOrders = await Order.find({
      createdAt: { $gte: monthStart, $lt: monthEnd },
    });

    const monthRevenue = monthOrders
      .filter(order => order.paymentStatus === 'success')
      .reduce((sum, order) => sum + order.grandTotal, 0);

    // Overall stats
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'success' } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ]);

    // Pending orders
    const pendingOrders = await Order.countDocuments({ 
      status: { $in: ['pending', 'confirmed', 'preparing'] } 
    });

    res.json({
      success: true,
      dashboard: {
        today: {
          orders: todayOrders.length,
          revenue: todayRevenue,
          successfulOrders: todayOrders.filter(o => o.paymentStatus === 'success').length,
        },
        month: {
          orders: monthOrders.length,
          revenue: monthRevenue,
          successfulOrders: monthOrders.filter(o => o.paymentStatus === 'success').length,
        },
        overall: {
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          pendingOrders,
        },
      },
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
    });
  }
});

// GET /api/analytics/daily-report - Get daily sales report
router.get('/daily-report', async (req, res) => {
  try {
    const { date } = req.query;
    
    let startDate = new Date();
    if (date) {
      startDate = new Date(date);
    }
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const orders = await Order.find({
      createdAt: { $gte: startDate, $lt: endDate },
    }).populate('items.foodId');

    // Calculate stats
    const totalOrders = orders.length;
    const successfulOrders = orders.filter(o => o.paymentStatus === 'success');
    const revenue = successfulOrders.reduce((sum, order) => sum + order.grandTotal, 0);
    const avgOrderValue = successfulOrders.length > 0 ? revenue / successfulOrders.length : 0;

    // Item sales breakdown
    const itemSales = {};
    successfulOrders.forEach(order => {
      order.items.forEach(item => {
        const name = item.name;
        if (!itemSales[name]) {
          itemSales[name] = { name, quantity: 0, revenue: 0 };
        }
        itemSales[name].quantity += item.quantity;
        itemSales[name].revenue += item.subtotal;
      });
    });

    // Hourly breakdown
    const hourlyStats = Array(24).fill(0).map((_, i) => ({
      hour: i,
      orders: 0,
      revenue: 0,
    }));

    successfulOrders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourlyStats[hour].orders += 1;
      hourlyStats[hour].revenue += order.grandTotal;
    });

    res.json({
      success: true,
      report: {
        date: startDate.toISOString().split('T')[0],
        totalOrders,
        successfulOrders: successfulOrders.length,
        failedOrders: orders.filter(o => o.paymentStatus === 'failed').length,
        revenue,
        avgOrderValue,
        topItems: Object.values(itemSales).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
        hourlyStats: hourlyStats.filter(h => h.orders > 0),
      },
    });
  } catch (error) {
    console.error('Get daily report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily report',
    });
  }
});

// GET /api/analytics/monthly-report - Get monthly sales report
router.get('/monthly-report', async (req, res) => {
  try {
    const { year, month } = req.query;
    
    const currentDate = new Date();
    const reportYear = year ? parseInt(year) : currentDate.getFullYear();
    const reportMonth = month ? parseInt(month) - 1 : currentDate.getMonth();
    
    const startDate = new Date(reportYear, reportMonth, 1);
    const endDate = new Date(reportYear, reportMonth + 1, 1);

    const orders = await Order.find({
      createdAt: { $gte: startDate, $lt: endDate },
    }).populate('items.foodId');

    // Calculate stats
    const totalOrders = orders.length;
    const successfulOrders = orders.filter(o => o.paymentStatus === 'success');
    const revenue = successfulOrders.reduce((sum, order) => sum + order.grandTotal, 0);
    const avgOrderValue = successfulOrders.length > 0 ? revenue / successfulOrders.length : 0;

    // Daily breakdown
    const daysInMonth = new Date(reportYear, reportMonth + 1, 0).getDate();
    const dailyStats = Array(daysInMonth).fill(0).map((_, i) => ({
      date: `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
      orders: 0,
      revenue: 0,
    }));

    successfulOrders.forEach(order => {
      const day = new Date(order.createdAt).getDate() - 1;
      dailyStats[day].orders += 1;
      dailyStats[day].revenue += order.grandTotal;
    });

    // Item sales breakdown
    const itemSales = {};
    successfulOrders.forEach(order => {
      order.items.forEach(item => {
        const name = item.name;
        if (!itemSales[name]) {
          itemSales[name] = { name, quantity: 0, revenue: 0 };
        }
        itemSales[name].quantity += item.quantity;
        itemSales[name].revenue += item.subtotal;
      });
    });

    // Category breakdown
    const categoryStats = {};
    successfulOrders.forEach(order => {
      order.items.forEach(item => {
        const category = item.foodId?.category || 'Other';
        if (!categoryStats[category]) {
          categoryStats[category] = { category, quantity: 0, revenue: 0 };
        }
        categoryStats[category].quantity += item.quantity;
        categoryStats[category].revenue += item.subtotal;
      });
    });

    res.json({
      success: true,
      report: {
        year: reportYear,
        month: reportMonth + 1,
        monthName: startDate.toLocaleString('default', { month: 'long' }),
        totalOrders,
        successfulOrders: successfulOrders.length,
        failedOrders: orders.filter(o => o.paymentStatus === 'failed').length,
        revenue,
        avgOrderValue,
        topItems: Object.values(itemSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        categoryBreakdown: Object.values(categoryStats),
        dailyStats,
      },
    });
  } catch (error) {
    console.error('Get monthly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monthly report',
    });
  }
});

module.exports = router;
