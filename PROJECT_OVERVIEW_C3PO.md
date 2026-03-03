# PreBIM project overview (C-3PO summary)

## Repos
- `/root/clawd-dev/prebim` (git)
  - remote: `git@github.com:ssil-pos/prebim.git`
  - deploy target: `/var/www/sengvis-playground/prebim`
  - deploy runbook: `RUNBOOK_PREBIM.md`
- `/root/clawd-dev/prebim_admin` (git)
  - remote: `git@github.com:ssil-pos/prebim_admin.git`

## Deployed site layout (nginx)
- public site root: `/var/www/ssil_prebim`
- `/prebim/` is served as static (deployed artifacts)
- `/api/` proxied to node service on `127.0.0.1:3000` (sengvis-api)

## PreBIM app (frontend)
Deployed artifacts live under:
- `/var/www/ssil_prebim/prebim/`
- source/artifacts in repo: `/root/clawd-dev/prebim/public/prebim/`

Key files:
- `public/prebim/index.html` – entry
- `public/prebim/app.js` – main UI + 3D editor/analysis views (large bundle)
- `public/prebim/engine.js` – modeling/engine helpers
- `public/prebim/ps_view.js` – Plan/Section 2D view built on Three.js
- `public/prebim/steel_data.js` – steel/profile data

Dependencies (runtime, loaded via ESM CDN):
- `three@0.160.0` via `https://esm.sh/...`
- `OrbitControls`
- `BufferGeometryUtils`
- `three-bvh-csg`

## 3D picking/selection implementation (relevant to Edge vs Chrome)
The 3D view uses Three.js `Raycaster` + `pointerdown` on `renderer.domElement`.

- Pointer normalization is computed using `getBoundingClientRect()` and `clientX/clientY`.
- Member selection uses `selectRay.setFromCamera(pointer, camera)` + `intersectObjects(group.children, false)`.
- Selection code (approx. around app.js ~7360+):
  - `renderer.domElement.addEventListener('pointerdown', pick);`
  - clears selection if empty click
  - toggles selection based on `object.userData.memberId`

This approach is generally cross-browser safe (uses `clientX/Y` + bounding rect, not `offsetX/Y`).

### Likely Edge-only failure causes to check
1) Click never reaches canvas (overlay element on top) → `pointerdown` not firing.
2) Edge GPU/WebGL quirk (less likely if render is fine).
3) ESM CDN import blocked (tracking prevention / corporate policy) → view partly initialized.
4) Pointer events disabled by mode flags:
   - `memberPickEnabled` can be turned off in certain edit modes (supports editing etc.).

## Quick debug hooks (suggested)
- Add temporary log in `pick(ev)` to confirm pointer events firing.
- In DevTools: inspect event target, ensure clicks land on canvas.
- Verify `memberPickEnabled === true` when trying to select.
- Confirm Three scene objects have `userData.memberId` set.

