/* PreBIM‑SteelStructure
 * Web-based steel structure concept modeler.
 */

const STORAGE_KEY = 'prebim.projects.v1';
const BUILD = '20260210-1412KST';

// lazy-loaded deps
let __three = null;
let __OrbitControls = null;
let __engine = null;
let __profiles = null;
let __threeUtils = null;
let __csg = null;

function analysisSettingsKey(projectId){ return `prebim:analysisSettings:${projectId}`; }
function loadAnalysisSettings(projectId){
  try{ return JSON.parse(localStorage.getItem(analysisSettingsKey(projectId)) || 'null') || {}; }catch{ return {}; }
}
function saveAnalysisSettings(projectId, patch){
  try{
    const cur = loadAnalysisSettings(projectId);
    const next = { ...cur, ...(patch||{}), updatedAt: Date.now() };
    localStorage.setItem(analysisSettingsKey(projectId), JSON.stringify(next));
    return next;
  }catch{ return null; }
}

async function loadDeps(){
  if(__three && __OrbitControls && __engine) return;
  const [threeMod, controlsMod, utilsMod, csgMod, engineMod, profilesMod] = await Promise.all([
    import('https://esm.sh/three@0.160.0'),
    import('https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js'),
    import('https://esm.sh/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js'),
    import('https://esm.sh/three-bvh-csg@0.0.17?deps=three@0.160.0'),
    import('/prebim/engine.js?v=20260210-1412KST'),
    import('/prebim/app_profiles.js?v=20260210-1412KST'),
  ]);
  __three = threeMod;
  __OrbitControls = controlsMod.OrbitControls;
  __threeUtils = utilsMod;
  __csg = csgMod;
  __engine = engineMod;
  __profiles = profilesMod;
}

/** @typedef {{ id: string, name: string, createdAt: number, updatedAt: number, schemaVersion: 1, data: any }} PrebimProject */

function now(){ return Date.now(); }
function uid(){ return 'p_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16); }

function loadProjects(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return /** @type {PrebimProject[]} */([]);
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed;
  }catch(e){
    console.warn('Failed to load projects', e);
    return [];
  }
}

function saveProjects(projects){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function formatTime(ms){
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function download(filename, text, mime='application/json'){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseImportFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(String(reader.result || ''));
        resolve(parsed);
      }catch(e){ reject(e); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function setMode(mode){
  document.body.classList.toggle('mode-editor', mode === 'editor');
}

function setTopbarSubtitle(text){
  const el = document.getElementById('topbarSub');
  if(el) el.textContent = text;
}

function fillProfileSelectors(){
  try{ __profiles?.fillProfileSelectors?.(); } catch(e){ /* ignore */ }
}

function setTopbarActions(html){
  const el = document.getElementById('topbarActions');
  if(el) el.innerHTML = html;
}

function go(hash){
  location.hash = hash;
}

function findProjectById(id){
  const projects = loadProjects();
  return projects.find(p => p.id === id) || null;
}

function renderProjects(){
  setMode('projects');
  setTopbarSubtitle('projects');
  setTopbarActions(`
    <a class="pill" href="/">Home</a>
    <a class="pill" href="/blog/">Blog</a>
    <a class="cta" href="#start">New project</a>
  `);

  const root = document.getElementById('app');
  if(!root) return;

  const projects = loadProjects().sort((a,b)=> (b.updatedAt||0) - (a.updatedAt||0));

  root.innerHTML = `
    <section class="grid">
      <div class="card panel">
        <div class="badge"><span class="dot"></span> Local projects (Phase 0)</div>
        <h1 style="margin-top:10px">Choose a project</h1>
        <p class="sub">
          Start a new structural concept model, or import a saved project.
          Later, projects will sync to your account.
        </p>

        <div class="row" id="start">
          <input id="newName" class="input" placeholder="New project name (e.g. Pipe rack A)" maxlength="80" />
          <button class="btn primary" id="btnCreate">New project</button>
        </div>

        <div class="row" style="margin-top:10px">
          <input id="importFile" type="file" accept="application/json" style="display:none" />
          <button class="btn" id="btnImport">Import project (.json)</button>
          <button class="btn" id="btnExportAll" ${projects.length? '' : 'disabled'}>Export all</button>
        </div>

        <div class="note">
          Stored in <span class="mono">localStorage</span> on this device. Clearing browser data will remove projects.
        </div>
      </div>

      <div class="card preview">
        <div class="panel">
          <div class="mono" style="font-size:12px; color:rgba(11,27,58,0.62)">projects</div>
          <div class="list" id="list"></div>
        </div>
      </div>
    </section>

    <div class="footer">
      <div>© 2026 PreBIM‑SteelStructure</div>
      <div class="mono">Steel structure pre‑design</div>
    </div>
  `;

  const list = root.querySelector('#list');
  if(list){
    if(projects.length === 0){
      list.innerHTML = `
        <div class="item">
          <div>
            <b>No projects yet</b>
            <small>Create one, or import a JSON export.</small>
          </div>
        </div>
      `;
    } else {
      const summarizeProject = (proj) => {
        try{
          const m = __engine?.normalizeModel?.(proj.data?.engineModel || proj.data?.model || proj.data?.engine || proj.data) || null;
          if(!m) return '';
          const nx = (m.grid?.spansXmm?.length||0) + 1;
          const ny = (m.grid?.spansYmm?.length||0) + 1;
          const lv = m.levels?.length || 0;
          const mems = __engine?.generateMembers?.(m) || [];
          const q = __engine?.quantities?.(mems);
          const len = q?.totalLen;
          return `Grid ${nx}×${ny} · Levels ${lv} · Members ${mems.length}${(len!=null)?` · Len ${len.toFixed(1)} m`:''}`;
        }catch{ return ''; }
      };

      list.innerHTML = projects.map(p => `
        <div class="item" data-id="${escapeHtml(p.id)}">
          <div>
            <b>${escapeHtml(p.name || 'Untitled')}</b>
            <small>Updated ${formatTime(p.updatedAt || p.createdAt || 0)}</small>
            <small>${escapeHtml(summarizeProject(p))}</small>
          </div>
          <div class="row" style="margin-top:0">
            <button class="btn" data-action="open">Open</button>
            <button class="btn" data-action="duplicate">Duplicate</button>
            <button class="btn" data-action="export">Export</button>
            <button class="btn danger" data-action="delete">Delete</button>
          </div>
        </div>
      `).join('');
    }
  }

  // handlers
  root.querySelector('#btnCreate')?.addEventListener('click', () => {
    const input = /** @type {HTMLInputElement|null} */(root.querySelector('#newName'));
    const name = (input?.value || '').trim() || 'Untitled project';

    const p = /** @type {PrebimProject} */({
      id: uid(),
      name,
      createdAt: now(),
      updatedAt: now(),
      schemaVersion: 1,
      data: {
        kind: 'empty',
        note: 'Engine not yet ported. This is a project container.'
      }
    });

    const projects = loadProjects();
    projects.push(p);
    saveProjects(projects);
    if(input) input.value = '';
    render();
  });

  root.querySelector('#btnImport')?.addEventListener('click', () => {
    /** @type {HTMLInputElement|null} */(root.querySelector('#importFile'))?.click();
  });

  root.querySelector('#importFile')?.addEventListener('change', async (ev) => {
    const inp = /** @type {HTMLInputElement} */(ev.target);
    const file = inp.files?.[0];
    if(!file) return;

    try{
      const imported = await parseImportFile(file);
      const incoming = Array.isArray(imported) ? imported : [imported];

      const projects = loadProjects();
      for(const raw of incoming){
        if(!raw || typeof raw !== 'object') continue;

        // normalize
        const p = /** @type {PrebimProject} */({
          id: (raw.id && typeof raw.id === 'string') ? raw.id : uid(),
          name: (raw.name && typeof raw.name === 'string') ? raw.name : 'Imported project',
          createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now(),
          updatedAt: now(),
          schemaVersion: 1,
          data: raw.data ?? raw
        });

        // avoid id collision
        if(projects.some(x => x.id === p.id)) p.id = uid();
        projects.push(p);
      }

      saveProjects(projects);
      inp.value = '';
      render();
    }catch(e){
      alert('Import failed: invalid JSON');
      console.error(e);
    }
  });

  root.querySelector('#btnExportAll')?.addEventListener('click', () => {
    const projects = loadProjects();
    download(`prebim-projects-${Date.now()}.json`, JSON.stringify(projects, null, 2));
  });

  root.querySelectorAll('.item').forEach(el => {
    el.addEventListener('click', (ev) => {
      const target = /** @type {HTMLElement|null} */(ev.target);
      const btn = target?.closest('button[data-action]');
      if(!btn) return;

      const id = el.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if(!id || !action) return;

      const projects = loadProjects();
      const idx = projects.findIndex(p => p.id === id);
      if(idx < 0) return;

      const p = projects[idx];
      if(action === 'delete'){
        if(!confirm(`Delete project "${p.name}"?`)) return;
        projects.splice(idx, 1);
        saveProjects(projects);
        renderProjects();
        return;
      }

      if(action === 'export'){
        download(`prebim-${p.name.replace(/[^a-z0-9_-]+/gi,'_')}-${Date.now()}.json`, JSON.stringify(p, null, 2));
        return;
      }

      if(action === 'duplicate'){
        const copy = structuredClone(p);
        copy.id = uid();
        copy.name = `${p.name || 'Untitled'} (copy)`;
        copy.createdAt = now();
        copy.updatedAt = now();
        projects.push(copy);
        saveProjects(projects);
        renderProjects();
        return;
      }

      if(action === 'open'){
        go(`#/editor/${encodeURIComponent(p.id)}`);
        return;
      }
    });
  });
}

function connSettingsKey(projectId){ return `prebim:analysisConn:${projectId}`; }
function loadConnSettings(projectId){
  try{ return JSON.parse(localStorage.getItem(connSettingsKey(projectId)) || 'null') || {}; }catch{ return {}; }
}
function saveConnSettings(projectId, patch){
  try{
    const cur = loadConnSettings(projectId);
    const next = { ...cur, ...(patch||{}), updatedAt: Date.now() };
    localStorage.setItem(connSettingsKey(projectId), JSON.stringify(next));
    return next;
  }catch{ return null; }
}

function buildAnalysisPayload(model, qLive=3.0, supportMode='PINNED', connCfg=null, extraLoads=null){
  const windStoryX = Array.isArray(extraLoads?.windStoryX) ? extraLoads.windStoryX : null;
  const windStoryZ = Array.isArray(extraLoads?.windStoryZ) ? extraLoads.windStoryZ : null;
  const eqStoryX = Array.isArray(extraLoads?.eqStoryX) ? extraLoads.eqStoryX : null;
  const eqStoryZ = Array.isArray(extraLoads?.eqStoryZ) ? extraLoads.eqStoryZ : null;
  // Build analysis request payload from engine model.
  const m = __engine.normalizeModel(model);
  const members = __engine.generateMembers(m);

  // unique joints
  const keyOf = (pt) => `${pt[0].toFixed(6)},${pt[1].toFixed(6)},${pt[2].toFixed(6)}`;
  const joints = new Map();
  const jointList = [];
  const ensureJoint = (pt) => {
    const k = keyOf(pt);
    if(joints.has(k)) return joints.get(k);
    const id = String(jointList.length + 1);
    joints.set(k, id);
    jointList.push({ id, pt });
    return id;
  };

  const memList = members.map((mem, idx) => {
    const j1 = ensureJoint(mem.a);
    const j2 = ensureJoint(mem.b);
    return { id: String(idx+1), kind: mem.kind, j1, j2, mem };
  });
  const _engineIds = memList.map(mm => String(mm.mem?.id ?? mm.id));
  const _kinds = memList.map(mm => String(mm.kind||''));

  // grid helpers (for tributary widths)
  const spansXmm = m.grid?.spansXmm || [];
  const spansYmm = m.grid?.spansYmm || [];
  const xs=[0], ys=[0];
  for(const s of spansXmm) xs.push(xs[xs.length-1] + (s/1000));
  for(const s of spansYmm) ys.push(ys[ys.length-1] + (s/1000));

  const findIdx = (arr, v) => {
    for(let i=0;i<arr.length;i++) if(Math.abs(arr[i]-v) < 1e-5) return i;
    return -1;
  };

  const tribWidthForBeamX = (z) => {
    const j = findIdx(ys, z);
    if(j < 0) return 0;
    const wPrev = (j>0) ? (ys[j]-ys[j-1]) : 0;
    const wNext = (j<ys.length-1) ? (ys[j+1]-ys[j]) : 0;
    return 0.5*wPrev + 0.5*wNext;
  };

  const tribWidthForBeamY = (x) => {
    const i = findIdx(xs, x);
    if(i < 0) return 0;
    const wPrev = (i>0) ? (xs[i]-xs[i-1]) : 0;
    const wNext = (i<xs.length-1) ? (xs[i+1]-xs[i]) : 0;
    return 0.5*wPrev + 0.5*wNext;
  };

  const rectPropsMm = (w, h) => {
    const A = w*h;
    const Iy = h*Math.pow(w,3)/12;
    const Iz = w*Math.pow(h,3)/12;
    const a = Math.max(w,h);
    const b = Math.min(w,h);
    const J = (a*Math.pow(b,3))*(1/3 - 0.21*(b/a)*(1 - Math.pow(b,4)/(12*Math.pow(a,4))));
    return { A, Iy, Iz, J };
  };

  const iSectionPropsMm = (b, d, tw, tf) => {
    const webH = Math.max(0, d - 2*tf);
    const Af = b*tf;
    const Aw = tw*webH;
    const A = 2*Af + Aw;
    const IyFlange = tf*Math.pow(b,3)/12;
    const IyWeb = webH*Math.pow(tw,3)/12;
    const Iy = 2*IyFlange + IyWeb;
    const IzFlangeLocal = b*Math.pow(tf,3)/12;
    const yOff = (d/2 - tf/2);
    const IzFlange = IzFlangeLocal + Af*Math.pow(yOff,2);
    const IzWeb = tw*Math.pow(webH,3)/12;
    const Iz = 2*IzFlange + IzWeb;
    const J = (2*b*Math.pow(tf,3) + webH*Math.pow(tw,3))/3;
    return { A, Iy, Iz, J };
  };

  const memberProfileNameLocal = (kind, memberId, memObj) => {
    const prof = m?.profiles || {};
    const overrides = m?.overrides || window.__prebimOverrides || {};
    const ov = overrides?.[memberId] || null;

    if(kind === 'column'){
      if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.colShape||'H', ov.sizeKey||prof.colSize||'')?.name || ov.sizeKey || '';
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.colShape||'H', prof.colSize||'')?.name || prof.colSize || '';
    }
    if(kind === 'beamX' || kind === 'beamY'){
      if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.beamShape||'H', ov.sizeKey||prof.beamSize||'')?.name || ov.sizeKey || '';
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'')?.name || prof.beamSize || '';
    }
    if(kind === 'subBeam'){
      if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.subShape||'H', ov.sizeKey||prof.subSize||'')?.name || ov.sizeKey || '';
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.subShape||'H', prof.subSize||'')?.name || prof.subSize || '';
    }
    if(kind === 'brace'){
      if(memObj?.profile && typeof memObj.profile === 'object'){
        const pr = memObj.profile;
        return __profiles?.getProfile?.(pr.stdKey||prof.stdAll||'KS', pr.shapeKey||prof.braceShape||'L', pr.sizeKey||prof.braceSize||'')?.name || pr.sizeKey || '';
      }
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'')?.name || prof.braceSize || '';
    }
    return '';
  };

  const parseProfileDimsMmLocal = (name) => {
    const s0 = String(name||'').trim().replaceAll('X','x');
    const s = s0.replaceAll('×','x');
    const shapeKey = (s.split(/\s+/)[0] || 'BOX').toUpperCase();

    const mL = s.match(/^L\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mL) return { shape:'L', d:+mL[1], b:+mL[2], tw:+mL[3], tf:+mL[3], lip:0, t:+mL[3] };

    const mHI = s.match(/^(H|I)\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mHI) return { shape:mHI[1].toUpperCase(), d:+mHI[2], b:+mHI[3], tw:+mHI[4], tf:+mHI[5], lip:0 };

    const mC = s.match(/^C\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mC) return { shape:'C', d:+mC[1], b:+mC[2], tw:+mC[3], tf:+mC[4], lip:0 };

    const mLC = s.match(/^LC\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mLC) return { shape:'LC', d:+mLC[1], b:+mLC[2], tw:+mLC[4], tf:+mLC[4], lip:+mLC[3] };

    const mT2 = s.match(/^T\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mT2){ const b=+mT2[1], d=+mT2[2]; const t=Math.max(6, Math.min(b,d)*0.10); return { shape:'T', d, b, tw:t, tf:t, lip:0, t }; }

    const m2 = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    const d = m2 ? parseFloat(m2[1]) : 150;
    const b = m2 ? parseFloat(m2[2]) : 150;
    const t = Math.max(6, Math.min(b,d)*0.08);
    return { shape: shapeKey, d, b, tw:t, tf:t, lip:0, t };
  };

  const sectionPropsMmFromMember = (kind, memObj) => {
    const profName = memberProfileNameLocal(kind, memObj.id, memObj);
    const d = parseProfileDimsMmLocal(profName);
    const depth = Math.max(30, d.d||150);
    const width = Math.max(30, d.b||150);
    const tf = d.tf || d.t || 12;
    const tw = d.tw || d.t || 8;
    if((d.tf || d.tw) && depth > 2*tf + 1 && width > tw + 1) return iSectionPropsMm(width, depth, tw, tf);
    return rectPropsMm(width, depth);
  };

  // supports: minY joints
  const supportJoints = new Set();
  let minY = Infinity;
  for(const mm of memList){
    const mem = mm.mem;
    minY = Math.min(minY, mem.a[1], mem.b[1]);
  }
  const yEps = 1e-6;
  for(const mm of memList){
    const mem = mm.mem;
    if(Math.abs(mem.a[1] - minY) < yEps) supportJoints.add(mm.j1);
    if(Math.abs(mem.b[1] - minY) < yEps) supportJoints.add(mm.j2);
  }

  // loads
  const liveLoads = [];
  const snowLoads = [];
  const story1m = (m.levels?.[1] ?? 0)/1000;
  const subCount = m.options?.subBeams?.countPerBay || 0;
  const qSnow = Math.max(0, Number(extraLoads?.qSnow ?? 0) || 0);
  const designMethod = String(extraLoads?.designMethod || 'STRENGTH').toUpperCase();

  for(const mm of memList){
    const mem = mm.mem;
    if(!(mem.kind==='beamX' || mem.kind==='beamY' || mem.kind==='subBeam')) continue;
    if(Math.abs(mem.a[1]-story1m) > 1e-6 || Math.abs(mem.b[1]-story1m) > 1e-6) continue;
    let trib = 0;
    if(mem.kind==='beamX') trib = tribWidthForBeamX(mem.a[2]);
    else if(mem.kind==='beamY') trib = tribWidthForBeamY(mem.a[0]);
    else {
      const mId = String(mem.id||'');
      const mSub = mId.match(/^sub:(\d+),(\d+),(\d+),(\d+)/);
      if(mSub){
        const iy = parseInt(mSub[2],10) || 0;
        const bayW = (ys[iy+1]??ys[iy]) - (ys[iy]??0);
        trib = bayW / (Math.max(1, subCount)+1);
      } else trib = tribWidthForBeamX(mem.a[2]);
    }
    const wL = qLive * trib;
    if(wL>0) liveLoads.push({ memberId: mm.id, dir:'GY', w: -wL });

    const wS = qSnow * trib;
    if(wS>0) snowLoads.push({ memberId: mm.id, dir:'GY', w: -wS });
  }

  // properties in meter/kN
  const E = 2.05e8;
  const nu = 0.3;
  const G = E/(2*(1+nu));

  const nodes = jointList.map(j => ({ id: j.id, x: j.pt[0], y: j.pt[1], z: j.pt[2] }));
  const conn = connCfg || {};
  const defaultModeByKind = {
    column: 'FIXED',
    beamX: 'PIN',
    beamY: 'PIN',
    subBeam: 'PIN',
    brace: 'PIN',
    joist: 'PIN',
  };

  const releasesForMode = (mode, end='i') => {
    // End release convention (approx):
    // - FIXED: no rotational releases
    // - PIN: release bending rotations (about local y & z), keep torsion about x to reduce mechanisms
    const m = String(mode||'FIXED').toUpperCase();
    if(m === 'PIN'){
      if(end === 'i') return { Rxi:false, Ryi:true, Rzi:true };
      return { Rxj:false, Ryj:true, Rzj:true };
    }
    if(end === 'i') return { Rxi:false, Ryi:false, Rzi:false };
    return { Rxj:false, Ryj:false, Rzj:false };
  };

  // releases are per analysis member; keep a parallel list to allow 3D connection markers
  const _connModes = memList.map(mm => {
    const eid = String(mm.mem?.id ?? mm.id);
    const per = conn?.members?.[eid] || null;
    const def = defaultModeByKind[mm.kind] || 'FIXED';
    return { engineId: eid, kind: mm.kind, i: (per?.i||def), j: (per?.j||def) };
  });

  const amembers = memList.map(mm => {
    const Pmm = sectionPropsMmFromMember(mm.kind, mm.mem);
    const eid = String(mm.mem?.id ?? mm.id);
    const per = conn?.members?.[eid] || null; // {i:'PIN'|'FIXED', j:'PIN'|'FIXED'}
    const def = defaultModeByKind[mm.kind] || 'FIXED';
    const mi = per?.i || def;
    const mj = per?.j || def;
    const relI = releasesForMode(mi, 'i');
    const relJ = releasesForMode(mj, 'j');
    const releases = {
      Rxi: !!relI.Rxi,
      Ryi: !!relI.Ryi,
      Rzi: !!relI.Rzi,
      Rxj: !!relJ.Rxj,
      Ryj: !!relJ.Ryj,
      Rzj: !!relJ.Rzj,
    };

    return {
      id: mm.id,
      i: mm.j1,
      j: mm.j2,
      type: (mm.kind==='brace') ? 'truss' : 'frame',
      E,
      G,
      A: Pmm.A * 1e-6,
      Iy: Pmm.Iy * 1e-12,
      Iz: Pmm.Iz * 1e-12,
      J: Pmm.J * 1e-12,
      releases: (mm.kind==='brace') ? null : releases,
      _engineId: eid,
    };
  });

  const fixed = String(supportMode).toUpperCase() === 'FIXED';
  let supports = Array.from(supportJoints).map(id => ({ nodeId: id, fix: { DX:true,DY:true,DZ:true,RX:fixed,RY:fixed,RZ:fixed } }));
  if(!supports.length && jointList.length){
    supports = [{ nodeId: jointList[0].id, fix: { DX:true,DY:true,DZ:true,RX:fixed,RY:fixed,RZ:fixed } }];
  }

  // Lateral loads (wind/seismic): distribute to story level nodes (preferred), else top level nodes (legacy)
  const topY = Math.max(...nodes.map(n => n.y));
  const topNodes = nodes.filter(n => Math.abs(n.y - topY) < 1e-6).map(n => n.id);

  const splitToNodes = (F, nodeIds) => {
    const ids = (nodeIds && nodeIds.length) ? nodeIds : topNodes;
    const nn = Math.max(1, ids.length);
    return ids.map(id => ({ nodeId: id, F: F/nn }));
  };

  const storyLevelsMm = (model?.levels || []).map(v => Number(v)||0);
  const storyY = (iStory) => {
    // apply story force at top of story (level i+1). If not available, fallback to top.
    const yMm = storyLevelsMm?.[iStory+1];
    if(yMm == null) return topY;
    return yMm/1000;
  };
  const nodesAtY = (yTarget, tol=1e-4) => nodes.filter(n => Math.abs(n.y - yTarget) < tol).map(n => n.id);

  const buildStoryNodeLoads = (storyForces, dir) => {
    if(!Array.isArray(storyForces) || !storyForces.length) return [];
    const out = [];
    for(let i=0;i<storyForces.length;i++){
      const F = Number(storyForces[i]||0) || 0;
      if(Math.abs(F) < 1e-12) continue;
      const yT = storyY(i);
      const ids = nodesAtY(yT);
      const splits = splitToNodes(F, ids).map(x => ({ ...x, dir }));
      out.push(...splits);
    }
    return out;
  };

  const windX = Number(extraLoads?.windX ?? 0) || 0;
  const windZ = Number(extraLoads?.windZ ?? 0) || 0;
  const eqX = Number(extraLoads?.eqX ?? 0) || 0;
  const eqZ = Number(extraLoads?.eqZ ?? 0) || 0;

  const hasWindStoryX = Array.isArray(windStoryX) && windStoryX.some(v => Math.abs(Number(v?.F ?? v ?? 0))>1e-9);
  const hasWindStoryZ = Array.isArray(windStoryZ) && windStoryZ.some(v => Math.abs(Number(v?.F ?? v ?? 0))>1e-9);
  const hasEqStoryX = Array.isArray(eqStoryX) && eqStoryX.some(v => Math.abs(Number(v?.F ?? v ?? 0))>1e-9);
  const hasEqStoryZ = Array.isArray(eqStoryZ) && eqStoryZ.some(v => Math.abs(Number(v?.F ?? v ?? 0))>1e-9);

  const splitToTop = (F) => splitToNodes(F, topNodes);

  // Load cases
  const caseD = { name:'D', selfweightY: -1.0, memberUDL: [], nodeLoads: [] };
  const caseL = { name:'L', selfweightY: 0.0, memberUDL: liveLoads, nodeLoads: [] };
  const caseS = { name:'S', selfweightY: 0.0, memberUDL: snowLoads, nodeLoads: [] };
  const caseWX = { name:'WX', selfweightY: 0.0, memberUDL: [], nodeLoads: (hasWindStoryX ? buildStoryNodeLoads(windStoryX,'GX') : splitToTop(windX).map(x=>({ ...x, dir:'GX' }))) };
  const caseWZ = { name:'WZ', selfweightY: 0.0, memberUDL: [], nodeLoads: (hasWindStoryZ ? buildStoryNodeLoads(windStoryZ,'GZ') : splitToTop(windZ).map(x=>({ ...x, dir:'GZ' }))) };
  const caseEQX = { name:'EQX', selfweightY: 0.0, memberUDL: [], nodeLoads: (hasEqStoryX ? buildStoryNodeLoads(eqStoryX,'GX') : splitToTop(eqX).map(x=>({ ...x, dir:'GX' }))) };
  const caseEQZ = { name:'EQZ', selfweightY: 0.0, memberUDL: [], nodeLoads: (hasEqStoryZ ? buildStoryNodeLoads(eqStoryZ,'GZ') : splitToTop(eqZ).map(x=>({ ...x, dir:'GZ' }))) };

  const cases = [caseD, caseL];
  if(snowLoads.length) cases.push(caseS);
  if(hasWindStoryX || Math.abs(windX)>1e-9) cases.push(caseWX);
  if(hasWindStoryZ || Math.abs(windZ)>1e-9) cases.push(caseWZ);
  if(hasEqStoryX || Math.abs(eqX)>1e-9) cases.push(caseEQX);
  if(hasEqStoryZ || Math.abs(eqZ)>1e-9) cases.push(caseEQZ);

  // Combos: hard-coded from sample PDF (simplified mapping to our cases)
  // Mapping: D ~ (Ds+De+Dp+Pa ...), L ~ LL, S ~ SNOW, WX/WZ ~ WIND, EQX/EQZ ~ EQ
  const combos = [];

  const hasS = snowLoads.length > 0;
  const hasWX = hasWindStoryX || (Math.abs(windX) > 1e-9);
  const hasWZ = hasWindStoryZ || (Math.abs(windZ) > 1e-9);
  const hasEQX = hasEqStoryX || (Math.abs(eqX) > 1e-9);
  const hasEQZ = hasEqStoryZ || (Math.abs(eqZ) > 1e-9);

  if(designMethod === 'ASD'){
    // From PDF ASD table (page 6) - we use the "W" row (not the separate KDS case row) and keep the core combos.
    combos.push({ name:'D', factors:{ D:1.0 } });
    combos.push({ name:'D+L', factors:{ D:1.0, L:0.75 } });
    if(hasS) combos.push({ name:'D+S', factors:{ D:1.0, S:0.75 } });
    if(hasS) combos.push({ name:'D+L+S', factors:{ D:1.0, L:0.75, S:0.75 } });
    if(hasWX) combos.push({ name:'D+WX', factors:{ D:0.6, WX:0.45 } });
    if(hasWZ) combos.push({ name:'D+WZ', factors:{ D:0.6, WZ:0.45 } });
    if(hasEQX) combos.push({ name:'D+EQX', factors:{ D:0.6, EQX:0.7 } });
    if(hasEQZ) combos.push({ name:'D+EQZ', factors:{ D:0.6, EQZ:0.7 } });
  } else {
    // Strength table (page 5) - core combos we support.
    combos.push({ name:'D', factors:{ D:1.4 } });
    combos.push({ name:'D+L', factors:{ D:1.2, L:1.0 } });
    if(hasS) combos.push({ name:'D+L+S', factors:{ D:1.2, L:1.0, S:1.6 } });
    if(hasWX) combos.push({ name:'D+WX', factors:{ D:0.9, WX:1.0 } });
    if(hasWZ) combos.push({ name:'D+WZ', factors:{ D:0.9, WZ:1.0 } });
    if(hasEQX) combos.push({ name:'D+EQX', factors:{ D:0.9, EQX:1.0 } });
    if(hasEQZ) combos.push({ name:'D+EQZ', factors:{ D:0.9, EQZ:1.0 } });
    if(hasS && hasWX) combos.push({ name:'D+L+WX+S', factors:{ D:1.2, L:1.6, WX:1.0, S:0.5 } });
    if(hasS && hasWZ) combos.push({ name:'D+L+WZ+S', factors:{ D:1.2, L:1.6, WZ:1.0, S:0.5 } });
  }

  return {
    units: { length:'m', force:'kN' },
    nodes,
    members: amembers,
    supports,
    cases,
    combos,

    // client-side helper (ignored by API): index i => analysis member id (i+1)
    _engineIds,
    _kinds,
    _connModes,
  };
}

function renderAnalysis(projectId){
  setMode('editor');
  document.body.classList.add('qty-collapsed');
  document.body.classList.add('ps-hidden');

  const p = findProjectById(projectId);
  if(!p){
    setTopbarSubtitle('projects');
    setTopbarActions(`
      <a class="pill" href="#/">Back</a>
      <a class="pill" href="/">Home</a>
    `);
    const root = document.getElementById('app');
    if(root) root.innerHTML = `<div class="card panel" style="margin:10px">Project not found.</div>`;
    return;
  }

  setTopbarSubtitle((p.name || 'project') + ' · analysis');
  document.title = `PreBIM-SteelStructure — ${p.name || 'project'} (Analysis)`;
  setTopbarActions(`
    <a class="pill" href="#/editor/${encodeURIComponent(p.id)}">Back</a>
    <button class="pill" id="btnRunAnalysis" type="button">Run</button>
  `);

  const root = document.getElementById('app');
  if(!root) return;

  root.innerHTML = `
    <section class="analysis-layout" aria-label="Analysis">
      <aside class="pane tools" aria-label="Results">
        <div class="pane-h"><b>Results</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">${BUILD}</span></div>
        <div class="pane-b">
          <div id="analysisResults"></div>
        </div>
      </aside>

      <div class="splitter" id="splitterT" title="Drag to resize"></div>

      <section class="pane view3d">
        <div class="pane-h">
          <b>3D View</b>
          <div class="row" style="margin-top:0; gap:6px">
            <button class="pill" id="btn3dGuides" type="button">Guides</button>
            <button class="pill" id="btn3dSection" type="button">Section Box</button>
          </div>
        </div>
        <div class="pane-b" id="view3dWrap" style="position:relative">
          <div id="view3d"></div>
          <div class="analysis-overlay" id="analysisOverlay" hidden>
            <div class="analysis-overlay-card">
              <div class="spinner"></div>
              <div style="font-weight:800">Running analysis…</div>
              <div class="mono" style="font-size:12px; color:rgba(11,27,58,0.65)">Solving 3D frame model</div>
            </div>
          </div>
        </div>
      </section>

      <div class="splitter" id="splitterAR" title="Drag to resize"></div>

      <aside class="pane tools" aria-label="Settings">
        <div class="pane-h"><b>Settings</b><span class="mono" id="analysisHudState" style="font-size:11px; opacity:.65">idle</span></div>
        <div class="pane-b">
          <div class="acc" id="settingsAcc">
            <button class="acc-btn" type="button" data-acc="sup">Supports <span class="chev" id="chevSup">▴</span></button>
            <div class="acc-panel open" id="panelSup">
              <label class="label">Support</label>
              <select class="input" id="supportMode">
                <option value="PINNED" selected>PINNED</option>
                <option value="FIXED">FIXED</option>
              </select>

              <label class="label">Supports (node ids)</label>
              <input class="input" id="supportNodes" placeholder="e.g. 1,2,3" />

              <label class="badge" style="margin-top:10px; cursor:pointer; user-select:none; display:flex; gap:8px; align-items:center">
                <input id="editSupports" type="checkbox" style="margin:0" />
                <span>Edit supports (click base nodes in 3D)</span>
              </label>

              <div class="row" style="margin-top:8px; gap:8px">
                <button class="btn" id="btnSupportsAuto" type="button">Auto</button>
              </div>
            </div>

            <button class="acc-btn" type="button" data-acc="conn">Connections <span class="chev" id="chevConn">▾</span></button>
            <div class="acc-panel" id="panelConn">
              <label class="label">Connections (selected member)</label>
              <div class="row" style="margin-top:6px; gap:8px; flex-wrap:wrap">
                <select class="input" id="connI" style="max-width:120px">
                  <option value="PIN">PIN</option>
                  <option value="FIXED" selected>FIXED</option>
                </select>
                <select class="input" id="connJ" style="max-width:120px">
                  <option value="PIN">PIN</option>
                  <option value="FIXED" selected>FIXED</option>
                </select>
                <button class="btn" id="btnConnApply" type="button">Apply</button>
              </div>
              <div class="note" style="margin-top:6px">Select members in 3D to edit end conditions.</div>
            </div>

            <button class="acc-btn" type="button" data-acc="crit">Criteria <span class="chev" id="chevCrit">▴</span></button>
            <div class="acc-panel open" id="panelCrit">
              <label class="label">Design method</label>
              <select class="input" id="designMethod">
                <option value="STRENGTH" selected>Strength (KDS factors)</option>
                <option value="ASD">ASD (KDS factors)</option>
              </select>

              <label class="label">Combo</label>
              <select class="input" id="comboMode">
                <option value="ENVELOPE" selected>ENVELOPE (all combos)</option>
                <option value="D+L">D+L (single)</option>
                <option value="D">D (single)</option>
              </select>

              <label class="label">Live load preset</label>
              <select class="input" id="livePreset">
                <option value="3.0" selected>Hall / HVAC room (3.0 kN/m²)</option>
                <option value="3.5">Office (3.5 kN/m²)</option>
                <option value="5.0">Toilet / Stair (5.0 kN/m²)</option>
                <option value="1.0">Light roof / Roof live (1.0 kN/m²)</option>
                <option value="custom">Custom</option>
              </select>

              <label class="label">Live load (kN/m²)</label>
              <input class="input" id="qLive" value="3.0" />

              <label class="label">Snow load (kN/m²)</label>
              <input class="input" id="qSnow" value="0.42" />

              <div class="row" style="justify-content:space-between; align-items:flex-end; gap:8px; flex-wrap:wrap">
                <div>
                  <label class="label" style="margin:0">Wind base shear (kN)</label>
                  <div class="note" style="margin-top:4px">You can input base shear directly or compute via KDS wind popup.</div>
                </div>
                <button class="btn" id="btnWindCalc" type="button">Wind (KDS)…</button>
              </div>
              <div class="grid2" style="margin-top:6px">
                <div>
                  <div class="note" style="margin-top:0">X (GX)</div>
                  <input class="input" id="windX" value="190.10" />
                </div>
                <div>
                  <div class="note" style="margin-top:0">Z (GZ)</div>
                  <input class="input" id="windZ" value="0" />
                </div>
              </div>

              <div class="row" style="justify-content:space-between; align-items:flex-end; gap:8px; flex-wrap:wrap; margin-top:10px">
                <div>
                  <label class="label" style="margin:0">Seismic base shear (kN)</label>
                  <div class="note" style="margin-top:4px">You can input base shear directly or compute & distribute via KDS seismic popup.</div>
                </div>
                <button class="btn" id="btnSeismicCalc" type="button">Seismic (KDS)…</button>
              </div>
              <div class="grid2" style="margin-top:6px">
                <div>
                  <div class="note" style="margin-top:0">X (GX)</div>
                  <input class="input" id="eqX" value="2911.49" />
                </div>
                <div>
                  <div class="note" style="margin-top:0">Z (GZ)</div>
                  <input class="input" id="eqZ" value="0" />
                </div>
              </div>

              <label class="label">Checks</label>
              <div class="row" style="margin-top:6px; gap:10px; flex-wrap:wrap">
                <label class="badge" style="cursor:pointer"><input id="chkMain" type="checkbox" style="margin:0 8px 0 0" checked /> Main beam</label>
                <label class="badge" style="cursor:pointer"><input id="chkSub" type="checkbox" style="margin:0 8px 0 0" checked /> Sub beam</label>
                <label class="badge" style="cursor:pointer"><input id="chkCol" type="checkbox" style="margin:0 8px 0 0" checked /> Column</label>
              </div>

              <label class="label">Deflection limits</label>
              <div class="grid2">
                <div>
                  <div class="note" style="margin-top:0">Main beam (beamX/beamY)</div>
                  <div class="row" style="margin-top:6px; gap:8px">
                    <span class="badge" style="background: rgba(148,163,184,0.10); border-color: rgba(148,163,184,0.18)">L/</span>
                    <input class="input" id="deflMain" value="300" />
                  </div>
                </div>
                <div>
                  <div class="note" style="margin-top:0">Sub-beam</div>
                  <div class="row" style="margin-top:6px; gap:8px">
                    <span class="badge" style="background: rgba(148,163,184,0.10); border-color: rgba(148,163,184,0.18)">L/</span>
                    <input class="input" id="deflSub" value="300" />
                  </div>
                </div>
              </div>

              <label class="label">Drift limits</label>
              <div class="grid2">
                <div>
                  <div class="note" style="margin-top:0">Story drift X</div>
                  <div class="row" style="margin-top:6px; gap:8px">
                    <span class="badge" style="background: rgba(148,163,184,0.10); border-color: rgba(148,163,184,0.18)">H/</span>
                    <input class="input" id="driftX" value="200" />
                  </div>
                </div>
                <div>
                  <div class="note" style="margin-top:0">Story drift Z</div>
                  <div class="row" style="margin-top:6px; gap:8px">
                    <span class="badge" style="background: rgba(148,163,184,0.10); border-color: rgba(148,163,184,0.18)">H/</span>
                    <input class="input" id="driftZ" value="200" />
                  </div>
                </div>
              </div>

              <label class="label">Column top displacement</label>
              <div class="row" style="margin-top:6px; gap:8px">
                <span class="badge" style="background: rgba(148,163,184,0.10); border-color: rgba(148,163,184,0.18)">H/</span>
                <input class="input" id="colTop" value="200" style="max-width:110px" />
              </div>

              <label class="badge" style="margin-top:10px; cursor:pointer; user-select:none; display:flex; gap:8px; align-items:center">
                <input id="failHighlight" type="checkbox" style="margin:0" checked />
                <span>Show FAIL highlight</span>
              </label>
            </div>

            <button class="acc-btn" type="button" data-acc="view">View <span class="chev" id="chevView">▾</span></button>
            <div class="acc-panel" id="panelView">
              <label class="label">Deformation scale</label>
              <input id="analysisScale2" type="range" min="10" max="400" value="120" style="width:100%" />
            </div>

            <div class="mono" id="analysisStatus" style="margin-top:10px; font-size:12px; color:rgba(11,27,58,0.75)">status: idle</div>
            <div id="analysisRunHelp"></div>

            <div class="row" style="margin-top:8px; gap:8px">
              <button class="btn" id="btnHudRun" type="button">Run</button>
            </div>
            <div class="note">Read-only page. Edit geometry in Editor.</div>
          </div>
        </div>
      </aside>
    </section>
  `;

  (async () => {
    // accordion toggles (analysis settings)
    {
      const toggleOne = (which) => {
        const panels = {
          sup: document.getElementById('panelSup'),
          conn: document.getElementById('panelConn'),
          crit: document.getElementById('panelCrit'),
          view: document.getElementById('panelView'),
        };
        const chevs = {
          sup: document.getElementById('chevSup'),
          conn: document.getElementById('chevConn'),
          crit: document.getElementById('chevCrit'),
          view: document.getElementById('chevView'),
        };
        const pEl = panels[which];
        if(!pEl) return;
        const open = !pEl.classList.contains('open');
        pEl.classList.toggle('open', open);
        const cEl = chevs[which];
        if(cEl) cEl.textContent = open ? '▴' : '▾';
      };

      document.querySelectorAll('#settingsAcc button.acc-btn[data-acc]')
        .forEach(btn => btn.addEventListener('click', () => toggleOne(btn.getAttribute('data-acc'))));
    }

    // restore settings
    const saved = loadAnalysisSettings(p.id);
    const setIf = (id, v) => { const el=document.getElementById(id); if(el!=null && v!=null && v!=='') el.value = String(v); };
    setIf('supportMode', saved.supportMode);
    setIf('comboMode', saved.comboMode);
    // restore live load preset / value
    const lp = document.getElementById('livePreset');
    if(lp && saved.livePreset) lp.value = String(saved.livePreset);
    setIf('qLive', saved.qLive);
    setIf('supportNodes', saved.supportNodes);
    setIf('analysisScale2', saved.analysisScale);
    setIf('deflMain', saved.deflMain || 300);
    // Per sample calc report: vertical deflection for floor beams/walkways/platforms etc: L/300.
    // Keep a separate (secondary) limit, but default it to L/300 as well.
    setIf('deflSub', saved.deflSub || 300);
    setIf('driftX', saved.driftX || 200);
    setIf('driftZ', saved.driftZ || 200);
    setIf('colTop', saved.colTop || 200);
    // Defaults from sample calc report (migrate old saved zeros)
    const defSnow = 0.42;
    const defWindX = 190.10;
    const defEqX = 2911.49;
    setIf('qSnow', (saved.qSnow!=null && Number(saved.qSnow)!==0 ? saved.qSnow : defSnow));
    setIf('windX', (saved.windX!=null && Number(saved.windX)!==0 ? saved.windX : defWindX));
    setIf('windZ', (saved.windZ!=null ? saved.windZ : 0));
    setIf('eqX', (saved.eqX!=null && Number(saved.eqX)!==0 ? saved.eqX : defEqX));
    setIf('eqZ', (saved.eqZ!=null ? saved.eqZ : 0));

    // Story force arrays (optional). If present, buildAnalysisPayload will apply story-level node loads.
    let lateralStory = {
      windStoryX: (Array.isArray(saved.windStoryX) ? saved.windStoryX.slice() : null),
      windStoryZ: (Array.isArray(saved.windStoryZ) ? saved.windStoryZ.slice() : null),
      eqStoryX: (Array.isArray(saved.eqStoryX) ? saved.eqStoryX.slice() : null),
      eqStoryZ: (Array.isArray(saved.eqStoryZ) ? saved.eqStoryZ.slice() : null),
    };

    try{
      const dm = document.getElementById('designMethod');
      if(dm && saved.designMethod) dm.value = String(saved.designMethod);
    }catch{}
    try{
      const cm = document.getElementById('comboMode');
      if(cm && saved.comboMode) cm.value = String(saved.comboMode);
    }catch{}
    try{
      const a = saved.checks || {};
      const c1=document.getElementById('chkMain'); if(c1 && a.main!=null) c1.checked=!!a.main;
      const c2=document.getElementById('chkSub'); if(c2 && a.sub!=null) c2.checked=!!a.sub;
      const c3=document.getElementById('chkCol'); if(c3 && a.col!=null) c3.checked=!!a.col;
    }catch{}
    const fh = document.getElementById('failHighlight');
    if(fh) fh.checked = (saved.failHighlightOn !== false);

    // live load preset -> qLive mapping (based on sample calculation report)
    const qLiveEl = document.getElementById('qLive');
    const livePresetEl = document.getElementById('livePreset');
    const applyLivePreset = () => {
      if(!livePresetEl || !qLiveEl) return;
      const v = String(livePresetEl.value || 'custom');
      if(v !== 'custom') qLiveEl.value = v;
      saveAnalysisSettings(p.id, { livePreset: v, qLive: qLiveEl.value });
    };
    livePresetEl?.addEventListener('change', applyLivePreset);
    // If a preset value is selected on load, enforce it.
    if(livePresetEl && livePresetEl.value !== 'custom'){
      try{ applyLivePreset(); }catch{}
    }
    // always default editSupports OFF unless explicitly saved
    const es = document.getElementById('editSupports');
    if(es) es.checked = !!saved.editSupports;

    // restore panel widths (shared CSS vars)
    try{
      if(saved?.wTools) document.documentElement.style.setProperty('--w-tools', `${Number(saved.wTools)||240}px`);
      if(saved?.wRight) document.documentElement.style.setProperty('--w-right', `${Number(saved.wRight)||320}px`);
    }catch{}

    const view3dEl = document.getElementById('view3d');
    const view = await createThreeView(view3dEl);
    __active3D?.dispose?.();
    __active3D = view;

    // Load model + show initial geometry
    const model = __engine.normalizeModel(p.data?.engineModel || p.data?.model || p.data?.engine || p.data || __engine.defaultModel());
    const members = __engine.generateMembers(model);
    view.setMembers(members, model);
    // show connection markers
    try{ view.setConnectionMarkers?.(members, loadConnSettings(p.id)); }catch{}

    const rebuildIdMapsFromPayload = (payload) => {
      analysisIdByEngineId = {};
      engineIdByAnalysisId = {};
      const ids = payload?._engineIds || [];
      ids.forEach((eid, idx) => {
        const aid = String(idx+1);
        const se = String(eid);
        analysisIdByEngineId[se] = aid;
        engineIdByAnalysisId[aid] = se;
      });
    };

    // initial maps (no loads needed)
    try{
      const p0 = buildAnalysisPayload(model, 0, (document.getElementById('supportMode')?.value||'PINNED'), loadConnSettings(p.id));
      rebuildIdMapsFromPayload(p0);
    }catch{}

    // 3D click -> table sync
    const updateConnUIForSelection = (eid) => {
      const selE = String(eid||'');
      const connCfg = loadConnSettings(p.id);
      const per = connCfg?.members?.[selE] || null;
      const kind = (members.find(m=>String(m.id)===selE)?.kind) || '';
      const def = ({column:'FIXED',beamX:'PIN',beamY:'PIN',subBeam:'PIN',brace:'PIN',joist:'PIN'})[kind] || 'FIXED';
      const mi = per?.i || def;
      const mj = per?.j || def;
      const iSel = document.getElementById('connI');
      const jSel = document.getElementById('connJ');
      if(iSel) iSel.value = mi;
      if(jSel) jSel.value = mj;
      const btn = document.getElementById('btnConnApply');
      if(btn) btn.disabled = !selE;
    };

    view.onSelectionChange?.((sel) => {
      const eid = sel?.[0];
      if(eid) {
        const aid = analysisIdByEngineId[String(eid)] || String(eid);
        saveAnalysisSettings(p.id, { selectedMemberEngineId: String(eid) });
        try{ highlightMemberRow(aid); renderMemberDetail(aid); }catch{}
        updateConnUIForSelection(eid);
      } else {
        try{ renderMemberDetail(''); highlightMemberRow(''); }catch{}
        updateConnUIForSelection('');
      }
    });

    const applyConnForSelected = () => {
      const sel = view.getSelection?.() || [];
      if(!sel.length) return;
      const mi = (document.getElementById('connI')?.value || 'FIXED').toString();
      const mj = (document.getElementById('connJ')?.value || 'FIXED').toString();
      const cfg = loadConnSettings(p.id);
      cfg.members = cfg.members || {};
      for(const selE of sel){
        cfg.members[String(selE)] = { i: mi, j: mj };
      }
      saveConnSettings(p.id, cfg);

      // realtime update markers in 3D
      try{ view.setConnectionMarkers?.(members, cfg); }catch{}
      // keep analysis payload builder in sync
      try{ refreshSupportViz(); }catch{}
    };

    // apply connection changes for selected member
    document.getElementById('btnConnApply')?.addEventListener('click', applyConnForSelected);
    // realtime update while user edits dropdowns
    document.getElementById('connI')?.addEventListener('change', applyConnForSelected);
    document.getElementById('connJ')?.addEventListener('change', applyConnForSelected);

    document.getElementById('btn3dGuides')?.addEventListener('click', () => {
      const on = view.toggleGuides?.();
      const btn = document.getElementById('btn3dGuides');
      if(btn) btn.classList.toggle('active', !!on);
    });

    document.getElementById('btn3dSection')?.addEventListener('click', () => {
      // toggle section box UI is editor-only; keep a simple toggle to clip full extents
      // (future: reuse existing popover)
      const on = !(document.body.classList.contains('secbox-on'));
      document.body.classList.toggle('secbox-on', on);
      view.setSectionBox?.(on, {x0:0,x1:1,y0:0,y1:1,z0:0,z1:1}, model);
      const btn = document.getElementById('btn3dSection');
      if(btn) btn.classList.toggle('active', on);
    });

    const setStatus = (t) => {
      const el = document.getElementById('analysisStatus');
      if(el) el.textContent = 'status: ' + t;
    };

    let lastRes = null;
    let lastPayload = null;
    // Map between engine member ids (used by 3D view selection) and analysis member ids (used by API/results)
    let analysisIdByEngineId = {};
    let engineIdByAnalysisId = {};

    const highlightMemberRow = (id) => {
      const host = document.getElementById('analysisResults');
      if(!host) return;
      host.querySelectorAll('.analysis-mem.sel').forEach(el => el.classList.remove('sel'));
      if(!id) return;

      const sid = String(id);
      // Avoid CSS.escape dependency (some environments don't expose it)
      const rows = host.querySelectorAll('.analysis-mem[data-mem]');
      for(const row of rows){
        if(row.getAttribute('data-mem') === sid){
          row.classList.add('sel');
          row.scrollIntoView({ block:'center', behavior:'smooth' });
          break;
        }
      }
    };

    const renderMemberDetail = (id) => {
      const host = document.getElementById('analysisResults');
      const box = host?.querySelector('#analysisMemberDetail');
      if(!box) return;
      if(!id || !lastRes?.members?.[id]){ box.innerHTML=''; return; }
      const r = lastRes.members[id];
      const m = r.maxAbs || {};
      const fmt = (x) => (Number(x)||0).toFixed(3);
      box.innerHTML = `
        <div class="card" style="margin-top:10px; padding:10px">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center">
            <b>Member ${escapeHtml(String(id))}</b>
            <button class="pill" id="btnMemClear" type="button">Clear</button>
          </div>
          <div class="mono" style="margin-top:8px; font-size:12px; opacity:.9">
            maxAbs: N ${fmt(m.N)} | Vy ${fmt(m.Vy)} | Vz ${fmt(m.Vz)} | My ${fmt(m.My)} | Mz ${fmt(m.Mz)}
          </div>
          <details style="margin-top:8px">
            <summary class="mono" style="cursor:pointer; font-size:12px; opacity:.7">End forces (i/j)</summary>
            <div class="mono" style="margin-top:6px; font-size:12px; display:grid; gap:6px">
              <div>i: Fx ${fmt(r?.i?.Fx)} Fy ${fmt(r?.i?.Fy)} Fz ${fmt(r?.i?.Fz)} Mx ${fmt(r?.i?.Mx)} My ${fmt(r?.i?.My)} Mz ${fmt(r?.i?.Mz)}</div>
              <div>j: Fx ${fmt(r?.j?.Fx)} Fy ${fmt(r?.j?.Fy)} Fz ${fmt(r?.j?.Fz)} Mx ${fmt(r?.j?.Mx)} My ${fmt(r?.j?.My)} Mz ${fmt(r?.j?.Mz)}</div>
            </div>
          </details>
        </div>
      `;
      box.querySelector('#btnMemClear')?.addEventListener('click', () => {
        view.clearSelection?.();
        saveAnalysisSettings(p.id, { selectedMemberEngineId: '' });
        renderMemberDetail('');
        highlightMemberRow('');
      });
    };

    const checkDeflection = (res, payload) => {
      const rMain = Number(document.getElementById('deflMain')?.value || 300) || 300;
      const rSub = Number(document.getElementById('deflSub')?.value || 300) || 300;
      const kinds = payload?._kinds || [];
      const nodeById = new Map((payload?.nodes||[]).map(n => [String(n.id), n]));
      const chkMain = (document.getElementById('chkMain')?.checked !== false);
      const chkSub = (document.getElementById('chkSub')?.checked !== false);

      let worst = { ok:true, util:0, memberId:'', L:0, allow:0, dy:0, kind:'' };
      for(let idx=0; idx<(payload?.members||[]).length; idx++){
        const mem = payload.members[idx];
        const mr = res?.members?.[String(mem.id)];
        if(!mr) continue;
        const kind = String(kinds[idx] || '');
        if((kind==='beamX' || kind==='beamY') && !chkMain) continue;
        if(kind==='subBeam' && !chkSub) continue;

        const ratio = (kind==='subBeam') ? rSub : (kind==='beamX' || kind==='beamY' ? rMain : null);
        if(!ratio) continue;

        const ni = nodeById.get(String(mem.i));
        const nj = nodeById.get(String(mem.j));
        if(!ni || !nj) continue;
        const L = Math.hypot(ni.x-nj.x, ni.z-nj.z);
        if(L <= 1e-9) continue;
        const allow = L / ratio;
        const dy = Math.abs(Number(mr.dyAbsMax)||0);
        const util = allow>0 ? (dy/allow) : 0;
        const ok = util <= 1.0 + 1e-12;
        if(util > worst.util){
          worst = { ok, util, memberId: String(mem.id), L, allow, dy, kind };
        }
      }

      return { rMain, rSub, worst, chkMain, chkSub };
    };

    const memberAllow = (analysisMemberId) => {
      try{
        const mem = lastPayload?.members?.find(m => String(m.id)===String(analysisMemberId));
        if(!mem) return null;
        const idx = (Number(analysisMemberId)||0) - 1;
        const kind = String(lastPayload?._kinds?.[idx] || '');
        const ratio = (kind==='subBeam') ? (Number(document.getElementById('deflSub')?.value||240)||240)
                    : ((kind==='beamX' || kind==='beamY') ? (Number(document.getElementById('deflMain')?.value||300)||300) : null);
        if(!ratio) return null;

        const nodeById = new Map((lastPayload?.nodes||[]).map(n => [String(n.id), n]));
        const ni = nodeById.get(String(mem.i));
        const nj = nodeById.get(String(mem.j));
        if(!ni || !nj) return null;
        const L = Math.hypot(ni.x-nj.x, ni.z-nj.z);
        if(L<=1e-9) return null;
        return { L, allow: L/ratio, ratio };
      }catch{ return null; }
    };

    const renderResultsTable = (res) => {
      const host = document.getElementById('analysisResults');
      if(!host) return;
      lastRes = res;
      if(!res || res.ok !== true){ host.innerHTML=''; return; }

      const maxDisp = Number(res?.maxDisp?.value)||0;
      const maxNode = res?.maxDisp?.nodeId||'';
      const mems = res?.members || {};
      const rows = Object.values(mems);
      rows.sort((a,b) => (b?.maxAbs?.Mz||0) - (a?.maxAbs?.Mz||0));
      const top = rows.slice(0, 200);

      host.innerHTML = `
        <div class="note" style="margin-top:10px"><b>Summary</b></div>
        <div class="mono" style="font-size:12px; margin-top:6px">combo: ${(res.combo||'-')}</div>
        <div class="mono" style="font-size:12px; margin-top:4px">max disp: ${maxDisp.toFixed(6)} m @ node ${escapeHtml(maxNode)}</div>

        <div id="analysisMemberDetail"></div>

        <div class="note" style="margin-top:10px"><b>Members (top by |Mz|)</b> <span class="mono" style="opacity:.65">(showing ${top.length}/${rows.length})</span></div>
        <div style="overflow:auto; margin-top:6px; border:1px solid rgba(148,163,184,0.25); border-radius:12px">
          <table class="table" style="min-width:520px">
            <thead><tr>
              <th>id</th>
              <th class="r">|N|</th>
              <th class="r">|Vy|</th>
              <th class="r">|Vz|</th>
              <th class="r">|My|</th>
              <th class="r">|Mz|</th>
              <th class="r">|dy|max</th>
              <th class="r">L/allow</th>
            </tr></thead>
            <tbody>
              ${top.map(r => `
                <tr class="analysis-mem" data-mem="${escapeHtml(String(r.id))}" style="cursor:pointer" data-util="${(() => {
                  try{ const a = memberAllow(r.id); return a?.allow ? ((Number(r?.dyAbsMax)||0)/(a.allow||1e-9)) : 0; }catch{ return 0; }
                })()}">
                  <td class="mono">${escapeHtml(String(r.id))}</td>
                  <td class="r mono">${(Number(r?.maxAbs?.N)||0).toFixed(3)}</td>
                  <td class="r mono">${(Number(r?.maxAbs?.Vy)||0).toFixed(3)}</td>
                  <td class="r mono">${(Number(r?.maxAbs?.Vz)||0).toFixed(3)}</td>
                  <td class="r mono">${(Number(r?.maxAbs?.My)||0).toFixed(3)}</td>
                  <td class="r mono">${(Number(r?.maxAbs?.Mz)||0).toFixed(3)}</td>
                  <td class="r mono">${(Number(r?.dyAbsMax)||0).toFixed(6)}</td>
                  <td class="r mono">${(() => {
                    const a = memberAllow(r.id);
                    return a?.allow ? `L/${a.ratio}` : '-';
                  })()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      // wire row click -> highlight member in 3D
      // add FAIL row styling
      host.querySelectorAll('.analysis-mem').forEach(tr => {
        const util = Number(tr.getAttribute('data-util')||'0')||0;
        if(util > 1.0 + 1e-9) tr.classList.add('fail');
        tr.addEventListener('click', () => {
          const aid = tr.getAttribute('data-mem');
          if(!aid) return;
          const eid = engineIdByAnalysisId[String(aid)] || '';
          if(eid) view.setSelection?.([eid]);
          saveAnalysisSettings(p.id, { selectedMemberEngineId: String(eid) });
          highlightMemberRow(String(aid));
          renderMemberDetail(String(aid));
        });
      });

      const saved = loadAnalysisSettings(p.id);
      if(saved?.selectedMemberEngineId){
        try{
          const eid = String(saved.selectedMemberEngineId);
          view.setSelection?.([eid]);
          const aid = analysisIdByEngineId[eid] || '';
          if(aid){
            highlightMemberRow(aid);
            renderMemberDetail(aid);
          }
        }catch{}
      }
    };

    const showRunHelp = (html='') => {
      const el = document.getElementById('analysisRunHelp');
      if(el) el.innerHTML = html;
    };

    // --- Wind / Seismic KDS popups (client-side helpers) ---
    const getModelExtents = () => {
      try{
        const pts = (model?.joints||[]).map(j => j.pt);
        if(!pts.length) return { minX:0,maxX:0,minZ:0,maxZ:0, H:0, storyCount:1, storyHeights:[] };
        let minX=+Infinity,maxX=-Infinity,minZ=+Infinity,maxZ=-Infinity;
        for(const p of pts){
          const x=Number(p?.[0]||0)/1000;
          const z=Number(p?.[2]||0)/1000;
          minX=Math.min(minX,x); maxX=Math.max(maxX,x);
          minZ=Math.min(minZ,z); maxZ=Math.max(maxZ,z);
        }
        const levels = (model?.levels||[]).map(v=>Number(v||0)/1000);
        const storyCount = Math.max(1, levels.length-1);
        const storyHeights = [];
        for(let i=0;i<storyCount;i++) storyHeights.push(Math.max(0, (levels?.[i+1]||0) - (levels?.[i]||0)));
        const H = levels.length ? Math.max(...levels) - Math.min(...levels) : 0;
        return { minX,maxX,minZ,maxZ, H, storyCount, storyHeights, levels };
      }catch{ return { minX:0,maxX:0,minZ:0,maxZ:0, H:0, storyCount:1, storyHeights:[] }; }
    };

    const modalMount = () => {
      let host = document.getElementById('modalHost');
      if(host) return host;
      host = document.createElement('div');
      host.id = 'modalHost';
      document.body.appendChild(host);
      return host;
    };

    const openModal = ({ title, html, onApply, applyText='Apply', w=900 }) => {
      const host = modalMount();
      host.innerHTML = `
        <div class="kds-modal-backdrop" data-close="1">
          <div class="kds-modal" style="max-width:${w}px" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
            <div class="kds-modal-h">
              <b>${escapeHtml(title)}</b>
              <button class="btn" type="button" data-close="1">Close</button>
            </div>
            <div class="kds-modal-b">${html}</div>
            <div class="kds-modal-f">
              <div class="note" style="margin-top:0">Tip: values update in real-time. Story forces will override base shear distribution when running analysis.</div>
              <div class="row" style="gap:8px">
                <button class="btn" type="button" data-close="1">Cancel</button>
                <button class="btn primary" type="button" id="kdsApply">${escapeHtml(applyText)}</button>
              </div>
            </div>
          </div>
        </div>
      `;
      const close = () => { host.innerHTML = ''; };
      host.querySelectorAll('[data-close="1"]').forEach(el => el.addEventListener('click', (e) => {
        if(el.classList.contains('kds-modal-backdrop') && e.target !== el) return;
        close();
      }));
      host.querySelector('#kdsApply')?.addEventListener('click', () => {
        try{ onApply?.(); }catch(err){ console.warn(err); }
        close();
      });
      // escape key
      const onKey = (e) => { if(e.key==='Escape'){ close(); document.removeEventListener('keydown', onKey); } };
      document.addEventListener('keydown', onKey);
      return { host, close };
    };

    // KDS Wind (KDS 41 12 00, simplified to match sample workflow)
    // qH = 0.5*rho*VH^2 ; VH = Vo*Kd*Kzr(H)*Kzt*Iw
    // Pf = kz * qH * GD * (Cpe1 - Cpe2)
    // Story force: Fi = Pf * breadth * storyHeight
    const openWindKds = () => {
      const ex = getModelExtents();
      const Bx = Math.max(0.1, ex.maxZ - ex.minZ); // wind along X -> projected width in Z
      const Bz = Math.max(0.1, ex.maxX - ex.minX); // wind along Z -> projected width in X
      const storyHeights = ex.storyHeights.length ? ex.storyHeights : [Math.max(0.1, ex.H||3)];

      const html = `
        <div class="grid2">
          <div>
            <div class="note" style="margin-top:0"><b>Inputs (KDS 41 12 00)</b></div>
            <label class="label">Basic wind speed Vo (m/s)</label>
            <input class="input" id="wVo" value="38" />

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">Exposure</label>
                <select class="input" id="wExp"><option value="B">B</option><option value="C" selected>C</option><option value="D">D</option></select>
              </div>
              <div>
                <label class="label">Air density ρ (kg/m³)</label>
                <input class="input" id="wRho" value="1.225" />
              </div>
            </div>

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">Kd</label>
                <input class="input" id="wKd" value="1.0" />
              </div>
              <div>
                <label class="label">Kzt</label>
                <input class="input" id="wKzt" value="1.0" />
              </div>
            </div>

            <label class="label">Structure type</label>
            <select class="input" id="wStruct">
              <option value="ENCLOSED" selected>Enclosed structure</option>
              <option value="OPEN">Open structure</option>
            </select>

            <label class="label" style="margin-top:8px">Importance factor Iw</label>
            <input class="input" id="wIw" value="1.0" />

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">kz</label>
                <input class="input" id="wKz" value="0.985" />
              </div>
              <div>
                <label class="label">Mean roof height H (m)</label>
                <input class="input" id="wH" value="${(ex.H||10.5).toFixed(3)}" />
              </div>
            </div>

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">GD (X)</label>
                <input class="input" id="wGDx" value="2.12" />
              </div>
              <div>
                <label class="label">GD (Z)</label>
                <input class="input" id="wGDz" value="2.06" />
              </div>
            </div>

            <div id="wSecEnclosed" style="margin-top:8px">
              <div class="grid2">
                <div>
                  <label class="label">Cpe1/Cpe2 (X)</label>
                  <div class="grid2" style="margin-top:6px">
                    <input class="input" id="wCpe1x" value="0.838" />
                    <input class="input" id="wCpe2x" value="-0.350" />
                  </div>
                </div>
                <div>
                  <label class="label">Cpe1/Cpe2 (Z)</label>
                  <div class="grid2" style="margin-top:6px">
                    <input class="input" id="wCpe1z" value="0.788" />
                    <input class="input" id="wCpe2z" value="-0.500" />
                  </div>
                </div>
              </div>
            </div>

            <div id="wSecOpen" style="margin-top:8px; display:none">
              <div class="grid2">
                <div>
                  <label class="label">CD / Cf (X)</label>
                  <input class="input" id="wCDx" value="2.10" />
                </div>
                <div>
                  <label class="label">CD / Cf (Z)</label>
                  <input class="input" id="wCDz" value="2.85" />
                </div>
              </div>
              <div class="note" style="margin-top:6px">Open structure uses Pf = kz · qH · GD · CD. (Enclosed uses Pf = kz · qH · GD · (Cpe1−Cpe2))</div>
            </div>

            <label class="label" style="margin-top:10px">Breadth (m)</label>
            <div class="grid2">
              <div>
                <div class="note" style="margin-top:0">Wind X uses Z-size</div>
                <input class="input" id="wBx" value="${Bx.toFixed(3)}" />
              </div>
              <div>
                <div class="note" style="margin-top:0">Wind Z uses X-size</div>
                <input class="input" id="wBz" value="${Bz.toFixed(3)}" />
              </div>
            </div>
          </div>

          <div>
            <div class="note" style="margin-top:0"><b>Results</b></div>
            <div class="mono" id="wRes" style="font-size:12px; line-height:1.6"></div>
            <div class="note" style="margin-top:10px"><b>Story forces (kN)</b></div>
            <div style="overflow:auto; border:1px solid rgba(148,163,184,0.25); border-radius:12px">
              <table class="table" style="min-width:760px">
                <thead><tr><th>Story</th><th class="r">h (m)</th><th class="r">PfX (kN/m²)</th><th class="r">FX (kN)</th><th class="r">PfZ (kN/m²)</th><th class="r">FZ (kN)</th></tr></thead>
                <tbody id="wRows"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      const { host } = openModal({ title:'Wind loads (KDS) — official (MVP)', html, applyText:'Apply to Analysis' , onApply: () => {
        const fx = Number(host.querySelector('#wBaseX')?.textContent||0) || 0;
        const fz = Number(host.querySelector('#wBaseZ')?.textContent||0) || 0;
        const sfx = (JSON.parse(host.querySelector('#wStoryX')?.value||'[]')||[]);
        const sfz = (JSON.parse(host.querySelector('#wStoryZ')?.value||'[]')||[]);
        const wx = document.getElementById('windX'); if(wx) wx.value = fx.toFixed(3);
        const wz = document.getElementById('windZ'); if(wz) wz.value = fz.toFixed(3);
        lateralStory.windStoryX = sfx;
        lateralStory.windStoryZ = sfz;
        saveAnalysisSettings(p.id, { windX: fx, windZ: fz, windStoryX: sfx, windStoryZ: sfz });
      }});

      const hidden = document.createElement('div');
      hidden.innerHTML = `<span id="wBaseX" hidden></span><span id="wBaseZ" hidden></span><input id="wStoryX" hidden /><input id="wStoryZ" hidden />`;
      host.querySelector('.kds-modal-b')?.appendChild(hidden);

      const KzrAt = (exp, z) => {
        // Matches sample: Kzr = 1 (z<=Zb) else 0.71*z^alpha (up to Zg)
        const E = String(exp||'C').toUpperCase();
        const alpha = (E==='B') ? 0.22 : (E==='D' ? 0.11 : 0.15);
        const Zg = (E==='B') ? 300 : (E==='D' ? 400 : 350);
        const Zb = (E==='B') ? 7 : (E==='D' ? 15 : 10);
        const zz = Math.max(0, Number(z)||0);
        if(zz <= Zb) return 1.0;
        const k = 0.71 * Math.pow(Math.min(zz, Zg), alpha);
        return k;
      };

      const recalc = () => {
        const Vo = Number(host.querySelector('#wVo')?.value||0)||0;
        const exp = String(host.querySelector('#wExp')?.value||'C');
        const rho = Number(host.querySelector('#wRho')?.value||1.225)||1.225;
        const Kd = Number(host.querySelector('#wKd')?.value||1)||1;
        const Kzt = Number(host.querySelector('#wKzt')?.value||1)||1;
        const Iw = Number(host.querySelector('#wIw')?.value||1)||1;
        const kz = Number(host.querySelector('#wKz')?.value||1)||1;
        const H = Number(host.querySelector('#wH')?.value||0)||0;
        const struct = String(host.querySelector('#wStruct')?.value||'ENCLOSED');
        const GDx = Number(host.querySelector('#wGDx')?.value||0)||0;
        const GDz = Number(host.querySelector('#wGDz')?.value||0)||0;
        const Cpe1x = Number(host.querySelector('#wCpe1x')?.value||0)||0;
        const Cpe2x = Number(host.querySelector('#wCpe2x')?.value||0)||0;
        const Cpe1z = Number(host.querySelector('#wCpe1z')?.value||0)||0;
        const Cpe2z = Number(host.querySelector('#wCpe2z')?.value||0)||0;
        const CDx = Number(host.querySelector('#wCDx')?.value||0)||0;
        const CDz = Number(host.querySelector('#wCDz')?.value||0)||0;
        const Bx2 = Math.max(0.01, Number(host.querySelector('#wBx')?.value||0)||0);
        const Bz2 = Math.max(0.01, Number(host.querySelector('#wBz')?.value||0)||0);

        const KHr = KzrAt(exp, H);
        const VH = Vo * Kd * KHr * Kzt * Iw;
        const qH_N = 0.5 * rho * VH*VH; // N/m^2
        const qH = qH_N/1000; // kN/m^2

        const PfX = (struct === 'OPEN') ? (kz * qH * GDx * CDx) : (kz * qH * GDx * (Cpe1x - Cpe2x));
        const PfZ = (struct === 'OPEN') ? (kz * qH * GDz * CDz) : (kz * qH * GDz * (Cpe1z - Cpe2z));

        const fxStory = storyHeights.map(h => PfX * Bx2 * h);
        const fzStory = storyHeights.map(h => PfZ * Bz2 * h);
        const baseX = fxStory.reduce((a,b)=>a+b,0);
        const baseZ = fzStory.reduce((a,b)=>a+b,0);

        host.querySelector('#wBaseX').textContent = String(baseX);
        host.querySelector('#wBaseZ').textContent = String(baseZ);
        host.querySelector('#wStoryX').value = JSON.stringify(fxStory.map(v => +(+v).toFixed(6)));
        host.querySelector('#wStoryZ').value = JSON.stringify(fzStory.map(v => +(+v).toFixed(6)));

        const rr = host.querySelector('#wRes');
        if(rr){
          const mode = (struct === 'OPEN') ? `OPEN (CDx=${CDx.toFixed(3)}, CDz=${CDz.toFixed(3)})` : `ENCLOSED (ΔCpeX=${(Cpe1x-Cpe2x).toFixed(3)}, ΔCpeZ=${(Cpe1z-Cpe2z).toFixed(3)})`;
          rr.innerHTML = `${mode}<br/>KHr=${KHr.toFixed(4)} · VH=${VH.toFixed(3)} m/s<br/>qH=${qH.toFixed(6)} kN/m²<br/>PfX=${PfX.toFixed(6)} kN/m² · PfZ=${PfZ.toFixed(6)} kN/m²<br/>Base shear X=${baseX.toFixed(3)} kN · Z=${baseZ.toFixed(3)} kN`;
        }

        const tb = host.querySelector('#wRows');
        if(tb){
          tb.innerHTML = storyHeights.map((h,i)=>`<tr><td class="mono">${i+1}</td><td class="r mono">${h.toFixed(3)}</td><td class="r mono">${PfX.toFixed(6)}</td><td class="r mono">${(fxStory[i]||0).toFixed(3)}</td><td class="r mono">${PfZ.toFixed(6)}</td><td class="r mono">${(fzStory[i]||0).toFixed(3)}</td></tr>`).join('');
        }
      };

      const updateStructUi = (setDefaults=false) => {
        const struct = String(host.querySelector('#wStruct')?.value||'ENCLOSED');
        const secEnc = host.querySelector('#wSecEnclosed');
        const secOpen = host.querySelector('#wSecOpen');
        if(secEnc) secEnc.style.display = (struct === 'OPEN') ? 'none' : '';
        if(secOpen) secOpen.style.display = (struct === 'OPEN') ? '' : 'none';

        if(setDefaults){
          if(struct === 'OPEN'){
            const kz = host.querySelector('#wKz'); if(kz) kz.value = '0.700';
            const gdx = host.querySelector('#wGDx'); if(gdx) gdx.value = '1.000';
            const gdz = host.querySelector('#wGDz'); if(gdz) gdz.value = '1.000';
            const cdx = host.querySelector('#wCDx'); if(cdx) cdx.value = '2.10';
            const cdz = host.querySelector('#wCDz'); if(cdz) cdz.value = '2.85';
          }else{
            const kz = host.querySelector('#wKz'); if(kz) kz.value = '0.985';
            const gdx = host.querySelector('#wGDx'); if(gdx) gdx.value = '2.12';
            const gdz = host.querySelector('#wGDz'); if(gdz) gdz.value = '2.06';
            const c1x = host.querySelector('#wCpe1x'); if(c1x) c1x.value = '0.838';
            const c2x = host.querySelector('#wCpe2x'); if(c2x) c2x.value = '-0.350';
            const c1z = host.querySelector('#wCpe1z'); if(c1z) c1z.value = '0.788';
            const c2z = host.querySelector('#wCpe2z'); if(c2z) c2z.value = '-0.500';
          }
        }
      };

      host.querySelector('#wStruct')?.addEventListener('change', () => { updateStructUi(true); recalc(); });
      host.querySelectorAll('input,select').forEach(inp => inp.addEventListener('input', recalc));
      host.querySelectorAll('select').forEach(sel => sel.addEventListener('change', recalc));
      updateStructUi(false);
      recalc();
    };

    // KDS Seismic (ELF): compute SDS/SD1/T/Cs, then V=Cs*W, distribute to stories by wi*hi^k
    const openSeismicKds = () => {
      const ex = getModelExtents();
      const storyCount = ex.storyCount;
      const levels = ex.levels || [];
      const storyHeights = ex.storyHeights.length ? ex.storyHeights : Array.from({length:storyCount}, () => 3.0);
      const hi = Array.from({length:storyCount}, (_,i) => Math.max(0.1, (levels?.[i+1]|| (i+1)*3) )); // height to level i+1 (m)

      const defaultW = 10000; // kN (user edits)
      const html = `
        <div class="grid2">
          <div>
            <div class="note" style="margin-top:0"><b>Inputs (KDS 41 17 00 ELF)</b></div>

            <div class="grid2">
              <div>
                <label class="label">S (EPA)</label>
                <input class="input" id="sS" value="0.22" />
              </div>
              <div>
                <label class="label">Ie</label>
                <input class="input" id="sIe" value="1.5" />
              </div>
            </div>

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">Fa</label>
                <input class="input" id="sFa" value="1.38" />
              </div>
              <div>
                <label class="label">Fv</label>
                <input class="input" id="sFv" value="1.38" />
              </div>
            </div>

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">R</label>
                <input class="input" id="sR" value="3.0" />
              </div>
              <div>
                <label class="label">TL (s)</label>
                <input class="input" id="sTL" value="5.0" />
              </div>
            </div>

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">Ct</label>
                <input class="input" id="sCt" value="0.0724" />
              </div>
              <div>
                <label class="label">x exponent</label>
                <input class="input" id="sx" value="0.8" />
              </div>
            </div>

            <label class="label" style="margin-top:10px">Effective seismic weight W (kN)</label>
            <input class="input" id="eW" value="${defaultW}" />

            <div class="grid2" style="margin-top:8px">
              <div>
                <label class="label">Cs (auto)</label>
                <input class="input" id="eCs" value="0.0" />
              </div>
              <div>
                <label class="label">k exponent</label>
                <input class="input" id="ek" value="1.0" />
              </div>
            </div>
            <div class="note" style="margin-top:8px">Cs is computed from SDS/SD1, R, Ie, T and clamped by KDS min/max.</div>

            <div class="note" style="margin-top:10px"><b>Story weights wi (kN)</b> <span class="mono" style="opacity:.65">(sum = W)</span></div>
            <div style="overflow:auto; border:1px solid rgba(148,163,184,0.25); border-radius:12px">
              <table class="table" style="min-width:520px">
                <thead><tr><th>Story</th><th class="r">hi (m)</th><th class="r">wi (kN)</th></tr></thead>
                <tbody id="eWrows"></tbody>
              </table>
            </div>
            <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap">
              <button class="btn" type="button" id="btnWequal">Equal split</button>
              <button class="btn" type="button" id="btnWnorm">Normalize to W</button>
            </div>
          </div>

          <div>
            <div class="note" style="margin-top:0"><b>Results</b></div>
            <div class="mono" id="eRes" style="font-size:12px; line-height:1.6"></div>
            <div class="note" style="margin-top:10px"><b>Story forces (kN)</b></div>
            <div style="overflow:auto; border:1px solid rgba(148,163,184,0.25); border-radius:12px">
              <table class="table" style="min-width:560px">
                <thead><tr><th>Story</th><th class="r">FX</th><th class="r">FZ</th></tr></thead>
                <tbody id="eFrows"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      const { host } = openModal({ title:'Seismic loads (KDS) — ELF (official MVP)', html, applyText:'Apply to Analysis', onApply: () => {
        const base = Number(host.querySelector('#eBase')?.textContent||0) || 0;
        const sf = (JSON.parse(host.querySelector('#eStory')?.value||'[]')||[]);
        const exx = document.getElementById('eqX'); if(exx) exx.value = base.toFixed(3);
        const ezz = document.getElementById('eqZ'); if(ezz) ezz.value = base.toFixed(3);
        lateralStory.eqStoryX = sf;
        lateralStory.eqStoryZ = sf;
        saveAnalysisSettings(p.id, { eqX: base, eqZ: base, eqStoryX: sf, eqStoryZ: sf });
      }});

      const hidden = document.createElement('div');
      hidden.innerHTML = `<span id="eBase" hidden></span><input id="eStory" hidden />`;
      host.querySelector('.kds-modal-b')?.appendChild(hidden);

      const renderWi = () => {
        const tb = host.querySelector('#eWrows');
        if(!tb) return;
        // init if none
        let wi = Array.isArray(lateralStory._tmpWi) ? lateralStory._tmpWi : null;
        if(!wi || wi.length !== storyCount){
          const W = Number(host.querySelector('#eW')?.value||0)||0;
          wi = Array.from({length:storyCount}, ()=> (W/storyCount));
          lateralStory._tmpWi = wi;
        }
        tb.innerHTML = wi.map((w,i)=>`<tr>
          <td class="mono">${i+1}</td>
          <td class="r mono">${(hi[i]||0).toFixed(3)}</td>
          <td class="r"><input class="input" data-wi="${i}" value="${(+w).toFixed(3)}" style="max-width:140px; text-align:right" /></td>
        </tr>`).join('');
        tb.querySelectorAll('input[data-wi]').forEach(inp => inp.addEventListener('input', () => {
          const idx = Number(inp.getAttribute('data-wi'));
          const v = Number(inp.value||0)||0;
          const arr = lateralStory._tmpWi || [];
          arr[idx] = v;
          lateralStory._tmpWi = arr;
          recalc();
        }));
      };

      const normalizeWi = () => {
        const W = Number(host.querySelector('#eW')?.value||0)||0;
        const wi = (lateralStory._tmpWi||[]).map(v => Number(v||0)||0);
        const sum = wi.reduce((a,b)=>a+b,0) || 1;
        lateralStory._tmpWi = wi.map(v => v * (W/sum));
        renderWi();
        recalc();
      };

      const equalWi = () => {
        const W = Number(host.querySelector('#eW')?.value||0)||0;
        lateralStory._tmpWi = Array.from({length:storyCount}, ()=> (W/storyCount));
        renderWi();
        recalc();
      };

      host.querySelector('#btnWequal')?.addEventListener('click', equalWi);
      host.querySelector('#btnWnorm')?.addEventListener('click', normalizeWi);

      const recalc = () => {
        const W = Number(host.querySelector('#eW')?.value||0)||0;
        const k = Number(host.querySelector('#ek')?.value||1)||1;

        // KDS parameters
        const S = Number(host.querySelector('#sS')?.value||0)||0;
        const Ie = Number(host.querySelector('#sIe')?.value||1)||1;
        const Fa = Number(host.querySelector('#sFa')?.value||0)||0;
        const Fv = Number(host.querySelector('#sFv')?.value||0)||0;
        const R = Number(host.querySelector('#sR')?.value||1)||1;
        const TL = Number(host.querySelector('#sTL')?.value||5)||5;
        const Ct = Number(host.querySelector('#sCt')?.value||0)||0;
        const xexp = Number(host.querySelector('#sx')?.value||0)||0;

        const hn = Math.max(0.1, Number(ex.H||0) || 0.1);
        const T = Ct * Math.pow(hn, xexp);
        const SDS = S * 2.5 * Fa * (2/3);
        const SD1 = S * Fv * (2/3);

        const RdivIe = (R / Ie);
        const cs_raw = (RdivIe>0) ? (SDS / RdivIe) : 0;
        const cs_max = (RdivIe>0 && T>1e-9) ? (SD1 / (RdivIe * T)) : 0;
        const cs_min = Math.max(0.01, 0.044*SDS*Ie);
        const Cs = (cs_max>0) ? Math.min(Math.max(cs_raw, cs_min), cs_max) : Math.max(cs_raw, cs_min);

        const csEl = host.querySelector('#eCs');
        if(csEl) csEl.value = Cs.toFixed(6);

        const V = Cs * W;

        // wi distribution (normalize to W)
        const wi0 = (lateralStory._tmpWi||[]).map(v => Number(v||0)||0);
        const sum0 = wi0.reduce((a,b)=>a+b,0) || 1;
        const wi = wi0.map(w => (w/sum0)*W);

        const denom = wi.reduce((s,w,idx)=> s + w*Math.pow(Math.max(0.1,hi[idx]||0), k), 0) || 1;
        const Fi = wi.map((w,idx)=> (w*Math.pow(Math.max(0.1,hi[idx]||0),k)/denom) * V);

        host.querySelector('#eBase').textContent = String(V);
        host.querySelector('#eStory').value = JSON.stringify(Fi.map(v => +(+v).toFixed(6)));

        const rr = host.querySelector('#eRes');
        if(rr){ rr.innerHTML = `hn=${hn.toFixed(3)}m · T=${T.toFixed(4)}s<br/>SDS=${SDS.toFixed(4)} · SD1=${SD1.toFixed(4)}<br/>Cs=${Cs.toFixed(6)} (min ${cs_min.toFixed(6)}, max ${cs_max.toFixed(6)})<br/>V = Cs·W = ${V.toFixed(3)} kN`; }

        const tb = host.querySelector('#eFrows');
        if(tb){ tb.innerHTML = Fi.map((f,i)=>`<tr><td class="mono">${i+1}</td><td class="r mono">${f.toFixed(3)}</td><td class="r mono">${f.toFixed(3)}</td></tr>`).join(''); }
      };

      host.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { renderWi(); recalc(); }));
      renderWi();
      recalc();
    };

    document.getElementById('btnWindCalc')?.addEventListener('click', openWindKds);
    document.getElementById('btnSeismicCalc')?.addEventListener('click', openSeismicKds);

    const run = async () => {
      setStatus('building payload…');
      showRunHelp('');
      const ov = document.getElementById('analysisOverlay');
      if(ov) ov.hidden = false;

      try{
        const qLive = parseFloat((document.getElementById('qLive')?.value || '3').toString()) || 0;
        const qSnow = parseFloat((document.getElementById('qSnow')?.value || '0').toString()) || 0;
        const windX = parseFloat((document.getElementById('windX')?.value || '0').toString()) || 0;
        const windZ = parseFloat((document.getElementById('windZ')?.value || '0').toString()) || 0;
        const eqX = parseFloat((document.getElementById('eqX')?.value || '0').toString()) || 0;
        const eqZ = parseFloat((document.getElementById('eqZ')?.value || '0').toString()) || 0;
        const livePreset = (document.getElementById('livePreset')?.value || '3.0').toString();
        const supportMode = (document.getElementById('supportMode')?.value || 'PINNED').toString();
        const designMethod = (document.getElementById('designMethod')?.value || 'STRENGTH').toString();
        const comboMode = (document.getElementById('comboMode')?.value || 'ENVELOPE').toString();
        const supportNodesVal = (document.getElementById('supportNodes')?.value || '').toString();
        const analysisScale = Number(document.getElementById('analysisScale2')?.value || 120);
        const checks = { main: (document.getElementById('chkMain')?.checked !== false), sub: (document.getElementById('chkSub')?.checked !== false), col: (document.getElementById('chkCol')?.checked !== false) };

        saveAnalysisSettings(p.id, {
          supportMode, designMethod, comboMode,
          qLive, qSnow,
          windX, windZ, eqX, eqZ,
          windStoryX: lateralStory.windStoryX,
          windStoryZ: lateralStory.windStoryZ,
          eqStoryX: lateralStory.eqStoryX,
          eqStoryZ: lateralStory.eqStoryZ,
          livePreset, checks,
          supportNodes: supportNodesVal,
          analysisScale,
        });

        const connCfg = loadConnSettings(p.id);
        const payload = buildAnalysisPayload(model, qLive, supportMode, connCfg, {
          qSnow, windX, windZ, eqX, eqZ,
          windStoryX: lateralStory.windStoryX,
          windStoryZ: lateralStory.windStoryZ,
          eqStoryX: lateralStory.eqStoryX,
          eqStoryZ: lateralStory.eqStoryZ,
          designMethod,
        });
        // Keep helper fields (_engineIds/_kinds/_connModes) locally for UI computations.
        lastPayload = payload;
        // update id maps (engine <-> analysis)
        try{
          analysisIdByEngineId = {};
          engineIdByAnalysisId = {};
          const ids = payload?._engineIds || [];
          ids.forEach((eid, idx) => {
            const aid = String(idx+1);
            const se = String(eid);
            analysisIdByEngineId[se] = aid;
            engineIdByAnalysisId[aid] = se;
          });
        }catch{}
        // strip helper before sending (but keep local payload intact)
        const payloadSend = structuredClone(payload);
        try{ delete payloadSend._engineIds; delete payloadSend._kinds; delete payloadSend._connModes; }catch{}

        // supports override
        const supTxt = (document.getElementById('supportNodes')?.value || '').trim();
        if(supTxt){
          const ids = supTxt.split(/[^0-9A-Za-z_:-]+/g).map(s=>s.trim()).filter(Boolean);
          const fixed = supportMode.toUpperCase()==='FIXED';
          payload.supports = ids.map(id => ({ nodeId:id, fix:{ DX:true,DY:true,DZ:true,RX:fixed,RY:fixed,RZ:fixed } }));
          payloadSend.supports = payload.supports;
        }

        // If user selects a single combo, reduce the combo list.
        if(String(comboMode).toUpperCase() !== 'ENVELOPE'){
          payloadSend.combos = (payloadSend.combos||[]).filter(c => String(c.name)===String(comboMode));
          if(!payloadSend.combos.length){
            payloadSend.combos = [{ name: String(comboMode), factors: { D:1.0, L:1.0 } }];
          }
        }
        setStatus('calling solver…');

        const r = await fetch('/prebim/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payloadSend),
        });
        const res = await r.json().catch(() => null);
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        if(!res || res.ok !== true){
          const note = res?.note || 'Analysis failed.';
          setStatus('failed');
          renderResultsTable(null);

          if(String(note).toLowerCase().includes('singular')){
            showRunHelp(`
              <div class="card" style="margin-top:10px; padding:10px; border-color: rgba(239,68,68,0.25)">
                <b style="display:block; margin-bottom:6px">Unstable model (singular)</b>
                <div class="note" style="margin-top:0">Likely causes: too many hinges, insufficient supports, disconnected parts.</div>
                <div class="row" style="margin-top:8px; gap:8px; flex-wrap:wrap">
                  <button class="btn" id="btnRetryFixedSupports" type="button">Retry: FIXED supports</button>
                  <button class="btn" id="btnRetryAllFixedConn" type="button">Retry: all FIXED connections</button>
                </div>
                <div class="note" style="margin-top:8px">Retries run temporarily (won't overwrite your saved settings).</div>
              </div>
            `);

            document.getElementById('btnRetryFixedSupports')?.addEventListener('click', async () => {
              const prev = document.getElementById('supportMode')?.value;
              if(document.getElementById('supportMode')) document.getElementById('supportMode').value = 'FIXED';
              persist();
              await run();
              if(document.getElementById('supportMode') && prev) document.getElementById('supportMode').value = prev;
              persist();
            });

            document.getElementById('btnRetryAllFixedConn')?.addEventListener('click', async () => {
              const cfg = loadConnSettings(p.id);
              cfg.members = cfg.members || {};
              for(const mm of (members||[])) cfg.members[String(mm.id)] = { i:'FIXED', j:'FIXED' };
              // TEMP: apply markers only; do not persist
              try{ view.setConnectionMarkers?.(members, cfg); }catch{}
              const savedSel = loadConnSettings(p.id);
              await run();
              // restore
              try{ view.setConnectionMarkers?.(members, savedSel); }catch{}
            });
          }

          alert(note);
          return;
        }

        setStatus('rendering results…');
        view.setAnalysisResult?.(res, payload);
        const sc = Number(document.getElementById('analysisScale2')?.value || 120);
        view.setAnalysisScale?.(sc);

        view.setSupportMarkers?.(payload.supports, payload.nodes, supportMode);

        renderResultsTable(res);

        // highlight FAIL members in 3D (deflection util > 1)
        try{
          const rMain = Number(document.getElementById('deflMain')?.value || 300) || 300;
          const rSub = Number(document.getElementById('deflSub')?.value || 300) || 300;
          const kinds = payload?._kinds || [];
          const chkMain = (document.getElementById('chkMain')?.checked !== false);
          const chkSub = (document.getElementById('chkSub')?.checked !== false);
          const nodeById = new Map((payload?.nodes||[]).map(n => [String(n.id), n]));
          const badE = [];
          for(let idx=0; idx<(payload?.members||[]).length; idx++){
            const mem = payload.members[idx];
            const mr = res?.members?.[String(mem.id)];
            if(!mr) continue;
            const kind = String(kinds[idx] || '');
            if((kind==='beamX' || kind==='beamY') && !chkMain) continue;
            if(kind==='subBeam' && !chkSub) continue;
            const ratio = (kind==='subBeam') ? rSub : (kind==='beamX' || kind==='beamY' ? rMain : null);
            if(!ratio) continue;
            const ni = nodeById.get(String(mem.i));
            const nj = nodeById.get(String(mem.j));
            if(!ni || !nj) continue;
            const L = Math.hypot(ni.x-nj.x, ni.z-nj.z);
            if(L<=1e-9) continue;
            const allow = L/ratio;
            const dy = Math.abs(Number(mr.dyAbsMax)||0);
            if(allow>0 && dy/allow > 1.0 + 1e-9){
              const eid = engineIdByAnalysisId[String(mem.id)];
              if(eid) badE.push(eid);
            }
          }
          view.setFailMembers?.(badE);
        }catch{}

        // PASS/FAIL badge (deflection)
        try{
          const chk = checkDeflection(res, payload);
          const el = document.getElementById('analysisHudState');
          if(el){
            const w = chk.worst;
            const ok = !!w.ok;
            const denom = (w.kind==='subBeam') ? chk.rSub : chk.rMain;
            el.textContent = ok
              ? `PASS · defl ${w.dy.toFixed(6)} ≤ L/${denom} (${w.allow.toFixed(6)} m) · mem ${w.memberId}`
              : `FAIL · defl ${w.dy.toFixed(6)} > L/${denom} (${w.allow.toFixed(6)} m) · mem ${w.memberId}`;
            el.style.color = ok ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)';
          }

          // auto-select + scroll worst member (only if user hasn't selected one)
          const savedSel = loadAnalysisSettings(p.id)?.selectedMemberEngineId;
          if(!savedSel && chk.worst?.memberId){
            const aid = String(chk.worst.memberId);
            const eid = engineIdByAnalysisId[aid] || '';
            if(eid){
              try{ view.setSelection?.([eid]); }catch{}
            }
            highlightMemberRow(aid);
            renderMemberDetail(aid);
          }
        }catch{}

        setStatus(`done (max ${(Number(res?.maxDisp?.value)||0).toFixed(6)} m)`);
      } catch (e) {
        console.error(e);
        alert('Analysis failed: ' + (e?.message || e));
        setStatus('failed');
      } finally {
        const ov = document.getElementById('analysisOverlay');
        if(ov) ov.hidden = true;
      }
    };

    document.getElementById('btnRunAnalysis')?.addEventListener('click', run);
    document.getElementById('btnHudRun')?.addEventListener('click', run);
    // persist setting changes
    const persist = (patch={}) => {
      const supportMode = (document.getElementById('supportMode')?.value || 'PINNED').toString();
      const designMethod = (document.getElementById('designMethod')?.value || 'STRENGTH').toString();
      const comboMode = (document.getElementById('comboMode')?.value || 'ENVELOPE').toString();
      const qLive = parseFloat((document.getElementById('qLive')?.value || '3').toString()) || 0;
      const qSnow = parseFloat((document.getElementById('qSnow')?.value || '0').toString()) || 0;
      const windX = parseFloat((document.getElementById('windX')?.value || '0').toString()) || 0;
      const windZ = parseFloat((document.getElementById('windZ')?.value || '0').toString()) || 0;
      const eqX = parseFloat((document.getElementById('eqX')?.value || '0').toString()) || 0;
      const eqZ = parseFloat((document.getElementById('eqZ')?.value || '0').toString()) || 0;
      const supportNodes = (document.getElementById('supportNodes')?.value || '').toString();
      const analysisScale = Number(document.getElementById('analysisScale2')?.value || 120);
      const editSupports = !!document.getElementById('editSupports')?.checked;
      const deflMain = Number(document.getElementById('deflMain')?.value || 300) || 300;
      const deflSub = Number(document.getElementById('deflSub')?.value || 300) || 300;
      const driftX = Number(document.getElementById('driftX')?.value || 200) || 200;
      const driftZ = Number(document.getElementById('driftZ')?.value || 200) || 200;
      const colTop = Number(document.getElementById('colTop')?.value || 200) || 200;
      const failHighlightOn = (document.getElementById('failHighlight')?.checked !== false);
      const checks = { main: (document.getElementById('chkMain')?.checked !== false), sub: (document.getElementById('chkSub')?.checked !== false), col: (document.getElementById('chkCol')?.checked !== false) };
      saveAnalysisSettings(p.id, { supportMode, designMethod, comboMode, qLive, qSnow, windX, windZ, eqX, eqZ, supportNodes, analysisScale, editSupports, deflMain, deflSub, driftX, driftZ, colTop, failHighlightOn, checks, ...patch });
    };
    ['supportMode','designMethod','comboMode','qLive','qSnow','windX','windZ','eqX','eqZ','supportNodes','deflMain','deflSub','driftX','driftZ','colTop'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => persist());
      document.getElementById(id)?.addEventListener('input', () => persist());
    });
    ['chkMain','chkSub','chkCol'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => persist());
    });

    document.getElementById('failHighlight')?.addEventListener('change', () => {
      const on = document.getElementById('failHighlight')?.checked !== false;
      try{ view.setFailHighlightEnabled?.(on); }catch{}
      document.body.classList.toggle('failhl-off', !on);
      persist();
    });
    // apply initial state
    try{
      const on = document.getElementById('failHighlight')?.checked !== false;
      view.setFailHighlightEnabled?.(on);
      document.body.classList.toggle('failhl-off', !on);
    }catch{}

    document.getElementById('analysisScale2')?.addEventListener('input', (ev) => {
      const v = Number(ev.target?.value || 120);
      view.setAnalysisScale?.(v);
      persist();
    });

    // resizable splitters (analysis)
    const splitterT = document.getElementById('splitterT');
    const splitterAR = document.getElementById('splitterAR');
    const layout = document.querySelector('.analysis-layout');

    const bindSplitter = (handle, onMoveFn, onDone) => {
      if(!handle || !layout) return;
      let dragging = false;
      const onDown = (ev) => { dragging = true; ev.preventDefault(); };
      const onUp = () => { if(!dragging) return; dragging = false; onDone && onDone(); };
      const onMove = (ev) => { if(dragging) onMoveFn(ev); };
      handle.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointermove', onMove);
    };

    bindSplitter(splitterT, (ev) => {
      const rect = layout.getBoundingClientRect();
      const minTools = 180;
      const maxTools = Math.max(minTools, rect.width * 0.45);
      const x = ev.clientX - rect.left;
      const w = Math.max(minTools, Math.min(maxTools, x - 20));
      document.documentElement.style.setProperty('--w-tools', `${w}px`);
      view?.resize?.();
    }, () => {
      const wTools = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--w-tools')) || 240;
      persist({ wTools });
    });

    bindSplitter(splitterAR, (ev) => {
      const rect = layout.getBoundingClientRect();
      const toolsW = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--w-tools')) || 240);
      const minRight = 260;
      const maxRight = Math.max(minRight, rect.width - toolsW - 260);
      const x = ev.clientX - rect.left;
      const proposedRight = Math.max(minRight, Math.min(maxRight, rect.width - x - 30));
      document.documentElement.style.setProperty('--w-right', `${proposedRight}px`);
      view?.resize?.();
    }, () => {
      const wRight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--w-right')) || 320;
      persist({ wRight });
    });

    const curSupportIds = () => {
      const txt = (document.getElementById('supportNodes')?.value || '').trim();
      if(!txt) return [];
      return txt.split(/[^0-9A-Za-z_:-]+/g).map(s=>s.trim()).filter(Boolean);
    };

    // support markers shown even before run (based on default base supports)
    const applyAutoSupports = () => {
      const payload0 = buildAnalysisPayload(model, parseFloat(document.getElementById('qLive')?.value||'3')||0, (document.getElementById('supportMode')?.value||'PINNED'));
      const ids = (payload0.supports||[]).map(s => s.nodeId);
      const ta = document.getElementById('supportNodes');
      if(ta) ta.value = ids.join(',');
      persist();
      // show markers + base nodes
      view.setSupportMarkers?.(payload0.supports, payload0.nodes, (document.getElementById('supportMode')?.value||'PINNED'));
      view.setBaseNodes?.(payload0.nodes, ids, (document.getElementById('supportMode')?.value||'PINNED'));
    };

    const refreshSupportViz = () => {
      try{
        const qLive0 = parseFloat((document.getElementById('qLive')?.value||'3').toString())||0;
        const supportMode0 = (document.getElementById('supportMode')?.value||'PINNED').toString();
        const connCfg = loadConnSettings(p.id);
        const payload0 = buildAnalysisPayload(model, qLive0, supportMode0, connCfg);
        const ids = curSupportIds();
        const fixed = supportMode0.toUpperCase()==='FIXED';
        payload0.supports = ids.map(id => ({ nodeId:id, fix:{ DX:true,DY:true,DZ:true,RX:fixed,RY:fixed,RZ:fixed } }));
        view.setSupportMarkers?.(payload0.supports, payload0.nodes, supportMode0);
        view.setBaseNodes?.(payload0.nodes, ids, supportMode0);
        view.setConnectionMarkers?.(members, connCfg);
      }catch{}
    };

    try{ applyAutoSupports(); }catch{}
    document.getElementById('btnSupportsAuto')?.addEventListener('click', () => { try{ applyAutoSupports(); }catch{} });
    document.getElementById('supportMode')?.addEventListener('change', refreshSupportViz);
    document.getElementById('supportNodes')?.addEventListener('input', refreshSupportViz);

    // toggle edit supports mode
    const applyEditSupports = () => {
      const on = !!document.getElementById('editSupports')?.checked;
      view.setSupportEditMode?.(on, {
        memberPickEnabled: !on,
        onSupportToggle: (nid) => {
          const ids = new Set(curSupportIds().map(String));
          if(ids.has(String(nid))) ids.delete(String(nid));
          else ids.add(String(nid));
          const ta = document.getElementById('supportNodes');
          if(ta) ta.value = Array.from(ids).join(',');
          persist();
          refreshSupportViz();
        }
      });
      // when entering edit mode, clear any member selection for clarity
      if(on) view.clearSelection?.();
      persist();
      refreshSupportViz();
    };

    document.getElementById('editSupports')?.addEventListener('change', applyEditSupports);
    // apply initial state from restored checkbox
    applyEditSupports();
  })();
}

function renderEditor(projectId){
  setMode('editor');
  // default UI state
  document.body.classList.add('qty-collapsed');
  document.body.classList.add('ps-hidden');
  const p = findProjectById(projectId);
  if(!p){
    setTopbarSubtitle('projects');
    setTopbarActions(`
      <a class="pill" href="#/">Back</a>
      <a class="pill" href="/">Home</a>
    `);
    const root = document.getElementById('app');
    if(root) root.innerHTML = `<div class="card panel" style="margin:10px">Project not found.</div>`;
    return;
  }

  setTopbarSubtitle(p.name || 'project');
  document.title = `PreBIM-SteelStructure — ${p.name || 'project'}`;
  setTopbarActions(`
    <a class="pill" href="#/">Back</a>

    <span class="export-wrap" style="position:relative; display:inline-block">
      <button class="pill" id="btnExportMenu" type="button">Export ▾</button>
      <div class="export-menu" id="exportMenu" hidden>
        <button class="btn" id="btnExportStaad" type="button">STAAD Export</button>
        <button class="btn" id="btnExportIfc" type="button">IFC Export</button>
        <button class="btn" id="btnExportData" type="button">DATA Export</button>
        <button class="btn" id="btnExportDxf" type="button">DXF Export</button>
      </div>
    </span>

    <button class="pill" id="btnManual" type="button">Manual</button>
    <button class="pill" id="btnSave" type="button">Save</button>
  `);

  const root = document.getElementById('app');
  if(!root) return;

  root.innerHTML = `
    <section class="editor" aria-label="Editor">
      <aside class="pane tools">
        <div class="pane-h"><b>Tools</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">v0</span></div>
        <div class="pane-b">
          <div class="acc">
            <button class="acc-btn" type="button" data-acc="grid">Grid <span class="chev" id="chevGrid">▾</span></button>
            <div class="acc-panel open" id="panelGrid">
              <label class="label">X spans (mm, comma)</label>
              <input id="spansX" class="input" placeholder="e.g. 6000,6000,8000" />

              <label class="label">Y spans (mm, comma)</label>
              <input id="spansY" class="input" placeholder="e.g. 6000,6000" />

              <div class="note">Grid count is derived automatically: (spans + 1).</div>
              <div class="note" style="margin-top:8px">Changes apply automatically.</div>
            </div>

            <button class="acc-btn" type="button" data-acc="levels">Level <span class="chev" id="chevLevels">▾</span></button>
            <div class="acc-panel" id="panelLevels">
              <div id="levelsList"></div>
              <div class="row" style="margin-top:10px">
                <button class="btn" id="btnAddLevel" type="button">Add level</button>
              </div>
              <div class="note" style="margin-top:8px">Changes apply automatically.</div>
              <div class="note">Levels are absolute elevations (mm). Example: 4200, 8400</div>
            </div>

            <button class="acc-btn" type="button" data-acc="sub">Sub-beam <span class="chev" id="chevSub">▾</span></button>
            <div class="acc-panel" id="panelSub">
              <div class="row" style="margin-top:0">
                <label class="badge" style="cursor:pointer"><input id="optSub" type="checkbox" style="margin:0 8px 0 0" /> Enable</label>
                <input id="subCount" class="input" style="max-width:120px" type="number" min="0" step="1" placeholder="Count / bay" />
              </div>
              <div class="grid2">
                <div>
                  <label class="label">Shape</label>
                  <select id="subShape" class="input"></select>
                </div>
                <div>
                  <label class="label">Profile</label>
                  <select id="subSize" class="input"></select>
                </div>
              </div>
              <div class="note" style="margin-top:8px">Changes apply automatically.</div>
            </div>

            <!-- Joist menu removed for now -->

            <!-- Bracing controls moved out of Tools (see right Help/Notes pane) -->

            <button class="acc-btn" type="button" data-acc="profile">Profile <span class="chev" id="chevProfile">▾</span></button>
            <div class="acc-panel" id="panelProfile">
              <label class="label">Standard (all)</label>
              <select id="stdAll" class="input">
                <option value="KS">KR - KS</option>
                <option value="AISC">US - AISC (stub)</option>
              </select>

              <div class="grid2">
                <div>
                  <label class="label">Column (common) shape</label>
                  <select id="colShape" class="input">
                    <option>H</option><option>I</option><option>RHS</option><option>CHS</option>
                  </select>
                </div>
                <div>
                  <label class="label">Beam (common) shape</label>
                  <select id="beamShape" class="input">
                    <option>H</option><option>I</option><option>RHS</option><option>CHS</option>
                  </select>
                </div>
              </div>

              <div class="grid2">
                <div>
                  <label class="label">Column profile</label>
                  <select id="colSize" class="input"></select>
                </div>
                <div>
                  <label class="label">Beam profile</label>
                  <select id="beamSize" class="input"></select>
                </div>
              </div>

              <div class="grid2">
                <div>
                  <label class="label">Sub-beam profile</label>
                  <select id="subSizeMirror" class="input" disabled></select>
                </div>
                <div>
                  <label class="label">(use Bracing menu)</label>
                  <select class="input" disabled><option>—</option></select>
                </div>
              </div>

              <div class="note">Profiles are stored in the project. Changes apply automatically.</div>
            </div>
          </div>

          <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">
            <button class="btn" id="btnToggleQty2" type="button">Quantities</button>
          </div>
        </div>
      </aside>

      <div class="splitter" id="splitterT" title="Drag to resize"></div>

      <section class="pane view3d">
        <div class="pane-h">
          <b>3D View</b>
          <div class="row" style="margin-top:0; gap:6px">
            <button class="pill" id="btn3dGuides" type="button">Guides</button>
            <button class="pill" id="btn3dSection" type="button">Section Box</button>
            <button class="pill" id="btnPopBr" type="button">Bracing</button>
            <button class="pill" id="btnPopOv" type="button">Override</button>
          </div>
        </div>
        <div class="pane-b" id="view3dWrap" style="position:relative">
          <div id="view3d"></div>
          <button class="pill" id="btnAnalysis" type="button" style="position:absolute; right:12px; bottom:12px; z-index:12">Analysis</button>
          <div class="analysis-overlay" id="analysisOverlay" hidden>
            <div class="analysis-overlay-card">
              <div class="spinner"></div>
              <div style="font-weight:800">Running analysis…</div>
              <div class="mono" style="font-size:12px; color:rgba(11,27,58,0.65)">Solving 3D frame model</div>
            </div>
          </div>
        </div>

        <div class="popwrap" id="popBr"><div class="popcard">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px">
            <b>Bracing</b>
            <button class="pill" id="btnPopBrClose" type="button">Close</button>
          </div>
          <div class="row" style="margin-top:8px">
            <label class="badge" style="cursor:pointer"><input id="optBrace" type="checkbox" style="margin:0 8px 0 0" /> Enable</label>
            <select id="braceType" class="input" style="max-width:110px">
              <option value="X">X</option>
              <option value="S">/</option>
              <option value="HAT">ㅅ</option>
            </select>
          </div>
          <div class="row" style="margin-top:8px">
            <span class="badge">Pick panels in 3D (all stories)</span>
          </div>
          <div class="grid2">
            <div>
              <label class="label">Shape</label>
              <select id="braceShape" class="input"></select>
            </div>
            <div>
              <label class="label">Profile</label>
              <select id="braceSize" class="input"></select>
            </div>
          </div>
          <div class="note">Pick panels on grid×level faces. Works for internal & external frames.</div>
        </div></div>

        <div class="popwrap" id="popSection"><div class="popcard">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px">
            <b>Section Box</b>
            <button class="pill" id="btnPopSectionClose" type="button">Close</button>
          </div>
          <div class="note" style="margin-top:6px">Clip the 3D model to a rectangular box.</div>
          <div class="row" style="margin-top:8px">
            <label class="badge" style="cursor:pointer"><input id="secOn" type="checkbox" style="margin:0 8px 0 0" /> Enable</label>
            <button class="btn" id="btnSecReset" type="button">Reset</button>
          </div>
          <div class="grid2" style="margin-top:8px">
            <div>
              <label class="label">X min (%)</label>
              <input id="secX0" class="input" type="range" min="0" max="100" step="1" value="0" />
            </div>
            <div>
              <label class="label">X max (%)</label>
              <input id="secX1" class="input" type="range" min="0" max="100" step="1" value="100" />
            </div>
          </div>
          <div class="grid2" style="margin-top:8px">
            <div>
              <label class="label">Y min (%)</label>
              <input id="secY0" class="input" type="range" min="0" max="100" step="1" value="0" />
            </div>
            <div>
              <label class="label">Y max (%)</label>
              <input id="secY1" class="input" type="range" min="0" max="100" step="1" value="100" />
            </div>
          </div>
          <div class="grid2" style="margin-top:8px">
            <div>
              <label class="label">Z min (%)</label>
              <input id="secZ0" class="input" type="range" min="0" max="100" step="1" value="0" />
            </div>
            <div>
              <label class="label">Z max (%)</label>
              <input id="secZ1" class="input" type="range" min="0" max="100" step="1" value="100" />
            </div>
          </div>
        </div></div>

        <div class="popwrap" id="popOv"><div class="popcard">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px">
            <b>Override</b>
            <button class="pill" id="btnPopOvClose" type="button">Close</button>
          </div>
          <div class="note" id="ovInfo" style="margin-top:8px">Selected: -</div>
          <div class="grid2">
            <div>
              <label class="label">Shape</label>
              <select id="ovShape" class="input"></select>
            </div>
            <div>
              <label class="label">Profile</label>
              <select id="ovSize" class="input"></select>
            </div>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn" id="btnOvClear" type="button">Clear</button>
            <button class="btn danger" id="btnOvReset" type="button">Reset</button>
          </div>
          <div class="note">Pick a member → then change Profile to apply immediately.</div>
        </div></div>
      </section>

      <div class="splitter" id="splitterV" title="Drag to resize"></div>

      <section class="pane plan">
        <div class="pane-h">
          <b>Plan / Section</b>
          <div class="row" style="margin-top:0; gap:6px">
            <button class="pill active" id="btnModePlan" type="button">Plan</button>
            <button class="pill" id="btnModeSec" type="button">Section</button>
            <span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">mvp</span>
          </div>
        </div>
        <div class="pane-b" style="display:flex; flex-direction:column; gap:8px">
          <div class="card" id="planCard" style="padding:8px">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px">
              <div class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">Plan</div>
              <button class="pill" id="btnPlanRot" type="button">Rotate</button>
            </div>
            <div class="row" style="margin-top:6px">
              <span class="badge">Story 1</span>
              <span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">wheel=zoom · drag=pan</span>
            </div>
            <div id="planHost" style="height:380px; margin-top:6px"></div>
            <div class="note">(Three.js view)</div>
          </div>

          <div class="card" id="secCard" style="padding:8px; display:none">
            <div class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">Section</div>
            <div class="row" style="margin-top:6px">
              <select id="secDir" class="input" style="max-width:90px">
                <option value="X">X</option>
                <option value="Y">Y</option>
              </select>
              <select id="secLine" class="input" style="max-width:120px"></select>
              <span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">wheel=zoom · drag=pan</span>
            </div>
            <div id="secHost" style="height:380px; margin-top:6px"></div>
            <div class="note">(Three.js view)</div>
          </div>
        </div>
      </section>

      <div class="splitterH" id="splitterH" title="Drag to resize quantities"></div>

      <section class="pane qty qty-bottom">
        <div class="pane-h">
          <b>Quantities</b>
          <div class="row" style="margin-top:0; gap:6px">
            <button class="pill" id="btnQtyCopy" type="button">Copy Excel</button>
            <span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">mvp · build ${BUILD}</span>
          </div>
        </div>
        <div class="pane-b" id="qty"></div>
      </section>
    </section>
  `;

  // init editor state
  (async () => {
    await loadDeps();
    const engineModel = __engine.normalizeModel(p.data?.engineModel || p.data?.model || p.data?.engine || __engine.defaultModel());

    // globals (so getForm can read them without threading)
    window.__prebimBraces = Array.isArray(engineModel.braces) ? engineModel.braces.slice() : [];
    window.__prebimOverrides = (engineModel.overrides && typeof engineModel.overrides === 'object') ? structuredClone(engineModel.overrides) : {};

    const renderLevelsList = (levelsMm) => {
      const host = document.getElementById('levelsList');
      if(!host) return;
      host.innerHTML = (levelsMm||[]).map((lv, idx) => {
        const label = `Level ${idx+1} height (mm)`;
        return `
          <div class="row" style="margin-top:${idx===0?0:8}px">
            <input class="input" data-level-idx="${idx}" value="${escapeHtml(String(lv))}" placeholder="${label}" />
            <button class="btn smallbtn" data-del-level="${idx}" type="button">Delete</button>
          </div>
        `;
      }).join('');
    };

    const setForm = (m) => {
      document.getElementById('spansX').value = (m.grid.spansXmm||[]).join(', ');
      document.getElementById('spansY').value = (m.grid.spansYmm||[]).join(', ');

      renderLevelsList(m.levels||[]);

      document.getElementById('optSub').checked = !!m.options.subBeams.enabled;
      document.getElementById('subCount').value = String(m.options.subBeams.countPerBay||0);

      // joist UI removed for now

      document.getElementById('optBrace').checked = !!m.options.bracing.enabled;
      document.getElementById('braceType').value = m.options.bracing.type || 'X';
      // story selector removed; bracing panel pick works for all stories
      // brace selection mode is controlled by Bracing popup open/close

      // profiles (stored only for now)
      // Note: profile selectors are populated by fillProfileSelectors() using steel_data.js
      document.getElementById('stdAll').value = m.profiles?.stdAll || 'KS';
      // rebuild options before setting values
      fillProfileSelectors();

      document.getElementById('colShape').value = m.profiles?.colShape || 'H';
      document.getElementById('beamShape').value = m.profiles?.beamShape || 'H';
      document.getElementById('subShape').value = m.profiles?.subShape || 'H';
      document.getElementById('braceShape').value = m.profiles?.braceShape || 'L';

      // sizes
      fillProfileSelectors();
      if(m.profiles?.colSize) document.getElementById('colSize').value = m.profiles.colSize;
      if(m.profiles?.beamSize) document.getElementById('beamSize').value = m.profiles.beamSize;
      if(m.profiles?.subSize) document.getElementById('subSize').value = m.profiles.subSize;
      if(m.profiles?.braceSize) document.getElementById('braceSize').value = m.profiles.braceSize;

      // mirror
      const mir = document.getElementById('subSizeMirror');
      if(mir) mir.innerHTML = document.getElementById('subSize').innerHTML;
      if(m.profiles?.subSize) mir.value = m.profiles.subSize;
    };

    const getForm = () => {
      const levels = Array.from(document.querySelectorAll('#levelsList [data-level-idx]'))
        .map(el => parseFloat(el.value||'0'))
        .filter(n => Number.isFinite(n));

      const parseSpans = (s) => String(s||'')
        .split(',')
        .map(x=>x.trim())
        .filter(Boolean)
        .map(x=>Math.max(1, parseFloat(x)||0))
        .filter(Boolean);

      const next = {
        v: 1,
        grid: {
          spansXmm: parseSpans(document.getElementById('spansX').value),
          spansYmm: parseSpans(document.getElementById('spansY').value),
        },
        levels: levels.length? levels : [0,6000],
        options: {
          subBeams: {
            enabled: document.getElementById('optSub').checked,
            countPerBay: parseInt(document.getElementById('subCount').value||'0',10) || 0,
          },
          joists: { enabled: false },
          bracing: {
            enabled: document.getElementById('optBrace').checked,
            type: document.getElementById('braceType').value || 'X',
          },
        },
        // panel braces + overrides
        braces: (window.__prebimBraces || []),
        overrides: (window.__prebimOverrides || {}),
        profiles: {
          stdAll: document.getElementById('stdAll').value || 'KS',
          colShape: document.getElementById('colShape').value || 'H',
          colSize: document.getElementById('colSize').value || '',
          beamShape: document.getElementById('beamShape').value || 'H',
          beamSize: document.getElementById('beamSize').value || '',
          subShape: document.getElementById('subShape')?.value || 'H',
          subSize: document.getElementById('subSize')?.value || '',
          braceShape: document.getElementById('braceShape')?.value || 'L',
          braceSize: document.getElementById('braceSize')?.value || '',
        }
      };
      return __engine.normalizeModel(next);
    };

    setForm(engineModel);

    // Level list handlers
    document.getElementById('btnAddLevel')?.addEventListener('click', () => {
      const m = getForm();
      const last = m.levels[m.levels.length-1] ?? 0;
      m.levels.push(last + 4200);
      setForm(m);
      scheduleApply(0);
    });

    document.getElementById('levelsList')?.addEventListener('click', (ev) => {
      const btn = ev.target?.closest?.('button[data-del-level]');
      if(!btn) return;
      const idx = parseInt(btn.getAttribute('data-del-level')||'-1',10);
      const m = getForm();
      if(idx >= 0){
        m.levels.splice(idx, 1);
        if(m.levels.length < 2) m.levels = [0, 6000];
        setForm(m);
        scheduleApply(0);
      }
    });

    const view3dEl = document.getElementById('view3d');
    const qtyEl = document.getElementById('qty');
    const btnQtyCopy = document.getElementById('btnQtyCopy');
    const planHost = document.getElementById('planHost');
    const secHost = document.getElementById('secHost');
    const secDirEl = document.getElementById('secDir');
    const secLineEl = document.getElementById('secLine');
    const planCard = document.getElementById('planCard');
    const secCard = document.getElementById('secCard');
    const btnModePlan = document.getElementById('btnModePlan');
    const btnModeSec = document.getElementById('btnModeSec');

    const view = await createThreeView(view3dEl);

    document.getElementById('btn3dGuides')?.addEventListener('click', () => {
      const on = view.toggleGuides?.();
      const btn = document.getElementById('btn3dGuides');
      if(btn) btn.classList.toggle('active', !!on);
    });

    // Section box UI wiring
    const secOn = document.getElementById('secOn');
    const secX0 = document.getElementById('secX0');
    const secX1 = document.getElementById('secX1');
    const secY0 = document.getElementById('secY0');
    const secY1 = document.getElementById('secY1');
    const secZ0 = document.getElementById('secZ0');
    const secZ1 = document.getElementById('secZ1');

    const secGet = () => {
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      let x0 = clamp01((parseFloat(secX0?.value||'0')||0)/100);
      let x1 = clamp01((parseFloat(secX1?.value||'100')||100)/100);
      let y0 = clamp01((parseFloat(secY0?.value||'0')||0)/100);
      let y1 = clamp01((parseFloat(secY1?.value||'100')||100)/100);
      let z0 = clamp01((parseFloat(secZ0?.value||'0')||0)/100);
      let z1 = clamp01((parseFloat(secZ1?.value||'100')||100)/100);
      // keep order
      if(x0>x1) [x0,x1]=[x1,x0];
      if(y0>y1) [y0,y1]=[y1,y0];
      if(z0>z1) [z0,z1]=[z1,z0];
      return { x0,x1,y0,y1,z0,z1 };
    };

    const secApply = () => {
      view.setSectionBox?.(!!secOn?.checked, secGet(), getForm());
    };

    ['change','input'].forEach(ev => {
      secOn?.addEventListener(ev, secApply);
      secX0?.addEventListener(ev, secApply);
      secX1?.addEventListener(ev, secApply);
      secY0?.addEventListener(ev, secApply);
      secY1?.addEventListener(ev, secApply);
      secZ0?.addEventListener(ev, secApply);
      secZ1?.addEventListener(ev, secApply);
    });

    document.getElementById('btnSecReset')?.addEventListener('click', () => {
      if(secX0) secX0.value='0';
      if(secX1) secX1.value='100';
      if(secY0) secY0.value='0';
      if(secY1) secY1.value='100';
      if(secZ0) secZ0.value='0';
      if(secZ1) secZ1.value='100';
      if(secOn) secOn.checked=false;
      secApply();
    });

    // Plan/Section is hidden for now; avoid creating extra WebGL contexts.
    let psView = null;
    if(!document.body.classList.contains('ps-hidden')){
      window.__three = __three;
      window.__OrbitControls = __OrbitControls;
      window.__csg = __csg;
      const psMod = await import('/prebim/ps_view.js');
      psView = await psMod.createPlanSectionView({
        planHost,
        secHost,
        secDirEl,
        secLineEl,
        btnModePlan,
        btnModeSec,
        planCard,
        secCard,
      });
    }

    // 2D plan/section helpers
    let __planRot = 0; // degrees: 0/90/180/270

    const svgPanZoom = (svg, getBaseViewBox) => {
      if(!svg) return;
      let vb = getBaseViewBox();
      const setVB = (next) => {
        vb = next;
        svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
      };
      setVB(vb);

      let panning = false;
      let start = null;
      svg.addEventListener('pointerdown', (ev) => {
        // left button pan only when not clicking a member
        if(ev.button !== 0) return;
        if(ev.target?.closest?.('[data-id]')) return;
        panning = true;
        start = { x: ev.clientX, y: ev.clientY, vb: { ...vb } };
        svg.setPointerCapture(ev.pointerId);
      });
      svg.addEventListener('pointerup', (ev) => {
        panning = false;
        try{ svg.releasePointerCapture(ev.pointerId); }catch{}
      });
      svg.addEventListener('pointermove', (ev) => {
        if(!panning || !start) return;
        const rect = svg.getBoundingClientRect();
        const dxPx = ev.clientX - start.x;
        const dyPx = ev.clientY - start.y;
        // Pan sensitivity (1.0 = original)
        const PAN = 1.0;
        const dx = (dxPx / rect.width) * start.vb.w * PAN;
        const dy = (dyPx / rect.height) * start.vb.h * PAN;
        setVB({ x: start.vb.x - dx, y: start.vb.y - dy, w: start.vb.w, h: start.vb.h });
      });

      svg.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const rect = svg.getBoundingClientRect();
        const mx = (ev.clientX - rect.left) / rect.width;
        const my = (ev.clientY - rect.top) / rect.height;

        const zoomFactor = Math.pow(1.0015, ev.deltaY);
        const newW = vb.w * zoomFactor;
        const newH = vb.h * zoomFactor;
        const nx = vb.x + (vb.w - newW) * mx;
        const ny = vb.y + (vb.h - newH) * my;
        setVB({ x: nx, y: ny, w: newW, h: newH });
      }, { passive:false });

      return { reset: () => setVB(getBaseViewBox()) };
    };
    const computeGrid = (m) => {
      const xs=[0], zs=[0];
      for(const s of (m.grid?.spansXmm||[])) xs.push(xs[xs.length-1] + (s/1000));
      for(const s of (m.grid?.spansYmm||[])) zs.push(zs[zs.length-1] + (s/1000));
      return { xs, zs };
    };

    const parseProfileDimsMm2 = (name) => {
      const s0 = String(name||'').trim().replaceAll('X','x');
      const s = s0.replaceAll('×','x');
      const shapeKey = (s.split(/\s+/)[0] || 'BOX').toUpperCase();
      const mL = s.match(/^L\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
      if(mL) return { shape:'L', d:+mL[1], b:+mL[2], tw:+mL[3], tf:+mL[3], lip:0 };
      const mHI = s.match(/^(H|I)\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
      if(mHI) return { shape:mHI[1].toUpperCase(), d:+mHI[2], b:+mHI[3], tw:+mHI[4], tf:+mHI[5], lip:0 };
      const mC = s.match(/^C\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
      if(mC) return { shape:'C', d:+mC[1], b:+mC[2], tw:+mC[3], tf:+mC[4], lip:0 };
      const mLC = s.match(/^LC\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
      if(mLC) return { shape:'LC', d:+mLC[1], b:+mLC[2], tw:+mLC[4], tf:+mLC[4], lip:+mLC[3] };
      const mT2 = s.match(/^T\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
      if(mT2){ const b=+mT2[1], d=+mT2[2]; const t=Math.max(6, Math.min(b,d)*0.10); return { shape:'T', d, b, tw:t, tf:t, lip:0 }; }
      const m2 = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
      const d = m2 ? parseFloat(m2[1]) : 150;
      const b = m2 ? parseFloat(m2[2]) : 150;
      const t = Math.max(6, Math.min(b,d)*0.08);
      return { shape: shapeKey, d, b, tw:t, tf:t, lip:0 };
    };

    const memberProfileName2 = (kind, model, memberId) => {
      const prof = model?.profiles || {};
      const ov = model?.overrides?.[memberId] || window.__prebimOverrides?.[memberId] || null;
      if(kind === 'column'){
        if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.colShape||'H', ov.sizeKey||prof.colSize||'')?.name || ov.sizeKey;
        return __profiles?.getProfile?.(prof.stdAll||'KS', prof.colShape||'H', prof.colSize||'')?.name || prof.colSize;
      }
      if(kind === 'beamX' || kind === 'beamY'){
        if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.beamShape||'H', ov.sizeKey||prof.beamSize||'')?.name || ov.sizeKey;
        return __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'')?.name || prof.beamSize;
      }
      if(kind === 'subBeam'){
        if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.subShape||'H', ov.sizeKey||prof.subSize||'')?.name || ov.sizeKey;
        return __profiles?.getProfile?.(prof.stdAll||'KS', prof.subShape||'H', prof.subSize||'')?.name || prof.subSize;
      }
      if(kind === 'brace'){
        return __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'')?.name || prof.braceSize;
      }
      return '';
    };

    const getDimsM = (mem, model) => {
      // returns {b,d} in meters
      let name = memberProfileName2(mem.kind, model, mem.id);
      if(mem.kind==='brace' && mem.profile && typeof mem.profile==='object'){
        const pr = mem.profile;
        name = __profiles?.getProfile?.(pr.stdKey||'KS', pr.shapeKey||'L', pr.sizeKey||'')?.name || pr.sizeKey || name;
      }
      const dims = parseProfileDimsMm2(name);
      return { b: Math.max(30, dims.b)/1000, d: Math.max(30, dims.d)/1000 };
    };

    const renderPlan = (members, m) => {
      if(!planHost) return;
      if(secCard) secCard.style.display = 'none';
      if(planCard) planCard.style.display = '';
      if(btnModePlan) btnModePlan.classList.add('active');
      if(btnModeSec) btnModeSec.classList.remove('active');
      const { xs, zs } = computeGrid(m);
      const xMax0 = xs[xs.length-1] || 1;
      const zMax0 = zs[zs.length-1] || 1;

      const yPlan = ((m.levels?.[1] ?? 0)/1000); // Story 1
      const eps = 1e-6;

      const sel = new Set(view.getSelection?.()||[]);

      // rotation mapping (x,z) -> (u,v)
      const map = (x,z) => {
        const rot = (__planRot % 360 + 360) % 360;
        if(rot===90) return { u: z, v: xMax0 - x };
        if(rot===180) return { u: xMax0 - x, v: zMax0 - z };
        if(rot===270) return { u: zMax0 - z, v: x };
        return { u: x, v: z };
      };
      const uMax = ( (__planRot%180)===90 ) ? zMax0 : xMax0;
      const vMax = ( (__planRot%180)===90 ) ? xMax0 : zMax0;

      const memLines = members
        .filter(mem => ['beamX','beamY','subBeam','brace'].includes(mem.kind))
        .filter(mem => {
          if(mem.kind==='brace') return true;
          return (Math.abs(mem.a[1]-yPlan) < 1e-5) && (Math.abs(mem.b[1]-yPlan) < 1e-5);
        })
        .map(mem => {
          const { b } = getDimsM(mem, m);
          const p1 = map(mem.a[0], mem.a[2]);
          const p2 = map(mem.b[0], mem.b[2]);
          return { id: mem.id, kind: mem.kind, x1:p1.u,y1:p1.v,x2:p2.u,y2:p2.v, w: Math.max(0.03, b) };
        });

      const cols = members
        .filter(mem => mem.kind==='column')
        .map(mem => {
          const y0 = Math.min(mem.a[1], mem.b[1]);
          const y1 = Math.max(mem.a[1], mem.b[1]);
          if(!(yPlan >= y0-eps && yPlan <= y1+eps)) return null;
          const { b } = getDimsM(mem, m);
          const p = map(mem.a[0], mem.a[2]);
          return { id: mem.id, x: p.u, y: p.v, r: Math.max(0.05, b*0.45) };
        }).filter(Boolean);

      const pad = 0.4;
      const baseVB = { x:-pad, y:-pad, w:uMax+pad*2, h:vMax+pad*2 };

      const gridLines = [
        xs.map(x => {
          const a = map(x, 0);
          const b = map(x, zMax0);
          return `<line class="grid" x1="${a.u}" y1="${a.v}" x2="${b.u}" y2="${b.v}" />`;
        }).join(''),
        zs.map(z => {
          const a = map(0, z);
          const b = map(xMax0, z);
          return `<line class="grid" x1="${a.u}" y1="${a.v}" x2="${b.u}" y2="${b.v}" />`;
        }).join(''),
      ].join('');

      const lines = memLines.map(l => {
        const cls = sel.has(l.id) ? 'mem sel' : 'mem';
        return `<line class="${cls}" data-id="${escapeHtml(l.id)}" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke-width="${l.w}" />`;
      }).join('');

      const colEls = cols.map(c => {
        const isSel = sel.has(c.id);
        const extra = isSel ? ' stroke="rgba(56,189,248,0.95)"' : '';
        return `<circle class="col" data-id="${escapeHtml(c.id)}" cx="${c.x}" cy="${c.y}" r="${c.r}"${extra} />`;
      }).join('');

      planHost.innerHTML = `
        <svg class="prebim2d" id="svgPlan" viewBox="${baseVB.x} ${baseVB.y} ${baseVB.w} ${baseVB.h}" preserveAspectRatio="xMidYMid meet">
          ${gridLines}
          ${lines}
          ${colEls}
        </svg>
      `;

      const svg = planHost.querySelector('#svgPlan');
      const pz = svgPanZoom(svg, () => baseVB);

      svg?.addEventListener('click', (ev) => {
        const el = ev.target?.closest?.('[data-id]');
        const id = el?.getAttribute?.('data-id');
        if(!id) return;
        view.setSelection?.([id]);
      });

      return { reset: () => pz?.reset?.() };
    };

    const ensureSectionUI = (m) => {
      if(!secDirEl || !secLineEl) return;
      const { xs, zs } = computeGrid(m);
      const dir = secDirEl.value || 'X';
      const count = (dir==='X') ? xs.length : zs.length;
      const cur = secLineEl.value;
      secLineEl.innerHTML='';
      for(let i=0;i<count;i++){
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = `${dir}${i+1}`;
        secLineEl.appendChild(o);
      }
      if(cur && Array.from(secLineEl.options).some(o=>o.value===cur)) secLineEl.value = cur;
      else secLineEl.value = '0';
    };

    const renderSection = (members, m) => {
      if(!secHost || !secDirEl || !secLineEl) return;
      if(planCard) planCard.style.display = 'none';
      if(secCard) secCard.style.display = '';
      if(btnModeSec) btnModeSec.classList.add('active');
      if(btnModePlan) btnModePlan.classList.remove('active');
      ensureSectionUI(m);

      const { xs, zs } = computeGrid(m);
      const dir = secDirEl.value || 'X';
      const idx = parseInt(secLineEl.value||'0',10) || 0;

      const xMax = xs[xs.length-1] || 1;
      const zMax = zs[zs.length-1] || 1;
      const yMax = ((m.levels?.[m.levels.length-1] ?? 6000)/1000);

      const sel = new Set(view.getSelection?.()||[]);

      const vbW = (dir==='X') ? zMax : xMax;
      const pad = 0.4;
      const baseVB = { x:-pad, y:-pad, w:vbW+pad*2, h:yMax+pad*2 };

      const yDraw = (y) => (yMax - y); // FIX: flip vertical so up is up

      const levelLines = (m.levels||[]).map(lv => {
        const y = yDraw(lv/1000);
        return `<line class="level" x1="0" y1="${y}" x2="${vbW}" y2="${y}" />`;
      }).join('');

      // Detailed 2D member rendering (approx profile in section): flanges/web for H/I, etc.
      const sectionStrip = (mem) => {
        const isSel = sel.has(mem.id);
        const cls = isSel ? 'mem sel' : 'mem';
        const { b, d } = getDimsM(mem, m);

        const h1 = (dir==='X') ? mem.a[2] : mem.a[0];
        const h2 = (dir==='X') ? mem.b[2] : mem.b[0];
        const v1 = yDraw(mem.a[1]);
        const v2 = yDraw(mem.b[1]);

        // Angle of member in section plane
        const dx = h2 - h1;
        const dy = v2 - v1;
        const L = Math.sqrt(dx*dx + dy*dy) || 1;
        const ux = dx / L;
        const uy = dy / L;
        // perpendicular (to make thickness)
        const px = -uy;
        const py = ux;
        const t = Math.max(0.03, d);

        // polygon of a thick strip (simpler than full profile, but with inner detail lines)
        const ax = h1 + px*(t/2), ay = v1 + py*(t/2);
        const bx = h2 + px*(t/2), by = v2 + py*(t/2);
        const cx = h2 - px*(t/2), cy = v2 - py*(t/2);
        const dx2= h1 - px*(t/2), dy2= v1 - py*(t/2);

        // inner web hint line at center
        const wx1 = h1, wy1 = v1;
        const wx2 = h2, wy2 = v2;

        return `
          <g data-id="${escapeHtml(mem.id)}">
            <polygon class="${cls}" points="${ax},${ay} ${bx},${by} ${cx},${cy} ${dx2},${dy2}" fill="rgba(255,255,255,0.25)" />
            <line class="${cls}" x1="${wx1}" y1="${wy1}" x2="${wx2}" y2="${wy2}" stroke-width="${Math.max(0.02, t*0.08)}" opacity="0.55" />
          </g>
        `;
      };

      const strips = members
        .filter(mem => ['column','beamX','beamY','subBeam','brace'].includes(mem.kind))
        .filter(mem => {
          if(dir==='X'){
            const x0 = xs[Math.min(xs.length-1, Math.max(0, idx))];
            return (Math.abs(mem.a[0]-x0) < 1e-5) && (Math.abs(mem.b[0]-x0) < 1e-5);
          }
          const z0 = zs[Math.min(zs.length-1, Math.max(0, idx))];
          return (Math.abs(mem.a[2]-z0) < 1e-5) && (Math.abs(mem.b[2]-z0) < 1e-5);
        })
        .map(sectionStrip)
        .join('');

      secHost.innerHTML = `
        <svg class="prebim2d" id="svgSec" viewBox="${baseVB.x} ${baseVB.y} ${baseVB.w} ${baseVB.h}" preserveAspectRatio="xMidYMid meet">
          ${levelLines}
          ${strips}
        </svg>
      `;

      const svg = secHost.querySelector('#svgSec');
      const pz = svgPanZoom(svg, () => baseVB);

      svg?.addEventListener('click', (ev) => {
        const el = ev.target?.closest?.('[data-id]');
        const id = el?.getAttribute?.('data-id');
        if(!id) return;
        view.setSelection?.([id]);
      });

      return { reset: () => pz?.reset?.() };
    };

    let __psMode = 'plan';

    const applyPSMode = () => {
      psView?.setMode?.(__psMode);
      psView?.setModel?.(__lastMembers||[], __lastModel||getForm());
    };

    btnModePlan?.addEventListener('click', () => { __psMode = 'plan'; applyPSMode(); });
    btnModeSec?.addEventListener('click', () => { __psMode = 'section'; applyPSMode(); });

    secDirEl?.addEventListener('change', () => { __psMode='section'; applyPSMode(); });
    secLineEl?.addEventListener('change', () => { __psMode='section'; applyPSMode(); });

    document.getElementById('btnPlanRot')?.addEventListener('click', () => {
      __psMode='plan';
      __planRot = (__planRot + 90) % 360;
      applyPSMode();
    });

    // 3D toggles
    // (realistic/outline toggles removed)

    // popovers
    const popBr = document.getElementById('popBr');
    const popOv = document.getElementById('popOv');
    const popSection = document.getElementById('popSection');
    const closeAll = () => { popBr?.classList.remove('open'); popOv?.classList.remove('open'); popSection?.classList.remove('open'); };
    document.getElementById('btnPopBr')?.addEventListener('click', () => {
      popOv?.classList.remove('open');
      popSection?.classList.remove('open');
      popBr?.classList.toggle('open');
      updateBraceMode(popBr?.classList.contains('open'));
    });
    document.getElementById('btnPopOv')?.addEventListener('click', () => {
      popBr?.classList.remove('open');
      popSection?.classList.remove('open');
      popOv?.classList.toggle('open');
    });
    document.getElementById('btn3dSection')?.addEventListener('click', () => {
      popBr?.classList.remove('open');
      popOv?.classList.remove('open');
      popSection?.classList.toggle('open');
    });
    document.getElementById('btnPopBrClose')?.addEventListener('click', () => { closeAll(); updateBraceMode(false); });
    document.getElementById('btnPopOvClose')?.addEventListener('click', () => { closeAll(); updateBraceMode(false); });
    document.getElementById('btnPopSectionClose')?.addEventListener('click', () => { closeAll(); updateBraceMode(false); });

    // resizable splitters
    const splitterT = document.getElementById('splitterT');
    const splitterV = document.getElementById('splitterV');
    const splitterH = document.getElementById('splitterH');
    const editor = document.querySelector('.editor');

    const bindSplitter = (handle, onMoveFn) => {
      if(!handle || !editor) return;
      let dragging = false;
      const onDown = (ev) => { dragging = true; ev.preventDefault(); };
      const onUp = () => { dragging = false; };
      const onMove = (ev) => { if(dragging) onMoveFn(ev); };
      handle.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointermove', onMove);
    };

    bindSplitter(splitterT, (ev) => {
      const rect = editor.getBoundingClientRect();
      const minTools = 180;
      const maxTools = Math.max(minTools, rect.width * 0.45);
      const x = ev.clientX - rect.left;
      const w = Math.max(minTools, Math.min(maxTools, x - 20));
      document.documentElement.style.setProperty('--w-tools', `${w}px`);
      view?.resize?.();
    });

    bindSplitter(splitterV, (ev) => {
      const rect = editor.getBoundingClientRect();
      const toolsW = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--w-tools')) || 240);
      const minRight = 280;
      const maxRight = Math.max(minRight, rect.width - toolsW - 260);
      const x = ev.clientX - rect.left;
      // right width based on pointer position from left
      const proposedRight = Math.max(minRight, Math.min(maxRight, rect.width - x - 30));
      document.documentElement.style.setProperty('--w-right', `${proposedRight}px`);
      view?.resize?.();
    });

    // bottom quantities height splitter
    bindSplitter(splitterH, (ev) => {
      const rect = editor.getBoundingClientRect();
      const y = ev.clientY - rect.top;
      const minH = 140;
      const maxH = Math.max(minH, rect.height * 0.65);
      // splitter row sits between top and qty; qty height = remaining below pointer minus padding
      const proposed = Math.max(minH, Math.min(maxH, rect.bottom - ev.clientY - 20));
      document.documentElement.style.setProperty('--h-qty', `${proposed}px`);
      view?.resize?.();
    });

    let __applyTimer = 0;
    let __lastQty = null;

    const copyText = async (text) => {
      try{
        await navigator.clipboard.writeText(text);
        return true;
      }catch(e){
        try{
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position='fixed';
          ta.style.left='-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          return ok;
        }catch{
          return false;
        }
      }
    };

    const qtyToTSV = (q, model) => {
      const prof = model?.profiles || {};
      const pCol = __profiles?.getProfile?.(prof.stdAll||'KS', prof.colShape||'H', prof.colSize||'') || null;
      const pBeam = __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'') || null;
      const pSub = __profiles?.getProfile?.(prof.stdAll||'KS', prof.subShape||'H', prof.subSize||'') || null;
      const pBrace = __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'') || null;

      const kindLabel = {
        column: { cat:'Column', prof: pCol?.name || prof.colSize || '-' , kgm: pCol?.kgm ?? null },
        beam: { cat:'Beam', prof: pBeam?.name || prof.beamSize || '-' , kgm: pBeam?.kgm ?? null },
        subBeam: { cat:'Sub beam', prof: pSub?.name || prof.subSize || '-' , kgm: pSub?.kgm ?? null },
        joist: { cat:'Joist', prof: pBeam?.name || prof.beamSize || '-' , kgm: pBeam?.kgm ?? null },
        brace: { cat:'Brace', prof: pBrace?.name || prof.braceSize || '-' , kgm: pBrace?.kgm ?? null },
      };

      const catOrder = ['Column','Beam','Sub beam','Brace','Joist'];

      const rowsData = Object.entries(q.byKind)
        .map(([kind, v]) => {
          const baseKind = v.baseKind || (kind.includes(':') ? kind.split(':')[0] : kind);
          const meta = kindLabel[baseKind] || { cat:baseKind, prof:v.name || '-' , kgm: v.kgm ?? null };
          const kgm = (v.kgm != null) ? v.kgm : meta.kgm;
          const loadKg = (kgm!=null) ? (kgm * v.len) : null;
          return {
            cat: meta.cat,
            prof: String(v.name || meta.prof),
            len: v.len,
            count: v.count,
            kgm,
            loadKg,
          };
        });

      rowsData.sort((a,b)=>{
        const ai=catOrder.indexOf(a.cat), bi=catOrder.indexOf(b.cat);
        if(ai!==bi) return (ai<0?999:ai)-(bi<0?999:bi);
        return a.prof.localeCompare(b.prof);
      });

      const rows = [];
      let curCat = null;
      let st = null;
      const pushSubtotal = () => {
        if(!curCat || !st) return;
        rows.push([
          `${curCat} subtotal`,
          '',
          st.len.toFixed(3),
          String(st.count),
          '',
          st.hasLoad ? st.loadKg.toFixed(1) : '',
          st.hasLoad ? (st.loadKg/1000).toFixed(3) : '',
        ]);
      };

      for(const r of rowsData){
        if(curCat && r.cat !== curCat){
          pushSubtotal();
          st = null;
        }
        if(!st){ curCat = r.cat; st = { len:0, count:0, loadKg:0, hasLoad:false }; }
        st.len += r.len;
        st.count += r.count;
        if(r.loadKg!=null){ st.loadKg += r.loadKg; st.hasLoad=true; }

        rows.push([
          r.cat,
          r.prof,
          r.len.toFixed(3),
          String(r.count),
          (r.kgm==null)?'':r.kgm.toFixed(2),
          (r.loadKg==null)?'':r.loadKg.toFixed(1),
          (r.loadKg==null)?'':(r.loadKg/1000).toFixed(3),
        ]);
      }
      pushSubtotal();

      const header = ['Category','Member type','Length (m)','Count','Unit wt (kg/m)','Load (kg)','Load (t)'];
      const total = ['Total','',q.totalLen.toFixed(3), String(q.totalCount), '', (q.totalWeightKg??0).toFixed(1), ((q.totalWeightKg??0)/1000).toFixed(3) ];
      return [header, ...rows, total].map(r => r.join('\t')).join('\n');
    };

    const applyNow = (m) => {
      const members = __engine.generateMembers(m);
      view.setMembers(members, m);

      // Plan/Section (Three.js)
      __lastMembers = members;
      __lastModel = m;
      if(psView){
        try{ psView.setModel?.(members, m); }catch(e){ console.warn('plan/section render failed', e); }
      }

      const q = summarizeMembers(members, m);
      __lastQty = q;
      if(qtyEl) qtyEl.innerHTML = renderQtyTable(q, m);
      const tw = document.getElementById('qtyTotalWeight');
      if(tw) tw.textContent = (q.totalWeightKg!=null && Number.isFinite(q.totalWeightKg)) ? `${q.totalWeightKg.toLocaleString('en-US',{maximumFractionDigits:1})} kg (${(q.totalWeightKg/1000).toFixed(3)} t)` : '-';

      // persist into project
      const projects = loadProjects();
      const idx = projects.findIndex(x => x.id === p.id);
      if(idx >= 0){
        projects[idx].data = { ...(projects[idx].data||{}), engineModel: m };
        projects[idx].updatedAt = now();
        saveProjects(projects);
      }
    };

    const scheduleApply = (ms = 120) => {
      clearTimeout(__applyTimer);
      __applyTimer = setTimeout(() => applyNow(getForm()), ms);
    };

    const apply = (m) => applyNow(m);

    // Exports / Analysis
    const exportData = () => {
      const m = getForm();
      const payload = {
        schema: 'prebim-data-v1',
        exportedAt: new Date().toISOString(),
        project: { id: p.id, name: p.name },
        engineModel: m,
      };
      download(`prebim-${(p.name||'project').replace(/[^a-z0-9_-]+/gi,'_')}-data.json`, JSON.stringify(payload, null, 2));
    };

    // Analysis now lives on a dedicated page (#/analysis/:id)

    const exportStaad = () => {
      const m = getForm();
      const members = __engine.generateMembers(m);

      const qLive = parseFloat(prompt('Live load (kN/m^2) for Story 1 beams/sub-beams', '3.0')||'3') || 0;

      // unique joints
      const keyOf = (pt) => `${pt[0].toFixed(6)},${pt[1].toFixed(6)},${pt[2].toFixed(6)}`;
      const joints = new Map();
      const jointList = [];
      const ensureJoint = (pt) => {
        const k = keyOf(pt);
        if(joints.has(k)) return joints.get(k);
        const id = jointList.length + 1;
        joints.set(k, id);
        jointList.push({ id, pt });
        return id;
      };

      const memList = members.map((mem, idx) => {
        const j1 = ensureJoint(mem.a);
        const j2 = ensureJoint(mem.b);
        return { id: idx+1, kind: mem.kind, j1, j2, mem };
      });

      // grid helpers (for tributary widths)
      const spansXmm = m.grid?.spansXmm || [];
      const spansYmm = m.grid?.spansYmm || [];
      const xs=[0], ys=[0];
      for(const s of spansXmm) xs.push(xs[xs.length-1] + (s/1000));
      for(const s of spansYmm) ys.push(ys[ys.length-1] + (s/1000));
      const tol = 1e-6;

      const findIdx = (arr, v) => {
        for(let i=0;i<arr.length;i++) if(Math.abs(arr[i]-v) < 1e-5) return i;
        return -1;
      };

      const tribWidthForBeamX = (z) => {
        const j = findIdx(ys, z);
        if(j < 0) return 0;
        const wPrev = (j>0) ? (ys[j]-ys[j-1]) : 0;
        const wNext = (j<ys.length-1) ? (ys[j+1]-ys[j]) : 0;
        return 0.5*wPrev + 0.5*wNext;
      };

      const tribWidthForBeamY = (x) => {
        const i = findIdx(xs, x);
        if(i < 0) return 0;
        const wPrev = (i>0) ? (xs[i]-xs[i-1]) : 0;
        const wNext = (i<xs.length-1) ? (xs[i+1]-xs[i]) : 0;
        return 0.5*wPrev + 0.5*wNext;
      };

      const getProfileDimsMm = (kind, memObj) => {
        let profName = memberProfileName(kind, m, memObj.id);
        if(kind==='brace' && memObj.profile && typeof memObj.profile==='object'){
          const pr = memObj.profile;
          profName = __profiles?.getProfile?.(pr.stdKey||m.profiles?.stdAll||'KS', pr.shapeKey||m.profiles?.braceShape||'L', pr.sizeKey||m.profiles?.braceSize||'')?.name || pr.sizeKey || profName;
        }
        const d = parseProfileDimsMm(profName);
        // d,d.b are mm
        return { d: Math.max(30, d.d||150), b: Math.max(30, d.b||150) };
      };

      // group members by profile (approx PRIS YD ZD)
      const propGroups = new Map(); // key -> {yd,zd, ids:[]}
      const braceIds = [];
      const supportJoints = new Set();
      const liveLoads = []; // {ids, w} per member id

      const story1m = (m.levels?.[1] ?? 0)/1000;
      const subCount = m.options?.subBeams?.countPerBay || 0;

      for(const mm of memList){
        const mem = mm.mem;

        // supports: base joints (y==0)
        if(mem.kind==='column'){
          const ya = mem.a[1], yb = mem.b[1];
          const jLow = (ya<yb) ? mm.j1 : mm.j2;
          const yLow = Math.min(ya,yb);
          if(Math.abs(yLow - 0) < 1e-8) supportJoints.add(jLow);
        }

        // TRUSS braces
        if(mem.kind==='brace') braceIds.push(mm.id);

        // properties
        const dims = getProfileDimsMm(mem.kind, mem);
        const yd = dims.d; // mm
        const zd = dims.b; // mm
        const profKey = `${mem.kind}:${yd}x${zd}`;
        const g = propGroups.get(profKey) || { kind: mem.kind, yd, zd, ids: [] };
        g.ids.push(mm.id);
        propGroups.set(profKey, g);

        // live loads for story1 beams + subbeams
        if(qLive > 0){
          if(mem.kind==='beamX' || mem.kind==='beamY' || mem.kind==='subBeam'){
            if(Math.abs(mem.a[1]-story1m) < 1e-6 && Math.abs(mem.b[1]-story1m) < 1e-6){
              let trib = 0;
              if(mem.kind==='beamX') trib = tribWidthForBeamX(mem.a[2]);
              else if(mem.kind==='beamY') trib = tribWidthForBeamY(mem.a[0]);
              else {
                // subbeam inside a bay: tributary = bayWidth/(count+1)
                const mId = String(mem.id||'');
                const mSub = mId.match(/^sub:(\d+),(\d+),(\d+),(\d+)/);
                if(mSub){
                  const iy = parseInt(mSub[2],10) || 0;
                  const bayW = (ys[iy+1]??ys[iy]) - (ys[iy]??0);
                  trib = bayW / (Math.max(1, subCount)+1);
                } else {
                  trib = tribWidthForBeamX(mem.a[2]);
                }
              }
              const w = qLive * trib; // kN/m
              liveLoads.push({ id: mm.id, w });
            }
          }
        }
      }

      const lines = [];
      lines.push('* PreBIM-SteelStructure STAAD export');
      lines.push(`* project: ${p.id} ${p.name||''}`.trim());
      lines.push('STAAD SPACE');
      lines.push('UNIT METER KN');

      lines.push('JOINT COORDINATES');
      for(const j of jointList){
        lines.push(`${j.id} ${j.pt[0].toFixed(6)} ${j.pt[1].toFixed(6)} ${j.pt[2].toFixed(6)}`);
      }

      lines.push('MEMBER INCIDENCES');
      for(const mm of memList){
        lines.push(`${mm.id} ${mm.j1} ${mm.j2}`);
      }

      // MATERIAL/CONSTANTS (steel)
      lines.push('DEFINE MATERIAL START');
      lines.push('ISOTROPIC STEEL');
      lines.push('E 2.05e8');
      lines.push('POISSON 0.3');
      lines.push('DENSITY 76.8');
      lines.push('END DEFINE MATERIAL');
      lines.push('CONSTANTS');
      lines.push('MATERIAL STEEL ALL');

      const rectPropsMm = (w, h) => {
        const A = w*h;
        // Iy about local y-axis (uses z^2): h*w^3/12
        const Iy = h*Math.pow(w,3)/12;
        // Iz about local z-axis (uses y^2): w*h^3/12
        const Iz = w*Math.pow(h,3)/12;
        // torsion constant J (rectangle approximation)
        const a = Math.max(w,h);
        const b = Math.min(w,h);
        const J = (a*Math.pow(b,3))*(1/3 - 0.21*(b/a)*(1 - Math.pow(b,4)/(12*Math.pow(a,4))));
        return { A, Iy, Iz, J };
      };

      const iSectionPropsMm = (b, d, tw, tf) => {
        // symmetric I/H about both centroid axes
        const webH = Math.max(0, d - 2*tf);
        const Af = b*tf;
        const Aw = tw*webH;
        const A = 2*Af + Aw;

        // Iy: about y-axis (weak, uses width)
        const IyFlange = tf*Math.pow(b,3)/12;
        const IyWeb = webH*Math.pow(tw,3)/12;
        const Iy = 2*IyFlange + IyWeb;

        // Iz: about z-axis (strong, uses depth) + parallel axis for flanges
        const IzFlangeLocal = b*Math.pow(tf,3)/12;
        const yOff = (d/2 - tf/2);
        const IzFlange = IzFlangeLocal + Af*Math.pow(yOff,2);
        const IzWeb = tw*Math.pow(webH,3)/12;
        const Iz = 2*IzFlange + IzWeb;

        // J thin-walled approx: sum (b*t^3)/3 over plates
        const J = (2*b*Math.pow(tf,3) + webH*Math.pow(tw,3))/3;

        return { A, Iy, Iz, J };
      };

      const sectionPropsMmFromMember = (kind, memObj) => {
        let profName = memberProfileName(kind, m, memObj.id);
        if(kind==='brace' && memObj.profile && typeof memObj.profile==='object'){
          const pr = memObj.profile;
          profName = __profiles?.getProfile?.(pr.stdKey||m.profiles?.stdAll||'KS', pr.shapeKey||m.profiles?.braceShape||'L', pr.sizeKey||m.profiles?.braceSize||'')?.name || pr.sizeKey || profName;
        }
        const d = parseProfileDimsMm(profName);
        const depth = Math.max(30, d.d||150);
        const width = Math.max(30, d.b||150);
        const tf = d.tf || d.t || 12;
        const tw = d.tw || d.t || 8;

        // Prefer I/H calc if we have tw/tf; else rectangle.
        if((d.tf || d.tw) && depth > 2*tf + 1 && width > tw + 1){
          return iSectionPropsMm(width, depth, tw, tf);
        }
        return rectPropsMm(width, depth);
      };

      // MEMBER PROPERTY using GENERAL (AX/IY/IZ/J) in METER units
      lines.push('MEMBER PROPERTY');
      for(const g of propGroups.values()){
        // Format member list as ranges
        const ids = g.ids.slice().sort((a,b)=>a-b);
        const parts = [];
        let s = ids[0], prev = ids[0];
        for(let i=1;i<=ids.length;i++){
          const v = ids[i];
          if(v === prev+1){ prev = v; continue; }
          parts.push((s===prev) ? `${s}` : `${s} TO ${prev}`);
          s = v; prev = v;
        }
        const memSel = parts.join(' ');

        // Compute properties from the first member in this group (same dims key)
        const mm0 = memList.find(x => x.id === ids[0]);
        const Pmm = sectionPropsMmFromMember(mm0?.kind || g.kind, mm0?.mem || {});

        // convert mm-based props -> meter
        const AX = Pmm.A * 1e-6;   // mm^2 -> m^2
        const IY = Pmm.Iy * 1e-12; // mm^4 -> m^4
        const IZ = Pmm.Iz * 1e-12;
        const J = Pmm.J * 1e-12;

        lines.push(`PRIS GENERAL AX ${AX.toExponential(6)} IY ${IY.toExponential(6)} IZ ${IZ.toExponential(6)} J ${J.toExponential(6)} ${memSel}`);
      }

      // BRACE TRUSS
      if(braceIds.length){
        const ids = braceIds.slice().sort((a,b)=>a-b);
        const parts = [];
        let s = ids[0], prev = ids[0];
        for(let i=1;i<=ids.length;i++){
          const v = ids[i];
          if(v === prev+1){ prev = v; continue; }
          parts.push((s===prev) ? `${s}` : `${s} TO ${prev}`);
          s = v; prev = v;
        }
        lines.push('MEMBER TRUSS');
        lines.push(parts.join(' '));
      }

      // SUPPORTS (base pinned)
      if(supportJoints.size){
        lines.push('SUPPORTS');
        const ids = Array.from(supportJoints).sort((a,b)=>a-b);
        const parts=[];
        let s=ids[0], prev=ids[0];
        for(let i=1;i<=ids.length;i++){
          const v=ids[i];
          if(v===prev+1){ prev=v; continue; }
          parts.push((s===prev)?`${s}`:`${s} TO ${prev}`);
          s=v; prev=v;
        }
        lines.push(`${parts.join(' ')} PINNED`);
      }

      // LOADS
      lines.push('LOAD 1 DEAD');
      lines.push('SELFWEIGHT Y -1');
      if(qLive > 0 && liveLoads.length){
        lines.push('LOAD 2 LIVE');
        lines.push('MEMBER LOAD');
        for(const ll of liveLoads){
          // UDL in global -Y
          lines.push(`${ll.id} UNI GY ${(-ll.w).toFixed(3)}`);
        }
      }

      lines.push('PERFORM ANALYSIS');
      lines.push('PRINT ANALYSIS RESULTS');
      lines.push('FINISH');

      download(`prebim-${(p.name||'project').replace(/[^a-z0-9_-]+/gi,'_')}-staad.std`, lines.join('\n'), 'text/plain');
    };

    const dxfHeader = () => [
      '0','SECTION','2','HEADER',
      '9','$ACADVER','1','AC1009',
      '9','$INSUNITS','70','4', // millimeters
      '0','ENDSEC',
      '0','SECTION','2','ENTITIES'
    ];

    const dxfFooter = () => ['0','ENDSEC','0','EOF'];

    const dxfLine = (x1,y1,x2,y2, layer='0') => [
      '0','LINE',
      '8',layer,
      '10',String(x1),'20',String(y1),'30','0',
      '11',String(x2),'21',String(y2),'31','0'
    ];

    const dxfText = (x,y,h, text, layer='0') => [
      '0','TEXT',
      '8',layer,
      '10',String(x),'20',String(y),'30','0',
      '40',String(h),
      '1',String(text)
    ];

    const dxfLwPolyline = (pts, layer='0', closed=false, constWidth=null) => {
      const out = ['0','LWPOLYLINE','8',layer,'90',String(pts.length),'70',closed?'1':'0'];
      if(constWidth!=null) out.push('43', String(constWidth));
      for(const [x,y] of pts){
        out.push('10',String(x),'20',String(y));
      }
      return out;
    };

    const exportDxf = () => {
      const m = getForm();

      const getDimsMm = (mem) => {
        let profName = memberProfileName(mem.kind, m, mem.id);
        if(mem.kind === 'brace' && mem.profile && typeof mem.profile === 'object'){
          const pr = mem.profile;
          profName = __profiles?.getProfile?.(pr.stdKey||m.profiles?.stdAll||'KS', pr.shapeKey||m.profiles?.braceShape||'L', pr.sizeKey||m.profiles?.braceSize||'')?.name || pr.sizeKey || profName;
        }
        const d = parseProfileDimsMm(profName);
        // parseProfileDimsMm returns meters-based dims elsewhere; here it returns mm via d/b/t, but stored in d/b
        // In our parseProfileDimsMm, d and b are in mm.
        return { b: Math.max(30, d.b||150), d: Math.max(30, d.d||150) };
      };
      const spansX = m.grid?.spansXmm || [];
      const spansY = m.grid?.spansYmm || [];
      const xs=[0], ys=[0];
      for(const s of spansX) xs.push(xs[xs.length-1] + s);
      for(const s of spansY) ys.push(ys[ys.length-1] + s);
      const xMax = xs[xs.length-1] || 1;
      const yMax = ys[ys.length-1] || 1;

      const out = [];
      out.push(...dxfHeader());

      // Full grid lines (layer GRID)
      for(const x of xs) out.push(...dxfLine(x,0,x,yMax,'GRID'));
      for(const y of ys) out.push(...dxfLine(0,y,xMax,y,'GRID'));

      // Auto dimensions (numeric mm, outside only)
      const off = 1200;   // offset outside
      const ext = 400;    // extension beyond dim line
      const txtH = 250;

      // X chain dims at bottom
      const dimY = -off;
      for(let i=0;i<xs.length;i++) out.push(...dxfLine(xs[i], 0, xs[i], dimY - ext, 'DIM'));
      out.push(...dxfLine(0, dimY, xMax, dimY, 'DIM'));
      for(let i=0;i<xs.length-1;i++){
        const v = xs[i+1]-xs[i];
        out.push(...dxfText((xs[i]+xs[i+1])/2 - (String(v).length*txtH*0.25), dimY + txtH*0.15, txtH, String(v), 'DIMTXT'));
      }
      // X overall dim
      const dimY2 = -off*2;
      out.push(...dxfLine(0, dimY2, xMax, dimY2, 'DIM'));
      out.push(...dxfLine(0, dimY, 0, dimY2 - ext, 'DIM'));
      out.push(...dxfLine(xMax, dimY, xMax, dimY2 - ext, 'DIM'));
      out.push(...dxfText(xMax/2 - (String(xMax).length*txtH*0.25), dimY2 + txtH*0.15, txtH, String(xMax), 'DIMTXT'));

      // Y chain dims at left
      const dimX = -off;
      for(let i=0;i<ys.length;i++) out.push(...dxfLine(0, ys[i], dimX - ext, ys[i], 'DIM'));
      out.push(...dxfLine(dimX, 0, dimX, yMax, 'DIM'));
      for(let i=0;i<ys.length-1;i++){
        const v = ys[i+1]-ys[i];
        out.push(...dxfText(dimX + txtH*0.15, (ys[i]+ys[i+1])/2, txtH, String(v), 'DIMTXT'));
      }
      // Y overall dim
      const dimX2 = -off*2;
      out.push(...dxfLine(dimX2, 0, dimX2, yMax, 'DIM'));
      out.push(...dxfLine(dimX, 0, dimX2 - ext, 0, 'DIM'));
      out.push(...dxfLine(dimX, yMax, dimX2 - ext, yMax, 'DIM'));
      out.push(...dxfText(dimX2 + txtH*0.15, yMax/2, txtH, String(yMax), 'DIMTXT'));

      // Members for Story 1 (layer MEMBER) using approximate real profile widths
      const members = __engine.generateMembers(m);
      const yPlan = (m.levels?.[1] ?? 0);
      for(const mem of members){
        // use members that touch story1 level (simple filter)
        const aYmm = mem.a[1]*1000;
        const bYmm = mem.b[1]*1000;
        if(mem.kind !== 'column' && (Math.abs(aYmm - yPlan) > 1 && Math.abs(bYmm - yPlan) > 1)) continue;

        if(mem.kind === 'column'){
          // column section outline at plan (rectangle b×d)
          const dims = getDimsMm(mem);
          const cx = mem.a[0]*1000;
          const cy = mem.a[2]*1000;
          const hw = dims.b/2;
          const hd = dims.d/2;
          out.push(...dxfLwPolyline([
            [cx-hw, cy-hd],
            [cx+hw, cy-hd],
            [cx+hw, cy+hd],
            [cx-hw, cy+hd],
          ], 'COLUMN', true));
          continue;
        }

        // beam/sub/brace centerline with constant width = b
        const dims = getDimsMm(mem);
        const x1 = mem.a[0]*1000, y1 = mem.a[2]*1000;
        const x2 = mem.b[0]*1000, y2 = mem.b[2]*1000;
        const layer = (mem.kind==='beamX' || mem.kind==='beamY') ? 'BEAM' : (mem.kind==='subBeam' ? 'SUBBEAM' : (mem.kind==='brace' ? 'BRACE' : 'MEMBER'));
        out.push(...dxfLwPolyline([[x1,y1],[x2,y2]], layer, false, dims.b));
      }

      // Section level dims (right side)
      const secOffX = xMax + 4000;
      const levels = (m.levels||[]);
      if(levels.length >= 2){
        const z0 = levels[0];
        const zMax2 = levels[levels.length-1];
        out.push(...dxfLine(secOffX, 0, secOffX, zMax2, 'GRID'));
        const sDimX = secOffX + 2000;
        out.push(...dxfLine(sDimX, z0, sDimX, zMax2, 'DIM'));
        out.push(...dxfLine(secOffX, z0, sDimX - ext, z0, 'DIM'));
        out.push(...dxfLine(secOffX, zMax2, sDimX - ext, zMax2, 'DIM'));
        out.push(...dxfText(sDimX + txtH*0.15, (z0+zMax2)/2, txtH, String(zMax2-z0), 'DIMTXT'));

        const sDimX2 = secOffX + 1200;
        out.push(...dxfLine(sDimX2, z0, sDimX2, zMax2, 'DIM'));
        for(let i=0;i<levels.length;i++){
          out.push(...dxfLine(secOffX, levels[i], sDimX2 - ext, levels[i], 'DIM'));
          if(i<levels.length-1){
            const v = levels[i+1]-levels[i];
            out.push(...dxfText(sDimX2 + txtH*0.15, (levels[i]+levels[i+1])/2, txtH, String(v), 'DIMTXT'));
          }
        }
      }

      out.push(...dxfFooter());
      download(`prebim-${(p.name||'project').replace(/[^a-z0-9_-]+/gi,'_')}-auto-dim.dxf`, out.join('\n'), 'application/dxf');
    };

    const exportIfc = () => {
      // Placeholder IFC (proper IFC export is a larger task)
      const txt = [
        'ISO-10303-21;',
        'HEADER;',
        "FILE_DESCRIPTION(('PREBIM IFC placeholder'),'2;1');",
        `FILE_NAME('prebim.ifc','${new Date().toISOString()}',('prebim'),('prebim'),'prebim','prebim','');`,
        "FILE_SCHEMA(('IFC4'));",
        'ENDSEC;',
        'DATA;',
        'ENDSEC;',
        'END-ISO-10303-21;'
      ].join('\n');
      download(`prebim-${(p.name||'project').replace(/[^a-z0-9_-]+/gi,'_')}.ifc`, txt, 'application/octet-stream');
      alert('IFC Export is currently a placeholder file (IFC4 header only).');
    };

    const exportMenu = document.getElementById('exportMenu');
    const toggleExportMenu = (force) => {
      if(!exportMenu) return;
      const open = (typeof force==='boolean') ? force : exportMenu.hidden;
      exportMenu.hidden = !open;
      const btn = document.getElementById('btnExportMenu');
      if(btn) btn.classList.toggle('active', open);
    };

    document.getElementById('btnExportMenu')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      // toggle open/close even if user clicks the button again
      toggleExportMenu();
    });

    // close menu on any click outside the export button/menu
    document.addEventListener('click', (ev) => {
      const wrap = ev.target?.closest?.('.export-wrap');
      if(!wrap) toggleExportMenu(false);
    }, { capture:true });

    document.getElementById('btnExportData')?.addEventListener('click', () => { toggleExportMenu(false); exportData(); });
    document.getElementById('btnExportStaad')?.addEventListener('click', () => { toggleExportMenu(false); exportStaad(); });
    document.getElementById('btnExportIfc')?.addEventListener('click', () => { toggleExportMenu(false); exportIfc(); });
    document.getElementById('btnExportDxf')?.addEventListener('click', () => { toggleExportMenu(false); exportDxf(); });

    document.getElementById('btnAnalysis')?.addEventListener('click', () => {
      go(`#/analysis/${encodeURIComponent(p.id)}`);
    });

    // copy quantities to clipboard (Excel-friendly TSV)
    btnQtyCopy?.addEventListener('click', async () => {
      const q = __lastQty;
      if(!q){ alert('No quantities yet'); return; }
      const ok = await copyText(qtyToTSV(q, getForm()));
      if(!ok) alert('Copy failed');
    });

    apply(engineModel);

    // bracing panel selection mode (3D)

    const toggleBrace = (pick) => {
      const braces = Array.isArray(window.__prebimBraces) ? window.__prebimBraces : [];
      const idx = braces.findIndex(b => b.axis===pick.axis && b.line===pick.line && b.story===pick.story && b.bay===pick.bay);
      if(idx >= 0) braces.splice(idx,1);
      else {
        const k = document.getElementById('braceType').value || 'X';
        const stdKey = document.getElementById('stdAll').value || 'KS';
        const shapeKey = document.getElementById('braceShape')?.value || 'L';
        const sizeKey = document.getElementById('braceSize')?.value || '';
        braces.push({
          axis: pick.axis, line: pick.line, story: pick.story, bay: pick.bay,
          kind: (k==='S' || k==='HAT') ? k : 'X',
          profile: { stdKey, shapeKey, sizeKey },
        });
      }
      window.__prebimBraces = braces;
    };

    const updateBraceMode = (on) => {
      const m = getForm();
      view.setBraceMode?.(!!on, m, (pick) => {
        toggleBrace(pick);
        scheduleApply(0);
      });
      scheduleApply(0);
    };

    // Apply buttons removed; everything is realtime

    // Realtime auto-apply
    const wireRealtime = (id, ev='input') => {
      const el = document.getElementById(id);
      el?.addEventListener(ev, () => scheduleApply());
    };

    // grid
    ['spansX','spansY'].forEach(id => wireRealtime(id, 'input'));
    // levels (list)
    document.getElementById('levelsList')?.addEventListener('input', () => scheduleApply());
    // toggles
    ['optSub','subCount','optBrace','braceType','braceShape','braceSize'].forEach(id => wireRealtime(id, 'change'));

    // profiles
    ['stdAll','colShape','colSize','beamShape','beamSize','subShape','subSize'].forEach(id => wireRealtime(id, 'change'));

    // mirror subSizeMirror whenever subSize changes
    document.getElementById('subSize')?.addEventListener('change', () => {
      const mir = document.getElementById('subSizeMirror');
      if(mir){ mir.innerHTML = document.getElementById('subSize').innerHTML; mir.value = document.getElementById('subSize').value; }
    });

    // override UI wiring (columns/beams/sub-beams)
    const ovInfo = document.getElementById('ovInfo');
    const ovShape = document.getElementById('ovShape');
    const ovSize = document.getElementById('ovSize');
    const btnOvApply = document.getElementById('btnOvApply');
    const btnOvClear = document.getElementById('btnOvClear');
    const btnOvReset = document.getElementById('btnOvReset');

    const rebuildOv = () => {
      const stdKey = document.getElementById('stdAll').value || 'KS';
      const data = (window.CIVILARCHI_STEEL_DATA && window.CIVILARCHI_STEEL_DATA.standards) || {};
      const SHAPE_KEYS = ['H','C','L','LC','Rect','I','T'];
      const shapes = data[stdKey]?.shapes || {};
      const keys = SHAPE_KEYS.filter(k=>shapes[k]);
      if(ovShape && ovShape.options.length===0){
        ovShape.innerHTML='';
        keys.forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; ovShape.appendChild(o); });
        if(keys.includes('H')) ovShape.value='H';
      }
      const items = data[stdKey]?.shapes?.[ovShape?.value||'H']?.items || [];
      if(ovSize){
        const prev=ovSize.value;
        ovSize.innerHTML='';
        items.forEach(it=>{
          const o=document.createElement('option');
          o.value=it.key;
          o.textContent = `${it.name}${(it.kgm!=null && Number.isFinite(it.kgm)) ? ` · ${it.kgm} kg/m` : ''}`;
          ovSize.appendChild(o);
        });
        if(items.some(it=>it.key===prev)) ovSize.value=prev;
      }
    };

    const updateOvInfo = (sel = (view.getSelection?.() || [])) => {
      if(ovInfo) ovInfo.textContent = sel.length ? `Selected: ${sel.length}` : 'Selected: -';
    };

    view.onSelectionChange?.((sel) => {
      updateOvInfo(sel);
    });

    rebuildOv();
    ovShape?.addEventListener('change', rebuildOv);
    document.getElementById('stdAll')?.addEventListener('change', rebuildOv);

    const applyOverrideToSelection = () => {
      const sel = view.getSelection?.() || [];
      if(!sel.length) return;
      const stdKey = document.getElementById('stdAll').value || 'KS';
      const overrides = window.__prebimOverrides || {};
      for(const id of sel){
        overrides[id] = { stdKey, shapeKey: ovShape.value, sizeKey: ovSize.value };
      }
      window.__prebimOverrides = overrides;
      scheduleApply(0);
      updateOvInfo();
    };

    btnOvApply?.addEventListener('click', applyOverrideToSelection);
    ovShape?.addEventListener('change', () => { rebuildOv(); applyOverrideToSelection(); });
    ovSize?.addEventListener('change', applyOverrideToSelection);

    btnOvClear?.addEventListener('click', () => {
      view.clearSelection?.();
      updateOvInfo();
      scheduleApply(0);
    });

    btnOvReset?.addEventListener('click', () => {
      if(!confirm('Reset all overrides?')) return;
      window.__prebimOverrides = {};
      apply(getForm());
      updateOvInfo();
    });
    // (btnApplyProfile removed)


    // accordion toggles
    const toggle = (which) => {
      const panels = {
        grid: document.getElementById('panelGrid'),
        levels: document.getElementById('panelLevels'),
        sub: document.getElementById('panelSub'),
        // joist: (removed)
        profile: document.getElementById('panelProfile'),

        // analysis settings accordion
        sup: document.getElementById('panelSup'),
        conn: document.getElementById('panelConn'),
        crit: document.getElementById('panelCrit'),
        view: document.getElementById('panelView'),
      };
      const chevs = {
        grid: document.getElementById('chevGrid'),
        levels: document.getElementById('chevLevels'),
        sub: document.getElementById('chevSub'),
        // joist: (removed)
        profile: document.getElementById('chevProfile'),

        sup: document.getElementById('chevSup'),
        conn: document.getElementById('chevConn'),
        crit: document.getElementById('chevCrit'),
        view: document.getElementById('chevView'),
      };

      for(const k of Object.keys(panels)){
        const pEl = panels[k];
        if(!pEl) continue;
        const open = (k === which) ? !pEl.classList.contains('open') : false;
        pEl.classList.toggle('open', open);
        const cEl = chevs[k];
        if(cEl) cEl.textContent = open ? '▴' : '▾';
      }
    };

    document.querySelectorAll('button.acc-btn[data-acc]')
      .forEach(btn => btn.addEventListener('click', () => toggle(btn.getAttribute('data-acc'))));

    document.getElementById('btnToggleQty2')?.addEventListener('click', () => {
      document.body.classList.toggle('qty-collapsed');
    });

    document.getElementById('btnManual')?.addEventListener('click', () => {
      window.open('/prebim/manual.html', '_blank', 'noreferrer');
    });

    document.getElementById('btnSave')?.addEventListener('click', () => {
      const projects = loadProjects();
      const idx = projects.findIndex(x => x.id === p.id);
      if(idx >= 0){
        projects[idx].updatedAt = now();
        saveProjects(projects);
        setTopbarSubtitle((projects[idx].name || 'project') + ' · saved');
        setTimeout(() => setTopbarSubtitle(projects[idx].name || 'project'), 900);
      }
    });

    // Help button removed
  })();
}

let __active3D = null;

async function createThreeView(container){
  await loadDeps();
  const THREE = __three;
  const OrbitControls = __OrbitControls;

  // Only clear previous canvas, keep any sibling overlay UI outside this container.
  container.innerHTML = '';
  container.style.padding = '0';
  container.style.height = '100%';

  // Wait a moment for flex layout to settle; percent heights can be 0 on first tick.
  let w = 0, h = 0;
  for(let i=0;i<8;i++){
    w = container.clientWidth;
    h = container.clientHeight;
    if(w > 20 && h > 20) break;
    await new Promise(r => setTimeout(r, 50));
  }
  w = w || 300;
  h = h || 300;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(45, w/h, 0.01, 5000);
  camera.position.set(10, 8, 10);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
  renderer.localClippingEnabled = true;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(6, 3, 6);

  let userInteracted = false;
  controls.addEventListener('start', () => { userInteracted = true; });
  let hasCentered = false;

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb9d6ff, 0.75);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.05);
  dir.position.set(12, 18, 8);
  scene.add(dir);

  // helpers
  // Ground grid (disabled by request)
  // const grid = new THREE.GridHelper(30, 30, 0x8aa3c7, 0xd7e3f5);
  // grid.position.y = 0;
  // scene.add(grid);

  const group = new THREE.Group();
  scene.add(group);

  // brace face selection overlays
  const faceGroup = new THREE.Group();
  scene.add(faceGroup);

  // analysis overlay (deformed shape + displacement colormap)
  const analysisGroup = new THREE.Group();
  scene.add(analysisGroup);
  let analysisLine = null;
  let analysisMaxMarker = null;
  let analysisState = null;

  // support markers
  const supportGroup = new THREE.Group();
  scene.add(supportGroup);

  // base node pickers for support editing
  const baseNodeGroup = new THREE.Group();
  scene.add(baseNodeGroup);

  // connection end markers (PIN/FIX)
  const connGroup = new THREE.Group();
  scene.add(connGroup);

  let supportEdit = false;
  let memberPickEnabled = true;
  let onSupportToggle = null;

  // 3D guide lines (grid outline + level outlines)
  const guideGroup = new THREE.Group();
  scene.add(guideGroup);
  let guidesOn = true;
  guideGroup.visible = guidesOn;
  const guideMat = new THREE.LineBasicMaterial({ color:0x94a3b8, transparent:true, opacity:0.55 });
  const guideMat2 = new THREE.LineBasicMaterial({ color:0x94a3b8, transparent:true, opacity:0.35 });

  const guideSprites = [];
  const makeTextSprite = (text, opts={}) => {
    const fontSize = opts.fontSize || 48;
    const pad = opts.pad || 18;
    const fg = opts.fg || 'rgba(11,27,58,0.85)';
    const bg = opts.bg || 'rgba(255,255,255,0.85)';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width + pad*2);
    const h = Math.ceil(fontSize + pad*2);
    canvas.width = w;
    canvas.height = h;

    ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.fillStyle = bg;
    ctx.strokeStyle = 'rgba(11,27,58,0.10)';
    ctx.lineWidth = 4;
    // rounded rect
    const r = 18;
    ctx.beginPath();
    ctx.moveTo(r,0);
    ctx.lineTo(w-r,0);
    ctx.quadraticCurveTo(w,0,w,r);
    ctx.lineTo(w,h-r);
    ctx.quadraticCurveTo(w,h,w-r,h);
    ctx.lineTo(r,h);
    ctx.quadraticCurveTo(0,h,0,h-r);
    ctx.lineTo(0,r);
    ctx.quadraticCurveTo(0,0,r,0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, pad, h/2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    // scale in world units (meters)
    const scale = opts.scale || 0.018; // meters per pixel
    sp.scale.set(w*scale, h*scale, 1);
    sp.renderOrder = 10;
    sp.userData.isGuide = true;
    sp.userData.baseScale = sp.scale.clone();
    guideSprites.push(sp);
    return sp;
  };
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const faceMatHot = new THREE.MeshBasicMaterial({
    color: 0x7c3aed,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let braceMode = false;
  let onFaceSelect = null;
  let hot = null;

  // member selection
  const selectRay = new THREE.Raycaster();
  const selected = new Set();

  // section box (clipping)
  const clipPlanes = [
    new THREE.Plane(new THREE.Vector3( 1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3( 0, 1, 0), 0),
    new THREE.Plane(new THREE.Vector3( 0,-1, 0), 0),
    new THREE.Plane(new THREE.Vector3( 0, 0, 1), 0),
    new THREE.Plane(new THREE.Vector3( 0, 0,-1), 0),
  ];
  let secBoxOn = false;
  let secBox = { x0:0, x1:1, y0:0, y1:1, z0:0, z1:1 };
  let lastClipModel = null;
  const boxHelper = new THREE.Box3Helper(new THREE.Box3(), 0x60a5fa);
  boxHelper.visible = false;
  boxHelper.material.transparent = true;
  boxHelper.material.opacity = 0.35;
  scene.add(boxHelper);

  function applyClipping(model){
    lastClipModel = model || lastClipModel;
    const mm = model || lastClipModel;
    if(!mm) return;

    // compute extents from grid+levels
    const spansX = mm?.grid?.spansXmm || [];
    const spansY = mm?.grid?.spansYmm || [];
    const xs=[0], zs=[0];
    for(const s of spansX) xs.push(xs[xs.length-1] + (s/1000));
    for(const s of spansY) zs.push(zs[zs.length-1] + (s/1000));
    const xMax = xs[xs.length-1] || 1;
    const zMax = zs[zs.length-1] || 1;
    const lv = Array.isArray(mm?.levels) ? mm.levels : [0,6000];
    const yMin = (lv[0]||0)/1000;
    const yMax = (lv[lv.length-1]||6000)/1000;

    const x0 = secBox.x0 * xMax;
    const x1 = secBox.x1 * xMax;
    const y0 = yMin + secBox.y0 * (yMax - yMin);
    const y1 = yMin + secBox.y1 * (yMax - yMin);
    const z0 = secBox.z0 * zMax;
    const z1 = secBox.z1 * zMax;

    // planes: normal dot p + constant >= 0 keeps inside
    clipPlanes[0].set(new THREE.Vector3( 1,0,0), -x0);
    clipPlanes[1].set(new THREE.Vector3(-1,0,0),  x1);
    clipPlanes[2].set(new THREE.Vector3(0, 1,0), -y0);
    clipPlanes[3].set(new THREE.Vector3(0,-1,0),  y1);
    clipPlanes[4].set(new THREE.Vector3(0,0, 1), -z0);
    clipPlanes[5].set(new THREE.Vector3(0,0,-1),  z1);

    boxHelper.box.min.set(x0,y0,z0);
    boxHelper.box.max.set(x1,y1,z1);
    boxHelper.visible = secBoxOn;

    // Prefer GLOBAL renderer clipping to avoid losing clipping when materials are replaced.
    renderer.clippingPlanes = secBoxOn ? clipPlanes : [];

    // Ensure all materials use intersection behavior.
    group.traverse(obj => {
      if(obj.material && obj.material.isMaterial){
        obj.material.clipIntersection = true;
        obj.material.needsUpdate = true;
      }
    });
  }

  const matByKind = {
    column: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness:0.55, metalness:0.25 }),
    beamX: new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness:0.55, metalness:0.22 }),
    beamY: new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness:0.55, metalness:0.22 }),
    subBeam: new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness:0.60, metalness:0.18 }),
    joist: new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent:true, opacity:0.55 }),
    brace: new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness:0.55, metalness:0.20 }),
  };

  function parseProfileDimsMm(name){
    const s0 = String(name||'').trim().replaceAll('X','x');
    const s = s0.replaceAll('×','x');
    const shapeKey = (s.split(/\s+/)[0] || 'BOX').toUpperCase();

    // L: a x b x t
    const mL = s.match(/^L\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mL){
      const a=+mL[1], b=+mL[2], t=+mL[3];
      return { shape:'L', d:a, b, tw:t, tf:t, lip:0 };
    }

    // H/I: d x b x tw x tf
    const mHI = s.match(/^(H|I)\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mHI){
      return { shape: mHI[1].toUpperCase(), d:+mHI[2], b:+mHI[3], tw:+mHI[4], tf:+mHI[5], lip:0 };
    }

    // C: d x b x tw x tf
    const mC = s.match(/^C\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mC){
      return { shape:'C', d:+mC[1], b:+mC[2], tw:+mC[3], tf:+mC[4], lip:0 };
    }

    // LC: d x b x lip x t
    const mLC = s.match(/^LC\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mLC){
      const d=+mLC[1], b=+mLC[2], lip=+mLC[3], t=+mLC[4];
      return { shape:'LC', d, b, tw:t, tf:t, lip };
    }

    // T: b x d (heuristic)
    const mT2 = s.match(/^T\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    if(mT2){
      const b=+mT2[1], d=+mT2[2];
      const t = Math.max(6, Math.min(b,d)*0.10);
      return { shape:'T', d, b, tw:t, tf:t, lip:0 };
    }

    // fallback: first two dims -> box
    const m2 = s.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    const d = m2 ? parseFloat(m2[1]) : 150;
    const b = m2 ? parseFloat(m2[2]) : 150;
    const t = Math.max(6, Math.min(b,d)*0.08);
    return { shape: shapeKey, d, b, tw:t, tf:t, lip:0 };
  }

  function memberProfileName(kind, model, memberId){
    const prof = model?.profiles || {};
    const ov = model?.overrides?.[memberId] || window.__prebimOverrides?.[memberId] || null;
    if(kind === 'column'){
      if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.colShape||'H', ov.sizeKey||prof.colSize||'')?.name || ov.sizeKey;
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.colShape||'H', prof.colSize||'')?.name || prof.colSize;
    }
    if(kind === 'beamX' || kind === 'beamY'){
      if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.beamShape||'H', ov.sizeKey||prof.beamSize||'')?.name || ov.sizeKey;
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'')?.name || prof.beamSize;
    }
    if(kind === 'subBeam'){
      if(ov) return __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.subShape||'H', ov.sizeKey||prof.subSize||'')?.name || ov.sizeKey;
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.subShape||'H', prof.subSize||'')?.name || prof.subSize;
    }
    if(kind === 'brace'){
      return __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'')?.name || prof.braceSize;
    }
    return '';
  }


  function buildFacePlanes(model){
    while(faceGroup.children.length) faceGroup.remove(faceGroup.children[0]);
    if(!model) return;

    const spansX = model.grid?.spansXmm || [];
    const spansY = model.grid?.spansYmm || [];
    const xs = [0];
    const ys = [0];
    for(const s of spansX) xs.push(xs[xs.length-1] + (s/1000));
    for(const s of spansY) ys.push(ys[ys.length-1] + (s/1000));
    const nx = xs.length;
    const ny = ys.length;

    const levels = Array.isArray(model.levels) ? model.levels : [0,6000];
    const storyCount = Math.max(1, levels.length - 1);

    const addPanel = (axis, line, bay, story, w, h) => {
      const g = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(g, faceMat.clone());
      mesh.userData.axis = axis;
      mesh.userData.line = line;
      mesh.userData.bay = bay;
      mesh.userData.story = story;
      return mesh;
    };

    for(let story=0; story<storyCount; story++){
      const z0 = ((levels?.[story] ?? 0)/1000);
      const z1 = ((levels?.[story+1] ?? ((levels?.[story]||0) + 6000))/1000);
      const hZ = z1 - z0;

      // Y-planes: for each grid line in Y, panels per X bay
      for(let j=0; j<ny; j++){
        const y = ys[j];
        for(let ix=0; ix<nx-1; ix++){
          const wX = xs[ix+1]-xs[ix];
          const p = addPanel('Y', j, ix, story, wX, hZ);
          p.position.set(xs[ix] + wX/2, z0 + hZ/2, y);
          p.rotation.x = Math.PI;
          // inner planes slightly lighter
          if(j>0 && j<ny-1) p.material.opacity = 0.08;
          faceGroup.add(p);
        }
      }

      // X-planes: for each grid line in X, panels per Y bay
      for(let i=0; i<nx; i++){
        const x = xs[i];
        for(let iy=0; iy<ny-1; iy++){
          const wY = ys[iy+1]-ys[iy];
          const p = addPanel('X', i, iy, story, wY, hZ);
          p.position.set(x, z0 + hZ/2, ys[iy] + wY/2);
          p.rotation.y = (i===0) ? Math.PI/2 : (i===nx-1 ? -Math.PI/2 : Math.PI/2);
          if(i>0 && i<nx-1) p.material.opacity = 0.08;
          faceGroup.add(p);
        }
      }
    }
  }

  function setMembers(members, model){
    while(group.children.length) group.remove(group.children[0]);
    while(guideGroup.children.length) guideGroup.remove(guideGroup.children[0]);
    clearAnalysis();

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0,1,0);
    const quat = new THREE.Quaternion();

    for(const mem of members){
      const mat = matByKind[mem.kind] || matByKind.beamX;

      vA.set(mem.a[0], mem.a[1], mem.a[2]);
      vB.set(mem.b[0], mem.b[1], mem.b[2]);
      dir.copy(vB).sub(vA);
      const len = dir.length();
      if(len <= 1e-6) continue;
      dir.normalize();
      mid.copy(vA).add(vB).multiplyScalar(0.5);

      // 3D solid for column/beam/subBeam/brace. Keep joist as line for now.
      if(mem.kind === 'column' || mem.kind === 'beamX' || mem.kind === 'beamY' || mem.kind === 'subBeam' || mem.kind === 'brace'){
        let profName = memberProfileName(mem.kind, model, mem.id);
        if(mem.kind === 'brace' && mem.profile && typeof mem.profile === 'object'){
          const pr = mem.profile;
          profName = __profiles?.getProfile?.(pr.stdKey||'KS', pr.shapeKey||'L', pr.sizeKey||'')?.name || pr.sizeKey || profName;
        }
        const dims = parseProfileDimsMm(profName);
        const d = (Math.max(30, dims.d)/1000);
        const b = (Math.max(30, dims.b)/1000);
        const tw = (Math.max(6, dims.tw)/1000);
        const tf = (Math.max(6, dims.tf)/1000);

        const meshMat = mat.clone();

        const makeSectionAlongZ = () => {
          if(!__threeUtils?.mergeGeometries) return new THREE.BoxGeometry(b, d, len);
          const geoms = [];

          if(dims.shape === 'H' || dims.shape === 'I'){
            const webH = Math.max(1e-6, d - 2*tf);
            const gTop = new THREE.BoxGeometry(b, tf, len);
            gTop.translate(0, (d - tf)/2, 0);
            const gBot = new THREE.BoxGeometry(b, tf, len);
            gBot.translate(0, -(d - tf)/2, 0);
            const gWeb = new THREE.BoxGeometry(tw, webH, len);
            geoms.push(gTop, gBot, gWeb);
            return __threeUtils.mergeGeometries(geoms, false);
          }

          if(dims.shape === 'T'){
            const stemH = Math.max(1e-6, d - tf);
            const gFl = new THREE.BoxGeometry(b, tf, len);
            gFl.translate(0, (d - tf)/2, 0);
            const gStem = new THREE.BoxGeometry(tw, stemH, len);
            gStem.translate(0, -(tf)/2, 0);
            geoms.push(gFl, gStem);
            return __threeUtils.mergeGeometries(geoms, false);
          }

          if(dims.shape === 'L'){
            // Angle: two legs
            const g1 = new THREE.BoxGeometry(b, tf, len);
            g1.translate(0, (d - tf)/2, 0);
            const g2 = new THREE.BoxGeometry(tw, d, len);
            g2.translate(-(b/2) + (tw/2), 0, 0);
            geoms.push(g1, g2);
            return __threeUtils.mergeGeometries(geoms, false);
          }

          if(dims.shape === 'C' || dims.shape === 'LC'){
            // Channel centered around x=0, opening to +x
            const webH = Math.max(1e-6, d - 2*tf);
            const gWeb = new THREE.BoxGeometry(tw, webH, len);
            gWeb.translate(-(b/2) + (tw/2), 0, 0);
            const gTop = new THREE.BoxGeometry(b, tf, len);
            gTop.translate(0, (d - tf)/2, 0);
            const gBot = new THREE.BoxGeometry(b, tf, len);
            gBot.translate(0, -(d - tf)/2, 0);
            geoms.push(gWeb, gTop, gBot);
            if(dims.shape === 'LC' && dims.lip > 0){
              const lip = (dims.lip/1000);
              const gLipT = new THREE.BoxGeometry(tw, lip, len);
              gLipT.translate((b/2) - (tw/2), (d/2) - (tf) - (lip/2), 0);
              const gLipB = new THREE.BoxGeometry(tw, lip, len);
              gLipB.translate((b/2) - (tw/2), -(d/2) + (tf) + (lip/2), 0);
              geoms.push(gLipT, gLipB);
            }
            return __threeUtils.mergeGeometries(geoms, false);
          }

          return new THREE.BoxGeometry(b, d, len);
        };

        const makeSectionAlongY = () => {
          // Same section but with LENGTH along local Y (for columns)
          if(!__threeUtils?.mergeGeometries) return new THREE.BoxGeometry(b, len, d);
          const geoms = [];

          if(dims.shape === 'H' || dims.shape === 'I'){
            const webH = Math.max(1e-6, d - 2*tf);
            const gTop = new THREE.BoxGeometry(b, len, tf);
            gTop.translate(0, 0, (d - tf)/2);
            const gBot = new THREE.BoxGeometry(b, len, tf);
            gBot.translate(0, 0, -(d - tf)/2);
            const gWeb = new THREE.BoxGeometry(tw, len, webH);
            geoms.push(gTop, gBot, gWeb);
            return __threeUtils.mergeGeometries(geoms, false);
          }

          if(dims.shape === 'T'){
            const stemH = Math.max(1e-6, d - tf);
            const gFl = new THREE.BoxGeometry(b, len, tf);
            gFl.translate(0, 0, (d - tf)/2);
            const gStem = new THREE.BoxGeometry(tw, len, stemH);
            gStem.translate(0, 0, -(tf)/2);
            geoms.push(gFl, gStem);
            return __threeUtils.mergeGeometries(geoms, false);
          }

          if(dims.shape === 'C' || dims.shape === 'LC'){
            const webH = Math.max(1e-6, d - 2*tf);
            const gWeb = new THREE.BoxGeometry(tw, len, webH);
            gWeb.translate(-(b/2) + (tw/2), 0, 0);
            const gTop = new THREE.BoxGeometry(b, len, tf);
            gTop.translate(0, 0, (d - tf)/2);
            const gBot = new THREE.BoxGeometry(b, len, tf);
            gBot.translate(0, 0, -(d - tf)/2);
            geoms.push(gWeb, gTop, gBot);
            if(dims.shape === 'LC' && dims.lip > 0){
              const lip = (dims.lip/1000);
              const gLipT = new THREE.BoxGeometry(tw, len, lip);
              gLipT.translate((b/2) - (tw/2), 0, (d/2) - tf - (lip/2));
              const gLipB = new THREE.BoxGeometry(tw, len, lip);
              gLipB.translate((b/2) - (tw/2), 0, -(d/2) + tf + (lip/2));
              geoms.push(gLipT, gLipB);
            }
            return __threeUtils.mergeGeometries(geoms, false);
          }

          return new THREE.BoxGeometry(b, len, d);
        };

        const isMostlyVertical = Math.abs(dir.y) > 0.85;
        if(isMostlyVertical){
          // Column: use real section geometry, length along local Y
          const geom = makeSectionAlongY();
          const mesh = new THREE.Mesh(geom, meshMat);
          quat.setFromUnitVectors(yAxis, dir);
          mesh.quaternion.copy(quat);
          mesh.position.copy(mid);
          mesh.userData.memberId = mem.id;
          mesh.userData.kind = mem.kind;
          mesh.userData.mid = [mid.x, mid.y, mid.z];

          try{
            const e = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 12), new THREE.LineBasicMaterial({ color:0x0b1b3a, transparent:true, opacity:0.22 }));
            e.visible = outlines;
            e.userData.isEdge = true;
            mesh.add(e);
          }catch{}

          group.add(mesh);
        } else {
          // Beam/sub-beam: section vertical (world Y), length along dir
          const zAxis = new THREE.Vector3(0,0,1);
          const geom = makeSectionAlongZ();
          const mesh = new THREE.Mesh(geom, meshMat);
          quat.setFromUnitVectors(zAxis, dir);
          mesh.quaternion.copy(quat);

          // Place so TOP of member is on level line
          mesh.position.copy(mid);
          mesh.position.y -= (d/2);

          mesh.userData.memberId = mem.id;
          mesh.userData.kind = mem.kind;
          mesh.userData.mid = [mid.x, mid.y, mid.z];
          group.add(mesh);
        }
      } else {
        const geom = new THREE.BufferGeometry().setFromPoints([vA.clone(), vB.clone()]);
        const line = new THREE.Line(geom, mat);
        line.userData.memberId = mem.id;
        line.userData.kind = mem.kind;
        line.userData.mid = [mid.x, mid.y, mid.z];
        group.add(line);
      }
    }

    if(braceMode) buildFacePlanes(model);

    applyClipping(model);

    // guides: grid lines + labels at base, and level outlines + labels
    try{
      const spansX = model?.grid?.spansXmm || [];
      const spansY = model?.grid?.spansYmm || [];
      const xs=[0], zs=[0];
      for(const s of spansX) xs.push(xs[xs.length-1] + (s/1000));
      for(const s of spansY) zs.push(zs[zs.length-1] + (s/1000));
      const xMax = xs[xs.length-1] || 1;
      const zMax = zs[zs.length-1] || 1;

      const offset = 2.5; // meters (≈ 2500mm)

      // base grid lines
      for(let i=0;i<xs.length;i++){
        const x = xs[i];
        const pts = [ new THREE.Vector3(x,0,0), new THREE.Vector3(x,0,zMax) ];
        guideGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), guideMat2));
        const lab = makeTextSprite(`X${i+1}`, { fontSize: 38, scale: 0.012 });
        lab.position.set(x, 0.01, -offset);
        guideGroup.add(lab);
      }
      for(let j=0;j<zs.length;j++){
        const z = zs[j];
        const pts = [ new THREE.Vector3(0,0,z), new THREE.Vector3(xMax,0,z) ];
        guideGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), guideMat2));
        const lab = makeTextSprite(`Y${j+1}`, { fontSize: 38, scale: 0.012 });
        lab.position.set(-offset, 0.01, z);
        guideGroup.add(lab);
      }

      // level outer rectangles + labels
      const lv = Array.isArray(model?.levels) ? model.levels : [];
      for(let k=0;k<lv.length;k++){
        const y = (lv[k]||0)/1000;
        const pts = [
          new THREE.Vector3(0,y,0),
          new THREE.Vector3(xMax,y,0),
          new THREE.Vector3(xMax,y,zMax),
          new THREE.Vector3(0,y,zMax),
          new THREE.Vector3(0,y,0),
        ];
        guideGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), guideMat));
        const lab = makeTextSprite(`L${k+1} ${Math.round(lv[k]||0)}`, { fontSize: 38, scale: 0.012 });
        lab.position.set(xMax + offset, y, 0);
        guideGroup.add(lab);
      }
    }catch{}

    // recenter only on first render (avoid resetting user's camera)
    if(!hasCentered && !userInteracted){
      const box = new THREE.Box3().setFromObject(group);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      if(Number.isFinite(center.x)){
        controls.target.copy(center);
        const r = Math.max(size.x, size.y, size.z) || 10;
        camera.position.set(center.x + r*0.9, center.y + r*0.6, center.z + r*0.9);
        hasCentered = true;
      }
    }
  }

  function setBraceMode(on, model, cb){
    braceMode = !!on;
    onFaceSelect = cb || null;
    faceGroup.visible = braceMode;
    if(braceMode) buildFacePlanes(model);
    else {
      while(faceGroup.children.length) faceGroup.remove(faceGroup.children[0]);
    }
  }

  function pick(ev){
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

    // Support edit mode: pick base nodes only, disable member selection
    if(supportEdit){
      raycaster.setFromCamera(pointer, camera);
      const nh = raycaster.intersectObjects(baseNodeGroup.children, false);
      if(nh.length){
        const nid = nh[0]?.object?.userData?.nodeId;
        if(nid && onSupportToggle) onSupportToggle(String(nid));
      }
      return;
    }

    if(braceMode){
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(faceGroup.children, false);
      if(hits.length){
        const obj = hits[0].object;
        if(hot && hot.material) hot.material = faceMat.clone();
        hot = obj;
        if(hot.material) hot.material = faceMatHot.clone();
        const axis = obj.userData.axis;
        const line = obj.userData.line;
        const bay = obj.userData.bay;
        const story = obj.userData.story;
        if(axis != null && line != null && bay != null && story != null && onFaceSelect){
          onFaceSelect({ axis: String(axis), line: Number(line), bay: Number(bay), story: Number(story) });
        }
      }
      return;
    }

    if(!memberPickEnabled) return;

    // member selection
    selectRay.setFromCamera(pointer, camera);
    const hits = selectRay.intersectObjects(group.children, false);
    if(!hits.length){
      // click empty clears selection but keep FAIL highlighting
      selected.clear();
      applyHighlight();
      onSel && onSel([]);
      return;
    }
    const obj = hits[0].object;
    const id = obj.userData.memberId;
    if(!id) return;

    // toggle single selection (allow any member kind in analysis too)
    if(selected.has(id)) selected.delete(id);
    else {
      selected.clear();
      selected.add(id);
    }

    // visual highlight (solid meshes)
    group.children.forEach(ch => {
      const sel = selected.has(ch.userData.memberId);
      const baseMat = matByKind[ch.userData.kind] || matByKind.beamX;
      if(ch.material && ch.material.isMaterial){
        ch.material = baseMat.clone();
        if('emissive' in ch.material){
          ch.material.emissive = new THREE.Color(sel ? 0xef4444 : 0x000000);
          ch.material.emissiveIntensity = sel ? 0.60 : 0;
        }
      }
    });

    onSel && onSel(Array.from(selected));
    applyClipping(lastClipModel);
  }

  renderer.domElement.addEventListener('pointerdown', pick);

  // Shift+drag box selection (members). Disabled in braceMode and supportEdit.
  const selBox = document.createElement('div');
  // Use fixed positioning so left/top match clientX/clientY regardless of grid offsets
  selBox.style.position='fixed';
  selBox.style.border='2px dashed rgba(239,68,68,0.85)';
  selBox.style.background='rgba(239,68,68,0.06)';
  selBox.style.pointerEvents='none';
  selBox.style.display='none';
  selBox.style.zIndex='40';
  // insert above everything
  document.body.appendChild(selBox);

  let boxDrag = null;
  const toLocal = (clientX, clientY) => {
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, rect };
  };

  const boxSelect = (x0,y0,x1,y1) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const minX = Math.min(x0,x1), maxX = Math.max(x0,x1);
    const minY = Math.min(y0,y1), maxY = Math.max(y0,y1);

    const ids = new Set();
    const v = new THREE.Vector3();
    for(const obj of group.children){
      const mid = obj.userData?.mid;
      if(!mid) continue;
      v.set(mid[0], mid[1], mid[2]);
      v.project(camera);
      const sx = (v.x*0.5+0.5) * rect.width;
      const sy = (-v.y*0.5+0.5) * rect.height;
      if(sx>=minX && sx<=maxX && sy>=minY && sy<=maxY){
        const id = obj.userData?.memberId;
        if(id) ids.add(String(id));
      }
    }
    setSelection(Array.from(ids));
  };

  const onBoxDown = (ev) => {
    if(ev.button !== 0) return;
    if(!ev.shiftKey) return;
    if(supportEdit) return;
    if(braceMode) return;
    if(!memberPickEnabled) return;
    ev.preventDefault();

    // prevent orbit controls while box selecting
    try{ controls.enabled = false; }catch{}

    const p = toLocal(ev.clientX, ev.clientY);
    boxDrag = { x0:p.x, y0:p.y, rect:p.rect };
    selBox.style.left = `${p.rect.left + p.x}px`;
    selBox.style.top = `${p.rect.top + p.y}px`;
    selBox.style.width = '0px';
    selBox.style.height = '0px';
    selBox.style.display = 'block';
  };

  const onBoxMove = (ev) => {
    if(!boxDrag) return;
    const p = toLocal(ev.clientX, ev.clientY);
    const minX = Math.min(boxDrag.x0, p.x);
    const minY = Math.min(boxDrag.y0, p.y);
    const w = Math.abs(p.x - boxDrag.x0);
    const h = Math.abs(p.y - boxDrag.y0);
    selBox.style.left = `${p.rect.left + minX}px`;
    selBox.style.top = `${p.rect.top + minY}px`;
    selBox.style.width = `${w}px`;
    selBox.style.height = `${h}px`;
  };

  const onBoxUp = (ev) => {
    if(!boxDrag) return;
    const p = toLocal(ev.clientX, ev.clientY);
    selBox.style.display='none';
    const dx = Math.abs(p.x - boxDrag.x0);
    const dy = Math.abs(p.y - boxDrag.y0);
    if(dx>6 && dy>6){
      boxSelect(boxDrag.x0, boxDrag.y0, p.x, p.y);
    }
    boxDrag = null;

    // restore orbit controls
    try{ controls.enabled = true; }catch{}
  };

  renderer.domElement.addEventListener('pointerdown', onBoxDown, { capture:true });
  window.addEventListener('pointermove', onBoxMove);
  window.addEventListener('pointerup', onBoxUp);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    controls.update();

    // Keep guide label size readable (approx constant on screen)
    try{
      for(const sp of guideSprites){
        if(!sp.visible) continue;
        const dist = camera.position.distanceTo(sp.position);
        const k = 0.028; // tune: meters per meter distance (slightly larger)
        const s = dist * k;
        const bs = sp.userData.baseScale || sp.scale;
        sp.scale.set(bs.x*s, bs.y*s, 1);
      }
    }catch{}

    renderer.render(scene, camera);
  };
  animate();

  const doResize = () => {
    const w2 = container.clientWidth || 300;
    const h2 = container.clientHeight || 300;
    renderer.setSize(w2, h2);
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
  };

  const ro = new ResizeObserver(doResize);
  ro.observe(container);

  function getSelection(){ return Array.from(selected); }
  function setSelection(ids){
    selected.clear();
    (ids||[]).forEach(id => id && selected.add(id));
    applyHighlight();
    onSel && onSel(Array.from(selected));
  }
  function clearSelection(){ setSelection([]); }
  let onSel = null;
  function onSelectionChange(fn){ onSel = fn; }

  // Outlines are always on (per request)
  const outlines = true;

  function toggleGuides(){
    guidesOn = !guidesOn;
    guideGroup.visible = guidesOn;
    return guidesOn;
  }

  function clearAnalysis(){
    analysisState = null;
    if(analysisLine){
      analysisGroup.remove(analysisLine);
      analysisLine.geometry?.dispose?.();
      analysisLine.material?.dispose?.();
      analysisLine = null;
    }
    if(analysisMaxMarker){
      analysisGroup.remove(analysisMaxMarker);
      // dispose children
      try{
        analysisMaxMarker.traverse?.((o) => {
          o.geometry?.dispose?.();
          if(o.material){
            if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose?.());
            else o.material.dispose?.();
          }
          o.texture?.dispose?.();
        });
      }catch{}
      analysisMaxMarker = null;
    }
  }

  const colorRamp = (t) => {
    // blue -> cyan -> green -> yellow -> red
    t = Math.max(0, Math.min(1, t));
    const stops = [
      [0.00, [0.23,0.51,0.96]],
      [0.25, [0.13,0.82,0.93]],
      [0.50, [0.16,0.84,0.55]],
      [0.75, [0.98,0.84,0.22]],
      [1.00, [0.94,0.27,0.27]],
    ];
    for(let i=0;i<stops.length-1;i++){
      const a=stops[i], b=stops[i+1];
      if(t>=a[0] && t<=b[0]){
        const u=(t-a[0])/(b[0]-a[0]||1);
        return [
          a[1][0] + (b[1][0]-a[1][0])*u,
          a[1][1] + (b[1][1]-a[1][1])*u,
          a[1][2] + (b[1][2]-a[1][2])*u,
        ];
      }
    }
    return stops[stops.length-1][1];
  };

  function setAnalysisResult(result, payload){
    const prevScale = analysisState?.scale ?? 120;
    clearAnalysis();
    if(!result?.nodes || !payload?.members || !payload?.nodes) return;

    const disp = result.nodes; // {nodeId:{dx,dy,dz}}
    const nodePos = new Map(payload.nodes.map(n => [String(n.id), [n.x,n.y,n.z]]));

    // precompute max displacement magnitude
    let maxD = 0;
    for(const [nid, d] of Object.entries(disp)){
      const mag = Math.hypot(d.dx||0, d.dy||0, d.dz||0);
      if(mag > maxD) maxD = mag;
    }
    maxD = maxD || 1e-9;

    analysisState = { result, payload, maxD, scale: prevScale };

    const build = () => {
      if(!analysisState) return;
      const scale = analysisState.scale;

      const positions = [];
      const colors = [];

      for(const mem of payload.members){
        const i = String(mem.i), j = String(mem.j);
        const pi = nodePos.get(i); const pj = nodePos.get(j);
        if(!pi || !pj) continue;
        const di = disp[i] || {dx:0,dy:0,dz:0};
        const dj = disp[j] || {dx:0,dy:0,dz:0};

        const xi = pi[0] + (di.dx||0)*scale;
        const yi = pi[1] + (di.dy||0)*scale;
        const zi = pi[2] + (di.dz||0)*scale;
        const xj = pj[0] + (dj.dx||0)*scale;
        const yj = pj[1] + (dj.dy||0)*scale;
        const zj = pj[2] + (dj.dz||0)*scale;

        positions.push(xi,yi,zi, xj,yj,zj);

        const mi = Math.hypot(di.dx||0, di.dy||0, di.dz||0);
        const mj = Math.hypot(dj.dx||0, dj.dy||0, dj.dz||0);
        const t = (0.5*(mi+mj)) / analysisState.maxD;
        const c = colorRamp(t);
        colors.push(c[0],c[1],c[2], c[0],c[1],c[2]);
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:0.95 });
      const line = new THREE.LineSegments(geom, mat);
      line.renderOrder = 20;

      analysisLine = line;
      analysisGroup.add(line);
    };

    build();

    // max disp marker
    try{
      const maxId = String(result?.maxDisp?.nodeId || '');
      if(maxId && nodePos.has(maxId)){
        const p0 = nodePos.get(maxId);
        const d0 = disp[maxId] || {dx:0,dy:0,dz:0};
        const scale = analysisState.scale;
        const px = p0[0] + (d0.dx||0)*scale;
        const py = p0[1] + (d0.dy||0)*scale;
        const pz = p0[2] + (d0.dz||0)*scale;

        // estimate model scale
        let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
        for(const n of payload.nodes){
          minX=Math.min(minX,n.x); minY=Math.min(minY,n.y); minZ=Math.min(minZ,n.z);
          maxX=Math.max(maxX,n.x); maxY=Math.max(maxY,n.y); maxZ=Math.max(maxZ,n.z);
        }
        const diag = Math.hypot(maxX-minX, maxY-minY, maxZ-minZ) || 10;
        const rr = Math.max(0.14, diag*0.012);

        const g = new THREE.Group();
        const sph = new THREE.Mesh(
          new THREE.SphereGeometry(rr, 20, 20),
          new THREE.MeshBasicMaterial({ color: 0xef4444, transparent:true, opacity:0.92, depthWrite:false })
        );
        sph.position.set(px,py,pz);
        sph.renderOrder = 25;
        g.add(sph);

        // simple text sprite using canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const txt = `max disp\nnode ${maxId}`;
        const lines = txt.split('\n');
        const pad = 10;
        const fs = 22;
        ctx.font = `800 ${fs}px ui-sans-serif, system-ui`;
        let wText = 0;
        for(const l of lines){ wText = Math.max(wText, ctx.measureText(l).width); }
        const w = Math.ceil(wText + pad*2);
        const h = fs*lines.length + pad*2 + 6;
        canvas.width = w; canvas.height = h;
        ctx.font = `800 ${fs}px ui-sans-serif, system-ui`;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = 'rgba(2,6,23,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const r = 14;
        ctx.moveTo(r,0);
        ctx.arcTo(w,0,w,h,r);
        ctx.arcTo(w,h,0,h,r);
        ctx.arcTo(0,h,0,0,r);
        ctx.arcTo(0,0,w,0,r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(11,27,58,0.9)';
        ctx.textBaseline = 'top';
        let y = pad;
        for(const l of lines){ ctx.fillText(l, pad, y); y += fs; }

        const tex = new THREE.CanvasTexture(canvas);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent:true, depthWrite:false }));
        spr.position.set(px, py + rr*2.4, pz);
        const sprScale = Math.max(0.6, diag*0.06);
        spr.scale.set(sprScale*(w/h), sprScale, 1);
        spr.renderOrder = 26;
        g.add(spr);

        analysisMaxMarker = g;
        analysisGroup.add(g);
      }
    }catch(e){ console.warn('max marker failed', e); }
  }

  function setAnalysisScale(scale){
    if(!analysisState) return;
    analysisState.scale = scale;
    // rebuild
    setAnalysisResult(analysisState.result, analysisState.payload);
  }

  function setSupportMarkers(supports, nodes, supportMode='PINNED'){
    while(supportGroup.children.length) supportGroup.remove(supportGroup.children[0]);
    if(!supports || !nodes) return;

    const nodeMap = new Map((nodes||[]).map(n => [String(n.id), n]));
    const fixed = String(supportMode).toUpperCase() === 'FIXED';

    // scale marker to model size
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const n of (nodes||[])){
      minX=Math.min(minX,n.x); minY=Math.min(minY,n.y); minZ=Math.min(minZ,n.z);
      maxX=Math.max(maxX,n.x); maxY=Math.max(maxY,n.y); maxZ=Math.max(maxZ,n.z);
    }
    const diag = Math.hypot(maxX-minX, maxY-minY, maxZ-minZ) || 10;
    const r = Math.max(0.12, diag * 0.015);
    const h = Math.max(0.24, diag * 0.03);

    const mat = new THREE.MeshBasicMaterial({ color: fixed ? 0x7c3aed : 0x0ea5e9, transparent:true, opacity:0.90, depthWrite:false });
    const geom = new THREE.ConeGeometry(r, h, 18);
    const baseGeom = new THREE.CylinderGeometry(r*1.15, r*1.15, Math.max(0.04, h*0.18), 18);
    const baseMat = new THREE.MeshBasicMaterial({ color: fixed ? 0x5b21b6 : 0x0369a1, transparent:true, opacity:0.45, depthWrite:false });

    for(const s of supports){
      const n = nodeMap.get(String(s.nodeId));
      if(!n) continue;

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(n.x, n.y - (h*0.15), n.z);
      mesh.rotation.x = Math.PI;
      mesh.userData.nodeId = String(s.nodeId);
      supportGroup.add(mesh);

      const base = new THREE.Mesh(baseGeom, baseMat);
      base.position.set(n.x, n.y - (h*0.02), n.z);
      base.userData.nodeId = String(s.nodeId);
      supportGroup.add(base);
    }
  }

  function clearConnMarkers(){
    while(connGroup.children.length) connGroup.remove(connGroup.children[0]);
  }

  function setConnectionMarkers(engineMembers, connCfg){
    clearConnMarkers();
    if(!engineMembers || !engineMembers.length) return;
    const cfg = connCfg || {};
    const by = cfg.members || {};

    // estimate model scale
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const mem of engineMembers){
      const a=mem.a,b=mem.b;
      minX=Math.min(minX,a[0],b[0]); minY=Math.min(minY,a[1],b[1]); minZ=Math.min(minZ,a[2],b[2]);
      maxX=Math.max(maxX,a[0],b[0]); maxY=Math.max(maxY,a[1],b[1]); maxZ=Math.max(maxZ,a[2],b[2]);
    }
    const diag = Math.hypot(maxX-minX, maxY-minY, maxZ-minZ) || 10;
    const r = Math.max(0.06, diag*0.006);
    const t = Math.max(0.02, r*0.35);

    const matPin = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent:true, opacity:0.90, depthWrite:false });
    const matFix = new THREE.MeshBasicMaterial({ color: 0x64748b, transparent:true, opacity:0.45, depthWrite:false });
    const geomRing = new THREE.TorusGeometry(r, t, 10, 24);
    const geomFix = new THREE.BoxGeometry(r*1.6, r*1.6, r*1.6);

    const defaultModeByKind = { column:'FIXED', beamX:'PIN', beamY:'PIN', subBeam:'PIN', brace:'PIN', joist:'PIN' };

    const addMark = (pt, mode, axisDir, sgn=+1, L=1) => {
      const m = String(mode||'FIXED').toUpperCase();

      // Offset marker ~300mm away from the actual end to reduce visual confusion
      const off = Math.min(0.30, 0.20*(L||1));
      const px = pt[0] + axisDir[0]*off*sgn;
      const py = pt[1] + axisDir[1]*off*sgn;
      const pz = pt[2] + axisDir[2]*off*sgn;

      if(m === 'PIN'){
        const ring = new THREE.Mesh(geomRing, matPin);
        ring.position.set(px, py, pz);
        // orient ring roughly perpendicular to member axis (axisDir is normalized)
        const v = new THREE.Vector3(axisDir[0], axisDir[1], axisDir[2]);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), v.clone().normalize());
        ring.quaternion.copy(q);
        ring.renderOrder = 30;
        connGroup.add(ring);
      } else {
        const box = new THREE.Mesh(geomFix, matFix);
        box.position.set(px, py, pz);
        box.renderOrder = 29;
        connGroup.add(box);
      }
    };

    for(const mem of engineMembers){
      const eid = String(mem.id);
      const per = by[eid] || null;
      const def = defaultModeByKind[mem.kind] || 'FIXED';
      const mi = per?.i || def;
      const mj = per?.j || def;
      const ax = [mem.b[0]-mem.a[0], mem.b[1]-mem.a[1], mem.b[2]-mem.a[2]];
      const L = Math.hypot(ax[0],ax[1],ax[2]) || 1;
      const dir = [ax[0]/L, ax[1]/L, ax[2]/L];
      // i-end: move forward along member; j-end: move backward
      addMark(mem.a, mi, dir, +1, L);
      addMark(mem.b, mj, dir, -1, L);
    }
  }

  function setBaseNodes(nodes, activeIds = [], supportMode='PINNED'){
    while(baseNodeGroup.children.length) baseNodeGroup.remove(baseNodeGroup.children[0]);
    if(!nodes || !nodes.length) return;

    const fixed = String(supportMode).toUpperCase() === 'FIXED';
    const active = new Set((activeIds||[]).map(x=>String(x)));

    let minY = Infinity;
    for(const n of nodes) minY = Math.min(minY, n.y);
    const eps = 1e-6;

    // scale with model size
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity,maxY=-Infinity;
    for(const n of nodes){
      minX=Math.min(minX,n.x); minZ=Math.min(minZ,n.z);
      maxX=Math.max(maxX,n.x); maxZ=Math.max(maxZ,n.z);
      maxY=Math.max(maxY,n.y);
    }
    const diag = Math.hypot(maxX-minX, maxY-minY, maxZ-minZ) || 10;
    const r = Math.max(0.10, diag * 0.010);

    const geom = new THREE.SphereGeometry(r, 14, 14);
    const matOn = new THREE.MeshBasicMaterial({ color: fixed ? 0x7c3aed : 0x0ea5e9, transparent:true, opacity:0.92, depthWrite:false });
    const matOff = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent:true, opacity:0.35, depthWrite:false });

    for(const n of nodes){
      if(Math.abs(n.y - minY) > eps) continue;
      const id = String(n.id);
      const m = new THREE.Mesh(geom, active.has(id) ? matOn : matOff);
      m.position.set(n.x, n.y, n.z);
      m.userData.nodeId = id;
      baseNodeGroup.add(m);
    }
    baseNodeGroup.visible = supportEdit;
  }

  function setSupportEditMode(on, opts={}){
    supportEdit = !!on;
    memberPickEnabled = !!opts.memberPickEnabled;
    onSupportToggle = opts.onSupportToggle || null;
    baseNodeGroup.visible = supportEdit;
  }

  function setSectionBox(on, box01, model){
    secBoxOn = !!on;
    if(box01) secBox = { ...secBox, ...box01 };
    applyClipping(model);
  }

  let failSet = new Set();
  let failHighlightOn = true;

  function applyHighlight(){
    group.children.forEach(ch => {
      const sel = selected.has(ch.userData.memberId);
      const baseMat = matByKind[ch.userData.kind] || matByKind.beamX;
      if(ch.material && ch.material.isMaterial){
        ch.material = baseMat.clone();
        if('emissive' in ch.material){
          if(sel){
            ch.material.emissive = new THREE.Color(0xffff00);
            ch.material.emissiveIntensity = 2.2;
            if('color' in ch.material) ch.material.color = new THREE.Color(0xfff200);
          } else if(failHighlightOn && failSet.has(String(ch.userData.memberId))){
            ch.material.emissive = new THREE.Color(0xff0000);
            ch.material.emissiveIntensity = 2.0;
            if('color' in ch.material) ch.material.color = new THREE.Color(0xff3b3b);
          } else {
            ch.material.emissive = new THREE.Color(0x000000);
            ch.material.emissiveIntensity = 0;
          }
        }
      }
    });
    applyClipping(lastClipModel);
  }

  function setFailMembers(engineIds = []){
    failSet = new Set((engineIds||[]).map(String));
    applyHighlight();
  }

  function setFailHighlightEnabled(on){
    failHighlightOn = !!on;
    applyHighlight();
  }

  return {
    setMembers,
    setBraceMode,
    toggleGuides,
    setSectionBox,
    setAnalysisResult,
    clearAnalysis,
    setAnalysisScale,
    setSupportMarkers,
    setBaseNodes,
    setSupportEditMode,
    setConnectionMarkers,
    clearConnMarkers,
    setFailMembers,
    setFailHighlightEnabled,
    resize: doResize,
    getSelection,
    setSelection,
    clearSelection,
    onSelectionChange,
    dispose(){

      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pick);
      renderer.dispose();
      container.innerHTML='';
    }
  };
}

function summarizeMembers(members, model){
  const byKind = {};
  let totalLen = 0;
  let totalCount = 0;
  let totalWeightKg = 0;

  const overrides = model?.overrides || window.__prebimOverrides || {};
  for(const mem of members){
    const dx = mem.a[0]-mem.b[0];
    const dy = mem.a[1]-mem.b[1];
    const dz = mem.a[2]-mem.b[2];
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
    totalLen += len;
    totalCount += 1;

    // apply overrides by member id for column/beam/sub
    const ov = overrides[mem.id];
    const prof = model?.profiles || {};
    let key = mem.kind;
    let p = null;

    if(mem.kind === 'column'){
      p = ov ? __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.colShape||'H', ov.sizeKey||prof.colSize||'')
             : __profiles?.getProfile?.(prof.stdAll||'KS', prof.colShape||'H', prof.colSize||'');
      const nm = p?.name || p?.key || (ov?.sizeKey) || prof.colSize || 'column';
      key = `column:${nm}`;
    } else if(mem.kind === 'beamX' || mem.kind === 'beamY'){
      p = ov ? __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.beamShape||'H', ov.sizeKey||prof.beamSize||'')
             : __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'');
      const nm = p?.name || p?.key || (ov?.sizeKey) || prof.beamSize || 'beam';
      key = `beam:${nm}`;
    } else if(mem.kind === 'subBeam'){
      p = ov ? __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.subShape||'H', ov.sizeKey||prof.subSize||'')
             : __profiles?.getProfile?.(prof.stdAll||'KS', prof.subShape||'H', prof.subSize||'');
      const nm = p?.name || p?.key || (ov?.sizeKey) || prof.subSize || 'subBeam';
      key = `subBeam:${nm}`;
    } else if(mem.kind === 'brace'){
      // Braces may have different profiles per panel.
      if(mem.profile && typeof mem.profile === 'object'){
        const pr = mem.profile;
        p = __profiles?.getProfile?.(pr.stdKey||prof.stdAll||'KS', pr.shapeKey||prof.braceShape||'L', pr.sizeKey||prof.braceSize||'');
      } else {
        p = __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'');
      }
      const nm = p?.name || p?.key || prof.braceSize || 'brace';
      key = `brace:${nm}`;
    } else if(mem.kind === 'joist'){
      p = __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'');
      const nm = p?.name || p?.key || prof.beamSize || 'joist';
      key = `joist:${nm}`;
    }

    const cur = byKind[key] || { len:0, count:0, kgm: p?.kgm ?? null, name: p?.name ?? null, baseKind: mem.kind };
    cur.len += len;
    cur.count += 1;
    if(p?.kgm != null && Number.isFinite(p.kgm)) totalWeightKg += (p.kgm * len);
    // keep kgm/name if present
    if(cur.kgm == null && p?.kgm != null) cur.kgm = p.kgm;
    if(!cur.name && p?.name) cur.name = p.name;
    byKind[key] = cur;
  }
  return { byKind, totalLen, totalCount, totalWeightKg };
}

function renderQtyTable(q, model){
  const prof = model?.profiles || {};
  const pCol = __profiles?.getProfile?.(prof.stdAll||'KS', prof.colShape||'H', prof.colSize||'') || null;
  const pBeam = __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'') || null;
  const pSub = __profiles?.getProfile?.(prof.stdAll||'KS', prof.subShape||'H', prof.subSize||'') || null;
  const pBrace = __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'') || null;

  const kindLabel = {
    column: { cat:'Column', prof: pCol?.name || prof.colSize || '-' , kgm: pCol?.kgm ?? null },
    beamX: { cat:'Beam', prof: pBeam?.name || prof.beamSize || '-' , kgm: pBeam?.kgm ?? null },
    beamY: { cat:'Beam', prof: pBeam?.name || prof.beamSize || '-' , kgm: pBeam?.kgm ?? null },
    subBeam: { cat:'Sub beam', prof: pSub?.name || prof.subSize || '-' , kgm: pSub?.kgm ?? null },
    joist: { cat:'Joist', prof: pBeam?.name || prof.beamSize || '-' , kgm: pBeam?.kgm ?? null },
    brace: { cat:'Brace', prof: pBrace?.name || prof.braceSize || '-' , kgm: pBrace?.kgm ?? null },
  };

  const catOrder = ['Column','Beam','Sub beam','Brace','Joist'];

  const rowsData = Object.entries(q.byKind)
    .map(([kind, v]) => {
      const baseKind = v.baseKind || (kind.includes(':') ? kind.split(':')[0] : kind);
      const meta = kindLabel[baseKind] || { cat:baseKind, prof:v.name || '-' , kgm: v.kgm ?? null };
      const kgm = (v.kgm != null) ? v.kgm : meta.kgm;
      const loadKg = (kgm!=null) ? (kgm * v.len) : null;
      return {
        kind,
        baseKind,
        cat: meta.cat,
        prof: String(v.name || meta.prof || '-'),
        len: v.len,
        count: v.count,
        kgm,
        loadKg,
      };
    });

  rowsData.sort((a,b) => {
    const ai = catOrder.indexOf(a.cat); const bi = catOrder.indexOf(b.cat);
    if(ai !== bi) return (ai<0?999:ai) - (bi<0?999:bi);
    // then by profile name
    return a.prof.localeCompare(b.prof);
  });

  // Build HTML with subtotals per category
  const subtotalByCat = new Map();
  for(const r of rowsData){
    const cur = subtotalByCat.get(r.cat) || { len:0, count:0, loadKg:0, hasLoad:false };
    cur.len += r.len;
    cur.count += r.count;
    if(r.loadKg != null){ cur.loadKg += r.loadKg; cur.hasLoad = true; }
    subtotalByCat.set(r.cat, cur);
  }

  let rows = '';
  let lastCat = null;
  for(const r of rowsData){
    if(lastCat && r.cat !== lastCat){
      const st = subtotalByCat.get(lastCat);
      const stCell = (st?.hasLoad) ? `${st.loadKg.toLocaleString('en-US',{maximumFractionDigits:1})} kg (${(st.loadKg/1000).toFixed(3)} t)` : '-';
      rows += `
        <tr class="qty-subtotal">
          <td colspan="2">${escapeHtml(lastCat)} subtotal</td>
          <td class="num">${st.len.toFixed(3)}</td>
          <td class="num">${st.count}</td>
          <td class="num">-</td>
          <td class="num">${stCell}</td>
        </tr>
      `;
    }

    const loadCell = (r.loadKg==null) ? '-' : `${r.loadKg.toLocaleString('en-US',{maximumFractionDigits:1})} kg (${(r.loadKg/1000).toFixed(3)} t)`;
    rows += `
      <tr>
        <td>${escapeHtml(r.cat)}</td>
        <td>${escapeHtml(r.prof)}</td>
        <td class="num">${r.len.toFixed(3)}</td>
        <td class="num">${r.count}</td>
        <td class="num">${(r.kgm==null)?'-':r.kgm.toFixed(2)}</td>
        <td class="num">${loadCell}</td>
      </tr>
    `;

    lastCat = r.cat;
  }

  if(lastCat){
    const st = subtotalByCat.get(lastCat);
    const stCell = (st?.hasLoad) ? `${st.loadKg.toLocaleString('en-US',{maximumFractionDigits:1})} kg (${(st.loadKg/1000).toFixed(3)} t)` : '-';
    rows += `
      <tr class="qty-subtotal">
        <td colspan="2">${escapeHtml(lastCat)} subtotal</td>
        <td class="num">${st.len.toFixed(3)}</td>
        <td class="num">${st.count}</td>
        <td class="num">-</td>
        <td class="num">${stCell}</td>
      </tr>
    `;
  }

  return `
    <div class="qty-title">Total quantities</div>
    <table class="qty-table" aria-label="Total quantities">
      <thead>
        <tr>
          <th>Category</th>
          <th>Member type</th>
          <th class="num">Length (m)</th>
          <th class="num">Count</th>
          <th class="num">Unit wt (kg/m)</th>
          <th class="num">Load</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6">-</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2">Total</td>
          <td class="num">${q.totalLen.toFixed(3)}</td>
          <td class="num">${q.totalCount}</td>
          <td class="num">-</td>
          <td class="num">${(q.totalWeightKg!=null && Number.isFinite(q.totalWeightKg)) ? `${q.totalWeightKg.toLocaleString('en-US',{maximumFractionDigits:1})} kg (${(q.totalWeightKg/1000).toFixed(3)} t)` : '-'}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function route(){
  // Dispose any active 3D view to avoid accumulating WebGL contexts.
  try{ __active3D?.dispose?.(); }catch{}
  __active3D = null;

  const hash = location.hash || '#/';

  let m = hash.match(/^#\/editor\/([^/?#]+)/);
  if(m){
    renderEditor(decodeURIComponent(m[1]));
    return;
  }

  m = hash.match(/^#\/analysis\/([^/?#]+)/);
  if(m){
    renderAnalysis(decodeURIComponent(m[1]));
    return;
  }

  renderProjects();
}

function boot(){
  const fitLayout = () => {
    const w = window.innerWidth || 1200;
    const h = window.innerHeight || 800;
    // keep within viewport
    const tools = Math.max(180, Math.min(260, w*0.22));
    const right = Math.max(320, Math.min(520, w*0.30));
    const qtyH = Math.max(180, Math.min(320, h*0.30));
    document.documentElement.style.setProperty('--w-tools', `${tools}px`);
    document.documentElement.style.setProperty('--w-right', `${right}px`);
    document.documentElement.style.setProperty('--h-qty', `${qtyH}px`);
  };
  window.addEventListener('resize', fitLayout);
  fitLayout();

  window.addEventListener('hashchange', route);
  route();

  // topbar "New project" CTA: focus input (projects page)
  document.addEventListener('click', (ev) => {
    const a = /** @type {HTMLElement|null} */(ev.target)?.closest('a[href="#start"]');
    if(!a) return;
    setTimeout(() => {
      const el = document.getElementById('newName');
      if(el) el.focus();
    }, 50);
  });
}

boot();
