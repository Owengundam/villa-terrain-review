# Phase 2 — views and elevations

Implemented September 14, 2026. Local search moves both rear and front buildings while retaining orientation. It returns the first verified feasible solution within the search limits, not a globally optimal layout. If exhausted, it reports unresolved constraints; this is not proof that the site is impossible.

## Run

From the workspace root with the intended Rhino document active on port 2000:

```powershell
node rpc.js run_python '@view_elevation/export_rhino.py'
python -u view_elevation/run.py output/checks/view-elevation/input-YYYYMMDD-HHMMSS.json
python -m unittest discover -s view_elevation/tests -p 'test_*.py' -v
```

Use the exact input path printed by the exporter. The exporter checks its read-only operation. The search runs offline using Python's standard library and writes a dated report and viewer beside the input. No live model changes are applied.

## Rules and method

- Rebuild relationships after every move: nearest footprint in the 120° forward cone, plus every footprint intersecting the forward facade-width corridor.
- Every rear pad must be at least 5.25 m above its related front pad. This is the adopted planning proxy for a 5 m building; it is not an eye-to-roof ray-tracing simulation.
- Default limits: 20 m total XY movement per building, pad elevation within ±3 m of reference terrain at the moved centroid. Fixed buildings retain XY. Orientation is unchanged.
- Reference terrain is an 8 m bilinear grid interpolated from the nearest two distinct levels of the live 3D contours. These are synthetic concept contours, not surveyed terrain or an exact reconstruction of the earlier analytic terrain.
- Boundary containment and no footprint overlap are hard constraints. Candidate moves include front only, rear only, and both; directions and distances derive from the obstructing footprints, with smaller local steps.
- A fixed relationship graph gets a bounded elevation feasibility solve; infeasible graphs use elevation deficits to guide further XY moves. Positive cycles cannot satisfy the positive drop requirement.
- An independent geometric checker rebuilds the relationship set and verifies all final drops, movement limits, pad limits, boundary and overlap constraints. Directional side clearance issues are reported separately for Phase 3.

## First live result

Source: `resort planning.3dm` on port 2000, freshly exported at 15:21:59. Three layouts, 24 buildings each. [Selectable result](../output/checks/view-elevation/20260914-152538/index.html) · [Machine-readable report](../output/checks/view-elevation/20260914-152538/report.json).

| Layout | Verified view relationships | Search passes | Remaining directed clearance issues |
|---|---:|---:|---:|
| I | 40 | 4 | 3 |
| A | 43 | 1 | 20 |
| G | 42 | 1 | 7 |

All 125 relationships meet the 5.25 m drop within numerical tolerance. Clearance issue counts are directed checks, not unique building pairs. Phase 3 must preserve these accepted view/elevation constraints, and final terrain fitting must still address slopes and pad contact. The viewer compares proposed XY and levels with original XY and its fitted levels; dashed outlines retain the original footprints.
