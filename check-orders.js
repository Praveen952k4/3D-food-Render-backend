require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');

async function checkOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n📊 Checking Orders in Database...\n');

    const allOrders = await Order.find({})
      .select('orderNumber status paymentStatus createdAt customerName')
      .sort({ createdAt: -1 })
      .limit(15);

    console.log('📋 Recent Orders:');
    console.log('─'.repeat(80));
    allOrders.forEach(o => {
      console.log(`  ${o.orderNumber} | Status: ${o.status.padEnd(12)} | Payment: ${(o.paymentStatus || 'N/A').padEnd(10)} | ${o.customerName}`);
    });

    console.log('\n📈 Total orders in DB:', allOrders.length);

    const statusCounts = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    console.log('\n📊 Orders by Status:');
    statusCounts.forEach(s => {
      console.log(`  ${s._id.padEnd(12)}: ${s.count}`);
    });

    // Check what chef query would return
    console.log('\n🔍 Orders Chef Query Would Return:');
    const chefOrders = await Order.find({
      status: { $nin: ['cancelled', 'delivered'] }
    }).select('orderNumber status');
    
    console.log(`  Found ${chefOrders.length} orders`);
    if (chefOrders.length > 0) {
      chefOrders.forEach(o => {
        console.log(`    - ${o.orderNumber}: ${o.status}`);
      });
    } else {
      console.log('  ⚠️  No orders match chef query criteria!');
      console.log('  💡 All orders are either "delivered" or "cancelled"');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkOrders();
