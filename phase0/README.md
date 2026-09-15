# Phase 0 — terrain-led villa-only layouts

**Latest result:** [live terrain, narrow central view](../output/checks/phase0/20260914-181521/index.html) · [elevation viewer](../output/checks/phase0/20260914-181521/elevations.html). Both sampled row strategies retain 21 villas after conflict omissions. Minimum clear angular width: parallel 73.50%, staggered 76.69%; no final constraint violations. This supersedes earlier results for the current live terrain and adopted view rule. Twelve tests pass, including peripheral exclusion, union coverage and vertical clearance.

**Current view rule (supersedes all 120° and full-width-corridor wording below):** protect the central ±15° from the front-facade midpoint. At least 70% of its angular width must remain clear. Union all obstructing footprint intervals, counting overlaps once. Buildings at least 5.25 m below the viewer pad are vertically cleared; peripheral buildings impose no height-drop constraint. These are explicit design parameters, not statutory requirements. `sight.py` performs the coverage/level solve; exact interval acceptance is cross-checked by independent ray intersections. Boundary, side clearance, contour-normal orientation and ±3 m pad limits remain hard gates. Older Phase 2 tools retain their historical rule and must not be substituted for the current Phase 0 view check.

## Live contour and elevation-label input

`export_real_terrain.py` reads the live `Elevation_m` contour attributes and numeric text on the Spot elevations layer. Curves drawn at Z=0 are not treated as zero elevation. Identical duplicate site boundaries are collapsed for selection without changing the model. The boundary containing the most height labels is selected.

`prepare_real_terrain.py INPUT.json` reconstructs a 4 m reference grid from the eight nearest elevation-label insertion anchors with inverse-distance-squared weights. These anchors approximate spot XY: the layer contains text rather than separate survey points. The live contours are tagged as smoothed/inferred and supply local orientation. Reports identify this input and interpolation explicitly.

Run `python phase0/run.py --source PATH-TO-REFERENCE.json --repair` to retain compact regular candidate rows while omitting conflict participants. Every accepted subset still passes all checks. `--wide` instead tests wider complete rows. Neither mode proves a maximum capacity or survey accuracy. This extends the original complete-pattern-only search described below.

**Current corrected result:** [local contour-normal plans](../output/checks/phase0/20260914-174719/index.html): parallel 37 villas, staggered 38 villas. Both pass orientation, clearance, boundary, overlap and elevation verification. The synthetic contour source and ±3 m pad limits are unchanged.

**Orientation correction:** each villa's long axis/main view is perpendicular to the nearest local contour segment and faces downhill. Row alignment is only a placement pattern; it no longer fixes every villa to a common angle. The first 64/63-unit previews below predate this correction and are superseded. The generator now also tests wider across-row pitches to maintain clearance after individual rotation.

Generate regular parallel rows and alternating half-pitch staggered rows directly from the site boundary, reference terrain and a standard V footprint. No image template and no hotel, restaurant or banquet units. This is a compact arrangement comparison, not a global maximum packing claim.

Run `python -u phase0/run.py` from the workspace root. Override `--source` with a compatible Phase 2 report to use another boundary/reference. The default source is the first study (I) in the September 14 Phase 2 report; existing building placements are ignored and only one V unit's dimensions are read. No Rhino objects are changed.

## Hard acceptance rules

- All complete 11 × 23 m footprints inside the boundary, no footprint overlaps.
- Directional side gap 3.05 m, checked in both buildings' local frames.
- Minimum row gap 5.05 m, increasing only as needed by the elevation checks.
- Pad levels within ±3 m of the contour-derived reference at the unit centroid.
- At least 5.25 m rear-to-front pad drop for the nearest footprint in the 120° forward cone and every footprint in the full-width forward corridor. Numerical tolerance is 0.00001 m.
- Rebuild the full view graph and independently verify geometry and levels before accepting. Any clearance issue rejects the candidate; Phase 0 does not defer it to Phase 3.

Average downhill terrain direction sets the base orientation. Test it and ±10°, two lattice offsets, and row pitches in 2 m increments from depth + 5.05 m to depth + 45.05 m. Among this limited family, prefer more units, then less pad adjustment. Reject infeasible patterns instead of quietly deleting obstructions and destroying row order. Both strategies retain their own verified result. Exhaustion means no feasible sampled layout, not proof of impossibility.

## First result

[Compare exact plans](../output/checks/phase0/20260914-172638/index.html) · [Geometry and verification](../output/checks/phase0/20260914-172638/report.json)

| Strategy | Villas | Row pitch | Clear gap between rows | Verified view links |
|---|---:|---:|---:|---:|
| Parallel | 64 | 36.05 m | 13.05 m | 146 |
| Staggered half-pitch | 63 | 36.05 m | 13.05 m | 214 |

Both pass boundary, overlap, side clearance and elevation checks. The 13.05 m row gap results from the height requirement, rather than decorative space. Staggering does not remove the full-width corridor rule, so it does not automatically allow smaller row gaps. Plan labels show pad elevations rounded to 0.1 m; validation uses full precision.

The reference is the existing synthetic 8 m contour-interpolated field. Passing these planning rules does not validate surveyed terrain, access roads, services, final slopes or pad contact; those have not been designed here.

Tests: `python -m unittest discover -s phase0/tests -p 'test_*.py' -v`.
