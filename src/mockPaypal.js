// Local stand-in for the PayPal sandbox endpoints this project uses.
// Lets you run and test the whole pipeline offline. Same paths and payload shapes.
import http from 'node:http';

export function seedData() {
  const d = (day) => `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`;
  const tx = (id, day, donor, shelter, gross, fee) => ({
    transaction_info: {
      transaction_id: id, transaction_event_code: 'T0006', transaction_initiation_date: d(day),
      transaction_amount: { currency_code: 'GBP', value: gross.toFixed(2) },
      fee_amount: { currency_code: 'GBP', value: (-fee).toFixed(2) }, custom_field: shelter,
    },
    payer_info: { email_address: `${donor.toLowerCase()}@example.com`, payer_name: { alternate_full_name: donor } },
  });
  return {
    transactions: [
      tx('TX1001', 1, 'Maria', 'SOS-GALGOS', 25, 1.1), tx('TX1002', 2, 'James', 'SOS-GALGOS', 50, 1.75),
      tx('TX1003', 2, 'Priya', 'BARK-BOHOL', 20, 0.98), tx('TX1004', 3, 'Tom', 'BARK-BOHOL', 40, 1.46),
      tx('TX1005', 4, 'Aoife', 'KITTEN-LODGE', 15, 0.78), tx('TX1006', 4, 'Chen', 'SOS-GALGOS', 10, 0.6),
      tx('TX1007', 5, 'Lena', 'KITTEN-LODGE', 30, 1.17),
    ],
    batches: {
      'B-1': [
        { payout_item: { sender_item_id: 'SOS-GALGOS-1', note: 'Payout for SOS-GALGOS', amount: { currency: 'GBP', value: '71.80' } }, transaction_status: 'SUCCESS' },
        { payout_item: { sender_item_id: 'BARK-BOHOL-1', note: 'Payout for BARK-BOHOL', amount: { currency: 'GBP', value: '57.56' } }, transaction_status: 'SUCCESS' },
        { payout_item: { sender_item_id: 'KITTEN-LODGE-1', note: 'Payout for KITTEN-LODGE', amount: { currency: 'GBP', value: '40.00' } }, transaction_status: 'UNCLAIMED' },
      ],
    },
  };
}

export function startMock({ port = 0 } = {}) {
  const state = seedData();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    let body = '';
    for await (const c of req) body += c;
    if (url.pathname === '/v1/oauth2/token') return send(200, { access_token: 'mock-token', expires_in: 3600 });
    if (!(req.headers.authorization || '').startsWith('Bearer ')) return send(401, { name: 'AUTHENTICATION_FAILURE' });
    if (url.pathname === '/v1/reporting/transactions') return send(200, { transaction_details: state.transactions });
    if (url.pathname === '/v1/payments/payouts' && req.method === 'POST') {
      const b = JSON.parse(body);
      const id = `B-${Object.keys(state.batches).length + 1}`;
      state.batches[id] = b.items.map((i) => ({
        payout_item: { sender_item_id: i.sender_item_id, note: i.note, amount: { currency: i.amount.currency, value: i.amount.value } },
        transaction_status: 'SUCCESS',
      }));
      return send(201, { batch_header: { payout_batch_id: id, batch_status: 'PENDING' } });
    }
    const m = url.pathname.match(/^\/v1\/payments\/payouts\/(.+)$/);
    if (m && state.batches[m[1]]) return send(200, { items: state.batches[m[1]] });
    if (url.pathname === '/v2/checkout/orders') return send(201, { id: 'ORDER-MOCK', status: 'CREATED' });
    send(404, { name: 'NOT_FOUND' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

export const sampleReceipts = [
  { from: 'Verity <verity@sosgalgos.example>', text: 'Hi, thanks so much - we received 71.80 GBP from you today for the greyhounds, ref SOS-GALGOS. Will put it towards vet bills.' },
  { from: 'BARK Bohol <info@bark.example>', text: 'Received your transfer of GBP 52.56. Thank you! Dr Mia' },
];
