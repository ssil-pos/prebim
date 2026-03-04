# Codes Strategy — KDS (KR) + ASCE7/AISC (US)

Status: **Draft** (strategy + phased scope).

## Goals
- Support two common workflows:
  1) **Korea**: KDS-based loads + KDS-style combinations + (eventually) KDS steel member checks
  2) **US**: ASCE 7 loads + IBC-ish combinations + AISC 360 member checks
- Keep PreBIM as a **concept / early design** tool:
  - Provide *directionally correct* checks and clear reporting
  - Prefer robustness + transparency over full code completeness

## Non-goals (for MVP)
- Full automatic wind/seismic code calculation end-to-end (site class, R-factor, etc.).
- Full member design suite (all limit states, connection design, stability, etc.).
- Jurisdiction-specific exceptions and detailed code commentary.

## Key Decision (confirmed)
- **MVP uses input-based lateral loads**:
  - Users can input base shear / story forces (already supported).
  - Later we can add optional calculators.

## Proposed Architecture
### 1) Code “profile” selector
Add a top-level setting (analysis page):
- `codeProfile = KDS | US`

This profile controls:
- Default load combinations displayed/generated
- Report labels/terms
- (Future) member check equations

### 2) Keep internal load model code-agnostic
Internally we keep the same load cases:
- `D, L, S, WX, WZ, EQX, EQZ, EQUIP, PIPE`

The **code profile** maps code naming + factors to these same cases.

## Phase Plan

### Phase 0 (DONE / Existing)
- Load cases in app: D/L/S/WX/WZ/EQX/EQZ
- Equipment/piping loads (EQUIP/PIPE)
- Basic combo generation (Strength/ASD) + combo picker

### Phase 1 (MVP for codes strategy)
- Add `codeProfile` setting (KDS vs US) used for:
  - Combo list templates
  - Naming/labeling in report
- Keep lateral loads user-provided:
  - base shear or story force arrays

Deliverables:
- UI toggle (KDS/US)
- Updated combo generator:
  - `KDS Strength/ASD` (already close)
  - `US LRFD/ASD` simplified templates

### Phase 2 (Member checks — limited)
- Implement limited steel checks for:
  - Axial (tension/compression) + bending interaction (very simplified)
  - Slenderness/warnings
- Provide “ratio” outputs with explicit disclaimer.

### Phase 3 (Optional calculators)
- Wind/seismic calculators:
  - KDS wind/seismic popup
  - ASCE7 wind/seismic (simplified)

## Combo Templates (concept-level)
### KDS (existing style)
- Strength / ASD combos already encoded.

### US (proposed minimal)
Use common AISC/ASCE-style combos mapped to our cases.
Example (LRFD-ish):
- `1.4D`
- `1.2D + 1.6L`
- `1.2D + 1.0L + 0.5S`
- `0.9D + 1.0W`
- `0.9D + 1.0E`

Notes:
- We will keep WX/WZ and EQX/EQZ as the directional variants.

## Reporting / Transparency
- Every run/report should state:
  - Code profile (KDS/US)
  - Method (Strength/ASD or LRFD/ASD)
  - Which inputs were user-provided vs computed
- When templates are simplified, label them as **Concept combos**.

## Open Questions
- Which exact KDS references to cite (sections) in the PDF report.
- Which US combination set to adopt (ASCE7-16 vs -22 differences).
- Whether to expose US seismic parameters later (Ss/S1, site class, R, Ie).
