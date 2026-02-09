/* prebim engine (MVP)
 * Generates a simple steel frame + optional sub-beams/joists/bracing.
 * Units: mm in state, converted to meters for rendering.
 */

export const mmToM = (mm) => (mm || 0) / 1000;

export function defaultModel(){
  return {
    v: 1,
    grid: {
      nx: 4,
      ny: 3,
      spacingXmm: 6000,
      spacingYmm: 6000,
    },
    levels: [0, 6000], // elevations in mm
    options: {
      subBeams: { enabled: true, countPerBay: 2 },
      joists: { enabled: true },
      bracing: { enabled: true, type: 'X' },
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
  out.grid.nx = Math.max(1, parseInt(out.grid.nx,10)||1);
  out.grid.ny = Math.max(1, parseInt(out.grid.ny,10)||1);
  out.grid.spacingXmm = Math.max(1, parseFloat(out.grid.spacingXmm)||1);
  out.grid.spacingYmm = Math.max(1, parseFloat(out.grid.spacingYmm)||1);
  out.levels = out.levels.map(x => Math.max(0, parseFloat(x)||0)).sort((a,b)=>a-b);
  if(out.levels.length < 2) out.levels = [0, 6000];
  out.options.subBeams.countPerBay = Math.max(0, parseInt(out.options.subBeams.countPerBay,10)||0);
  out.options.bracing.type = (out.options.bracing.type === 'S') ? 'S' : 'X';
  return out;
}

/**
 * @typedef {{id:string, kind:string, a:[number,number,number], b:[number,number,number]}} Member
 */

export function generateMembers(model){
  const m = normalizeModel(model);
  const nx = m.grid.nx;
  const ny = m.grid.ny;
  const sx = mmToM(m.grid.spacingXmm);
  const sy = mmToM(m.grid.spacingYmm);
  const levelsM = m.levels.map(mmToM);

  const members = /** @type {Member[]} */([]);

  const nodeId = (ix,iy,iz) => `${ix},${iy},${iz}`;
  const pos = (ix,iy,iz) => [ix*sx, levelsM[iz], iy*sy];

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
            const y = (iy+t)*sy;
            const a = [ix*sx, levelsM[iz], y];
            const b = [(ix+1)*sx, levelsM[iz], y];
            members.push({ id:`sub:${ix},${iy},${iz},${k}`, kind:'subBeam', a, b });
          }
        }
      }
    }

    // joists (very rough): lines parallel to Y at mid-span between X grids
    if(m.options.joists.enabled){
      for(let ix=0; ix<nx-1; ix++){
        for(let iy=0; iy<ny-1; iy++){
          const x = (ix+0.5)*sx;
          const a = [x, levelsM[iz], iy*sy];
          const b = [x, levelsM[iz], (iy+1)*sy];
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
    // brace on Y=0 face along X bays
    for(let ix=0; ix<nx-1; ix++){
      const a = [ix*sx, z0, 0];
      const b = [(ix+1)*sx, z1, 0];
      const c = [(ix+1)*sx, z0, 0];
      const d = [ix*sx, z1, 0];
      if(m.options.bracing.type === 'S'){
        members.push({ id:`braceS:${ix},0`, kind:'brace', a, b });
      } else {
        members.push({ id:`braceX1:${ix},0`, kind:'brace', a, b });
        members.push({ id:`braceX2:${ix},0`, kind:'brace', a: c, b: d });
      }
    }
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
