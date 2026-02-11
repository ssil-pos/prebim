# PreBIM‑SteelStructure — User Manual

> Web app for fast steel structure concept modeling and quick frame analysis.
>
> **URL**: https://www.bimarchi-pg.com/prebim/
>
> **Updates not showing?** Open with a cache‑buster:
> `https://www.bimarchi-pg.com/prebim/?v=<timestamp>#/editor/<projectId>`

---

# Part A — Model Edit (Editor)

## A1) Projects
- **New project**: creates a project in this browser’s localStorage.
- **Open**: opens the Editor.
- **Export**: downloads a JSON snapshot.
- **Delete**: removes the project from localStorage.
- **Import project (.json)**: restores an exported snapshot.

## A2) Editor Layout
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

## A8) Boxes / Member Mode (free members)
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

## A9) Free Edit (Plan/Section)
- (If enabled in your build) Free Edit can add nodes/members in 2D plan.
- All edits are stored in `model.free`.

## A10) Quantities
- Toggle from top bar.
- Table shows per‑category:
  - total length (m)
  - count
  - unit weight (kg/m)
  - estimated weight (kg, t)
- **Copy Excel**: copies TSV to clipboard.

## A11) Exports
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

## B2) Analysis layout
- **Results (left)**: run status + results
- **3D View (center)**: deformed shape, selections, markers
- **Settings (right)**:
  - Supports
  - Connections
  - Point loads
  - Criteria
  - View

## B3) Supports
### Support type
- **PINNED**: translational fixed, rotational released
- **FIXED**: translational + rotational fixed

### Supports (node ids)
- Input comma-separated node ids (e.g. `1,2,3`).

### Edit supports
- Enable **Edit supports** → click base nodes in 3D to toggle supports.

### Rigid diaphragm per level
- When enabled, ties nodes per floor in X/Z (stability helper for braced frames).

## B4) Connections (end releases)
- Select members in 3D.
- Set end conditions **PIN/FIXED** for i-end and j-end.

Notes:
- PIN releases bending rotations about local y/z (torsion about x is kept to reduce mechanisms).

## B5) Loads
### Dead load case (D)
- Self weight is sent as a PyNite **member self‑weight** factor on global Y.

### Live load (L) and snow load (S) as member UDL (Story 1)
Currently, the MVP distributes **area loads** to Story 1 beams/sub‑beams as **uniform line loads**.

Inputs:
- **Live load qL (kN/m²)**
- **Snow load qS (kN/m²)**

Distribution rule (Story 1 only):
- For each beam/sub‑beam at Story 1, compute tributary width `trib (m)`
- Convert to uniform line load:
  - `wL (kN/m) = qL (kN/m²) × trib (m)`
  - `wS (kN/m) = qS (kN/m²) × trib (m)`
- Applied in global Y:
  - `w = -wL` and `w = -wS`

Tributary width:
- BeamX: half of adjacent Y spans around the beam’s grid line
- BeamY: half of adjacent X spans around the beam’s grid line
- Sub‑beams: bay width divided by `(subCount + 1)`

### Wind / Seismic (KDS helper popups + base shear input)
The Analysis UI supports either:
- **Direct input** of base shear (kN) in X/Z, or
- **KDS helper popups** that compute base shear and story forces, and auto-fill the Analysis fields.

#### How wind / seismic forces are applied in analysis
When you click **Apply** (or Auto‑apply is enabled), the app stores:
- base shear values: `windX, windZ, eqX, eqZ` (kN)
- optional story force arrays: `windStoryX/Z`, `eqStoryX/Z` (kN per story)

During payload build:
- If a **story force array** exists (non‑zero), the app uses it and distributes each story force to nodes at that story.
- Otherwise it distributes the **base shear** to the **top nodes**.

#### Wind (KDS 41 12 00) — implementation in this MVP
The popup is documented as “official (MVP)”, but note: some parts are **simplified / calibrated** (see Limitations).

**Core equations used** (as implemented):
- Altitude distribution at mean roof height:
  - `KHr = KzrAt(exposure, H)`
  - `KzrAt(exp,z) = max(1.0, (z/10)^alpha)`
    - `alpha = 0.22 (B), 0.15 (C), 0.11 (D)`
- Design wind speed at height H:
  - `VH = Vo · Kd · KHr · Kzt · Iw`
- Velocity pressure at height H:
  - `qH = (0.5 · ρ · VH²) / 1000`  (kN/m²)

**Pressure to force (per story)**
- Enclosed structure mode:
  - `Pf = kz · qH · GD · (Cpe1 − Cpe2)`  (kN/m²)
  - In this mode, the UI uses a single `kz` input (`wKz`) for all stories.
- Open structure mode (pipe rack / open frame):
  - Story‑dependent `kz(z) = z/H` where `z` is the story top elevation.
  - `Pf_story = kz_story · qH · GD · CD`  (kN/m²)
  - Optional **Auto‑estimate CD** (heuristic):
    - Computes member projected area / gross area (`φ`) in each wind direction,
    - Maps `φ → CD` with a non‑code heuristic (starting point only).

**Story force** (computed per direction separately):
- `F_story = Pf_story · Breadth · storyHeight`  (kN)
  - Breadth is the projected building size:
    - Wind‑X uses Z‑dimension (`Bx = maxZ − minZ`)
    - Wind‑Z uses X‑dimension (`Bz = maxX − minX`)

**Base shear**:
- `V_base = Σ F_story`  (kN)

#### Seismic (KDS 41 17 00 ELF) — implementation in this MVP
The popup computes ELF base shear and story distribution:

**Period**
- Effective height: `hn = model height (m)`
- `T = Ct · hn^x`

**Design spectra** (as implemented):
- `SDS = S · 2.5 · Fa · (2/3)`
- `SD1 = S · Fv · (2/3)`

**Seismic coefficient Cs**
- `RdivIe = R / Ie`
- `cs_raw = SDS / RdivIe`
- `cs_max = SD1 / (RdivIe · T)`
- `cs_min = max(0.01, 0.044 · SDS · Ie)`
- `Cs = clamp(cs_raw, cs_min, cs_max)` (if `cs_max>0`; otherwise `Cs=max(cs_raw,cs_min)`)

**Base shear**
- `V = Cs · W`  (kN)

**Effective seismic weight W (default estimate)**
The popup auto‑estimates a starting `W`:
- Steel selfweight from Quantities (kg → kN)
- plus `0.25 · Live load` over plan area, for each story:
  - `W_live ≈ A_plan · storyCount · qL · 0.25`

You can override `W` and also manually edit the **story weights wi** list.

**Story force distribution**
- Story heights to each level: `hi` (m)
- User exponent: `k`
- Normalize `wi` to sum to `W`
- `Fi = (wi · hi^k / Σ(wj · hj^k)) · V`

The current UI applies the same `Fi` array to both X and Z directions (EQX/EQZ).

#### Limitations / assumptions (important)
- Wind `KzrAt` is a simplified formula calibrated to match a sample workflow (not a full table implementation).
- Open‑structure `CD` auto‑estimate is **heuristic**.
- Seismic `W` is only an estimate; for real design, `W` should be built from code-defined components.
- Story distribution uses model levels and inferred plan dimensions; unusual geometry may need manual adjustment.

### Point loads (concentrated loads)
- Open **Point loads** panel → point load mode starts.
- 3D nodes are highlighted as ~600mm spheres.
- Hover → red; click → adds a point load.

Inputs (kN):
- Fx, Fy, Fz

Behavior:
- Clicking a node creates a new load **P#** with the current Fx/Fy/Fz.
- A red arrow is shown above the node pointing down to the node, with a P# tag.

Editing:
- Select a load in the list → **Update selected** changes Fx/Fy/Fz
- **Delete selected** removes it
- **Clear all** removes all

Important:
- Point loads are currently applied to **Dead load case (D)** as nodal loads:
  - Fx → GX, Fy → GY, Fz → GZ

## B6) Member sections used in analysis
Sections are derived from:
1) Member’s own stored `profile` (e.g. created in Member mode)
2) Override profile (Override panel)
3) Global default profiles (Profiles panel)

## B7) What PyNite solves (MVP)
- 3D frame analysis using beam elements (and truss behavior for bracing members when flagged)
- Node displacements (DX/DY/DZ)
- Member end forces (Fx/Fy/Fz/Mx/My/Mz)
- Sampled max abs member results (N, Vy, Vz, T, My, Mz)

Stability notes:
- Mechanisms can occur with many pinned connections.
- The API has an optional stabilization approach (springs) to survive rank-deficient cases.

## B8) Load combinations (combo generation logic)
Combos are generated inside `buildAnalysisPayload()` and depend on:
- Design method: **STRENGTH** or **ASD**
- Which load cases exist (Snow present? Wind/Seismic non-zero?)

### Load cases used
The app maps to these case names:
- `D` (Dead): self-weight + point loads
- `L` (Live): story‑1 UDL from qL
- `S` (Snow): story‑1 UDL from qS (only if qS>0)
- `WX/WZ` (Wind X/Z): base shear or story forces
- `EQX/EQZ` (Seismic X/Z): base shear or story forces

### Strength (KDS factors) — as implemented
Always:
- `D`: `{ D: 1.4 }`
- `D+L`: `{ D: 1.2, L: 1.0 }`

If Snow exists:
- `D+L+S`: `{ D: 1.2, L: 1.0, S: 1.6 }`

If Wind exists:
- `D+WX`: `{ D: 0.9, WX: 1.0 }`
- `D+WZ`: `{ D: 0.9, WZ: 1.0 }`

If Seismic exists:
- `D+EQX`: `{ D: 0.9, EQX: 1.0 }`
- `D+EQZ`: `{ D: 0.9, EQZ: 1.0 }`

If Snow and Wind exist:
- `D+L+WX+S`: `{ D: 1.2, L: 1.6, WX: 1.0, S: 0.5 }`
- `D+L+WZ+S`: `{ D: 1.2, L: 1.6, WZ: 1.0, S: 0.5 }`

### ASD (KDS factors) — as implemented
Always:
- `D`: `{ D: 1.0 }`
- `D+L`: `{ D: 1.0, L: 0.75 }`

If Snow exists:
- `D+S`: `{ D: 1.0, S: 0.75 }`
- `D+L+S`: `{ D: 1.0, L: 0.75, S: 0.75 }`

If Wind exists:
- `D+WX`: `{ D: 0.6, WX: 0.45 }`
- `D+WZ`: `{ D: 0.6, WZ: 0.45 }`

If Seismic exists:
- `D+EQX`: `{ D: 0.6, EQX: 0.7 }`
- `D+EQZ`: `{ D: 0.6, EQZ: 0.7 }`

### Notes / limitations
- These combos are **hard-coded** to match an internal sample PDF workflow (simplified mapping).
- EQZ/WZ combos appear only when the Z-direction loads are non-zero (or story arrays exist).
- If the user chooses a single combo (comboMode ≠ ENVELOPE), the payload is reduced to that combo.

## B9) Known limitations (current)
- Live/snow UDL distribution currently targets **Story 1** beams/sub‑beams only.
- KDS helpers are MVP-level and include simplifications (see above).
- Results are for rapid concept verification; final design verification should use full-detail modeling and code checks.

---

# Troubleshooting

## Updates not showing
Use cache-buster:
- `.../prebim/?v=20260211-xxxx#/editor/<id>`

Or:
- hard refresh
- incognito

## Member/Box edits not reflecting
- Close and reopen the tool panel (forces target rebuild)
- Try a cache-buster reload

---

# Glossary
- **Story**: region between two consecutive levels
- **Bay**: rectangle between adjacent grid lines
- **Tributary width**: assigned floor width that a beam carries
