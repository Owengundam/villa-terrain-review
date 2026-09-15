# Maintained tools

`phase0/reconstruct_flow.py` reconstructs image arrangements through neighbour-preserving collective XY adjustment, exact-size/downhill geometry and nearby-gap recovery. Geometry-only outputs are in `output/checks/image-flow-reconstruction-20260915`; no view/elevation reduction is performed.

## AI image reduction — September 15

Run `python phase0/extract_ai_layouts.py`, `python phase0/reduce_images.py`, then `python phase0/build_reduction_view.py` to rebuild the four requested image-derived alternatives. The first staggered image is excluded. `phase0/padding.py` and `phase0/reduction_model.js` perform feasible-only automatic ±1.5 m pad fitting for reduction and interactive review. `phase0/audit_reduction.py` defines full-footprint downhill checks; `phase0/inspect_units.py` reads live Rhino unit settings. `phase0/reduction_view.html` contains ghost toggles, actual blocker diagnostics and PNG export. Test with `node phase0/tests/test_reduction_model.js` and `python -m unittest discover -s phase0/tests`.

Results and extraction overlays: [image reduction](output/checks/image-reduction-20260915/index.html). Uses fixed image-derived centres, exact 11 × 23 m rectangles, orientation within ±15° of the nearest downhill contour normal, then clearance and view/elevation reduction. No XY search or live Rhino changes. Raster-to-site registration is approximate. See the [run record](output/checks/image-reduction-20260915/README.md).

`phase0/elevation_diagrams.js` adds live pairwise elevation comparisons for every villa in the selected cone, including inactive ghosts. Test with `node phase0/tests/test_elevation_diagrams.js`.

`phase0/villa_presentation.js` controls 200 ms hover labels and clean active-only plan exports. Test with `node phase0/tests/test_villa_presentation.js`. Use `python phase0/build_reduction_view.py --site-only` for the published viewer workflow, then copy the generated index into the existing Site checkout and republish that same Site.

Only the tools below are retained. Historical experiment scripts and one-time source patchers were deleted on September 14, 2026. Models, images, reports and plugin source were retained.

## Planning phase status

**Phase 0 added:** [terrain-led villa-only layout generation](phase0/README.md). `phase0/run.py` generates parallel and staggered arrangements; `phase0/preview.py` produces exact plan previews. Both clearance and elevation checks are mandatory acceptance gates. This is an alternative starting-plan generator requiring no AI image input.

The agreed sequence is **orientation → views and elevations → clearance cleanup → terrain fitting**. The new Phase 2 is implemented in [view_elevation/run.py](view_elevation/run.py); see [run instructions and results](view_elevation/README.md). It searches XY positions of both front and rear buildings and solves their pad elevations together.

The older [phase2/run_phase2.py](phase2/run_phase2.py) implements directional side clearance >3 m in both local frames, prohibiting overlaps while retaining orientation and height. Its folder name is historical. It is the basis for Phase 3, but still needs a view/elevation preservation guard before use on the new Phase 2 output. Dedicated orientation and final terrain-fitting stages remain unfinished.

| New Phase 2 file | Purpose |
|---|---|
| view_elevation/export_rhino.py | Read-only live geometry and 3D contour export through port 2000 |
| view_elevation/core.py | Terrain reference, view relationships, bounded local search and elevation feasibility |
| view_elevation/verify.py | Independent relationship and constraint checks; separate clearance diagnostics |
| view_elevation/run.py | Run the search and generate the report and selectable viewer |
| view_elevation/viewer.html | Plan movements and selected-building elevation comparison |
| view_elevation/tests/test_views.py | Solver regression fixtures |

## Rhino tools

| File | Purpose | How to use |
|---|---|---|
| [rpc.js](rpc.js) | Send commands to the Rhino MCP server on local port 2000 | From the workspace root: `node rpc.js run_python '@inspect_doc.py'` |
| [inspect_doc.py](inspect_doc.py) | Read document metadata, layers and object information | Run through the connection tool above with the intended Rhino document active |
| [build-in-rhino.py](rhino-plugin/ResortTerrain/build-in-rhino.py) | Compile the native plugin from its C# source | Run in Rhino Python 3 after source changes |
| [install-in-rhino.py](rhino-plugin/ResortTerrain/install-in-rhino.py) | Install and load the compiled plugin | Run in Rhino Python 3 when installing a build |
| [check-current.py](rhino-plugin/ResortTerrain/check-current.py) | Run the plugin's check against the active document | Run in Rhino Python 3; writes its diagnostic report |
| [test-in-rhino.py](rhino-plugin/ResortTerrain/test-in-rhino.py) | Run isolated plugin fixture tests | Run in Rhino Python 3 after plugin changes |
| [test-dialog.py](rhino-plugin/ResortTerrain/test-dialog.py) | Construct, inspect and dispose the plugin dialog | Run in Rhino Python 3 after dialog changes |

The plugin helpers locate the project from the active model's ancestors or an explicit `RT_PROJECT_ROOT`. The plugin requires its documented model structure. [Plugin instructions](rhino-plugin/ResortTerrain/README.md).

## Project organization

[organize-project.ps1](organize-project.ps1) refreshes the experiment catalog and inventories. Run from the workspace root. It does not move models or run planning operations.

## Separate unfinished image-edit experiment

[server.py](outputs/partial-edit/server.py) serves the existing selection editor. [prepare_crops.py](outputs/partial-edit/prepare_crops.py) prepares the selected image crops. These are retained with their editor and image inputs; they are not planning-phase tools.

## Deletion record

[Deleted script paths and hashes](PROJECT_GUIDE/deleted-scripts-2026-09-14.json). This is an audit record, not a backup of the deleted code. Historical documents may mention removed script names when describing how an earlier result was produced.

Image-flow analysis: run python phase0/analyse_reconstructed.py, then python phase0/build_reduction_view.py --site-only --folder output/checks/image-flow-analysis-20260915. This retains rebuilt geometry, fits bounded pads, reduces view conflicts and preserves removed villas as ghosts. Verify with node phase0/tests/test_flow_analysis.js.

3D visibility: phase0/view3d.js is the shared browser/offline solver. Run node phase0/analyse_3d.js, or --build-only to rebuild the viewer from saved results. Output: output/checks/image-flow-3d-20260915. Tests: phase0/tests/test_view3d.js and test_view3d_page.js. The prior 2D pad-drop workflow remains historical.
