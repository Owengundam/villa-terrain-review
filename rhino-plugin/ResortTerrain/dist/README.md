# FIELD Resort Terrain 1.0

A native Rhino 8 plugin for the resort-study workflow. Runs inside Rhino without ChatGPT, Python, SciPy, an internet connection, or an MCP server.

## Start

1. Load `Field.ResortTerrain.rhp` with Rhino's `PlugInManager` (Install), or drag the RHP into Rhino. This copy has also been installed locally by the assistant.
2. With the original resort model open, run `ResortTerrainBind` once **before moving blocks independently**. Save the model to retain tracking. Repeat Bind only after deliberately realigning/editing the linked footprint and arrow geometry.
3. Run `ResortTerrain`. Choose an option, set limits, then **Check**, **Coarse dry run**, or **Update + Check**.
4. Inspect the result report. Failed visibility outlines are red; steep terrain sample points are orange. `ResortTerrainClear` removes the temporary highlights.

`ResortTerrainCheck` and `ResortTerrainUpdate` run directly using the latest settings. They can be assigned to a Rhino toolbar button. The plugin does not run on every mouse move; one command starts an update after your edits.

## What it checks and changes

- Front is the union of the nearest XY footprint inside the viewing cone and **every** footprint intersecting the corridor projected forward from the viewing facade, at the building's full projected width. No distance cutoff. Default cone: 120 degrees.
- Default required ground-level drop: 5 m, with a 0.25 m adjustment margin.
- Searches limited rotations/relocations for visibility conflicts, then finds bounded level adjustments. Cycles and unresolved constraints are reported. The bounded search is not a guarantee of a globally optimal layout.
- Checks the entire footprint-to-footprint minimum clearance, not just the earlier directional side-gap test. Default: 3 m.
- Rebuilds a minimum-curvature hillside, with fixed flat building pads and a mildly tensioned surface between them. Synthetic broad grading is inferred from pad levels, not from survey data.
- Reuses triangulation when only levels change. Rebuilds it if the boundary, building footprints or grid change. Unchanged options are skipped across runs; persisted mesh/contour checksums detect manual edits.
- Final grid defaults to 1.25 m; coarse dry runs use at least 2.5 m. Contours are sampled from the mesh every 2 m and displayed 0.035 m above it to avoid flickering. The draped boundary is 0.1 m above the surface.
- Stops before applying any geometry when grading, visibility, footprint clearance, contact or slope checks fail. It never automatically relaxes a limit to force a result.

Default change limits per run: 3 m level change, 20 degree rotation, 6 m relocation. Default maximum terrain slope: 100% (1:1), evaluated on mesh triangles. Tiny triangles can reveal very localized steep patches; review the highlights before changing limits. This is a configurable review threshold, not an engineering certification.

## Model requirements

Version 1 is designed for the existing resort-study structure, not arbitrary untagged Rhino models:

- Metre model units; rigid, unscaled, upright building blocks.
- A parent option layer containing `01_BOUNDARY`, `03_TERRAIN`, `04_CONTOURS` and module/annotation layers.
- A closed boundary curve named `Original TRACE_01_REDLINE` or `RT_BOUNDARY` on `01_BOUNDARY`.
- Building instances with a `Function` user string and unique names within each option.
- A four-vertex rectangular mesh named `<building name> footprint fill` and curve arrow(s) named `<building name> main view`.
- At least three non-collinear building centres.
- Existing footprint fills are treated as 0.08 m above the conceptual pad ground.

After Bind, moving just the block, or moving it with some linked objects in a group, is supported. Footprints, gardens, terraces, arrows and labels are synchronized during an update. Editing a footprint independently requires realignment and rebinding. Redefining/resizing source blocks is outside this version's automatic tracking.

## Backups, reports and recovery

Update requires an already-saved model. Before geometry changes it writes a timestamped `.3dm` backup under `_backups` next to the original. Successful updates use one Rhino Undo operation. Auto-save is enabled by default and can be disabled.

Text and JSON reports are written to `terrain-reports`. If an unexpected application or disk-write error occurs during commit, use Rhino Undo or the pre-update backup; save failures are reported explicitly. A blocked calculation changes no model geometry. Check and dry run only add temporary display highlights.

The current resort model passes its 161 visibility relationships, but the stricter general clearance and mesh-slope checks flag existing tight gaps and steep patches. An update with default limits can therefore stop for review. Those issues are not silently waived.

## Compatibility and build

Windows, Rhino 8 running .NET 8 (the current workstation's runtime). No external runtime packages are required. Tested using Rhino's bundled RhinoCommon and Eto assemblies.

Source: `src/*.cs`. With a .NET 8 SDK: `dotnet build ResortTerrain.csproj -c Release`. Set `RhinoSystem` if Rhino is installed elsewhere. Alternatively, execute `build-in-rhino.py` through Rhino Python 3; it uses Rhino's bundled Roslyn compiler. Set `RT_PROJECT_ROOT` in the script context when building outside this workspace layout.

`test-in-rhino.py` runs isolated headless fixture tests, without changing the active model. Tests cover the cone/corridor union, input limits, infeasible grading, cycles, complete update/save/backup, caching, block and partial-group movement, and slope-based refusal. `check-current.py` separately verifies that checking the current model does not change its geometry.

No road design, retaining-wall design, drainage verification, surveyed-earthwork volumes, or true 3D eye-to-roof ray casting is included. This implements the agreed pad-height planning rule.
