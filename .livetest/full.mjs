const URL = process.env.VITE_SUPABASE_URL || 'https://dqfbmxotrvnjlorcmwdd.supabase.co';
const KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const email = 'swiftlivetest1794740375570@gmail.com';
const password = 'LiveTest#12345';
const j = async (r) => r.json().catch(() => ({}));
let r = await fetch(`${URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
let d = await j(r);
let token = d.access_token;
console.log('signup', r.status, Boolean(token), d.msg || d.error_description || '');
if (!token) { r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); d = await j(r); token = d.access_token; console.log('login', r.status, Boolean(token)); }
if (!token) process.exit(1);
const call = async (body) => j(await fetch(`${URL}/functions/v1/build-app`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const s = await call({ action: 'start', prompt: 'Build a small habit tracker web app with a dashboard, add-habit form, streak counter and a dark theme.' });
console.log('start', JSON.stringify(s));
if (!s.jobId) process.exit(1);
const t0 = Date.now();
let last = '', lastChange = Date.now();
while (Date.now() - t0 < 520000) {
  await new Promise((x) => setTimeout(x, 6000));
  const p = await call({ action: 'status', jobId: s.jobId });
  const job = p.job || {};
  const sig = `${job.status}|${job.done_files}/${job.total_files}|${job.stage}`;
  if (sig !== last) { last = sig; lastChange = Date.now(); console.log(Math.round((Date.now() - t0) / 1000) + 's', sig, (p.files || []).map((f) => f.name + ':' + f.status + ':' + (f.content || '').length).join(' ')); }
  if (job.status === 'done' || job.status === 'error') { console.log('FINAL', job.status, job.error || '', 'cost', job.cost); break; }
  if (Date.now() - lastChange > 40000) { const rr = await call({ action: 'resume', jobId: s.jobId, force: false }); console.log('resume', JSON.stringify(rr)); lastChange = Date.now(); }
}
console.log('email', email);
