<!-- genvibe-memory covers:I7zWH85iIKDXpXfB -->
## What this app is
SwiftBuild AI: a cloud-based, AI-powered IDE and app-builder website.

## Working (confirmed)
- TypeScript, SSE parser tests, build-app inspection, `.livetest` scripts, credit grep, `wc`/`grep`, and worker syntax checks passed. (check: listed commands exited 0)
- Live non-mocked `gpt-6.1-sol` streaming returned HTTP 200, 733 chunks, ~3.7k characters, `finish_reason: stop`, with no parser errors. (check: live OpenAI streaming test)
- `/` had no crash or failed backend request after tracked changes, including Preview/chime, chat/project-delete and six-agent changes. (check: crash checks on `/`)
- TypeScript checks passed after recorded Admin/theme, background-build/Projects, Preview, chat-bubble, Delete-all and insufficient-credit changes. (check: recorded TypeScript commands exited 0)
- `worker/server.mjs` and `worker/sandbox.mjs` syntax checks passed; sandbox test scripts exited 0. (check: recorded `node --check` and `/tmp/t.mjs`, `/tmp/t2.mjs` commands exited 0)

## Claimed, not yet confirmed
- Home prompt buttons, Templates, project creation/listing, Export ZIP, Sidebar/mobile layout, uploads, integrations, Publish, chime/notification, Preview, Code Viewer, element targeting, credits history, WhatsApp/currency ordering, voice input, client Preview sharing, and individual deletion reportedly implemented; behavior/visuals unverified.
- Preview uses a floating chat bubble; switching views/reopening projects reportedly avoids rebuilding if chat files exist. Chime and ready notification reportedly work with permission. Untested; closed-tab/browser behavior and phone untested.
- Worker reportedly supports parallel writing, Supabase job start/status/resume, success-only deductions and restart resumption. Full builds untested. Render requires `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ALLOWED_ORIGIN`; user says deployed at `https://swiftbuild-ai.onrender.com` with `VITE_BUILD_WORKER_URL`.
- Six-agent pipeline, Quick Edit routing, CORS, rich generation prompts, insufficient-credit behavior, Admin/theme/settings and other UI/backend changes are reported implemented but unverified. Render redeploy required for worker changes.
- `worker/sandbox.mjs` reportedly adds an isolated temporary project runner using a Node child process on the Worker, memory/time limits, cleanup, `npm install --ignore-scripts`, `npm run build`, and HTTP serving/probing where applicable. No Docker or real browser; no full build or Quick Edit tested. No `SUPABASE_SERVICE_ROLE_KEY` in test environment; nothing deployed. `jsdom` was added. Files reportedly changed: `worker/sandbox.mjs`, `worker/server.mjs`, `src/components/PipelineCard.tsx`, `src/lib/auth.ts`.

## Open bugs
- Unterminated JSON — reported 1×; tried: safe parser rewrite/redeployment.
- Multi-file build slow/stops — reported 5×; tried: resume/retry, timeout/silence changes, parallel generation, shorter files/planning.
- Live multi-file build incomplete/background job killed — reported 2×; tried: live test, claimed resume changes.
- Business builds generic — reported 1×; tried: claimed real multi-file generation.
- Stop unconfirmed — reported 1×; tried: claimed cancellation.
- Credit deductions too high/unclear/incorrect — reported 4×; tried: success-only charging, no charge on failure/stop, task-weighted/lower costs, resume; no OpenAI-cost remedy.
- Pricing/Credits modal cannot scroll — reported 2×; tried: inner/outer scrolling.
- Pricing showed six old packages — reported 1×; tried: claimed five-plan rebuild.
- Google sign-in redirects to localhost — reported 1×; tried: claimed origin-based redirect; Supabase URL unverified.
- Templates partial modal — reported 1×; tried: claimed dedicated page.
- Supabase Connector showed “Database” and one input — reported 1×; tried: claimed labeled fields.
- Dashboard spacing/keyboard overlap — reported 2×; tried: centered wrapper, flex, viewport adjustment.
- Worker fetch failed — reported 1×; tried: none.
- Mobile Publish clipped — reported 1×; tried: claimed scrollable placement.
- Admin credit changes unconfirmed — reported 1×; tried: claimed Supabase/ledger actions.
- Preview bar visibility request — reported 1×; superseded by chat-bubble request; unverified.
- Delete missing for entries — reported 1×; tried: claimed per-entry controls; active jobs reportedly still lack delete.
- Build engine lacks real sandbox execution and verified preview — reported 1×; tried: claimed Node child-process sandbox runner; no Render deployment or full build test.

## Design
- Compact dark graphite, electric-lime, Geist/Geist Mono; 100vh, fixed composer.
- Full-screen Templates; full-width service-specific Connectors; referral gift card above credits.
- User wants specific apps, visible chat, small inline loader; glass card and purple/blue aura claimed.
- Preview uses small floating Chat bubble. Publish dialog shows full project URL in first “LIVE SITE LINK” section, including Full-Screen Preview.
- Secrets/GitHub/Settings/tools/Admin/theme/Workspace redesign claimed, visually unverified. “...” menu must not damage backend services.

## Structure
- Frontend: `src/App.tsx`; libs `auth.ts`, `theme.ts`, `generator.ts`, `chime.ts`; components include `Dashboard.tsx`, `Sidebar.tsx`, `Composer.tsx`, `ChatView.tsx`, `PipelineCard.tsx`, `PricingModal.tsx`, `PlansGrid.tsx`, `SettingsPage.tsx`, `TemplatesPage.tsx`, `ConnectorsPage.tsx`, `LoadingOverlay.tsx`, `LivePreviewCard.tsx`, `PublishMenu.tsx`, `ProjectTools.tsx`, `Header.tsx`, `AdminPanel.tsx`.
- Backend: `server/`; Supabase functions `auth-signup`, `generate`, `pesapal`, `build-app`; migration `supabase/migrations/build_jobs_and_files.sql`.
- Worker: `worker/server.mjs`, `sandbox.mjs`, `sse.mjs`, `agents.mjs`, `package.json`, `README.md`, `render.yaml`; tests `sse.test.mjs`, `.livetest`.

## User preferences & rules
- Continue SwiftBuild AI; don’t replace architecture. Prioritize reliable OpenAI streaming.
- Google/email auth; exactly 15 free signup credits; Supabase, not SQLite; specified Supabase/OpenAI/Pesapal secrets.
- Exactly five billing plans; `$75` shows 800 under “Created,” not 1000.
- Composer: plus, “Build a web...” prompt, Build/Plan/Chat (Build default), estimates, hamburger; Chat free, Plan 1–2 credits, Build task-weighted.
- Home prompts build directly in background with `gpt-6.1-sol`; no questions; modular large projects, target 60 seconds, visible Stop; failures/cancellation uncharged.
- Don’t change credit deductions for Multi-Agent work. UI-only changes must not touch backend, Supabase, Pesapal, or Render Worker. Admin actions/stats only for `yohanakisato57@gmail.com`.
- Mobile Preview Publish popup centered, wide, internally scrollable. Replace Preview bottom bar/input with floating Chat bubble. Play completion sound outside app. Preserve backend/services. Individual Delete before each project; remove Delete all.
- User requested complete, polished apps; `gpt-4o` `max_tokens: 16000` or highest permitted; rich interactive UI, WhatsApp ordering when a number is supplied, matching user language.
- Keep building when credits are insufficient, then pause when exhausted and show payment button.
- Preserve six-agent architecture; do not reduce to three. Add a Central Orchestrator coordinating agents.
- New request: implement a secure isolated build runner compatible with Render Worker, without removing or reducing six-agent architecture.
