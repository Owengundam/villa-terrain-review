# 3D visibility — 15 September 2026

The geometry is unchanged from the image-flow reconstruction. Building-only angular area replaces the former 5.25 m pad-drop rule. Default eye above pad 1.5 m; building extrusion 5 m; view azimuth ±15°, elevation −10° to +5°. At least 70% overall clear and 50% clear in the central ±5° azimuth / −5° to 0° elevation window. Pads stay within ±1.5 m.

Conservative 0.25° angular columns bound silhouettes from clipped footprint near/far distances. Union vertical intervals before integrating. Local pad search uses individual and shared changes and preserves passing views. Greedy deactivation is followed by repeated seeded restoration. Not a maximum-count proof.

Retained: Free 20/43, Parallel 24/70, Staggered 2 22/56, Staggered 3 23/57. Every reconstructed footprint is retained in the report, including ghosts. Original 2D-rule report remains in image-flow-analysis-20260915.

Validation: synthetic partial-height, eye-height, overlap-union, ghost and input tests; 320,400 independent 3D ray/box tests; generated-page rendering and worker-fit checks. Default local reduction times were approximately 17, 63, 38 and 37 seconds. Browser performance will vary.

Assumptions: pad level is the floor reference; model ignores terrain/tree occlusion, supports and roof slopes. Eye/roof/vertical-window settings are editable and recalculation runs in a browser worker. This is a building-obstruction study, not terrain visibility or regulatory approval.


Central-window revision: retain the 5-degree vertical height and centre it on zero, giving -2.5 to +2.5 degrees. If the whole view is narrower on one side, shrink both central extents equally. The computation and diagram share centralHalf(). The clear-area threshold is unchanged. Retained counts below are superseded by the current report.json.
