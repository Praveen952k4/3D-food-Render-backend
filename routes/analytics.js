const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticate, isAdmin } = require('../middleware/auth');
const { GST_RATE, round2, gstForOrder, gstTotals, isPaid } = require('../utils/gst');
const { dishTimings } = require('../utils/timings');

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
      .filter(order => order.paymentStatus === 'success' || order.paymentStatus === 'completed')
      .reduce((sum, order) => sum + order.grandTotal, 0);

    // This month's stats
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const monthOrders = await Order.find({
      createdAt: { $gte: monthStart, $lt: monthEnd },
    });

    const monthRevenue = monthOrders
      .filter(order => order.paymentStatus === 'success' || order.paymentStatus === 'completed')
      .reduce((sum, order) => sum + order.grandTotal, 0);

    // Overall stats
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: { $in: ['success', 'completed'] } } },
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
          successfulOrders: todayOrders.filter(o => o.paymentStatus === 'success' || o.paymentStatus === 'completed').length,
        },
        month: {
          orders: monthOrders.length,
          revenue: monthRevenue,
          successfulOrders: monthOrders.filter(o => o.paymentStatus === 'success' || o.paymentStatus === 'completed').length,
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
    const successfulOrders = orders.filter(o => o.paymentStatus === 'success' || o.paymentStatus === 'completed');
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
        pendingOrders: orders.filter(o => o.paymentStatus === 'pending').length,
        incompleteOrders: orders.filter(o => o.paymentStatus === 'incomplete').length,
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
    const successfulOrders = orders.filter(o => o.paymentStatus === 'success' || o.paymentStatus === 'completed');
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
        pendingOrders: orders.filter(o => o.paymentStatus === 'pending').length,
        incompleteOrders: orders.filter(o => o.paymentStatus === 'incomplete').length,
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

// --------------------------------------------------------------------------
// Range helpers for the dashboard / GST report
// --------------------------------------------------------------------------

const RANGES = {
  '7d': { days: 7, bucket: 'day', label: 'Last 7 days' },
  '30d': { days: 30, bucket: 'day', label: 'Last 30 days' },
  '90d': { days: 90, bucket: 'week', label: 'Last 90 days' },
  '12m': { days: 365, bucket: 'month', label: 'Last 12 months' },
  all: { days: null, bucket: 'month', label: 'All time' },
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const bucketKey = (date, bucket) => {
  const d = new Date(date);
  if (bucket === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (bucket === 'week') {
    const monday = startOfDay(d);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  return startOfDay(d).toISOString().slice(0, 10);
};

const stepBucket = (key, bucket) => {
  if (bucket === 'month') {
    const [y, m] = key.split('-').map(Number);
    const next = new Date(y, m, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + (bucket === 'week' ? 7 : 1));
  return d.toISOString().slice(0, 10);
};

/**
 * Build a gap-free series of buckets between two dates so the chart keeps an
 * even time axis even on days with no orders.
 */
const emptySeries = (from, to, bucket) => {
  const out = [];
  let key = bucketKey(from, bucket);
  const last = bucketKey(to, bucket);
  let guard = 0;
  while (guard < 800) {
    out.push({ key, orders: 0, revenue: 0, gst: 0 });
    if (key === last) break;
    key = stepBucket(key, bucket);
    guard += 1;
  }
  return out;
};

// GET /api/analytics/overview?range=7d|30d|90d|12m|all
// One call for the whole admin dashboard: KPIs, a time series, top dishes,
// category split and status/payment breakdowns over the chosen window.
router.get('/overview', async (req, res) => {
  try {
    const key = RANGES[req.query.range] ? req.query.range : '30d';
    const { days, bucket, label } = RANGES[key];

    const now = new Date();
    const query = {};
    let from;

    if (days) {
      from = startOfDay(now);
      from.setDate(from.getDate() - (days - 1));
      query.createdAt = { $gte: from };
    }

    const orders = await Order.find(query).populate('items.foodId').sort({ createdAt: 1 });

    // "All time" starts at the first order that actually exists.
    if (!from) {
      from = orders.length ? startOfDay(orders[0].createdAt) : startOfDay(now);
    }

    const paidOrders = orders.filter(isPaid);
    const revenue = round2(paidOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0));
    const gst = gstTotals(paidOrders);

    // Time series — every order counts towards `orders`, only paid ones
    // towards revenue, which is how the KPI tiles read too.
    const series = emptySeries(from, now, bucket);
    const index = new Map(series.map((p) => [p.key, p]));
    orders.forEach((order) => {
      const point = index.get(bucketKey(order.createdAt, bucket));
      if (!point) return;
      point.orders += 1;
      if (isPaid(order)) {
        point.revenue = round2(point.revenue + (order.grandTotal || 0));
        point.gst = round2(point.gst + (Number(order.tax) || 0));
      }
    });

    // Top dishes and category split, over paid orders
    const dishes = {};
    const categories = {};
    paidOrders.forEach((order) => {
      order.items.forEach((item) => {
        const name = item.name || item.foodId?.name || 'Unnamed item';
        const category = item.foodId?.category || 'Other';
        dishes[name] = dishes[name] || { name, category, quantity: 0, revenue: 0 };
        dishes[name].quantity += item.quantity || 0;
        dishes[name].revenue = round2(dishes[name].revenue + (item.subtotal || 0));
        categories[category] = categories[category] || { category, quantity: 0, revenue: 0 };
        categories[category].quantity += item.quantity || 0;
        categories[category].revenue = round2(categories[category].revenue + (item.subtotal || 0));
      });
    });

    // Every order counts towards how long the food took, paid or not: a bill
    // that has not been settled says nothing about the kitchen.
    const timings = dishTimings(orders);

    const countBy = (field) =>
      orders.reduce((acc, o) => {
        const k = o[field] || 'unknown';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});

    res.json({
      success: true,
      overview: {
        range: key,
        rangeLabel: label,
        bucket,
        from: from.toISOString(),
        to: now.toISOString(),
        kpis: {
          orders: orders.length,
          paidOrders: paidOrders.length,
          revenue,
          gst: gst.total,
          netRevenue: round2(revenue - gst.total),
          avgOrderValue: paidOrders.length ? round2(revenue / paidOrders.length) : 0,
          pendingOrders: orders.filter((o) =>
            ['pending', 'confirmed', 'preparing'].includes(o.status)
          ).length,
          cancelledOrders: orders.filter((o) => o.status === 'cancelled').length,
        },
        gst,
        series,
        topDishes: Object.values(dishes).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
        dishTimings: timings,
        categoryBreakdown: Object.values(categories).sort((a, b) => b.revenue - a.revenue),
        statusBreakdown: Object.entries(countBy('status')).map(([name, value]) => ({ name, value })),
        paymentBreakdown: Object.entries(countBy('paymentStatus')).map(([name, value]) => ({ name, value })),
      },
    });
  } catch (error) {
    console.error('Get overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch overview' });
  }
});

// GET /api/analytics/gst-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|month
// GST register for the admin: period totals plus a line per order.
router.get('/gst-summary', async (req, res) => {
  try {
    const groupBy = req.query.groupBy === 'day' ? 'day' : 'month';

    const to = req.query.to ? new Date(req.query.to) : new Date();
    to.setHours(23, 59, 59, 999);

    let from;
    if (req.query.from) {
      from = startOfDay(req.query.from);
    } else {
      from = startOfDay(to);
      from.setMonth(from.getMonth() - 5);
      from.setDate(1);
    }

    const orders = await Order.find({ createdAt: { $gte: from, $lte: to } })
      .populate('items.foodId')
      .sort({ createdAt: -1 });

    const paidOrders = orders.filter(isPaid);
    const totals = gstTotals(paidOrders);

    // Per-period register
    const periods = {};
    paidOrders.forEach((order) => {
      const key = bucketKey(order.createdAt, groupBy);
      const g = gstForOrder(order);
      periods[key] = periods[key] || {
        period: key, orders: 0, taxableValue: 0, cgst: 0, sgst: 0, total: 0, grossSales: 0,
      };
      const p = periods[key];
      p.orders += 1;
      p.taxableValue = round2(p.taxableValue + g.taxableValue);
      p.cgst = round2(p.cgst + g.cgst);
      p.sgst = round2(p.sgst + g.sgst);
      p.total = round2(p.total + g.total);
      p.grossSales = round2(p.grossSales + (order.grandTotal || 0));
    });

    // Split by category, which stands in for an HSN-wise summary here
    const byCategory = {};
    paidOrders.forEach((order) => {
      const taxable = gstForOrder(order).taxableValue;
      const itemsTotal = order.items.reduce((s, i) => s + (i.subtotal || 0), 0) || 1;
      order.items.forEach((item) => {
        const category = item.foodId?.category || 'Other';
        // Spread the order's taxable value across its lines by value share.
        const share = ((item.subtotal || 0) / itemsTotal) * taxable;
        byCategory[category] = byCategory[category] || { category, taxableValue: 0, gst: 0 };
        byCategory[category].taxableValue = round2(byCategory[category].taxableValue + share);
        byCategory[category].gst = round2(byCategory[category].gst + share * GST_RATE);
      });
    });

    res.json({
      success: true,
      gstSummary: {
        from: from.toISOString(),
        to: to.toISOString(),
        groupBy,
        rate: GST_RATE,
        totals,
        periods: Object.values(periods).sort((a, b) => (a.period < b.period ? 1 : -1)),
        byCategory: Object.values(byCategory).sort((a, b) => b.taxableValue - a.taxableValue),
        // Full enough for the admin to re-print the e-receipt straight from
        // the register, so the rows carry the line items too.
        orders: paidOrders.slice(0, 200).map((order) => ({
          _id: order._id,
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          orderType: order.orderType,
          tableNumber: order.tableNumber,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          receiptSent: order.receiptSent,
          receiptSentAt: order.receiptSentAt,
          couponCode: order.couponCode,
          couponDiscount: order.couponDiscount,
          discount: order.discount,
          subtotal: order.subtotal,
          tax: order.tax,
          grandTotal: order.grandTotal,
          items: order.items.map((i) => ({
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            subtotal: i.subtotal,
            customizations: i.customizations,
          })),
          gst: gstForOrder(order),
          ...gstForOrder(order),
        })),
        unpaidOrders: orders.length - paidOrders.length,
      },
    });
  } catch (error) {
    console.error('Get GST summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch GST summary' });
  }
});

module.exports = router;
