# Shelter Payout Ledger

An AI agent that keeps small donation programmes honest. Supporters donate through PayPal, a batch of payouts goes to partner animal shelters, and the shelters email back whatever they say they received. This project checks those three things against each other and tells you, in plain language, which shelter needs a follow-up and what to say to them.

Built for the PayPal AI Hackathon. **PayPal sandbox only. No real money is ever moved** (the client refuses to start against live PayPal).

## What it does

1. **Money in:** donations are PayPal Orders v2 orders captured in the sandbox (`POST /v2/checkout/orders`, sandbox test card). The shelter code travels in `custom_id`. The reconciler reads each order back (`GET /v2/checkout/orders/{id}`) to get gross, PayPal fee and net, so fees are accounted for.
2. **Money out:** reads payout batches from the Payouts API (`/v1/payments/payouts/{batch_id}`), one item per shelter.
3. **Shelter side:** the AI agent reads messy emails from shelters and pulls out which shelter said it received what amount.
4. **Reconcile:** per shelter it works out owed vs settled vs in flight vs acknowledged and flags: `UNPAID`, `OVERPAID`, `PAYOUT_NOT_SETTLED`, `PAYOUT_FAILED`, `NO_RECEIPT`, `RECEIPT_MISMATCH`, `RECEIPT_BEFORE_SETTLED`, `DUPLICATE_PAYOUT`.
5. **Explain:** for each exception the agent writes a short explanation, the next action, and a draft email to the shelter that asks only for what is needed.

A small dashboard shows the result.

## Run it (no keys needed)

```bash
git clone https://github.com/bail-builds/shelter-payout-ledger
cd shelter-payout-ledger
npm test              # unit tests + full pipeline against the bundled PayPal mock
node src/cli.js --mock  # prints the reconciliation
USE_MOCK=1 npm start   # dashboard on http://localhost:3000
```

Node 20+ and no dependencies.

## Run it against the PayPal sandbox

Create a Sandbox app at developer.paypal.com (Apps & Credentials, Sandbox), then:

```bash
export PAYPAL_CLIENT_ID=...
export PAYPAL_CLIENT_SECRET=...
node src/seed.js        # creates sandbox donations + a payout batch, saves IDs to data/ledger.json
node src/cli.js         # reconcile live sandbox data
npm start               # dashboard on the live data
```

`PAYPAL_BASE_URL` defaults to `https://api-m.sandbox.paypal.com`.

## The AI part

`src/agent.js` talks to any OpenAI-compatible chat endpoint (Gemini by default, OpenAI or a local model also work):

```bash
export LLM_API_KEY=...
export LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai   # default
export LLM_MODEL=gemini-3.5-flash                                              # default
# free-tier quotas are small; if you get 429s, try: export LLM_MODEL=gemini-3.1-flash-lite
```

The model extracts structured receipts from free-text emails and writes the explanations and follow-up drafts. It never does the arithmetic: the reconcile step is plain deterministic code (`src/reconcile.js`), so the numbers can be trusted and tested. Without a key the agent falls back to a regex reader and templates, and the output is labelled `fallback` so you can tell.

## Layout

- `src/paypal.js` PayPal REST client (OAuth, Orders, Transaction Search, Payouts)
- `src/mockPaypal.js` offline stand-in with the same endpoints
- `src/seed.js` creates sandbox donations and a payout batch
- `src/ledger.js` remembers the PayPal order and batch IDs
- `src/reconcile.js` pure reconciliation logic
- `src/agent.js` LLM extraction and explanations
- `src/server.js`, `public/index.html` dashboard

## Licence

MIT. Code written with AI assistance during the hackathon period.
