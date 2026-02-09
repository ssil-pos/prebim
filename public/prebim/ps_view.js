// Three.js Plan/Section view with hidden-line + section cut caps (MVP)
// Loaded via dynamic import from app.js

export async function createPlanSectionView(ctx){
  const { __three: THREE, __OrbitControls: OrbitControls, __csg } = window;
  const { planHost, secHost, secDirEl, secLineEl, btnModePlan, btnModeSec, planCard, secCard } = ctx;
  if(!THREE || !OrbitControls) throw new Error('deps missing');

  const CSG = __csg;
  const Evaluator = CSG?.Evaluator;
  const Brush = CSG?.Brush;

  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  // Orthographic camera (we set bounds in fit())
  const camera = new THREE.OrthographicCamera(-5,5,5,-5, 0.01, 1000);
  camera.position.set(10,10,10);
  camera.up.set(0,1,0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = false;
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 1.0;

  const root = new THREE.Group();
  scene.add(root);

  // materials
  const lineMat = new THREE.LineBasicMaterial({ color: 0x0b1b3a, transparent:true, opacity:0.75 });
  const lineMatBg = new THREE.LineBasicMaterial({ color: 0x0b1b3a, transparent:true, opacity:0.25 });
  const capMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent:true, opacity:0.55, side: THREE.DoubleSide });

  const ro = new ResizeObserver(() => resize());

  let mode = 'plan';
  let lastMembers = [];
  let lastModel = null;

  const computeGrid = (m) => {
    const xs=[0], zs=[0];
    for(const s of (m.grid?.spansXmm||[])) xs.push(xs[xs.length-1] + (s/1000));
    for(const s of (m.grid?.spansYmm||[])) zs.push(zs[zs.length-1] + (s/1000));
    return { xs, zs, xMax: xs[xs.length-1]||1, zMax: zs[zs.length-1]||1 };
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

  const clearRoot = () => { while(root.children.length) root.remove(root.children[0]); };

  const addEdges = (geom, matrixWorld, mat=lineMat) => {
    const g = new THREE.EdgesGeometry(geom, 12);
    const l = new THREE.LineSegments(g, mat);
    l.applyMatrix4(matrixWorld);
    root.add(l);
  };

  const addMesh = (geom, matrixWorld, mat=capMat) => {
    const m = new THREE.Mesh(geom, mat);
    m.applyMatrix4(matrixWorld);
    root.add(m);
  };

  const fit = () => {
    if(!lastModel) return;
    const { xMax, zMax } = computeGrid(lastModel);
    const w = (mode==='plan') ? xMax : (secDirEl?.value==='X' ? zMax : xMax);
    const h = (mode==='plan') ? zMax : ((lastModel.levels?.[lastModel.levels.length-1]||6000)/1000);
    const pad = 0.8;

    camera.left = -pad;
    camera.right = w + pad;
    camera.bottom = -pad;
    camera.top = h + pad;
    camera.updateProjectionMatrix();

    if(mode==='plan'){
      camera.position.set(w*0.5, 50, h*0.5);
      controls.target.set(w*0.5, 0, h*0.5);
    } else {
      camera.position.set(w*0.5, h*0.5, 50);
      controls.target.set(w*0.5, h*0.5, 0);
    }
    controls.update();
  };

  const buildMemberGeometry = (mem) => {
    // simple box for now; 3D profile detail already exists elsewhere.
    // We rely on section cap visuals rather than full profile in PS view MVP.
    const a = new THREE.Vector3(mem.a[0], mem.a[1], mem.a[2]);
    const b = new THREE.Vector3(mem.b[0], mem.b[1], mem.b[2]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if(len < 1e-6) return null;
    dir.normalize();

    const w = 0.10; // 100mm
    const d = 0.10;

    const geom = new THREE.BoxGeometry(w, d, len);
    // orient length along Z
    const zAxis = new THREE.Vector3(0,0,1);
    const q = new THREE.Quaternion().setFromUnitVectors(zAxis, dir);
    const mtx = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mtx.setPosition(mid);
    return { geom, mtx };
  };

  const renderPlan = () => {
    clearRoot();
    if(!lastModel) return;
    const { xMax, zMax, xs, zs } = computeGrid(lastModel);

    // grid lines
    const gridMat = new THREE.LineBasicMaterial({ color:0x94a3b8, transparent:true, opacity:0.30 });
    for(const x of xs){
      const pts=[new THREE.Vector3(x,0,0), new THREE.Vector3(x,0,zMax)];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for(const z of zs){
      const pts=[new THREE.Vector3(0,0,z), new THREE.Vector3(xMax,0,z)];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // members edges projected by camera
    for(const mem of lastMembers){
      if(!['beamX','beamY','subBeam','brace','column'].includes(mem.kind)) continue;
      const built = buildMemberGeometry(mem);
      if(!built) continue;
      addEdges(built.geom, built.mtx, lineMat);
    }
  };

  const renderSection = () => {
    clearRoot();
    if(!lastModel) return;
    ensureSectionUI(lastModel);
    const { xs, zs, xMax, zMax } = computeGrid(lastModel);

    const dir = secDirEl?.value || 'X';
    const idx = parseInt(secLineEl?.value||'0',10) || 0;
    const planePos = (dir==='X') ? xs[Math.min(xs.length-1, Math.max(0, idx))] : zs[Math.min(zs.length-1, Math.max(0, idx))];

    // slab around section plane
    const slabTh = 0.05; // 50mm
    const slabW = (dir==='X') ? slabTh : xMax + 10;
    const slabD = 200; // huge
    const slabH = (lastModel.levels?.[lastModel.levels.length-1]||6000)/1000 + 10;

    let slabGeom;
    let slabMtx = new THREE.Matrix4();
    if(dir==='X'){
      slabGeom = new THREE.BoxGeometry(slabTh, slabH, zMax + 10);
      slabMtx.makeTranslation(planePos, slabH/2, zMax/2);
    } else {
      slabGeom = new THREE.BoxGeometry(xMax + 10, slabH, slabTh);
      slabMtx.makeTranslation(xMax/2, slabH/2, planePos);
    }

    const canCSG = !!(Evaluator && Brush);
    const evalr = canCSG ? new Evaluator() : null;
    const slabBrush = canCSG ? new Brush(slabGeom) : null;
    if(slabBrush) slabBrush.matrix.copy(slabMtx);

    for(const mem of lastMembers){
      if(!['beamX','beamY','subBeam','brace','column'].includes(mem.kind)) continue;
      const built = buildMemberGeometry(mem);
      if(!built) continue;

      if(canCSG){
        const b = new Brush(built.geom);
        b.matrix.copy(built.mtx);
        const res = evalr.evaluate(b, slabBrush, Evaluator.INTERSECTION);
        if(res?.geometry){
          // cap fill
          addMesh(res.geometry, new THREE.Matrix4(), capMat);
          // outline
          addEdges(res.geometry, new THREE.Matrix4(), lineMat);
        }
      } else {
        // fallback: just draw edges
        addEdges(built.geom, built.mtx, lineMatBg);
      }
    }
  };

  const render = () => {
    if(mode==='section') renderSection();
    else renderPlan();
    fit();
    resize();
  };

  const resize = () => {
    const host = (mode==='section') ? secHost : planHost;
    if(!host) return;
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 300;
    renderer.setSize(w, h);
  };

  const attach = () => {
    const host = (mode==='section') ? secHost : planHost;
    if(!host) return;
    host.innerHTML = '';
    host.appendChild(renderer.domElement);
    ro.disconnect();
    ro.observe(host);
  };

  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const setMode = (m) => {
    mode = (m==='section') ? 'section' : 'plan';
    if(planCard) planCard.style.display = (mode==='plan') ? '' : 'none';
    if(secCard) secCard.style.display = (mode==='section') ? '' : 'none';
    btnModePlan?.classList.toggle('active', mode==='plan');
    btnModeSec?.classList.toggle('active', mode==='section');
    controls.enableRotate = false;
    attach();
    render();
  };

  const setModel = (members, model) => {
    lastMembers = members || [];
    lastModel = model || null;
    render();
  };

  // defaults
  setMode('plan');

  // UI events
  secDirEl?.addEventListener('change', () => setMode('section'));
  secLineEl?.addEventListener('change', () => setMode('section'));

  return { setMode, setModel };
}
