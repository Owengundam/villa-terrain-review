# 北京格拉斯小镇 Villa Planning — Session Handoff Summary

## Project location & structure
- Workspace: `\\192.168.200.190\03-AI素材  projects\Projects 2026\北京格拉斯小镇\whm\Main Agent Workspace\Planning Agent`
- Viewer source: `phase0/view3d_view.html` + modules `phase0/view3d.js` (3D visibility solver), `phase0/terrain_edit.js` (terrain edits/fitting), `phase0/parallel_para.js` (procedural population), `phase0/villa_presentation.js`
- Build: `node phase0/analyse_3d.js --build-only` → `output/checks/image-flow-3d-20260915/index.html` (self-contained viewer)
- Tests: `node phase0/tests/test_*.js` (10 suites, ~40 checks) + `python -m unittest discover -s phase0/tests` (15 tests). All passing.
- Deploy: `output/sites/villa-review/dist/index.html` (ChatGPT site, deployed via Codex — the ONLY step needing Codex). GitHub mirror `Owengundam/villa-terrain-review` pushable from workspace (token in Windows cred store via PowerShell CredRead script pattern).
- Rhino MCP: registered as Hermes MCP server "rhino" at http://127.0.0.1:2000/ (29 tools), active in NEW sessions. Fallback: `node rpc.js run_python '@script.py'`.

## Current workflow (staged, one thing at a time)
1. **Edit terrain** (modal): drag contour control points (max 10/line), OK = save + close ONLY (shows landmass cut/fill m³). No rotation/recalc.
2. **Planar fitting** (main page): reorients villas to terrain downhill + slides to fix 3m side clearance & boundary + ghosts unresolvable. Uses Perpendicular tolerance (°) + Min side clearance (m) inputs. No view recalc.
3. **3D view fitting** (renamed from "Recalculate arrangement"): adjusts pads (±1.5m) and activates/ghosts villas for view rules (70% overall / >75% central clear). Worker-based.
- Orientation truth = front-vs-back ground drop over 23m (NOT point gradient — IDW noisy). Uphill villas get pure 180° flip then slide-repair.
- **Restore saved plan** = full revert (arrows, pads, contours) to shipped state.

## parallelPara (new, this session)
- Procedural initial population from boundary + smoothed terrain (NO AI image).
- **Terrain response scale** slider 0–6 (resample 4–14m + Chaikin; always recomputed from source) + reset button. Preview-only; reference elevations unchanged.
- **Backhouse clearance (m)** default 7: no villa may intrude the strip behind another's rear facade. Rear-strip overlay checkbox.
- **Populate** adds a `parallelPara` layout (~47–52 villas), all active, labeled "Initial population — geometry checked; views not evaluated". No view reduction. Deterministic. Stale-marked when settings change.
- Key fixes: downhillAt scans all levels (nearest-8 bug), all contour segments used as row spines (3 offsets 0/33/66m), boundary back-slide up to 6m, side rule = >3m plain distance OR side-axis separation (curved rows legit).

## Key bugs fixed this session
- Terrain reset after OK; Reset-lines restoring shipped contours; aliasing in simplify()
- Uphill arrows (V012 + 9 others in shipped data — reconstruction artifacts)
- Restore-saved-plan not reverting arrows; live geometry re-checks after rotation
- parallelPara sparse (14→52): downhillAt null bug, single-spine rows, boundary rejects, side-rule both-frames bug

## Known state
- Live Rhino doc has UNSAVED Sept 14 work (PHASE0_STAGGERED_21 layers) — save baseline before geometry ops.
- Last GitHub push: `bb32b33` → then parallelPara density fix `2b8c95c`-ish (check `git log`). All work committed & pushed.
- parallelPara rows: contour-band based, ~12 levels × bands 0/33/66m; count varies with smoothing.
