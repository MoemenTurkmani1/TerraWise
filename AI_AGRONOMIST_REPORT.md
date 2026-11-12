# AgriLumina AI Agronomist — free-only implementation report

Updated 2026-11-12. This supersedes the earlier OpenAI activation report.

## Delivered

The existing /agronomist interface, English/Arabic support, agricultural corpus, authentication, server-side field ownership and read-only farmer-data access were retained. A provider interface/registry now uses Google Gemini instead of the OpenAI-only transport. No OpenAI or Groq fallback is registered.

The selected model is exactly gemini-3.5-flash-lite, reviewed against Google's Free-tier pricing. Configuration rejects other models, deprecated aliases, unsupported providers, paid cost modes, missing credentials and unconfirmed Free accounts. The client requires free-only Gemini metadata in status and answers, so an older OpenAI-only endpoint cannot activate this UI.

The adapter uses a fixed Google HTTPS endpoint and a private server header. Existing strict agricultural instructions, minimized validated evidence, JSON schema, citation checks, numerical-output restrictions, timeouts and bounded inputs/outputs are preserved. There are no model tools, searches, paid add-ons or farmer-data mutations.

Free quota exhaustion produces English/Arabic guidance and a cooldown. If no retry header is readable, a five-minute cooldown is used. Account/region failures, unsupported output or unavailable Redis stop the request. There is no automatic provider retry, account upgrade, model fallback or key rotation.

## Required free services

| Service | Required plan | Limits / conditions |
| --- | --- | --- |
| Gemini Developer API | Free project, no linked billing | Lebanon is listed as supported. The selected model has free standard input/output. Actual RPM, TPM and RPD must be checked for the project/model in AI Studio; no numeric upstream quota is promised. |
| Upstash Redis | Free account, no payment method | Published limits: one database, 250 MB, 500K commands/month and 10 GB bandwidth/month. Adding a payment method automatically upgrades free resources to pay-as-you-go. |
| Supabase | Free organization/project | Published allowances include 500 MB database, 50K monthly active users, 5 GB egress and 500K Edge Function invocations/month. Inactivity can pause Free projects; exceeding quotas can restrict service. |
| Frontend | Existing local app or optional Cloudflare Pages Free static hosting | Local use needs no new host. Optional Pages static requests are free; use the free hostname without paid Functions/Workers, add-ons or a purchased domain. |

Official source links, the researched alternatives and complete setup steps are in [.docs/AI_AGRONOMIST.md](.docs/AI_AGRONOMIST.md).

Groq's Free tier is distinct from its paid Developer tier. The reviewed official material did not establish Lebanon eligibility as clearly as Google's published country list. Gemini is the practical selection for confirmed regional availability and structured responses. No live comparative benchmark establishes agricultural or Arabic-language superiority; scientific grounding and local agronomist review remain essential.

The atomic Redis solution already works on Free, so it was retained rather than replaced with weaker local counters or a new database migration. User limits remain four/minute and thirty/UTC day. Project limits are tightened to two/minute and twenty/UTC day; administrators can lower them. All counters are checked atomically across isolates. Redis errors and Free-service quota exhaustion fail closed.

## Exact server configuration

Required:
- AGRONOMIST_AI_PROVIDER=gemini
- AGRONOMIST_AI_MODEL=gemini-3.5-flash-lite
- GEMINI_API_KEY from a dedicated Gemini Free project
- AGRONOMIST_COST_MODE=free-only
- AGRONOMIST_FREE_TIER_CONFIRMED=true only after checking all service accounts and reviewing the Free data terms
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the Free account
- AGRONOMIST_ALLOWED_ORIGINS containing exact permitted frontend origins

Optional lower limits: AGRONOMIST_GLOBAL_RPM=1 or 2, AGRONOMIST_GLOBAL_RPD=1 through 20.

The server template defaults Free confirmation to false. Supabase supplies its existing project URL/public-key environment. No service-role key is needed. Old OpenAI settings are no longer read and were not deleted. Never place private credentials in chat, source code or VITE_ variables.

## Zero-charge boundary and privacy

Runtime API keys do not reveal account billing state. The confirmation flag is an operator attestation, not remote verification or a billing cap. Zero charges require accounts that remain Free, without linked billing/payment methods, paid subscriptions, trials or add-ons. The code cannot prevent the account owner from changing those external settings.

If an existing Supabase organization or another resource is already paid, this implementation does not cancel its bill or move production data. An approved Free account arrangement is needed before claiming zero total service charges. No perpetual free availability is promised: quota/entitlement failures disable the agent instead of purchasing capacity.

Gemini Free terms allow content to be used for product improvement. The composer discloses this in both languages. Avoid personal, sensitive or confidential information. Pasted credentials/emails are redacted; names, addresses, IDs, exact coordinates, attachments and free-text field notes are excluded from context. Paid-level privacy and uptime are not promised. A local model is a possible separate design if these terms are unsuitable, not an automatic fallback.

## Verification results

- npm test: 161 tests passed across 16 files, including the concurrent demo-mode additions.
- npm run typecheck: frontend and Edge Function checks passed.
- npm run build: production build passed; Vite reported a non-fatal chunk-size warning.
- scripts/qa-agronomist.mjs: synthetic desktop/Arabic mobile, unavailable service, citations, retry, free-quota cooldown, context reset and read-only checks passed.
- scripts/qa-auth.mjs: existing synthetic two-account separation, persistence, failure handling and stale-version conflict checks passed.
- Browser bundle inspection: no Gemini endpoint, private credential configuration, server key header or scientific prompt payload in frontend JavaScript.

The suite preserves ownership, injection-boundary and scientific tests and adds free-only activation, unsupported/paid model denial, quota/access/service failure handling, no alternate-provider calls, model substitution denial, stronger project limits, legacy paid-endpoint rejection and safe cooldown checks. External services are mocked; passing tests do not prove live provider quality, hosted RLS or real Redis concurrency.

## Remaining activation blockers

Verify the Free accounts and their active quotas, supply server credentials securely, obtain explicit approval for deployment, and test the hosted function with synthetic fields and separate non-production accounts. Native Edge bundling/gateway behavior and real service concurrency still need deployment-environment validation. Evaluate English/Arabic agricultural answers and adversarial requests with a local agronomist before release.

No deployment, SQL migration, database-policy change, production-data operation, billing activation, paid-resource creation or existing environment-secret modification was performed. Unrelated working-tree changes were preserved.
