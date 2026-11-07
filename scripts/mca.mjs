// Downloads large Indian companies from MCA's company master data on data.gov.in (it only answers Indian connections,
// so this runs on a computer in India) and writes companies-mca.json: names with a size band from paid-up capital.
//   paid-up capital >= Rs 100 crore -> m (mid)      >= Rs 10 crore -> s (small)      lower -> not kept
// MCA companies are never marked big: paid-up capital is only a rough measure of size.
// The download can take about an hour. Progress is saved after every batch, so a sleep or restart resumes where it stopped.
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pretty } from './companies.mjs';

const KEY = process.env.DATAGOV_KEY;
const RES = '4dbe5667-7b6b-41d7-82af-211562424d9a';
const DIR = process.env.MCA_CACHE || 'mca-cache';
const PAR = 1, PAGE = 10;
let gap = Number(process.env.MCA_GAP_MS || 800);   // pause between calls; grows when the service says 'slow down'
let okRun = 0, waitedFor429 = 0;
const CR = 1e7;
const MID = 100 * CR, SMALL = 10 * CR;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s).split(KEY || '\u0000').join('***');

async function call(filters, offset, tries = 6) {
  const p = new URLSearchParams({ 'api-key': KEY, format: 'json', offset: String(offset), limit: String(PAGE) });
  for (const [k, v] of Object.entries(filters)) p.set('filters[' + k + ']', v);
  let last, slow = 0;
  for (let t = 0; t < tries; ) {
    await sleep(gap);
    try {
      const r = await fetch('https://api.data.gov.in/resource/' + RES + '?' + p, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.records)) { if (++okRun >= 300) { okRun = 0; gap = Math.max(400, Math.round(gap * 0.9)); } return j; }
        last = 'no records field';
      } else if (r.status === 429 || r.status === 503) {
        okRun = 0; gap = Math.min(5000, Math.round(gap * 1.5)); slow++;
        const ra = Number(r.headers.get('retry-after')); const wait = (ra > 0 ? ra : 60) * 1000;
        waitedFor429 += wait; console.log('Told to slow down (HTTP ' + r.status + '), waiting ' + Math.round(wait / 1000) + 's, gap now ' + gap + 'ms');
        if (slow > 40) throw new Error('Still rate limited after many waits');
        await sleep(wait); continue;
      } else last = 'HTTP ' + r.status;
    } catch (e) { if (/Still rate/.test(e.message)) throw e; last = e.message; }
    t++; await sleep(Math.min(60000, 1500 * 2 ** t));
  }
  throw new Error(clean('Gave up at offset ' + offset + ': ' + last));
}

const base = { CompanyStatus: 'Active' };
const SLICES = [
  { name: 'public', filters: { ...base, CompanyClass: 'Public' } }
];
// Extra slices are found by trying likely names; one that exists and is a manageable size is added.
const CANDIDATES = ['Subsidiary of Foreign Company', 'Subsidiary of foreign company', 'Union Govt company', 'Union govt company', 'State Govt company', 'State govt company'];

export function band(paid) { return paid >= MID ? 'm' : paid >= SMALL ? 's' : ''; }

async function main() {
  if (!KEY) throw new Error('DATAGOV_KEY is not set');
  mkdirSync(DIR, { recursive: true });
  for (const c of CANDIDATES) {
    try {
      const j = await call({ ...base, CompanySubCategory: c }, 0, 2);
      console.log('slice candidate', JSON.stringify(c), 'total', j.total);
      if (j.total > 0 && j.total <= 60000) SLICES.push({ name: 'sub-' + c.toLowerCase().replace(/[^a-z]+/g, '-'), filters: { ...base, CompanySubCategory: c } });
    } catch (e) { console.log('slice candidate', c, 'failed:', e.message); }
  }
  const stFile = join(DIR, 'state.json');
  const state = existsSync(stFile) ? JSON.parse(readFileSync(stFile, 'utf8')) : {};
  const save = () => { writeFileSync(stFile + '.tmp', JSON.stringify(state)); renameSync(stFile + '.tmp', stFile); };
  const seen = new Set();
  for (const s of SLICES) {
    if (seen.has(s.name)) continue; seen.add(s.name);
    const st = state[s.name] || (state[s.name] = { offset: 0, total: null, done: false, started: Date.now() });
    const file = join(DIR, s.name + '.ndjson');
    if (st.done && Date.now() - st.started < 6 * 864e5) { console.log(s.name, 'already complete'); continue; }
    if (st.done) { st.offset = 0; st.done = false; st.started = Date.now(); writeFileSync(file, ''); }
    if (st.offset === 0) writeFileSync(file, '');
    const first = await call(s.filters, st.offset);
    st.total = first.total; console.log(s.name, 'total', st.total, 'resuming at', st.offset);
    let t0 = Date.now(), lastLog = 0;
    while (st.offset < st.total) {
      const offs = []; for (let k = 0; k < PAR && st.offset + k * PAGE < st.total; k++) offs.push(st.offset + k * PAGE);
      const pages = await Promise.all(offs.map(o => call(s.filters, o)));
      let lines = '';
      for (const pg of pages) for (const r of pg.records) {
        const paid = parseFloat(r.PaidupCapital); const b = band(paid);
        if (b && r.CompanyName) lines += JSON.stringify([r.CompanyName, Math.round(paid), r.Listingstatus || '', b]) + '\n';
      }
      if (lines) appendFileSync(file, lines);
      st.offset += offs.length * PAGE; save();
      if (Date.now() - lastLog > 300000) { lastLog = Date.now(); console.log(s.name, st.offset + ' / ' + st.total, 'in', Math.round((Date.now() - t0) / 60000), 'min, gap', gap, 'ms'); }
    }
    st.done = true; save(); console.log(s.name, 'finished');
  }
  // Build the output from every finished slice, biggest paid-up capital first.
  const rows = new Map();
  for (const s of SLICES) {
    const file = join(DIR, s.name + '.ndjson'); if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue; const [n, paid, , b] = JSON.parse(line); const name = pretty(n);
      const k = name.toLowerCase(); if (!rows.has(k) || rows.get(k)[1] < paid) rows.set(k, [name, paid, b]);
    }
  }
  const out = [...rows.values()].sort((a, b) => b[1] - a[1]).slice(0, 25000).map(r => [r[0], 'India', r[2]]);
  console.log('companies kept:', out.length, 'mid:', out.filter(r => r[2] === 'm').length, 'small:', out.filter(r => r[2] === 's').length);
  if (out.length < 500) throw new Error('Too few companies (' + out.length + '), not publishing');
  const body = JSON.stringify({ t: Date.now(), source: 'MCA company master data (data.gov.in)', n: out });
  writeFileSync(join(DIR, 'companies-mca.json'), body);
  await publish(body);
}

async function publish(body) {
  const tok = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY || 'sharmaanish0001/Kursio-rates';
  if (!tok) { console.log('No GITHUB_TOKEN, file kept locally only'); return; }
  const h = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'User-Agent': 'kursio-mca' };
  const url = 'https://api.github.com/repos/' + repo + '/contents/companies-mca.json';
  let sha; const g = await fetch(url, { headers: h }); if (g.ok) sha = (await g.json()).sha;
  const r = await fetch(url, { method: 'PUT', headers: h, body: JSON.stringify({ message: 'MCA company list update', content: Buffer.from(body).toString('base64'), sha }) });
  if (!r.ok) throw new Error('Could not publish: HTTP ' + r.status + ' ' + clean((await r.text()).slice(0, 200)));
  console.log('Published companies-mca.json');
}

if (process.argv[1] && process.argv[1].endsWith('mca.mjs')) main().catch(e => { console.error('Not updated: ' + clean(e.message)); process.exit(1); });
