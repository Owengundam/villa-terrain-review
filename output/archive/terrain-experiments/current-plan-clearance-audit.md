# Current plan directional-clearance audit

Live Rhino document checked: `three-resort-terrain-options.3dm`  
Model units: metres  
Modules checked: 24 per option / 72 total

## Rule interpretation used

- Front: a module is considered in front when its footprint enters the infinite, full-width corridor projected from another module's main-view facade.
- Vertical: the front module's concept floor elevation must be at least one unit height below the viewer. Unit height is currently set to **5.0 m**.
- Side: when two footprints overlap along a module's depth, the perpendicular clear gap from that module's side must be **strictly greater than 3.0 m**.
- View direction comes from the live `main view` arrows. Elevation comes from each module's `ConceptElevation` user text.

## Result

| Option | Front checks passed | Front violations | Viewers affected | Unique side-pair violations | Overall |
|---|---:|---:|---:|---:|---|
| 01_GROUPED_A | 13 / 47 | 34 | 15 | 11 | FAIL |
| 02_FREE_G | 15 / 37 | 22 | 16 | 3 | FAIL |
| 03_FREE_I | 13 / 47 | 34 | 16 | 3 | FAIL |

`02_FREE_G` is the least conflicting option, but it still fails both rules.

## Nearest front/elevation failures

These are the closest failed front relationships in each option. Elevation drop is viewer elevation minus front-unit elevation; the required drop is at least 5.0 m.

| Option | Viewer → front unit | Forward gap | Elevation drop | Shortfall |
|---|---|---:|---:|---:|
| 01_GROUPED_A | V10 → V12 | 3.077 m | 1.646 m | 3.354 m |
| 01_GROUPED_A | V02 → V04 | 3.839 m | 1.417 m | 3.583 m |
| 01_GROUPED_A | V14 → V16 | 5.322 m | 1.295 m | 3.705 m |
| 01_GROUPED_A | HOTEL-1 → V08 | 5.647 m | 3.293 m | 1.707 m |
| 02_FREE_G | V16 → V17 | 1.726 m | 1.013 m | 3.987 m |
| 02_FREE_G | HOTEL-2 → V14 | 2.918 m | 1.637 m | 3.363 m |
| 02_FREE_G | V06 → V07 | 3.973 m | 1.148 m | 3.852 m |
| 03_FREE_I | V02 → V03 | 2.256 m | 1.175 m | 3.825 m |
| 03_FREE_I | V06 → V07 | 2.573 m | 1.208 m | 3.792 m |
| 03_FREE_I | V01 → V02 | 3.239 m | 1.254 m | 3.746 m |

## Side-gap failures (unique physical pairs)

- **01_GROUPED_A:** V09/V10 0.838 m; V11/V12 1.309 m; HOTEL-2/V17 1.592 m; V05/V06 1.953 m; V17/V18 1.981 m; V01/V02 2.002 m; HOTEL-1/V08 2.142 m; V07/V08 2.213 m; V03/V04 2.430 m; V19/V20 2.835 m; V02/V07 2.979 m.
- **02_FREE_G:** V16/V18 0.092 m; V01/V02 0.524 m; V02/V03 1.891 m.
- **03_FREE_I:** V10/V11 1.762 m; V03/V04 2.487 m; V08/V09 2.772 m.

## Automation

The reusable read-only Rhino audit is `current-plan-clearance-audit.py`. It reads the actual placed footprint meshes, main-view arrows, and concept elevations; classifies front and side relationships in each unit's local coordinate frame; and prints a detailed JSON report. The two design parameters are near the top of the script:

```python
UNIT_HEIGHT_M = 5.0
MIN_SIDE_GAP_M = 3.0
```

It can be called through the existing Rhino MCP endpoint on port 2000 after any layout edit. A later visual pass can add red Rhino overlays and labels for failed pairs without changing the checking logic.

## Important limitation

The current elevations were generated from synthetic concept contours, not survey terrain, and the module blocks are plans rather than reliable 3D masses. Therefore this is a valid check of the current concept model, but it is not a construction-grade view-obstruction certification. Replace `ConceptElevation` with surveyed pad levels and confirm the real unit height before treating the result as final.
