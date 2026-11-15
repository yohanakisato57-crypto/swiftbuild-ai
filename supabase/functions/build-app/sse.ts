// Safe OpenAI SSE handling. No imports, so it runs in Deno and Node (for tests).

/** Splits a byte stream into complete SSE events. Handles events split across
 *  chunks, several events in one chunk, CRLF, and UTF-8 characters split across chunks. */
export class SseParser {
  private dec = new TextDecoder('utf-8');
  private buf = '';

  /** Feed raw bytes; returns the data payload of every COMPLETE event. */
  feed(chunk: Uint8Array): string[] {
    // Normalise the whole buffer, so a CRLF split across two chunks is still recognised.
    this.buf = (this.buf + this.dec.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
    const out: string[] = [];
    let i: number;
    while ((i = this.buf.indexOf('\n\n')) !== -1) {
      const raw = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      const d = eventData(raw);
      if (d !== null) out.push(d);
    }
    return out;
  }

  /** Call at end of stream: flushes the decoder and any final event without a trailing blank line. */
  flush(): string[] {
    this.buf += this.dec.decode().replace(/\r\n/g, '\n');
    const rest = this.buf.trim();
    this.buf = '';
    if (!rest) return [];
    const d = eventData(rest);
    return d === null ? [] : [d];
  }
}

function eventData(raw: string): string | null {
  const parts: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) parts.push(line.slice(5).replace(/^ /, ''));
  }
  return parts.length ? parts.join('\n') : null;
}

export interface StreamResult {
  text: string;
  finish: 'stop' | 'length' | 'other';
}

/** Reads the whole stream. Throws on API errors, truncation (finish_reason "length"),
 *  or a stream that ended without a finish reason / [DONE] (interrupted). */
export async function collectCompletion(
  chunks: AsyncIterable<Uint8Array>,
  onDelta?: (total: number) => void,
): Promise<StreamResult> {
  const p = new SseParser();
  let text = '';
  let finish: string | null = null;
  let done = false;
  let bad = 0;

  const handle = (data: string) => {
    if (data.trim() === '[DONE]') { done = true; return; }
    let j: any;
    try { j = JSON.parse(data); } catch { bad++; return; } // complete events only, so this is a real malformed event
    if (j?.error) throw new Error(`OpenAI stream error: ${j.error.message || JSON.stringify(j.error)}`);
    const c = j?.choices?.[0];
    if (!c) return;
    if (typeof c.delta?.content === 'string') { text += c.delta.content; onDelta?.(text.length); }
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

/** Parses a complete JSON reply; tolerates code fences. Never called on partial text. */
export function parseJsonStrict(text: string): any {
  let t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (m) t = m[1];
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error(`The AI reply was not valid JSON (${(e as Error).message}).`);
  }
}

/** Removes a wrapping markdown fence from raw file output. */
export function stripFence(text: string): string {
  const t = text.replace(/^\uFEFF/, '');
  const m = t.trim().match(/^```[\w+-]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : t;
}

/** Cheap structural check so a truncated file is never saved as success. */
export function looksComplete(name: string, content: string): boolean {
  const c = content.trim();
  if (!c) return false;
  if (name.endsWith('.html')) return /<\/html>\s*$/i.test(c) || !/<html/i.test(c) && c.length > 0;
  // JS is verified by finish_reason (string braces make bracket counting unreliable).
  if (name.endsWith('.css')) {
    let b = 0;
    for (const ch of c) { if (ch === '{') b++; else if (ch === '}') b--; }
    return b === 0;
  }
  return true;
}
