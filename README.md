# TerraWise

TerraWise is a mobile-first agricultural decision-support application built with React, Vite and TypeScript. It stores farmer-entered field and soil information and retrieves historical NASA POWER climate estimates for field coordinates. Its exploratory crop profiles use deterministic **unvalidated provisional heuristics**, not trained AI, validated planting advice, yield or profit forecasts. Overall suitability and ranked recommendations are currently withheld because water compatibility and critical constraints are unknown.

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
- Starter crop ranges, relative water categories, weights and family penalties require rule-specific citations and local agronomist review. The app shows unranked exploratory profiles (four per page), individual provisional factors, missing inputs, low qualitative confidence, and a separate eight-category input-completeness count. Missing pH, N/P/K, history and water fit are unknown/unscored; no overall score or ranking is calculated. Former weights are historical assumptions only and are not applied. Water fit needs a reviewed water balance and actual inputs. Rotation sequences are exploratory scenarios, not validated recommendations. The rules do not model crop duration, pest-specific return intervals, weather extremes, nutrient carryover, yield, profit or fertilizer rates.
- Field location and weather requests are sent to NASA; map tile requests go to OpenStreetMap. The application shell may be cached offline, but external API requests and personal data are not cached by the service worker.

For detailed source verification, legacy record handling, limitations and external prerequisites, read [REAL_DATA_AUDIT.md](REAL_DATA_AUDIT.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [PROJECT_SPEC.md](PROJECT_SPEC.md), and [REQUIREMENTS_GAP_ANALYSIS.md](REQUIREMENTS_GAP_ANALYSIS.md).

## Optional Supabase accounts

The app includes a Supabase email/password adapter and an owner-scoped workspace migration, but no project is configured by default. To enable and verify it:

1. Create a Supabase project and set `VITE_SUPABASE_URL` and its public `VITE_SUPABASE_PUBLISHABLE_KEY` (or public anon key) in `.env.local`; see [.env.example](.env.example).
2. Apply [the workspace migration](supabase/migrations/20261111_workspace.sql) to the intended project. Check that RLS is enabled and the owner policies are present.
3. Configure allowed `/login` and `/update-password` redirects and email delivery. Restart the app.
4. Test sign-up, verification, recovery, cross-device persistence, anonymous access and two distinct accounts against your actual project. The application has not been tested against one in this workspace.

Never put a service-role key or other privileged secret in client-side code or `VITE_` variables. The cloud workspace stores JSON, rather than the original PDF's normalized production schema. Private cloud soil-report storage, account deletion, backups and governance are not implemented.

## Architecture

`src/pages` contains the screens, `src/context` workspace/auth state, `src/services/nasaPower.ts` the validated POWER adapter and tab cache, `src/services/repository.ts` browser field validation, `src/services/supabaseWorkspace.ts` optional cloud persistence, `src/data/crops.ts` the unvalidated starter catalog, and `src/lib/recommendations.ts` the versioned independent rule engine. Tests and synthetic fixtures live in `src/test` and `*.test.ts` files. A Leaflet/OpenStreetMap point map and Recharts visualizations supply the map and charts.

This is not production-ready until agronomic validation, actual provider/RLS testing, privacy and legal review, monitoring/backups, Arabic/RTL, accessibility and physical-device checks are completed. No public deployment has been made.
