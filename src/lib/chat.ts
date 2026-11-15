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

/** Publishes (or updates) a live copy of the project in Supabase and returns its slug. */
export async function deploySite(userId: string, sessionId: string | null, p: Project): Promise<{ slug: string; domain: string | null }> {
  if (sessionId) {
    const { data: ex } = await supabase.from('published_sites').select('slug,domain').eq('session_id', sessionId).maybeSingle();
    if (ex) {
      const { error } = await supabase.from('published_sites').update({ title: p.title, files: p.files, updated_at: new Date().toISOString() }).eq('slug', ex.slug);
      if (error) throw new Error(error.message);
      return { slug: ex.slug as string, domain: (ex.domain as string) || null };
    }
  }
  const slug = `${slugify(p.title)}-${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await supabase.from('published_sites').insert({ slug, user_id: userId, session_id: sessionId, title: p.title, files: p.files });
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
