# Road planning implementation feasibility

Reviewed 21 September 2026. Assessment and diagnostics only; application/model files were not changed.

## Decision

Proceed with a staged circulation planner built around the existing procedural rows. A fixed-layout, width-checked plan prototype is feasible. A terrain-aware vehicular network needs additional geometry, reference-terrain consistency, vehicle parameters, and population changes. The current 47-villa count is not a demonstrated road-served capacity.

The [shared discussion](https://chatgpt.com/share/6ab09841-f2bc-83ea-b813-d224902c68e9) was read in the browser. Its latest concrete proposal is: shared rear lanes, a selected entrance, least-additional-length feasible inter-row connectors, and individual rear entrance connections. The earlier uploaded research paper was not accessible in the visible discussion; this assessment does not claim to review that paper.

## Current implementation, verified from working source

The workspace root is not a Git repository. `output/github/villa-terrain-review` is a separate, older checkout at `2d12b39`, with three modified files at inspection. The September 21 capacity experiment and root working source are the relevant implementation baseline. Before implementation, reconcile these copies into one reviewed checkpoint; do not overwrite newer files from the older checkout.

| Existing element | Evidence | Reuse and limitation |
|---|---|---|
| Row structure | `phase0/parallel_para.js:849`, `rowsOf()` | Stores row IDs, guide nodes, ordered villa membership and usable intervals. Enough to seed lanes; guide curves describe placement, not approved road geometry. Empty guides and separated occupied intervals must not be treated as continuous roads. |
| Rear exclusion strips | `phase0/parallel_para.js:273`, `rearStrip()` | Correct starting reservation geometry; intentionally allowed outside the site. Road space must be clipped and checked separately. |
| Placement checks | `phase0/parallel_para.js:664`, `checkCandidate()` | Existing boundary, footprint and rear-strip predicates. Add reservation collision checks to every placement/repair/recovery/repacking path. |
| Population search | `phase0/parallel_para.js:1176`, `generateLayout()` | Bounded alternatives followed by recovery/densification. Currently prefers villa count, without road feasibility. |
| Independent validation | `phase0/parallel_para.js:1379` vicinity, `validate()` | Useful architecture, but validates villas, not road buffers, junctions or accessibility. |
| Terrain | `ParallelPara.buildField()` and `TerrainEdit.elevation()` | Different interpolation conventions: nearest distinct contour levels versus inverse-distance weighting over simplified contour samples. Establish one versioned reference terrain before reporting road grades/entrance level passes. |
| Smoothing | `parallel_para.js:1469`; `analyse_3d.js:15` | Current population uses per-line resampling/Chaikin smoothing over levels 0–60. Build removes the shared-surface placeholder. The September 20 shared-surface handoff is not the current integration state. |
| Viewer lifecycle | `view3d_view.html:254` onwards | Snapshot/settings validation and explicit Populate action exist. Generation remains synchronous. A road worker needs cancellation, source fingerprints and stale-result guards. |
| Roads/access | Search of maintained JS/Python/C# source | No implemented road network, explicit site entrance, road-width/vehicle settings or road terrain validator found. Rhino grading is not a road design engine. |

Do not reuse the row `maxTurnDeg` setting as a vehicle turning constraint: it limits row-guide behavior, not swept-path geometry. A secondary code issue is that variant sorting reads `metrics.heading.jitter`, while the current metrics expose other heading fields; fix and test the intended aesthetic tie-break when modifying ranking.

## Measured screening on saved site layouts

Inputs: the September 21 capacity experiment's saved `after-0.json`, `after-2.json`, and site report. These are saved fixtures, not a claim about unsaved browser or live Rhino geometry. Site area is approximately 40,335 m², with 18 contour polylines labelled 1364–1375. Each layout has 47 villas in 14 occupied rows, including four single-villa rows.

Diagnostic: place a point 3.5 m behind each rear facade, connect consecutive points within each row using straight segments, and buffer each segment by half an assumed road width. Test each buffer against all villa footprints and the site boundary using Shapely. Both layouts have 33 within-row links.

| Assumed road width | Level 0 links clear / blocked | Level 2 links clear / blocked |
|---|---:|---:|
| 3 m | 21 / 12 | 22 / 11 |
| 4 m | 19 / 14 | 19 / 14 |
| 5 m | 16 / 17 | 16 / 17 |

Eight rear strips in level 0 and five in level 2 extend partly outside the boundary. Partial extension does not prove a narrower road cannot fit; it shows why the entire 7 m strip cannot be assumed usable.

These are deliberately simple baseline links, not optimized routes. A blocked link may be repaired by moving the alignment within the band; a clear link has NOT passed corridor containment, curvature, junction, terrain, entrance or site-network checks. Flat segment ends also do not validate a combined bend. This audit proves that directly joining rear midpoints is insufficient, not that 14 links are impossible or 19 villas are accessible. Widths are sensitivity assumptions, not adopted requirements.

Reproduce with `python experiments/2026-09-21-road-feasibility/scripts/audit.py`. Full link details: [checks/audit.json](checks/audit.json). Only this experiment's diagnostics are written.

## Proposed algorithm

1. **Freeze inputs.** Use a versioned snapshot of boundary, accepted reference terrain, guidance terrain, villas/pads, active and ghost state, entrance, road width, edge allowances and access assumptions. Existing layouts remain fixed. Use rear-facade midpoint only as a labelled provisional entrance; entrance height is a separate input, not automatically the ground at the villa centre.
2. **Construct rear corridors.** Group by stored row/order, respecting disjoint occupied runs. Start lane centreline at rear facade minus 3.5 m along the front direction for a 7 m reservation. Permit lateral adjustment within usable bands. Explicitly construct gap connectors; union the reservations and connectors, clip to the site and subtract protected footprints. Never use an unchecked convex hull.
3. **Fit lanes within available space.** For width `w` and symmetric edge allowance `e`, a straight 7 m band requires `w + 2e <= 7`, with centreline offset `w/2 + e <= d <= 7 - w/2 - e`. Erode the usable corridor by the required half-width to find allowable centreline space. Fit a gentle constrained alignment; validate its complete buffered footprint after fitting. Handle split components and narrow transitions explicitly.
4. **Search inter-row connectors.** Try both ends of occupied lanes, followed by a bounded set of interior connection stations. Build free space from the site minus protected villas and other exclusions. Use a coarse-to-fine grid A* as an initial candidate router, with terrain-aware edge checks. When a turning radius is selected, use heading-aware states/motion primitives, or reject and retry candidates that fail curvature after fitting. Ordinary XY A* followed by cosmetic smoothing is not a turning guarantee. Validate swept width continuously after raster routing; never accept diagonal corner-cutting.
5. **Select the network.** Begin at the user-selected entrance and attach a reachable lane/component by least added feasible length. Use fewer bends/junctions and lower terrain intervention as tie-breaks, with optional designer-pinned main connector. Recompute added length when existing routes can be shared, and validate newly formed junctions. Keep a small beam of alternative networks or bounded backtracking so an early greedy connection cannot permanently block a better later connection. Report unresolved components explicitly.
6. **Check levels and actual access.** Sample reference ground along and across each road; distinguish ground profile from any proposed road design profile. With no grading design, label results as ground-following screening. Check configured segment grades, cross-slopes, entrance elevation differences, curvature and dead-end turning arrangements. Unknown terrain is unresolved, never a zero elevation. Create junctions only with compatible geometry and levels. Vehicle swept paths need more than a buffered centreline.
7. **Independently validate and publish status.** Store route graph, lane/connector footprints, reservations, per-villa entrance links, profiles, reasons for failure and input fingerprint. Report reservation-only, connected-in-plan, configured-checks-pass, or unresolved separately. Reconstruct connectivity from validated geometry; do not trust generator flags. Preserve a previous result on cancelled/failed computation.

The discussion's MST analogy is useful for selecting links, but MST alone does not generate geometric paths, enforce turns, provide a return loop, or optimize marginal shared-road cost. On a disconnected graph it returns a forest. A tree also leaves dead ends; optional through-links/turning areas must be decided from the access brief. These are additional design constraints, not consequences of minimizing length.

For new populations, alternate tentative row placement, corridor/connector reservation and bounded row adjustment. Compare complete viable alternatives. Put required access feasibility before capacity; otherwise the newest density recovery will refill precisely the spaces roads need. Keep views out of this initial process. View removal must preserve shared roads; geometry/pad edits invalidate relevant access checks. Ghost reactivation must check road conflicts and never silently erase a shared route.

## Implementation scope and effort

Proposed module split: `circulation_geometry.js` for polygon operations; `circulation.js` for lane/network generation; `circulation_validate.js` for independent checks; a road worker and viewer integration. Keep a Python/Shapely diagnostic harness as a separate geometry oracle. The self-contained browser build favors a bundled JavaScript polygon library for production; select and test its offset/union/difference behavior before relying on it. A Python-only solver would require a local service or offline workflow and would not preserve the current standalone viewer experience.

Planning estimates for one developer familiar with this code, not measured delivery commitments:

| Stage | Deliverable | Estimated effort |
|---|---|---:|
| Baseline and contracts | Reconcile source, terrain contract, geometry library trial, input/status model | 1–2 days |
| Fixed-layout plan prototype | Row lanes, entrance control, width checks, connectors, overlay and disconnected reasons | 4–7 days |
| Terrain/access screening | Profiles, configured slopes, entrance levels, bends and dead-end checks | 3–6 days |
| Coordinated population and hardening | Reservation-aware placement/repair, alternative ranking, ghost lifecycle, performance/regression work | 5–10 days |

Total indicative scope: 13–25 developer-days. Survey-grade road grading, drainage, retaining structures and a comprehensive vehicle simulation are separate extensions. Performance must be benchmarked; no interactive runtime is established. The site's approximately 243 × 287 m extent suggests roughly 17,500 bounding-box cells at 2 m resolution or 70,000 at 1 m before headings, masks and refinement—reasonable to prototype, not a guarantee of fast network optimization.

Required project choices before a width/terrain-checked result: selected entrance/tie-in and level; pedestrian/buggy/car purpose; road and entrance-link widths; edge allowances; grade/cross-slope limits; turning/vehicle assumptions; no-go areas; and how to treat ghost footprints. Missing parameters must remain visibly unevaluated. No such choice is needed to start the fixed-layout reservation diagnostic.

## Acceptance and evidence limits

Test straight and curved rows, separated strips, overlapping reservations, concave boundaries, bottlenecks, singleton/disjoint rows, impossible connectors, level-separated crossings, entrance offsets, dead ends, cancelled/stale jobs, geometry/pad changes, ghost reactivation, and view-independent initial population. Include a fixture where greedy connection needs backtracking. Show routes and failure reasons on the real saved layouts, not only aggregate counts. Validate all bends and junctions after smoothing.

This assessment ran the saved-layout Shapely audit and the existing parallel-generator suite, which completed successfully (exit 0). Suite status is recorded in `checks/test-parallel.txt`. No road solver was implemented, no road-served capacity was established, and no live Rhino model, deployed site or remote repository was changed.

Technical references checked: [Shapely buffer](https://shapely.readthedocs.io/en/stable/reference/shapely.buffer.html) for centreline-to-polygon construction; [NetworkX minimum spanning tree](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.tree.mst.minimum_spanning_tree.html) for graph selection and disconnected-forest behavior. Algorithm and effort recommendations above are this assessment's engineering judgment.
