# PreBIM‑SteelStructure — User Manual (MVP)

> Fast steel structure concept modeling + quick frame analysis (PyNite) in the browser.
>
> **Web app**: https://www.bimarchi-pg.com/prebim/
>
> Updates not showing? Use a cache‑buster:
> `https://www.bimarchi-pg.com/prebim/?v=<timestamp>#/editor/<projectId>`

---

## Table of contents
- [Part A — Model Edit (Editor)](#part-a--model-edit-editor)
  - [A1) Projects](#a1-projects)
  - [A2) Editor layout](#a2-editor-layout)
  - [A3) Grid](#a3-grid)
  - [A4) Levels](#a4-levels)
  - [A5) Options](#a5-options)
  - [A6) Profiles](#a6-profiles)
  - [A7) Override (per‑member profile)](#a7-override-permember-profile)
  - [A8) Boxes / Member mode (free members)](#a8-boxes--member-mode-free-members)
  - [A9) Quantities](#a9-quantities)
  - [A10) Exports](#a10-exports)
- [Part B — Structural Calculation (Analysis)](#part-b--structural-calculation-analysis)
  - [B1) Overview](#b1-overview)
  - [B2) Supports](#b2-supports)
  - [B3) Connections](#b3-connections)
  - [B4) Loads](#b4-loads)
  - [B5) Wind (KDS) helper — equations/assumptions](#b5-wind-kds-helper--equationsassumptions)
  - [B6) Seismic (KDS ELF) helper — equations/assumptions](#b6-seismic-kds-elf-helper--equationsassumptions)
  - [B7) Load combinations (combo generation)](#b7-load-combinations-combo-generation)
  - [B8) Known limitations](#b8-known-limitations)
- [Screenshots / images](#screenshots--images)

---

# Part A — Model Edit (Editor)

## A1) Projects
- **New project**: creates a project in this browser’s localStorage.
- **Open**: opens the Editor.
- **Export**: downloads a JSON snapshot.
- **Delete**: removes the project from localStorage.
- **Import project (.json)**: restores an exported snapshot.

## A2) Editor layout
- **Tools (left)**: grid/levels/options/profiles.
- **3D View (center)**: interactive frame.
- **Quantities (bottom)**: weight/length summary (toggle from top bar).

Resizable splitters:
- Vertical splitters: pane widths
- Horizontal splitter: quantities height (when open)

## A3) Grid
- **X spans (mm, comma separated)**, e.g. `6000,6000,8000`
- **Y spans (mm, comma separated)**, e.g. `6000,6000`

Rule:
- `grid count = spans + 1`

All changes apply in realtime.

## A4) Levels
- Levels are **absolute elevations** in mm (not story heights).
- **Add level**: appends a new level.
- You can edit level values directly.

All changes apply in realtime.

## A5) Options
### Sub‑beams
- **Enable**: on/off
- **Count / bay**: number of sub‑beams per bay

### Bracing (panel based)
- Open **Bracing** popup from the 3D header.
- When popup is open, you can click panels in 3D to toggle braces.
- Brace types:
  - **X**: cross bracing
  - **/**: single diagonal
  - **ㅅ (HAT)**: chevron
- **Brace profile** is stored per placed brace.

## A6) Profiles
- Standard/profile selectors control default sections for:
  - Columns
  - Beams
  - Sub‑beams
  - Braces

## A7) Override (per‑member profile)
Open **Override** popup (3D header):

- Click members in 3D to select.
- When selection changes, the Override **Shape/Profile menus auto‑sync** to a representative selected member (first in selection):
  - If that member already has an override → show that override
  - Otherwise → show the default profile for that member kind
- Editing Shape/Profile applies to **all selected** members.

Buttons:
- **Clear**: clears selection
- **Reset**: deletes all overrides (confirmation)

## A8) Boxes / Member mode (free members)
This tool lets you add **extra members** by clicking edges/diagonals of boxes (useful for secondary framing, braces, posts).

### Member mode
- Switch tool to **Members**.
- Click an edge/diagonal in 3D to create a free member.
- Duplicate prevention: if the same segment already exists (i‑j or j‑i) it is ignored and a short message is shown.

### Profile at creation
- The **member‑mode profile selection** is stored on each created member.
- That stored profile is used in **Quantities and Analysis** (column/beam/brace all supported).

### Delete mode
- Enable **Delete** mode.
- Click boxes/members to add them to the delete list.
- Apply delete to remove.

## A9) Quantities
- Toggle from top bar.
- Table shows per‑category:
  - total length (m)
  - count
  - unit weight (kg/m)
  - estimated weight (kg, t)
- **Copy Excel**: copies TSV to clipboard.

## A10) Exports
Top bar → Export menu:
- **DATA**: JSON bundle (project + engineModel)
- **STAAD (MVP)**: geometry only (joints/members)
- **DXF (MVP)**: plan + auto dimensions
- **IFC**: placeholder IFC header

---

# Part B — Structural Calculation (Analysis)

## B1) Overview
The Analysis page builds a 3D frame model from the current Editor model and solves it using a minimal analysis service.

- Solver library: **PyNite** (`Pynite.FEModel3D`)
- API endpoint (when deployed behind nginx):
  - `POST /prebim/api/analyze`

Analysis layout:
- **Results (left)**: run status + results
- **3D View (center)**: deformed shape, selections, markers
- **Settings (right)**: Supports / Connections / Point loads / Criteria / View

## B2) Supports
- Support type:
  - **PINNED**: translational fixed, rotational released
  - **FIXED**: translational + rotational fixed
- **Supports (node ids)**: comma-separated ids (e.g. `1,2,3`)
- **Edit supports**: click base nodes in 3D to toggle supports
- **Rigid diaphragm per level**: ties nodes per floor in X/Z (stability helper)

## B3) Connections
- Select members in 3D.
- Set end conditions **PIN/FIXED** for i-end and j-end.

Note (as implemented):
- PIN releases bending rotations about local y/z.
- Torsion about local x is kept to reduce mechanisms.

## B4) Loads
### Dead load case (D)
- Self weight is sent as PyNite **member self‑weight** factor on global Y.

### Live (L) / Snow (S) → member UDL (Story 1)
MVP distributes **area loads** to Story‑1 beams/sub‑beams as **uniform line loads**.

Inputs:
- `qL` (kN/m²), `qS` (kN/m²)

Rule (Story 1 only):
- `wL (kN/m) = qL × trib`
- `wS (kN/m) = qS × trib`
- Applied in global Y (downward): `w = -wL`, `w = -wS`

Tributary width (overview):
- BeamX: half of adjacent Y spans around the beam grid line
- BeamY: half of adjacent X spans around the beam grid line
- Sub‑beams: bay width / `(subCount + 1)`

### Point loads (concentrated)
- Open **Point loads** panel → point load mode starts.
- Click node → adds `P#` load using current Fx/Fy/Fz (kN).
- Loads can be updated/deleted from the list.

Current behavior:
- Point loads are applied to **Dead case (D)** as nodal loads:
  - Fx → GX, Fy → GY, Fz → GZ

## B5) Wind (KDS) helper — equations/assumptions
The UI supports direct base shear input, or a KDS helper popup.

**How wind is applied**
- If a story force array exists (non‑zero), the app distributes each story force to nodes at that story.
- Otherwise it distributes the base shear to top nodes.

**Core equations used (as implemented)**
- `KHr = KzrAt(exposure, H)`
- `KzrAt(exp,z) = max(1.0, (z/10)^alpha)`
  - `alpha = 0.22 (B), 0.15 (C), 0.11 (D)`
- `VH = Vo · Kd · KHr · Kzt · Iw`
- `qH = (0.5 · ρ · VH²) / 1000`  (kN/m²)

Enclosed mode:
- `Pf = kz · qH · GD · (Cpe1 − Cpe2)`

Open mode:
- Story `kz(z) = z/H` (story-top elevation)
- `Pf_story = kz_story · qH · GD · CD`
- Optional **Auto‑estimate CD** is heuristic (projected member area / gross area → mapped to CD)

Story force (per direction):
- `F_story = Pf_story · Breadth · storyHeight`
- Breadth is projected plan size:
  - Wind‑X uses Z-dimension
  - Wind‑Z uses X-dimension

Base shear:
- `V_base = Σ F_story`

## B6) Seismic (KDS ELF) helper — equations/assumptions
**Period**
- `T = Ct · hn^x` (hn = model height in m)

**Design spectra (as implemented)**
- `SDS = S · 2.5 · Fa · (2/3)`
- `SD1 = S · Fv · (2/3)`

**Cs (clamped)**
- `cs_raw = SDS / (R/Ie)`
- `cs_max = SD1 / ((R/Ie) · T)`
- `cs_min = max(0.01, 0.044 · SDS · Ie)`
- `Cs = clamp(cs_raw, cs_min, cs_max)` (when `cs_max>0`)

**Base shear**
- `V = Cs · W`

**Default W estimate (starting point)**
- Steel selfweight (from Quantities, kg → kN)
- plus `0.25·L` over plan area for each story

**Story distribution**
- `Fi = (wi·hi^k / Σ(wj·hj^k)) · V`

Note: current UI applies the same Fi array to both X and Z directions.

## B7) Load combinations (combo generation)
Combos are generated inside `buildAnalysisPayload()` and depend on design method and which load cases exist.

Load cases:
- `D, L, S, WX/WZ, EQX/EQZ`

### Strength (as implemented)
- `D`: `{ D: 1.4 }`
- `D+L`: `{ D: 1.2, L: 1.0 }`
- `D+L+S`: `{ D: 1.2, L: 1.0, S: 1.6 }` (if snow)
- `D+WX/WZ`: `{ D: 0.9, W*: 1.0 }` (if wind)
- `D+EQX/EQZ`: `{ D: 0.9, EQ*: 1.0 }` (if seismic)
- `D+L+W*+S`: `{ D: 1.2, L: 1.6, W*: 1.0, S: 0.5 }` (if snow + wind)

### ASD (as implemented)
- `D`: `{ D: 1.0 }`
- `D+L`: `{ D: 1.0, L: 0.75 }`
- `D+S`: `{ D: 1.0, S: 0.75 }` (if snow)
- `D+L+S`: `{ D: 1.0, L: 0.75, S: 0.75 }` (if snow)
- `D+W*`: `{ D: 0.6, W*: 0.45 }` (if wind)
- `D+EQ*`: `{ D: 0.6, EQ*: 0.7 }` (if seismic)

Notes:
- These are hard-coded to match a sample workflow (simplified mapping).
- Z-direction combos appear only when Z loads are non‑zero (or story arrays exist).

## B8) Known limitations
- Live/snow UDL distribution currently targets **Story 1** beams/sub‑beams only.
- KDS helpers include simplifications (especially wind Kzr and open-structure CD).
- Results are for rapid concept checks; final design should use full-detail modeling and code verification.

---

# Screenshots / images
Yes—screenshots can be embedded directly into this manual.

Recommended approach:
1. Put image files into: `docs/manual/images/`
2. Reference them with relative Markdown links:

```md
![Analysis — Point loads panel](docs/manual/images/analysis-point-loads.png)
```

Tips:
- Use short filenames, kebab-case.
- Prefer PNG for UI screenshots.
- Keep width reasonable (~1400–2000px).

> If you want, tell me which features to capture first (Editor/Analysis), and I can add placeholders + captions now, then we just drop the images into the folder.
