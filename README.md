# Kursio rates

Public data for the Kursio app. It holds one file, `latest.json`, with exchange rates per 1 US dollar.
A scheduled job (`.github/workflows/rates.yml`) refreshes it every hour from Open Exchange Rates (free plan).

- The file's `t` is the time the provider took the rates, not the time of the download.
- The job needs one secret, `OXR_APP_ID`, set in this repository's Settings, Secrets and variables, Actions.
- If a fetch fails or looks wrong, the old file stays, so the app never sees bad rates.
- The free plan allows 1,000 calls a month. One call an hour is about 720.
- If the repository is quiet for 60 days GitHub may pause scheduled jobs. Open the Actions tab and re-enable it if that happens.

Address the app reads: `https://raw.githubusercontent.com/sharmaanish0001/Kursio-rates/main/latest.json`

Rates are provided by [Open Exchange Rates](https://openexchangerates.org). Indicative only, not a dealing quote.
