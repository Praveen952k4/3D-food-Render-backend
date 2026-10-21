const assert = require('assert');
const GSTTaxCalculationService = require('../services/gst/gstTaxCalculationService');
const GSTProfileService = require('../services/gst/gstProfileService');
const GSTAuditService = require('../services/gst/gstAuditService');
const GSTOrderDataService = require('../services/gst/gstOrderDataService');
const { MockGSTProviderAdapter, MasterGSTProviderAdapter } = require('../services/gst/gstProviderAdapter');

async function runTests() {
  console.log('🧪 Running GST Compliance Module Automated Tests...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Tax Calculation Tests
  test('GSTTaxCalculationService: Decimal precision 5% intra-state calculation', () => {
    const calc = GSTTaxCalculationService.calculateTax(250.00, { ratePercent: 5.0, isInterstate: false });
    assert.strictEqual(calc.taxableValue, 250.00);
    assert.strictEqual(calc.cgstRate, 2.5);
    assert.strictEqual(calc.sgstRate, 2.5);
    assert.strictEqual(calc.cgst, 6.25);
    assert.strictEqual(calc.sgst, 6.25);
    assert.strictEqual(calc.totalTax, 12.50);
    assert.strictEqual(calc.invoiceTotal, 262.50);
  });

  test('GSTTaxCalculationService: No binary floating-point roundoff errors (e.g. 19.99 * 5%)', () => {
    const calc = GSTTaxCalculationService.calculateTax(19.99, { ratePercent: 5.0 });
    assert.strictEqual(typeof calc.cgst, 'number');
    assert.strictEqual(typeof calc.sgst, 'number');
    assert.strictEqual(calc.cgst + calc.sgst, calc.totalTax);
  });

  test('GSTTaxCalculationService: Reverse calculation from tax-inclusive total', () => {
    const extracted = GSTTaxCalculationService.extractTaxFromTotal(105.00, { ratePercent: 5.0 });
    assert.strictEqual(extracted.taxableValue, 100.00);
    assert.strictEqual(extracted.totalTax, 5.00);
    assert.strictEqual(extracted.cgst, 2.50);
    assert.strictEqual(extracted.sgst, 2.50);
  });

  // 2. GSTIN Validation Tests
  test('GSTProfileService: Valid GSTIN format and state code match', () => {
    const res = GSTProfileService.validateGstin('33AAAAA0000A1Z5', '33');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.stateCode, '33');
    assert.strictEqual(res.stateName, 'Tamil Nadu');
    assert.strictEqual(res.pan, 'AAAAA0000A');
  });

  test('GSTProfileService: Reject invalid GSTIN structure', () => {
    const res = GSTProfileService.validateGstin('INVALID_GSTIN_123');
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('Invalid GSTIN format'));
  });

  test('GSTProfileService: Reject state code mismatch between GSTIN and profile', () => {
    const res = GSTProfileService.validateGstin('27AAAAA0000A1Z5', '33'); // 27 is Maharashtra, profile is 33 TN
    assert.strictEqual(res.valid, false);
    assert.ok(res.error.includes('does not match profile state code'));
  });

  // 3. Financial Year Logic Tests
  test('GSTOrderDataService: Financial year mapping for October (Q3)', () => {
    const fy = GSTOrderDataService.getFinancialYear('2026-10');
    assert.strictEqual(fy, '2026-27');
  });

  test('GSTOrderDataService: Financial year mapping for February (Q4)', () => {
    const fy = GSTOrderDataService.getFinancialYear('2027-02');
    assert.strictEqual(fy, '2026-27');
  });

  // 4. Audit Sanitization Tests
  test('GSTAuditService: Redact sensitive keys from log payloads', () => {
    const raw = {
      user: 'admin',
      password: 'plain_password',
      secretToken: 'jwt_12345',
      otp: '987654',
      profile: {
        legalName: 'AR Foods',
        apiKey: 'secret_key_123',
      }
    };
    const sanitized = GSTAuditService.sanitize(raw);
    assert.strictEqual(sanitized.user, 'admin');
    assert.strictEqual(sanitized.password, '[REDACTED]');
    assert.strictEqual(sanitized.secretToken, '[REDACTED]');
    assert.strictEqual(sanitized.otp, '[REDACTED]');
    assert.strictEqual(sanitized.profile.legalName, 'AR Foods');
    assert.strictEqual(sanitized.profile.apiKey, '[REDACTED]');
  });

  // 5. Provider Adapter Safety Tests
  test('MockGSTProviderAdapter: Return realistic ARN without calling live endpoints', async () => {
    const adapter = new MockGSTProviderAdapter();
    const res = await adapter.submitReturn('GSTR-1', { gstin: '33AAAAA0000A1Z5' }, 'corr-1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.provider, 'MockGSTProviderAdapter');
    assert.ok(res.arn.startsWith('AA33'));
  });

  test('MasterGSTProviderAdapter: Fails safely when credentials are missing (no fake success)', async () => {
    const adapter = new MasterGSTProviderAdapter();
    const res = await adapter.submitReturn('GSTR-1', {}, 'corr-2');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'BLOCKED_PENDING_CONFIG');
    assert.ok(res.message.includes('not configured in environment'));
  });

  // 6. Direct In-App Payment Sandbox Tests
  test('MockGSTProviderAdapter: Simulate direct payment and generate 17-digit CIN', async () => {
    const adapter = new MockGSTProviderAdapter();
    const res = await adapter.initiateDirectPayment({
      cpin: 'CPIN1234567890',
      amount: 1250.00,
      bankCode: 'HDFC',
      paymentMode: 'net_banking'
    }, 'corr-pay-1');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.mode, 'DEVELOPMENT_SANDBOX_SIMULATION');
    assert.strictEqual(res.status, 'PAID');
    assert.ok(res.cin.startsWith('HDFC'));
    assert.strictEqual(res.cin.length, 17);
    assert.strictEqual(res.amount, 1250.00);
    assert.ok(res.brn.startsWith('BRN-HDFC'));
  });

  test('MasterGSTProviderAdapter: Block unverified direct payment attempt in production adapter', async () => {
    const adapter = new MasterGSTProviderAdapter();
    const res = await adapter.initiateDirectPayment({}, 'corr-pay-2');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 'BLOCKED_PENDING_BANK_ONBOARDING');
    assert.ok(res.message.includes('requires dedicated commercial banking'));
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (failed > 0) process.exit(1);
}

runTests();
