# Image-flow analysis — 15 September 2026

Rebuilt, exact-size geometry is preserved. View reduction uses the same bounded pad solver as the interactive viewer, removing the most obstructed viewer and then testing reinsertion. This is a local reduction, not a maximum-count proof.

| Arrangement | Rebuilt | Active | Ghosts |
|---|---:|---:|---:|
| Free | 43 | 20 | 23 |
| Parallel | 70 | 27 | 43 |
| Staggered 2 | 56 | 20 | 36 |
| Staggered 3 | 57 | 22 | 35 |

All retained layouts pass independent geometry, ray/polygon view and pad checks. All reconstructed units pass downhill, orientation and standard-size checks. 226 interactive toggle/export/elevation participant checks pass. Source terrain is the previously checked real contour and spot-height reference. The report stores every reconstructed villa; view removals remain ghosted and reversible.

Restoration correction: retain fitted pads while testing reinsertion and repeat until no individual ghost can be added. Corrected totals: Free 20/43, Parallel 28/70, Staggered 2 20/56, Staggered 3 24/57. V015 and V030 in Staggered 3 are active and pass. Every remaining ghost fails whole-layout activation under the current bounded solver. The earlier report is preserved as report-before-restoration-fix.json. Active failing footprints now display red after manual edits; activation is still controlled by the user.
