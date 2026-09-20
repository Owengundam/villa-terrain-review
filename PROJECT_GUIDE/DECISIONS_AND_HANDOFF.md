# Decisions and continuation notes

## Central-view rule replaces broad cone — September 14

User rejected the 120° view rule as unrealistic for the low-relief site and authorized a narrower, more forgiving obstruction test. Current Phase 0 uses ±15° and at least 70% unobstructed angular width, unioning overlaps across all blockers. These chosen design parameters were stated explicitly. A 5.25 m pad drop clears an obstruction vertically; peripheral buildings no longer impose height constraints. Containment, directional side clearance, local contour-normal orientation and ±3 m reference-pad bounds remain mandatory. The current terrain source is the port-2000 live contour/height-label export, with label anchors and smoothing limitations recorded. Legacy reports and Phase 2 scripts still describe their historical broad-cone rule.

## Mandatory villa orientation

The user reiterated that each villa must be perpendicular to its local contour. Interpret this as the villa's long axis/main viewing direction normal to the nearest local contour segment, facing downhill. A common site-wide downhill angle is insufficient. Phase 0 now rotates each villa locally before enforcing clearance and elevation constraints; its original 64/63-unit fixed-angle previews are superseded. Preserve this rule in subsequent phases and previews.

Compiled September 14, 2026. This is a review of saved evidence, not a fresh model audit.

## Rule history

| Study | Rule | Interpretation |
|---|---|---|
| Early image-first campus | Front/back >5 m; sides >3 m | Plan spacing for eight-block layouts; not the later elevation rule |
| Terrain V1 | Every building in the forward full-width corridor; 5 m pad drop | All three options failed the recorded audit |
| Terrain V2 | Nearest footprint in a 120° cone; 5 m pad drop | Regrading passed this narrower test; side conflicts remained |
| Terrain V3 / plugin | Nearest footprint in the cone plus every footprint in the forward full-width corridor | Final recorded V3 checks passed 161 relationships, minimum drop 5.25 m |
| Plugin clearance | Minimum footprint-to-footprint clearance, default 3 m | Stricter in coverage than the old directional side-gap check; old model had failures |
| September 11 Stage 2 | 40 m synthetic terrain rise; spacing adjustments | Terrain-field file records user confirmation; latest diagnostics show gaps just above 3 m |

The 40 m rise is a concept parameter, not a surveyed site elevation. Do not infer it from the earlier V2 pad relief or assume every model uses the same terrain field.

## Current model and evidence

- Working candidate: [resort planning.3dm](../output/resort%20planning.3dm).
- Latest recorded spacing evidence: [Stage 2 final diagnostics](../output/checks/stage2/STAGE2v0_final_diagnostics_2026-09-11.json).
- Stage 2 parameters: [terrain field](../output/checks/stage2/STAGE2_terrain_field_40m_2026-09-11.json).
- Older V3 evidence: [final checks](../output/archive/terrain-experiments/visibility-v3-final-checks.json), tied to `three-resort-terrain-options.3dm`.
- Plugin evidence: [11 stored test results](../rhino-plugin/ResortTerrain/test-results.json) and [historical model issues](../rhino-plugin/ResortTerrain/current-model-check.json).

The Stage 2 intermediate spacing report lists V20 outside option A; the later final diagnostics list no outside footprints. Treat the final diagnostics as the later record, while retaining both to show the change. Their exact correspondence to the 18:29 model save has not been established.

## Resume here

1. Identify the open Rhino document and confirm whether it is the latest saved working candidate. Preserve any unsaved user changes.
2. Inspect units, option layers, block counts, footprints, arrows and elevations. Do not assume plugin compatibility from the filename.
3. Save a dated baseline before changing geometry.
4. Run the agreed visibility rule, clearance, boundary, slope and pad-contact checks on that same snapshot.
5. Record unresolved conflicts before choosing layout or grading changes. Recheck after changes and save reports alongside the exact snapshot.

## Provenance and gaps

Retrieved task history includes “Fix Three Resort Terrain” and “Check plan unit spacing rules.” The former records the V3 update, plugin creation and installation, and its workflow explanation. The September 11 stage descriptions here are based on saved files; the full conversation that produced those files was not recovered in this review. The exact model ancestry is therefore not asserted.

The partial-edit folder has status `selected`; completion is unconfirmed. Recovery files and Rhino temporary files have not been deleted or treated as authoritative deliverables.

## Orientation authority corrected — September 20

Planar fitting was reversing villas that already faced downhill. The rule in use since the earlier uphill fix probed the interpolated terrain field over the 23 m footprint (±11.5 m) and flipped when the front sample sat higher than the back sample. That field (inverse-distance-squared over sampled contour points) forms local dips between contour lines, so a symmetric probe straddles them: on the shipped data the rule flipped 30 of 226 arrows the contour labels read as downhill (staggered-2 V073/V078 among them) while missing genuinely uphill ones, which is why one user run corrected some villas and left others pointing up.

The rule now decides from the contour LABELS the plan draws — the same thing the user compares against — with physical reads only breaking ties: sample 5…45 m ahead of and behind the arrow, each pair voting on the nearest contour's own z; vote ≥ +2 uphill, ≤ −2 downhill; when the labels are tied (flat, hollow or saddle spots) the arrow is flipped only if the contour-LEVEL scan and the integrated ±40 m drop both report uphill. A flip never reverses a villa the labels read downhill.

Evidence (`node phase0/orientation_report.js`), scored against an independent label read: shipped terrain 5 of 5 definitely-uphill villas flipped, 0 false positives on the 218 the labels read downhill; with one contour line moved 5/5 and 0; with three lines moved 10/10 and 0. Arrows flipped on the shipped data: parallel V017 V053, staggered-2 V026 V043 V068, staggered-3 V067 — the free arrangement has none. The perpendicular tolerance is now reported (how many active villas sit how far off the local contour normal) but is not corrected: this stage flips arrows, it never rotates an axis onto the normal.

## Catalog maintenance

On September 14, the output folder was physically organized: current model at the top level; supporting files in checks, previews, archive and backup folders. The move manifest records 109 files and their pre-move hashes. Historical report payloads retain their original path strings as provenance. Authored links and the offline inspection path were updated. Plugin helper scripts now search ancestor folders for the plugin source, supporting both current and archived model locations.

The catalog classifies files by path and filename. Its inventory includes modification timestamps and sizes, not immutable content hashes. It is an organizational index, not version control. The project currently has no Git repository.

## Script cleanup — September 14

After the folder migration, 38 obsolete experiment, source-patching and migration scripts were deleted at the user's request. The original move manifest describes the earlier migration; it is not the current file inventory. Models, images, reports, native plugin source and maintained tools remain. See [SCRIPTS.md](../SCRIPTS.md) and the deletion record for current status. Dedicated scripts for the agreed orientation and planar-clearance phases have not yet been implemented.

## Subsequent Phase 2 implementation — September 14

Phase 2 is now implemented: [run instructions](../phase2/README.md), [live proposal and tests](../output/checks/phase2/README.md). The model on port 2000 contains six spatial layouts and 144 tagged building instances, not the older three-layout snapshot. All six proposed layouts pass the directional side rule, footprint overlap and boundary checks. The active model has not been changed. Application was tested on a headless copy; orientations, heights, linked objects, IDs and group membership were checked. Dedicated Phase 1 and Phase 3 scripts remain future work.

## Revised phases and new implementation — September 14, 15:30

The user moved view access and elevations ahead of clearance: orientation → views/elevations → clearance cleanup → terrain fitting. They selected bounded local search; an unresolved search can lead to a new AI-generated plan instead of evolutionary optimization. Both front and rear buildings may move.

[New Phase 2](../view_elevation/README.md) is implemented and tested. A fresh port-2000 export now contains three layouts and 72 buildings, superseding the six-layout live count above. All 125 resulting view relationships pass independent checks. Remaining directed clearance issues: I 3, A 20, G 7. Seven new solver tests and 14 existing geometry/clearance tests pass. Source fingerprints at 15:21:59 and 15:30:18 match; the live document was not changed.

The result uses synthetic contour-interpolated reference terrain with 20 m XY and ±3 m pad limits. It is not final terrain or surveyed-terrain verification. Before applying subsequent clearance moves, integrate guards that rebuild and preserve the view/elevation constraints. Results and selectable review are under `output/checks/view-elevation/20260914-152538/`. Browser URL policy prevented opening the network-file preview for interaction testing; JavaScript syntax was checked, and an inline review is supplied in the conversation.
