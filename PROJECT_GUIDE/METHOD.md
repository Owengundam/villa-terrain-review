# How we place villas on the hillside

Beijing Grasse Town. Written for architects and landscape designers.  
Last updated 21 September 2026.

This is a **planning method**, not a construction set. It does not replace a surveyed grading plan, roads, or services.

Technical notes live in [decisions and handoff](DECISIONS_AND_HANDOFF.md) and [maintained tools](../SCRIPTS.md).

---

## 1. The idea in one page

Place 11 × 23 m villas on the real hillside so that:

- each house looks **downhill**
- the long side sits **square to the local contour** (not to one site-wide angle)
- neighbours keep a usable gap
- the view in front of the house stays reasonably open
- pad heights stay close to the ground

Work in this order, one thing at a time:

**Calm the contour drawing → place houses in rows → face downhill and square to the slope → check views and pad heights → clean leftover spacing → only then grade the ground to the pads.**

Two drawings of the same hill are kept apart on purpose:

| | What it is | What it is for |
|---|---|---|
| **Real ground** | The accepted contours and height labels | Pad levels, cut/fill, which end of the house is downhill |
| **Placement drawing** | The same contours with small wiggles calmed | Where rows run and which way a house prefers to face |

Calming the lines never changes labelled heights, never moves pads, and never edits the Rhino model by itself.

---

## 2. Agreed house rules

These are study rules, not statutory ones.

| Topic | Rule |
|---|---|
| Villa | 11 m wide × 23 m deep (view is the 23 m direction) |
| Orientation | Long axis square to the nearest contour; view faces downhill |
| Side gap | About 3 m |
| Rear strip | Default 7 m behind the back wall — another house should not sit in it |
| View | Middle ±15° from the front; at least 70% of that fan stays open |
| Lower neighbour | A house 5.25 m lower does not count as a view blocker |
| Pads | Stay close to the local ground (about ±1.5 m when fitting views) |
| Site | All footprints inside the boundary; no overlapping houses |

---

## 3. Implementation method (what the tools actually do)

### 3.1 Read the hillside

Contours and height labels come from the live Rhino site. Heights between lines are **inferred**, not surveyed. The site boundary is taken as drawn.

### 3.2 Optionally calm the contours

**Terrain response scale** thins each contour and rounds sharp corners. Stronger settings calm more of the drawing. Use this so rows follow the broad hillside instead of every kink in a traced line.

Reset terrain response scale only removes that calming. It does not undo a contour you dragged by hand. **Restore saved plan** is the separate “go back to the shipped study” action.

### 3.3 Place houses (Populate)

Rows walk across the site, one row-pitch apart, following the **calmed** contours. Houses sit along each row at a pitch taken from villa width + side gap. Conflicts are repaired in cheap order: slide along the row, shift across it, re-aim a little, then loosen the rest of the row.

Several complete alternatives are compared. The winner is the one that stays legal, then keeps more houses, then wastes less space. Anything still illegal is removed and reported.

This step checks geometry only. It does **not** turn houses off for views.

### 3.4 Face downhill and sit square (Planar fitting)

Each house is judged against the **real** contours you see labelled on plan:

- if it points uphill, it is turned 180°
- if the long axis is more than about 15° off the local contour, it is rotated onto that contour
- it then slides just enough to restore the 3 m gap and stay inside the site

Houses that cannot be made legal are ghosted (drawn dashed, left out of later checks).

### 3.5 Protect the view (3D view fitting)

From the front of each active house, the tool looks through the ±15° window. Pads may move a little; houses that still block the view can be ghosted. This does not redraw the layout from scratch.

### 3.6 Spacing after views (not finished as one button)

A later spacing pass exists from an earlier study. It is **not** yet wired to keep the views already accepted. Do not run it as a blind cleanup on a view-checked plan.

### 3.7 Sit the pads on the ground (not done)

Final slopes, pad contact, and buildable cut/fill are still a designer/Rhino step.

---

## 4. What has been done

- Live hillside contours and a ~40,000 m² boundary
- Agreed rules above (narrow front view, local downhill, 3 m sides)
- Two ways to start a plan:
  - **from the hill** — rows generated on the contours
  - **from painted studies** — free / parallel / staggered images fitted to 11 × 23 m rectangles (registration is approximate)
- A review viewer: edit contours, calm them, populate, planar fit, 3D view fit
- A Rhino plugin for spacing / pad checks on a live model
- Dated check reports for earlier options (A / G / I and later villa-only studies)

What we have **not** claimed: a maximum villa count, a surveyed terrain, or a finished grade.

---

## 5. What to improve

- Heights between contours are only as good as the labels
- Auto-placement can still leave odd gaps or slightly crooked rows
- The calmed drawing and the real ground can disagree on “which way is downhill” — the method keeps real ground as the judge, but the mismatch should be visible
- View work and spacing work are still two steps
- The live Rhino file may be ahead of the last saved “official” model (`resort planning.3dm`, 11 September 2026, 18:29)

---

## 6. What to do next

1. **Lock the site** — save the latest Rhino file as a dated copy. One drawing is the truth.
2. **Designer check of smoothing** — slider off / mid / strong: do the contours stay readable, and do houses still follow the hill?
3. **One complete pass** on the preferred option, in the order in section 1.
4. **Review as a plan**, not as a score: how many villas, which must stay, which views matter, access and privacy.
5. **Then** grade pads to ground, then roads and services, then a clean option set for the client.

---

## 7. Open choices

- Live option: terrain-generated rows, or one of the painted studies?
- Is ±15° / 70% still the right view test for this low hill?
- How many villas is enough vs too tight?
- Finish in the viewer, or freeze a plan and complete in Rhino?

---

## Where to look

| Need | Place |
|---|---|
| This method | This page |
| Last Rhino model | `output/resort planning.3dm` |
| Review the plan in a browser | `output/checks/image-flow-3d-20260915/index.html` |
| Why a rule changed | [DECISIONS_AND_HANDOFF.md](DECISIONS_AND_HANDOFF.md) |
| How to run a script | [SCRIPTS.md](../SCRIPTS.md) |
| Experiment history | [EXPERIMENTS.md](EXPERIMENTS.md) |
