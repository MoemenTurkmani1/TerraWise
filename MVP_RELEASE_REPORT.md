# AgriLumina MVP release report

12 November 2026. Continuation of the existing Web MVP, extended at the owner's request with native Android and iOS targets. Existing uncommitted/staged AI Agronomist and isolated demo changes were retained. No production records, SQL migrations, RLS policies, provider settings, environment secrets or deployments were changed.

## Implemented and fixed

- Dashboard now shows the existing provisional pH/temperature screen instead of an unreachable full-ranking preview. Water suitability is explicitly unknown.
- Existing FAO-56 ETo and standard-condition wheat ETc tools are accessible from dashboard and general crop views, with editable completed-period dates, validation and optional sourced profile dates. The regional wheat reference remains explicit. Missing/unsupported daily ETo dates are explained and no incomplete seasonal total is reported.
- Crop window and regional-reference selections persist in the URL across reloads. The existing desktop/mobile field, screening, rotation and history workflows were retained.
- Real-workspace analysis saving now requires consistent historical NASA provenance, exact field coordinates, complete monthly data, the current evidence model, null overall scores and unknown water evidence. Legacy records remain stored unchanged.
- History has search by field, season/date and an empty-search state. Dashboard/history/export consistently reject unsupported source snapshots. A historical analysis with a removed field no longer opens a rotation for an unrelated fallback field.
- Workspace exports sanitize copies of unsupported overall/water scores, historical factors and compatibility claims. Isolated demo data retain their synthetic classification; they do not enter live account storage.
- Added application error recovery, clearer water-quality explanations, mobile touch targets/readability/date-input sizing and safe-area spacing. Mobile navigation has dialog semantics, focus containment, Escape close and restored opener focus.
- Split Supabase SDK into a separate bundle, removing the earlier oversized-chunk warning.
- Generated Android and iOS Capacitor projects sharing the existing React code. Added auth URL registration, callback route validation, session refresh on app resume/pause, Android back navigation and disabled web service-worker registration in native containers. Added native build/sync commands and signing-file exclusions. Android automatic backups are disabled.

## Verification

- Full automated suite: **190 tests passed across 20 files**. Includes new source/history/export, complete-water-period and native callback-boundary regressions, plus existing science, provider, account and demo tests.
- Frontend and backend-function TypeScript checks passed.
- Production build passed; the optimized build has no chunk over 500 kB. A separate provider chunk is approximately 192 kB and the main chunk approximately 346 kB before gzip.
- Production desktop/mobile fixture QA passed: empty workspace, field validation/persistence, API failure states, provisional screens, daily temperatures, ETo/ETc, manual balance, rotation saving/history and preservation of legacy records. Added assertions for water-tool discovery, crop-window persistence after reload and keyboard-friendly mobile menu closure.
- Expanded synthetic account QA passed: full water/Kc/irrigation, field, plan, analysis and preference persistence, reload, guest/two-account separation, failed reads/writes, retry, metadata refresh and stale-version protection. These are mock provider tests, not independent live RLS verification.
- Existing isolated demo QA passed on desktop/mobile for all three farms, missing-input handling, field CRUD, water, screening, rotation, analysis/history, export, reset/exit and zero external demo requests. Screenshots are under ignored `test-results/demo/`; the mobile dashboard was visually inspected.
- Capacitor project generation and final web-asset synchronization passed for Android and iOS.
- Android debug compile was attempted and stopped because Java/JAVA_HOME is unavailable. No APK/AAB was produced. iOS compilation/signing requires macOS/Xcode and was not run on this Windows machine. No IPA was produced.

The earlier unmocked NASA and read-only Supabase endpoint verification remains recorded in [FINAL_IMPLEMENTATION_REPORT.md](FINAL_IMPLEMENTATION_REPORT.md). This pass did not relabel fixture/browser evidence as live provider verification.

## Functional scope and release decision

The website's guest field entry/editing, persisted water inputs, dashboard/climate states, provisional crop screening, ETo/wheat ETc calculation, exploratory rotations and analysis history are verified through automated browser workflows. Account integration passes the synthetic provider tests; real signup/recovery, direct authenticated persistence/RLS isolation and cross-device behavior remain release gates. Previously owner-reported live account behavior is retained as reported evidence only.

**Ready for controlled website staging after host configuration and owner approval. Public production/account release remains gated. Native source projects are prepared and synchronized, but native binary/device/store release is not ready.** Follow [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) and [NATIVE_APPS.md](NATIVE_APPS.md).

Remaining gates: production-host SPA routing/HTTPS/cache verification; real account/provider isolation and recovery; privacy/account lifecycle/backup operations; Android JDK/SDK and macOS/Xcode builds; native device permission/export/session testing, signing and store artwork/metadata. Existing optional AI provider functionality requires its own hosted verification. Arabic/RTL and physical accessibility/browser checks remain incomplete.

Scientific limits remain unchanged: pH/temperature indices cover two factors only; wheat ETc describes standard conditions. Effective rainfall, actual stressed ET, runoff, net infiltration, capillary rise, drainage and locally reviewed depletion thresholds are required for water suitability. Local crop calendars, soil methods, pest/critical constraints, comparable water evidence and validation are required for full crop ranking. Unknown values remain unknown.
