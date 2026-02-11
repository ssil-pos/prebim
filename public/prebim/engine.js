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
      joists: { enabled: false },
      bracing: { enabled: true, type: 'X' },
    },
    // explicit braces (panel-based) + per-member overrides
    braces: [],
    overrides: {},
    profiles: {
      stdAll: 'KS',
      colShape: 'H', colSize: '',
      beamShape: 'H', beamSize: '',
      subShape: 'H', subSize: '',
      braceShape: 'L', braceSize: '',
    },
    // user-defined attached volumes (axis-aligned boxes) in mm
    boxes: [],
    // free-form additions (non-grid nodes/members) used by Box Edit, etc.
    free: {
      enabled: false,
      nodes: [],
      members: [],
      lastKind: 'beam',
      nextNodeId: 1,
      nextMemId: 1,
    },
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
    if(Array.isArray(m.braces)) out.braces = m.braces.slice();
    if(m.overrides && typeof m.overrides === 'object') out.overrides = structuredClone(m.overrides);
    if(m.profiles && typeof m.profiles === 'object') out.profiles = { ...out.profiles, ...structuredClone(m.profiles) };
    if(Array.isArray(m.boxes)) out.boxes = structuredClone(m.boxes);
    if(m.free && typeof m.free === 'object') out.free = { ...out.free, ...structuredClone(m.free) };
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
  out.options.bracing.type = (out.options.bracing.type === 'S' || out.options.bracing.type === 'HAT') ? out.options.bracing.type : 'X';
  // Joist is currently not used (disabled)
  out.options.joists.enabled = false;

  // braces normalization (panel-based)
  if(!Array.isArray(out.braces)) out.braces = [];
  out.braces = out.braces
    .filter(b => b && typeof b === 'object')
    .map(b => {
      // Back-compat: old faceKey (Y0/Y1/X0/X1)
      if(typeof b.faceKey === 'string' && /^[YX][01]$/.test(b.faceKey)){
        const axis = b.faceKey.startsWith('Y') ? 'Y' : 'X';
        const line = parseInt(b.faceKey.slice(1),10) || 0;
        return {
          axis,
          line,
          story: Math.max(0, parseInt(b.story,10)||0),
          bay: Math.max(0, parseInt(b.bay,10)||0),
          kind: (b.kind === 'S' || b.kind === 'HAT') ? b.kind : 'X',
          profile: (b.profile && typeof b.profile === 'object') ? {
            stdKey: String(b.profile.stdKey||''),
            shapeKey: String(b.profile.shapeKey||''),
            sizeKey: String(b.profile.sizeKey||''),
          } : undefined,
        };
      }

      return {
        axis: (b.axis === 'X') ? 'X' : 'Y',
        line: Math.max(0, parseInt(b.line,10)||0),
        story: Math.max(0, parseInt(b.story,10)||0),
        bay: Math.max(0, parseInt(b.bay,10)||0),
        kind: (b.kind === 'S' || b.kind === 'HAT') ? b.kind : 'X',
        profile: (b.profile && typeof b.profile === 'object') ? {
          stdKey: String(b.profile.stdKey||''),
          shapeKey: String(b.profile.shapeKey||''),
          sizeKey: String(b.profile.sizeKey||''),
        } : undefined,
      };
    });

  // overrides normalization (kept as-is; validated in UI)
  if(!out.overrides || typeof out.overrides !== 'object') out.overrides = {};

  // boxes normalization (axis-aligned mm extents)
  if(!Array.isArray(out.boxes)) out.boxes = [];
  out.boxes = out.boxes
    .filter(b => b && typeof b === 'object')
    .map((b, idx) => {
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const x0 = n(b.x0), x1 = n(b.x1);
      const y0 = n(b.y0), y1 = n(b.y1);
      const z0 = n(b.z0), z1 = n(b.z1);
      return {
        id: String(b.id || `b${idx+1}`),
        x0: Math.min(x0,x1), x1: Math.max(x0,x1),
        y0: Math.min(y0,y1), y1: Math.max(y0,y1),
        z0: Math.min(z0,z1), z1: Math.max(z0,z1),
      };
    });

  // free model normalization (used for non-grid additions)
  if(!out.free || typeof out.free !== 'object') out.free = { enabled:false, nodes:[], members:[], lastKind:'beam', nextNodeId:1, nextMemId:1 };
  out.free.enabled = (out.free.enabled === true);
  if(!Array.isArray(out.free.nodes)) out.free.nodes = [];
  if(!Array.isArray(out.free.members)) out.free.members = [];
  out.free.lastKind = String(out.free.lastKind||'beam');
  out.free.nextNodeId = Math.max(1, parseInt(out.free.nextNodeId,10)||1);
  out.free.nextMemId = Math.max(1, parseInt(out.free.nextMemId,10)||1);

  return out;
}

/**
 * @typedef {{id:string, kind:string, a:[number,number,number], b:[number,number,number]}} Member
 */

function generateMembersFree(m){
  const fm = m.free || {};
  const nodes = Array.isArray(fm.nodes) ? fm.nodes : [];
  const mems = Array.isArray(fm.members) ? fm.members : [];
  const nodeMap = new Map(nodes.map(n => [String(n.id), [mmToM(n.x), mmToM(n.y), mmToM(n.z)]]));

  /** @type {Member[]} */
  const out = [];
  for(const mm of mems){
    const a = nodeMap.get(String(mm.i));
    const b = nodeMap.get(String(mm.j));
    if(!a || !b) continue;
    const dx = b[0]-a[0];
    const dy = b[1]-a[1];
    const dz = b[2]-a[2];

    let kind = String(mm.kind||'beam');
    if(kind === 'beam'){
      // Determine major direction by plan projection
      if(Math.abs(dy) > (Math.abs(dx)+Math.abs(dz)) * 0.8) kind = 'column';
      else kind = (Math.abs(dx) >= Math.abs(dz)) ? 'beamX' : 'beamY';
    }
    if(kind === 'column') kind = 'column';
    if(kind === 'brace') kind = 'brace';

    out.push({ id: `free:${String(mm.id)}`, kind, a, b });
  }
  return out;
}

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

  // bracing (panel-based, per story)
  if(m.options.bracing.enabled && Array.isArray(m.braces) && m.braces.length){
    for(const br of m.braces){
      const iz = br.story;
      if(iz < 0 || iz >= levelsM.length-1) continue;
      const z0 = levelsM[iz];
      const z1 = levelsM[iz+1];

      const addXBrace = (a,b,c,d, key) => {
        const kind = br.kind || m.options.bracing.type;
        if(kind === 'S'){
          // single diagonal
          members.push({ id:`braceS:${key}`, kind:'brace', a, b, profile: br.profile });
          return;
        }
        if(kind === 'HAT'){
          // chevron (ㅅ): two diagonals meeting at mid-top
          const midTop = [ (a[0]+c[0])/2, z1, (a[2]+c[2])/2 ];
          members.push({ id:`braceH1:${key}`, kind:'brace', a, b: midTop, profile: br.profile });
          members.push({ id:`braceH2:${key}`, kind:'brace', a: c, b: midTop, profile: br.profile });
          return;
        }
        // X-brace
        members.push({ id:`braceX1:${key}`, kind:'brace', a, b, profile: br.profile });
        members.push({ id:`braceX2:${key}`, kind:'brace', a: c, b: d, profile: br.profile });
      };

      if(br.axis === 'Y'){
        const y = ys[Math.min(ny-1, Math.max(0, br.line))];
        const ix = br.bay;
        if(ix >= 0 && ix < nx-1){
          const a = [xs[ix], z0, y];
          const b = [xs[ix+1], z1, y];
          const c = [xs[ix+1], z0, y];
          const d = [xs[ix], z1, y];
          addXBrace(a,b,c,d, `Y:${br.line}:${iz}:${ix}`);
        }
      }

      if(br.axis === 'X'){
        const x = xs[Math.min(nx-1, Math.max(0, br.line))];
        const iy = br.bay;
        if(iy >= 0 && iy < ny-1){
          const a = [x, z0, ys[iy]];
          const b = [x, z1, ys[iy+1]];
          const c = [x, z0, ys[iy+1]];
          const d = [x, z1, ys[iy]];
          addXBrace(a,b,c,d, `X:${br.line}:${iz}:${iy}`);
        }
      }
    }
  }

  const extra = generateMembersFree(m);
  return members.concat(extra);
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
