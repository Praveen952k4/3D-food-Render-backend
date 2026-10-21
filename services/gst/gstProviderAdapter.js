const crypto = require('crypto');
const GSTAuditService = require('./gstAuditService');

/**
 * Base Provider Adapter Interface
 */
class BaseGSTProviderAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  async submitReturn(returnType, payload, correlationId) {
    throw new Error('submitReturn must be implemented by provider adapter.');
  }

  async getFilingStatus(referenceId, correlationId) {
    throw new Error('getFilingStatus must be implemented by provider adapter.');
  }

  async createChallan(challanData, correlationId) {
    throw new Error('createChallan must be implemented by provider adapter.');
  }

  async getPaymentStatus(cpin, correlationId) {
    throw new Error('getPaymentStatus must be implemented by provider adapter.');
  }

  async initiateDirectPayment(paymentData, correlationId) {
    throw new Error('initiateDirectPayment must be implemented by provider adapter.');
  }
}

/**
 * Mock / Sandbox GST Provider Adapter
 * Used for automated tests and sandbox demonstration.
 * Generates realistic responses without touching live GSTN servers.
 */
class MockGSTProviderAdapter extends BaseGSTProviderAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'MockGSTProviderAdapter';
  }

  async submitReturn(returnType, payload, correlationId) {
    // Simulate brief network delay
    await new Promise(r => setTimeout(r, 100));

    // Generate simulated reference ID
    const providerRef = 'REF-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const arn = 'AA' + payload.gstin?.substring(0, 2) + '1026' + Math.floor(1000000 + Math.random() * 9000000);

    return {
      success: true,
      provider: this.name,
      correlationId,
      providerRef,
      status: 'SUBMITTED',
      arn,
      message: `${returnType} return accepted by GSTN sandbox. Acknowledgement Reference Number (ARN) generated.`,
      timestamp: new Date().toISOString(),
    };
  }

  async getFilingStatus(referenceId, correlationId) {
    return {
      success: true,
      provider: this.name,
      referenceId,
      correlationId,
      status: 'FILED',
      arn: 'AA331026' + Math.floor(1000000 + Math.random() * 9000000),
      filingDate: new Date().toISOString(),
      message: 'Authoritative confirmation received from GSTN portal.',
    };
  }

  async createChallan(challanData, correlationId) {
    const cpin = 'CPIN' + Date.now().toString().slice(-10);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 15); // 15 days validity

    return {
      success: true,
      provider: this.name,
      correlationId,
      cpin,
      expiryDate: expiry.toISOString(),
      totalAmount: challanData.totalAmount,
      message: 'Challan created successfully on GST Portal. Complete payment via NetBanking/NEFT.',
    };
  }

  async getPaymentStatus(cpin, correlationId) {
    const cin = 'CIN' + Date.now().toString();
    return {
      success: true,
      provider: this.name,
      cpin,
      cin,
      status: 'PAID',
      paidAt: new Date().toISOString(),
      message: 'Payment confirmed by RBI/Authorized Bank.',
    };
  }

  async initiateDirectPayment({ cpin, amount, bankCode = 'HDFC', paymentMode = 'net_banking' }, correlationId) {
    // Development sandbox simulation - No real bank debit, no live government APIs
    const prefix = (bankCode || 'HDFC').toUpperCase().padEnd(4, 'X').substring(0, 4);
    // 17-digit standard CIN format: 4-char bank identifier + 13-digit sequence
    const timestampDigits = Date.now().toString().slice(-10);
    const randomDigits = Math.floor(100 + Math.random() * 900).toString();
    const cin = `${prefix}${timestampDigits}${randomDigits}`;
    const brn = `BRN-${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;

    return {
      success: true,
      provider: this.name,
      mode: 'DEVELOPMENT_SANDBOX_SIMULATION',
      correlationId,
      cpin,
      cin,
      brn,
      amount,
      bankCode: prefix,
      paymentMode,
      status: 'PAID',
      paidAt: new Date().toISOString(),
      message: 'Direct payment simulated successfully in development sandbox. No real bank accounts or government APIs were contacted.',
    };
  }
}

/**
 * MasterGST Provider Adapter
 * Follows MasterGST API specification patterns.
 * Activates when MASTERGST_CLIENT_ID and MASTERGST_CLIENT_SECRET are configured in environment.
 */
class MasterGSTProviderAdapter extends BaseGSTProviderAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'MasterGST';
    this.baseUrl = process.env.MASTERGST_BASE_URL || 'https://api.mastergst.com';
    this.clientId = process.env.MASTERGST_CLIENT_ID;
    this.clientSecret = process.env.MASTERGST_CLIENT_SECRET;
  }

  isConfigured() {
    return !!(this.clientId && this.clientSecret);
  }

  async submitReturn(returnType, payload, correlationId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        correlationId,
        status: 'BLOCKED_PENDING_CONFIG',
        message: 'MasterGST credentials (MASTERGST_CLIENT_ID / MASTERGST_CLIENT_SECRET) are not configured in environment. Please supply valid credentials or use Mock Sandbox.',
      };
    }

    // In production, an authorized HTTPS request to MasterGST endpoints is executed here with token auth
    return {
      success: false,
      provider: this.name,
      correlationId,
      status: 'AWAITING_PRODUCTION_ONBOARDING',
      message: 'MasterGST live submission requires commercial GSTN authorization and taxpayer EVC/OTP authentication.',
    };
  }

  async getFilingStatus(referenceId, correlationId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        status: 'BLOCKED_PENDING_CONFIG',
        message: 'MasterGST credentials not configured.',
      };
    }
    return { success: false, message: 'Provider query pending.' };
  }

  async createChallan(challanData, correlationId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        status: 'BLOCKED_PENDING_CONFIG',
        message: 'Challan creation via MasterGST requires active provider credentials.',
      };
    }
    return { success: false, message: 'Provider challan pending.' };
  }

  async getPaymentStatus(cpin, correlationId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        provider: this.name,
        status: 'BLOCKED_PENDING_CONFIG',
        message: 'Payment status query requires active provider credentials.',
      };
    }
    return { success: false, message: 'Provider payment query pending.' };
  }

  async initiateDirectPayment(paymentData, correlationId) {
    return {
      success: false,
      provider: this.name,
      status: 'BLOCKED_PENDING_BANK_ONBOARDING',
      message: 'Direct payment via MasterGST requires dedicated commercial banking gateway onboarding and authorized EVC authorization. Use Sandbox simulation for development.',
    };
  }
}

/**
 * Factory to retrieve the active GST provider adapter
 */
class GSTProviderFactory {
  static getAdapter() {
    if (process.env.MASTERGST_CLIENT_ID && process.env.MASTERGST_CLIENT_SECRET) {
      return new MasterGSTProviderAdapter();
    }
    // Default to mock adapter for safe development & testing
    return new MockGSTProviderAdapter();
  }
}

module.exports = {
  BaseGSTProviderAdapter,
  MockGSTProviderAdapter,
  MasterGSTProviderAdapter,
  GSTProviderFactory,
};
