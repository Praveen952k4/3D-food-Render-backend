/**
 * Seeds what the three sign-in doors validate against:
 *   - the tables a guest can sign in at
 *   - a staff ID and password for the kitchen
 *
 *   node seed-access.js
 *
 * Safe to re-run: existing tables are left alone and the chef's password is
 * only set if it has none. Pass --reset-chef-password to set it again.
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Table = require('./models/Table');

dotenv.config();

const TABLE_COUNT = Number(process.env.TABLE_COUNT || 12);
const CHEF_STAFF_ID = process.env.CHEF_STAFF_ID || 'chef01';
const CHEF_PASSWORD = process.env.CHEF_PASSWORD || 'kitchen123';
const CHEF_PHONE = process.env.CHEF_PHONES?.split(',')[0] || '9999999999';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB:', mongoose.connection.db.databaseName);

    // --- tables ----------------------------------------------------------
    let created = 0;
    for (let i = 1; i <= TABLE_COUNT; i += 1) {
      const number = String(i);
      const existing = await Table.findOne({ number });
      if (existing) continue;
      await Table.create({ number, label: `Table ${number}`, seats: i % 4 === 0 ? 6 : 4 });
      created += 1;
    }
    const tableTotal = await Table.countDocuments();
    console.log(`🪑 Tables: ${created} created, ${tableTotal} in total`);

    // --- kitchen staff credential ----------------------------------------
    let chef = await User.findOne({ role: 'chef' }).select('+passwordHash');

    if (!chef) {
      chef = new User({ phone: CHEF_PHONE, name: 'Chef User', role: 'chef' });
      console.log('👨‍🍳 Creating the chef user');
    }

    chef.role = 'chef';
    chef.staffId = CHEF_STAFF_ID;
    chef.isActive = true;

    const resetPassword = process.argv.includes('--reset-chef-password');
    if (!chef.passwordHash || resetPassword) {
      await chef.setPassword(CHEF_PASSWORD);
      console.log(`🔑 Chef password set to: ${CHEF_PASSWORD}`);
    } else {
      console.log('🔑 Chef already has a password — left as is (--reset-chef-password to change)');
    }

    await chef.save();
    console.log(`👨‍🍳 Chef staff ID: ${chef.staffId}`);

    console.log('\nDone. Guests sign in with a table number, the kitchen with the staff ID above.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
})();
