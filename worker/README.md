# SwiftBuild worker (seva ya kudumu)

Node server isiyo na kikomo cha muda. API ni ile ile ya `build-app` (`start`, `status`, `resume`).

## Environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API; usiweke kwenye app)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (hiari, default `gpt-6.1-sol`)
- `ALLOWED_ORIGIN` (hiari, mfano `https://yourapp.genvibe.app`)
- `MAX_FILES` (hiari, default 6)

## Kuweka (Railway / Render / Fly.io)
1. Weka folda `worker/` kwenye repo (au huduma ichukue folda hiyo).
2. Build: `yarn install` (au `npm install`), Start: `node server.mjs`.
3. Weka env vars hapo juu.
4. Pata URL (mfano `https://swiftbuild-worker.onrender.com`) na nitumie, niunganishe app.

Jaribio: `GET /` hurudisha `{ ok: true }`.
