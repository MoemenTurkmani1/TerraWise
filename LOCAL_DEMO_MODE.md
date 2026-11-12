# AgriLumina local Demo Mode

Run `npm run dev`, open http://localhost:5173, and click **Try Demo Farm** on the dashboard, /login, or /about. No account or manual field setup is needed. Demo Mode is enabled during development and on localhost production previews.

Use the **Demo farm** selector in the persistent amber banner to switch between Bekaa Valley (wheat), North Lebanon (mixed vegetables), and Coastal Lebanon (sandy coastal soil). Each farm has two synthetic fields, farmer preferences, four-window exploratory rotations, and two saved analysis snapshots. **Reset Demo Data** restores all three demo farms. **Exit Demo** returns to login and restores access to the original workspace.

## Working workflows

- Dashboard summaries, field search, mobile menu and navigation.
- Field creation, editing, archiving, restoration and deletion; isolated draft recovery.
- Field coordinates, area/elevation, soil chemistry and texture, crop history, priorities, irrigation events, and sourced crop-stage inputs.
- Monthly climate charts and tables; one-, three-, and five-year analysis context.
- Existing FAO ECOCROP limiting-factor pH/temperature screens, with source and missing-input checks.
- Existing FAO-56 daily Penman–Monteith ETo, stage-dependent Kc and standard-condition ETc for the seeded wheat/tomato profiles.
- Available root-zone water storage; an optional fully explicit synthetic single-day balance example.
- Bekaa wheat study reference, synthetic daily extrema and cross-year climate context.
- Rotation alternatives, editing, saving, export; new analyses, history details, deletion and print views.
- Profile and unit preferences, labeled workspace JSON export.

## Scientific inputs and limits

All field, soil, elevation, irrigation, history and weather values in this mode are **DEMO / SYNTHETIC**. They are fictional scenarios, not measured or validated Lebanese farm datasets. Annual weather scenarios repeat for multi-year views and cannot establish trends. Daily weather is deterministically derived from these scenarios. NASA POWER is never called in Demo Mode; no NASA provenance is attached.

Calculated outputs use the existing engines; no crop screen, ETo, ETc or water-storage result is assigned as a fixture score. The FAO two-factor screen requires a valid pH, all twelve ordered monthly temperatures, and matching synthetic field/fixture coordinates and farm identity. Unsupported or incomplete inputs yield no screen scores.

Kc and stage examples cite [FAO-56 chapter 6, Tables 11 and 12](https://www.fao.org/4/X0490E/x0490e0b.htm):
- Winter wheat: illustrative non-frozen-soil initial 0.7, mid 1.15, dry-harvest end 0.25; Mediterranean reference stage lengths 30/140/40/30 days.
- Tomato: initial 0.6, mid 1.15, selected end 0.8 within the published 0.7–0.9 range; Mediterranean reference stages 30/40/45/30 days.

These are unadjusted reference assumptions, not calibration for the fictional coordinates, cultivars, wetting patterns or climate. Real scientific references support formulas and species ranges; they do not turn synthetic inputs into real evidence. Normal real-workspace NASA adapters retain their validation rules.

**Overall suitability, full water suitability, irrigation prescriptions and planting recommendations remain unknown.** Standard-condition ETc is not actual measured ET. Applied irrigation is not net infiltration. Missing runoff, drainage, capillary rise and stress thresholds are never silently set to zero. The optional single-day balance uses explicitly supplied synthetic values, including zero flux examples; its threshold is hypothetical, not agronomic advice.

The Coastal Sandy Legume Strip deliberately lacks pH, N/P, elevation, stages and irrigation schedule to exercise unknown outcomes. Other secondary fields have partial nutrient and water data.

## Isolation

Activation uses per-tab session storage: `terrawise.demo.active.v1`. Farm changes use only `terrawise.demo.v1.workspace:<farm>`; drafts use `terrawise.demo.draft.v1:`. Starting and exiting reload the application, so a demo startup creates no Supabase client. Guest records and Supabase tokens are not removed, copied, imported or synchronized. Remote workspace and real local repository boundaries reject synthetic markers, IDs, climate and recommendation sources. Newly created and edited demo fields are retagged synthetic, regardless of form input.

Exports include `dataClassification: demo-synthetic`, field and climate markers, unknown overall suitability, and a DEMO-SYNTHETIC filename. There is no automatic import into real accounts. Real report attachments and server AI Agronomist calls are disabled. Map markers use a labeled local grid without external tiles; system fonts avoid remote font requests.

## Validation and remaining limits

Validated on 12 November 2026:
- `npm test`: 161 tests passing across 16 files.
- `npm run typecheck`: passing.
- `npm run build`: passing; Vite reports a nonblocking main-chunk size advisory.
- `npm run qa:demo`: passing at desktop 1440×1080 and mobile 390×844 in headless Microsoft Edge. All three farms, navigation, field CRUD, calculation forms, missing data, source labeling, rotation persistence, analysis/history, exports, reset and exit were tested. External requests were blocked and none were attempted during the demo. Real workspace/token sentinels were preserved byte-for-byte.

Start the local server before running `npm run qa:demo`. Set `BASE_URL` to test another local port and `BROWSER_PATH` for another installed Chromium-compatible browser. Screenshots are saved under `test-results/demo/`. These are browser-layout tests, not physical-device or Safari/Firefox certification.

No known broken workflows were found in the tested local demo scope. Intentional limits: server AI and real report uploads are unavailable; basemap tiles are disabled; unsupported crop-stage profiles remain unknown; scientific screening is provisional and does not authorize planting. Storage must be enabled; corrupt demo storage requires Reset Demo Data. No deployment, database migrations or production data changes were performed.
