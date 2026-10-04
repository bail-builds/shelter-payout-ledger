import { round2 } from './paypal.js';

// donations: [{id, shelter, net, gross, fee, currency}]
// payouts:   [{shelter, amount, status, itemId, batchId}]
// receipts:  [{shelter, amount, currency}]   (extracted by the agent from shelter emails)
// Returns one row per shelter with flags. Pure function, easy to test.
export function reconcile({ donations, payouts, receipts }) {
  const shelters = new Set([...donations, ...payouts, ...receipts].map((x) => x.shelter).filter(Boolean));
  const rows = [];
  for (const shelter of [...shelters].sort()) {
    const d = donations.filter((x) => x.shelter === shelter);
    const p = payouts.filter((x) => x.shelter === shelter);
    const r = receipts.filter((x) => x.shelter === shelter);
    const owed = round2(d.reduce((s, x) => s + x.net, 0));
    const settled = round2(p.filter((x) => x.status === 'SUCCESS').reduce((s, x) => s + x.amount, 0));
    const inFlight = round2(p.filter((x) => ['PENDING', 'ONHOLD', 'UNCLAIMED'].includes(x.status)).reduce((s, x) => s + x.amount, 0));
    const failed = round2(p.filter((x) => ['FAILED', 'RETURNED', 'BLOCKED', 'DENIED', 'REFUNDED'].includes(x.status)).reduce((s, x) => s + x.amount, 0));
    const acknowledged = round2(r.reduce((s, x) => s + x.amount, 0));
    const flags = [];
    const gap = round2(owed - settled - inFlight);
    if (gap > 0.005) flags.push({ code: 'UNPAID', detail: `${gap.toFixed(2)} donated but not yet paid out` });
    if (gap < -0.005) flags.push({ code: 'OVERPAID', detail: `${(-gap).toFixed(2)} paid out beyond donations received` });
    if (inFlight > 0) flags.push({ code: 'PAYOUT_NOT_SETTLED', detail: `${inFlight.toFixed(2)} still pending/unclaimed` });
    if (failed > 0) flags.push({ code: 'PAYOUT_FAILED', detail: `${failed.toFixed(2)} failed or returned` });
    if (settled > 0 && r.length === 0) flags.push({ code: 'NO_RECEIPT', detail: 'paid out but the shelter has not confirmed receipt' });
    if (r.length > 0 && Math.abs(acknowledged - settled) > 0.005) {
      flags.push({ code: 'RECEIPT_MISMATCH', detail: `shelter says ${acknowledged.toFixed(2)}, ledger says ${settled.toFixed(2)} settled (diff ${round2(settled - acknowledged).toFixed(2)})` });
    }
    const ids = p.map((x) => x.itemId);
    if (new Set(ids).size !== ids.length) flags.push({ code: 'DUPLICATE_PAYOUT', detail: 'same payout item id appears twice' });
    rows.push({
      shelter, donations: d.length, gross: round2(d.reduce((s, x) => s + x.gross, 0)), fees: round2(d.reduce((s, x) => s + x.fee, 0)),
      owed, settled, inFlight, failed, acknowledged, flags, status: flags.length ? 'ATTENTION' : 'RECONCILED',
    });
  }
  return rows;
}
