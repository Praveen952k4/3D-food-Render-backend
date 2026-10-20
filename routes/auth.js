const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Table = require('../models/Table');
const { generateToken } = require('../middleware/auth');
const { seatingEvent, emitActivity } = require('../utils/activity');

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

    // Customers, admins and kitchen staff all sign in with a phone number and
    // the dummy OTP. Only guests are turned away: their stored "phone" is a
    // generated session id, not a number anyone can type in.
    if (user.role === 'guest') {
      return res.status(403).json({
        success: false,
        message: 'Guests sign in with their table number.',
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

// --------------------------------------------------------------------------
// Role-scoped sign-in
//
// Each door checks the role recorded on the user, so staff cannot come in
// through the customer door and vice versa. Admins share the customer door,
// because they sign in with a phone number too.
// --------------------------------------------------------------------------

const recordLogin = (user, req) => {
  user.lastLogin = new Date();
  user.isOnline = true;
  user.loginHistory.push({
    timestamp: new Date(),
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent') || 'Unknown',
  });
  if (user.loginHistory.length > 50) {
    user.loginHistory = user.loginHistory.slice(-50);
  }
};

const publicUser = (user) => ({
  id: user._id,
  phone: user.phone,
  name: user.name,
  email: user.email,
  role: user.role,
  staffId: user.staffId,
  tableNumber: user.tableNumber,
});

// POST /api/auth/guest/login - sign in by table number, no account needed
router.post('/guest/login', async (req, res) => {
  try {
    const tableNumber = String(req.body.tableNumber ?? '').trim();
    const name = String(req.body.name ?? '').trim();

    if (!tableNumber) {
      return res.status(400).json({ success: false, message: 'Please enter your table number.' });
    }

    // The table is validated against the tables collection, so a guess at a
    // number that does not exist is refused.
    const table = await Table.findOne({ number: tableNumber });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: `Table ${tableNumber} is not one of ours. Check the number on the table card.`,
      });
    }

    if (!table.isActive) {
      return res.status(403).json({
        success: false,
        message: `Table ${tableNumber} is not in service right now. Please ask a member of staff.`,
      });
    }

    // One record per guest session, keyed by a generated id in the phone
    // field so everything downstream that looks a customer up by phone keeps
    // working. It is never a real phone number.
    const sessionId = `GUEST-T${tableNumber}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const guest = new User({
      phone: sessionId,
      name: name || `Table ${tableNumber} guest`,
      role: 'guest',
      tableNumber,
      isVerified: true,
    });
    recordLogin(guest, req);
    await guest.save();

    const token = generateToken(guest._id, guest.phone, guest.role);

    console.log(`🪑 Guest signed in at table ${tableNumber} (${guest.name})`);

    // The admin's service timeline starts here: the table is taken, and every
    // later stage of this visit is measured from this moment.
    emitActivity(req.app.get('io'), seatingEvent(guest));

    res.json({
      success: true,
      message: `Welcome to table ${tableNumber}`,
      token,
      user: publicUser(guest),
      table: { number: table.number, label: table.label, seats: table.seats },
    });
  } catch (error) {
    console.error('Guest login error:', error);
    res.status(500).json({ success: false, message: 'Could not start your guest session.' });
  }
});

// POST /api/auth/staff/login - staff ID + password, for the kitchen
router.post('/staff/login', async (req, res) => {
  try {
    const staffId = String(req.body.staffId ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');

    if (!staffId || !password) {
      return res.status(400).json({ success: false, message: 'Staff ID and password are both required.' });
    }

    // passwordHash is select:false on the schema, so ask for it explicitly.
    const user = await User.findOne({ staffId }).select('+passwordHash');

    // One message for a wrong ID and a wrong password, so this cannot be used
    // to find out which staff IDs exist.
    const invalid = { success: false, message: 'That staff ID and password do not match.' };

    if (!user) return res.status(401).json(invalid);
    if (!(await user.verifyPassword(password))) return res.status(401).json(invalid);

    if (!['chef', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'This sign-in is for kitchen staff. Please use the customer sign-in.',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: 'This staff account has been deactivated.' });
    }

    recordLogin(user, req);
    await user.save();

    const token = generateToken(user._id, user.phone, user.role);

    console.log(`👨‍🍳 Staff signed in: ${user.staffId} (${user.role})`);

    res.json({ success: true, message: 'Signed in', token, user: publicUser(user) });
  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({ success: false, message: 'Sign-in failed.' });
  }
});

// GET /api/auth/tables - the table numbers a guest can choose from
router.get('/tables', async (req, res) => {
  try {
    const tables = await Table.find({ isActive: true }).sort({ number: 1 }).select('number label seats');
    res.json({ success: true, tables });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ success: false, message: 'Could not load the table list.' });
  }
});

module.exports = router;
