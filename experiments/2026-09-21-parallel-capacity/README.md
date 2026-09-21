# Parallel population capacity — September 21, 2026

The working `phase0/parallel_para.js` is newer than the clean Git checkout in `output/github/villa-terrain-review`. This experiment changes the working copy only; nothing was pushed or deployed.

## Result

| Terrain response scale | Previous generator | Updated generator | Gain |
|---|---:|---:|---:|
| 0 (viewer default) | 42 | 47 | +5 (+11.9%) |
| 2 | 43 | 47 | +4 (+9.3%) |

[Compare plans](checks/comparison.html). Exact previous and new layouts are in `checks/before-0.json`, `checks/after-0.json`, `checks/before-2.json`, and `checks/after-2.json`.

## Change and unchanged rules

Additional parallel sibling rows were rejected wholesale whenever ANY station approached ANY existing guide. Guides can be empty or only partly occupied. The same rejection also discarded the usable far end of a locally converging row.

Remove that guide-distance veto. Each sibling still comes from an existing row's parallel offset and still passes usable-interval checks, actual footprint placement checks, and independent whole-layout validation. The bounded sibling search and net-gain requirement remain in place. This recovers small pockets without changing the 11 × 23 m villa dimensions, 3 m side clearance, 7 m rear exclusion strips, 15° orientation tolerance, or nominal 15/31 m pitches.

Also fix duplicate villa IDs during row repacking: allocating from the surviving maximum numeric ID instead of the remaining unit count prevents collisions with frozen rows. IDs may have gaps but are unique.

## Evidence and validation

- Existing 22-case parallel-generator suite passes, including concave boundaries, curved terrain, different villa sizes, strict clearances, terrain ambiguity and independent validation.
- New `phase0/tests/test_parallel_pockets.js` verifies recovery beside an empty guide, geometry, downhill facing, orientation, determinism, input preservation and unique IDs when repacking a missing row.
- `scripts/verify.js` checks both saved-site improvements, unique IDs, full independent geometry validation, downhill ground drop and local orientation for every delivered villa.
- Local viewer rebuilt with `node phase0/analyse_3d.js --build-only`; report placements are not replaced by generated populations. Use Populate to generate the improved layout.
- The built-page Populate smoke check verifies the embedded generator matches the current source, then exercises the actual page handler with that same generator running in Node (avoiding slow VM global lookups). This is a wiring check, not a visual browser test.
- Original code and site input are preserved in `inputs/`.

## Scope and further opportunities

These counts describe initial population, not final retained capacity after 3D view fitting, roads, services or grading. Unsaved browser terrain edits are not included. This is a bounded heuristic, not proof of maximum capacity.

A second experiment finished the top 12 starting layouts instead of finishing only the initial winner. With the OLD sibling rule, the best finished count increased from 42 to 45 at terrain response scale 0 and 43 to 45 at terrain response scale 2. This confirms early winner selection leaves capacity unexplored, but the substantially longer search was not added to the default interactive action. It could become an explicit deeper-search option; its gains cannot be added to the sibling gains without testing the combined search.

The accepted change adds computation because formerly skipped sibling rows now receive real placement checks. Recorded timing varies with concurrent diagnostics and should not be treated as a controlled performance benchmark.
