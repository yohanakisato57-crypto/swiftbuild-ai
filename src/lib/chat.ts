import JSZip from 'jszip';
import { supabase } from './auth';
import type { Project, ProjectFile } from './generator';
import { planFromPacks } from '../components/PlansGrid';

export interface ChatSession {
  id: string;
  title: string;
  mode: string;
  created_at?: string;
}

export interface ChatMessage {
  id: number | string;
  role: 'user' | 'assistant';
  mode: string;
  content: string;
  files?: ProjectFile[] | null;
  title?: string | null;
  cost: number;
}

export async function createSession(userId: string, title: string, mode: string): Promise<ChatSession | null> {
  const { data } = await supabase.from('chat_sessions').insert({ user_id: userId, title: title.slice(0, 60), mode }).select('id,title,mode').single();
  return (data as ChatSession) || null;
}

export async function loadSessions(): Promise<ChatSession[]> {
  const { data } = await supabase.from('chat_sessions').select('id,title,mode,created_at').order('updated_at', { ascending: false }).limit(50);
  return (data as ChatSession[]) || [];
}

export async function deleteSession(sessionId: string): Promise<string | null> {
  await supabase.from('chat_messages').delete().eq('session_id', sessionId);
  const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId);
  return error ? error.message : null;
}

export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await supabase.from('chat_messages').select('id,role,mode,content,files,title,cost').eq('session_id', sessionId).order('id');
  return (data as ChatMessage[]) || [];
}

export async function saveMessage(userId: string, sessionId: string, m: Omit<ChatMessage, 'id'>) {
  await supabase.from('chat_messages').insert({
    user_id: userId, session_id: sessionId, role: m.role, mode: m.mode, content: m.content, files: m.files ?? null, title: m.title ?? null, cost: m.cost,
  });
  await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
}

export async function currentPlan(): Promise<string> {
  const { data } = await supabase.from('orders').select('pack_id').eq('credited', true);
  return planFromPacks(((data as { pack_id: number }[]) || []).map((o) => o.pack_id));
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'site';

export const siteUrl = (slug: string) => `${window.location.origin}/?site=${slug}`;

import { allCurrencies } from './currencies';
export interface BizConfig { phone: string; currency: string }
export const bizKey = (sessionId: string | null) => `sb_biz:${sessionId || 'home'}`;
export function loadBiz(sessionId: string | null): BizConfig | null {
  try { return JSON.parse(localStorage.getItem(bizKey(sessionId)) || 'null'); } catch { return null; }
}

/** Injects a script that wires every Order / Book Now button to the owner's WhatsApp. */
export function withWhatsApp(files: ProjectFile[], biz: BizConfig | null): ProjectFile[] {
  if (!biz || !biz.phone) return files;
  const cfg = JSON.stringify({ p: biz.phone.replace(/[^\d]/g, ''), c: biz.currency, s: allCurrencies().find((x) => x.code === biz.currency)?.symbol || biz.currency });
  const script = `<script data-sb-wa>(function(){var C=${cfg};
var RE=/(order|book|buy|add to cart|reserve|purchase|get a quote|checkout)/i;
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button,a,input[type=submit],[role=button]');if(!b)return;
var t=(b.innerText||b.value||'').trim();if(!RE.test(t)||t.length>40)return;
e.preventDefault();e.stopPropagation();
var card=b.closest('article,li,.card,.product,.item,[class*=card],[class*=product],[class*=item],section')||b.parentElement;
var name='',price='';
if(card){var h=card.querySelector('h1,h2,h3,h4,[class*=title],[class*=name]');if(h)name=h.innerText.trim();
var m=(card.innerText||'').match(/(?:[$€£¥₹₦₵₩₺₽₱₫৳₨]|[A-Za-z]{1,3}\\$|[A-Z]{3}|TSh|KSh|USh|FRw|zł|Rp|RM|kr)\\s?\\d[\\d.,]*|\\d[\\d.,]*\\s?(?:[A-Z]{3}|\\/=|[$€£¥₹₦₵₩₺₽₱₫৳₨])/);if(m)price=m[0].trim();}
if(price&&C.c&&price.indexOf(C.c)<0&&!/[^\\d.,\\s]/.test(price.replace(/\\s/g,'')))price=C.s+' '+price;
var msg='Hello! I would like to '+t.toLowerCase()+(name?': '+name:'')+(price?' ('+price+')':'')+'. Currency: '+C.c+'.';
window.open('https://wa.me/'+C.p+'?text='+encodeURIComponent(msg),'_blank');},true);})();</script>`;
  return files.map((f) => {
    if (!/\.html?$/i.test(f.name) || f.content.includes('data-sb-wa')) return f;
    const content = /<\/body>/i.test(f.content) ? f.content.replace(/<\/body>/i, script + '</body>') : f.content + script;
    return { ...f, content };
  });
}

/** Publishes (or updates) a live copy of the project in Supabase and returns its slug. */
export async function deploySite(userId: string, sessionId: string | null, p0: Project): Promise<{ slug: string; domain: string | null }> {
  const p: Project = { ...p0, files: withWhatsApp(p0.files, loadBiz(sessionId)) };
  const show_badge = (await currentPlan().catch(() => 'free')) === 'free';
  if (sessionId) {
    const { data: ex } = await supabase.from('published_sites').select('slug,domain').eq('session_id', sessionId).maybeSingle();
    if (ex) {
      const { error } = await supabase.from('published_sites').update({ title: p.title, files: p.files, show_badge, updated_at: new Date().toISOString() }).eq('slug', ex.slug);
      if (error) throw new Error(error.message);
      return { slug: ex.slug as string, domain: (ex.domain as string) || null };
    }
  }
  const slug = `${slugify(p.title)}-${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await supabase.from('published_sites').insert({ slug, user_id: userId, session_id: sessionId, title: p.title, files: p.files, show_badge });
  if (error) throw new Error(error.message);
  return { slug, domain: null };
}

export async function saveDomain(slug: string, domain: string) {
  const { error } = await supabase.from('published_sites').update({ domain }).eq('slug', slug);
  if (error) throw new Error(error.message);
}

export async function downloadZip(p: Project) {
  const zip = new JSZip();
  p.files.forEach((f) => zip.file(f.name, f.content));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(p.title)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
