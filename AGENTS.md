# Planning Agent workspace

The canonical Git repository and editable source are at this workspace root.
Use `phase0/` here, not `output/github/villa-terrain-review/` (legacy recovery copy)
or `output/sites/villa-review/` (deployment snapshot). See
`PROJECT_GUIDE/REPOSITORY.md` for the unification record.

Preserve saved Rhino models and unrelated experiments. The viewer is built with
`npm ci --ignore-scripts` then `npm run build`. No deployment or remote push is
implied by local implementation requests.

Circulation checks fixed-layout XY envelopes and sampled longitudinal slope on
accepted contours (default 8%). Ghosts are ignored as road obstacles. Do not claim
full terrain, cross-slope, entrance-level or vehicle validation. Read
`experiments/2026-09-21-circulation/README.md` before
extending it. Keep new tests independent of placement-time acceptance.
