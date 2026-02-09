/* prebim app shell
 * Phase 0-1: project picker + fullscreen editor skeleton.
 * Future: replace storage with account-backed API.
 */

const STORAGE_KEY = 'prebim.projects.v1';

// lazy-loaded deps
let __three = null;
let __OrbitControls = null;
let __engine = null;
let __profiles = null;

async function loadDeps(){
  if(__three && __OrbitControls && __engine) return;
  const [threeMod, controlsMod, engineMod, profilesMod] = await Promise.all([
    import('https://esm.sh/three@0.160.0'),
    import('https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js'),
    import('/prebim/engine.js?v=20260209-0300'),
    import('/prebim/app_profiles.js?v=20260209-0300'),
  ]);
  __three = threeMod;
  __OrbitControls = controlsMod.OrbitControls;
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

              <div class="note">Profiles are stored in the project. Full catalog hookup will follow the old draft engine.</div>
              <div class="row" style="margin-top:10px">
                <button class="btn primary" id="btnApplyProfile" type="button">Apply</button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div class="splitter" id="splitterT" title="Drag to resize"></div>

      <section class="pane view3d">
        <div class="pane-h"><b>3D View</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">three.js</span></div>
        <div class="pane-b" id="view3d"></div>
      </section>

      <div class="splitter" id="splitterV" title="Drag to resize"></div>

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
        <div class="pane-h"><b>Bracing</b><span class="mono" style="font-size:11px; color:rgba(11,27,58,0.55)">v0</span></div>
        <div class="pane-b">
          <div class="row" style="margin-top:0">
            <label class="badge" style="cursor:pointer"><input id="optBrace" type="checkbox" style="margin:0 8px 0 0" /> Enable</label>
            <select id="braceType" class="input" style="max-width:110px">
              <option value="X">X</option>
              <option value="S">S</option>
            </select>
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

          <div class="row" style="margin-top:8px">
            <label class="badge" style="cursor:pointer"><input id="braceMode" type="checkbox" style="margin:0 8px 0 0" /> Panel-select in 3D</label>
            <select id="braceStory" class="input" style="max-width:140px"></select>
          </div>

          <div class="row" style="margin-top:10px">
            <button class="btn primary" id="btnApplyBrace" type="button">Apply</button>
          </div>
          <div class="note">Brace mode: click an outer face in the 3D view.</div>

          <hr style="border:none; border-top:1px solid var(--stroke); margin:12px 0"/>

          <div style="font-weight:1000; font-size:12px; margin:0 0 8px">Override</div>
          <div class="note" id="ovInfo" style="margin-top:0">Selected: -</div>
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
          <div class="row" style="margin-top:10px">
            <button class="btn primary" id="btnOvApply" type="button">Apply to selection</button>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn" id="btnOvClear" type="button">Clear selection</button>
            <button class="btn danger" id="btnOvReset" type="button">Reset overrides</button>
          </div>
          <div class="note">Applies to Column / Beam / Sub-beam members.</div>

          <hr style="border:none; border-top:1px solid var(--stroke); margin:12px 0"/>
          <div class="note" style="margin-top:0">Project ID: <span class="mono">${escapeHtml(p.id)}</span></div>
        </div>
      </aside>
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
      document.getElementById('braceStory').innerHTML = '';
      const storyCount = Math.max(1, (m.levels?.length||2) - 1);
      for(let i=0;i<storyCount;i++){
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `Story ${i+1}`;
        document.getElementById('braceStory').appendChild(opt);
      }
      document.getElementById('braceMode').checked = false;

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

    // resizable splitters
    const splitterT = document.getElementById('splitterT');
    const splitterV = document.getElementById('splitterV');
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
      const notesW = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--w-notes')) || 220);
      const minRight = 280;
      const maxRight = Math.max(minRight, rect.width - toolsW - notesW - 260);
      const x = ev.clientX - rect.left;
      // right width based on pointer position from left
      const proposedRight = Math.max(minRight, Math.min(maxRight, rect.width - x - notesW - 30));
      document.documentElement.style.setProperty('--w-right', `${proposedRight}px`);
      view?.resize?.();
    });

    let __applyTimer = 0;
    const applyNow = (m) => {
      const members = __engine.generateMembers(m);
      view.setMembers(members, m);
      const q = summarizeMembers(members, m);
      if(qtyEl) qtyEl.innerHTML = renderQtyTable(q, m);

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

    apply(engineModel);

    // bracing panel selection mode (3D)
    const braceModeEl = document.getElementById('braceMode');
    const braceStoryEl = document.getElementById('braceStory');

    const toggleBrace = (pick) => {
      const braces = Array.isArray(window.__prebimBraces) ? window.__prebimBraces : [];
      const idx = braces.findIndex(b => b.axis===pick.axis && b.line===pick.line && b.story===pick.story && b.bay===pick.bay);
      if(idx >= 0) braces.splice(idx,1);
      else braces.push({ axis: pick.axis, line: pick.line, story: pick.story, bay: pick.bay, kind: (document.getElementById('braceType').value||'X') === 'S' ? 'S' : 'X' });
      window.__prebimBraces = braces;
    };

    const updateBraceMode = () => {
      const on = !!braceModeEl?.checked;
      const m = getForm();
      const story = parseInt(braceStoryEl?.value||'0',10) || 0;
      view.setBraceMode?.(on, { ...m, braceStory: story }, (pick) => {
        toggleBrace(pick);
        scheduleApply(0);
      });
      scheduleApply(0);
    };

    braceModeEl?.addEventListener('change', updateBraceMode);
    braceStoryEl?.addEventListener('change', updateBraceMode);

    // Apply buttons kept as optional (but realtime changes auto-apply)
    document.getElementById('btnApplyGrid')?.addEventListener('click', () => scheduleApply(0));
    document.getElementById('btnApplyLevels')?.addEventListener('click', () => scheduleApply(0));
    document.getElementById('btnApplySub')?.addEventListener('click', () => scheduleApply(0));
    document.getElementById('btnApplyJoist')?.addEventListener('click', () => scheduleApply(0));
    document.getElementById('btnApplyBrace')?.addEventListener('click', () => { updateBraceMode(); scheduleApply(0); });

    // Realtime auto-apply
    const wireRealtime = (id, ev='input') => {
      const el = document.getElementById(id);
      el?.addEventListener(ev, () => scheduleApply());
    };

    // grid
    ['nx','ny','sx','sy','spansX','spansY'].forEach(id => wireRealtime(id, 'input'));
    // levels (list)
    document.getElementById('levelsList')?.addEventListener('input', () => scheduleApply());
    // toggles
    ['optSub','subCount','optJoist','optBrace','braceType'].forEach(id => wireRealtime(id, 'change'));

    // profiles
    ['stdAll','colShape','colSize','beamShape','beamSize','subShape','subSize','braceShape','braceSize'].forEach(id => wireRealtime(id, 'change'));

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
    document.getElementById('btnApplyProfile')?.addEventListener('click', () => scheduleApply(0));


    // accordion toggles
    const toggle = (which) => {
      const panels = {
        grid: document.getElementById('panelGrid'),
        levels: document.getElementById('panelLevels'),
        sub: document.getElementById('panelSub'),
        joist: document.getElementById('panelJoist'),
        profile: document.getElementById('panelProfile'),
      };
      const chevs = {
        grid: document.getElementById('chevGrid'),
        levels: document.getElementById('chevLevels'),
        sub: document.getElementById('chevSub'),
        joist: document.getElementById('chevJoist'),
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
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
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

  const matByKind = {
    column: new THREE.MeshStandardMaterial({ color: 0x0b1b3a, roughness:0.65, metalness:0.15 }),
    beamX: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness:0.7, metalness:0.12 }),
    beamY: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness:0.7, metalness:0.12 }),
    subBeam: new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness:0.72, metalness:0.10 }),
    joist: new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent:true, opacity:0.55 }),
    brace: new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent:true, opacity:0.65 }),
  };

  function parseProfileDimsMm(name){
    // Extract first two dimensions like 150x150 from "H 150x150x10x7"
    const m = String(name||'').match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
    const d = m ? parseFloat(m[1]) : 150;
    const b = m ? parseFloat(m[2]) : 150;
    // keep a minimum thickness so geometry is visible
    const w = Math.max(30, b);
    const h = Math.max(30, d);
    return { w, h };
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

    const story = model.braceStory || 0;
    const z0 = ((model.levels?.[story] ?? 0)/1000);
    const z1 = ((model.levels?.[story+1] ?? (z0*1000 + 6000))/1000);

    const addPanel = (axis, line, bay, w, h) => {
      const g = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(g, faceMat.clone());
      mesh.userData.axis = axis;
      mesh.userData.line = line;
      mesh.userData.bay = bay;
      mesh.userData.story = story;
      return mesh;
    };

    const hZ = z1 - z0;

    // Y-planes: for each grid line in Y (including internal), panels per X bay
    for(let j=0; j<ny; j++){
      const y = ys[j];
      for(let ix=0; ix<nx-1; ix++){
        const wX = xs[ix+1]-xs[ix];
        const p = addPanel('Y', j, ix, wX, hZ);
        p.position.set(xs[ix] + wX/2, z0 + hZ/2, y);
        p.rotation.x = Math.PI;
        // inner planes slightly lighter
        if(j>0 && j<ny-1) p.material.opacity = 0.08;
        faceGroup.add(p);
      }
    }

    // X-planes: for each grid line in X (including internal), panels per Y bay
    for(let i=0; i<nx; i++){
      const x = xs[i];
      for(let iy=0; iy<ny-1; iy++){
        const wY = ys[iy+1]-ys[iy];
        const p = addPanel('X', i, iy, wY, hZ);
        p.position.set(x, z0 + hZ/2, ys[iy] + wY/2);
        p.rotation.y = (i===0) ? Math.PI/2 : (i===nx-1 ? -Math.PI/2 : Math.PI/2);
        if(i>0 && i<nx-1) p.material.opacity = 0.08;
        faceGroup.add(p);
      }
    }
  }

  function setMembers(members, model){
    while(group.children.length) group.remove(group.children[0]);

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

      // 3D solid only for column/beam/subBeam. Keep joist/brace as lines for now.
      if(mem.kind === 'column' || mem.kind === 'beamX' || mem.kind === 'beamY' || mem.kind === 'subBeam'){
        const profName = memberProfileName(mem.kind, model, mem.id);
        const dims = parseProfileDimsMm(profName);
        const w = (dims.w/1000);
        const h = (dims.h/1000);

        // box oriented along dir (Y axis)
        const geom = new THREE.BoxGeometry(w, len, h);
        const mesh = new THREE.Mesh(geom, mat.clone());
        quat.setFromUnitVectors(yAxis, dir);
        mesh.quaternion.copy(quat);
        mesh.position.copy(mid);

        mesh.userData.memberId = mem.id;
        mesh.userData.kind = mem.kind;
        group.add(mesh);
      } else {
        const geom = new THREE.BufferGeometry().setFromPoints([vA.clone(), vB.clone()]);
        const line = new THREE.Line(geom, mat);
        line.userData.memberId = mem.id;
        line.userData.kind = mem.kind;
        group.add(line);
      }
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
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

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

    // member selection
    selectRay.setFromCamera(pointer, camera);
    const hits = selectRay.intersectObjects(group.children, false);
    if(!hits.length) return;
    const obj = hits[0].object;
    const id = obj.userData.memberId;
    const kind = obj.userData.kind;
    if(!id) return;
    // only allow overrides for these
    if(!['column','beamX','beamY','subBeam'].includes(kind)) return;

    // toggle selection
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
          ch.material.emissive = new THREE.Color(sel ? 0x38bdf8 : 0x000000);
          ch.material.emissiveIntensity = sel ? 0.35 : 0;
        }
      }
    });

    onSel && onSel(Array.from(selected));
  }

  renderer.domElement.addEventListener('pointerdown', pick);

  let raf = 0;
  const animate = () => {
    raf = requestAnimationFrame(animate);
    controls.update();
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
  function clearSelection(){ selected.clear(); }
  let onSel = null;
  function onSelectionChange(fn){ onSel = fn; }

  return {
    setMembers,
    setBraceMode,
    resize: doResize,
    getSelection,
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
    } else if(mem.kind === 'beamX' || mem.kind === 'beamY'){
      key = 'beam';
      p = ov ? __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.beamShape||'H', ov.sizeKey||prof.beamSize||'')
             : __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'');
    } else if(mem.kind === 'subBeam'){
      key = 'subBeam';
      p = ov ? __profiles?.getProfile?.(ov.stdKey||prof.stdAll||'KS', ov.shapeKey||prof.subShape||'H', ov.sizeKey||prof.subSize||'')
             : __profiles?.getProfile?.(prof.stdAll||'KS', prof.subShape||'H', prof.subSize||'');
    } else if(mem.kind === 'brace'){
      key = 'brace';
      p = __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'');
    } else if(mem.kind === 'joist'){
      key = 'joist';
      p = __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'');
    }

    const cur = byKind[key] || { len:0, count:0, kgm: p?.kgm ?? null, name: p?.name ?? null };
    cur.len += len;
    cur.count += 1;
    // keep kgm/name if present
    if(cur.kgm == null && p?.kgm != null) cur.kgm = p.kgm;
    if(!cur.name && p?.name) cur.name = p.name;
    byKind[key] = cur;
  }
  return { byKind, totalLen, totalCount };
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

  const rows = Object.entries(q.byKind)
    .map(([kind, v]) => ({ kind, ...v }))
    .sort((a,b)=>b.len-a.len)
    .map(r => {
      const meta = kindLabel[r.kind] || { cat:r.kind, prof:r.name || '-' , kgm: r.kgm ?? null };
      const kgm = (r.kgm != null) ? r.kgm : meta.kgm;
      const loadKg = (kgm!=null) ? (kgm * r.len) : null;
      const loadCell = (loadKg==null) ? '-' : `${loadKg.toLocaleString('en-US',{maximumFractionDigits:1})} kg (${(loadKg/1000).toFixed(3)} t)`;
      return `
        <tr>
          <td>${escapeHtml(meta.cat)}</td>
          <td>${escapeHtml(String(r.name || meta.prof))}</td>
          <td class="num">${r.len.toFixed(3)}</td>
          <td class="num">${r.count}</td>
          <td class="num">${(kgm==null)?'-':kgm.toFixed(2)}</td>
          <td class="num">${loadCell}</td>
        </tr>
      `;
    }).join('');

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
          <td class="num">-</td>
        </tr>
      </tfoot>
    </table>
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
