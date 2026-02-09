/* prebim app shell
 * Phase 0-1: project picker + fullscreen editor skeleton.
 * Future: replace storage with account-backed API.
 */

const STORAGE_KEY = 'prebim.projects.v1';
const BUILD = '20260209-0540';

// lazy-loaded deps
let __three = null;
let __OrbitControls = null;
let __engine = null;
let __profiles = null;
let __threeUtils = null;
let __csg = null;

async function loadDeps(){
  if(__three && __OrbitControls && __engine) return;
  const [threeMod, controlsMod, utilsMod, csgMod, engineMod, profilesMod] = await Promise.all([
    import('https://esm.sh/three@0.160.0'),
    import('https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js'),
    import('https://esm.sh/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js'),
    import('https://esm.sh/three-bvh-csg@0.0.17?deps=three@0.160.0'),
    import('/prebim/engine.js?v=20260209-0540'),
    import('/prebim/app_profiles.js?v=20260209-0540'),
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
    <button class="pill" id="btnToggleQty" type="button">Quantities</button>
    <button class="pill" id="btnExportStaad" type="button">STAAD Export</button>
    <button class="pill" id="btnExportIfc" type="button">IFC Export</button>
    <button class="pill" id="btnExportData" type="button">DATA Export</button>
    <button class="pill" id="btnExportDxf" type="button">DXF Export</button>
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
        </div>
      </aside>

      <div class="splitter" id="splitterT" title="Drag to resize"></div>

      <section class="pane view3d">
        <div class="pane-h">
          <b>3D View</b>
          <div class="row" style="margin-top:0; gap:6px">
            <button class="pill" id="btn3dGuides" type="button">Guides</button>
            <button class="pill" id="btnPopBr" type="button">Bracing</button>
            <button class="pill" id="btnPopOv" type="button">Override</button>
          </div>
        </div>
        <div class="pane-b" id="view3d"></div>

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

    // Plan/Section Three.js view (replaces SVG)
    // expose deps for ps_view.js
    window.__three = __three;
    window.__OrbitControls = __OrbitControls;
    window.__csg = __csg;

    const psMod = await import('/prebim/ps_view.js');
    const psView = await psMod.createPlanSectionView({
      planHost,
      secHost,
      secDirEl,
      secLineEl,
      btnModePlan,
      btnModeSec,
      planCard,
      secCard,
    });

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
    const closeAll = () => { popBr?.classList.remove('open'); popOv?.classList.remove('open'); };
    document.getElementById('btnPopBr')?.addEventListener('click', () => {
      popOv?.classList.remove('open');
      popBr?.classList.toggle('open');
      updateBraceMode(popBr?.classList.contains('open'));
    });
    document.getElementById('btnPopOv')?.addEventListener('click', () => {
      popBr?.classList.remove('open');
      popOv?.classList.toggle('open');
    });
    document.getElementById('btnPopBrClose')?.addEventListener('click', () => { closeAll(); updateBraceMode(false); });
    document.getElementById('btnPopOvClose')?.addEventListener('click', () => { closeAll(); updateBraceMode(false); });

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

      const rows = Object.entries(q.byKind)
        .map(([kind, v]) => ({ kind, ...v }))
        .sort((a,b)=>b.len-a.len)
        .map(r => {
          const meta = kindLabel[r.kind] || { cat:r.kind, prof:r.name || '-' , kgm: r.kgm ?? null };
          const kgm = (r.kgm != null) ? r.kgm : meta.kgm;
          const loadKg = (kgm!=null) ? (kgm * r.len) : null;
          return [
            meta.cat,
            String(r.name || meta.prof),
            r.len.toFixed(3),
            String(r.count),
            (kgm==null)?'':kgm.toFixed(2),
            (loadKg==null)?'':loadKg.toFixed(1),
            (loadKg==null)?'':(loadKg/1000).toFixed(3),
          ];
        });

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
      try{ psView?.setModel?.(members, m); }catch(e){ console.warn('plan/section render failed', e); }

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

    // Exports
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

    const exportStaad = () => {
      const m = getForm();
      const members = __engine.generateMembers(m);

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
        return { id: idx+1, kind: mem.kind, j1, j2 };
      });

      const lines = [];
      lines.push('* PREBIM STAAD export (MVP)');
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

    const exportDxf = () => {
      const m = getForm();
      const spansX = m.grid?.spansXmm || [];
      const spansY = m.grid?.spansYmm || [];
      const xs=[0], ys=[0];
      for(const s of spansX) xs.push(xs[xs.length-1] + s);
      for(const s of spansY) ys.push(ys[ys.length-1] + s);
      const xMax = xs[xs.length-1] || 1;
      const yMax = ys[ys.length-1] || 1;

      const out = [];
      out.push(...dxfHeader());

      // Plan outer grid rectangle (layer GRID)
      out.push(...dxfLine(0,0,xMax,0,'GRID'));
      out.push(...dxfLine(xMax,0,xMax,yMax,'GRID'));
      out.push(...dxfLine(xMax,yMax,0,yMax,'GRID'));
      out.push(...dxfLine(0,yMax,0,0,'GRID'));

      // Auto dimensions (numeric mm, outside only)
      const off = 1200;   // offset outside
      const ext = 400;    // extension beyond dim line
      const txtH = 250;

      // X chain dims at bottom
      const dimY = -off;
      for(let i=0;i<xs.length;i++){
        out.push(...dxfLine(xs[i], 0, xs[i], dimY - ext, 'DIM'));
      }
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
      for(let i=0;i<ys.length;i++){
        out.push(...dxfLine(0, ys[i], dimX - ext, ys[i], 'DIM'));
      }
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

      // Section level dims (right side), stacked to the right of plan
      const secOffX = xMax + 4000;
      const levels = (m.levels||[]);
      if(levels.length >= 2){
        const z0 = levels[0];
        const zMax = levels[levels.length-1];
        // baseline
        out.push(...dxfLine(secOffX, 0, secOffX, zMax, 'GRID'));
        // overall height dim
        const sDimX = secOffX + 2000;
        out.push(...dxfLine(sDimX, z0, sDimX, zMax, 'DIM'));
        out.push(...dxfLine(secOffX, z0, sDimX - ext, z0, 'DIM'));
        out.push(...dxfLine(secOffX, zMax, sDimX - ext, zMax, 'DIM'));
        out.push(...dxfText(sDimX + txtH*0.15, (z0+zMax)/2, txtH, String(zMax-z0), 'DIMTXT'));
        // story heights
        const sDimX2 = secOffX + 1200;
        out.push(...dxfLine(sDimX2, z0, sDimX2, zMax, 'DIM'));
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

    document.getElementById('btnExportData')?.addEventListener('click', exportData);
    document.getElementById('btnExportStaad')?.addEventListener('click', exportStaad);
    document.getElementById('btnExportIfc')?.addEventListener('click', exportIfc);
    document.getElementById('btnExportDxf')?.addEventListener('click', exportDxf);

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
      };
      const chevs = {
        grid: document.getElementById('chevGrid'),
        levels: document.getElementById('chevLevels'),
        sub: document.getElementById('chevSub'),
        // joist: (removed)
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

    document.getElementById('btnToggleQty')?.addEventListener('click', () => {
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

  // 3D guide lines (grid outline + level outlines)
  const guideGroup = new THREE.Group();
  scene.add(guideGroup);
  let guidesOn = true;
  guideGroup.visible = guidesOn;
  const guideMat = new THREE.LineBasicMaterial({ color:0x94a3b8, transparent:true, opacity:0.55 });
  const guideMat2 = new THREE.LineBasicMaterial({ color:0x94a3b8, transparent:true, opacity:0.35 });

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
          group.add(mesh);
        }
      } else {
        const geom = new THREE.BufferGeometry().setFromPoints([vA.clone(), vB.clone()]);
        const line = new THREE.Line(geom, mat);
        line.userData.memberId = mem.id;
        line.userData.kind = mem.kind;
        group.add(line);
      }
    }

    if(braceMode) buildFacePlanes(model);

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
        const lab = makeTextSprite(`X${i+1}`, { fontSize: 46, scale: 0.015 });
        lab.position.set(x, 0.01, -offset);
        guideGroup.add(lab);
      }
      for(let j=0;j<zs.length;j++){
        const z = zs[j];
        const pts = [ new THREE.Vector3(0,0,z), new THREE.Vector3(xMax,0,z) ];
        guideGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), guideMat2));
        const lab = makeTextSprite(`Y${j+1}`, { fontSize: 46, scale: 0.015 });
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
        const lab = makeTextSprite(`L${k+1} ${Math.round(lv[k]||0)}`, { fontSize: 46, scale: 0.015 });
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
  function setSelection(ids){
    selected.clear();
    (ids||[]).forEach(id => id && selected.add(id));
    // update highlight (solid meshes)
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

  return {
    setMembers,
    setBraceMode,
    toggleGuides,
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
      if(mem.profile && typeof mem.profile === 'object'){
        const pr = mem.profile;
        p = __profiles?.getProfile?.(pr.stdKey||prof.stdAll||'KS', pr.shapeKey||prof.braceShape||'L', pr.sizeKey||prof.braceSize||'');
      } else {
        p = __profiles?.getProfile?.(prof.stdAll||'KS', prof.braceShape||'L', prof.braceSize||'');
      }
    } else if(mem.kind === 'joist'){
      key = 'joist';
      p = __profiles?.getProfile?.(prof.stdAll||'KS', prof.beamShape||'H', prof.beamSize||'');
    }

    const cur = byKind[key] || { len:0, count:0, kgm: p?.kgm ?? null, name: p?.name ?? null };
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
          <td class="num">${(q.totalWeightKg!=null && Number.isFinite(q.totalWeightKg)) ? `${q.totalWeightKg.toLocaleString('en-US',{maximumFractionDigits:1})} kg (${(q.totalWeightKg/1000).toFixed(3)} t)` : '-'}</td>
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
