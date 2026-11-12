# AgriLumina AI Agronomist — free-only operation

The existing /agronomist interface now uses a provider abstraction with a Gemini adapter. OpenAI is not an enabled provider or fallback. The agricultural corpus, field ownership checks, scientific calculations, English/Arabic UI, and read-only farmer-data boundary are retained.

## Selected free services and Lebanon availability

Research reviewed on 2026-11-12; recheck account dashboards and official terms before activation.

| Purpose | Selected service | Free limits / conditions |
| --- | --- | --- |
| AI | Google Gemini Developer API Free tier, gemini-3.5-flash-lite | Google lists Lebanon as supported. Standard text input/output are listed as free. Actual RPM, input TPM and RPD are model/project-specific; view the active limits in AI Studio. A free quota may be unavailable or lower than expected for an account. |
| Durable abuse protection | Upstash Redis Free account | Published plan: one database, 250 MB, 500,000 commands/month, 10 GB bandwidth/month. Use an account without any payment method. Adding a payment method automatically upgrades free resources to pay-as-you-go. Exceeded free limits can stop requests. |
| Auth, workspace, backend | Supabase Free organization/project | Published allowances include 500 MB database, 50,000 monthly active users, 5 GB egress and 500,000 Edge Function invocations/month. Inactivity can pause a Free project after one week. Quota excess can restrict service. |
| Frontend | Existing local Vite app | No new hosting service is necessary for local use. |
| Optional public static frontend | Cloudflare Pages Free, default pages.dev hostname | Static asset requests are free/unlimited; Free build limits include 500 builds/month and 20,000 files. Upload only the existing dist output; no Pages Functions, paid Workers, paid domain or add-ons are required. |

Sources:
- [Gemini regions](https://ai.google.dev/gemini-api/docs/available-regions), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [billing](https://ai.google.dev/gemini-api/docs/billing), [active limits](https://ai.google.dev/gemini-api/docs/rate-limits).
- [Upstash pricing](https://upstash.com/pricing/redis), [payment-method upgrade policy](https://upstash.com/docs/redis/howto/upgrade-database), [free-limit handling](https://upstash.com/docs/redis/help/faq).
- [Supabase pricing](https://supabase.com/pricing), [Free-plan cost control](https://supabase.com/docs/guides/platform/cost-control), [quota restrictions](https://supabase.com/docs/guides/platform/billing-faq).
- [Cloudflare static pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Free limits](https://developers.cloudflare.com/pages/platform/limits/).

Groq was investigated as an alternative. Its **Free** tier is distinct from its paid, usage-billed **Developer** tier ([billing FAQ](https://console.groq.com/docs/billing-faqs), [rate limits](https://console.groq.com/docs/rate-limits)). The reviewed official material did not establish Lebanon-specific eligibility as clearly as Google's country list. It is not selected or automatically called. No comparative agricultural/Arabic benchmark has been run; Gemini is the practical selection based on confirmed published regional availability and schema support, not a claim of proven agronomic superiority.

## Conditions for zero service charges

Use only the Free accounts above, without cards, linked billing accounts, paid trials or add-ons. A Gemini API key inherits its project's billing state; calling a normally free-capable model through a billed project is not this configuration. Do not enable Google Cloud billing or a trial. Keep Supabase on Free and Upstash on an account without payment methods.

The application cannot query account billing status using the runtime API keys. The explicit free-tier confirmation below is an operator attestation, **not remote verification or a billing cap**. If an existing account is paid, the strict zero-total-charge requirement is not met until the user arranges an approved Free setup. Do not downgrade, move or delete existing production resources automatically.

The code never upgrades accounts, switches providers/models, or invokes a paid add-on. If free access disappears, quota runs out, account/region access fails, or the limiter is unavailable, the agent stops with an error. Availability is sacrificed rather than purchasing capacity. Provider policies and free entitlements can change; there is no promise of perpetual free availability.

## Server-only configuration

Use supabase/functions/.env.example as the template for an ignored local env file or a secure secret store. Never paste keys into chat, source code, commands that expose values in history, or VITE_ variables.

| Variable | Value / meaning |
| --- | --- |
| AGRONOMIST_AI_PROVIDER | gemini |
| AGRONOMIST_AI_MODEL | gemini-3.5-flash-lite; exact reviewed allowlisted model, no latest aliases |
| GEMINI_API_KEY | A private API key from a dedicated Gemini Free project without linked billing |
| AGRONOMIST_COST_MODE | free-only |
| AGRONOMIST_FREE_TIER_CONFIRMED | true only after checking Gemini, Upstash and Supabase are Free/card-free and reviewing the free data terms; template defaults to false |
| UPSTASH_REDIS_REST_URL | HTTPS root endpoint of the Free Redis database |
| UPSTASH_REDIS_REST_TOKEN | Server token allowing EVAL/GET/INCR/EXPIRE |
| AGRONOMIST_ALLOWED_ORIGINS | Exact comma-separated frontend origins without trailing slashes or wildcards |
| AGRONOMIST_GLOBAL_RPM | Optional lower project limit; integer 1–2, default 2 |
| AGRONOMIST_GLOBAL_RPD | Optional lower project limit; integer 1–20, default 20 |

Supabase supplies SUPABASE_URL and a public key: the handler prefers SUPABASE_PUBLISHABLE_KEY, then the default entry of SUPABASE_PUBLISHABLE_KEYS JSON, then SUPABASE_ANON_KEY. It rejects service-role/secret keys. These keys keep RLS active with the caller's JWT.

The frontend continues using the existing VITE_SUPABASE_URL and public publishable/anon key. Old OPENAI_API_KEY / OPENAI_MODEL values are no longer read by the function and cannot activate a paid path. Existing secrets are not deleted or modified by this implementation.

## Activation steps — manual review, not executed

1. In Google AI Studio, create/select a dedicated Free project for the Lebanon account. Verify its billing state, no linked Cloud Billing account, and positive active quota for the exact selected model. Create the key and keep it in a password manager/secret manager. Do not click Set up billing or start a trial.
2. Create/select a dedicated Upstash Free database under an account with no payment method. Confirm the Free plan and save its REST URL/token securely. The existing atomic limiter is already compatible; no new database migration or in-memory replacement is needed.
3. Verify the existing Supabase organization's plan is Free. Review the current workspace RLS separately. Do not create a paid organization or modify existing farmer data.
4. Set the server values above through Supabase Edge Function Secrets using the dashboard/secure secret-file workflow. Review free-tier data use and set AGRONOMIST_FREE_TIER_CONFIRMED=true only after the account checks. Configure allowed origins for the intended local/static frontend.
5. Only with explicit deployment approval, deploy the existing ai-agronomist function. Its configuration preserves verify_jwt=true. No SQL migration, reset or production seed is required.
6. Test using non-production users and synthetic fields: own-field access, denial of another owner's field, English and Arabic soil/ETo questions, missing inputs, unsupported planting recommendations, provider quota exhaustion and Redis failures. Monitor the account Free dashboards. A GET status only confirms configuration, not live key/quota validity.

No step has been executed against provider accounts or production by this change. Native Supabase bundling/gateway validation, live provider quality and actual Redis concurrency tests remain release checks.

## Architecture, security and quotas

The Edge Function verifies the Supabase user online and reads the workspace through the verified user's JWT/public key. It checks owner_id again and permits exactly one selected, non-archived owned field. The browser cannot provide trusted field context, an owner override, a privileged message role or a write action.

provider.ts selects an explicitly registered provider; providerConfig.ts enforces free-only activation and the reviewed model. gemini.ts uses a fixed Google HTTPS generateContent endpoint, a private x-goog-api-key header, one candidate and JSON-schema output. No keys appear in query strings. There are no tools, searches, caches, provider-managed conversations, paid routes, or automatic retries/fallbacks. A reported substitution to another model family is rejected.

answer.ts supplies the existing strict agriculture instruction/context and verifies the resulting schema, evidence IDs and safe output. The browser validates the entire response before rendering, including explicit free-only Gemini provider/model metadata. An older OpenAI-only endpoint cannot activate this UI. Common pasted credentials/emails are redacted. Names, addresses, account/field IDs, exact coordinates, reports, laboratory names and free-text field notes are excluded from provider context.

Gemini Free terms allow submitted content to be used to improve products. This is disclosed in English and Arabic beside the composer. Avoid personal, confidential or sensitive information. This free option does not provide the paid tier's data-use terms. Consider a separately designed local model if these terms are unsuitable; there is no automatic local or paid fallback.

The atomic Redis Lua operation retains per-user limits of four/minute and thirty/UTC day, and tightens project limits to two/minute and twenty/UTC day by default. Administrators can lower the project limits. All counters are checked and incremented atomically across isolates; denied requests do not increment another counter. There is no permissive local-memory fallback. Counter keys are hashed and expire; farmer data and chat are not stored in Redis.

These app caps are not Google's published quota or a billing safeguard. They can still exceed an account's token quota or interact with other applications sharing that project. Use a dedicated Free project; a Google quota error returns FREE_QUOTA_EXHAUSTED and Retry-After. Google daily quota resets follow Pacific time; local app counters use UTC. No scheduled retry or key rotation bypasses provider limits.

Requests retain the 16 KiB body bound, 1,500-character question limit and at most four history messages. The client drops older pairs when multibyte text would exceed the byte bound. Provider input is additionally bounded to 80,000 bytes, output to 1,400 tokens, and upstream JSON to bounded sizes. Existing total/upstream timeouts, no-store responses and exact-origin CORS remain. Gemini free content processing/retention is governed by Google's terms; no zero-retention promise is made.

## Scientific capabilities and limits

The curated versioned corpus remains FAO Paper 56, soil chemistry/quality/salinity/rotation references, NASA POWER, existing ECOCROP transcriptions, Bekaa wheat research and LARI referral resources. There is no live LARI warning feed or model web browsing.

The server recomputes results from authorized current inputs using existing functions. It distinguishes farmer entries, historical NASA estimates, AgriLumina calculations, scientific reference values and unknowns. Old browser-saved scores are not promoted to verified science.

The pH/temperature screen is provisional and not a complete planting recommendation. Full-period ETo requires complete daily inputs/elevation. ETc also requires a complete sourced growth-stage/Kc profile. Recorded/planned applied irrigation is not available supply or net infiltration. Missing evidence stays unknown; irrigation/fertilizer/pesticide/planting prescriptions are not produced.

Numerical literals, forged citations, arbitrary links, malformed/refused/incomplete output and common direct planting directives are rejected. This cannot prove every qualitative sentence is supported. Expert agronomic review and live Arabic/English/adversarial evaluation remain necessary; no clinical or agronomic quality guarantee comes from passing mocked tests.

## Validation

Run npm test, npm run typecheck and npm run build. The build checks both frontend and Edge Function TypeScript. Security tests cover authentication, owner isolation, injection boundaries, free-only activation, quota refusal/outages, no paid fallback, provider substitution, missing science and unsupported output.

For synthetic browser QA, start Vite with public mock Supabase configuration:
VITE_SUPABASE_URL=https://mock-terrawise.supabase.co and VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_qa. Run scripts/qa-agronomist.mjs and scripts/qa-auth.mjs with BASE_URL pointing to that local server. These scripts intercept external services and do not establish live provider or hosted RLS correctness.

Final verification: 161 tests passed across 16 files; frontend/backend TypeScript checks and the production build passed. Synthetic agronomist browser QA, free-quota cooldown and two-account authentication regression QA passed. No live provider or hosted billing/RLS behavior was verified.

See AI_AGRONOMIST_REPORT.md for the final results and remaining blockers.

## Local activation update

The hosted function currently returns 404. A development-only loopback Vite endpoint now runs the same authenticated handler without deployment or Docker. See [AI_LOCAL_ACTIVATION.md](../AI_LOCAL_ACTIVATION.md) for exact findings, ignored server configuration and manual Free-account steps. Latest verification: 194 tests in 22 files and production build passed. No live generation or hosted deployment was performed.
