// Store binary assets separately from scene JSON. This library is private to
// the browser and account; shared scenes continue to carry the 2D fallback.
const miniaturePrefix='battlemap.miniatures.v1/';
const miniatureAssets=new Map(),miniatureAssignments=new Map();
const miniatureFileLimit=24*1024*1024;
const miniatureRequests=new Map();
let miniatureWorker=null,miniatureRequestId=0,miniatureEditor=null;

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
function decodeStudioMiniature(buffer,filename=''){
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
  try{miniatureWorker.postMessage({id,buffer,expectUnity:/\.unity3d$/i.test(filename)},[buffer])}
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
  const asset=await decodeStudioMiniature(await value.file.arrayBuffer(),value.file.name);
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
function miniatureFields(){
 return ['miniatureMode','miniatureLibrary','miniatureFile','miniatureScale','miniatureFacing']
  .map(el);
}
function updateMiniatureEditor(){
 const draft=miniatureEditor;
 if(!draft)return;
 const enabled=el('miniatureMode').value==='3d';
 el('miniatureOptions').hidden=!enabled;
 if(!enabled)el('miniaturePreview').hidden=true;
 if(enabled&&draft.asset)renderStudioMiniaturePreview(draft.asset);
}
async function openMiniatureEditor(token){
 const panel=el('standeeMiniatures');
 panel.hidden=roomProfile?.gm===false&&!ownsRoomStandee(token);
 if(panel.hidden)return;
 const draft=miniatureEditor={token,asset:null,id:'',file:null,change:0,busy:false};
 el('miniatureFile').value='';
 el('miniatureMode').value='2d';
 el('miniatureScale').value='100';
 el('miniatureFacing').value='0';
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
  if(settings?.id){
   draft.id=settings.id;
   select.value=settings.id;
   el('miniatureMode').value=settings.enabled?'3d':'2d';
   el('miniatureScale').value=String(settings.scale*100);
   el('miniatureFacing').value=String(settings.facing);
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
 draft.busy=true;draft.id='';draft.file=null;draft.asset=null;
 el('miniaturePreview').hidden=true;
 el('miniatureStatus').textContent='Reading miniature…';
 let asset;
 try{
  if(file.size>miniatureFileLimit)throw Error('Choose a GLB or Unity tabletop bundle no larger than 24 MB.');
  const raw=await file.arrayBuffer();
  const hash=await crypto.subtle.digest('SHA-256',raw);
  const id=Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
  asset=await decodeStudioMiniature(raw,file.name);
  if(miniatureEditor!==draft||draft.change!==change){releaseMiniatureBitmaps(asset);return}
  const existing=miniatureAssets.get(miniatureAssetKey(id))?.asset;
  if(existing){releaseMiniatureBitmaps(asset);asset=existing}
  else cacheStudioMiniature(miniatureAssetKey(id),asset);
  Object.assign(draft,{id,file,asset});
  el('miniatureLibrary').value='';
  el('miniatureStatus').textContent=file.name;
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
 const settings={id:draft.id,enabled,scale:Number(el('miniatureScale').value)/100,facing:Number(el('miniatureFacing').value)};
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
   store.put({name:draft.file.name,file:draft.file},miniatureAssetKey(id));
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
el('miniatureFile').addEventListener('change',event=>void pickStudioMiniature(event.target.files[0]));
for(const id of ['miniaturePreviewRotation','miniaturePreviewElevation'])
 el(id).addEventListener('input',updateMiniatureEditor);
