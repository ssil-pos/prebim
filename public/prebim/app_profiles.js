// Profile catalog + selector rebuild (ported from civilarchi draft.js)

export function getSteelStandards(){
  return (window.CIVILARCHI_STEEL_DATA && window.CIVILARCHI_STEEL_DATA.standards) || {};
}

export function fillProfileSelectors(){
  const data = getSteelStandards();

  const stdAll = document.getElementById('stdAll');
  const colShape = document.getElementById('colShape');
  const colSize = document.getElementById('colSize');
  const beamShape = document.getElementById('beamShape');
  const beamSize = document.getElementById('beamSize');
  const subShape = document.getElementById('subShape');
  const subSize = document.getElementById('subSize');
  const braceShape = document.getElementById('braceShape');
  const braceSize = document.getElementById('braceSize');

  if(!stdAll || !colShape || !colSize || !beamShape || !beamSize || !subShape || !subSize || !braceShape || !braceSize) return;

  const STD_LABEL = { KS: 'KR · KS', JIS: 'JP · JIS' };
  const SHAPE_KEYS = ['H','C','L','LC','Rect','I','T'];

  // standards
  if(stdAll.options.length === 0){
    stdAll.innerHTML='';
    ['KS','JIS'].filter(k => data[k]).forEach(k=>{
      const opt=document.createElement('option');
      opt.value=k; opt.textContent=STD_LABEL[k]||k;
      stdAll.appendChild(opt);
    });
  }
  if(!stdAll.value) stdAll.value = data['KS'] ? 'KS' : (stdAll.options[0]?.value || 'KS');

  function rebuildShapeSelect(sel){
    const stdKey = stdAll.value;
    const shapes = data[stdKey]?.shapes || {};
    const keys = SHAPE_KEYS.filter(k=>shapes[k]);
    const prev = sel.value;
    sel.innerHTML='';
    keys.forEach(k=>{
      const opt=document.createElement('option');
      opt.value=k; opt.textContent=k;
      sel.appendChild(opt);
    });
    sel.value = keys.includes(prev) ? prev : (keys.includes('H') ? 'H' : (keys[0]||''));
  }

  function rebuildSizeSelect(shapeSel, sizeSel){
    const stdKey = stdAll.value;
    const shapeKey = shapeSel.value;
    const items = data[stdKey]?.shapes?.[shapeKey]?.items || [];
    const prev = sizeSel.value;
    sizeSel.innerHTML='';
    items.forEach(it=>{
      const opt=document.createElement('option');
      opt.value = it.key;
      opt.textContent = `${it.name}${(it.kgm!=null && Number.isFinite(it.kgm)) ? ` · ${it.kgm} kg/m` : ''}`;
      sizeSel.appendChild(opt);
    });
    if(items.some(it=>it.key===prev)) sizeSel.value = prev;
    else {
      const preferred = items.find(it => /^H\s*150x150/i.test(it.name));
      if(preferred) sizeSel.value = preferred.key;
    }
  }

  // Shapes
  rebuildShapeSelect(colShape);
  rebuildShapeSelect(beamShape);
  rebuildShapeSelect(subShape);
  rebuildShapeSelect(braceShape);

  // Sizes
  rebuildSizeSelect(colShape, colSize);
  rebuildSizeSelect(beamShape, beamSize);
  rebuildSizeSelect(subShape, subSize);
  rebuildSizeSelect(braceShape, braceSize);

  // wire events once
  if(!window.__prebimProfileEventsBound){
    window.__prebimProfileEventsBound = true;

    stdAll.addEventListener('change', () => fillProfileSelectors());
    colShape.addEventListener('change', () => fillProfileSelectors());
    beamShape.addEventListener('change', () => fillProfileSelectors());
    subShape.addEventListener('change', () => fillProfileSelectors());
    braceShape.addEventListener('change', () => fillProfileSelectors());
  }
}

export function getProfile(stdKey, shapeKey, sizeKey){
  const data = getSteelStandards();
  const item = data?.[stdKey]?.shapes?.[shapeKey]?.items?.find(it => it.key === sizeKey) || null;
  return {
    stdKey,
    shapeKey,
    sizeKey,
    name: item?.name || sizeKey,
    kgm: (item && Number.isFinite(item.kgm)) ? item.kgm : null,
  };
}
