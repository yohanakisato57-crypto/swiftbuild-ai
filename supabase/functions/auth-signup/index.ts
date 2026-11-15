import { admin, cors, json } from './util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { email = '', password = '' } = await req.json().catch(() => ({}));
  const e = String(email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) return json({ error: 'Enter a valid email address.' }, 400);
  if (String(password).length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400);
  const { error } = await admin().auth.admin.createUser({ email: e, password: String(password), email_confirm: true });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return json({ error: exists ? 'An account with this email already exists. Try signing in.' : error.message }, exists ? 409 : 400);
  }
  return json({ ok: true });
});
