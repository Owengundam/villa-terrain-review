# Staggered population — September 21, 2026

`Populate (staggered)` now sits alongside `Populate (parallelPara)` in the current local viewer. Both generated arrangements remain selectable; regenerating one replaces only that arrangement. The existing calculation overlay covers the new action. Switching arrangements no longer calls Restore saved plan and erases generated results.

## Placement

The shared generator accepts `arrangement: 'staggered'`. Row bands alternate by half the along-row pitch (7.5 m at current settings). Parity comes from the signed row-band index, preserving the phase across split fragments and missing bands. Each searched alternative carries its own row phases. The search retains the existing across-row alternatives, three starting phases, and both traversal directions.

Gap packing uses the same row phase, including release of unused guide intervals and additional parallel sibling rows with alternating phase. Free phase repacking, midpoint fallbacks and tail redistribution are excluded for staggered generation because they erase the alternating pattern. Along-row repair is limited to ±1.5 m. These are nominal curved-row phases with local repairs, not an exact global rectangular lattice on curved terrain.

Footprints remain 11 × 23 m, side clearance 3 m, rear strips 7 m, orientation tolerance 15°, nominal pitches 15/31 m. Independent validation, actual footprint checks, terrain-facing checks and the net-gain gate remain in use.

## Saved-site result

| Terrain response scale | Parallel | Staggered |
|---|---:|---:|
| 0 | 47 | 38 |
| 2 | 47 | 38 |

[Compare the plans](checks/comparison.html). Exact staggered outputs: `checks/scale-0.json` and `checks/scale-2.json`. Parallel comparison outputs are preserved in the preceding capacity experiment.

These are initial geometry populations. Staggering does not increase capacity on this tested site with the retained pattern. Views, roads, utilities and final grading are separate checks. This is a bounded search, not proof of maximum capacity. Unsaved browser terrain edits are not represented.

## Validation

- `test_staggered_population.js`: analytic alternating rows, half-pitch phase, determinism, independent geometry and unique IDs; both saved-site scales additionally verify local orientation and downhill ground drop.
- `test_staggered_page.js`: built-page wiring using the validated output fixtures; correct arrangement dispatch, calculation overlay, coexistence, replacement selection, arrangement switching and overlays.
- Existing viewer, calculation-overlay and parallel-pocket tests pass.
- Actual default parallel generation retains 47 villas.

The viewer was rebuilt locally; nothing was deployed or pushed. Browser visual verification remains unavailable because the browser tool blocks the network-file URL.
