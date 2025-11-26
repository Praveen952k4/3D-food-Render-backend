const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function checkDatabase() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Checking MongoDB Connection...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ MongoDB Connection Successful!');
    console.log('');
    console.log('📊 Connection Details:');
    console.log('   Database Name: ' + mongoose.connection.db.databaseName);
    console.log('   Host: ' + mongoose.connection.host);
    console.log('   Port: ' + mongoose.connection.port);
    console.log('   State: ' + (mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'));
    console.log('');

    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Collections (' + collections.length + '):');
    if (collections.length === 0) {
      console.log('   ⚠️  No collections found. Database is empty.');
      console.log('   💡 Run "npm run seed" to create sample data.');
    } else {
      for (const collection of collections) {
        const count = await mongoose.connection.db.collection(collection.name).countDocuments();
        console.log('   • ' + collection.name + ': ' + count + ' documents');
      }
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Database Check Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ MongoDB Connection Failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('');
    console.error('💡 Troubleshooting Steps:');
    console.error('   1. Check if MongoDB is running:');
    console.error('      Windows: net start MongoDB');
    console.error('      Mac/Linux: sudo systemctl start mongod');
    console.error('');
    console.error('   2. Verify .env file has correct connection string:');
    console.error('      MONGODB_URI=mongodb://localhost:27017/ar-food-db');
    console.error('');
    console.error('   3. Check MongoDB service status:');
    console.error('      Windows: Get-Service MongoDB');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

checkDatabase();
