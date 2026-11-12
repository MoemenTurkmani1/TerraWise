# Crop ranking integration

## Where to find scores

1. Run `npm run dev` and open http://127.0.0.1:5173.
2. Click **Try Demo Farm** to use isolated synthetic inputs, or select your existing workspace.
3. The dashboard now has a prominent **Crop Recommendations** section and field selector.
4. Choose a field. **Best Crops for This Field** shows the top three screens; click **View Full Ranking** for all passing catalog crops.
5. Alternatively, click **Best Crops** on any dashboard or My fields card, open a field detail page, or use **Crop recommendations** in the desktop navigation/mobile menu.
6. Choose Autumn or Spring; inspect each numbered crop's **Provisional pH + Temperature Screen /100**, pH/temperature breakdown, ranking reason, source link, risks and missing evidence.

## What was wrong

- The existing scientific screen is `src/lib/ecologicalScreen.ts`; thresholds and source links are in `src/data/ecocropScreen.ts`. `src/hooks/useClimate.ts` supplies field-specific validated NASA data or explicitly labeled synthetic demo fixtures.
- The separate full-suitability engine in `src/lib/recommendations.ts` correctly returns no ranked planting recommendations while critical evidence is unknown. Its unknown overall scores dominated the old recommendations page.
- `src/pages/Recommendations.tsx` mixed the valid screening list with older unranked six-factor profiles, methodology notices and water panels. Numeric screens appeared below this content without prominent rank numbers.
- Screening returned a maximum of four crops. The dashboard preview was easy to miss and field cards had no dedicated Best Crops action.
- Explicit links to unavailable/archived fields could silently show another field instead.

## Implemented

- Shared `src/components/BestCrops.tsx` / CSS renders the same engine results on dashboard, field details and the full ranking page.
- Prominent field selectors and separate, accessible Best Crops links on field cards, with no nested anchors.
- Numbered descending results, alphabetical tie order, images, prominent score labels, both evaluated factors, ranking reasons and expandable risks/missing inputs/source references.
- Full page can request all eight catalog screens through an optional display-limit parameter; existing callers retain their four-result limit. Formula, thresholds, exclusions and source requirements are unchanged.
- Excluded crops remain separate with explanations; they are not promoted to eligible crops or assigned invented positive scores.
- Explicit loading and actionable Insufficient Data views replace silent blank screens. Invalid requested field links show a management action instead of another field's scores.
- Regional Bekaa study and water calculators remain available below the main ranking.
- Field/season URL state and field switching preserve correct inputs; edited inputs trigger recalculation.
- Empty dashboards explain how to add a field and reach scores.

## Scientific conditions

A valid pH and complete, correctly ordered monthly temperatures with matching source/location metadata are required. Real climate must pass the existing NASA source/unit checks. Synthetic climate requires synthetic field and fixture markers with matching coordinates and farm identity. Legacy example-derived fields require review. Archived fields must be restored.

The existing trapezoidal membership formula is unchanged: 100 in the optimal range, zero at/outside absolute limits, linear transitions; temperature takes the lowest monthly membership in the selected four-month interface window, then the lower pH/temperature membership determines the rounded screen score. No weights are introduced.

A crop may be excluded because one evaluated factor reaches an absolute boundary. This is exclusion from the limited screen, not a verified claim that the crop cannot grow locally. Ties are equal scores, ordered alphabetically. Species ranges, monthly means and illustrative Spring/Autumn windows do not establish cultivar-specific growing seasons or planting feasibility.

Full water suitability, net irrigation, nutrient suitability, validated planting calendars and disease-specific rotation constraints remain unknown/unscored. Demo inputs remain synthetic and isolated; numeric outputs are computed, not hardcoded. Existing account authentication, remote persistence and RLS were not changed for this ranking task.

## Verification

- `npm test`: 190 tests passing across 20 files, including all eight crop expected scores, descending ranking, ties, exclusions, pH changes, invalid/missing inputs and unchanged overall eligibility.
- `npm run typecheck`.
- `npm run build`.
- `npm run qa:ranking`: desktop 1440px and mobile 390px; all demo farms, dashboard/card discovery, field switching, sources, missing pH after field editing, mobile navigation and invalid field links. Separately intercepted test-only NASA-shaped responses verify all eight expected scores, climate loading, provider errors, invalid fill values and retry recovery. These fixture responses are not real NASA observations.
- `npm run qa:demo`: complete pre-existing demo workflows, including calculation/rotation/history persistence, CRUD, export, reset and preservation of real storage/token sentinels.
- Screenshots: `test-results/ranking/` and `test-results/demo/`.

No deployment, database migration or production record changes. Browser layouts were tested in headless Edge, not on physical devices or all browser engines.
