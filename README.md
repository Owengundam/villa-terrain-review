# Villa Terrain Review

Terrain-aware villa layout reconstruction and interactive 3D building-visibility review.

## Run the current viewer

Requires Node.js 18+ to build and test; the generated viewer is a self-contained HTML file.

```sh
npm run build
npm test
```

Open `output/checks/image-flow-3d-20260915/index.html` in a browser. All calculations run locally in a browser worker; no API key is required. Change eye/building heights, view limits and clear-area thresholds, then select **Recalculate arrangement**. Footprint clicks toggle activation; ghost villas remain selectable. PNG export includes active villas only.

To regenerate all four saved alternatives (takes several minutes depending on hardware):

```sh
npm run analyse
```

## Current rules

- Footprints: 11 × 23 m, with existing downhill orientation and strict 3 m side-clearance geometry.
- Pad adjustments: ±1.5 m from the terrain reference.
- Default eye height: 1.5 m above pad; building extrusion: 5 m.
- Overall view: ±15° horizontal, −10° to +5° vertical, at least 70% clear angular area.
- Central view: ±5° horizontal and ±2.5° vertical, symmetric about the horizon, at least 50% clear. It shrinks symmetrically when required to fit the overall window.
- Silhouette overlaps count once. Conservative 0.25° horizontal columns bound partial-height obstruction.
- Local pad fitting, greedy deactivation and repeated restoration produce valid arrangements, not a proven maximum count.

Current saved active counts: Free 22, Parallel 29, Staggered 2 23, Staggered 3 21. Tests include independent 3D ray/box comparisons and generated-viewer/worker checks.

## Source map

| Path | Purpose |
|---|---|
| `phase0/view3d.js` | Shared 3D visibility and pad/reduction solver |
| `phase0/view3d_view.html` | Interactive viewer template |
| `phase0/analyse_3d.js` | Recalculation and standalone viewer build |
| `phase0/villa_presentation.js` | Hover labels and active-only plan export |
| `phase0/tests/test_view3d*.js` | Current visibility and viewer tests |
| `phase0/reconstruct_flow.py` | Coordinated image-flow geometry reconstruction |
| `phase2/` | Geometry and clearance checking |
| `view_elevation/` | Earlier elevation/terrain workflow and shared geometry helpers |
| `rhino-plugin/ResortTerrain/` | Rhino plugin source and integration scripts |
| `output/checks/` | Selected inputs and current reproducible results |

The Python/Rhino workflows are historical tooling and may require their original Rhino model, Windows fonts, additional experiment files, Python dependencies or a running Rhino connection. They are not needed to run the current 3D viewer. Large model binaries, raster renderings, caches, credentials and deployment configuration are excluded.

## Model limits

Buildings are solid vertical footprint extrusions. Roof slopes, trees, terrain occlusion and structural supports are not visibility blockers. Pad height is the floor reference; upper-floor eye height must include the floor offset. Clear area does not guarantee a continuous unobstructed opening. This is a design study, not regulatory verification.

## Safe interactive editing

Auto mode (on by default) tries to restore eligible ghosts after a deactivation, with bounded pad fitting and whole-layout validation. Manually deactivated villas remain excluded until explicitly activated or the plan is reset/recalculated. Invalid activations are rejected in both modes and retain the previous mask and pad heights. The message identifies failed requirements. Restoration is local search, not a maximum-count guarantee.
