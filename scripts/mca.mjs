// Downloads Indian public companies from the Ministry of Corporate Affairs' open data (data.gov.in)
// and writes mca-companies.json with a size band for each. data.gov.in only answers Indian connections,
// so this runs on the self-hosted runner. The service returns 10 records per call.
//   Listed companies: all kept (small, or mid if paid-up capital is at least Rs 100 crore)
//   Unlisted public companies: kept only if paid-up capital is at least Rs 10 crore
//   Paid-up capital is a rough size guide. It never makes a company "big".
import { writeFileSync } from 'node:fs';
import { pretty } from './companies.mjs';

const key = process.env.DATAGOV_KEY;
const RES = '4dbe5667-7b6b-41d7-82af-211562424d9a';
const CRORE = 1e7, MID = 100 * CRORE, SMALL = 10 * CRORE;
const SLICES = [
  { name: 'listed', f: { CompanyStatus: 'Active', Listingstatus: 'Listed' }, all: true },
  { name: 'unlisted public', f: { CompanyStatus: 'Active', CompanyClass: 'Public', Listingstatus: 'Unlisted' }, all: false }
];

export async function page(f, offset, fetchFn = fetch) {
  const p = new URLSearchParams({ 'api-key': key || 'x', format: 'json', offset: String(offset), limit: '10' });
  for (const [k, v] of Object.entries(f)) p.set('filters[' + k + ']', v);
  let last;
  for (let a = 0; a < 6; a++) {
    try {
      const r = await fetchFn('https://api.data.gov.in/resource/' + RES + '?' + p, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.status && j.status !== 'ok') throw new Error('API says ' + j.status + ' ' + (j.message || ''));
      return j;
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 1000 * 2 ** a)); }
  }
  throw new Error('Gave up at offset ' + offset + ': ' + String(last && last.message).replace(key || '\u0000', '***'));
}
export function band(paidUp, listed) {
  if (!(paidUp > 0)) return listed ? 's' : '';
  if (paidUp >= MID) return 'm';
  if (paidUp >= SMALL || listed) return 's';
  return '';
}

export async function run(fetchFn = fetch, conc = 3) {
  const out = [], seen = new Set();
  for (const s of SLICES) {
    const first = await page(s.f, 0, fetchFn); const total = Number(first.total) || 0;
    console.log(s.name + ': ' + total + ' companies, about ' + Math.ceil(total / 10) + ' calls');
    let next = 0, done = 0; const offsets = []; for (let o = 0; o < total; o += 10) offsets.push(o);
    const take = recs => { for (const r of recs || []) {
      const cin = r.CIN || r.CompanyName; if (seen.has(cin)) continue; seen.add(cin);
      const b = band(parseFloat(r.PaidupCapital), s.all); if (!b) continue;
      const nm = pretty(r.CompanyName || ''); if (!nm) continue;
      out.push([nm, 'India', b, Math.round(parseFloat(r.PaidupCapital) / CRORE)]);
    } };
    take(first.records);
    async function worker() {
      while (true) {
        const i = next++; if (i >= offsets.length) return;
        if (offsets[i] === 0) continue;
        take((await page(s.f, offsets[i], fetchFn)).records);
        if (++done % 500 === 0) console.log('  ' + s.name + ': ' + done + ' of ' + offsets.length + ' pages, kept ' + out.length);
      }
    }
    await Promise.all(Array.from({ length: conc }, worker));
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('mca.mjs')) {
  if (!key) { console.error('No DATAGOV_KEY'); process.exit(1); }
  try {
    const out = await run();
    console.log('Kept ' + out.length + ' companies');
    if (out.length < 3000) throw new Error('Too few companies, not saving');
    writeFileSync('mca-companies.json', JSON.stringify({ t: Date.now(), source: 'MCA company master data via data.gov.in', n: out }));
  } catch (e) { console.error('Failed: ' + e.message); process.exit(1); }
}
