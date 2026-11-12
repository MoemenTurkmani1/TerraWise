# TerraWise

TerraWise is a mobile-first agricultural decision-support application built with React, Vite and TypeScript. It stores farmer-entered field and soil information and retrieves historical NASA POWER climate estimates for field coordinates. It provides a **provisional pH and temperature screening index** using documented FAO ECOCROP ranges, not trained AI, validated planting advice, yield or profit forecasts. Overall suitability and planting recommendations remain unknown because water compatibility and critical constraints are unassessed.

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

For the browser regression test, start the preview in one terminal, then in another:

```powershell
$env:BASE_URL = 'http://localhost:4173'
node scripts/qa-real-data.mjs
```

The script uses isolated Microsoft Edge browser contexts and synthetic network fixtures only within the test. Set `BROWSER_PATH` for another installed Chromium executable. Earlier `qa-app`, `qa-fields`, `qa-decisions`, and `qa-analysis` scripts expect the former seeded demo and are historical checks, not current real-data acceptance tests. `qa-auth.mjs` is a mock provider check, not proof of live Supabase isolation.

## Sources, calculations and limitations

- NASA POWER monthly point endpoint requests T2M (°C), PRECTOTCORR (mm/day converted using actual days in each month to mm/month), ALLSKY_SFC_SW_DWN (MJ/m²/day converted to kWh/m²/day), and RH2M (%). One, three or five complete historical years can be requested. The latest year supplies provisional factor comparisons; earlier years are contextual. Data is gridded historical estimation, not a farm sensor or forecast. [NASA POWER monthly documentation](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/).
- Responses validate coordinates, years, units and all twelve months of core values; missing humidity is marked partial. A valid NASA response for the exact coordinates and year range may be cached in the current tab and is labeled with its original retrieval date. If no valid cache exists, failures and HTTP rate limits are reported and no climate, rankings or plans are substituted. Browser storage itself does not cryptographically authenticate a cached response against local tampering.
- pH, N/P/K, organic matter and optional sample/laboratory details come from the farmer. Unknown values remain null; mg/kg and the lab method matter. Soil reports can be locally attached with consent; they are not analyzed or synced to an account.
- A separate ECOCROP-based two-factor screen ranks up to four crops by the lower of pH fit and four-month historical temperature fit, using documented species-level ranges and a provisional interpolation. It requires both inputs and cannot establish overall suitability. The fixed interface windows are not verified crop growth periods. Other profile factors and historical weights use unvalidated starter assumptions and do not enter this index. Water, N/P/K and crop-family history are not scored by the screen; locally reviewed rules and a validated water balance remain necessary. See [the screening methodology](SCIENTIFIC_SCREEN_METHODOLOGY.md).
- An optional Bekaa Valley wheat study reference uses November–June over two historical years and can retrieve daily NASA POWER temperature extremes and meteorological inputs for a provisional FAO-56 ETo estimate. Standard-condition wheat ETc requires a complete, sourced farmer-entered Kc/stage profile. Effective rainfall, net irrigation and overall water suitability remain unknown. See [water and season methodology](WATER_AND_SEASON_METHODOLOGY.md).
- Field location and weather requests are sent to NASA; map tile requests go to OpenStreetMap. The application shell may be cached offline, but external API requests and personal data are not cached by the service worker.

For detailed source verification, legacy record handling, limitations and external prerequisites, read [REAL_DATA_AUDIT.md](REAL_DATA_AUDIT.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [PROJECT_SPEC.md](PROJECT_SPEC.md), and [REQUIREMENTS_GAP_ANALYSIS.md](REQUIREMENTS_GAP_ANALYSIS.md).

## Optional Supabase accounts

The app includes a Supabase email/password adapter and an owner-scoped workspace migration, but no project is configured by default. To enable and verify it:

1. Place `.env.local` in the project root, with `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_PUBLISHABLE_KEY` (or legacy public `VITE_SUPABASE_ANON_KEY`); see [.env.example](.env.example). Restart Vite after changes. Do not share the file or paste keys in chat.
2. Run `npm run check:supabase`. This makes read-only endpoint probes and prints HTTP statuses, never configuration values or response bodies. Endpoint reachability alone does not verify an authenticated connection, migrations or RLS.
3. In the intended project's Dashboard, review and run [the workspace migration](supabase/migrations/20261111_workspace.sql) in the SQL Editor. It creates a single owner-keyed JSON workspace, enables RLS, grants authenticated access and creates owner policies. If a table or policies already exist, review them first: `create table if not exists` does not validate an existing schema, and the migration replaces its named policies. Check for other permissive policies and grants, which may also grant access.
4. In Authentication, enable email/password registration and configure the site URL and allowed redirects for the exact local origin. For the default Vite origin these include `http://localhost:5173/login` and `http://localhost:5173/update-password`. Also add the equivalent `127.0.0.1` URLs if that is how you open the app. Review email confirmation and delivery settings.
5. Test sign-up, verification, sign-in, recovery, persistence across devices, anonymous access and isolation between two distinct accounts against your project. Do not treat client-side owner filtering as a substitute for RLS. Local guest data remains on its device and is not automatically transferred into an account workspace.

Never put a service-role key or other privileged secret in client-side code or `VITE_` variables. Fields (including soil inputs), plans, analyses and preferences are stored in one JSON workspace, rather than normalized production tables. Private cloud soil-report storage is **not implemented**; attachments remain browser-local and are unavailable in an account workspace. A non-executed [storage policy draft](supabase/planned/private_soil_reports.sql) is provided for later review. Before enabling storage, create a private bucket using the Dashboard, audit every applicable policy, implement explicit upload consent and metadata handling, and test two-account isolation. Account deletion, backups and governance are not implemented.

The reusable [client factory](src/services/supabaseClient.ts) accepts platform-specific authentication options. An Expo app will need its own supported persistent session storage, URL/base64 polyfills as necessary, mobile refresh lifecycle and deep-link configuration; the browser wrapper and its `window` redirects are not a complete native integration.

## Architecture

`src/pages` contains the screens, `src/context` workspace/auth state, `src/services/nasaPower.ts` the validated POWER adapter and tab cache, `src/services/repository.ts` browser field validation, `src/services/supabaseWorkspace.ts` optional cloud persistence, `src/data/crops.ts` the unvalidated starter catalog, and `src/lib/recommendations.ts` the versioned independent rule engine. Tests and synthetic fixtures live in `src/test` and `*.test.ts` files. A Leaflet/OpenStreetMap point map and Recharts visualizations supply the map and charts.

This is not production-ready until agronomic validation, actual provider/RLS testing, privacy and legal review, monitoring/backups, Arabic/RTL, accessibility and physical-device checks are completed. No public deployment has been made.
