# Visibility audit V2 and concept regrading

## Corrected audit logic

- Horizontal view field: **120 degrees** total, or 60 degrees to either side of the module's main-view arrow.
- The cone begins at the midpoint of the viewing facade rather than at the module centre.
- A building is a candidate when any part of its footprint intersects that cone.
- Only the candidate with the shortest footprint-to-facade distance is tested.
- Required pad relationship: `viewer pad elevation - closest front pad elevation >= 5.0 m`.
- Side clearance remains a separate directional test requiring a perpendicular clear gap strictly greater than 3.0 m.

The 120-degree value represents binocular overlap rather than the full extreme peripheral field. References:

- https://www.ncbi.nlm.nih.gov/books/NBK11556/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC5030319/

## Why the terrain needed regrading

The current contour-derived pad relief was only about 9.6-11.7 m across each option. Closest front-building drops were generally 0.5-3.2 m, so no option could consistently provide one full 5 m unit-height step.

A uniform vertical scale was rejected: it would require approximately 7.6-10.1 times the original relief and would create unrealistic total height differences. The replacement uses stepped/terraced grading derived from the closest-building visibility graph.

For every directed relationship `viewer -> closest front building`, the viewer is assigned at least one higher grading band. Bands are 5.25 m apart, leaving a small tolerance over the 5 m rule. A smooth conceptual field is interpolated between pads, flattened at each building, and converted back into 2 m contour curves. The temporary terrain mesh is not retained.

## Regraded result

| Option | Closest-front checks | Elevation failures | Minimum drop | Pad relief |
|---|---:|---:|---:|---:|
| 01_GROUPED_A | 22 | 0 | 5.344 m | 38.188 m |
| 02_FREE_G | 22 | 0 | 5.349 m | 43.728 m |
| 03_FREE_I | 22 | 0 | 5.325 m | 37.779 m |

The original Rhino file remains unchanged. The regraded version is `three-resort-terrain-options-visibility-regraded.3dm`.

Side-clearance conflicts were not moved in this grading pass: option A still has 11 unique side pairs below 3 m; G has 3; I has 3.

This remains concept grading. Surveyed contours, allowable road gradients, retaining-wall limits, drainage, accessibility and verified building heights are required before design-development use.
