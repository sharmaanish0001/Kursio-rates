// Probe: how many records does each slice of the MCA dataset have, and how many does one call return?
const key = process.env.DATAGOV_KEY;
const RES = '4dbe5667-7b6b-41d7-82af-211562424d9a';
async function call(filters, limit = 1000, offset = 0) {
  const p = new URLSearchParams({ 'api-key': key, format: 'json', offset: String(offset), limit: String(limit) });
  for (const [k, v] of Object.entries(filters)) p.set('filters[' + k + ']', v);
  const t0 = Date.now();
  const r = await fetch('https://api.data.gov.in/resource/' + RES + '?' + p, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(90000) });
  const txt = await r.text(); let j = {};
  try { j = JSON.parse(txt); } catch { return { http: r.status, err: txt.slice(0, 200).replace(key, '***') }; }
  return { http: r.status, total: j.total, count: j.count, limit: j.limit, bytes: txt.length, ms: Date.now() - t0, err: j.error || j.message === 'Resource lists' ? undefined : j.message, first: j.records && j.records[0] };
}
const sets = [
  ['limit 1000, no filter', {}],
  ['Active', { CompanyStatus: 'Active' }],
  ['Listed', { Listingstatus: 'Listed' }],
  ['Active+Listed', { CompanyStatus: 'Active', Listingstatus: 'Listed' }],
  ['Active+Public', { CompanyStatus: 'Active', CompanyClass: 'Public' }],
  ['Active+Private', { CompanyStatus: 'Active', CompanyClass: 'Private' }],
  ['Active+Foreign (CompanyIndian/Foreign Company=Foreign)', { CompanyStatus: 'Active', 'CompanyIndian/Foreign Company': 'Foreign' }],
  ['Active+Public+Unlisted', { CompanyStatus: 'Active', CompanyClass: 'Public', Listingstatus: 'Unlisted' }],
  ['Active+Maharashtra', { CompanyStatus: 'Active', CompanyStateCode: 'maharashtra' }],
  ['name exact upper', { CompanyName: 'RELIANCE INDUSTRIES LIMITED' }],
  ['name exact title', { CompanyName: 'Reliance Industries Limited' }]
];
for (const [name, f] of sets) {
  try { const r = await call(f); if (r.first) { r.first = (r.first.CompanyName || '') + ' | paidup ' + r.first.PaidupCapital + ' | ' + r.first.Listingstatus + ' | ' + r.first.CompanyClass; } console.log(name, JSON.stringify(r)); }
  catch (e) { console.log(name, 'ERROR', String(e.message).replace(key, '***')); }
}
// Does an offset page walk work, and how fast is a page of 10?
const t0 = Date.now(); let n = 0;
for (let o = 0; o < 100; o += 10) { const r = await call({ CompanyStatus: 'Active', Listingstatus: 'Listed' }, 10, o); n += r.count || 0; }
console.log('10 pages of 10 listed companies:', n, 'records in', Date.now() - t0, 'ms');
