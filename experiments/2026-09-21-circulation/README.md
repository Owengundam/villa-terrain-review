# Circulation — fixed-layout planning

## Current update: repair rear-access rounding rejection

V041 and V079 were incorrectly rejected at the rear boundary. Independently
rounding the rear strip and the entrance envelope to millimetres created outside
slivers of 0.000749 and 0.000735 m². This was a numerical defect, not a physical
rear-access conflict. The entrance-in-reservation test now allows 2 mm of positional
rounding error in both generation and validation. Site, active-building and road
arrival containment checks remain unchanged; a regression rejects a real 10 mm
reservation departure.

Latest supplied study: `inputs/user-rear-access-rejected.json`, road width 4 m,
maximum slope 8%, moved entrance. Both villas now connect; total 14/18, maximum
sampled grade 7.7454%. Saved result: `checks/fixed-rear-access.json`; independent
Shapely envelopes and slope arithmetic: `checks/independent-fixed-rear-access.json`.
The earlier 3 m fixture now connects 18/18 at 100% and 15/18 at 8%; historical
results below predate the rounding fix. Full `npm test` passes.

Rebuild the current review with:
`node experiments/2026-09-21-circulation/build-user-review.js user-rear-access-rejected.json`
after `npm run build`. This preserves the latest supplied layout and road settings.

## Previous update: repair false terrain rejections

The supplied `inputs/user-rejected-network.json` reproduces the failure: the old
nearest-contour-pair reference reports unsupported holes and discontinuities
inside the site, and routing stops after only 12 candidate connections fail.
Raising the slope limit does not remove either failure.

Roads now use a continuous, piecewise-linear triangle surface built from the
accepted contour vertices and samples at <=2 m. Delaunator 4.0.1 is pinned and
embedded with its ISC license in the standalone viewer and worker. Outside the
sample hull remains unresolved. This sampled surface is a planning approximation,
not a constrained contour triangulation or surveyed grading design.

Connection search tries subsequent batches when the nearest 12 cannot connect.
**Check road slope** defaults on, with the existing **8%** default. Switching it
off explicitly restores XY-only checking, requires no terrain, and labels results
as slope-unchecked. A numeric 100% still means a 45-degree incline.

Exact saved-layout regression results (18 active villas, width 3 m):

| Setting | Connected | Maximum sampled grade |
| --- | --- | --- |
| 100% | 16/18 | 17.06% |
| Slope checking off | 16/18 | Not evaluated |
| 8% | 13/18 | 7.75% |

The 100% and unchecked runs produce identical route geometry. V041 and V079
remain unresolved by rear-access reservation checks in both runs. Results are
saved in `checks/fixed-100.json`, `checks/fixed-xy.json`, and `checks/fixed-8.json`.
`npm test` covers the exact user snapshot, interpolation continuity on a plane,
unknown terrain, source immutability, checked/unchecked UI and independent
resampling against a changed slope limit.

Rebuild the separate review page preserving the supplied layout and entrance:
`node experiments/2026-09-21-circulation/build-user-review.js` after `npm run build`.
Open `checks/user-layout-review.html`; it starts at 100% for reproducing the report.
The normal viewer continues to default to 8%.

## Historical milestone 2: ghost access and maximum road slope

The nearest-pair terrain reference and connectivity counts below are historical
and superseded by the repair above.

The latest version allows roads across ghost footprints. Only active villas are
obstacles, using the viewer's current activation mask. Crossed ghosts are listed
in exported `ghostCrossings`; reactivation invalidates the result and names the
obstruction in the viewer. Regeneration treats the newly active villa as an
obstacle. Existing roads are never silently presented as valid after reactivation.

**Max road slope (%)** defaults to **8**, inclusive. It means absolute elevation
change divided by horizontal travel distance, times 100, for uphill and downhill
travel alike. Routing, direct row links, ground-following rear entrance links,
route shortening and final independent checks all use this limit. Candidate
paths are sampled at intervals no greater than **0.5 m**; equal start/end heights
do not hide an intervening steep section. Each road exports its sampled profile
and maximum grade. Changing the limit marks existing results out of date.

The shared road reference uses `ParallelPara.buildField().zInfo()` on the accepted
unsmoothed contour lines. It is the existing distinct-level contour interpolation,
not the visual smoothing or villa-centre pad heights. Unbracketed, missing and
extrapolated terrain is unresolved and cannot pass slope validation. This can
reject locations used by the older XY-only preview, including its temporary test
entrance. It also exposes steep changes in the inferred terrain; it does not
silently smooth them, grade the ground, or assume retaining structures.

This is sampled, ground-following **longitudinal** slope screening. Cross-slope,
entrance floor thresholds, vertical curves, vehicle turns and surveyed grading
remain unevaluated. The bounded grid search may miss longer feasible alignments;
an unresolved route is not proof that civil design cannot provide access.

Tests cover the 8% threshold, both directions, a hill with equal endpoint heights,
unknown terrain, a longer slope-compliant detour, slope-safe shortening, current
limit validation, ghost crossing/reactivation and UI snapshot/staleness. On the
saved all-active 47-villa fixture, 22 rear arrivals pass the current geometry and
ground-following slope tests at 4 m width and 8% maximum. This is not a network
connectivity count. See `checks/slope-row-preview.json`.

A separate synthetic activation test (every third villa active, test entrance at
the first supported rear arrival) records 2/16 connected, one crossed ghost and
a maximum accepted sampled grade of 7.45116%. Its inputs/result are in
`checks/slope-network.json`; this is a regression fixture, not a proposed entrance
or the user's current arrangement. Reproduce the independent envelope and
exported-profile arithmetic check with:
`python experiments/2026-09-21-circulation/check_geometry.py slope-network.json`.

## Historical milestone 1 — XY-only baseline

The sections below record the original version. Its ghost-protection and
unevaluated-slope behavior are superseded by the update above.

21 September 2026. Built on unified checkpoint **b03defd**. This is a working
prototype in the existing viewer, not a terrain- or vehicle-validated road design.

## Use

From the canonical workspace root, run `npm ci --ignore-scripts`, then
`npm run build`. Open `output/checks/image-flow-3d-20260915/index.html`, or serve
the root locally and visit that path. The generated HTML embeds its dependency
and works without a remote library service.

1. Populate a parallel or staggered arrangement.
2. Enter the road width. The field has no default; the browser test used 4 m only
   as an illustrative study assumption. Edge allowance and entrance-link width
   are separately editable, initially 0 m and 1.5 m study assumptions.
3. Generate circulation without an entrance to inspect rear lanes and unresolved
   arrivals. This is labelled reservation-only, with zero site-connected villas.
4. Use **Set entrance arrival point**, then click inside the site with enough
   space for the road width. This is an interior arrival point; external gate
   tie-in geometry is not implemented. No entrance is invented by the solver.
5. Generate circulation again. Use the villa inspector selector to highlight a
   route and read its status/reason. Map clicks retain their established villa
   activation behavior, except while placing the entrance.
6. Export circulation JSON to retain the complete result, settings and source
   snapshot. Existing active-villa PNG export remains villa-only.

## Implemented

- Canonical root repository with previous history and current source checkpoint;
  legacy checkout preserved and labelled. No push/deployment.
- Polygon buffers and clipping via pinned `clipper-lib@6.4.2`; millimetre integer
  coordinates, round lane caps/joins, flat entrance-link caps. Original library
  copyright/license notices remain embedded in the generated viewer.
- Rear arrival candidates at the middle of the 7 m reservation, then near either
  usable edge. Each arrival disc and rear-facade connection must fit its strip,
  boundary and protected buildings. All ghost footprints stay protected.
- Shared direct links between ordered row arrival points; full envelopes are
  checked against the site and buildings. Their connecting areas are represented
  explicitly by the accepted road envelopes, not assumed to be part of disjoint
  rear strips. Rear strips are clipped for display.
- A bounded, deterministic grid A* connector search with swept-width edge checks
  and visibility shortening. Each network-growth step tests the 12 nearest
  connected/unconnected arrival pairs and takes the shortest feasible candidate.
  It can connect at interior arrivals as well as row ends. This is not a global
  minimum or the final design-quality optimization.
- Explicit graph endpoints and per-villa entrance links. Incidental XY crossings
  are not silently promoted to graph junctions. Terrain elevations are not used
  to certify those intersections.
- Independent reconstruction of envelopes, endpoint connectivity, rear entrance
  links, reservation containment and configured width before accepting results.
- Separate worker, cancel control, old-result preservation, input fingerprint and
  stale result rejection. Layout/geometry, terrain, pad, active-state and road
  setting changes invalidate the displayed result. View thresholds do not drive
  road generation. View removal does not automatically delete shared roads.
- Road/reservation overlays, selected route, unresolved arrivals, length/union
  area, statuses, and JSON export. Results are held per layout in the browser;
  use export to preserve them across reloads.

## Evidence

`npm test` passed: existing view calculations/page, Auto mode, terrain editor and
panel, calculation overlay, plus new circulation engine/page suites. The existing
staggered-page suite also passed. After strengthening entrance validation, the
circulation engine and actual bundled-worker/page tests passed again.

New fixtures cover shared straight lanes, multiple rows, rotated villas,
immutable inputs, repeatability, missing/oversized widths, boundary access,
protected ghosts, obstacle detours, corrupted endpoint geometry, false
connectivity, missing entrance links, cancellation and late results, setting and
pad invalidation, and no-entrance reservation status.

On the saved 47-villa parallel fixture at illustrative width 4 m, the row preview
found **36 usable arrival points**, 86 road/arrival/entrance pieces and 21 warnings
(warnings include failed direct row links, not just failed villas). There was no
entrance selected, so connected count correctly remained zero.

The actual browser was exercised through Populate, missing-width validation,
row preview, map entrance selection, network generation, export and stale-width
handling. At one **temporary test entrance**, it connected **34/47 villas in XY**,
with about **1,016 m summed lane/connector length** and **3,919 m² union road and
entrance area**. This test point is not an approved project entrance and was
cleared from the delivered preview. The preview is left at a 4 m illustrative
width with row lanes only.

[Browser test export](checks/browser-network.json) includes the exact input
snapshot. [Independent Shapely check](checks/independent-geometry.json) rebuilt
all 106 envelopes at higher arc resolution and found no building or boundary
violations above 0.005 m² numerical area tolerance. Reproduce with
`python experiments/2026-09-21-circulation/check_geometry.py`.
This check verifies XY clearance only, not engineering access feasibility.

## Next milestones and known limits

1. Unify the reference terrain service, then add longitudinal/cross profiles and
   entrance-level checks. Keep unknown terrain unresolved. No slope limits are
   assumed in this version.
2. Add vehicle inputs, curvature/swept-path checks, junction design, turning areas
   and a proper site gate tie-in. Buffered sharp bends are currently only XY
   envelopes; they are not proof that a car can turn.
3. Improve lane alignment with constrained fitting and broader offset choices;
   prefer row ends/main connector structure, add bounded alternative networks
   and shared-segment reuse. The current nearest-pair budget can miss feasible
   distant links. Reported failure means no solution found by this search, not
   mathematical infeasibility. Summed length can include overlapping segments;
   union area does not double-count overlaps.
4. Coordinate reservations with new population and repair. Current generation
   never moves or deletes a villa to make a road fit. A result with blocked access
   is useful diagnostic output, not a road-served capacity claim.
5. Add designer overrides, richer warning tables, road-aware PNG/model export and
   persistence/import. At present JSON export is the durable road artifact.

Build/test tooling now uses a PowerShell npm script shell because Windows cmd.exe
drops UNC working directories. Non-Windows users can override `script-shell` for
their environment. The test runner itself is platform-independent Node.js.
