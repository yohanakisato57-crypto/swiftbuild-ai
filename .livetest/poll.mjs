const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const jobId = process.argv[2];
const j = async (r) => r.json().catch(() => ({}));
let r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'swiftlivetest1794740375570@gmail.com', password: 'LiveTest#12345' }) });
const token = (await j(r)).access_token;
const call = async (body) => j(await fetch(`${URL}/functions/v1/build-app`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 45000) {
  const p = await call({ action: 'status', jobId });
  const job = p.job || {};
  const idle = Math.round((Date.now() - new Date(job.updated_at).getTime()) / 1000);
  const sig = `${job.status}|${job.done_files}/${job.total_files}|${job.stage}`;
  if (sig !== last) { last = sig; console.log(sig, 'idle', idle, (p.files || []).map((f) => f.name + ':' + f.status + ':' + (f.content || '').length).join(' ')); }
  if (job.status === 'done' || job.status === 'error') { console.log('FINAL', job.status, job.error || '', 'cost', job.cost); break; }
  if (idle > 30) console.log('resume', JSON.stringify(await call({ action: 'resume', jobId, force: false })));
  await new Promise((x) => setTimeout(x, 5000));
}
