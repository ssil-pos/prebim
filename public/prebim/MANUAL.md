# PreBIM‑SteelStructure — User Manual (MVP)

> Web app for fast steel structure concept modeling: grids/levels, members, bracing, quantities, and exports.
>
> **URL**: https://www.bimarchi-pg.com/prebim/
>
> **Note on updates**: If you don’t see a recent change, open with a cache‑buster:
> `https://www.bimarchi-pg.com/prebim/?v=<timestamp>#/editor/<projectId>`

---

## 1) Getting Started

### Open the app
1. Go to `/prebim/`.
2. You’ll see the **Projects** page (local storage).

### Create a new project
1. Enter a name.
2. Click **New project**.

### Open / delete / export a project
- **Open**: opens the editor.
- **Export**: downloads a JSON snapshot of that project.
- **Delete**: removes the project from this browser’s localStorage.

### Import projects
1. Click **Import project (.json)**.
2. Select a previously exported JSON file.

---

## 2) Editor Layout

The editor is a fullscreen layout with:
- **Tools** (left): inputs for grid/levels/options/profiles.
- **3D View** (center): interactive 3D frame.
- **(Plan/Section)**: currently **hidden** (feature kept for later).
- **Quantities**: bottom panel, **collapsed by default**.

Resizable splitters:
- Vertical splitters adjust pane widths.
- Horizontal splitter (when Quantities is open) adjusts Quantities height.

---

## 3) Tools

### 3.1 Grid
- **X spans (mm, comma)**: e.g. `6000,6000,8000`
- **Y spans (mm, comma)**: e.g. `6000,6000`

**How grid count is determined**
- `grid count = spans + 1`

**Realtime**
- Changes apply automatically.

### 3.2 Level
- Levels are **absolute elevations** in mm.
- Use **Add level** to append a new level.
- You can edit level values directly.

**Realtime**
- Changes apply automatically.

### 3.3 Sub‑beam
- **Enable**: turns sub‑beams on/off.
- **Count / bay**: number of sub‑beams in each bay.
- **Shape/Profile**: picks standard/shape/size for sub‑beams.

### 3.4 Profile (common)
- **Standard (all)**: selects steel standard dataset.
- Common shapes/sizes for:
  - **Column**
  - **Beam**
  - **Sub‑beam**

**Note**
- Some members can be overridden individually (see Override).

---

## 4) 3D View

### Navigation
- Drag to rotate (Orbit)
- Wheel to zoom
- Right-drag / trackpad pan to move

### 3D Guide lines (Grid + Levels)
- The 3D view shows:
  - Base grid lines and labels (`X1..`, `Y1..`) offset outside the structure
  - Level outlines and labels (`Lk elevation`) offset outside the structure

### Selection (for Overrides)
- Click a member to select it (only supported for: column/beam/sub‑beam).

---

## 5) Bracing

### Open Bracing
- Click **Bracing** in the 3D header.

### Enable
- Toggle **Enable**.

### Brace type
- **X**: cross bracing
- **/**: single diagonal
- **ㅅ**: chevron bracing

### Panel picking
- When Bracing popup is open, you can click panels in 3D.
- Closing the popup disables panel picking.

### Brace profile
- Choose brace **Shape/Profile**.
- New braces store the selected profile at creation time.

---

## 6) Override (per-member profile)

### Open Override
- Click **Override** in the 3D header.

### Apply override
1. Click a member in 3D to select.
2. Choose override **Shape** and **Profile**.
3. Changes apply immediately.

### Clear / Reset
- **Clear**: clears selection.
- **Reset**: removes all overrides (confirmation required).

---

## 7) Quantities

### Open/close
- Click **Quantities** (top bar) to toggle the panel.
- The panel is **collapsed by default**.

### What is shown
- Quantities table by category:
  - Length (m)
  - Count
  - Unit weight (kg/m)
  - Load (kg and t)
- Total weight is included in the summary.

### Copy to Excel
- In Quantities header: **Copy Excel**
- Copies **TSV** (tab‑separated) to clipboard.
- Paste directly into Excel.

---

## 8) Exports

All export buttons are in the **top bar**.

### 8.1 DATA Export
- Downloads a JSON bundle:
  - engineModel
  - project metadata
  - timestamp

### 8.2 STAAD Export (MVP)
- Downloads `.std` with:
  - JOINT COORDINATES
  - MEMBER INCIDENCES

> Note: This is an MVP geometry export; properties/loads are not fully authored yet.

### 8.3 DXF Export (MVP, auto-dimension)
- Downloads a DXF containing:
  - Plan outer rectangle
  - Auto dimensions (mm numbers only)
    - X chain + overall (outside)
    - Y chain + overall (outside)
  - Level height dimensions (outside)

### 8.4 IFC Export
- Currently outputs a **placeholder** IFC file header.

---

## 9) Known Limitations (current MVP)
- Plan/Section feature is currently **hidden** (kept for later).
- IFC export is a placeholder.
- Local projects are stored in browser localStorage (not cloud synced).

---

## 10) Troubleshooting

### Updates not showing
Use a cache‑buster query before the hash:
- `.../prebim/?v=20260209-xxxx#/editor/<id>`

Or try:
- Incognito window
- DevTools → Network → “Disable cache” → reload

### Performance
- Reduce grid size or bracing panels if interaction becomes heavy.

---

## Appendix: Glossary
- **Story**: the vertical region between two consecutive levels.
- **Bay**: a rectangle between adjacent grid lines.
- **kg/m**: unit weight per meter, sourced from the steel profile dataset.
