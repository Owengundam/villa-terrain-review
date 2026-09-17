# Planning Agent 鈥?project guide

Start with [the browsable project catalog](PROJECT_GUIDE/index.html), the [experiment history](PROJECT_GUIDE/EXPERIMENTS.md), [maintained tools](SCRIPTS.md), or [decisions and continuation notes](PROJECT_GUIDE/DECISIONS_AND_HANDOFF.md).

## Current work

- **Phase 0 villa generator:** [parallel and staggered arrangements](phase0/README.md), generated without an image template. Both alternatives pass the adopted clearance and elevation rules.

- **Current Phase 2:** [views and elevations](view_elevation/README.md), implemented and verified against a fresh September 14 export of the live model. [Review the proposed layouts](output/checks/view-elevation/20260914-152538/index.html). Sequence: orientation 鈫?views/elevations 鈫?clearance cleanup 鈫?terrain fitting. Proposals are not applied to the source model.

- **Latest working model:** [resort planning.3dm](output/resort%20planning.3dm), last saved September 11, 2026 at 18:29 local time.
- **Latest recorded diagnostics:** [Stage 2 final checks](output/checks/stage2/STAGE2v0_final_diagnostics_2026-09-11.json), from 17:39 that day. All three options have no recorded spacing violations or outside footprints. These checks precede the final save and are not full terrain/visibility validation.
- **Next action:** check the latest saved model against visibility, spacing, terrain slope and pad contact together.
- **Rhino plugin:** [instructions and limitations](rhino-plugin/ResortTerrain/README.md).

## How the workspace is organized

The catalog groups every existing file by experiment and role. The output folder keeps the current model at its top level, with checks, previews, archived experiments and recovery material in subfolders. Obsolete experiment scripts were deleted; SCRIPTS.md lists the retained tools. PROJECT_GUIDE contains move and deletion records.

| Location | Purpose |
|---|---|
| PROJECT_GUIDE | Experiment records, searchable catalog, inventory, decisions and continuation notes |
| planning-iterations | Early campus concepts, image studies and Rhino reconstructions |
| output | Current model and a short guide; supporting material is in subfolders |
| rhino-plugin/ResortTerrain | Native Rhino plugin source, build, tests and documentation |
| outputs/partial-edit | Separate image-alignment and partial-edit experiment |

The old filenames containing 鈥渃urrent鈥?or 鈥渇inal鈥?describe their own experiment, not necessarily today's working model. Dates are filesystem metadata unless a report explicitly states otherwise. This workspace has no Git history.

## Maintaining the record

For new work, use `experiments/YYYY-MM-DD-short-name/` with `README.md`, `inputs/`, `scripts/`, `outputs/` and `checks/` as needed. Record the source model, purpose, changed rules, outputs, validation and next step using [the experiment template](PROJECT_GUIDE/EXPERIMENT_TEMPLATE.md). Preserve baseline models; make dated checkpoints before material changes.

Run `organize-project.ps1` from the workspace root to refresh the catalog and inventories. For a new experiment, add its description and classification rule to the script first. The script recreates generated guide pages; keep new experiment notes in the experiment's own folder.
