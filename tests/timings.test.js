const assert = require('assert');
const { orderPrepMinutes, dishTimings } = require('../utils/timings');

console.log('🧪 Running Dish Timing Tests...');

/** An order as the dashboard reads it: stages with timestamps, and its items. */
const orderAt = (stages, items) => ({
  statusHistory: Object.entries(stages).map(([status, minutesIn]) => ({
    status,
    timestamp: new Date(Date.UTC(2026, 0, 1, 12, minutesIn)),
  })),
  items,
});

const dosa = { name: 'Masala Dosa', prepTimeMinutes: 12 };
const biryani = { name: 'Chicken Biryani', prepTimeMinutes: 25 };

// Test 1: the gap measured is confirmed → delivered, not placed → delivered
try {
  const order = orderAt({ pending: 0, confirmed: 5, preparing: 8, ready: 25, delivered: 30 }, [dosa]);
  assert.strictEqual(orderPrepMinutes(order), 25);
  console.log('  ✅ PASS: Prep time runs from confirmed to delivered, ignoring the wait before confirmation');
} catch (e) {
  console.error('  ❌ FAIL: Confirmed-to-delivered measurement:', e.message);
  process.exit(1);
}

// Test 2: an order that never reached one of the two stages cannot say
try {
  assert.strictEqual(orderPrepMinutes(orderAt({ pending: 0, confirmed: 5 }, [dosa])), null);
  assert.strictEqual(orderPrepMinutes(orderAt({ pending: 0, delivered: 40 }, [dosa])), null);
  console.log('  ✅ PASS: An order missing either stage is left out rather than guessed at');
} catch (e) {
  console.error('  ❌ FAIL: Incomplete order handling:', e.message);
  process.exit(1);
}

// Test 3: stages recorded out of order, and tickets left open, are discarded
try {
  assert.strictEqual(orderPrepMinutes(orderAt({ confirmed: 30, delivered: 10 }, [dosa])), null);
  assert.strictEqual(orderPrepMinutes(orderAt({ confirmed: 0, delivered: 400 }, [dosa])), null);
  console.log('  ✅ PASS: Negative gaps and abandoned tickets do not count as cooking time');
} catch (e) {
  console.error('  ❌ FAIL: Implausible duration handling:', e.message);
  process.exit(1);
}

// Test 4: one row per dish, averaged over its orders, slowest first
try {
  const rows = dishTimings([
    orderAt({ confirmed: 0, delivered: 20 }, [dosa, biryani]),
    orderAt({ confirmed: 0, delivered: 40 }, [dosa]),
    orderAt({ confirmed: 0, delivered: 10 }, [dosa]),
    // Never served: contributes to nothing.
    orderAt({ confirmed: 0, preparing: 3 }, [biryani]),
  ]);

  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));

  assert.strictEqual(rows.length, 2);
  // Dosa: 20, 40 and 10 minutes.
  assert.strictEqual(byName['Masala Dosa'].orders, 3);
  assert.strictEqual(byName['Masala Dosa'].averageMinutes, 23.3);
  assert.strictEqual(byName['Masala Dosa'].fastestMinutes, 10);
  assert.strictEqual(byName['Masala Dosa'].slowestMinutes, 40);
  assert.strictEqual(byName['Masala Dosa'].quotedMinutes, 12);
  // Biryani rode on one served ticket only.
  assert.strictEqual(byName['Chicken Biryani'].orders, 1);
  assert.strictEqual(byName['Chicken Biryani'].averageMinutes, 20);
  // Slowest first.
  assert.strictEqual(rows[0].name, 'Masala Dosa');
  console.log('  ✅ PASS: Each dish averages its own served orders, slowest listed first');
} catch (e) {
  console.error('  ❌ FAIL: Per-dish averaging:', e.message);
  process.exit(1);
}

// Test 5: every dish on a ticket wears the whole wait
try {
  const [row] = dishTimings([orderAt({ confirmed: 0, delivered: 30 }, [biryani])]);
  assert.strictEqual(row.averageMinutes, 30);
  console.log('  ✅ PASS: A dish carries the full wait of the ticket it was on');
} catch (e) {
  console.error('  ❌ FAIL: Shared ticket duration:', e.message);
  process.exit(1);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Dish Timing Tests: 5 passed, 0 failed');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
