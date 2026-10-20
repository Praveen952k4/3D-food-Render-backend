const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const orderRoutes = require('./routes/orders');
const foodRoutes = require('./routes/food');
const adminRoutes = require('./routes/admin');
const chefRoutes = require('./routes/chef');
const analyticsRoutes = require('./routes/analytics');
const couponRoutes = require('./routes/coupons');
const feedbackRoutes = require('./routes/feedback');
const itemFeedbackRoutes = require('./routes/itemFeedback');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  // User joins their personal room for notifications
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 User ${userId} joined their notification room`);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Enhanced CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://3-d-food-rendering-frontend-zunt-b1jrhidgj.vercel.app', // Your deployed frontend
  'https://3-d-food-rendering-frontend-zunt.vercel.app', // Alternative frontend URL
  process.env.FRONTEND_URL, // Additional frontend URL from env
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed origin:', origin);
      return callback(null, true);
    }
    
    // Allow localhost in development
    if (origin && origin.includes('localhost')) {
      console.log('✅ CORS allowed localhost:', origin);
      return callback(null, true);
    }
    
    // Allow all Vercel preview deployments
    if (origin && origin.includes('vercel.app')) {
      console.log('✅ CORS allowed Vercel deployment:', origin);
      return callback(null, true);
    }
    
    console.warn('⚠️ CORS would block origin (but allowing):', origin);
    callback(null, true); // Allow for now, log the warning
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24 hours
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Database connection
mongoose.connect(process.env.MONGODB_URI)
.then(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ MongoDB Connected Successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Database:', mongoose.connection.db.databaseName);
  console.log('🌐 Host:', mongoose.connection.host);
  console.log('📝 Connection State:', mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected');
  
  // Get existing collections
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`📁 Collections (${collections.length}):`, collections.map(c => c.name).join(', ') || 'None yet');
  
  // Check if models are registered
  const models = Object.keys(mongoose.models);
  console.log(`🗂️  Models Registered (${models.length}):`, models.join(', ') || 'Loading...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
})
.catch((err) => {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ MongoDB Connection Failed!');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('Error:', err.message);
  console.error('Please ensure:');
  console.error('  1. MongoDB service is running: net start MongoDB');
  console.error('  2. Connection string is correct in .env');
  console.error('  3. Database name is valid');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chef', chefRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/item-feedback', itemFeedbackRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'AR Food Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 AR Food Backend Server Started!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 Server URL: http://localhost:' + PORT);
  console.log('📡 API Base: http://localhost:' + PORT + '/api');
  console.log('🔌 Socket.IO: http://localhost:' + PORT);
  console.log('❤️  Health Check: http://localhost:' + PORT + '/api/health');
  console.log('📱 Admin Phone: ' + process.env.ADMIN_PHONES);
  console.log('🔧 Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Server is ready to accept requests!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
