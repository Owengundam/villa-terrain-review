# Canonical repository — 21 September 2026

The workspace root is now the canonical repository, on branch `planning-circulation`.
Its history continues from the legacy checkout's `2d12b39`; the newer root working
files were preserved in checkpoint **b03defd** before circulation application edits.
This includes the latest parallel capacity, staggered population, pad-limit and
calculation-feedback changes. Nothing was pushed or deployed.

The three legacy uncommitted files were reviewed. Their source changes rename
the terrain response controls; the root already contains those changes and newer
work. A binary-capable patch is preserved at
`experiments/2026-09-21-road-feasibility/checks/legacy-uncommitted.patch`.

`output/github/villa-terrain-review/` is a legacy recovery copy, excluded from the
root repository. Do not edit or build there. `output/sites/villa-review/` remains
a deployment snapshot and is also excluded. Both are preserved on disk.

Source: `phase0/`. Build: `npm run build`. Local viewer:
`output/checks/image-flow-3d-20260915/index.html`. Supporting Python/Rhino tools
remain in their existing locations. New circulation dependency is pinned in
`package.json` and `package-lock.json`; its library is embedded in the standalone
viewer during build. Install with `npm ci --ignore-scripts`.

Existing historical assets remain in Git history. Large local models, caches,
nested repositories, deployment metadata and recovery files are not newly added.
The original September 14 contour experiment and other unrelated local assets
were left untouched.
