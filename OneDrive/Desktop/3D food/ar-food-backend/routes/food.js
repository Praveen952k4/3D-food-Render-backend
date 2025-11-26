const express = require('express');
const router = express.Router();
const FoodItem = require('../models/FoodItem');
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
router.get('/:id', async (req, res) => {
  try {
    const foodItem = await FoodItem.findById(req.params.id);

    if (!foodItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food item not found' 
      });
    }

    res.json({ 
      success: true, 
      foodItem 
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
