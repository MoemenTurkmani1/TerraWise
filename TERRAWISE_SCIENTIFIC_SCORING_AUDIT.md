# AgriLumina scientific scoring audit

**Scope:** Research and audit only. No application code, packages, database tables, or configuration were changed. The requested top-four engine is a proposed future design, not the current behavior. This report does not certify the present recommendations for planting decisions.

**Evidence basis:** Static inspection of the current source and existing test/status evidence; external primary/official technical sources linked below. Tests and live API calls were not rerun for this audit. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) records an earlier run of 45 passing tests and a successful NASA request at one test point; that is not ongoing availability or agronomic validation. Proposed factors, roles, architecture, and priorities are engineering recommendations, not FAO-prescribed weights or validated local crop thresholds.

## 1. Executive findings and current status

1. AgriLumina has a transparent, deterministic, **uncalibrated prototype**, not a crop-specific, validated scientific suitability model. It stores eight illustrative crops and currently displays **up to five**, not the requested top four. [Engine](src/lib/recommendations.ts#L7); [catalog](src/data/crops.ts#L6); [UI](src/pages/Recommendations.tsx#L49).
2. Current scored components are seasonal mean temperature, pH, simple N/P/K ratios, recent crop-family history, and selected priorities. The nominal water component is **always zero**. Seasonal precipitation, solar radiation, humidity, soil moisture/texture/EC, and sample depth do not produce water or crop-fit points. Some still affect warnings, completeness, or confidence.
3. Missing pH, N/P/K and crop history receive zero rather than an explicit unknown component. This prevents artificial credit but can treat unknown information like a poor measurement, change rankings, and make unequal-evidence candidates look comparable. The 20% water component is zero for every candidate; therefore the current weighted total cannot exceed **80/100** before family caps. Zero does not mean measured unsuitability.
4. The only crop-specific hard eligibility rule checks the starter Spring/Autumn window. NASA source plus 12 months and legacy-field review are operational gates, not agronomic hard constraints. No locally validated soil, water, frost, toxicity, drainage, or pest exclusion exists. [rankCrops/assessEligibility](src/lib/recommendations.ts#L118).
5. All recommendations have **low** confidence in the present code: the water-balance missing-input message is always inserted. Seven-item completeness can nevertheless be 100% because it counts climate, pH, N, P, K, organic matter and recognized prior crop, **not water balance**. It is neither statistical confidence nor proof of scientific adequacy. [scoreCrop](src/lib/recommendations.ts#L60).
6. NASA POWER integration is real, historical, gridded and location-based. The score uses a simple average of four monthly mean temperatures from the latest year only; it does not use frost days, heat episodes or multi-year variability. A 1/3/5-year analysis request stores prior years as context. No fake fallback is generated. [NASA service](src/services/nasaPower.ts#L15); [analysis](src/pages/Analysis.tsx#L43).
7. FAO land evaluation matches land qualities to a **specific crop, management and setting**; it does not supply universally valid cutoffs or numerical weights. Crop-stage, cultivar, soil-test method and geography matter. [FAO framework][FLE]; [FAO framework detail][FLE2].
8. ECOCROP is a source to research, not a current AgriLumina integration or a guarantee of validated local thresholds. FAO says the original database was discontinued around 2015 and incorporated into the GAEZ platform. GAEZ v4's 5-arc-minute grids and historical scenarios cannot be substituted for a field soil test. [ECOCROP][ECO]; [GAEZ v4][GAEZ].
9. The reusable TypeScript logic is a strong starting point, but the crop catalog includes web image paths, the recommendation engine imports a browser-repository helper, NASA caching uses browser session storage, and Leaflet/Recharts/localStorage are web-specific. A shared pure domain package and platform adapters are needed for Expo.
10. **Do not ship an authoritative top four yet.** First agree on a pilot region/crops and obtain rule-level agronomist approval, data quality gates, real constraints, and independent local validation. If fewer than four crops have sufficient evidence, return fewer; do not fill slots with invented scores.

## 2. Current project: exact behavior and source evidence

### 2.1 Inputs and where they go

| Input | Present in application | Current impact and evidence |
|---|---|---|
| Field name, country/region, latitude/longitude, area, area unit, optional elevation, location source and soil type | Farmer-entered; coordinates and required fields validated | Coordinates select NASA point. Area is displayed/stored, not a crop-fit factor. Elevation, location source, country and soil type are not scored. [Field model](src/types.ts#L7); [wizard](src/pages/Fields.tsx#L55); [validation](src/services/repository.ts#L37). |
| pH, N/P/K, organic matter | Optional user-entered values; N/P/K expected as mg/kg | pH and each N/P/K value affect the score. Organic matter is a completeness item and can generate a warning below the **prototype's unvalidated** 2% screen; no organic-matter score. The pH scale and test numbers are not verified by the app. [scoreCrop](src/lib/recommendations.ts#L44). |
| Soil salinity/EC, texture, moisture, sampling date/depth, laboratory, N/P/K method, provenance | Optional fields | Displayed/stored, not scored. **Sampling depth is not effective soil/rooting depth.** Soil moisture `%` lacks a specified measurement basis; salinity's extraction basis is not structured. Measured/estimated/unknown provenance and missing organic matter affect confidence/warnings. [types](src/types.ts#L22); [field form](src/pages/Fields.tsx#L250). |
| Water availability, irrigation method/source/restrictions | Farmer selects rainfed/limited/reliable; optional notes | Category appears in explanations. It does not determine irrigation volume or the water-fit score. Relative catalog water need can affect the farmer-priority score and an alternative-plan heuristic. [water and priorities](src/lib/recommendations.ts#L59). |
| Crop history, season/year, optional dates, pests/residue | Entered by farmer; chronological order uses year and season | Latest recognized crop/family and same family in last three entries affect rotation score/caps. Actual planting/harvest dates, disease notes and residue details are not used in numerical rotation scoring; disease notes cause a generic warning. [history](src/lib/history.ts); [rotation](src/lib/recommendations.ts#L66). |
| Farmer objectives, budget, risk tolerance | Priority checkboxes plus optional budget and risk | Soil health/water saving alter priority score. Production/profitability insert a neutral 50; budget is not modeled. Risk-reduction or low risk tolerance uses half the sum of rotation and the permanently zero water score; medium/high risk tolerance has no equivalent numeric logic. [priorities](src/lib/recommendations.ts#L77). |
| Temperature, precipitation, radiation, humidity | Monthly historical POWER for selected coordinates | Temperature scores; precipitation is summed for a water explanation but not used in numerical water scoring; solar is displayed; humidity is displayed and partial/missing humidity lowers confidence. No forecast or measured on-farm data is supplied. [NASA](src/services/nasaPower.ts#L28); [engine](src/lib/recommendations.ts#L35). |

### 2.2 Exact current scoring formula

The current starter catalog covers **chickpea, durum wheat, lentil, barley, tomato, potato, sunflower and fava bean**. Chickpea, wheat, lentil, barley and fava are marked for both starter windows; tomato, potato and sunflower are marked for Spring only. These are actual current code settings—not validated local crop calendars. [Catalog](src/data/crops.ts#L6).

For `scoreCrop(crop, field, climate, season)`, define `clamp(x) = max(0, min(100, x))` and `R(x,[a,b],d) = clamp(100 − max(a−x, x−b, 0) × d)`.

1. **Climate `C` (25%):** take the unweighted arithmetic mean of the four monthly mean temperatures in **March–June** for Spring or **September–December** for Autumn of the latest climate year. `C = R(T̄, crop.temperature, 7)`. The code contains an extra `× 0.35` for an out-of-season crop, but normal `rankCrops` excludes that crop first, so the branch does not affect ordinary rankings. Missing seasonal values would produce zero, but `rankCrops` also requires a 12-month NASA result.
2. **pH `H` (15%):** `H = R(pH, crop.ph, 40)`; missing pH produces 0. The ranges and slope are prototype values, not a sourced response curve.
3. **Nutrients `NPK` (15%):** for each of N, P and K, `n_i = clamp(100 × input_i / crop.nutrients_i)`; missing inputs produce 0. `NPK = mean(n_N,n_P,n_K)`. This assumes compatible mg/kg results and unvalidated crop-specific denominators, regardless of laboratory extraction, nutrient form, depth, crop stage, or local calibration.
4. **Water `W` (20%):** `W = 0` for all crops. Rainfall and qualitative irrigation labels are explanatory context, not a quantitative balance.
5. **Rotation `R` (20%):** 0 if latest crop is not recognized; 10 for the same latest crop; 30 for the same latest family; 70 if the family occurs among the last three entries but is not the latest family; 100 otherwise. A repeat of the latest crop caps the final score at 45; a repeat of the latest family caps it at 65. These are heuristic penalties, not proven pest return periods.
6. **Priority `P` (5%):** soil-health gives 100 to catalog legumes and 65 otherwise; water-saving gives 100/65/25 for catalog low/medium/high relative water need; profitability and production each give neutral 50; risk-reduction or `riskTolerance=low` adds `round((R + W)/2)`; selected contributions are averaged, and an empty list defaults to 50. Only low risk tolerance has this extra logic.

Each displayed factor is rounded to an integer first. The engine computes:

```text
raw = round(0.25 × round(C) + 0.15 × round(H) + 0.15 × round(NPK)
          + 0.20 × W + 0.20 × R + 0.05 × round(P))
final = clamp(min(raw, applicable repeat-crop/family cap))
```

`rankCrops` sorts descending by final score, then alphabetically by crop name. Scores are not probabilities. A user's choice of priority changes the **same physical suitability total**, so agronomic feasibility and preference are conflated. Organic matter warning, several risk notes, missing humidity and soil provenance affect the displayed caveats/confidence but not this weighted total. The crop-family caps and 2% organic-matter warning are uncalibrated product assumptions, not thresholds established by a cited local study. [Implementation](src/lib/recommendations.ts#L12).

### 2.3 Current gates, completeness, confidence and implications

- **Hard gates:** recognized supported planting-window eligibility; source must say `nasa-power` and have 12 monthly entries; modified legacy example fields need explicit review. An empty result is returned otherwise. The pure engine checks the source label and count, **not cryptographic provenance, coordinate equality, or full month validity**; in the normal web path, the NASA adapter performs stronger checks first. Do not treat a TypeScript object labeled NASA as independently verified. [rankCrops](src/lib/recommendations.ts#L128).
- **Rotation preference is not a veto:** `buildRotation` prefers a different family but falls back to the highest ranked option if none is available. Same-crop/family caps are penalties, not disease-specific hard exclusions. The planner itself uses four Spring/Autumn windows, not crop duration or full agronomic schedules. [planner](src/pages/Planner.tsx#L50); [engine](src/lib/recommendations.ts#L136).
- **Missing/low-quality data:** missing soil and recognized history become score zero; organic matter adds missing/warning but no points; missing water-balance inputs always add a missing item and therefore force `confidence='low'`. Partial humidity, estimated/unconfirmed soil and missing inputs also yield low confidence. There is no estimated probability or validation of the confidence labels. [engine](src/lib/recommendations.ts#L111).
- **Completeness:** `round(100 × count([complete seasonal climate, pH, N, P, K, organic matter, recognized last crop])/7)`. It ignores irrigation volume, effective rainfall, ETo, crop-specific required traits, date, measurement method and many critical factors. It is an input count and can report 100% while confidence remains low and water is unavailable.
- **Top 4 gap:** the recommendations page filters the ranked list then takes five; the comparison offers up to three of the first five; saved reports show the first five. [Recommendations](src/pages/Recommendations.tsx#L34); [analysis report](src/pages/Analysis.tsx#L96). Top four should be consistent across APIs, UI, saved snapshots and exports, with fewer if evidence is inadequate.
- **Potential misleading precision:** months are averaged equally instead of weighting by days; calendar windows are northern-Mediterranean starter assumptions, can mismatch crop phase or seasons in other hemispheres, and Autumn does not follow a winter crop across calendar years. One year is not a climate baseline. A high seasonal mean match can hide acute heat/frost or dry spells. [NASA processing][POWERPROC]; [FAO growing period][GROW].

### 2.4 NASA POWER request, parsing and limitations

- `powerRequestUrl` validates finite latitude/longitude, complete years from 1984 through the preceding UTC calendar year, and a maximum 10-year period. It requests `community=AG`, `format=JSON`, and `T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN, RH2M` from the public monthly point endpoint. [Code](src/services/nasaPower.ts#L15); [NASA monthly API][POWER].
- `parsePowerResponse` validates 12 temperature, precipitation and solar months, known units, ranges and fill values. It converts monthly average precipitation rate in mm/day to mm/month using days in each month and rounds to 0.1 mm; solar MJ/m²/day is divided by 3.6 for kWh/m²/day. Missing/invalid RH2M becomes null and partial; missing core fields or unsupported units reject the period. Annual `YYYY13` is not used. [Code](src/services/nasaPower.ts#L28); [NASA temporal processing][POWERPROC].
- `parsePeriod` saves all requested years but places the last year in `monthly`; it records the requested point, period, original/display units, retrieval time, missing humidity and fresh/cached status. It does not establish independent field-level measurements. [Code](src/services/nasaPower.ts#L57).
- The analysis UI requests 1, 3 or 5 preceding complete years; the dashboard, recommendations, field details and planner request only the most recent complete year via `useClimate`. No long-term statistics or comparison across years feed the score. [useClimate](src/hooks/useClimate.ts#L9); [analysis](src/pages/Analysis.tsx#L43).
- `fetchClimateRange` has a 12-second timeout, handles cancellation and HTTP errors including 429, and uses only a validated response from a session cache keyed by exact requested coordinates and years. It re-parses the cache; it preserves the original retrieval time. It does not automatically retry with backoff. If no valid cache exists, it returns an error and no fake climate. [Code](src/services/nasaPower.ts#L55); [tests](src/services/nasaPower.test.ts#L47).
- Gaps for a scientific pipeline: no explicit recorded/validated time standard; no systematic provider dataset/version/grid-cell identity or uncertainty/bias metadata; no independent verification that response geometry corresponds to requested coordinates; no daily min/max, wind, wet-day, evapotranspiration, frost or heat metrics; no per-parameter spatial representative error. The session cache is client-editable and cannot provide tamper-proof source attestation. NASA notes products are at the original sources' grid resolutions; temporal/parameter availability differs by community. [NASA monthly][POWER]; [NASA parameter dictionary guide][PARAM].

## 3. Scientific factor and data-availability matrix

**Legend:** Availability in current app: **Y** = available when user enters it or NASA succeeds; **P** = partial/proxy; **N** = absent. Implemented: **Y** = capture/retrieve; **P** = partial; **N** = absent. Scored: **Y** = contributes to numerical rank; **P** = indirect/limited; **N** = not scored. Priorities: **P0** = evidence/eligibility needed before credible pilot rankings; **P1** = important regional pilot extension; **P2** = contextual/advanced after evidence and need are established. Proposed roles are conditional on crop, setting, management and verified thresholds; they are **not universal rules**. Warning/context may be more appropriate than a hard constraint if evidence is weak.

### 3.1 Soil and root-zone factors

| Factor | Scientific importance | Potential source | Available | Implemented | Scored | Units / basis | Proposed role | Ref | Priority | Missing inputs / limitation |
|---|---|---|---|---|---|---|---|---|---|---|
| Soil pH | Nutrient availability and crop response | Lab; farmer estimate | Y | Y | Y | pH, method and sampling depth | Score; hard constraint only with validated crop/variety evidence | [SOILHEALTH][], [FLE][] | P0 | Current broad range and linear penalty lack local validation; pH method/age/geographic representativeness need structure. |
| Nitrogen | Nutrition and management response | Lab, local agronomic program | P | P | Y | mg/kg plus N form (e.g. nitrate-N), extraction, depth and date; stock calculations need bulk density | Method-specific score or warning; no universal cutoff | [SOILTEST][] | P0 | Generic N lacks form, calibration and sampling basis; dynamic N and mineralization are ignored. |
| Phosphorus | Root and crop nutrition | Lab | P | P | Y | mg/kg with Olsen/Bray/Mehlich or other extraction, depth/date | Method/region-specific score or warning | [SOILTEST][] | P0 | Same number from different extraction methods is not a universal available-P quantity; current ratio ignores method. |
| Potassium | Crop nutrition and soil supply | Lab | P | P | Y | mg/kg with extraction, depth/date | Method/region-specific score or warning | [SOILTEST][] | P0 | No method-aware thresholds or validated local response. |
| Soil texture | Controls drainage, rooting and storage | Lab or survey; farmer | P | Y | N | Texture class or sand/silt/clay % | Context and derived water-capacity input; validated constraint where justified | [AWC][], [GAEZDOC][] | P1 | Free-text only; no particle fractions, layers or uncertainty. |
| Effective rooting/soil depth | Limits root access to water/nutrients | Soil survey, field probe, lab | N | N | N | cm to restrictive layer, by horizon | Potential hard constraint or scored factor | [AWC][], [SOILS][] | P1 | `sampleDepthCm` is sampling depth, not depth to bedrock/restrictive layer. |
| Drainage / waterlogging | Aeration and root stress | Field survey, soil map, farmer | N | N | N | Drainage class, water-table depth and saturation duration | Constraint/warning and soil score when verified | [SOILS][], [GAEZDOC][] | P1 | Not collected; soil type text cannot establish drainage. |
| Soil salinity / EC | Osmotic stress and crop salt response | Lab or field meter | P | Y | N | dS/m at stated temperature and extraction method, preferably identified ECe when used | Constraint or score only with crop- and method-specific evidence | [NRCSFIELD][], [WATERQUALITY][] | P0 | Generic EC field lacks extraction basis; ECe, diluted extracts and apparent EC are not interchangeable. |
| Organic matter | Supports soil structure and nutrient/water processes | Lab | Y | Y | N | % with method/depth | Context/warning or locally calibrated factor | [SOILHEALTH][], [AWC][] | P1 | Current fixed <2% warning is illustrative, not a validated universal crop threshold. |
| Soil moisture | Water available at a time and depth | Sensor, field/lab test; farmer | P | P | N | Volumetric % or m³/m³; timestamp and layer | Water-balance input/context | [AWC][] | P1 | Existing % has no volumetric/gravimetric basis, depth/time or sensor calibration. |
| Compaction | Restricts roots, infiltration and aeration | Field/lab | N | N | N | g/cm³ bulk density or MPa penetration resistance plus moisture/depth | Warning or locally validated constraint | [BULK][] | P1 | Texture, water content and horizon matter; do not apply one universal threshold. |
| Soil toxicity / contaminants | Specific ions/metals can damage crops or affect food safety | Accredited soil/water lab and local authority | N | N | N | Analyte, mg/kg, extraction/speciation, depth | Verified hard safety constraint or warning | [WATERQUALITY][], [FLE][] | P0 | No contaminants, bioavailability, local legal limits or crop exposure information. Do not infer toxicity from pH alone. |

### 3.2 Climate, phenology and atmospheric factors

| Factor | Scientific importance | Potential source | Available | Implemented | Scored | Units / basis | Proposed role | Ref | Priority | Missing inputs / limitation |
|---|---|---|---|---|---|---|---|---|---|---|
| Mean temperature | Crop development and suitability | NASA POWER; station | Y | Y | Y | °C per day/month, date/time basis | Stage- and cultivar-aware score | [POWER][], [GROW][] | P0 | Four monthly means, latest year only; equal-month average, not stage or day weighted. |
| Minimum temperature | Cold exposure and developmental limits | NASA daily min; station | N | N | N | °C per day, reference height | Stage-specific constraint/warning | [POWERDAILY][], [GROW][] | P0 | Not requested; gridded air min is not plant tissue/soil temperature. |
| Maximum temperature | Heat exposure | NASA daily max; station | N | N | N | °C per day, reference height | Stage-specific constraint/warning | [POWERDAILY][], [GROW][] | P0 | Not requested; maxima and episode duration cannot be recovered from monthly mean. |
| Heat stress | Flowering/fruit set or growth can be affected by hot episodes | Derived from daily or hourly series + crop stage | N | N | N | days, hours or degree-days above *verified* threshold | Constraint/warning or scored risk | [POWERPROC][], [GROW][] | P0 | No crop-stage dates, cultivar response, hourly exposure or local bias validation. |
| Frost risk | Extreme cold can damage sensitive stages | Daily minimum, local station, farmer reports | N | N | N | °C and dates/frequency of cold events | Verified stage-specific constraint/warning | [POWERDAILY][], [POWERPROC][] | P0 | No daily Tmin/planting dates; air temperature proxy cannot establish field-level frost. |
| Rainfall amount | Water input to soil | NASA historical; rain gauge | Y | Y | N | mm/day or mm/month, period | Input to water balance, not independent full water-fit credit | [POWER][], [FAOWATER][] | P0 | Monthly totals only; gross rainfall is not effective rainfall. |
| Rainfall timing/distribution | Dry spells and stage timing affect water availability | NASA daily or local gauge | P | P | N | mm/day; wet/dry days, dates, event intervals | Water/risk input with coverage warnings | [GROW][] | P1 | Monthly totals are shown but daily variability and crop-stage windows are absent. |
| Solar radiation | ETo and growth environment | NASA POWER; station | Y | Y | N | MJ/m²/day or kWh/m²/day with conversion | ETo input/context; score only if independently supported | [FAO56ETO][], [POWER][] | P1 | Surface shortwave is not net radiation; no direct biomass/yield inference. |
| Relative humidity | Evaporative demand and disease context | NASA POWER; station | P | Y | N | % and sampling period | ETo input/quality flag | [FAO56ETO][] | P1 | Missing RH months allowed; monthly mean is insufficient for some methods and disease diagnosis. |
| Wind | Evaporative demand, lodging and crop damage | NASA/station; local observations | N | N | N | m/s, height, period | ETo input; hazard warning if locally supported | [FAO56ETO][], [PARAM][] | P1 | Not requested; verify parameter availability and adjust measurement height correctly. |
| Growing-season length and stages | Exposure must align with cultivar development and local calendar | Farmer, extension, crop calendar, derived phenology | P | P | N | planting/harvest dates; days per stage | Constraint and time-window definition | [CALENDAR][], [FAOCROPDURATION][] | P0 | Previous-crop dates may be stored; proposed crops lack cultivar/stage dates and overlap modeling. |
| Photoperiod / vernalization | Development depends on cultivar and latitude | Latitude/date calculation and crop/cultivar records | N | N | N | daylight hours/day; cultivar response; chilling units if applicable | Context or validated constraint/score | [DAYLENGTH][] | P2 | Latitude exists but no daylight or cultivar response model; cited primary study concerns soybean and does not validate rules for the current catalog. |

### 3.3 Water supply and demand

| Factor | Scientific importance | Potential source | Available | Implemented | Scored | Units / basis | Proposed role | Ref | Priority | Missing inputs / limitation |
|---|---|---|---|---|---|---|---|---|---|
| Crop evapotranspiration `ETc` | Crop atmospheric water demand under stated assumptions | Derived `Kc × ETo` | N | N | N | mm/day or mm/stage | Derived water score/constraint after validation | [FAO56ETC][] | P0 | No ETo, Kc, stages or verified water-balance model; standard ETc is not actual stressed ET. |
| Reference evapotranspiration `ETo` | Reference atmospheric evaporative demand | FAO-56 calculation; reliable station or qualified data service | N | N | N | mm/day | Water-balance input | [FAO56ETO][] | P0 | Need latitude/elevation, Tmin/Tmax, appropriate humidity/vapor pressure, net radiation, 2 m wind and quality checks. |
| Crop coefficient `Kc` | Crop/stage adjustment from ETo to standard ETc | Reviewed FAO/extension coefficients and local cultivar data | N | N | N | Dimensionless by crop, stage, climate and management | Derived water input | [FAO56ETC][] | P0 | No crop stages, verified coefficient sources or applicability. |
| Effective rainfall | Portion of rainfall available in root zone | Derived water balance plus local conditions | N | N | N | mm/day/stage | Water-balance input | [FAOWATER][] | P0 | Gross NASA rainfall alone does not establish infiltration, runoff, deep percolation or storage. |
| Irrigation availability | Supplemental supply and timing | Farmer, irrigation authority, flow meter | P | P | N | mm or m³/ha per stage; timing and reliability; method | Input and potential hard constraint if verified | [FAOWATER][] | P0 | Qualitative category only; no volumes, allocation, timing or delivery efficiency. |
| Soil water-holding capacity | Limits usable root-zone storage | Lab/soil survey or qualified derived estimate | N | N | N | mm water per m soil and effective rooting depth | Water-balance input | [AWC][] | P1 | No field capacity, wilting point, layers, coarse fragments or effective root depth. |
| Drought sensitivity | Impacts depend on crop and growth stage | Cultivar trials, reviewed extension sources | P | P | P | Trait/stage, stress response, reliability | Warning/score only with evidence | [FAOCROPDURATION][] | P1 | Low/medium/high catalog trait is unvalidated and used for priority/alternative selection, not measured drought response. |
| Irrigation water quality | Salinity, infiltration and specific-ion toxicity | Water laboratory | N | N | N | ECw dS/m, SAR basis, ions e.g. mg/L, sampling date | Warning or validated hard constraint | [WATERQUALITY][] | P1 | Soil EC is not irrigation-water EC. No water lab values or water/soil/crop-specific criteria. |

### 3.4 Land, management and additional factors

| Factor | Scientific importance | Potential source | Available | Implemented | Scored | Units / basis | Proposed role | Ref | Priority | Missing inputs / limitation |
|---|---|---|---|---|---|---|---|---|---|---|
| Elevation | Affects climate and ETo pressure adjustment | Farmer or DEM | P | Y | N | m above stated datum | Context, climate/ETo input | [FAO56ETO][], [DEM][] | P1 | Farmer-entered optional; no terrain-derived value, datum or validation. |
| Slope / aspect | Runoff, erosion and operations | Survey, DEM | N | N | N | % or degrees; aspect degrees | Warning or validated land constraint | [GAEZDOC][], [DEM][] | P1 | Point coordinates alone do not give representative parcel slope; DEM scale/datum matter. |
| Erosion risk | Long-term sustainability and land loss | Soil survey, terrain, management/cover data | N | N | N | Locally defined risk class or validated soil-loss units | Warning/constraint | [SOILHEALTH][], [GAEZDOC][] | P1 | No slope, erosivity, cover, management or calibrated erosion model. |
| Flood / ponding risk | Anaerobic stress and crop loss | Local history, hydrology/flood map | N | N | N | probability/return-period and duration/depth with reference period | Warning or verified constraint | [HYDRIC][], [GAEZDOC][] | P1 | No observations, event extent/duration, local maps or crop tolerance. |
| Planting window | Crop cycle must fit local climate and management | Farmer, extension, FAO crop calendar | P | P | N (eligibility gate) | Dates; local season/cultivar | Hard constraint when verified; otherwise unknown/warning | [CALENDAR][] | P0 | Only broad Spring/Autumn starter windows; not global or cultivar-specific. |
| Crop family rotation | Repeated host crops can increase pest/disease pressure | Farmer history, taxonomy, pathogen guidance | P | Y | Y | Crop/family, dates and organism-specific interval | Verified constraint/warning and score | [ROTATION][] | P0 | Generic family penalties/caps do not identify pathogen hosts or locally safe return intervals. |
| Previous crop / management | Affects disease history and residue conditions | Farmer records | P | Y | Y | Crop, planting/harvest dates, history length; residue practice | Constraint/context and validated rotation factor | [ROTATION][] | P0 | Only 8 recognized crops, year/season order; actual dates, pests and residue notes do not numerically alter fit. |
| Farmer objectives | Preferences, risk, feasibility and resource limits differ | Farmer | P | Y | P | Explicit priorities, available resources and currencies | Separate preference ranking after physical eligibility | [FLE][] | P0 | Current priorities share physical score; budget unmodeled and production/profit neutral. |
| Cultivar, seed availability and legal restrictions | Variety traits, input access and rules determine feasibility | Farmer, seed supplier, local authority | N | N | N | Cultivar ID, maturity, availability, applicable rules | Verified constraint or context | [FLE][], [CALENDAR][] | P1 | No cultivar, market access, inputs, legal or seed-availability records. |
| Soil biology, pests, disease and weeds | Biological constraints and host-specific risks | Farmer, diagnostic lab, extension | P | P | N | Organism, severity, observation date, diagnostic confidence | Warning or evidence-backed constraint | [ROTATION][], [SOILHEALTH][] | P1 | Free-text pest notes trigger a generic warning only; no diagnosis or host model. |
| Local observations and uncertainty | Stations, representative tests and year-to-year variation improve interpretability | Weather station, lab QA, farmer | P | P | N | Method, uncertainty, dates, depth and spatial coverage | Evidence-quality gate/context | [POWER][], [SOILTEST][] | P0 | No station integration, quantitative uncertainty or local model validation. |

**Source and scale caution:** A farmer/laboratory value is not automatically verified; its provenance, units, analysis method and recency must be captured. NASA and mapped soils are gridded **estimates**. [SoilGrids][SOILGRIDS] can provide contextual estimates with depth and uncertainty, not field-lab N/P/K replacements; no SoilGrids integration currently exists. DEM products and flood/soil maps require appropriate geography, dates, resolution, licenses and validation. [USGS global DEMs][DEM].

## 4. Research conclusions: verified facts versus design assumptions

### 4.1 Verified scientific and provider evidence

1. FAO land evaluation is use-specific: requirements and limits depend on the crop, management and local setting, and the framework is not a source of universal numerical crop cutoffs. [FAO land evaluation][FLE2].
2. FAO-56 defines standard-condition crop evapotranspiration `ETc = Kc × ETo`, with `Kc` varying by crop and growth stage. Standard ETc is not actual stressed crop ET or proof of irrigation availability. FAO Penman–Monteith ETo needs meteorological inputs including temperature, humidity/vapor pressure, radiation and 2 m wind; latitude/elevation matter. [FAO-56 ETc][FAO56ETC]; [ETo inputs][FAO56ETO].
3. Total rainfall is not automatically effective crop-available rainfall. Effective rainfall and irrigation need depend on runoff, soil storage, drainage, crop period and management. [FAO irrigation needs][FAOWATER]; [NRCS available water][AWC].
4. Soil laboratory nutrient values depend on reporting units and extraction methods; a soil-test number can be a method-specific index, not total or directly available nutrient stock. [UMN soil test][SOILTEST]. Soil salinity measurements using different extract dilutions or apparent EC are not directly interchangeable with saturated-paste ECe. [NRCS field book][NRCSFIELD].
5. Crop duration depends on crop, variety, climate and planting date; the FAO crop calendar provides agroecological/country context. [FAO crop duration][FAOCROPDURATION]; [FAO crop calendar][CALENDAR]. Daily or hourly extremes carry information that a monthly average cannot reconstruct. [NASA temporal processing][POWERPROC].
6. Soil water storage depends on texture, rooting depth, coarse fragments, organic matter and compaction. Soil and water salinity/toxic ions require different analyses and crop-specific interpretation. [NRCS available water][AWC]; [FAO irrigation-water quality][WATERQUALITY].
7. Rotation benefits and disease management depend on host/pathogen interactions and local practice. A broad botanical-family rule is an initial warning, not a universally valid disease interval. [UMN small-grain rotations][ROTATION].
8. ECOCROP and GAEZ are reference datasets, not field observations. FAO states ECOCROP was discontinued as a standalone database around 2015 and incorporated into GAEZ; GAEZ v4 is a gridded regional/global assessment with explicit historical, management and irrigation scenarios. [FAO ECOCROP][ECO]; [GAEZ][GAEZ].

### 4.2 Assumptions and unresolved choices

- A single pilot agroecological region and small curated crop/variety set are recommended. **The region, crops, target season and risk tolerance are not selected by this audit.**
- Current thresholds, weights, 45/65 caps and organic-matter warning have not been independently validated by the references above. General background citations do not prove numeric fit curves.
- No new numeric thresholds, crop requirements, factor weights, minimum evidence percentages, confidence cutoffs, return intervals, treatment effects, or validity periods are asserted here. They require evidence and recorded sign-off.
- Some factors may be optional for a specific crop and use; the agronomist must distinguish **required**, **optional**, **not applicable** and **unknown**, rather than treating all absences equally.

## 5. Recommended future recommendation architecture

The following is a **proposal**, not current implementation or a claim that a new composite score is already scientifically validated.

### 5.1 Typed crop-requirement knowledge base

Create a versioned, reviewable crop/cultivar/management record with: accepted taxonomy and synonyms; applicable geography/agroecological zone; crop purpose and system; cultivar and dates/growth-stage durations; temperature and water responses by stage; soil pH/texture/depth/drainage/salinity constraints with test methods; rotation/pathogen host rules; required inputs; management assumptions; evidence citations with page/table/section, geographic and temporal scope, units, date accessed, rights/license, reviewer, review date, version, and status (`draft`, `reviewed`, `retired`). Link **each numeric rule** to its own evidence, not just one crop-level generic link. Use ECOCROP/GAEZ as leads or contextual checks, verify original source and suitability of reuse, and prefer local trial and extension evidence where applicable. Keep unsupported entries explicitly unknown.

### 5.2 Typed evidence and calculation pipeline

```text
Farmer/lab inputs + historical climate + verified local reference rules
  → validate units, method, date, source, location and provenance
  → derive crop-stage climate and, only with adequate data, a water balance
  → evaluate critical constraints using pass / fail / unknown / not-applicable
  → evaluate supported crop-specific factors with explicit evidence quality
  → compare eligible, sufficiently evidenced candidates under an approved policy
  → return up to 4 + exclusions + unknowns + confidence + exact explanations
```

1. **Evidence contract:** every value carries source type (`lab`, farmer-measured, farmer-estimate, NASA grid, derived, external map), date/period, units, method, spatial support, uncertainty/quality where known, and raw vs derived lineage. Preserve gaps, do not transform unknown into 0, an assumed measurement, or the center of a range. Do not fill laboratory pH/N/P/K from NASA.
2. **Temporal analysis:** use a farmer-confirmed planting date or locally reviewed scenario and crop/variety stage lengths. Calculate multi-year historical distributions and risks over the applicable stage windows, including cross-year seasons. Select a baseline and minimum coverage only after local scientific review; report coverage, year range, representativeness and historical—not forecast—meaning.
3. **Derived water:** with verified daily inputs and methods, calculate ETo using a documented FAO-56 method; use stage-specific Kc to obtain standard-condition ETc; incorporate explicitly modeled effective rainfall, measured/estimated irrigation amounts/timing/efficiency, initial root-zone storage and soil holding capacity. Treat deficit/stress and actual ET as separate model outputs requiring additional assumptions and validation. If inputs are missing, say **water balance unavailable**, not 0 mm or "sufficient". [FAO-56][FAO56ETC]; [effective rainfall][FAOWATER].
4. **Critical constraint engine:** represent each independently as `pass`, `fail`, `unknown` or `not_applicable` with evidence, scope and reason. A **verified** critical failure makes a crop ineligible or requires a prominently documented agronomist-approved alternative-management scenario; a favorable average cannot override it. An unknown critical input is not a pass: classify the crop `insufficient_evidence` and request the input. Do not invent or universally apply thresholds. Restrictions on pests, toxins, growing window, salinity, frost, irrigation allocation and farmer non-negotiables must be based on reviewed, applicable rules.
5. **Factor responses:** calculate crop-, cultivar-, stage- and region-specific factor outcomes only when both input evidence and reviewed rule are applicable. Use response curves or classes from documented sources, retaining raw inputs, measurement method, stage, thresholds and flags. Factors may be reported as ordinal classes first; no need to force a 0–100 value where evidence is insufficient.
6. **Overall ranking:** physical eligibility first, followed by an approved, validated aggregation policy. If experts choose a weighted score, define crop/region/stage-specific weights or functions from a documented calibration protocol, avoid double-counting correlated factors, record all trade-offs and validate against independent local observations. Keep farmer preferences as a **separate optional ordering/filter** of feasible options; do not let budget or preference turn an agronomically impossible crop into a feasible one. No numerical weights are prescribed in this report.
7. **Missing-information policy:** define required evidence by crop, region and scenario. If any critical input is unknown or a rule lacks applicable evidence, do not present a definitive numeric rank for that crop; return `insufficient_evidence`, name the missing item and action, and optionally show a clearly labeled unranked exploratory profile. If approved optional factors are missing, show a separate, explicit provisional result only under an agronomist-approved policy; do not silently renormalize or compare candidates on different hidden denominators. Conflicting or stale measurements require review, not arbitrary replacement.
8. **Separate outputs:** `suitability` (evidence-backed physical result); `completeness` (per-factor applicable/available/quality and critical gaps, not a safety certificate); `confidence` (qualitative evidence-quality statement, separate from fit and not a success probability); `preference` (farmer goals); and `constraints` (pass/fail/unknown). A quantitative confidence interval requires a validated uncertainty model and validation data; otherwise use words and evidence, not a fabricated percentage.
9. **Explain why #1 outranks #2:** compare the same validated criteria and time window, with crop-specific evidence, values, units, source/date, each result and the decision policy. Include binding constraints, missing inputs, uncertainty and whether the difference is robust to reasonable approved input/weight uncertainty. If score intervals overlap or unknowns change the ordering, report a tie/uncertain order rather than claiming a precise winner. Avoid presenting heuristic scores as probabilities.
10. **Top four contract:** return at most four **eligible and sufficiently evidenced** entries, in reproducible order with deterministic tie handling; return zero to three where appropriate. Show separate `excluded` and `insufficient_evidence` sections with exact reasons and next actions. Do not fill to four with unsupported alternatives. Apply the same selection policy to web, Expo, saved analyses, exports and comparison views.

### 5.3 Suggested logical contracts, not implementation

```ts
type EvidenceState = 'observed' | 'estimated' | 'derived' | 'unknown' | 'not_applicable'
type ConstraintState = 'pass' | 'fail' | 'unknown' | 'not_applicable'
type Decision = 'eligible' | 'ineligible' | 'insufficient_evidence'
// For each result: value + unit + period + location + source/method/quality,
// crop-rule ID + version + reference + scope + reviewer, constraints,
// factor outcomes, missing requirements, explanation and model version.
```

Version the data schema, crop knowledge, calculation policy and source snapshots separately. Save enough immutable inputs/derived values/reference versions to reproduce a result; keep superseded analyses labeled, never silently rewrite history. Accept only trusted/revalidated provider data at adapter boundaries, and document when offline/cached results were originally fetched.

### 5.4 Explainable AI agent: future boundary

A future LLM may help a farmer **understand** a completed structured analysis, ask for missing data and navigate cited material. It must not generate crop thresholds, pretend to inspect a laboratory file, supply missing NASA measurements, decide a safety constraint, or calculate authoritative scores. The deterministic validated engine and reviewed evidence store remain the source of decision output. Require user consent for sending field data to any external AI service, citations tied to actual retrieved references, prompt-injection defenses, uncertainty language and agronomist escalation. No AI agent is currently implemented.

## 6. React Web and React Native + Expo reuse

| Component | Current evidence | Reuse assessment / required work |
|---|---|---|
| Suitability and rotation rules | [src/lib/recommendations.ts](src/lib/recommendations.ts#L1) | TypeScript logic is largely UI-independent and testable. Extract to a pure domain package; remove dependency on browser-oriented `needsLegacyReview` in repository, inject reviewed catalog/config, remove demo/legacy source types from new engine contracts, and run identical fixture/golden tests on Web and Expo. The existing rules themselves remain unvalidated. |
| Crop and field types | [src/types.ts](src/types.ts#L1) | Types are shareable. Extend with measurement units/methods/quality, cultivar/phenology, explicit missing states and versioned rules. Existing crop records include web `/images/...` paths; isolate visual asset resolution from scientific definitions. |
| Crop catalog | [src/data/crops.ts](src/data/crops.ts#L1) | Data structure can be shared after provenance/review redesign. Current broad values are not ready for a production engine; assets and locale text should be platform-independent or mapped per client. |
| NASA parsing and URL construction | [src/services/nasaPower.ts](src/services/nasaPower.ts#L15) | Parsing/conversions can be refactored to pure functions shared across clients. Network `fetch`, `AbortController`, `DOMException`, `URLSearchParams` and runtime behavior need testing on the selected Expo/Hermes version; inject transport, clock, timeout and storage. `sessionStorage` is browser-only; use a native adapter or disable caching until a secure replacement is reviewed. |
| History and saved-analysis types | [src/lib/history.ts](src/lib/history.ts); [src/types/analysis.ts](src/types/analysis.ts) | Sorting and serializable data contracts can be shared with schema migrations and cross-platform tests. `isAnalysisRecord` currently imports repository validation and accepts legacy source types; extract pure schema validators. |
| Web app context and persistence | [src/context/AppContext.tsx](src/context/AppContext.tsx#L55) | Current localStorage/session assumptions and browser-specific recovery are not native storage. Provide repository interfaces and Web/Expo adapters; decide how sensitive farm data is protected, migrated and backed up. |
| Map, charts and screens | [src/components/FieldMap.tsx](src/components/FieldMap.tsx); [src/components/ClimateChart.tsx](src/components/ClimateChart.tsx); [src/pages](src/pages/) | Leaflet, Recharts, DOM, React Router, browser printing/file APIs and CSS are web-specific. Build native presentation adapters/screens; do not claim the current components run unchanged in Expo. |
| Provider-backed account service | [src/services/supabaseWorkspace.ts](src/services/supabaseWorkspace.ts); [src/context/AuthContext.tsx](src/context/AuthContext.tsx) | Business contract may be shared; native secure session storage, redirects/deep links, network behavior and actual provider/RLS tests need platform-specific design. Existing cloud integration is not provisioned or live-verified here. |

## 7. Validation and testing plan

- **Reference validation:** every crop/rule must map to a specific source, supported region, variety/management, method, date and named reviewer. Separate scientific evidence from product assumptions. Have regional experts review contradictions and transferability before release.
- **Data integrity:** test units, soil extraction/method mismatch, EC basis, dates, missing values, plausible-range checks, cross-year windows, leap days, NASA fill values, partial years, source location, retries/429, stale cache, coordinate/parameter/time-standard changes, and reproducibility. Verify API-community parameter availability against the current [NASA parameter guide][PARAM] before coding.
- **Hard-constraint safety:** tests for verified pass/fail/unknown, boundary values, conflicting inputs, conditional management, inadequate evidence, and absence of unsafe override; unknown must never be silently treated as safe. Explicitly test that no more than four and no unsupported filler entries are returned.
- **Scientific validation:** pre-register pilot locations/crops/seasons and reference outcomes with independent agronomist-assessed field observations and relevant local trials; use holdout farms/seasons/geographies, spatial/temporal validation and representative failure cases. Evaluate false-safe and false-ineligible outcomes, explanation correctness, uncertainty calibration if claimed, and subgroup/region performance. Do not assume any number of sites, performance target or baseline as validated in this audit.
- **Counterfactual and sensitivity checks:** improve/impair one verified input within a valid range; check plausible monotonicity where evidence supports it, agronomist-reviewed non-monotonic responses where not, ranking stability under uncertainty, no double-counting, and identical evidence used for #1/#2 explanations. A better pH score alone must not override a failed critical constraint.
- **Cross-platform and operational:** identical pure-engine results and serialized snapshots on Web/Expo; offline/cache attribution and cancellation; privacy/security tests; actual provider and two-account RLS tests; service monitoring and versioned rollback. Benchmark with representative low-connectivity devices before release.

## 8. Roadmap and exact files affected by a future implementation

These are proposed changes only. No implementation is authorized by this audit request.

### P0 — evidence, safety, top-four contract and data integrity

1. Agree pilot geography, crops, growth scenario, lab methods and validation owner; define source licensing and crop-by-crop review. Inventory and replace unsupported numeric rules only after evidence approval.
2. Introduce typed unknown/quality/provenance, crop-specific required inputs, hard-constraint states, safe failure and a consistent at-most-four result contract. Split physical suitability from preferences, completeness and confidence.
3. Add daily climate sourcing and time/space metadata design, verified parameter/unit contracts, crop-stage windows and input sufficiency; do not compute unsupported ETo/water scores.
4. Validate with independent field/trial evidence, gold test cases and a documented false-safe review. Gate release on agronomist sign-off and explicitly communicate that fewer than four candidates may be returned.

### P1 — validated water/soil/rotation modeling and pilot usability

1. Collect structured irrigation quantities/efficiency, root-zone properties and stage dates. Implement FAO-56 ETo/ETc and a locally validated effective-rainfall/root-zone water balance only when required inputs are available.
2. Add drainage, root-restrictive depth, EC method, soil-test analyte/extraction and locally reviewed pest-host intervals. Evaluate slope/flood/erosion using sources and field-scale limitations.
3. Improve transparency, crop comparisons, model-version persistence, localization and real-device workflows. Revalidate recommendations across seasons and regions rather than extrapolating one pilot.

### P2 — optional data and cross-platform/agent expansion

1. Evaluate DEM, mapped soil/soil-moisture products and local stations as **labeled estimates or contextual evidence**, never silent substitutes for field/lab data. Assess spatial resolution, coverage, rights and uncertainty.
2. Extract and test the shared domain package on React Native + Expo with platform adapters for storage, network, mapping and presentation.
3. If explicitly approved, add a constrained explanatory AI agent using the deterministic engine output and vetted sources; perform privacy, safety and independent evaluation first.

### Existing files likely to need changes

| File | Proposed responsibility |
|---|---|
| [src/lib/recommendations.ts](src/lib/recommendations.ts) | Replace current heuristics with reviewed eligibility, factor, missing-data, ranking and explanation contracts; move shared engine into a pure package. |
| [src/data/crops.ts](src/data/crops.ts) | Replace unreviewed monolithic crop records with versioned, reference-linked, crop/cultivar/region/stage evidence and separate asset mapping. |
| [src/types.ts](src/types.ts) | Typed observations, units, methods, quality, crop requirements, constraint states, evidence coverage and result versions. |
| [src/services/nasaPower.ts](src/services/nasaPower.ts) | Daily/multi-year request contracts, quality/time/grid provenance and injectable transport/cache; maintain existing validated monthly behavior where appropriate. |
| [src/hooks/useClimate.ts](src/hooks/useClimate.ts) | Call shared service via a web adapter; expose quality, pending, stale, cancellation and insufficient-data states. |
| [src/pages/Fields.tsx](src/pages/Fields.tsx) and [src/components/FieldMap.tsx](src/components/FieldMap.tsx) | Collect structured method, depth, planting dates, water allocation and field-scale context; geographic UI remains platform-specific. |
| [src/pages/Recommendations.tsx](src/pages/Recommendations.tsx) | Consistent top-four display, explicit eligible/unknown/excluded groups, comparable evidence, limitations and pairwise rationale. |
| [src/pages/Planner.tsx](src/pages/Planner.tsx) | Reuse reviewed constraint and stage engine for whole-sequence plans, cross-year windows, feasibility and uncertainty. |
| [src/pages/Analysis.tsx](src/pages/Analysis.tsx), [src/types/analysis.ts](src/types/analysis.ts) | Store/replay versioned evidence, data quality, model/rule versions and top-four decisions without silently revising snapshots. |
| [src/services/repository.ts](src/services/repository.ts), [src/context/AppContext.tsx](src/context/AppContext.tsx), [src/services/supabaseWorkspace.ts](src/services/supabaseWorkspace.ts) | Separate pure validation from browser storage; migrate versioned records safely; adapters and real account/RLS tests as needed. |
| [src/components/ClimateChart.tsx](src/components/ClimateChart.tsx), [src/pages/General.tsx](src/pages/General.tsx) | Display daily/stage summaries, source resolution/quality, uncertainty and revised scientific explanation; keep web components separate from native UI. |
| [src/lib/recommendations.test.ts](src/lib/recommendations.test.ts), [src/services/nasaPower.test.ts](src/services/nasaPower.test.ts), [src/services/repository.test.ts](src/services/repository.test.ts), [scripts/qa-real-data.mjs](scripts/qa-real-data.mjs) | Add meaningful scientific, invalid-data, constraint, provenance, top-four, cross-platform and user-workflow tests. |
| [README.md](README.md), [PROJECT_SPEC.md](PROJECT_SPEC.md), [REAL_DATA_AUDIT.md](REAL_DATA_AUDIT.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [REQUIREMENTS_GAP_ANALYSIS.md](REQUIREMENTS_GAP_ANALYSIS.md) | Update only when future implementation and verification actually occur; maintain source inventory, release gates and known limitations. |

New files would likely be needed for a shared domain package, versioned crop-rule catalog, climate/soil/water adapters, reviewed data schemas, and a local agronomist validation dataset. Their names and locations should be decided in the approved implementation plan; no files or tables have been created for them here.

## 9. Questions requiring agronomist and product-owner decisions

1. Which country/region, elevation band, irrigation regime, planting season and actual first crop/variety set define the pilot? Is the intended recommendation rainfed, irrigated, or both as separate scenarios?
2. Which crop/cultivar sources and local trial datasets are authoritative and licensed for each requirement, growth stage, permissible sowing period, plantable area, and environmental constraint? Who signs each rule and when is it reviewed?
3. What pH and N/P/K laboratory methods, chemical forms, reporting units and sample depths are common locally? How are stale samples, mixed methods, uncertainty and field heterogeneity handled?
4. What constitutes a critical incompatibility for each crop and management scenario? What evidence is sufficient for `fail`, `pass` and `unknown`, including soil salinity/EC basis, flooding, toxicity, heat and frost?
5. Which diseases/pests and alternative hosts matter locally? What crop-specific return intervals are justified, and how do missing or uncertain crop-history records affect eligibility?
6. What irrigation volumes, dates, efficiency, water quality and reliability can farmers supply? What soil-rooting layers, moisture, runoff and retention parameters are available to support an FAO-56 water balance?
7. Which historical baseline, station data, spatial/temporal resolution, missing-data tolerance and climate bias checks are appropriate for this region? How should grid-to-field mismatch be described?
8. Which suitability response curves and aggregation method are justified? Which factors may legitimately compensate, which cannot, how should correlated inputs be handled, and what evidence supports any weights?
9. Which data are mandatory for each crop? When should a result be unranked or withheld, and how should the app distinguish provisional exploration from a recommendation?
10. How should physical suitability, farmer preference, affordability, restrictions and uncertainty be presented independently? Are ties and fewer than four suggestions acceptable when evidence is limited?
11. Which independent farms, trials and growing seasons can validate false-safe/false-exclusion rates and explanations? Who evaluates success and authorizes a release?
12. What consent, privacy, retention, accessibility, language, connectivity and mobile-platform requirements apply before user testing or any future AI service?

## 10. Scientific and technical sources

Links below are official guidance, provider documentation, or primary research. Their presence does **not** validate any specific current AgriLumina numeric cutoff. Applicability, version, availability and rights must be checked again when a future catalog is curated.

- [FAO Framework for Land Evaluation: overview][FLE] and [principles and non-universal limits][FLE2].
- [FAO ECOCROP status][ECO], [FAO/IIASA GAEZ v4][GAEZ], [GAEZ v4 model documentation][GAEZDOC], and [FAO Crop Calendar][CALENDAR].
- [FAO Irrigation and Drainage Paper 56: standard-condition crop ET][FAO56ETC], [Penman–Monteith data requirements][FAO56ETO], [FAO irrigation water needs][FAOWATER], and [crop growth duration][FAOCROPDURATION].
- [NASA POWER monthly API][POWER], [daily API][POWERDAILY], [temporal processing][POWERPROC], and [parameter dictionary guidance][PARAM].
- [USDA NRCS soil health assessment][SOILHEALTH], [available water capacity][AWC], [bulk density][BULK], [field-book EC methods][NRCSFIELD], [soil properties and drainage][SOILS], and [hydric soil indicators][HYDRIC].
- [University of Minnesota Extension soil-test interpretation][SOILTEST] and [small-grain rotations][ROTATION]. Their regional guidance is evidence of method/host specificity, not an automatic rule for all locations.
- [FAO irrigation-water quality][WATERQUALITY] and [FAO growing-period analysis][GROW].
- [Primary soybean photoperiod research][DAYLENGTH]; [ISRIC SoilGrids documentation][SOILGRIDS]; [USGS global elevation data][DEM]. SoilGrids and DEMs are suggested research sources, not current integrations or field-test substitutes.

[FLE]: https://www.fao.org/land-water/land/land-governance-and-planning/land-resources-planning-toolbox/detail/framework-for-land-evaluation-%28fle%29/en
[FLE2]: https://www.fao.org/4/x5310e/x5310e02.htm
[ECO]: https://www.fao.org/land-water/resources/tools/databases/ecocrop/en
[GAEZ]: https://www.fao.org/gaez/gaezv4/en
[GAEZDOC]: https://gaez-v4-data.fao.org/data/documentation/GAEZ%20v4%20Model%20Documentation.pdf
[CALENDAR]: https://cropcalendar.apps.fao.org/
[FAO56ETC]: https://www.fao.org/4/X0490E/x0490e0a.htm
[FAO56ETO]: https://www.fao.org/4/X0490E/x0490e06.htm
[FAOWATER]: https://www.fao.org/4/s2022e/s2022e04.htm
[FAOCROPDURATION]: https://www.fao.org/4/S2022E/s2022e07.htm
[POWER]: https://power.larc.nasa.gov/docs/services/api/temporal/monthly/
[POWERDAILY]: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
[POWERPROC]: https://power.larc.nasa.gov/docs/methodology/data/processing/
[PARAM]: https://power.larc.nasa.gov/docs/tutorials/parameters/
[SOILHEALTH]: https://www.nrcs.usda.gov/conservation-basics/soil/soil-health/soil-health-assessment
[AWC]: https://www.nrcs.usda.gov/sites/default/files/2022-10/nrcs142p2_051590.pdf
[BULK]: https://www.nrcs.usda.gov/sites/default/files/2022-10/nrcs142p2_051591.pdf
[NRCSFIELD]: https://www.nrcs.usda.gov/sites/default/files/2025-04/Field-Book-for-Describing-and-Sampling-Soils-v4.pdf
[SOILS]: https://www.nrcs.usda.gov/sites/default/files/2022-11/from-the-surface-down.pdf
[HYDRIC]: https://www.nrcs.usda.gov/resources/guides-and-instructions/field-indicators-of-hydric-soils-in-the-united-states
[SOILTEST]: https://extension.umn.edu/agriculture/crop-production/nutrient-management-for-minnesota-crops/understanding-the-soil-test-report
[ROTATION]: https://extension.umn.edu/agriculture/crop-production/small-grains/small-grain-crop-rotations
[WATERQUALITY]: https://www.fao.org/4/T0234e/T0234E01.htm
[GROW]: https://www.fao.org/4/W2962E/w2962e-03.htm
[DAYLENGTH]: https://pubmed.ncbi.nlm.nih.gov/37011215/
[SOILGRIDS]: https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs.html
[DEM]: https://www.usgs.gov/faqs/where-can-i-get-global-elevation-data
