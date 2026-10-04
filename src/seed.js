// Creates demo data in the PayPal SANDBOX: captured donations for three shelters (sandbox test card),
// then one payout batch (one item per shelter) and the emails the shelters send back.
// Writes the resulting PayPal IDs to data/ledger.json. Run: node src/seed.js
import { PayPal } from './paypal.js';
import { loadLedger, saveLedger } from './ledger.js';

const client = new PayPal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, baseUrl: process.env.PAYPAL_BASE_URL });
const ledger = loadLedger();

const plan = [['SOS-GALGOS', 25, 'Maria'], ['SOS-GALGOS', 50, 'James'], ['BARK-BOHOL', 20, 'Priya'], ['BARK-BOHOL', 40, 'Tom'], ['KITTEN-LODGE', 15, 'Aoife'], ['KITTEN-LODGE', 30, 'Lena']];
const made = [];
for (const [shelterCode, amount, donor] of plan) {
  const d = { ...(await client.createDonation({ amount, shelterCode, donor })), shelter: shelterCode };
  console.log(`donation ${d.id} ${d.shelter} gross ${d.gross} fee ${d.fee} net ${d.net} ${d.status}`);
  ledger.orders.push({ id: d.id, shelter: d.shelter });
  made.push(d);
}

const nets = {};
for (const d of made) nets[d.shelter] = (nets[d.shelter] || 0) + d.net;
const receivers = { 'SOS-GALGOS': 'shelter-sos-galgos@example.com', 'BARK-BOHOL': 'shelter-bark-bohol@example.com', 'KITTEN-LODGE': 'shelter-kitten-lodge@example.com' };
const batchId = `ledger-${Date.now()}`;
const res = await client.createPayoutBatch({
  batchId,
  items: Object.entries(nets).map(([shelter, amount]) => ({ shelter, receiver: receivers[shelter], itemId: `${shelter}-${batchId}`, amount: amount.toFixed(2) })),
});
const pid = res.batch_header.payout_batch_id;
console.log('payout batch', pid, res.batch_header.batch_status);
ledger.batches.push({ id: pid });

// The shelters' replies. BARK mistypes the amount, KITTEN-LODGE has not replied yet.
ledger.receipts = [
  { from: 'Verity <verity@sosgalgos.example>', text: `Hi, thanks so much - we received $${nets['SOS-GALGOS'].toFixed(2)} from you today for the greyhounds, ref SOS-GALGOS. Will put it towards vet bills.` },
  { from: 'BARK Bohol <info@bark.example>', text: `Received your transfer of USD ${(nets['BARK-BOHOL'] - 4).toFixed(2)}. Thank you! Dr Mia` },
];
saveLedger(ledger);
console.log('ledger saved');
