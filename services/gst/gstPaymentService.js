const GSTPaymentChallan = require('../../models/gst/GSTPaymentChallan');
const { GSTProviderFactory } = require('./gstProviderAdapter');
const GSTAuditService = require('./gstAuditService');
const crypto = require('crypto');

class GSTPaymentService {
  /**
   * Create a GST payment challan for a reporting period
   */
  static async createChallan(restaurantId = 'default_restaurant', { period, netPayable, cgst, sgst, igst }, actor) {
    const correlationId = crypto.randomUUID();
    const adapter = GSTProviderFactory.getAdapter();

    const result = await adapter.createChallan({
      period,
      totalAmount: netPayable,
      cgst,
      sgst,
      igst,
    }, correlationId);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 15);

    const challan = new GSTPaymentChallan({
      restaurantId,
      period,
      cpin: result.cpin || ('CPIN' + Date.now().toString().slice(-10)),
      returnType: 'GSTR-3B',
      challanDate: new Date(),
      expiryDate,
      cgstAmount: cgst || 0,
      sgstAmount: sgst || 0,
      igstAmount: igst || 0,
      totalAmount: netPayable,
      paymentStatus: 'challan_generated',
      generatedBy: actor?.id || actor?.userId,
    });

    await challan.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'PAYMENT_CHALLAN_CREATED',
      actor,
      details: {
        period,
        cpin: challan.cpin,
        totalAmount: challan.totalAmount,
      },
      correlationId,
    });

    return challan;
  }

  /**
   * Record authoritative payment confirmation (Challan Identification Number / Bank Ref)
   */
  static async verifyAndRecordPayment(restaurantId = 'default_restaurant', { challanId, cin, brn, paymentMethod = 'net_banking' }, actor) {
    const challan = await GSTPaymentChallan.findOne({ _id: challanId, restaurantId });
    if (!challan) throw new Error('Payment challan not found');

    if (!cin) {
      throw new Error('Challan Identification Number (CIN) is required for payment verification.');
    }

    challan.paymentStatus = 'paid';
    challan.cin = cin;
    challan.brn = brn || '';
    challan.paymentMethod = paymentMethod;
    challan.paidAt = new Date();

    await challan.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'PAYMENT_CONFIRMED',
      actor,
      details: {
        challanId: challan._id,
        cpin: challan.cpin,
        cin: challan.cin,
        amount: challan.totalAmount,
      }
    });

    return challan;
  }

  /**
   * Process in-app direct payment in development sandbox mode
   * Interacts with provider adapter to simulate bank authorization and automatically obtain CIN
   */
  static async processDirectPayment(restaurantId = 'default_restaurant', { challanId, paymentMethod = 'net_banking', bankName = 'HDFC', upiId = '' }, actor) {
    const challan = await GSTPaymentChallan.findOne({ _id: challanId, restaurantId });
    if (!challan) throw new Error('Payment challan not found');

    if (challan.paymentStatus === 'paid') {
      return { success: true, challan, message: 'Challan is already paid.' };
    }

    const correlationId = crypto.randomUUID();
    const adapter = GSTProviderFactory.getAdapter();

    const paymentResult = await adapter.initiateDirectPayment({
      cpin: challan.cpin,
      amount: challan.totalAmount,
      bankCode: bankName || 'HDFC',
      paymentMode: paymentMethod,
    }, correlationId);

    if (!paymentResult.success) {
      throw new Error(paymentResult.message || 'Direct payment simulation failed');
    }

    challan.paymentStatus = 'paid';
    challan.cin = paymentResult.cin;
    challan.brn = paymentResult.brn;
    challan.paymentMethod = paymentMethod;
    challan.paidAt = new Date();
    await challan.save();

    await GSTAuditService.logEvent({
      restaurantId,
      action: 'DIRECT_PAYMENT_PROCESSED',
      actor,
      details: {
        challanId: challan._id,
        cpin: challan.cpin,
        cin: challan.cin,
        amount: challan.totalAmount,
        bankName,
        paymentMethod,
        mode: paymentResult.mode,
      },
      correlationId,
    });

    return {
      success: true,
      challan,
      paymentResult,
      message: `Tax payment of ₹${challan.totalAmount.toFixed(2)} completed successfully in Development Sandbox. CIN: ${challan.cin}`,
    };
  }

  /**
   * Get all challans for a restaurant
   */
  static async getChallans(restaurantId = 'default_restaurant') {
    return await GSTPaymentChallan.find({ restaurantId }).sort({ challanDate: -1 });
  }
}

module.exports = GSTPaymentService;
