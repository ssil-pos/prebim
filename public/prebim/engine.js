/* prebim engine (MVP)
 * Generates a simple steel frame + optional sub-beams/joists/bracing.
 * Units: mm in state, converted to meters for rendering.
 */

export const mmToM = (mm) => (mm || 0) / 1000;

export function defaultModel(){
  return {
    v: 1,
    grid: {
      // Reference UI supports both base spacing and custom spans.
      nx: 4,
      ny: 3,
      spacingXmm: 6000,
      spacingYmm: 6000,
      spansXmm: [],
      spansYmm: [],
    },
    levels: [0, 6000], // elevations in mm (absolute)
    options: {
      subBeams: { enabled: true, countPerBay: 2 },
      joists: { enabled: true },
      bracing: { enabled: true, type: 'X', face: 'Y0' },
    },
    profiles: {
      stdAll: 'KS',
      colShape: 'H', colSize: '',
      beamShape: 'H', beamSize: '',
      subShape: 'H', subSize: '',
      braceShape: 'L', braceSize: '',
    }
  };
}

export function normalizeModel(m){
  const d = defaultModel();
  const out = structuredClone(d);
  if(m && typeof m === 'object'){
    Object.assign(out.grid, m.grid||{});
    if(Array.isArray(m.levels) && m.levels.length) out.levels = m.levels.slice();
    if(m.options) out.options = { ...out.options, ...m.options };
    if(m.options?.subBeams) out.options.subBeams = { ...out.options.subBeams, ...m.options.subBeams };
    if(m.options?.joists) out.options.joists = { ...out.options.joists, ...m.options.joists };
    if(m.options?.bracing) out.options.bracing = { ...out.options.bracing, ...m.options.bracing };
  }
  // grid base
  out.grid.nx = Math.max(1, parseInt(out.grid.nx,10) || d.grid.nx);
  out.grid.ny = Math.max(1, parseInt(out.grid.ny,10) || d.grid.ny);
  out.grid.spacingXmm = Math.max(1, parseFloat(out.grid.spacingXmm) || d.grid.spacingXmm);
  out.grid.spacingYmm = Math.max(1, parseFloat(out.grid.spacingYmm) || d.grid.spacingYmm);

  // spans (mm). If provided, they override nx/ny+spacing.
  const toNumArr = (v) => {
    if(!Array.isArray(v)) return [];
    return v.map(x => Math.max(1, parseFloat(x)||0)).filter(Boolean);
  };

  const sx = toNumArr(out.grid.spansXmm);
  const sy = toNumArr(out.grid.spansYmm);

  out.grid.spansXmm = sx.length ? sx : Array.from({length: Math.max(1,out.grid.nx-1)}, () => out.grid.spacingXmm);
  out.grid.spansYmm = sy.length ? sy : Array.from({length: Math.max(1,out.grid.ny-1)}, () => out.grid.spacingYmm);

  // when custom spans present, derive nx/ny
  out.grid.nx = out.grid.spansXmm.length + 1;
  out.grid.ny = out.grid.spansYmm.length + 1;
  out.levels = out.levels.map(x => Math.max(0, parseFloat(x)||0)).sort((a,b)=>a-b);
  if(out.levels.length < 2) out.levels = [0, 6000];
  out.options.subBeams.countPerBay = Math.max(0, parseInt(out.options.subBeams.countPerBay,10)||0);
  out.options.bracing.type = (out.options.bracing.type === 'S') ? 'S' : 'X';
  out.options.bracing.face = ['Y0','Y1','X0','X1'].includes(out.options.bracing.face) ? out.options.bracing.face : 'Y0';
  return out;
}

/**
 * @typedef {{id:string, kind:string, a:[number,number,number], b:[number,number,number]}} Member
 */

export function generateMembers(model){
  const m = normalizeModel(model);
  const spansX = (m.grid.spansXmm && m.grid.spansXmm.length) ? m.grid.spansXmm : Array.from({length: Math.max(1,(m.grid.nx||2)-1)}, () => m.grid.spacingXmm||6000);
  const spansY = (m.grid.spansYmm && m.grid.spansYmm.length) ? m.grid.spansYmm : Array.from({length: Math.max(1,(m.grid.ny||2)-1)}, () => m.grid.spacingYmm||6000);

  const xs = [0];
  const ys = [0];
  for(const s of spansX) xs.push(xs[xs.length-1] + mmToM(s));
  for(const s of spansY) ys.push(ys[ys.length-1] + mmToM(s));

  const nx = xs.length;
  const ny = ys.length;
  const levelsM = m.levels.map(mmToM);

  const members = /** @type {Member[]} */([]);

  const nodeId = (ix,iy,iz) => `${ix},${iy},${iz}`;
  const pos = (ix,iy,iz) => [xs[ix], levelsM[iz], ys[iy]];

  // columns
  for(let iz=0; iz<levelsM.length-1; iz++){
    for(let ix=0; ix<nx; ix++){
      for(let iy=0; iy<ny; iy++){
        members.push({
          id: `col:${nodeId(ix,iy,iz)}:${nodeId(ix,iy,iz+1)}`,
          kind:'column',
          a: pos(ix,iy,iz),
          b: pos(ix,iy,iz+1),
        });
      }
    }
  }

  // beams per level
  for(let iz=1; iz<levelsM.length; iz++){
    // X direction beams (along x)
    for(let iy=0; iy<ny; iy++){
      for(let ix=0; ix<nx-1; ix++){
        members.push({
          id: `bx:${nodeId(ix,iy,iz)}:${nodeId(ix+1,iy,iz)}`,
          kind:'beamX',
          a: pos(ix,iy,iz),
          b: pos(ix+1,iy,iz),
        });
      }
    }
    // Y direction beams (along y)
    for(let ix=0; ix<nx; ix++){
      for(let iy=0; iy<ny-1; iy++){
        members.push({
          id: `by:${nodeId(ix,iy,iz)}:${nodeId(ix,iy+1,iz)}`,
          kind:'beamY',
          a: pos(ix,iy,iz),
          b: pos(ix,iy+1,iz),
        });
      }
    }

    // sub-beams inside each bay (parallel to X, subdividing Y) - simplistic
    if(m.options.subBeams.enabled && m.options.subBeams.countPerBay>0){
      const c = m.options.subBeams.countPerBay;
      for(let ix=0; ix<nx-1; ix++){
        for(let iy=0; iy<ny-1; iy++){
          for(let k=1;k<=c;k++){
            const t = k/(c+1);
            const y = ys[iy] + (ys[iy+1]-ys[iy]) * t;
            const a = [xs[ix], levelsM[iz], y];
            const b = [xs[ix+1], levelsM[iz], y];
            members.push({ id:`sub:${ix},${iy},${iz},${k}`, kind:'subBeam', a, b });
          }
        }
      }
    }

    // joists (very rough): lines parallel to Y at mid-span between X grids
    if(m.options.joists.enabled){
      for(let ix=0; ix<nx-1; ix++){
        for(let iy=0; iy<ny-1; iy++){
          const x = xs[ix] + (xs[ix+1]-xs[ix]) * 0.5;
          const a = [x, levelsM[iz], ys[iy]];
          const b = [x, levelsM[iz], ys[iy+1]];
          members.push({ id:`joist:${ix},${iy},${iz}`, kind:'joist', a, b });
        }
      }
    }
  }

  // bracing (on side faces, simplest: one X per bay on first story)
  if(m.options.bracing.enabled){
    const iz = 0;
    const z0 = levelsM[iz];
    const z1 = levelsM[iz+1] ?? (z0 + 6);
    // brace on selected outer face (first story)
    const face = m.options.bracing.face || 'Y0';
    const zFace0 = z0;
    const zFace1 = z1;

    const addXBrace = (a,b,c,d, key) => {
      if(m.options.bracing.type === 'S'){
        members.push({ id:`braceS:${key}`, kind:'brace', a, b });
      } else {
        members.push({ id:`braceX1:${key}`, kind:'brace', a, b });
        members.push({ id:`braceX2:${key}`, kind:'brace', a: c, b: d });
      }
    };

    if(face === 'Y0' || face === 'Y1'){
      const y = (face === 'Y0') ? ys[0] : ys[ny-1];
      for(let ix=0; ix<nx-1; ix++){
        const a = [xs[ix], zFace0, y];
        const b = [xs[ix+1], zFace1, y];
        const c = [xs[ix+1], zFace0, y];
        const d = [xs[ix], zFace1, y];
        addXBrace(a,b,c,d, `${face}:${ix}`);
      }
    }

    if(face === 'X0' || face === 'X1'){
      const x = (face === 'X0') ? xs[0] : xs[nx-1];
      for(let iy=0; iy<ny-1; iy++){
        const a = [x, zFace0, ys[iy]];
        const b = [x, zFace1, ys[iy+1]];
        const c = [x, zFace0, ys[iy+1]];
        const d = [x, zFace1, ys[iy]];
        addXBrace(a,b,c,d, `${face}:${iy}`);
      }
    }

    // (old bracing block removed)
  }

  return members;
}

export function quantities(members){
  const sum = {};
  let totalLen = 0;
  for(const mem of members){
    const dx = mem.a[0]-mem.b[0];
    const dy = mem.a[1]-mem.b[1];
    const dz = mem.a[2]-mem.b[2];
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
    totalLen += len;
    sum[mem.kind] = (sum[mem.kind]||0) + len;
  }
  return { byKind: sum, totalLen };
}
