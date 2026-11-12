# AgriLumina

AgriLumina is a mobile-first agricultural decision-support application built with React, Vite and TypeScript. It stores farmer-entered field and soil information and retrieves historical NASA POWER climate estimates for field coordinates. It provides a **provisional pH and temperature screening index** using documented FAO ECOCROP ranges, not trained AI, validated planting advice, yield or profit forecasts. Overall suitability and planting recommendations remain unknown because water compatibility and critical constraints are unassessed.

## Run locally

Install Node.js 20.19+ (20.x), 22.12+ (22.x), or 24+, then run in this directory:

```powershell
npm ci
npm run dev
```

Open the URL printed by Vite. New browser workspaces are empty; add a field, enter the actual coordinates, water availability and whatever soil and crop history you have, and run an analysis. NASA POWER requires network access but no API key. Farmer data is stored in the current browser unless an account project is configured.

```powershell
npm test
npm run build
npm run preview
```

On Windows, use `npm.cmd` in these commands if PowerShell blocks `npm.ps1`; changing the machine execution policy is unnecessary. For the browser regression test, start the preview in one terminal, then in another:

```powershell
$env:BASE_URL = 'http://localhost:4173'
node scripts/qa-real-data.mjs
```

The script uses isolated Microsoft Edge browser contexts and synthetic network fixtures only within the test. Set `BROWSER_PATH` for another installed Chromium executable. Earlier `qa-app`, `qa-fields`, `qa-decisions`, and `qa-analysis` scripts expect the former seeded demo and are historical checks, not current real-data acceptance tests.

For the account-workspace regression, start a **separate terminal** with process-only synthetic configuration; keep `.env.local` unchanged:

```powershell
$env:VITE_SUPABASE_URL = 'https://mock-terrawise.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_synthetic_terrawise_qa'
$env:VITE_SUPABASE_ANON_KEY = ''
npm.cmd run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Then run in another terminal:

```powershell
$env:BASE_URL = 'http://127.0.0.1:5179'
node scripts/qa-auth.mjs
```

The test intercepts synthetic account and NASA requests and verifies field/water/Kc, plan, analysis and preference persistence, guest/account separation and failure/conflict handling. It is not proof of live Supabase persistence or RLS. Close the mock server terminal after testing; its environment overrides must not be used for a production build.

To verify real public NASA responses through the application adapters, without a browser or account writes:

```powershell
node scripts/qa-water-live.mjs
```

This read-only check prints HTTP statuses, monthly/daily completeness, exact ETo values and an explicitly synthetic ETc illustration at a public test point. The complete season may have unknown ETo days; a successful API check does not manufacture a seasonal total. See [the final implementation report](FINAL_IMPLEMENTATION_REPORT.md) for the recorded 12 November results, **84 passing unit tests**, browser checks and successful production build.

## Sources, calculations and limitations

- NASA POWER monthly point endpoint requests T2M (°C), PRECTOTCORR (mm/day converted using actual days in each month to mm/month), ALLSKY_SFC_SW_DWN (MJ/m²/day converted to kWh/m²/day), and RH2M (%). One, three or five complete historical years can be requested. The latest year supplies provisional factor comparisons; earlier years are contextual. Data is gridded historical estimation, not a farm sensor or forecast. [NASA POWER monthly documentation](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/).
- Responses validate coordinates, years, units and all twelve months of core values; missing humidity is marked partial. A valid NASA response for the exact coordinates and year range may be cached in the current tab and is labeled with its original retrieval date. If no valid cache exists, failures and HTTP rate limits are reported and no climate, rankings or plans are substituted. Browser storage itself does not cryptographically authenticate a cached response against local tampering.
- pH, N/P/K, organic matter and optional sample/laboratory details come from the farmer. Unknown values remain null; mg/kg and the lab method matter. Soil reports can be locally attached with consent; they are not analyzed or synced to an account.
- A separate ECOCROP-based two-factor screen ranks up to four crops by the lower of pH fit and four-month historical temperature fit, using documented species-level ranges and a provisional interpolation. It requires both inputs and cannot establish overall suitability. The fixed interface windows are not verified crop growth periods. Other profile factors and historical weights use unvalidated starter assumptions and do not enter this index. Water, N/P/K and crop-family history are not scored by the screen; locally reviewed rules and a validated water balance remain necessary. See [the screening methodology](SCIENTIFIC_SCREEN_METHODOLOGY.md).
- An optional Bekaa Valley wheat study reference uses November–June over two historical years and can retrieve daily NASA POWER temperature extremes and meteorological inputs for a provisional FAO-56 ETo estimate. Standard-condition wheat ETc requires a complete, sourced farmer-entered Kc/stage profile. Effective rainfall, net irrigation and overall water suitability remain unknown. See [water and season methodology](WATER_AND_SEASON_METHODOLOGY.md).
- Field location and weather requests are sent to NASA; map tile requests go to OpenStreetMap. The application shell may be cached offline, but external API requests and personal data are not cached by the service worker.

For exact calculations and current verification results, read [FINAL_IMPLEMENTATION_REPORT.md](FINAL_IMPLEMENTATION_REPORT.md). For detailed source verification, legacy record handling, limitations and external prerequisites, read [REAL_DATA_AUDIT.md](REAL_DATA_AUDIT.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [PROJECT_SPEC.md](PROJECT_SPEC.md), and [REQUIREMENTS_GAP_ANALYSIS.md](REQUIREMENTS_GAP_ANALYSIS.md).

## Optional Supabase accounts

The app includes a Supabase email/password adapter and an owner-scoped workspace migration, but no project is configured by default. To enable and verify it:

1. Place `.env.local` in the project root, with `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy public `VITE_SUPABASE_ANON_KEY`); see [.env.example](.env.example). Restart Vite after changes. Do not share the file or paste keys in chat.
2. Run `npm run check:supabase`. This makes read-only endpoint probes and prints HTTP statuses, never configuration values or response bodies. Endpoint reachability alone does not verify an authenticated connection, migrations or RLS.
3. For a new disposable project only, review [the workspace migration](supabase/migrations/20261111_workspace.sql) in the SQL Editor. It creates a single owner-keyed JSON workspace, enables RLS, grants authenticated access and creates owner policies. Applying it is an operator setup action; this verification did not run it or change production data/policies. Do not rerun it on an existing project without separate review and authorization. If a table or policies already exist, review them first: `create table if not exists` does not validate an existing schema, and the migration replaces its named policies. Check for other permissive policies and grants, which may also grant access.
4. In Authentication, enable email/password registration and configure the site URL and allowed redirects for the exact local origin. For the default Vite origin these include `http://localhost:5173/login` and `http://localhost:5173/update-password`. Also add the equivalent `127.0.0.1` URLs if that is how you open the app. Review email confirmation and delivery settings.
5. Test sign-up, verification, sign-in, recovery, persistence across devices, anonymous access and isolation between two distinct accounts against your project. Do not treat client-side owner filtering as a substitute for RLS. Local guest data remains on its device and is not automatically transferred into an account workspace.

Never put a service-role key or other privileged secret in client-side code or `VITE_` variables. Fields (including soil inputs), plans, analyses and preferences are stored in one JSON workspace, rather than normalized production tables. Private cloud soil-report storage is **not implemented**; attachments remain browser-local and are unavailable in an account workspace. A non-executed [storage policy draft](supabase/planned/private_soil_reports.sql) is provided for later review. Before enabling storage, create a private bucket using the Dashboard, audit every applicable policy, implement explicit upload consent and metadata handling, and test two-account isolation. Account deletion, backups and governance are not implemented.

The reusable [client factory](src/services/supabaseClient.ts) accepts platform-specific authentication options. An Expo app will need its own supported persistent session storage, URL/base64 polyfills as necessary, mobile refresh lifecycle and deep-link configuration; the browser wrapper and its `window` redirects are not a complete native integration.

## Architecture

`src/pages` contains the screens, `src/context` workspace/auth state, `src/services/nasaPower.ts` the validated POWER adapter and tab cache, `src/services/repository.ts` browser field validation, `src/lib/fao56.ts` and `src/lib/cropWater.ts` the daily water-demand calculations, `src/services/nasaPowerWater.ts` the daily NASA water adapter, `src/services/supabaseWorkspace.ts` optional cloud persistence, `src/data/crops.ts` the unvalidated starter catalog, and `src/lib/recommendations.ts` the versioned independent rule engine. Unit test fixtures live in `src/test` and `*.test.ts` files; isolated local demo scenarios live in `src/data/demo.ts`. A Leaflet/OpenStreetMap point map and Recharts visualizations supply the map and charts.

This is not production-ready until agronomic validation, actual provider/RLS testing, privacy and legal review, monitoring/backups, Arabic/RTL, accessibility and physical-device checks are completed. No public deployment has been made.

## AI Agronomist

The read-only English/Arabic field assistant is available at /agronomist. Live responses require an approved Supabase Edge Function deployment, Gemini Free credentials, verified card-free Free service accounts and an Upstash Free durable usage limiter. Paid providers and automatic fallback are disabled. See [.docs/AI_AGRONOMIST.md](.docs/AI_AGRONOMIST.md) for configuration, security boundaries, scientific grounding and verification.

## Local Demo Mode

Run `npm run dev` and click **Try Demo Farm**. Switch between three clearly labeled synthetic farms, explore existing calculations and saved records, and use **Reset Demo Data** to start again. Demo data never synchronizes with real accounts. See [the local demo guide](LOCAL_DEMO_MODE.md) for features, scientific provenance, isolation and validation. Run `npm run qa:demo` against a running local server for desktop and mobile regression checks.

## Website and native mobile release

The current MVP improvements and native targets are documented in [MVP_RELEASE_REPORT.md](MVP_RELEASE_REPORT.md), [NATIVE_APPS.md](NATIVE_APPS.md), and [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md). The earlier scientific milestone report remains historical evidence. No public deployment or signed mobile release has been performed.
