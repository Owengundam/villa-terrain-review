# Handoff — "Terrain response scale" shared-surface upgrade (2026-09-20, session ends mid-task)

Task spec: the full pasted spec (shared-surface Gaussian guidance, sections 1–6). It was
delivered as a pasted attachment in the Hermes session; re-read it before continuing —
every requirement below cites its section numbers.

## What exists now (verified unless marked ASSUMED)

### New module: `phase0/smoothing.js` (complete, core tests passing)
- Pipeline: accepted contours → canonical representation → arc-length samples (1 m) →
  height field z0 on a fixed 2 m grid (bracket interpolation between the two nearest
  DISTINCT levels, expanding search radius capped at 400 m — 60 m punched NaN deserts) →
  trend-preserving masked Gaussian (weighted best-fit plane p + Gaussian(r), separable
  passes, mask-aware normalization `G(mask·r)/G(mask)`, confidence <1 where kernel
  support <50%) → marching-squares extraction at the accepted levels → chain →
  Douglas-Peucker (0.5 m) + 2 Chaikin rounds (kills grid stair-wobble; the field itself
  is what is smoothed).
- Level→σ mapping (proposed): 0=off, 1=2 m, 2=5 m, 3=10 m, 4=16 m, 5=24 m, 6=32 m
  (`SIGMAS`). Level 0 returns exact deep copies (no raster round trip).
- Bugs found and fixed during bring-up: plane coefficients were applied as a+bx+cy
  (was a+b·x+c·y → fake ±3,000,000 m trend); marching-squares edge tests compared bit
  masks instead of booleans (spurious segments on every cell where both corners were
  above); saddle table entries 9/11/13 were wrong; radius cap 60 m → 400 m.
- API: `Smoothing.smoothContours(contours,level)` (drop-in) and
  `Smoothing.guidance(contours,level)` → `{contours, meta, gradientAt, field, bbox}`;
  meta carries sigma/cell/runtime/`levelsMissing`/`components` (in→out per level,
  honest topology change)/`recon` rms+max (≈0.086 m rms on the real site)/
  `lowConfCells`/note "Smoothed placement guidance — reference terrain unchanged."
- `gradientAt(x,y)` = central differences of the SAME zGuide the contours come from,
  bilinear to the query; returns `{valid,dir,conf}`; invalid within 2 cells of the bbox
  edge (documented; spec 3E recovery beyond that is NOT implemented).
- Runtime: ~5–6 s per level on the real site (18 lines, 2142 pts). Spec 4 wants
  worker/debounce + source-fingerprint stale guard — NOT yet implemented; the viewer
  currently recomputes synchronously in `$('smooth').oninput`, which will feel laggy.
  A drafted guard (job counter + source fingerprint) was abandoned mid-collision; redo
  it if you take this on.

### Integration
- `phase0/parallel_para.js`: `smoothContours` delegates to Smoothing, then drops
  components with perimeter <24 m (documented; row spines below ~2 villa widths only
  add reject churn). A sibling agent independently reworked this file the same day
  (row guides, metrics, prune, `okFinal` semantics) — all 13 `test_parallel_para.js`
  PASS together with the delegation (verified end of session).
- `phase0/view3d_view.html`: `/*__SMOOTHING__*/` placeholder added (before `__PARALLEL__`);
  `#smoothScale` span next to the slider; slider shows "N (σ X m)"; help text and Reset
  tooltip rewritten. The sibling rewired guidance source to the ACCEPTED terrain
  (`data.contours`) and added populate snapshot guards — kept.
- `phase0/analyse_3d.js`: reads smoothing.js and injects it at `/*__SMOOTHING__*/`.

### Checkpoints (nothing pushed — spec forbids remote ops)
- Site checkout `output/sites/villa-review`: `eef6b4b` (dist == build sha 8d473811…).
- GitHub clone `output/github/villa-terrain-review`: `2d12b39` "Local checkpoint …
  (pre-smoothing-upgrade; not pushed)". Remote HEAD in sync at `4d69a4c` before that.

### Tests
- `phase0/tests/test_smoothing.js` (8 sections: level-0 exactness/aliasing, determinism,
  slope+planar-preservation fixtures, real-site all-levels metadata, downstream
  generate+verify on levels 0/3/6, point-order invariance, invalid input, attenuation
  metrics incl. old-implementation baseline). Fixture bug fixed (contours now at
  y=k·20 m); a background rerun was in flight when the session ended — section 1 PASS
  was its last output. RERUN IT; sections after 3 are UNVERIFIED.
- `phase0/tests/test_parallel_para.js`: 13/13 PASS (sibling's suite, includes
  representation-independence and smoother-than-source assertions against the new engine).
- NOT yet run after integration: `test_fit_stages.js`, `test_uphill.js` (~8 min),
  `test_terrain_edit.js`, `test_fit_volume.js`, `test_view3d_page.js`,
  `test_parallel_page.js`. The built `output/checks/image-flow-3d-20260915/index.html`
  predates smoothing — run `node phase0/analyse_3d.js --build-only` BEFORE viewer tests.

## Known gaps vs spec (do these next)
1. Rerun `test_smoothing.js`; fix whatever sections 4–8 surface.
2. Rebuild the viewer, run the full viewer-suite set above.
3. Spec 4 responsiveness: debounce or worker + fingerprint stale guard; a slow earlier
   computation must not overwrite a newer slider setting. Watch the 5–6 s runtime.
4. Spec 5.3/5.4 nuance: test 2 of the spec ("selecting 3 directly == 6 then 3") holds by
   construction only if nothing smooths the smoothed output — assert it in the viewer
   (populate uses `ParallelPara.smoothContours(snapshot.contours, level)` — fresh source —
   so it holds; add the test).
5. `terrainOk` does not refresh `terrainSmoothPreview`; the on-map preview can show
   pre-edit guidance until the slider moves (spec test 3). Small fix in the
   `terrainOk` handler: invalidate/re-request the preview.
6. Gradient edge recovery (3E) beyond the current `valid:false` margin.
7. Browser verification: rapid slider changes, Reset; before/after screenshots at the
   same scale; report final σ mapping and the section-5 metrics table (the test prints
   j11/j23/j30 + rms vs the old implementation — include its output).
8. Checkpoint commits after green; NO push, NO deploy (spec).

## Environment facts
- Workspace root is NOT a git repo; the two checkouts above carry history.
- `terminal` needs the `//192.168.200.190/...` MSYS path form; `read_file`/`patch` take
  the `\\...\` UNC form. No rsync; use tar-via-Temp to bulk-copy into the clone.
- Level-3 guidance on the real site ≈ 5–6 s; budget test timeouts accordingly.
- A sibling agent worked the same files 14:50–15:12 and has finished; its state is the
  current disk state. Nothing else is running.

Last verified state: 13/13 test_parallel_para.js PASS with the Smoothing delegation;
test_smoothing.js rerun incomplete.
