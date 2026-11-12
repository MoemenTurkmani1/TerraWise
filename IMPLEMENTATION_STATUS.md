# TerraWise implementation and verification status

Updated 12 November 2026 for the approved scientific P0 engineering changes, following the earlier review of all five pages of the original requirements PDF and all four reference images. See [REQUIREMENTS_GAP_ANALYSIS.md](REQUIREMENTS_GAP_ANALYSIS.md) and [REAL_DATA_AUDIT.md](REAL_DATA_AUDIT.md).

## Implemented

- New local and account workspaces begin without seeded fields. The production NASA service has no synthetic fallback. Untouched old sample fields and simulated analysis snapshots are hidden while underlying saved records are preserved. Edited legacy fields require explicit review and correction before use in results or climate requests. Old simulated and unreviewed snapshots are excluded from real-data export.
- The field wizard captures location, area, explicit water choice, optional nullable soil values, units, sample/lab details, provenance and crop history. A newly added previous-crop entry and priorities require explicit choices. Report attachments are local, consent-based and not analyzed.
- NASA POWER historical monthly requests use validated coordinates, bounded complete years, documented parameter units, timeout/cancellation, quality checks, source metadata and a session cache keyed by exact location and period. Missing core data and failures do not generate synthetic values; partial humidity is identified.
- P0 evidence model: missing pH/N/P/K, history and water fit remain unknown/unscored. No overall score or ranked crop recommendations are produced while the water balance and crop-specific critical rules are unvalidated. Up to four alphabetical exploratory profiles per page show provisional factor comparisons, missing inputs, eight-category completeness and low confidence. Rotation scenarios remain editable, saveable and exportable but are not planting recommendations. Prior saved scores remain stored but are withheld in reports.
- The dashboard, charts and analysis history use entered records and available NASA data. Optional Supabase auth/workspace adapters and an owner-RLS migration are present, with explicit local/cloud and failure states.

## Verified

- Unit tests: 47 tests in 7 files passed, including invalid NASA units and observations, rate limits, cache separation, missing data, soil/repository validation and deterministic rotations.
- Production build: TypeScript and Vite build passed.
- `scripts/qa-real-data.mjs`: isolated desktop and 390px mobile browser workflows passed against the production preview. Tested empty workspace, field validation/persistence, no climate/chart/score on failed NASA request, a **synthetic test response** for unranked crop profiles and comparison, rotation saving/reload, analysis history, preservation and safe display of synthetic legacy analysis scores, and review-gated preservation of edited legacy examples.
- Unmocked browser NASA request: successful response for test coordinates 33.8467, 35.9019, complete 2025 historical period; source and coordinates were visible. This verifies the public endpoint at that time, not current or future availability or on-farm measurements.
- The earlier Supabase browser test used synthetic accounts and a mock service. It does not verify a real project's authentication, email, row-level security or cross-device behavior. Previous demo-dependent browser scripts are historical and superseded by the real-data script.

## Remaining work before production use

1. A regional agronomist must review every crop range, water/irrigation assumption, soil-test method, season, crop-family and pest rule and provide rule-level references and geographic applicability. Existing numeric rules and confidence labels are uncalibrated; results are provisional even when inputs are complete.
2. Provide a Supabase project URL and public publishable/anon key via `.env.local`, apply `supabase/migrations/20261111_workspace.sql`, configure redirects and SMTP, and verify registration, recovery, anonymous access, two-account isolation and cross-device persistence. Do not provide a service-role key in frontend variables. Cloud soil report storage, normalized production entities, account deletion, backups and recovery are not implemented.
3. Add Arabic/RTL and conduct accessibility and physical Android/iPhone/Safari/Firefox tests. The recorded checks use desktop Edge and mobile viewport emulation, not physical devices.
4. Improve scientifically supported long-term climate baselines, crop durations, pest-specific intervals, salinity/soil cover effects and irrigation measurements; no unsupported forecasts should be added. Browser print/Save as PDF exists, but direct PDF generation/sharing does not.
5. Complete legal/privacy, retention, monitoring, backup and incident procedures before exposing public accounts. No deployment has been made.

Run locally with `npm ci` and `npm run dev`; setup and test details are in [README.md](README.md).
