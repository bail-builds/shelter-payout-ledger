import http from 'node:http';
import { readFileSync } from 'node:fs';
import { runPipeline } from './run.js';

const port = Number(process.env.PORT || 3000);
const mock = process.env.USE_MOCK === '1' || !process.env.PAYPAL_CLIENT_ID;
const page = readFileSync(new URL('../public/index.html', import.meta.url));

http.createServer(async (req, res) => {
  if (req.url === '/api/reconcile') {
    try {
      const out = await runPipeline({ mock });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...out, mode: mock ? 'mock' : 'paypal-sandbox' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Reconciliation failed. Check the server log.' }));
      console.error('reconcile error:', e.message);
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(page);
}).listen(port, '127.0.0.1', () => console.log(`Shelter Payout Ledger on http://localhost:${port} (${mock ? 'mock PayPal' : 'PayPal sandbox'})`));
