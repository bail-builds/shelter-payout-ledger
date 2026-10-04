import { PayPal } from './paypal.js';
import { reconcile } from './reconcile.js';
import { extractReceipt, explain } from './agent.js';
import { startMock, sampleReceipts } from './mockPaypal.js';

export async function runPipeline({ mock = false, start = '2026-10-01T00:00:00Z', end = '2026-12-31T23:59:59Z', batchIds, receiptsInput } = {}) {
  let mockHandle;
  let client;
  if (mock) {
    mockHandle = await startMock();
    client = new PayPal({ clientId: 'mock', secret: 'mock', baseUrl: mockHandle.url });
  } else {
    client = new PayPal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, baseUrl: process.env.PAYPAL_BASE_URL });
  }
  try {
    const donations = await client.listDonations({ start, end });
    const ids = batchIds || (process.env.PAYOUT_BATCH_IDS || (mock ? 'B-1' : '')).split(',').filter(Boolean);
    const payouts = (await Promise.all(ids.map((id) => client.getPayoutBatch(id)))).flat();
    const known = [...new Set([...donations.map((d) => d.shelter), ...payouts.map((p) => p.shelter)])].sort();
    const emails = receiptsInput || (mock ? sampleReceipts : []);
    const receipts = (await Promise.all(emails.map((e) => extractReceipt({ ...e }, known)))).filter((r) => r.shelter && r.amount != null);
    const rows = reconcile({ donations, payouts, receipts });
    for (const row of rows) row.explanation = await explain(row);
    return { generatedAt: new Date().toISOString(), donations, payouts, receipts, rows };
  } finally {
    mockHandle?.server.close();
  }
}
