import { PayPal } from './paypal.js';
import { reconcile } from './reconcile.js';
import { extractReceipt, explain } from './agent.js';
import { startMock, sampleReceipts, mockOrderIds } from './mockPaypal.js';
import { loadLedger } from './ledger.js';

export async function runPipeline({ mock = false, receiptsInput } = {}) {
  let mockHandle;
  let client;
  let orderIds;
  let batchIds;
  let emails;
  if (mock) {
    mockHandle = await startMock();
    client = new PayPal({ clientId: 'mock', secret: 'mock', baseUrl: mockHandle.url });
    orderIds = mockOrderIds();
    batchIds = ['B-1'];
    emails = receiptsInput || sampleReceipts;
  } else {
    client = new PayPal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, baseUrl: process.env.PAYPAL_BASE_URL });
    const ledger = loadLedger();
    orderIds = ledger.orders.map((o) => o.id);
    batchIds = ledger.batches.map((b) => b.id);
    emails = receiptsInput || ledger.receipts;
  }
  try {
    const donations = (await client.listDonations(orderIds)).filter((d) => d.status === 'COMPLETED');
    const payouts = (await Promise.all(batchIds.map((id) => client.getPayoutBatch(id)))).flat();
    const known = [...new Set([...donations.map((d) => d.shelter), ...payouts.map((p) => p.shelter)])].filter(Boolean).sort();
    const receipts = [];
    for (const e of emails) { // sequential: friendly to free-tier rate limits
      const r = await extractReceipt({ ...e }, known);
      if (r.shelter && r.amount != null) receipts.push(r);
    }
    const rows = reconcile({ donations, payouts, receipts });
    for (const row of rows) row.explanation = await explain(row);
    return { generatedAt: new Date().toISOString(), donations, payouts, receipts, rows };
  } finally {
    mockHandle?.server.close();
  }
}
