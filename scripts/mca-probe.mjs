const key = process.env.DATAGOV_KEY;
const RES = '4dbe5667-7b6b-41d7-82af-211562424d9a';
async function call(filters, limit = 10, offset = 0) {
  const p = new URLSearchParams({ 'api-key': key, format: 'json', offset: String(offset), limit: String(limit) });
  for (const [k, v] of Object.entries(filters)) p.set('filters[' + k + ']', v);
  const r = await fetch('https://api.data.gov.in/resource/' + RES + '?' + p, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(90000) });
  const j = await r.json(); return j;
}
const subs = ['Subsidiary of Foreign Company', 'Subsidiary of foreign company', 'Union Govt company', 'Union govt company', 'State Govt company', 'State govt company', 'Guarantee and Association comp', 'Non-government company', 'Non-govt company'];
for (const s of subs) { try { const j = await call({ CompanyStatus: 'Active', CompanySubCategory: s }); console.log('sub', JSON.stringify(s), 'total', j.total); } catch (e) { console.log('sub', s, 'ERR', e.message); } }
for (const c of ['Private', 'Public', 'Private(One Person Company)', 'Private (One Person Company)']) { try { const j = await call({ CompanyStatus: 'Active', CompanyClass: c }); console.log('class', JSON.stringify(c), 'total', j.total); } catch (e) { console.log('class', c, 'ERR', e.message); } }
for (const c of ['Company limited by shares', 'Company limited by guarantee', 'Unlimited company']) { try { const j = await call({ CompanyStatus: 'Active', CompanyCategory: c }); console.log('category', JSON.stringify(c), 'total', j.total); } catch (e) { console.log('category', c, 'ERR', e.message); } }
// what do paid-up values look like for a known large private company?
for (const n of ['TATA CONSULTANCY SERVICES LIMITED', 'XCEEDANCE CONSULTING INDIA PRIVATE LIMITED', 'XCEEDANCE CONSULTING PRIVATE LIMITED', 'MICROSOFT INDIA (R&D) PRIVATE LIMITED']) {
  const j = await call({ CompanyName: n }); const r = (j.records || [])[0];
  console.log('name', n, '->', j.total, r ? [r.CompanyName, r.PaidupCapital, r.Listingstatus, r.CompanyClass, r.CompanySubCategory, r['CompanyIndian/Foreign Company']].join(' | ') : '');
}
