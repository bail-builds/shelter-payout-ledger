import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../src/reconcile.js';
import { regexReceipt } from '../src/agent.js';
import { runPipeline } from '../src/run.js';
import { PayPal } from '../src/paypal.js';

const don = (shelter, gross, fee) => ({ shelter, gross, fee, net: gross - fee });

test('clean shelter reconciles', () => {
  const [r] = reconcile({
    donations: [don('A', 20, 1)], payouts: [{ shelter: 'A', amount: 19, status: 'SUCCESS', itemId: 'A-1' }],
    receipts: [{ shelter: 'A', amount: 19 }],
  });
  assert.equal(r.status, 'RECONCILED');
});

test('flags unpaid, mismatch, missing receipt, failed', () => {
  const rows = reconcile({
    donations: [don('A', 30, 1), don('B', 10, 0), don('C', 10, 0)],
    payouts: [
      { shelter: 'A', amount: 20, status: 'SUCCESS', itemId: 'A-1' },
      { shelter: 'B', amount: 10, status: 'SUCCESS', itemId: 'B-1' },
      { shelter: 'C', amount: 10, status: 'FAILED', itemId: 'C-1' },
    ],
    receipts: [{ shelter: 'A', amount: 15 }],
  });
  const by = Object.fromEntries(rows.map((r) => [r.shelter, r.flags.map((f) => f.code)]));
  assert.deepEqual(by.A.sort(), ['RECEIPT_MISMATCH', 'UNPAID']);
  assert.deepEqual(by.B, ['NO_RECEIPT']);
  assert.ok(by.C.includes('PAYOUT_FAILED'));
});

test('duplicate payout item ids are flagged', () => {
  const [r] = reconcile({
    donations: [don('A', 20, 0)],
    payouts: [{ shelter: 'A', amount: 10, status: 'SUCCESS', itemId: 'X' }, { shelter: 'A', amount: 10, status: 'SUCCESS', itemId: 'X' }],
    receipts: [{ shelter: 'A', amount: 20 }],
  });
  assert.ok(r.flags.some((f) => f.code === 'DUPLICATE_PAYOUT'));
});

test('regex fallback reads a shelter email', () => {
  const r = regexReceipt({ from: 'x@sosgalgos.example', text: 'we received 71.80 GBP, ref SOS-GALGOS' }, ['BARK-BOHOL', 'SOS-GALGOS']);
  assert.equal(r.shelter, 'SOS-GALGOS');
  assert.equal(r.amount, 71.8);
});

test('full pipeline against the mock', async () => {
  delete process.env.LLM_API_KEY;
  const out = await runPipeline({ mock: true });
  assert.equal(out.rows.length, 3);
  assert.ok(out.rows.find((r) => r.shelter === 'BARK-BOHOL').flags.some((f) => f.code === 'RECEIPT_MISMATCH'));
});

test('client refuses live PayPal', () => {
  assert.throws(() => new PayPal({ clientId: 'a', secret: 'b', baseUrl: 'https://api-m.paypal.com' }), /sandbox only/);
});
