// One-off probe: finds the MCA company datasets on data.gov.in and prints their field names (never the key).
const key = process.env.DATAGOV_KEY;
if (!key) { console.log('No key set'); process.exit(1); }
async function j(u) {
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(40000) });
  const t = await r.text();
  console.log('HTTP', r.status, 'bytes', t.length);
  try { return JSON.parse(t); } catch { console.log(t.slice(0, 300).replace(key, '***')); return null; }
}
for (const q of ['company master data', 'registered companies', 'MCA company']) {
  console.log('\n== catalog search:', q);
  const c = await j('https://api.data.gov.in/lists?format=json&notfilters[source]=visualize.data.gov.in&filters[title]=' + encodeURIComponent(q) + '&offset=0&limit=30&api-key=' + key);
  const rows = c && (c.records || c.result || c.data) || [];
  console.log('count', c && c.total, 'rows', rows.length, 'keys', c ? Object.keys(c).join(',') : '');
  rows.slice(0, 30).forEach(r => console.log('-', r.title, '|', r.index_name || r.resource_id || r.id || '', '|', r.org_type || '', '|', (r.org || []).join ? (r.org || []).join('/') : ''));
}
