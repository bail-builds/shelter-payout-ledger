// Tiny JSON ledger of what this app has created in PayPal: donation order IDs and payout batch IDs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const FILE = process.env.LEDGER_FILE || new URL('../data/ledger.json', import.meta.url).pathname;

export function loadLedger() {
  return existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { orders: [], batches: [], receipts: [] };
}
export function saveLedger(l) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(l, null, 2));
}
