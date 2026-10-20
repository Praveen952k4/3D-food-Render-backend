const express = require('express');
const router = express.Router();
const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');

// GET /api/food - Get all food items
router.get('/', async (req, res) => {
  try {
    const { category, isVeg } = req.query;
    
    let query = { isAvailable: true };
    
    if (category) {
      query.category = category;
    }
    
    if (isVeg !== undefined) {
      query.isVeg = isVeg === 'true';
    }

    const foodItems = await FoodItem.find(query).sort({ name: 1 });

    res.json({ 
      success: true, 
      count: foodItems.length,
      foodItems 
    });
  } catch (error) {
    console.error('Get food items error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch food items' 
    });
  }
});

// GET /api/food/:id - Get single food item
/**
 * How long this dish has actually taken, measured from the orders it was on:
 * the gap between the kitchen starting and the dish being ready.
 *
 * This is not the number the admin types in. That one is an estimate used to
 * quote a wait before anything is cooked; this is what the kitchen really
 * did, so it cannot be edited — it is only ever observed.
 */
const measuredPrepTime = async (foodId) => {
  const orders = await Order.find({
    'items.foodId': foodId,
    status: { $in: ['ready', 'delivered'] },
  })
    .select('statusHistory')
    .sort({ createdAt: -1 })
    .limit(100);

  const durations = [];
  for (const order of orders) {
    const at = (status) => {
      const entry = (order.statusHistory || []).find((e) => e.status === status);
      return entry ? new Date(entry.timestamp) : null;
    };
    // Cooking starts at 'preparing'; an order a chef pushed straight to
    // 'ready' is measured from when staff took it instead.
    const started = at('preparing') || at('confirmed');
    const ready = at('ready');
    if (!started || !ready) continue;

    const minutes = (ready - started) / 60000;
    // A negative gap means the stages were recorded out of order, and a day
    // means somebody left a ticket open overnight. Neither says anything
    // about the dish.
    if (minutes < 0 || minutes > 240) continue;
    durations.push(minutes);
  }

  if (durations.length === 0) return { averageMinutes: null, sampleSize: 0 };

  const total = durations.reduce((sum, value) => sum + value, 0);
  return {
    averageMinutes: Math.round((total / durations.length) * 10) / 10,
    sampleSize: durations.length,
    fastestMinutes: Math.round(Math.min(...durations)),
    slowestMinutes: Math.round(Math.max(...durations)),
  };
};

router.get('/:id', async (req, res) => {
  try {
    const foodItem = await FoodItem.findById(req.params.id);

    if (!foodItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food item not found' 
      });
    }

    const actualPrepTime = await measuredPrepTime(foodItem._id);

    res.json({ 
      success: true, 
      foodItem,
      // Observed, never set: what the kitchen actually took, alongside the
      // estimate on the dish itself.
      actualPrepTime,
    });
  } catch (error) {
    console.error('Get food item error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch food item' 
    });
  }
});

// POST /api/food/:id/like - Toggle like on food item
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const foodItem = await FoodItem.findById(req.params.id);

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: 'Food item not found'
      });
    }

    const userId = req.user.id;
    const likeIndex = foodItem.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      foodItem.likes.splice(likeIndex, 1);
      foodItem.likeCount = Math.max(0, foodItem.likeCount - 1);
    } else {
      // Like
      foodItem.likes.push(userId);
      foodItem.likeCount += 1;
    }

    await foodItem.save();

    res.json({
      success: true,
      liked: likeIndex === -1,
      likeCount: foodItem.likeCount
    });
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle like'
    });
  }
});

// POST /api/food/:id/rate - Rate a food item
router.post('/:id/rate', authenticate, async (req, res) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const foodItem = await FoodItem.findById(req.params.id);

    if (!foodItem) {
      return res.status(404).json({
        success: false,
        message: 'Food item not found'
      });
    }

    const userId = req.user.id;

    // Check if user already rated
    const existingRatingIndex = foodItem.ratings.findIndex(
      r => r.userId.toString() === userId
    );

    if (existingRatingIndex > -1) {
      // Update existing rating
      foodItem.ratings[existingRatingIndex].rating = rating;
      foodItem.ratings[existingRatingIndex].review = review || '';
      foodItem.ratings[existingRatingIndex].createdAt = new Date();
    } else {
      // Add new rating
      foodItem.ratings.push({
        userId,
        rating,
        review: review || '',
      });
    }

    // Recalculate average rating
    const totalRating = foodItem.ratings.reduce((sum, r) => sum + r.rating, 0);
    foodItem.totalRatings = foodItem.ratings.length;
    foodItem.averageRating = totalRating / foodItem.totalRatings;

    await foodItem.save();

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      averageRating: foodItem.averageRating,
      totalRatings: foodItem.totalRatings
    });
  } catch (error) {
    console.error('Rate food item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate food item'
    });
  }
});

module.exports = router;
