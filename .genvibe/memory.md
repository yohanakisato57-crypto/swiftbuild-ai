<!-- genvibe-memory covers:hxj4oICDCvMGH6MN -->
## What this app is
SwiftBuild AI: a cloud-based, AI-powered IDE and app-builder website.

## Working (confirmed)
- TypeScript, SSE parser tests, build-app inspection, `.livetest` scripts, credit grep, latest `wc`/`grep`, and worker syntax checks passed. (check: listed commands exited 0)
- Live non-mocked `gpt-6.1-sol` streaming returned HTTP 200, 733 chunks, ~3.7k characters, `finish_reason: stop`, with no parser errors. (check: live OpenAI streaming test)
- `/` had no crash or failed backend request after tracked changes, including the latest Preview and chime changes. (check: crash check on `/`)
- TypeScript checks passed after tracked Admin/theme, background-build/Projects, and latest Preview changes. (check: recorded `npx tsc` commands exited 0)
- `Dashboard.tsx` passed the targeted TypeScript check after the Delete all change. (check: targeted `npx tsc` command exited 0)
- `Dashboard.tsx` and `ChatView.tsx` passed the targeted TypeScript check after Preview/chat-bubble changes. (check: targeted `npx tsc` command exited 0)
- `/` had no crash or failed backend request after Preview/chat-bubble changes and after latest chat/project delete changes. (check: crash checks on `/`)

## Claimed, not yet confirmed
- Home prompt buttons, Templates navigation, project creation/listing, Export ZIP, Sidebar layout, mobile responsiveness, image uploads, integrations, Publish, completion chime, Preview, Code Viewer, element targeting, credits history, WhatsApp/currency ordering, voice input, client Preview sharing, and individual project deletion are reportedly implemented; behavior/visuals unverified.
- Project and chat entries reportedly have individual Delete buttons before their names; Delete all was removed. Active “Building...” jobs reportedly still lack a delete button. Changed `src/lib/chat.ts`, `src/components/Dashboard.tsx`; not browser-tested.
- Preview and Full-Screen Preview reportedly replace the bottom bar and input with a fixed circular chat bubble (`bottom-5 left-5`, `w-12 h-12`). Switching views or reopening a project reportedly does not start a new build if chat files exist. Changed `src/components/Dashboard.tsx`, `src/components/ChatView.tsx`; not browser-tested.
- Completion chime and “Your project is ready” notification reportedly work; notifications require permission and do not work if the tab is closed or browser terminated. Phone behavior untested. Changed `src/lib/chime.ts`.
- Worker reportedly supports parallel writing, Supabase job start/status/resume, success-only deductions, and restart resumption. Full builds untested. Render setup requires `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ALLOWED_ORIGIN`; user says deployed at `https://swiftbuild-ai.onrender.com` with `VITE_BUILD_WORKER_URL`.
- Build requests reportedly route through `src/lib/auth.ts`; Chat/Plan use Supabase `generate`. Background jobs reportedly persist and survive navigation; cancellation only via Stop. Untested.
- Secrets/GitHub full-page views, Workspace menu/tool views, Admin Panel, theme toggle, and single-view Chat/Preview/Code tabs reportedly implemented; unverified.
- Admin Panel reportedly uses Supabase and `credit_ledger`, blocks negative balances, and restricts actions to `yohanakisato57@gmail.com`; browser behavior unverified.
- Publish dialog reportedly shows a full project URL; fallback `https://[project-name].swiftbuild.app` requires configured domain and DNS. Changed `src/components/PublishMenu.tsx`; unverified.
- `$75` package reportedly changes “Created” from 1000 to 800; server-side function requires redeployment. Changed `supabase/functions/pesapal/index.ts`, `src/components/PlansGrid.tsx`; unverified.
- Multi-Agent pipeline reportedly added in `worker/server.mjs`: `gpt-4o-mini` Orchestrator/Planning classifies Quick Edit vs Full Build; `gpt-4o` Coding Agent writes files in parallel; `gpt-4o-mini` Debug Agent checks files and saves fixes to Supabase. Quick Edit reportedly targets only `index.html`. Chat reportedly displays four pipeline stages through Live Preview Ready. Changed `worker/server.mjs`, `src/lib/auth.ts`, `src/components/PipelineCard.tsx`, `src/components/ChatView.tsx`. Functional behavior untested; listed inspections exited 0.

## Open bugs
- Unterminated JSON — reported 1×; tried: safe parser rewrite/redeployment; untested.
- Multi-file build slow/stops — reported 5×; tried: resume/retry, timeout/silence changes, parallel generation, shorter files/planning; latest untested.
- Live multi-file build incomplete/background job killed — reported 2×; tried: live test and claimed resume changes; untested.
- Business builds generic/example-like — reported 1×; tried: claimed real multi-file generation.
- Generation Stop unconfirmed — reported 1×; tried: claimed cancellation control.
- Credit deductions too high/unclear or incorrect — reported 4×; tried: success-only charging, no app-credit charge on failure/stop, task-weighted/lower costs, resume changes; no OpenAI-cost remedy.
- Pricing/Credits modal cannot scroll — reported 2×; tried: inner-panel and outer-modal scrolling.
- Pricing showed six old packages — reported 1×; tried: claimed five-plan rebuild.
- Google sign-in redirects to `localhost:3000` — reported 1×; tried: claimed origin-based redirect; Supabase URL unverified.
- Templates partial modal — reported 1×; tried: claimed dedicated page.
- Supabase Connector showed “Database” and one input — reported 1×; tried: claimed labeled URL/Anon Key fields.
- Dashboard heading/prompt overlap or spacing fails, especially with mobile keyboard — reported 2×; tried: centered wrapper, vertical flex, visible-viewport adjustment.
- App could not reach `https://swiftbuild-ai.onrender.com` (“Failed to fetch”) — reported 1×; tried: none.
- Publish popover clipped on mobile — reported 1×; tried: claimed fixed, scrollable placement; unverified on phone.
- Admin credit add/deduct not confirmed to update Supabase — reported 1×; tried: claimed database actions and `credit_ledger`; unverified.
- Preview bottom bar requested to remain visible in full-screen Preview — reported 1×; tried: claimed fixed bar and frame adjustment; superseded by chat-bubble request, unverified on phone.
- Delete button not available for every project/chat entry — reported 1×; tried: claimed per-entry controls; active “Building...” jobs reportedly still lack delete; untested.

## Design
- Compact dark graphite, electric-lime, Geist/Geist Mono; 100vh and fixed composer.
- Full-screen Templates; full-width Connectors with service-specific fields; referral gift card above credits.
- User wants specific real apps, visible chat, small inline loader; claimed glass card and purple/blue pulsing aura.
- Templates request relevant real photography and interactive, scrollable live previews.
- Completion sound requested as short rising C5/G5 chime, automatically played and always on, including when outside the app.
- Preview and Full-Screen Preview requested to use a small floating Chat bubble instead of the long input and bottom bar.
- Publish dialog should show a full project link in its first “LIVE SITE LINK” section, including in Full-Screen Preview.
- Secrets, GitHub, Project Settings, tool views, Admin Panel, theme toggle, and Workspace redesign are claimed, not visually verified.
- “...” menu should be professional and must not damage backend, Supabase, Pesapal, or Render Worker.

## Structure
- Frontend: `src/App.tsx`, `src/lib/auth.ts`, `src/lib/theme.ts`, `src/lib/generator.ts`, `src/lib/chime.ts`; components include `Dashboard.tsx`, `Sidebar.tsx`, `Composer.tsx`, `ChatView.tsx`, `PipelineCard.tsx`, `PricingModal.tsx`, `PlansGrid.tsx`, `SettingsPage.tsx`, `TemplatesPage.tsx`, `ConnectorsPage.tsx`, `LoadingOverlay.tsx`, `LivePreviewCard.tsx`, `PublishMenu.tsx`, `ProjectTools.tsx`, `Header.tsx`, `AdminPanel.tsx`.
- Backend: `server/`; Supabase functions `auth-signup`, `generate`, `pesapal`, `build-app`; migration `supabase/migrations/build_jobs_and_files.sql`.
- Worker: `worker/server.mjs`, `sse.mjs`, `package.json`, `README.md`, `render.yaml`. Tests: `sse.test.mjs`, `.livetest`.

## User preferences & rules
- Continue SwiftBuild AI; don’t replace architecture. Prioritize reliable OpenAI streaming.
- Google/email auth; exactly 15 free signup credits; Supabase, not SQLite; specified Supabase/OpenAI/Pesapal secrets.
- Billing exactly five specified plans; remove old packages. `$75` package should show 800 under “Created,” not 1000.
- Composer: plus, “Build a web...” prompt, Build/Plan/Chat (Build default), estimates, hamburger; Chat free, Plan 1–2 credits, Build task-weighted.
- Home prompts build directly in background with `gpt-6.1-sol`; no questions/question boxes. Modular large projects; target 60 seconds; visible Stop; failed/cancelled builds not charged.
- Do not change the current credit-deduction system while introducing the requested Multi-Agent AI Architecture in `worker/server.mjs` and Chat UI.
- UI-only changes: don’t touch backend, Supabase, Pesapal, or Render Worker. Admin Panel request specifies working Supabase database actions and detailed stats, visible only to `yohanakisato57@gmail.com`.
- Preview mobile Publish popup must be centered, wide enough, and internally scrollable.
- Replace the Preview and Full-Screen Preview bottom bar and `Ask SwiftBuild...` input with a small floating Chat bubble.
- Play the project-completion sound even when the user is outside the app.
- Do not damage backend, Supabase, Pesapal, or Render Worker.
- Each project should have an individual Delete button before it; remove Delete all.
