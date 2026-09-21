# Circulation milestone 1 — fixed-layout plan study

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
