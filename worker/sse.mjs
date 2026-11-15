// Safe OpenAI SSE handling (Node copy of supabase/functions/build-app/sse.ts).
export class SseParser {
  dec = new TextDecoder('utf-8');
  buf = '';
  feed(chunk) {
    this.buf = (this.buf + this.dec.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
    const out = [];
    let i;
    while ((i = this.buf.indexOf('\n\n')) !== -1) {
      const raw = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      const d = eventData(raw);
      if (d !== null) out.push(d);
    }
    return out;
  }
  flush() {
    this.buf += this.dec.decode().replace(/\r\n/g, '\n');
    const rest = this.buf.trim();
    this.buf = '';
    if (!rest) return [];
    const d = eventData(rest);
    return d === null ? [] : [d];
  }
}

function eventData(raw) {
  const parts = [];
  for (const line of raw.split('\n')) if (line.startsWith('data:')) parts.push(line.slice(5).replace(/^ /, ''));
  return parts.length ? parts.join('\n') : null;
}

export async function collectCompletion(chunks) {
  const p = new SseParser();
  let text = '';
  let finish = null;
  let done = false;
  let bad = 0;
  const handle = (data) => {
    if (data.trim() === '[DONE]') { done = true; return; }
    let j;
    try { j = JSON.parse(data); } catch { bad++; return; }
    if (j?.error) throw new Error(`OpenAI stream error: ${j.error.message || JSON.stringify(j.error)}`);
    const c = j?.choices?.[0];
    if (!c) return;
    if (typeof c.delta?.content === 'string') text += c.delta.content;
    if (c.delta?.refusal) throw new Error(`The model refused: ${String(c.delta.refusal).slice(0, 120)}`);
    if (c.finish_reason) finish = c.finish_reason;
  };
  for await (const chunk of chunks) for (const d of p.feed(chunk)) handle(d);
  for (const d of p.flush()) handle(d);
  if (finish === null && !done) throw new Error('The AI connection was interrupted before the response finished.');
  if (finish === 'length') throw new Error('The AI response was cut off (too long).');
  if (finish === 'content_filter') throw new Error('The AI response was blocked by a content filter.');
  if (!text.trim()) throw new Error(bad ? 'The AI sent a malformed response.' : 'The AI returned an empty response.');
  return { text, finish: finish === 'stop' ? 'stop' : 'other' };
}

export function parseJsonStrict(text) {
  let t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (m) t = m[1];
  try { return JSON.parse(t); } catch (e) { throw new Error(`The AI reply was not valid JSON (${e.message}).`); }
}

export function stripFence(text) {
  const t = text.replace(/^\uFEFF/, '');
  const m = t.trim().match(/^```[\w+-]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : t;
}

export function looksComplete(name, content) {
  const c = content.trim();
  if (!c) return false;
  if (name.endsWith('.html')) return /<\/html>\s*$/i.test(c) || (!/<html/i.test(c) && c.length > 0);
  if (name.endsWith('.css')) {
    let b = 0;
    for (const ch of c) { if (ch === '{') b++; else if (ch === '}') b--; }
    return b === 0;
  }
  return true;
}
