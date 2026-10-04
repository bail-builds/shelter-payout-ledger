// Thin PayPal REST client. Works against the PayPal sandbox (api-m.sandbox.paypal.com)
// or any compatible base URL (the bundled mock server uses this too).
export class PayPal {
  constructor({ clientId, secret, baseUrl = 'https://api-m.sandbox.paypal.com' }) {
    const host = new URL(baseUrl).hostname;
    const allowed = ['api-m.sandbox.paypal.com', 'api.sandbox.paypal.com', '127.0.0.1', 'localhost'];
    if (!allowed.includes(host)) {
      throw new Error(`Refusing to talk to ${host}. This project is sandbox only (allowed: ${allowed.join(', ')}).`);
    }
    this.clientId = clientId;
    this.secret = secret;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = null;
    this.tokenExpires = 0;
  }

  async auth() {
    if (this.token && Date.now() < this.tokenExpires - 30_000) return this.token;
    const basic = Buffer.from(`${this.clientId}:${this.secret}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    this.token = j.access_token;
    this.tokenExpires = Date.now() + j.expires_in * 1000;
    return this.token;
  }

  async call(method, path, body, headers = {}) {
    const token = await this.auth();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`PayPal ${method} ${path} -> ${res.status} ${text}`);
    return text ? JSON.parse(text) : {};
  }

  // Donation intake: Orders v2, captured in one call with PayPal's sandbox test card.
  // custom_id carries the shelter code so every donation is traceable to a shelter.
  async createDonation({ amount, currency = 'USD', shelterCode, donor = 'Test Donor' }) {
    const order = await this.call('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: shelterCode,
        description: `Donation for ${shelterCode}`,
        amount: { currency_code: currency, value: Number(amount).toFixed(2) },
      }],
      payment_source: { card: { number: '4111111111111111', expiry: '2030-12', security_code: '123', name: donor } },
    }, { 'PayPal-Request-Id': `donation-${shelterCode}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    return parseDonation(order);
  }

  // Money in: read a captured donation back from PayPal (gross, PayPal fee, net).
  async getDonation(orderId) {
    return parseDonation(await this.call('GET', `/v2/checkout/orders/${orderId}`));
  }

  listDonations(orderIds) {
    return Promise.all(orderIds.map((id) => this.getDonation(id)));
  }

  // Money out: Payouts API batch, one item per shelter.
  createPayoutBatch({ batchId, items, currency = 'USD' }) {
    return this.call('POST', '/v1/payments/payouts', {
      sender_batch_header: { sender_batch_id: batchId, email_subject: 'Donation payout', email_message: 'Your donation payout' },
      items: items.map((it) => ({
        recipient_type: 'EMAIL',
        receiver: it.receiver,
        sender_item_id: it.itemId,
        note: it.note || `Payout for ${it.shelter}`,
        amount: { currency, value: Number(it.amount).toFixed(2) },
      })),
    });
  }

  async getPayoutBatch(batchId) {
    const j = await this.call('GET', `/v1/payments/payouts/${batchId}`);
    return (j.items || []).map((it) => ({
      batchId,
      itemId: it.payout_item.sender_item_id,
      shelter: (it.payout_item.note || '').replace(/^Payout for /, ''),
      amount: Number(it.payout_item.amount.value),
      currency: it.payout_item.amount.currency,
      status: it.transaction_status,
    }));
  }
}

export function parseDonation(order) {
  const unit = order.purchase_units?.[0] || {};
  const cap = unit.payments?.captures?.[0];
  const b = cap?.seller_receivable_breakdown;
  const gross = Number(b?.gross_amount?.value ?? cap?.amount?.value ?? 0);
  const fee = Number(b?.paypal_fee?.value ?? 0);
  return {
    id: order.id,
    status: cap?.status || order.status,
    date: cap?.create_time || order.create_time,
    donor: order.payment_source?.card?.name || order.payer?.name?.given_name || 'anonymous',
    shelter: unit.custom_id,
    currency: cap?.amount?.currency_code || b?.gross_amount?.currency_code,
    gross, fee, net: round2(gross - fee),
  };
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
