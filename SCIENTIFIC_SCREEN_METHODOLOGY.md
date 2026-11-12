# AgriLumina: pH and temperature screening method

This is a **limited, provisional ecological screen**, not overall crop suitability, a validated planting recommendation, a predicted yield or a probability of success. Overall ranking remains unavailable because water balance, local growing periods and critical agronomic rules are not established. The existing saved-analysis and rotation models remain separate.

## Evidence

The eight crop records in `src/data/ecocropScreen.ts` transcribe FAO ECOCROP's species-level absolute and optimum ranges for soil pH and temperature. Each record links to its original data sheet:

- [Chickpea — Cicer arietinum](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2479)
- [Durum wheat — Triticum durum](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=10582)
- [Lentil — Lens culinaris](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=7209)
- [Barley — Hordeum vulgare](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1232)
- [Tomato — Lycopersicon esculentum](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1379)
- [Potato — Solanum tuberosum](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1971)
- [Sunflower — Helianthus annuus](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1191)
- [Fava bean — Vicia faba](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2146)

ECOCROP's records are broad species-level descriptions; [FAO notes](https://www.fao.org/land-water/land/land-governance-and-planning/land-resources-planning-toolbox/detail/crop-ecological-requirements-database-%28ecocrop%29/en) that some requirements are based on limited literature. None of these entries or the combination below is validated for a particular cultivar, field, farming system or region.

## Inputs and calculation

- Soil pH is entered by the farmer. Its stated provenance (measured, estimated or unknown) remains separate; the app cannot verify a soil test.
- Temperature is the NASA POWER T2M historical monthly mean for the selected coordinates and the last complete year. The screen requires matching recorded provenance, supported temperature units and 12 valid months. POWER is gridded historical data, not an on-farm measurement or forecast.
- The general interface's Spring window uses March–June and Autumn uses September–December. These are **fixed interface windows**, not locally validated sowing dates or crop-specific growth durations. When the farmer explicitly selects the Bekaa wheat study reference, the screen instead uses the observed November–June period across two historical years. See [water and season methodology](WATER_AND_SEASON_METHODOLOGY.md); that reference is not validated for an individual field or cultivar.
- Both pH and all four temperature observations are required. Missing, invalid, simulated or location-mismatched inputs yield no screen ranking. No missing value becomes zero or receives estimated points.

For a value `x`, FAO absolute minimum `a`, optimal minimum `b`, optimal maximum `c` and absolute maximum `d`, with `a < b ≤ c < d`:

```text
membership(x) = 0                         if x ≤ a or x ≥ d
              = (x − a) / (b − a)       if a < x < b
              = 1                         if b ≤ x ≤ c
              = (d − x) / (d − c)       if c < x < d

temperature = minimum membership of the selected window's monthly means
screen / 100 = minimum(pH membership, temperature)
```

Results are rounded to integer points for display, then ordered descending, with alphabetical tie-breaking. At most four are displayed; fewer are returned if fewer pass the screen. The interpolation is an ECOCROP-style modeling assumption, not an empirically validated response curve for these fields. Published research describes [interpolation of ECOCROP pH ranges](https://www.mdpi.com/2073-4395/11/4/703) and [interpolation with limiting-factor evaluation](https://doi.org/10.3390/su16041468); FAO describes the [most severe limitation principle](https://www.fao.org/4/T0715E/t0715e06.htm). Applying these methods to this two-factor, fixed-window screen is a provisional implementation choice, not a complete reproduction of ECOCROP or an FAO endorsement of this app.

If an **available** pH or a monthly mean is at or beyond the documented absolute range, that crop is excluded from this screen. This is a screen boundary, **not** proof that a crop is impossible to grow locally: pH method, crop variety, seasonal timing, monthly means and historical grid-cell representativeness all matter. Other critical constraints remain unknown, not verified compatible. The full recommendation engine does not mark these crops as verified agronomic exclusions.

## Unscored factors and limitations

Irrigation category and historical rainfall are context only in this index; it does not score effective rainfall, ETo, Kc, irrigation volumes or a water balance. Separate [water-demand calculations and entered irrigation records](WATER_AND_SEASON_METHODOLOGY.md) are available in the Bekaa panel, but they do not supply water-suitability points to this screen. N/P/K are not part of this index because the applicable lab methods and locally validated nutrient responses are missing. Crop-family history produces contextual warnings, not an invented disease-safe interval or a points adjustment. Soil salinity, drainage, rooting depth, frost, heat stress, planting dates and many other constraints remain unassessed.

All screen results therefore have **low qualitative confidence**. Existing eight-category completeness is a simple input count, not confidence, calibration or a validation metric. Do not compare this score with the separate older unvalidated factor comparisons displayed in expandable profiles. The new screen is calculated live and is not included in saved analysis snapshots; the latter continue to hold the pre-existing exploratory model.
