$ErrorActionPreference = 'Stop'
$root = (Get-Location).ProviderPath
$guide = Join-Path $root 'PROJECT_GUIDE'
New-Item -ItemType Directory -Force $guide | Out-Null
$groups = @(
 @{Id='01';Title='Connected Garden Campus';Status='Completed concept study';Summary='Compared A/B/C massing and refined C into C2. Combined generated landscape with eight supplied interiors. The roof-overlay interiors were independently fitted for presentation and are not dimensionally authoritative.';Evidence='planning-iterations/README.md';Next='Use the original CAD instances for dimensional work, not the presentation overlays.'},
 @{Id='02';Title='Interior-led Garden Campus';Status='Completed concept study';Summary='Reoriented eight actual plan instances around interpreted entrances and private edges, generated landscape, then reconstructed editable circulation. Recorded footprint, overlap and sampled route checks passed.';Evidence='planning-iterations/interior-led/README.md';Next='Verify entrance interpretation, path widths and surveyed constraints before development.'},
 @{Id='03';Title='Three Image-first Layouts';Status='Completed comparison';Summary='Courtyard Neighbors, Garden Journey and Open Landscape Neighborhood were generated then rebuilt using original block dimensions. The September 10 record says the earlier eight-building layouts passed the assumed >5 m front/back and >3 m side spacing checks.';Evidence='planning-iterations/image-first-three/README.md';Next='Do not transfer these results to the later 24-building terrain options; these are different experiments.'},
 @{Id='04';Title='Resort Terrain Baseline and Orientation';Status='Historical baseline';Summary='Created A grouped, G woodland and I garden terrain options: 24 buildings each (20 villas, two hotel bars, banquet and restaurant). Synthetic terrain and orientation studies followed. The original notes record a millimetre unit label despite metre-like dimensions; later audits use metres.';Evidence='output/archive/terrain-experiments/terrain-studies-notes.md';Next='Check units in any model being reused. Original source and early orientation snapshots are historical references.'},
 @{Id='05';Title='Visibility V1 and V2';Status='Superseded rule experiments';Summary='V1 used a full-width forward corridor and found failures in every option. V2 tested only the nearest footprint in a 120-degree cone and regraded a separate model. V2 passed its elevation checks but left side conflicts and produced roughly 38–44 m pad relief.';Evidence='output/archive/terrain-experiments/visibility-audit-v2-report.md';Next='Use the later cone-plus-corridor rule for continuity with the final terrain-plugin conversation.'},
 @{Id='06';Title='Natural Terrain and Visibility V3';Status='Historical validated snapshot';Summary='Rebuilt smoother terrain with flat pads, then used the nearest footprint in a 120-degree cone plus every footprint in the forward building-width corridor. The saved V3 report records 72 buildings, 161 relationships, minimum drop >=5.25 m and valid terrain meshes. This does not establish acceptable slopes or general clearances.';Evidence='output/archive/terrain-experiments/visibility-v3-final-checks.json';Next='Keep V3 evidence tied to three-resort-terrain-options.3dm; do not treat it as validation of resort planning.3dm.'},
 @{Id='07';Title='FIELD Resort Terrain Plugin';Status='Built; historical tests passed';Summary='Native Rhino 8 plugin with Check, Coarse dry run, Update + Check, binding, backups and reports. Stored results list 11 passing tests. The recorded current-model check flagged tight clearances and steep terrain. Plugin use requires its documented layer/tag/footprint structure.';Evidence='rhino-plugin/ResortTerrain/README.md';Next='Confirm the target model meets requirements and run a fresh check before an update. Installation was reported in the prior task; not reverified by this catalog.'},
 @{Id='08';Title='September 11 Staged Resort Planning';Status='Latest work; full validation pending';Summary='Saved Stage 1 orientation and Stage 1B sketch-terrain snapshots, followed by Stage 2 with a 40 m rise recorded as user-confirmed. Stage 2 final diagnostics report no spacing violations or outside footprints, with minimum gaps 3.001/3.002/3.002 m. Latest resort planning.3dm save is 18:29, after the 17:39 diagnostics.';Evidence='output/checks/stage2/STAGE2v0_final_diagnostics_2026-09-11.json';Next='Recheck the latest saved model for visibility, clearance, slope and pad contact together. A separate Stage 2 model snapshot is not present. Exact derivation from the V3 file is not established.'},
 @{Id='09';Title='Partial Image Edit and Alignment';Status='Prepared; completion unconfirmed';Summary='Contains plan/render references, alignment variants, selection geometry, masked crop and reference crop, plus a local selection editor. Stored status is selected. No completed edited composite was identified in this folder.';Evidence='outputs/partial-edit/status.json';Next='Review the selected region and alignment before resuming generation or composition.'},
 @{Id='10';Title='Utilities, Recovery and Unclassified Material';Status='Supporting material';Summary='Connection probes, command payloads, temporary Rhino files, backups and material that cannot confidently be assigned to an experiment. Temporary and recovery files are preserved.';Evidence='';Next='Review before deleting or reclassifying. Files are assigned by path/name; classification is not proof of execution.'},
 @{Id='11';Title='XY Clearance — now Phase 3 basis';Status='Implemented; view preservation integration pending';Summary='Historical clearance-only dry run covered 144 buildings across six spatial layouts. 14 standalone tests and eight Rhino integration checks passed. The current live model has since changed to three layouts.';Evidence='phase2/README.md';Next='Add view/elevation preservation guards before using this clearance solver on the new Phase 2 output.'},
 @{Id='12';Title='Phase 2 Views and Elevations';Status='Implemented; three live proposals verified';Summary='Bounded local search moves front and rear buildings, rebuilding view relationships and solving pad heights. Fresh port-2000 source contains 72 buildings across I/A/G. All 125 resulting view relationships pass; source model remains unchanged. Clearance cleanup and terrain fitting remain subsequent work.';Evidence='view_elevation/README.md';Next='Review the selectable plan and elevation result, then integrate clearance cleanup while preserving accepted view relationships.'}
)
$groups += @{Id='13';Title='Phase 0 Terrain-led Villa Layouts';Status='Implemented; parallel and staggered proposals verified';Summary='No AI image template. Standard 11 x 23 m villas arranged in compact regular rows using the boundary and synthetic reference terrain. Parallel 64 units and staggered 63 units pass clearance, containment, overlap and elevation checks.';Evidence='phase0/README.md';Next='Review the two arrangements; access and final terrain remain undesigned.'}
function Classify([string]$p) {
 if($p -like 'phase0/*' -or $p -like 'output/checks/phase0/*'){return '13'}
 if($p -like 'view_elevation/*' -or $p -like 'output/checks/view-elevation/*'){return '12'}
 if($p -like 'phase2/*' -or $p -like 'output/checks/phase2/*'){return '11'}
 if($p -match '_repo_rhinomcp|\.3dmbak$|\.tmp$|/_backups/'){return '10'}
 if($p -like 'planning-iterations/interior-led/*'){return '02'}
 if($p -like 'planning-iterations/image-first-three/*'){return '03'}
 if($p -like 'planning-iterations/*'){return '01'}
 if($p -like 'rhino-plugin/*'){return '07'}
 if($p -like 'outputs/partial-edit/*'){return '09'}
 if($p -match '(?i)STAGE[12]|resort planning'){return '08'}
 if($p -match '(?i)natural|visibility-v3|v3-|three-resort-terrain-options\.3dm$'){return '06'}
 if($p -match '(?i)clearance-audit|visibility-audit-v2|visibility-regraded|regrade-visibility|visibility-audit-v1'){return '05'}
 if($p -match '(?i)terrain-studies|orient-modules|downhill|view-oriented|terrain-perspective|three-terrain-top|selected-site'){return '04'}
 if($p -like 'output/terrain-reports/*' -or $p -match 'resort-plugin'){return '07'}
 return '10'
}
function Role([string]$ext) {
 switch -Regex ($ext) {
 '^\.3dm$' {'Rhino model';break}
 '^\.(3dmbak|tmp)$' {'Recovery';break}
 '^\.(png|jpg|jpeg)$' {'Image';break}
 '^\.(py|ps1|js|cs|csproj|yml)$' {'Code / configuration';break}
 '^\.rhp$' {'Plugin build';break}
 '^\.(json|csv)$' {'Data / report';break}
 default {'Document / other'}
 }
}
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object { $_.FullName -notlike "$guide*" -and $_.Name -notin @('organize-project.ps1','README.md') -or ($_.Name -eq 'README.md' -and $_.DirectoryName -ne $root -and $_.FullName -notlike "$guide*") } | ForEach-Object {
 $p = $_.FullName.Substring($root.Length+1).Replace('\','/')
 [pscustomobject]@{Experiment=Classify $p;Role=Role $_.Extension;Path=$p;Bytes=$_.Length;Modified=$_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')}
} | Sort-Object Experiment,Role,Path)
$files | Export-Csv -LiteralPath (Join-Path $guide 'file-inventory.csv') -NoTypeInformation -Encoding utf8
$files | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $guide 'file-inventory.json') -Encoding utf8
$intro = @'
# Planning Agent — project guide

Start with [the browsable project catalog](PROJECT_GUIDE/index.html), the [experiment history](PROJECT_GUIDE/EXPERIMENTS.md), [maintained tools](SCRIPTS.md), or [decisions and continuation notes](PROJECT_GUIDE/DECISIONS_AND_HANDOFF.md).

## Current work

- **Phase 0 villa generator:** [parallel and staggered arrangements](phase0/README.md), generated without an image template. Both alternatives pass the adopted clearance and elevation rules.

- **Current Phase 2:** [views and elevations](view_elevation/README.md), implemented and verified against a fresh September 14 export of the live model. [Review the proposed layouts](output/checks/view-elevation/20260914-152538/index.html). Sequence: orientation → views/elevations → clearance cleanup → terrain fitting. Proposals are not applied to the source model.

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

The old filenames containing “current” or “final” describe their own experiment, not necessarily today's working model. Dates are filesystem metadata unless a report explicitly states otherwise. This workspace has no Git history.

## Maintaining the record

For new work, use `experiments/YYYY-MM-DD-short-name/` with `README.md`, `inputs/`, `scripts/`, `outputs/` and `checks/` as needed. Record the source model, purpose, changed rules, outputs, validation and next step using [the experiment template](PROJECT_GUIDE/EXPERIMENT_TEMPLATE.md). Preserve baseline models; make dated checkpoints before material changes.

Run `organize-project.ps1` from the workspace root to refresh the catalog and inventories. For a new experiment, add its description and classification rule to the script first. The script recreates generated guide pages; keep new experiment notes in the experiment's own folder.
'@
Set-Content -LiteralPath (Join-Path $root 'README.md') -Value $intro -Encoding utf8
$timeline = "# Experiment history`n`nCompiled September 14, 2026 from saved files and retrieved task history. Numbers group the work; they are not a claim that every experiment ran strictly in sequence.`n`n"
$cards = ''
foreach($g in $groups) {
 $folder=Join-Path $guide $g.Id
 New-Item -ItemType Directory -Force $folder | Out-Null
 $subset=@($files | Where-Object Experiment -eq $g.Id)
 $timeline += "## $($g.Id) — $($g.Title)`n`n**$($g.Status)**`n`n$($g.Summary)`n`nNext: $($g.Next)`n`n[Files and evidence]($($g.Id)/README.md)`n`n"
 $md = "# $($g.Id) — $($g.Title)`n`n**Status:** $($g.Status)`n`n$($g.Summary)`n`n**Next:** $($g.Next)`n`n"
 if($g.Evidence){$md += "[Primary evidence](../../$($g.Evidence.Replace(' ','%20')))`n`n"}
 $md += "## Files`n`n| Role | File | Modified |`n|---|---|---|`n"
 foreach($f in $subset){$md += "| $($f.Role) | [$($f.Path)](../../$($f.Path.Replace(' ','%20'))) | $($f.Modified) |`n"}
 Set-Content -LiteralPath (Join-Path $folder 'README.md') -Value $md -Encoding utf8
 $cards += "<section><h2>$($g.Id) · $($g.Title)</h2><p class='status'>$($g.Status) · $($subset.Count) files</p><p>$($g.Summary)</p><p><b>Next:</b> $($g.Next)</p><details><summary>Browse files</summary><ul>"
 foreach($f in $subset){$url='../'+(($f.Path.Split('/') | ForEach-Object {[uri]::EscapeDataString($_)}) -join '/');$label=[System.Net.WebUtility]::HtmlEncode($f.Path);$cards += "<li><span>$($f.Role)</span> <a href='$url'>$label</a></li>"}
 $cards += '</ul></details></section>'
}
Set-Content -LiteralPath (Join-Path $guide 'EXPERIMENTS.md') -Value $timeline -Encoding utf8
$html=@"
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Planning Agent | Experiment Library</title>
<style>body{margin:0;background:#f5f3ed;color:#23362e;font:16px/1.6 system-ui}main{max-width:1050px;margin:auto;padding:48px 24px}h1{font-size:42px;line-height:1.15}h2{font-size:23px;margin:0}a{color:#24694e}header{margin-bottom:32px}.lead{font-size:20px}.status{font-size:14px;color:#6b705f}section{background:white;border:1px solid #dedfd5;border-radius:12px;padding:24px;margin:18px 0}input{box-sizing:border-box;width:100%;padding:14px;font:inherit;border:1px solid #9cab9e;border-radius:8px}li{margin:9px 0;overflow-wrap:anywhere}li span{font-size:12px;color:#73776d}summary{cursor:pointer;color:#24694e;font-weight:600}.current{background:#e4eee4;padding:22px;border-radius:12px}small{color:#687267}</style>
<main><header><small>BEIJING GRASSE TOWN · PLANNING WORKSPACE · SEPTEMBER 14, 2026</small><h1>Experiment Library</h1><p class="lead">A traceable history of layouts, terrain, rules and tools.</p><div class="current"><b>Current starting point:</b> <a href="../output/resort%20planning.3dm">resort planning.3dm</a><br>September 11, 18:29 save. Stage 2 spacing checks passed before this save; full current-model validation remains pending.</div><p>$($files.Count) indexed files · Current model + organized archive · <a href="../README.md">Project guide</a> · <a href="file-inventory.csv">File inventory</a></p><input id="search" type="search" placeholder="Find an experiment, model, report or script…" aria-label="Search experiments and files"></header>$cards<footer><p>Historical checks apply only to their recorded model and rule. This catalog does not rerun Rhino or certify the latest model.</p></footer></main><script>document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('section').forEach(s=>{s.hidden=!s.textContent.toLowerCase().includes(q);s.querySelector('details').open=!!q&&!s.hidden})})</script></html>
"@
Set-Content -LiteralPath (Join-Path $guide 'index.html') -Value $html -Encoding utf8
Set-Content -LiteralPath (Join-Path $guide 'EXPERIMENT_TEMPLATE.md') -Encoding utf8 -Value @'
# Experiment title

- Date / owner:
- Status: proposed / running / completed / superseded / unresolved
- Purpose:
- Source model and exact snapshot:
- Inputs and reference authority:
- Rules and assumptions:
- Method / script / command:
- What changed:
- Outputs:
- Checks performed and evidence:
- Checks not performed:
- Findings / limitations:
- Decision and next step:
- Related previous experiment:

Record generated imagery as conceptual unless geometry was independently verified. Link evidence to the exact model snapshot and rule version.
'@
Write-Output "Indexed $($files.Count) files in $($groups.Count) experiment groups."
