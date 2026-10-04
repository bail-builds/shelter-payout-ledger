// Local stand-in for the PayPal sandbox endpoints this project uses (same paths and payload shapes).
// Lets you run and test the whole pipeline offline.
import http from 'node:http';

const FEE = (g) => Math.round((g * 0.0349 + 0.49) * 100) / 100; // roughly PayPal's card rate

function completedOrder(id, shelter, gross, donor, currency = 'USD') {
  const fee = FEE(gross);
  return {
    id, status: 'COMPLETED', payment_source: { card: { name: donor } },
    purchase_units: [{ custom_id: shelter, payments: { captures: [{
      id: `CAP-${id}`, status: 'COMPLETED', create_time: '2026-10-04T12:00:00Z', amount: { currency_code: currency, value: gross.toFixed(2) },
      seller_receivable_breakdown: { gross_amount: { currency_code: currency, value: gross.toFixed(2) }, paypal_fee: { currency_code: currency, value: fee.toFixed(2) }, net_amount: { currency_code: currency, value: (gross - fee).toFixed(2) } },
    }] } }],
  };
}

export function seedData() {
  const orders = {};
  [['SOS-GALGOS', 25, 'Maria'], ['SOS-GALGOS', 50, 'James'], ['BARK-BOHOL', 20, 'Priya'], ['BARK-BOHOL', 40, 'Tom'], ['KITTEN-LODGE', 15, 'Aoife'], ['SOS-GALGOS', 10, 'Chen'], ['KITTEN-LODGE', 30, 'Lena']]
    .forEach(([shelter, gross, donor], i) => { orders[`ORD${1001 + i}`] = completedOrder(`ORD${1001 + i}`, shelter, gross, donor); });
  const net = (code) => Object.values(orders).filter((o) => o.purchase_units[0].custom_id === code)
    .reduce((t, o) => t + Number(o.purchase_units[0].payments.captures[0].seller_receivable_breakdown.net_amount.value), 0).toFixed(2);
  const item = (code, status) => ({ payout_item: { sender_item_id: `${code}-1`, note: `Payout for ${code}`, amount: { currency: 'USD', value: net(code) } }, transaction_status: status });
  return { orders, batches: { 'B-1': [item('SOS-GALGOS', 'SUCCESS'), item('BARK-BOHOL', 'SUCCESS'), item('KITTEN-LODGE', 'UNCLAIMED')] } };
}

export function mockOrderIds() { return Object.keys(seedData().orders); }

export function startMock({ port = 0 } = {}) {
  const state = seedData();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    let body = '';
    for await (const c of req) body += c;
    if (url.pathname === '/v1/oauth2/token') return send(200, { access_token: 'mock-token', expires_in: 3600 });
    if (!(req.headers.authorization || '').startsWith('Bearer ')) return send(401, { name: 'AUTHENTICATION_FAILURE' });
    if (url.pathname === '/v2/checkout/orders' && req.method === 'POST') {
      const b = JSON.parse(body);
      const u = b.purchase_units[0];
      const id = `ORD${1001 + Object.keys(state.orders).length}`;
      state.orders[id] = completedOrder(id, u.custom_id, Number(u.amount.value), b.payment_source?.card?.name || 'Donor', u.amount.currency_code);
      return send(201, state.orders[id]);
    }
    const o = url.pathname.match(/^\/v2\/checkout\/orders\/(.+)$/);
    if (o && state.orders[o[1]]) return send(200, state.orders[o[1]]);
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
    send(404, { name: 'NOT_FOUND' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

// What the shelters wrote back (messy on purpose).
export const sampleReceipts = [
  { from: 'Verity <verity@sosgalgos.example>', text: 'Hi, thanks so much - we received $80.56 from you today for the greyhounds, ref SOS-GALGOS. Will put it towards vet bills.' },
  { from: 'BARK Bohol <info@bark.example>', text: 'Received your transfer of USD 52.40. Thank you! Dr Mia' },
];
