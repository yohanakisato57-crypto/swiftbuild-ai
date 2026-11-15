import { admin, cors, json, userFrom } from './util.ts';

const BUILD_SYSTEM =
  'You are SwiftBuild AI, an expert full-stack engineer. Build EXACTLY what the user asks for as a real, working, polished, responsive web project using plain HTML, CSS and vanilla JavaScript (no build tools; Google Fonts links allowed). Use real, specific content for the user\'s business, never lorem ipsum, and never a generic template. Include every page, form, section and feature the user described. Reply with ONLY JSON: {"title": string (max 5 words), "files": [{"name": string, "content": string}]}. Always include "index.html" which links "styles.css" and "script.js" (use separate files for CSS and JS). Add extra pages as separate html files when the request needs them.';
const CHAT_SYSTEM = "You are SwiftBuild AI, a friendly senior engineer. Answer concisely about the user's web project. Plain text, short paragraphs.";
const PLAN_SYSTEM = 'You are SwiftBuild AI planning a web project. Write a structured Markdown plan: Overview, Pages/Sections, File structure, Data model, Milestones. Be specific and concise.';
// Universal, context-aware questionnaire: the model reads the idea and writes its own
// 3–4 questions for that specific project. Nothing is hardcoded to shops or games.
const QUESTION_SYSTEM =
  'You are SwiftBuild AI. A user wants to build a project. Read the idea carefully and write 3 to 4 short, specific questions that you need answered before building THIS project well. Each question must be unique to this idea (for example a school website asks for the school name, the level such as primary or secondary, and whether to include a student results upload; a hospital app asks for the clinic name, the doctor categories, and whether it needs appointment booking; a clothing shop asks for the shop name, the clothing types, and the WhatsApp number for payment). Never ask generic questions that could fit any project. Ask only for information that changes what gets built. Reply ONLY JSON: {"questions": [{"id": string (short snake_case), "question": string, "placeholder": string (a realistic example answer)}]} with exactly 3 or 4 questions.';

/** Turns the model reply into a clean list of 3–4 questions. */
function cleanQuestions(raw: unknown): { id: string; question: string; placeholder: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { id: string; question: string; placeholder: string }[] = [];
  for (const q of raw) {
    const question = String((q as any)?.question || '').trim().slice(0, 160);
    if (!question) continue;
    let id = String((q as any)?.id || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30) || `q${out.length + 1}`;
    while (seen.has(id)) id += '_';
    seen.add(id);
    out.push({ id, question, placeholder: String((q as any)?.placeholder || '').slice(0, 80) });
    if (out.length === 4) break;
  }
  return out.length >= 3 ? out : [];
}

/** Calls OpenAI with stream:true and reports every text delta as it arrives. */
async function streamOpenAI(key: string, body: Record<string, unknown>, onDelta: (t: string) => void): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!r.ok || !r.body) {
    const d = await r.json().catch(() => ({}));
    throw new Error(`OpenAI error: ${d?.error?.message || r.status}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const t = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (t) {
          full += t;
          onDelta(t);
        }
      } catch { /* partial line */ }
    }
  }
  return full;
}

const HEAVY_RE = /\b(database|auth|login|sign.?up|backend|api|dashboard|full|entire|whole|from scratch|e-?commerce|marketplace|admin|payment|multi.?page|pages|platform|saas|crm|system|app|website|site|landing|portfolio|store|shop|game|booking|blog|school|restaurant|hotel|clinic|company|business|delivery|order|menu|catalog|shop)\b/gi;
const LIGHT_RE = /\b(color|colour|rangi|button|kitufe|text|font|rename|change|tweak|fix|typo|padding|margin|swap|update|add a|make the|move|remove)\b/i;

/** Pre-check of prompt weight, used only to decide whether to ask questions. */
function isHeavy(prompt: string): boolean {
  const words = prompt.split(/\s+/).filter(Boolean).length;
  const hits = (prompt.match(HEAVY_RE) || []).length;
  const light = LIGHT_RE.test(prompt);
  return words > 25 || hits >= 2 || (hits >= 1 && words > 12 && !light);
}

/**
 * Final credit cost for a build, from the real output:
 * - Small edit / short prompt: 1–2 credits.
 * - New app / big build: 5–15, scaled by number of files and total code size.
 */
export function buildCost(prompt: string, files: { content: string }[]): number {
  const words = prompt.split(/\s+/).filter(Boolean).length;
  const chars = files.reduce((n, f) => n + f.content.length, 0);
  const count = files.length;
  if (!isHeavy(prompt) && count <= 3 && chars < 6000) return words <= 10 ? 1 : 2;
  const sizeScore = Math.min(1, chars / 40000); // 0 → tiny, 1 → very large project
  const fileScore = Math.min(1, Math.max(0, count - 3) / 6); // extra pages/files add cost
  const promptScore = Math.min(1, words / 150);
  const score = sizeScore * 0.5 + fileScore * 0.3 + promptScore * 0.2;
  return Math.max(5, Math.min(15, Math.round(5 + score * 10)));
}

/** Credits needed before the build starts (a safe floor — the real cost is charged after generation). */
function holdCost(prompt: string): number {
  return isHeavy(prompt) ? 5 : 2;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await userFrom(req);
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return json({ error: 'OPENAI_API_KEY is missing from Secrets.' }, 503);

  const b = await req.json().catch(() => ({}));
  const prompt = String(b.prompt || '').trim().slice(0, 4000);
  if (!prompt) return json({ error: 'Describe what to build.' }, 400);
  const mode = b.mode === 'chat' || b.mode === 'plan' ? String(b.mode) : 'build';
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-6.1-sol';
  const db = admin();

  // Interactive step: ask 2–3 quick questions before a big build. Free, no charge.
  if (mode === 'build' && b.phase === 'questions') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        prompt_cache_key: 'swiftbuild-questions',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: QUESTION_SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: `OpenAI error: ${d?.error?.message || r.status}` }, 502);
    let questions: { id: string; question: string; placeholder: string }[] = [];
    try {
      questions = cleanQuestions(JSON.parse(d.choices?.[0]?.message?.content || '{}').questions);
    } catch { questions = []; }
    // If the model could not produce a usable set, build with the idea alone (no forced form).
    if (!questions.length) return json({ questions: [] });

    // Save the questionnaire so the answers and the build stay linked in Supabase.
    const { data: row } = await db
      .from('build_questionnaires')
      .insert({ user_id: user.id, session_id: b.sessionId ? String(b.sessionId) : null, prompt, questions, status: 'asked' })
      .select('id')
      .single();
    return json({ questions, questionnaireId: row?.id ?? null });
  }

  const { data: us } = await db.from('user_settings').select('custom_instructions').eq('user_id', user.id).maybeSingle();
  const custom = String(us?.custom_instructions || '').trim().slice(0, 4000);
  const rules = custom ? `\n\nThe user's permanent custom instructions (always follow them):\n${custom}` : '';

  // Chat is free; Plan is 1–2; Build is decided from the real output (see buildCost).
  const need = mode === 'build' ? holdCost(prompt) : mode === 'chat' ? 0 : 2;

  const { data: prof } = await db.from('profiles').select('credits').eq('id', user.id).single();
  if (!prof || prof.credits < need) return json({ error: 'Not enough credits.', credits: prof?.credits ?? 0 }, 402);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        const base = { model, prompt_cache_key: `swiftbuild-${mode}` };

        // Chat and Plan stream their text. Chat is free; Plan debits 1–2 credits.
        if (mode !== 'build') {
          const sys = (mode === 'chat' ? CHAT_SYSTEM : PLAN_SYSTEM) + rules;
          const text = await streamOpenAI(key, { ...base, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }] }, (d) => send({ d }));
          if (!text) throw new Error('Empty reply. You were not charged.');
          let bal: number = prof.credits;
          if (need > 0) {
            const { data } = await db.rpc('adjust_credits', { p_user: user.id, p_delta: -need, p_reason: `${mode}: ${prompt.slice(0, 60)}` });
            if (data === null || data === undefined) {
              send({ error: 'Not enough credits.', credits: prof.credits, status: 402 });
              return;
            }
            bal = data;
          }
          if (mode === 'plan') {
            const title = ('Plan: ' + prompt).slice(0, 50);
            const files = [{ name: 'PLAN.md', lang: 'md', content: text }];
            await db.from('projects').insert({ user_id: user.id, title, prompt, mode: 'plan', files, cost: need });
            send({ done: true, text, project: { title, mode: 'plan', files }, cost: need, credits: bal });
          } else {
            send({ done: true, text, cost: need, credits: bal });
          }
          return;
        }

        // Build: the user's answers are written straight into the request.
        const answers: { question: string; answer: string }[] = Array.isArray(b.answers)
          ? b.answers.slice(0, 3).map((a: { question?: unknown; answer?: unknown }) => ({
              question: String(a?.question || '').slice(0, 200),
              answer: String(a?.answer || '').slice(0, 400),
            }))
          : [];
        const answerBlock = answers.length
          ? `\n\nThe user answered these questions. Use the answers as real content in the build (names, numbers, details):\n${answers.map((a) => `- ${a.question}: ${a.answer}`).join('\n')}`
          : '';

        // Generate silently; the client shows the loading card until the real project arrives.
        const raw = await streamOpenAI(
          key,
          {
            ...base,
            response_format: { type: 'json_object' },
            max_completion_tokens: 16000,
            messages: [{ role: 'system', content: BUILD_SYSTEM + rules }, { role: 'user', content: prompt + answerBlock }],
          },
          () => undefined,
        );
        let out: { title?: string; files?: { name?: string; content?: string }[] };
        try {
          out = JSON.parse(raw);
        } catch {
          throw new Error('The model returned invalid code. You were not charged.');
        }
        const files = (out.files || [])
          .filter((f) => f && typeof f.name === 'string' && typeof f.content === 'string' && f.content.trim())
          .slice(0, 12)
          .map((f) => {
            const name = String(f.name).replace(/[^\w.\-\/]/g, '').slice(0, 60) || 'file.txt';
            const lang = name.endsWith('.css') ? 'css' : name.endsWith('.js') ? 'js' : name.endsWith('.md') ? 'md' : 'html';
            return { name, lang, content: String(f.content) };
          });
        if (!files.some((f) => f.name === 'index.html')) throw new Error('The model returned no index.html. You were not charged.');
        const cost = buildCost(prompt, files);
        const title = String(out.title || 'New project').slice(0, 60);

        // Charge the real cost atomically now that the project exists.
        const { data: balance } = await db.rpc('adjust_credits', { p_user: user.id, p_delta: -cost, p_reason: `Build: ${prompt.slice(0, 60)}` });
        if (balance === null || balance === undefined) {
          send({ error: 'Not enough credits.', credits: prof.credits, status: 402 });
          return;
        }
        const { data: row } = await db.from('projects').insert({ user_id: user.id, title, prompt, mode: 'build', files, cost }).select('id').single();
        send({ done: true, project: { title, mode: 'build', files }, cost, credits: balance, id: row?.id });
      } catch (err) {
        send({ error: (err as Error).message });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' } });
});
