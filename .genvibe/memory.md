<!-- genvibe-memory covers:zS25gwpBS0kouSMt -->
## What this app is
SwiftBuild AI: a cloud-based, AI-powered IDE and app-builder website.

## Working (confirmed)
- `/` passed multiple crash checks, latest after Render config; no crash or failed backend request. (check: crash check on `/`)
- TypeScript, SSE parser tests, build-app inspection, `.livetest/poll.mjs`, credit grep, `.livetest/full.mjs`, latest `wc`/`grep`, and worker syntax checks passed. (check: listed commands exited 0)
- Live non-mocked `gpt-6.1-sol` streaming returned HTTP 200, 733 chunks, ~3.7k characters, `finish_reason: stop`, no parser errors. (check: live OpenAI streaming test)

## Claimed, not yet confirmed
- `worker/render.yaml` and `worker/` reportedly provide a permanent Node worker, parallel file writing (up to 6 files, 5 minutes/file), Supabase start/status/resume, success-only credit deductions, and restart resumption. Undeployed; needs `SUPABASE_SERVICE_ROLE_KEY`.
- Render setup: Blueprint or Web Service, Root Directory `worker`, Build `npm install`, Start `node server.mjs`; set `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ALLOWED_ORIGIN` to published app URL. Starter recommended; Free may sleep after 15 minutes. User says GitHub is connected; deployment remains unconfirmed.
- `src/lib/auth.ts` reportedly routes build requests to worker with `VITE_BUILD_WORKER_URL`; otherwise uses Supabase `build-app`. Worker builds untested.
- Latest `build-app/index.ts` reportedly deployed with 65 seconds/file, 25 seconds silence, max 8 short products in data files. Other claimed speed changes target ~60-second builds, parallel writing, retries and shorter planning; untested.
- A 4-file habit tracker reportedly finished in 50 seconds and charged 7 credits; `app.js` retried once. Preview unchecked. Older 5-file/15-credit result superseded; older 7-file test reportedly remained “writing”; signup untested.
- New accounts reportedly get 15 free credits. Credit formula, failed-build charging, auth/payment, OAuth, templates, connectors, Settings, referrals, deletion, persistence, publishing, Admin Panel, Git history/backup, Supabase data/functions/secrets, cleanup, and other retry/timeout/parser/preview/UI claims unverified.
- GitHub is connected to GenVibe.
- `git remote -v`, `git status --short | head -5`, and `git log --oneline | head -3` exited 0.

## Open bugs
- Unterminated JSON (`Unterminated string in JSON at position 24181`) — reported 1×; tried: safe parser rewrite/redeployment; untested.
- Multi-file build slow/stops — reported 5×; tried: resume/retry, timeout/silence changes, parallel generation, shorter files/planning; latest untested.
- Live multi-file build incomplete/background job killed — reported 2×; tried: live test and claimed resume changes; untested.
- Business builds generic/example-like — reported 1×; tried: claimed real multi-file generation.
- Generation Stop unconfirmed — reported 1×; tried: claimed cancellation control.
- Credit deductions too high/unclear or incorrect, including incomplete-build OpenAI costs — reported 4×; tried: success-only charging, no app-credit charge on failure/stop, task-weighted/lower costs, resume changes; no OpenAI-cost remedy.
- Pricing/Credits modal cannot scroll — reported 2×; tried: inner-panel and outer-modal scrolling.
- Pricing showed six old packages — reported 1×; tried: claimed five-plan rebuild.
- Google sign-in redirects to `localhost:3000` — reported 1×; tried: claimed origin-based redirect; Supabase URL unverified.
- Templates partial modal — reported 1×; tried: claimed dedicated page.
- Supabase Connector showed “Database” and one input — reported 1×; tried: claimed labeled URL/Anon Key fields.
- Dashboard heading/prompt overlap or spacing fails, especially with mobile keyboard — reported 2×; tried: centered wrapper, vertical flex, visible-viewport adjustment.

## Design
- Clean Hercules-inspired dashboard: compact dark graphite, electric-lime accents, Geist/Geist Mono, 100vh, fixed composer.
- Full-screen Templates with previews/details; full-width Connectors with official logos and service-specific fields.
- Referral gift card above “Credits Left”; English copy, Copy Invite Link, Share.
- Agent claims dark responsive Billing grid, gradient-border Enterprise, “Most popular” Pro.
- User wants specific real apps, visible chat, small inline loader; claimed glass card, purple/blue pulsing aura, changing status text.

## Structure
- Frontend: `src/App.tsx`, `src/lib/auth.ts`; components `AuthScreen.tsx`, `Dashboard.tsx`, `Sidebar.tsx`, `PricingModal.tsx`, `PlansGrid.tsx`, `SettingsPage.tsx`, `TemplatesPage.tsx`, `ConnectorsPage.tsx`, `Composer.tsx`, `ChatView.tsx`, `LoadingOverlay.tsx`, `LivePreviewCard.tsx`, reportedly `BottomNav.tsx`.
- Other: `src/lib/chat.ts`, `src/lib/costs.ts`, `src/lib/preview.ts`, `src/components/PublishMenu.tsx`.
- Backend: `server/db.js`, `server/pesapal.js`, `server/api.js`; Supabase functions `auth-signup`, `generate`, `pesapal`, `build-app`; migration `supabase/migrations/build_jobs_and_files.sql`.
- Parser/tests: `sse.ts`, `sse.test.mjs`; `.livetest/live.mjs`, `.livetest/full.mjs`, `.livetest/poll.mjs`. Worker: `worker/sse.mjs`, `server.mjs`, `package.json`, `README.md`, `render.yaml`. Config: `VITE_BUILD_WORKER_URL`, `ALLOWED_ORIGIN`.

## User preferences & rules
- Continue SwiftBuild AI; don’t replace architecture. Prioritize reliable OpenAI streaming/response handling.
- Google/email auth; exactly 15 free signup credits; Supabase, not SQLite; use `SUPABASE_URL`, `SUPABASE_ANON_KEY`; secrets `OPENAI_API_KEY`, `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`.
- Billing exactly five specified plans; remove old packages.
- Composer: plus, “Build a web...” prompt, Build/Plan/Chat (Build default), estimates, hamburger; Chat free, Plan 1–2 credits, Build task-weighted.
- Home prompts build directly in background with `gpt-6.1-sol`; no questions/question boxes. Remove Interactive Questionnaire Engine.
- Large projects modularly; ready within 60 seconds; visible live Stop; failed/cancelled builds not charged.
- Settings full-screen dark; only Home/Project bottom nav; remove My Apps. Keep heading above composer; handle keyboard behavior.
- Connector fields specific to service; Supabase labels “Supabase URL” and “Supabase Anon Key”.
- Secret Admin Panel/sidebar button only for Google account `nahumukisato@gmail.com`; enforce frontend/backend. Undo project deletion.
- OpenAI streaming and prompt caching; `index.html` fallback `<div id="root"></div>`; avoid long-running code risking timeouts; immediate React Sandbox preview after questionnaire answers.
- Below prompt: “Live Streaming Preview Renderer”; remove black curtain; stream (`stream: true`) into Sandbox Preview and progressively render React/HTML pages, images, buttons.
- User asked in Swahili to use a permanent build server, write/connect its Node worker, and help deploy it on Render.
