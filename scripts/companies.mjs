// Builds companies.json: names of Indian listed companies, each with a size band.
//   b = big   (Nifty 100, the 100 largest by market value)
//   m = mid   (Nifty Midcap 150)
//   s = small (Nifty Smallcap 250, Microcap 250, and every other NSE or BSE listed company)
// Every source is optional except the Nifty 100 list. If that one fails, the old file is kept.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', Accept: 'text/csv,application/json,*/*' };

export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const SMALL_WORDS = new Set(['of', 'and', 'the', 'for', 'in', 'to', 'on', 'de']);
const KEEP_UPPER = new Set(['ABB', 'ACC', 'BSE', 'NSE', 'HDFC', 'ICICI', 'IDFC', 'IDBI', 'SBI', 'LIC', 'ITC', 'NTPC', 'ONGC', 'GAIL', 'NMDC', 'BHEL', 'HCL', 'TCS', 'UPL', 'SRF', 'DLF', 'REC', 'IRCON', 'RITES', 'CESC', 'MRF', 'KEC', 'IFCI', 'PTC', 'NBCC', 'SJVN', 'NHPC', 'HUDCO', 'IIFL', 'LTIMindtree', 'UTI', 'AU', 'IT', 'IRB', 'JK', 'TVS', 'VST', 'GMR', 'GVK', 'KPIT', 'CG', 'BEML', 'HEG', 'PNB', 'RBL', 'DCB', 'CSB', 'MCX', 'CDSL', 'NDTV', 'BF', 'DB', 'GE', 'KRBL', 'LT', 'MTAR', 'NLC', 'OIL', 'PVR', 'SAIL', 'SKF', 'TTK', 'ZEE', 'AIA', 'IFB', 'JSW', 'VIP', 'GIC', 'CRISIL', 'ICRA', 'IEX', 'ISGEC', 'NIIT', 'HFCL', 'HLE', 'BLS', 'BSL', 'GHCL', 'JBM', 'JM', 'JSL', 'KNR', 'LTTS', 'RPG', 'RVNL', 'SIS', 'TBO', 'TIPS', 'TV18', 'UCO', 'VA', 'AAVAS', 'AGI', 'APL', 'CMS', 'CCL', 'DCM', 'DCW', 'EID', 'EIH', 'FDC', 'GNFC', 'GSFC', 'GPIL', 'HBL', 'HG', 'IGL', 'MMTC', 'MOIL', 'NCC', 'PCBL', 'PSP', 'RHI', 'RCF', 'SJS', 'SPARC', 'STC', 'SUDARSCHEM', 'TCI', 'TRIL', 'TTML', 'VRL', 'WPIL']);
export function pretty(name) {
  let n = String(name).replace(/\s+/g, ' ').trim();
  n = n.replace(/\s*\(?\b(limited|ltd\.?)\)?\s*$/i, '').replace(/\s*\bpvt\.?\s*$/i, '').trim();
  n = n.replace(/\s+(private|pvt\.?)\s*$/i, '').trim();
  if (n === n.toUpperCase() || n === n.toLowerCase()) {
    n = n.toLowerCase().split(' ').map((w, i) => {
      if (KEEP_UPPER.has(w.toUpperCase())) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.replace(/(^|[-.(&])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    }).join(' ');
  }
  return n;
}
const key = n => n.toLowerCase().replace(/&/g, ' and ').replace(/\b(limited|ltd|pvt|private|inc|corp|company|co)\b/g, ' ').replace(/[^a-z0-9]+/g, '');

async function getText(urls, tries = 3) {
  for (const u of urls) {
    for (let k = 0; k < tries; k++) {
      try {
        const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) });
        if (r.ok) { const t = await r.text(); if (t.length > 200) return t; }
        console.log('  ' + u + ' -> HTTP ' + r.status);
      } catch (e) { console.log('  ' + u + ' -> ' + e.message); }
      await new Promise(r => setTimeout(r, 1500 * (k + 1)));
    }
  }
  return null;
}
function namesFrom(csv, nameHeaders) {
  const rows = parseCsv(csv); if (rows.length < 2) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  let col = head.findIndex(h => nameHeaders.some(x => h === x));
  if (col < 0) col = head.findIndex(h => nameHeaders.some(x => h.includes(x)));
  if (col < 0) return [];
  return rows.slice(1).map(r => (r[col] || '').trim()).filter(Boolean);
}

const NIFTY = 'https://www.niftyindices.com/IndexConstituent/';
const SOURCES = [
  { id: 'n100', band: 'b', must: true, urls: [NIFTY + 'ind_nifty100list.csv', 'https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv', 'https://archives.nseindia.com/content/indices/ind_nifty100list.csv'] },
  { id: 'mid150', band: 'm', urls: [NIFTY + 'ind_niftymidcap150list.csv', 'https://nsearchives.nseindia.com/content/indices/ind_niftymidcap150list.csv', 'https://archives.nseindia.com/content/indices/ind_niftymidcap150list.csv'] },
  { id: 'small250', band: 's', urls: [NIFTY + 'ind_niftysmallcap250list.csv', 'https://nsearchives.nseindia.com/content/indices/ind_niftysmallcap250list.csv', 'https://archives.nseindia.com/content/indices/ind_niftysmallcap250list.csv'] },
  { id: 'micro250', band: 's', urls: [NIFTY + 'ind_niftymicrocap250_list.csv', 'https://nsearchives.nseindia.com/content/indices/ind_niftymicrocap250_list.csv'] },
  { id: 'nse-all', band: 's', heads: ['name of company'], urls: ['https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', 'https://archives.nseindia.com/content/equities/EQUITY_L.csv'] }
];

export async function build() {
  const out = [], seen = new Set(), report = {};
  for (const s of SOURCES) {
    const text = await getText(s.urls);
    if (!text) { report[s.id] = 'FAILED'; if (s.must) throw new Error('Required list ' + s.id + ' could not be downloaded'); continue; }
    const names = namesFrom(text, s.heads || ['company name']);
    let added = 0;
    for (const raw of names) {
      const n = pretty(raw), k = key(n); if (!k || seen.has(k)) continue;
      seen.add(k); out.push([n, 'India', s.band]); added++;
    }
    report[s.id] = names.length + ' read, ' + added + ' new';
    if (s.must && names.length < 90) throw new Error(s.id + ' looks wrong: only ' + names.length + ' names');
  }
  // MCA company master data (prepared separately on a computer in India, because data.gov.in blocks other countries).
  try {
    if (existsSync('mca-companies.json')) {
      const m = JSON.parse(readFileSync('mca-companies.json', 'utf8')); let added = 0;
      for (const r of m.n || []) { const k = key(r[0]); if (!k || seen.has(k)) continue; seen.add(k); out.push([r[0], 'India', r[2], r[3]]); added++; }
      report.mca = (m.n || []).length + ' read, ' + added + ' new';
    } else report.mca = 'no file yet';
  } catch (e) { report.mca = 'FAILED (' + e.message + ')'; }
  // Larger Indian companies from MCA, prepared separately on a computer in India (companies-mca.json). Optional.
  try {
    if (existsSync('companies-mca.json')) {
      const m = JSON.parse(readFileSync('companies-mca.json', 'utf8')); let added = 0;
      for (const [raw, c, bnd] of m.n || []) { const n = pretty(raw), k = key(n); if (!k || seen.has(k)) continue; seen.add(k); out.push([n, c || 'India', bnd]); added++; }
      report.mca = (m.n || []).length + ' read, ' + added + ' new';
    } else report.mca = 'no file yet';
  } catch (e) { report.mca = 'FAILED (' + e.message + ')'; }
  // BSE: best effort only; names not already known are treated as smaller listed companies.
  try {
    const r = await fetch('https://api.bseindia.com/BseIndiaAPI/api/ListofScripMaster/w?branchid=&groupid=&scripcode=&industry=&segment=Equity&status=Active',
      { headers: { ...UA, Referer: 'https://www.bseindia.com/', Origin: 'https://www.bseindia.com' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); let added = 0, read = 0;
    for (const x of (Array.isArray(j) ? j : j.Table || [])) {
      const raw = x.Scrip_Name || x.scrip_name || x.ISSUER_NAME || x.Issuer_Name || ''; if (!raw) continue; read++;
      const n = pretty(raw), k = key(n); if (!k || seen.has(k)) continue;
      seen.add(k); out.push([n, 'India', 's']); added++;
    }
    report.bse = read + ' read, ' + added + ' new';
  } catch (e) { report.bse = 'FAILED (' + e.message + ')'; }
  return { out, report };
}

if (process.argv[1] && process.argv[1].endsWith('companies.mjs')) {
  try {
    const { out, report } = await build();
    console.log(report);
    if (out.length < 300) throw new Error('Only ' + out.length + ' companies, keeping the old file');
    const old = existsSync('companies.json') ? JSON.parse(readFileSync('companies.json', 'utf8')) : null;
    if (old && out.length < old.n.length * 0.7) throw new Error('New list is much smaller than the old one, keeping the old file');
    writeFileSync('companies.json', JSON.stringify({ t: Date.now(), source: 'NSE and BSE lists', n: out }));
    console.log('Saved ' + out.length + ' companies');
  } catch (e) { console.error('Not updated: ' + e.message); process.exit(1); }
}
