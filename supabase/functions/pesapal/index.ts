import { admin, cors, json, userFrom } from './util.ts';

const HOSTS: Record<string, string> = {
  live: 'https://pay.pesapal.com/v3',
  sandbox: 'https://cybqa.pesapal.com/pesapalv3',
};
const PACKS: Record<number, { credits: number; price: number }> = {
  // Official plans (Settings → Billing)
  10: { credits: 40, price: 5 },
  11: { credits: 100, price: 15 },
  12: { credits: 350, price: 35 },
  13: { credits: 800, price: 75 },
};

// deno-lint-ignore no-explicit-any
async function call(base: string, path: string, opts: { method?: string; token?: string; body?: unknown } = {}): Promise<any> {
  const res = await fetch(base + path, {
    method: opts.method || 'GET',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return await res.json().catch(() => ({}));
}

async function auth() {
  const order = Deno.env.get('PESAPAL_ENV') === 'sandbox' ? ['sandbox', 'live'] : ['live', 'sandbox'];
  for (const env of order) {
    const base = HOSTS[env];
    try {
      const data = await call(base, '/api/Auth/RequestToken', {
        method: 'POST',
        body: { consumer_key: Deno.env.get('PESAPAL_CONSUMER_KEY'), consumer_secret: Deno.env.get('PESAPAL_CONSUMER_SECRET') },
      });
      if (data.token) return { env, base, token: data.token as string };
    } catch { /* next */ }
  }
  throw new Error('Pesapal rejected the consumer key/secret.');
}

async function ipnId(s: { env: string; base: string; token: string }, selfUrl: string) {
  const key = `ipn:${s.env}:${selfUrl}`;
  const db = admin();
  const { data: row } = await db.from('kv').select('value').eq('key', key).maybeSingle();
  if (row) return row.value as string;
  const data = await call(s.base, '/api/URLSetup/RegisterIPN', {
    method: 'POST',
    token: s.token,
    body: { url: selfUrl, ipn_notification_type: 'GET' },
  });
  if (!data.ipn_id) throw new Error('Could not register the payment notification URL.');
  await db.from('kv').upsert({ key, value: data.ipn_id });
  return data.ipn_id as string;
}

async function settle(reference: string) {
  const db = admin();
  const { data: order } = await db.from('orders').select('*').eq('reference', reference).maybeSingle();
  if (!order) return null;
  if (order.credited || !order.tracking_id) return order;
  const s = await auth();
  const data = await call(s.base, `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(order.tracking_id)}`, { token: s.token });
  const status = String(data.payment_status_description || 'Pending').toLowerCase();
  if (status === 'completed') {
    const { data: claimed } = await db.from('orders').update({ credited: true, status: 'completed' }).eq('id', order.id).eq('credited', false).select('id');
    if (claimed && claimed.length > 0) {
      await db.rpc('adjust_credits', { p_user: order.user_id, p_delta: order.credits, p_reason: `Purchased ${order.credits} credits (${reference})` });
      await db.rpc('reward_referral', { p_user: order.user_id }); // 60 credits to the inviter, once per friend
    }
  } else {
    await db.from('orders').update({ status }).eq('id', order.id);
  }
  const { data: fresh } = await db.from('orders').select('*').eq('reference', reference).single();
  return fresh;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const selfUrl = `${url.origin}${url.pathname}`;
  const action = url.searchParams.get('action') || (await req.clone().json().catch(() => ({}))).action;

  // Pesapal IPN webhook: credits the account automatically after payment.
  if (action === 'ipn') {
    const ref = url.searchParams.get('OrderMerchantReference');
    try { if (ref) await settle(ref); } catch { /* Pesapal retries */ }
    return json({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId: url.searchParams.get('OrderTrackingId'),
      orderMerchantReference: ref,
      status: 200,
    });
  }

  const user = await userFrom(req);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const body = await req.json().catch(() => ({}));
  const db = admin();

  if (action === 'order') {
    if (!Deno.env.get('PESAPAL_CONSUMER_KEY') || !Deno.env.get('PESAPAL_CONSUMER_SECRET'))
      return json({ error: 'Pesapal keys are missing from Secrets.' }, 503);
    const pack = PACKS[Number(body.packId)];
    if (!pack) return json({ error: 'Unknown package.' }, 400);
    try {
      const s = await auth();
      const currency = Deno.env.get('PESAPAL_CURRENCY') || 'USD';
      const reference = `SB-${user.id.slice(0, 8)}-${Date.now()}`;
      const notification_id = await ipnId(s, `${selfUrl}?action=ipn`);
      const origin = String(body.origin || '');
      const { data: prof } = await db.from('profiles').select('name').eq('id', user.id).single();
      const data = await call(s.base, '/api/Transactions/SubmitOrderRequest', {
        method: 'POST',
        token: s.token,
        body: {
          id: reference,
          currency,
          amount: pack.price,
          description: `${pack.credits.toLocaleString()} SwiftBuild AI credits`,
          callback_url: `${origin}/?pay=${reference}`,
          notification_id,
          billing_address: { email_address: user.email, first_name: (prof?.name || 'Builder').split(' ')[0] },
        },
      });
      if (!data.redirect_url) return json({ error: data.error?.message || 'Pesapal could not create the order.' }, 502);
      await db.from('orders').insert({
        reference, user_id: user.id, pack_id: Number(body.packId), credits: pack.credits, amount: pack.price, currency,
        tracking_id: data.order_tracking_id || null,
      });
      return json({ url: data.redirect_url });
    } catch (err) {
      return json({ error: (err as Error).message || 'Payment could not start.' }, 502);
    }
  }

  if (action === 'verify') {
    const ref = String(body.ref || '');
    const { data: own } = await db.from('orders').select('id').eq('reference', ref).eq('user_id', user.id).maybeSingle();
    if (!own) return json({ error: 'Order not found.' }, 404);
    try {
      const order = await settle(ref);
      const { data: p } = await db.from('profiles').select('credits').eq('id', user.id).single();
      return json({ status: order.status, credited: Boolean(order.credited), added: order.credits, credits: p?.credits });
    } catch (err) {
      return json({ error: (err as Error).message }, 502);
    }
  }
  return json({ error: 'Unknown action.' }, 400);
});
