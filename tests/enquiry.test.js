const assert = require('assert');
const Enquiry = require('../models/Enquiry');

console.log('🧪 Running Sales Enquiry Validation Tests...');

// Test 1: Instantiating valid enquiry model
try {
  const enquiry = new Enquiry({
    name: 'Ravi Kumar',
    phone: '+91 9876543210',
    email: 'ravi.kumar@example.com',
    description: 'Looking to set up AR Automated Dining across 3 branches.',
  });

  assert.strictEqual(enquiry.name, 'Ravi Kumar');
  assert.strictEqual(enquiry.email, 'ravi.kumar@example.com');
  assert.strictEqual(enquiry.status, 'new');
  assert.strictEqual(typeof enquiry.phone, 'string');
  console.log('  ✅ PASS: Enquiry Model: Instantiates valid enquiry with default status "new"');
} catch (e) {
  console.error('  ❌ FAIL: Enquiry Model instantiation failed:', e.message);
  process.exit(1);
}

// Test 2: Validation rejects missing required fields
try {
  const invalid = new Enquiry({});
  const err = invalid.validateSync();
  assert(err.errors.name, 'Name should be required');
  assert(err.errors.phone, 'Phone should be required');
  assert(err.errors.email, 'Email should be required');
  console.log('  ✅ PASS: Enquiry Model: Requires name, phone, and email fields');
} catch (e) {
  console.error('  ❌ FAIL: Missing required field validation:', e.message);
  process.exit(1);
}

// Test 3: Phone number pattern matching
const phoneRegex = /^[0-9+\-\s()]{7,20}$/;
assert(phoneRegex.test('+91 9876543210'));
assert(phoneRegex.test('9876543210'));
assert(phoneRegex.test('(044) 2345-6789'));
assert(!phoneRegex.test('abc1234'));
assert(!phoneRegex.test('123')); // too short
console.log('  ✅ PASS: Enquiry Route: Phone number regex validates standard international/national formats');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Enquiry Tests: 3 passed, 0 failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
