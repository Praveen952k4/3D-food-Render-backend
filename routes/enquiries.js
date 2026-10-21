const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Enquiry = require('../models/Enquiry');

/**
 * Validates and submits a sales enquiry.
 * POST /api/enquiries
 */
router.post(
  '/',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .matches(/^[0-9+\-\s()]{7,20}$/)
      .withMessage('Please provide a valid phone number'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Description cannot exceed 2000 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    try {
      const { name, phone, email, description } = req.body;

      // Persist the enquiry to MongoDB
      const enquiry = new Enquiry({
        name,
        phone,
        email,
        description: description || '',
      });

      await enquiry.save();

      // Check for configured SMTP provider
      const hasSmtpConfig = Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        process.env.SALES_EMAIL
      );

      let emailStatus = {
        sent: false,
        reason: 'SMTP provider not configured in environment variables.',
      };

      if (hasSmtpConfig) {
        try {
          // Dynamic require in case nodemailer is installed
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });

          await transporter.sendMail({
            from: `"AR Automated Dining Sales" <${process.env.SMTP_USER}>`,
            to: process.env.SALES_EMAIL,
            replyTo: email,
            subject: `[Sales Enquiry] New demo lead from ${name}`,
            text: `New Talk to Sales Enquiry:\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nDescription: ${description || 'None'}\nReceived: ${new Date().toISOString()}`,
            html: `
              <h3>New Sales Enquiry</h3>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
              <p><strong>Description:</strong> ${description || 'None provided'}</p>
              <hr />
              <small>Enquiry ID: ${enquiry._id}</small>
            `,
          });

          emailStatus = { sent: true, recipient: process.env.SALES_EMAIL };
        } catch (emailErr) {
          console.warn('⚠️ SMTP email sending failed, enquiry preserved in database:', emailErr.message);
          emailStatus = { sent: false, reason: `SMTP send error: ${emailErr.message}` };
        }
      } else {
        console.log(`ℹ️ [Sales Enquiry Received] Stored in MongoDB: ${name} (${email}, ${phone})`);
      }

      return res.status(201).json({
        success: true,
        message: "Thanks for contacting us. We'll get back to you shortly.",
        enquiryId: enquiry._id,
        emailStatus,
      });
    } catch (err) {
      console.error('Error processing sales enquiry:', err);
      return res.status(500).json({
        success: false,
        message: 'Could not process your enquiry. Please try again shortly.',
      });
    }
  }
);

/**
 * Optional admin listing of enquiries
 * GET /api/enquiries
 */
router.get('/', async (req, res) => {
  try {
    const enquiries = await Enquiry.find().sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, enquiries });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
