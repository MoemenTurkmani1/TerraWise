# AgriLumina branding migration

This is a branding migration of the existing application. Display branding, English/Arabic AI labels and scientific reference prose, browser/PWA/native display names, logo text, metadata, documentation and new export filenames now use AgriLumina. The sprout symbol, agricultural palette, typography and layout are retained. Package metadata uses the valid lowercase npm name `agrilumina`.

## Compatibility identifiers retained

- Supabase table `terrawise_workspaces`, project configuration ID, policies and migration SQL remain unchanged.
- Existing `terrawise.*` browser/session/IndexedDB/cache keys and scientific model-version identifiers remain unchanged, preserving saved data and snapshots.
- Native app identifier `com.terrawise.app`, Java namespace, iOS bundle identifiers and the `terrawise://auth` callback scheme remain unchanged; provider redirect settings do not require migration.
- API routes, environment variable names, mock provider addresses, Redis key prefixes, deployment resource names and secrets remain unchanged.
- Original requirements PDF and historical audit filenames remain unchanged so documentation links and source provenance stay valid. Their editable surrounding documentation uses the current brand. Original binary source documents and Git history were not rewritten.
- The workspace directory name is unchanged. Generated web/native assets are rebuilt and synchronized from source.

No application data, provider settings, SQL, policies, scientific values, crop scores or operational endpoints were modified. No deployment was performed.

## Files edited by this migration

- [.docs/AI_AGRONOMIST.md](.docs/AI_AGRONOMIST.md)
- [AI_AGRONOMIST_REPORT.md](AI_AGRONOMIST_REPORT.md)
- [android/app/src/main/res/values/strings.xml](android/app/src/main/res/values/strings.xml)
- [capacitor.config.json](capacitor.config.json)
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- [FINAL_IMPLEMENTATION_REPORT.md](FINAL_IMPLEMENTATION_REPORT.md)
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
- [index.html](index.html)
- [ios/App/App/Info.plist](ios/App/App/Info.plist)
- [LOCAL_DEMO_MODE.md](LOCAL_DEMO_MODE.md)
- [MVP_RELEASE_REPORT.md](MVP_RELEASE_REPORT.md)
- [NATIVE_APPS.md](NATIVE_APPS.md)
- [package.json](package.json)
- [package-lock.json](package-lock.json)
- [PROJECT_SPEC.md](PROJECT_SPEC.md)
- [public/favicon.svg](public/favicon.svg)
- [public/manifest.webmanifest](public/manifest.webmanifest)
- [public/sw.js](public/sw.js)
- [README.md](README.md)
- [REAL_DATA_AUDIT.md](REAL_DATA_AUDIT.md)
- [REQUIREMENTS_GAP_ANALYSIS.md](REQUIREMENTS_GAP_ANALYSIS.md)
- [SCIENTIFIC_SCREEN_METHODOLOGY.md](SCIENTIFIC_SCREEN_METHODOLOGY.md)
- [scripts/qa-app.mjs](scripts/qa-app.mjs)
- [scripts/qa-decisions.mjs](scripts/qa-decisions.mjs)
- [scripts/qa-demo.mjs](scripts/qa-demo.mjs)
- [src/App.tsx](src/App.tsx)
- [src/components/Layout.tsx](src/components/Layout.tsx)
- [src/pages/Agronomist.tsx](src/pages/Agronomist.tsx)
- [src/pages/Auth.tsx](src/pages/Auth.tsx)
- [src/pages/BekaaSeasonPanel.tsx](src/pages/BekaaSeasonPanel.tsx)
- [src/pages/FieldWaterInputs.tsx](src/pages/FieldWaterInputs.tsx)
- [src/pages/General.tsx](src/pages/General.tsx)
- [src/pages/Planner.tsx](src/pages/Planner.tsx)
- [src/pages/Settings.tsx](src/pages/Settings.tsx)
- [src/services/supabaseConfigGuard.ts](src/services/supabaseConfigGuard.ts)
- [supabase/functions/ai-agronomist/answer.ts](supabase/functions/ai-agronomist/answer.ts)
- [supabase/functions/ai-agronomist/context.ts](supabase/functions/ai-agronomist/context.ts)
- [supabase/functions/ai-agronomist/gemini.ts](supabase/functions/ai-agronomist/gemini.ts)
- [supabase/functions/ai-agronomist/knowledge.ts](supabase/functions/ai-agronomist/knowledge.ts)
- [SUPABASE_SECURITY_AUDIT.md](SUPABASE_SECURITY_AUDIT.md)
- [TERRAWISE_SCIENTIFIC_SCORING_AUDIT.md](TERRAWISE_SCIENTIFIC_SCORING_AUDIT.md)
- [WATER_AND_SEASON_METHODOLOGY.md](WATER_AND_SEASON_METHODOLOGY.md)



- [src/components/Mvp.css](src/components/Mvp.css)
- [scripts/qa-branding.mjs](scripts/qa-branding.mjs)
- [BRANDING_MIGRATION_REPORT.md](BRANDING_MIGRATION_REPORT.md)

## Verification results

- Full automated suite: **194 tests passed across 22 files** after the rename, including existing Supabase, NASA, FAO-56, ranking, Gemini, quota and isolation coverage.
- Frontend/server TypeScript checks passed. Production build passed. Rebuilt web assets synchronized successfully into both existing native projects; native display names are AgriLumina and native app identifiers remain unchanged. No signed native build or deployment was performed.
- `npm run qa:branding` passed against the production preview at desktop 1440px and mobile 390px, covering browser title/meta, landing/login/signup/recovery, dashboard, fields, settings, AI, screening, water, rotation/history views, manifest/native metadata and export filenames. It confirmed records loaded from unchanged legacy keys and remained preserved across Demo Mode. No page errors or horizontal overflow were found.
- Existing complete desktop/mobile demo workflow QA passed, including ETo/ETc, crop rankings, plans, analyses, exports and real-workspace isolation. Browser contexts contained synthetic test data only; production data was not modified.
- Screenshots under `test-results/branding/` were visually reviewed for desktop login, mobile login and fully opened mobile navigation. The sprout mark, brand color and agricultural visual identity are retained; mobile authentication now also displays the shared logo.
- Current UI/source branding scan found no old product-name text. Remaining matches are deliberately retained technical compatibility identifiers, original source filenames, negative test assertions and historical paths. The original PDF and Git history retain their original contents.
- Existing root and server secret files were not modified or exposed. SQL migrations, policies, database tables, endpoints, environment variable names and resource identifiers were not renamed.

The list above contains **45 source, documentation and test files** changed or added by this migration, excluding generated build copies. Generated outputs were refreshed under `dist/`, `android/app/src/main/assets/` and `ios/App/App/public/`, plus generated native Capacitor configuration metadata. Existing staged/uncommitted work from other tasks was retained.
