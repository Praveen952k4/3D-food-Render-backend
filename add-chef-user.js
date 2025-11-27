const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

async function addChefUser() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👨‍🍳 Adding Chef User to Database...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📊 Database: ' + mongoose.connection.db.databaseName);

    // Chef user details
    const chefPhone = '9999999999';
    const chefData = {
      phone: chefPhone,
      name: 'Chef User',
      role: 'chef',
      isActive: true,
      lastLogin: new Date(),
    };

    // Check if chef already exists
    const existingChef = await User.findOne({ phone: chefPhone });
    
    if (existingChef) {
      console.log('⚠️  Chef user already exists');
      console.log('📱 Phone: ' + existingChef.phone);
      console.log('👤 Name: ' + existingChef.name);
      console.log('🎭 Role: ' + existingChef.role);
      
      // Update to chef role if different
      if (existingChef.role !== 'chef') {
        existingChef.role = 'chef';
        existingChef.name = 'Chef User';
        await existingChef.save();
        console.log('✅ Updated existing user to chef role');
      }
    } else {
      // Create new chef user
      const chef = await User.create(chefData);
      console.log('✅ Created new chef user');
      console.log('📱 Phone: ' + chef.phone);
      console.log('👤 Name: ' + chef.name);
      console.log('🎭 Role: ' + chef.role);
    }

    // List all users by role
    const adminCount = await User.countDocuments({ role: 'admin' });
    const chefCount = await User.countDocuments({ role: 'chef' });
    const customerCount = await User.countDocuments({ role: 'customer' });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Chef User Setup Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 User Summary:');
    console.log('  • Admins: ' + adminCount);
    console.log('  • Chefs: ' + chefCount);
    console.log('  • Customers: ' + customerCount);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 Chef Login Credentials:');
    console.log('  • Phone: 9999999999');
    console.log('  • OTP: Any 6-digit code (123456 recommended)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Error Adding Chef User!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

addChefUser();
