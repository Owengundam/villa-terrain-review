# Phase 2 — planar clearance

**Historical stage name:** the current Phase 2 is [views and elevations](../view_elevation/README.md). This clearance solver is now the basis for Phase 3. Do not apply it to an accepted elevation solution until its moves are guarded by the new view/elevation checks.

Implemented and tested on Rhino 8 through MCP port 2000. Python standard library only; no installation of SciPy or Shapely required.

## Run

From the workspace root in PowerShell:

```powershell
node rpc.js run_python '@phase2/run_phase2.py'
```

This reads the document attached to port 2000, solves its layouts and writes a report plus SVG/HTML previews under `output/checks/phase2/<timestamp>/`. The default is a dry run: no document objects, layers, attributes or selections are changed.

The MCP Python entry point also accepts `PHASE2_MODE='apply'` and `PHASE2_SETTINGS={...}` in the execution context before executing the file. Apply calculates a fresh proposal, verifies the unchanged source fingerprint, checks all layouts, writes a backup, then applies XY translations in one Undo record. It does not automatically save over the working file. A verification failure restores changed geometry and attributes. If any layout remains unresolved, none are applied.

## Exact rule and defaults

- Directional side clearance, evaluated in **both** buildings' local coordinate frames. When their depth projections overlap, their perpendicular side projections must have a clear gap greater than 3 m.
- Target 3.05 m, including a 5 cm numerical margin. Verification allows the model tolerance around this target, but always requires the actual gap to be greater than 3 m.
- No footprint overlap anywhere. A front-only relationship does not independently require a 3 m front gap.
- Entire footprint contained within the closed site polyline; touching the boundary is permitted. Concave boundary crossings are checked across full edges.
- XY translations only. Phase 1 orientations, block dimensions and Z coordinates remain fixed.
- Maximum movement 6 m from each starting position; 3 search starts, 60 passes per start, 30-second target budget per layout. Runtime can slightly exceed the target while completing a candidate evaluation.
- `Phase2Fixed=true` on a building, or a locked linked object, makes that building fixed.
- Rhino group membership is preserved. A multi-building group is **not** automatically treated as a rigid cluster; individual building XY movements may differ.

Settings names: `clearance`, `margin`, `max_move`, `max_passes`, `starts`, `time_limit`, `tolerance`. These are planning constraints, not engineering certification.

## Implementation

| File | Responsibility |
|---|---|
| model_geometry.py | Read Rhino blocks/footprint boundaries, match spatial copies, guard and apply translations, verify actual read-back |
| geometry.py | Pure XY polygon geometry shared across extraction/checking/solving |
| solver.py | Bounded candidate search with fixed orientation and height |
| checker.py | Final checks independent of the optimizer's candidate/penalty logic |
| run_phase2.py | Entry point, reports and previews |

The solver derives candidate translations from footprint edge normals and local view axes, tries different movement splits, and recomputes all pair conflicts after accepted moves. It accepts reductions in geometric violations, then ranks valid completed runs by weighted squared displacement. Three deterministic conflict/split orderings provide alternative starts. This is a local search: a stalled run means **no solution found within the limits**, not proof of infeasibility. It does not guarantee the least possible movement or a global optimum.

## Supported model input

Metre units; tagged upright, unscaled blocks; one named four-corner footprint mesh and main-view arrow per building; named closed polyline site boundaries. Duplicate names on the same layer are separated by boundary containment and spatial matching. Missing or ambiguous geometry is refused. Starting footprints outside the boundary are reported unresolved, rather than projected into a guessed location.

The current banquet footprint follows the source-definition envelope centre including annotation extents. This legacy convention is explicitly detected and recorded. All clearances use the supplied footprint envelope, which must represent the intended planning envelope. Source definition changes should be reviewed before reuse. Terrain-reference flow arrows without per-building links are treated as static reference graphics.

## Tests

```powershell
python -m unittest discover -s phase2/tests -p 'test_*.py' -v
node rpc.js run_python '@phase2/tests/rhino_integration.py'
```

14 geometry/solver tests and 8 Rhino integration checks passed on September 14, 2026. Integration checks cover actual application, linked objects, attributes/groups, stale input, refusal of unresolved results, forced rollback, idempotence, and the 144-building proposal on a headless copy of the port-2000 model. Run a current-model dry run before the integration test so it can test the matching proposal.

The live model contained six layouts (two copies of A/G/I), 24 buildings each. The tested proposal passed all six, with minimum directional gap about 3.05 m and maximum movement 5.943 m. The active user document was unchanged. Detailed reports remain under `output/checks/phase2/`.
