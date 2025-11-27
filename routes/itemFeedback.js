const express = require('express');
const router = express.Router();
const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const { authenticate } = require('../middleware/auth');

// Submit feedback for food items in an order
router.post('/submit', authenticate, async (req, res) => {
  try {
    const { orderId, orderNumber, itemFeedbacks } = req.body;

    // Verify order exists and belongs to user
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized' 
      });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Can only submit feedback for delivered orders' 
      });
    }

    // Process each item feedback
    const results = [];
    for (const itemFeedback of itemFeedbacks) {
      const { foodId, foodName, rating, feedback } = itemFeedback;

      console.log(`Processing feedback for ${foodName}:`, { 
        rating, 
        feedback: feedback || '(empty)', 
        feedbackLength: feedback?.length || 0 
      });

      // Find the food item
      const foodItem = await FoodItem.findById(foodId);
      if (!foodItem) {
        console.warn(`Food item ${foodId} not found`);
        continue;
      }

      // Check if user already rated this item for this order
      const existingRatingIndex = foodItem.ratings.findIndex(
        r => r.userId.toString() === req.user.id && r.orderId?.toString() === orderId
      );

      if (existingRatingIndex >= 0) {
        // Update existing rating
        foodItem.ratings[existingRatingIndex].rating = rating;
        foodItem.ratings[existingRatingIndex].review = feedback || '';
        foodItem.ratings[existingRatingIndex].createdAt = new Date();
        console.log(`Updated existing rating for ${foodName}`);
      } else {
        // Add new rating
        foodItem.ratings.push({
          userId: req.user.id,
          orderId: orderId,
          rating: rating,
          review: feedback || '',
          createdAt: new Date(),
        });
        console.log(`Added new rating for ${foodName}`);
      }

      // Recalculate average rating
      const totalRatings = foodItem.ratings.length;
      const sumRatings = foodItem.ratings.reduce((sum, r) => sum + r.rating, 0);
      foodItem.averageRating = totalRatings > 0 ? sumRatings / totalRatings : 0;
      foodItem.totalRatings = totalRatings;

      await foodItem.save();

      // Log what was saved
      const savedRating = foodItem.ratings[existingRatingIndex >= 0 ? existingRatingIndex : foodItem.ratings.length - 1];
      console.log(`Saved rating for ${foodName}:`, {
        rating: savedRating.rating,
        review: savedRating.review,
        hasReview: !!savedRating.review && savedRating.review.trim() !== '',
      });

      results.push({
        foodId,
        foodName,
        rating,
        averageRating: foodItem.averageRating,
        totalRatings: foodItem.totalRatings,
      });

      console.log(`✅ Updated rating for ${foodName}: ${rating}/5 (Avg: ${foodItem.averageRating.toFixed(1)})`);
    }

    // Mark order as having feedback
    order.hasFeedback = true;
    await order.save();

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      results,
    });
  } catch (error) {
    console.error('Submit item feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message,
    });
  }
});

// Get food items with ratings (for admin)
router.get('/items-with-ratings', authenticate, async (req, res) => {
  try {
    // Only admin can access
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    // Get all food items that have ratings
    const foodItems = await FoodItem.find({ 
      totalRatings: { $gt: 0 } 
    })
    .select('name category imageUrl averageRating totalRatings ratings')
    .sort({ averageRating: -1 });

    // Format the response
    const formattedItems = foodItems.map(item => ({
      _id: item._id,
      name: item.name,
      category: item.category,
      imageUrl: item.imageUrl,
      averageRating: item.averageRating,
      totalRatings: item.totalRatings,
      recentFeedbacks: item.ratings
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(r => ({
          rating: r.rating,
          review: r.review,
          createdAt: r.createdAt,
        })),
    }));

    // Log what we're sending
    console.log('Sending food ratings to admin:');
    formattedItems.forEach(item => {
      console.log(`- ${item.name}: ${item.totalRatings} ratings, ${item.recentFeedbacks.length} recent feedbacks`);
      item.recentFeedbacks.forEach((fb, idx) => {
        console.log(`  ${idx + 1}. Rating: ${fb.rating}, Review: "${fb.review || '(empty)'}"`);
      });
    });

    res.json({
      success: true,
      items: formattedItems,
      totalItems: formattedItems.length,
    });
  } catch (error) {
    console.error('Get items with ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      error: error.message,
    });
  }
});

// Get ratings for a specific food item
router.get('/item/:foodId', authenticate, async (req, res) => {
  try {
    const foodItem = await FoodItem.findById(req.params.foodId)
      .select('name imageUrl averageRating totalRatings ratings')
      .populate('ratings.userId', 'name phone');

    if (!foodItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Food item not found' 
      });
    }

    res.json({
      success: true,
      foodItem: {
        _id: foodItem._id,
        name: foodItem.name,
        imageUrl: foodItem.imageUrl,
        averageRating: foodItem.averageRating,
        totalRatings: foodItem.totalRatings,
        ratings: foodItem.ratings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      },
    });
  } catch (error) {
    console.error('Get item ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ratings',
      error: error.message,
    });
  }
});

module.exports = router;
