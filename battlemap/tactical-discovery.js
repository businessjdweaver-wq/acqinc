/* Tactical exploration groundwork v1.500.
   Loaded in Studio shared scope; does not affect the existing fog renderer. */
const tacticalDiscoveryVersion=1;
const tacticalDiscoveryPrefix='battlemap.tacticalDiscovery.v1:';
let tacticalDiscoveryCache={key:null,value:null};
function tacticalDiscoveryKey(){
 // A distinct key for each scene and account. Server-synchronized party-wide
 // discovery requires a separate authorized endpoint in a later version.
 const scene=roomState?.sceneId||currentSceneId||requestedRoomScene;
 const account=roomProfile?.name;
 return scene&&account?tacticalDiscoveryPrefix+encodeURIComponent(String(scene))+':'+encodeURIComponent(String(account)):null;
}
function tacticalReadDiscovery(){
 const key=tacticalDiscoveryKey();
 if(!key)return {v:tacticalDiscoveryVersion,topology:'',cells:[]};
 if(tacticalDiscoveryCache.key===key)return tacticalDiscoveryCache.value;
 let value;
 try{value=JSON.parse(localStorage.getItem(key)||'null')}catch{}
 if(!value||value.v!==tacticalDiscoveryVersion||!Array.isArray(value.cells))
  value={v:tacticalDiscoveryVersion,topology:'',cells:[]};
 tacticalDiscoveryCache={key,value};return value;
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
 const known=new Set(old.topology===topology?old.cells:[]);
 let added=0;
 for(const point of points){
  const cell=tacticalDiscoveryCell(point);
  if(!cell||known.has(cell)||!Number.isInteger(tacticalRoomAt(point)))continue;
  // A valid ray is required even through an open portal. We remember only
  // directly observed sampled cells, never every cell in a connected region.
  if(!playerCanSeePoint(point,blockers))continue;
  known.add(cell);added++;
  if(known.size>=12000)break;
 }
 if(added||old.topology!==topology){
  const value={v:tacticalDiscoveryVersion,topology,cells:[...known]};
  try{localStorage.setItem(key,JSON.stringify(value));tacticalDiscoveryCache={key,value}}
  catch(error){console.warn('Tactical discovery could not be saved locally',error)}
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
let tacticalScanTimer=null,tacticalScanSignature='';
function tacticalScheduleScan(){
 if(roomProfile?.gm!==false||!roomState?.active||!roomState.sceneId)return;
 const observers=visionObservers(tokens).filter(t=>ownsRoomStandee(t)&&!t.incognito&&!t.conditions?.includes('dead')&&!t.conditions?.includes('blinded'));
 const centers=[...observers.map(basePoint),...spellEyes()];
 const signature=[roomState.sceneId,tacticalTopologyVersion(),...centers.map(p=>p.join(',')),...observers.map(t=>[t.roomId,t.vision,t.darkvision,t.torch,t.torchBright,t.torchDim].join(':'))].join('|');
 if(signature===tacticalScanSignature)return;
 tacticalScanSignature=signature;
 clearTimeout(tacticalScanTimer);
 tacticalScanTimer=setTimeout(()=>{
  if(roomProfile?.gm!==false||!roomState?.active)return;
  const samples=[];
  for(const [x,y,z] of centers.slice(0,12)){
   for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2],[1,1],[-1,1],[1,-1],[-1,-1]])
    samples.push([Math.floor(x)+dx+.5,Math.floor(y)+dy+.5,z]);
  }
  try{tacticalRecordExplored(samples)}catch(error){console.warn('Tactical discovery scan failed',error)}
 },100);
}
