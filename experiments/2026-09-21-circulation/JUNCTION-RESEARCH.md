# Shared road junctions instead of villa-to-villa branching

Research and repository review, 21 September 2026. Recommendation only; no routing behavior changed in this research pass.

## Diagnosis in this repository

`phase0/circulation.js` creates one selected rear arrival per active villa. Its network graph contains these arrivals and the site entrance. The connector loop constructs source candidates only from already connected villa nodes and the entrance, then selects a short feasible connector. Existing road interiors are never source candidates. Row lanes also connect villa arrivals. A junction is consequently tied to a villa even when open space nearby would be better.

The saved `checks/fixed-detour.json` has one road junction with degree three, V021. Entrance links are self-edges and excluded from this degree count. Many other villas have two incident road edges: these are through-road points with private access, not three-way road splits. The visual impression is still explained by both roads being anchored to each rear arrival.

More A* directions, spline smoothing or a conventional minimum spanning tree over the same villa nodes cannot remove this structural restriction. The original feasibility report already proposed interior connection stations, but the prototype has not implemented them.

## Relevant research

1. Galin et al., *Authoring Hierarchical Road Networks* (2011), uses a terrain-dependent geometric graph together with path merging to form junctions and a road hierarchy. This directly supports separating network structure from settlement destinations. It is a procedural modeling method, not a residential road design standard.
   https://perso.liris.cnrs.fr/apeytavi/website/publication/hal-01354487/
2. Galin et al., *Procedural Generation of Roads* (2010), addresses terrain-aware routes between endpoints, including directional costs and richer grid neighborhoods. This is useful for our connector geometry but does not itself solve where shared junctions belong.
   https://perso.liris.cnrs.fr/egalin/Articles/2010-roads.pdf
3. Stahlberg et al., *Spatiotemporal reconstruction of ancient road networks through sequential cost-benefit analysis* (2023), models reuse by reducing the cost of existing road edges. It also demonstrates dependence on connection order. The useful transfer is accounting for shared construction versus travel distance; its archaeological application does not prescribe villa access geometry.
   https://pmc.ncbi.nlm.nih.gov/articles/PMC9944230/

## Recommended implementation

Use terrain-aware incremental network growth with movable shared junctions, followed by a small local improvement pass. This borrows the ability of Steiner networks to add intermediate junctions without attempting an exact global Steiner solver. Pure minimum length is insufficient: it can still place branches at inconvenient entrances.

1. Separate villa entrances, arrival/access points, road junctions and the site entrance in the graph. A villa entrance is a destination connected by a dedicated access link. Its access link is never a shared through route. A shared lane may still run behind several villas; prohibit branching near the access, not the lane itself.
2. Retain multiple feasible arrival positions per villa until network selection rather than permanently taking the first feasible position. Keep the current angled access and ground-following slope checks.
3. Sample candidate junction stations along connected road segments and at row-lane ends/open gaps. Refine around promising stations. Exclude stations inside configurable entrance-clearance zones and penalize those close to them. Clearance should account for the full junction footprint, not just centre-point distance. Distances are project settings to calibrate, not invented regulatory minima.
4. Route an unserved villa or row component to eligible network stations. A multi-source search can avoid running a separate search for every station. Source costs may include the existing travel distance from the site entrance, so zero construction cost on old roads does not reward unlimited driving detours.
5. Score added road length/area, bends, extra junctions, proximity to entrances and travel detour. Keep slope, site and active-building clearance as hard constraints. Prefer an uncomplicated T or Y where space and terrain support it; do not enforce textbook Steiner angles on sloping terrain. Exact preferred angles and turning dimensions require a separate design brief.
6. When a connection joins a road interior, split that road edge at the actual junction, sharing one coordinate and elevation. Preserve villa access membership and recompute route connectivity. Geometry crossings or overlapping buffers alone must not imply a connection.
7. After growth, merge close compatible junctions, shift branches along the host road away from entrances and remove redundant spurs. Accept an improvement only after full revalidation. Compare several deterministic connection orders to reduce early greedy-choice bias.

## Scope and validation

First implement explicit junction nodes, interior road attachment and entrance-clearance scoring. Reuse the current router and terrain surface. Then add junction relocation/merging and order comparison. Defer a full network optimizer, grading optimization and vehicle-turn geometry until the basic topology is correct.

Update graph construction, independent validation, exported node types, edge splitting, per-villa route tracing and junction display together. Otherwise a visually joined road may still be disconnected in the exported graph. Revalidate width and grade after any local movement or curve fitting; retain the default 8% limit and allow crossing ghost footprints.

Regression cases: a third villa joins midway along an existing lane; a junction moves away from a rear entrance while the shared lane remains; a nearby blocked or steep candidate is rejected; edge splitting preserves connectivity and measured total length; crossing roads remain unconnected unless a valid junction is created; impossible entrance clearance is explicitly reported rather than silently relaxed. Compare connectivity, unique road area/length, branch count, junction-to-entrance clearance, maximum grade and travel detour on all supplied layouts. Never reduce villa service count just to improve appearance without reporting it.

The immediate expected change is a shared road continuing past a villa before branching in an open gap. A specific location near V036 or V070 must be found and checked by the revised solver; the research does not prove that particular junction feasible.
