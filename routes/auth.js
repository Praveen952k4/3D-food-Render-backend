const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

// Generate OTP (using dummy OTP for development)
const generateOTP = () => {
  // Using fixed OTP for easy development login
  return '123456';
};

// Send OTP (mock implementation)
const sendOTP = async (phone, otp) => {
  // SMS integration disabled - using dummy OTP
  console.log(`📱 OTP for ${phone}: ${otp} (Use this to login)`);
  return true;
};

// POST /api/auth/send-otp - Send OTP to phone
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    console.log('📱 Send OTP request received:', { phone, body: req.body });

    if (!phone) {
      console.log('❌ Phone number missing');
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    console.log('📞 Cleaned phone:', cleanPhone);

    if (cleanPhone.length < 10) {
      console.log('❌ Invalid phone length:', cleanPhone.length);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid phone number. Must be at least 10 digits.' 
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    console.log('🔑 Generated OTP:', otp);

    // Find or create user
    let user = await User.findOne({ phone: cleanPhone });
    
    if (!user) {
      console.log('👤 Creating new user');
      user = new User({
        phone: cleanPhone,
        otp,
        otpExpiry,
      });
    } else {
      console.log('👤 Updating existing user');
      user.otp = otp;
      user.otpExpiry = otpExpiry;
    }

    await user.save();
    console.log('✅ User saved successfully');

    // Send OTP
    await sendOTP(cleanPhone, otp);

    console.log('✅ OTP sent successfully');
    res.json({ 
      success: true, 
      message: 'OTP sent successfully. Use 123456 to login.',
      otp: '123456', // Dummy OTP for development
    });
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send OTP: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// POST /api/auth/verify-otp - Verify OTP and login
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone and OTP are required' 
      });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // Find user
    const user = await User.findOne({ phone: cleanPhone });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check OTP expiry
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP expired. Please request a new one.' 
      });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    // Update user
    user.isVerified = true;
    user.lastLogin = new Date();
    user.isOnline = true;
    user.loginHistory.push({
      timestamp: new Date(),
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent') || 'Unknown',
    });
    // Keep only last 50 login records
    if (user.loginHistory.length > 50) {
      user.loginHistory = user.loginHistory.slice(-50);
    }
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.phone, user.role);

    res.json({ 
      success: true, 
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Verification failed' 
    });
  }
});

// POST /api/auth/update-profile - Update user profile
router.post('/update-profile', async (req, res) => {
  try {
    const { phone, name, email } = req.body;

    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    user.name = name || user.name;
    user.email = email || user.email;
    await user.save();

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update profile' 
    });
  }
});

module.exports = router;
