# AgriLumina final implementation report

Completed 12 November 2026, continuing the implementation at commit `5896726`. This pass completed the account-workspace integration checks, expanded the existing read-only NASA verifier, ran the full unit suite and production build, and reconciled the documentation. Application calculation logic was retained. No production records, database policies, migrations, accounts or `.env.local` values were changed; no deployment was made.

## Working ETo and ETc calculations

The implementation is in [fao56.ts](src/lib/fao56.ts), [cropWater.ts](src/lib/cropWater.ts), [nasaPowerWater.ts](src/services/nasaPowerWater.ts) and [WaterClimatePanel.tsx](src/pages/WaterClimatePanel.tsx). ETo describes a hypothetical grass reference surface. ETc describes crop evapotranspiration under standard conditions; neither is measured actual crop ET or an irrigation prescription. [FAO-56 reference ET](https://www.fao.org/4/X0490E/x0490e08.htm) and [single crop coefficients](https://www.fao.org/4/X0490E/x0490e0b.htm) describe these methods.

Daily inputs use Celsius, kPa, m/s at 2 m, MJ/m2/day and metres of elevation. With `e0(x) = 0.6108 * exp(17.27*x/(x+237.3))`, the exact implemented sequence is:

```text
T     = (Tmin + Tmax) / 2
es    = (e0(Tmin) + e0(Tmax)) / 2
ea    = e0(Tdew)                           # NASA daily mean dew point
Delta = 4098 * e0(T) / (T + 237.3)^2
gamma = 0.000665 * pressure_kPa
G     = 0                                 # daily soil heat-flux approximation

phi   = latitude_degrees * pi / 180
J     = calendar day of year
dr    = 1 + 0.033*cos(2*pi*J/365)
delta = 0.409*sin(2*pi*J/365 - 1.39)
omega = acos(clamp(-tan(phi)*tan(delta), -1, 1))
Ra    = (24*60/pi)*0.0820*dr *
        (omega*sin(phi)*sin(delta) + cos(phi)*cos(delta)*sin(omega))
Rso   = (0.75 + 0.00002*elevation_m) * Ra
r     = min(1, Rs/Rso)                     # require raw Rs/Rso >= 0.3
Rns   = 0.77 * Rs                         # grass albedo 0.23
Rnl   = 4.903e-9 * ((Tmax+273.16)^4 + (Tmin+273.16)^4)/2 *
        (0.34 - 0.14*sqrt(ea)) * (1.35*r - 0.35)
Rn    = Rns - Rnl

ETo   = [0.408*Delta*(Rn-G) + gamma*(900/(T+273))*u2*(es-ea)]
        / [Delta + gamma*(1 + 0.34*u2)]    # mm/day
ETc   = Kc(day) * ETo(day)                 # mm/day
```

The farmer-entered elevation affects clear-sky radiation. Pressure is NASA's gridded `PS`; the request does not apply the farmer elevation through NASA's optional pressure-correction parameter. This mismatch, daily mean dew-point conversion, gridded weather and estimated radiation need local validation. No monthly temperature or monthly humidity is substituted for the daily water-climate inputs.

Missing elevation or meteorology, invalid dates/units, inconsistent physical values, unsupported radiation, or a negative/non-finite result yield unknown. Ratios above 1 are capped with a warning; ratios below 0.3 yield unknown. A complete period total is available only when every required daily value is available. Missing days are neither zeroed nor interpolated.

The published FAO-56 example-18 test uses latitude 50.8 degrees, elevation 100 m, 6 July, Tmin 12.3 C, Tmax 21.5 C, actual vapour pressure 1.409 kPa, wind 2.08 m/s, pressure 100.1 kPa and solar radiation 22.07 MJ/m2/day. The implementation returns **3.879980263080916 mm/day**, agreeing with the published rounded **3.88 mm/day**. An ETo of 4 mm/day and Kc of 1.2 produce **4.8 mm/day ETc**.

The Kc profile requires a crop ID, planting date, four positive integer stage lengths, initial/mid/end Kc values and a nonblank source. Stored stage lengths are 1-366 days each and stored Kc values are 0-10; these are software bounds, not agronomic recommendations. Let `d` be the zero-based day offset from planting, and let `I`, `D`, `M`, `L` be initial, development, mid and late stage lengths. The daily curve is:

```text
0 <= d < I:             Ki
after I, for D days:    Ki + (Km-Ki)*(d-I+1)/D
after I+D, for M days:  Km
after I+D+M, L days:    Km + (Ke-Km)*(d-I-D-M+1)/L
outside the profile:   unknown
```

Each transition reaches its target on the final day of that stage. Period ETc is the sum of daily products, not an average Kc multiplied by an incomplete ETo sum. The current UI evaluates a complete wheat profile covering the entire selected Bekaa reference period. It withholds ETc for other crop IDs, missing profile days or any unknown ETo day. Calculated daily series and manual water-balance results are not saved into analysis history; the farmer's water inputs are saved with the field.

## Supported crops and required inputs

| Capability | Crops | Required inputs and limits |
| --- | --- | --- |
| Generic pH/temperature screen | Chickpea, durum wheat, lentil, barley, tomato, potato, sunflower, fava bean | Farmer pH, exact field coordinates, complete matching historical NASA monthly temperatures and Spring or Autumn interface window. At most four low-confidence two-factor results; other constraints remain unknown. |
| Historical Bekaa study reference | Durum wheat only (`wheat`) | Explicit user selection of this context, pH and November-June monthly data across two historical years. Region/cultivar applicability is not automatically verified. |
| Daily ETo | Crop independent | Latitude/longitude, date period, entered elevation and complete daily NASA `T2M_MIN,T2M_MAX,T2MDEW,WS2M,PS,ALLSKY_SFC_SW_DWN`. The adapter additionally requires `PRECTOTCORR`; each day and unit is checked. |
| Standard-condition ETc displayed in the UI | Wheat only | Valid daily ETo plus a complete sourced wheat planting/stage/Kc profile covering the entire reference period. |
| Saved growth profiles | All eight catalog crops | Same entered profile fields. The pure Kc/ETc helpers are generic; saving another crop's profile does not enable its ETc in the current panel. |
| Total available water | Crop independent | Volumetric field capacity and wilting point (%), plus positive effective rooting depth (m). `TAW = 1000*((FC%-WP%)/100)*rootDepth`; 30%, 10%, 1 m yields 200 mm. |
| Dated irrigation context | Any field | Actual or planned schedule, explicit complete start/end coverage, event dates and applied depths in mm. A recorded zero remains zero; blanks remain unknown. Applied depth is not net infiltration. |
| Manual one-day root-zone check | Crop independent | Previous depletion, TAW, rain, runoff, net irrigation, capillary rise, actual ET, drainage, allowable depletion fraction strictly between 0 and 1, and threshold source. Every term must be supplied. Inputs/results are not saved. |

The only built-in water coefficient reference is FAO-56 **winter wheat**: initial Kc 0.4-0.7, mid 1.15, end 0.25-0.4. The app does not select a value or planting/stage duration automatically. Frozen soil, wetting, maturity, cultivar and local climate determine applicability; this reference is not validated specifically for the catalog's durum wheat. Other crops have no built-in Kc reference. See [cropWaterRequirements.ts](src/data/cropWaterRequirements.ts) and [water methodology](WATER_AND_SEASON_METHODOLOGY.md).

Creating a field also requires its name, location description, area, coordinates and an explicit rainfed/limited/reliable water category. pH, N/P/K, organic matter, crop history and additional laboratory/context details may remain unknown. The water category, N/P/K and crop-history entries do not fill missing daily water-balance terms.

## Real NASA API verification

`node scripts/qa-water-live.mjs` made four unmocked public requests at **33.85 N, 35.9 E** on **12 November 2026, 12:14:58-12:15:03 PST** (`20:14:58-20:15:03Z`). Elevation **1,000 m** is a synthetic test assumption, not a verified elevation for this coordinate or any farmer's field. The script calls the application adapters and reports HTTP results without substitute data.

| Live request | HTTP | Verified result |
| --- | --- | --- |
| Monthly point, 2025 | 200 | 12/12 months, fresh response, complete quality. `T2M` C; `PRECTOTCORR` mm/day converted by actual month length; solar MJ/m2/day divided by 3.6 for kWh/m2/day; `RH2M` %. |
| Daily temperature extremes, 2024-11-01 through 2025-06-30 | 200 | All 242 days accepted. Coldest Tmin 1.38 C on 2025-02-23; hottest Tmax 34 C on 2025-05-17; 0 days with Tmin <= 0 C. These are grid-cell summaries, not field frost/heat assessments. |
| Daily seven-parameter water climate, 2025-07-01 through 2025-07-03 | 200 | 3/3 days accepted for ETo; no radiation-cap warnings. Exact calculations below. |
| Daily seven-parameter water climate, 2024-11-01 through 2025-06-30 | 200 | All 242 input days parsed; **238 ETo days accepted, 4 unknown**. Full-period ETo is **null**; full-period ETc must also remain unknown. |

The monthly request uses its API-default time standard; daily requests explicitly use **LST**, which is local solar time rather than the farmer's civil timezone. See [NASA monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/) and [daily API/time standards](https://power.larc.nasa.gov/docs/services/api/temporal/daily/).

| NASA historical day | ETo (mm/day) | Illustrative ETc with synthetic Kc = 1.15 (mm/day) |
| --- | --- | --- |
| 2025-07-01 | 6.7339608419476145 | 7.744054968239756 |
| 2025-07-02 | 7.257013094010163 | 8.345565058111687 |
| 2025-07-03 | 6.848679047853768 | 7.875980905031833 |
| Three-day sum | **20.839652983811547 mm** | **23.96560093138328 mm** |

These ETc values demonstrate multiplication with a deliberately supplied example coefficient. They do not establish wheat demand for a real planting or the November-June reference.

The four unavailable ETo dates are **2024-12-28, 2024-12-29, 2025-03-07 and 2025-04-01**. Each has `Rs/Rso < 0.3`, outside the implementation's supported cloudiness approximation. The NASA request and input completeness checks passed; this does not justify filling or summing across those unknown calculation days. A reviewed treatment of these conditions is required before claiming a complete seasonal total for this test case.

## Supabase persistence verification

The existing `npm.cmd run check:supabase` probe used only the configured public client settings and read-only endpoints. Authentication settings returned **HTTP 200**, the Data API root **HTTP 401**, and the zero-row anonymous workspace query **HTTP 401 / PostgreSQL 42501**, classified as table privilege denied. No credentials, project URL, response bodies or personal records were printed. No SQL or authenticated production write was performed.

The expanded [account-workspace integration check](scripts/qa-auth.mjs) passed with synthetic HTTP fixtures in an isolated Edge context against a separate local server configured for `mock-terrawise.supabase.co`. It verified:

- Initial guest/account separation; each of two synthetic accounts creates its own workspace without copying guest fields.
- Persistence and reload of field coordinates/elevation, entered pH, unknown nitrogen, all soil-water values, the full stage/Kc/source profile and dated irrigation, including a zero-depth event.
- Saved rotation plans, saved analysis snapshots containing field water inputs, withheld overall scores, display-name preferences and default area units; reload preserves each category.
- A second account's empty water inputs remain null/unknown and its changes preserve the first account's entire workspace. Logout returns to the unchanged guest browser workspace; account plans, analyses and preferences are not copied into guest storage.
- Failed workspace reads show an error without using guest data; retry recovers. Failed writes do not change server data. Same-owner auth metadata changes do not reload over unsaved state. A stale version cannot overwrite a newer workspace or discard its saved water inputs, plans and analyses.

The unit adapter tests additionally check owner predicates, initial-insert conflicts, stale versions and server version confirmation. These exercise application behavior and a simulated service, **not actual Supabase RLS**.

Real email registration, confirmation, login, field saving and two-account UI separation remain **previously owner-reported**. This pass independently verified endpoint reachability and anonymous SELECT denial only. Live authenticated read/write round trips, direct cross-owner API isolation, session refresh/recovery and cross-device persistence remain unverified. Their write/delete probes belong in a separate disposable project under [the existing verification plan](SUPABASE_SECURITY_AUDIT.md). They were not attempted against production. Browser-local report files are not synced; private cloud report storage remains unimplemented.

## Tests and production build

| Command/check | Final result |
| --- | --- |
| `npm.cmd test` | **84 tests passed in 12 files**, including water calculations, NASA parsing/failure boundaries, screening, repository/soil validation, Supabase configuration/workspace concurrency and endpoint classification. |
| `npm.cmd run build` | **Passed**: `tsc -b` and Vite production bundle; 2,523 modules transformed. Build artifacts are local and ignored by Git. |
| `scripts/qa-real-data.mjs` against production preview | **Passed**: mobile NASA failure state, desktop fixture flow, 390px mobile fixture flow, and legacy-record preservation/review. Includes local water input persistence, ETo/ETc fixture flow, manual balance, screens, plans and history. No browser page errors. |
| Expanded `scripts/qa-auth.mjs` against synthetic account server | **Passed**, covering the account scenarios above with no browser page errors. |
| `scripts/qa-water-live.mjs` | **Passed**: four NASA HTTP 200 responses and the published equation example. The complete season deliberately reports partial ETo and no seasonal total. |
| `npm.cmd run check:supabase` | **Passed for endpoint connectivity and anonymous privilege denial**, with the authenticated/RLS limits above. |

Use `npm.cmd` on Windows if PowerShell's execution policy blocks `npm.ps1`; no machine execution-policy changes are necessary. Browser QA used headless Microsoft Edge in temporary contexts, not physical devices. Earlier demo-dependent QA scripts remain historical checks and are not current acceptance tests. [README.md](README.md) contains reproducible commands, including the synthetic account-server configuration.

## Remaining blockers

**Water suitability:** Four daily ETo values in the tested November-June period remain unavailable under the supported radiation approximation. Any operational use also requires verified elevation/weather representativeness, locally applicable crop-stage/Kc inputs and climate/wetting adjustments, measured or defensibly estimated root-zone soil/storage values, and complete actual/planned irrigation coverage. Effective rain, runoff, net infiltration/efficiency, capillary rise, actual stressed ET, deep percolation and a locally reviewed depletion threshold are not inferred. The manual one-day equation works with supplied values, but it does not generate an automatic, validated seasonal water budget or irrigation prescription. Water fit remains unknown/unscored.

**Full crop ranking:** The existing screen uses only pH and historical monthly temperature, with up to four results. Locally reviewed crop/cultivar calendars, critical salinity/drainage/frost/heat constraints, comparable complete water evidence, method-compatible soil nutrients, pest-specific rotation intervals, a validated aggregation method and independent field validation are still required. Generic seasonal windows and the Bekaa study reference do not establish these rules. The full recommendation engine therefore withholds overall suitability and ranked planting recommendations; editable rotations remain exploratory scenarios.

**Persistence release evidence:** Direct authenticated isolation and cross-device tests, live effective-policy review, cloud report storage, account lifecycle and backup/restore procedures remain open. None requires or authorizes modifying production policies or records during this task.
