/* prebim app shell
 * Phase 0-1: project picker + fullscreen editor skeleton.
 * Future: replace storage with account-backed API.
 */

const STORAGE_KEY = 'prebim.projects.v1';

// lazy-loaded deps
let __three = null;
let __OrbitControls = null;
let __engine = null;

async function loadDeps(){
  if(__three && __OrbitControls && __engine) return;
  const [threeMod, controlsMod, engineMod] = await Promise.all([
    import('https://esm.sh/three@0.160.0'),
    import('https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js'),
    import('/prebim/engine.js?v=20260209-0202'),
  ]);
  __three = threeMod;
  __OrbitControls = controlsMod.OrbitControls;
  __engine = engineMod;
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

function download(filename, text){
  const blob = new Blob([text], {type:'application/json'});
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
      <div>© 2026 prebim · app shell</div>
      <div class="mono">/prebim · project picker · schema v1</div>
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
      list.innerHTML = projects.map(p => `
        <div class="item" data-id="${escapeHtml(p.id)}">
          <div>
            <b>${escapeHtml(p.name || 'Untitled')}</b>
            <small>Updated ${formatTime(p.updatedAt || p.createdAt || 0)}</small>
          </div>
          <div class="row" style="margin-top:0">
            <button class="btn" data-action="open">Open</button>
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

      if(action === 'open'){
        go(`#/editor/${encodeURIComponent(p.id)}`);
        return;
      }
    });
  });
}

function renderEditor(projectId){
  setMode('editor');
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
  setTopbarActions(`
    <a class="pill" href="#/">Back</a>
    <button class="pill" id="btnSave" type="button">Save</button>
    <button class="pill" id="btnHelp" type="button">Help</button>
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
              <div class="grid2">
                <div>
                  <label class="label">Grid X (count)</label>
                  <input id="nx" class="input" type="number" min="1" step="1" placeholder="4" />
                </div>
                <div>
                  <label class="label">Grid Y (count)</label>
                  <input id="ny" class="input" type="number" min="1" step="1" placeholder="3" />
                </div>
              </div>

              <div class="grid2">
                <div>
                  <label class="label">X base spacing (mm)</label>
                  <input id="sx" class="input" type="number" min="1" step="100" placeholder="6000" />
                </div>
                <div>
                  <label class="label">Y base spacing (mm)</label>
                  <input id="sy" class="input" type="number" min="1" step="100" placeholder="6000" />
                </div>
              </div>

              <label class="label">X custom spans (mm, comma)</label>
              <input id="spansX" class="input" placeholder="e.g. 6000,6000,8000" />

              <label class="label">Y custom spans (mm, comma)</label>
              <input id="spansY" class="input" placeholder="e.g. 6000,6000" />

              <div class="note">If custom spans are provided, grid count will follow spans+1.</div>
              <div class="row" style="margin-top:10px">
                <button class="btn primary" id="btnApplyGrid" type="button">Apply</button>
              </div>
            </div>

            <button class="acc-btn" type="button" data-acc="levels">Level <span class="chev" id="chevLevels">▾</span></button>
            <div class="acc-panel" id="panelLevels">
              <div id="levelsList"></div>
              <div class="row" style="margin-top:10px">
                <button class="btn" id="btnAddLevel" type="button">Add level</button>
                <button class="btn primary" id="btnApplyLevels" type="button">Apply</button>
              </div>
              <div class="note">Levels are absolute elevations (mm). Example: 4200, 8400</div>
            </div>

            <button class="acc-btn" type="button" data-acc="sub">Sub-beam <span class="chev" id="chevSub">▾</span></button>
            <div class="acc-panel" id="panelSub">
              <div class="row" style="margin-top:0">
                <label class="badge" style="cursor:pointer"><input id="optSub" type="checkbox" style="margin:0 8px 0 0" /> enable</label>
                <input id="subCount" class="input" style="max-width:120px" type="number" min="0" step="1" placeholder="count" />
              </div>
              <div class="row" style="margin-top:10px">
                <button class="btn primary" id="btnApplySub" type="button">Apply</button>
              </div>
            </div>

            <button class="acc-btn" type="button" data-acc="joist">Joist <span class="chev" id="chevJoist">▾</span></button>
            <div class="acc-panel" id="panelJoist">
              <div class="row" style="margin-top:0">
                <label class="badge" style="cursor:pointer"><input id="optJoist" type="checkbox" style="margin:0 8px 0 0" /> enable</label>
              </div>
              <div class="row" style="margin-top:10px">
                <button class="btn primary" id="btnApplyJoist" type="button">Apply</button>
              </div>
            </div>

            <button class="acc-btn" type="button" data-acc="brace">Bracing <span class="chev" id="chevBrace">▾</span></button>
            <div class="acc-panel" id="panelBrace">
              <div class="row" style="margin-top:0">
                <label class="badge" style="cursor:pointer"><input id="optBrace" type="checkbox" style="margin:0 8px 0 0" /> Enable</label>
                <select id="braceType" class="input" style="max-width:110px">
                  <option value="X">X</option>
                  <option value="S">S</option>
                </select>
              </div>
              <div class="row" style="margin-top:8px">
                <label class="badge" style="cursor:pointer"><input id="braceMode" type="checkbox" style="margin:0 8px 0 0" /> Select face in 3D</label>
                <select id="braceFace" class="input" style="max-width:110px">
                  <option value="Y0">Y0</option>
                  <option value="Y1">Y1</option>
                  <option value="X0">X0</option>
                  <option value="X1">X1</option>
                </select>
              </div>
              <div class="row" style="margin-top:10px">
                <button class="btn primary" id="btnApplyBrace" type="button">Apply</button>
              </div>
              <div class="note">Brace mode: click an outer face in the 3D view.</div>
            </div>

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
                  <input id="colSize" class="input" placeholder="e.g. H 150x150x10x7" />
                </div>
                <div>
                  <label class="label">Beam profile</label>
                  <input id="beamSize" class="input" placeholder="e.g. H 150x150x10x7" />
                </div>
              </div>

              <div class="grid2">
                <div>
                  <label class="label">Sub-beam profile</label>
                  <input id="subSize" class="input" placeholder="e.g. H 150x150x10x7" />
                </div>
                <div>
                  <label class="label">Brace profile</label>
                  <input id="braceSize" class="input" placeholder="e.g. L 75x75x6" />
                </div>
              </div>

              <div class="note">Profiles are stored in the project. Full catalog hookup will follow the old draft engine.</div>
              <div class="row" style="margin-top:10px">
                <button class="btn primary" id="btnApplyProfile" type="button">Apply</button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="pane view3d">
        <div class="pane-h"><b>3D View</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">three.js</span></div>
        <div class="pane-b" id="view3d"></div>
      </section>

      <section class="right-split">
        <section class="pane plan">
          <div class="pane-h"><b>Plan / Section</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">next</span></div>
          <div class="pane-b">
            <div class="placeholder">Plan / Section view</div>
          </div>
        </section>
        <section class="pane qty">
          <div class="pane-h"><b>Quantities</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">mvp</span></div>
          <div class="pane-b" id="qty"></div>
        </section>
      </section>

      <aside class="pane notes">
        <div class="pane-h"><b>Help</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">later</span></div>
        <div class="pane-b">
          <div class="note" style="margin-top:0">주석/상태 관련 기능 (추후 추가)</div>
          <div class="note">Project ID: <span class="mono">${escapeHtml(p.id)}</span></div>
        </div>
      </aside>
    </section>
  `;

  // init editor state
  (async () => {
    await loadDeps();
    const engineModel = __engine.normalizeModel(p.data?.engineModel || p.data?.model || p.data?.engine || __engine.defaultModel());

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
      document.getElementById('nx').value = String(m.grid.nx || ((m.grid.spansXmm?.length||0)+1) || 1);
      document.getElementById('ny').value = String(m.grid.ny || ((m.grid.spansYmm?.length||0)+1) || 1);
      document.getElementById('sx').value = String(m.grid.spacingXmm || 6000);
      document.getElementById('sy').value = String(m.grid.spacingYmm || 6000);
      document.getElementById('spansX').value = (m.grid.spansXmm||[]).join(', ');
      document.getElementById('spansY').value = (m.grid.spansYmm||[]).join(', ');

      renderLevelsList(m.levels||[]);

      document.getElementById('optSub').checked = !!m.options.subBeams.enabled;
      document.getElementById('subCount').value = String(m.options.subBeams.countPerBay||0);

      document.getElementById('optJoist').checked = !!m.options.joists.enabled;

      document.getElementById('optBrace').checked = !!m.options.bracing.enabled;
      document.getElementById('braceType').value = m.options.bracing.type || 'X';
      document.getElementById('braceFace').value = m.options.bracing.face || 'Y0';
      document.getElementById('braceMode').checked = false;

      // profiles (stored only for now)
      document.getElementById('stdAll').value = m.profiles?.stdAll || 'KS';
      document.getElementById('colShape').value = m.profiles?.colShape || 'H';
      document.getElementById('beamShape').value = m.profiles?.beamShape || 'H';
      document.getElementById('colSize').value = m.profiles?.colSize || '';
      document.getElementById('beamSize').value = m.profiles?.beamSize || '';
      document.getElementById('subSize').value = m.profiles?.subSize || '';
      document.getElementById('braceSize').value = m.profiles?.braceSize || '';
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
          nx: parseInt(document.getElementById('nx').value||'1',10),
          ny: parseInt(document.getElementById('ny').value||'1',10),
          spacingXmm: parseFloat(document.getElementById('sx').value||'6000'),
          spacingYmm: parseFloat(document.getElementById('sy').value||'6000'),
          spansXmm: parseSpans(document.getElementById('spansX').value),
          spansYmm: parseSpans(document.getElementById('spansY').value),
        },
        levels: levels.length? levels : [0,6000],
        options: {
          subBeams: {
            enabled: document.getElementById('optSub').checked,
            countPerBay: parseInt(document.getElementById('subCount').value||'0',10) || 0,
          },
          joists: { enabled: document.getElementById('optJoist').checked },
          bracing: {
            enabled: document.getElementById('optBrace').checked,
            type: document.getElementById('braceType').value || 'X',
            face: document.getElementById('braceFace').value || 'Y0',
          },
        },
        profiles: {
          stdAll: document.getElementById('stdAll').value || 'KS',
          colShape: document.getElementById('colShape').value || 'H',
          colSize: document.getElementById('colSize').value || '',
          beamShape: document.getElementById('beamShape').value || 'H',
          beamSize: document.getElementById('beamSize').value || '',
          subShape: 'H',
          subSize: document.getElementById('subSize').value || '',
          braceShape: 'L',
          braceSize: document.getElementById('braceSize').value || '',
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
      }
    });

    const view3dEl = document.getElementById('view3d');
    const qtyEl = document.getElementById('qty');

    const view = await createThreeView(view3dEl);

    const apply = (m) => {
      const members = __engine.generateMembers(m);
      view.setMembers(members, m);
      const q = __engine.quantities(members);
      if(qtyEl) qtyEl.innerHTML = renderQty(q);

      // persist into project
      const projects = loadProjects();
      const idx = projects.findIndex(x => x.id === p.id);
      if(idx >= 0){
        projects[idx].data = { ...(projects[idx].data||{}), engineModel: m };
        projects[idx].updatedAt = now();
        saveProjects(projects);
      }
    };

    apply(engineModel);

    // bracing face selection mode (3D)
    const braceModeEl = document.getElementById('braceMode');
    const braceFaceEl = document.getElementById('braceFace');
    const updateBraceMode = () => {
      const on = !!braceModeEl?.checked;
      const m = getForm();
      view.setBraceMode?.(on, m, (faceKey) => {
        if(braceFaceEl) braceFaceEl.value = faceKey;
        const next = getForm();
        apply(next);
      });
    };
    braceModeEl?.addEventListener('change', updateBraceMode);
    braceFaceEl?.addEventListener('change', () => apply(getForm()));

    document.getElementById('btnApplyGrid')?.addEventListener('click', () => apply(getForm()));
    document.getElementById('btnApplyLevels')?.addEventListener('click', () => apply(getForm()));
    document.getElementById('btnApplySub')?.addEventListener('click', () => apply(getForm()));
    document.getElementById('btnApplyJoist')?.addEventListener('click', () => apply(getForm()));
    document.getElementById('btnApplyBrace')?.addEventListener('click', () => { updateBraceMode(); apply(getForm()); });
    document.getElementById('btnApplyProfile')?.addEventListener('click', () => apply(getForm()));


    // accordion toggles
    const toggle = (which) => {
      const panels = {
        grid: document.getElementById('panelGrid'),
        levels: document.getElementById('panelLevels'),
        sub: document.getElementById('panelSub'),
        joist: document.getElementById('panelJoist'),
        brace: document.getElementById('panelBrace'),
        profile: document.getElementById('panelProfile'),
      };
      const chevs = {
        grid: document.getElementById('chevGrid'),
        levels: document.getElementById('chevLevels'),
        sub: document.getElementById('chevSub'),
        joist: document.getElementById('chevJoist'),
        brace: document.getElementById('chevBrace'),
        profile: document.getElementById('chevProfile'),
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

    document.getElementById('btnHelp')?.addEventListener('click', () => {
      alert(
        `PRE BIM (MVP)\n\n`+
        `- Project picker + fullscreen editor layout\n`+
        `- Engine v0: frame generator rendered as lines\n\n`+
        `Next: port full Steel Structure Draft features + profiles/export.`
      );
    });
  })();
}

async function createThreeView(container){
  await loadDeps();
  const THREE = __three;
  const OrbitControls = __OrbitControls;

  container.innerHTML = '';
  container.style.padding = '0';

  const w = container.clientWidth || 300;
  const h = container.clientHeight || 300;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(45, w/h, 0.01, 5000);
  camera.position.set(10, 8, 10);

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(6, 3, 6);

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(10, 20, 10);
  scene.add(dir);

  // helpers
  const grid = new THREE.GridHelper(30, 30, 0x8aa3c7, 0xd7e3f5);
  grid.position.y = 0;
  scene.add(grid);

  const group = new THREE.Group();
  scene.add(group);

  // brace face selection overlays
  const faceGroup = new THREE.Group();
  scene.add(faceGroup);
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

  const matByKind = {
    column: new THREE.LineBasicMaterial({ color: 0x0b1b3a, transparent:true, opacity:0.9 }),
    beamX: new THREE.LineBasicMaterial({ color: 0x2563eb, transparent:true, opacity:0.85 }),
    beamY: new THREE.LineBasicMaterial({ color: 0x2563eb, transparent:true, opacity:0.85 }),
    subBeam: new THREE.LineBasicMaterial({ color: 0x7c3aed, transparent:true, opacity:0.6 }),
    joist: new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent:true, opacity:0.55 }),
    brace: new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent:true, opacity:0.65 }),
  };

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

    const z0 = ((model.levels?.[0] ?? 0)/1000);
    const z1 = ((model.levels?.[1] ?? 6000)/1000);

    const makePlane = (key, w, h) => {
      const g = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(g, faceMat.clone());
      mesh.userData.faceKey = key;
      return mesh;
    };

    // Y0 / Y1 (planes normal +/-Z)
    const wX = xs[nx-1] - xs[0];
    const hZ = z1 - z0;
    const pY0 = makePlane('Y0', wX, hZ);
    pY0.position.set(wX/2, z0 + hZ/2, ys[0]);
    pY0.rotation.x = Math.PI; // face up
    faceGroup.add(pY0);

    const pY1 = makePlane('Y1', wX, hZ);
    pY1.position.set(wX/2, z0 + hZ/2, ys[ny-1]);
    faceGroup.add(pY1);

    // X0 / X1 (planes normal +/-X)
    const wY = ys[ny-1] - ys[0];
    const pX0 = makePlane('X0', wY, hZ);
    pX0.position.set(xs[0], z0 + hZ/2, wY/2);
    pX0.rotation.y = Math.PI/2;
    faceGroup.add(pX0);

    const pX1 = makePlane('X1', wY, hZ);
    pX1.position.set(xs[nx-1], z0 + hZ/2, wY/2);
    pX1.rotation.y = -Math.PI/2;
    faceGroup.add(pX1);
  }

  function setMembers(members, model){
    while(group.children.length) group.remove(group.children[0]);

    for(const mem of members){
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mem.a[0], mem.a[1], mem.a[2]),
        new THREE.Vector3(mem.b[0], mem.b[1], mem.b[2]),
      ]);
      const mat = matByKind[mem.kind] || matByKind.beamX;
      const line = new THREE.Line(geom, mat);
      group.add(line);
    }

    if(braceMode) buildFacePlanes(model);

    // recenter target
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    if(Number.isFinite(center.x)){
      controls.target.copy(center);
      const r = Math.max(size.x, size.y, size.z) || 10;
      camera.position.set(center.x + r*0.9, center.y + r*0.6, center.z + r*0.9);
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
    if(!braceMode) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(faceGroup.children, false);
    if(hits.length){
      const obj = hits[0].object;
      if(hot && hot.material) hot.material = faceMat.clone();
      hot = obj;
      if(hot.material) hot.material = faceMatHot.clone();
      const key = obj.userData.faceKey;
      if(key && onFaceSelect) onFaceSelect(String(key));
    }
  }

  renderer.domElement.addEventListener('pointerdown', pick);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const ro = new ResizeObserver(() => {
    const w2 = container.clientWidth || 300;
    const h2 = container.clientHeight || 300;
    renderer.setSize(w2, h2);
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
  });
  ro.observe(container);

  return {
    setMembers,
    setBraceMode,
    dispose(){
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pick);
      renderer.dispose();
      container.innerHTML='';
    }
  };
}

function renderQty(q){
  const rows = Object.entries(q.byKind)
    .sort((a,b)=>b[1]-a[1])
    .map(([k,len]) => `<div class="item"><div><b>${escapeHtml(k)}</b><small>${(len).toFixed(2)} m</small></div></div>`)
    .join('');

  return `
    <div class="note" style="margin-top:0">Total length: <span class="mono">${q.totalLen.toFixed(2)} m</span></div>
    <div class="list">${rows || '<div class="item"><div><b>-</b><small>No members</small></div></div>'}</div>
  `;
}

function route(){
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/editor\/([^/?#]+)/);
  if(m){
    renderEditor(decodeURIComponent(m[1]));
    return;
  }
  renderProjects();
}

function boot(){
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
