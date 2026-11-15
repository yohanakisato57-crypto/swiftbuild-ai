// Run: node --experimental-strip-types supabase/functions/build-app/sse.test.mjs
import assert from 'node:assert/strict';
import { collectCompletion, parseJsonStrict, stripFence, looksComplete } from './sse.ts';

const enc = new TextEncoder();
const ev = (o) => `data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`;
const delta = (t) => ev({ choices: [{ delta: { content: t } }] });
const fin = (r) => ev({ choices: [{ delta: {}, finish_reason: r }] });
async function* gen(bytes, size) { for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size); }
const run = (s, size = 7, nl = false) => collectCompletion(gen(enc.encode(s), size));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, e.message); } };

await t('short response', async () => { assert.equal((await run(delta('hi') + fin('stop') + ev('[DONE]'))).text, 'hi'); });
await t('split at every byte size', async () => {
  const s = delta('Hello ') + delta('wörld 🚀 日本') + fin('stop') + ev('[DONE]');
  for (const n of [1, 2, 3, 5, 11, 64]) assert.equal((await run(s, n)).text, 'Hello wörld 🚀 日本');
});
await t('multiple events in one chunk', async () => { assert.equal((await run(delta('a') + delta('b') + delta('c') + fin('stop'), 9999)).text, 'abc'); });
await t('CRLF events', async () => { assert.equal((await run(delta('x').replace(/\n/g, '\r\n') + fin('stop').replace(/\n/g, '\r\n'), 3)).text, 'x'); });
await t('long response (500KB), no loss/dup', async () => {
  const big = 'line "q" \\ {}\n'.repeat(40000);
  let s = ''; for (let i = 0; i < big.length; i += 500) s += delta(big.slice(i, i + 500));
  assert.equal((await run(s + fin('stop') + ev('[DONE]'), 1013)).text, big);
});
await t('special chars survive JSON file round trip', async () => {
  const f = 'const a = "x\\ny"; // </script> \u2028';
  assert.equal((await run(delta(f) + fin('stop'), 4)).text, f);
});
await t('final event without trailing blank line flushed', async () => { assert.equal((await run(delta('a') + 'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }))).text, 'a'); });
await t('truncated (length) rejected', async () => { await assert.rejects(run(delta('{"a":"unterm') + fin('length')), /cut off/); });
await t('interrupted stream rejected', async () => { await assert.rejects(run(delta('abc') + 'data: {"choices":[{"del'), /interrupted/); });
await t('API error event rejected', async () => { await assert.rejects(run(ev({ error: { message: 'boom' } })), /boom/); });
await t('empty response rejected', async () => { await assert.rejects(run(fin('stop') + ev('[DONE]')), /empty/); });
await t('malformed event rejected', async () => { await assert.rejects(run(ev('{not json') + fin('stop')), /malformed/); });
await t('parseJsonStrict rejects partial JSON', () => { assert.throws(() => parseJsonStrict('{"a":"unterm'), /not valid JSON/); assert.deepEqual(parseJsonStrict('```json\n{"a":1}\n```'), { a: 1 }); });
await t('stripFence + looksComplete', () => {
  assert.equal(stripFence('```js\nlet a=1;\n```'), 'let a=1;');
  assert.equal(looksComplete('a.css', 'a{color:red'), false);
  assert.equal(looksComplete('index.html', '<!doctype html><html><body>x'), false);
  assert.equal(looksComplete('index.html', '<html></html>'), true);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
