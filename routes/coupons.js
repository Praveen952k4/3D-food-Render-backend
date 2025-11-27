const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { authenticate, isAdmin } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticate);

// GET /api/coupons/available - Get available coupons for customers
router.get('/available', async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
    })
    .select('code description discountType discountValue minOrderValue maxDiscount')
    .sort({ createdAt: -1 });

    // Filter out coupons that have reached usage limit
    const availableCoupons = coupons.filter(coupon => {
      return !coupon.usageLimit || coupon.usedCount < coupon.usageLimit;
    });

    res.json({
      success: true,
      coupons: availableCoupons
    });
  } catch (error) {
    console.error('Get available coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available coupons'
    });
  }
});

// GET /api/coupons/validate/:code - Validate and get coupon details (Customer)
router.get('/validate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { orderValue } = req.query;

    console.log('🎟️ Validating coupon:', code, 'for order value:', orderValue);

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      console.log('❌ Coupon not found:', code);
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    console.log('📋 Coupon found:', {
      code: coupon.code,
      isActive: coupon.isActive,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      usageLimit: coupon.usageLimit,
      usedCount: coupon.usedCount,
      minOrderValue: coupon.minOrderValue,
    });

    const now = new Date();
    console.log('⏰ Current time:', now);
    console.log('⏰ Valid from:', coupon.validFrom, '(is valid:', coupon.validFrom <= now, ')');
    console.log('⏰ Valid until:', coupon.validUntil, '(is valid:', coupon.validUntil >= now, ')');
    console.log('🔢 Usage:', coupon.usedCount, '/', coupon.usageLimit || 'unlimited');
    console.log('✅ Is active:', coupon.isActive);

    if (!coupon.isValid()) {
      console.log('❌ Coupon validation failed');
      
      let reason = '';
      if (!coupon.isActive) reason = 'Coupon is inactive';
      else if (coupon.validFrom > now) reason = 'Coupon is not yet active';
      else if (coupon.validUntil < now) reason = 'Coupon has expired';
      else if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) reason = 'Coupon usage limit reached';
      
      console.log('❌ Reason:', reason);
      
      return res.status(400).json({
        success: false,
        message: reason || 'This coupon is not valid or has expired'
      });
    }

    const discount = orderValue ? coupon.calculateDiscount(parseFloat(orderValue)) : 0;
    
    console.log('✅ Coupon is valid, discount:', discount);

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue,
        maxDiscount: coupon.maxDiscount,
        discount,
      }
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon'
    });
  }
});

// POST /api/coupons/apply - Apply coupon to order (Customer)
router.post('/apply', async (req, res) => {
  try {
    const { code, orderValue } = req.body;

    if (!code || !orderValue) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code and order value are required'
      });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    if (!coupon.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'This coupon is not valid or has expired'
      });
    }

    if (orderValue < coupon.minOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value of ₹${coupon.minOrderValue} required`
      });
    }

    const discount = coupon.calculateDiscount(orderValue);

    // Increment usage count
    coupon.usedCount += 1;
    await coupon.save();

    res.json({
      success: true,
      discount,
      coupon: {
        code: coupon.code,
        description: coupon.description,
      }
    });
  } catch (error) {
    console.error('Apply coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply coupon'
    });
  }
});

// ========== ADMIN ROUTES ==========
router.use(isAdmin);

// GET /api/coupons - Get all coupons (Admin)
router.get('/', async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate('createdBy', 'name phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: coupons.length,
      coupons
    });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons'
    });
  }
});

// POST /api/coupons - Create new coupon (Admin)
router.post('/', async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscount,
      usageLimit,
      validFrom,
      validUntil,
      applicableCategories,
    } = req.body;

    if (!code || !discountType || !discountValue || !validUntil) {
      return res.status(400).json({
        success: false,
        message: 'Code, discount type, discount value, and valid until date are required'
      });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    const coupon = new Coupon({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      minOrderValue: minOrderValue || 0,
      maxDiscount,
      usageLimit,
      validFrom: validFrom || Date.now(),
      validUntil,
      applicableCategories,
      createdBy: req.user.id,
    });

    await coupon.save();

    res.json({
      success: true,
      message: 'Coupon created successfully',
      coupon
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon',
      error: error.message
    });
  }
});

// PUT /api/coupons/:id - Update coupon (Admin)
router.put('/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      coupon
    });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon'
    });
  }
});

// DELETE /api/coupons/:id - Delete coupon (Admin)
router.delete('/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon'
    });
  }
});

// PATCH /api/coupons/:id/toggle - Toggle coupon active status (Admin)
router.patch('/:id/toggle', async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    coupon.isActive = !coupon.isActive;
    coupon.updatedAt = Date.now();
    await coupon.save();

    res.json({
      success: true,
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      coupon
    });
  } catch (error) {
    console.error('Toggle coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle coupon status'
    });
  }
});

module.exports = router;
