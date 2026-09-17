# Image-flow geometry reconstruction

Geometry-only preview: image-derived villa centres can move collectively while neighbour displacement differences are penalized. Footprints are exactly 11 × 23 m, oriented within ±15° of their local contour normal with downhill front terrain. The irregular site boundary, no overlaps and strict directional side clearance are checked independently.

`report.json` records original and adjusted centres, movement distances, final exact footprints, retained source IDs, geometry omissions and verification. Dense arrangements receive a nearby-gap reinsertion pass after collective relaxation. The search is local, not a maximum-count guarantee.

No view-cone analysis, pad fitting or view/elevation-based reduction has been run. These previews do not replace the published, previously reduced review site.

Run `python phase0/reconstruct_flow.py` to reproduce the collective adjustment and nearby-gap recovery. `comparison.png` shows all four options; individual PNGs are named `free.png`, `parallel.png`, `staggered-2.png` and `staggered-3.png`.
