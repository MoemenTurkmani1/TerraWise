# Activate the real AI Agronomist locally

Verified 12 November 2026. This guide runs the existing field-aware agent with real Gemini generation after you supply credentials. It does not deploy, enable billing, create resources automatically or modify farmer records/policies.

## Exact diagnosis

The configured project's `/functions/v1/ai-agronomist` preflight returned HTTP **404**. The browser previously invoked that hosted endpoint, so it could not reach the server. Hosted secrets cannot be inspected through the public client key; no claim is made about their state.

Locally, `supabase/functions/.env.local` did not exist. Gemini credentials, Upstash URL/token and the free-account confirmation were missing. Docker, Deno and the Supabase CLI were not detected. The application already implements Gemini (`gemini-3.5-flash-lite`) with server-only credentials, structured grounded output, strict scientific validation and no paid fallback. Groq is not implemented or silently selected.

## What was configured in this workspace

- A development-only Vite endpoint at `/local-ai-agronomist` runs the same `createAgronomistHandler` used by the Edge Function. The agent was not rebuilt.
- It accepts only loopback network clients and loopback Host headers. Normal origin checks, real Supabase `/auth/v1/user` verification, caller-JWT RLS reads, explicit field ownership, context minimization, NASA calculations, atomic Redis quotas and response validation all remain in place.
- The frontend uses the local endpoint only when Vite is in development mode, the hostname is loopback, and `VITE_AGRONOMIST_LOCAL=true`. Production builds continue using the hosted Supabase function. There is no configurable third-party endpoint receiving session tokens.
- Created ignored `.env.development.local` with only the public local-routing switch. The existing root `.env.local` was left unchanged.
- Created ignored `supabase/functions/.env.local` from the server template, with blank credentials and `AGRONOMIST_FREE_TIER_CONFIRMED=false`. No secret has been supplied or verified.
- Added `npm run check:agronomist`, which prints presence/status labels and a read-only hosted preflight status, never keys, tokens, project URLs or response bodies.

## Manual activation, one step at a time

1. Open [Google AI Studio](https://aistudio.google.com/api-keys). Select or create a dedicated project only through a genuinely Free option. Confirm Free-tier access to **gemini-3.5-flash-lite**. Do not enable billing, link a payment method or accept a paid upgrade. If this model has no free quota for your account/region, stop; the app will not select an alternative automatically.
2. Create a Gemini API key for that Free project. Save it **only** as `GEMINI_API_KEY` in `supabase/functions/.env.local`. Never put it in root `VITE_` variables, source files, chat, screenshots or a terminal command. Google's Free terms permit product-improvement use; do not submit sensitive/confidential farmer information.
3. The existing distributed limiter requires an [Upstash Redis Free database](https://upstash.com/pricing/redis). Use an existing Free database or manually create one only if its plan remains Free with no paid upgrade/payment method. Put its REST URL and REST token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in that same server-only file. There is no requirement to buy Redis or disable the limiter for local use.
4. Confirm that the intended Supabase account/project is also on the Free plan. Root `.env.local` already contains the public connection; do not replace it or run migrations. If it is paid, do not attest that the whole setup is free. Resolve the account/project arrangement manually before proceeding.
5. In `supabase/functions/.env.local`, keep these values exactly, fill the three credentials above, and set confirmation to true **only after you verified the actual account plans**:

   ```dotenv
   AGRONOMIST_AI_PROVIDER=gemini
   AGRONOMIST_AI_MODEL=gemini-3.5-flash-lite
   AGRONOMIST_COST_MODE=free-only
   AGRONOMIST_FREE_TIER_CONFIRMED=true
   AGRONOMIST_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
   AGRONOMIST_GLOBAL_RPM=2
   AGRONOMIST_GLOBAL_RPD=20
   ```

   Confirmation is an operator assertion, not a remote billing detector. Limits cannot increase above the reviewed defaults. Missing secrets or invalid free configuration leave AI unavailable.
6. Run `npm.cmd run check:agronomist`. It should report the three credentials present and the free-only configuration accepted. The hosted preflight may still report 404: that is expected for local testing and does not require a deployment.
7. Start or restart Vite after changing the configuration:

   ```powershell
   npm.cmd run dev -- --host 127.0.0.1
   ```

   Open `http://127.0.0.1:5173`. Use that machine's loopback browser, not a phone's LAN address, a remote tunnel or a native container. Production/native remote access requires a separately approved hosted function. If port/origin changes, update the server's exact origin list and restart. Secrets are loaded on the first local API request and retained until restart.
8. Exit Demo Mode, sign in with your real account, and select a field already saved/synced to that account. Guest-only fields cannot satisfy ownership checks and are not auto-uploaded. Open AI Agronomist and click **Check connection again**. Ready status verifies configuration/auth access, not provider entitlement; the first question verifies actual generation.
9. Ask a small grounded question such as **“Explain the missing water-balance evidence for this field.”** The request reads the account workspace, recomputes evidence, consumes a quota slot in Redis and calls Gemini. It does not write the farmer workspace. Verify that the returned answer identifies missing inputs and citations. Free-quota, access, network or unsupported-output failures must remain visible; do not replace them with fabricated content or a paid model.

If step 9 fails, report only the UI error code/message; never share credentials or raw request headers. `FREE_QUOTA_EXHAUSTED` means wait for reset. `LIMITER_UNAVAILABLE` means check the Free Redis credentials/availability. `AUTH_REQUIRED` means sign in again. `FIELD_NOT_FOUND` means the selected field is not in the authenticated workspace. `UNSUPPORTED_ANSWER` means the scientific/output guard rejected the provider response; no verified answer is available for that attempt.

## Deployment and alternative local runtime

**No Edge Function deployment is required for the local Vite workflow.** No new CLI, Docker engine, service-role key or local database migration is needed. Local authentication and workspace reads still use the existing configured Supabase project; Gemini, NASA and Free Redis still require internet access.

The official Supabase local Edge runtime is an alternative once Docker and Supabase CLI are installed; it is not necessary for this workflow. Running a separate local Supabase stack would require its own test accounts/data and was not performed.

For a production website or native apps, an approved hosted backend is required. The Vite endpoint is absent from production and inaccessible over LAN. Later, with explicit approval, deploy the existing `ai-agronomist` function to a confirmed Free Supabase project, set server secrets there, and configure exact production origins. Retain authentication, ownership checks, free-only activation and Redis limits. Hosted secrets/deployment do not automatically inherit local `.env.local` files. No deployment was performed in this task.

## Verification and free-service boundaries

- Full suite: **194 tests passed in 22 files**, including existing provider/ownership/scientific/quotas tests and new local-route/network/auth/request-size tests.
- Frontend and server TypeScript checks and production build passed.
- Redacted diagnostic confirmed the missing hosted endpoint and credentials; no live model generation, live Redis operation or account billing status was verified.
- Local secret files are ignored. Server Gemini transport, key header and prompt configuration are not included in frontend bundles.

Sources checked: [Gemini pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite) lists Free input/output for the selected model; [Upstash pricing](https://upstash.com/pricing/redis) lists a $0 tier with bounded commands/storage; [Supabase local development](https://supabase.com/docs/guides/functions/development-environment) describes the official CLI/runtime alternative. Free services have eligibility and quotas; indefinite availability or free capacity at production scale is not guaranteed. The code cannot infer billing status from an API key.
