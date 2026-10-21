const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/auth');

const GSTProfileService = require('../services/gst/gstProfileService');
const GSTOrderDataService = require('../services/gst/gstOrderDataService');
const GSTTaxCalculationService = require('../services/gst/gstTaxCalculationService');
const GSTReconciliationService = require('../services/gst/gstReconciliationService');
const GSTR1Service = require('../services/gst/gstr1Service');
const GSTR3BService = require('../services/gst/gstr3bService');
const GSTPaymentService = require('../services/gst/gstPaymentService');
const GSTAuditService = require('../services/gst/gstAuditService');
const { GSTProviderFactory } = require('../services/gst/gstProviderAdapter');
const GSTReturnDraft = require('../models/gst/GSTReturnDraft');

// Apply authentication and admin role enforcement
router.use(authenticate);
router.use(isAdmin);

// Helper to extract restaurantId from request (defaulting to 'default_restaurant' for single-tenant instance)
const getRestaurantId = (req) => req.headers['x-restaurant-id'] || 'default_restaurant';

// Helper to get standard period
const getCurrentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ==========================================
// 1. GST Profile Endpoints
// ==========================================

// GET /api/gst/profile
router.get('/profile', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const profile = await GSTProfileService.getProfile(restaurantId);
    const checklist = await GSTProfileService.getComplianceChecklist(restaurantId);

    res.json({
      success: true,
      profile,
      checklist,
    });
  } catch (error) {
    console.error('Get GST Profile Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/gst/profile
router.put('/profile', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const updated = await GSTProfileService.updateProfile(restaurantId, req.body, req.user);
    const checklist = await GSTProfileService.getComplianceChecklist(restaurantId);

    res.json({
      success: true,
      profile: updated,
      checklist,
      message: 'GST Profile successfully updated and verified.',
    });
  } catch (error) {
    console.error('Update GST Profile Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. GST Dashboard & Snapshot Endpoints
// ==========================================

// GET /api/gst/dashboard?period=YYYY-MM
router.get('/dashboard', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const period = req.query.period || getCurrentPeriod();

    const profile = await GSTProfileService.getProfile(restaurantId);

    // Fetch or calculate period snapshot
    let snapshot = await GSTOrderDataService.getSnapshot(restaurantId, period);
    if (!snapshot) {
      snapshot = await GSTOrderDataService.calculatePeriodSnapshot(restaurantId, period, req.user);
    }

    // Fetch reconciliation summary
    const reconSummary = await GSTReconciliationService.getReconciliationSummary(restaurantId, period, snapshot);

    // Fetch return drafts for period
    const gstr1Draft = await GSTReturnDraft.findOne({
      restaurantId,
      returnType: 'GSTR-1',
      period,
    }).sort({ version: -1 });

    const gstr3bDraft = await GSTReturnDraft.findOne({
      restaurantId,
      returnType: 'GSTR-3B',
      period,
    }).sort({ version: -1 });

    // Recent challan
    const challans = await GSTPaymentService.getChallans(restaurantId);
    const periodChallan = challans.find(c => c.period === period);

    res.json({
      success: true,
      period,
      financialYear: snapshot.financialYear,
      isGstRegistered: profile.isGstRegistered,
      gstin: profile.gstin,
      taxTreatment: profile.taxTreatment,
      itcEligible: profile.itcEligible,
      snapshot,
      reconciliation: reconSummary,
      returns: {
        gstr1: gstr1Draft ? {
          id: gstr1Draft._id,
          version: gstr1Draft.version,
          status: gstr1Draft.status,
          arn: gstr1Draft.arn,
          filingDate: gstr1Draft.filingDate,
          validationErrors: gstr1Draft.validationErrors,
        } : null,
        gstr3b: gstr3bDraft ? {
          id: gstr3bDraft._id,
          version: gstr3bDraft.version,
          status: gstr3bDraft.status,
          arn: gstr3bDraft.arn,
          filingDate: gstr3bDraft.filingDate,
          validationErrors: gstr3bDraft.validationErrors,
        } : null,
      },
      payment: periodChallan ? {
        id: periodChallan._id,
        cpin: periodChallan.cpin,
        status: periodChallan.paymentStatus,
        cin: periodChallan.cin,
        amount: periodChallan.totalAmount,
      } : null,
      liabilityLabel: reconSummary.liabilityLabel,
    });
  } catch (error) {
    console.error('Get GST Dashboard Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/gst/snapshots/calculate
router.post('/snapshots/calculate', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const period = req.body.period || getCurrentPeriod();
    const snapshot = await GSTOrderDataService.calculatePeriodSnapshot(restaurantId, period, req.user);

    res.json({
      success: true,
      snapshot,
      message: `Tax calculations snapshot generated for period ${period}.`,
    });
  } catch (error) {
    console.error('Calculate Snapshot Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. Reconciliation Endpoints
// ==========================================

// GET /api/gst/reconciliation?period=YYYY-MM
router.get('/reconciliation', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const period = req.query.period || getCurrentPeriod();

    const snapshot = await GSTOrderDataService.getSnapshot(restaurantId, period);
    const items = await GSTReconciliationService.getItems(restaurantId, period);
    const summary = await GSTReconciliationService.getReconciliationSummary(restaurantId, period, snapshot);

    res.json({
      success: true,
      period,
      items,
      summary,
    });
  } catch (error) {
    console.error('Get Reconciliation Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/gst/reconciliation/items
router.post('/reconciliation/items', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const item = await GSTReconciliationService.addItem(restaurantId, req.body, req.user);

    res.status(201).json({
      success: true,
      item,
      message: 'Reconciliation record added successfully.',
    });
  } catch (error) {
    console.error('Add Reconciliation Item Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. GSTR-1 Endpoints
// ==========================================

// POST /api/gst/gstr1/generate
router.post('/gstr1/generate', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const period = req.body.period || getCurrentPeriod();
    const draft = await GSTR1Service.generateDraft(restaurantId, period, req.user);

    res.json({
      success: true,
      draft,
      message: `GSTR-1 Draft v${draft.version} generated successfully.`,
    });
  } catch (error) {
    console.error('Generate GSTR-1 Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/gst/gstr1/:period
router.get('/gstr1/:period', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const draft = await GSTReturnDraft.findOne({
      restaurantId,
      returnType: 'GSTR-1',
      period: req.params.period,
    }).sort({ version: -1 });

    if (!draft) {
      return res.status(404).json({ success: false, message: 'GSTR-1 draft not found for period.' });
    }

    res.json({ success: true, draft });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/gst/gstr1/approve
router.post('/gstr1/approve', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { draftId, approvalNotes } = req.body;
    const draft = await GSTR1Service.approveDraft(restaurantId, draftId, req.user, approvalNotes);

    res.json({
      success: true,
      draft,
      message: 'GSTR-1 Return draft approved for submission.',
    });
  } catch (error) {
    console.error('Approve GSTR-1 Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/gst/gstr1/submit
router.post('/gstr1/submit', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { draftId } = req.body;

    const draft = await GSTReturnDraft.findOne({ _id: draftId, restaurantId });
    if (!draft) return res.status(404).json({ success: false, message: 'Draft not found.' });

    if (draft.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Draft must be approved by an authorized manager before submission.' 
      });
    }

    const adapter = GSTProviderFactory.getAdapter();
    const correlationId = require('crypto').randomUUID();

    const result = await adapter.submitReturn('GSTR-1', draft.payload, correlationId);

    draft.submissionAttempts.push({
      attemptAt: new Date(),
      provider: adapter.name,
      correlationId,
      status: result.status,
      providerResponseRef: result.providerRef || result.arn,
      errorMessage: result.success ? null : result.message,
    });

    if (result.success && result.arn) {
      draft.status = 'filed';
      draft.arn = result.arn;
      draft.filingDate = new Date();
    } else if (result.success) {
      draft.status = 'submitted';
    } else {
      draft.status = 'failed';
    }

    await draft.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GSTR1_SUBMISSION_ATTEMPT',
      actor: req.user,
      details: {
        draftId: draft._id,
        status: draft.status,
        arn: draft.arn,
        resultMessage: result.message,
      },
      correlationId,
    });

    res.json({
      success: result.success,
      draft,
      providerResult: result,
      message: result.message,
    });
  } catch (error) {
    console.error('Submit GSTR-1 Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. GSTR-3B Endpoints
// ==========================================

// POST /api/gst/gstr3b/generate
router.post('/gstr3b/generate', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const period = req.body.period || getCurrentPeriod();
    const draft = await GSTR3BService.generateDraft(restaurantId, period, req.user);

    res.json({
      success: true,
      draft,
      message: `GSTR-3B Draft v${draft.version} generated successfully.`,
    });
  } catch (error) {
    console.error('Generate GSTR-3B Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/gst/gstr3b/:period
router.get('/gstr3b/:period', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const draft = await GSTReturnDraft.findOne({
      restaurantId,
      returnType: 'GSTR-3B',
      period: req.params.period,
    }).sort({ version: -1 });

    if (!draft) {
      return res.status(404).json({ success: false, message: 'GSTR-3B draft not found for period.' });
    }

    res.json({ success: true, draft });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/gst/gstr3b/approve
router.post('/gstr3b/approve', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { draftId, approvalNotes } = req.body;
    const draft = await GSTR3BService.approveDraft(restaurantId, draftId, req.user, approvalNotes);

    res.json({
      success: true,
      draft,
      message: 'GSTR-3B Return draft approved for submission.',
    });
  } catch (error) {
    console.error('Approve GSTR-3B Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/gst/gstr3b/submit
router.post('/gstr3b/submit', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { draftId } = req.body;

    const draft = await GSTReturnDraft.findOne({ _id: draftId, restaurantId });
    if (!draft) return res.status(404).json({ success: false, message: 'Draft not found.' });

    if (draft.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Draft must be approved by an authorized manager before submission.' 
      });
    }

    const adapter = GSTProviderFactory.getAdapter();
    const correlationId = require('crypto').randomUUID();

    const result = await adapter.submitReturn('GSTR-3B', draft.payload, correlationId);

    draft.submissionAttempts.push({
      attemptAt: new Date(),
      provider: adapter.name,
      correlationId,
      status: result.status,
      providerResponseRef: result.providerRef || result.arn,
      errorMessage: result.success ? null : result.message,
    });

    if (result.success && result.arn) {
      draft.status = 'filed';
      draft.arn = result.arn;
      draft.filingDate = new Date();
    } else if (result.success) {
      draft.status = 'submitted';
    } else {
      draft.status = 'failed';
    }

    await draft.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'GSTR3B_SUBMISSION_ATTEMPT',
      actor: req.user,
      details: {
        draftId: draft._id,
        status: draft.status,
        arn: draft.arn,
        resultMessage: result.message,
      },
      correlationId,
    });

    res.json({
      success: result.success,
      draft,
      providerResult: result,
      message: result.message,
    });
  } catch (error) {
    console.error('Submit GSTR-3B Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. Challan & Payment Endpoints
// ==========================================

// POST /api/gst/challans/create
router.post('/challans/create', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { period, netPayable, cgst, sgst, igst } = req.body;

    const challan = await GSTPaymentService.createChallan(restaurantId, {
      period,
      netPayable: Number(netPayable),
      cgst: Number(cgst),
      sgst: Number(sgst),
      igst: Number(igst),
    }, req.user);

    res.status(201).json({
      success: true,
      challan,
      message: `GST Challan ${challan.cpin} generated successfully. Valid for 15 days.`,
    });
  } catch (error) {
    console.error('Create Challan Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/gst/challans/verify-payment
router.post('/challans/verify-payment', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { challanId, cin, brn, paymentMethod } = req.body;

    const challan = await GSTPaymentService.verifyAndRecordPayment(restaurantId, {
      challanId,
      cin,
      brn,
      paymentMethod,
    }, req.user);

    res.json({
      success: true,
      challan,
      message: `Payment confirmed with CIN: ${challan.cin}. Tax liability offset completed.`,
    });
  } catch (error) {
    console.error('Verify Payment Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/gst/challans/pay-direct - Development Sandbox Direct Payment
router.post('/challans/pay-direct', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { challanId, paymentMethod, bankName, upiId } = req.body;

    const result = await GSTPaymentService.processDirectPayment(restaurantId, {
      challanId,
      paymentMethod,
      bankName,
      upiId,
    }, req.user);

    res.json({
      success: true,
      mode: 'DEVELOPMENT_SANDBOX_SIMULATION',
      challan: result.challan,
      paymentResult: result.paymentResult,
      message: result.message,
    });
  } catch (error) {
    console.error('Pay Direct Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================================
// 7. History & Audit Trail Endpoints
// ==========================================

// GET /api/gst/history
router.get('/history', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const returns = await GSTReturnDraft.find({ restaurantId }).sort({ createdAt: -1 });
    const challans = await GSTPaymentService.getChallans(restaurantId);

    res.json({
      success: true,
      returns,
      challans,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/gst/audit-trail
router.get('/audit-trail', async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { page = 1, limit = 50, action } = req.query;

    const result = await GSTAuditService.getEvents({
      restaurantId,
      page,
      limit,
      action,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
