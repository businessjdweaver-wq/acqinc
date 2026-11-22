/* Tactical exploration groundwork v1.500.
   Loaded in Studio shared scope; does not affect the existing fog renderer. */
const tacticalDiscoveryVersion=1;
const tacticalDiscoveryPrefix='battlemap.tacticalDiscovery.v1:';
let tacticalDiscoveryCache={key:null,value:null};
let tacticalLastRecorded=null;
let tacticalStorageError='';
let tacticalPreviousCenters=new Map();
const tacticalTeleportPending=new Set();
let tacticalDbPromise=null;
function tacticalDatabase(){
 if(!('indexedDB' in window))return Promise.reject(new Error('IndexedDB unavailable'));
 if(!tacticalDbPromise)tacticalDbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('battlemap-tactical-discovery',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('exploration');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 return tacticalDbPromise;
}
async function tacticalDatabaseLoad(key){
 try{
  const db=await tacticalDatabase();
  return await new Promise((resolve,reject)=>{
   const req=db.transaction('exploration','readonly').objectStore('exploration').get(key);
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
  });
 }catch(error){console.warn('Tactical IndexedDB read failed',error);return null}
}
async function tacticalDatabaseSave(key,value){
 try{
  const db=await tacticalDatabase();
  await new Promise((resolve,reject)=>{
   const transaction=db.transaction('exploration','readwrite');
   transaction.objectStore('exploration').put(value,key);
   transaction.oncomplete=resolve;
   transaction.onerror=()=>reject(transaction.error);
   transaction.onabort=()=>reject(transaction.error);
  });
  tacticalStorageError='';
 }catch(error){tacticalStorageError=error?.name||'IndexedDB unavailable';console.warn('Tactical IndexedDB write failed',error)}
}
let tacticalLoadedKeys=new Set();
function tacticalFogRevision(){return Number(areas.find(a=>a.shape==='appearance')?.appearance?.fogRevision)||0;}
function tacticalDiscoveryKey(){
 // A distinct key for each scene and account. Server-synchronized party-wide
 // discovery requires a separate authorized endpoint in a later version.
 const scene=roomState?.sceneId||currentSceneId||requestedRoomScene;
 const account=roomProfile?.name;
 return scene&&account?tacticalDiscoveryPrefix+encodeURIComponent(String(scene))+':'+encodeURIComponent(String(account))+':fog'+tacticalFogRevision():null;
}
function tacticalReadDiscovery(){
 const key=tacticalDiscoveryKey();
 if(!key)return {v:tacticalDiscoveryVersion,topology:'',cells:[]};
 if(tacticalDiscoveryCache.key===key&&tacticalDiscoveryCache.value)return tacticalDiscoveryCache.value;
 let value;
 try{value=JSON.parse(localStorage.getItem(key)||'null')}catch{}
 if(!value||value.v!==tacticalDiscoveryVersion||!Array.isArray(value.cells))
  value={v:tacticalDiscoveryVersion,topology:'',cells:[]};
 tacticalDiscoveryCache={key,value};
 if(!tacticalLoadedKeys.has(key)){
  tacticalLoadedKeys.add(key);
  void tacticalDatabaseLoad(key).then(saved=>{
   if(!saved||saved.v!==tacticalDiscoveryVersion||!Array.isArray(saved.cells))return;
   if(tacticalDiscoveryKey()!==key)return;
   const current=tacticalDiscoveryCache.key===key?tacticalDiscoveryCache.value:null;
   const topology=tacticalTopologyVersion();
   if(saved.topology!==topology)return;
   const cells=[...new Set([...(current?.topology===topology?current.cells:[]),...saved.cells])];
   tacticalDiscoveryCache={key,value:{v:tacticalDiscoveryVersion,topology,cells}};
   tacticalMapRender();
  });
 }
 return value;
}
function tacticalDiscoveryCell(point){
 if(!Array.isArray(point)||point.length<3||!point.slice(0,3).every(Number.isFinite))return null;
 return [Math.floor(point[0]),Math.floor(point[1]),Math.floor(point[2])].join(',');
}
function tacticalKnownAt(point){
 const cell=tacticalDiscoveryCell(point);
 if(!cell)return false;
 const state=tacticalReadDiscovery();
 return state.topology===tacticalTopologyVersion()&&state.cells.includes(cell);
}
function tacticalRecordExplored(points,blockers=visionBlockers()){
 const key=tacticalDiscoveryKey();
 // GM preview and unauthenticated clients must not add to player memory.
 if(!key||roomProfile?.gm!==false||!Array.isArray(points))return 0;
 const topology=tacticalTopologyVersion(),old=tacticalReadDiscovery();
 // A changed wall layout starts a fresh discovery epoch. Do not reuse old cells.
 const known=new Set(old.topology===topology?old.cells:[]);
 let added=0;
 for(const point of points){
  const cell=tacticalDiscoveryCell(point);
  if(!cell||known.has(cell))continue;
  // The diagnostic flood-fill is not defined for scenes without opaque
  // boundaries or outside its 24k-cell budget. It cannot gate discovery;
  // the authoritative per-point visibility test below does that.
  // A valid ray is required even through an open portal. We remember only
  // directly observed sampled cells, never every cell in a connected region.
  if(!playerCanSeePoint(point,blockers))continue;
  known.add(cell);added++;
  if(known.size>=12000)break;
 }
 if(added||old.topology!==topology){
  const value={v:tacticalDiscoveryVersion,topology,cells:[...known]};
  tacticalDiscoveryCache={key,value};tacticalLastRecorded={key,value};
  void tacticalDatabaseSave(key,value);
  try{localStorage.setItem(key,JSON.stringify(value));tacticalStorageError=''}
  catch(error){
   tacticalStorageError=error?.name||'storage unavailable';
   // Reclaim only obsolete tactical-map records, never unrelated app data.
   if(error?.name==='QuotaExceededError'){
    try{
     const obsolete=[];
     for(let i=0;i<localStorage.length;i++){
      const item=localStorage.key(i);
      if(item?.startsWith(tacticalDiscoveryPrefix)&&item!==key)obsolete.push(item);
     }
     for(const item of obsolete)localStorage.removeItem(item);
     if(obsolete.length){localStorage.setItem(key,JSON.stringify(value));tacticalStorageError=''}
    }catch(retryError){tacticalStorageError=retryError?.name||'storage unavailable'}
   }
   if(tacticalStorageError)console.warn('Tactical discovery remains in memory only:',tacticalStorageError);
  }
 }
 return added;
}
function tacticalExplorationAt(point,blockers=visionBlockers()){
 if(tacticalVisibilityAt(point,blockers)==='visible')return 'visible';
 return tacticalKnownAt(point)?'explored':'unknown';
}

/* Observe a small neighborhood around owned standees and active remote
   vision proxies. Called after an authoritative scene snapshot, never from
   the drawing loop. All samples are individually ray-checked. */
let tacticalScanTimer=null,tacticalScanSignature='',tacticalScanStatus='Waiting for player scene';
function tacticalScheduleScan(){
 if(roomProfile?.gm!==false||!roomState?.active||!roomState.sceneId){tacticalScanStatus='No active player scene';return;}
 const observers=visionObservers(tokens).filter(t=>ownsRoomStandee(t)&&!t.incognito&&!t.conditions?.includes('dead')&&(!t.conditions?.includes('blinded')||t.blindsight>0));
 const centers=[...observers.map(basePoint),...spellEyes()];
 // Sample only short, continuous standee movements. Large jumps (including
 // teleportation and scene changes) must never reveal the intervening route.
 const epoch=[roomState.sceneId,tacticalFogRevision(),tacticalTopologyVersion()].join('|');
 const scanCenters=[];
 const nextCenters=new Map();
 observers.forEach((observer,i)=>{
  const current=centers[i],id=String(observer.roomId);
  const previous=tacticalPreviousCenters.get(id);
  const teleporting=tacticalTeleportPending.has(id);
  if(previous&&teleporting&&Math.hypot(current[0]-previous.point[0],current[1]-previous.point[1])>0)tacticalTeleportPending.delete(id);
  nextCenters.set(id,{epoch,point:current});
  if(previous?.epoch===epoch){
   const a=previous.point,dist=Math.hypot(current[0]-a[0],current[1]-a[1]);
   if(dist>0&&!teleporting&&Math.abs(current[2]-a[2])<.5){
    const steps=Math.min(240,Math.ceil(dist*2));
    for(let j=1;j<steps;j++)scanCenters.push([
     a[0]+(current[0]-a[0])*j/steps,
     a[1]+(current[1]-a[1])*j/steps,
     a[2]+(current[2]-a[2])*j/steps]);
   }
  }
 });
 tacticalPreviousCenters=nextCenters;
 // Keep teleport markers until the corresponding standee position changes.
 const signature=[roomState.sceneId,tacticalFogRevision(),tacticalTopologyVersion(),...centers.map(p=>p.join(',')),...observers.map(t=>[t.roomId,t.vision,t.darkvision,t.torch,t.torchBright,t.torchDim].join(':'))].join('|');
 if(signature===tacticalScanSignature&&tacticalReadDiscovery().topology===tacticalTopologyVersion())return;
 tacticalScanStatus=centers.length?'Scanning '+centers.length+' vision source(s)':'No controlled vision sources';
 tacticalScanSignature=signature;
 clearTimeout(tacticalScanTimer);
 tacticalScanTimer=setTimeout(()=>{
  if(roomProfile?.gm!==false||!roomState?.active){tacticalScanStatus='Scan aborted: inactive scene';return}
  const samples=[];
  for(const [x,y,z] of [...centers.slice(0,12),...scanCenters.slice(0,24)]){
   // Always sample the observer's actual position as well as adjacent cell centers.
   samples.push([x,y,z]);
   for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2],[1,1],[-1,1],[1,-1],[-1,-1]])
    samples.push([Math.floor(x)+dx+.5,Math.floor(y)+dy+.5,z]);
  }
  try{
   const blockers=visionBlockers();
   const candidates=samples.filter(p=>playerCanSeePoint(p,blockers));
   tacticalScanStatus='Sources '+centers.length+' · samples '+samples.length+' · visible '+candidates.length;
   const added=tacticalRecordExplored(candidates,blockers);
   tacticalScanStatus+=' · added '+added+' · stored '+tacticalMapCells().length;
   tacticalMapRender();
  }catch(error){tacticalScanStatus='Scan error: '+error.message;console.warn('Tactical discovery scan failed',error)}
 },100);
}

/* Deliberately sparse tactical map: only sight-verified sampled squares are
   drawn. Never copy the full scene canvas, geometry, enemy tokens or fog. */
let tacticalMapWindow=null,tacticalMapRefresh=null;
function tacticalMapCells(){
 const state=tacticalReadDiscovery(),topology=tacticalTopologyVersion();
 if(state.topology===topology)return state.cells;
 // A topology mismatch must never expose previously discovered rooms.
 return [];
}
function tacticalMapMarkup(){
 return '<!doctype html><html><head><meta charset="utf-8"><title>Tactical map</title><style>body{margin:0;background:#171c1a;color:#eee;font:14px system-ui}header{padding:10px;display:flex;justify-content:space-between;align-items:center}canvas{display:block;width:100%;height:calc(100vh - 52px);background:#101412}button{cursor:pointer}</style></head><body><header><strong>Tactical map · explored squares only</strong><span id="count"></span></header><canvas id="tacticalCanvas"></canvas></body></html>';
}
function tacticalDrawCanvas(canvas,label){
 if(!canvas)return;
 const width=Math.max(240,Math.round(canvas.clientWidth||320)),height=Math.max(180,Math.round(canvas.clientHeight||240));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);
 const cells=tacticalMapCells().map(key=>key.split(',').map(Number)).filter(p=>p.length===3&&p.every(Number.isFinite));
 const owned=tokens.filter(t=>ownsRoomStandee(t)&&!t.incognito).map(t=>basePoint(t)).filter(p=>p.every(Number.isFinite));
 const floor=owned.length?Math.floor(owned[0][2]):cells.length?cells[0][2]:0;
 const visible=cells.filter(p=>p[2]===floor);
 const xs=[...visible.map(p=>p[0]),...owned.map(p=>p[0])],ys=[...visible.map(p=>p[1]),...owned.map(p=>p[1])];
 const minX=xs.length?Math.min(...xs)-2:0,maxX=xs.length?Math.max(...xs)+3:20;
 const minY=ys.length?Math.min(...ys)-2:0,maxY=ys.length?Math.max(...ys)+3:20;
 const scale=Math.max(3,Math.min(35,(width-24)/(maxX-minX),(height-24)/(maxY-minY)));
 const ox=(width-(maxX-minX)*scale)/2,oy=(height-(maxY-minY)*scale)/2;
 ctx.fillStyle='#526f68';
 for(const [x,y] of visible)ctx.fillRect(ox+(x-minX)*scale+.7,oy+(y-minY)*scale+.7,Math.max(1,scale-1.4),Math.max(1,scale-1.4));
 ctx.fillStyle='#f5d28d';
 for(const p of owned){if(Math.floor(p[2])!==floor)continue;ctx.beginPath();ctx.arc(ox+(p[0]-minX)*scale,oy+(p[1]-minY)*scale,Math.max(3,scale*.27),0,Math.PI*2);ctx.fill()}
 if(label){const state=tacticalReadDiscovery();const key=tacticalDiscoveryKey();const mismatch=state.topology!==tacticalTopologyVersion();label.textContent=visible.length+' squares · stored '+state.cells.length+' · level '+floor+' · '+tacticalScanStatus+(mismatch?' · topology mismatch':'')+(tacticalStorageError?' · storage '+tacticalStorageError:'')+(tacticalLastRecorded?.key&&tacticalLastRecorded.key!==key?' · storage key changed':'');}
}
function tacticalMapRender(){
 const panel=document.getElementById('tacticalMapPanel');
 if(panel&&!panel.hidden)tacticalDrawCanvas(document.getElementById('tacticalMapCanvas'),document.getElementById('tacticalMapCount'));
 if(tacticalMapWindow&&!tacticalMapWindow.closed){
  try{tacticalDrawCanvas(tacticalMapWindow.document.getElementById('tacticalCanvas'),tacticalMapWindow.document.getElementById('count'))}catch{}
 }
}
function tacticalMapOpenWindow(){
 const win=window.open('','battlemap-tactical-map','width=640,height=600,resizable=yes');
 if(!win){message('Allow pop-up windows to detach the tactical map.');return}
 tacticalMapWindow=win;
 win.document.open();win.document.write(tacticalMapMarkup());win.document.close();
 tacticalMapRender();
}
function tacticalMapInit(){
 const button=document.getElementById('tacticalMapToggle'),panel=document.getElementById('tacticalMapPanel'),playerButton=document.getElementById('playerTacticalMap');
 if(!button||!panel)return;panel.style.display='none';

 document.addEventListener('tactical-map-opened',()=>{try{tacticalScanSignature='';tacticalScheduleScan();tacticalMapRender()}catch(error){tacticalScanStatus='Map error: '+error.message;console.warn('Tactical map rendering error',error)}});

 document.getElementById('tacticalMapPopout').addEventListener('click',tacticalMapOpenWindow);
 tacticalMapRefresh=setInterval(()=>{if(playerButton)playerButton.hidden=roomProfile?.gm!==false||!roomState?.active;if(!panel.hidden||tacticalMapWindow&&!tacticalMapWindow.closed){if(tacticalReadDiscovery().topology!==tacticalTopologyVersion())tacticalScheduleScan();tacticalMapRender()}},1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tacticalMapInit,{once:true});
else tacticalMapInit();
