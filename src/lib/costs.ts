import type { Mode } from './generator';

/**
 * Credit rules (mirrored on the server in supabase/functions/generate):
 * - Chat: always free (0 credits).
 * - Plan: 1–2 credits.
 * - Build: small edits / short prompts cost 1–2; new apps or big builds cost 5–15,
 *   scaled by the number of files and the amount of code actually generated.
 */
export const COSTS: Record<Mode, number> = { build: 2, plan: 1 };

export const COST_RANGE = { lightMin: 1, lightMax: 2, heavyMin: 5, heavyMax: 80 };

const HEAVY_RE = /\b(database|auth|login|sign.?up|backend|api|dashboard|full|entire|whole|from scratch|e-?commerce|marketplace|admin|payment|multi.?page|pages|platform|saas|crm|system|app|website|site|landing|portfolio|store|shop|game|booking|blog|school|restaurant|hotel|clinic|company|business|delivery|order|menu|catalog)\b/gi;
const LIGHT_RE = /\b(color|colour|rangi|button|kitufe|text|font|rename|change|tweak|fix|typo|padding|margin|swap|update|add a|make the|move|remove)\b/i;

export interface Estimate {
  heavy: boolean;
  /** Credits held before the build starts. The real cost is charged after generation. */
  cost: number;
}

/** Estimate prompt weight before calling the model. Heavy = a new app / big build. */
export function estimateCost(prompt: string): Estimate {
  const text = prompt.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const hits = (text.match(HEAVY_RE) || []).length;
  const light = LIGHT_RE.test(text);
  const heavy = words > 25 || hits >= 2 || (hits >= 1 && words > 12 && !light);
  if (!heavy) return { heavy: false, cost: words <= 10 ? 1 : 2 };
  // Held estimate; the final charge is computed from the real output (5–80).
  return { heavy: true, cost: Math.min(30, 5 + hits * 2 + Math.floor(words / 20)) };
}
