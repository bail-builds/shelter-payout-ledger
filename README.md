# Shelter Payout Ledger

An AI agent that keeps small donation programmes honest. Supporters donate through PayPal, a batch of payouts goes to partner animal shelters, and the shelters email back whatever they say they received. This project checks those three things against each other and tells you, in plain language, which shelter needs a follow-up and what to say to them.

Built for the PayPal AI Hackathon. **PayPal sandbox only. No real money is ever moved** (the client refuses to start against live PayPal).

## What it does

1. **Money in:** reads captured donations from the PayPal Transaction Search API (`/v1/reporting/transactions`). Each donation carries the shelter code in `custom_id` (set when the order is created with the Orders v2 API).
2. **Money out:** reads payout batches from the Payouts API (`/v1/payments/payouts/{batch_id}`), one item per shelter.
3. **Shelter side:** the AI agent reads messy emails from shelters and pulls out which shelter said it received what amount.
4. **Reconcile:** per shelter it works out owed vs settled vs in flight vs acknowledged and flags: `UNPAID`, `OVERPAID`, `PAYOUT_NOT_SETTLED`, `PAYOUT_FAILED`, `NO_RECEIPT`, `RECEIPT_MISMATCH`, `DUPLICATE_PAYOUT`.
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
export PAYOUT_BATCH_IDS=PAYOUT_BATCH_ID_1,PAYOUT_BATCH_ID_2   # batches to check
npm start
```

`PAYPAL_BASE_URL` defaults to `https://api-m.sandbox.paypal.com`.

## The AI part

`src/agent.js` talks to any OpenAI-compatible chat endpoint (Gemini by default, OpenAI or a local model also work):

```bash
export LLM_API_KEY=...
export LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai   # default
export LLM_MODEL=gemini-3.5-flash                                              # default
```

The model extracts structured receipts from free-text emails and writes the explanations and follow-up drafts. It never does the arithmetic: the reconcile step is plain deterministic code (`src/reconcile.js`), so the numbers can be trusted and tested. Without a key the agent falls back to a regex reader and templates, and the output is labelled `fallback` so you can tell.

## Layout

- `src/paypal.js` PayPal REST client (OAuth, Orders, Transaction Search, Payouts)
- `src/mockPaypal.js` offline stand-in with the same endpoints
- `src/reconcile.js` pure reconciliation logic
- `src/agent.js` LLM extraction and explanations
- `src/server.js`, `public/index.html` dashboard

## Licence

MIT. Code written with AI assistance during the hackathon period.
