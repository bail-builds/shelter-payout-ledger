# Security notes

- **Sandbox only.** The PayPal client refuses any host except the PayPal sandbox or localhost. There is no live-payment code path.
- **No secrets in the repo.** Keys come from environment variables (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `LLM_API_KEY`). `.env` and `data/ledger.json` are gitignored. Nothing logs credentials.
- **No dependencies.** Zero npm packages, so no supply-chain exposure.
- **Dashboard** binds to 127.0.0.1 only and HTML-escapes every value it renders (shelter emails and model output are untrusted text).
- **LLM safety.** The model never does arithmetic. It can only extract a receipt for a known shelter code and a numeric amount (validated), and write text for a human to read. Email content is treated as untrusted and the model is told to ignore instructions inside it. Nothing the model writes is sent anywhere automatically.
- **Test card.** `createDonation` uses PayPal's published sandbox test card number, which only works in the sandbox.
