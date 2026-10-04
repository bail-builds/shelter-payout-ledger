// Thin PayPal REST client. Works against the PayPal sandbox (api-m.sandbox.paypal.com)
// or any compatible base URL (the bundled mock server uses this too).
export class PayPal {
  constructor({ clientId, secret, baseUrl = 'https://api-m.sandbox.paypal.com' }) {
    if (baseUrl.includes('api-m.paypal.com') && !baseUrl.includes('sandbox')) {
      throw new Error('Refusing to run against live PayPal. This project is sandbox only.');
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

  async call(method, path, body) {
    const token = await this.auth();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`PayPal ${method} ${path} -> ${res.status} ${text}`);
    return text ? JSON.parse(text) : {};
  }

  // Donation intake: Orders v2. custom_id carries the shelter code.
  createDonationOrder({ amount, currency = 'GBP', shelterCode, donor }) {
    return this.call('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: shelterCode,
        description: `Donation for ${shelterCode}${donor ? ` from ${donor}` : ''}`,
        amount: { currency_code: currency, value: Number(amount).toFixed(2) },
      }],
    });
  }

  // Money in: captured donations, via the Transaction Search (reporting) API.
  async listDonations({ start, end }) {
    const q = new URLSearchParams({ start_date: start, end_date: end, fields: 'all', page_size: '100' });
    const j = await this.call('GET', `/v1/reporting/transactions?${q}`);
    return (j.transaction_details || [])
      .filter((t) => t.transaction_info?.transaction_event_code?.startsWith('T00') && t.transaction_info?.custom_field)
      .map((t) => {
        const i = t.transaction_info;
        const gross = Number(i.transaction_amount.value);
        const fee = Math.abs(Number(i.fee_amount?.value || 0));
        return {
          id: i.transaction_id,
          date: i.transaction_initiation_date,
          donor: t.payer_info?.payer_name?.alternate_full_name || t.payer_info?.email_address || 'anonymous',
          shelter: i.custom_field,
          currency: i.transaction_amount.currency_code,
          gross, fee, net: round2(gross - fee),
        };
      });
  }

  // Money out: Payouts API batch, one item per shelter.
  createPayoutBatch({ batchId, items, currency = 'GBP' }) {
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

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
