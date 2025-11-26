const mongoose = require('mongoose');
const dotenv = require('dotenv');
const FoodItem = require('./models/FoodItem');

dotenv.config();

// Sample food data based on your existing project
const foodData = [
  {
    name: 'Chapati',
    category: 'Indian',
    price: 100,
    description: 'Soft and fluffy Indian flatbread',
    isVeg: true,
    isAvailable: true,
    buttonId: 'button1',
    modelPath: '25_6_2024.glb',
    imageUrl: 'https://via.placeholder.com/300x200?text=Chapati',
  },
  {
    name: 'Burger',
    category: 'Starters',
    price: 150,
    description: 'Juicy burger with fresh vegetables',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button2',
    modelPath: 'burger.glb',
    imageUrl: 'https://via.placeholder.com/300x200?text=Burger',
  },
  {
    name: 'Chicken Pizza',
    category: 'Special Platter',
    price: 250,
    description: 'Delicious chicken pizza with cheese',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button3',
    modelPath: 'pizza.glb',
    imageUrl: 'https://via.placeholder.com/300x200?text=Chicken+Pizza',
  },
  {
    name: 'Onion Dosa',
    category: 'Indian',
    price: 120,
    description: 'Crispy dosa with onion filling',
    isVeg: true,
    isAvailable: true,
    buttonId: 'button4',
    modelPath: 'dosa.glb',
    imageUrl: 'https://via.placeholder.com/300x200?text=Onion+Dosa',
  },
  {
    name: 'Arrow Chicken',
    category: 'Starters',
    price: 200,
    description: 'Spicy arrow chicken starter',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button5',
    modelPath: 'chicken.glb',
    imageUrl: 'https://via.placeholder.com/300x200?text=Arrow+Chicken',
  },
  {
    name: 'Dragon Chicken',
    category: 'Starters',
    price: 220,
    description: 'Spicy dragon-style chicken',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button6',
    imageUrl: 'https://via.placeholder.com/300x200?text=Dragon+Chicken',
  },
  {
    name: 'Paneer Tikka',
    category: 'Tandoori',
    price: 180,
    description: 'Grilled paneer with spices',
    isVeg: true,
    isAvailable: true,
    buttonId: 'button7',
    imageUrl: 'https://via.placeholder.com/300x200?text=Paneer+Tikka',
  },
  {
    name: 'Chicken Tikka',
    category: 'Tandoori',
    price: 210,
    description: 'Tandoori chicken tikka',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button8',
    imageUrl: 'https://via.placeholder.com/300x200?text=Chicken+Tikka',
  },
  {
    name: 'Chicken 65',
    category: 'Indian',
    price: 190,
    description: 'South Indian style fried chicken',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button9',
    imageUrl: 'https://via.placeholder.com/300x200?text=Chicken+65',
  },
  {
    name: 'Malabar Chicken',
    category: 'Indian',
    price: 240,
    description: 'Kerala-style chicken curry',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button10',
    imageUrl: 'https://via.placeholder.com/300x200?text=Malabar+Chicken',
  },
  {
    name: 'Mixed Non-Veg Platter',
    category: 'Special Platter',
    price: 350,
    description: 'Assorted non-veg items',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button11',
    imageUrl: 'https://via.placeholder.com/300x200?text=Mixed+Non-Veg',
  },
  {
    name: 'Veg Platter',
    category: 'Special Platter',
    price: 280,
    description: 'Assorted vegetarian items',
    isVeg: true,
    isAvailable: true,
    buttonId: 'button12',
    imageUrl: 'https://via.placeholder.com/300x200?text=Veg+Platter',
  },
  {
    name: 'Chicken Biryani',
    category: 'Biryani',
    price: 200,
    description: 'Aromatic chicken biryani',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button13',
    imageUrl: 'https://via.placeholder.com/300x200?text=Chicken+Biryani',
  },
  {
    name: 'Mutton Biryani',
    category: 'Biryani',
    price: 250,
    description: 'Flavorful mutton biryani',
    isVeg: false,
    isAvailable: true,
    buttonId: 'button14',
    imageUrl: 'https://via.placeholder.com/300x200?text=Mutton+Biryani',
  },
  {
    name: 'Veg Biryani',
    category: 'Biryani',
    price: 150,
    description: 'Vegetable biryani with spices',
    isVeg: true,
    isAvailable: true,
    buttonId: 'button15',
    imageUrl: 'https://via.placeholder.com/300x200?text=Veg+Biryani',
  },
];

async function seedDatabase() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌱 Starting Database Seeding Process...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📊 Database: ' + mongoose.connection.db.databaseName);

    // Check existing collections
    const existingCollections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Existing Collections: ' + (existingCollections.length > 0 ? existingCollections.map(c => c.name).join(', ') : 'None'));

    // Clear existing food items
    const deleteResult = await FoodItem.deleteMany({});
    console.log('🗑️  Cleared ' + deleteResult.deletedCount + ' existing food items');

    // Insert new food items
    const insertResult = await FoodItem.insertMany(foodData);
    console.log('✅ Inserted ' + insertResult.length + ' food items');

    // Verify insertion
    const count = await FoodItem.countDocuments();
    console.log('📊 Total food items in database: ' + count);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Database Seeded Successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Summary:');
    console.log('  • Database: ' + mongoose.connection.db.databaseName);
    console.log('  • Food Items: ' + count);
    console.log('  • Categories: Starters, Tandoori, Indian, Special Platter, Biryani');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    process.exit(0);
  } catch (error) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Error Seeding Database!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

seedDatabase();
