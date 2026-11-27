<!-- genvibe-memory covers:3J22F64AIPpr31E9 -->
## What this app is
SwiftBuild AI: a cloud-based, AI-powered IDE and app-builder website.

## Working (confirmed)
- TypeScript, SSE parser, build-app inspection, `.livetest`, credit grep, `wc`/`grep`, and worker syntax checks passed. (check: listed commands exited 0)
- Live `gpt-6.1-sol` streaming returned HTTP 200, 733 chunks, ~3.7k characters, `finish_reason: stop`, no parser errors. (check: live OpenAI streaming test)
- `/` passed crash checks after tracked changes, including Preview/chime, chat/project-delete, six-agent changes, and the latest changes. (check: crash checks on `/`)
- Recorded TypeScript checks passed after Admin/theme, background-build/Projects, Preview, chat-bubble, Delete-all, and insufficient-credit changes. (check: recorded TypeScript commands exited 0)
- `worker/server.mjs` and `worker/sandbox.mjs` syntax checks and sandbox scripts passed. (check: recorded `node --check` and `/tmp/t.mjs`, `/tmp/t2.mjs` exited 0)
- Latest worker syntax check and recorded grep/line-count inspections exited 0. (check: latest recorded commands)

## Claimed, not yet confirmed
- Home prompts, Templates, project creation/listing, Export ZIP, responsive layout, uploads, integrations, Publish, chime, Preview, Code Viewer, targeting, credit history, WhatsApp/currency ordering, voice input, sharing, and individual deletion reportedly implemented; unverified.
- Preview chat bubble, no-rebuild reopening, notification, Quick Edit, CORS, generation prompts, credit behavior, Admin/theme/settings, sandbox runner, and Phase 1 changes are claimed; full builds and behavior unverified.
- Worker sandbox claim: isolated Node child-process runner with limits, cleanup, install/build and HTTP checks; `jsdom` added. No full build or deployment confirmed.
- Render deployment, CORS, `build_jobs` columns, and Worker health have agent-reported evidence only; real Build, Preview, Quick Edit, Bug Fix, and `VITE_BUILD_WORKER_URL` remain unverified. Worker needs `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ALLOWED_ORIGIN`; user reports `https://swiftbuild-ai.onrender.com`.
- E2B Project Execution Engine reportedly added in `worker/e2b.mjs`, `worker/server.mjs`, and `worker/render.yaml`; real E2B untested. `E2B_API_KEY` configuration is claimed.
- Single-Agent Builder reportedly replaces the six-agent pipeline in `worker/server.mjs` and removes its Chat UI. It reportedly makes one `gpt-4o` call (`max_completion_tokens: 16000`) to generate a self-contained `index.html`, with Tailwind/Lucide CDNs, inline data, shop/cart/search/category filters, and WhatsApp order buttons when a number is provided. Truncation may retry up to three times; E2B checks inline scripts and serves/checks the page. Real OpenAI/E2B/Supabase behavior is untested.
- Full Build requires login/credits; agent-reported unauthenticated request returned 401. Full Build remains untested.

## Open bugs
- Unterminated JSON — reported 1×; tried: parser rewrite/redeployment.
- Multi-file build slow/stops — reported 5×; tried: resume/retry, timeout, parallel generation, shorter files/planning.
- Multi-file build incomplete/background job killed — reported 2×; tried: live test, claimed resume.
- Business builds generic — reported 1×; tried: claimed multi-file generation.
- Stop unconfirmed — reported 1×; tried: claimed cancellation.
- Credit deductions unclear/incorrect — reported 4×; tried: success-only charging, no charge on failure/stop, task-weighted costs, resume.
- Pricing/Credits modal scroll; old pricing plans; Google localhost redirect; partial Templates; Connector fields; Dashboard spacing/keyboard overlap; clipped mobile Publish; Admin credits; Preview visibility; missing individual Delete — each reported 1–2×; respective claimed UI/auth fixes, unverified.
- Build engine lacks verified sandbox execution/preview — reported 1×; tried: Node child-process runner; no full build/deployment test.
- Worker fetch failed — reported 1×; tried: claimed CORS/Worker fix; fetch unverified.

## Design
- Compact dark graphite, electric lime, Geist/Geist Mono; 100vh, fixed composer.
- Full-screen Templates; service-specific Connectors; referral gift card above credits.
- Specific apps, visible chat, small inline loader; glass card and purple/blue aura claimed.
- Preview floating Chat bubble; Publish dialog shows full URL in “LIVE SITE LINK,” including Full-Screen Preview.
- Settings/tools/Admin/theme redesign claimed, visually unverified.

## Structure
- Frontend: `src/App.tsx`; libs `auth.ts`, `theme.ts`, `generator.ts`, `chime.ts`; components include Dashboard, Sidebar, Composer, ChatView, PipelineCard, PricingModal, PlansGrid, SettingsPage, TemplatesPage, ConnectorsPage, LivePreviewCard, PublishMenu, ProjectTools, Header, AdminPanel.
- Backend: `server/`; Supabase functions `auth-signup`, `generate`, `pesapal`, `build-app`; migration `supabase/migrations/build_jobs_and_files.sql`.
- Worker: `worker/server.mjs`, `sandbox.mjs`, `e2b.mjs`, `sse.mjs`, `agents.mjs`, `consistency.mjs`, `render.yaml`; tests include `sse.test.mjs`, `phase1.test.mjs`, `.livetest`.

## User preferences & rules
- Continue SwiftBuild AI; preserve architecture, Central Orchestrator, Project Execution Engine, deployment architecture. Replace the six-agent pipeline with one direct agent using the existing E2B Sandbox.
- Single agent should use one direct `gpt-4o` call with `max_tokens: 16000`, without Review/Debug/Testing loops, and generate a complete self-contained `index.html` with Tailwind and Lucide CDNs and inline data.
- Google/email auth; 15 free signup credits; Supabase, not SQLite; specified Supabase/OpenAI/Pesapal secrets.
- Exactly five plans; `$75` shows 800 under “Created,” not 1000. Composer: plus, “Build a web...”, Build/Plan/Chat (Build default), estimates, hamburger; Chat free, Plan 1–2 credits, Build task-weighted.
- Home prompts build directly in background with `gpt-6.1-sol`; no questions; modular apps, target 60 seconds, visible Stop; failures/cancellation uncharged. Don’t change Multi-Agent deductions.
- UI-only changes must not touch backend/Supabase/Pesapal/Worker. Admin only for `yohanakisato57@gmail.com`. Preserve services; individual Delete, no Delete all.
- Keep building if credits insufficient, pause when exhausted, show payment button. Complete polished apps; WhatsApp ordering when number supplied; match user language.
- Audit-only requests: inspect/report evidence, no changes or deployment without approval. User requested secure Render-compatible E2B sandbox integration using `process.env.E2B_API_KEY`.
