const mongoose = require('mongoose');
const Order = require('./models/Order');

mongoose.connect('mongodb://localhost:27017/test', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

async function checkCustomizations() {
  try {
    // Find all active orders
    const orders = await Order.find({
      status: { $nin: ['cancelled', 'delivered'] },
    })
    .populate('items.foodId', 'name price')
    .sort({ createdAt: -1 });

    console.log(`\n📋 Found ${orders.length} active orders\n`);

    orders.forEach((order, idx) => {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Order #${idx + 1}: ${order.orderNumber}`);
      console.log(`Status: ${order.status}`);
      console.log(`Items: ${order.items.length}`);
      
      order.items.forEach((item, itemIdx) => {
        console.log(`\n  Item ${itemIdx + 1}:`);
        console.log(`    Name: ${item.name}`);
        console.log(`    Quantity: ${item.quantity}`);
        console.log(`    Price: ₹${item.price}`);
        
        if (item.customizations && item.customizations.length > 0) {
          console.log(`    ✨ Customizations (${item.customizations.length}):`);
          item.customizations.forEach((custom, customIdx) => {
            console.log(`      Customization #${customIdx + 1}:`);
            if (custom.spiceLevel) {
              console.log(`        🌶️  Spice Level: ${custom.spiceLevel}`);
            }
            if (custom.extras && custom.extras.length > 0) {
              console.log(`        ➕ Extras: ${custom.extras.join(', ')}`);
            }
            if (custom.specialInstructions) {
              console.log(`        📝 Instructions: ${custom.specialInstructions}`);
            }
          });
        } else {
          console.log(`    ℹ️  No customizations`);
        }
      });
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkCustomizations();
