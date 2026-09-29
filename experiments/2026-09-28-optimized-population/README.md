# Optimized population, without prescribed rows — September 28, 2026

The canonical root viewer now offers **Populate (parallelPara)** and **Optimize population**. The saved parallel layout remains available. Old free and staggered layouts are removed from active viewer options, including after Restore. Staggered placement branches were removed from the shared generator. Original reports, Rhino models, experiments, and retired tests are retained as historical evidence; no files in legacy recovery/deployment copies were edited.

## September 29 viewer update

Optimize population is now the sole active population method. The viewer opens and restores the audited 60-villa initial layout, preserved in `phase0/saved_optimized_population.json`. Parallel choices and row-guide controls were removed; shared geometry and the internal parallel initializer remain dependencies of optimization. Historical reports below are preserved. Seed behavior is unchanged.

## Rear-boundary correction — September 29

The initial implementation allowed rear-clearance strips to leave the site. This is corrected in candidate acceptance, final validation and planar fitting. The current saved layout in `phase0/saved_optimized_population.json` has **58 villas** at terrain response scale 0. An independent Clipper difference audit confirms containment of both footprints and full rear strips, including concave boundaries. The 60/59-villa files and tables below are historical results under the old boundary rule.

## Results on the saved site (historical boundary rule)

| Terrain response scale | Fresh parallel starting count | Optimized initial count |
|---|---:|---:|
| 0 | 47 | 60 |
| 2 | 47 | 59 |

[Compare plans](checks/comparison.html). Exact optimized results: `checks/site-0.json`, `checks/site-2.json`. Independent geometry reports: `checks/independent-site-0.json` and `checks/independent-site-2.json`. The comparison uses the preserved 47-villa parallel reference plans from September 21; the optimizer separately recomputes its starting population from current accepted inputs. The runs took approximately 60 and 62 seconds here, including the parallel initialization; these are observations, not a performance guarantee.

These are initial 2D geometry populations. View fitting and circulation have not been run on these saved outputs. No maximum-capacity proof, road accessibility, full terrain, cross-slope, entrance-level or vehicle validation is claimed.

## Method

`phase0/optimized_population.js` builds a finite candidate/conflict graph. It is a self-contained deterministic JavaScript heuristic inspired by the candidate-selection and local-search approach described in [Shadoks, 2024](https://arxiv.org/abs/2403.20123), not a port of their code and not an OR-Tools/CP-SAT exact solver.

1. Recompute the parallel baseline on accepted terrain/settings and retain only independently revalidated candidates.
2. Sample positions throughout the site using a grid near 5 m spacing, coarsened to bound sampling on larger sites. Test terrain-normal headings and deviations of half the selected tolerance. Positions are not attached to row guides.
3. Reject boundary, local orientation and downhill failures. Build conflict edges for footprint overlaps, side clearance and building intrusion into either rear strip. Rear-strip overlap with another rear strip remains legal.
4. Run degree-based randomized greedy starts and bounded neighbourhood replacements (2–6 units). Equal-count replacements permit rearrangement; the best complete count is retained.
5. Add position candidates 2.5 m and then 1.25 m around the incumbent and search again. Geometry remains discretely sampled; it is not exhaustive continuous optimization.
6. Run the separate existing whole-layout geometry validator before publishing. Output contains no row metadata. A fixed seed makes identical inputs repeatable.

Footprint dimensions, side clearance, rear clearance and orientation tolerance stay as selected. Nominal row pitches constrain only the parallel initializer, not the subsequent search. The count is explicitly labelled **best found; maximum not proven**. Degenerate terrain and empty results are reported as failures rather than invented layouts.

## Viewer integration

Optimization runs in a Web Worker embedded in the standalone built viewer. The dimmed overlay displays actual stage/best-count messages and offers Cancel search. Cancellation, worker errors, and late results leave the previous layout intact; workers and object URLs are released. A successful run replaces only the optimized arrangement. Parallel and optimized results remain selectable. Restore returns to the saved parallel layout and clears generated selector entries.

No third-party runtime solver or new dependency was installed. Build used `npm ci --ignore-scripts` and `npm run build`. No deployment, commit or push was performed.

## Verification

- New optimizer tests cover deterministic results, immutable inputs, no row IDs, analytic terrain direction/orientation, graph replacements, valid overlapping rear strips, invalid inputs, and an independently detected planted overlap.
- `optimized_audit.js` reconstructs rectangles independently and uses Clipper polygon differences/intersections plus separately implemented edge distances. It does not call placement-time acceptance. Both 60- and 59-villa outputs pass containment, overlap, side, rear-strip and ID checks.
- Built-page test executes the actual bundled optimization worker on analytic terrain and checks legacy option removal, result publication, progress, cancellation, late responses, errors and Restore.
- Existing npm test suite passed: views, auto mode, terrain editing, calculation overlay, circulation, road terrain and whole-network comparison. The new optimizer suites are added to the test runner.
- Historical orientation regression tests explicitly load their retired fixtures; archived layout data is not removed merely because its viewer option is retired.

Browser visual verification remains unavailable because the browser tool blocks this network-file URL. The algorithm and actual worker/page wiring were tested without browser automation.
