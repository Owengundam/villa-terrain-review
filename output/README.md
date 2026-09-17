# Current output

**Published viewer:** [Villa Terrain Review](https://villa-terrain-review.owenwhm.chatgpt.site), private to the owner. Published source checkout: `output/sites/villa-review` (reuse its `.openai/hosting.json` for updates). Includes interactive plans, ghost toggles, automatic pads, cone diagnostics, elevation diagrams and plan PNG export.

**Latest AI image reduction, corrected downhill + ±1.5 m pads:** [Free, Parallel, Staggered 2 and Staggered 3 — interactive ghost review and PNG export](checks/image-reduction-20260915/index.html). Retained counts: 20 / 19 / 21 / 19. All saved reduced states pass exact-unit, full-footprint downhill, orientation, boundary, strict side-clearance and current view/elevation checks. Blocker diagnostics explain red cones. The first staggered image is excluded. [Run record](checks/image-reduction-20260915/README.md).

**Latest live-terrain / narrow-view result:** [parallel and staggered plans](checks/phase0/20260914-181521/index.html) · [selectable elevation and central-view review](checks/phase0/20260914-181521/elevations.html). Both have 21 villas and pass the ±15° / 70%-clear design rule plus clearance, contour alignment and pad limits.

**Current Phase 0 preview:** [contour-aligned parallel and staggered plans](checks/phase0/20260914-174719/index.html), 37 and 38 villas. Each villa faces downhill perpendicular to its nearest local contour segment; both layouts pass clearance and elevation checks.

**Phase 0 villa-only alternatives:** see [current generation rules and results](../phase0/README.md). The earlier 64/63-unit previews used a shared orientation and are superseded by the requirement for each villa to face downhill perpendicular to its local contour.

**Open [resort planning.3dm](resort%20planning.3dm)** to continue the current planning work.

**Latest proposal:** [Phase 2 views and elevations — selectable review](checks/view-elevation/20260914-152538/index.html). All three current layouts pass 125 view/elevation relationships. This is an offline proposal; the live model is unchanged. Clearance cleanup and terrain fitting remain.

| Folder | Contents |
|---|---|
| checks/stage2 | Latest saved Stage 2 diagnostics, spacing report and terrain parameters |
| checks/view-elevation | Current Phase 2 inputs, local-search results and interactive reviews |
| checks/phase2 | Historical clearance-only proposals and tests; now the basis for Phase 3 |
| previews/current-plan-renders | Existing plan render images; not certified as matching the latest model save |
| archive/staged-planning | Stage 1 / Stage 1B model snapshots, reports and images |
| archive/terrain-experiments | Earlier terrain models, audits, data and reference images |
| terrain-reports | Rhino plugin check reports; the plugin writes new reports here |
| _backups | Model backups and preserved Rhino temporary/recovery files |

The current model was last observed saved September 11 at 18:29, after the Stage 2 diagnostics. Full validation of that save remains pending.

Keep only the current working model and this guide at this level. Save reports, previews and dated experiments in their corresponding folders. Rhino may automatically create a hidden `.rhl` lock or a `.3dmbak` file next to an open model; leave its active lock alone.

Obsolete terrain scripts were deleted on September 14. Models and recorded results remain as historical evidence. See the [maintained tools](../SCRIPTS.md) for the current script list and phase implementation status.

[Full experiment catalog](../PROJECT_GUIDE/index.html) · [Move manifest](../PROJECT_GUIDE/output-moves-2026-09-14.json)
