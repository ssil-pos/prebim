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

  // We render everything in 2D plane (Z=0) using u/v coordinates.
  const camera = new THREE.OrthographicCamera(-5,5,5,-5, 0.01, 1000);
  camera.position.set(0,0,50);
  camera.up.set(0,1,0);
  camera.lookAt(0,0,0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = false;
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 1.25;
  controls.panSpeed = 1.0;

  const root = new THREE.Group();
  scene.add(root);

  // materials
  const lineMat = new THREE.LineBasicMaterial({ color: 0x0b1b3a, transparent:true, opacity:0.78 });
  const lineMatBg = new THREE.LineBasicMaterial({ color: 0x0b1b3a, transparent:true, opacity:0.22 });
  const capMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent:true, opacity:0.55, side: THREE.DoubleSide, depthWrite:false });

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

  const mapPoint = (pt, kind) => {
    // pt: THREE.Vector3 world
    if(kind === 'plan') return new THREE.Vector3(pt.x, pt.z, 0);
    // section
    const dir = secDirEl?.value || 'X';
    if(dir === 'X') return new THREE.Vector3(pt.z, pt.y, 0); // horizontal=z, vertical=y
    return new THREE.Vector3(pt.x, pt.y, 0);                // horizontal=x, vertical=y
  };

  const mapGeometry = (geom, matrixWorld, kind) => {
    const g = geom.clone();
    g.applyMatrix4(matrixWorld);
    const pos = g.getAttribute('position');
    for(let i=0;i<pos.count;i++){
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const uv = mapPoint(v, kind);
      pos.setXYZ(i, uv.x, uv.y, 0);
    }
    pos.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  };

  const addEdges2D = (geom, matrixWorld, kind, mat=lineMat) => {
    const mapped = mapGeometry(geom, matrixWorld, kind);
    const eg = new THREE.EdgesGeometry(mapped, 12);
    // EdgesGeometry may carry Z noise; force Z=0
    const pos = eg.getAttribute('position');
    for(let i=0;i<pos.count;i++) pos.setZ(i, 0);
    pos.needsUpdate = true;
    root.add(new THREE.LineSegments(eg, mat));
  };

  const addMesh2D = (geom, matrixWorld, kind, mat=capMat) => {
    const mapped = mapGeometry(geom, matrixWorld, kind);
    // ensure Z=0
    const pos = mapped.getAttribute('position');
    for(let i=0;i<pos.count;i++) pos.setZ(i, 0);
    pos.needsUpdate = true;
    root.add(new THREE.Mesh(mapped, mat));
  };

  const fit = () => {
    if(!lastModel) return;
    const { xMax, zMax } = computeGrid(lastModel);
    const uMax = (mode==='plan') ? xMax : (secDirEl?.value==='X' ? zMax : xMax);
    const vMax = (mode==='plan') ? zMax : ((lastModel.levels?.[lastModel.levels.length-1]||6000)/1000);
    const pad = 0.8;

    camera.left = -pad;
    camera.right = uMax + pad;
    camera.bottom = -pad;
    camera.top = vMax + pad;
    camera.position.set(uMax*0.5, vMax*0.5, 50);
    camera.lookAt(uMax*0.5, vMax*0.5, 0);
    camera.updateProjectionMatrix();

    controls.target.set(uMax*0.5, vMax*0.5, 0);
    controls.update();
  };

  const buildMemberGeometry = (mem) => {
    const a = new THREE.Vector3(mem.a[0], mem.a[1], mem.a[2]);
    const b = new THREE.Vector3(mem.b[0], mem.b[1], mem.b[2]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if(len < 1e-6) return null;
    dir.normalize();

    // MVP thickness: a bit larger so it reads as a sectioned member
    const w = 0.12; // 120mm
    const d = 0.12;

    const geom = new THREE.BoxGeometry(w, d, len);
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

    // grid lines in UV plane
    const gridMat = new THREE.LineBasicMaterial({ color:0x94a3b8, transparent:true, opacity:0.28 });
    for(const x of xs){
      const pts=[new THREE.Vector3(x,0,0), new THREE.Vector3(x,zMax,0)];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for(const z of zs){
      const pts=[new THREE.Vector3(0,z,0), new THREE.Vector3(xMax,z,0)];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    for(const mem of lastMembers){
      if(!['beamX','beamY','subBeam','brace','column'].includes(mem.kind)) continue;
      const built = buildMemberGeometry(mem);
      if(!built) continue;
      addEdges2D(built.geom, built.mtx, 'plan', lineMat);
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

    // section guide grid: levels
    const yMax = ((lastModel.levels?.[lastModel.levels.length-1]||6000)/1000);
    const w = (dir==='X') ? zMax : xMax;
    const gridMat = new THREE.LineBasicMaterial({ color:0x94a3b8, transparent:true, opacity:0.22 });
    for(const mm of (lastModel.levels||[])){
      const y = (mm||0)/1000;
      const pts=[new THREE.Vector3(0,y,0), new THREE.Vector3(w,y,0)];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // slab around section plane
    const slabTh = 0.05; // 50mm
    const slabH = yMax + 10;
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
        const geom = res?.geometry;
        if(geom){
          // cap fill + outline (mapped to section UV)
          addMesh2D(geom, new THREE.Matrix4(), 'section', capMat);
          addEdges2D(geom, new THREE.Matrix4(), 'section', lineMat);
        }
      } else {
        // fallback: show edges in section UV (no caps)
        addEdges2D(built.geom, built.mtx, 'section', lineMatBg);
      }
    }
  };

  const render = () => {
    if(mode==='section') renderSection();
    else renderPlan();
    fit();
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
    resize();
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
