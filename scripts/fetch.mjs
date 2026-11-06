// Fetches the latest exchange rates (per 1 US dollar) from Open Exchange Rates and writes latest.json.
// Needs the secret OXR_APP_ID. If anything looks wrong it stops WITHOUT changing latest.json,
// so the app keeps the last good rates instead of showing bad ones.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const id = process.env.OXR_APP_ID;
if (!id) { console.error('OXR_APP_ID is not set'); process.exit(1); }
const base = process.env.OXR_URL || 'https://openexchangerates.org/api/latest.json';
const url = base + (base.includes('?') ? '&' : '?') + 'app_id=' + encodeURIComponent(id);

const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), 20000);
let j;
try {
  const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
  if (!r.ok) { console.error('Open Exchange Rates answered HTTP ' + r.status); process.exit(1); }
  j = await r.json();
} catch (e) { console.error('Could not reach Open Exchange Rates: ' + e.message); process.exit(1); }
clearTimeout(timer);

const rates = j && j.rates;
const ts = j && Number(j.timestamp);
if (!rates || typeof rates !== 'object' || !(ts > 1.6e9)) { console.error('Unexpected answer shape'); process.exit(1); }
if (j.base && j.base !== 'USD') { console.error('Base is not USD: ' + j.base); process.exit(1); }

const out = {};
for (const [k, v] of Object.entries(rates)) {
  if (/^[A-Z]{3}$/.test(k) && Number.isFinite(v) && v > 0) out[k] = v;
}
for (const must of ['EUR', 'GBP', 'JPY', 'INR']) {
  if (!out[must]) { console.error('Missing ' + must); process.exit(1); }
}
if (Object.keys(out).length < 100) { console.error('Too few currencies: ' + Object.keys(out).length); process.exit(1); }

// Guard against a wild jump in the main pairs compared with the last good file.
if (existsSync('latest.json')) {
  try {
    const prev = JSON.parse(readFileSync('latest.json', 'utf8')).rates || {};
    for (const k of ['EUR', 'GBP', 'JPY', 'INR']) {
      if (prev[k] && Math.abs(out[k] / prev[k] - 1) > 0.15) { console.error('Suspicious jump in ' + k + ', not publishing'); process.exit(1); }
    }
  } catch { /* an unreadable old file is simply replaced */ }
}

const t = new Date(ts * 1000).toISOString();
const text = JSON.stringify({ t, base: 'USD', source: 'Open Exchange Rates', rates: out }) + '\n';
writeFileSync('latest.json', text);
console.log('Wrote ' + Object.keys(out).length + ' rates for ' + t);
