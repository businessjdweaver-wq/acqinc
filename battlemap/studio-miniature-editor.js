// Store binary assets separately from scene JSON. This library is private to
// the browser and account; shared scenes continue to carry the 2D fallback.
const miniaturePrefix='battlemap.miniatures.v1/';
const miniatureAssets=new Map(),miniatureAssignments=new Map();
const miniatureFileLimit=24*1024*1024;
const miniatureBaseDefault={shape:'off',pattern:'solid',size:1,color:'#6b4b32',rimColor:'#241b16',ringCount:0,ringWidth:.28,ringColors:['#a54138','#d6ae48','#428baf']};
const miniatureRequests=new Map();
let miniatureWorker=null,miniatureRequestId=0,miniatureEditor=null;

function miniatureBaseSettings(settings){
 const base=settings?.base||{};
 const shape=['off','round','square'].includes(base.shape)?base.shape:'off';
 const pattern=['solid','stone','sand','snow','grass'].includes(base.pattern)?base.pattern:'solid';
 const size=Number(base.size);
 const color=value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value.toLowerCase():null;
 return {shape,pattern,size:Number.isFinite(size)?Math.min(1.6,Math.max(.65,size)):1,
  color:color(base.color)||miniatureBaseDefault.color,
  rimColor:color(base.rimColor)||miniatureBaseDefault.rimColor,
  ringWidth:Math.max(.05,Math.min(.5,Number(base.ringWidth)||.28)),
  ringCount:Math.max(0,Math.min(3,Math.trunc(Number(base.ringCount)||0))),
  ringColors:miniatureBaseDefault.ringColors.map((fallback,i)=>color(base.ringColors?.[i])||fallback)};
}
function miniatureBaseFromControls(){
 return miniatureBaseSettings({base:{shape:el('miniatureBaseShape').value,pattern:el('miniatureBasePattern').value,
  size:Number(el('miniatureBaseSize').value)/100,color:el('miniatureBaseColor').value,
  rimColor:el('miniatureBaseRimColor').value,ringCount:Number(el('miniatureBaseRingCount').value),ringWidth:Number(el('miniatureBaseRingWidth').value)/100,
  ringColors:[0,1,2].map(i=>el('miniatureBaseRing'+i).value)}});
}

function miniatureAccount(){
 return roomProfile?.name?'account/'+encodeURIComponent(roomProfile.name):'offline';
}
function miniatureAssignmentKey(token){
 const id=token.roomId||token.trackingId;
 return id?miniaturePrefix+miniatureAccount()+'/standee/'+encodeURIComponent(id):null;
}
function miniatureAssetKey(id){
 return miniaturePrefix+miniatureAccount()+'/asset/'+id;
}
function resetMiniatureWorker(message){
 miniatureWorker?.terminate();miniatureWorker=null;
 for(const request of miniatureRequests.values()){
  clearTimeout(request.timer);
  request.reject(new Error(message));
 }
 miniatureRequests.clear();
}
function decodeStudioMiniature(buffer,filename='',stlTarget=60000){
 if(!miniatureWorker){
  const url=new URL('./studio-miniature-worker.js',document.baseURI);
  url.searchParams.set('build',el('battlemapBuild').textContent.trim());
  miniatureWorker=new Worker(url);
  miniatureWorker.onmessage=({data})=>{
   const request=miniatureRequests.get(data.id);
   if(!request)return;
   miniatureRequests.delete(data.id);
   clearTimeout(request.timer);
   if(data.error)request.reject(new Error(data.error));
   else request.resolve(data.asset);
  };
  miniatureWorker.onerror=()=>resetMiniatureWorker('The miniature reader could not start.');
 }
 return new Promise((resolve,reject)=>{
  const id=++miniatureRequestId;
  const timer=setTimeout(()=>resetMiniatureWorker('The miniature took too long to read.'),20000);
  miniatureRequests.set(id,{resolve,reject,timer});
  try{miniatureWorker.postMessage({id,buffer,stlTarget,expectStl:/\.stl$/i.test(filename),expectUnity:/\.unity3d$/i.test(filename),expectZip:/\.zip$/i.test(filename)},[buffer])}
  catch(error){clearTimeout(timer);miniatureRequests.delete(id);reject(error)}
 });
}
function releaseMiniatureBitmaps(asset){
 for(const image of asset?.bitmaps||[])image.close();
}
function cacheStudioMiniature(key,asset){
 const old=miniatureAssets.get(key);
 if(old?.asset===asset)return;
 if(old?.asset)releaseMiniatureBitmaps(old.asset);
 miniatureAssets.set(key,{asset,lastUsed:performance.now()});
}
function collectStudioMiniatures(active){
 const inactive=[...miniatureAssets].filter(([key,entry])=>entry.asset&&!active.has(key))
  .sort(([,a],[,b])=>b.lastUsed-a.lastUsed);
 for(const [key,entry] of inactive.slice(3)){
  releaseMiniatureBitmaps(entry.asset);
  miniatureAssets.delete(key);
 }
}
function loadStudioMiniature(id){
 const key=miniatureAssetKey(id),known=miniatureAssets.get(key);
 if(known)return known.promise??(known.error?Promise.reject(known.error):Promise.resolve(known.asset));
 const promise=(async()=>{
  const value=await savedValue(key,null);
  if(!(value?.file instanceof Blob)||value.file.size>miniatureFileLimit)throw Error('Miniature file is unavailable.');
  const asset=await decodeStudioMiniature(await value.file.arrayBuffer(),value.file.name,value.stlTarget);
  cacheStudioMiniature(key,asset);
  return asset;
 })().catch(error=>{miniatureAssets.set(key,{error});throw error});
 miniatureAssets.set(key,{promise});
 return promise;
}
function sceneMiniatureSettings(token){
 const key=miniatureAssignmentKey(token);
 if(!key)return null;
 if(!miniatureAssignments.has(key)){
  miniatureAssignments.set(key,null);
  void savedValue(key,null).then(value=>{
   if(miniatureAssignments.get(key)!==null||!value?.id)return;
   miniatureAssignments.set(key,value);
   draw('Miniature settings loaded');
  });
 }
 const settings=miniatureAssignments.get(key);
 return settings?.enabled?settings:null;
}
function sceneMiniatureAsset(id,assetKey){
 const entry=miniatureAssets.get(assetKey);
 if(entry?.asset){
  entry.lastUsed=performance.now();
  return entry.asset;
 }
 if(!entry)void loadStudioMiniature(id).then(()=>draw('Miniature loaded'),()=>{});
 return null;
}
async function localMiniatureLibrary(){
 const db=await storageReady;
 if(!db)return [];
 const prefix=miniaturePrefix+miniatureAccount()+'/label/';
 return new Promise((resolve,reject)=>{
  const request=db.transaction('saves').objectStore('saves').getAll(IDBKeyRange.bound(prefix,prefix+'\uffff'));
  request.onsuccess=()=>resolve(request.result.sort((a,b)=>a.name.localeCompare(b.name)));
  request.onerror=()=>reject(request.error);
 });
}
function miniatureRotationFromControls(){return ['X','Y','Z'].map(a=>Number(el('miniatureRotation'+a).value));}
function miniatureFields(){
 return ['miniatureMode','miniatureLibrary','miniatureFile','miniatureScale','miniatureScaleMode','miniatureFacing','miniatureRotationX','miniatureRotationY','miniatureRotationZ',
  'miniatureBaseShape','miniatureBasePattern','miniatureBaseSize','miniatureBaseColor','miniatureBaseRimColor','miniatureBaseRingCount','miniatureBaseRingWidth','miniatureBaseRing0','miniatureBaseRing1','miniatureBaseRing2','miniatureDoubleSided','miniatureForceOpaque']
  .map(el);
}
function updateMiniatureEditor(){
 const draft=miniatureEditor;
 if(!draft)return;
 const enabled=el('miniatureMode').value==='3d';
 el('miniatureOptions').hidden=!enabled;
 const base=miniatureBaseFromControls();
 el('miniatureBaseControls').hidden=base.shape==='off';
 el('miniatureBaseRingWidth').closest('label').hidden=!base.ringCount;
 el('miniatureBaseRingWidthValue').textContent=Math.round(base.ringWidth*100)+'%';
 for(let i=0;i<3;i++)el('miniatureBaseRing'+i).closest('label').hidden=i>=base.ringCount;
 el('miniatureBaseSizeValue').value=el('miniatureBaseSizeValue').textContent=`${Math.round(base.size*100)}%`;
 if(!enabled)el('miniaturePreview').hidden=true;
 el('miniaturePaintPanel').hidden=!(enabled&&draft.asset?.sourceTriangles);
 if(enabled&&draft.asset)renderStudioMiniaturePreview(draft.asset,{base,modelScale:Number(el('miniatureScale').value)/100,scaleMode:el('miniatureScaleMode').value,footprint:1,referenceHeight:standeeArtHeight(draft.token)/S/Math.max(1,draft.token.size||1),paint:draft.paint,inspectionDirection:miniatureInspectionDirection(),inspectionIntensity:Number(el('miniatureLampIntensity').value)/100,edgeSensitivity:Number(el('miniatureEdgeSensitivity').value)/100,edgeWidth:Number(el('miniatureEdgeWidth').value),edgeColor:el('miniatureEdgeColor').value,sculptShade:Number(el('miniatureSculptShade').value)/100,rotation:miniatureRotationFromControls(),doubleSided:el('miniatureDoubleSided').checked,forceOpaque:el('miniatureForceOpaque').checked});
}
async function openMiniatureEditor(token){
 const panel=el('standeeMiniatures');
 panel.hidden=roomProfile?.gm===false&&!ownsRoomStandee(token);
 if(panel.hidden)return;
 const draft=miniatureEditor={token,asset:null,id:'',file:null,change:0,busy:false};
 el('miniatureFile').value='';
 el('miniaturePaintMode').checked=false;
 el('miniatureStlResolutionRow').hidden=true;
 el('miniatureStlResolution').value='60000';
 el('miniatureMode').value='2d';
 el('miniatureScale').value='100';
 el('miniatureScaleMode').value='height';
 el('miniatureFacing').value='0';
 for(const a of ['X','Y','Z'])el('miniatureRotation'+a).value='0';
 el('miniatureBaseShape').value=miniatureBaseDefault.shape;
 el('miniatureBasePattern').value=miniatureBaseDefault.pattern;
 el('miniatureBaseSize').value=String(miniatureBaseDefault.size*100);
 el('miniatureBaseColor').value=miniatureBaseDefault.color;
 el('miniatureBaseRimColor').value=miniatureBaseDefault.rimColor;
 el('miniatureBaseRingCount').value='0';
 el('miniatureBaseRingWidth').value='28';
 miniatureBaseDefault.ringColors.forEach((c,i)=>el('miniatureBaseRing'+i).value=c);
 el('miniatureDoubleSided').checked=true;
 el('miniatureForceOpaque').checked=true;
 el('miniatureSculptShade').value='65';el('miniatureEdgeWidth').value='0';el('miniatureEdgeSensitivity').value='65';el('miniatureEdgeColor').value='#202020';
 el('miniaturePreviewRotation').value='0';
 el('miniaturePreviewElevation').value='25';
 el('miniatureStatus').textContent='';
 for(const input of miniatureFields())input.disabled=true;
 updateMiniatureEditor();
 try{
  const [library,settings]=await Promise.all([localMiniatureLibrary(),savedValue(miniatureAssignmentKey(token),null)]);
  if(miniatureEditor!==draft)return;
  const select=el('miniatureLibrary');
  select.replaceChildren(new Option('Choose a saved miniature',''),...library.map(({name,id})=>new Option(name,id)));
  draft.initial=settings;
  draft.paint={...(settings?.paint||{})};draft.paintUndo=[];draft.paintRedo=[];
  if(settings?.id){
   draft.id=settings.id;
   select.value=settings.id;
   el('miniatureMode').value=settings.enabled?'3d':'2d';
   el('miniatureScale').value=String(settings.scale*100);
 el('miniatureScaleMode').value=settings.scaleMode==='footprint'?'footprint':'height';
   el('miniatureFacing').value=String(settings.facing);
   ['X','Y','Z'].forEach((a,i)=>el('miniatureRotation'+a).value=String(settings.rotation?.[i]??0));
   const base=miniatureBaseSettings(settings);
   el('miniatureBaseShape').value=base.shape;
   el('miniatureBasePattern').value=base.pattern;
   el('miniatureBaseSize').value=String(base.size*100);
   el('miniatureBaseColor').value=base.color;
   el('miniatureBaseRimColor').value=base.rimColor;
    el('miniatureBaseRingCount').value=String(base.ringCount);
 el('miniatureBaseRingWidth').value=String(Math.round(base.ringWidth*100));
    base.ringColors.forEach((c,i)=>el('miniatureBaseRing'+i).value=c);
   el('miniatureDoubleSided').checked=settings.doubleSided!==false;
   el('miniatureForceOpaque').checked=settings.forceOpaque!==false;
 el('miniatureSculptShade').value=String(Math.round((settings.sculptShade??.65)*100));el('miniatureEdgeWidth').value=String(settings.edgeWidth??0);el('miniatureEdgeSensitivity').value=String(Math.round((settings.edgeSensitivity??.65)*100));el('miniatureEdgeColor').value=settings.edgeColor||'#202020';
   if(settings.enabled)await chooseStudioMiniature(settings.id);
  }
 }catch(error){
  if(miniatureEditor===draft)el('miniatureStatus').textContent=error.message;
 }finally{
  if(miniatureEditor===draft){
   for(const input of miniatureFields())input.disabled=false;
   updateMiniatureEditor();
  }
 }
}
async function chooseStudioMiniature(id){
 const draft=miniatureEditor;
 if(!draft)return;
 const change=++draft.change;
 draft.id=id;draft.file=null;draft.asset=null;draft.busy=!!id;
 el('miniaturePreview').hidden=true;
 el('miniatureStatus').textContent=id?'Loading miniature…':'';
 try{
  const asset=id?await loadStudioMiniature(id):null;
  if(miniatureEditor!==draft||change!==draft.change)return;
  draft.asset=asset;
  el('miniatureStatus').textContent='';
  updateMiniatureEditor();
 }catch(error){
  if(miniatureEditor===draft&&change===draft.change)el('miniatureStatus').textContent=error.message;
 }finally{
  if(change===draft.change)draft.busy=false;
 }
}
async function pickStudioMiniature(file){
 const draft=miniatureEditor;
 if(!draft||!file)return;
 const change=++draft.change;
 draft.busy=true;draft.id='';draft.file=null;draft.asset=null;draft.paint={};draft.paintUndo=[];draft.paintRedo=[];
 el('miniaturePreview').hidden=true;
 el('miniatureStatus').textContent='Reading miniature…';
 let asset;
 try{
  if(file.size>miniatureFileLimit)throw Error('Choose a ZIP, .unity3d, STL, or GLB no larger than 24 MB.');
  const stl=/\.stl$/i.test(file.name),stlTarget=Number(el('miniatureStlResolution').value);
  draft.sourceFile=file;
  el('miniatureStlResolutionRow').hidden=!stl;
  const raw=await file.arrayBuffer();
  const hash=await crypto.subtle.digest('SHA-256',raw);
  const id=Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('')+(stl?'-stl-'+stlTarget:'');
  asset=await decodeStudioMiniature(raw,file.name,stlTarget);
  if(miniatureEditor!==draft||draft.change!==change){releaseMiniatureBitmaps(asset);return}
  const existing=miniatureAssets.get(miniatureAssetKey(id))?.asset;
  if(existing){releaseMiniatureBitmaps(asset);asset=existing}
  else cacheStudioMiniature(miniatureAssetKey(id),asset);
  Object.assign(draft,{id,file,asset,stlTarget});
  if(stl)el('miniatureScaleMode').value='footprint';
  el('miniatureLibrary').value='';
  el('miniatureStatus').textContent=file.name+(asset.sourceTriangles?' · '+asset.sourceTriangles.toLocaleString()+' → '+(asset.primitives[0].indices.length/3).toLocaleString()+' triangles':'');
  updateMiniatureEditor();
 }catch(error){
  if(miniatureEditor===draft&&draft.change===change)el('miniatureStatus').textContent=error.message;
 }finally{
  if(draft.change===change)draft.busy=false;
 }
}
async function saveMiniatureEditor(token){
 const draft=miniatureEditor;
 if(draft?.token!==token)return;
 if(draft.saving)throw Error('The miniature is already being saved.');
 const enabled=el('miniatureMode').value==='3d';
 if(!enabled&&!draft.initial)return;
 if(draft.busy)throw Error('Wait for the miniature to finish loading.');
 if(enabled&&(!draft.id||!draft.asset))throw Error('Choose a valid 3D miniature.');
 if(!await storageReady)throw Error('Browser storage is unavailable.');
 const key=miniatureAssignmentKey(token)??miniatureAssignmentKey({...token,trackingId:crypto.randomUUID()});
 const settings={id:draft.id,enabled,scale:Number(el('miniatureScale').value)/100,scaleMode:el('miniatureScaleMode').value,facing:Number(el('miniatureFacing').value),
  paint:draft.paint||{},edgeSensitivity:Number(el('miniatureEdgeSensitivity').value)/100,edgeWidth:Number(el('miniatureEdgeWidth').value),edgeColor:el('miniatureEdgeColor').value,sculptShade:Number(el('miniatureSculptShade').value)/100,rotation:miniatureRotationFromControls(),base:miniatureBaseFromControls(),doubleSided:el('miniatureDoubleSided').checked,forceOpaque:el('miniatureForceOpaque').checked};
 if(!Number.isFinite(settings.scale)||settings.scale<.25||settings.scale>3||!Number.isFinite(settings.facing)||Math.abs(settings.facing)>180)
  throw Error('Enter a valid miniature scale and facing offset.');
 const db=await storageReady;
 const id=draft.id;
 draft.saving=true;
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('saves','readwrite');
  const store=tx.objectStore('saves');
  tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('The miniature could not be saved to browser storage.'));
  if(draft.file&&enabled){
   store.put({name:draft.file.name,file:draft.file,stlTarget:draft.stlTarget},miniatureAssetKey(id));
   store.put({name:draft.file.name,id},miniaturePrefix+miniatureAccount()+'/label/'+id);
  }
  store.put(settings,key);
 })}finally{draft.saving=false}
 if(!token.roomId&&!token.trackingId)token.trackingId=decodeURIComponent(key.slice(key.lastIndexOf('/')+1));
 miniatureAssignments.set(key,settings);
}
function closeMiniatureEditor(){
 miniatureEditor=null;
 el('miniaturePreview').hidden=true;
 disposeStudioMiniaturePreview();
}

el('miniatureMode').addEventListener('change',()=>{
 if(el('miniatureMode').value==='3d'&&miniatureEditor?.id&&!miniatureEditor.asset&&!miniatureEditor.busy)
  void chooseStudioMiniature(miniatureEditor.id);
 updateMiniatureEditor();
});
el('miniatureLibrary').addEventListener('change',event=>void chooseStudioMiniature(event.target.value));
el('miniatureStlResolution').addEventListener('change',()=>{if(miniatureEditor?.sourceFile)void pickStudioMiniature(miniatureEditor.sourceFile);});
el('miniatureSculptShade').addEventListener('input',updateMiniatureEditor);
el('miniatureScale').addEventListener('input',updateMiniatureEditor);
el('miniatureScaleMode').addEventListener('change',updateMiniatureEditor);
el('miniatureBaseRingWidth').addEventListener('input',updateMiniatureEditor);
el('miniatureFile').addEventListener('change',event=>void pickStudioMiniature(event.target.files[0]));
for(const id of ['miniaturePreviewRotation','miniaturePreviewElevation'])
 el(id).addEventListener('input',updateMiniatureEditor);
for(const id of ['miniatureBaseSize','miniatureBaseColor','miniatureBaseRimColor','miniatureBaseRing0','miniatureBaseRing1','miniatureBaseRing2'])
 el(id).addEventListener('input',updateMiniatureEditor);
for(const id of ['miniatureRotationX','miniatureRotationY','miniatureRotationZ','miniatureBaseShape','miniatureBaseRingCount','miniatureDoubleSided','miniatureForceOpaque'])
 el(id).addEventListener('change',updateMiniatureEditor);
el('miniatureBasePattern').addEventListener('change',updateMiniatureEditor);

const miniatureDrop=el('miniatureDrop');
miniatureDrop.addEventListener('dragover',event=>{
 if(!event.dataTransfer.types.includes('Files'))return;
 event.preventDefault();
 miniatureDrop.classList.add('is-dragging');
});
miniatureDrop.addEventListener('dragleave',event=>{
 if(!miniatureDrop.contains(event.relatedTarget))miniatureDrop.classList.remove('is-dragging');
});
miniatureDrop.addEventListener('drop',event=>{
 event.preventDefault();
 miniatureDrop.classList.remove('is-dragging');
 if(el('miniatureFile').disabled)return;
 const {files}=event.dataTransfer;
 if(files.length===1)void pickStudioMiniature(files[0]);
 else if(files.length>1)el('miniatureStatus').textContent='Drop one miniature file at a time.';
});

let miniaturePaintDragging=false;
function miniaturePaintCheckpoint(d){
 (d.paintUndo??=[]).push({...d.paint});if(d.paintUndo.length>20)d.paintUndo.shift();d.paintRedo=[];
}
function miniaturePaintAt(event){
 const d=miniatureEditor;if(!d?.asset?.sourceTriangles||!el('miniaturePaintMode').checked)return;
 const tool=el('miniaturePaintTool').value,diameter=Number(el('miniaturePaintDiameter').value);
 let faces=studioMiniaturePaintPick(event,['brush','erase'].includes(tool)&&diameter>1?diameter/2:0);if(!faces.length)return;
 if(tool==='sample'){el('miniaturePaintColor').value=d.paint?.[faces[0]]||'#7a7a7a';return;}
 if(tool==='fill')faces=studioMiniaturePaintRegion(d.asset,faces[0],Number(el('miniaturePaintAngle').value),d.paint,Number(el('miniatureFillRange').value),el('miniatureFillCleanup').checked);
 const paint={...d.paint};for(const face of faces){if(tool==='erase')delete paint[face];else paint[face]=el('miniaturePaintColor').value;}
 d.paint=paint;updateMiniatureEditor();
}
el('miniaturePreview').addEventListener('pointerdown',event=>{
 const d=miniatureEditor;if(!el('miniaturePaintMode').checked||!d?.asset?.sourceTriangles)return;
 event.preventDefault();const tool=el('miniaturePaintTool').value;
 if(tool!=='sample')miniaturePaintCheckpoint(d);
 miniaturePaintDragging=['brush','erase'].includes(tool);
 if(miniaturePaintDragging)el('miniaturePreview').setPointerCapture(event.pointerId);
 miniaturePaintAt(event);
});
el('miniaturePreview').addEventListener('pointermove',event=>{if(miniaturePaintDragging)miniaturePaintAt(event);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])el('miniaturePreview').addEventListener(name,()=>miniaturePaintDragging=false);
el('miniaturePaintDiameter').addEventListener('input',()=>el('miniaturePaintDiameterValue').textContent=el('miniaturePaintDiameter').value+' px');
el('miniaturePaintUndo').addEventListener('click',()=>{const d=miniatureEditor;if(d?.paintUndo?.length){(d.paintRedo??=[]).push({...d.paint});d.paint=d.paintUndo.pop();updateMiniatureEditor();}});
el('miniaturePaintRedo').addEventListener('click',()=>{const d=miniatureEditor;if(d?.paintRedo?.length){(d.paintUndo??=[]).push({...d.paint});d.paint=d.paintRedo.pop();updateMiniatureEditor();}});
el('miniaturePaintClear').addEventListener('click',()=>{const d=miniatureEditor;if(d){miniaturePaintCheckpoint(d);d.paint={};updateMiniatureEditor();}});
el('miniaturePaintAll').addEventListener('click',()=>{const d=miniatureEditor;if(!d?.asset?.sourceTriangles)return;miniaturePaintCheckpoint(d);const color=el('miniaturePaintColor').value;d.paint=Object.fromEntries(Array.from({length:d.asset.primitives[0].indices.length/3},(_,i)=>[i,color]));updateMiniatureEditor();});

function miniatureInspectionDirection(){const a=Number(el('miniatureLampAzimuth').value)*Math.PI/180,e=Number(el('miniatureLampElevation').value)*Math.PI/180;return [Math.cos(a)*Math.cos(e),Math.sin(a)*Math.cos(e),Math.sin(e)];}
for(const id of ['miniatureLampAzimuth','miniatureLampElevation','miniatureLampIntensity'])el(id).addEventListener('input',updateMiniatureEditor);

for(const id of ['miniatureEdgeWidth','miniatureEdgeColor','miniatureEdgeSensitivity'])el(id).addEventListener('input',updateMiniatureEditor);
