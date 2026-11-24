"use strict";

const el=id=>document.getElementById(id);
el('studioWebGLToggle').onclick=toggleStudioWebGL;
const types={
 terrace:['Grass terrace',3,2,1,'#718a55','#495539'],
 stone:['Stone platform',2,2,2,'#999e90','#626b64'],
 wall:['Ruin wall',3,1,2,'#afa28b','#766a59'],
 volume:['Resizable block',2,2,1,'#999e90','#626b64'],
 pillar:['Pillar',1,1,3,'#b2a588','#756c57'],
 column:['Round column',.5,.5,3,'#c7b698','#857457'],
 scatter:['Scatter cutout',1,1,1,'#b2a588','#756c57'],
 backdrop:['Backdrop panel',3,1,3,'#b2a588','#756c57'],
 ceilingArt:['Ceiling panel',3,3,0,'#b2a588','#756c57'],
 bridge:['Wood deck',3,1,1,'#b18552','#765032'],
 crate:['Crate',1,1,1,'#b28a5d','#725337'],
 fountain:['Fountain',1,1,1,'#398ba2','#82796a'],
 stream:['Stream',3,1,0,'#347f98','#315f73'],
 waterfall:['Waterfall',2,1,2,'#347f98','#27647d']
};
window.addEventListener('error',event=>{
 console.error('Battlemap error',event.error||event.message);
 el('startup').hidden=false;
 el('startup').querySelector('strong').textContent='Battlemap Studio encountered an error: '+(event.message||'unknown');
});
const maxHeight=12,canvas=el('map');
let ctx=canvas.getContext('2d');
let pieces=[
 {type:'terrace',x:2,y:3,z:0,r:0},{type:'terrace',x:2,y:5,z:0,r:0},
 {type:'stone',x:2,y:3,z:1,r:0},{type:'wall',x:7,y:3,z:0,r:0},
 {type:'pillar',x:7,y:5,z:0,r:0},{type:'pillar',x:9,y:5,z:0,r:0},
 {type:'bridge',x:7,y:5,z:3,r:0},{type:'crate',x:3,y:6,z:1,r:0}
];
pieces=pieces.map(p=>({...p,x:p.x+14,y:p.y+14}));
let tokens=[
 {type:'standee',name:'Adventurer',icon:'⚔',color:'#e0b36a',x:22,y:19,z:4,size:1},
 {type:'standee',name:'Goblin',icon:'◆',color:'#a4bf72',x:22,y:19,z:0,size:1}
];
const history=[], redoHistory=[], artCache=new Map(), textures=new Map();
let playing=false, measuring=false, route=null, carry=null;
let gmIgnoreLighting=true;
let gmVisionArmed=false,gmVisionStandee=null,playCombatStandee=null,playCombatStats=null;
let brush=null, tokenTool=null, panMode=false, showThroughTerrain=false, panX=0, panY=0;
let playerShowAllies=false;
function playerAllyCameraVisible(token){
 return playerShowAllies&&playing&&roomProfile?.gm===false&&token?.type==='standee'&&
  standeeRole(token)==='pc'&&!token.incognito&&!standeeHidden(token);
}

let topDown=false;
try{topDown=localStorage.getItem('battlemap.topDown')==='true'}catch{}
const viewCameras=[null,null];
let terrainLocked=false;
try{terrainLocked=localStorage.getItem('battlemap.terrainLocked')==='true'}catch{}
let group=new Set(), copiedTerrain=[], pointer=null;
let movementSurfaces=[];
let selected=null, tool=null, drag=null, ghost=null, faces=[], angle=-.64, tilt=.69, zoom=1.65, W,H,S,C,D;
const defaultGrid={width:40,depth:40};
function validSceneGrid(grid){
 return grid&&[grid.width,grid.depth].every(n=>Number.isInteger(n)&&n>=10&&n<=100);
}
function sceneGrid(sceneAreas=areas){
 const grid=sceneAreas.find(a=>a.shape==='appearance')?.grid;
 return validSceneGrid(grid)?grid:defaultGrid;
}
function gridLimit(axis){const grid=floorSceneEditing&&floorSceneGridDraft?floorSceneGridDraft:sceneGrid();return axis===0?grid.width:grid.depth}
function gridProjectionCenter(axis){const saved=sceneGrid();const key=axis===0?'width':'depth';const base=saved.projectionBase;return Number.isFinite(base?.[key])?base[key]/2:saved[key]/2}
function setSceneGrid(sceneAreas,grid){
 let appearance=sceneAreas.find(a=>a.shape==='appearance');
 if(!appearance){appearance={shape:'appearance',origin:[0,0,0],angle:0,size:1,appearance:{}};sceneAreas.push(appearance)}
 appearance.grid=grid;
}
function furnitureHeight(v){const h=v.furnHeight??35;return ({tumbleweed:.2+h*.006,hitchingPost:.45+h*.01,feedTrough:.18+h*.005,waterTower:1.2+h*.025,splitRailFence:.35+h*.008}[v.componentKind]??(.15+h*.025))}
function dimensions(p){if(isFurniture(p)){const v=furnitureValues(p),kind=v.componentKind,[w,d]=furnitureFootprint(v),h=furnitureHeight(v),H=kind==='rug'?.024:kind==='chair'&&v.furnDetail>25?h*1.4:Math.max(h,.15);return p.r%2?[d,w,H]:[w,d,H]}if(p.type==='standee')return [p.size,p.size,1];const [,w,d,h]=types[p.type];const [width,depth,height]=p.type==='volume'?(p.extents??[w,d,h]):[w,d,h];return p.r%2?[depth,width,height]:[width,depth,height]}
function sceneryPiece(p){return ['scatter','backdrop','ceilingArt'].includes(p.type)}
function formationLanding(p,terrain,sceneAreas=areas){
 const appearance=sceneAreas.find(a=>a.shape==='appearance')?.appearance;
 const formation=p.terrainShape?.componentKind??terrainThemes[appearance?.terrainTheme]?.formation;
 if(formation&&formation!=='column')return drawBiomeColumn(p,false,null,formation,{...appearance?.terrainShape,...p.terrainShape},terrain);
}
function standeeSupports(platform,mover){
 return platform.type==='standee'&&!platform.conditions?.includes('dead')&&
  standeeSizeIndex(platform)-standeeSizeIndex(mover)>=2;
}
function onStandeePlatform(platform,mover,[x,y,z]){
 return standeeSupports(platform,mover)&&z===platform.z+1&&
  x>=platform.x&&x<platform.x+platform.size&&y>=platform.y&&y<platform.y+platform.size;
}
function stairSupportsStandee(p,terrain){
 if(p.type!=='standee'||p.flying)return false;
 const [w,d]=dimensions(p),cx=p.x+w/2,cy=p.y+d/2;
 return terrain.some(q=>{
  if(!q.stairTread||q.form&&!q.curvedStair)return false;
  if(q.curvedStair)return Math.abs(q.z+dimensions(q)[2]-p.z)<1e-7&&pointInPolygon([cx,cy],terrainFootprint(q));
  const [a,b,c]=dimensions(q);
  return q.z+c===p.z&&cx>=q.x&&cx<q.x+a&&cy>=q.y&&cy<q.y+b;
 });
}
function flatCenterSupportsStandee(p,terrain){
 if(p.z===0)return true;
 const [w,d]=dimensions(p),cx=p.x+w/2,cy=p.y+d/2;
 return terrain.some(q=>{
  if(q.curvedStair)return Math.abs(q.z+dimensions(q)[2]-p.z)<1e-7&&pointInPolygon([cx,cy],terrainFootprint(q));
  if(q.form||!['volume','terrace','stone','bridge','crate','pillar','fountain'].includes(q.type))return false;
  const [a,b,c]=dimensions(q);
  return q.z+c===p.z&&cx>=q.x&&cx<q.x+a&&cy>=q.y&&cy<q.y+b;
 });
}
function supported(p,terrain,sceneAreas=areas){
 if(p.type!=='standee'||p.z===0||p.flying)return true;
 const [w,d]=dimensions(p),cx=p.x+w/2,cy=p.y+d/2;
 const ordinarySupport=(x,y)=>terrain.some(q=>{
  if(q.type==='standee')return q!==p&&onStandeePlatform(q,p,[x,y,p.z]);
  if(q.form==='polygon'||q.terrainYaw&&!q.form)return q.z+dimensions(q)[2]===p.z&&terrainFootprint(q).every(([a,b],i,outline)=>{
   const [u,v]=outline[(i+1)%outline.length];
   return (u-a)*(y-b)-(v-b)*(x-a)>=-1e-8;
  });
  if(q.type==='column'||sceneryPiece(q)||q.form)return false;
  const [a,b,c]=dimensions(q);
  return q.z+c===p.z&&x>=q.x&&x<q.x+a&&y>=q.y&&y<q.y+b;
 });
 const samples=Math.ceil(w);
 if(Array.from({length:samples*samples},(_,i)=>ordinarySupport(
  p.x+(i%samples+.5)*w/samples,p.y+(Math.floor(i/samples)+.5)*d/samples
 )).every(Boolean))return true;
 return terrain.some(q=>{
  if(q.type==='standee'||sceneryPiece(q)||q.form)return false;
  if(q.type==='column'){
   const landing=formationLanding(q,terrain,sceneAreas);
   return landing?.z===p.z&&landing.points.every(([x,y],i,points)=>{
    const [nx,ny]=points[(i+1)%points.length];
    return (nx-x)*(cy-y)-(ny-y)*(cx-x)>=-1e-7;
   });
  }
  const [a,b,c]=dimensions(q);
  return q.stairTread&&q.z+c===p.z&&cx>=q.x&&cx<q.x+a&&cy>=q.y&&cy<q.y+b;
 });
}
function resizedStandeePosition(token,position,occupied){
 if(valid(position,occupied,token))return position;
 const offsets=[];
 for(let dx=1-position.size;dx<token.size;dx++)
  for(let dy=1-position.size;dy<token.size;dy++)offsets.push([dx,dy]);
 offsets.sort(([x,y],[a,b])=>x*x+y*y-a*a-b*b);
 for(const [dx,dy] of offsets){
  const candidate={...position,x:position.x+dx,y:position.y+dy};
  if(valid(candidate,occupied,token))return candidate;
 }
 return null;
}
function preservesSupport(next){
 if(!selected||selected.type==='standee')return true;
 const terrain=pieces.filter(p=>p!==selected);
 if(next)terrain.push(next);
 return tokens.every(t=>supported(t,terrain)||!supported(t,pieces))&&
  areas.every(a=>a.shape!=='difficult'||validDifficultTerrain(a,terrain)||!validDifficultTerrain(a,pieces));
}
function wallVolume(p){
 return p.type==='volume'&&!p.stairTread&&!p.groundSurface&&!p.form&&(p.openingCut||dimensions(p)[2]>=1);
}
function canOverlapWall(p,q){
 return wallVolume(p)&&(wallVolume(q)||q.type==='wall');
}
function valid(p,others=[...pieces,...tokens],ignore=selected,sceneAreas=areas,allowFurnitureOverlap=false,gmMovementOverride=false,wallOverlap=false){
 const [w,d,h]=dimensions(p),onStair=stairSupportsStandee(p,others);
 if(p.type==='standee'&&!gmMovementOverride){
  const center=[p.x+w/2,p.y+d/2,p.z];
  if(pathWallSolids(sceneAreas).some(solid=>wallStopsMovement(solid)&&wallPrismInterval(solid,center,center,0,h)))return false;
 }
 const onMap=(p.terrainYaw?terrainFootprint(p):[[p.x,p.y],[p.x+w,p.y+d]]).every(([x,y])=>x>=-1e-8&&y>=-1e-8&&x<=sceneGrid(sceneAreas).width+1e-8&&y<=sceneGrid(sceneAreas).depth+1e-8);
 const source=ignore?.type==='standee'?ignore:carry?.members?.find(t=>t.roomId===p.roomId)||carry?.piece;
 const centerLanding=onStair||p.type==='standee'&&!p.flying&&source?.type==='standee'&&p.z!==source.z&&Math.abs(p.z-source.z)<=1+1e-7&&flatCenterSupportsStandee(p,others);
 return onMap&&p.z>=0&&p.z+h<=maxHeight&&(gmMovementOverride||(centerLanding||supported(p,others,sceneAreas))&&((allowFurnitureOverlap&&isFurniture(p))||others.every(q=>{
  if(p.type==='standee'&&q.type==='standee'&&(q.conditions?.includes('dead')||p.conditions?.includes('dead')))return true;
  if(wallOverlap&&(p.wallOverlap===true&&canOverlapWall(p,q)||q.wallOverlap===true&&canOverlapWall(q,p)))return true;
  if(q===ignore||sceneryPiece(p)||sceneryPiece(q)||p.type==='standee'&&isFurniture(q)&&!movementTerrainBlock(q))return true;
  if(p.type==='standee'&&q.type==='column'&&formationLanding(q,others,sceneAreas)?.z===p.z)return true;
  const [a,b,c]=dimensions(q);
  if(centerLanding&&q.type!=='standee'&&!q.form&&movementTerrainBlock(q)){
   const cx=p.x+w/2,cy=p.y+d/2;
   if(cx<q.x||cx>=q.x+a||cy<q.y||cy>=q.y+b)return true;
  }
  if(p.terrainYaw||q.terrainYaw||p.form==='polygon'||q.form==='polygon')return p.z+h<=q.z||q.z+c<=p.z||!footprintsOverlap(terrainFootprint(p),terrainFootprint(q));
  if(p.type==='standee'&&(p.flying||p.size>=3||carry?.light&&p.roomId===carry.piece.roomId)&&
   movementTerrainBlock(q)&&!q.stairTread&&c<=1&&q.z+c<=p.z+1)return true;
  if(p.type==='standee'&&!q.form&&!q.stairTread&&
   (q.type==='wall'||q.type==='volume'&&c>1&&Math.min(a,b)<=.5)){
   if(p.z+h<=q.z||q.z+c<=p.z)return true;
   const cx=p.x+w/2,cy=p.y+d/2;
   return a<b?p.y+d<=q.y||q.y+b<=p.y||cx<q.x||cx>=q.x+a:
    p.x+w<=q.x||q.x+a<=p.x||cy<q.y||cy>=q.y+b;
  }
  if(p.type==='standee'&&q.stairTread){
   const cx=p.x+w/2,cy=p.y+d/2;
   return cx<q.x||cx>=q.x+a||cy<q.y||cy>=q.y+b||p.z+h<=q.z||q.z+c<=p.z;
  }
  return p.x+w<=q.x||q.x+a<=p.x||p.y+d<=q.y||q.y+b<=p.y||(p.type==='stream'&&q.type==='stream'?p.z!==q.z:p.z+h<=q.z||q.z+c<=p.z);
 })));
}
function activeGridCalibration(){
 const c=floorSceneEditing&&floorGridCalibrationDraft!==undefined?floorGridCalibrationDraft:areas.find(a=>a.shape==='appearance')?.gridCalibration;
 return c&&[c.ox,c.oy,c.xx,c.xy,c.yx,c.yy].every(Number.isFinite)&&Math.abs(c.xx*c.yy-c.xy*c.yx)>.0001?c:null;
}
function gridToWorld(x,y){
 const c=activeGridCalibration();
 return c?[c.ox+c.xx*x+c.yx*y,c.oy+c.xy*x+c.yy*y]:[x,y];
}
function worldToGrid(x,y){
 const c=activeGridCalibration();if(!c)return [x,y];
 const det=c.xx*c.yy-c.xy*c.yx,dx=x-c.ox,dy=y-c.oy;
 return [(dx*c.yy-dy*c.yx)/det,(dy*c.xx-dx*c.xy)/det];
}
function rawPoint(x,y,z){
 x-=gridProjectionCenter(0);y-=gridProjectionCenter(1);
 if(topDown)return [W/2+panX+S*x,H*.55+panY+S*y,z];
 const forward=x*D+y*C;
 return [W/2+panX+S*(x*C-y*D),H*.55+panY+S*(forward*Math.sin(tilt)-z*Math.cos(tilt)),forward*Math.cos(tilt)+z*Math.sin(tilt)];
}
function calibratedVerticalScale(){
 const c=activeGridCalibration();
 return c?Math.hypot(c.xx,c.xy):1;
}
function point(x,y,z){
 [x,y]=gridToWorld(x,y);
 z*=calibratedVerticalScale();
 x-=gridProjectionCenter(0);y-=gridProjectionCenter(1);
 if(topDown)return [W/2+panX+S*x,H*.55+panY+S*y,z];
 const forward=x*D+y*C;
 return [W/2+panX+S*(x*C-y*D),H*.55+panY+S*(forward*Math.sin(tilt)-z*Math.cos(tilt)),forward*Math.cos(tilt)+z*Math.sin(tilt)];
}
function rawInverse(x,y,z){
 if(topDown)return [(x-W/2-panX)/S+gridProjectionCenter(0),(y-H*.55-panY)/S+gridProjectionCenter(1)];
 const a=(x-W/2-panX)/S,b=((y-H*.55-panY)/S+z*Math.cos(tilt))/Math.sin(tilt);
 return [a*C+b*D+gridProjectionCenter(0),-a*D+b*C+gridProjectionCenter(1)];
}
function inverse(x,y,z){return worldToGrid(...rawInverse(x,y,z*calibratedVerticalScale()))}
function measurePaint(kind,work){
 const profile=performanceDraw?.collectPaintBreakdown&&performanceDraw.paintBreakdown;
 if(!profile)return work();
 const entry=profile[kind]??={ms:0,calls:0};
 entry.calls++;
 const parent=performanceDraw.paintScope;
 const scope={nested:0};
 performanceDraw.paintScope=scope;
 const start=performance.now();
 try{return work()}finally{
  const elapsed=performance.now()-start;
  entry.ms+=Math.max(0,elapsed-scope.nested);
  if(parent)parent.nested+=elapsed;
  performanceDraw.paintScope=parent;
 }
}
function polygon(points,fill,stroke){
 if(!performanceDraw?.collectPaintBreakdown)return polygonImpl(points,fill,stroke);
 return measurePaint('fillAndStroke',()=>polygonImpl(points,fill,stroke));
}
function polygonImpl(points,fill,stroke){
 ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
 ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}
let earlyRoomCull=null;
let earlyRoomCullCount=0;
let earlySectorCullCount=0;
let earlyForegroundWallCullCount=0;
// Camera-side geometry is not part of the tactical backdrop. Compare
// projection depth in world space, before constructing any wall faces.
function earlyForegroundWallInvisible(poly){
 if(studioWebGLCapture)return false;
 // Camera cutaway must not depend on the room-topology culler:
 // unknown regions and elevated standees can disable that separate filter.
 const observers=fogPreparedObservers?.observers;
 if(!playerFogEnabled()||gmVisionObserver()||!observers?.length||topDown||!poly?.length)return false;
 // Never trim a wall intersecting the observer's depth plane.
 const observerDepths=observers.map(o=>point(o.distance[0],o.distance[1],0)[2]);
 const wallDepths=poly.map(p=>point(p[0],p[1],0)[2]);
 const nearestObserver=Math.max(...observerDepths);
 // Camera-facing side has greater projected depth. Preserve one grid
 // square of clearance so walls close to the standee do not pop abruptly.
 if(Math.min(...wallDepths)<=nearestObserver+0.25)return false;
 earlyForegroundWallCullCount++;
 return true;
}

function earlySectorInvisible(points){
 const scope=earlyRoomCull;
 if(!scope?.observers?.length||!points?.length)return false;
 // Spatial broad phase: reject only a wholly dark, ground-level sector
 // beyond every observer's darkvision and every light's reach.
 const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
 const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
 const minDistSq=p=>{
  const dx=Math.max(minX-p[0],0,p[0]-maxX),dy=Math.max(minY-p[1],0,p[1]-maxY);
  return dx*dx+dy*dy;
 };
 if(scope.observers.some(o=>minDistSq(o.distance)<=(o.range+1)*(o.range+1)))return false;
 if(scope.lights.some(l=>minDistSq(l.center)<=(l.radius+1)*(l.radius+1)))return false;
 // Ambient or unclassified light must never be spatially culled.
 if(!scope.dark||!points.every(p=>roomIsDark([p[0],p[1],0]))||
    !roomIsDark([(minX+maxX)/2,(minY+maxY)/2,0]))return false;
 earlySectorCullCount++;
 return true;
}
function earlyRoomDisconnected(points){
 if(!earlyRoomCull?.eligible||!points?.length)return false;
 // Do not exclude geometry spanning a region boundary. Include center
 // so broad polygons cannot be classified by their corners alone.
 const center=[points.reduce((n,p)=>n+p[0],0)/points.length,points.reduce((n,p)=>n+p[1],0)/points.length];
 const ids=new Set([...points,center].map(v=>earlyRoomCull.regionAt(v)));
 return ids.size===1&&!ids.has(null)&&!earlyRoomCull.eligible.has(ids.values().next().value);
}
function portalWithinVisibilityRange(observer,portal){
 const range=portal.kind==='Window'?2:12; // Grid cells are 5 feet.
 return Math.hypot(observer.distance[0]-portal.center[0],observer.distance[1]-portal.center[1])<=range;
}
function nearbyObserverRooms(topology,prepared){
 if(!topology?.regionAt||!prepared?.observers?.length||prepared.preview||
    prepared.observers.some(o=>Math.abs(o.distance[2])>.15))return null;
 const eligible=new Set();
 for(const observer of prepared.observers){
  const own=topology.regionAt(observer.distance);
  if(own===null||own===undefined)return null;
  eligible.add(own);
  for(const portal of topology.portals||[]){
   const [a,b]=portal.regions||[];
   if(a!==own&&b!==own)continue;
   if(!(portal.kind==='Window'?!portal.shaded:portal.open))continue;
   if(!portalWithinVisibilityRange(observer,portal))continue;
   if(a!==null&&a!==undefined)eligible.add(a);
   if(b!==null&&b!==undefined)eligible.add(b);
  }
 }
 const lights=(lightingFrame?.lights??activeLights()).map(l=>({
  center:lightRangeCenter(l),radius:Number(l.radius)/5
 }));
 // If ambient is enabled, sector darkness is not guaranteed.
 const dark=areas.some(a=>a.shape==='appearance'&&a.appearance?.fogOfWar===true)&&
  lights.every(l=>Number.isFinite(l.radius)&&l.radius>=0);
 return {regionAt:topology.regionAt,eligible,observers:prepared.observers,lights,dark};
}
function face(points,fill,p,z,preview){
 points=turnTerrainPoints(points,p);
 const projected=points.map(v=>point(...v));
 faces.push({projected,world:points,fill,p,z,preview,depth:projected.reduce((a,v)=>a+v[2],0)/projected.length});
}
function top(x,y,z,fill,p,preview){face([[x,y,z],[x+1,y,z],[x+1,y+1,z],[x,y+1,z]],fill,p,z,preview)}
function texture(fill,material,isTop){
 const key=fill+material+isTop;
 if(textures.has(key))return textures.get(key);
 const tile=document.createElement('canvas');tile.width=192;tile.height=192;
 const g=tile.getContext('2d'),n=192;
 let seed=67;
 function rand(){seed=(seed*16807)%2147483647;return seed/2147483647}
 function line(points,ink,width=1){
  g.beginPath();
  points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));
  g.strokeStyle=ink;g.lineWidth=width;g.stroke();
 }
 const water=material.startsWith('flow')||material==='fountain-pool';
 const wood=material==='bridge'||material==='crate';
 const grass=material==='terrace'&&isTop;
 g.fillStyle=water?'#c5cbc0':isTop?'#e7d8b7':'#c9b694';g.fillRect(0,0,n,n);
 for(let i=0;i<(isTop?240:570);i++){
  g.fillStyle=i%3?'#493a2829':'#493a2859';
  g.fillRect(rand()*n,rand()*n,.6+rand()*2,.6+rand()*1.4);
 }
 if(material==='fountain-pool'){
  for(const [r,color] of [[86,'#463828'],[82,'#e3d3b3'],[70,'#625443'],[67,'#b9c4ba']]){
   g.beginPath();g.arc(96,96,r,0,2*Math.PI);g.fillStyle=color;g.fill();
  }
  for(let r=12;r<64;r+=12){
   g.beginPath();g.arc(96,96,r,r*.07,r*.07+4.8);g.strokeStyle='#40565a';g.lineWidth=1.3;g.stroke();
  }
 }else if(water){
  if(material==='flow-x'){g.translate(n,0);g.rotate(Math.PI/2)}
  for(let i=0;i<49;i++){
   const x=rand()*n,y=rand()*n,length=7+rand()*(material==='flow-fall'?84:30);
   line([[x,y],[x+(rand()-.5)*4,y+length*.55],[x,y+length]],i%4?'#3f555c85':'#f6f0db',.7+rand()*1.4);
  }
 }else if(wood){
  for(let y=11;y<n;y+=44){
   line([[0,y],[59,y+1],[120,y-1],[n,y]],'#483526',2.2);
   for(let i=0;i<10;i++){
    const x=rand()*n,j=y+4+rand()*33;
    line([[x,j],[x+16,j+rand()*3],[x+39,j]],'#59432d73',.8);
   }
  }
 }else if(grass){
  for(let i=0;i<38;i++){
   const x=rand()*n,y=rand()*n,h=2+rand()*7;
   line([[x-h*.65,y-h*.65],[x,y],[x+h*.35,y-h]],'#504633a8',.95);
  }
 }else{
  const rows=isTop?[54,132]:[32,93,151];
  for(const y of rows){
   line([[0,y],[37,y+2],[90,y-2],[148,y+1],[n,y]],'#4e3e2caa',1.45);
   for(let i=0;i<19;i++){
    const x=rand()*n, h=3+rand()*(isTop?7:14);
    line([[x,y+2],[x-h*.75,y+h]],'#473a2a76',1.15);
   }
  }
  const seams=[78,133,48,109];
  for(let i=0;i<=rows.length;i++){
   const x=seams[i],y=rows[i-1]||0,end=rows[i]||n;
   line([[x,y],[x+2,(y+end)/2],[x-2,end]],'#4e3e2c9e',1.4);
  }
 }
 textures.set(key,tile);return tile;
}
function mapImage(image,quad){
 if(!performanceDraw?.collectPaintBreakdown)return mapImageImpl(image,quad);
 return measurePaint('imageMapping',()=>mapImageImpl(image,quad));
}
function mapImageImpl(image,quad){
 const [a,b,,d]=quad;
 ctx.save();
 ctx.transform(b[0]-a[0],b[1]-a[1],d[0]-a[0],d[1]-a[1],a[0],a[1]);
 ctx.drawImage(image,0,0,1,1);
 ctx.restore();
}
function getArt(src,preload=false){
 if(!artCache.has(src)){
  const image=new Image();
  if(!preload)image.onload=draw;
  image.src=src;artCache.set(src,image);
 }
 const image=artCache.get(src);
 if(!preload&&!image.complete&&!image.onload)image.onload=draw;
 return image;
}
const standeeConditions={"red":"●","prone":"↘","grappled":"✊","restrained":"⛓","stunned":"✦","paralyzed":"Ⅱ","petrified":"⬢","incapacitated":"⊘","poisoned":"☠","blinded":"◉","deafened":"◖","invisible":"◌","obscured":"◐","exhaustion":"⇣","unconscious":"☾","dead":"×","concentrating":"✧","charmed":"♡","frightened":"!","violet":"●","blue":"●","green":"●","yellow":"●"};
const conditionColors={red:'#9868cc',violet:'#9868cc',blue:'#4d88ce',green:'#63a35b',yellow:'#d9ac39'};
function markerScale(width){return Math.max(.4,Math.min(2.5,width/52))}
let hoveredStandee=null,focusedTitle=null,focusedTitleFade=null,focusedTitleFrame=null;
const focusTitleFadeMs=400;
function fadeFocusedTitle(){
 if(!focusedTitle||focusedTitleFade!==null)return;
 focusedTitleFade=performance.now();
 function tick(now){
  if(focusedTitleFade===null){focusedTitleFrame=null;return}
  if(now-focusedTitleFade>=focusTitleFadeMs){focusedTitle=null;focusedTitleFade=null;focusedTitleFrame=null}
  else focusedTitleFrame=requestAnimationFrame(tick);
  drawStandeeNames();
 }
 if(focusedTitleFrame===null)focusedTitleFrame=requestAnimationFrame(tick);
}
for(const type of ['pointerdown','wheel','keydown','click'])window.addEventListener(type,event=>{
 if(type==='keydown'&&(event.repeat||['Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(event.code)))return;
 if(type==='click'&&event.detail&&event.target===canvas)return;
 fadeFocusedTitle();
},true);
function hasFocusedTitle(p){return !!focusedTitle&&(p===focusedTitle||p===ghost&&carry?.piece===focusedTitle)}

function standeeObscured(p){return roomProfile?.gm===false&&p.conditions?.includes('obscured')}
function standeeName(p,allowFocus=true){
 if(standeeObscured(p))return '';
 const rule=p.nameVisibility||preferences.standeeNameDefault;
 if(rule===5||playing&&(rule===2||rule===4))return '';
 if((rule===3||rule===4)&&!(allowFocus&&hasFocusedTitle(p))&&hoveredStandee!==p&&!(p===ghost&&hoveredStandee===carry?.piece))return '';
 return p.playerDisplayName||p.displayName||p.name||'';
}
function baseStandeeRole(token){
 return token.baseRole||token.role||(token.name==='Adventurer'&&token.icon==='⚔'&&!token.src?'pc':'enemy');
}
function standeeRole(token){const role=baseStandeeRole(token);return role==='enemy'&&token.controllerNames?.length?'ally':role}
function canSeeStandeeStats(token){
 if(roomProfile?.gm===false&&!ownsRoomStandee(token)&&token.hideOtherHp)return false;
 if(roomProfile?.gm===false&&ownsRoomStandee(token))return !token.incognito;
 return !standeeObscured(token)&&(!playing||standeeRole(token)!=='enemy');
}
function standeeStatRows(token){
 if(!canSeeStandeeStats(token))return [];
 const rows=[];
 if(hudDisplays(token,'hp')&&(token.hp!=null||token.maxHp!=null))rows.push({text:'HP '+(token.hp??'—')+(token.maxHp!=null?'/'+token.maxHp:''),value:token.hp,color:'#52934f'});
 if(hudDisplays(token,'tempHp')&&token.tempHp!=null)rows.push({text:'Temp HP '+token.tempHp,value:token.tempHp,color:'#ab4d49'});
 const other=[hudDisplays(token,'saveDc')&&token.saveDc!=null?'DC '+token.saveDc:'',hudDisplays(token,'ac')&&token.ac!=null?'AC '+token.ac:''].filter(Boolean).join(' · ');
 if(other)rows.push({text:other});
 return rows;
}
const readoutCards=new Map(),dismissedMoveReadouts=new Set();
let dismissedReadoutScene=null;
function moveReadoutKey(token){
 if(token&&token===ghost&&carry?.piece)token=carry.piece;
 return token?.roomId||token?.trackingId||token;
}
function currentMoveReadouts(){
 if(dismissedReadoutScene!==currentSceneId){
  dismissedMoveReadouts.clear();
  dismissedReadoutScene=currentSceneId;
 }
 return dismissedMoveReadouts;
}
function dismissMovedReadouts(members){
 const keys=new Set(members.map(moveReadoutKey));
 const dismissed=currentMoveReadouts();
 for(const key of keys)dismissed.add(key);
 for(const [token,card] of readoutCards)if(keys.has(moveReadoutKey(token)))card.label.hidden=true;
 if(tallyStandee&&keys.has(moveReadoutKey(tallyStandee))){
  tallyStandee=null;el('standeeTally').hidden=true;
 }
 return keys;
}
function drawStandeeNames(cameraOffset=zoomTransformActive?zoomOffset:[0,0],cameraScale=zoomTransformActive?zoom/paintedCamera.zoom:1){
 const overlay=el('standeeReadoutOverlay'),active=new Set(),bounds=[];
 if(!W||!H)return bounds;
 const scale=preferences.standeeReadoutSize/100,dpr=devicePixelRatio||1;
 const dismissed=currentMoveReadouts();
 const previewKeys=carry&&!moveConfirmPending?new Set(carriedMembers().map(moveReadoutKey)):null;
 for(const f of faces){
  const token=f.p;
  if(!f.standee||dimensionDoorHidden.has(token.roomId)||carry?.arcaneEye&&token===ghost)continue;
  const key=moveReadoutKey(token);
  if(dismissed.has(key)&&!previewKeys?.has(key)&&preferencePreview?.target!==token)continue;
  const name=standeeName(token)||(preferencePreview?.target===token?(token.displayName||token.name||'Standee'):'');
  if(!name)continue;
  const [left,right,base]=f.projected;
  const anchorX=(left[0]+right[0])/2*cameraScale+cameraOffset[0];
  const anchorY=(base[1]+(f.flat?0:f.baseWidth*.22))*cameraScale+cameraOffset[1]+6;
  const rows=standeeStatRows(token);
  const vision=roomProfile?.gm!==false||ownsRoomStandee(token)?standeeVision(token):null;
  const signature=JSON.stringify([name,rows,vision,token.maxHp,scale,dpr]);
  active.add(token);
  let card=readoutCards.get(token);
  if(!card){
   const label=document.createElement('canvas');
   label.style.cssText='position:absolute;left:0;top:0;border:0;background:transparent';
   card={label};readoutCards.set(token,card);overlay.append(label);
  }
  card.label.hidden=false;
  if(card.signature!==signature){
   paintStandeeReadout(card,name,rows,vision,token.maxHp,scale,dpr);
   card.signature=signature;
  }
  const x=anchorX-card.width/2;
  // Align cached labels to device pixels without scaling their text.
  const position='translate('+Math.round(x*dpr)/dpr+'px,'+Math.round(anchorY*dpr)/dpr+'px)';
  if(card.label.style.transform!==position)card.label.style.transform=position;
  card.label.style.opacity=hasFocusedTitle(token)&&focusedTitleFade!==null&&!standeeName(token,false)?
   Math.max(0,1-(performance.now()-focusedTitleFade)/focusTitleFadeMs):1;
  bounds.push([x,anchorY,x+card.width,anchorY+card.height]);
 }
 for(const [token,card] of readoutCards)if(!active.has(token)){
  card.label.remove();readoutCards.delete(token);
 }
 return bounds;
}
function paintStandeeReadout(card,name,rows,vision,maxHp,scale,dpr){
 const {label}=card,ctx=label.getContext('2d');
 ctx.font='600 12px system-ui';
 const nameWidth=ctx.measureText(name).width+(vision?18:0);
 ctx.font='11px system-ui';
 const width=Math.min(240,Math.max(nameWidth,rows.length?94:0,...rows.map(row=>ctx.measureText(row.text).width))+12);
 const height=17+rows.length*15;
 card.width=width*scale;card.height=height*scale;
 label.width=Math.max(1,Math.round(card.width*dpr));label.height=Math.max(1,Math.round(card.height*dpr));
 label.style.width=card.width+'px';label.style.height=card.height+'px';
 ctx.setTransform(label.width/width,0,0,label.height/height,0,0);
 ctx.textAlign='center';ctx.textBaseline='middle';
 const center=width/2;
 ctx.fillStyle='#30261de8';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#fff0cf';ctx.font='600 12px system-ui';ctx.fillText(name,center-(vision?8:0),8,width-(vision?26:8));
 if(vision){
  const badge={regular:'◉',dark:'☾',blind:'⊘'}[vision];
  ctx.fillStyle=vision==='dark'?'#c9adff':vision==='blind'?'#ffaba3':'#fff0cf';
  ctx.fillText(badge,center+Math.min(nameWidth,width-8)/2-4,8);
 }
 ctx.font='600 10px system-ui';
 rows.forEach((row,i)=>{
  const top=17+i*15,w=width-8;
  if(row.color){
   ctx.fillStyle='#443b32';ctx.fillRect(4,top,w,13);
   const ratio=maxHp>0&&row.value!=null?Math.max(0,Math.min(1,row.value/maxHp)):0;
   ctx.fillStyle=row.color;ctx.fillRect(4,top,w*ratio,13);
  }
  ctx.fillStyle='#fff2d9';ctx.fillText(row.text,center,top+6.5,w-4);
 });
}
const squadBadges={
 '1':{icon:'◆',color:'#16857e'},'2':{icon:'▲',color:'#bd652c'},'3':{icon:'■',color:'#46505b'},
 '4':{icon:'⬟',color:'#f2e5ca',ink:'#463522'},'5':{icon:'⬢',color:'#765039'}
};
function standeeBloodLevel(p){const hp=Number(p.hp),max=Number(p.maxHp);if(p.hp==null||p.maxHp==null||!Number.isFinite(hp)||!Number.isFinite(max)||max<=0||hp<=0)return 0;return hp/max<=.1?3:hp/max<=.25?2:hp/max<=.5?1:0}
const statusMarks=[];
let pinnedStatus=null;
function statusAt(e){
 const [x,y]=coords(e);
 return statusMarks.findLast(mark=>Math.hypot(x-mark.x,y-mark.y)<=mark.radius);
}
function statusTooltip(mark){
 const tip=el('standeeStatusTooltip');
 tip.hidden=!mark;
 if(!mark)return;
 const bounds=canvas.getBoundingClientRect();
 tip.textContent=mark.label;
 tip.style.left=Math.max(4,Math.min(innerWidth-tip.offsetWidth-4,bounds.left+mark.x-tip.offsetWidth/2))+'px';
 tip.style.top=Math.max(4,bounds.top+mark.y-mark.radius-tip.offsetHeight-4)+'px';
}
function drawStandeeMarks(source=faces,reset=true){
 if(reset)statusMarks.length=0;
 for(const f of source){
  if(!f.standee||f.dead||dimensionDoorHidden.has(f.p.roomId)||standeeObscured(f.p))continue;
  const p=f.p,marks=Array.isArray(p.conditions)?p.conditions:[];
  const original=f.preview&&carry?carriedMembers().find(member=>member===carry.piece?ghost===p:member.roomId&&member.roomId===p.roomId||member.trackingId&&member.trackingId===p.trackingId):null;
  const links=targetMarkers(original??p),squad=squadBadges[p.squad];
  const blood=standeeBloodLevel(p);
  const manual=(p.manualTarget||isPendingAreaTarget(original??p))&&!p.incognito&&!p.conditions?.includes('invisible');
  if(!manual&&!links.length&&!marks.length&&!squad&&!blood&&!p.torch)continue;
  const [left,right]=f.projected,center=(left[0]+right[0])/2;
  const scale=markerScale(f.baseWidth),y=(f.artTop??left[1])-10*scale;
  const icons=[...(manual?[{color:'#d83336',bullseye:true}]:[]),...links,...marks.map(id=>({id,icon:standeeConditions[id],color:conditionColors[id]})),...(squad?[{...squad,squad:true}]:[]),...(blood?[{icon:'♦'.repeat(blood),color:'#9e171b',blood:true}]:[]),...(p.torch?[{torch:true}]:[])];
  ctx.save();
  icons.forEach(({id,icon,color,bullseye,mutual,squad,ink,blood,torch},i)=>{
   const x=center+(i-(icons.length-1)/2)*17*scale;
   if(id&&(icon||color))statusMarks.push({x,y,radius:7*scale,token:p,id,
    label:({exhaustion:'Exhausted',red:'Red marker',violet:'Violet marker'})[id]??id[0].toUpperCase()+id.slice(1)});
   if(torch){
    ctx.save();
    ctx.translate(x,y);ctx.scale(scale,scale);
    const glow=ctx.createRadialGradient(0,-3,0,0,-3,11);
    glow.addColorStop(0,'#fff7dcbb');
    glow.addColorStop(.42,'#ffad5777');
    glow.addColorStop(1,'#ff772800');
    ctx.fillStyle=glow;ctx.fillRect(-11,-14,22,22);
    ctx.strokeStyle='#694328';ctx.lineWidth=2.5;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-2,6);ctx.lineTo(0,-1);ctx.stroke();
    ctx.fillStyle='#ff9a45';
    ctx.beginPath();ctx.moveTo(1,-9);ctx.quadraticCurveTo(8,1,1,2);
    ctx.quadraticCurveTo(-6,1,1,-9);ctx.fill();
    ctx.fillStyle='#fff8e2';
    ctx.beginPath();ctx.ellipse(1,-2,1.6,2.8,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    return;
   }
   ctx.beginPath();ctx.ellipse(x,y,(blood?7+5*(standeeBloodLevel(p)-1):6.5)*scale,6.5*scale,0,0,Math.PI*2);
   ctx.fillStyle=color||'#f3e2b8';ctx.fill();ctx.strokeStyle='#382c20';ctx.lineWidth=scale;ctx.stroke();
   if(bullseye){
    ctx.beginPath();ctx.arc(x,y,4*scale,0,Math.PI*2);ctx.strokeStyle='#fff1d9';ctx.lineWidth=1.35*scale;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,1.45*scale,0,Math.PI*2);ctx.fillStyle='#fff1d9';ctx.fill();
   }
   if(mutual){
    ctx.font='bold '+(11*scale)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.strokeStyle='#382c20';ctx.lineWidth=2*scale;ctx.strokeText('↔',x,y);
    ctx.fillStyle='#fff1d9';ctx.fillText('↔',x,y);
   }
   if(blood){
    const count=standeeBloodLevel(p),step=8*scale;
    for(let n=0;n<count;n++){
     const dx=x+(n-(count-1)/2)*step;
     ctx.beginPath();ctx.moveTo(dx,y-4.8*scale);
     ctx.bezierCurveTo(dx-2*scale,y-1*scale,dx-3.3*scale,y+.7*scale,dx-3.3*scale,y+2*scale);
     ctx.arc(dx,y+2*scale,3.3*scale,Math.PI,0,true);
     ctx.bezierCurveTo(dx+3.3*scale,y+.7*scale,dx+2*scale,y-1*scale,dx,y-4.8*scale);
     ctx.fillStyle='#e31e2b';ctx.fill();ctx.strokeStyle='#4d050b';ctx.lineWidth=.8*scale;ctx.stroke();
    }
   }
   if((!color||squad)&&icon){ctx.font=(11*scale)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=ink||(squad?'#fff1d9':'#33261c');ctx.fillText(icon,x,y)}
  });
  ctx.restore();
 }
}
const bloodArt=new WeakMap();
function bloodTintedArt(image,level){
 if(!level)return image;
 let cache=bloodArt.get(image);if(!cache){cache=new Map();bloodArt.set(image,cache)}
 if(cache.has(level))return cache.get(level);
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width||1;canvas.height=image.naturalHeight||image.height||1;
 const g=canvas.getContext('2d');g.drawImage(image,0,0);g.globalCompositeOperation='source-atop';
 g.fillStyle=['','rgba(190,22,28,.17)','rgba(170,9,19,.32)','rgba(135,0,10,.47)'][level];g.fillRect(0,0,canvas.width,canvas.height);
 cache.set(level,canvas);return canvas;
}
const tintedArt=new WeakMap();
const silhouetteArt=new WeakMap();
function tintedStandeeArt(image,obscured=false){
 const cache=obscured?silhouetteArt:tintedArt;
 if(cache.has(image))return cache.get(image);
 const layer=document.createElement('canvas');
 const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
 const ratio=Math.min(1,768/Math.max(width,height));
 layer.width=Math.max(1,Math.round(width*ratio));
 layer.height=Math.max(1,Math.round(height*ratio));
 const paint=layer.getContext('2d');
 paint.drawImage(image,0,0,layer.width,layer.height);
 paint.globalCompositeOperation='source-atop';
 paint.fillStyle=obscured?'#080808':'#dc322d80';paint.fillRect(0,0,layer.width,layer.height);
 cache.set(image,layer);return layer;
}
function effectiveArea(area){
 const caster=area.anchorId&&tokens.find(t=>t.trackingId===area.anchorId);
 return caster&&area.anchorOffset?{...area,origin:basePoint(caster).map((v,i)=>v+area.anchorOffset[i])}:area;
}
function areaCoversStandee(area,p){
 area=effectiveArea(area);
 if(!Object.hasOwn(areaSizes,area.shape)||area.shape==='difficult')return false;
 const {shape,size,origin,angle}=area;
 const volume=['sphere','cube','cone3d'].includes(shape);
 if(!volume&&Math.abs(p.z-origin[2])>1e-6)return false;
 const reach=shape==='sphere'?size:shape==='cube'?size*1.25:size*1.5+.5;
 if(origin[0]+reach<p.x||origin[0]-reach>p.x+p.size||
    origin[1]+reach<p.y||origin[1]-reach>p.y+p.size||
    (volume&&(origin[2]+reach<p.z||origin[2]-reach>p.z+p.size)))return false;
 const c=Math.cos(angle),d=Math.sin(angle),pitch=(area.pitch||0)*Math.PI/180;
 const cp=Math.cos(pitch),sp=Math.sin(pitch);
 function contains(x,y,z){
  const dx=x-origin[0],dy=y-origin[1],w=z-origin[2];
  const u=dx*c+dy*d,v=-dx*d+dy*c;
  switch(shape){
   case 'circle':return u*u+v*v<=size*size;
   case 'square':return Math.abs(u)<=size/2&&Math.abs(v)<=size/2;
   case 'line':return u>=0&&u<=size&&Math.abs(v)<=.5;
   case 'cone':return u>=0&&u<=size&&Math.abs(v)<=u/2;
   case 'sphere':return u*u+v*v+w*w<=size*size;
   case 'cube':return Math.abs(u)<=size/2&&Math.abs(v)<=size/2&&w>=0&&w<=size;
   case 'cone3d':{
    const forward=u*cp+w*sp,vertical=-u*sp+w*cp;
    return forward>=0&&forward<=size&&v*v+vertical*vertical<=forward*forward/4;
   }
  }
  return false;
 }
 const steps=12,layers=volume?steps:1,half=steps*steps*layers/2,step=p.size/steps;
 let inside=0,outside=0;
 for(let i=0;i<steps;i++)for(let j=0;j<steps;j++)for(let k=0;k<layers;k++){
  if(contains(p.x+(i+.5)*step,p.y+(j+.5)*step,p.z+(k+.5)*step)){
   if(++inside>half)return true;
  }else if(++outside>=half)return false;
 }
 return false;
}
function visibleStandeeAura(token){
 if(!token.aura||standeeHidden(token)||playerFogEnabled()&&!ownsRoomStandee(token)&&!studioWebGLOverlayTokens?.has(token)&&!fogPointVisible(basePoint(token)))return null;
 const origin=basePoint(token);
 origin[2]+=.5;
 return {shape:'sphere',size:token.aura.radius/5,origin,angle:0,auraColor:token.aura.color};
}
function standeeIsTargeted(p){
 return areas.some(area=>areaCoversStandee(area===editingArea?editedAreaPreview():area,p))||
  Boolean(areaPreview&&areaCoversStandee(areaPreview,p))||
  tokens.some(token=>{
   if(token===p||!token.aura||movementSide(token)===movementSide(p))return false;
   const aura=visibleStandeeAura(token);
   return aura!==null&&areaCoversStandee(aura,p);
  });
}
function shadowLevel(p){
 const cx=p.x+p.size/2,cy=p.y+p.size/2;
 let height=0;
 for(const q of pieces){
  const [w,d,h]=dimensions(q),top=q.z+h;
  if(top<=p.z&&top>height&&cx>=q.x&&cx<q.x+w&&cy>=q.y&&cy<q.y+d)height=top;
 }
 return height;
}
function standeeShadow(p,preview){
 if(!p.flying||p.z<=0)return;
 const level=shadowLevel(p);
 if(level>=p.z)return;
 const [cx,cy]=basePoint(p),radius=p.size*.44*standeeScale(p);
 const projected=Array.from({length:28},(_,i)=>{
  const a=i*Math.PI/14;
  return point(cx+radius*Math.cos(a),cy+radius*Math.sin(a),level);
 });
 if(visibleProjection(projected))faces.push({p,shadow:true,shadowLevel:level,projected,z:null,preview,depth:Math.max(...projected.map(v=>v[2]))+.03});
}
// Hold E to inspect elevated walking surfaces in either camera projection.
// This is a local, read-only overlay; it never changes scene geometry.
let elevationKeyHeld=false;
function drawFloorElevationLabels(visibilityChecked=false){
 if(!elevationKeyHeld)return;
 const best=new Map();
 for(const surface of faces){
  if(!surface.p||surface.preview||surface.standee||surface.shadow||surface.rememberedFog||surface.perimeterOnly||
     !Number.isFinite(surface.z)||surface.z<=.001||!surface.world?.length||
     surface.world.some(v=>Math.abs(v[2]-surface.z)>.001))continue;
  // Only walking surfaces are elevations. Wall, pillar and prop tops
  // are structural geometry, not floors (even when viewed top-down).
  if(!['terrace','stone','bridge'].includes(surface.p.type)&&
     surface.p.type!=='volume')continue;
  const projected=surface.projected;
  if(!projected?.length||!visibleProjection(projected,25))continue;
  const cx=surface.world.reduce((sum,v)=>sum+v[0],0)/surface.world.length;
  const cy=surface.world.reduce((sum,v)=>sum+v[1],0)/surface.world.length;
  if(!visibilityChecked&&roomProfile?.gm===false&&playerFogEnabled()&&!fogPointVisible([cx,cy,surface.z],false))continue;
  const area=Math.abs(projected.reduce((sum,p,i)=>{const q=projected[(i+1)%projected.length];return sum+p[0]*q[1]-q[0]*p[1]},0));
  const prior=best.get(surface.p);
  if(!prior||area>prior.area)best.set(surface.p,{surface,area});
 }
 // One label for a connected run of wall blocks, even when the wall is
 // built from dozens of adjoining volumes. Separate platforms retain labels.
 const entries=[...best.values()],parent=entries.map((_,i)=>i);
 const root=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i};
 const wallLike=p=>p.type==='volume'&&!p.stairTread&&dimensions(p)[2]>=1;
 for(let i=0;i<entries.length;i++){
  const a=entries[i].surface.p;
  if(!wallLike(a))continue;
  const da=dimensions(a);
  for(let j=i+1;j<entries.length;j++){
   const b=entries[j].surface.p;
   if(!wallLike(b)||Math.abs(entries[i].surface.z-entries[j].surface.z)>.01)continue;
   const db=dimensions(b),touchX=a.x<=b.x+db[0]+.01&&b.x<=a.x+da[0]+.01,
    touchY=a.y<=b.y+db[1]+.01&&b.y<=a.y+da[1]+.01;
   if(touchX&&touchY)parent[root(j)]=root(i);
  }
 }
 const representatives=new Map();
 for(let i=0;i<entries.length;i++){
  const key=root(i),old=representatives.get(key);
  if(!old||entries[i].area>old.area)representatives.set(key,entries[i]);
 }
 ctx.save();ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 for(const {surface} of representatives.values()){
  const [x,y]=surface.projected.reduce((sum,p)=>[sum[0]+p[0]/surface.projected.length,sum[1]+p[1]/surface.projected.length],[0,0]);
  if(x<0||x>W||y<0||y>H)continue;
  const height=Math.round(surface.z*50)/10;
  const label='+'+height+' ft',width=ctx.measureText(label).width+12;
  // Same compact format as the flying standee shadow readout, with
  // an opaque contrasting plate so it remains legible over floor art.
  ctx.fillStyle='#17232b';ctx.fillRect(x-width/2,y-9,width,18);
  ctx.strokeStyle='#fff3d9';ctx.lineWidth=1;ctx.strokeRect(x-width/2+.5,y-8.5,width-1,17);
  ctx.fillStyle='#fff3d9';ctx.fillText(label,x,y);
 }
 ctx.restore();
}
function paintStandeeShadow(face){
 polygon(face.projected,'#33281f54','#33281f45');
 if(standeeObscured(face.p))return;
 const [cx,cy]=basePoint(face.p),[x,y]=point(cx,cy,face.shadowLevel);
 const elevation=Math.round(face.p.z*50)/10;
 ctx.save();
 ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 const width=ctx.measureText('+'+elevation+' ft').width+10;
 ctx.fillStyle='#24201a';ctx.fillRect(x-width/2,y-8,width,16);
 ctx.fillStyle='#fff3d9';ctx.fillText('+'+elevation+' ft',x,y);
 ctx.restore();
}
const standeeSizes=[
 {id:'tiny',name:'Tiny',footprint:1,scale:.46},
 {id:'small',name:'Small',footprint:1,scale:.73},
 {id:'medium',name:'Medium',footprint:1,scale:1},
 {id:'large',name:'Large',footprint:2,scale:1},
 {id:'huge',name:'Huge',footprint:3,scale:1}
];
function standeeSizeIndex(p){
 const i=standeeSizes.findIndex(size=>size.id===p.sizeCategory&&size.footprint===p.size);
 return i>=0?i:Math.max(2,Math.min(4,(p.size||1)+1));
}
function standeeScale(p){return standeeSizes[standeeSizeIndex(p)].scale}
function standeeGridPixelSize(){
 // The calibration changes the physical size of a 5-foot VTT cell.
 // Sprite artwork must follow that same scale, not the uncalibrated S.
 const c=activeGridCalibration();
 return S*(c?Math.hypot(c.xx,c.xy):1);
}
function standeeArtHeight(p){return p.conditions?.includes('dead')?0:standeeGridPixelSize()*p.size*(p.size>1?1.4:1.25)*standeeScale(p)}
const defaultFacingHeading=Math.PI/2+.64;
function facingForHeading(heading){return (Math.round((defaultFacingHeading-heading)*180/Math.PI)%360+360)%360}
function faceHeading(token,heading){token.facing=facingForHeading(heading)}
function trackedTarget(actor){
 return actor.targetRoomId?tokens.find(t=>t.roomId===actor.targetRoomId):actor.targetId&&tokens.find(t=>t.trackingId===actor.targetId);
}
function trackingFacing(actor){
 const target=trackedTarget(actor);
 if(!target||target.incognito||target.conditions?.includes('invisible')||standeeHidden(target)||target.conditions?.includes('dead')||actor.conditions?.includes('dead'))return actor.facing;
 const [x,y]=basePoint(actor),[tx,ty]=basePoint(carry?.piece===target&&ghost?ghost:target);
 return tx===x&&ty===y?actor.facing:facingForHeading(Math.atan2(ty-y,tx-x));
}
function targetMarkers(token){
 const links=[];
 tokens.forEach((actor,i)=>{
  if(standeeHidden(actor)||actor.conditions?.includes('dead'))return;
  const target=trackedTarget(actor);
  if(!target||target===actor||standeeHidden(target)||target.conditions?.includes('dead'))return;
  if(actor===token||target===token){
   links.push({bullseye:target===token,color:'hsl('+((i*137.508+12)%360)+' 58% 43%)'});
  }
 });
 return links;
}
function hasTrackedTargetMark(token){
 return targetMarkers(token).length>0;
}
function faceTarget(target){
 const actor=activeInitiative===null?null:linkedStandee(activeInitiative);
 if(!actor||actor===target)return;
 const [x,y]=basePoint(actor),[tx,ty]=basePoint(target);
 if(tx!==x||ty!==y)faceHeading(actor,Math.atan2(ty-y,tx-x));
}
function drawFacingArrow(f){
 if(f.facing===undefined||standeeObscured(f.p))return;
 const heading=defaultFacingHeading-f.facing*Math.PI/180;
 const [x,y,z]=basePoint(f.p),length=f.p.size*.72;
 const [cx,cy]=point(x,y,z),[tx,ty]=point(x+Math.cos(heading)*length,y+Math.sin(heading)*length,z);
 const a=Math.atan2(ty-cy,tx-cx),ux=Math.cos(a),uy=Math.sin(a),tip=6;
 ctx.save();ctx.strokeStyle='#3e3022';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty);ctx.stroke();
 polygon([[tx,ty],[tx-tip*ux+4*uy,ty-tip*uy-4*ux],[tx-tip*ux-4*uy,ty-tip*uy+4*ux]],'#f6df9a','#3e3022');
 ctx.restore();
}
function standeeViewAngle(p){return angle+.64-(p.facing??0)*Math.PI/180}
function standeeVisibleToObserver(token,blockers=visionBlockers()){
 const preview=gmVisionObserver();
 const [x,y,z]=basePoint(token);
 const dead=token.conditions?.includes('dead');
 const width=token.size*.3;
 const samples=dead?[[x,y,z+.08]]:[
  [x,y,z+.65],[x,y,z+.95],[x,y,z+.08],
  [x-width,y,z+.65],[x+width,y,z+.65],[x,y-width,z+.65],[x,y+width,z+.65]
 ];
 const observers=(preview?[preview]:visionObservers(tokens)).filter(observer=>
  (preview||ownsRoomStandee(observer)&&!observer.incognito)&&
  !observer.conditions?.includes('dead')&&(!observer.conditions?.includes('blinded')||observer.blindsight>0));
 return samples.some(target=>observers.some(observer=>{
  const eye=basePoint(observer);
  eye[2]+=.65;
  return sightlineClear(eye,target,blockers)&&
   (darkvisionReaches(observer,target)||ambientAt(target,blockers)||lightAt(target,blockers));
 })||!preview&&eyeSees(target,blockers));
}
function standeeHidden(p){
 if(studioWebGLOverlayTokens?.has(p))return false;
 return roomProfile?.gm===false&&(p.incognito===true||
  !ownsRoomStandee(p)&&!standeeVisibleToObserver(p));
}
function visionBlockers(){
 if(lightingFrame?.blockers)return lightingFrame.blockers;
 const blockers=[];
 for(const wall of windowApertureTerrain()){
  if(wall.type==='crate'||isFurniture(wall)||!movementTerrainBlock(wall))continue;
  const [w,d,h]=dimensions(wall);
  if(h<1&&!wall.stairTread&&!wall.openingCut)continue;
  const bounds=[[wall.x,wall.x+w],[wall.y,wall.y+d],[wall.z,wall.z+h]];
  bounds.piece=wall;
  if(wall.terrainYaw)bounds.terrain=wall;
  blockers.push(bounds);
 }
 for(const window of areas){
  if(window.kind!=='Window')continue;
  for(const section of windowWallSections(window)){
   const [w,d,h]=section.extents,{x,y,z}=section;
   blockers.push([[x,x+w],[y,y+d],[z,z+h]]);
  }
 }
 for(const door of areas){
  if(door.shape!=='opening'||!['Door','Window'].includes(door.kind)||(door.kind==='Window'?!door.shaded:door.open))continue;
  const [x,y,z]=door.origin,offset=(1-(door.doorWidth??1))/2;
  const height=door.kind==='Door'?doorLeafHeight(door):windowTop(door);
  const bottom=door.kind==='Window'?z+windowBottom(door):z;
  blockers.push(door.angle===0?[[x+offset,x+1-offset],[y+.45,y+.55],[bottom,z+height]]:
   [[x+.45,x+.55],[y+offset,y+1-offset],[bottom,z+height]]);
 }
 for(const solid of pathWallSolids()){
  const bounds=[...solid.spans.slice(0,2),[solid.z,solid.top]];
  bounds.wallPrism=solid;
  blockers.push(bounds);
 }
 if(lightingFrame)lightingFrame.blockers=blockers;
 return blockers;
}
// Reuse broad-phase buckets across frames while blocker cell coverage is
// unchanged. Exact intersection tests always use the current frame's bounds.
const rayBlockerIndices=new WeakMap();
let lastSceneRayIndex=null;
let completeSceneRayBlockers=null;
const rayBlockerCell=8;
function rayBlockerCoverage(bounds){
 const x0=Math.floor(bounds[0][0]/rayBlockerCell),x1=Math.floor(bounds[0][1]/rayBlockerCell);
 const y0=Math.floor(bounds[1][0]/rayBlockerCell),y1=Math.floor(bounds[1][1]/rayBlockerCell);
 const count=(x1-x0+1)*(y1-y0+1);
 return !Number.isFinite(count)||count>256?null:[x0,x1,y0,y1];
}
function sceneRayBlockerIndex(blockers){
 const coverage=blockers.map(rayBlockerCoverage);
 const complete=blockers===completeSceneRayBlockers;
 const previous=complete&&lastSceneRayIndex?.scene===currentSceneId?lastSceneRayIndex:null;
 if(previous?.coverage.length===coverage.length&&coverage.every((range,i)=>{
  const prior=previous.coverage[i];
  return range===prior||range&&prior&&range.every((value,j)=>value===prior[j]);
 }))return previous.index;
 const buckets=new Map(),oversize=[];
 coverage.forEach((range,i)=>{
  if(!range){oversize.push(i);return}
  const [x0,x1,y0,y1]=range;
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
   const key=x+','+y;
   if(!buckets.has(key))buckets.set(key,[]);
   buckets.get(key).push(i);
  }
 });
 const index={cell:rayBlockerCell,buckets,oversize};
 if(complete)lastSceneRayIndex={scene:currentSceneId,coverage,index};
 return index;
}
function rayBlockerCandidates(blockers,start,end){
 if(blockers.length<24)return blockers;
 let index=rayBlockerIndices.get(blockers);
 if(!index){
  index=sceneRayBlockerIndex(blockers);
  rayBlockerIndices.set(blockers,index);
 }
 const loX=Math.min(start[0],end[0]),hiX=Math.max(start[0],end[0]);
 const loY=Math.min(start[1],end[1]),hiY=Math.max(start[1],end[1]);
 const loZ=Math.min(start[2],end[2]),hiZ=Math.max(start[2],end[2]);
 const x0=Math.floor(loX/index.cell),x1=Math.floor(hiX/index.cell);
 const y0=Math.floor(loY/index.cell),y1=Math.floor(hiY/index.cell);
 // Very long or off-map rays fall back to the original exhaustive scan.
 if(!Number.isFinite(x0+y0+x1+y1)||(x1-x0+1)*(y1-y0+1)>4096)return blockers;
 const ids=new Set(index.oversize);
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)
  for(const id of index.buckets.get(x+','+y)??[])ids.add(id);
 // Preserve original order, including for partially transmitting walls.
 return [...ids].sort((a,b)=>a-b).map(i=>blockers[i]).filter(b=>
  b[0][1]>=loX&&b[0][0]<=hiX&&b[1][1]>=loY&&b[1][0]<=hiY&&b[2][1]>=loZ&&b[2][0]<=hiZ);
}
function visionRayClear(from,to,blockers){
 if(performanceDraw)performanceDraw.rays++;
 const start=[from[0],from[1],from[2]+.65],end=[to[0],to[1],to[2]+.65];
 const min=start.map((v,i)=>Math.min(v,end[i])),max=start.map((v,i)=>Math.max(v,end[i]));
 return !rayBlockerCandidates(blockers,start,end).some(bounds=>{
  if(bounds.wallPrism)return !wallPassage(bounds.wallPrism).sight&&wallSightInterval(bounds,start,end);
  if(bounds.terrain)return movementInterval(...turnTerrainPoints([start,end],bounds.terrain,-bounds.terrain.terrainYaw),bounds);
  return bounds.every(([lo,hi],i)=>max[i]>lo&&min[i]<hi)&&movementInterval(start,end,bounds);
 });
}
const roomFloorPatterns={
 dirt:'Dirt',grass:'Grass',gravel:'Gravel',cobble:'Cobblestone',brick:'Brick',roughRock:'Rough stone',moss:'Moss',
 furrows:'Furrows',seeded:'Seeded ground',ancient:'Ancient stone',vines:'Vines',soot:'Soot',boardwalk:'Boardwalk',wagonRuts:'Wagon ruts',splitRail:'Split-rail wood',
 fluting:'Fluting',blood:'Blood spatter',plain:'Solid color',
 squareTile:'Square tile',checkerTile:'Checkerboard tile',hexTile:'Hex tile',planks:'Wood planks',parquet:'Parquet',herringbone:'Herringbone'
};
const roomFloorTiles=new Map();
function roomFloorTile(style){
 const {pattern,base,accent}=style,key=JSON.stringify([pattern,base,accent]);
 if(roomFloorTiles.has(key))return roomFloorTiles.get(key);
 const tile=document.createElement('canvas');tile.width=tile.height=128;
 const g=tile.getContext('2d');
 g.fillStyle=base;g.fillRect(0,0,128,128);
 g.fillStyle=accent;g.strokeStyle=accent;g.lineWidth=2;
 if(pattern==='squareTile'||pattern==='checkerTile'){
  for(let y=0;y<128;y+=32)for(let x=0;x<128;x+=32){
   if(pattern==='checkerTile'&&(x+y)%64===32)g.fillRect(x,y,32,32);
   else g.strokeRect(x,y,32,32);
  }
 }else if(pattern==='hexTile'){
  for(let row=-1;row<5;row++)for(let col=-1;col<5;col++){
   const x=col*32+(row%2)*16,y=row*32;
   g.beginPath();for(const [u,v] of [[-16,0],[-8,-16],[8,-16],[16,0],[8,16],[-8,16]])g.lineTo(x+u,y+v);
   g.closePath();g.stroke();
  }
 }else if(['planks','parquet','herringbone'].includes(pattern)){
  function board(x,y,w,h,turn=0){
   g.save();g.translate(x,y);g.rotate(turn);g.strokeRect(0,0,w,h);g.globalAlpha=.35;
   for(let n=3;n<h;n+=4){g.beginPath();g.moveTo(1,n);g.bezierCurveTo(w*.25,n-2,w*.64,n+3,w-1,n);g.stroke();}
   g.restore();
  }
  if(pattern==='planks'){
   for(let row=0;row<8;row++)for(let x=-64+(row%2)*32;x<128;x+=64)board(x,row*16,64,16);
  }else if(pattern==='parquet'){
   for(let y=0;y<128;y+=32)for(let x=0;x<128;x+=32)for(let n=0;n<4;n++){
    if((x+y)%64)board(x+32-n*8,y,32,8,Math.PI/2);else board(x,y+n*8,32,8);
   }
  }else{
   g.translate(64,64);g.rotate(Math.PI/4);
   for(let y=-128;y<128;y+=16)for(let x=-160;x<160;x+=64){
    board(x,y,48,8);board(x+48,y+8,48,8,Math.PI/2);
   }
  }
 }else if(pattern!=='plain'&&Object.hasOwn(roomFloorPatterns,pattern)){
  const ink=document.createElement('canvas');ink.width=ink.height=128;
  const brush=ink.getContext('2d');
  brush.drawImage(scenePattern(pattern,1),0,0);
  brush.globalCompositeOperation='source-in';brush.fillStyle=accent;brush.fillRect(0,0,128,128);
  g.drawImage(ink,0,0);
 }
 if(roomFloorTiles.size>=64)roomFloorTiles.delete(roomFloorTiles.keys().next().value);
 roomFloorTiles.set(key,tile);return tile;
}
function paintRoomFloor(f,rooms,textures,flat){
 if(f.preview||!f.world||f.p&&(f.z===null||!f.p.groundSurface&&!['volume','terrace','stone'].includes(f.p.type)))return;
 const [,,z]=f.world[0];
 if(!f.world.every(point=>Math.abs(point[2]-z)<1e-7))return;
 let painted=false;
 for(const room of rooms){
  if(Math.abs(room.origin[2]-z)>1e-7)continue;
  const [x,y]=room.origin,x2=x+room.size,y2=y+room.depth;
  if(Math.max(...f.world.map(p=>p[0]))<=x||Math.min(...f.world.map(p=>p[0]))>=x2||
    Math.max(...f.world.map(p=>p[1]))<=y||Math.min(...f.world.map(p=>p[1]))>=y2)continue;
  const corners=(room.wallOutline??[[x,y],[x2,y],[x2,y2],[x,y2]]).map(([u,v])=>point(u,v,z));
  ctx.save();ctx.beginPath();corners.forEach(([u,v])=>ctx.lineTo(u,v));ctx.closePath();ctx.clip();
  if(textures&&room.floorFinish.pattern!=='plain')drawPatternLayers(null,f,roomFloorTile(room.floorFinish),2,flat);
  else polygon(f.projected,room.floorFinish.base,null);
  ctx.restore();
  painted=true;
 }
 return painted;
}
function roomIsDark([x,y,z]){
 const rooms=areas.filter(a=>a.shape==='room'&&x>=a.origin[0]&&x<=a.origin[0]+a.size&&y>=a.origin[1]&&y<=a.origin[1]+a.depth);
 for(const room of wallRooms())if(wallContainsPoint(room.wallOutline,x,y))rooms.push(room);
 // The highest room below this point owns its lighting up to the next story.
 let story=null;
 for(const room of rooms)if(room.origin[2]<=z&&(!story||room.origin[2]>=story.origin[2]))story=room;
 return story?.dark===true;
}
function activeLights(){
 return [...areas.filter(a=>a.shape==='light'&&a.on).map(a=>drag?.fixture===a&&drag.next?{...a,origin:drag.next}:a),...tokens.filter(t=>t.torch&&!t.incognito).map(t=>({shape:"light",on:true,carried:true,origin:[t.x+(t.size-1)/2,t.y+(t.size-1)/2,t.z],lightElevation:.65,radius:t.torchDim??40,bright:t.torchBright??20,tint:t.torchColor||"#ffcc80"}) )];
}
function lightAt(target,blockers,carriedOnly=false,brightOnly=false,blend=false){
 return timeLighting(()=>computeLightAt(target,blockers,carriedOnly,brightOnly,blend));
}
function lightRangeCenter(light){
 const [x,y,z]=light.origin;
 const elevation=light.fixture==='chandelier'?fixtureElevation(light):light.spell==='dancing'?light.lightElevation??.65:.65;
 return [x+.5,y+.5,z+elevation-.65];
}
function lightRayStart(light,source=lightRangeCenter(light)){
 return [source[0],source[1],(light.spell==='dancing'||light.fixture==='chandelier'
  ?source[2]:source[2]+(light.lightElevation??.65)-.65)+.65];
}
function computeLightAt(target,blockers,carriedOnly,brightOnly,blend){
 const cache=lightingFrame?.lightResults,key=cache&&[...target,carriedOnly,brightOnly,blend].join(',');
 if(cache?.has(key))return cache.get(key);
 const lights=lightingFrame?.lights??activeLights();
 if(lightingFrame)lightingFrame.lights=lights;
 let result;
 lights.some(a=>{
  if(performanceDraw)performanceDraw.lightCandidates++;
  if(carriedOnly&&!a.carried)return false;
  const radius=brightOnly?(a.bright??a.radius):a.radius;
  if(!(radius>0))return false;
  const source=lightRangeCenter(a);
  const elevation=a.lightElevation??.65;
  const rayStart=a.spell==='dancing'||a.fixture==='chandelier'?source:[source[0],source[1],source[2]+elevation-.65];
  const distance=Math.hypot(...source.map((v,i)=>v-target[i]))*5;
  if(distance>radius)return false;
  const strength=blend?torchEdgeWeight(distance,radius,4)*(.42+.58*torchEdgeWeight(distance,a.bright??radius,3)):1;
  if(blend&&strength<=(result?.strength??0))return false;
  const height=.65,pathWalls=sceneWallPaths().length;
  const scale=pathWalls?
   sampledLightTransmission(lightRayStart(a,source),[target[0],target[1],target[2]+height],blockers):
   Number(visionRayClear(rayStart,target,blockers));
  if(!scale)return false;
  if(blend){
   const contribution=strength*scale;
   if(contribution>(result?.strength??0))result={...a,strength:contribution};
   return contribution===1;
  }
  if(!pathWalls){result=a;return true}
  if(scale>(result?.transmission??0))result={...a,transmission:scale};
  return scale===1;
 });
 cache?.set(key,result);
 return result;
}
function darkvisionReaches(token,target){
 return Math.hypot(...basePoint(token).map((v,i)=>v-target[i]))*5<=Math.max(token.blindsight||0,token.conditions?.includes('blinded')?0:token.darkvision||0)&&Math.max(token.blindsight||0,token.darkvision||0)>0;
}
const ambientNames=['Total darkness','Starlight','Moonlight','Overcast','Cloudy','Bright full sun'];
const ambientRanges=[0,2,4,5,7,9];
function interpolateLight(values,level){const n=Math.max(0,Math.min(5,level)),i=Math.floor(n);return values[i]+(values[Math.min(5,i+1)]-values[i])*(n-i)}
function ambientAt(target,blockers){
 const setting=areas.find(a=>a.shape==='appearance')?.appearance?.ambient;
 const dark=roomIsDark(target);
 if(!setting?.enabled&&!dark)return {level:5};
 const level=Math.max(0,Math.min(5,Number(setting?.enabled?setting.level:5)||0));
 if(!level)return null;
 if(!dark)return {...setting,level};
 for(const opening of areas){
  if(opening.shape!=='opening'||!['Window','Door'].includes(opening.kind)||(opening.kind==='Window'?opening.shaded:!opening.open)||opening.secret)continue;
  const [x,y,z]=opening.origin,axis=opening.angle===0?1:0;
  const aperture=[x+.5,y+.5,z+(opening.kind==='Window'?(windowBottom(opening)+windowTop(opening))/2:0)];
  if(Math.hypot(...target.map((v,i)=>v-aperture[i]))>interpolateLight(ambientRanges,level))continue;
  const outside=[...aperture];
  outside[axis]+=target[axis]>aperture[axis]?-1:1;
  const rayAperture=[aperture[0],aperture[1],aperture[2]-(opening.kind==='Window'?.65:0)];
  const rayOutside=[outside[0],outside[1],rayAperture[2]];
  if(roomIsDark(outside)||!visionRayClear(rayOutside,rayAperture,blockers)||!visionRayClear(rayAperture,target,blockers))continue;
  return {...setting,enabled:true,level};
 }
 if(wallRoomAmbient(target,level,blockers))return {...setting,enabled:true,level};
 return null;
}
let spellPlacement=null,familiarView=null;
function spellEyes(){
 return tokens.filter(t=>ownsRoomStandee(t)&&!t.incognito&&!t.conditions?.includes('dead')&&Array.isArray(t.arcaneEye)).map(t=>t.arcaneEye);
}
function eyeSees(target,blockers){
 // Arcane Eye has normal sight in illuminated areas and darkvision to 30 ft.
 // Its line of sight starts at the eye, independently of the caster's position.
 return spellEyes().some(eye=>{
  if(!visionRayClear(eye,target,blockers))return false;
  const distance=5*Math.hypot(...eye.map((v,i)=>v-target[i]));
  if(distance<=30)return true;
  return !!ambientAt(target,blockers)||!!lightAt(target,blockers);
 });
}
function activeVisionFamiliar(){
 return tokens.find(t=>t.roomId===familiarView&&t.familiarCaster&&ownsRoomStandee(t)&&
  !t.incognito&&!t.conditions?.includes('dead'));
}
function visionObservers(observers){
 const familiar=activeVisionFamiliar();
 return observers.filter(t=>t.familiarCaster?t===familiar:t.roomId!==familiar?.familiarCaster||!familiar);
}
function familiarVisionTarget(token){
 if(!ownsRoomStandee(token))return null;
 const active=activeVisionFamiliar();
 if(token.familiarCaster)return token===active?
  tokens.find(t=>t.roomId===token.familiarCaster&&ownsRoomStandee(t)):null;
 if(active?.familiarCaster===token.roomId)return null;
 return tokens.find(t=>t.familiarCaster===token.roomId&&ownsRoomStandee(t)&&
  !t.incognito&&!t.conditions?.includes('dead'));
}
function playerCanSeePoint(target,blockers=visionBlockers(),observers=tokens){
 return timeLighting(()=>computePlayerCanSeePoint(target,blockers,observers));
}
function gmVisionObserver(){
 return playing&&roomProfile?.gm!==false&&tokens.includes(gmVisionStandee)?gmVisionStandee:null;
}
function mapFogEnabled(){return !!gmVisionObserver()||playerFogEnabled()}
// Shared, read-only visibility contract for the upcoming 3D/tactical-map renderers.
// Do not infer visibility from room connectivity alone: doorways and windows
// require an actual sightline. Unknown terrain must never be exposed by a map.
// Both renderers will use this contract while the legacy fog pipeline remains.
function tacticalVisibilityAt(target,blockers=visionBlockers()){
 if(roomProfile?.gm!==false&&!gmVisionObserver())return 'visible';
 const visible=playerCanSeePoint(target,blockers);
 if(visible)return 'visible';
 // The existing fog-memory keys identify rendered surface patches, not rooms.
 // Until room discovery is persisted separately, never equate a nearby
 // remembered patch with permission to reveal an entire room.
 return 'unknown';
}
function computePlayerCanSeePoint(target,blockers,observers){
 if(gmVisionObserver())return fogPointVisible(target);
 const key=target.join(',');
 const cache=lightingFrame?.visibility;
 if(cache?.has(key))return cache.get(key);
 const reachable=visionObservers(observers).filter(token=>ownsRoomStandee(token)&&!token.incognito&&!token.conditions?.includes('dead')&&
  (!token.conditions?.includes('blinded')||token.blindsight>0)&&visionRayClear(basePoint(token),target,blockers));
 const visible=eyeSees(target,blockers)||reachable.length>0&&(reachable.some(token=>darkvisionReaches(token,target))||
  !!ambientAt(target,blockers)||!!lightAt(target,blockers));
 cache?.set(key,visible);
 return visible;
}
function roomLighting(target,blockers,smooth=false){
 return timeLighting(()=>{
  const cache=lightingFrame?.surfaceLighting,key=cache&&(smooth?'sharp:':'')+target.join(',');
  if(cache?.has(key))return cache.get(key);
  const tint=computeRoomLighting(target,blockers,smooth);
  cache?.set(key,tint);
  return tint;
 });
}
function torchEdgeWeight(distance,radius,feather){
 if(!(radius>0))return 0;
 const t=Math.max(0,Math.min(1,(radius-distance)/Math.min(radius,feather)));
 return t*t*(3-2*t);
}
function mixLightTint(from,to,weight){
 if(weight>=1)return to;
 if(weight<=0)return from;
 return '#'+[1,3,5,7].map(i=>{
  const a=parseInt(from.slice(i,i+2),16),b=parseInt(to.slice(i,i+2),16);
  return Math.round(a+(b-a)*weight).toString(16).padStart(2,'0');
 }).join('');
}
function computeRoomLighting(target,blockers,smooth){
 const ambient=ambientAt(target,blockers);
 const dark=roomIsDark(target)||!ambient;
 const observers=tokens.filter(token=>ownsRoomStandee(token)&&!token.incognito&&!token.conditions?.includes('dead'));
 if(dark&&roomProfile?.gm===false&&!eyeSees(target,blockers)&&!visionObservers(observers).some(token=>visionRayClear(basePoint(token),target,blockers)))return '#10121bdf';
 const brightAmbient=ambient&&ambient.level>=3;
 if(smooth&&!brightAmbient){
  const light=lightAt(target,blockers,false,false,true);
  const base=ambient?ambientTerrainTint(ambient,true):unlitTerrainTint(target,blockers);
  if(!light)return base;
  const tint=/^#[0-9a-f]{6}$/i.test(light.tint)?light.tint:'#ffcc80';
  return mixLightTint(base??'#10121b00',tint+'35',light.strength);
 }
 if(!brightAmbient){
  const bright=lightAt(target,blockers,!dark,true);
  if(bright){
   const tint=/^#[0-9a-f]{6}$/i.test(bright.tint)?bright.tint:'#ffcc80';
   if((bright.transmission??1)<1){
    const amount=bright.transmission;
    return '#10121b'+Math.round(223*(1-amount)+53*amount).toString(16).padStart(2,'0');
   }
   return tint+'35';
  }
 }
 if((ambient?.level??0)<2){
  const dim=lightAt(target,blockers);
  if(dim?.spell==='dancing'){
   const tint=/^#[0-9a-f]{6}$/i.test(dim.tint)?dim.tint:'#bbddff';
   return tint+'46';
  }
  if(!ambient&&dim)return '#343744'+Math.round(223-93*(dim.transmission??1)).toString(16).padStart(2,'0');
 }
 return ambient?ambientTerrainTint(ambient):dark?unlitTerrainTint(target,blockers):null;
}
function ambientTerrainTint(ambient,asHex=false){
  if(!ambient.enabled)return null;
  const darkness=interpolateLight([.85,.68,.48,.25,.12,.02],ambient.level);
  const hue=Number(ambient.hue)||0,saturation=Number(ambient.saturation)||0;
  // Darkness and color intensity are independent; tint must not emit light at low ambient levels.
  const intensity=Math.max(0,Math.min(1,ambient.level/5));
  const tintSaturation=Math.max(0,Math.min(100,saturation))*intensity;
  const alpha=Math.max(darkness,tintSaturation/450);
  const luminance=Math.min(68,68*intensity);
  if(!asHex)return 'hsl('+hue+' '+tintSaturation+'% '+luminance+'% / '+alpha+')';
  const l=luminance/100,a=tintSaturation/100*Math.min(l,1-l);
  const channels=[0,8,4].map(n=>{
   const k=((n+hue/30)%12+12)%12;
   return l-a*Math.max(-1,Math.min(k-3,9-k,1));
  });
  return '#'+[...channels,alpha].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
}
function unlitTerrainTint(target,blockers){
 const preview=gmVisionObserver();
 if(preview&&!preview.conditions?.some(c=>c==='dead'||c==='blinded')&&darkvisionReaches(preview,target)&&visionRayClear(basePoint(preview),target,blockers))return '#52576196';
 if(roomProfile?.gm===false&&visionObservers(tokens).some(token=>ownsRoomStandee(token)&&!token.incognito&&!token.conditions?.some(c=>c==='dead'||c==='blinded')&&darkvisionReaches(token,target)&&visionRayClear(basePoint(token),target,blockers)))return '#52576196';
 return '#10121bdf';
}
function activeStandeeLook(p){
 return artDraft?.token===p?artDraft.looks[artDraft.index]:p.looks?.[p.activeLook];
}
const standeeThicknessOptions=[4,15,30,50,75,100];
function standeeProfileWidth(frontness,p,look){
 const setting=look?.sideThickness;
 const thickness=standeeThicknessOptions.includes(setting)?setting/100:[.08,.1,.15,.3,.5][standeeSizeIndex(p)];
 return Math.hypot(frontness,thickness*Math.sqrt(Math.max(0,1-frontness*frontness)));
}
const standeeBackSurfaces=new WeakMap();
function standeeBackSurface(image,look){
 const start=look.backColor||'#252d36',end=look.backFill==='gradient'?look.backEnd||'#708496':start;
 const key=start+':'+end,previous=standeeBackSurfaces.get(image);
 if(previous?.key===key)return previous.canvas;
 const canvas=document.createElement('canvas'),scale=Math.min(1,768/Math.max(image.naturalWidth,image.naturalHeight));
 canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
 canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const g=canvas.getContext('2d');
 g.drawImage(image,0,0,canvas.width,canvas.height);
 g.globalCompositeOperation='source-in';
 const fill=g.createLinearGradient(0,0,0,canvas.height);
 fill.addColorStop(0,start);fill.addColorStop(1,end);
 g.fillStyle=fill;g.fillRect(0,0,canvas.width,canvas.height);
 standeeBackSurfaces.set(image,{key,canvas});
 return canvas;
}
function drawStandee(p,preview){
 if(standeeHidden(p))return;
 if(!topDown)standeeShadow(p,preview);
 const [x,y,z]=point(p.x+p.size/2,p.y+p.size/2,p.z);
 const baseWidth=standeeGridPixelSize()*p.size*(p.size>1?.95:.78)*standeeScale(p),height=standeeArtHeight(p);
 const dead=p.conditions?.includes('dead');
 const facing=trackingFacing(p);
 if(topDown){
  const radius=baseWidth*.52;
  faces.push({projected:[[x-radius,y-radius],[x+radius,y-radius],[x+radius,y+radius],[x-radius,y+radius]],p,z:null,preview,depth:z,standee:true,baseWidth,flat:[x,y,radius],artTop:y-radius,dead});
  return;
 }
 const frontness=Math.cos(standeeViewAngle({facing}));
 const look=activeStandeeLook(p);
 const width=baseWidth*standeeProfileWidth(frontness,p,look);
 const projected=[[x-width/2,y-height],[x+width/2,y-height],[x+width/2,y],[x-width/2,y]];
 faces.push({projected,p,z:null,preview,depth:z+.22,standee:true,baseWidth,facing,frontness,dead});
}
// The shared timestamp carries no HP value and expires visually on each client.
let damageFlashTimer=null;
const damageFlashes=new WeakMap();
function paintDamageFlash(token){
 const now=Date.now(),stamp=token.damageFlashAt;
 if(!(now-stamp>=-1000&&now-stamp<5000)||standeeObscured(token))return;
 let flash=damageFlashes.get(token);
 if(flash?.stamp!==stamp){
  flash={stamp,started:now};
  damageFlashes.set(token,flash);
 }
 const age=now-flash.started;
 if(age>=450)return;
 const phase=age<250?250:450;
 const redrawAt=flash.started+phase;
 if(!damageFlashTimer||damageFlashTimer.at>redrawAt){
  clearTimeout(damageFlashTimer?.id);
  damageFlashTimer={at:redrawAt,id:setTimeout(()=>{
   damageFlashTimer=null;
   draw('Damage flash');
  },Math.max(0,redrawAt-Date.now()))};
 }
 ctx.filter=phase===250?'brightness(0) invert(1)':'brightness(1.75)';
}
function paintDeadStandee(f){
 const [left,right,base]=f.projected,x=(left[0]+right[0])/2,y=base[1];
 const width=f.baseWidth;
 ctx.save();
 ctx.beginPath();ctx.ellipse(x,y,width*.55,width*.22,0,0,Math.PI*2);
 ctx.fillStyle='#985d57';ctx.fill();ctx.strokeStyle='#603c38';ctx.lineWidth=2;ctx.stroke();
 ctx.beginPath();ctx.moveTo(x-width*.15,y-width*.085);ctx.lineTo(x+width*.15,y+width*.085);
 ctx.moveTo(x+width*.15,y-width*.085);ctx.lineTo(x-width*.15,y+width*.085);
 ctx.strokeStyle='#f3d5cb';ctx.lineWidth=Math.max(2,width*.035);ctx.stroke();
 ctx.restore();
}
function paintFlatStandee(f){
 const {p,dead}=f,[x,y,r]=f.flat;
 const obscured=standeeObscured(p);
 ctx.save();
 ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
 ctx.fillStyle=obscured?'#080808':dead?'#985d57':p.color;ctx.fill();
 if(!obscured&&!dead){
  ctx.save();ctx.clip();
  const look=artDraft?.token===p?artDraft.looks[artDraft.index]:p.looks?.[p.activeLook];
  const src=look?.front||p.src||defaultStandeeLook(p).front;
  const art=src&&getArt(src);
  if(art?.complete&&art.naturalWidth){
   const scale=Math.min(r*1.9/art.naturalWidth,r*1.9/art.naturalHeight);
   const w=art.naturalWidth*scale,h=art.naturalHeight*scale;
   ctx.drawImage(art,x-w/2,y-h/2,w,h);
  }
  ctx.restore();
 }
 ctx.strokeStyle=f.preview?((carry?validCarryDestination():valid(p))?'#c6eb87':'#ff8478'):
  playStandeeGroup.has(p)?'#d18f37':p===selected?'#fff2ba':!obscured&&standeeIsTargeted(p)?'#ad4540':'#19211a';
 ctx.lineWidth=2;ctx.stroke();
 if(dead&&!obscured){
  ctx.beginPath();ctx.moveTo(x-r*.35,y-r*.35);ctx.lineTo(x+r*.35,y+r*.35);
  ctx.moveTo(x+r*.35,y-r*.35);ctx.lineTo(x-r*.35,y+r*.35);
  ctx.strokeStyle='#f3d5cb';ctx.stroke();
 }
 ctx.restore();
}
function paintStandee(f){
 const p=f.p,[a,b,c]=f.projected,x=(a[0]+b[0])/2,y=c[1],w=b[0]-a[0];
 const obscured=standeeObscured(p),targeted=!obscured&&standeeIsTargeted(p);
 ctx.beginPath();ctx.ellipse(x,y,f.baseWidth*.55,f.baseWidth*.22,0,0,Math.PI*2);ctx.fillStyle=obscured?'#080808':targeted?'#ad4540':p.color;ctx.fill();
 ctx.strokeStyle=f.preview?((carry?validCarryDestination():valid(p))?'#c6eb87':'#ff8478'):playStandeeGroup.has(p)?'#d18f37':p===selected?'#fff2ba':'#19211a';ctx.lineWidth=2;ctx.stroke();ctx.lineWidth=1;
 const look=artDraft?.token===p?artDraft.looks[artDraft.index]:p.looks?.[p.activeLook];
 const defaults=defaultStandeeLook(p);
 const front=look?.front||p.src||defaults.front;
 const back=look?.back||(!p.src&&!look?.front?defaults.back:'');
 const frontArt=front&&getArt(front);
 const backArt=back&&!look?.sameImage?getArt(back):frontArt;
 const ready=image=>image?.complete&&image.naturalWidth;
 const useBackFill=f.frontness<0&&(!look?.back||look.sameImage)&&
  ['solid','gradient'].includes(look?.backFill)&&ready(frontArt);
 const facingArt=f.frontness>=0||useBackFill?frontArt:backArt;
 const fallbackArt=f.frontness>=0?backArt:frontArt;
 const art=ready(facingArt)?facingArt:ready(fallbackArt)?fallbackArt:null;
 if(art){
  const h=c[1]-a[1];
  const fit=Math.min(f.baseWidth/art.naturalWidth,h/art.naturalHeight);
  const aw=art.naturalWidth*fit*(w/f.baseWidth),ah=art.naturalHeight*fit;
  f.artTop=y-ah;
  const surface=useBackFill?standeeBackSurface(art,look):art;
  ctx.drawImage(obscured||targeted?tintedStandeeArt(surface,obscured):bloodTintedArt(surface,standeeBloodLevel(p)),x-aw/2,y-ah,aw,ah);
 }else{
  if(obscured){ctx.fillStyle='#080808';ctx.fillRect(a[0],a[1],w,y-a[1]);return}
  ctx.fillStyle=targeted?'#783c36':'#242d26';ctx.beginPath();ctx.rect(a[0],a[1],w,y-a[1]);ctx.fill();ctx.strokeStyle=p.color;ctx.stroke();
  ctx.fillStyle=p.color;ctx.font=Math.round(w*.6)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.icon,x,(y+a[1])/2);
 }
}
function terrainThemeSeed(p){
 return (Math.imul(Math.round(p.x*4),73856093)^Math.imul(Math.round(p.y*4),19349663)^Math.imul(Math.round(p.z*4),83492791))>>>0;
}
function caveCeiling(p,terrain=pieces){
 return terrain.reduce((nearest,q)=>{
  if(q===p||q.type==='column'||q.type==='scatter'||q.type==='backdrop'||q.z<p.z+1)return nearest;
  const [w,d]=dimensions(q),cx=p.x+.25,cy=p.y+.25;
  return cx>=q.x&&cx<=q.x+w&&cy>=q.y&&cy<=q.y+d?Math.min(nearest,q.z):nearest;
 },Infinity);
}
const foliageTextures=new Map();
function shadeTreeColor(color,factor){
 return '#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(color.slice(i,i+2),16)*factor)).toString(16).padStart(2,'0')).join('');
}
function foliageTexture(index,color){
 const key=index+':'+(color||'');
 if(foliageTextures.has(key))return foliageTextures.get(key);
 const tile=document.createElement('canvas');tile.width=128;tile.height=96;
 const g=tile.getContext('2d');
 let seed=517+index*821;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const palette=color?[.68,.83,1,1.15,1.3].map(factor=>shadeTreeColor(color,factor)):['#344b2c','#405934','#4e6839','#5d7741','#6b844b'];
 for(let n=0;n<100;n++){
  const a=random()*Math.PI*2,d=Math.sqrt(random()),x=64+Math.cos(a)*49*d,y=48+Math.sin(a)*34*d;
  if(d>.42&&Math.sin(a*3+index)>.8)continue;
  const radius=4+random()*10;
  g.fillStyle=palette[Math.floor(random()*palette.length)];
  g.beginPath();g.ellipse(x,y,radius,radius*(.5+random()*.35),random()*Math.PI,0,Math.PI*2);g.fill();
 }
 if(foliageTextures.size>=64)foliageTextures.delete(foliageTextures.keys().next().value);
 foliageTextures.set(key,tile);return tile;
}
function formationSize(value,low,defaultValue,high,defaultPosition){
 const t=value<=defaultPosition?value/defaultPosition:(value-defaultPosition)/(1-defaultPosition);
 return value<=defaultPosition?low+(defaultValue-low)*t:defaultValue+(high-defaultValue)*t*t;
}
function formationDiameter(formation,settings,variationRoll){
 const dial=id=>(settings[id]??terrainShapeDefaults[id])/100;
 if(formation==='tree'){
  const scale=Math.max(.25,Math.min(16,(Number(settings.sceneTreeWidthScale)||100)/100));
  const base=formationSize(dial('treeBaseDiameter'),.35,1,3,.5);
  return 2*formationSize(dial('treeThickness'),.055,.125,2,.45)*scale*
   (1+(variationRoll-.5)*dial('sceneTreeVariation')*.8)*Math.max(base,.95+dial('treeBulb')*.55);
 }
 const rock=formation==='boulder',bulb=dial(rock?'rockBulb':'caveBulb');
 return 2*(rock?Math.max(.20+.12*bulb,.13+.14*bulb):.25)*
  (rock?formationSize(dial('rockDiameter'),.45,1,5,.55):formationSize(dial('caveDiameter'),.35,1,6,.45))*
  (1+(variationRoll-.5)*.32);
}
const formationDetailFields={tree:['treeBulb','treeCrannies'],boulder:['rockBulb','rockCrannies'],cave:['caveBulb','caveCrannies']};
function convertBiomeColumns(previous,next){
 const from=terrainThemes[previous?.terrainTheme]?.formation,to=terrainThemes[next.terrainTheme]?.formation;
 if(!from||!to||from===to)return;
 for(const p of pieces){
  if(p.type!=='column'||p.terrainShape?.componentKind)continue;
  const values={...p.terrainShape};
  const source={...previous.terrainShape,...values};
  const target={...next.terrainShape,...values};
  formationDetailFields[to].forEach((key,i)=>target[key]=values[key]=source[formationDetailFields[from][i]]??terrainShapeDefaults[formationDetailFields[from][i]]);
  let state=terrainThemeSeed(p);
  for(let i=0;i<3;i++)state=(Math.imul(state,1664525)+1013904223)>>>0;
  const roll=state/4294967296;
  values.formationScale=formationDiameter(from,source,roll)*(source.formationScale??1)/formationDiameter(to,target,roll);
  if(from==='tree'){
   values.rockFinish=source.treeFinish==='dryrot'?'broken':source.treeFinish==='unbroken'?'natural':'flat';
   values.lichen=source.sceneTreeFoliage==='on'||source.sceneTreeFoliage!=='off'&&!!source.treeFoliage;
   if(source.treeLeafColor)values.treeLeafColor=source.treeLeafColor;
  }
  if(to==='tree'&&values.rockFinish)values.treeFinish={broken:'dryrot',natural:'unbroken',flat:'clearcut'}[values.rockFinish];
  if(to==='tree'&&typeof values.lichen==='boolean')values.treeFoliage=values.lichen;
  p.terrainShape=values;
 }
}
function drawFurniture(p,preview,fill,kind,settings){
 const v={...terrainShapeDefaults,...settings},[w,d]=v.tableShape==='round'&&kind==='table'?furnitureFootprint(furnitureValues(p)):furnitureFootprint(v),h=furnitureHeight(v),c=v.furnColor||'#79563b',a=v.furnAccent||'#a79b75',cx=p.x+dimensions(p)[0]/2,cy=p.y+dimensions(p)[1]/2,ang=p.r*Math.PI/2;
 const emit=(pts,color)=>{face(pts.map(([x,y,z])=>[cx+x*Math.cos(ang)-y*Math.sin(ang),cy+x*Math.sin(ang)+y*Math.cos(ang),p.z+z]),preview?fill:color,p,null,preview);Object.assign(faces.at(-1),{special:true,biomeShape:true})};
 const box=(x,y,z,W,D,H,color)=>{const lo=[[x,y,z],[x+W,y,z],[x+W,y+D,z],[x,y+D,z]],hi=lo.map(q=>[q[0],q[1],q[2]+H]);if(!topDown)for(let i=0;i<4;i++)emit([lo[i],lo[(i+1)%4],hi[(i+1)%4],hi[i]],shadeTreeColor(color,.72+i*.07));emit(hi,color)};
 const slab=(z,H,color)=>box(-w/2,-d/2,z,w,d,H,color),legs=(height)=>{for(const x of [-w/2,w/2-.09])for(const y of [-d/2,d/2-.09])box(x,y,0,.09,.09,height,c)};
 if(kind==='rug'){
  slab(0,.015,a);
  const innerW=w*.84,innerD=d*.84,highlight=v.rugHighlight??'#d5b981';
  box(-innerW/2,-innerD/2,.016,innerW,innerD,.008,c);
  const motif=(points,color)=>emit(points.map(([x,y])=>[x,y,.0245]),color);
  if(v.rugPattern==='stripes'){
   for(let i=-2;i<=2;i++){
    const y=i*innerD/6,band=innerD/18;
    motif([[-innerW/2,y-band],[innerW/2,y-band],[innerW/2,y+band],[-innerW/2,y+band]],i%2?a:highlight);
   }
  }else if(v.rugPattern==='checker'){
   for(let j=0;j<4;j++)for(let i=0;i<4;i++)if((i+j)%2===0){
    const x=(i/4-.5)*innerW,y=(j/4-.5)*innerD;
    motif([[x,y],[x+innerW/4,y],[x+innerW/4,y+innerD/4],[x,y+innerD/4]],highlight);
   }
  }else if(v.rugPattern==='medallion'){
   for(const x of [-innerW*.3,0,innerW*.3]){
    const radius=x===0?.29:.13;
    motif([[x-innerW*radius,0],[x,-innerD*radius],[x+innerW*radius,0],[x,innerD*radius]],highlight);
    motif([[x-innerW*radius*.54,0],[x,-innerD*radius*.54],[x+innerW*radius*.54,0],[x,innerD*radius*.54]],a);
   }
  }
  if(v.rugFringe&&v.rugFringe!=='none'){
   const count=v.rugFringe==='tassels'?9:19;
   for(let i=0;i<count;i++)for(const sign of [-1,1]){
    const x=((i+.5)/count-.5)*w,half=w/(count*3),near=sign*d/2,far=near+sign*Math.min(.14,d*.16);
    motif([[x-half,near],[x+half,near],[x+half*.60,far],[x-half*.60,far]],highlight);
   }
  }
 }
 else if(kind==='table'&&v.tableShape==='round'){
  const tabletop=h*.75,segments=20;
  const lower=Array.from({length:segments},(_,i)=>{
   const theta=i*2*Math.PI/segments;
   return [Math.cos(theta)*w/2,Math.sin(theta)*w/2,tabletop];
  });
  const upper=lower.map(([x,y,z])=>[x,y,z+.08]);
  if(!topDown){
   for(const x of [-w*.24,w*.24])for(const y of [-w*.24,w*.24])box(x-.045,y-.045,0,.09,.09,tabletop,c);
   lower.forEach((vertex,i)=>{
    const next=(i+1)%segments;
    emit([vertex,lower[next],upper[next],upper[i]],shadeTreeColor(c,.77+.12*Math.cos(i*2*Math.PI/segments)));
   });
  }
  emit(upper,c);
 }
 else if(kind==='table'||kind==='chair'){legs(h*.75);slab(h*.75,.08,c);if(kind==='chair'&&v.furnDetail>25)box(-w/2,d/2-.08,h*.75,w,.08,h*.65,c);}
 else if(kind==='bed'){legs(h*.28);slab(h*.28,h*.24,c);box(-w*.46,-d*.46,h*.52,w*.92,d*.92,.13,a);box(-w*.38,d*.22,h*.65,w*.76,d*.18,.08,'#d2c5a6');box(-w/2,d/2-.08,0,w,.08,h,c);}
 else if(kind==='barrel'){const n=8,ring=(z,r)=>Array.from({length:n},(_,i)=>[Math.cos(i*2*Math.PI/n)*r,Math.sin(i*2*Math.PI/n)*r,z]);const levels=[ring(0,w*.4),ring(h*.15,w*.48),ring(h*.85,w*.48),ring(h,w*.4)];for(let j=1;j<levels.length;j++)for(let i=0;i<n;i++)if(!topDown)emit([levels[j-1][i],levels[j-1][(i+1)%n],levels[j][(i+1)%n],levels[j][i]],j===2?c:a);emit(levels[3],c);}
 else if(kind==='rack'){box(-w/2,-d/2,0,w,d,.09,c);box(-w/2,d/2-.1,0,w,.1,h,c);for(let i=0;i<Math.max(2,Math.round(v.furnDetail/12));i++){const count=Math.max(2,Math.round(v.furnDetail/12));box(-w*.4+i*w*.8/count,0,.1,.045,.045,h*.85,a)}}
 else if(kind==='tumbleweed'){
  const n=8,ring=(z,r)=>Array.from({length:n},(_,i)=>[Math.cos(i*2*Math.PI/n)*r,Math.sin(i*2*Math.PI/n)*r,z]);
  const lower=ring(h*.12,w*.28),upper=ring(h*.86,w*.24);
  for(let i=0;i<n;i++){const j=(i+1)%n;if(!topDown)emit([lower[i],lower[j],upper[j],upper[i]],i%2?c:a);}
  emit(upper,a);for(let i=0;i<4;i++){const t=i*Math.PI/4,x=Math.cos(t)*w*.32,y=Math.sin(t)*d*.32;box(-x/2,-.018, h*.45,Math.abs(x)||.025,.036,.035,i%2?c:a);box(-.018,-y/2,h*.43,.036,Math.abs(y)||.025,.035,c)}
 }
 else if(kind==='hitchingPost'){
  const postW=Math.min(.12,w*.12),postD=Math.min(.12,d*.2);
  for(const x of [-w*.38,w*.38])box(x-postW/2,-postD/2,0,postW,postD,h,c);
  box(-w*.48,-postD/2,h*.67,w*.96,postD,h*.09,a);
 }
 else if(kind==='feedTrough'){
  const rim=.09;box(-w/2,-d/2,0,w,.08,h,c);box(-w/2,d/2-.08,0,w,.08,h,c);box(-w/2,-d/2,.04,.08,d-.08,h*.8,c);box(w/2-.08,-d/2,.04,.08,d-.08,h*.8,c);
  box(-w/2+rim,-d/2+rim,h*.78,w-2*rim,d-2*rim,.025,a);
 }
 else if(kind==='waterTower'){
  const leg=.12,legH=h*.65;for(const x of [-w*.38,w*.38])for(const y of [-d*.38,d*.38])box(x-leg/2,y-leg/2,0,leg,leg,legH,c);
  if(v.furnDetail>20){for(const x of [-1,1])box(-w*.38,-.035,legH*.35,w*.76,.07,.07,a);for(const y of [-1,1])box(-.035,-d*.38,legH*.58,.07,d*.76,.07,a)}
  box(-w*.48,-d*.48,legH,w*.96,d*.96,h*.15,a);box(-w*.46,-d*.46,legH+h*.15,w*.92,d*.92,h*.12,c);
  box(-w*.49,-d*.49,legH+h*.27,w*.98,d*.98,.04,a);
 }
 else if(kind==='splitRailFence'){
  const postW=.13,postD=.13,postH=h;for(const x of [-w*.46,w*.46])box(x-postW/2,-postD/2,0,postW,postD,postH,c);
  const railCount=v.furnDetail>66?3:2;for(let i=0;i<railCount;i++){const z=h*(.24+i*.48/(railCount-1));box(-w*.48,-.045,z,w*.96,.09,.09,i%2?a:c)}
 }
 else {slab(0,h,c);if(!topDown){box(-w/2,-d/2-.01,h*.2,w,.035,.06,a);box(-w/2,-d/2-.01,h*.75,w,.035,.06,a);if(kind==='cabinet')box(-.025,-d/2-.04,h*.5,.05,.05,.12,a)}}
}
function drawBiomeColumn(p,preview,fill,formation,settings,landingTerrain){
 if(furnitureKinds.includes(formation)){if(!landingTerrain)drawFurniture(p,preview,fill,formation,settings);return;}
 const dial=id=>Math.max(0,Math.min(100,Number(settings?.[id]??terrainShapeDefaults[id])))/100;
 const [w,d,h]=dimensions(p),cx=p.x+w/2,cy=p.y+d/2;
 let state=terrainThemeSeed(p);
 const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const n=formation==='tree'?6:9,phase=rand()*Math.PI*2;
 const widthScale=settings?.formationScale??1;
 const ceiling=formation==='cave'&&(settings?.caveHanging||p.terrainShape?.componentKind!=='cave')?caveCeiling(p,landingTerrain):Infinity;
 const ring=(height,radius,rough)=>Array.from({length:n},(_,i)=>{
  const a=phase+i*2*Math.PI/n,r=radius*(formation==='tree'?1:widthScale)*(1+(rand()-.5)*rough);
  return [cx+Math.cos(a)*r,cy+Math.sin(a)*r,height];
 });
 function landing(points,z,color){
  if(landingTerrain)return {points,z};
  face(points,preview?fill:color,p,z,preview);
  Object.assign(faces.at(-1),{special:true,biomeShape:true,landing:true});
 }
 const snapHeight=value=>Math.max(p.z+.25,Math.round(value*4)/4);
 function mesh(levels,palette,cap=false){
  const rings=levels.map(([height,radius,rough])=>ring(height,radius,rough));
  if(landingTerrain)return cap?landing(rings.at(-1),levels.at(-1)[0]):undefined;
  for(let l=1;l<rings.length;l++)for(let i=0;i<n;i++){
   const j=(i+1)%n;
   const shade=rand();
   const color=settings?.lichen&&shade<.38
    ?shadeTreeColor(settings.treeLeafColor||'#657747',.76+shade)
    :palette[Math.floor(shade*palette.length)];
   face([rings[l-1][i],rings[l-1][j],rings[l][j],rings[l][i]],preview?fill:color,p,null,preview);
   Object.assign(faces.at(-1),{special:true,biomeShape:true});
  }
  if(cap)landing(rings.at(-1),levels.at(-1)[0],palette.at(-1));
 }
 if(formation==='boulder'){
  const height=formationSize(dial('rockHeight'),.18,.68,3.5,.5)*(.8+rand()*.4),diameter=formationSize(dial('rockDiameter'),.45,1,5,.55)*(1+(rand()-.5)*.32),bulb=dial('rockBulb'),rough=dial('rockCrannies');
  const top=snapHeight(p.z+height),rise=top-p.z;
  return mesh([[p.z,.18*diameter,rough],[p.z+rise*.38,(.20+.12*bulb)*diameter,rough],[p.z+rise*.77,(.13+.14*bulb)*diameter,rough],[top,.15*diameter,rough]],['#55534f','#66635d','#77736a',settings?.rockFinish==='broken'?'#a29b8f':'#8d8578'],true);
 }else if(formation==='tree'){
  const scale=(id,max)=>Math.max(.25,Math.min(max,(Number(settings?.[id])||100)/100));
  const variation=dial('sceneTreeVariation');
  const height=formationSize(dial('treeHeight'),.4,h*.82,9,.75)*scale('sceneTreeHeightScale',5)*(1+(rand()-.5)*variation*.8);
  const radius=formationSize(dial('treeThickness'),.055,.125,2,.45)*scale('sceneTreeWidthScale',16)*widthScale*(1+(rand()-.5)*variation*.8);
  const bulb=dial('treeBulb'),crannies=dial('treeCrannies');
  const finish=settings?.treeFinish||'clearcut',log=settings?.treeLog;
  const heading=p.r*Math.PI/2,cos=Math.cos(heading),sin=Math.sin(heading);
  const orient=([x,y,z])=>log?[cx+(z-p.z)*cos-(y-cy)*sin,cy+(z-p.z)*sin+(y-cy)*cos,p.z+radius+x-cx]:[x,y,z];
  const emit=(points,color)=>{
   face(points.map(orient),preview?fill:color,p,null,preview);
   Object.assign(faces.at(-1),{special:true,biomeShape:true});
  };
  const bark=settings?.treeBarkColor?[.76,1,1.15].map(factor=>shadeTreeColor(settings.treeBarkColor,factor)):['#4c3828','#63503b','#6b5139'];
  const baseRadius=radius*formationSize(dial('treeBaseDiameter'),.35,1,3,.5);
  const barkRing=(z,width)=>ring(z,width,crannies*.48).map(([x,y,z],i)=>{
   const groove=i%2?1-crannies*.25:1;
   return [cx+(x-cx)*groove,cy+(y-cy)*groove,z];
  });
  if(log){
   const half=radius*.3,z=snapHeight(p.z+radius*1.8);
   const corners=[[0,-half],[height,-half],[height,half],[0,half]];
   const result=landing(corners.map(([u,v])=>[cx+u*cos-v*sin,cy+u*sin+v*cos,z]),z,bark[2]);
   if(landingTerrain)return result;
  }else if(landingTerrain)return;
  const bottom=barkRing(p.z,baseRadius);
  const top=barkRing(p.z+height,radius*.8).map(([x,y,z],i)=>[x,y,finish==='dryrot'?z-(i%2?.05:Math.min(height*.23,radius*.6+.18))*(.65+rand()*.35):z]);
  const trunk=bulb||crannies||baseRadius!==radius?[bottom,barkRing(p.z+height*.28,radius*(.95+bulb*.55)),barkRing(p.z+height*.62,radius*(.88+bulb*.22)),top]:[bottom,top];
  for(let l=1;l<trunk.length;l++)for(let i=0;i<n;i++){
   const j=(i+1)%n;emit([trunk[l-1][i],trunk[l-1][j],trunk[l][j],trunk[l][i]],bark[i%bark.length]);
  }
  if(finish==='clearcut'||log)emit(top,'#a2875b');
  else if(finish==='dryrot')for(let i=0;i<n;i++)emit([top[i],top[(i+1)%n],[cx,cy,p.z+height-Math.min(height*.3,radius+.1)]],i%2?'#967b51':'#705635');
  const roots=log?0:Math.round(dial('treeRoots')*10);
  for(let i=0;i<roots;i++){
   const angle=phase+i*2*Math.PI/roots+(rand()-.5)*.25;
   const spread=formationSize(dial('treeRootSpread'),.18,1,5,.3);
   const reach=Math.max(.45,baseRadius*(1.15+rand()*.7))*spread;
   const width=Math.max(.035,radius*formationSize(dial('treeRootThickness'),.08,.26,2,.4));
   const segments=2+Math.round(dial('treeRootTangle')*2);
   let previous;
   for(let j=0;j<=segments;j++){
    const t=j/segments,a=angle+Math.sin(j*2+i)*dial('treeRootTangle')*.65*t;
    const distance=baseRadius*.65+reach*t,x=cx+Math.cos(a)*distance,y=cy+Math.sin(a)*distance;
    const half=width*(1-t*.94);
    const cross=[[x-Math.sin(a)*half,y+Math.cos(a)*half,p.z],[x,y,p.z+half*1.3],[x+Math.sin(a)*half,y-Math.cos(a)*half,p.z]];
    if(previous)for(let k=0;k<2;k++)emit([previous[k],previous[k+1],cross[k+1],cross[k]],bark[k]);
    previous=cross;
   }
  }
  const count=Math.round(dial('treeBranches')*8);
  for(let i=0;i<count;i++){
   const a=phase+i*2.39996,ux=Math.cos(a),uy=Math.sin(a),branchHeight=p.z+height*(.35+.55*(i+1)/(count+1));
   const length=Math.max(radius*.9,height*(.1+rand()*.14)),rise=length*Math.tan((12+dial('treeBranchAngle')*57)*Math.PI/180);
   const root=[cx+ux*radius*.65,cy+uy*radius*.65,branchHeight];
   const tip=[root[0]+ux*length,root[1]+uy*length,Math.min(p.z+height*1.12,root[2]+rise)];
   const thickness=formationSize(dial('treeBranchThickness'),.25,1.0375,5,.45);
   const t=Math.max(.02,Math.min(radius*.36,length*.17)*thickness);
   const branchRing=(center,width)=>[[center[0]-uy*width,center[1]+ux*width,center[2]],[center[0]+uy*width,center[1]-ux*width,center[2]],[center[0],center[1],center[2]+width]];
   const lo=branchRing(root,t),hi=branchRing(tip,t*.2);
   for(let j=0;j<3;j++)emit([lo[j],lo[(j+1)%3],hi[(j+1)%3],hi[j]],bark[j]);
  }
  const foliage=settings?.sceneTreeFoliage==='on'||settings?.sceneTreeFoliage!=='off'&&settings?.treeFoliage;
  if(foliage){
   const spread=Math.max(1.05,radius*1.65,height*.21)*formationSize(dial('treeFoliageWidth'),.25,1,3,.5);
   const drop=dial('treeFoliageDrop');
   for(let i=0;i<4;i++){
    const a=phase+i*1.5708+(rand()-.5)*.38,offset=spread*(.54+rand()*.2);
    const lightSample=orient([cx+Math.cos(a)*offset,cy+Math.sin(a)*offset,p.z+height*(.83+rand()*.19-drop*(.12+i*.14))]);
    const [x,y,depth]=point(...lightSample);
    const width=spread*S*(1.05+rand()*.25),tall=width*(.53+rand()*.19);
    const projected=[[x-width/2,y-tall/2],[x+width/2,y-tall/2],[x+width/2,y+tall/2],[x-width/2,y+tall/2]];
    faces.push({p,projected,depth,z:null,preview,lightSample,leafColor:settings?.treeLeafColor,canopy:(terrainThemeSeed(p)+i)%4});
   }
  }
 }else{
  const hanging=Number.isFinite(ceiling),base=hanging?ceiling:p.z,sign=hanging?-1:1,height=Math.min(h*(.55+rand()*.4)*formationSize(dial('caveHeight'),.12,1,2,.5),hanging?ceiling-p.z:maxHeight-base);
  const diameter=formationSize(dial('caveDiameter'),.35,1,6,.45)*(1+(rand()-.5)*.32),bulb=dial('caveBulb'),rough=dial('caveCrannies');
  const broken=!hanging&&['flat','broken'].includes(settings?.rockFinish);
  const top=broken?snapHeight(base+height*.62):base+sign*height;
  const rise=top-base;
  const levels=[[base,.25*diameter,rough],[base+rise*.32,(.13+.12*bulb)*diameter,rough]];
  if(!broken)levels.push([base+rise*.73,(.04+.09*bulb)*diameter*(1.5-dial('caveTaper')),rough]);
  levels.push([top,broken?(.13+.07*bulb)*diameter:0,rough]);
  return mesh(levels,['#454745','#575b52','#67685b',settings?.rockFinish==='broken'?'#929288':'#77786b'],broken);
 }
}
function drawCustomColumn(p,preview,fill){
 const settings={...columnDefaults,...(formationDraft?.piece===p?formationDraft.values:p.terrainShape)};
 const dial=key=>settings[key]/100;
 const h=.5+dial('columnHeight')*8.333,r=.06+dial('columnDiameter')*.76;
 const taper=1-dial('columnTaper')*.75,wear=dial('columnWear'),ornament=dial('columnOrnament');
 const [w,d]=dimensions(p),cx=p.x+w/2,cy=p.y+d/2;
 const color=settings.columnColor??'#bda581',oxidation=dial('columnOxidation');
 const tint=(factor,patina)=>'#'+[1,3,5].map((i,j)=>{
  const base=parseInt(color.slice(i,i+2),16),mix=oxidation*patina;
  return Math.min(255,Math.round(base*factor*(1-mix)+[73,129,105][j]*mix)).toString(16).padStart(2,'0');
 }).join('');
 const ring=(z,radius,n,rough=0)=>Array.from({length:n},(_,i)=>{
  const a=(i+.5)*2*Math.PI/n+p.r*Math.PI/2;
  const radiusHere=radius*(1-rough*(.5+.5*Math.sin(i*8.1+z*23)));
  return [cx+Math.cos(a)*radiusHere,cy+Math.sin(a)*radiusHere,p.z+z];
 });
 function section(levels,n){
  const rings=levels.map(([z,radius,rough])=>ring(z,radius,n,rough));
  const emit=(points,shade)=>{face(points,preview?fill:shade,p,null,preview);faces.at(-1).special=true};
  if(!topDown)for(let l=1;l<rings.length;l++)for(let i=0;i<n;i++){
   const j=(i+1)%n;
   emit([rings[l-1][i],rings[l-1][j],rings[l][j],rings[l][i]],tint(.77+.22*(1+Math.cos(i*2*Math.PI/n-angle))/2, .45+.45*Math.sin(i*3+l)**2));
  }
  emit(rings.at(-1),tint(1.12,.65));
 }
 const sides=shape=>shape==='square'?4:shape==='octagonal'?8:12;
 section([[0,r*(.8+dial('columnBase')*1.7),wear*.18],[h*.12,r*(.8+dial('columnBase')*1.7),wear*.13]],sides(settings.columnBaseShape));
 const shaft=[[h*.12,r,wear*.12],[h*.48,r*(1-(1-taper)*.4),wear*.2],[h*.88,r*taper,wear*.25]];
 if(ornament){
  shaft.splice(1,0,[h*.18,r*(1+ornament*.32),wear*.12],[h*.23,r*(1+ornament*.32),wear*.15]);
  shaft.splice(shaft.length-1,0,[h*.75,r*taper*(1+ornament*.45),wear*.12],[h*.8,r*taper*(1+ornament*.45),wear*.15]);
 }
 section(shaft,12);
 section([[h*.88,r*taper,wear*.1],[h*.94,r*taper*(.8+dial('columnTop')*1.7),wear*.23],[h,r*taper*(.8+dial('columnTop')*1.7),wear*.3]],sides(settings.columnTopShape));
}
function hasCustomColumn(p,formation){
 return formation==='column'||!formation&&(formationDraft?.piece===p||Object.keys(columnDefaults).some(key=>p.terrainShape?.[key]!==undefined)||p.terrainShape?.columnColor||p.terrainShape?.columnBaseShape||p.terrainShape?.columnTopShape);
}
function drawSpecialTerrain(p,preview,fill){
 const [w,d,h]=dimensions(p),{x,y,z}=p;
 if(p.type==='column'){
  const appearance=areas.find(a=>a.shape==='appearance')?.appearance;
  const theme=appearance?.terrainTheme;
  const formation=p.terrainShape?.componentKind??terrainThemes[theme]?.formation;
  if(formation&&formation!=='column'){drawBiomeColumn(p,preview,fill,formation,{...appearance?.terrainShape,...(formation==='tree'?treePreview:null),...(formationDraft?.piece===p?formationDraft.values:p.terrainShape)});return}
  if(hasCustomColumn(p,formation)){drawCustomColumn(p,preview,fill);return}
  const segments=S*w<12?8:16;
  const civic=theme==='civic';
  const rim=Array.from({length:segments},(_,i)=>{const a=i*2*Math.PI/segments;return [x+w/2+Math.cos(a)*w/2,y+d/2+Math.sin(a)*d/2]});
  for(let i=0;i<rim.length;i++){
   const a=rim[i],b=rim[(i+1)%rim.length];
   const light=.5+.5*Math.cos(i*2*Math.PI/segments-angle);
   face([[...a,z],[...b,z],[...b,z+h],[...a,z+h]],preview?fill:'hsl(38 26% '+(43+light*24)+'%)',p,null,preview);
   faces.at(-1).special=true;
  }
  if(civic){
   const ring=(v,scale,height)=>[x+w/2+(v[0]-x-w/2)*scale,y+d/2+(v[1]-y-d/2)*scale,height];
   for(let i=0;i<segments;i++){
    const a=rim[i],b=rim[(i+1)%segments];
    for(const [low,high,inner,outer] of [[z,z+.14,1.32,1],[z+h-.24,z+h,1,1.34]]){
     face([ring(a,inner,low),ring(b,inner,low),ring(b,outer,high),ring(a,outer,high)],'#d6cbb2',p,null,preview);
     Object.assign(faces.at(-1),{special:true,columnTrim:true});
    }
   }
  }
  face(rim.map(v=>[...v,z+h]),fill,p,z+h,preview);
  faces.at(-1).special=true;return;
 }
 const horizontal=p.type==='ceilingArt',turned=p.r%2;
 const start=turned?[x+w/2,y]:[x,y+d/2],end=turned?[x+w/2,y+d]:[x+w,y+d/2];
 const plane=horizontal?[[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]]:[[...start,z+h],[...end,z+h],[...end,z],[...start,z]];
 face(plane,fill,p,null,preview);
 faces.at(-1).special=true;
 faces.at(-1).sceneryArt=p.art;
}
const unitCorners=[[0,0],[1,0],[1,1],[0,1]];
function turnTerrainPoints(points,p,degrees=p?.terrainYaw){
 if(!degrees||p.type==='standee'||!Object.hasOwn(types,p.type))return points;
 const [w,d]=dimensions(p),cx=p.x+w/2,cy=p.y+d/2;
 const radians=degrees*Math.PI/180,c=Math.cos(radians),sin=Math.sin(radians);
 return points.map(([x,y,...rest])=>[cx+(x-cx)*c-(y-cy)*sin,cy+(x-cx)*sin+(y-cy)*c,...rest]);
}
function terrainFootprint(p){
 if(p.form==='polygon')return turnTerrainPoints(volumeRoof(p),p);
 const [w,d]=dimensions(p);
 return turnTerrainPoints([[p.x,p.y],[p.x+w,p.y],[p.x+w,p.y+d],[p.x,p.y+d]],p);
}
function footprintsOverlap(a,b){
 return ![a,b].some(outline=>outline.some(([x,y],i)=>{
  const [u,v]=outline[(i+1)%outline.length];
  const projection=([px,py])=>(u-x)*py-(v-y)*px;
  const ap=a.map(projection),bp=b.map(projection);
  return Math.max(...ap)<=Math.min(...bp)+1e-8||Math.max(...bp)<=Math.min(...ap)+1e-8;
 }));
}
function validPolygon(vertices){
 if(!Array.isArray(vertices)||vertices.length<3||vertices.length>16||
  !vertices.every(v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))return false;
 return vertices.every(([x,y],i)=>{
  const [u,v]=vertices[(i+1)%vertices.length];
  return vertices.every(([a,b],j)=>j===i||j===(i+1)%vertices.length||(u-x)*(b-y)-(v-y)*(a-x)>1e-8);
 });
}
let cutawayHeight=Infinity;
for(let level=1;level<=12;level++)el('floorCutaway').add(new Option('Below '+level*5+' ft',level));
el('floorCutaway').onchange=()=>{
 cutawayHeight=el('floorCutaway').value===''?Infinity:Number(el('floorCutaway').value);
 movementRenderCache=null;draw();
};
function hiddenByCutaway(p){
 return cutawayHeight<Infinity&&p.type==='ceilingArt'||(p.origin?.[2]??p.z)>=cutawayHeight||
  cutawayHeight<Infinity&&p.type!=='standee'&&p.type!=='ceilingArt'&&p.z<cutawayHeight&&
  p.z+dimensions(p)[2]>=cutawayHeight&&dimensions(p)[2]<=.5;
}
function volumeRoof(p){
 const [w,d,h]=dimensions(p);
 const local=p.form==='pyramid'?unitCorners.map(()=>[.5,.5,1]):
  p.form==='wedge'?unitCorners.map(([x,y])=>[x,y,x]):
  (p.form==='polygon'?p.vertices:p.corners||unitCorners).map(([x,y])=>[x,y,1]);
 return local.map(([u,v,t])=>{
  for(let i=0;i<p.r;i++)[u,v]=[1-v,u];
  return [p.x+u*w,p.y+v*d,p.z+t*h];
 });
}
function drawShapedVolume(p,preview,fill,side){
 const [w,d,h]=dimensions(p);
 let bottom=volumeRoof({...p,form:undefined,corners:undefined}).map(([x,y])=>[x,y,p.z]);
 const top=topDown&&p.form==='pyramid'?bottom.map(([x,y])=>[x,y,p.z+h]):volumeRoof(p);
 if(p.form==='polygon')bottom=top.map(([x,y])=>[x,y,p.z]);
 const emit=(poly,color,edge,z=null)=>{
  const projected=turnTerrainPoints(poly,p).map(v=>point(...v));
  const winding=projected.reduce((sum,[x,y],i)=>{const [u,v]=projected[(i+1)%poly.length];return sum+x*v-y*u},0);
  if(winding<=1e-5)return;
  face(poly,color,p,z,preview);Object.assign(faces.at(-1),{edge,shaped:true});
 };
 emit(top,fill,4,topDown||p.form==='corners'||p.form==='polygon'?p.z+h:null);
 if(topDown)return;
 for(let i=0;i<top.length;i++){
  const j=(i+1)%top.length;
  emit([bottom[i],bottom[j],top[j],top[i]],side,([2,1,3,0][(i+p.r)%4]));
 }
}
function drawTerrainVolume(p,preview,fill,side){
 if(p.form){drawShapedVolume(p,preview,fill,side);return}
 const [w,d,h]=dimensions(p),{x,y,z}=p,top=z+h;
 const a=[x,y],b=[x+w,y],c=[x+w,y+d],e=[x,y+d];
 face([a,b,c,e].map(v=>[...v,top]),fill,p,top,preview);
 faces.at(-1).volumeTop=true;
 if(topDown)return;
 const cameraAngle=angle+(p.terrainYaw??0)*Math.PI/180,cos=Math.cos(cameraAngle),sin=Math.sin(cameraAngle);
 for(const [from,to,visibility,edge] of [[a,e,-sin,0],[b,c,sin,1],[a,b,-cos,2],[e,c,cos,3]]){
  if(visibility<=1e-6)continue;
  face([[...from,z],[...to,z],[...to,top],[...from,top]],side,p,null,preview);
  faces.at(-1).edge=edge;
 }
}
function drawVolumeGrid(f,paths){
 let levels=paths.get(f.p);
 if(!levels){levels=new Map();paths.set(f.p,levels)}
 let path=levels.get(f.z);
 if(!path){
  const [w,d]=dimensions(f.p),{x,y}=f.p,z=f.z;
  path=new Path2D();
  for(let i=1;i<w;i++){path.moveTo(...point(x+i,y,z).slice(0,2));path.lineTo(...point(x+i,y+d,z).slice(0,2))}
  for(let i=1;i<d;i++){path.moveTo(...point(x,y+i,z).slice(0,2));path.lineTo(...point(x+w,y+i,z).slice(0,2))}
  levels.set(z,path);
 }
 ctx.strokeStyle='#58473585';ctx.stroke(path);
}
function volumeHandles(p){
 if(p.form==='corners'){
  const roof=volumeRoof(p);
  return [...roof.map((point,i)=>[...point,3,i]),...roof.map((point,i)=>[...point.map((v,j)=>(v+roof[(i+1)%4][j])/2),4,i])];
 }
 const [w,d,h]=dimensions(p),{x,y,z}=p,top=z+h;
 return [[x,y+d/2,top,0,-1],[x+w,y+d/2,top,0,1],[x+w/2,y,top,1,-1],[x+w/2,y+d,top,1,1],[x+w/2,y+d/2,top,2,1]];
}
let cutter=null;
function activeVolume(){
 if(cutter&&selected===cutter.target&&!playing&&!terrainLocked)return cutter.box;
 return !playing&&!terrainLocked&&!tool&&!tokenTool&&!brush&&!measuring&&!areaMode&&selected?.type==='volume'?selected:null;
}
function drawVolumeHandles(){
 const p=activeVolume();
 if(!p)return;
 for(const [x,y,z,axis] of volumeHandles(drag?.volume?.next||p)){
  const [sx,sy]=point(x,y,z);
  ctx.fillStyle=axis>=3?'#b3d6a0':axis===2?'#a4c6d3':'#efcb86';ctx.fillRect(sx-5,sy-5,10,10);
  ctx.strokeStyle='#52402a';ctx.strokeRect(sx-5,sy-5,10,10);
 }
}
function startVolumeResize(x,y){
 const p=activeVolume();
 if(!p)return false;
 for(const [a,b,c,axis,direction] of volumeHandles(p).toReversed()){
  const [sx,sy]=point(a,b,c);
  if(Math.hypot(x-sx,y-sy)>9)continue;
  if(axis>=3){drag={volume:{piece:p,corner:direction,edge:axis===4,anchor:inverse(x,y,c),height:c},x,y};return true}
  const unit=[a,b,c];unit[axis]+=direction;
  const [ux,uy]=point(...unit);
  if(Math.hypot(ux-sx,uy-sy)<2)continue;
  drag={volume:{piece:p,axis,direction,dx:ux-sx,dy:uy-sy},x,y};return true;
 }
 return false;
}
function volumeResizeAt(resize,x,y,altKey){
 const {piece,axis,direction,dx,dy}=resize;
 const free=!!altKey;
 const step=free?.25:axis===2?.5:1;
 const rawDelta=((x-drag.x)*dx+(y-drag.y)*dy)/(dx*dx+dy*dy);
 let next=resizedVolume(piece,axis,direction,step*Math.round(rawDelta/step),free);
 // Alt-resize can snap the moving face flush to an existing raised block.
 // Do not create overlap: the shared edge must equal the neighbor's edge.
 if(free&&axis<2){
  const key=axis===0?'x':'y',other=axis===0?'y':'x';
  const movingEdge=direction<0?next[key]:next[key]+dimensions(next)[axis];
  const candidateEdges=[];
  for(const neighbor of pieces){
   if(neighbor===piece||neighbor.type!=='volume')continue;
   const dims=dimensions(neighbor),ours=dimensions(next);
   if(next.z+ours[2]<=neighbor.z+1e-6||neighbor.z+dims[2]<=next.z+1e-6)continue;
   if(next[other]+ours[1-axis]<=neighbor[other]+1e-6||neighbor[other]+dims[1-axis]<=next[other]+1e-6)continue;
   candidateEdges.push(neighbor[key],neighbor[key]+dims[axis]);
  }
  const nearest=candidateEdges.sort((a,b)=>Math.abs(a-movingEdge)-Math.abs(b-movingEdge))[0];
  if(nearest!==undefined&&Math.abs(nearest-movingEdge)<=.5){
   const delta=direction<0?piece[key]-nearest:nearest-(piece[key]+dimensions(piece)[axis]);
   const snapped=resizedVolume(piece,axis,direction,delta,true);
   if(Math.abs((direction<0?snapped[key]:snapped[key]+dimensions(snapped)[axis])-nearest)<1e-5)next=snapped;
  }
 }
 return next;
}
function moveVolumeCorner({piece:p,corner,edge,anchor},pointer){
 const [w,d]=dimensions(p),corners=(p.corners||unitCorners).map(pair=>[...pair]);
 let dx=(pointer[0]-anchor[0])/w,dy=(pointer[1]-anchor[1])/d;
 for(let i=0;i<p.r;i++)[dx,dy]=[dy,-dx];
 for(const index of edge?[corner,(corner+1)%4]:[corner])corners[index]=corners[index].map((v,i)=>{
  const low=unitCorners[index][i]===0;
  return Math.max(low?0:.55,Math.min(low?.45:1,v+(i?dy:dx)));
 });
 return {...p,corners};
}
function resizedVolume(p,axis,direction,delta,free=false){
 const extents=dimensions(p),original=extents[axis];
 const coordinate=['x','y','z'][axis];
 const max=axis===2?maxHeight-p.z:direction<0?p[coordinate]+original:gridLimit(axis)-p[coordinate];
 extents[axis]=Math.max(Math.min(original,free?.25:axis===2?.5:1),Math.min(max,original+delta));
 const next={...p,extents:p.r%2?[extents[1],extents[0],extents[2]]:extents};
 if(direction<0)next[coordinate]+=original-extents[axis];
 return next;
}
el('volumeShape').onchange=()=>{
 if(playing||terrainLocked||selected?.type!=='volume')return;
 const form=el('volumeShape').value;
 if(form==='polygon'){
  const input=prompt('Enter 3–16 convex outline points in clockwise map order (0–1 coordinates).',
   JSON.stringify(selected.vertices??[[.25,0],[.75,0],[1,.5],[.75,1],[.25,1],[0,.5]]));
  if(input===null){refresh();return}
  try{
   const vertices=JSON.parse(input);
   if(!validPolygon(vertices))throw Error();
   change({form,vertices});
  }catch{message('Enter a convex polygon with 3–16 points in clockwise map order.')}
 }else change({form:form==='box'?undefined:form,vertices:undefined});
 refresh();
};
function subtractVolume(block,offset,size){
 const dimensionsWorld=dimensions(block),origin=[block.x,block.y,block.z];
 const lo=offset.map((v,i)=>Math.max(0,v)),hi=offset.map((v,i)=>Math.min(dimensionsWorld[i],v+size[i]));
 if(lo.some((v,i)=>v>=hi[i]))return null;
 const remaining=[];
 const start=[0,0,0],end=[...dimensionsWorld];
 function append(a,b){
  if(a.some((v,i)=>v>=b[i]))return;
  const [x,y,z]=a.map((v,i)=>v+origin[i]),extent=b.map((v,i)=>v-a[i]);
  remaining.push({...block,x,y,z,extents:block.r%2?[extent[1],extent[0],extent[2]]:extent,roomId:undefined});
 }
 for(let axis=0;axis<3;axis++){
  const lowEnd=[...end],highStart=[...start];
  lowEnd[axis]=lo[axis];highStart[axis]=hi[axis];
  append(start,lowEnd);append(highStart,end);
  start[axis]=lo[axis];end[axis]=hi[axis];
 }
 return remaining;
}
el('volumeSubtract').onclick=()=>startBoxCutter(false);
el('halfCutter').onclick=()=>startBoxCutter(true);
function startBoxCutter(half){
 if(playing||terrainLocked||selected?.type!=='volume'||selected.form)return;
 const target=selected,[w,d,h]=dimensions(target);
 cutter={target,box:{type:'volume',r:0,x:target.x+Math.floor((w-1)/2),y:target.y,z:half?target.z+h-.5:target.z,extents:[1,d,half?.5:Math.min(2,h)]}};
 message('Drag to move the red cutter. Use its handles to resize it.');refresh();
}
el('cutCancel').onclick=()=>{cutter=null;refresh()};
for(const [id,dz] of [['cutRaise',1],['cutLower',-1]])el(id).onclick=()=>{
 if(!cutter)return;
 const p=cutter.box;p.z=Math.max(0,Math.min(maxHeight-dimensions(p)[2],p.z+dz*.5));refresh();
};
el('cutApply').onclick=()=>{
 if(!cutter||playing||terrainLocked)return;
 const {target,box}=cutter;
 const remaining=subtractVolume(target,[box.x-target.x,box.y-target.y,box.z-target.z],dimensions(box));
 if(!remaining){message('The cutter needs to overlap the selected block.');return}
 const terrain=pieces.flatMap(p=>p===target?remaining:[p]);
 if(tokens.some(t=>!supported(t,terrain))||areas.some(a=>a.shape==='difficult'&&!validDifficultTerrain(a,terrain))){
  message('Move supported standees or difficult terrain before cutting.');return;
 }
 remember();pieces=terrain;group.clear();selected=null;cutter=null;
 message('Overlap subtracted.');refresh();
};
let floorEdit=null;
const canEditFloor=()=>!playing&&!terrainLocked&&roomProfile?.gm!==false;
function floorBox(p){
 const [w,d,h]=dimensions(p);
 return [[p.x,p.x+w],[p.y,p.y+d],[p.z,p.z+h]];
}
function floorOverlap(a,b){
 return a.every(([lo,hi],i)=>lo<b[i][1]&&b[i][0]<hi);
}
function floorContains(a,b){
 return a.every(([lo,hi],i)=>lo<=b[i][0]&&hi>=b[i][1]);
}
function floorSlab(bounds,z,height,source){
 const [[x,right],[y,bottom]]=bounds;
 const {wash,opaquePaint,patterns,plainFaces,groundSurface,surfaceTextures}=source||{};
 return {type:'volume',r:0,x,y,z,extents:[right-x,bottom-y,height],
  wash,opaquePaint,patterns,plainFaces,surfaceTextures,groundSurface:source?groundSurface:true};
}
function flatFloorPiece(p){
 return ['volume','terrace','stone','bridge'].includes(p.type)&&!p.form&&!p.stairTread&&
  !p.cut&&!p.cuts?.some(Boolean)&&floorBox(p).flat().every(n=>Number.isInteger(n*4));
}
function planFloorEdit(bounds,z,delta){
 const top=z+delta;
 if(!delta||top<0||top>maxHeight)return {error:'Choose a nonzero change within the battlefield height limits.'};
 const swept=[...bounds,[Math.min(z,top),Math.max(z,top)]];
 const terrain=[], slabs=[], movedTerrain=[];
 let covered=0;
 for(const p of pieces){
  const box=floorBox(p),footprint=box.slice(0,2);
  if(!floorOverlap(bounds,footprint)){terrain.push(p);continue;}
  const clip=bounds.map(([lo,hi],i)=>[Math.max(lo,box[i][0]),Math.min(hi,box[i][1])]);
  if(box[2][0]>=z){
   const canSplit=flatFloorPiece(p)||['wall','pillar'].includes(p.type)&&!p.form&&!p.cut&&!p.cuts?.some(Boolean);
   if(!canSplit||floorContains(bounds,footprint)){
    movedTerrain.push({...p,z:p.z+delta});continue;
   }
   const [, ,height]=dimensions(p);
   const block={...p,type:'volume',extents:p.r%2?[box[1][1]-p.y,box[0][1]-p.x,height]:[box[0][1]-p.x,box[1][1]-p.y,height]};
   terrain.push(...subtractVolume(block,[clip[0][0]-p.x,clip[1][0]-p.y,0],
    [clip[0][1]-clip[0][0],clip[1][1]-clip[1][0],height]));
   const [width,depth]=clip.map(([lo,hi])=>hi-lo);
   movedTerrain.push({...block,x:clip[0][0],y:clip[1][0],z:p.z+delta,roomId:undefined,
    extents:p.r%2?[depth,width,height]:[width,depth,height]});continue;
  }
  if(box[2][1]!==z||!flatFloorPiece(p)){terrain.push(p);continue;}
  covered+=(clip[0][1]-clip[0][0])*(clip[1][1]-clip[1][0]);
  if(delta>0){
   terrain.push(p);slabs.push(floorSlab(clip,z,delta,p));continue;
  }
  if(top<box[2][0])return {error:'This floor cannot be lowered past the bottom of its slab.'};
  const block={...p,type:'volume',extents:p.r%2?[box[1][1]-p.y,box[0][1]-p.x,z-p.z]:[box[0][1]-p.x,box[1][1]-p.y,z-p.z]};
  terrain.push(...subtractVolume(block,[clip[0][0]-p.x,clip[1][0]-p.y,top-p.z],
   [clip[0][1]-clip[0][0],clip[1][1]-clip[1][0],-delta]));
 }
 const [[left,right],[front,back]]=bounds;
 if(z!==0&&covered!==(right-left)*(back-front))return {error:'Select a rectangle fully covered by flat floor at the starting elevation.'};
 if(z===0)slabs.push(floorSlab(bounds,0,delta));
 const withinHeight=p=>p.z>=0&&p.z+dimensions(p)[2]<=maxHeight;
 if(movedTerrain.some(p=>!withinHeight(p)))return {error:'The moved terrain would exceed the battlefield height limits.'};
 terrain.push(...[...slabs,...movedTerrain].map(p=>({...p,floorAdjusted:true})));
 const containsCenter=(x,y)=>bounds.every(([lo,hi],i)=>[x,y][i]>=lo&&[x,y][i]<hi);
 const moved=[];
 const nextTokens=tokens.map(t=>{
  if(t.z<z||!floorOverlap(bounds,floorBox(t).slice(0,2)))return t;
  const next={...t,z:t.z+delta,floorAdjusted:true};
  moved.push([t,next]);return next;
 });
 if(moved.some(([,t])=>!withinHeight(t)))return {error:'A moved standee would exceed the battlefield height limits.'};
 const nextAreas=[];
 let doors=0;
 for(const a of areas){
  if(a.shape==='difficult'&&a.origin[2]===z&&floorOverlap(bounds,difficultBounds(a))){
   const shifted={...a,origin:[...a.origin.slice(0,2),top]};
   nextAreas.push(shifted);continue;
  }
  if((a.shape==='opening'||a.shape==='light')&&a.origin[2]>=z){
   const [x,y,height]=a.origin,offset=a.shape==='opening'?.5:0;
   if(containsCenter(x+offset,y+offset)){
    if(height+delta<0||height+delta>maxHeight)return {error:'A moved fixture would exceed the height limits.'};
    nextAreas.push({...a,origin:[x,y,height+delta]});continue;
   }
  }
  if(a.shape==='opening'&&a.kind==='Door'){
   const [x,y,height]=a.origin;
   if(height<=swept[2][1]&&height+2>swept[2][0]&&floorOverlap(bounds,[[x,x+1],[y,y+1]]))doors++;
  }
  nextAreas.push(a);
 }
 return {terrain,nextTokens,nextAreas,moved,movedTerrain,doors};
}
function floorBounds(){
 const {first,last,step}=floorEdit;
 return first.map((n,i)=>[Math.min(n,last[i]),Math.max(n,last[i])+step]);
}
function previewFloorEdit(){
 if(!floorEdit?.last)return;
 const feet=el('floorHeight').valueAsNumber;
 const plan=!Number.isInteger(feet/1.25)?{error:'Enter a height change in 1.25 ft increments.'}:
  planFloorEdit(floorBounds(),floorEdit.z,feet/5);
 floorEdit.plan=plan;
 el('floorApply').disabled=!!plan.error;
 el('floorStatus').textContent=plan.error||plan.movedTerrain.length+' terrain section(s) and '+plan.moved.length+' standee(s) will move.'+
  (plan.doors?' Check the step and clearance at '+plan.doors+' affected door(s).':'');
 draw();
 return plan;
}
function pickFloorEdit(x,y,precise,elevated=false){
 if(!floorEdit.first){
  // Default to the actual ground plane, not the frontmost rendered
  // terrain face. An elevated plateau farther up-screen can overlap
  // the ground in perspective and incorrectly lock the selection to
  // its height, producing a false straight-line selection boundary.
  // Shift-click explicitly targets an elevated floor instead.
  const face=elevated?hit(x,y,null,true,f=>!f.p||flatFloorPiece(f.p)):null;
  const z=elevated?(face?.z??0):0;
  floorEdit.z=z;floorEdit.step=precise ? .25 : 1;
 }
 const {z,step}=floorEdit;
 // Project against the selected floor plane. Never clamp an off-map ray to
 // the nearest border: that made an entire strip of cursor positions select
 // the same edge square in oblique camera views.
 // The battlefield origin is in physical WORLD coordinates, while
 // inverse() returns calibrated VTT GRID coordinates. Check the ray in
 // world space first, then transform it into the grid for tile selection.
 // Comparing the grid result directly to floorOrigin rejects the entire
 // scene after a nine-point calibration.
 const world=rawInverse(x,y,z*calibratedVerticalScale());
 const grid=sceneGrid();
 const origins=[Number(grid.floorOriginX)||0,Number(grid.floorOriginY)||0];
 if(!world.every((n,i)=>Number.isFinite(n)&&n>=origins[i]-1e-6&&n<origins[i]+gridLimit(i)-1e-6)){
  el('floorStatus').textContent='Point at a square within the battlefield to select it.';
  return;
 }
 const projected=worldToGrid(...world);
 if(!projected.every(Number.isFinite))return;
 const cell=projected.map(n=>Math.floor(n/step+1e-8)*step);
 if(!floorEdit.first){
  floorEdit.first=cell;
  el('floorStatus').textContent='Click the opposite corner on the same floor.';
  draw();return;
 }
 floorEdit.last=cell;previewFloorEdit();
}
function drawFloorEdit(){
 if(!floorEdit?.first)return;
 const {first,last,step,z,plan}=floorEdit;
 const [[x,right],[y,bottom]]=last?floorBounds():first.map(n=>[n,n+step]);
 const corners=[[x,y],[right,y],[right,bottom],[x,bottom]];
 const feet=el('floorHeight').valueAsNumber;
 const height=last&&Number.isFinite(feet)?Math.max(0,Math.min(maxHeight,z+feet/5)):z;
 const from=corners.map(p=>point(...p,z)),to=corners.map(p=>point(...p,height));
 const outline=plan?.error?'#f27466':'#ffd178';
 polygon(from,'#ffd17819',outline);
 if(height!==z){
  for(let i=0;i<4;i++){const j=(i+1)%4;polygon([from[i],from[j],to[j],to[i]],'#ffd17819',outline)}
  polygon(to,'#ffd17840',outline);
 }
 for(const [,t] of plan?.moved??[]){
  const [cx,cy]=point(...basePoint(t));
  polygon([[cx,cy-5],[cx+5,cy],[cx,cy+5],[cx-5,cy]],'#ffd178','#463015');
 }
}
el('floorEdit').onclick=()=>{
 if(!canEditFloor())return;
 exitTool();floorEdit={};el('floorApply').disabled=true;
 el('floorStatus').textContent='Click a ground-floor corner. Shift-click to start on a raised floor; Alt selects quarter-squares.';
 refresh();
};
el('floorHeight').oninput=previewFloorEdit;
el('floorCancel').onclick=exitFloorEdit;
function exitFloorEdit(){floorEdit=null;refresh()}
el('floorApply').onclick=()=>{
 if(!canEditFloor()||!floorEdit?.last)return;
 const plan=previewFloorEdit();
 if(plan.error)return;
 remember();pieces=plan.terrain;tokens=plan.nextTokens;areas=plan.nextAreas;
 floorEdit=null;selected=null;group.clear();
 message('Floor elevation changed. '+plan.moved.length+' standee(s) moved together.');refresh();
};
function drawCutter(){
 if(!cutter)return;
 const p=drag?.volume?.next||cutter.box,[w,d,h]=dimensions(p),{x,y,z}=p;
 const base=[[x,y],[x+w,y],[x+w,y+d],[x,y+d]];
 const top=base.map(v=>point(...v,z+h)),bottom=base.map(v=>point(...v,z));
 polygon(top,'#db534b52','#ad332c');
 for(let i=0;i<4;i++){const j=(i+1)%4;polygon([bottom[i],bottom[j],top[j],top[i]],'#db534b24','#ad332c')}
}
function drawPiece(p,preview=false){
 if(hiddenByCutaway(p))return;
 if(!preview&&p.type!=='standee'){
  const [w,d]=dimensions(p);
  // Broad phase only: all footprint corners must share one disconnected region.
  // Complex terrain shapes continue through the ordinary renderer.
  if(!p.terrainShape&&!p.surfaceTextures){
   const footprint=[[p.x,p.y],[p.x+w,p.y],[p.x+w,p.y+d],[p.x,p.y+d]];
   if(earlyRoomDisconnected(footprint)){earlyRoomCullCount++;return}
   if(Math.abs(p.z)<=.15&&earlySectorInvisible(footprint))return;
  }
 }
 if(p.type==='standee'){drawStandee(p,preview);return}
 const [w,d,h]=dimensions(p),[,,,,cap,side]=types[p.type];
 const {x,y,z}=p;
 const fill=preview?(valid(p)?'#a4b76a':'#b65d54'):cap;
 if(topDown&&p.type==='column'){
  const appearance=areas.find(a=>a.shape==='appearance')?.appearance;
  const formation=p.terrainShape?.componentKind??terrainThemes[appearance?.terrainTheme]?.formation;
  if(formation&&formation!=='column'){
   drawBiomeColumn(p,preview,fill,formation,{...appearance?.terrainShape,...(formation==='tree'?treePreview:null),...(formationDraft?.piece===p?formationDraft.values:p.terrainShape)});
   return;
  }
  if(hasCustomColumn(p,formation)){drawCustomColumn(p,preview,fill);return}
  const top=z+h;
  face([[x,y,top],[x+w,y,top],[x+w,y+d,top],[x,y+d,top]],fill,p,null,preview);
  Object.assign(faces.at(-1),{flatColumn:true,special:true});
  return;
 }
 if(topDown&&sceneryPiece(p)){
  if(p.type==='scatter'){
   face([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]],fill,p,null,preview);
   faces.at(-1).sceneryArt=p.art;
  }
  return;
 }
 if(p.type==='column'||sceneryPiece(p)){drawSpecialTerrain(p,preview,fill);return}
 if(p.type==='volume'){drawTerrainVolume(p,preview,fill,side);return}
 const cuts=edgeCuts(p), ceiling=z+h;
 const depth=Math.max(...cuts.map(c=>c?.depth||0)),shoulder=ceiling-depth;
 function inset(c,height){
  if(!c)return 0;
  const t=Math.max(0,Math.min(1,1+(height-ceiling)/c.depth));
  return c.depth*(c.kind==='fillet'?1-Math.sqrt(1-t*t):t);
 }
 function ring(height,i,j){
  return [x+i+(i===0?inset(cuts[0],height):i===w?-inset(cuts[1],height):0),
   y+j+(j===0?inset(cuts[2],height):j===d?-inset(cuts[3],height):0),height];
 }
 for(let i=0;i<w;i++)for(let j=0;j<d;j++){
  face([[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([u,v])=>ring(ceiling,u,v)),fill,p,ceiling,preview);
  if(p.type==='stream'||p.type==='waterfall')faces[faces.length-1].material=p.r%2?'flow-y':'flow-x';
  if(p.type==='fountain')faces[faces.length-1].material='fountain-pool';
 }
 if(topDown)return;
 function strip(start,end,lower,upper,color,edge){
  face([ring(lower,...start),ring(lower,...end),ring(upper,...end),ring(upper,...start)],color,p,null,preview);
  faces[faces.length-1].edge=edge;
 }
 const edges=[],cameraAngle=angle+(p.terrainYaw??0)*Math.PI/180;
 const c=Math.cos(cameraAngle),sin=Math.sin(cameraAngle);
 for(let j=0;j<d;j++)edges.push([[0,j],[0,j+1],-sin,0],[[w,j],[w,j+1],sin,1]);
 for(let i=0;i<w;i++)edges.push([[i,0],[i+1,0],-c,2],[[i,d],[i+1,d],c,3]);
 const levels=[...new Set(cuts.flatMap(c=>{
  if(!c)return [];
  const steps=c.kind==='fillet'?8:1;
  return Array.from({length:steps+1},(_,i)=>ceiling-c.depth*(1-Math.sin(Math.PI*i/(2*steps))));
 }))].sort((a,b)=>a-b);
 for(const [start,end,facing,edge] of edges){
  const rock=p.type==='waterfall'&&!(p.r%2?edge<2:edge>=2);
  const color=preview?fill:rock?'#646d69':side;
  if(facing>1e-8){
   for(let k=z;k<shoulder;k++){
    strip(start,end,k,Math.min(k+1,shoulder),color,edge);
    if(p.type==='waterfall')faces[faces.length-1].material=rock?'stone':'flow-fall';
   }
  }
  for(let i=1;i<levels.length;i++){
   const lower=levels[i-1],upper=levels[i];
   const slope=(inset(cuts[edge],upper)-inset(cuts[edge],lower))/(upper-lower);
   if(facing*Math.cos(tilt)+slope*Math.sin(tilt)<=1e-8)continue;
   strip(start,end,lower,upper,color,edge);
   faces[faces.length-1].cut=true;
   faces[faces.length-1].shade=slope/(1+slope);
  }
 }
}
function visibleProjection(points,margin=2){
 if(studioWebGLCapture&&!studioWebGLBoundedCapture)return true;
 if(studioWebGLCapture&&studioWebGLBoundedCapture)margin+=studioWebGLCaptureMargin();
 return !(points.every(p=>p[0]<-margin)||points.every(p=>p[0]>W+margin)||
  points.every(p=>p[1]<-margin)||points.every(p=>p[1]>H+margin));
}
function visiblePiece(p){
 if(p.type==='standee'){
  const [x,y]=point(...basePoint(p)),half=S*p.size*.55;
  const bottom=p.flying?point(p.x+p.size/2,p.y+p.size/2,shadowLevel(p))[1]:y;
  return visibleProjection([[x-half,y-standeeArtHeight(p)-48],[x+half,bottom+half*.45]],30);
 }
 const [w,d,h]=dimensions(p),corners=[];
 for(const x of [p.x,p.x+w])for(const y of [p.y,p.y+d])for(const z of [p.z,p.z+h])corners.push([x,y,z]);
 const projectedCorners=turnTerrainPoints(corners,p).map(v=>point(...v));
 const theme=p.type==='column'?areas.find(a=>a.shape==='appearance')?.appearance?.terrainTheme:null;
 let treePadding=theme&&terrainThemes[theme]?.formation?S*2*(p.terrainShape?.formationScale??1):0;
 if(theme==='forest'){
  const scene=areas.find(a=>a.shape==='appearance')?.appearance?.terrainShape;
  const settings={...terrainShapeDefaults,...scene,...treePreview,...(formationDraft?.piece===p?formationDraft.values:p.terrainShape)};
  const height=formationSize(settings.treeHeight/100,.4,h*.82,9,.75)*Math.max(.25,Math.min(5,settings.sceneTreeHeightScale/100));
  const radius=formationSize(settings.treeThickness/100,.055,.125,2,.45)*Math.max(.25,Math.min(16,settings.sceneTreeWidthScale/100))*(settings.formationScale??1);
  if(settings.treeLog)projectedCorners.push(point(p.x+.25+Math.cos(p.r*Math.PI/2)*height,p.y+.25+Math.sin(p.r*Math.PI/2)*height,p.z+radius));
  else projectedCorners.push(point(p.x+.25,p.y+.25,p.z+height*1.45));
  const base=radius*formationSize(settings.treeBaseDiameter/100,.35,1,3,.5);
  treePadding=S*(Math.max((settings.sceneTreeFoliage==='on'||settings.sceneTreeFoliage!=='off'&&settings.treeFoliage)?Math.max(1.05,radius*1.65,height*.21)*formationSize(settings.treeFoliageWidth/100,.25,1,3,.5)*1.5:0,radius*3.4,settings.treeRoots?base*.65+Math.max(.45,base*1.85)*formationSize(settings.treeRootSpread/100,.18,1,5,.3)+radius*2:base)+height*.40);
 }
 if(terrainThemes[theme]?.formation==='cave'){
  const ceiling=caveCeiling(p);if(Number.isFinite(ceiling))projectedCorners.push(point(p.x+.25,p.y+.25,ceiling));
 }
 return visibleProjection(projectedCorners,theme==='forest'?treePadding:theme==='mountain'||terrainThemes[theme]?.formation==='cave'?S*4:0);
}
function barnWall(p){
 if(p.type==='wall')return true;
 if(p.type!=='volume'||p.form)return false;
 const [w,d,h]=dimensions(p);
 return Math.min(w,d)<=1&&h>=2&&Math.max(w,d)>=2;
}
const terrainThemes=Object.freeze({jungle:{ground:'#5d7042',top:'#476334',side:'#484b49',column:'#69695b',columnPattern:'vines',topPattern:'grass'},civic:{ground:'#839269',top:'#aaa69a',side:'#9f5947',column:'#d6cbb2',sidePattern:'brick'},
 mountain:{ground:'#877861',top:'#947b5f',side:'#62615d',column:'#6d6861',groundPattern:'dirt',topPattern:'dirt',sidePattern:'roughRock',formation:'boulder'},
 forest:{ground:'#637b43',top:'#648641',side:'#77694b',wall:'#79513a',column:'#4a6337',groundPattern:'grass',topPattern:'furrows',sidePattern:'barn',formation:'tree'},
 underdark:{ground:'#687564',top:'#626e60',side:'#292e30',column:'#646359',groundPattern:'moss',topPattern:'moss',sidePattern:'ancient',formation:'cave'},
underdarkBasalt:{ground:'#40666f',side:'#252d40',top:'#65717e',column:'#646359',groundPattern:'roughRock',topPattern:'cobble',sidePattern:'brick',formation:'cave'},
underdarkWarm:{ground:'#34596e',side:'#816b56',top:'#ab9580',column:'#646359',groundPattern:'roughRock',topPattern:'cobble',sidePattern:'brick',formation:'cave'},
underdarkDwarven:{ground:'#343e4d',side:'#85796e',top:'#bdab96',column:'#646359',groundPattern:'roughRock',topPattern:'cobble',sidePattern:'brick',formation:'cave'},
underdarkBio:{ground:'#285d77',side:'#49365f',top:'#9366cd',column:'#646359',groundPattern:'roughRock',topPattern:'cobble',sidePattern:'brick',formation:'cave'},
frontierWestern:{ground:'#9a8061',top:'#9b7951',side:'#765337',wall:'#765337',column:'#806044',groundPattern:'wagonRuts',topPattern:'planks',sidePattern:'barn'}
});
const scenePatterns=new Map();
function scenePattern(kind,seed){
 const key=kind+':'+seed;
 if(scenePatterns.has(key))return scenePatterns.get(key);
 const tile=document.createElement('canvas');tile.width=tile.height=128;
 const g=tile.getContext('2d');
 let state=seed>>>0;
 const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const colors={vines:'#426144',grass:'#637044',soot:'#252329',blood:'#842d28',gravel:'#655949',seeded:'#73734e',dirt:'#6c5540',wagonRuts:'#594632',planks:'#493626',boardwalk:'#30251b',splitRail:'#3e2b1d',mesa:'#67513d'};
 g.strokeStyle=colors[kind]||'#5d4933';g.fillStyle=g.strokeStyle;
 if(['wagonRuts','planks','boardwalk','splitRail'].includes(kind)){
  g.lineWidth=2;g.strokeStyle=kind==='wagonRuts'?'#40332988':'#24190e88';
  if(kind==='wagonRuts'){
   for(const x of [36,92]){g.beginPath();g.moveTo(x,0);g.bezierCurveTo(x-8,36,x+8,82,x,128);g.stroke();g.globalAlpha=.3;g.lineWidth=5;g.stroke();g.globalAlpha=1;g.lineWidth=2}
   for(let i=0;i<18;i++){const x=rand()*128,y=rand()*128;g.globalAlpha=.1+rand()*.16;g.fillStyle=i%2?'#d1b58b':'#24190e';g.fillRect(x,y,2+rand()*6,1+rand()*3)}
  }else{
   const horizontal=kind==='boardwalk'||kind==='splitRail';const step=kind==='splitRail'?22:16;
   for(let i=0;i<=128;i+=step){if(kind==='splitRail'){g.lineWidth=4;g.beginPath();g.moveTo(0,i);g.lineTo(128,i+5);g.stroke();g.lineWidth=2}else{g.globalAlpha=.55;g.beginPath();if(horizontal){g.moveTo(0,i);g.lineTo(128,i)}else{g.moveTo(i,0);g.lineTo(i,128)}g.stroke();g.globalAlpha=1}}
   if(kind==='planks')for(let i=0;i<10;i++){const x=rand()*128,y=rand()*128;g.globalAlpha=.35;g.fillStyle='#24190e';g.beginPath();g.ellipse(x,y,2+rand()*4,1+rand()*2,rand(),0,Math.PI*2);g.fill()}
   if(kind==='boardwalk')for(let y=9;y<128;y+=16)for(let x=8;x<128;x+=20){g.fillStyle='#21170f99';g.fillRect(x,y,2,2);g.fillRect(x+10,y,2,2)}
  }
 }else if(kind==='mesa'){
  // Broken horizontal strata and broad fractured plates, like an eroded
  // sandstone escarpment viewed from the path edge.
  const strata=Math.max(0,Math.min(1,(seed-1000)/100));
  for(let y=-18;y<146;y+=(28-strata*15)*(.55+rand()*.45)){
   const offset=(rand()-.5)*14,split=rand()>.52?rand()*58+25:0;
   g.globalAlpha=.32+rand()*.28;g.lineWidth=1+rand()*2;g.strokeStyle=rand()>.48?'#241b15':'#c4a27c';
   g.beginPath();g.moveTo(-8+offset,y+rand()*3);g.lineTo(split,y+rand()*2);g.lineTo(split+rand()*22,y-2+rand()*5);g.lineTo(136,y+rand()*5);g.stroke();
   if(rand()>.45){g.globalAlpha=.16;g.fillStyle='#201914';g.fillRect(rand()*104,y+3,10+rand()*24,1+rand()*2)}
  }
  for(let i=0;i<30+Math.round(strata*110);i++){
   const x=rand()*128,y=rand()*128,n=rand();g.globalAlpha=.08+n*.2;
   g.fillStyle=i%3?'#2b2119':'#d6b58a';g.fillRect(x,y,1+n*3,1+n*2);
  }
 }else if(['roughRock','dirt','furrows','barn','ancient','moss'].includes(kind)){
  if(kind==='roughRock'||kind==='ancient'){
   for(let y=-16;y<144;y+=16)for(let x=-24;x<152;x+=24){
    const a=x+(Math.floor(y/16)%2)*12,b=y+(rand()-.5)*6;
    g.fillStyle=rand()>.5?'#ddd2b32a':'#151b1b52';
    g.beginPath();g.moveTo(a,b);g.lineTo(a+18+rand()*6,b+rand()*5);g.lineTo(a+23,b+9+rand()*5);g.lineTo(a+3,b+14);g.closePath();g.fill();
   }
  }
  if(kind==='barn'||kind==='furrows'){
   for(let i=0;i<128;i+=16){
    g.fillStyle=kind==='barn'?'#24190e60':'#293c2270';
    if(kind==='barn')g.fillRect(i,0,2,128);else g.fillRect(0,i,128,4);
   }
  }
  for(let i=0;i<110;i++){
   const x=rand()*128,y=rand()*128,n=rand();
   g.fillStyle=kind==='moss'||kind==='ancient'?(i%3?'#70834a66':'#39482288'):(i%3?'#30261938':'#c9a98444');
   g.fillRect(x,y,kind==='moss'||kind==='ancient'?2+n*9:1+n*3,1+n*4);
  }
 }else if(kind==='brick'||kind==='cobble'||kind==='fluting'){
  if(seed!==1)g.translate(-rand()*9,-rand()*9);
  g.globalAlpha=.64;g.lineWidth=2;
  const step=kind==='brick'?24:kind==='cobble'?19:12;
  for(let y=0;y<128;y+=step)for(let x=-step;x<128;x+=step*(kind==='brick'?2:1)){
   const u=x+(Math.floor(y/step)%2)*step*.5;
   if(kind==='fluting'){if(y===0){g.fillRect(x,0,3,128);g.globalAlpha=.38;g.fillRect(x+3,0,2,128);g.globalAlpha=.64}}
   else if(kind==='brick')g.strokeRect(u,y,step*2,step);
   else{g.beginPath();g.ellipse(u+9,y+9,7+rand()*2,6+rand()*2,rand(),0,Math.PI*2);g.stroke()}
  }
 }else for(let i=0;i<(kind==='seeded'?110:85);i++){
  const x=rand()*128,y=rand()*128,n=rand();
  g.globalAlpha=kind==='seeded'?.025+n*.13:kind==='soot'?.025+n*.09:.22+n*.48;
  const xs=x<20?[x,x+128]:x>108?[x,x-128]:[x];
  const ys=y<32?[y,y+128]:y>110?[y,y-128]:[y];
  for(const u of xs)for(const v of ys){
   g.beginPath();
   if(kind==='vines'||kind==='grass'){
    g.moveTo(u,v);g.quadraticCurveTo(u+6,v-9,u+(n-.5)*22,v-(kind==='vines'?30:12));g.stroke();
    if(kind==='vines'){g.beginPath();g.ellipse(u+4,v-10,3,6,.7,0,Math.PI*2);g.fill()}
   }else{g.ellipse(u,v,1+n*(kind==='seeded'?19:kind==='soot'?16:kind==='blood'?5:2),1+n*(kind==='seeded'?11:kind==='soot'?11:3),n,0,Math.PI*2);g.fill()}
  }
 }
 if(scenePatterns.size>=24)scenePatterns.delete(scenePatterns.keys().next().value);
 scenePatterns.set(key,tile);return tile;
}
let groundTexture=null,groundTextureKey='';
const floorFields={
 x:'floorX',y:'floorY',width:'floorWidth',depth:'floorDepth',rotation:'floorRotation',
 brightness:'floorBrightness',contrast:'floorContrast',hue:'floorHue'
};
function defaultFloorSettings(){
 return {x:gridLimit(0)*2.5,y:gridLimit(1)*2.5,width:gridLimit(0)*5,depth:gridLimit(1)*5,
  rotation:0,brightness:100,contrast:100,hue:0};
}
function floorFilter(settings){
 return 'brightness('+settings.brightness+'%) contrast('+settings.contrast+'%) hue-rotate('+settings.hue+'deg)';
}
function traceFloorCrop(context,crop,width,height,left=0,top=0){
 const x=p=>left+p[0]*width,y=p=>top+p[1]*height;
 context.beginPath();
 context.moveTo(x(crop[0][0]),y(crop[0][0]));
 for(let i=0;i<crop.length;i++){
  const outgoing=crop[i][2],[anchor,incoming]=crop[(i+1)%crop.length];
  context.bezierCurveTo(x(outgoing),y(outgoing),x(incoming),y(incoming),x(anchor),y(anchor));
 }
 context.closePath();
}
function validFloorCrop(crop){
 return Array.isArray(crop)&&crop.length>=3&&crop.length<=32&&crop.every(node=>
  Array.isArray(node)&&node.length===3&&node.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)));
}
let floorRaster=null;
function prepareFloorImage(image,value){
 const defaults=defaultFloorSettings();
 const settings=Object.fromEntries(Object.keys(defaults).map(key=>[key,Number.isFinite(value[key])?value[key]:defaults[key]]));
 const crop=validFloorCrop(value.crop)?value.crop:null;
 const key=JSON.stringify([settings.brightness,settings.contrast,settings.hue,crop]);
 if(floorRaster?.image!==image||floorRaster.key!==key){
  const layer=document.createElement('canvas');
  layer.width=image.naturalWidth;layer.height=image.naturalHeight;
  const g=layer.getContext('2d');
  if(crop){traceFloorCrop(g,crop,layer.width,layer.height);g.clip()}
  g.filter=floorFilter(settings);
  g.drawImage(image,0,0);
  floorRaster={image,key,layer};
 }
 const angle=settings.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{
  const u=x*settings.width/2,v=y*settings.depth/2;
  return [(settings.x+u*cos-v*sin)/5,(settings.y+u*sin+v*cos)/5];
 });
 const bounds=[0,1].map(axis=>[Math.min(...corners.map(p=>p[axis])),Math.max(...corners.map(p=>p[axis]))]);
 return {layer:floorRaster.layer,corners,bounds,projections:new Map()};
}
function paintFloorImage(image,clip,z){
 if(!image)return;
 if(!image.projections.has(z))image.projections.set(z,image.corners.map(([x,y])=>rawPoint(x,y,z*calibratedVerticalScale())));
 ctx.save();
 ctx.beginPath();
 clip.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.clip();
 ctx.globalAlpha*=image.opacity??1;
 mapImage(image.layer,image.projections.get(z));
 ctx.restore();
}
function paintFloorImageOnFace(image,face){
 if(!image||!face.world)return;
 const z=face.world[0][2];
 if(!face.world.every(p=>Math.abs(p[2]-z)<1e-7))return;
 if(image.bounds.some(([lo,hi],axis)=>face.world.every(p=>{const world=gridToWorld(p[0],p[1]);return world[axis]<=lo})||face.world.every(p=>{const world=gridToWorld(p[0],p[1]);return world[axis]>=hi})))return;
 paintFloorImage(image,face.projected,z);
}
function readFloorImageSettings(){
 const settings=Object.fromEntries(Object.entries(floorFields).map(([key,id])=>[key,el(id).valueAsNumber]));
 if(floorCrop)settings.crop=structuredClone(floorCrop);
 return settings;
}
let floorCrop=null,floorCropDrag=null,floorPreviewImage=null,floorPreviewRect=null,floorCropMode='bezier',floorRectDrag=null;
let floorGridMarks=null;
const floorAlignmentSteps=[
 'Click a printed grid intersection to anchor the image.',
 'Click an intersection directly to its right, using the Squares across count.',
 'Click an intersection directly below the first, using the Squares down count. Then choose up to six additional printed intersections anywhere on the image.'
];
function alignFloorGrid([origin,right,down],across,rows,column,row){
 const dx=right[0]-origin[0],dy=right[1]-origin[1];
 const dw=down[0]-origin[0],dh=down[1]-origin[1];
 if(dx<=0||dh<=0||Math.abs(dy)>dx*.15||Math.abs(dw)>dh*.15)return null;
 const width=5*across/dx,depth=5*rows/dh;
 if(width<1||width>5000||depth<1||depth>5000)return null;
 return {width,depth,rotation:0,x:column*5+(.5-origin[0])*width,y:row*5+(.5-origin[1])*depth};
}

function attachFloorSliders(){
 const ranges={x:[-5000,5000,1],y:[-5000,5000,1],width:[1,5000,1],depth:[1,5000,1],rotation:[-180,180,.5],brightness:[0,300,1],contrast:[0,300,1],hue:[-180,180,1]};
 for(const [key,id] of Object.entries(floorFields)){
  const number=el(id),[min,max,step]=ranges[key];let slider=el(id+'Slider');
  if(!slider){const wrap=document.createElement('span');wrap.className='floor-slider-pair';slider=document.createElement('input');slider.type='range';slider.id=id+'Slider';slider.setAttribute('aria-label',key+' slider');number.before(wrap);wrap.append(slider,number);
   slider.oninput=()=>{number.value=slider.value;number.dispatchEvent(new Event('input',{bubbles:true}))};
   number.addEventListener('input',()=>{if(Number.isFinite(number.valueAsNumber)){slider.min=Math.min(min,number.valueAsNumber);slider.max=Math.max(max,number.valueAsNumber);slider.value=number.value}});
  }
  slider.min=Math.min(min,number.valueAsNumber);slider.max=Math.max(max,number.valueAsNumber);slider.step=step;slider.value=number.value;
 }
}
let floorSceneEditing=false,floorSceneMode='move',floorScenePointer=null,floorSceneMarks=[],floorSceneGridDraft=null,floorGridCalibrationDraft=undefined,floorScenePendingCalibration=null;
function updateFloorSceneDraft(){if(!floorSceneEditing||!appearanceDraft)return;movementRenderCache=null;draw('Floor image preview')}
function stopFloorSceneEditing(){
 floorScenePendingCalibration=null;el('floorSceneAccept').hidden=true;el('floorSceneRetry').hidden=true;
 floorSceneEditing=false;floorScenePointer=null;floorSceneMarks=[];floorSceneGridDraft=null;floorGridCalibrationDraft=undefined;
 el('floorSceneTools').hidden=true;el('floorSceneOverlay').hidden=true;
 appearancePanel.classList.remove('floor-scene-editing');
}
function floorScenePoint(event){
 const rect=el('floorSceneOverlay').getBoundingClientRect();
 return [(event.clientX-rect.left)*W/rect.width,(event.clientY-rect.top)*H/rect.height];
}
function drawFloorSceneOverlay(){
 window.BattlemapGridCalibration.renderOverlay({el,readFloorImageSettings,rawPoint,gridDisplayValue,gridColor,gridOpacity,activeGridCalibration,floorSceneMarks,floorScenePendingCalibration,floorGridCalibrationDraft,W,H,devicePixelRatio,floorSceneEditing,floorSceneMode});
}
for(const [short,long] of [['floorSceneAcross','floorGridAcross'],['floorSceneDown','floorGridDown']]){
 el(short).value=el(long).value;
 el(short).onchange=()=>{const v=el(short).valueAsNumber;if(Number.isInteger(v)&&v>=1&&v<=100){el(long).value=v;el('floorAlignStatus').textContent='Printed square count updated. Select three intersections again.'}};
 el(long).onchange=()=>{el(short).value=el(long).value};
}
for(const id of ['sceneGridVisible','sceneGridColor','sceneGridOpacity','floorPrintedFeet'])el(id).oninput=()=>{if(appearanceDraft)appearanceDraft.gridDisplay={visible:el('sceneGridVisible').checked,color:el('sceneGridColor').value,opacity:Number(el('sceneGridOpacity').value),printedFeet:Number(el('floorPrintedFeet').value)};drawFloorSceneOverlay();draw('Grid style preview')};
function floorSceneModeSet(mode){
 floorSceneMode=mode;floorSceneMarks=[];
 floorScenePendingCalibration=null;el('floorSceneAccept').hidden=true;el('floorSceneRetry').hidden=true;
 el('floorSceneOverlay').style.cursor=mode==='align'?'crosshair':mode==='move'?'move':'crosshair';
 for(const m of ['move','scale','rotate','align'])el('floorScene'+m[0].toUpperCase()+m.slice(1)).setAttribute('aria-pressed',String(m===mode));
 if(mode==='align'){el('floorSceneAcross').value=el('floorGridAcross').value;el('floorSceneDown').value=el('floorGridDown').value;el('floorAlignment').hidden=false;el('floorAlignStatus').textContent=floorAlignmentSteps[0];topDown=true;draw('Grid alignment view — camera preserved')}
}
function startFloorSceneEditing(){
 if(!appearanceDraft?.groundImage||playing||roomProfile?.gm===false){el('appearanceStatus').textContent='Upload a floor image in Build mode first.';return}
 floorSceneEditing=true;floorGridCalibrationDraft=areas.find(a=>a.shape==='appearance')?.gridCalibration??null;floorSceneGridDraft={...sceneGrid(),projectionBase:sceneGrid().projectionBase||{width:sceneGrid().width,depth:sceneGrid().depth}};el('floorSceneWidth').value=floorSceneGridDraft.width;el('floorSceneDepth').value=floorSceneGridDraft.depth;el('floorSceneGrid').setAttribute('aria-pressed','false');el('floorShowGrid').checked=false;el('floorSceneTools').hidden=false;el('floorSceneOverlay').hidden=false;
 appearancePanel.classList.add('floor-scene-editing');
 appearancePanel.classList.add('appearance-collapsed');el('appearanceCompact').textContent='Expand';
 floorSceneModeSet('move');updateFloorSceneDraft();
}
el('floorEditInScene').onclick=()=>floorSceneEditing?stopFloorSceneEditing():startFloorSceneEditing();
for(const mode of ['move','scale','rotate','align'])el('floorScene'+mode[0].toUpperCase()+mode.slice(1)).onclick=()=>floorSceneModeSet(mode);
el('floorSceneDone').onclick=()=>{stopFloorSceneEditing();draw('Floor image preview closed')};
el('floorSceneTop').onclick=()=>{topDown=true;draw('Floor image top view')};
function frameFloorSceneImage(){
 const {x,y,width,depth,rotation}=readFloorImageSettings();
 if(![x,y,width,depth,rotation].every(Number.isFinite)||width<=0||depth<=0)return;
 topDown=true;
 const a=rotation*Math.PI/180,c=Math.cos(a),si=Math.sin(a);
 const extentX=(Math.abs(width*c)+Math.abs(depth*si))/5;
 const extentY=(Math.abs(width*si)+Math.abs(depth*c))/5;
 const targetScale=Math.min(W/Math.max(3,extentX*1.3),H/Math.max(3,extentY*1.4));
 const baseScale=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6));
 zoom=Math.max(.15,Math.min(15,targetScale/baseScale));S=baseScale*zoom;
 const center=rawPoint(x/5,y/5,0);
 panX+=W/2-center[0];panY+=H*.5-center[1];
 draw('Floor image framed');
}
el('floorSceneFrame').onclick=frameFloorSceneImage;
function zoomFloorScene(factor){
 const center=rawInverse(W/2,H/2,0);
 zoom=Math.max(.15,Math.min(30,zoom*factor));
 S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;
 const after=rawPoint(center[0],center[1],0);
 panX+=W/2-after[0];panY+=H/2-after[1];
 draw('Floor calibration inspection zoom');
}
el('floorSceneZoomIn').onclick=()=>zoomFloorScene(1.6);
el('floorSceneZoomOut').onclick=()=>zoomFloorScene(1/1.6);
el('floorSceneAccept').onclick=()=>{
 if(!floorScenePendingCalibration)return;
 const imageBefore=readFloorImageSettings();
 floorGridCalibrationDraft={...floorScenePendingCalibration};floorScenePendingCalibration=null;
 const imageAfter=readFloorImageSettings();
 if(['x','y','width','depth','rotation'].some(key=>imageBefore[key]!==imageAfter[key])){
  el('floorAlignStatus').textContent='Calibration cancelled: image placement changed unexpectedly.';return;
 }
 el('floorSceneAccept').hidden=true;el('floorSceneRetry').hidden=true;
 el('floorAlignStatus').textContent='Calibration accepted; imported image position, size and rotation unchanged. Click Apply to save.';
 updateFloorSceneDraft();
};
el('floorSceneUndoPoint').onclick=()=>{if(!floorSceneMarks.length)return;floorSceneMarks.pop();floorScenePendingCalibration=null;el('floorSceneAccept').hidden=true;el('floorSceneRetry').hidden=true;el('floorSceneUndoPoint').hidden=!floorSceneMarks.length;if(floorSceneMarks.length>=3)refineFloorSceneCalibration();else el('floorAlignStatus').textContent=`${floorSceneMarks.length}/9 points selected. ${floorAlignmentSteps[floorSceneMarks.length]}`;drawFloorSceneOverlay()};
el('floorSceneRetry').onclick=()=>{
 floorScenePendingCalibration=null;floorSceneMarks=[];
 el('floorSceneAccept').hidden=true;el('floorSceneRetry').hidden=true;
 el('floorAlignStatus').textContent=floorAlignmentSteps[0];
 drawFloorSceneOverlay();
};
el('floorSceneGrid').onclick=()=>{const b=el('floorSceneGrid'),on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));el('floorShowGrid').checked=on;drawFloorPreview();updateFloorSceneDraft()};
function updateFloorSceneGrid(){
 if(!floorSceneEditing)return;
 const width=el('floorSceneWidth').valueAsNumber,depth=el('floorSceneDepth').valueAsNumber;
 if(!validSceneGrid({width,depth})){el('appearanceStatus').textContent='Battlefield dimensions must be 10–100 whole squares per side.';return}
 floorSceneGridDraft={...floorSceneGridDraft,width,depth};el('appearanceStatus').textContent=width+' × '+depth+' squares (draft; Apply to save)';
 movementRenderCache=null;draw('Floor image battlefield resize');
}
for(const id of ['floorSceneWidth','floorSceneDepth'])el(id).onchange=updateFloorSceneGrid;
el('floorSceneFit').onclick=()=>{
 // Fit the physical floor to the image, including negative world coordinates.
 // Do not move, resize, rotate, or re-anchor the imported image.
 const before=readFloorImageSettings();
 const {x,y,width,depth,rotation}=before,a=rotation*Math.PI/180,c=Math.cos(a),si=Math.sin(a);
 const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>[x+u*width*c-v*depth*si,y+u*width*si+v*depth*c]);
 const maxX=Math.max(...corners.map(p=>p[0]))/5,maxY=Math.max(...corners.map(p=>p[1]))/5;
 const minX=Math.min(...corners.map(p=>p[0]))/5,minY=Math.min(...corners.map(p=>p[1]))/5;
 const originX=Math.floor(minX),originY=Math.floor(minY);
 const neededX=Math.ceil(maxX)-originX,neededY=Math.ceil(maxY)-originY;
 if(neededX>100||neededY>100){el('appearanceStatus').textContent='Image exceeds the 100 × 100-square battlefield limit. Reduce its size first.';return}
 floorSceneGridDraft={...floorSceneGridDraft,floorOriginX:originX,floorOriginY:originY,width:Math.max(10,neededX),depth:Math.max(10,neededY)};
 el('floorSceneWidth').value=floorSceneGridDraft.width;
 el('floorSceneDepth').value=floorSceneGridDraft.depth;
 el('appearanceStatus').textContent='Battlefield fitted to image without moving it. Click Apply to save.';
 updateFloorSceneDraft();
};
const floorSceneCanvas=el('floorSceneOverlay');
floorSceneCanvas.addEventListener('wheel',e=>{
 if(!floorSceneEditing)return;
 e.preventDefault();e.stopPropagation();
 const [px,py]=floorScenePoint(e),before=rawInverse(px,py,0);
 const factor=Math.exp(-Math.max(-120,Math.min(120,e.deltaY))*.0025);
 zoom=Math.max(.15,Math.min(30,zoom*factor));
 S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;
 const after=rawPoint(before[0],before[1],0);
 panX+=px-after[0];panY+=py-after[1];
 draw('Floor alignment zoom');
},{passive:false});
// Three mandatory intersections, then opposite corner, center, and four edge
// midpoints. All coordinates are relative to the first INTERIOR intersection.
function refineFloorSceneCalibration(){
 window.BattlemapGridCalibration.refineCalibration({el,floorSceneMarks,draw,movementRenderCacheSetter:()=>{movementRenderCache=null},setPendingCalibration:value=>{floorScenePendingCalibration=value}});
}
floorSceneCanvas.onpointerdown=e=>{
 if(!floorSceneEditing)return;
 if(e.button!==0&&e.button!==1)return;
 e.preventDefault();e.stopPropagation();
 const [px,py]=floorScenePoint(e),pos=rawInverse(px,py,0);
 if(e.button===1||e.shiftKey){floorScenePointer={id:e.pointerId,cameraPan:true,px,py,startPanX:panX,startPanY:panY};floorSceneCanvas.setPointerCapture(e.pointerId);return;}
 if(!pos.every(Number.isFinite))return;
 if(floorSceneMode==='align'){
  if(floorSceneMarks.length>=9){el('floorAlignStatus').textContent='9/9 points collected. Accept calibration or Retry points.';return}
  if(floorSceneMarks.some(p=>{const [ax,ay]=rawPoint(p[0],p[1],0);return Math.hypot(ax-px,ay-py)<12;})){el('floorAlignStatus').textContent=`${floorSceneMarks.length}/9 points: too close to an existing point.`;return;}
  floorSceneMarks.push(pos);el('floorSceneUndoPoint').hidden=false;
  if(floorSceneMarks.length>=3)refineFloorSceneCalibration();
  else el('floorAlignStatus').textContent=`${floorSceneMarks.length}/9 points selected. ${floorAlignmentSteps[floorSceneMarks.length]}`;
  drawFloorSceneOverlay();return;
 }
 const handles=JSON.parse(floorSceneCanvas.dataset.floorHandles||'[]');
 const hit=handles.findIndex(([hx,hy])=>Math.hypot(hx-px,hy-py)<=14);
 floorScenePointer={id:e.pointerId,start:pos,initial:readFloorImageSettings(),px,py,handle:hit};
 floorSceneCanvas.setPointerCapture(e.pointerId);
};
floorSceneCanvas.onpointermove=e=>{
 const drag=floorScenePointer;if(!drag||drag.id!==e.pointerId)return;
 const [px,py]=floorScenePoint(e);
 if(drag.cameraPan){panX=drag.startPanX+px-drag.px;panY=drag.startPanY+py-drag.py;draw('Floor image camera pan');return}
 const pos=rawInverse(px,py,0),next={...drag.initial};
 if(!pos.every(Number.isFinite))return;
 if(drag.handle>=0){
  // Resize using a grabbed corner/edge; keep its opposite edge/corner
  // fixed in world space, including when the image is rotated.
  const uvs=[[-.5,-.5],[0,-.5],[.5,-.5],[.5,0],[.5,.5],[0,.5],[-.5,.5],[-.5,0]];
  const [u,v]=uvs[drag.handle],angle=drag.initial.rotation*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle);
  const wx=pos[0]*5-drag.initial.x,wy=pos[1]*5-drag.initial.y;
  const localX=wx*c+wy*sn,localY=-wx*sn+wy*c;
  const fixedU=u===0?0:-u,fixedV=v===0?0:-v;
  const oldAnchorX=fixedU*drag.initial.width,oldAnchorY=fixedV*drag.initial.depth;
  let newWidth=u===0?drag.initial.width:Math.max(1,Math.min(5000,(localX-oldAnchorX)/(u-fixedU)));
  let newDepth=v===0?drag.initial.depth:Math.max(1,Math.min(5000,(localY-oldAnchorY)/(v-fixedV)));
  if(u!==0&&v!==0){
   // Corner handles preserve the original aspect ratio. Use the
   // pointer displacement projected onto the original diagonal.
   const dx=localX-oldAnchorX,dy=localY-oldAnchorY;
   const diagX=(u-fixedU)*drag.initial.width,diagY=(v-fixedV)*drag.initial.depth;
   const factor=Math.max(.001,Math.min(5000/Math.max(drag.initial.width,drag.initial.depth),(dx*diagX+dy*diagY)/(diagX*diagX+diagY*diagY)));
   newWidth=drag.initial.width*factor;newDepth=drag.initial.depth*factor;
  }
  next.width=newWidth;next.depth=newDepth;
  const shiftLocalX=(fixedU*drag.initial.width-fixedU*newWidth);
  const shiftLocalY=(fixedV*drag.initial.depth-fixedV*newDepth);
  next.x+=shiftLocalX*c-shiftLocalY*sn;next.y+=shiftLocalX*sn+shiftLocalY*c;
 }
 else if(floorSceneMode==='move'){next.x+=(pos[0]-drag.start[0])*5;next.y+=(pos[1]-drag.start[1])*5}
 else if(floorSceneMode==='scale'){const factor=Math.max(.05,1+(px-drag.px)/180-(py-drag.py)/220);next.width=Math.max(1,Math.min(5000,next.width*factor));next.depth=Math.max(1,Math.min(5000,next.depth*factor))}
 else {const raw=drag.initial.rotation+(px-drag.px)/4;next.rotation=e.altKey?raw:Math.round(raw/90)*90;next.rotation=((next.rotation+540)%360)-180}
 for(const key of ['x','y','width','depth','rotation']){el(floorFields[key]).value=Number(next[key].toFixed(3));const slider=el(floorFields[key]+'Slider');if(slider)slider.value=el(floorFields[key]).value}
 drawFloorPreview();updateFloorSceneDraft();
};
floorSceneCanvas.onpointerup=e=>{if(floorScenePointer?.id===e.pointerId)floorScenePointer=null};
floorSceneCanvas.onpointercancel=()=>{floorScenePointer=null};

function drawFloorAlignment(g,{left,top,width,height}){
 const settings=readFloorImageSettings();
 if(el('floorShowGrid').checked&&Object.keys(floorFields).every(key=>Number.isFinite(settings[key]))&&settings.width>0&&settings.depth>0){
  const angle=settings.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const project=(x,y)=>{
   const dx=x-settings.x,dy=y-settings.y;
   return [left+width*(.5+(dx*cos+dy*sin)/settings.width),top+height*(.5+(-dx*sin+dy*cos)/settings.depth)];
  };
  g.save();g.beginPath();g.rect(left,top,width,height);g.clip();g.beginPath();
  for(let axis=0;axis<2;axis++){
   for(let n=0;n<=gridLimit(axis);n++){
    const ends=axis?[project(0,n*5),project(gridLimit(0)*5,n*5)]:[project(n*5,0),project(n*5,gridLimit(1)*5)];
    g.moveTo(...ends[0]);g.lineTo(...ends[1]);
   }
  }
  g.strokeStyle='#142228';g.lineWidth=2.5;g.stroke();
  g.strokeStyle='#70faff';g.lineWidth=1;g.stroke();g.restore();
 }
 if(!floorGridMarks)return;
 g.fillStyle='#fff0a0';g.strokeStyle='#18242c';g.lineWidth=2;
 for(const [u,v] of floorGridMarks){
  g.beginPath();g.arc(left+u*width,top+v*height,4,0,Math.PI*2);g.fill();g.stroke();
 }
}
el('floorAlign').onclick=()=>{
 floorGridMarks=[];
 el('floorAlignment').hidden=false;
 el('floorAlignStatus').textContent=floorAlignmentSteps[0];
 el('floorShowGrid').checked=false;
 drawFloorPreview();
};
el('floorShowGrid').onchange=drawFloorPreview;
for(const id of ['floorGridAcross','floorGridDown','floorGridColumn','floorGridRow']){
 el(id).oninput=()=>{
  if(!floorGridMarks)return;
  floorGridMarks=[];
  el('floorAlignStatus').textContent=floorAlignmentSteps[0];
  drawFloorPreview();
 };
}
const floorPreview=el('floorCropPreview');
el('floorPreviewZoom').onchange=()=>{
 const zoom=Number(el('floorPreviewZoom').value);
 floorPreview.style.width=zoom*100+'%';
 floorPreview.width=480*zoom;
 floorPreview.height=270*zoom;
 drawFloorPreview();
};
function setupFloorEditor(aspect){
 const settings={...defaultFloorSettings(),...appearanceDraft.floorImage};
 if(aspect){
  settings.width=Math.min(gridLimit(0)*5,gridLimit(1)*5*aspect);
  settings.depth=settings.width/aspect;
 }
 floorCrop=!aspect&&validFloorCrop(settings.crop)?structuredClone(settings.crop):null;
 floorCropMode='bezier';floorRectDrag=null;if(floorSceneEditing)stopFloorSceneEditing();
 floorCropDrag=null;
 floorGridMarks=null;
 el('floorAlignment').hidden=true;
 el('floorShowGrid').checked=false;
 for(const [key,id] of Object.entries(floorFields))el(id).value=settings[key];
 attachFloorSliders();
 el('floorImageSettings').hidden=!appearanceDraft.groundImage;
 el('floorImageSettings').disabled=!appearanceDraft.groundImage;
 floorPreviewRect=null;
 const image=new Image();
 floorPreviewImage=image;
 image.onload=()=>{if(floorPreviewImage===image)drawFloorPreview()};
 if(appearanceDraft.groundImage)image.src=appearanceDraft.groundImage;
 drawFloorPreview();
}
function drawFloorPreview(){
 const g=floorPreview.getContext('2d'),w=floorPreview.width,h=floorPreview.height;
 g.clearRect(0,0,w,h);
 el('floorCropHelp').hidden=!floorCrop||floorCropMode!=='bezier';
 el('floorRectHelp').hidden=floorCropMode!=='rect';
 el('floorResetCrop').disabled=!floorCrop;
 const image=floorPreviewImage;
 if(!image?.naturalWidth)return;
 const margin=24*Number(el('floorPreviewZoom').value);
 const scale=Math.min((w-margin)/image.naturalWidth,(h-margin)/image.naturalHeight);
 const width=image.naturalWidth*scale,height=image.naturalHeight*scale,left=(w-width)/2,top=(h-height)/2;
 floorPreviewRect={left,top,width,height};
 g.save();
 g.filter=floorFilter({...defaultFloorSettings(),...readFloorImageSettings()});
 if(floorCrop){
  g.globalAlpha=.36;g.drawImage(image,left,top,width,height);g.globalAlpha=1;
  traceFloorCrop(g,floorCrop,width,height,left,top);g.clip();
 }
 g.drawImage(image,left,top,width,height);
 g.restore();
 drawFloorAlignment(g,floorPreviewRect);
 if(!floorCrop||floorGridMarks)return;
 if(floorCropMode==='rect'){g.strokeStyle='#ffdc86';g.lineWidth=2;g.setLineDash([8,4]);traceFloorCrop(g,floorCrop,width,height,left,top);g.stroke();g.setLineDash([]);return}
 g.strokeStyle='#ffdc86';g.fillStyle='#fff0c5';g.lineWidth=2;
 traceFloorCrop(g,floorCrop,width,height,left,top);g.stroke();
 for(const [anchor,incoming,outgoing] of floorCrop){
  const ax=left+anchor[0]*width,ay=top+anchor[1]*height;
  for(const handle of [incoming,outgoing]){
   const x=left+handle[0]*width,y=top+handle[1]*height;
   g.beginPath();g.moveTo(ax,ay);g.lineTo(x,y);g.stroke();
   g.beginPath();g.arc(x,y,4,0,Math.PI*2);g.fill();
  }
  g.fillRect(ax-4,ay-4,8,8);
 }
}
el('floorStartCrop').onclick=()=>{
 floorCropMode='bezier';floorRectDrag=null;
 floorGridMarks=null;el('floorAlignment').hidden=true;
 if(!floorCrop)floorCrop=[
  [[.1,.1],[.1,.3],[.3,.1]],[[.9,.1],[.7,.1],[.9,.3]],
  [[.9,.9],[.9,.7],[.7,.9]],[[.1,.9],[.3,.9],[.1,.7]]
 ];
 drawFloorPreview();
};
el('floorRectCrop').onclick=()=>{floorCropMode='rect';floorCrop=null;floorRectDrag=null;floorGridMarks=null;el('floorAlignment').hidden=true;drawFloorPreview()};
el('floorResetCrop').onclick=()=>{floorCrop=null;floorCropDrag=null;floorRectDrag=null;drawFloorPreview();updateFloorSceneDraft()};
for(const id of Object.values(floorFields))el(id).oninput=()=>{drawFloorPreview();updateFloorSceneDraft()};
function floorPreviewPointer(event){
 const rect=floorPreview.getBoundingClientRect();
 return [(event.clientX-rect.left)*floorPreview.width/rect.width,(event.clientY-rect.top)*floorPreview.height/rect.height];
}
floorPreview.onpointerdown=event=>{
 if(!floorPreviewRect||event.button!==0)return;
 const [x,y]=floorPreviewPointer(event),{left,top,width,height}=floorPreviewRect;
 if(floorGridMarks){
  const u=(x-left)/width,v=(y-top)/height;
  if(u<0||u>1||v<0||v>1)return;
  const [across,rows,column,row]=['floorGridAcross','floorGridDown','floorGridColumn','floorGridRow'].map(id=>el(id).valueAsNumber);
  const status=el('floorAlignStatus');
  if(![across,rows,column,row].every(Number.isInteger)||across<1||rows<1||column<0||row<0||
     column+across>gridLimit(0)||row+rows>gridLimit(1)){
   status.textContent='Enter whole square counts and a target intersection that fit inside the battlefield.';
   return;
  }
  floorGridMarks.push([u,v]);
  if(floorGridMarks.length<3)status.textContent=floorAlignmentSteps[floorGridMarks.length];
  else{
   const settings=alignFloorGrid(floorGridMarks,across,rows,column,row);
   floorGridMarks=null;
   if(settings){
    for(const [key,value] of Object.entries(settings))el(floorFields[key]).value=value;
    el('floorShowGrid').checked=true;
    status.textContent='Check the cyan grid against the printed lines, then choose Apply.';
   }else status.textContent='Use three intersections on an upright map. Choose Align to VTT grid to try again.';
  }
  drawFloorPreview();
  return;
 }
 if(floorCropMode==='rect'){
  if(x<left||x>left+width||y<top||y>top+height)return;
  const u=Math.max(0,Math.min(1,(x-left)/width)),v=Math.max(0,Math.min(1,(y-top)/height));
  floorRectDrag={pointer:event.pointerId,start:[u,v]};floorPreview.setPointerCapture(event.pointerId);return;
 }
 if(!floorCrop)return;
 let nearest=12;
 floorCrop.forEach((node,nodeIndex)=>node.forEach(([px,py],pointIndex)=>{
  const distance=Math.hypot(x-left-px*width,y-top-py*height);
  if(distance<nearest){nearest=distance;floorCropDrag={nodeIndex,pointIndex,pointer:event.pointerId}}
 }));
 if(floorCropDrag)floorPreview.setPointerCapture(event.pointerId);
};
floorPreview.onpointermove=event=>{
 if(floorRectDrag?.pointer===event.pointerId&&floorPreviewRect){
  const [x,y]=floorPreviewPointer(event),{left,top,width,height}=floorPreviewRect;
  const [u,v]=floorRectDrag.start;
  const a=Math.min(u,Math.max(0,Math.min(1,(x-left)/width))),b=Math.min(v,Math.max(0,Math.min(1,(y-top)/height)));
  const c=Math.max(u,Math.max(0,Math.min(1,(x-left)/width))),d=Math.max(v,Math.max(0,Math.min(1,(y-top)/height)));
  if(c-a>.003&&d-b>.003)floorCrop=[[[a,b],[a,b],[a,b]],[[c,b],[c,b],[c,b]],[[c,d],[c,d],[c,d]],[[a,d],[a,d],[a,d]]];
  drawFloorPreview();updateFloorSceneDraft();return;
 }
 if(floorCropDrag?.pointer!==event.pointerId)return;
 const [x,y]=floorPreviewPointer(event),{left,top,width,height}=floorPreviewRect;
 const {nodeIndex,pointIndex}=floorCropDrag,node=floorCrop[nodeIndex];
 node[pointIndex]=[Math.max(0,Math.min(1,(x-left)/width)),Math.max(0,Math.min(1,(y-top)/height))];
 drawFloorPreview();
};
floorPreview.onlostpointercapture=()=>{floorCropDrag=null;floorRectDrag=null;updateFloorSceneDraft()};

// Paths are stored in scene coordinates (one unit is five feet).
const pathWallDefaults={height:2,thickness:.15,z:0,color:'#a68b72',texture:'plain',opacity:1,light:0,sight:false,blocks:true,
 hideBack:false,mesaVariation:32,mesaJaggedness:48,mesaStrata:58};
const pathWallCache=new WeakMap(),noWallPaths=[];
const wallDistance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const wallLerp=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
function flattenWallPath(wall){
 const points=[wall.nodes[0].p];
 // World-space tessellation: preserve tight bends on thin walls while
 // avoiding dozens of nearly coplanar prisms on broad, smooth arcs.
 const curveTolerance=Math.max(.045,Math.min(.12,wall.thickness*.18));
 function cubic(a,b,c,d,depth){
  // Bound both deviation and excess control-polygon length. The latter
  // catches collinear control handles that double back on themselves.
  if(depth>=8||(wallDistance(a,b)+wallDistance(b,c)+wallDistance(c,d)-wallDistance(a,d)<curveTolerance*.12&&
     Math.max(wallDistance(b,wallLerp(a,d,1/3)),wallDistance(c,wallLerp(a,d,2/3)))<curveTolerance)){
   if(wallDistance(points.at(-1),d)>1e-5)points.push(d);
   return;
  }
  const ab=wallLerp(a,b,.5),bc=wallLerp(b,c,.5),cd=wallLerp(c,d,.5);
  const e=wallLerp(ab,bc,.5),f=wallLerp(bc,cd,.5),m=wallLerp(e,f,.5);
  cubic(a,ab,e,m,depth+1);cubic(m,f,cd,d,depth+1);
 }
 for(let i=0;i<wall.nodes.length-1+Number(wall.closed);i++){
  const a=wall.nodes[i],b=wall.nodes[(i+1)%wall.nodes.length];
  if(!a.out&&!b.in){if(wallDistance(a.p,b.p)>1e-5)points.push(b.p);continue}
  cubic(a.p,a.out||a.p,b.in||b.p,b.p,0);
 }
 let length=0;
 const samples=points.map((p,i)=>({p,s:i?(length+=wallDistance(points[i-1],p)):0}));
 return {samples,length};
}
function sampleWall(path,s){
 const i=path.samples.findIndex(sample=>sample.s>=s);
 if(i<=0)return (i<0?path.samples.at(-1):path.samples[0]).p;
 const a=path.samples[i-1],b=path.samples[i];
 return wallLerp(a.p,b.p,(s-a.s)/(b.s-a.s));
}
function wallOpeningFit(wall,path,opening){
 const center=opening.at*path.length;
 if(opening.sill+opening.height>wall.height+1e-6||opening.kind==='Window'&&opening.windowTop==='semicircle'&&opening.height<opening.width/2)return null;
 let half=opening.width/2,a,b,span,start,end;
 for(let attempt=0;attempt<5;attempt++){
  start=center-half;end=center+half;
  if(start<.01||end>path.length-.01)return null;
  a=sampleWall(path,start);b=sampleWall(path,end);span=wallDistance(a,b);
  if(span<opening.width*.985)return null;
  if(Math.abs(span-opening.width)<1e-5)break;
  half*=opening.width/span;
 }
 if(Math.abs(span-opening.width)>1e-4)return null;
 const dx=(b[0]-a[0])/span,dy=(b[1]-a[1])/span;
 if(path.samples.some(({p,s})=>s>start&&s<end&&Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)>.045))return null;
 return {opening,start,end,a,b};
}
function makeWallPrism(poly,z,top,wall,opening=null){
 const axes=[[1,0],[0,1],...poly.map((a,i)=>{
  const b=poly[(i+1)%poly.length],length=wallDistance(a,b);
  return length?[(a[1]-b[1])/length,(b[0]-a[0])/length]:[1,0];
 })];
 const spans=axes.map(axis=>{
  const dots=poly.map(p=>p[0]*axis[0]+p[1]*axis[1]);
  return [Math.min(...dots),Math.max(...dots)];
 });
 const [[left,right],[near,far]]=spans;
 const axisAlignedBox=!opening&&poly.length===4&&left<right&&near<far&&
  [[left,near],[left,far],[right,near],[right,far]].every(([x,y])=>
   poly.some(p=>p[0]===x&&p[1]===y))&&
  poly.every(([x,y],i)=>{const next=poly[(i+1)%4];return x===next[0]||y===next[1]});
 return {poly,z,top,axes,spans,wall,opening,axisAlignedBox,type:'volume',name:opening?.kind||'Wall'};
}
function mesaHeightAt(wall,distance){
 const spacing=1.2-(wall.mesaJaggedness??pathWallDefaults.mesaJaggedness)/100*.75;
 const amount=(wall.mesaVariation??pathWallDefaults.mesaVariation)/100*.32;
 const seed=String(wall.id||'mesa').split('').reduce((hash,char)=>Math.imul(hash^char.charCodeAt(0),16777619)>>>0,2166136261);
 const noise=index=>{
  let value=(seed^Math.imul(index+1,0x9e3779b1))>>>0;
  value=Math.imul(value^(value>>>16),0x7feb352d);value=Math.imul(value^(value>>>15),0x846ca68b);value^=value>>>16;
  return ((value>>>0)/4294967295)*2-1;
 };
 const point=distance/spacing,index=Math.floor(point),fraction=point-index;
 const profile=noise(index)+(noise(index+1)-noise(index))*fraction;
 return Math.min(12,wall.z+Math.max(wall.height*.48,wall.height*(1+profile*amount)));
}
function compileWallPath(wall){
 const cached=pathWallCache.get(wall);
 if(cached)return cached;
 const path=flattenWallPath(wall),solids=[],openings=[],invalid=[];
 for(const opening of wall.openings){
  const fit=wallOpeningFit(wall,path,opening);
  if(!fit||openings.some(o=>fit.start<o.end+.01&&fit.end>o.start-.01)){invalid.push(opening);continue}
  openings.push(fit);
 }
 const inside=s=>openings.find(o=>s>o.start+1e-7&&s<o.end-1e-7);
 const cuts=[...path.samples.filter(v=>!inside(v.s)),...openings.flatMap(o=>[{s:o.start,p:o.a},{s:o.end,p:o.b}])].sort((a,b)=>a.s-b.s)
  .filter((v,i,list)=>!i||v.s-list[i-1].s>1e-7);
 const sections=cuts.slice(1).map((b,i)=>{
  const a=cuts[i],length=wallDistance(a.p,b.p),half=wall.thickness/2;
  const offset=[(a.p[1]-b.p[1])*half/length,(b.p[0]-a.p[0])*half/length];
  return {a:a.p,b:b.p,offset,distance:a.s,opening:inside((a.s+b.s)/2)?.opening};
 }).filter(section=>section.offset.every(Number.isFinite));
 const renderSections=sections.flatMap(section=>{
  if(wall.texture!=='mesa'||section.opening)return [section];
  const step=1.2-(wall.mesaJaggedness??pathWallDefaults.mesaJaggedness)/100*.75;
  const stops=[section.distance];
  for(let mark=(Math.floor(section.distance/step)+1)*step;mark<section.distance+wallDistance(section.a,section.b)-1e-7;mark+=step)stops.push(mark);
  stops.push(section.distance+wallDistance(section.a,section.b));
  return stops.slice(1).map((distance,i)=>{
   const start=stops[i],t0=(start-section.distance)/wallDistance(section.a,section.b),t1=(distance-section.distance)/wallDistance(section.a,section.b);
   return {...section,a:wallLerp(section.a,section.b,t0),b:wallLerp(section.a,section.b,t1),distance:start,mesaProfile:true};
  });
 });
 const edge=(p,n,sign)=>[p[0]+sign*n[0],p[1]+sign*n[1]];
 const add=(poly,lo,hi,opening,ends,capPattern,topProfile)=>{
  if(hi-lo>1e-6){
   const solid=makeWallPrism(poly,wall.z+lo,wall.z+hi,wall,opening);
   if(topProfile){solid.topProfile=topProfile;solid.top=Math.max(...topProfile)}
   solids.push({...solid,ends,capPattern});
  }
 };
 const corner=p=>wall.nodes.some(node=>wallDistance(node.p,p)<1e-6&&(!node.in||!node.out));
 renderSections.forEach(({a,b,offset,distance,opening,mesaProfile},i)=>{
  const length=wallDistance(a,b);
  const capPattern={origin:a,along:b.map((n,i)=>(n-a[i])/length),distance};
  const poly=[edge(a,offset,1),edge(b,offset,1),edge(b,offset,-1),edge(a,offset,-1)];
  const ends=[!wall.closed&&i===0||corner(a),!wall.closed&&i===renderSections.length-1||corner(b)];
  if(opening){
   add(poly,0,opening.sill,null,ends,capPattern);
   add(poly,opening.sill+opening.height,wall.height,null,ends,capPattern);
   add(poly,opening.sill,opening.sill+opening.height,opening,[true,true]);
   if(opening.kind==='Window'&&['semicircle','pointed'].includes(opening.windowTop)){
    const profile=windowProfile(opening,opening.width,opening.height);
    for(let j=0;j<16;j++){
     const start=j/16,end=(j+1)/16;
     const inset=opening.sill+Math.max(profile(start*opening.width),profile(end*opening.width));
     const slice=[wallLerp(poly[0],poly[1],start),wallLerp(poly[0],poly[1],end),
      wallLerp(poly[3],poly[2],end),wallLerp(poly[3],poly[2],start)];
     add(slice,inset,opening.sill+opening.height,null,null,capPattern);
    }
   }
  }else if(mesaProfile){
   const profile=[mesaHeightAt(wall,distance),mesaHeightAt(wall,distance+length),mesaHeightAt(wall,distance+length),mesaHeightAt(wall,distance)];
   add(poly,0,Math.max(...profile)-wall.z,null,ends,capPattern,profile);
  }else add(poly,0,wall.height,null,ends,capPattern);
  const next=renderSections[i+1]??(wall.closed?renderSections[0]:null);
  if(!next||wallDistance(b,next.a)>1e-6)return;
  const turn=offset[0]*next.offset[1]-offset[1]*next.offset[0];
  if(Math.abs(turn)>1e-9){
   const sign=turn>0?-1:1;
   add([b,edge(b,offset,sign),edge(b,next.offset,sign)],0,wall.height,null,null,capPattern);
  }
 });
 const result={...path,solids,openings,invalid};
 pathWallCache.set(wall,result);
 return result;
}
function sceneWallPaths(sceneAreas=areas){
 return sceneAreas.find(a=>a.shape==='appearance')?.wallPaths??noWallPaths;
}
// v1.474: Diagnostic room topology from authored wall paths, not rendered faces.
// This never culls geometry. Wall edits and opening changes invalidate the cache.
let wallTopologyCache=null;
function wallVisibilityTopology(){
 const walls=sceneWallPaths();
 const signature=JSON.stringify(walls.map(w=>[w.id,w.nodes,w.closed,w.z,w.height,w.thickness,w.sight,w.openings]));
 if(wallTopologyCache?.signature===signature)return wallTopologyCache.result;
 const segments=[],portals=[];
 for(const wall of walls){
  const path=compileWallPath(wall);
  // In wall semantics sight:false means opaque, not invisible to topology.
  // Transparent walls cannot separate visibility regions.
  if(wall.sight!==false)continue;
  for(let i=1;i<path.samples.length;i++){
   const a=path.samples[i-1],b=path.samples[i];
   if(wallDistance(a.p,b.p)>1e-7)segments.push([a.p,b.p,wall]);
  }
  for(const fit of path.openings){
   portals.push({wallId:wall.id,kind:fit.opening.kind,open:!!fit.opening.open,
    shaded:!!fit.opening.shaded,at:fit.opening.at,width:fit.opening.width,
    sill:fit.opening.sill,height:fit.opening.height,center:sampleWall(path,(fit.start+fit.end)/2)});
  }
 }
 if(!segments.length)return (wallTopologyCache={signature,result:{regions:1,portals,segments:0,note:'No opaque wall boundaries'}}).result;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const [a,b] of segments)for(const p of [a,b]){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1])}
 const step=1,minx=Math.floor(minX)-2,miny=Math.floor(minY)-2;
 const nx=Math.ceil(maxX-minx)+4,ny=Math.ceil(maxY-miny)+4;
 if(nx*ny>24000)return (wallTopologyCache={signature,result:{regions:0,portals,segments:segments.length,skipped:'Grid exceeds diagnostic limit'}}).result;
 const crosses=(a,b,c,d)=>{
  const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const x=orient(a,b,c),y=orient(a,b,d),u=orient(c,d,a),v=orient(c,d,b);
  return x*y<=0&&u*v<=0&&Math.max(a[0],b[0])>=Math.min(c[0],d[0])-1e-7&&Math.max(c[0],d[0])>=Math.min(a[0],b[0])-1e-7&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])-1e-7&&Math.max(c[1],d[1])>=Math.min(a[1],b[1])-1e-7;
 };
 const edgeBlocked=(x,y,dx,dy)=>{
  const a=[minx+x+.5,miny+y+.5],b=[a[0]+dx,a[1]+dy];
  return segments.some(([c,d])=>crosses(a,b,c,d));
 };
 const labels=new Int32Array(nx*ny).fill(-1),sizes=[];let regions=0;
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const index=y*nx+x;if(labels[index]!==-1)continue;
  const queue=[index];labels[index]=regions;let count=0;
  for(let head=0;head<queue.length;head++){
   const n=queue[head],cx=n%nx,cy=Math.floor(n/nx);count++;
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=cx+dx,yy=cy+dy;if(xx<0||yy<0||xx>=nx||yy>=ny)continue;
    const next=yy*nx+xx;if(labels[next]!==-1||edgeBlocked(cx,cy,dx,dy))continue;
    labels[next]=regions;queue.push(next);
   }
  }
  sizes.push(count);regions++;
 }
 const regionAt=p=>{
  const x=Math.floor(p[0]-minx),y=Math.floor(p[1]-miny);
  return x>=0&&y>=0&&x<nx&&y<ny?labels[y*nx+x]:null;
 };
 for(const portal of portals){
  const wall=walls.find(w=>w.id===portal.wallId),path=compileWallPath(wall);
  const s=portal.at*path.length,aa=sampleWall(path,Math.max(0,s-.05)),bb=sampleWall(path,Math.min(path.length,s+.05));
  const dx=bb[0]-aa[0],dy=bb[1]-aa[1],length=Math.hypot(dx,dy)||1;
  const normal=[-dy/length,dx/length];
  portal.regions=[regionAt([portal.center[0]+normal[0]*.75,portal.center[1]+normal[1]*.75]),
   regionAt([portal.center[0]-normal[0]*.75,portal.center[1]-normal[1]*.75])];
 }
 const result={regions,regionSizes:sizes,portals,segments:segments.length,grid:{width:nx,height:ny,step},note:'Diagnostic 2D topology only; elevations, open edges and portal sightlines require 3D validation'};
 Object.defineProperty(result,'regionAt',{value:regionAt,enumerable:false});
 wallTopologyCache={signature,result};return result;
}
// Read-only topology lookup and a stable wall-layout signature. A room
// number is diagnostic; it is not a permission to reveal room geometry.
function tacticalTopologyVersion(){
 return JSON.stringify(sceneWallPaths().map(w=>[w.id,w.nodes,w.closed,w.z,w.height,w.thickness,w.sight]));
}
function tacticalRoomAt(point){
 if(!Array.isArray(point)||point.length<3||!point.slice(0,3).every(Number.isFinite))return null;
 const region=wallVisibilityTopology().regionAt?.(point);
 return Number.isInteger(region)?region:null;
}
// Diagnostic only: classify potential room connectivity without changing fog.
function wallVisibilityCandidates(topology,prepared){
 if(!topology.regionAt)return null;
 const observerRegions=new Set(prepared.observers.map(o=>topology.regionAt(o.distance)).filter(v=>v!==null));
 const reachable=new Set(observerRegions),queue=[...observerRegions];
 const connections=new Map();
 for(const portal of topology.portals){
  const [a,b]=portal.regions;
  // Open doors and unobscured windows are possible visibility portals.
  // Actual sight through the aperture still requires the 3D renderer.
  const permeable=portal.kind==='Window'?!portal.shaded:portal.open;
  if(!permeable||a===null||b===null||a===b)continue;
  if(!connections.has(a))connections.set(a,new Set());
  if(!connections.has(b))connections.set(b,new Set());
  connections.get(a).add(b);connections.get(b).add(a);
 }
 for(let i=0;i<queue.length;i++)for(const neighbor of connections.get(queue[i])||[])
  if(!reachable.has(neighbor)){reachable.add(neighbor);queue.push(neighbor)}
 return {observerRegions:[...observerRegions],reachableRegions:[...reachable],
  potentiallyDisconnectedRegions:topology.regions-reachable.size,
  regionAt:topology.regionAt,reachable};
}
const wallSolidLists=new WeakMap();
function pathWallSolids(sceneAreas=areas){
 const paths=sceneWallPaths(sceneAreas);
 if(!wallSolidLists.has(paths))wallSolidLists.set(paths,paths.flatMap(wall=>compileWallPath(wall).solids));
 return wallSolidLists.get(paths);
}
function wallPrismInterval(solid,start,end,half=0,height=0){
 if(Math.max(start[2],end[2])<=solid.z-height||Math.min(start[2],end[2])>=solid.top||
  solid.spans.slice(0,2).some(([lo,hi],i)=>Math.max(start[i],end[i])+half<=lo||Math.min(start[i],end[i])-half>=hi))return null;
 const from=solid.axes.map(([x,y])=>x*start[0]+y*start[1]);
 const to=solid.axes.map(([x,y])=>x*end[0]+y*end[1]);
 const bounds=solid.spans.map(([lo,hi],i)=>{
  const [x,y]=solid.axes[i],expand=half*(Math.abs(x)+Math.abs(y));
  return [lo-expand,hi+expand];
 });
 return movementInterval([...from,start[2]],[...to,end[2]],[...bounds,[solid.z-height,solid.top]]);
}
let wallBenchmarkHybrid=false,wallBenchmarkProbes=null,wallBenchmarkBoxTests=0;
function wallSightInterval(bounds,start,end){
 const solid=bounds.wallPrism;
 if(!wallBenchmarkHybrid||!solid.axisAlignedBox)return wallPrismInterval(solid,start,end);
 wallBenchmarkBoxTests++;
 const span=bounds.some(([lo,hi],i)=>Math.max(start[i],end[i])<=lo||
  Math.min(start[i],end[i])>=hi)?null:movementInterval(start,end,bounds);
 if(wallBenchmarkProbes&&wallBenchmarkProbes.length<8)
  wallBenchmarkProbes.push({bounds,start,end,span});
 return span;
}
function wallStopsMovement(solid){
 return solid.opening?solid.opening.kind==='Window'||!solid.opening.open:solid.wall.blocks;
}
function wallPassage(solid){
 const {wall,opening}=solid;
 if(!opening)return {sight:wall.sight,light:wall.light};
 const clear=opening.kind==='Door'?opening.open:!opening.shaded;
 return {sight:clear,light:clear?1:0};
}
function wallRayTransmission(start,end,blockers){
 let transmission=1;
 const traversed=new Map();
 for(const bounds of rayBlockerCandidates(blockers,start,end)){
  if(bounds.wallPrism){
   const solid=bounds.wallPrism;
   if(!wallSightInterval(bounds,start,end))continue;
   const amount=wallPassage(solid).light;
   if(!amount)return 0;
   if(amount<1)traversed.set(solid.wall.id,Math.min(amount,traversed.get(solid.wall.id)??1));
  }else{
   const path=bounds.terrain?turnTerrainPoints([start,end],bounds.terrain,-bounds.terrain.terrainYaw):[start,end];
   if(movementInterval(...path,bounds))return 0;
  }
 }
 for(const amount of traversed.values())transmission*=amount;
 return transmission;
}
// Merge only consecutive, full-height, straight wall prisms for drawing.
// Original prisms remain untouched for movement, raycasting, and openings.
let earlyWallPreselected=0;
let earlyStairGroupCulled=0;
function preselectPathWall(solid){
 if(!solid?.poly?.length||solid.opening)return true;
 if(earlyRoomDisconnected(solid.poly))return false;
 if(earlyForegroundWallInvisible(solid.poly))return false;
 if(Math.abs(solid.z)<=.15&&earlySectorInvisible(solid.poly))return false;
 return true;
}
function renderOptimizedPathWalls(solids){
 // Reject invisible prisms before merging and constructing their faces.
 // Keep openings and original collision/ray geometry untouched.
 solids=solids.filter(solid=>{
  if(preselectPathWall(solid))return true;
  earlyWallPreselected++;return false;
 });
 let pending=null;
 const flush=()=>{if(pending){renderPathWall(pending);pending=null}};
 const near=(a,b)=>Math.abs(a-b)<1e-6;
 const samePoint=(a,b)=>a&&b&&near(a[0],b[0])&&near(a[1],b[1]);
 const mergeable=(a,b)=>{
  if(!a||!b||a.opening||b.opening||a.wall!==b.wall||
   !a.wall?.opacity||!near(a.z,b.z)||!near(a.top,b.top)||
   a.poly?.length!==4||b.poly?.length!==4||
   a.ends?.[1]||b.ends?.[0]||
   !a.capPattern||!b.capPattern)return false;
  const p=a.poly,q=b.poly;
  if(!samePoint(p[1],q[0])||!samePoint(p[2],q[3]))return false;
  const ab=[p[1][0]-p[0][0],p[1][1]-p[0][1]];
  const bc=[q[1][0]-q[0][0],q[1][1]-q[0][1]];
  const cross=ab[0]*bc[1]-ab[1]*bc[0];
  const dot=ab[0]*bc[0]+ab[1]*bc[1];
  return Math.abs(cross)<1e-7*Math.max(1,Math.hypot(...ab)*Math.hypot(...bc))&&dot>0&&
   near(a.capPattern.distance+Math.hypot(...ab),b.capPattern.distance);
 };
 for(const solid of solids){
  if(mergeable(pending,solid)){
   const poly=[pending.poly[0],solid.poly[1],solid.poly[2],pending.poly[3]];
   pending={...pending,poly,ends:[pending.ends?.[0]??false,solid.ends?.[1]??false]};
  }else{flush();pending=solid}
 }
 flush();
}
function renderPathWall(solid){
 const {poly,z,top,wall,opening}=solid;
 if(opening){renderPathOpening(solid);return}
 if(earlyRoomDisconnected(poly)){earlyRoomCullCount++;return}
 if(earlyForegroundWallInvisible(poly))return;
 if(Math.abs(z)<=.15&&earlySectorInvisible(poly))return;
 const surface=wall;
 if(!surface.opacity)return;
 const bottom=poly.map(([x,y])=>[x,y,z]),upper=poly.map(([x,y],i)=>[x,y,solid.topProfile?.[i]??top]);
 // Synthetic face owners stay out of legacy terrain editing and serialization.
 const owner={type:'volume',x:poly[0][0],y:poly[0][1],z,extents:[1,1,top-z],r:0};
 const push=(points,height,edges)=>{
  face(points,surface.color,owner,height,false);
  Object.assign(faces.at(-1),{pathWall:surface,pathSolid:solid,wallId:wall.id,pathEdges:edges});
 };
 // The polygon may run in either direction, including at curved-wall joins.
 const winding=poly.reduce((sum,[x,y],i)=>{
  const [u,v]=poly[(i+1)%poly.length];
  return sum+x*v-y*u;
 },0);
 const cap=upper;
 const ends=solid.ends;
 const rim=!!solid.topProfile||ends&&Math.abs(top-wall.z-wall.height)<1e-6;
 push(cap,cap[0][2],rim?[true,ends[1],true,ends[0]]:null);
 Object.assign(faces.at(-1),{capPattern:solid.capPattern,surfaceLightOffset:[0,0,surfaceClearance]});
 if(!topDown)poly.forEach((_,i)=>{
  // The path's left side is its front; the opposite long face is omitted
  // when the wall is intentionally one-sided.
  if(wall.hideBack&&i===2)return;
  // The short end faces at an ordinary join are buried inside the next
  // prism. Rendering them creates opaque/striped seams under cutaway fade.
  // Keep exposed path ends, intentional hard corners, and opening edges.
  if(i===1&&ends&&!ends[1]||i===3&&ends&&!ends[0])return;
  const j=(i+1)%poly.length;
  const base=Math.abs(z-wall.z)<1e-6;
  const lines=ends&& (i===0?[base,ends[1],rim,ends[0]]:i===2?[base,ends[0],rim,ends[1]]:null);
  push([bottom[i],bottom[j],upper[j],upper[i]],null,lines);
  const [x,y]=poly[i],length=wallDistance(poly[i],poly[j]);
  if(!length)return;
  const outward=Math.sign(winding)*surfaceClearance/length;
  faces.at(-1).surfaceLightOffset=[(poly[j][1]-y)*outward,(x-poly[j][0])*outward,0];
  const basis=solid.capPattern;
  if(!basis)return;
  const [ax,ay]=basis.along;
  const along=poly.length===4&&i%2===0?basis.along:poly[j].map((n,k)=>(n-poly[i][k])/length);
  faces.at(-1).sidePattern={origin:poly[i],along,
   distance:basis.distance+(x-basis.origin[0])*ax+(y-basis.origin[1])*ay};
 });
}
function renderPathOpening({poly,z,top,wall,opening}){
 const left=wallLerp(poly[0],poly[3],.5),right=wallLerp(poly[1],poly[2],.5);
 const width=wallDistance(left,right),height=top-z;
 const along=right.map((n,i)=>(n-left[i])/width),normal=[-along[1],along[0]];
 const world=(u,v,h)=>[left[0]+along[0]*u+normal[0]*v,left[1]+along[1]*u+normal[1]*v,z+h];
 const owner={type:'volume',r:0,x:left[0],y:left[1],z,extents:[1,1,height],details:opening.kind==='Door'?opening.details??{}:undefined};
 const mark=(pane=false,reverse)=>{
  Object.assign(faces.at(-1),{doorFace:true,windowPane:pane,pathOpening:opening,wallId:wall.id,doorDetailReverse:reverse});
 };
 const emit=(points,color,reverse)=>{
  face(points,color,owner,null,false);
  mark(false,reverse);
  if(opening.kind==='Door'&&!opening.open)
   setDoorFaceLighting(faces.at(-1),left,normal,wall.thickness/2+.015);
 };
 // A plan-view marker remains pickable above the lintel.
 if(topDown){
  const depth=Math.max(.08,wall.thickness/2);
  emit([world(0,-depth,wall.z+wall.height-z+.001),world(width,-depth,wall.z+wall.height-z+.001),
   world(width,depth,wall.z+wall.height-z+.001),world(0,depth,wall.z+wall.height-z+.001)],
   opening.kind==='Door'?(opening.open?'#68b592':'#71482e'):(opening.shaded?opening.coverColor??'#8b6546':opening.glassTint??'#89b6c7'));
  return;
 }
 if(opening.kind==='Window'){
  // Glazing and exterior trim sit near the outside (+normal) face. The
  // masonry opening continues back to the interior face as a deep reveal.
  const half=wall.thickness/2,outer=half+.008;
  const sillColor=wall.color??'#827c70';
  const emitReveal=(points,color)=>{
   face(points,color,owner,null,false);
   mark(false);
  };
  // Continuous sill across the wall thickness; it is not a flat pane
  // floating in the center of a thick opening.
  const rear=wall.hideBack?0:-half;
  emitReveal([world(0,rear,.015),world(width,rear,.015),
   world(width,half,.015),world(0,half,.015)],sillColor);
  // Side jambs and header expose the depth of the window opening.
  for(const u of [0,width]){
   emitReveal([world(u,rear,0),world(u,half,0),
    world(u,half,height),world(u,rear,height)],sillColor);
  }
  if(!opening.windowTop||opening.windowTop==='flat')
   emitReveal([world(0,rear,height),world(width,rear,height),
    world(width,half,height),world(0,half,height)],sillColor);
  addWindowFaces({...opening,origin:[0,0,0],doorWidth:width,sillHeight:0,windowHeight:height},
   {world:(u,v,h)=>world(u,v+outer,h),owner,mark});
  if(!opening.shaded&&(opening.windowCover??'shutter')==='shutter'){
   const profile=windowProfile(opening,width,height);
   const color=opening.coverColor??'#8b6546',wing=width*.5;
   for(const [hinge,sign] of [[0,-1],[width,1]]){
    // Open shutters fold back against the outside of the wall.
    const offset=wall.thickness/2+.045;
    const edge=world(hinge,offset,0),end=world(hinge+wing*sign,offset,0);
    const leafTop=profile(hinge),head=profile(hinge-sign*wing);
    emit([edge,end,[end[0],end[1],z+head],[edge[0],edge[1],z+leafTop]],color);
   }
  }
  return;
 }
 const [front,edge,cap,materialThickness]=doorMaterials[opening.material]??doorMaterials.Wood;
 // A normal wall keeps a conventional door leaf. A massive wall gets a
 // proportionately heavier leaf, without filling the entire passage.
 const thickness=Math.max(materialThickness,Math.min(wall.thickness*.6,wall.thickness*.16));
 const halfWall=wall.thickness/2;
 const reverse=opening.hinge==='far',swing=opening.swingReversed?-1:1;
 for(const [start,leafWidth,fromRight] of opening.doorStyle==='double'?[[0,width/2,false],[width/2,width/2,true]]:[[0,width,reverse]]){
  const hinge=fromRight?start+leafWidth:start,sign=fromRight?-1:1;
  const base=[[0,-1],[1,-1],[1,1],[0,1]].map(([u,v])=>opening.open?
   world(hinge+v*thickness/2,swing*u*leafWidth,0):world(hinge+sign*u*leafWidth,v*thickness/2,0));
  const upper=base.map(([x,y])=>[x,y,top]);
  for(let i=0;i<4;i++){
   if(wall.hideBack&&i===0)continue;
   const j=(i+1)%4;emit([base[i],base[j],upper[j],upper[i]],i%2?edge:front,i%2?undefined:i===2);
  }
  emit(upper,cap);
 }
 const trim=Math.min(.075,width/8,height/8),depth=halfWall+.02;
 for(const [left,right,bottom,head] of [[0,trim,0,height],[width-trim,width,0,height],[trim,width-trim,height-trim,height]]){
  for(const side of wall.hideBack?[1]:[-1,1])emit([world(left,depth*side,bottom),world(right,depth*side,bottom),
   world(right,depth*side,head),world(left,depth*side,head)],'#594531');
 }
 // Doorway returns: the exposed inner faces of a thick opening should
 // connect the two wall surfaces, rather than leaving a thin floating leaf.
 if(wall.thickness>.16){
  const jamb=wall.color??'#827c70';
  const rear=wall.hideBack?0:-halfWall;
  for(const u of [0,width])
   emit([world(u,rear,0),world(u,halfWall,0),
    world(u,halfWall,height),world(u,rear,height)],jamb);
  emit([world(0,rear,height),world(width,rear,height),
   world(width,halfWall,height),world(0,halfWall,height)],jamb);
 }
}
function validSceneWallPaths(walls){
 const number=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
 const xy=p=>Array.isArray(p)&&p.length===2&&p.every(n=>number(n,-20,120));
 const ids=new Set();
 let sampleCount=0;
 return Array.isArray(walls)&&walls.length<=100&&walls.every(wall=>{
  if(!wall||typeof wall.id!=='string'||ids.has(wall.id)||!Array.isArray(wall.nodes)||
   wall.nodes.length<(wall.closed?3:2)||wall.nodes.length>48||
   !wall.nodes.every(node=>node&&xy(node.p)&&(!node.in||xy(node.in))&&(!node.out||xy(node.out)))||
   !number(wall.z,0,11)||!number(wall.height,.1,12)||wall.z+wall.height>12||
   !number(wall.thickness,.04,3)||!number(wall.opacity,0,1)||!number(wall.light,0,1)||
   !/^#[a-f\d]{6}$/i.test(wall.color)||!['plain','brick','roughRock','planks','mesa'].includes(wall.texture)||
   wall.hideBack!==undefined&&typeof wall.hideBack!=='boolean'||
   !number(wall.mesaVariation??pathWallDefaults.mesaVariation,0,100)||
   !number(wall.mesaJaggedness??pathWallDefaults.mesaJaggedness,0,100)||
   !number(wall.mesaStrata??pathWallDefaults.mesaStrata,0,100)||
   !Array.isArray(wall.openings)||wall.openings.length>24||
   !wall.openings.every(o=>o&&['Door','Window'].includes(o.kind)&&number(o.at,0,1)&&
    number(o.width,.15,8)&&number(o.height,.1,12)&&number(o.sill,0,12)))return false;
  ids.add(wall.id);
  const path=compileWallPath(wall);
  sampleCount+=path.samples.length;
  return path.length>.1&&path.samples.length<=450&&sampleCount<=2500;
 });
}

let wallTool=null,wallDrag=null,wallPreview=null,wallOpeningIndex=-1;
const wallSelection=new Set();
const wallPatterns=['plain','brick','roughRock','planks','mesa'];
const wallPropertyFields={
 height:{label:'Height (ft)',min:.5,max:60,step:.05,scale:5},
 thickness:{label:'Thickness (ft)',min:.2,max:15,step:.05,scale:5},
 z:{label:'Base elevation (ft)',min:0,max:55,step:.05,scale:5},
 color:{label:'Color',type:'color'},
 texture:{label:'Texture',options:wallPatterns},
 mesaVariation:{label:'Mesa height variation (%)',min:0,max:100,step:1,scale:1,type:'range'},
 mesaJaggedness:{label:'Mesa edge jaggedness (%)',min:0,max:100,step:1,scale:1,type:'range'},
 mesaStrata:{label:'Mesa strata detail (%)',min:0,max:100,step:1,scale:1,type:'range'},
 opacity:{label:'Visual opacity (%)',min:0,max:100,step:1,scale:100,type:'range'},
 light:{label:'Light transmission (%)',min:0,max:100,step:1,scale:100,type:'range'},
 sight:{label:'Allow sight through wall',type:'checkbox'},
 blocks:{label:'Block movement',type:'checkbox'},
 hideBack:{label:'Hide back side (left side is the front)',type:'checkbox'}
};
const apertureFields={
 at:{label:'Position along wall (%)',min:0,max:100,step:'any',scale:100},
 width:{label:'Width (ft)',min:.75,max:40,step:'any',scale:5},
 height:{label:'Opening height (ft)',min:.5,max:60,step:'any',scale:5},
 sill:{label:'Sill height (ft)',min:0,max:60,step:'any',scale:5},
 open:{label:'Door open',type:'checkbox'},
 shaded:{label:'Window shutter closed',type:'checkbox'}
};
const wallWindowAppearance={
 windowTop:{label:'Top profile',options:['flat','semicircle','pointed']},
 windowStyle:{label:'Pane style',options:['single','split','grid','stained']},
 frameColor:{label:'Frame color',type:'color'},glassTint:{label:'Glass tint',type:'color'},
 glassAccent:{label:'Accent glass',type:'color'},glassSecondary:{label:'Border glass',type:'color'},
 glassHighlight:{label:'Highlight glass',type:'color'},
 windowCover:{label:'Cover style',options:['shutter','shade']},coverColor:{label:'Cover color',type:'color'}
};
const wallWindowDefaults={windowTop:'flat',windowStyle:'split',frameColor:'#594531',glassTint:'#89b6c7',
 glassAccent:'#d4994f',glassSecondary:'#618b77',glassHighlight:'#934b41',windowCover:'shutter',coverColor:'#8b6546'};
function wallDoorAppearance(){
 const labels={paneling:'Paneling',handle:'Handle',knocker:'Knocker',kickplate:'Kickplate',upperWindow:'Upper window'};
 return {doorStyle:{label:'Door style',options:['single','double']},material:{label:'Material',options:Object.keys(doorMaterials)},hinge:{label:'Hinge side',options:['near','far']},
  swingReversed:{label:'Reverse swing direction',type:'checkbox'},
  ...Object.fromEntries(Object.entries(doorDetailOptions).map(([key,options])=>[key,{label:labels[key],options}]))};
}
function wallNodeFields(spec,prefix){
 return Object.entries(spec).map(([key,field])=>{
  const input=field.options?'<select id="'+prefix+key+'">'+field.options.map(v=>'<option value="'+v+'">'+
    ({plain:'Solid',brick:'Brick',roughRock:'Rough stone',planks:'Wood planks',mesa:'Mesa rock',flat:'Flat',semicircle:'Semicircular',pointed:'Pointed arch',single:'Single pane',split:'Two panes',grid:'Four panes',stained:'Geometric stained glass',shutter:'Wooden shutters',shade:'Roll-down shade',near:'Near end',far:'Far end',single:'Single leaf',double:'Double leaf · opposite hinges'}[v]||v)+'</option>').join('')+'</select>':
   '<input id="'+prefix+key+'" type="'+(field.type||'number')+'" '+(field.min===undefined?'':'required min="'+field.min+'" max="'+field.max+'" step="'+field.step+'"')+'>';
  const mesaOnly=['mesaVariation','mesaJaggedness','mesaStrata'].includes(key);
  return '<label'+(mesaOnly?' class="mesa-wall-field" hidden':'')+'>'+field.label+' '+input+'</label>';
 }).join('');
}
function readWallFields(spec,prefix,previous){
 return Object.fromEntries(Object.entries(spec).map(([key,field])=>{
  const input=el(prefix+key);
  if(field.type==='checkbox')return [key,input.checked];
  if(!field.scale)return [key,input.value];
  // Keep the stored geometry when the displayed value was left alone.
  const prior=previous?.[key]??pathWallDefaults[key];
  const unchanged=previous&&input.valueAsNumber===wallFieldNumber(prior,field.scale);
  return [key,unchanged?prior:input.valueAsNumber/field.scale];
 }));
}
function wallFieldNumber(value,scale){return Number((value*scale).toFixed(4))}
function writeWallFields(spec,prefix,value){
 for(const [key,field] of Object.entries(spec)){
  const input=el(prefix+key);
  const current=value[key]??pathWallDefaults[key];
  if(field.type==='checkbox')input.checked=!!current;
  else input.value=field.scale?wallFieldNumber(current,field.scale):current;
 }
}
const wallCanEdit=()=>!playing&&!terrainLocked&&roomProfile?.gm!==false;
function wallStatus(value){el('wallPathStatus').textContent=value}
function updateWallList(){
 const list=el('wallPathList'),previous=wallSelection.values().next().value;
 list.replaceChildren(...sceneWallPaths().map((wall,i)=>{
  const issue=compileWallPath(wall).invalid.length;
  const option=new Option((wall.name||'Wall '+(i+1))+(wall.closed?' · loop':'')+(issue?' · '+issue+' opening(s) need adjustment':''),wall.id);
  option.selected=wallSelection.has(wall.id);
  return option;
 }));
 const wall=sceneWallPaths().find(w=>w.id===previous);
 el('wallPlanOpacity').value=100*(areas.find(a=>a.shape==='appearance')?.floorImageOpacity??1);
 if(wall)writeWallFields(wallPropertyFields,'wp-',wall);
 document.querySelectorAll('.mesa-wall-field').forEach(label=>{label.hidden=wall?.texture!=='mesa'});
 const openings=el('wallOpeningList');
 openings.replaceChildren(...(wall&&wallSelection.size===1?wall.openings:[]).map((o,i)=>
  new Option(o.kind+' '+(i+1)+(compileWallPath(wall).invalid.includes(o)?' · does not fit':''),i)));
 if(wallOpeningIndex>=openings.options.length)wallOpeningIndex=-1;
 openings.selectedIndex=wallOpeningIndex;
 const opening=wall?.openings[wallOpeningIndex];
 el('wallOpeningFields').hidden=!opening;
 if(opening){
  writeWallFields(apertureFields,'wa-',opening);
  const door=opening.kind==='Door';
  el('wallDoorAppearance').hidden=!door;el('wallWindowAppearance').hidden=door;
  el('wa-open').closest('label').firstChild.textContent=door?'Door open ':'Window sash open ';
  for(const id of ['wa-shaded','wa-sill'])el(id).closest('label').hidden=door;
  if(door){
   const spec=wallDoorAppearance();
   const defaults=Object.fromEntries(Object.entries(spec).map(([key,field])=>[key,field.options?.[0]??false]));
   writeWallFields(spec,'wd-',{...defaults,...opening,...opening.details});
  }else writeWallFields(wallWindowAppearance,'ww-',{...wallWindowDefaults,...opening});
 }
 const room=wallRoomPick?.existing??(wall?.closed&&wallSelection.size===1?wall.room:null);
 el('wallRoomFields').hidden=!wallRoomPick&&(!wall?.closed||wallSelection.size!==1);
 writeWallRoomFields(room,!!wallRoomPick);
}
let wallOpeningClipboard=null,wallRoomClipboard=null;
function writeWallRoomFields(room,defaultFloor=false){
 el('wallRoomName').value=room?.name??'';
 el('wallRoomDark').checked=!!room?.dark;
 el('wallRoomFloor').checked=room?!!room.floorFinish:defaultFloor;
 el('wallRoomColor').value=room?.floorFinish?.base??'#786247';
 el('wallRoomPattern').value=room?.floorFinish?.pattern??'plain';
 el('wallRoomAccent').value=room?.floorFinish?.accent??'#65513c';
}
function readWallRoomFields(){
 return {name:el('wallRoomName').value.trim(),dark:el('wallRoomDark').checked,
  floorFinish:el('wallRoomFloor').checked?{pattern:el('wallRoomPattern').value,
   base:el('wallRoomColor').value,accent:el('wallRoomAccent').value}:null};
}
function updateSceneWallPaths(next){
 if(!wallCanEdit()||!validSceneWallPaths(next)){wallStatus('Check wall dimensions or simplify the path.');return false}
 remember();
 let area=areas.find(a=>a.shape==='appearance');
 if(!area){area={shape:'appearance',size:1,origin:[0,0,0],angle:0};areas.push(area)}
 area.wallPaths=next;
 movementRenderCache=null;
 updateWallList();
 refresh('Wall layout edited');
 return true;
}
function setWallTool(mode,pasteOpening=false){
 if(!wallCanEdit())return;
 exitTool();
 wallDrag=null;wallPreview=null;wallRoomPick=null;
 wallTool={mode,nodes:[],pasteOpening};
 if(mode!=='view'&&mode!=='inspect')topDown=true;
 el('wallPathPanel').hidden=false;
 showWallTab(({trace:'walls',edit:'walls',Door:'openings',Window:'openings',inspect:'openings',room:'rooms',scale:'plan'})[mode]??el('wallPathPanel').dataset.active??'walls');
 wallStatus({
  trace:'Click to add a corner, drag to shape a curve. Shift-click stops the outgoing curve; C halts the last tangent. Enter finishes.',
  edit:'Select a finalized wall, then drag square anchors or round Bézier handles. Shift-click toggles corner/smooth. Control+Alt-click deletes a node.',
  Door:'Click a straight portion of a wall to place a door.',
  Window:'Click a straight portion of a wall to place a window.',
  scale:'Click two points on the image whose distance you know.',
  room:'Click inside an enclosed room at the selected elevation.',
  inspect:'Right-click a door or window to edit it.',
  view:'Orbit to inspect walls, openings, and lighting.'
 }[mode]);
 updateWallList();draw();
}
function closeWallTool(){
 wallTool=null;wallDrag=null;wallPreview=null;wallRoomPick=null;
 el('wallPathPanel').hidden=true;el('wallPathOpen').focus();draw();
}
function wallMapPoint(event){
 // The imported image remains in physical world coordinates after nine-point
 // calibration. Grid-space 0..width/depth is NOT the visible image boundary:
 // clamping here made wall tracing stop early along the top/right of maps.
 // Preserve the actual inverse-projected point; wall geometry uses the same
 // calibrated grid coordinates as the image projection.
 const [x,y]=inverse(...coords(event),0);
 return [x,y];
}
function wallSnappedPoint(p,event,ignore=null){
 if(event.altKey)return p;
 const nodes=sceneWallPaths().filter(w=>w!==ignore).flatMap(w=>w.nodes.map(n=>n.p));
 const nearest=nodes.reduce((best,q)=>wallDistance(p,q)<(best?wallDistance(p,best):.35)?q:best,null);
 if(nearest)return nearest.slice();
 const wall=nearestWall(p,ignore);
 return wall?.distance<.23?sampleWall(wall.path,wall.at*wall.path.length):p.map(n=>Math.round(n*4)/4);
}
function wallTraceUndo(){
 if(!wallTool||wallTool.mode!=='trace')return;
 if(wallDrag?.trace){wallDrag=null;wallPreview=null}
 if(wallTool.nodes.length){wallTool.nodes.pop();wallStatus('Last point removed. '+wallTool.nodes.length+' points remain.');draw('Undo last wall point')}
 else wallStatus('No points to undo. Trace mode remains active.');
}
function wallTraceNearestNode(p){
 const nodes=wallTool?.nodes||[];let index=-1,distance=Math.max(.15,13/S);
 nodes.forEach((node,i)=>{const d=wallDistance(node.p,p);if(d<distance){distance=d;index=i}});
 return index;
}
function wallTraceStartSeparate(){
 if(wallTool?.mode!=='trace')return false;
 if(wallTool.nodes.length>=2){
  finishWallPath(false);
  if(wallTool?.mode!=='trace')setWallTool('trace');
 }else wallTool.nodes=[];
 wallStatus('New independent wall segment. Click to place its first point.');
 draw('Start independent wall segment');
 return true;
}
function finishWallPath(closed){
 const nodes=wallTool.nodes;
 if(nodes.length<(closed?3:2)){wallStatus('Add more points to finish this wall.');return}
 const wall={...pathWallDefaults,id:crypto.randomUUID(),nodes,closed,openings:[]};
 if(compileWallPath(wall).length<.15){wallStatus('Draw a longer wall.');return}
 wallSelection.clear();wallSelection.add(wall.id);wallOpeningIndex=-1;
 if(updateSceneWallPaths([...sceneWallPaths(),wall]))setWallTool('edit');
}
function nearestWall(p,ignore=null){
 let best=null;
 for(const wall of sceneWallPaths()){
  if(wall===ignore)continue;
  const path=compileWallPath(wall);
  for(let i=1;i<path.samples.length;i++){
   const a=path.samples[i-1],b=path.samples[i],dx=b.p[0]-a.p[0],dy=b.p[1]-a.p[1];
   const t=Math.max(0,Math.min(1,((p[0]-a.p[0])*dx+(p[1]-a.p[1])*dy)/(dx*dx+dy*dy)));
   const distance=wallDistance(p,wallLerp(a.p,b.p,t));
   if(!best||distance<best.distance)best={wall,path,distance,at:(a.s+t*(b.s-a.s))/path.length};
  }
 }
 return best&&best.distance<Math.max(.65,best.wall.thickness/2)?best:null;
}
function defaultWallOpening(kind,at){
 const window=kind==='Window';
 return {kind,at,width:window?.9:1.15,height:window?.8:1.4,sill:window?.65:0,open:false,shaded:false};
}
function wallOpeningForPlacement(kind,at){
 return wallTool?.pasteOpening&&wallOpeningClipboard?.kind===kind?
  {...structuredClone(wallOpeningClipboard),at}:defaultWallOpening(kind,at);
}
function addWallOpening(hit,kind){
 if(!hit){wallStatus('Click closer to a wall.');return}
 const opening=wallOpeningForPlacement(kind,hit.at);
 const wall={...hit.wall,openings:[...hit.wall.openings,opening]};
 if(compileWallPath(wall).invalid.includes(opening)){
  wallStatus('This opening overlaps another opening, hits a bend or endpoint, or is taller than the wall.');return;
 }
 wallSelection.clear();wallSelection.add(wall.id);wallOpeningIndex=wall.openings.length-1;
 if(updateSceneWallPaths(sceneWallPaths().map(w=>w===hit.wall?wall:w)))wallStatus(kind+' placed. Adjust its dimensions below.');
}
function findWallHandle(p){
 let result=null,limit=Math.max(.1,9/S);
 for(const wall of sceneWallPaths()){
  if(!wallSelection.has(wall.id))continue;
  wall.nodes.forEach((node,index)=>{
   for(const key of ['p','in','out']){
    if(!node[key])continue;
    const distance=wallDistance(node[key],p);
    if(distance<limit){limit=distance;result={wall,index,key}}
   }
  });
 }
 return result;
}
function smoothWallNode(wall,index){
 const node=wall.nodes[index];
 if(node.in||node.out){delete node.in;delete node.out;return}
 const prev=wall.nodes[index-1]??(wall.closed?wall.nodes.at(-1):node);
 const next=wall.nodes[index+1]??(wall.closed?wall.nodes[0]:node);
 const direction=next.p.map((n,i)=>(n-prev.p[i])*.18);
 node.in=node.p.map((n,i)=>n-direction[i]);node.out=node.p.map((n,i)=>n+direction[i]);
}
function calibrateWallImage(first,second){
 const distance=wallDistance(first,second);
 if(distance<.1){wallStatus('Choose two distinct points.');return}
 const style=areas.find(a=>a.shape==='appearance')?.appearance;
 if(style?.ground!=='image'||!style.groundImage){wallStatus('Import a floor plan first.');return}
 const answer=prompt('Distance between the two points (ft)');
 if(answer===null)return;
 const ft=Number(answer);
 if(!(ft>0&&ft<=5000)){wallStatus('Enter a distance greater than zero.');return}
 const image={...defaultFloorSettings(),...style.floorImage},scale=ft/(5*distance);
 remember();
 for(const [key,anchor] of [['x',first[0]*5],['y',first[1]*5]])image[key]=anchor+(image[key]-anchor)*scale;
 image.width*=scale;image.depth*=scale;
 style.floorImage=image;movementRenderCache=null;refresh('Floor plan calibrated');
 setWallTool('trace');
}
function deleteFinalWallPart(p,kind){
 const hit=nearestWall(p);
 if(!hit||hit.distance>Math.max(.2,12/S)){wallStatus('Click closer to a finalized wall.');return}
 const wall=hit.wall, nodes=wall.nodes;
 if(wall.openings?.length){wallStatus('This wall contains openings. Move or delete its openings before removing a segment or node.');return}
 const nearest=nodes.map((n,i)=>({i,d:wallDistance(n.p,p)})).sort((a,b)=>a.d-b.d)[0];
 let next=sceneWallPaths().filter(w=>w!==wall),parts=[];
 if(kind==='node'){
  if(nearest.d>Math.max(.2,12/S)){wallStatus('Click directly on a wall node.');return}
  if(nodes.length<=2){wallStatus('Deleting this node would remove the whole wall. Use Delete selected instead.');return}
  const draft=structuredClone(wall);draft.nodes.splice(nearest.i,1);
  if(draft.closed&&draft.nodes.length<3)draft.closed=false;
  parts=[draft];
 }else{
  if(wall.closed){wallStatus('Open the closed wall path before deleting an individual segment.');return}
  let index=-1,dist=Infinity;
  for(let i=0;i<nodes.length-1;i++){
   const a=nodes[i].p,b=nodes[i+1].p,dx=b[0]-a[0],dy=b[1]-a[1];
   const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
   const d=wallDistance(p,[a[0]+t*dx,a[1]+t*dy]);
   if(d<dist){dist=d;index=i}
  }
  if(dist>Math.max(.2,12/S)){wallStatus('Click a straight wall segment to delete it.');return}
  const left=nodes.slice(0,index+1),right=nodes.slice(index+1);
  parts=[left,right].filter(ns=>ns.length>=2).map(ns=>({...structuredClone(wall),id:crypto.randomUUID(),nodes:structuredClone(ns),closed:false,openings:[]}));
 }
 if(updateSceneWallPaths([...next,...parts])){wallSelection.clear();wallOpeningIndex=-1;wallStatus('Finalized wall '+kind+' deleted. Undo is available.')}
}
function handleWallPointerDown(event){
 if(!wallTool||['view','inspect'].includes(wallTool.mode)||!wallCanEdit()||!topDown||event.button!==0||carry)return;
 event.stopImmediatePropagation();event.preventDefault();
 const p=wallMapPoint(event),mode=wallTool.mode;
 if(mode==='scale'){
  if(wallTool.nodes.length){const first=wallTool.nodes.pop().p;calibrateWallImage(first,p)}
  else{wallTool.nodes.push({p});wallStatus('Click the second calibration point.');draw()}
  return;
 }
 if(mode==='room'){selectWallRoom(p);return}
  if(mode==='rectangle'){
   const start=wallTool.nodes[0]?.p;
   if(!start){wallTool.nodes=[{p:wallSnappedPoint(p,event)}];wallStatus('Click the opposite corner of the rectangular partition.');draw();return}
   const end=wallSnappedPoint(p,event),x0=Math.min(start[0],end[0]),x1=Math.max(start[0],end[0]),y0=Math.min(start[1],end[1]),y1=Math.max(start[1],end[1]);
   if(x1-x0<.15||y1-y0<.15){wallStatus('Choose a rectangle with nonzero width and depth.');return}
   const wall={...pathWallDefaults,id:crypto.randomUUID(),nodes:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(p=>({p})),closed:true,openings:[]};
   if(updateSceneWallPaths([...sceneWallPaths(),wall])){wallTool.nodes=[];wallSelection.clear();wallSelection.add(wall.id);wallStatus('Rectangular partition created. Click two corners to create another.');}
   return;
  }
  if(mode==='edit'&&event.ctrlKey&&!event.metaKey){deleteFinalWallPart(p,event.altKey?'node':'segment');return}
 if(mode==='Door'||mode==='Window'){addWallOpening(nearestWall(p),mode);return}
 if(mode==='trace'){
  // Ctrl+Alt starts a separate wall without connecting to the prior path.
  if(event.ctrlKey&&event.altKey){wallTraceStartSeparate();return}
  const nodes=wallTool.nodes;
  // Ctrl+click removes a specific unfinished node; Command+drag moves one.
  if(event.ctrlKey&&!event.metaKey){
   const index=wallTraceNearestNode(p);
   if(index>=0){nodes.splice(index,1);wallStatus('Removed point '+(index+1)+'.');draw('Delete wall trace point')}
   else wallStatus('Ctrl-click a visible trace point to delete it.');
   return;
  }
  if(event.metaKey){
   const index=wallTraceNearestNode(p);
   if(index>=0){
    wallDrag={pointer:event.pointerId,origin:p,traceMove:index,original:structuredClone(nodes[index])};
    canvas.setPointerCapture(event.pointerId);draw();return;
   }
   wallStatus('Command-drag an existing trace point to reposition it.');return;
  }
  if(nodes.length>=3&&wallDistance(p,nodes[0].p)<Math.max(.12,9/S)){finishWallPath(true);return}
  const snapped=wallSnappedPoint(p,event);
  if(nodes.length&&wallDistance(nodes.at(-1).p,snapped)<1e-4)return;
  if(nodes.length>=48){wallStatus('Press Enter to finish this wall.');return}
  if(event.shiftKey&&nodes.length)delete nodes.at(-1).out;
   nodes.push({p:snapped});wallDrag={pointer:event.pointerId,origin:p,trace:true,corner:event.shiftKey};
 }else{
  const handle=findWallHandle(p);
  if(!handle){
   const hit=nearestWall(p);
   if(!event.shiftKey)wallSelection.clear();
   if(hit)wallSelection.has(hit.wall.id)&&event.shiftKey?wallSelection.delete(hit.wall.id):wallSelection.add(hit.wall.id);
   wallOpeningIndex=-1;updateWallList();draw();return;
  }
  const draft=structuredClone(handle.wall);
  if(event.shiftKey&&handle.key==='p'){
   smoothWallNode(draft,handle.index);
   updateSceneWallPaths(sceneWallPaths().map(w=>w===handle.wall?draft:w));return;
  }
  wallDrag={...handle,draft,origin:p,pointer:event.pointerId};
 }
 canvas.setPointerCapture(event.pointerId);draw();
}
function handleWallPointerMove(event){
 if(!wallDrag){
  if((wallTool?.mode==='Door'||wallTool?.mode==='Window')&&wallCanEdit()&&topDown){
   const hit=nearestWall(wallMapPoint(event));
   wallTool.openingPreview=hit?{hit,opening:wallOpeningForPlacement(wallTool.mode,hit.at)}:null;
   draw('Wall opening preview');
  }
  return;
 }
 if(event.pointerId!==wallDrag.pointer)return;
 event.stopImmediatePropagation();
 const p=wallMapPoint(event);
 if(Number.isInteger(wallDrag.traceMove)){
  const node=wallTool.nodes[wallDrag.traceMove],original=wallDrag.original;
  if(node){const snapped=wallSnappedPoint(p,event);node.p=snapped;for(const key of ['in','out'])if(original[key])node[key]=original[key].map((v,i)=>v+snapped[i]-original.p[i]);}
 }else if(wallDrag.trace){
  const node=wallTool.nodes.at(-1);
  if(wallDistance(p,wallDrag.origin)<.08)return;
  const delta=p.map((n,i)=>n-wallDrag.origin[i]);
  node.in=node.p.map((n,i)=>n-delta[i]);
   if(wallDrag.corner)delete node.out;
   else node.out=node.p.map((n,i)=>n+delta[i]);
 }else{
  const {draft,index,key,wall}=wallDrag,node=draft.nodes[index],original=wall.nodes[index];
  if(key==='p'){
   node.p=wallSnappedPoint(p,event,wall);
   for(const handle of ['in','out'])if(original[handle])node[handle]=original[handle].map((n,i)=>n+node.p[i]-original.p[i]);
  }else node[key]=p;
  wallPreview=draft;
 }
 draw('Wall path preview');
}
function finishWallDrag(event,cancel=false){
 if(!wallDrag||event.pointerId!==wallDrag.pointer)return;
 event.stopImmediatePropagation();
 const {wall,draft,trace,traceMove,original}=wallDrag,moved=!!wallPreview;
 wallDrag=null;wallPreview=null;
 if(cancel&&trace)wallTool.nodes.pop();
 if(cancel&&Number.isInteger(traceMove)&&wallTool?.nodes[traceMove])wallTool.nodes[traceMove]=original;
 if(!cancel&&moved)updateSceneWallPaths(sceneWallPaths().map(w=>w===wall?draft:w));
 else draw();
}
function drawWallHandles(){
 if(!wallTool||!wallCanEdit()||!topDown||wallTool.mode==='view')return;
 ctx.save();
 ctx.lineWidth=2;ctx.strokeStyle='#70e8ff';ctx.fillStyle='#112b36';
 if(wallRoomPick)polygon(wallRoomPick.region.polygon.map(p=>point(...p,wallRoomPick.z)),'#70e8ff33','#70e8ff');
 if(wallTool.openingPreview){
  const {hit,opening}=wallTool.openingPreview,fit=wallOpeningFit(hit.wall,hit.path,opening);
  const center=opening.at*hit.path.length;
  const fits=fit&&!hit.path.openings.some(o=>fit.start<o.end+.01&&fit.end>o.start-.01);
  const preview=fit?[fit.a,fit.b]:[sampleWall(hit.path,center-opening.width/2),sampleWall(hit.path,center+opening.width/2)];
  ctx.save();ctx.strokeStyle=fits?'#b7ffb7':'#ff9177';ctx.lineWidth=5;
  ctx.beginPath();preview.forEach((p,i)=>i?ctx.lineTo(...point(...p,0).slice(0,2)):ctx.moveTo(...point(...p,0).slice(0,2)));
  ctx.stroke();ctx.restore();
 }
 const paths=sceneWallPaths().filter(w=>wallSelection.has(w.id)).map(w=>wallPreview?.id===w.id?wallPreview:w);
 if(wallTool.nodes.length)paths.push({z:0,nodes:wallTool.nodes,closed:false});
 for(const wall of paths){
  const project=p=>point(...p,wall.z);
  ctx.beginPath();
  flattenWallPath(wall).samples.forEach(({p},i)=>i?ctx.lineTo(...project(p).slice(0,2)):ctx.moveTo(...project(p).slice(0,2)));
  if(wall.openings){
   const path=compileWallPath(wall);
   for(const opening of path.invalid){
    const [x,y]=project(sampleWall(path,opening.at*path.length));
    ctx.save();ctx.fillStyle='#ffbd51';ctx.font='bold 18px sans-serif';ctx.fillText('!',x+5,y-5);ctx.restore();
   }
  }
  if(wallTool.nodes===wall.nodes&&wallTool.mode==='trace'){
   ctx.save();ctx.lineWidth=Math.max(3,pathWallDefaults.thickness*S);ctx.strokeStyle='#70e8ff70';ctx.stroke();ctx.restore();
  }
  ctx.stroke();
  for(const {p,in:incoming,out:outgoing} of wall.nodes){
   const [x,y]=project(p);
   for(const handle of [incoming,outgoing]){
    if(!handle)continue;
    const [hx,hy]=project(handle);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(hx,hy);ctx.stroke();
    ctx.beginPath();ctx.arc(hx,hy,4,0,2*Math.PI);ctx.fill();ctx.stroke();
   }
   ctx.fillRect(x-4,y-4,8,8);ctx.strokeRect(x-4,y-4,8,8);
  }
 }
 ctx.restore();
}
function wallContainsPoint(poly,x,y){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const [ax,ay]=poly[i],[bx,by]=poly[j];
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}
const pathRoomsCache=new WeakMap();
function wallRooms(){
 const walls=sceneWallPaths();
 const defined=wallRoomDefinitions().flatMap(room=>{
  const region=wallRegionAt(room.seed,room.z);
  return region?[wallRoomFromOutline(room,region.polygon,room.z)]:[];
 });
 return [...defined,...walls.flatMap(wall=>{
  if(!wall.closed||!wall.room)return [];
  if(!pathRoomsCache.has(wall)){
   const polygon=compileWallPath(wall).samples.map(sample=>sample.p);
   pathRoomsCache.set(wall,wallRoomFromOutline(wall.room,polygon,wall.z));
  }
  return [pathRoomsCache.get(wall)];
 })];
}
// Trace bounded faces of the planar wall graph. Crossings become junctions,
// including a partition that ends in the middle of an existing wall.
const wallRegionCache=new WeakMap();
function wallRegions(walls){
 if(wallRegionCache.has(walls))return wallRegionCache.get(walls);
 const edges=walls.flatMap(wall=>{
  const samples=compileWallPath(wall).samples;
  return samples.slice(1).map(({p:b},i)=>({a:samples[i].p,b,cuts:[0,1]}));
 });
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
 for(let i=0;i<edges.length;i++){
  const a=edges[i],r=sub(a.b,a.a);
  for(let j=i+1;j<edges.length;j++){
   const b=edges[j];
   if([0,1].some(k=>Math.max(a.a[k],a.b[k])+1e-6<Math.min(b.a[k],b.b[k])||Math.max(b.a[k],b.b[k])+1e-6<Math.min(a.a[k],a.b[k])))continue;
   const s=sub(b.b,b.a),delta=sub(b.a,a.a),det=cross(r,s);
   if(Math.abs(det)<1e-9)continue;
   const t=cross(delta,s)/det,u=cross(delta,r)/det;
   if(t>=-1e-6&&t<=1+1e-6&&u>=-1e-6&&u<=1+1e-6){
    a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)));
   }
  }
 }
 const nodes=new Map();
 function node(p){
  const key=p.map(n=>Math.round(n*10000)).join(',');
  if(!nodes.has(key))nodes.set(key,{p,links:new Map()});
  return nodes.get(key);
 }
 for(const {a,b,cuts} of edges){
  cuts.sort((x,y)=>x-y);
  for(let i=1;i<cuts.length;i++){
   const u=node(wallLerp(a,b,cuts[i-1])),v=node(wallLerp(a,b,cuts[i]));
   if(u===v||u.links.has(v))continue;
   const out={from:u,to:v},back={from:v,to:u};
   out.reverse=back;back.reverse=out;
   u.links.set(v,out);v.links.set(u,back);
  }
 }
 for(const n of nodes.values())n.sorted=[...n.links.values()].sort((a,b)=>
  Math.atan2(a.to.p[1]-n.p[1],a.to.p[0]-n.p[0])-Math.atan2(b.to.p[1]-n.p[1],b.to.p[0]-n.p[0]));
 const regions=[];
 for(const n of nodes.values())for(const start of n.sorted){
  if(start.visited)continue;
  const polygon=[];
  let current=start;
  while(!current.visited){
   current.visited=true;polygon.push(current.from.p);
   const out=current.to.sorted;
   current=out[(out.indexOf(current.reverse)+out.length-1)%out.length];
  }
  const area=polygon.reduce((sum,p,i)=>sum+cross(p,polygon[(i+1)%polygon.length]),0)/2;
  if(current===start&&area>.04)regions.push({polygon,area});
 }
 regions.sort((a,b)=>a.area-b.area);
 wallRegionCache.set(walls,regions);
 return regions;
}
function wallRegionAt(point,z){
 const walls=sceneWallPaths();
 let byElevation=wallElevationCache.get(walls);
 if(!byElevation){byElevation=new Map();wallElevationCache.set(walls,byElevation)}
 if(!byElevation.has(z))byElevation.set(z,walls.filter(w=>Math.abs(w.z-z)<1e-6));
 return wallRegions(byElevation.get(z)).find(r=>wallContainsPoint(r.polygon,...point))??null;
}
const wallElevationCache=new WeakMap();
let wallRoomPick=null;
function wallRoomFromOutline(room,polygon,z){
 const [xs,ys]=[0,1].map(axis=>polygon.map(p=>p[axis]));
 const x=Math.min(...xs),y=Math.min(...ys);
 return {...room,wallOutline:polygon,origin:[x,y,z],size:Math.max(...xs)-x,depth:Math.max(...ys)-y};
}
function drawWallRoomLabels(){
 if(playing||roomProfile?.gm===false||el('wallPathPanel').hidden)return;
 ctx.save();ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 for(const room of wallRooms()){
  if(!room.name)continue;
  const center=[room.origin[0]+room.size/2,room.origin[1]+room.depth/2];
  const anchor=room.seed??center;
  if(!wallContainsPoint(room.wallOutline,...anchor))continue;
  const [x,y]=point(...anchor,room.origin[2]+.04);
  ctx.lineWidth=3;ctx.strokeStyle='#29231f';ctx.fillStyle='#fff2d8';
  ctx.strokeText(room.name,x,y);ctx.fillText(room.name,x,y);
 }
 ctx.restore();
}
function wallRoomDefinitions(){
 return areas.find(a=>a.shape==='appearance')?.wallRoomRegions??[];
}
function selectWallRoom(p){
 const elevation=Number(el('wallRoomElevation').value)/5;
 const region=wallRegionAt(p,elevation);
 if(!region){wallRoomPick=null;updateWallList();wallStatus('This point is outside a closed room. Check for a gap between wall endpoints.');draw();return}
 const existing=wallRoomDefinitions().find(room=>room.z===elevation&&wallRegionAt(room.seed,elevation)===region);
 wallRoomPick={seed:p,z:elevation,region,existing};
 wallSelection.clear();wallOpeningIndex=-1;
 updateWallList();wallStatus('Enclosed room selected. Set its name, floor, and lighting below.');draw();
}

function wallApertures(){
 return sceneWallPaths().flatMap(wall=>compileWallPath(wall).openings.map(fit=>({...fit,wall})));
}
function wallRoomAmbient(target,level,blockers){
 for(const {wall,a,b,opening} of wallApertures()){
  if(opening.kind==='Door'?!opening.open:opening.shaded)continue;
  const mid=wallLerp(a,b,.5),height=wall.z+opening.sill+opening.height/2;
  if(Math.hypot(target[0]-mid[0],target[1]-mid[1],target[2]-height)>interpolateLight(ambientRanges,level))continue;
  const length=wallDistance(a,b),offset=wall.thickness/2+.04;
  const normal=[(a[1]-b[1])/length,(b[0]-a[0])/length];
  for(const side of [-1,1]){
   const outside=[mid[0]+side*normal[0]*offset,mid[1]+side*normal[1]*offset,height];
   if(!roomIsDark(outside)&&wallRayTransmission(outside,[target[0],target[1],target[2]+.05],blockers)>0)return true;
  }
 }
 return false;
}
function wallOpeningContext(event,location){
 if(event.type==='contextmenu'&&(terrainMenuPress||performance.now()<terrainMenuSuppressUntil)&&!phonePress?.opened)return false;
 if((playing?!roomProfile?.gm:!wallCanEdit())||objectHandlesBlocked()||drag||event.shiftKey||event.altKey||event.ctrlKey||event.metaKey)return;
 const [x,y]=location??coords(event),target=hit(x,y,null,false,null,true);
 let wall=sceneWallPaths().find(w=>w.id===target?.wallId),opening=target?.pathOpening;
 // An open leaf has no face. Test the projected aperture against the picked depth.
 if(!opening){
  for(const {a,b,wall:w,opening:o} of wallApertures()){
   if(o.kind!=='Door'||!o.open)continue;
   const low=w.z+o.sill,high=low+o.height;
   const quad=[point(...a,low),point(...b,low),point(...b,high),point(...a,high)];
   const depth=quad.reduce((sum,p)=>sum+p[2],0)/4;
   if(!wallContainsPoint(quad,x,y)&&!(topDown&&wallDistance(inverse(x,y,0),wallLerp(a,b,.5))<o.width/2))continue;
   if(!topDown&&target?.p&&!target.wallId&&target.depth>depth+.35)continue;
   wall=w;opening=o;break;
  }
 }
 if(!wall||!opening)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(playing)togglePathOpening(wall,opening,opening.kind==='Door'?'open':'shaded');
 else editPathOpening(wall,opening);
 return true;
}
function editPathOpening(wall,opening){
 if(!wallCanEdit())return;
 setWallTool('inspect');
 wallSelection.clear();wallSelection.add(wall.id);
 wallOpeningIndex=wall.openings.indexOf(opening);
 updateWallList();
 wallStatus(opening.kind+' selected. Edit its dimensions or change its open state below.');
 el('wallOpeningFields').scrollIntoView({block:'nearest'});
}
let playerPathDoorPending=false;
async function togglePlayerPathDoor(wall,opening){
 if(playerPathDoorPending||opening.kind!=='Door'||opening.secret)return;
 if(playerScenePaused()||opening.locked){
  message(opening.locked?'That door is locked.':'The scene is paused.');
  return;
 }
 const openingIndex=wall.openings.indexOf(opening);
 if(openingIndex<0)return;
 playerPathDoorPending=true;
 try{
  await roomRpc('opening',{ticket:roomProfile.token,opening_id:'path-wall:'+openingIndex+':'+wall.id,
   desired_open:!opening.open,expected_revision:roomRevision});
 }catch(error){
  message(error.message);
 }finally{
  await pollRoom();
  playerPathDoorPending=false;
 }
}
function togglePathOpening(wall,opening,key){
 if(!playing||!roomProfile?.gm||!sceneWallPaths().includes(wall))return;
 const next={...wall,openings:wall.openings.map(o=>o===opening?{...o,[key]:!o[key]}:o)};
 remember();areas.find(a=>a.shape==='appearance').wallPaths=sceneWallPaths().map(w=>w===wall?next:w);
 movementRenderCache=null;refresh('Wall opening toggled');
}
function loadWallTest(){
 if(!wallCanEdit())return;
 if(roomPatchBusy||roomPatchPending){wallStatus('Wait for the current scene to finish syncing.');return}
 if(!confirm('Open the curved corridor as a new draft? Save any changes you want to keep first.'))return;
 const make=(nodes,properties)=>({...pathWallDefaults,id:crypto.randomUUID(),nodes,closed:false,openings:[],...properties});
 const testWalls=[
  make([{p:[13,16]},{p:[19,16]},{p:[25,16],out:[29,16]},{p:[30,23],in:[30,19]}],{
   name:'Outer corridor wall',texture:'brick',height:2.4,
   openings:[{kind:'Door',at:.12,width:1.35,height:1.6,sill:0,open:true,shaded:false},
    {kind:'Window',at:.42,width:1.5,height:1.1,sill:.65,open:false,shaded:false}]}),
  make([{p:[13,19]},{p:[24,19],out:[26,19]},{p:[27,23],in:[27,21]}],{name:'Inner corridor wall',color:'#707d81',light:.35}),
  make([{p:[13,16]},{p:[13,19]}],{name:'Corridor end'})
 ];
 const example={id:crypto.randomUUID(),name:'Curved corridor test',map:{
  pieces:[],tokens:[
   {type:'standee',name:'Medium tester',icon:'⚔',color:'#647eaf',x:14,y:17,z:0,size:1,role:'pc'},
   {type:'standee',name:'Large tester',icon:'◆',color:'#8c693e',x:23,y:20,z:0,size:2,role:'ally'}],
  areas:[{shape:'appearance',size:1,origin:[0,0,0],angle:0,appearance:{ambient:{enabled:true,level:1}},wallPaths:testWalls},
   {shape:'light',size:1,origin:[20,14,0],angle:0,on:true,bright:30,radius:45,tint:'#ffcf85',lightElevation:1.15}],
  view:{...savePanelView(),topDown:true}
 }};
 loadSavedScene(example,true);
 currentSceneId=null;roomDraftAttached=false;wallSelection.clear();wallOpeningIndex=-1;
 el('sceneSource').value='current';el('sceneSource').onchange();el('sceneName').value=example.name;
 setWallTool('edit');wallStatus('Test draft. Switch to Play and right-click an opening to test the door or shutter.');
}
function showWallTab(id){
 const panel=el('wallPathPanel');
 panel.dataset.active=id;
 for(const tab of el('wallPathTabs').querySelectorAll('[role="tab"]')){
  const current=tab.id==='wall-tab-'+id;
  tab.setAttribute('aria-selected',String(current));tab.tabIndex=current?0:-1;
  el(tab.getAttribute('aria-controls')).hidden=!current;
 }
}
function initializeWallPaths(){
 const section=document.createElement('details');
 section.id='wallPathMenu';
 section.innerHTML='<summary>Wall layout</summary><button id="wallPathOpen" type="button">Edit wall paths</button> '+
  '<button id="wallPathTest" type="button">Test curved corridor</button>';
 const panel=document.createElement('section');
 panel.id='wallPathPanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','wallPathTitle');
 const tabs=[['plan','Floor plan'],['walls','Walls'],['openings','Doors & windows'],['rooms','Rooms']];
 const pane=id=>'<div role="tabpanel" aria-labelledby="wall-tab-'+id+'" id="wall-pane-'+id+'" hidden>';
 panel.innerHTML='<div id="wallPathHeader"><h2 id="wallPathTitle">Wall & room editor</h2><div><button id="wallView" type="button">Inspect in 3D</button> <button id="wallDone" type="button">Close</button></div></div>'+
  '<div id="wallPathTabs" role="tablist" aria-label="Wall editor sections">'+tabs.map(([id,label])=>
   '<button type="button" role="tab" id="wall-tab-'+id+'" aria-controls="wall-pane-'+id+'">'+label+'</button>').join('')+'</div>'+
  '<p id="wallPathStatus" role="status"></p>'+pane('plan')+
   '<div class="wall-path-actions"><button id="wallPlanImage" type="button">Floor plan image</button>'+
   '<button id="wallPlanScale" type="button">Calibrate image</button><button id="wallPlanVisible" type="button">Toggle floor image</button>'+
   '<label>Image opacity <input id="wallPlanOpacity" type="range" min="0" max="100" value="100"></label></div></div>'+pane('walls')+'<div class="wall-path-actions">'+
   '<button id="wallTrace" type="button">Trace wall</button><button id="wallFinish" type="button">Finish wall</button>'+
   '<button id="wallEdit" type="button">Edit points</button><button id="wallRectangle" type="button">Rectangle partition</button></div>'+
   '<div class="wall-path-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">'+
   '<button id="wallCopyStyle" type="button">Copy wall style</button>'+
   '<button id="wallPaintSelected" type="button">Paint selected walls</button>'+
   '<button id="wallPaintAll" type="button">Paint all walls</button></div>'+
   '<label>Walls <select id="wallPathList" multiple size="4"></select></label>'+
   '<p>Shift-click walls to select several. In Edit points: Control-click deletes a finalized segment; Control+Alt-click deletes a node. Rectangle partition: click opposite corners. Alt bypasses snapping.</p><div id="wallTraceShortcutGuide" style="padding:8px 10px;margin:8px 0;border:1px solid #70e8ff66;border-radius:6px;background:#142c35;color:#e8f8fa;font-size:12px;line-height:1.65"><strong>Wall tracing · Key + click reference</strong><div>Click — add point / drag for curve</div><div>Alt + click — place without snapping</div><div>Command + drag point — move unfinished point</div><div>Control + click point — delete unfinished point</div><div>Shift + click / drag — stop outgoing curve at a sharp corner</div><div>C — halt curve at last point</div><div>Edit points — drag round handles after finalizing; Control + Alt + click deletes a node</div><div>Control + Alt + click — finish current path and begin a separate wall</div><div>Esc / Delete — undo last point (repeat to backtrack)</div><div>Enter — finish current wall</div><div>Finish wall / Done — save or exit deliberately</div></div>'+
   '<form id="wallProperties"><div class="wall-path-fields">'+wallNodeFields(wallPropertyFields,'wp-')+'</div>'+
   '<button type="submit">Apply changed settings to selected walls</button> <button id="wallDelete" type="button">Delete selected</button></form></div>'+pane('openings')+
   '<div class="wall-path-actions"><button id="wallDoor" type="button">Paint door</button><button id="wallWindow" type="button">Paint window</button> <button id="wallOpeningPaste" type="button" disabled>Paste opening</button></div>'+
   '<label>Openings <select id="wallOpeningList" size="3"></select></label>'+
   '<form id="wallOpeningFields" hidden><div class="wall-path-fields">'+wallNodeFields(apertureFields,'wa-')+'</div>'+
   '<div id="wallDoorAppearance" class="wall-path-fields">'+wallNodeFields(wallDoorAppearance(),'wd-')+'</div>'+
   '<div id="wallWindowAppearance" class="wall-path-fields">'+wallNodeFields(wallWindowAppearance,'ww-')+'</div>'+
   '<button type="submit">Apply opening</button> <button id="wallOpeningCopy" type="button">Copy opening</button> <button id="wallOpeningDelete" type="button">Delete opening</button></form></div>'+pane('rooms')+
   '<div class="wall-path-actions"><button id="wallDetectRoom" type="button">Detect room</button><label>Room elevation (ft) <input id="wallRoomElevation" type="number" min="0" max="55" step="any" value="0"></label></div>'+
   '<p>Click Detect room, then click inside the enclosed area on the map.</p>'+
   '<form id="wallRoomFields" hidden><label>Room name <input id="wallRoomName" maxlength="80"></label>'+
   '<label><input id="wallRoomDark" type="checkbox"> Dark room</label>'+
   '<label><input id="wallRoomFloor" type="checkbox"> Set floor finish</label><label>Floor color <input id="wallRoomColor" type="color"></label>'+
   '<label>Floor pattern <select id="wallRoomPattern">'+Object.entries(roomFloorPatterns).map(([id,label])=>
    '<option value="'+id+'">'+label+'</option>').join('')+'</select></label>'+
   '<label>Grain or grout color <input id="wallRoomAccent" type="color"></label>'+
   '<button type="submit">Apply enclosed room</button> <button id="wallRoomCopy" type="button">Copy room settings</button> <button id="wallRoomPaste" type="button" disabled>Paste room settings</button></form></div>';
 el('sceneAppearance').after(section);
 document.body.append(panel);
 const header=el('wallPathHeader');
 let grab;
 const position=(left,top)=>{
  panel.style.right='auto';
  panel.style.left=Math.max(0,Math.min(left,innerWidth-panel.offsetWidth))+'px';
  panel.style.top=Math.max(0,Math.min(top,innerHeight-panel.offsetHeight))+'px';
 };
 header.onpointerdown=event=>{
  if(event.button!==0||event.target.closest('button'))return;
  const rect=panel.getBoundingClientRect();
  grab=[event.clientX-rect.left,event.clientY-rect.top];
  header.setPointerCapture(event.pointerId);
 };
 header.onpointermove=event=>{if(grab)position(event.clientX-grab[0],event.clientY-grab[1])};
 header.onlostpointercapture=()=>{grab=null};
 window.addEventListener('resize',()=>{
  if(!panel.hidden&&panel.style.left)position(panel.offsetLeft,panel.offsetTop);
 });
 for(const [id] of tabs)el('wall-tab-'+id).onclick=()=>showWallTab(id);
 el('wallPathTabs').onkeydown=event=>{
  const index=tabs.findIndex(([id])=>event.target.id==='wall-tab-'+id);
  if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  showWallTab(tabs[next][0]);el('wall-tab-'+tabs[next][0]).focus();
 };
 for(const id of ['wallRoomColor','wallRoomPattern','wallRoomAccent'])el(id).oninput=()=>{el('wallRoomFloor').checked=true};
 showWallTab('walls');
 el('wallPathOpen').onclick=()=>setWallTool('trace');
 el('wallPathTest').onclick=loadWallTest;
 el('wallPlanImage').onclick=()=>{
  el('sceneAppearance').click();
  el('groundStyle').value='image';updateSkyControls();
 };
 el('wallPlanScale').onclick=()=>setWallTool('scale');
 el('wallPlanVisible').onclick=()=>{
  const area=areas.find(a=>a.shape==='appearance');
  if(!wallCanEdit()||!area?.appearance?.groundImage)return;
  remember();area.floorImageHidden=!area.floorImageHidden;movementRenderCache=null;refresh();
 };
 el('wallPlanOpacity').onchange=()=>{
  const area=areas.find(a=>a.shape==='appearance');
  if(!wallCanEdit()||!area?.appearance?.groundImage)return;
  remember();area.floorImageOpacity=el('wallPlanOpacity').valueAsNumber/100;movementRenderCache=null;refresh();
 };
 for(const [id,mode] of [['wallTrace','trace'],['wallEdit','edit'],['wallRectangle','rectangle'],['wallDoor','Door'],['wallWindow','Window'],['wallView','view'],['wallDetectRoom','room']])
  el(id).onclick=()=>{setWallTool(mode);if(mode==='view'){topDown=false;tilt=.69;draw()}};
 el('wallDone').onclick=closeWallTool;
 el('wallFinish').onclick=()=>{if(wallTool?.mode==='trace')finishWallPath(false)};
 el('wallPathList').onchange=()=>{
  wallSelection.clear();for(const o of el('wallPathList').selectedOptions)wallSelection.add(o.value);
  wallOpeningIndex=-1;setWallTool('edit');
 };
 el('wp-texture').onchange=()=>{
  document.querySelectorAll('.mesa-wall-field').forEach(label=>{label.hidden=el('wp-texture').value!=='mesa'});
 };
 el('wallOpeningList').onchange=()=>{wallOpeningIndex=el('wallOpeningList').selectedIndex;updateWallList();draw()};
 let copiedWallStyle=null;
 const wallStyleKeys=['height','thickness','z','color','texture','opacity','light','sight','blocks','hideBack','mesaVariation','mesaJaggedness','mesaStrata'];
 el('wallCopyStyle').onclick=()=>{
  const source=sceneWallPaths().find(w=>wallSelection.has(w.id));
  if(!source){wallStatus('Select a wall to copy its style.');return}
  copiedWallStyle=Object.fromEntries(wallStyleKeys.map(key=>[key,structuredClone(source[key]??pathWallDefaults[key])]));
  wallStatus('Copied wall style. Select target walls, or choose Paint all walls.');
 };
 function paintWallStyle(all){
  if(!copiedWallStyle){wallStatus('Copy a wall style first.');return}
  const targets=sceneWallPaths().filter(w=>all||wallSelection.has(w.id));
  if(!targets.length){wallStatus('Select one or more target walls first.');return}
  if(all&&!confirm('Apply copied wall style to all '+targets.length+' walls? Wall shapes, doors and windows will remain unchanged.'))return;
  const next=sceneWallPaths().map(w=>(all||wallSelection.has(w.id))?{...w,...copiedWallStyle}:w);
  if(updateSceneWallPaths(next))wallStatus('Applied copied style to '+targets.length+' wall'+(targets.length===1?'':'s')+'. Openings and wall paths preserved.');
 }
 el('wallPaintSelected').onclick=()=>paintWallStyle(false);
 el('wallPaintAll').onclick=()=>paintWallStyle(true);
 el('wallProperties').onsubmit=event=>{
  event.preventDefault();
  const selected=sceneWallPaths().find(w=>wallSelection.has(w.id));
  if(!selected)return;
  const inputs=readWallFields(wallPropertyFields,'wp-');
  // A batch edit changes only fields touched relative to the displayed wall.
  const settings=Object.fromEntries(Object.entries(inputs).filter(([key,v])=>{
   const prior=selected[key]??pathWallDefaults[key];
   return typeof v==='number'?Math.abs(v-prior)>1e-6:v!==prior;
  }));
  if(!updateSceneWallPaths(sceneWallPaths().map(w=>wallSelection.has(w.id)?{...w,...settings}:w)))
   wallStatus('Check the height, elevation, and thickness limits.');
 };
 el('wallDelete').onclick=()=>{
  if(!wallSelection.size||!confirm('Delete the selected walls and their openings?'))return;
  const walls=sceneWallPaths().filter(w=>!wallSelection.has(w.id));
  wallSelection.clear();wallOpeningIndex=-1;updateSceneWallPaths(walls);
 };
 function editOpening(remove){
  const target=sceneWallPaths().find(w=>wallSelection.has(w.id));
  const opening=target?.openings[wallOpeningIndex];
  if(!opening)return;
  const values={...opening,...readWallFields(apertureFields,'wa-',opening)};
  if(opening.kind==='Door'){
   const {doorStyle,material,hinge,swingReversed,...details}=readWallFields(wallDoorAppearance(),'wd-');
   Object.assign(values,{sill:0,doorStyle,material,hinge,swingReversed,details});
  }else Object.assign(values,readWallFields(wallWindowAppearance,'ww-'));
  const next={...target,openings:target.openings.flatMap(o=>o===opening?(remove?[]:[values]):[o])};
  if(!remove&&compileWallPath(next).invalid.includes(values)){
   wallStatus('The opening does not fit here. Move it along the wall or adjust its size.');return;
  }
  if(remove)wallOpeningIndex=-1;
  updateSceneWallPaths(sceneWallPaths().map(w=>w===target?next:w));
 }
 el('wallOpeningCopy').onclick=()=>{
  const opening=sceneWallPaths().find(w=>wallSelection.has(w.id))?.openings[wallOpeningIndex];
  if(!wallCanEdit()||!opening)return;
  wallOpeningClipboard=structuredClone(opening);
  const button=el('wallOpeningPaste');
  button.disabled=false;button.textContent='Paste '+opening.kind.toLowerCase();
  wallStatus(opening.kind+' copied. Choose Paste to place a copy on a wall.');
 };
 el('wallOpeningPaste').onclick=()=>{
  if(!wallCanEdit()||!wallOpeningClipboard)return;
  setWallTool(wallOpeningClipboard.kind,true);
  wallStatus('Click a wall to place the copied '+wallOpeningClipboard.kind.toLowerCase()+'.');
 };
 el('wallOpeningFields').onsubmit=event=>{event.preventDefault();editOpening(false)};
 el('wallOpeningDelete').onclick=()=>editOpening(true);
 el('wallRoomCopy').onclick=()=>{
  if(!wallCanEdit())return;
  wallRoomClipboard=readWallRoomFields();
  el('wallRoomPaste').disabled=false;
  wallStatus('Room settings copied. Select another enclosed room to paste them.');
 };
 el('wallRoomPaste').onclick=()=>{
  if(!wallCanEdit()||!wallRoomClipboard)return;
  writeWallRoomFields({...wallRoomClipboard,name:el('wallRoomName').value});
  wallStatus('Settings pasted into the editor. Apply enclosed room to save them.');
 };
 el('wallRoomFields').onsubmit=event=>{
  event.preventDefault();
  if(!wallCanEdit())return;
  const target=sceneWallPaths().find(w=>wallSelection.has(w.id)&&w.closed);
  if(!target&&!wallRoomPick)return;
  const room=readWallRoomFields();
  if(wallRoomPick){
   const {seed,z,existing}=wallRoomPick,definitions=wallRoomDefinitions();
   if(!existing&&definitions.length>=100){wallStatus('The scene already has 100 detected rooms.');return}
   remember();
   const next={...room,seed,z};
   areas.find(a=>a.shape==='appearance').wallRoomRegions=[...definitions.filter(r=>r!==existing),next];
   wallRoomPick.existing=next;updateWallList();refresh('Room finish updated');
   wallStatus((room.name||'Room')+' saved'+(room.floorFinish?' with a floor finish.':'.'));
  }else if(updateSceneWallPaths(sceneWallPaths().map(w=>w===target?{...w,room}:w)))wallStatus((room.name||'Room')+' saved.');
 };
 canvas.addEventListener('pointerdown',handleWallPointerDown,true);
 canvas.addEventListener('pointermove',handleWallPointerMove,true);
 canvas.addEventListener('pointerup',finishWallDrag,true);
 canvas.addEventListener('pointercancel',event=>finishWallDrag(event,true),true);
 canvas.addEventListener('pointerleave',()=>{if(wallTool?.openingPreview){wallTool.openingPreview=null;draw()}});
 canvas.addEventListener('contextmenu',event=>wallOpeningContext(event),true);
 window.addEventListener('keydown',event=>{
  if(!wallTool||!wallCanEdit()||event.target.closest('input,select,textarea,dialog,button'))return;
  if(wallTool.mode==='trace'&&event.key.toLowerCase()==='c'&&!event.ctrlKey&&!event.metaKey){
   event.preventDefault();event.stopImmediatePropagation();
   const node=wallTool.nodes.at(-1);
   if(node){delete node.out;wallStatus('Curve halted at last point; next segment starts sharply.');draw('Wall curve corner')}
   return;
  }
  if(event.key==='Enter'&&wallTool.mode==='trace'){event.preventDefault();event.stopImmediatePropagation();finishWallPath(false)}
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(wallTool.mode==='trace')wallTraceUndo();else closeWallTool()}
  if(wallTool.mode==='trace'&&(event.key==='Backspace'||event.key==='Delete')&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();wallTraceUndo()}
 },true);
}

function drawSceneGround(config,flat=false,floorImage=null){
 const theme=Object.hasOwn(terrainThemes,config?.terrainTheme)?terrainThemes[config.terrainTheme]:null;
 if(!config?.ground&&!theme)return false;
 if(theme&&!config?.ground)config={...config,ground:theme.groundPattern||'grass'};
 const quad=[[0,0],[gridLimit(0),0],[gridLimit(0),gridLimit(1)],[0,gridLimit(1)]].map(([x,y])=>point(x,y,0));
 if(config.ground==='image'){
  const image=config.groundImage&&getArt(config.groundImage);
  if(!image?.naturalWidth)return false;
  if(!floorImage)polygon(quad,'#e2d4b5',null);
  if(floorImage){
   // A calibrated VTT grid must never crop the stationary floor image.
   // Use the image's own fixed-world polygon as its clipping region.
   const imageClip=floorImage.corners.map(([x,y])=>rawPoint(x,y,0));
   paintFloorImage(floorImage,imageClip,0);
  }else if(flat){
   const color=averageTerrainColor(image);
   if(color)polygon(quad,color,null);
  }else mapImage(image,quad);
  return true;
 }
 const key=config.ground+':'+config.seed+':'+(config.terrainTheme||'');
 if(groundTextureKey!==key){
  groundTexture=document.createElement('canvas');groundTexture.width=groundTexture.height=768;
  const g=groundTexture.getContext('2d');
  g.fillStyle=theme?.ground||'#e2d4b5';g.fillRect(0,0,768,768);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const seed=config.ground==='seeded'?((config.seed||0)+Math.imul(x+8*y,2654435761))>>>0:1;
   g.drawImage(scenePattern(config.ground,seed),x*96,y*96,96,96);
  }
  groundTextureKey=key;
 }
 if(flat)polygon(quad,averageTerrainColor(groundTexture),null);else mapImage(groundTexture,quad);
 return true;
}
const defaultSkyColors=['#314960','#607e96','#e7dfc9','#d9a785','#f1ded0'];
const formerCeilingColors=['#51453a','#827362','#ad9877'];
let skyOverlayCache=null;
function skyOverlayTexture(config){
 const kind=config.overlay;
 if(!['clouds','stars'].includes(kind))return null;
 const density=Math.max(0,Math.min(100,Number(config.density??45)))/100;
 const variety=Math.max(0,Math.min(100,Number(config.variety??50)))/100;
 const tone=Math.max(0,Math.min(100,Number(config.tone??65)))/100;
 const key=[kind,density,variety,tone].join(':');
 if(skyOverlayCache?.key===key)return skyOverlayCache.canvas;
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=384;
 const g=canvas.getContext('2d');
 let state=324761;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const count=Math.round(density*(kind==='stars'?460:36));
 for(let i=0;i<count;i++){
  const x=random()*canvas.width,y=random()*canvas.height*.92;
  const size=random(),opacity=random(),shape=random();
  if(kind==='stars'){
   const radius=.65+size*variety*2;
   g.fillStyle='rgba(255,248,225,'+tone*(.35+opacity*.65)+')';
   g.beginPath();g.arc(x,y,radius,0,Math.PI*2);g.fill();
   if(shape<variety*.12){g.fillRect(x-radius*2,y-.35,radius*4,.7);g.fillRect(x-.35,y-radius*2,.7,radius*4)}
  }else{
   const gray=Math.round(28+tone*222),radius=38+size*(34+variety*65);
   const puffs=2+Math.round(variety*4);
   for(let n=0;n<puffs;n++){
    const dx=(n-(puffs-1)/2)*radius*.38,dy=(random()-.5)*radius*.4;
    const puff=radius*(.54+random()*.46);
    for(const wrap of [-canvas.width,0,canvas.width]){
     g.save();g.translate(x+dx+wrap,y+dy);g.scale(1,.31+shape*variety*.35);
     const mist=g.createRadialGradient(0,0,0,0,0,puff);
     const alpha=(.09+opacity*.24)*(1-y/canvas.height);
     mist.addColorStop(0,'rgba('+gray+','+gray+','+gray+','+alpha+')');mist.addColorStop(1,'transparent');
     g.fillStyle=mist;g.fillRect(-puff,-puff,puff*2,puff*2);g.restore();
    }
   }
  }
 }
 skyOverlayCache={key,canvas};
 return canvas;
}
let skyLayer;
function sceneSkyColors(config){
 if(config.backdrop==='ceiling')return formerCeilingColors;
 if(config.backdrop==='gradient'&&Array.isArray(config.skyColors)&&config.skyColors.length>=3&&
  config.skyColors.length<=5&&config.skyColors.every(color=>/^#[\da-f]{6}$/i.test(color)))return config.skyColors;
 return ['#607e96','#e7dfc9'];
}
function drawSceneBackdrop(config){
 const outside=/^#[\da-f]{6}$/i.test(config?.outsideColor||'')?config.outsideColor:null;
 if(outside){ctx.fillStyle=outside;ctx.fillRect(0,0,W,H)}
 if(topDown||(!config?.backdrop&&!config?.overlay))return;
 const farEdge=Math.min(...[[0,0],[gridLimit(0),0],[gridLimit(0),gridLimit(1)],[0,gridLimit(1)]].map(([x,y])=>point(x,y,0)[1]));
 const horizon=Math.max(-H*.3,Math.min(H*.8,farEdge-H*.04));
 const blend=Math.max(24,H*.16);
 const skyBottom=horizon+blend;
 // The surrounding ground is scenery only. The playable grid is drawn separately.
 const ground=ctx.createLinearGradient(0,horizon-blend,0,Math.max(horizon+blend,H));
 ground.addColorStop(0,outside||'#b6ad98');
 ground.addColorStop(.48,'#c8b99c');
 ground.addColorStop(1,outside||'#d8c8a8');
 ctx.fillStyle=ground;ctx.fillRect(0,0,W,H);
 if(skyBottom<=0)return;
 skyLayer??=document.createElement('canvas');
 const width=Math.ceil(W),height=Math.ceil(skyBottom);
 if(skyLayer.width!==width||skyLayer.height!==height){skyLayer.width=width;skyLayer.height=height}
 const sky=skyLayer.getContext('2d');
 sky.clearRect(0,0,width,height);
 const colors=sceneSkyColors(config);
 if(config.backdrop){
  const gradient=sky.createLinearGradient(0,0,0,Math.max(1,horizon));
  colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));
  sky.fillStyle=gradient;sky.fillRect(0,0,width,height);
 }
 const panorama=config.backdrop==='image'&&config.backdropImage?getArt(config.backdropImage):null;
 const wrapWidth=W*2,shift=((angle/(2*Math.PI)%1+1)%1)*wrapWidth;
 const overlay=skyOverlayTexture(config);
 for(const image of [panorama?.naturalWidth?panorama:null,overlay]){
  if(image)for(let x=-shift;x<W;x+=wrapWidth)sky.drawImage(image,x,0,wrapWidth,height);
 }
 const fade=sky.createLinearGradient(0,Math.max(0,horizon-blend),0,height);
 fade.addColorStop(0,'#000');fade.addColorStop(.5,'#0008');fade.addColorStop(1,'#0000');
 sky.globalCompositeOperation='destination-in';sky.fillStyle=fade;sky.fillRect(0,0,width,height);
 sky.globalCompositeOperation='source-over';
 ctx.drawImage(skyLayer,0,0);
}
const columnDefaults={columnHeight:30,columnDiameter:25,columnTaper:0,columnOrnament:0,columnWear:0,columnOxidation:0,columnBase:33,columnTop:33};
const componentNames={tree:'Tree',light:'Light',boulder:'Boulder',cave:'Stalagmite',column:'Column',rug:'Rug',chair:'Chair / stool / bench',barrel:'Barrel',furnitureCrate:'Crate',rack:'Weapon rack',cabinet:'Armoire / cabinet',bed:'Bed',table:'Table / desk',tumbleweed:'Tumbleweed',hitchingPost:'Hitching post',feedTrough:'Feed trough',waterTower:'Water tower',splitRailFence:'Split-rail fence'};
const componentKey='battlemap.componentTemplates.v1';
let componentTemplates=[],componentPlacement=null;
try{const saved=JSON.parse(localStorage.getItem(componentKey));if(Array.isArray(saved))componentTemplates=saved}catch{}
function updateComponentOptions(){
 const kind=el('componentKind').value,picker=el('componentTemplate');
 picker.replaceChildren(new Option('Default',''));
 if(kind==='light')picker.add(new Option('Chandelier','builtin-chandelier'));
 for(const item of componentTemplates.filter(item=>item.kind===kind))picker.add(new Option(item.name,item.id));
 el('deleteComponentTemplate').disabled=!picker.value;
}
async function writeComponentTemplates(next){
 if(!await saveWorkspaceItem(componentKey,next))return false;
 try{localStorage.setItem(componentKey,JSON.stringify(next))}
 catch{message('Could not save component templates in this browser.');return false}
 componentTemplates=next;updateComponentOptions();return true;
}
async function saveComponentTemplate(kind,settings){
 const name=prompt('Name this '+componentNames[kind].toLowerCase()+' template')?.trim().slice(0,80);
 if(!name)return;
 const existing=componentTemplates.find(item=>item.kind===kind&&item.name.toLowerCase()===name.toLowerCase());
 if(existing&&!confirm('Replace '+existing.name+'?'))return;
 if(await writeComponentTemplates([...componentTemplates.filter(item=>item!==existing),{id:existing?.id??crypto.randomUUID(),kind,name,settings}])){
  el('componentKind').value=kind;updateComponentOptions();
  el('componentTemplate').value=componentTemplates.at(-1).id;el('deleteComponentTemplate').disabled=false;
  message('Saved template: '+name);
 }
}
el('componentKind').onchange=updateComponentOptions;
el('componentTemplate').onchange=e=>{el('deleteComponentTemplate').disabled=!componentTemplates.some(item=>item.id===e.target.value)};
el('deleteComponentTemplate').onclick=()=>{
 const id=el('componentTemplate').value;
 if(id&&confirm('Delete this component template?'))writeComponentTemplates(componentTemplates.filter(item=>item.id!==id));
};
el('placeComponent').onclick=()=>{
 if(playing||roomProfile?.gm===false)return;
 const kind=el('componentKind').value,id=el('componentTemplate').value;
 const item=kind==='light'&&id==='builtin-chandelier'?
  {name:'Chandelier',settings:{fixture:'chandelier',bright:20,radius:40,tint:'#ffd696'}}:
  componentTemplates.find(t=>t.id===id);
 exitTool();componentPlacement={kind,settings:structuredClone(item?.settings??{}),rotation:0};
 if(kind==='light')visionTool='light';else tool='column';
 message('Click a surface to place '+(item?.name||componentNames[kind])+'. Arrow keys rotate 90°. Esc exits the tool.');refresh();
};
updateComponentOptions();
const furnitureKinds=["rug","chair","barrel","furnitureCrate","rack","cabinet","bed","table","tumbleweed","hitchingPost","feedTrough","waterTower","splitRailFence"];
const isFurniture=p=>p?.type==='column'&&furnitureKinds.includes(p.terrainShape?.componentKind);
const furnitureValues=p=>({...terrainShapeDefaults,...(formationDraft?.piece===p?formationDraft.values:p.terrainShape)});
function furnitureFootprint(values){
 if(values.componentKind==='table'&&values.tableShape==='round'){
  const diameter=(values.tableDiameter??7.5)/5;
  return [diameter,diameter];
 }
 const width=.25+values.furnWidth*.035;
 return [width,['barrel','tumbleweed','waterTower'].includes(values.componentKind)?width:.25+values.furnDepth*.035];
}
const terrainShapeDefaults={...columnDefaults,furnWidth:35,furnDepth:35,furnHeight:35,furnDetail:50,"treeThickness":45,"treeBaseDiameter":50,"treeRoots":0,"treeRootTangle":35,"treeRootSpread":30,"treeFoliageWidth":50,"treeFoliageDrop":0,"treeRootThickness":40,"treeHeight":75,"treeBranches":0,"treeBranchAngle":50,"treeBranchThickness":45,"treeBulb":0,"treeCrannies":0,"sceneTreeHeightScale":100,"sceneTreeWidthScale":100,"sceneTreeVariation":0,"rockHeight":50,"rockDiameter":55,"rockBulb":55,"rockCrannies":55,"caveHeight":50,"caveTaper":50,"caveDiameter":45,"caveBulb":40,"caveCrannies":45};
const furnitureFields=[['furnWidth','Width'],['furnDepth','Depth'],['furnHeight','Height'],['furnDetail','Detail / variation']];
const formationFields={...Object.fromEntries(furnitureKinds.map(k=>[k,furnitureFields])),
 column:[['columnHeight','Height'],['columnDiameter','Diameter'],['columnTaper','Taper'],['columnOrnament','Ornamentation'],['columnWear','Degradation'],['columnOxidation','Oxidation'],['columnBase','Base size'],['columnTop','Top size']],
 tree:[['treeThickness','Trunk thickness'],['treeHeight','Trunk height'],['treeBranches','Branch quantity'],['treeBranchAngle','Branch angle'],['treeBranchThickness','Branch thickness'],['treeBulb','Trunk bulbousness'],['treeCrannies','Trunk crannies'],["treeBaseDiameter","Base diameter"],["treeRoots","Exposed root count"],["treeRootTangle","Root tangledness"],["treeRootSpread","Root spread"],["treeFoliageWidth","Foliage width"],["treeFoliageDrop","Foliage drop"],["treeRootThickness","Root thickness"]],
 boulder:[['rockDiameter','Diameter variation'],['rockHeight','Height'],['rockBulb','Bulbousness'],['rockCrannies','Crannies']],
 cave:[['caveHeight','Height'],['caveTaper','Taper'],['caveDiameter','Diameter variation'],['caveBulb','Bulbousness'],['caveCrannies','Crannies']]
};
let formationDraft=null;
function cleanFormationSettings(values){
 const clean=Object.fromEntries(Object.keys(terrainShapeDefaults).filter(id=>!id.startsWith('sceneTree')&&Number.isFinite(values[id])&&values[id]>=0&&values[id]<=100).map(id=>[id,values[id]]));
 if(Number.isFinite(values.formationScale)&&values.formationScale>0&&values.formationScale<10000)clean.formationScale=values.formationScale;
 for(const key of ['treeFoliage','treeLog','lichen','furnMove','furnVision','caveHanging'])if(typeof values[key]==='boolean')clean[key]=values[key];
 if(['tree','boulder','cave','column',...furnitureKinds].includes(values.componentKind))clean.componentKind=values.componentKind;
 for(const key of ['columnBaseShape','columnTopShape'])if(['round','square','octagonal'].includes(values[key]))clean[key]=values[key];
 if(values.componentKind==='rug'){
  if(['plain','stripes','checker','medallion'].includes(values.rugPattern))clean.rugPattern=values.rugPattern;
  if(['none','straight','tassels'].includes(values.rugFringe))clean.rugFringe=values.rugFringe;
 }
 for(const key of ['treeBarkColor','treeLeafColor','columnColor','furnColor','furnAccent','rugHighlight'])if(/^#[0-9a-f]{6}$/i.test(values[key]||''))clean[key]=values[key];
 if(values.componentKind==='table'){
  if(['rectangular','round'].includes(values.tableShape))clean.tableShape=values.tableShape;
  if(Number.isFinite(values.tableDiameter)&&values.tableDiameter>=1&&values.tableDiameter<=20)clean.tableDiameter=values.tableDiameter;
 }
 if(['natural','flat','broken'].includes(values.rockFinish))clean.rockFinish=values.rockFinish;
 if(['clearcut','unbroken','dryrot'].includes(values.treeFinish))clean.treeFinish=values.treeFinish;
 return clean;
}
function openFormationEditor(piece){
 const appearance=areas.find(a=>a.shape==='appearance')?.appearance;
 const theme=appearance?.terrainTheme,formation=piece.terrainShape?.componentKind??terrainThemes[theme]?.formation??'column';
 const scene={...terrainShapeDefaults,...appearance?.terrainShape};
 formationDraft={piece,scene,values:{...piece.terrainShape}};
 el('formationTitle').textContent=(formation==='cave'&&!piece.terrainShape?.componentKind&&Number.isFinite(caveCeiling(piece))?'Stalactite':componentNames[formation])+' ↔';
 renderFormationSliders(formation);
 const dialog=el('formationDialog');
 dialog.style.margin='';dialog.style.left='';dialog.style.top='';dialog.style.inset='';
 dialog.showModal();
 return true;
}
function renderFormationSliders(formation){
 const panel=el('formationSliders');panel.replaceChildren();
 formationDraft.formation=formation;
 const roundTable=formation==='table'&&formationDraft.values.tableShape==='round';
 if(formation==='table'){
  const label=document.createElement('label'),shape=document.createElement('select');
  shape.add(new Option('Rectangular','rectangular'));shape.add(new Option('Circular','round'));
  shape.value=roundTable?'round':'rectangular';
  shape.onchange=()=>{formationDraft.values.tableShape=shape.value;renderFormationSliders(formation);draw()};
  label.append('Table shape',shape);panel.append(label);
  if(roundTable){
   const diameterLabel=document.createElement('label'),diameter=document.createElement('input');
   diameter.type='number';diameter.min=1;diameter.max=20;diameter.step='any';diameter.required=true;
   diameter.value=formationDraft.values.tableDiameter??7.5;
   diameter.oninput=()=>{
    if(!diameter.validity.valid)return;
    formationDraft.values.tableDiameter=diameter.valueAsNumber;draw();
   };
   diameterLabel.append('Diameter (ft)',diameter);panel.append(diameterLabel);
  }
 }
 for(const [id,name] of formationFields[formation]){
  if(roundTable&&['furnWidth','furnDepth'].includes(id))continue;
  const label=document.createElement('label'),input=document.createElement('input'),value=document.createElement('output');
  label.append(name,value,input);
  input.type='range';input.min=0;input.max=100;
  input.value=formationDraft.values[id]??formationDraft.scene[id];
  const readout=()=>formation==='rug'&&['furnWidth','furnDepth'].includes(id)?
   ((.25+Number(input.value)*.035)*5).toFixed(2)+' ft':input.value+'%';
  value.textContent=readout();
  input.oninput=()=>{formationDraft.values[id]=Number(input.value);value.textContent=readout();draw()};
  panel.append(label);
 }
 if(formation==='rug'){
  for(const [key,label,options] of [
   ['rugPattern','Rug pattern',[['plain','Plain border'],['medallion','Diamond medallions'],['stripes','Woven stripes'],['checker','Checkerboard']]],
   ['rugFringe','Fringe',[['none','None'],['straight','Straight fringe'],['tassels','Tassels']]]
  ]){
   const row=document.createElement('label'),select=document.createElement('select');
   for(const [id,name] of options)select.add(new Option(name,id));
   select.value=formationDraft.values[key]??options[0][0];
   select.onchange=()=>{formationDraft.values[key]=select.value;draw()};
   row.append(label,select);panel.append(row);
  }
  const row=document.createElement('label'),color=document.createElement('input');
  color.type='color';color.value=formationDraft.values.rugHighlight??'#d5b981';
  color.oninput=()=>{formationDraft.values.rugHighlight=color.value;draw()};row.append('Pattern and fringe color',color);panel.append(row);
 }
 if(furnitureKinds.includes(formation)){
  for(const [key,title,defaultValue] of [['furnColor','Material color','#79563b'],['furnAccent','Accent color','#a79b75'],['furnMove','Blocks movement',formation!=='rug']]){const label=document.createElement('label'),input=document.createElement('input');input.type=typeof defaultValue==='boolean'?'checkbox':'color';if(input.type==='checkbox')input.checked=formationDraft.values[key]??defaultValue;else input.value=formationDraft.values[key]??defaultValue;input.oninput=()=>{formationDraft.values[key]=input.type==='checkbox'?input.checked:input.value;draw()};label.append(title,input);panel.append(label)}
 }
 if(formation==='cave'){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=formationDraft.values.caveHanging??false;input.oninput=()=>{formationDraft.values.caveHanging=input.checked;draw()};label.append('Hang from overhead surface',input);panel.append(label)}
 if(formation==='column'){
  for(const [key,title] of [['columnBaseShape','Base shape'],['columnTopShape','Top shape'],['columnColor','Column color']]){
   const label=document.createElement('label'),input=document.createElement(key==='columnColor'?'input':'select');
   if(key==='columnColor'){input.type='color';input.value=formationDraft.values[key]??'#bda581'}
   else{for(const name of ['round','square','octagonal'])input.add(new Option(name,name));input.value=formationDraft.values[key]??'round'}
   input.oninput=()=>{formationDraft.values[key]=input.value;draw()};
   label.append(title,input);panel.append(label);
  }
 }
 if(formation==='cave'||formation==='boulder'){
  const label=document.createElement('label'),finish=document.createElement('select');
  for(const [id,name] of [['natural','Natural'],['flat','Flat top'],['broken','Broken top']])finish.add(new Option(name,id));
  finish.value=formationDraft.values.rockFinish??'natural';
  finish.onchange=()=>{formationDraft.values.rockFinish=finish.value;draw()};
  label.append(formation==='cave'?'Tip finish':'Boulder finish',finish);panel.append(label);
 }
 if(formation==='tree'){
  const finish=document.createElement('select'),finishLabel=document.createElement('label');
  for(const [id,name] of [['clearcut','Clear-cut'],['unbroken','Unbroken'],['dryrot','Dry-rot break']]){
   const option=document.createElement('option');option.value=id;option.textContent=name;finish.append(option);
  }
  finish.value=formationDraft.values.treeFinish??formationDraft.scene.treeFinish??'clearcut';
  finish.onchange=()=>{formationDraft.values.treeFinish=finish.value;draw()};
  finishLabel.append('Trunk finish',finish);panel.append(finishLabel);
  for(const [key,name,fallback] of [['treeBarkColor','Bark color','#63503b'],['treeLeafColor','Leaf color','#4e6839']]){
   const label=document.createElement('label'),input=document.createElement('input');
   input.type='color';input.value=formationDraft.values[key]??formationDraft.scene[key]??fallback;
   input.oninput=()=>{formationDraft.values[key]=input.value;draw()};
   label.append(name,input);panel.append(label);
  }
  for(const [key,name] of [['treeFoliage','Foliage'],['treeLog','Lay down as log']]){
   const label=document.createElement('label'),input=document.createElement('input');
   input.type='checkbox';input.checked=formationDraft.values[key]??formationDraft.scene[key]??false;
   label.append(name,input);panel.append(label);
   input.onchange=()=>{formationDraft.values[key]=input.checked;draw()};
  }
 }
}
const formationHandle=el('formationTitle');
let formationDialogDrag=null;
formationHandle.onpointerdown=e=>{
 if(e.button!==0)return;
 const rect=el('formationDialog').getBoundingClientRect();
 formationDialogDrag={x:e.clientX-rect.left,y:e.clientY-rect.top};
 formationHandle.setPointerCapture(e.pointerId);e.preventDefault();
};
formationHandle.onpointermove=e=>{
 if(!formationDialogDrag)return;
 const dialog=el('formationDialog'),rect=dialog.getBoundingClientRect();
 dialog.style.margin='0';dialog.style.inset='auto';
 dialog.style.left=Math.max(0,Math.min(innerWidth-rect.width,e.clientX-formationDialogDrag.x))+'px';
 dialog.style.top=Math.max(0,Math.min(innerHeight-rect.height,e.clientY-formationDialogDrag.y))+'px';
};
formationHandle.onlostpointercapture=()=>{formationDialogDrag=null};
el('formationReset').onclick=()=>{
 if(!formationDraft)return;
 for(const [id] of formationFields[formationDraft.formation])delete formationDraft.values[id];
 delete formationDraft.values.rockFinish;
 if(formationDraft.formation==='rug')for(const key of ['rugPattern','rugFringe','rugHighlight'])delete formationDraft.values[key];
 if(formationDraft.formation==='table'){
  delete formationDraft.values.tableShape;
  delete formationDraft.values.tableDiameter;
 }
 if(formationDraft.formation==='tree')for(const key of ['treeFoliage','treeLog','treeFinish','treeBarkColor','treeLeafColor'])delete formationDraft.values[key];
 renderFormationSliders(formationDraft.formation);draw();
};
el('saveFormationTemplate').onclick=()=>{
 const {formation,scene,values}=formationDraft;
 saveComponentTemplate(formation,cleanFormationSettings({...scene,...values,componentKind:formation}));
};
el('formationCancel').onclick=()=>el('formationDialog').close();
el('formationDialog').onclose=()=>{formationDraft=null;draw()};
el('formationForm').onsubmit=e=>{
 e.preventDefault();
 if(!formationDraft||playing||terrainLocked||!pieces.includes(formationDraft.piece))return;
 const {piece,values}=formationDraft;
 remember();
 if(Object.keys(values).length)piece.terrainShape=values;else delete piece.terrainShape;
 formationDraft=null;el('formationDialog').close();refresh();
};
function updateSkyControls(){
 const theme=el('sceneTerrainTheme').value;
 el('treeSettings').hidden=theme!=='forest';
 el('rockSettings').hidden=theme!=='mountain';
 el('caveSettings').hidden=terrainThemes[theme]?.formation!=='cave';
 el('groundSeedRow').hidden=el('groundStyle').value!=='seeded';
 el('groundImageRow').hidden=el('groundStyle').value!=='image';
 el('groundImageRow').disabled=el('groundImageRow').hidden;
 el('backdropImageRow').hidden=el('backdropStyle').value!=='image';
 el('outsideColorRow').hidden=!el('customOutsideColor').checked;
 el('skyGradientControls').hidden=el('backdropStyle').value!=='gradient';
 const count=Number(el('skyStopCount').value);
 for(let i=1;i<=5;i++)el('skyColor'+i).hidden=i>count;
 const colors=Array.from({length:count},(_,i)=>el('skyColor'+(i+1)).value);
 el('skyGradientPreview').style.background='linear-gradient(90deg,'+colors.join(',')+')';
 const overlay=el('skyOverlay').value;
 el('skyOverlayControls').hidden=!overlay;
 el('skyToneLabel').textContent=overlay==='clouds'?'Dark to light':'Brightness';
}
for(const id of ['groundStyle','backdropStyle','skyOverlay','skyStopCount','sceneTerrainTheme'])el(id).onchange=updateSkyControls;
for(let i=1;i<=5;i++)el('skyColor'+i).oninput=updateSkyControls;
function updateAmbientLabel(){
 el('ambientLabel').textContent=ambientNames[Math.round(Number(el('ambientLevel').value))];
}
el('ambientLevel').oninput=updateAmbientLabel;
el('fogOfWar').onchange=()=>{
 if(roomProfile?.gm===false)return;
 const enabled=el('fogOfWar').checked;
 remember();
 let area=areas.find(item=>item.shape==='appearance');
 if(!area){area={shape:'appearance',size:1,angle:0,origin:[0,0,0],appearance:{}};areas.push(area)}
 area.appearance.fogOfWar=enabled;
 if(appearanceDraft)appearanceDraft.fogOfWar=enabled;
 refresh();
 el('fogStatus').textContent=enabled?'Fog of War enabled.':'Fog of War disabled.';
};
el('resetFogOfWar').onclick=async()=>{
 if(roomProfile?.gm===false)return;
 if(!roomProfile?.gm||!roomState?.active||!roomDraftAttached||
    currentSceneId!==roomState.sceneId||!roomBaseline){
  el('fogStatus').textContent='Reset not sent: open the active live scene as GM first.';
  return;
 }
 const scene=areas.find(area=>area.shape==='appearance')?.appearance;
 if(!scene){el('fogStatus').textContent='Reset not sent: scene appearance is not loaded.';return}
 const old=Number(scene.fogRevision)||0;
 scene.fogRevision=Math.max(old,Date.now());
 if(appearanceDraft)appearanceDraft.fogRevision=scene.fogRevision;
 el('fogStatus').textContent='Publishing exploration reset…';
 // The reset is a room scene patch; do not report success until the server
 // acknowledges it. Players derive a fresh discovery key from fogRevision.
 await flushRoomPatch();
 const confirmed=Number(roomBaseline?.areas?.find(a=>a.shape==='appearance')?.appearance?.fogRevision)===scene.fogRevision;
 if(!confirmed){
  el('fogStatus').textContent='Exploration reset not confirmed by server. Check connection and retry.';
  return;
 }
 tacticalDiscoveryCache={key:null,value:null};
 tacticalScanSignature='';
 tacticalPreviousCenters.clear();
 tacticalMapRender();
 el('fogStatus').textContent='Exploration reset published to the live scene. Player clients will update on sync.';
};
el('ambientColor').oninput=()=>{
 const hex=el('ambientColor').value;
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
 const hue=delta?(max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta)*60:0;
 el('ambientHue').value=Math.round((hue+360)%360)%360;
 el('ambientSat').value=delta?Math.round(100*delta/(1-Math.abs(max+min-1))):0;
};
function sceneTerrainControls(){
 const form=el('sceneAppearanceForm');
 return [...form.querySelectorAll('input[id]')].filter(input=>Object.hasOwn(terrainShapeDefaults,input.id)).map(input=>[input.id,input]);
}
let appearanceDraft=null,treePreview=null,appearancePreviewFrame=0;
const appearancePanel=el('sceneAppearanceDialog');
const appearanceHandle=appearancePanel.querySelector('.appearance-header');
appearanceHandle.onpointerdown=e=>{
 if(e.button!==0||e.target.closest('button'))return;
 const {left,top}=appearancePanel.getBoundingClientRect();
 appearanceHandle.setPointerCapture(e.pointerId);
 appearanceHandle.onpointermove=event=>{
  if(event.pointerId!==e.pointerId)return;
  const leftEdge=Math.max(0,Math.min(innerWidth-appearancePanel.offsetWidth,left+event.clientX-e.clientX));
  const topEdge=Math.max(0,Math.min(innerHeight-appearancePanel.offsetHeight,top+event.clientY-e.clientY));
  Object.assign(appearancePanel.style,{left:leftEdge+'px',top:topEdge+'px',right:'auto'});
 };
};
appearanceHandle.onlostpointercapture=()=>{appearanceHandle.onpointermove=null};
function readSceneTerrainControls(){
 return {...Object.fromEntries(sceneTerrainControls().map(([id,control])=>[id,Number(control.value)])),
  sceneTreeFoliage:el('sceneTreeFoliage').value};
}
function previewSceneTrees(e){
 if(!appearanceDraft||!e.target.closest('#treeSettings'))return;
 treePreview=readSceneTerrainControls();
 if(!appearancePreviewFrame)appearancePreviewFrame=requestAnimationFrame(()=>{
  appearancePreviewFrame=0;
  if(treePreview)draw();
 });
}
el('treeSettings').addEventListener('input',previewSceneTrees);
el('treeSettings').addEventListener('change',previewSceneTrees);
appearancePanel.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();appearancePanel.close()}
});
el('sceneAppearance').onclick=()=>{
 if(playing||roomProfile?.gm===false)return;
 appearanceDraft={...areas.find(a=>a.shape==='appearance')?.appearance};
 el('sceneTerrainTheme').value=appearanceDraft.terrainTheme||'';
 const gridAppearance=appearanceDraft.gridDisplay||{};
 el('sceneGridVisible').checked=gridAppearance.visible!==false;
 el('sceneGridColor').value=gridAppearance.color||'#70faff';
 el('sceneGridOpacity').value=gridAppearance.opacity??65;
 el('floorPrintedFeet').value=String(gridAppearance.printedFeet===10?10:5);
 const ambient=appearanceDraft.ambient;
 el('ambientEnabled').checked=!!ambient?.enabled;
 el('ambientLevel').value=ambient?.level??5;
 el('ambientColor').value=ambient?.color??'#fff4da';
 el('ambientHue').value=ambient?.hue??42;
 el('ambientSat').value=ambient?.saturation??0;
 updateAmbientLabel();
 el('sceneTreeFoliage').value=appearanceDraft.terrainShape?.sceneTreeFoliage||'';
 for(const [id,control] of sceneTerrainControls())control.value=appearanceDraft.terrainShape?.[id]??terrainShapeDefaults[id];
 el('groundStyle').value=appearanceDraft.ground||'';
 el('groundSeed').value=appearanceDraft.seed??1;
 const legacy=appearanceDraft.backdrop==='ceiling';
 el('backdropStyle').value=legacy?'gradient':appearanceDraft.backdrop||'';
 const colors=legacy?formerCeilingColors:appearanceDraft.skyColors||defaultSkyColors.slice(0,3);
 el('skyStopCount').value=colors.length;
 for(let i=1;i<=5;i++)el('skyColor'+i).value=colors[i-1]||defaultSkyColors[i-1];
 el('skyOverlay').value=appearanceDraft.overlay||'';
 el('skyDensity').value=appearanceDraft.density??45;
 el('skyVariety').value=appearanceDraft.variety??50;
 el('skyTone').value=appearanceDraft.tone??65;
 updateSkyControls();
 el('customOutsideColor').checked=!!appearanceDraft.outsideColor;
 el('outsideColor').value=appearanceDraft.outsideColor||'#d8c9a9';
 el('outsideColor').disabled=!el('customOutsideColor').checked;
 updateSkyControls();
 el('groundImage').value=el('backdropImage').value='';
 setupFloorEditor();
 el('appearanceStatus').textContent='';
 if(!appearancePanel.open)appearancePanel.show();
};
el('customOutsideColor').onchange=()=>{el('outsideColor').disabled=!el('customOutsideColor').checked;updateSkyControls()};
el('appearanceClose').onclick=el('appearanceCancel').onclick=()=>el('sceneAppearanceDialog').close();
appearancePanel.onclose=()=>{stopFloorSceneEditing();appearanceDraft=null;treePreview=null;draw()};
function enableFloatingDrag(handle,windowElement,ignore){
 let drag=null;
 handle.addEventListener('pointerdown',e=>{
  if(e.button!==0||ignore?.(e.target))return;
  const rect=windowElement.getBoundingClientRect();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height};
  windowElement.style.left=rect.left+'px';windowElement.style.top=rect.top+'px';windowElement.style.right='auto';windowElement.style.bottom='auto';windowElement.style.transform='none';
  handle.setPointerCapture(e.pointerId);e.preventDefault();
 });
 handle.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  windowElement.style.left=Math.max(0,Math.min(innerWidth-70,drag.left+e.clientX-drag.x))+'px';
  windowElement.style.top=Math.max(0,Math.min(innerHeight-50,drag.top+e.clientY-drag.y))+'px';
 });
 const end=e=>{if(drag?.id===e.pointerId)drag=null};
 handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
}
enableFloatingDrag(appearancePanel.querySelector('.appearance-header'),appearancePanel,target=>!!target.closest('button,input,select,textarea,a'));
enableFloatingDrag(el('floorSceneDragHandle'),el('floorSceneTools'));
el('appearanceCompact').onclick=()=>{
 const collapsed=appearancePanel.classList.toggle('appearance-collapsed');
 el('appearanceCompact').textContent=collapsed?'Expand':'Collapse';
};
el('appearanceDock').onclick=()=>{
 const rect=appearancePanel.getBoundingClientRect(),left=rect.left<innerWidth/2?innerWidth-rect.width-12:12;
 appearancePanel.style.left=Math.max(0,left)+'px';appearancePanel.style.top='12px';appearancePanel.style.right='auto';
 el('appearanceDock').textContent=left<innerWidth/2?'Move right':'Move left';
};
el('floorSceneApply').onclick=()=>{if(floorScenePendingCalibration){el('floorAlignStatus').textContent='Accept calibration or Retry points before saving.';return}el('appearanceSave').click()};
el('floorSceneCancel').onclick=()=>el('appearanceCancel').click();
for(const [field,style] of [['groundImage','groundStyle'],['backdropImage','backdropStyle']]){
 el(field).onchange=async()=>{
  const draft=appearanceDraft,file=el(field).files[0];
  if(!draft||!file)return;
  el('appearanceSave').disabled=true;
  try{
   if(file.size>8000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error();
   const image=await createImageBitmap(file);
   try{
    if(draft!==appearanceDraft)return;
    const layer=document.createElement('canvas'),scale=Math.min(1,1536/Math.max(image.width,image.height));
    layer.width=Math.max(1,Math.round(image.width*scale));layer.height=Math.max(1,Math.round(image.height*scale));
    layer.getContext('2d').drawImage(image,0,0,layer.width,layer.height);
    draft[field]=layer.toDataURL('image/webp',.8);
    if(field==='groundImage')setupFloorEditor(image.width/image.height);
    el(style).value='image';updateSkyControls();el('appearanceStatus').textContent='Image ready.';
   }finally{image.close()}
  }catch{if(draft===appearanceDraft)el('appearanceStatus').textContent='Choose a PNG, JPEG, or WebP up to 8 MB.'}
  finally{el('appearanceSave').disabled=false}
 };
}
el('sceneAppearanceForm').onsubmit=e=>{
 e.preventDefault();
 if(!appearanceDraft||playing||roomProfile?.gm===false)return;
 appearanceDraft.ambient={enabled:el('ambientEnabled').checked,level:Number(el('ambientLevel').value),
  color:el('ambientColor').value,hue:Number(el('ambientHue').value),saturation:Number(el('ambientSat').value)};
 const ground=el('groundStyle').value,backdrop=el('backdropStyle').value;
 if(ground==='image'&&!appearanceDraft.groundImage||backdrop==='image'&&!appearanceDraft.backdropImage){
  el('appearanceStatus').textContent='Upload an image for the selected style.';return;
 }
 remember();
 if(ground==='image')appearanceDraft.floorImage=readFloorImageSettings();
 const appliedFloorGrid=floorSceneEditing&&floorSceneGridDraft?{...floorSceneGridDraft}:null;
 const appliedCalibration=floorSceneEditing?floorGridCalibrationDraft:undefined;
 stopFloorSceneEditing();
 const appearance={...appearanceDraft,ground,backdrop,terrainTheme:el('sceneTerrainTheme').value,seed:Number(el('groundSeed').value)||0};
 appearance.gridDisplay={visible:el('sceneGridVisible').checked,color:el('sceneGridColor').value,opacity:Number(el('sceneGridOpacity').value),printedFeet:Number(el('floorPrintedFeet').value)};
 // A printed 10-foot square corresponds to a 2-by-2 subdivision of 5-foot movement cells.
 // The movement grid remains 5 feet; the selected scale is scene metadata and
 // is used when calibrating a printed map rather than resizing tokens.
 appearance.terrainShape=readSceneTerrainControls();
 appearance.skyColors=Array.from({length:Number(el('skyStopCount').value)},(_,i)=>el('skyColor'+(i+1)).value);
 appearance.overlay=el('skyOverlay').value;
 appearance.density=Number(el('skyDensity').value);
 appearance.variety=Number(el('skyVariety').value);
 appearance.tone=Number(el('skyTone').value);
 if(el('customOutsideColor').checked)appearance.outsideColor=el('outsideColor').value;else delete appearance.outsideColor;
 const existing=areas.find(a=>a.shape==='appearance');
 const previousPrintedFeet=existing?.appearance?.gridDisplay?.printedFeet===10?10:5;
 const requestedPrintedFeet=appearance.gridDisplay.printedFeet;
 // Convert the logical VTT resolution while retaining the printed image's
 // world-space footprint and the camera's original projection center.
 // Each new logical square still represents 5 feet for movement and measuring.
 if(previousPrintedFeet!==requestedPrintedFeet&&appliedCalibration===undefined){
  const factor=requestedPrintedFeet/previousPrintedFeet;
  const oldGrid=sceneGrid(),base=oldGrid.projectionBase||{width:oldGrid.width,depth:oldGrid.depth};
  const nextWidth=Math.round(oldGrid.width*factor),nextDepth=Math.round(oldGrid.depth*factor);
  if(nextWidth>100||nextDepth>100||nextWidth<10||nextDepth<10){
   el('appearanceStatus').textContent='Cannot subdivide: resulting grid must be between 10 and 100 cells per axis. Resize the battlefield first.';return;
  }
  const oldCalibration=existing?.gridCalibration;
  const calibrated=oldCalibration?{...oldCalibration}: {ox:0,oy:0,xx:1,xy:0,yx:0,yy:1};
  for(const key of ['xx','xy','yx','yy'])calibrated[key]/=factor;
  setSceneGrid(areas,{...oldGrid,width:nextWidth,depth:nextDepth,projectionBase:base});
  const gridRecord=areas.find(a=>a.shape==='appearance');gridRecord.gridCalibration=calibrated;
  // Existing objects are deliberately not migrated; the new grid applies
  // immediately to standee placement and all measurement destinations.
 }
 convertBiomeColumns(existing?.appearance,appearance);
 if(existing)existing.appearance=appearance;
 else areas.push({shape:'appearance',size:1,angle:0,origin:[0,0,0],appearance});
 if(appliedFloorGrid)setSceneGrid(areas,appliedFloorGrid);
 if(appliedCalibration!==undefined){const record=areas.find(a=>a.shape==='appearance');if(appliedCalibration)record.gridCalibration={...appliedCalibration};else delete record.gridCalibration}
 movementRenderCache=null;
 movementRenderCache=null;
 el('sceneAppearanceDialog').close();appearanceDraft=null;refresh('Scene appearance applied');
};
// The battlefield's physical extent is in uncalibrated world coordinates.
// Calibration changes only the VTT grid inside this fixed rectangle.
function clipFloorGridCell(poly,axis,limit,keepGreater){
 const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  const da=(keepGreater?a[axis]-limit:limit-a[axis]);
  const db=(keepGreater?b[axis]-limit:limit-b[axis]);
  const insideA=da>=-1e-9,insideB=db>=-1e-9;
  if(insideA)out.push(a);
  if(insideA!==insideB){
   const t=da/(da-db);
   out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
  }
 }
 return out;
}
function importedFloorFootprint(){
 const appearance=areas.find(a=>a.shape==='appearance')?.appearance;
 const floorSettings=appearance?.floorImage;
 if(!floorSettings||appearance.ground!=='image')return null;
 const a=(Number(floorSettings.rotation)||0)*Math.PI/180,c=Math.cos(a),si=Math.sin(a);
 const x=(Number(floorSettings.x)||0)/5,y=(Number(floorSettings.y)||0)/5;
 const w=(Number(floorSettings.width)||0)/5,d=(Number(floorSettings.depth)||0)/5;
 if(w<=0||d<=0)return null;
 // The image's crop is in normalized source-image coordinates. Its visible
 // footprint, not the old rectangular battlefield, bounds the VTT grid.
 const crop=validFloorCrop(floorSettings.crop)?floorSettings.crop:null;
 const points=crop?crop.flatMap(segment=>segment):[];
 const loU=points.length?Math.max(0,Math.min(...points.map(p=>p[0]))):0;
 const hiU=points.length?Math.min(1,Math.max(...points.map(p=>p[0]))):1;
 const loV=points.length?Math.max(0,Math.min(...points.map(p=>p[1]))):0;
 const hiV=points.length?Math.min(1,Math.max(...points.map(p=>p[1]))):1;
 if(hiU<=loU||hiV<=loV)return null;
 return [[loU,loV],[hiU,loV],[hiU,hiV],[loU,hiV]].map(([u,v])=>{
  const px=(u-.5)*w,py=(v-.5)*d;
  return [x+px*c-py*si,y+px*si+py*c];
 });
}
function drawVisibleGround(){
 // Keep the physical battlefield fixed when calibrating the VTT grid.
 const width=gridLimit(0),depth=gridLimit(1);
 const physicalGrid=floorSceneEditing&&floorSceneGridDraft?floorSceneGridDraft:sceneGrid();
 const offsetX=Number(physicalGrid.floorOriginX)||0,offsetY=Number(physicalGrid.floorOriginY)||0;
 const maxX=offsetX+width,maxY=offsetY+depth;
 const margin=studioWebGLBoundedCapture?studioWebGLCaptureMargin()+2:2;
 const rawCorners=studioWebGLCapture&&!studioWebGLBoundedCapture?
  [[offsetX,offsetY],[maxX,offsetY],[maxX,maxY],[offsetX,maxY]]:
  [rawInverse(-margin,-margin,0),rawInverse(W+margin,-margin,0),
   rawInverse(W+margin,H+margin,0),rawInverse(-margin,H+margin,0)];
 // A calibrated imported map defines the visible grid footprint.
 // Do not render a separate battlefield-sized grid beyond its edges.
 const imagePolygon=activeGridCalibration()?importedFloorFootprint():null;
 const fixedFloor=()=>face([[offsetX,offsetY,0],[maxX,offsetY,0],[maxX,maxY,0],[offsetX,maxY,0]].map(([x,y,z])=>[...worldToGrid(x,y),z]),'#e2d4b5',null,0,false);
 if(floorSceneEditing){fixedFloor();return}
 const calibration=activeGridCalibration();
 if(!calibration){
  const loX=Math.max(offsetX,Math.floor(Math.min(...rawCorners.map(p=>p[0])))),hiX=Math.min(maxX,Math.ceil(Math.max(...rawCorners.map(p=>p[0]))));
  const loY=Math.max(offsetY,Math.floor(Math.min(...rawCorners.map(p=>p[1])))),hiY=Math.min(maxY,Math.ceil(Math.max(...rawCorners.map(p=>p[1]))));
  for(let x=loX;x<hiX;x++)for(let y=loY;y<hiY;y++)top(x,y,0,'#e2d4b5',null,false);
  return;
 }
 const corners=(imagePolygon||rawCorners).map(([x,y])=>worldToGrid(x,y));
 const left=Math.floor(Math.min(...corners.map(p=>p[0])))-1,right=Math.ceil(Math.max(...corners.map(p=>p[0])))+1;
 const back=Math.floor(Math.min(...corners.map(p=>p[1])))-1,front=Math.ceil(Math.max(...corners.map(p=>p[1])))+1;
 const clip=(poly,axis,limit,greater)=>{
  const inside=p=>greater?p[axis]>=limit-1e-8:p[axis]<=limit+1e-8,result=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],ai=inside(a),bi=inside(b);
   if(ai)result.push(a);
   if(ai!==bi){const t=(limit-a[axis])/(b[axis]-a[axis]);result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])}
  }
  return result;
 };
 for(let x=left;x<right;x++)for(let y=back;y<front;y++){
  let poly=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([gx,gy])=>gridToWorld(gx,gy));
  // The saved nine-point calibration and imported map define this footprint.
  // Retain legacy battlefield clipping only for scenes without a map image.
  if(!imagePolygon){
   poly=clip(poly,0,offsetX,true);if(poly.length<3)continue;
   poly=clip(poly,0,maxX,false);if(poly.length<3)continue;
   poly=clip(poly,1,offsetY,true);if(poly.length<3)continue;
   poly=clip(poly,1,maxY,false);if(poly.length<3)continue;
  }
  if(imagePolygon){
   const orientation=Math.sign(imagePolygon.reduce((sum,p,i)=>{const q=imagePolygon[(i+1)%imagePolygon.length];return sum+p[0]*q[1]-q[0]*p[1]},0))||1;
   for(let i=0;i<imagePolygon.length&&poly.length>=3;i++){
    const a=imagePolygon[i],b=imagePolygon[(i+1)%imagePolygon.length];
    const side=p=>orientation*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
    const result=[];
    for(let j=0;j<poly.length;j++){
     const p=poly[j],q=poly[(j+1)%poly.length],sp=side(p),sq=side(q),insideP=sp>=-1e-8,insideQ=sq>=-1e-8;
     if(insideP)result.push(p);
     if(insideP!==insideQ){const t=sp/(sp-sq);result.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])])}
    }
    poly=result;
   }
   if(poly.length<3)continue;
  }
  face(poly.map(([wx,wy])=>[...worldToGrid(wx,wy),0]),'#e2d4b5',null,0,false);
 }
}
function savedGridDisplay(){return areas.find(a=>a.shape==='appearance')?.appearance?.gridDisplay||{}}
function gridDisplayValue(){return appearancePanel?.open&&appearanceDraft?.gridDisplay?appearanceDraft.gridDisplay:savedGridDisplay()}
function gridVisible(){return !floorSceneEditing&&gridDisplayValue().visible!==false}
function gridColor(){return gridDisplayValue().color||'#70faff'}
function gridOpacity(){return Math.max(0,Math.min(1,(gridDisplayValue().opacity??65)/100))}
function gridStrokeColor(){return gridColor()+Math.round(gridOpacity()*255).toString(16).padStart(2,'0')}
function drawLowAngleGrid(painted){
 const g=floorSceneEditing&&floorSceneGridDraft?floorSceneGridDraft:sceneGrid();
 const ox=Number(g.floorOriginX)||0,oy=Number(g.floorOriginY)||0;
 const x2=ox+g.width,y2=oy+g.depth;
 const physical=[[ox,oy],[x2,oy],[x2,y2],[ox,y2]];
 // The nine-point calibration maps VTT cells into the fixed imported-image
 // coordinate system. Clip to the image's transformed footprint, not a
 // separate rectangular grid plane at the old battlefield origin.
 const floorSettings=areas.find(a=>a.shape==='appearance')?.appearance?.floorImage;
 const hasCalibratedImage=!!(activeGridCalibration()&&floorSettings&&
  areas.find(a=>a.shape==='appearance')?.appearance?.ground==='image');
 let footprint=physical;
 if(hasCalibratedImage){
  const angle=(Number(floorSettings.rotation)||0)*Math.PI/180;
  const c=Math.cos(angle),si=Math.sin(angle);
  const x=(Number(floorSettings.x)||0)/5,y=(Number(floorSettings.y)||0)/5;
  const w=(Number(floorSettings.width)||0)/5,d=(Number(floorSettings.depth)||0)/5;
  if(w>0&&d>0)footprint=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]
   .map(([u,v])=>[x+u*w*c-v*d*si,y+u*w*si+v*d*c]);
 }
 // No independent beige/cyan rectangle behind an imported map.
 if(!hasCalibratedImage)polygon(physical.map(([x,y])=>rawPoint(x,y,0)),painted?'#0000':'#e2d4b5',null);
 if(!gridVisible())return;
 const bounds=footprint.map(([x,y])=>worldToGrid(x,y));
 const minX=Math.floor(Math.min(...bounds.map(p=>p[0]))),maxX=Math.ceil(Math.max(...bounds.map(p=>p[0])));
 const minY=Math.floor(Math.min(...bounds.map(p=>p[1]))),maxY=Math.ceil(Math.max(...bounds.map(p=>p[1])));
 ctx.save();ctx.beginPath();
 footprint.map(([x,y])=>rawPoint(x,y,0)).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.clip();
 // Clip to the physical battlefield too, matching drawVisibleGround().
 ctx.beginPath();physical.map(([x,y])=>rawPoint(x,y,0)).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.clip();ctx.beginPath();
 for(let i=minX;i<=maxX;i+=1){const [x,y]=point(i,minY,0),[u,v]=point(i,maxY,0);ctx.moveTo(x,y);ctx.lineTo(u,v)}
 for(let i=minY;i<=maxY;i+=1){const [x,y]=point(minX,i,0),[u,v]=point(maxX,i,0);ctx.moveTo(x,y);ctx.lineTo(u,v)}
 ctx.strokeStyle=gridColor();ctx.globalAlpha=gridOpacity();ctx.stroke();ctx.restore();
}
// Large faces can overlap at depths far from their centers.
function faceWinding(b){
 let winding=0;
 for(let i=0;i<b.length;i++){
  const [x,y]=b[i],[u,v]=b[(i+1)%b.length];
  winding+=x*v-y*u;
 }
 return Math.abs(winding)<1e-6?0:Math.sign(winding);
}
function faceOverlap(a,b,sign=faceWinding(b)){
 if(!sign)return [];
 let polygon=a;
 for(let i=0;i<b.length&&polygon.length;i++){
  const [x,y]=b[i],[u,v]=b[(i+1)%b.length];
  const dx=u-x,dy=v-y;
  const side=p=>sign*(dx*(p[1]-y)-dy*(p[0]-x));
  const clipped=[];
  let d=side(polygon[0]);
  for(let j=0;j<polygon.length;j++){
   const p=polygon[j],q=polygon[(j+1)%polygon.length],e=side(q);
   if(d>=0)clipped.push(p);
   if((d>=0)!==(e>=0)){const t=d/(d-e);clipped.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t])}
   d=e;
  }
  polygon=clipped;
 }
 return polygon;
}
function projectedFaceDepth(face,x,y){
 if(face.standee)return face.depth+(face.projected[2][1]-y)*Math.tan(tilt)/S;
 const [a,b,,d]=face.projected;
 if(!d||![a[2],b[2],d[2]].every(Number.isFinite))return face.depth;
 const u=b[0]-a[0],v=b[1]-a[1],j=d[0]-a[0],k=d[1]-a[1],det=u*k-v*j;
 if(Math.abs(det)<1e-6)return face.depth;
 return a[2]+((x-a[0])*k-(y-a[1])*j)/det*(b[2]-a[2])+
  (u*(y-a[1])-v*(x-a[0]))/det*(d[2]-a[2]);
}
function orderOccludingFaces(list){
 const rugs=new Map();
 for(const [index,face] of list.entries()){
  if(face.p?.terrainShape?.componentKind!=='rug')continue;
  if(!rugs.has(face.p))rugs.set(face.p,[]);
  rugs.get(face.p).push(index);
 }
 const occluders=list.flatMap((f,i)=>f.p?.type==='volume'||f.doorFace?[i]:[]);
 if(!occluders.length&&!rugs.size)return list;
 const bounds=list.map(f=>{
  if(f.z===0&&!f.standee)return null;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of f.projected){
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);
   minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  return [minX,maxX,minY,maxY];
 });
 const candidates=bounds.flatMap((box,index)=>box?[index]:[]);
 const before=new Map();
 // Paint rugs beneath same-floor standee bases, including their overhanging patterns.
 for(const [index,face] of list.entries()){
  if(!face.standee&&!face.shadow)continue;
  const standee=face.p,z=face.shadow?face.shadowLevel:standee.z;
  for(const [rug,indices] of rugs){
   if(Math.abs(rug.z-z)>.025)continue;
   const [width,depth]=dimensions(rug);
   if(standee.x<rug.x+width&&standee.x+standee.size>rug.x&&
      standee.y<rug.y+depth&&standee.y+standee.size>rug.y)
    before.set(index,[...(before.get(index)??[]),...indices]);
  }
 }
 // Index projected bounds in screen-space tiles, then preserve original pair order.
 const tileSize=96,tiles=new Map();
 function visitTiles(box,visit){
  for(let y=Math.floor(box[2]/tileSize);y<=Math.floor(box[3]/tileSize);y++){
   for(let x=Math.floor(box[0]/tileSize);x<=Math.floor(box[1]/tileSize);x++)visit(x+','+y);
  }
 }
 for(const index of candidates)visitTiles(bounds[index],key=>{
  if(!tiles.has(key))tiles.set(key,[]);
  tiles.get(key).push(index);
 });
 const seen=new Int32Array(list.length),windings=new Int8Array(list.length);
 windings.fill(2);
 const standees=candidates.filter(i=>list[i].standee);
 for(const i of occluders){
  const a=list[i],box=bounds[i];
  if(!box)continue;
  const nearby=[];
  if(!a.doorFace)visitTiles(box,key=>{
   const bucket=tiles.get(key);
   if(!bucket)return;
   for(const j of bucket){
    if(seen[j]===i+1)continue;
    seen[j]=i+1;
    const candidate=list[j];
    if(i===j||a.p===candidate.p||candidate.p?.type==='volume'&&j<i||(showThroughTerrain||playerAllyCameraVisible(candidate.p))&&candidate.standee)continue;
    const other=bounds[j];
    if(box[1]>other[0]&&other[1]>box[0]&&box[3]>other[2]&&other[3]>box[2])nearby.push(j);
   }
  });
  for(const j of a.doorFace?standees:nearby.sort((a,b)=>a-b)){
   const b=list[j],other=bounds[j];
   if(i===j||a.p===b.p||b.p?.type==='volume'&&j<i||(showThroughTerrain||playerAllyCameraVisible(b.p))&&b.standee)continue;
   if(a.doorFace&&(box[1]<=other[0]||other[1]<=box[0]||box[3]<=other[2]||other[3]<=box[2]))continue;
   if(windings[j]===2)windings[j]=faceWinding(b.projected);
   const overlap=faceOverlap(a.projected,b.projected,windings[j]);
   if(overlap.length<3)continue;
   let x=0,y=0;
   for(const point of overlap){x+=point[0]/overlap.length;y+=point[1]/overlap.length;}
   const delta=projectedFaceDepth(a,x,y)-projectedFaceDepth(b,x,y);
   if(Math.abs(delta)<1e-5)continue;
   const near=delta>0?i:j,far=delta>0?j:i;
   if(!before.has(near))before.set(near,[]);
   before.get(near).push(far);
  }
 }
 const ordered=[],visited=new Uint8Array(list.length);
 function visit(i){
  if(visited[i])return;
  visited[i]=1;
  const dependencies=before.get(i);
  if(dependencies)for(const dependency of dependencies)visit(dependency);
  ordered.push(list[i]);
 }
 list.forEach((_,i)=>visit(i));
 return ordered;
}
function keepBattlefieldVisible(){
 // During floor calibration the grid can move dramatically as points are fitted.
 // Never clamp the inspection camera to those provisional grid bounds.
 if(floorSceneEditing)return;
 const right=gridLimit(0),bottom=gridLimit(1);
 const corners=[[0,0],[right,0],[right,bottom],[0,bottom]].map(([x,y])=>point(x,y,0));
 const constrain=(axis,size)=>{
  const coordinates=corners.map(corner=>corner[axis]);
  const low=Math.min(...coordinates),high=Math.max(...coordinates),margin=size*.18;
  return Math.max(margin-high,Math.min(size-margin-low,0));
 };
 panX+=constrain(0,W);
 panY+=constrain(1,H);
}
function roomInteriorVisibility(blockers){
 if(roomProfile?.gm!==false)return null;
 const rooms=areas.filter(a=>a.shape==='room');
 if(!rooms.length)return null;
 const observers=tokens.filter(t=>ownsRoomStandee(t)&&!t.incognito&&!t.conditions?.includes('dead'));
 const cache=new Map();
 const visible=target=>{
  const key=target.join(',');
  if(!cache.has(key))cache.set(key,playerCanSeePoint(target,blockers,observers));
  return cache.get(key);
 };
 return {rooms,visible};
}
function hideRoomPiece(p,vision){
 if(!vision||p.type==='standee')return false;
 const [w,d,h]=dimensions(p);
 const room=vision.rooms.find(a=>{
  const [x,y,z]=a.origin;
  return p.x>x&&p.y>y&&p.x+w<x+a.size&&p.y+d<y+a.depth&&p.z>=z&&p.z<z+2;
 });
 if(!room)return false;
 const center=[p.x+w/2,p.y+d/2,p.z];
 return !vision.visible(center)&&!vision.visible([center[0],center[1],p.z+h]);
}
// Sample broad rectangular terrain faces in roughly one-square patches.
function forEachTerrainLightPatch(face,paint){
 const points=face.world;
 if(face.p?.type!=='volume'||face.p.form||points.length!==4||
  (!face.volumeTop&&face.edge===undefined)){
  paint(points,face.projected);
  return;
 }
 const [a,b,,d]=points;
 const u=b.map((value,axis)=>value-a[axis]);
 const v=d.map((value,axis)=>value-a[axis]);
 const columns=Math.ceil(Math.hypot(...u)),rows=Math.ceil(Math.hypot(...v));
 if(columns<=1&&rows<=1){paint(points,face.projected);return}
 const grid=(x,y)=>a.map((value,axis)=>value+u[axis]*x/columns+v[axis]*y/rows);
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)
  paint([grid(x,y),grid(x+1,y),grid(x+1,y+1),grid(x,y+1)]);
}
function paintRoundLightPatch(points,projection,ranges,paint,depth,budget,refined=false,offset,shadowSample,worldOnly=false){
 const center=fogFaceCenter(points),sample=surfaceLightPoint(center,offset);
 if(depth&&budget.remaining>0&&points.length===4&&ranges.length){
  const span=Math.max(...points.map(p=>Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])));
  const edges=ranges.filter(({source,radii})=>{
   const distance=Math.hypot(source[0]-sample[0],source[1]-sample[1],source[2]-sample[2]);
   return radii.some(radius=>Math.abs(distance-radius)<span);
  });
  const nearby=shadowSample?ranges.filter(({source,radii})=>
   Math.hypot(...source.map((value,i)=>value-sample[i]))<Math.max(...radii)+span):null;
  let shadowEdge=false;
  if(!edges.length&&nearby?.length&&budget.shadowProbes>0){
   budget.shadowProbes--;
   const atCenter=shadowSample(sample);
   shadowEdge=points.some(vertex=>shadowSample(surfaceLightPoint(
    vertex.map((value,i)=>value*.85+center[i]*.15),offset))!==atCenter);
  }
  if(edges.length||shadowEdge){
   budget.remaining--;
   const midpoints=points.map((p,i)=>p.map((value,axis)=>(value+points[(i+1)%4][axis])/2));
   for(let i=0;i<4;i++)paintRoundLightPatch(
    [points[i],midpoints[i],center,midpoints[(i+3)%4]],null,nearby??edges,paint,depth-1,budget,true,offset,shadowSample,worldOnly);
   return;
  }
 }
 paint(refined||offset?sample:sample.map(value=>Math.round(value*4)/4),worldOnly?null:projection??points.map(p=>point(...p)),points);
}
let lightingFrame=null,performanceDraw=null,lightingCache=null;
let fogCache=null,fogMemoryState=null;
let pendingFogTravel=null;
function rememberFogTravel(points,token){
 if(!playerFogEnabled()||preferences.fogMemory===0||!ownsRoomStandee(token)||points.length<2)return;
 const samples=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],n=Math.max(1,Math.ceil(Math.hypot(...a.map((v,k)=>b[k]-v))/.5));
  for(let j=0;j<n;j++)samples.push(a.map((v,k)=>v+(b[k]-v)*j/n));
 }
 const stride=Math.max(1,Math.ceil(samples.length/120));
 const retained=samples.filter((_,i)=>i%stride===0);
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 // Partition path samples so each fog patch only tests nearby travel points.
 // Grid cells are smaller than the 24-unit visibility envelope; checking
 // three cells in each direction includes every sample within that radius.
 const cellSize=8,cells=new Map();
 for(const position of retained){
  const cx=Math.floor(position[0]/cellSize),cy=Math.floor(position[1]/cellSize),key=cx+','+cy;
  if(!cells.has(key))cells.set(key,[]);
  cells.get(key).push(position);
 }
 pendingFogTravel={samples:retained,token,cells,cellSize,bounds:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
}
function fogSeenDuringTravel(patch,blockers){
 if(!pendingFogTravel||!fogMemoryState)return false;
 const {samples,token,bounds,cells,cellSize}=pendingFogTravel;
 if(token.conditions?.includes('dead')||token.conditions?.includes('blinded')&&!token.blindsight)return false;
 const target=surfaceLightPoint(fogFaceCenter(patch.world),patch.surfaceLightOffset);
 // Reject terrain outside the traveled path envelope before any ray tests.
 if(bounds&&(target[0]<bounds[0]-24||target[0]>bounds[2]+24||
             target[1]<bounds[1]-24||target[1]>bounds[3]+24))return false;
 const nearby=[];
 if(cells){
  const cx=Math.floor(target[0]/cellSize),cy=Math.floor(target[1]/cellSize);
  for(let x=cx-3;x<=cx+3;x++)for(let y=cy-3;y<=cy+3;y++){
   const bucket=cells.get(x+','+y);
   if(bucket)nearby.push(...bucket);
  }
 }
 return (cells?nearby:samples).some(position=>{
  const dx=position[0]-target[0],dy=position[1]-target[1];
  if(dx*dx+dy*dy>576)return false;
  const eye=[position[0],position[1],position[2]+.65];
  const observer={...token,x:position[0]-token.size/2,y:position[1]-token.size/2,z:position[2]};
  return sightlineClear(eye,target,blockers)&&(darkvisionReaches(observer,target)||ambientAt(target,blockers)||lightAt(target,blockers));
 });
}
// Local cache remains available offline; Supabase is authoritative across sessions.
function saveFogMemory(){
 if(railTravelRunning||pathWallBenchmarkDrawing)return;
 const state=fogMemoryState;
 if(!state?.dirty)return;
 try{localStorage.setItem('battlemap.fog:'+state.key,JSON.stringify([...state.seen]));state.dirty=false}catch{}
 state.pending=true;
}
async function syncFogMemory(state){
 if(railTravelRunning||pathWallBenchmarkDrawing||!state||fogMemoryState!==state)return;
 if(!state.sceneId||state.profile!==roomProfile?.name){state.syncStatus='identity-mismatch';return}
 if(!roomProfile?.token){state.syncStatus='waiting-for-session';return}
 if(state.loading||state.saving)return;
 if(!state.loaded){
  state.loading=true;state.syncStatus='loading';
  try{
   const result=await roomRpc('fog_load',{ticket:roomProfile.token,scene_id:state.sceneId,fog_revision:state.revision});
   if(result?.error)throw Error(result.error);
   if(!Array.isArray(result?.seen))throw Error('Fog load returned no history array');
   if(fogMemoryState!==state)return;
   const before=state.seen.size;
   for(const key of result.seen)state.seen.add(key);
   state.loaded=true;state.syncStatus='loaded';state.loadError=null;
   console.info('[Fog memory] remote restoration',{sceneId:state.sceneId,remote:result.seen.length,before,after:state.seen.size});
   if(state.seen.size!==before){state.dirty=true;saveFogMemory();draw('Fog history restored')}
  }catch(error){
   state.syncStatus='load-failed';state.loadError=String(error?.message||error);
   console.warn('Fog history load failed; remote saving blocked',error);
  }finally{state.loading=false}
 }
 // Never overwrite remote exploration with a partial local snapshot.
 if(!state.loaded||!state.pending||state.saving||fogMemoryState!==state)return;
 state.saving=true;state.pending=false;state.syncStatus='saving';
 try{
  const result=await roomRpc('fog_save',{ticket:roomProfile.token,scene_id:state.sceneId,fog_revision:state.revision,seen:[...state.seen]});
  if(result?.error)throw Error(result.error);
  state.syncStatus='saved';
 }catch(error){state.pending=true;state.syncStatus='save-failed';state.loadError=String(error?.message||error);console.warn('Fog history save failed',error)}
 finally{state.saving=false}
}

let fogMemorySyncTimer=null;
function scheduleFogMemorySync(state){
 if(!state||railTravelRunning||pathWallBenchmarkDrawing)return;
 if(fogMemorySyncTimer!==null)clearTimeout(fogMemorySyncTimer);
 fogMemorySyncTimer=setTimeout(()=>{
  fogMemorySyncTimer=null;
  if(fogMemoryState===state)void syncFogMemory(state);
 },350);
}
window.addEventListener('pagehide',()=>{
 if(fogMemoryState?.dirty)saveFogMemory();
});
let fogMemoryDrawAudit={visible:0,remembered:0,unseen:0,storedMatches:0};
function fogRemember(key,visible){
 const audit=fogMemoryDrawAudit;
 if(audit){if(visible)audit.visible++;else if(fogMemoryState?.seen.has(key))audit.storedMatches++;else audit.unseen++;}
 // Tactical discovery now owns historical exploration. The 3D battlefield
 // must never paint a remembered patch outside current sight.
 if(roomProfile?.gm===false||gmVisionObserver()||preferences.fogMemory===0)return visible?1:0;
 if(visible){
  if(fogMemoryState&&!fogMemoryState.seen.has(key)){fogMemoryState.seen.add(key);fogMemoryState.dirty=true}
  return 1;
 }
 const remembered=preferences.fogMemory===1&&fogMemoryState?.seen.has(key);
 if(remembered&&audit)audit.remembered++;
 return remembered?2:0;
}
function playerFogEnabled(){
 return roomProfile?.gm===false&&(preferences.fogMemory===0||areas.some(a=>a.shape==='appearance'&&a.appearance?.fogOfWar===true));
}
function sightlineClear(eye,target,blockers){
 return !rayBlockerCandidates(blockers,eye,target).some(bounds=>{
  if(bounds.wallPrism){
   const solid=bounds.wallPrism,span=!wallPassage(solid).sight&&wallSightInterval(bounds,eye,target);
   return span&&span[0]<.995;
  }
  const path=bounds.terrain?turnTerrainPoints([eye,target],bounds.terrain,-bounds.terrain.terrainYaw):[eye,target];
  const interval=movementInterval(...path,bounds);
  return interval&&interval[0]<.995;
 });
}
// Exact-ray cache, partitioned into 8-unit target sectors. This is not a
// sector visibility shortcut: only identical eye/target rays can be reused.
// Invalidate with the lighting/terrain signature, including doors and windows.
let fogSectorRayCache=null;
const fogWorkerEnabled=new URLSearchParams(location.search).get('fogWorker')==='1';
let fogRayWorker=null,fogWorkerCache=null,fogWorkerJob=null,fogWorkerSerial=0;
const webGLFogWarmupBudgetMs=120;
function useFogRayWorker(){
 return fogWorkerEnabled||(studioWebGLEnabled&&roomProfile?.gm===false&&playing&&!topDown);
}
function finishFogWorkerJob(job,success){
 if(!job)return;
 job.pending=false;
 job.complete(success);
}
const fogWorkerStats={queued:0,completed:0,reused:0,failed:0,lastRayCount:0,lastWorkerMs:0,
 lightRaysQueued:0,lightRaysCompleted:0,lightRaysReused:0,lastLightBatch:null,
 repaintRayMisses:0,repaintRaysQueued:0,repaintRaysCompleted:0,repaintRaysReused:0,repaintFailed:0};
const recentSharpLightTargets=new Map();
let sharpLightTargetScene=null;
function sampledLightTransmission(start,end,blockers){
 const cache=fogSectorRayCache;
 if(useFogRayWorker()&&roomProfile?.gm===false){
  if(sharpLightTargetScene!==currentSceneId){
   recentSharpLightTargets.clear();
   sharpLightTargetScene=currentSceneId;
  }
  const key=end.join(',');
  recentSharpLightTargets.set(key,end);
  if(recentSharpLightTargets.size>4096)recentSharpLightTargets.delete(recentSharpLightTargets.keys().next().value);
  const value=blockers===cache?.blockers?cache?.workerLight?.get(start.join(','))?.get(key):undefined;
  if(value!==undefined){fogWorkerStats.lightRaysReused++;return value}
  if(cache&&blockers===cache.blockers&&lightingFrame&&!carry&&!drag){
   const rayKey=start.join(',')+'>'+key;
   const sampled=cache.repaintLight?.get(rayKey);
   if(sampled!==undefined){fogWorkerStats.repaintRaysReused++;return sampled}
   fogWorkerStats.repaintRayMisses++;
   const pending=cache.missedLight??=new Map();
   if(pending.size<4096&&!(repaintJob?.cache===cache&&repaintJob.rays.has(rayKey)))pending.set(rayKey,[start,end]);
  }
 }
 return wallRayTransmission(start,end,blockers);
}

function serializeFogWorkerBlockers(blockers){
 return blockers.map(bounds=>({
   bounds:[bounds[0],bounds[1],bounds[2]],
   prism:bounds.wallPrism?{
    z:bounds.wallPrism.z,top:bounds.wallPrism.top,axes:bounds.wallPrism.axes,spans:bounds.wallPrism.spans,
    sight:!!wallPassage(bounds.wallPrism).sight,light:wallPassage(bounds.wallPrism).light,
    wall:{id:bounds.wallPrism.wall.id}
   }:null,
   terrain:bounds.terrain&&Object.hasOwn(types,bounds.terrain.type)?{
    x:bounds.terrain.x,y:bounds.terrain.y,type:bounds.terrain.type,
    terrainYaw:bounds.terrain.terrainYaw,size:dimensions(bounds.terrain).slice(0,2)
   }:null
  }));
}
let repaintWorker=null,repaintWorkerCache=null,repaintJob=null;
function sendRepaintRays(){
 const cache=fogSectorRayCache;
 if(!fogWorkerEnabled||!cache?.missedLight?.size||repaintJob||carry||drag)return;
 const rays=cache.missedLight;
 cache.missedLight=new Map();
 try{
  if(!repaintWorker){
   repaintWorker=new Worker('./studio-fog-worker.js?v=1554');
   repaintWorker.onerror=()=>{
    repaintWorker.terminate();
    repaintWorker=null;repaintWorkerCache=null;repaintJob=null;
    fogWorkerStats.repaintFailed++;
   };
   repaintWorker.onmessage=({data})=>{
    const job=repaintJob;
    repaintJob=null;
    if(!job||job.cache!==fogSectorRayCache)return;
    if(data.error||data.transmission?.length!==job.rays.size){fogWorkerStats.repaintFailed++;return}
    const results=job.cache.repaintLight??=new Map();
    let i=0;
    for(const key of job.rays.keys()){
     results.set(key,data.transmission[i++]);
     if(results.size>24576)results.delete(results.keys().next().value);
    }
    fogWorkerStats.repaintRaysCompleted+=job.rays.size;
   };
  }
  const blockers=repaintWorkerCache===cache?null:serializeFogWorkerBlockers(cache.blockers);
  repaintJob={cache,rays};
  repaintWorker.postMessage({blockers,repaintRays:[...rays.values()]});
  repaintWorkerCache=cache;
  fogWorkerStats.repaintRaysQueued+=rays.size;
 }catch{
  repaintJob=null;repaintWorkerCache=null;
  fogWorkerStats.repaintFailed++;
 }
}
function queueWorkerSightlines(destination,standee){
 const cache=fogSectorRayCache;
 if(!useFogRayWorker()||!cache?.blockers||!playerFogEnabled()||!fogRecentSamplePoints.size)return null;
 let job;
 try{
  if(!fogRayWorker){
   fogRayWorker=new Worker('./studio-fog-worker.js');
   fogRayWorker.onerror=()=>{
    fogWorkerStats.failed++;
    fogRayWorker.terminate();
    finishFogWorkerJob(fogWorkerJob,false);
    fogRayWorker=null;fogWorkerCache=null;fogWorkerJob=null;
   };
   fogRayWorker.onmessage=({data})=>{
    const job=fogWorkerJob;
    if(data.id!==job?.id)return;
    fogWorkerJob=null;
    if(job.cache!==fogSectorRayCache){finishFogWorkerJob(job,false);return}
    if(data.error||data.visible?.length!==job.points.length){
     fogWorkerStats.failed++;finishFogWorkerJob(job,false);return;
    }
    job.cache.workerRays={eye:job.eye.join(','),points:new Map(job.points.map((point,i)=>[point.join(','),!!data.visible[i]]))};
    if(job.lightStart&&data.transmission?.length===job.lightPoints.length){
     job.cache.workerLight=new Map([[job.lightStart.join(','),new Map(job.lightPoints.map((point,i)=>
      [point.join(','),data.transmission[i]]))]]);
     fogWorkerStats.lightRaysCompleted+=job.lightPoints.length;
    }
    fogWorkerStats.completed++;
    fogWorkerStats.lastRayCount=job.points.length;
    fogWorkerStats.lastWorkerMs=data.elapsedMs;
    job.workerMs=data.elapsedMs;
    finishFogWorkerJob(job,true);
   };
  }
  const eye=basePoint(destination);eye[2]+=.65;
  const points=[...fogRecentSamplePoints.values()].slice(-4096);
  const lightStart=standee.torch&&!standee.incognito&&sceneWallPaths().length
   ?lightRayStart({origin:[destination.x+(standee.size-1)/2,
     destination.y+(standee.size-1)/2,destination.z],lightElevation:.65}):null;
  const lightPoints=lightStart&&sharpLightTargetScene===currentSceneId?[...recentSharpLightTargets.values()]:[];
  fogWorkerStats.lastLightBatch={carryingTorch:!!standee.torch,incognito:!!standee.incognito,
   pathWalls:sceneWallPaths().length,targets:lightPoints.length};
  fogWorkerStats.lightRaysQueued+=lightPoints.length;
  const id=++fogWorkerSerial;
  const blockers=fogWorkerCache===cache?null:serializeFogWorkerBlockers(cache.blockers);
  finishFogWorkerJob(fogWorkerJob,false);
  let complete;
  const done=new Promise(resolve=>{complete=resolve});
  job={id,cache,eye,points,lightStart,lightPoints,done,complete,pending:true,started:performance.now()};
  fogWorkerJob=job;
  fogRayWorker.postMessage({id,blockers,eye,points,lightStart,lightPoints});
  fogWorkerCache=cache;
  fogWorkerStats.queued++;
  return job;
 }catch(error){
  finishFogWorkerJob(job,false);
  fogWorkerStats.failed++;
  fogWorkerCache=null;fogWorkerJob=null;
  return null;
 }
}
async function waitForWebGLFogRays(job){
 const remaining=job.started+webGLFogWarmupBudgetMs-performance.now();
 if(!job.pending||remaining<=0)return;
 let timeout;
 try{await Promise.race([job.done,new Promise(resolve=>{timeout=setTimeout(resolve,remaining)})])}
 finally{clearTimeout(timeout)}
}
function cachedFogSightline(eye,target,blockers){
 const cache=fogSectorRayCache;
 if(!cache)return sightlineClear(eye,target,blockers);
 const warmed=blockers===cache.blockers&&cache.workerRays;
 if(warmed?.eye===eye.join(',')){
  const visible=warmed.points.get(target.join(','));
  if(visible!==undefined){fogWorkerStats.reused++;return visible}
 }
 const sector=fogRegionKey(target);
 let bucket=cache.sectors.get(sector);
 if(!bucket){bucket=new Map();cache.sectors.set(sector,bucket)}
 const key=eye.join(',')+'>'+target.join(',');
 if(bucket.has(key)){cache.hits++;return bucket.get(key)}
 cache.misses++;
 const result=sightlineClear(eye,target,blockers);
 if(cache.count<120000&&bucket.size<6000){bucket.set(key,result);cache.count++}
 return result;
}
// v1.468: 2D plan-view visibility diagnostic. Never drives rendering.
// Compare conservative planar blocker intersection with authoritative 3D rays;
// this exposes where a future shared top-down visibility mask needs elevation logic.
let planarVisionAudit=null;
function planarVisionBlocked(eye,target,blockers){
 const dx=target[0]-eye[0],dy=target[1]-eye[1];
 if(dx*dx+dy*dy<1e-12)return false;
 const candidates=rayBlockerCandidates(blockers,eye,target);
 for(const b of candidates){
  // Only count a blocker if it spans the complete eye-to-target height;
  // otherwise 3D elevation may permit a sightline over or under it.
  if(b[2][0]>Math.min(eye[2],target[2])||b[2][1]<Math.max(eye[2],target[2]))continue;
  const loX=b[0][0],hiX=b[0][1],loY=b[1][0],hiY=b[1][1];
  let t0=0,t1=1;
  for(const [p,d,lo,hi] of [[eye[0],dx,loX,hiX],[eye[1],dy,loY,hiY]]){
   if(Math.abs(d)<1e-10){if(p<lo||p>hi){t0=2;break}continue}
   const a=(lo-p)/d,c=(hi-p)/d;
   t0=Math.max(t0,Math.min(a,c));t1=Math.min(t1,Math.max(a,c));
  }
  if(t0<t1&&t1>0&&t0<.995)return true;
 }
 return false;
}
let fogIlluminationCache=null;
// Bounded exact-position illumination reuse: a carried light's source position
// is the cache key, while the camera is deliberately absent.
let fogMovingLightCache={signature:null,positions:new Map()};
const FOG_LIGHT_POSITION_LIMIT=24;
const FOG_LIGHT_POINT_LIMIT=180000;
// Opportunistic world-space light prewarming. Never changes visibility decisions.
let fogPrewarmJob=null;
let fogPrewarmTimer=null;
let fogPrewarmCompletedKey=null;
// Exact renderer coordinates observed during previous frames, not synthetic grid centers.
const fogRecentSamplePoints=new Map();
let fogPrewarmCalculated=0,fogPrewarmReused=0,fogMovingLightEvictions=0;
function fogPrewarmStatus(message){
 let node=document.getElementById('fogPrewarmStatus');
 if(!node){
  node=document.createElement('div');
  node.id='fogPrewarmStatus';
  node.setAttribute('role','status');
  node.style.cssText='position:fixed;bottom:12px;left:12px;z-index:1000;background:#17212bdc;color:white;padding:6px 10px;border-radius:6px;font:12px sans-serif;pointer-events:none';
  document.body.appendChild(node);
 }
 node.textContent=message;
 node.hidden=!message;
}
function queueFogPrewarm(signature,lights){
 if(pathWallBenchmarkDrawing||!playing||!currentSceneId||!lights.some(light=>light.carried))return;
 const emitters=lights.filter(light=>light.carried);
 const positionKey=JSON.stringify(emitters.map(light=>[
  lightRangeCenter(light),light.radius,light.bright,light.tint,light.lightElevation,light.spell
 ]));
 const jobKey=signature+'|'+positionKey;
 if(fogPrewarmCompletedKey===jobKey||fogPrewarmJob?.key===jobKey)return;
 if(fogPrewarmTimer!==null){clearTimeout(fogPrewarmTimer);fogPrewarmTimer=null}
 const origins=tokens.filter(ownsRoomStandee).map(basePoint);
 if(!origins.length)return;
 // Prewarm only coordinates the renderer actually requests. A synthetic
 // square-center grid produced no cache hits in the v1.485 rail benchmark.
 const points=[];
 for(const p of fogRecentSamplePoints.values()){
  if(origins.some(origin=>Math.hypot(p[0]-origin[0],p[1]-origin[1])<=6))points.push(p);
  if(points.length>=256)break;
 }
 if(!points.length)return;
 const job={key:jobKey,signature,positionKey,points,index:0};
 fogPrewarmJob=job;
 const run=()=>{
  fogPrewarmTimer=null;
  if(fogPrewarmJob!==job||fogMovingLightCache.signature!==signature){fogPrewarmStatus('');return}
  // v1.546: cooperative idle-time lighting preparation. Never run a
  // background batch during a standee drag, pending confirmation, or input.
  // Preserve exact ray/gradient calculations; only the scheduling changes.
  if(carry||drag||roomMoving){
   fogPrewarmTimer=setTimeout(run,60);
   return;
  }
  const started=performance.now();
  let count=0;
  let cache=fogMovingLightCache.positions.get(positionKey);
  if(!cache){
   cache=new Map();fogMovingLightCache.positions.set(positionKey,cache);
   if(fogMovingLightCache.positions.size>FOG_LIGHT_POSITION_LIMIT)
    fogMovingLightCache.positions.delete(fogMovingLightCache.positions.keys().next().value);
  }
  let blockers;
  while(job.index<points.length&&count<4&&performance.now()-started<3){
   const p=points[job.index++],key=p.join(',');
   if(!cache.has(key)){
    blockers=blockers||visionBlockers();
    cache.set(key,!!(ambientAt(p,blockers)||lightAt(p,blockers)));
    (cache.prewarmed||(cache.prewarmed=new Set())).add(key);
    fogPrewarmCalculated++;
   }
   count++;
  }
  if(job.index<points.length){
   fogPrewarmStatus('Preparing nearby lighting '+Math.round(100*job.index/points.length)+'%');
   fogPrewarmTimer=setTimeout(run,16);
  }else{
   fogPrewarmCompletedKey=job.key;fogPrewarmJob=null;fogPrewarmStatus('');
  }
 };
 fogPrewarmStatus('Preparing nearby lighting 0%');
 fogPrewarmTimer=setTimeout(run,0);
}
let fogMovingLightHits=0;
let fogMovingLightMisses=0;
let fogDistantDarkCache=null;
let fogDistantDarkHits=0;
let fogDistantDarkEligible=false;
let fogDistantDarkInvalidations=0;
let fogDistantDarkSignatureChanges=0;
let fogDistantDarkPreviousSignature=null;
let fogDistantDarkChangeReasons={};
let fogDistantDarkComponentHashes=null;
let fogDistantDarkComponentChanges={};
let fogDistantDarkLastChanged=[];
let fogFastPatchSkips=0;
// Spatial fog workload counters, reset with each lighting frame. These identify
// the regions actually sampled during movement without changing visibility.
let fogRegionStats={regions:new Set(),samples:0,cacheHits:0,observerTests:0,rangeRejects:0,rayTests:0};
 planarVisionAudit={compared:0,planarBlocked:0,threeDBlocked:0,agreements:0,falseBlocked:0,missedBlockers:0,limit:192,visibleCompared:0,blockedCompared:0,nearCompared:0,farCompared:0,localFogSamples:0,distantFogSamples:0,distantIlluminated:0,localRadiusFeet:0,note:'Stratified diagnostics only; no fog visibility or range rules changed.'};
let fogPreparedObservers=null;
function prepareFogObservers(){
 const preview=gmVisionObserver();
 const familiar=activeVisionFamiliar();
 const eligible=(preview?[preview]:tokens.filter(t=>t.familiarCaster?t===familiar:t.roomId!==familiar?.familiarCaster||!familiar))
  .filter(token=>(preview||ownsRoomStandee(token)&&!token.incognito)&&
   !token.conditions?.includes('dead')&&
   (!token.conditions?.includes('blinded')||!!token.blindsight));
 return {preview,observers:eligible.map(token=>{
  const eye=basePoint(token);eye[2]+=.65;
  const distance=basePoint(token);
  const range=Math.max(Number(token.blindsight)||0,token.conditions?.includes('blinded')?0:Number(token.darkvision)||0)/5;
  return {eye,distance,range,grounded:!token.flying};
 })};
}
function occupiedPlatformVisibility(observers){
 const platforms=new Map();
 const terrain=pieces.filter(piece=>!piece.stairTread&&
  (piece.groundSurface||['volume','terrace','stone','bridge'].includes(piece.type)));
 for(const {distance:[x,y,z],grounded} of observers){
  if(!grounded||z<=0)continue;
  for(const piece of terrain){
   if(platforms.has(piece)||Math.abs(piece.z+dimensions(piece)[2]-z)>1e-7)continue;
   const footprint=terrainFootprint(piece);
   if(!carryPointInsideFloor([x,y],footprint))continue;
   let below=0;
   for(const floor of terrain){
    const top=floor.z+dimensions(floor)[2];
    if(top>below&&top<=piece.z+1e-7&&footprintsOverlap(footprint,terrainFootprint(floor)))below=top;
   }
   const xs=footprint.map(point=>point[0]),ys=footprint.map(point=>point[1]);
   platforms.set(piece,{below,bounds:[Math.min(...xs)-1,Math.min(...ys)-1,Math.max(...xs)+1,Math.max(...ys)+1]});
  }
 }
 return platforms;
}
function platformLowerFloorVisible(world,platforms){
 if(!platforms.size)return false;
 const [x,y,z]=fogFaceCenter(world);
 if(!world.every(vertex=>Math.abs(vertex[2]-z)<1e-7))return false;
 for(const {below,bounds:[left,top,right,bottom]} of platforms.values()){
  if(Math.abs(z-below)<1e-7&&x>=left&&x<=right&&y>=top&&y<=bottom)return true;
 }
 return false;
}
function fogRegionKey(target){
 return Math.floor(target[0]/8)+','+Math.floor(target[1]/8)+','+Math.floor(target[2]/8);
}
// Conservative wall-region gate: only the observer's own room and rooms
// reached through an aperture within its visibility range may be sampled. Unknown
// topology and elevated viewpoints fall back to full 3D visibility.
let proximityRoomGate={frame:null,topology:null,observers:null,allowed:null};
let proximityRoomGateSkips=0;
function roomProximityReject(target,prepared){
 if(prepared.preview||!prepared.observers.length||Math.abs(target[2])>.15||
    prepared.observers.some(o=>Math.abs(o.distance[2])>.15))return false;
 const frame=fogCache;
 if(proximityRoomGate.frame!==frame||proximityRoomGate.observers!==prepared){
  const topology=wallVisibilityTopology();
  const allowed=new Set();
  for(const o of prepared.observers){
   const own=topology.regionAt?.(o.distance);
   if(own===null||own===undefined){proximityRoomGate={frame,topology,observers:prepared,allowed:null};return false;}
   allowed.add(own);
   for(const portal of topology.portals||[]){
    const [a,b]=portal.regions||[];
    if(a!==own&&b!==own)continue;
    if(!(portal.kind==='Window'?!portal.shaded:portal.open))continue;
    if(!portalWithinVisibilityRange(o,portal))continue;
    if(a!==null&&a!==undefined)allowed.add(a);
    if(b!==null&&b!==undefined)allowed.add(b);
   }
  }
  proximityRoomGate={frame,topology,observers:prepared,allowed};
 }
 const {topology,allowed}=proximityRoomGate;
 if(!allowed)return false;
 const region=topology.regionAt?.(target);
 if(region===null||region===undefined)return false;
 if(allowed.has(region))return false;
 proximityRoomGateSkips++;
 return true;
}
function fogPointVisible(target,respectFogMode=true){
 if(respectFogMode&&!mapFogEnabled())return true;
 const key=target.join(',');
 if(fogCache?.points.has(key)){fogRegionStats.cacheHits++;return fogCache.points.get(key);}
 fogRegionStats.samples++;
 fogRegionStats.regions.add(fogRegionKey(target));
 if(!fogRecentSamplePoints.has(key)){
  fogRecentSamplePoints.set(key,target.slice());
  if(fogRecentSamplePoints.size>10000)fogRecentSamplePoints.delete(fogRecentSamplePoints.keys().next().value);
 }
 const prepared=fogPreparedObservers||(fogPreparedObservers=prepareFogObservers());
 if(roomProximityReject(target,prepared)){
  if(fogCache&&fogCache.points.size<180000)fogCache.points.set(key,false);
  return false;
 }
 // Reuse cross-frame unilluminated negatives only while the moving observer
 // remains beyond darkvision; never reuse an old 3D occlusion result.
 if(fogDistantDarkEligible&&fogDistantDarkCache?.values.has(key)&&prepared.observers.length&&
  prepared.observers.every(o=>{
   const dx=o.distance[0]-target[0],dy=o.distance[1]-target[1],dz=o.distance[2]-target[2];
   return dx*dx+dy*dy+dz*dz>o.range*o.range;
  })){
  fogDistantDarkHits++;
  if(fogCache&&fogCache.points.size<180000)fogCache.points.set(key,false);
  return false;
 }
 // Defer construction/lookup of 3D blockers until a sightline is actually
 // needed. Most fog samples are outside darkvision and unilluminated.
 let blockers;
 const getBlockers=()=>blockers||(blockers=visionBlockers());
 // The working area is a measurement, not a visibility cutoff.
 // 30 feet of movement buffer beyond the longest observer darkvision.
 if(planarVisionAudit){
  const closest=prepared.observers.reduce((best,o)=>Math.min(best,Math.hypot(o.distance[0]-target[0],o.distance[1]-target[1])),Infinity);
  const radius=prepared.observers.reduce((best,o)=>Math.max(best,o.range),0)+6;
  planarVisionAudit.localRadiusFeet=radius*5;
  if(closest<=radius)planarVisionAudit.localFogSamples++;
  else planarVisionAudit.distantFogSamples++;
 }
 // Static illumination is reusable as observers travel; changes to terrain
 // or light invalidate its separate signature.
 let illumination;
 const illuminated=()=>{
  if(illumination!==undefined)return illumination;
  const moving=lightingFrame?.lights?.some(light=>light.carried)??activeLights().some(light=>light.carried);
  let cache=fogIlluminationCache?.values;
  if(moving){
   // Each exact carried-light configuration has its own bounded world-space
   // sample mask. Revisit a position without retracing identical light rays.
   const positionKey=lightingFrame?.movingLightSignature??JSON.stringify(activeLights().filter(light=>light.carried).map(light=>[
    lightRangeCenter(light),light.radius,light.bright,light.tint,light.lightElevation,light.spell
   ]));
   const positions=fogMovingLightCache.positions;
   cache=lightingFrame?.movingFogMask;
   if(!cache){
    cache=positions.get(positionKey);
    if(cache){positions.delete(positionKey);positions.set(positionKey,cache)}
    else{
     cache=new Map();
     positions.set(positionKey,cache);
     if(positions.size>FOG_LIGHT_POSITION_LIMIT){positions.delete(positions.keys().next().value);fogMovingLightEvictions++}
    }
    if(lightingFrame)lightingFrame.movingFogMask=cache;
   }
  }
  if(cache?.has(key)){if(moving){fogMovingLightHits++;fogPrewarmReused+=cache.prewarmed?.delete(key)?1:0}return illumination=cache.get(key)}
  if(moving)fogMovingLightMisses++;
  illumination=!!(ambientAt(target,getBlockers())||lightAt(target,getBlockers()));
  if(cache&&cache.size<FOG_LIGHT_POINT_LIMIT)cache.set(key,illumination);
  return illumination;
 };
 // Preserve Arcane Eye semantics, including its independent sight origin.
 const visible=(!prepared.preview&&eyeSees(target,getBlockers()))||prepared.observers.some(observer=>{
  fogRegionStats.observerTests++;
  const dx=observer.distance[0]-target[0],dy=observer.distance[1]-target[1],dz=observer.distance[2]-target[2];
  const inDarkvision=observer.range>0&&dx*dx+dy*dy+dz*dz<=observer.range*observer.range;
  if(!inDarkvision&&!illuminated()){
   fogRegionStats.rangeRejects++;
   if(planarVisionAudit){if(Math.hypot(dx,dy)>observer.range+6)planarVisionAudit.farRangeRejects++;else planarVisionAudit.nearRangeRejects++;}
   return false;
  }
  if(planarVisionAudit&&Math.hypot(dx,dy)>observer.range+6){planarVisionAudit.distantIlluminated++;planarVisionAudit.farLitTests++;}
  fogRegionStats.rayTests++;
  const result=cachedFogSightline(observer.eye,target,getBlockers());
  if(planarVisionAudit){
   const audit=planarVisionAudit;
   const distance=Math.hypot(dx,dy),near=distance<=observer.range+6;
   // Sample across the full traversal rather than the first 96 blocked rays.
   // Reserve half the budget for visible rays and split the remainder
   // between nearby and distant blocked rays.
   // Decimate incoming rays to spread validation beyond the earliest sampled patch.
   audit.eligibleSamples++;
   const eligible=audit.eligibleSamples%17===0&&(result?audit.visibleCompared<64:
    near?audit.nearCompared<64:audit.farCompared<64);
   if(eligible){
    const planar=planarVisionBlocked(observer.eye,target,getBlockers());
    audit.compared++;
    if(result)audit.visibleCompared++;
    else if(near)audit.nearCompared++;
    else audit.farCompared++;
    if(planar)audit.planarBlocked++;
    if(!result)audit.threeDBlocked++;
    if(planar===!result)audit.agreements++;
    else if(planar)audit.falseBlocked++;
    else audit.missedBlockers++;
   }
  }
  return result;
 });
 // Boundary refinement samples many shared world points. The former 24k cap
 // saturated early in complex scenes and forced repeated expensive ray tests.
 // Bound the cache per visibility signature (reset on observer/lighting changes).
 if(!visible&&illumination===false&&fogDistantDarkEligible&&prepared.observers.length&&
  prepared.observers.every(o=>{
   const dx=o.distance[0]-target[0],dy=o.distance[1]-target[1],dz=o.distance[2]-target[2];
   return dx*dx+dy*dy+dz*dz>o.range*o.range;
  })&&fogDistantDarkCache.values.size<180000)fogDistantDarkCache.values.set(key,true);
 if(fogCache&&fogCache.points.size<180000)fogCache.points.set(key,visible);
 return visible;
}
function fogFaceCenter(points){
 return points[0].map((_,axis)=>points.reduce((sum,point)=>sum+point[axis],0)/points.length);
}
function setDoorFaceLighting(face,anchor,normal,clearance){
 const center=fogFaceCenter(face.world);
 const distance=(center[0]-anchor[0])*normal[0]+(center[1]-anchor[1])*normal[1];
 // A closed door is embedded in the opening. Sample the air on the rendered side.
 if(Math.abs(distance)<1e-6)return;
 const offset=Math.sign(distance)*Math.max(0,clearance-Math.abs(distance));
 face.surfaceLightOffset=[normal[0]*offset,normal[1]*offset,0];
}
const surfaceClearance=.015;
function surfaceLightPoint(point,offset){
 return offset?point.map((value,axis)=>value+offset[axis]):point;
}
function legacyWallSurfaceLighting(face,p){
 if(face.preview||!movementTerrainBlock(p)||face.shaped)return;
 if(face.edge===undefined){
  if(Number.isFinite(face.z))face.surfaceLightOffset=[0,0,surfaceClearance];
  return;
 }
 const [x,y]=[[-1,0],[1,0],[0,-1],[0,1]][face.edge];
 const yaw=(p.terrainYaw??0)*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw);
 face.surfaceLightOffset=[(x*c-y*s)*surfaceClearance,(x*s+y*c)*surfaceClearance,0];
}
// Geometry is independent of the observer. Keep the subdivision topology
// between rail positions, but never reuse mutable per-frame visibility flags.
let persistentFogPatchGeometry={scene:null,patches:new Map(),count:0};
function terrainFogPatches(face){
 const cache=fogCache;
 if(persistentFogPatchGeometry.scene!==currentSceneId){
  persistentFogPatchGeometry={scene:currentSceneId,patches:new Map(),count:0};
 }
 const subdivide=face.p?.type==='volume'&&!face.p.form&&face.world.length===4&&
  (face.volumeTop||face.edge!==undefined);
 const worldKey=JSON.stringify(face.world);
 const cacheKey=(subdivide?'grid:':'face:')+worldKey+(face.surfaceLightOffset?'|'+face.surfaceLightOffset.join(','):'');
 const cached=cache?.terrainPatches.get(cacheKey);
 if(cached)return cached;
 const persistent=persistentFogPatchGeometry.patches.get(cacheKey);
 if(persistent){
  const fresh=persistent.map(p=>({...p}));
  if(cache&&cache.terrainPatchCount+fresh.length<=24000){
   cache.terrainPatches.set(cacheKey,fresh);
   cache.terrainPatchCount+=fresh.length;
  }
  return fresh;
 }
 const patches=[];
 forEachTerrainLightPatch(face,world=>{
  patches.push({world,surfaceLightOffset:face.surfaceLightOffset,wholeFace:world===face.world,
   memoryKey:'face:'+(world===face.world?worldKey:JSON.stringify(world))});
 });
 if(persistentFogPatchGeometry.count+patches.length<=48000){
  // Store immutable topology only; the active frame owns its own patches.
  persistentFogPatchGeometry.patches.set(cacheKey,patches.map(p=>({...p})));
  persistentFogPatchGeometry.count+=patches.length;
 }
 if(cache&&cache.terrainPatchCount+patches.length<=24000){
  cache.terrainPatches.set(cacheKey,patches);
  cache.terrainPatchCount+=patches.length;
 }
 return patches;
}
// Refine only mixed-visibility floor patches. The base fog tiles and their
// remembered history remain unchanged; children inherit exploration history.
function fogPatchDefinitelyDark(patch){
 // Conservative full-patch test, including its interior. No hard vision
 // cutoff: this shortcut is used only for explicitly dark rooms without
 // openings and when no emitter can illuminate the patch.
 if(!fogDistantDarkEligible||!patch.world?.length)return false;
 // An opening elsewhere in the scene cannot illuminate a patch by itself.
 // Keep the conservative distance-to-observer and distance-to-every-light
 // checks below; these prevent suppressing visible geometry near portals.
 // This also allows region-level dark rejection in maps containing doors.
 const observers=(fogPreparedObservers||(fogPreparedObservers=prepareFogObservers())).observers;
 if(!observers.length)return false;
 const pts=patch.world.map(p=>surfaceLightPoint(p,patch.surfaceLightOffset));
 const lo=[0,1,2].map(i=>Math.min(...pts.map(p=>p[i])));
 const hi=[0,1,2].map(i=>Math.max(...pts.map(p=>p[i])));
 const minDistSq=p=>p.reduce((sum,v,i)=>{
  const delta=Math.max(lo[i]-v,0,v-hi[i]);return sum+delta*delta;
 },0);
 if(observers.some(o=>minDistSq(o.distance)<=o.range*o.range))return false;
 for(const light of (lightingFrame?.lights??activeLights())){
  const radius=Number(light.radius)/5;
  if(!(radius>=0))return false;
  if(minDistSq(lightRangeCenter(light))<=radius*radius)return false;
 }
 return pts.every(p=>roomIsDark(p))&&roomIsDark(lo)&&roomIsDark(hi);
}
function refinedFogBoundaryPatches(patch){
 if(fogPatchDefinitelyDark(patch)){
  fogFastPatchSkips++;
  return [{...patch,visible:false}];
 }
 // Apply in both camera projections: the visibility boundary is in world
 // coordinates, so isometric view must not fall back to whole-square fog.
 // Only ground faces are passed here; terrain walls retain their own tests.
 if(patch.world.length!==4)return [patch];
 const result=[],maxDepth=2;
 const visit=(part,depth,parentSeen)=>{
  const center=fogFaceCenter(part.world);
  // Leaf tiles use only their center; avoid constructing four unused
  // vertex samples for every one of the many refined leaf patches.
  const points=depth>=maxDepth?[center]:[center,...part.world.map(vertex=>vertex.map((v,i)=>v*.92+center[i]*.08))];
  // Stop sampling as soon as both visibility states are established.
  // At the refinement limit only the center determines the painted tile.
  const centerVisible=fogPointVisible(surfaceLightPoint(points[0],part.surfaceLightOffset));
  let mixed=false,anyVisible=centerVisible;
  if(depth<maxDepth){
   for(let i=1;i<points.length;i++){
    const seen=fogPointVisible(surfaceLightPoint(points[i],part.surfaceLightOffset));
    anyVisible=anyVisible||seen;
    if(seen!==centerVisible){mixed=true;break;}
   }
  }
  if(!mixed||depth>=maxDepth){
   // At the final resolution use the center, not an any-corner test that
   // paints the entire square visible across the circular sight boundary.
   part.visible=depth?centerVisible:anyVisible;
   if(parentSeen&&fogMemoryState&&!fogMemoryState.seen.has(part.memoryKey)){
    fogMemoryState.seen.add(part.memoryKey);
    fogMemoryState.dirty=true;
   }
   result.push(part);return;
  }
  const [a,b,c,d]=part.world;
  const midpoint=(p,q)=>p.map((v,i)=>(v+q[i])/2);
  const ab=midpoint(a,b),bc=midpoint(b,c),cd=midpoint(c,d),da=midpoint(d,a);
  const quads=[[a,ab,center,da],[ab,b,bc,center],[center,bc,c,cd],[da,center,cd,d]];
  for(const world of quads)visit({
   world,surfaceLightOffset:part.surfaceLightOffset,wholeFace:false,
   memoryKey:'face:'+JSON.stringify(world)
  },depth+1,parentSeen);
 };
 visit(patch,0,!!fogMemoryState?.seen.has(patch.memoryKey));
 return result;
}
// Per-lighting-frame blocker exclusions for raised top visibility.
// Avoid rebuilding the entire blocker list for every sample of one slab.
let raisedTopBlockerCache={source:null,byPiece:new WeakMap()};
function raisedTopOtherBlockers(piece){
 const source=visionBlockers();
 if(raisedTopBlockerCache.source!==source)
  raisedTopBlockerCache={source,byPiece:new WeakMap()};
 let others=raisedTopBlockerCache.byPiece.get(piece);
 if(!others){
  others=source.filter(blocker=>blocker.piece!==piece);
  raisedTopBlockerCache.byPiece.set(piece,others);
 }
 return others;
}
function terrainFogPatchVisible(patch){
 if(patch.visible===undefined){
  // Reject safely dark terrain patches before allocating sample points or
  // running any 3D sightlines. Distance and every active light are checked
  // against the entire patch, not merely its center.
  if(fogPatchDefinitelyDark(patch)){
   fogFastPatchSkips++;
   patch.visible=false;
   return false;
  }
  const center=fogFaceCenter(patch.world);
  // Sample the air just above horizontal raised surfaces. Sampling the
  // exact top plane can intersect the platform's own occluder and falsely
  // classify an otherwise visible top as hidden.
  const zs=patch.world.map(p=>p[2]??0);
  const horizontal=zs.length>=3&&Math.max(...zs)-Math.min(...zs)<.001;
  const raised=horizontal&&patch.world.some(p=>p[2]>.05);
  const visible=point=>{
   const sample=surfaceLightPoint(point,patch.surfaceLightOffset);
   if(!raised)return fogPointVisible(sample);
   const above=[sample[0],sample[1],sample[2]+.035];
   if(fogPointVisible(above))return true;
   // A raised slab can block rays terminating on its own top. Retest only
   // for surfaces below an observer's eye, excluding the sampled slab
   // itself while retaining every other wall, door and terrain blocker.
   // This does not reveal high platforms or anything placed on top.
   const piece=patch.ownerPiece;
   if(!piece)return false;
   const observers=(fogPreparedObservers||(fogPreparedObservers=prepareFogObservers())).observers;
   const candidates=observers.filter(o=>o.eye[2]>=above[2]-.01);
   if(!candidates.length)return false;
   const blockers=raisedTopOtherBlockers(piece);
   const lit=ambientAt(above,visionBlockers())||lightAt(above,visionBlockers());
   return candidates.some(o=>{
    const dx=o.distance[0]-above[0],dy=o.distance[1]-above[1],dz=o.distance[2]-above[2];
    if(dx*dx+dy*dy+dz*dz>o.range*o.range&&!lit)return false;
    return sightlineClear(o.eye,above,blockers);
   });
  };
  patch.visible=visible(center)||patch.world.some(vertex=>
   visible(vertex.map((value,i)=>value*.8+center[i]*.2)));
 }
 return patch.visible;
}
function nearbyPlayerDoor(object,reach=.5){
 if(object.kind!=='Door'||object.secret)return false;
 const [x,y,z]=object.origin;
 return playerCanReachDoor([x+.5,y+.5,z],reach);
}
function playerCanReachDoor([x,y,z],reach=.5){
 return tokens.some(token=>{
  if(!ownsRoomStandee(token)||token.incognito||token.conditions?.includes('dead'))return false;
  const [tx,ty,tz]=basePoint(token);
  return Math.abs(tz-z)<=.5&&Math.hypot(
   Math.max(0,Math.abs(tx-x)-token.size/2),
   Math.max(0,Math.abs(ty-y)-token.size/2)
  )<=reach;
 });
}
function fogOpeningVisible(object){
 return !object.secret&&(nearbyPlayerDoor(object)||fogObjectVisible(object));
}
function fogObjectVisible(object){
 const [x,y,z]=object.origin;
 const center=[x+.5,y+.5,z+(object.lightElevation??.65)];
 if(fogPointVisible(center))return true;
 if(object.shape!=='opening')return false;
 const axis=object.angle===0?1:0;
 return [-.07,.07].some(offset=>fogPointVisible(center.map((value,i)=>i===axis?value+offset:value)));
}
function startLightingFrame(){
 const blockers=visionBlockers(),lights=activeLights();
 completeSceneRayBlockers=blockers;
 const rooms=areas.filter(area=>area.shape==='room'||area.shape==='opening'||
  area.shape==='appearance').map(area=>area.shape==='appearance'?area.appearance?.ambient:area);
 const observers=tokens.filter(ownsRoomStandee).map(token=>
  [basePoint(token),token.darkvision,token.blindsight,token.incognito,token.conditions]);
 const preview=gmVisionObserver();
 // Geometry constructors may attach transient metadata to blocker objects.
 // Hash the actual occlusion bounds instead, preserving terrain, doors,
 // lights and room changes without invalidating on camera/standee movement.
 const stableBlockers=blockers.map(b=>[b[0],b[1],b[2],b.wallPrism?.poly,b.wallPrism?.spans,b.terrain?.terrainYaw]);
 const fogSignatureParts={
  scene:currentSceneId,
  wallBenchmarkHybrid,
  blockers:stableBlockers,
  lights:lights.filter(light=>!light.carried),
  rooms,
  wallPaths:sceneWallPaths(),
  roomDefinitions:wallRoomDefinitions(),
  graphicsQuality:preferences.graphicsQuality
 };
 const fogComponentHashes=Object.fromEntries(Object.entries(fogSignatureParts).map(([name,value])=>[name,JSON.stringify(value)]));
 const terrainLightSignature=JSON.stringify(Object.values(fogComponentHashes));
 // Moving emitters affect the active fog/lighting result, but not static
 // occlusion or fixed illumination. Exact source positions select cached masks.
 const movingLightSignature=JSON.stringify(lights.filter(light=>light.carried).map(light=>[
  lightRangeCenter(light),light.radius,light.bright,light.tint,light.lightElevation,light.spell
 ]));
 const signature=JSON.stringify([roomProfile?.gm,gmIgnoreLighting,playing,terrainLightSignature,movingLightSignature,observers,familiarView,spellEyes(),preview&&[basePoint(preview),preview.darkvision,preview.blindsight,preview.conditions]]);
 const fogRevision=Number(areas.find(a=>a.shape==='appearance')?.appearance?.fogRevision)||0;
 fogMemoryDrawAudit={visible:0,remembered:0,unseen:0,storedMatches:0};
 const memoryKey=JSON.stringify([roomProfile?.name,currentSceneId,fogRevision]);
 if(!playerFogEnabled()||preferences.fogMemory===0){saveFogMemory();fogMemoryState=null}
 else if(fogMemoryState?.key!==memoryKey){
  saveFogMemory();
  let seen=[];
  try{
   seen=JSON.parse(localStorage.getItem('battlemap.fog:'+memoryKey))??[];
   // Migrate older browser history keyed with the mutable room title.
   for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key?.startsWith('battlemap.fog:'))continue;
    let identity;try{identity=JSON.parse(key.slice('battlemap.fog:'.length))}catch{continue}
    if(Array.isArray(identity)&&identity.length===4&&identity[0]===roomProfile?.name&&identity[1]===currentSceneId&&Number(identity[3]||0)===fogRevision){
     const prior=JSON.parse(localStorage.getItem(key)||'[]');
     if(Array.isArray(prior))seen.push(...prior);
    }
   }
  }catch{}
  fogMemoryState={key:memoryKey,profile:roomProfile?.name,sceneId:currentSceneId,revision:fogRevision,seen:new Set(Array.isArray(seen)?seen:[]),shading:new Map(),dirty:false,pending:false,loaded:false,loading:false,saving:false,syncStatus:'not-loaded',loadError:null};
  console.info('[Fog memory] local restoration',{sceneId:currentSceneId,revision:fogRevision,stored:fogMemoryState.seen.size,profile:roomProfile?.name});
  if(fogMemoryState.seen.size){fogMemoryState.dirty=true;saveFogMemory()}
  void syncFogMemory(fogMemoryState);
 }
 // Retry history restoration after the player session becomes available.
 // Throttle failed requests to avoid repeated network calls during redraws.
 if(fogMemoryState&&!fogMemoryState.loaded&&!fogMemoryState.loading&&
    (!fogMemoryState.lastLoadAttempt||Date.now()-fogMemoryState.lastLoadAttempt>5000)){
  fogMemoryState.lastLoadAttempt=Date.now();
  void syncFogMemory(fogMemoryState);
 }
 const fogSignature=JSON.stringify([signature,roomProfile?.name,areas.find(a=>a.shape==='appearance')?.appearance?.fogRevision]);
 // A moving observer changes fogSignature but does not change static blockers.
 // Reuse only exact rays; lighting still gets evaluated independently.
 const raySignature=JSON.stringify([currentSceneId,terrainLightSignature,areas.filter(a=>a.shape==='opening').map(a=>[a.id,a.open,a.shaded,a.secret])]);
 if(fogSectorRayCache?.signature!==raySignature){
  fogSectorRayCache={signature:raySignature,sectors:new Map(),count:0,hits:0,misses:0};
 }
 fogSectorRayCache.blockers=blockers;
 if(fogIlluminationCache?.signature!==terrainLightSignature)
  fogIlluminationCache={signature:terrainLightSignature,values:new Map()};
 if(fogMovingLightCache.signature!==terrainLightSignature){
  fogMovingLightCache={signature:terrainLightSignature,positions:new Map()};
  fogRecentSamplePoints.clear();fogPrewarmCompletedKey=null;
 }
 fogMovingLightHits=0;fogMovingLightMisses=0;
 if(fogDistantDarkCache?.signature!==terrainLightSignature){
  if(fogDistantDarkCache){
   fogDistantDarkInvalidations++;fogDistantDarkSignatureChanges++;
   fogDistantDarkChangeReasons.signatureChanged=(fogDistantDarkChangeReasons.signatureChanged||0)+1;
   fogDistantDarkLastChanged=Object.keys(fogComponentHashes).filter(name=>fogDistantDarkComponentHashes?.[name]!==fogComponentHashes[name]);
   for(const name of fogDistantDarkLastChanged)fogDistantDarkComponentChanges[name]=(fogDistantDarkComponentChanges[name]||0)+1;
  }else fogDistantDarkLastChanged=['initial'];
  fogDistantDarkCache={signature:terrainLightSignature,values:new Map()};
 }
 fogDistantDarkComponentHashes=fogComponentHashes;
 fogFastPatchSkips=0;
 fogDistantDarkHits=0;
 fogDistantDarkEligible=!gmVisionObserver()&&!spellEyes().length&&!activeVisionFamiliar()&&!lights.some(light=>light.carried);
 fogRegionStats={regions:new Set(),samples:0,cacheHits:0,observerTests:0,rangeRejects:0,rayTests:0};
 // Audit is per draw, never cumulative across the rail. Keep the previous frame's
 // values immutable in its performance snapshot.
 planarVisionAudit={compared:0,planarBlocked:0,threeDBlocked:0,agreements:0,falseBlocked:0,missedBlockers:0,limit:192,visibleCompared:0,blockedCompared:0,nearCompared:0,farCompared:0,localFogSamples:0,distantFogSamples:0,distantIlluminated:0,localRadiusFeet:0,nearRangeRejects:0,farRangeRejects:0,farLitTests:0,eligibleSamples:0,note:'Per-frame diagnostic; no hard local fog cutoff. Distant light and elevated sightlines remain enabled.'};
 fogPreparedObservers=null;
 if(fogCache?.signature!==fogSignature)fogCache={signature:fogSignature,points:new Map(),terrainPatches:new Map(),terrainPatchCount:0};
 if(lightingCache?.signature!==signature||lightingCache.lightResults.size+lightingCache.surfaceLighting.size>24000){
  lightingCache={signature,lightResults:new Map(),surfaceLighting:new Map()};
 }
 // v1.487: pause speculative carried-light prewarming; rail diagnostics
 // showed zero reuse. Retain the cache and its counters for comparison.
 // Scene-load preparation will target stable wall geometry and fixed lights.
 if(fogPrewarmTimer!==null){clearTimeout(fogPrewarmTimer);fogPrewarmTimer=null}
 fogPrewarmJob=null;
 return {...lightingCache,blockers,lights,terrainLightSignature,movingLightSignature,visibility:new Map()};
}
function timeLighting(work){
 if(!performanceDraw||performanceDraw.timingLighting)return work();
 const start=performance.now();
 performanceDraw.timingLighting=true;
 try{return work()}finally{
  performanceDraw.lightingMs+=performance.now()-start;
  delete performanceDraw.timingLighting;
 }
}
let pathWallBenchmarkReport=null,pathWallBenchmarkDrawing=false;
const performanceSamples=[],standeeInputSamples=[];
let pendingStandeeInput=null;
function recordStandeeInput(event,standee){
 const sample=pendingStandeeInput;
 if(!sample||sample.scene!==currentSceneId||sample.standee!==standee.roomId)return;
 const accepted=performance.now();
 if(accepted-sample.confirmedAt>15000){pendingStandeeInput=null;return}
 const pointerAt=event.timeStamp;
 standeeInputSamples.push({
  confirmToAcceptedMs:roundedMs(accepted-sample.confirmedAt),
  pointerToAcceptedMs:Number.isFinite(pointerAt)&&pointerAt>=sample.confirmedAt&&pointerAt<=accepted
   ?roundedMs(accepted-pointerAt):null
 });
 if(standeeInputSamples.length>100)standeeInputSamples.shift();
 pendingStandeeInput=null;
}
let performanceTimer=null,renderingReport=null,lastCameraDraw=null,cameraReleasedAt=null;
const roundedMs=value=>Number(value.toFixed(2));
function updatePerformanceReadout(){
 const output=el('performanceReadout');
 if(!performanceSamples.length){output.textContent='Move the camera or a standee to collect samples.';return}
 const latest=performanceSamples.at(-1);
 const ordered=performanceSamples.map(sample=>sample.drawMs).sort((a,b)=>a-b);
 const typical=ordered[Math.floor(ordered.length/2)],slow=ordered[Math.ceil(ordered.length*.95)-1];
 output.textContent=[
  latest.view+' · '+latest.role+' '+latest.mode+' · '+ordered.length+' redraws',
  'Draw ms: last '+latest.drawMs+' / median '+typical+' / p95 '+slow,
  latest.session+' · '+latest.action+' · geometry '+latest.geometryMs+' ms · paint '+latest.paintMs+' ms',
  'Geometry ms: visibility setup '+(latest.visibilitySetupMs??0)+' / ground '+(latest.groundGeometryMs??0)+' / face generation and projection '+(latest.faceGeometryMs??0)+' / culling '+(latest.cullingMs??0)+' / fog '+(latest.fogGeometryMs??0),
  latest.cameraFrameMs!=null?'Camera draw interval '+latest.cameraFrameMs+' ms':latest.cameraReleaseMs!=null?'Release to settled draw complete '+latest.cameraReleaseMs+' ms':'',
  'Paint ms: ground '+latest.groundMs+' / faces '+latest.facePaintMs+' / overlays '+latest.overlayMs,
  latest.paintBreakdown?Object.entries(latest.paintBreakdown).map(([name,data])=>name+' '+data.ms+' ms ('+data.calls+')').join(' · '):'',
  'Last redraw: ordering '+latest.orderMs+' ms · lighting '+latest.lightingMs+' ms · '+latest.faces+' faces',
  latest.rays+' visibility rays · '+latest.lightCandidates+' light candidates',
  latest.pieces+' terrain pieces · '+latest.lights+' active lights',
  standeeInputSamples.length?(standeeInputSamples.at(-1).confirmToPreviewDrawMs!=null
   ?'Last movement preview: '+standeeInputSamples.at(-1).confirmToPreviewDrawMs+' ms after confirm'
   :'Last accepted standee click: '+standeeInputSamples.at(-1).confirmToAcceptedMs+' ms after confirm · '+(standeeInputSamples.at(-1).pointerToAcceptedMs??'unavailable')+' ms from pointer event'):'',
  useFogRayWorker()?'Fog worker: '+fogWorkerStats.completed+'/'+fogWorkerStats.queued+' batches · '+fogWorkerStats.reused+' rays reused':' '
 ].filter(Boolean).join('\n');
}
el('performanceToggle').onclick=()=>{
 const panel=el('performancePanel');
 panel.hidden=!panel.hidden;
 el('performanceToggle').setAttribute('aria-expanded',String(!panel.hidden));
 clearInterval(performanceTimer);
 if(!panel.hidden){
  updatePerformanceReadout();performanceTimer=setInterval(updatePerformanceReadout,400);
 }
};
el('performanceReset').onclick=()=>{performanceSamples.length=0;standeeInputSamples.length=0;pendingStandeeInput=null;renderingReport=textureTestReport=pathWallBenchmarkReport=null;lastCameraDraw=cameraReleasedAt=null;el('performanceStatus').textContent='';updatePerformanceReadout()};
el('performanceCopy').onclick=async()=>{
 const output=el('performanceStatus');
 try{
  await navigator.clipboard.writeText(JSON.stringify({build:el('battlemapBuild').textContent.slice(1),samples:performanceSamples,standeeInput:standeeInputSamples,fogWorker:{enabled:useFogRayWorker(),...fogWorkerStats},benchmark:renderingReport,pathWallBenchmark:pathWallBenchmarkReport,railTravel:railTravelReport,wallBlockerComparison,textureTest:textureTestReport},null,2));
  output.textContent='Copied';
 }catch{output.textContent='Clipboard unavailable'}
};
el('performanceTest').onclick=async()=>{
 const button=el('performanceTest'),status=el('performanceStatus');
 if(button.disabled)return;
 if(drag||carry||!W||!H){status.textContent='Finish moving the current piece before running the test.';return}
 button.disabled=el('performanceTextureTest').disabled=el('performanceReset').disabled=true;
 renderingReport=null;
 const camera={angle,tilt,zoom,panX,panY,topDown};
 const scene={sceneId:currentSceneId,width:W,height:H,pixelRatio:devicePixelRatio,quality:preferences.graphicsQuality,topDown,pieces:pieces.length,standees:tokens.length};
 const token=tokens.find(t=>!standeeHidden(t)&&!standeeObscured(t)&&!t.flying&&!t.torch&&!t.carriedFixture&&
  (roomProfile?.gm!==false||ownsRoomStandee(t)));
 const cameraPhases=topDown?['Pan','Zoom']:['Orbit','Zoom'];
 const phases=[...cameraPhases,...cameraPhases.map(phase=>phase+' preview'),...(!topDown?['Orbit light preview']:[]),...(token?['Standee uncached','Standee cached']:[])];
 const results=[];
 try{
  for(const phase of phases){
   status.textContent='Testing '+phase.toLowerCase()+'…';
   const samples=[];
   const standeePhase=phase.startsWith('Standee');
   let previous;
   for(let frame=0;frame<54;frame++){
    const now=await new Promise(resolve=>requestAnimationFrame(resolve));
    if(drag||carry||document.hidden||topDown!==camera.topDown||currentSceneId!==scene.sceneId||W!==scene.width||H!==scene.height)throw Error('Test interrupted. Keep the map visible and still, then retry.');
    const wave=Math.sin(frame*2*Math.PI/48);
    ({angle,tilt,zoom,panX,panY}=camera);
    const cameraPhase=phase.split(' ')[0];
    if(cameraPhase==='Orbit')angle+=wave*.28;
    if(cameraPhase==='Pan')panX+=wave*60;
    if(cameraPhase==='Zoom')zoom*=1+wave*.15;
    const action='Test: '+phase;
    const previousGhost=ghost,previousRoute=route;
    if(standeePhase){
     carry={piece:token,dx:0,dy:0};
     ghost={...token,x:Math.max(0,Math.min(gridLimit(0)-token.size,token.x+wave*.75))};
     route={points:[basePoint(token)],end:basePoint(ghost)};
    }
    try{draw(action)}
    finally{if(standeePhase){carry=null;ghost=previousGhost;route=previousRoute}}
    const sample=performanceSamples.at(-1);
    if(frame>=6&&sample?.action===action)samples.push({...sample,frameMs:Number((now-previous).toFixed(2))});
    previous=now;
   }
   const p95=key=>samples.map(sample=>sample[key]).sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1];
   results.push({phase,geometryCacheHits:samples.filter(sample=>sample.movementCacheHit).length,paintedCacheHits:samples.filter(sample=>sample.paintedCacheHit).length,drawP95Ms:p95('drawMs'),frameP95Ms:p95('frameMs'),samples});
  }
  const {sceneId,...environment}=scene;
  renderingReport={scene:environment,results,standeeSkipped:!token};
  status.textContent=results.map(result=>result.phase+' p95 '+result.frameP95Ms+' ms/frame').join(' · ')+' · Copy log to share.';
 }catch(err){status.textContent=err.message}
 finally{
  ({angle,tilt,zoom,panX,panY}=camera);
  button.disabled=el('performanceTextureTest').disabled=el('performanceReset').disabled=false;
  draw('Test: restore');updatePerformanceReadout();
 }
};
// Non-destructive rail traversal benchmark: samples the current scene without
// changing standee positions or publishing movement to the shared room.
let railTravelReport=null,railTravelRunning=false,wallBlockerComparison=null;
const railButton=document.createElement('button');
railButton.type='button';railButton.textContent='Rail traversal test';
el('performanceTest').insertAdjacentElement('afterend',railButton);
const wallCompareButton=document.createElement('button');
wallCompareButton.type='button';wallCompareButton.textContent='Compare wall blockers';
railButton.insertAdjacentElement('afterend',wallCompareButton);
railButton.onclick=()=>runRailTraversal(false);
wallCompareButton.onclick=()=>runRailTraversal(true);
async function runRailTraversal(compare){
 const status=el('performanceStatus');
 if(railTravelRunning||drag||carry||document.hidden||!W||!H){status.textContent='Keep the map visible and finish any movement before the rail test.';return}
 const eligible=t=>t?.type==='standee'&&!standeeHidden(t)&&!standeeObscured(t)&&
  (roomProfile?.gm!==false||ownsRoomStandee(t));
 const token=compare?(eligible(selected)&&selected.torch?selected:tokens.find(t=>t.torch&&eligible(t))):tokens.find(eligible);
 if(compare&&(roomProfile?.gm!==false||!sceneWallPaths().length||!token)){
  status.textContent='Use Player view in a scene with path walls and a visible torch-bearing standee you control.';
  return;
 }
 if(!token){status.textContent='Place or select an accessible standee before testing.';return}
 const original={carry,ghost,route,angle,tilt,zoom,panX,panY,topDown,tokenX:token.x,tokenY:token.y,tokenZ:token.z,fogMemoryState,pendingFogTravel};
 const sceneId=currentSceneId,frames=compare?12:120;
 // Each mode runs once as the first pass and once as the second pass.
 const phases=compare?['Exact prisms','Hybrid blockers','Hybrid blockers','Exact prisms']:['Rail traversal'];
 const comparisons=[];
 // Fixed route and fixed observer elevation make runs comparable even if
 // the standee was moved between benchmarks. The actual position is restored.
 const margin=Math.max(1,token.size/2);
 const xmax=Math.max(margin,gridLimit(0)-margin),ymax=Math.max(margin,gridLimit(1)-margin);
 const start=compare?basePoint(token):[margin,margin,0];
 const corners=[[margin,margin],[xmax,margin],[xmax,ymax],[margin,ymax],[margin,margin]];
 const nearby=compare?[[1,0],[0,1],[-1,0],[0,-1]].map(([dx,dy])=>[
  start[0]+dx,start[1]+dy,start[2]
 ]).filter(p=>p[0]>=token.size/2&&p[0]<=gridLimit(0)-token.size/2&&
  p[1]>=token.size/2&&p[1]<=gridLimit(1)-token.size/2&&!movementSegment(start,p,token).blocked):[];
 if(compare&&!nearby.length){
  status.textContent='Move the torch-bearing standee to a spot with at least one clear adjacent square, then run the comparison.';
  return;
 }
 const nodes=compare?[start,...nearby.flatMap(p=>[p,start])]:corners.map(([x,y])=>[x,y,start[2]]);
 const lengths=nodes.slice(1).map((p,i)=>Math.hypot(p[0]-nodes[i][0],p[1]-nodes[i][1]));
 const total=lengths.reduce((a,b)=>a+b,0);
 const controls=[railButton,wallCompareButton,...['performanceTest','performanceTextureTest','performanceReset'].map(el)];
 railTravelRunning=true;
 const disabled=controls.map(button=>button.disabled);
 controls.forEach(button=>button.disabled=true);
 if(compare)wallBlockerComparison=null;
 // Isolate fog exploration from persisted player history during the benchmark.
 try{
 for(const [pass,phase] of phases.entries()){
  ({angle,tilt,zoom,panX,panY,topDown}=original);
  fogCache=null;fogSectorRayCache=null;
  fogMemoryState=original.fogMemoryState?{...original.fogMemoryState,
   seen:new Set(original.fogMemoryState.seen),shading:new Map(original.fogMemoryState.shading),dirty:false,pending:false}:null;
  pendingFogTravel=null;
  const results=[],audit={probes:0,changedHits:0,changedSightlineCutoff:0,byOpening:{}};
  for(let frame=0;frame<frames;frame++){
   const timestamp=await new Promise(resolve=>requestAnimationFrame(resolve));
   if(document.hidden||currentSceneId!==sceneId||!tokens.includes(token)||drag||carry)throw Error('Rail test interrupted by scene change or user interaction.');
   let distance=total*frame/(frames-1),segment=0;
   while(segment<lengths.length-1&&distance>lengths[segment])distance-=lengths[segment++];
   const t=lengths[segment]?Math.min(1,distance/lengths[segment]):0;
   const a=nodes[segment],b=nodes[segment+1];
   const point=a.map((v,i)=>v+(b[i]-v)*t);
   // Move the actual observer in local memory. A ghost/carry preview bypasses
   // the player visibility pipeline and therefore cannot benchmark exploration.
   token.x=point[0]-token.size/2;token.y=point[1]-token.size/2;token.z=point[2];
   carry=null;ghost=null;route=null;
   const action='Test: '+phase;
   const queuedAt=performance.now();
   const inputDelay=compare?new Promise(resolve=>setTimeout(()=>resolve(roundedMs(performance.now()-queuedAt)),0)):null;
   if(compare)({angle,tilt,zoom,panX,panY,topDown}=original);
   const probes=phase==='Hybrid blockers'?[]:null;
   wallBenchmarkBoxTests=0;
   wallBenchmarkHybrid=!!probes;
   wallBenchmarkProbes=probes;
   try{draw(action)}finally{wallBenchmarkHybrid=false;wallBenchmarkProbes=null}
   const sample=performanceSamples.at(-1),boxTests=wallBenchmarkBoxTests;
   const queuedCallbackMs=compare?await inputDelay:null;
   for(const {bounds,start,end,span} of probes??[]){
    const exact=wallPrismInterval(bounds.wallPrism,start,end);
    audit.probes++;
    const category=bounds.wallPrism.opening?.kind??'Wall';
    const group=audit.byOpening[category]??={probes:0,changedHits:0};
    group.probes++;
    if(Boolean(exact)!==Boolean(span)){audit.changedHits++;group.changedHits++}
    if((!!exact&&exact[0]<.995)!==(!!span&&span[0]<.995))audit.changedSightlineCutoff++;
   }
   if(sample?.action===action)results.push({...sample,frame,position:point,timestamp,queuedCallbackMs,boxTests});
   if(frame%4===0)status.textContent=(compare?'Pass '+(pass+1)+' of '+phases.length+' · ':'')+phase+' · '+Math.round(100*frame/(frames-1))+'%';
  }
  const ordered=results.map(s=>s.drawMs).sort((a,b)=>a-b);
  const pct=p=>ordered[Math.min(ordered.length-1,Math.ceil(ordered.length*p)-1)]??null;
  const report={sceneId,role:roomProfile?.gm===false?'player':'gm',frames:results.length,
   medianDrawMs:pct(.5),p95DrawMs:pct(.95),maxDrawMs:ordered.at(-1)??null,
   routeStart:start,routeNodes:nodes,routeDistance:total,observerSize:token.size,
   note:'Deterministic corner-to-corner route starting at map minimum at elevation zero; 120 frames. Route may cross walls. Standee and fog history restored; no room RPC.',samples:results};
  if(compare){
   const delays=results.map(s=>s.queuedCallbackMs).sort((a,b)=>a-b);
   comparisons.push({...report,phase,boxTests:results.reduce((sum,s)=>sum+s.boxTests,0),pass:pass+1,orderInPair:pass%2+1,probeAudit:audit,callbackP95Ms:delays[Math.ceil(delays.length*.95)-1],
    note:'Synthetic callback queued immediately before each draw. All passes use the same camera and one-square out-and-back steps from the torch bearer’s starting position.'});
  }else railTravelReport=report;
 }
 if(compare){
  wallBlockerComparison={sceneId,zoom:original.zoom,angle:original.angle,tilt:original.tilt,phases:comparisons};
  status.textContent=comparisons.map(p=>p.phase+' '+p.p95DrawMs+' ms p95').join(' / ')+' · Copy log to share.';
 }else status.textContent='Rail traversal complete · median '+railTravelReport.medianDrawMs+
   ' ms · p95 '+railTravelReport.p95DrawMs+' ms · Copy log to share.';
 }catch(error){status.textContent=error.message}
 finally{
  token.x=original.tokenX;token.y=original.tokenY;token.z=original.tokenZ;
  ({carry,ghost,route,angle,tilt,zoom,panX,panY,topDown,fogMemoryState,pendingFogTravel}=original);
  wallBenchmarkHybrid=false;wallBenchmarkProbes=null;
  fogCache=null;fogSectorRayCache=null;
  railTravelRunning=false;controls.forEach((button,i)=>button.disabled=disabled[i]);
  draw('Test: restore');updatePerformanceReadout();
 }
};
let textureTestEffect=null,textureTestReport=null;
el('performanceTextureTest').onclick=async()=>{
 const controls=['performanceTextureTest','performanceTest','performanceReset'].map(el);
 const status=el('performanceStatus');
 if(drag||carry||cameraDetailTimer!==null||!W||!H||document.hidden){
  status.textContent='Keep the map visible and the camera still before testing.';return;
 }
 if(preferences.graphicsQuality===3){
  status.textContent='Select a textured graphics preset before testing.';return;
 }
 const view=()=>JSON.stringify([currentSceneId,W,H,devicePixelRatio,angle,tilt,zoom,panX,panY,topDown,preferences.graphicsQuality]);
 const originalView=view();
 const phases=[['Baseline',null],['Standee filters off','standeeFilters'],['Foliage filters off','foliageFilters'],
  ['Direct terrain patterns','directPatterns'],['Bitmap terrain patterns','bitmapPatterns'],['Previous pattern renderer','legacyPatterns'],['Terrain patterns off','patterns'],['Volume grids off','grids'],['Baseline repeat',null]];
 const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const results=[];
 textureTestReport=null;
 controls.forEach(control=>control.disabled=true);
 try{
  for(const [label,effect] of phases){
   status.textContent='Testing '+label.toLowerCase()+'…';
   const samples=[];
   for(let run=0;run<4;run++){
    await nextFrame();
    if(document.hidden||drag||carry||cameraDetailTimer!==null||view()!==originalView)throw Error('Test interrupted. Keep the camera and map still.');
    const start=performance.now();
    textureTestEffect=effect;
    try{draw('Test: Texture '+label)}finally{textureTestEffect=null}
    const sample=performanceSamples.at(-1);
    await nextFrame();
    if(run)samples.push({...sample,nextFrameMs:roundedMs(performance.now()-start)});
   }
   const median=key=>samples.map(sample=>sample[key]).sort((a,b)=>a-b)[1];
   results.push({label,drawMedianMs:median('drawMs'),nextFrameMedianMs:median('nextFrameMs'),samples});
  }
  let paintedFrameCache=null;
  if(topDown){
   status.textContent='Testing painted frame reuse…';
   const checkView=()=>{
    if(document.hidden||drag||carry||cameraDetailTimer!==null||view()!==originalView)
     throw Error('Test interrupted. Keep the camera and map still.');
   };
   await nextFrame();
   checkView();
   const start=performance.now();
   draw('Test: Painted frame cache build');
   const source=performanceSamples.at(-1);
   const snapshot=document.createElement('canvas');
   snapshot.width=canvas.width;snapshot.height=canvas.height;
   snapshot.getContext('2d').drawImage(canvas,0,0);
   const buildMs=roundedMs(performance.now()-start);
   await nextFrame();
   const cold={drawMs:source.drawMs,buildMs,nextFrameMs:roundedMs(performance.now()-start)};
   const samples=[];
   for(let run=0;run<4;run++){
    await nextFrame();
    checkView();
    const start=performance.now();
    ctx.save();
    try{
     ctx.setTransform(1,0,0,1,0,0);
     ctx.globalCompositeOperation='copy';
     ctx.drawImage(snapshot,0,0);
    }finally{ctx.restore()}
    const drawMs=roundedMs(performance.now()-start);
    await nextFrame();
    if(run)samples.push({drawMs,nextFrameMs:roundedMs(performance.now()-start)});
   }
   const median=key=>samples.map(sample=>sample[key]).sort((a,b)=>a-b)[1];
   paintedFrameCache={cold,drawMedianMs:median('drawMs'),nextFrameMedianMs:median('nextFrameMs'),samples};
  }
  textureTestReport={results,paintedFrameCache};
  status.textContent=results.map(result=>result.label+' '+result.drawMedianMs+' ms').join(' · ')+(paintedFrameCache?' · Painted frame cache build '+paintedFrameCache.cold.nextFrameMs+' ms/frame · reuse '+paintedFrameCache.nextFrameMedianMs+' ms/frame':'')+' · Copy log to share.';
 }catch(error){status.textContent=error.message}
 finally{
  controls.forEach(control=>control.disabled=false);
  draw('Test: Texture restore');
 }
};
let lightOrbitActive=false;
let cameraDetailTimer=null,cameraPanPreview=false,paintedCamera=null,zoomTransformActive=false,zoomOffset=[0,0],zoomBackgroundBefore='';
function updateGmLightingControls(){const panel=el("gmLightingControls");panel.hidden=!playing||roomProfile?.gm===false;const a=areas.find(a=>a.shape==="appearance")?.appearance?.ambient;const level=a?.enabled?Math.round((a.level??5)*20):100;if(document.activeElement!==el("gmLightLevel"))el("gmLightLevel").value=level;if(document.activeElement!==el("gmLightColor"))el("gmLightColor").value=a?.color||"#fff4da";el("gmLightReadout").textContent=level+"%";el("gmIgnoreLight").checked=gmIgnoreLighting;const observer=gmVisionObserver();el("gmVisionReadout").textContent=observer?"Viewing as: "+(observer.displayName||observer.name):gmIgnoreLighting?"DM view — unlit override":"Scene lighting preview";}
let gmAmbientPending=null;
function setGmAmbient(){if(!playing||roomProfile?.gm===false)return;let area=areas.find(a=>a.shape==="appearance");if(!area){area={shape:"appearance",origin:[0,0,0],angle:0,size:1,appearance:{}};areas.push(area)}area.appearance??={};const color=el("gmLightColor").value,rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255),[r,g,b]=rgb,max=Math.max(...rgb),min=Math.min(...rgb),d=max-min;let hue=d?(max===r?(g-b)/d:max===g?2+(b-r)/d:4+(r-g)/d)*60:0;area.appearance.ambient={enabled:true,level:Number(el("gmLightLevel").value)/20,color,hue:(hue+360)%360,saturation:d?100*d/(1-Math.abs(max+min-1)):0};gmAmbientPending=structuredClone(area.appearance.ambient);draw("GM lighting");scheduleRoomPatch(40);queueRecovery();}
function finishGmAmbient(){if(!roomProfile?.gm)return;if(!roomDraftAttached||!roomBaseline){message("Lighting is local only: activate or test this scene before sharing changes.");return}clearTimeout(roomPatchTimer);void flushRoomPatch();}
el("gmLightLevel").onchange=finishGmAmbient;el("gmLightColor").onchange=finishGmAmbient;
el("gmLightLevel").oninput=setGmAmbient;el("gmLightColor").oninput=setGmAmbient;el("gmIgnoreLight").onchange=()=>{gmIgnoreLighting=el("gmIgnoreLight").checked;gmVisionStandee=null;draw("GM lighting override")};
let loadedHomeScene=null;
let windowPreview=null;
let panSettleTimer=null;
function cancelPanSettle(){
 clearTimeout(panSettleTimer);
 panSettleTimer=null;
}
// v1.488: Prepare reusable static wall topology after a scene becomes active.
// A deferred task keeps the first scene paint responsive. The topology cache
// itself is keyed by authored wall geometry and invalidates on wall edits.
let scenePreparation={scene:null,scheduled:false,elapsedMs:0,regions:0,segments:0};
function scheduleScenePreparation(){
 const scene=currentSceneId;
 if(!scene||scenePreparation.scene===scene||scenePreparation.scheduled)return;
 scenePreparation.scheduled=true;
 setTimeout(()=>{
  scenePreparation.scheduled=false;
  if(currentSceneId!==scene)return;
  const started=performance.now();
  const topology=wallVisibilityTopology();
  scenePreparation={scene,scheduled:false,elapsedMs:roundedMs(performance.now()-started),
   regions:topology?.regions??0,segments:topology?.segments??0};
  console.info('Battlemap scene geometry prepared',scenePreparation);
 },0);
}
function battlefieldFadeGeometry(){
 return JSON.stringify(faces.filter(f=>!f.preview&&(!(f.standee||f.shadow)||!ownsRoomStandee(f.p)))
  .map(f=>[f.projected,f.rememberedFog,f.perimeterOnly,f.p?.roomId]));
}
function capturePreviousBattlefield(){
 if(!playerStandeeFrame||!playerStandeeFrame.view.every((part,i)=>Object.is(part,standeeLayerViewKey()[i])))return null;
 const image=document.createElement('canvas');
 image.width=canvas.width;image.height=canvas.height;
 image.getContext('2d').drawImage(canvas,0,0);
 const outgoing=el('battlefieldFade');
 if(outgoing){
  const brush=image.getContext('2d');
  brush.globalAlpha=Number(getComputedStyle(outgoing).opacity);
  brush.drawImage(outgoing,0,0);
  brush.globalAlpha=1;
 }
 return {image,geometry:battlefieldFadeGeometry()};
}
function fadePreviousBattlefield(previous){
 const {image,geometry}=previous;
 if(!playerStandeeFrame||image.width!==canvas.width||image.height!==canvas.height||geometry!==battlefieldFadeGeometry())return;
 image.id='battlefieldFade';
 image.setAttribute('aria-hidden','true');
 image.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:0;background:transparent;border:0';
 el('movingStandeeOverlay').before(image);
 if(typeof image.animate!=='function'||matchMedia('(prefers-reduced-motion: reduce)').matches){image.remove();return}
 const fade=image.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-out'});
 fade.onfinish=()=>image.remove();
}
function draw(action,reusePan=false){
 const webglUnavailableReason=studioWebGLUnavailableReason();
 const webglAvailable=!webglUnavailableReason;
 const webgl=studioWebGLEnabled&&webglAvailable;
 const toggle=el('studioWebGLToggle');
 toggle.textContent=webgl?'Renderer: WebGL':'Renderer: Standard';
 toggle.title=webglUnavailableReason||'Switch between the standard and WebGL renderers';
 toggle.setAttribute('aria-pressed',String(webgl));
 if(!webgl){
  studioWebGL?.hide();
  studioWebGLFrame=null;
  canvas.classList.remove('studioWebGLActive');
 }
 if(!pathWallBenchmarkDrawing)scheduleScenePreparation();
 cancelPanSettle();
 cancelMovementPaint();
 const homeScene=JSON.stringify([currentSceneId,roomProfile?.name]);
 if(W&&H&&loadedHomeScene!==homeScene){loadedHomeScene=homeScene;applyHomeView(chosenSessionView()||chosenHomeView())}
 if(!pathWallBenchmarkDrawing)scheduleSessionViewSave()
 if(action!=='Standee movement'){
  updateCameraCompass();
  el('playerShowAllies').hidden=!(playing&&roomProfile?.gm===false);
  el('sceneCameraSettings').hidden=roomProfile?.gm===false;
  updateGmLightingControls();
 }
 const panningHandles=action==='Camera pan'||!!drag?.pan;
 const handleLayer=el('visionMarkers');
 if(panningHandles&&handleLayer)handleLayer.style.visibility='hidden';
 // Provisional moves stay lightweight until accepted or canceled, including while paused.
 const movementPreview=!!carry;
 const snapshotZoom=action==='Camera zoom'||action==='Test: Zoom preview';
 const snapshotPan=action==='Camera pan'&&!!drag?.pan;
 const cameraMoving=action==='Camera rotation'||action==='Camera pan'||action==='Camera zoom';
 if(cameraMoving){
  lightOrbitActive=action==='Camera rotation';
  cameraPanPreview=action==='Camera pan';
  clearTimeout(cameraDetailTimer);
  // A fixed-angle pan translates the existing bitmap and settles on pointer release.
  cameraDetailTimer=snapshotPan&&!movementPreview?null:setTimeout(()=>{cameraDetailTimer=null;lightOrbitActive=false;cameraPanPreview=false;draw('Camera settled')},120);
 }
 const cameraPreview=cameraDetailTimer!==null||/^Test: (Orbit(?: light)?|Pan|Zoom) preview$/.test(action);
 const lightOrbit=!topDown&&(action==='Test: Orbit light preview'||cameraDetailTimer!==null&&lightOrbitActive);
 const fixedStandeeMove=movementPreview&&!cameraPreview&&carry.piece?.type==='standee'&&!carry.light&&!carry.arcaneEye;
 const simplified=movementPreview&&!fixedStandeeMove||!topDown&&(cameraPreview||action==='Test: Orbit'||action==='Test: Zoom');
 const start=el('performancePanel').hidden&&!action?.startsWith?.('Test: ')?null:performance.now();
 const workerCounts=start!==null?[fogWorkerStats.reused,fogWorkerStats.lightRaysReused]:null;
 const dragFrame=cameraMoving&&(drag?.orbit||drag?.pan)&&start!==null;
 if(start!==null)performanceDraw={rays:0,lightCandidates:0,orderMs:0,lightingMs:0,geometryMs:0,paintMs:0,groundMs:0,facePaintMs:0,overlayMs:0,action:typeof action==='string'?action:carry?'Standee preview':drag?.orbit?'Camera rotation':drag?.pan?'Camera pan':drag?.piece||drag?.members?'Build movement':'Other redraw'};
 try{
  if(webgl){
   if(performanceDraw)performanceDraw.renderer='WebGL trial';
   try{
    prepareStudioWebGL();
    if(zoomTransformActive){
     canvas.style.transform='';
     el('movingStandeeOverlay').style.transform='';
     el('routeOverlay').style.transform='';
     canvas.parentElement.style.background=zoomBackgroundBefore;
     zoomTransformActive=false;
    }
    clearPanPaint();
    el('battlefieldFade')?.remove();
    el('movingStandeeOverlay').hidden=true;
    const key=studioWebGLKey(), frame=studioWebGLFrame;
    const reuse=frame&&studioWebGLCoverageContains(frame.coverage,studioWebGLView())&&frame.key.every((value,i)=>Object.is(value,key[i]))&&
     (studioWebGLCameraAction.test(action)||!!carry&&carry.piece?.type==='standee'&&!carry.light&&!carry.arcaneEye);
    if(performanceDraw)performanceDraw.webGLTerrainReused=!!reuse;
    if(reuse){
     const {width,height}=canvas.getBoundingClientRect();
     if(!width||!height)return;
     W=width;H=height;S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;C=Math.cos(angle);D=Math.sin(angle);
     keepBattlefieldVisible();
     const ratio=battlefieldPixelRatio(preferences.graphicsQuality,false);
     if(canvas.width!==Math.round(W*ratio))canvas.width=Math.round(W*ratio);
     if(canvas.height!==Math.round(H*ratio))canvas.height=Math.round(H*ratio);
     drawStudioWebGLFrame(frame,ratio,carry&&ghost?ghost:null);
    }else{
     studioWebGLCapture=true;
     studioWebGLBoundedCapture=mapFogEnabled()&&action?.startsWith?.('Confirmed move');
     lightingFrame=timeLighting(startLightingFrame);
     drawBattlefield(false,action,false,false);
    }
    paintedCamera={angle,tilt,topDown,zoom,panX,panY,width:canvas.clientWidth,height:canvas.clientHeight,preview:false};
    if(handleLayer)handleLayer.style.visibility='';
   }catch(error){
    console.error('Battlemap WebGL trial failed:',error);
    disableStudioWebGL('WebGL trial failed. Restored the standard view.');
    studioWebGLCapture=false;
    studioWebGLBoundedCapture=false;
    draw('WebGL fallback');
    return;
   }finally{studioWebGLCapture=false;studioWebGLBoundedCapture=false}
  }else{
  const snapshot=paintedCamera;
  const useSnapshot=(snapshotZoom||snapshotPan)&&snapshot&&snapshot.angle===angle&&snapshot.tilt===tilt&&snapshot.topDown===topDown&&
   canvas.clientWidth===snapshot.width&&canvas.clientHeight===snapshot.height&&(!drag||snapshotPan)&&!carry;
  if((action==='Standee movement'||(!action&&carry?.piece?.type==='standee'&&!carry.light&&!carry.arcaneEye))&&canReuseStandeeLayer()){
   paintMovingStandeeLayer(movingStandeeLayer);
   drawRoute();positionMoveActions();drawStandeeNames();
   if(performanceDraw)performanceDraw.standeeLayerOnly=true;
  }else if(fixedStandeeMove&&roomProfile?.gm===false&&ghost&&paintedCamera&&
   carriedMembers().length===1&&(action==='Standee movement'||!action)&&paintPlayerStandees(ghost)){
   // Reuse the visibility-checked frame only if the overlay was drawn.
   movingStandeeLayer=null;
   drawRoute();positionMoveActions();drawStandeeNames();
   if(performanceDraw)performanceDraw.movementRouteOnly=true;
  }else{
   movingStandeeLayer=null;
   el('movingStandeeOverlay').hidden=true;
  if(useSnapshot){
   el('battlefieldFade')?.remove();
   movementRenderCache=null;
   S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;
   keepBattlefieldVisible();
   const scale=zoom/snapshot.zoom;
   const x=W/2+panX-(W/2+snapshot.panX)*scale;
   const y=H*.55+panY-(H*.55+snapshot.panY)*scale;
   if(!zoomTransformActive){
    zoomBackgroundBefore=canvas.parentElement.style.background;
    const appearance=areas.find(area=>area.shape==='appearance')?.appearance;
    const outside=/^#[\da-f]{6}$/i.test(appearance?.outsideColor||'')?appearance.outsideColor:null;
    const sky=!topDown&&appearance?.backdrop?sceneSkyColors(appearance)[0]:null;
    if(sky)canvas.parentElement.style.background='linear-gradient('+sky+', '+(outside||'#d8c8a8')+')';
    else if(outside)canvas.parentElement.style.background=outside;
   }
   showRecentPanPaint(snapshot,snapshotPan&&scale===1);
   canvas.style.transformOrigin='0 0';
   canvas.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')';
   const standeeLayer=el('movingStandeeOverlay');
   standeeLayer.style.transformOrigin='0 0';standeeLayer.style.transform=canvas.style.transform;
   if(playerStandeeFrame)standeeLayer.hidden=false;
   const routeLayer=el('routeOverlay');
   routeLayer.style.transformOrigin='0 0';
   routeLayer.style.transform=canvas.style.transform;
   drawStandeeNames([x,y],scale);
   zoomOffset=[x,y];
   zoomTransformActive=true;
   drawBoardPings();
  }else{
   if(recentPanPaint)recentPanPaint.bitmap.hidden=true;
   if(zoomTransformActive){
    canvas.style.transform='';
    el('movingStandeeOverlay').style.transform='';
    el('routeOverlay').style.transform='';
    canvas.parentElement.style.background=zoomBackgroundBefore;
    zoomTransformActive=false;
   }
   const savedPieces=pieces,savedAreas=areas;
   const preview=windowPreview&&areas.includes(windowPreview.source)?windowPreview:null;
   try{
    if(preview){
     pieces=preview.terrain;
     areas=areas.map(area=>area===preview.source?preview.window:area);
    }
    lightingFrame=timeLighting(startLightingFrame);
    const previous=action?.startsWith?.('Confirmed move · ')&&!cameraPreview&&!zoomTransformActive
     ?capturePreviousBattlefield():null;
    el('battlefieldFade')?.remove();
    drawBattlefield(simplified,action,cameraPreview,lightOrbit,reusePan?paintedCamera:null);
    if(previous)fadePreviousBattlefield(previous);
   }finally{
    pieces=savedPieces;areas=savedAreas;
   }
   if(!panningHandles&&handleLayer)handleLayer.style.visibility='';
   paintedCamera={angle,tilt,topDown,zoom,panX,panY,width:canvas.clientWidth,height:canvas.clientHeight,preview:cameraPreview};
  }
  }
  if(performanceDraw){performanceDraw.zoomSnapshot=!!useSnapshot&&snapshotZoom;performanceDraw.panSnapshot=!!useSnapshot&&snapshotPan;}
  }
  if(performanceDraw){
   if(dragFrame){
    if(lastCameraDraw?.drag===drag)performanceDraw.cameraFrameMs=roundedMs(start-lastCameraDraw.start);
    lastCameraDraw={drag,start};
   }
   if(action==='Camera settled'&&cameraReleasedAt!==null){
    performanceDraw.cameraReleaseMs=roundedMs(performance.now()-cameraReleasedAt);
   }
   performanceDraw.fogWorkerSightHits=fogWorkerStats.reused-workerCounts[0];
   performanceDraw.fogWorkerLightHits=fogWorkerStats.lightRaysReused-workerCounts[1];
   performanceSamples.push({...performanceDraw,lightingMs:Number(performanceDraw.lightingMs.toFixed(2)),at:Date.now(),drawMs:Number((performance.now()-start).toFixed(2)),
    detail:webgl?'WebGL trial':lightOrbit?'Light orbit preview':cameraPreview?'Camera preview':simplified?'Reduced':'Full',renderScale:battlefieldPixelRatio(preferences.graphicsQuality,!webgl&&cameraPreview),zoom,view:topDown?'Top down':'3D',role:roomProfile?.gm===false?'Player':roomProfile?.gm?'GM':'Local',
    mode:playing?'Play':'Build',session:roomState.active?(roomState.paused?'Paused session':'Live session'):'No active session',
    faces:faces.length,pieces:pieces.length,lights:(lightingFrame?.lights??activeLights()).length});
   if(performanceSamples.length>300)performanceSamples.shift();
  }
 }finally{
  if(action==='Camera settled')lastCameraDraw=cameraReleasedAt=null;
  lightingFrame=null;performanceDraw=null;
  if(!pathWallBenchmarkDrawing&&progressiveLight&&!action?.startsWith?.('Test: '))scheduleProgressiveLightSlice();
  if(!pathWallBenchmarkDrawing&&!action?.startsWith?.('Test: '))sendRepaintRays();
 }
}
let movementRenderCache=null;
let focusCutaway=null;
let playerCameraCutaway=null;
function nearbyPlayerStair(stair,footprint){
 const [w,d,h]=dimensions(stair),[x,y,z]=basePoint(footprint);
 const dx=Math.max(0,stair.x-x,x-stair.x-w),dy=Math.max(0,stair.y-y,y-stair.y-d);
 return Math.hypot(dx,dy)<=2+footprint.size/2&&Math.abs(stair.z+h-z)<=1.35;
}
function nearbyStairCells(stair,footprint){
 const [w,d,h]=dimensions(stair),[x,y]=basePoint(footprint);
 const radius=2+footprint.size/2;
 const z=stair.z+h;
 const cells=[];
 for(let i=Math.max(0,Math.floor(x-radius-stair.x));i<w&&stair.x+i<=x+radius;i++){
  const left=stair.x+i,right=stair.x+Math.min(i+1,w);
  const dx=Math.max(0,left-x,x-right);
  for(let j=Math.max(0,Math.floor(y-radius-stair.y));j<d&&stair.y+j<=y+radius;j++){
   const near=stair.y+j,far=stair.y+Math.min(j+1,d);
   const dy=Math.max(0,near-y,y-far);
   if(Math.hypot(dx,dy)>radius)continue;
   if(playerFogEnabled()&&![.07,.3].some(height=>fogPointVisible([(left+right)/2,(near+far)/2,z+height])))continue;
   cells.push([[left,near,z],[right,near,z],[right,far,z],[left,far,z]]);
  }
 }
 return cells;
}
function paintNearbyStairCells(face,cells){
 if(!cells?.length)return;
 ctx.save();ctx.globalAlpha=1;ctx.lineWidth=2;
 ctx.beginPath();
 face.projected.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.clip();
 for(const cell of cells)polygon(cell.map(vertex=>point(...vertex)),'#ffd17828','#f1be69');
 ctx.restore();
}
function playerCameraTerrainMode(piece,rays){
 if(isFurniture(piece)||piece.stairTread||(!movementTerrainBlock(piece)&&piece.type!=='ceilingArt'))return null;
 const [w,d,h]=dimensions(piece),{x,y,z}=piece;
 const bounds=[[x,x+w],[y,y+d],[z,z+Math.max(h,.025)]];
 let fade=false;
 for(const {start,end,floor} of rays){
  if(!movementInterval(start,end,bounds)||z+h<=floor+.025)continue;
  if(z>floor+.05&&(piece.type==='ceilingArt'||h<=.65||Math.min(w,d)>=1.5))return 'hide';
  if(z+h>floor+.6)fade=true;
 }
 return fade?'fade':null;
}
function playerCameraCutawayToken(){
 if(!playing||roomProfile?.gm!==false)return null;
 const owned=tokens.filter(token=>ownsRoomStandee(token)&&!token.incognito&&!token.conditions?.includes('dead'));
 return (owned.includes(carry?.piece)&&carry.piece)||(owned.includes(selected)&&selected)||
  owned.find(actor=>actor.roomId===roomProfile.characterKey)||owned[0]||null;
}
function buildPlayerCameraCutaway(token=playerCameraCutawayToken()){
 if(!token)return null;
 // Keep walls and stair visibility anchored to the confirmed position while dragging.
 const direction=topDown?[0,0,1]:[D*Math.cos(tilt),C*Math.cos(tilt),Math.sin(tilt)],rays=[];
 const aim=(x,y,z,floor)=>rays.push({start:[x,y,z],end:[x,y,z].map((value,i)=>value+direction[i]*200),floor});
 const [x,y,z]=basePoint(token),height=standeeArtHeight(token)/Math.max(S,1);
 for(const fraction of [.15,.55,.9])aim(x,y,z+Math.max(.04,height*fraction),z);
 const stairs=new Set(),stairCells=new Map();
 for(const stair of pieces){
  if(!stair.stairTread||!nearbyPlayerStair(stair,token))continue;
  const z=stair.z+dimensions(stair)[2];
  const cells=nearbyStairCells(stair,token);
  if(!cells.length)continue;
  stairs.add(stair);stairCells.set(stair,cells);
  for(const [first,,opposite] of cells)aim((first[0]+opposite[0])/2,(first[1]+opposite[1])/2,z+.035,z);
 }
 const cutawayWallIds=new Set();
 // Wall-trace extrusion is made of many prisms, each with its own face owner.
 // A ray may intersect just one prism of a curved wall. Fade every prism of
 // that same traced wall, rather than leaving adjacent curved sections opaque.
 // Camera cutaway affects painting only; vision and collision remain intact.
 if(!topDown){
  for(const solid of pathWallSolids()){
   if(solid.opening||!solid.wall?.opacity)continue;
   if(rays.some(({start,end})=>wallPrismInterval(solid,start,end)))
    cutawayWallIds.add(solid.wall.id);
  }
 }
 const terrain=new Map();
 for(const piece of pieces){
  const mode=playerCameraTerrainMode(piece,rays);
  if(mode)terrain.set(piece,mode);
 }
 return {terrain,stairs,stairCells,token,cutawayWallIds};
}
function setFocusCutaway(token){
 focusCutaway=null;
 if(!token||topDown)return;
 const base=basePoint(token);
 const eye=[D*Math.cos(tilt),C*Math.cos(tilt),Math.sin(tilt)];
 const rays=[.25,.55,.85].map(fraction=>{
  const aim=[base[0],base[1],base[2]+standeeArtHeight(token)*fraction/Math.max(S,1)];
  return [aim,aim.map((v,i)=>v+eye[i]*200)];
 });
 const intersects=bounds=>rays.some(([aim,end])=>movementInterval(aim,end,bounds));
 const terrain=new Map(),openings=new Set();
 for(const piece of pieces){
  if(isFurniture(piece)||!movementTerrainBlock(piece)&&piece.type!=='ceilingArt')continue;
  const [w,d,h]=dimensions(piece),{x,y,z}=piece;
  if(!intersects([[x,x+w],[y,y+d],[z,z+Math.max(h,.025)]]))continue;
  terrain.set(piece,z>base[2]&&(h<=.5||piece.type==='ceilingArt')?'hide':'fade');
 }
 for(const opening of areas){
  if(opening.shape!=='opening')continue;
  const [x,y,z]=opening.origin,half=(opening.doorWidth??1)/2;
  const parallel=opening.angle===0?x:y,normal=opening.angle===0?y:x;
  const span=[parallel+.5-half,parallel+.5+half],cross=[normal-.05,normal+1.05];
  const height=opening.kind==='Door'?doorLeafHeight(opening):windowTop(opening);
  if(intersects([...(opening.angle===0?[span,cross]:[cross,span]),[z,z+height]]))openings.add(opening);
 }
 focusCutaway={token,terrain,openings};
 movementRenderCache=null;
}
function paintFocusCutaway(face){
 const focus=!topDown&&focusCutaway&&tokens.includes(focusCutaway.token)?focusCutaway:null;
 const mode=playerCameraCutaway?.terrain.get(face.p)||focus?.terrain.get(face.p);
 const openings=focus?.openings;
 if(!mode&&!openings?.has(face.p))return false;
 if(face.doorFace&&openings?.has(face.p)){
  // Fog filtering has already determined whether this opening may be shown.
  if(!face.fogRemembered){
   ctx.save();
   ctx.lineWidth=1.25;
   if(face.p.open)ctx.setLineDash([5,4]);
   polygon(face.projected,'#0000','#e6d6ae');
   ctx.restore();
  }
  return true;
 }
 if(!mode)return false;
 // A standee-driven fade applies to the wall face, not its top cap.
 if(mode==='fade'&&face.z!==null&&openingWall(face.p))return false;
 if(mode==='fade'){
  ctx.save();ctx.globalAlpha*=.2;
  polygon(face.projected,face.fogRemembered?'#777':face.fill,'#887860');
  ctx.restore();
 }
 return true;
}
function battlefieldPixelRatio(quality,cameraPreview){
 // Preserve standee art in Sharp while retaining the simplified terrain pass.
 const lowResolution=cameraPreview&&!(quality===2&&carry);
 return Math.min(devicePixelRatio||1,lowResolution?.5:quality===2?2:quality===1?1:quality===3?.65:.8);
}
function panOverlap(width,height,dx,dy,gutter){
 if(!dx&&!dy)return null;
 const left=Math.max(dx,0)+gutter,top=Math.max(dy,0)+gutter;
 const right=Math.min(width,width+dx)-gutter,bottom=Math.min(height,height+dy)-gutter;
 return (right-left)>0&&(bottom-top)>0&&(right-left)*(bottom-top)>=width*height/3?
  {left,top,right,bottom}:null;
}
// One additional painted viewport extends the cache into recently visited space.
let recentPanPaint=null;
function clearPanPaint(){
 recentPanPaint?.bitmap.remove();
 recentPanPaint=null;
}
function showRecentPanPaint(snapshot,enabled){
 if(!recentPanPaint)return;
 const {bitmap,panX:oldX,panY:oldY}=recentPanPaint;
 bitmap.hidden=!enabled;
 if(!enabled)return;
 const dx=oldX-snapshot.panX,dy=oldY-snapshot.panY;
 const l=Math.max(0,dx),r=Math.min(W,W+dx),t=Math.max(0,dy),b=Math.min(H,H+dy);
 bitmap.style.clipPath=l<r&&t<b?
  'polygon(evenodd,0 0,100% 0,100% 100%,0 100%,0 0,'+
  l+'px '+t+'px,'+r+'px '+t+'px,'+r+'px '+b+'px,'+l+'px '+b+'px,'+l+'px '+t+'px)':'';
 bitmap.style.transform='translate('+(panX-oldX)+'px,'+(panY-oldY)+'px)';
}
function reusablePanArea(width,height,dx,dy,gutter){
 if(!dx&&!dy)return {left:0,top:0,right:width,bottom:height};
 return panOverlap(width,height,dx,dy,gutter);
}
function panAreaSize(area){return area?(area.right-area.left)*(area.bottom-area.top):0}
function choosePanPaint(width,height,ratio,panX,panY,frame,recent){
 const gutter=Math.ceil(56*ratio);
 const candidate=(source,position)=>{
  const dx=Math.round((panX-position.panX)*ratio),dy=Math.round((panY-position.panY)*ratio);
  return {source,position,dx,dy,overlap:reusablePanArea(width,height,dx,dy,gutter)};
 };
 const current=candidate(null,frame);
 if(!recent)return current;
 const previous=candidate(recent.bitmap,recent);
 return panAreaSize(previous.overlap)>panAreaSize(current.overlap)?previous:current;
}
function rememberPanPaint(frame){
 // Limit the extra Sharp-mode canvas to 48 MB of RGBA pixels.
 if(canvas.width*canvas.height>12000000){clearPanPaint();return}
 const bitmap=recentPanPaint?.bitmap??document.createElement('canvas');
 if(!bitmap.isConnected){
  bitmap.hidden=true;
  bitmap.setAttribute('aria-hidden','true');
  bitmap.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  canvas.before(bitmap);
 }
 if(bitmap.width!==canvas.width)bitmap.width=canvas.width;
 if(bitmap.height!==canvas.height)bitmap.height=canvas.height;
 const paint=bitmap.getContext('2d');
 paint.globalCompositeOperation='copy';
 paint.drawImage(canvas,0,0);
 recentPanPaint={bitmap,panX:frame.panX,panY:frame.panY};
}
function reusePaintedPan(frame,ratio){
 // A top-down player frame paints owned standees on a separate canvas.
 // The terrain bitmap alone cannot supply those pixels after releasing pan.
 if(topDown&&roomProfile?.gm===false){
  clearPanPaint();
  return null;
 }
 if(!frame||frame.preview||frame.width!==W||frame.height!==H||frame.angle!==angle||frame.tilt!==tilt||
  frame.zoom!==zoom||frame.topDown!==topDown||!playing||carry||
  preferences.graphicsQuality!==2||ghost||floorEdit||cutter||windowPreview||preferencePreview||pingFrame!==null||
  areas.some(a=>a.shape==='appearance'&&(a.appearance?.backdrop||a.appearance?.overlay))){
  clearPanPaint();return null;
 }
 const {source,position,dx,dy,overlap}=choosePanPaint(canvas.width,canvas.height,ratio,panX,panY,frame,recentPanPaint);
 if(!source&&(dx||dy))rememberPanPaint(frame);
 if(!overlap)return null;
 if(performanceDraw)performanceDraw.panBufferHit=!!source;
 // Use exact pixel translations so repeated pans do not resample the retained image.
 panX=position.panX+dx/ratio;panY=position.panY+dy/ratio;
 const {left,top,right,bottom}=overlap,w=right-left,h=bottom-top;
 ctx.save();
 ctx.setTransform(1,0,0,1,0,0);
 ctx.beginPath();ctx.rect(left,top,w,h);ctx.clip();
 ctx.globalCompositeOperation='copy';
 ctx.drawImage(source??canvas,left-dx,top-dy,w,h,left,top,w,h);
 ctx.restore();
 ctx.save();ctx.setTransform(1,0,0,1,0,0);
 ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);ctx.rect(left,top,w,h);ctx.clip('evenodd');
 return {left:left/ratio,top:top/ratio,right:right/ratio,bottom:bottom/ratio,
  full:left===0&&top===0&&right===canvas.width&&bottom===canvas.height};
}
function movementCutawayKey(cutaway,terrain){
 if(!cutaway)return '';
 return JSON.stringify([
  [...cutaway.terrain].map(([piece,mode])=>[terrain.indexOf(piece),mode]),
  [...cutaway.stairCells].map(([piece,cells])=>[terrain.indexOf(piece),cells])
 ]);
}
function isMovingStandeePreview(token){
 return !!token&&(token===ghost&&carry?.piece?.type==='standee'&&!carry.light&&!carry.arcaneEye||
  playerStandeePreview&&playerStandeePreview.scene===currentSceneId&&token===playerStandeePreview.token);
}
function paintBattlefieldStandee(f,showLighting,lightBlockers){
 if(!standeeObscured(f.p)&&(f.p.incognito||f.p.conditions?.includes('invisible')))ctx.globalAlpha*=.48;
  if(f.shadow){paintStandeeShadow(f);return}
  if(f.standee){
   const target=basePoint(f.p);
   if(textureTestEffect!=='standeeFilters'&&roomProfile?.gm===false&&showLighting&&!ambientAt(target,lightBlockers)&&!lightAt(target,lightBlockers)){
    // Keep the AoE indicator colored when visible standees are drawn in darkvision.
    const highlighted=!f.dead&&!standeeObscured(f.p)&&standeeIsTargeted(f.p);
    ctx.filter=highlighted?'brightness(.75)':'grayscale(1) brightness(.75)';
   }
   if(dimensionDoorHidden.has(f.p.roomId)&&!isMovingStandeePreview(f.p)){ctx.filter='none';return}
   paintDamageFlash(f.p);
   if(f.flat)paintFlatStandee(f);else if(f.dead&&!standeeObscured(f.p))paintDeadStandee(f);else{paintStandee(f);drawFacingArrow(f)}ctx.filter='none';return}
}
let movingStandeeLayer=null,playerStandeePreview=null,playerStandeeFrame=null;
function projectedBounds(points){
 const x=points.map(p=>p[0]),y=points.map(p=>p[1]);
 return [Math.min(...x),Math.min(...y),Math.max(...x),Math.max(...y)];
}
function paintPlayerStandees(destination=null){
 if(studioWebGLEnabled&&studioWebGLFrame&&canvas.classList.contains('studioWebGLActive')){
  const view=studioWebGLView();
  const sameView=paintedCamera&&!paintedCamera.preview&&
   Object.keys(view).every(key=>paintedCamera[key]===view[key]);
  drawStudioWebGLFrame(studioWebGLFrame,canvas.width/W,destination,sameView);
  return true;
 }
 const frame=playerStandeeFrame,view=standeeLayerViewKey();
 if(!frame||!frame.view.every((value,index)=>Object.is(value,view[index])))return;
 const layer=el('movingStandeeOverlay');
 if(layer.width!==canvas.width)layer.width=canvas.width;
 if(layer.height!==canvas.height)layer.height=canvas.height;
 const main=ctx,savedFaces=faces;
 const preview=destination?{token:destination}:playerStandeePreview?.scene===currentSceneId?playerStandeePreview:null;
 const focal=playerCameraCutawayToken();
 const isFocal=token=>!!focal&&(token===focal||!!focal.roomId&&token.roomId===focal.roomId||
  token===destination&&carry?.piece===focal);
 try{
  ctx=layer.getContext('2d');
  ctx.setTransform(layer.width/W,0,0,layer.height/H,0,0);
  ctx.clearRect(0,0,W,H);
  let moved=[];
  if(preview){faces=[];drawStandee(preview.token,destination===ghost);moved=faces}
  const paint=(face,index)=>{
   ctx.save();
   const cover=topDown||isFocal(face.p)||isMovingStandeePreview(face.p)?[]:frame.cover;
   const standeeBounds=projectedBounds(face.projected);
   for(const [order,terrain,box] of cover){
    if(index==null?terrain.depth<=face.depth:order<=index)continue;
    if(box[2]<=standeeBounds[0]||box[0]>=standeeBounds[2]||box[3]<=standeeBounds[1]||box[1]>=standeeBounds[3])continue;
    ctx.beginPath();ctx.rect(0,0,W,H);
    terrain.projected.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.clip('evenodd');
   }
   paintBattlefieldStandee(face,index!=null&&frame.lighting,frame.blockers);
   ctx.restore();
  };
  for(const [face,index] of frame.faces){
   if(preview&&(destination&&face.p===carry?.piece||preview.token.roomId&&face.p.roomId===preview.token.roomId))continue;
   paint(face,index);
  }
  for(const face of moved)paint(face,null);
  layer.hidden=false;
  return true;
 }finally{ctx=main;faces=savedFaces}
}
function standeeLayerViewKey(){
 return [currentSceneId,roomProfile,canvas.clientWidth,canvas.clientHeight,zoom,panX,panY,angle,tilt,topDown,preferences.graphicsQuality];
}
function canReuseStandeeLayer(){
 const layer=movingStandeeLayer;
 if(!layer||carry!==layer.carry||!ghost||layer.tokens!==tokens||layer.pieces!==pieces||layer.areas!==areas)return false;
 const view=standeeLayerViewKey();
 return layer.view.every((value,index)=>Object.is(value,view[index]));
}
function paintMovingStandeeLayer(layer){
 const overlay=el('movingStandeeOverlay'),width=canvas.width,height=canvas.height;
 if(overlay.width!==width)overlay.width=width;
 if(overlay.height!==height)overlay.height=height;
 overlay.hidden=false;
 const main=ctx,activeFrame=lightingFrame;
 try{
  ctx=overlay.getContext('2d');ctx.setTransform(width/W,0,0,height/H,0,0);ctx.clearRect(0,0,W,H);
  lightingFrame=layer.lighting;
  for(let index=statusMarks.length-1;index>=0;index--)if(statusMarks[index].token===layer.preview)statusMarks.splice(index,1);
  const stationary=layer.stationary;
  faces=[];
  if(visiblePiece(ghost))drawStandee(ghost,true);
  const movingFaces=faces.filter(f=>visibleProjection(f.projected,55));
  for(const face of movingFaces){ctx.globalAlpha=.72;paintBattlefieldStandee(face,layer.showLighting,layer.blockers)}
  ctx.globalAlpha=1;
  drawStandeeMarks(movingFaces,false);
  layer.preview=ghost;
  faces=stationary.concat(movingFaces);
 }finally{ctx=main;lightingFrame=activeFrame}
}
function paintRaisedPlatformOutline(face){
 ctx.save();ctx.globalAlpha=1;ctx.strokeStyle='#b7a58b';
 ctx.lineWidth=1.65;ctx.setLineDash([5,3]);
 ctx.beginPath();
 face.projected.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.stroke();ctx.restore();
}
function drawBattlefield(simplified,action,cameraPreview,lightOrbit,panFrame=null){
 const {width,height}=canvas.getBoundingClientRect();
 if(!width||!height)return;
 const quality=preferences.graphicsQuality;
 const showTerrainTextures=quality!==3;
 const preserveCameraTextures=cameraPreview&&cameraPanPreview||action==='Test: Pan preview'||action==='Test: Orbit preview';
 const paintTerrainTextures=showTerrainTextures&&(!simplified||preserveCameraTextures);
 const flatTerrainTextures=showTerrainTextures&&simplified&&!paintTerrainTextures;
 const paintVolumeGrids=!simplified;
 const ratio=battlefieldPixelRatio(quality,cameraPreview);
 W=width;H=height;S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;C=Math.cos(angle);D=Math.sin(angle);
 keepBattlefieldVisible();
 if(floorSceneEditing)drawFloorSceneOverlay();
 const resized=canvas.width!==Math.round(W*ratio)||canvas.height!==Math.round(H*ratio);
 if(resized){canvas.width=Math.round(W*ratio);canvas.height=Math.round(H*ratio)}
 if(resized)clearPanPaint();
 const overlap=resized||floorSceneEditing?null:reusePaintedPan(panFrame,ratio);
 if(performanceDraw)performanceDraw.panEdgesOnly=!!overlap;
 const insideOverlap=projection=>overlap&&(overlap.full||projection?.length&&projection.every(([x,y])=>
  x>overlap.left+2&&x<overlap.right-2&&y>overlap.top+2&&y<overlap.bottom-2));
 try{
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,W,H);ctx.lineWidth=1;
 faces=[];
 const geometryStart=performanceDraw?performance.now():0;
 const geometryLighting=performanceDraw?.lightingMs??0;
 let stageStart=geometryStart,stageLighting=geometryLighting;
 const recordGeometryStage=name=>{
  if(!performanceDraw)return;
  const now=performance.now(),lighting=performanceDraw.lightingMs;
  performanceDraw[name]=roundedMs(Math.max(0,now-stageStart-(lighting-stageLighting)));
  stageStart=now;
  stageLighting=lighting;
 };
 const moving=ghost&&carry?carriedMembers():[];
 const resizing=drag?.volume;
 const savedAppearance=areas.find(a=>a.shape==='appearance')?.appearance;
 const appearance=floorSceneEditing&&appearanceDraft?{...savedAppearance,...appearanceDraft,ground:'image',floorImage:readFloorImageSettings()}:savedAppearance;
 const showLighting=(roomProfile?.gm===false||playing&&(!gmIgnoreLighting||!!gmVisionObserver()))&&(wallRooms().some(a=>a.dark)||areas.some(a=>a.shape==='room'&&a.dark)||!!appearance?.ambient?.enabled||tokens.some(t=>t.torch&&!t.incognito));
 const blockers=showLighting||roomProfile?.gm===false?visionBlockers():[];
 const stage=progressiveLightFrame(action,!studioWebGLCapture&&showLighting&&!cameraPreview&&!simplified&&!carry&&quality===2);
 const interiorVision=roomInteriorVisibility(blockers);
 const sampleWallSurfaces=showLighting||mapFogEnabled();
 playerCameraCutaway=studioWebGLCapture?null:buildPlayerCameraCutaway();
 const cacheable=!studioWebGLCapture&&!floorSceneEditing&&(action==='Standee movement'||action==='Test: Standee cached')&&moving.length===1&&
  moving[0]?.type==='standee'&&!moving[0].flying&&!moving[0].carriedFixture&&!carry.light&&!carry.arcaneEye&&
  !gmVisionObserver()&&!resizing&&!repeatPreview.length;
 const cutaway=cacheable?movementCutawayKey(playerCameraCutaway,pieces):null;
 const cacheKey=cacheable?[W,H,gridLimit(0),gridLimit(1),ratio,zoom,angle,tilt,panX,panY,topDown,simplified,lightOrbit,paintTerrainTextures,paintVolumeGrids,quality,showThroughTerrain,playerShowAllies,moving[0],roomProfile?.name,lightingFrame?.signature,playerFogEnabled(),preferences.fogMemory,fogCache?.signature,focusCutaway,cutaway]:null;
 if(!cacheKey||!movementRenderCache?.key.every((value,i)=>value===cacheKey[i]))movementRenderCache=null;
 const cached=movementRenderCache;
 const useStandeeLayer=!topDown&&action==='Standee movement'&&cacheable&&!cameraPreview&&!areaPreview&&!editingArea&&
  !areas.some(area=>area.shape==='difficult')&&!moving[0].aura;
 const windowCuts=cached?null:windowApertureCuts();
 // Precompute the same authored-wall room reachability before any mesh faces.
 // No culling in GM/editor/preview modes.
 earlyRoomCullCount=0;
 earlySectorCullCount=0;
 earlyForegroundWallCullCount=0;
 earlyWallPreselected=0;
 earlyStairGroupCulled=0;
 earlyRoomCull=playerFogEnabled()&&!floorSceneEditing&&!gmVisionObserver()
  ?nearbyObserverRooms(wallVisibilityTopology(),fogPreparedObservers||(fogPreparedObservers=prepareFogObservers()))
  :null;
 recordGeometryStage('visibilitySetupMs');
 if(!cached){
 drawVisibleGround();
 recordGeometryStage('groundGeometryMs');
 // Stair treads share a persistent staircase identity. Reject the entire
 // group before creating any tread faces when its complete footprint is
 // outside all eligible rooms. Individual treads still use normal drawing.
 const stairGroups=new Map(),culledStairGroups=new Set();
 if(earlyRoomCull)for(const p of pieces)if(p.stairTread&&p.stairGroup&&!p.curvedStair){
  const key=p.stairGroup;
  if(!stairGroups.has(key))stairGroups.set(key,[]);
  stairGroups.get(key).push(p);
 }
 for(const [key,members] of stairGroups){
  const footprint=members.flatMap(p=>{
   const [w,d]=dimensions(p);return [[p.x,p.y],[p.x+w,p.y],[p.x+w,p.y+d],[p.x,p.y+d]];
  });
  // No group-wide exclusion if it crosses multiple rooms or is elevated.
  if(members.every(p=>Math.abs(p.z)<=.15)&&earlyRoomDisconnected(footprint)){
   culledStairGroups.add(key);earlyStairGroupCulled+=members.length;
  }
 }
 for(const p of [...pieces,...tokens]){
  if(p.stairTread&&culledStairGroups.has(p.stairGroup))continue;
  if(!visiblePiece(p)||resizing?.next&&resizing.piece===p||
   ghost&&(drag?.piece===p||drag?.members?.includes(p)||moving.includes(p)))continue;
  const interiorHidden=!fogMemoryState&&!playerCameraCutaway?.stairs.has(p)&&hideRoomPiece(p,interiorVision);
  if(interiorHidden&&!movementTerrainBlock(p))continue;
  const visibleParts=windowCuts.get(p);
  for(const part of visibleParts??[p]){
   const first=faces.length;
   drawPiece(part);
   let kept=first;
   for(let i=first;i<faces.length;i++){
    const surface=faces[i];
    if(sampleWallSurfaces||interiorHidden)legacyWallSurfaceLighting(surface,part);
    if(interiorHidden&&(!surface.surfaceLightOffset||!fogPointVisible(
     surfaceLightPoint(fogFaceCenter(surface.world),surface.surfaceLightOffset),false)))continue;
    if(visibleParts)Object.assign(surface,{p,volumeTop:false});
    faces[kept++]=surface;
   }
   faces.length=kept;
  }
 }

 if(resizing?.next&&resizing.piece!==cutter?.box)drawPiece(resizing.next,true);
 if(ghost&&tokenTool?.folderMembers){
  for(const p of folderStandeePositions(ghost,tokenTool.folderMembers))if(visiblePiece(p))drawPiece(p,true);
 }else if(moving.length){for(const member of moving){const preview=member===carry.piece?ghost:carriedPosition(member);if(visiblePiece(preview))drawPiece(preview,true)}}
 else if(ghost&&drag?.members){for(const p of terrainGroupPositions(drag,ghost))if(visiblePiece(p))drawPiece(p,true)}
 else if(ghost&&visiblePiece(ghost))drawPiece(ghost,true);
 for(const copy of repeatPreview)if(visiblePiece(copy))drawPiece(copy,true);
 for(const window of areas)if(window.kind==='Window'&&!window.secret)for(const section of windowWallSections(window))drawPiece(section);
 renderOptimizedPathWalls(pathWallSolids().filter(solid=>solid.wall.id!==wallPreview?.id));
 if(wallPreview)for(const solid of compileWallPath(wallPreview).solids)renderPathWall(solid);
 // Opening and fixture meshes must retain their full geometry.
 earlyRoomCull=null;
 addDoorFaces();
 addFixtureFaces(blockers);
 recordGeometryStage('faceGeometryMs');
 if(performanceDraw){performanceDraw.earlyRoomCulledFaces=earlyRoomCullCount;performanceDraw.earlySectorCulledFaces=earlySectorCullCount;performanceDraw.earlyForegroundWallCulledSegments=earlyForegroundWallCullCount;performanceDraw.earlyWallPreselectedSegments=earlyWallPreselected;performanceDraw.earlyStairGroupCulledTreads=earlyStairGroupCulled;}
 // Read-only geometry audit. Count existing faces; never alter rendering.
 const geometryAudit=performanceDraw?{generated:faces.length,afterProjection:0,afterFog:0,projectionRejected:0,fogRejected:0,byType:{},stairGroups:{},fogInputByType:{},finalByType:{},sharedSurfaceAudit:{exactDuplicateFaces:0,sharedFacePairs:0,byType:{},candidateFaces:0},projectionAudit:{offscreenVertices:0,fullyOffscreenFaces:0},wallAudit:{wallCount:0,byWall:[],faceKinds:{},sharedPlaneCandidates:0},fogAudit:{inputFacesByType:{},retainedFacesByType:{},rejectedFacesByType:{}}}:null;
 // Diagnostic-only world-space sector index. No visibility or rendering behavior changes.
 const sectorAudit=geometryAudit?{size:8,sectorCount:0,activeSectorCount:0,activeInputFaces:0,inactiveInputFaces:0,activeOutputFaces:0,inactiveOutputFaces:0,largeFaceCount:0,sectorReferences:0,observerCount:0,topSectors:[],note:'Potential work only: proximity is not proof of visibility; distant sightlines, lights and camera must be considered before culling.'}:null;
 const sectorMap=sectorAudit?new Map():null;
 const sectorKey=(x,y)=>Math.floor(x/8)+','+Math.floor(y/8);
 const sectorKeysForFace=f=>{
  if(!f.world?.length)return [];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const v of f.world){minX=Math.min(minX,v[0]);maxX=Math.max(maxX,v[0]);minY=Math.min(minY,v[1]);maxY=Math.max(maxY,v[1])}
  const x0=Math.floor(minX/8),x1=Math.floor(maxX/8),y0=Math.floor(minY/8),y1=Math.floor(maxY/8);
  if((x1-x0+1)*(y1-y0+1)>64){sectorAudit.largeFaceCount++;return [sectorKey((minX+maxX)/2,(minY+maxY)/2)]}
  const keys=[];for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)keys.push(x+','+y);
  return keys;
 };
 const activeSectorKeys=sectorAudit?new Set():null;
 if(sectorAudit){
  const prepared=prepareFogObservers();
  sectorAudit.observerCount=prepared.observers.length;
  for(const observer of prepared.observers){
   const [x,y]=observer.distance,cx=Math.floor(x/8),cy=Math.floor(y/8);
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)activeSectorKeys.add((cx+dx)+','+(cy+dy));
  }
 }
 // Candidate sectors are a conservative superset, not an occlusion decision.
 // Camera-facing geometry, light sources and observer neighborhoods are retained.
 // No sector is excluded from the existing fog evaluator until proven invisible.
 const candidateSectorKeys=sectorAudit?new Set(activeSectorKeys):null;
 if(sectorAudit){
  const includeRadius=(x,y,r)=>{
   if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(r))return;
   const radius=Math.max(0,Math.min(256,r)),x0=Math.floor((x-radius)/8),x1=Math.floor((x+radius)/8),y0=Math.floor((y-radius)/8),y1=Math.floor((y+radius)/8);
   for(let ix=x0;ix<=x1;ix++)for(let iy=y0;iy<=y1;iy++)candidateSectorKeys.add(ix+','+iy);
  };
  const prepared=prepareFogObservers();
  for(const observer of prepared.observers)includeRadius(observer.distance[0],observer.distance[1],observer.range);
  // Lighting and sightlines can reach beyond observer proximity.
  // Keep these as diagnostic candidate regions; the original fog code remains authoritative.
  for(const area of areas)if(area.kind==='Light'||area.shape==='light'){
   const origin=area.origin||[area.x,area.y];
   const radius=Number(area.range??area.radius??0);
   includeRadius(origin[0],origin[1],radius);
  }
  sectorAudit.candidateInputFaces=0;
  sectorAudit.nonCandidateInputFaces=0;
  sectorAudit.candidateOutputFaces=0;
  sectorAudit.nonCandidateOutputFaces=0;
  sectorAudit.candidateSectorCount=0;
  sectorAudit.cullingEnabled=false;
  sectorAudit.reason='Candidate indexing only; geometry outside candidate sectors is still processed to preserve distant visibility, ambient light and exploration memory.';
 }
 // Camera-aware conservative diagnostic: never discard a face based on this classification.
 // Projected polygons crossing the viewport are treated as potentially visible.
 const cameraSectorKeys=sectorAudit?new Set():null;
 const faceInCamera=f=>{
  const p=f.projected;
  if(!p?.length)return true;
  const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);
  return Math.max(...xs)>=-2&&Math.min(...xs)<=W+2&&Math.max(...ys)>=-2&&Math.min(...ys)<=H+2;
 };
 if(sectorAudit){
  sectorAudit.cameraInputFaces=0;sectorAudit.offCameraInputFaces=0;
  sectorAudit.cameraOutputFaces=0;sectorAudit.offCameraOutputFaces=0;
  sectorAudit.memoryEligibleInputFaces=0;sectorAudit.memoryEligibleOffCameraFaces=0;
  sectorAudit.cameraSectorCount=0;
  sectorAudit.candidateMissesRetained=0;sectorAudit.cameraMissesRetained=0;
  sectorAudit.safeCullFaces=0;
  sectorAudit.safeCullingEnabled=false;
  sectorAudit.note='Conservative camera-projection and memory eligibility diagnostics; no face is skipped.';
 }
 const indexSectorFace=(f,output=false)=>{
  const keys=sectorKeysForFace(f);
  const active=keys.some(key=>activeSectorKeys.has(key));
  const candidate=keys.some(key=>candidateSectorKeys.has(key));
  const camera=faceInCamera(f);
  const memoryEligible=!!(fogMemoryState&&f.world&&!f.fixtureFace&&!f.preview);
  sectorAudit[(candidate?'candidate':'nonCandidate')+(output?'OutputFaces':'InputFaces')]++;
  sectorAudit[(camera?'camera':'offCamera')+(output?'OutputFaces':'InputFaces')]++;
  if(output){if(!candidate)sectorAudit.candidateMissesRetained++;if(!camera)sectorAudit.cameraMissesRetained++}
  if(!output&&memoryEligible){sectorAudit.memoryEligibleInputFaces++;if(!camera)sectorAudit.memoryEligibleOffCameraFaces++}
  if(!output&&!camera&&!memoryEligible)sectorAudit.safeCullFaces++;
  if(camera)for(const key of keys)cameraSectorKeys.add(key);
  if(output){sectorAudit[active?'activeOutputFaces':'inactiveOutputFaces']++;return}
  sectorAudit[active?'activeInputFaces':'inactiveInputFaces']++;
  sectorAudit.sectorReferences+=keys.length;
  for(const key of keys){const entry=sectorMap.get(key)||{faces:0,wallFaces:0};entry.faces++;if(f.pathWall)entry.wallFaces++;sectorMap.set(key,entry)}
 };
 const geometryFaceType=f=>{
  if(f.pathWall)return 'path wall';
  if(f.p?.stairGroup||f.p?.curvedStair)return 'staircase';
  if(f.p?.type==='volume'&&f.p?.form)return 'shaped volume';
  if(f.standee)return 'standee';
  if(f.shadow)return 'shadow';
  if(f.fixtureFace)return 'fixture';
  if(f.doorFace)return 'door';
  if(f.p?.stairGroup||f.p?.curvedStair)return 'staircase';
  if(f.p?.type==='volume')return 'volume';
  if(f.p?.type==='column')return 'column';
  if(f.p?.type)return f.p.type;
  if(f.p?.kind)return f.p.kind;
  if(f.canopy!==undefined)return 'canopy';
  return 'unclassified';
 };
 if(geometryAudit){
  // Detect exact coincident faces without altering geometry. This is a lower
  // bound on redundant internal faces, not a general solid-union test.
  const surfaces=new Map();
  const quantize=v=>Math.round(Number(v)*10000)/10000;
  for(const f of faces){
   if(!f.world||f.world.length<3||f.preview||f.standee||f.shadow)continue;
   const vertices=f.world.map(v=>v.map(quantize).join(','));
   if(new Set(vertices).size!==vertices.length)continue;
   geometryAudit.sharedSurfaceAudit.candidateFaces++;
   const key=vertices.slice().sort().join('|');
   let entries=surfaces.get(key);
   if(!entries){entries=[];surfaces.set(key,entries)}
   entries.push(f);
   if(f.projected?.every(v=>v[0]<0||v[0]>W||v[1]<0||v[1]>H))
    geometryAudit.projectionAudit.offscreenVertices++;
  }
  for(const entries of surfaces.values())if(entries.length>1){
   geometryAudit.sharedSurfaceAudit.exactDuplicateFaces+=entries.length-1;
   // A matching pair may be a shared interior surface; confirm adjacency
   // before deleting it in any future optimization.
   geometryAudit.sharedSurfaceAudit.sharedFacePairs+=Math.floor(entries.length/2);
   for(const f of entries){
    const type=geometryFaceType(f);
    geometryAudit.sharedSurfaceAudit.byType[type]=(geometryAudit.sharedSurfaceAudit.byType[type]||0)+1;
   }
  }
 }
 if(geometryAudit){
  const walls=new Map(),planes=new Map();
  for(const f of faces){
   if(!f.pathWall)continue;
   const id=String(f.wallId??'unknown');
   let wall=walls.get(id);
   if(!wall){wall={id,faces:0,cap:0,side:0,segments:new Set()};walls.set(id,wall)}
   wall.faces++;
   const isCap=f.z!==null&&f.z!==undefined;
   if(isCap)wall.cap++;else wall.side++;
   geometryAudit.wallAudit.faceKinds[isCap?'cap':'side']=(geometryAudit.wallAudit.faceKinds[isCap?'cap':'side']||0)+1;
   if(f.pathSolid?.poly)wall.segments.add(JSON.stringify(f.pathSolid.poly));
   // Plane signatures only flag potential coplanarity; they do not imply
   // overlapping areas or safe removal.
   if(f.world?.length>=3){
    const [a,b,c]=f.world;
    const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...normal);
    if(length>1e-8){
     const n=normal.map(x=>x/length);
     const sign=n.find(x=>Math.abs(x)>1e-7)<0?-1:1;
     const plane=[...n.map(x=>Math.round(sign*x*1000)),Math.round(sign*n.reduce((sum,x,i)=>sum+x*a[i],0)*1000)].join(',');
     const key=id+'|'+plane;
     planes.set(key,(planes.get(key)||0)+1);
    }
   }
  }
  geometryAudit.wallAudit.wallCount=walls.size;
  geometryAudit.wallAudit.byWall=[...walls.values()].map(w=>({id:w.id,faces:w.faces,cap:w.cap,side:w.side,segments:w.segments.size})).sort((a,b)=>b.faces-a.faces).slice(0,25);
  geometryAudit.wallAudit.sharedPlaneCandidates=[...planes.values()].reduce((sum,n)=>sum+Math.max(0,n-1),0);
 }
 if(geometryAudit)for(const f of faces){
  const type=geometryFaceType(f);
  geometryAudit.byType[type]=(geometryAudit.byType[type]||0)+1;
  if(type==='staircase'){
   const group=String(f.p?.stairGroup||'ungrouped');
   geometryAudit.stairGroups[group]=(geometryAudit.stairGroups[group]||0)+1;
  }
 }
 faces=faces.filter(f=>visibleProjection(f.projected,f.standee?55:2));
 if(geometryAudit){
  geometryAudit.afterProjection=faces.length;
  geometryAudit.projectionRejected=geometryAudit.generated-faces.length;
  for(const f of faces){const type=geometryFaceType(f);geometryAudit.fogInputByType[type]=(geometryAudit.fogInputByType[type]||0)+1}
  for(const f of faces)indexSectorFace(f);
 }
 movementSurfaces=mapFogEnabled()?faces.filter(f=>(f.p?.stairTread||f.volumeTop||f.landing)&&Number.isFinite(f.z)&&!f.preview)
  .sort((a,b)=>a.depth-b.depth):[];
 recordGeometryStage('cullingMs');
 if(mapFogEnabled()){
 const fogDetail=performanceDraw?{faces:0,patches:0,refinedPatches:0,patchGenerationMs:0,boundaryRefinementMs:0,visibilityMs:0,travelMemoryMs:0,memoryMs:0,projectionMs:0,otherMs:0}:null;
 // Sector-level fast path: only prune when the entire scene is explicitly
 // dark, has no active emitters, and the sector lies beyond every observer's
 // darkvision. Otherwise retain the original full 3D visibility pipeline.
 // This deliberately does not equate "outside darkvision" with "invisible".
 const fogSectorStats={checked:0,skipped:0,unsafe:0};
 const fogSectorCache=new Map();
 const fogPrepared=fogPreparedObservers||(fogPreparedObservers=prepareFogObservers());
 const occupiedPlatforms=occupiedPlatformVisibility(fogPrepared.observers);
 const fogLights=activeLights();
 const fogSectorDark=key=>{
  if(fogSectorCache.has(key))return fogSectorCache.get(key);
  const [sx,sy]=key.split(',').map(Number);
  const center=[sx*8+4,sy*8+4,0];
  // A dark room can have openings admitting ambient illumination; skip only
  // when there are no openings at all, and all corners are dark.
  const dark=!fogLights.length&&!areas.some(a=>a.shape==='opening')&&
   [[0,0],[0,8],[8,0],[8,8],[4,4]].every(([dx,dy])=>roomIsDark([sx*8+dx,sy*8+dy,center[2]]));
  const far=fogPrepared.observers.length>0&&fogPrepared.observers.every(o=>{
   const dx=Math.max(sx*8-o.distance[0],0,o.distance[0]-(sx+1)*8);
   const dy=Math.max(sy*8-o.distance[1],0,o.distance[1]-(sy+1)*8);
   return dx*dx+dy*dy>(o.range+1)*(o.range+1);
  });
  const safe=dark&&far&&!fogPrepared.preview&&!gmVisionObserver()&&!fogMemoryState;
  fogSectorCache.set(key,safe);return safe;
 };
 // v1.525: conservative distance-first exclusion. Unlike the old sector
 // test, use each face's actual XY bounds, not sampled room darkness.
 // Ambient illumination can reveal distant geometry, so only enable this
 // shortcut when global ambient light is explicitly zero.
 const ambientSetting=areas.find(a=>a.shape==='appearance')?.appearance?.ambient;
 const noAmbient=ambientSetting?.enabled===true&&Number(ambientSetting.level)===0;
 const distancePruneEnabled=roomProfile?.gm===false&&!fogPrepared.preview&&noAmbient&&fogPrepared.observers.length>0;
 const distanceBoundsFar=(bounds,p,r)=>{
  const dx=Math.max(bounds.minX-p[0],0,p[0]-bounds.maxX);
  const dy=Math.max(bounds.minY-p[1],0,p[1]-bounds.maxY);
  return dx*dx+dy*dy>(r+1)*(r+1);
 };
 let distanceExcludedFaces=0,distanceCheckedFaces=0,distanceLightExceptions=0;
 const preFogDistanceReject=f=>{
  if(!distancePruneEnabled||!f.world?.length)return false;
  distanceCheckedFaces++;
  const xs=f.world.map(p=>p[0]),ys=f.world.map(p=>p[1]);
  const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
  if(!fogPrepared.observers.every(o=>distanceBoundsFar(bounds,o.distance,o.range)))return false;
  if(!fogLights.every(light=>distanceBoundsFar(bounds,lightRangeCenter(light),Math.max(0,Number(light.radius)||0)/5))){
   distanceLightExceptions++;return false;
  }
  distanceExcludedFaces++;return true;
 };
 const roomTopology=wallVisibilityTopology();
 const roomCandidates=roomTopology?wallVisibilityCandidates(roomTopology,fogPrepared):null;
 // Apply the same portal eligibility used by point visibility
 // before generating terrain patches. Connectivity alone is not visibility.
 const eligibleRoomIds=new Set();
 let roomEligibilityReliable=!!roomCandidates&&!fogPrepared.preview&&
  fogPrepared.observers.length>0&&fogPrepared.observers.every(o=>Math.abs(o.distance[2])<=.15);
 if(roomEligibilityReliable)for(const observer of fogPrepared.observers){
  const own=roomTopology.regionAt(observer.distance);
  if(own===null||own===undefined){roomEligibilityReliable=false;break}
  eligibleRoomIds.add(own);
  for(const portal of roomTopology.portals||[]){
   const [a,b]=portal.regions||[];
   if(a!==own&&b!==own)continue;
   if(!(portal.kind==='Window'?!portal.shaded:portal.open))continue;
   if(!portalWithinVisibilityRange(observer,portal))continue;
   if(a!==null&&a!==undefined)eligibleRoomIds.add(a);
   if(b!==null&&b!==undefined)eligibleRoomIds.add(b);
  }
 }
 const roomCounts={facesChecked:0,reachable:0,disconnected:0,mixed:0,unknown:0,culledFaces:0,regionCacheHits:0,regionCacheMisses:0,portalGuarded:0,elevationGuarded:0};
 // Cache topology lookups across the thousands of wall and floor vertices.
 // Portals and elevated geometry remain in the authoritative 3D path.
 const regionLookupCache=new Map();
 const cachedRegionAt=p=>{
  const key=Math.round(p[0]*1000)+','+Math.round(p[1]*1000);
  if(regionLookupCache.has(key)){roomCounts.regionCacheHits++;return regionLookupCache.get(key)}
  roomCounts.regionCacheMisses++;
  const id=roomCandidates.regionAt(p);
  regionLookupCache.set(key,id);return id;
 };
 const portalCenters=roomTopology?.portals?.map(p=>p.center).filter(p=>Array.isArray(p)&&p.length>=2)||[];
 const nearPortal=f=>portalCenters.some(p=>f.world.some(v=>Math.hypot(v[0]-p[0],v[1]-p[1])<2));
 const fogStartDetail=performance.now();
 // Retain only the geometry of raised terrain caps for a possible outline.
 // This is not visibility evidence: a cap may be outlined only when one of
 // its own vertical faces survives the authoritative fog checks.
 const raisedCapCandidates=faces.filter(f=>f.p&&f.world?.length>=3&&f.z!==null&&f.z!==undefined&&
  !f.pathWall&&!f.fixtureFace&&!f.doorFace&&!f.preview&&!f.standee&&!f.shadow&&
  f.world.every(v=>Math.abs((v[2]??0)-(f.world[0][2]??0))<.001)&&
  (f.world[0][2]??0)>.05);
 faces=faces.flatMap(f=>{
 if(fogDetail)fogDetail.faces++;
  const preview=gmVisionObserver();
  if(f.standee||f.shadow)return (preview?f.p===preview:ownsRoomStandee(f.p))||standeeVisibleToObserver(f.p,blockers)?[f]:[];
  if(f.canopy!==undefined)return fogPointVisible(f.lightSample)?[f]:[];
  // The fixture anchor was already checked once, before emitting its mesh.
  if((f.staticFixture&&fogMemoryState)||f.spellMote)return [f];
  if(!f.world)return f.p?.origin&&fogObjectVisible(f.p)?[f]:[];
  const platformSide=f.z===null&&occupiedPlatforms.has(f.p)&&!f.preview;
  const lowerPlatformFloor=occupiedPlatforms.size&&!f.preview&&!f.doorFace&&!f.fixtureFace&&!f.pathWall&&
   (!f.p||f.z!==null&&(f.p.groundSurface||['volume','terrace','stone','bridge'].includes(f.p.type)));
  // Never discard doors, openings, elevated terrain or fixtures using
  // the planar distance shortcut; they retain authoritative 3D checks.
  // Raised surfaces (including platforms below five feet) can be visible
  // over a nearby obstruction; never planar-prune them.
  const raisedSurface=f.world.some(v=>fogPrepared.observers.some(o=>Math.abs((v[2]??0)-(o.distance[2]??0))>.15));
  if(!raisedSurface&&!f.doorFace&&!f.fixtureFace&&!f.preview&&!f.spellMote&&!f.staticFixture&&!f.volumeTop&&!f.pathWall&&!platformSide&&!lowerPlatformFloor&&preFogDistanceReject(f))return [];
  // Experimental aggressive culling: reject faces wholly in disconnected
  // authored-wall regions before fog patch generation and ray sampling.
  // Keep cross-boundary faces and dynamic/portal geometry in the 3D renderer.
  if(roomCandidates&&f.world?.length){
   roomCounts.facesChecked++;
   const ids=new Set(f.world.map(cachedRegionAt));
   // Do not classify a face solely by its corners when its interior
   // crosses a wall-region boundary.
   const center=[f.world.reduce((v,p)=>v+p[0],0)/f.world.length,f.world.reduce((v,p)=>v+p[1],0)/f.world.length];
   ids.add(cachedRegionAt(center));
   if(ids.has(null))roomCounts.unknown++;
   else if(ids.size!==1)roomCounts.mixed++;
   else if(!roomEligibilityReliable||eligibleRoomIds.has(ids.values().next().value))roomCounts.reachable++;
   else {
    roomCounts.disconnected++;
    const elevated=raisedSurface;
    const portal=nearPortal(f);
    if(elevated)roomCounts.elevationGuarded++;
    if(portal)roomCounts.portalGuarded++;
    if(roomEligibilityReliable&&!elevated&&!portal&&!platformSide&&!lowerPlatformFloor&&!f.doorFace&&!f.fixtureFace&&!f.preview&&!f.spellMote&&!f.staticFixture){
     roomCounts.culledFaces++;
     return [];
    }
   }
  }
  // Only skip ordinary terrain wholly inside one provably dark sector.
  // Objects with openings, special visibility, or persistent memory retain
  // the authoritative renderer.
  if(f.world.length&&!platformSide&&!lowerPlatformFloor&&!f.doorFace&&!f.volumeTop&&!f.fixtureFace&&!f.preview){
   const keys=new Set(f.world.map(v=>Math.floor(v[0]/8)+','+Math.floor(v[1]/8)));
   if(keys.size===1){
    fogSectorStats.checked++;
    if(fogSectorDark(keys.values().next().value)){
     fogSectorStats.skipped++;return [];
    }
   }else fogSectorStats.unsafe++;
  }
  let forceVisible;
  const forceTerrainVisible=()=>forceVisible??=(f.doorFace&&f.p?.kind==='Door'&&fogOpeningVisible(f.p))||
   (f.volumeTop&&playerCameraCutaway?.stairs.has(f.p))||false;
  const visible=[];
  const patchStart=performance.now(),basePatches=terrainFogPatches(f);
 if(fogDetail)fogDetail.patchGenerationMs+=performance.now()-patchStart;
 for(const basePatch of basePatches){
  const refineStart=performance.now(),patches=f.p?[basePatch]:refinedFogBoundaryPatches(basePatch);
  if(fogDetail){fogDetail.boundaryRefinementMs+=performance.now()-refineStart;fogDetail.refinedPatches+=patches.length}
  for(const patch of patches){
   if(fogDetail)fogDetail.patches++;
   const rememberTerrain=fogMemoryState&&!f.fixtureFace&&!f.preview;
   const paintKey=rememberTerrain?patch.memoryKey+'|'+(patch.surfaceLightOffset?.join(',')??''):null;
   const saved=paintKey&&fogMemoryState.shading.get(paintKey);
   // Visibility must be recomputed for the current observer position.
   // A saved lighting patch is only a historical appearance, never proof
   // that the patch is still visible. Reusing it unconditionally leaves
   // old torch/fog squares behind as a player moves or extinguishes light.
   const visibilityStart=performance.now();
   const currentlyVisible=platformSide||lowerPlatformFloor&&platformLowerFloorVisible(patch.world,occupiedPlatforms)||forceTerrainVisible()||terrainFogPatchVisible(f.p?{...patch,ownerPiece:f.p}:patch);
   if(fogDetail)fogDetail.visibilityMs+=performance.now()-visibilityStart;
   const travelStart=performance.now();
   if(rememberTerrain&&roomProfile?.gm!==false&&!currentlyVisible&&!fogMemoryState.seen.has(patch.memoryKey)&&fogSeenDuringTravel(patch,blockers)){
     fogMemoryState.seen.add(patch.memoryKey);fogMemoryState.dirty=true;
    }
   if(fogDetail)fogDetail.travelMemoryMs+=performance.now()-travelStart;
   const memoryStart=performance.now();
    const state=fogRemember(patch.memoryKey,currentlyVisible);
   if(fogDetail)fogDetail.memoryMs+=performance.now()-memoryStart;
   if(!state||state===2&&!rememberTerrain)continue;
   const memory=rememberTerrain?{paintKey,rememberedFog:state===2}:null;
   // v1.489: remembered walls are a floor-plan footprint, not a full-height
   // 3D wall. Keep the original wall solids in the occlusion system; only
   // the rendered historical representation changes. The top cap supplies
   // the footprint and side faces are omitted from remembered fog.
   if(state===2&&f.pathWall){
    if(f.z===null||f.z===undefined)continue;
    const baseZ=Number(f.p?.z);
    if(!Number.isFinite(baseZ))continue;
    const world=patch.world.map(vertex=>[vertex[0],vertex[1],baseZ+.012]);
    const projected=world.map(vertex=>point(...vertex));
    visible.push({...f,...memory,world,projected,
     depth:projected.reduce((sum,vertex)=>sum+vertex[2],0)/projected.length,
     rememberedWallFootprint:true});
    continue;
   }
   if(patch.wholeFace){visible.push(memory?{...f,...memory}:f);continue}
   const world=patch.world;
   const projectionStart=performance.now();
   const projected=world.map(vertex=>point(...vertex));
   if(fogDetail)fogDetail.projectionMs+=performance.now()-projectionStart;
   visible.push({...f,...memory,world,projected,depth:projected.reduce((sum,vertex)=>sum+vertex[2],0)/projected.length});
  }
  }
  return visible;
 });
 // A visible vertical side establishes that the player knows this raised
 // structure exists. Draw its top perimeter as a line, never its top fill,
 // texture, lighting, occupants, or fog-memory contents.
 const visibleRaisedSides=new Set(faces.filter(f=>f.p&&f.z===null&&!f.rememberedFog&&
  !f.fixtureFace&&!f.doorFace&&!f.preview).map(f=>f.p));
 // Even a partly visible cap needs the missing rear perimeter.
 // The outline is only a structural cue; do not reveal the hidden fill.
 for(const cap of raisedCapCandidates){
  if(!visibleRaisedSides.has(cap.p))continue;
  faces.push({...cap,perimeterOnly:true});
 }
 if(fogDetail){
  const measured=fogDetail.patchGenerationMs+fogDetail.boundaryRefinementMs+fogDetail.visibilityMs+fogDetail.travelMemoryMs+fogDetail.memoryMs+fogDetail.projectionMs;
  fogDetail.otherMs=Math.max(0,performance.now()-fogStartDetail-measured);
  for(const key of ['patchGenerationMs','boundaryRefinementMs','visibilityMs','travelMemoryMs','memoryMs','projectionMs','otherMs'])fogDetail[key]=roundedMs(fogDetail[key]);
  fogDetail.preFogDistancePruning={enabled:distancePruneEnabled,ambientZero:noAmbient,checkedFaces:distanceCheckedFaces,excludedFaces:distanceExcludedFaces,lightExceptions:distanceLightExceptions};
  fogDetail.sampledRegions=fogRegionStats.regions.size;
  fogDetail.sampledPoints=fogRegionStats.samples;
  fogDetail.pointCacheHits=fogRegionStats.cacheHits;
  fogDetail.observerTests=fogRegionStats.observerTests;
  fogDetail.rangeRejects=fogRegionStats.rangeRejects;
  fogDetail.rayTests=fogRegionStats.rayTests;
  fogDetail.sectorPruning={...fogSectorStats,eligibleSectors:fogSectorCache.size,enabled:true,mode:'strict-dark-no-lights-no-memory'};
  if(geometryAudit){
   fogDetail.distantDarkCache={hits:fogDistantDarkHits,entries:fogDistantDarkCache?.values.size??0,enabled:fogDistantDarkEligible,signatureChanges:fogDistantDarkSignatureChanges,invalidations:fogDistantDarkInvalidations,changeReasons:{...fogDistantDarkChangeReasons},componentChanges:{...fogDistantDarkComponentChanges},lastChangedComponents:[...fogDistantDarkLastChanged]};
   fogDetail.fastDarkPatchSkips=fogFastPatchSkips;
   fogDetail.movingLightPositionCache={positions:fogMovingLightCache.positions.size,hits:fogMovingLightHits,misses:fogMovingLightMisses,limit:FOG_LIGHT_POSITION_LIMIT,prewarmCalculated:fogPrewarmCalculated,prewarmReused:fogPrewarmReused,evictions:fogMovingLightEvictions,observedSamplePoints:fogRecentSamplePoints.size};
   fogDetail.wallTopology=roomTopology;
   fogDetail.roomVisibilityAudit=roomCandidates?{
    observerRegions:roomCandidates.observerRegions,
    reachableRegions:roomCandidates.reachableRegions,
    potentiallyDisconnectedRegions:roomCandidates.potentiallyDisconnectedRegions,
    ...roomCounts,
    note:'EXPERIMENTAL aggressive culling of disconnected 2D wall regions. Elevated sightlines, distant lighting and explored fog may be incorrectly hidden.'
   }:{status:'Topology unavailable',culledFaces:0};
  }
  performanceDraw.fogDetail=fogDetail;
 if(performanceDraw)performanceDraw.planarVisionAudit=planarVisionAudit;
 }
 }
 if(geometryAudit){
  if(sectorAudit){
   for(const f of faces)indexSectorFace(f,true);
   sectorAudit.sectorCount=sectorMap.size;
   sectorAudit.cameraSectorCount=cameraSectorKeys.size;
   sectorAudit.candidateSectorCount=[...sectorMap.keys()].filter(key=>candidateSectorKeys.has(key)).length;
   sectorAudit.activeSectorCount=[...sectorMap.keys()].filter(key=>activeSectorKeys.has(key)).length;
   sectorAudit.topSectors=[...sectorMap].sort((a,b)=>b[1].faces-a[1].faces).slice(0,12).map(([key,counts])=>({key,...counts,active:activeSectorKeys.has(key)}));
   geometryAudit.sectorAudit=sectorAudit;
  }
  geometryAudit.afterFog=faces.length;
  geometryAudit.fogRejected=geometryAudit.afterProjection-faces.length;
  for(const f of faces){const type=geometryFaceType(f);geometryAudit.finalByType[type]=(geometryAudit.finalByType[type]||0)+1}
  // Fog can subdivide one input face into multiple output patches, so
  // these are descriptive counts rather than a one-to-one rejection map.
  geometryAudit.fogAudit.inputFacesByType={...geometryAudit.fogInputByType};
  geometryAudit.fogAudit.retainedFacesByType={...geometryAudit.finalByType};
  for(const [type,n] of Object.entries(geometryAudit.fogInputByType))
   geometryAudit.fogAudit.rejectedFacesByType[type]=n-(geometryAudit.finalByType[type]||0);
  // Negative fogRejected means fog refinement expanded faces, not a counter error.
  performanceDraw.geometryAudit=geometryAudit;
  performanceDraw.fogMemory={sceneId:currentSceneId,revision:fogMemoryState?.revision,stored:fogMemoryState?.seen.size||0,remoteLoaded:!!fogMemoryState?.loaded,remoteLoading:!!fogMemoryState?.loading,pendingSave:!!fogMemoryState?.pending,syncStatus:fogMemoryState?.syncStatus||'inactive',loadError:fogMemoryState?.loadError||null,sessionReady:!!roomProfile?.token,...fogMemoryDrawAudit};
 }
 recordGeometryStage('fogGeometryMs');
 if(pendingFogTravel)pendingFogTravel=null;
 // v1.492: any newly explored patch must be persisted, even when there is
 // no pending travel trail (ordinary redraws, room polls, and refreshes).
 // Save locally immediately; defer remote synchronization to coalesce frames.
 if(fogMemoryState?.dirty){
  saveFogMemory();
  scheduleFogMemorySync(fogMemoryState);
 }
 }else{
  if(visiblePiece(ghost))drawPiece(ghost,true);
  faces=cached.faces.concat(faces.filter(f=>visibleProjection(f.projected,f.standee?55:2)));
 }
 if(performanceDraw)performanceDraw.geometryMs=Number(Math.max(0,performance.now()-geometryStart-(performanceDraw.lightingMs-geometryLighting)).toFixed(2));
 if(studioWebGLCapture){
  studioWebGLCapture=false;
  uploadStudioWebGLFrame(blockers,showLighting,appearance,action);
  const destination=carry?.piece?.type==='standee'&&!carry.light&&!carry.arcaneEye?ghost:null;
  drawStudioWebGLFrame(studioWebGLFrame,ratio,destination);
  return;
 }
 const orderStart=performanceDraw?performance.now():0;
 const groundLayer=f=>topDown?!f.p:f.z===0&&!f.standee;
 if(!cached)faces.sort((a,b)=>Number(groundLayer(b))-Number(groundLayer(a))||
  ((topDown||showThroughTerrain)?Number(!!a.standee)-Number(!!b.standee):0)||a.depth-b.depth);
 if(!cached&&(!topDown||cacheable)){
  // Keep the drag preview above the stationary pass in both camera modes.
  const movingPreviews=faces.filter(f=>f.preview&&f.standee);
  const stationary=faces.filter(f=>!f.preview||!f.standee);
  faces=(topDown?stationary:orderOccludingFaces(stationary)).concat(movingPreviews);
 }
 if(cacheable&&!cached){
  movementRenderCache={key:cacheKey,faces:faces.filter(f=>!f.preview),painted:null};
 }
 if(performanceDraw){performanceDraw.movementCacheHit=!!cached;performanceDraw.paintedCacheHit=!!cached?.painted;}
 if(performanceDraw)performanceDraw.orderMs=Number((performance.now()-orderStart).toFixed(2));
 const paintStart=performanceDraw?performance.now():0;
 const paintLighting=performanceDraw?.lightingMs??0;
 let passStart=paintStart,passLighting=paintLighting;
 function finishPaintPass(key){
  const now=performance.now(),lighting=performanceDraw.lightingMs;
  performanceDraw[key]=Number(Math.max(0,now-passStart-(lighting-passLighting)).toFixed(2));
  passStart=now;passLighting=lighting;
 }
 if(performanceDraw){performanceDraw.paintBreakdown={};performanceDraw.collectPaintBreakdown=true}
 let reachedFaces=false;
 const fog=mapFogEnabled();
 const lowGrid=gridVisible()&&!activeGridCalibration()&&!fog&&!topDown&&tilt<=.16; // Calibrated scenes draw their grid on the fixed floor; never draw a detached low-angle grid.
 const sceneStyle=areas.find(a=>a.shape==='appearance');
 const theme=Object.hasOwn(terrainThemes,appearance?.terrainTheme)?terrainThemes[appearance.terrainTheme]:null;
 if(cached?.painted){
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(cached.painted,0,0);
  ctx.restore();
 }else drawSceneBackdrop(showTerrainTextures||appearance?.backdrop==='image'?appearance:{outsideColor:appearance?.outsideColor});
 const groundArt=appearance?.ground==='image'&&appearance.groundImage&&!sceneStyle?.floorImageHidden?getArt(appearance.groundImage):null;
 const floorImage=!cached?.painted&&groundArt?.naturalWidth&&appearance.floorImage?prepareFloorImage(groundArt,appearance.floorImage):null;
 let paintedGround=false;
 if(!cached?.painted&&(showTerrainTextures||groundArt)){
  if(fog){
   ctx.save();ctx.beginPath();
   for(const face of faces){
    if(face.p||face.fogRemembered)continue;
    face.projected.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();
   }
   ctx.clip();
  }
  const groundAppearance=sceneStyle?.floorImageHidden&&appearance?.ground==='image'?{...appearance,ground:''}:appearance;
  ctx.save();
  if(floorImage)floorImage.opacity=sceneStyle?.floorImageOpacity??1;
  paintedGround=drawSceneGround(groundAppearance,flatTerrainTextures,floorImage);
  // Map Composer pieces use fixed world coordinates and the existing projector.
  // This optional scene field leaves legacy scenes and their grid unchanged.
  if(window.BattlemapMapComposerRenderer&&Array.isArray(appearance?.mapComposerPieces)){
   try{
    const entries=appearance.mapComposerPieces.map(p=>window.BattlemapMapComposer.normalizePiece(p));
    window.BattlemapMapComposerRenderer.paint(entries,{
     project:(x,y,z)=>point(x,y,z),
     resolveImage:assetId=>getArt(assetId),
     mapImage:(image,quad)=>mapImage(image,quad),
     context:ctx
    });
   }catch(error){console.error('Map Composer rendering failed',error)}
  }
  ctx.restore();
  if(showTerrainTextures&&sceneStyle?.groundTexture&&!floorImage){
   const world=[[0,0,0],[gridLimit(0),0,0],[gridLimit(0),gridLimit(1),0],[0,gridLimit(1),0]];
   const projected=world.map(p=>point(...p));
   if(flatTerrainTextures&&!paintedGround)polygon(projected,'#e2d4b5',null);
   paintedGround=drawImportedTexture(sceneStyle.groundTexture,sceneStyle,{world,projected},flatTerrainTextures)||paintedGround;
  }
  if(fog)ctx.restore();
 }
 const lightBlockers=blockers;
 const separatePlayerStandees=playing&&roomProfile?.gm===false&&!useStandeeLayer&&!cameraPreview&&!overlap;
 const topDownStandeePreview=separatePlayerStandees&&topDown&&moving.length===1&&
  carry.piece?.type==='standee'&&!carry.light&&!carry.arcaneEye?ghost:null;
 const playerStandeeFaces=[];
 const sceneDark=showLighting;
 if(performanceDraw&&stage)performanceDraw.progressiveLighting=stage.phase;
 const lightEdgeDepth=simplified&&!carry||cameraPreview||lightOrbit||quality===0||quality===3?0:quality===4?1:quality===2?3:2;
 const sharpLight=quality===2&&lightEdgeDepth>0;
 const lightEdgeBudget={remaining:240};
 const lightRanges=sceneDark&&lightEdgeDepth?(lightingFrame?.lights??activeLights()).map(light=>({
  source:lightRangeCenter(light),
  radii:[light.radius,light.bright].filter(radius=>radius>0).map(radius=>radius/5)
 })): [];
 const shadowSample=sharpLight&&lightBlockers.length?target=>{
  const light=lightAt(target,lightBlockers);
  return light?.transmission??(light?1:0);
 }:null;
 if(stage){stage.ranges=lightRanges;stage.shadowSample=shadowSample}
 const tintLightPatch=(target,projection)=>{
  const tint=roomLighting(target,lightBlockers,quality===2);
  if(tint)polygon(projection,tint,null);
 };
 function shadeTerrain(face){
  if(face.preview||!face.world?.length||insideOverlap(face.projected))return;
  // Remembered terrain is not currently visible: do not replay cached
  // light polygons or recalculate torchlight onto unseen tiles. Use a
  // consistent desaturated memory tint regardless of former light position.
  if(face.rememberedFog){polygon(face.projected,'#222936b0',null);return;}
  if(face.cachedShade){
   for(const [points,tint] of face.cachedShade)if(tint)polygon(points.map(vertex=>point(...vertex)),tint,null);
   return;
  }
  if(stage){
   const key=[face.p?.type,!!face.p?.form,!!face.volumeTop,face.edge!==undefined,face.world,face.surfaceLightOffset].map(value=>JSON.stringify(value)).join('|');
   const exact=stage.patches.get(key);
   if(exact){
    for(const [world,tint] of exact)polygon(world.map(vertex=>point(...vertex)),tint,null);
    return;
   }
   if(stage.phase!=='sharp'){
    if(!stage.faces.has(key)){
     const patches=[];
     forEachTerrainLightPatch(face,points=>patches.push(points));
     stage.faces.set(key,{key,patches,offset:face.surfaceLightOffset,
      depth:topDown&&roomProfile?.gm===false&&!face.p?Math.max(3,lightEdgeDepth):lightEdgeDepth});
    }
    forEachTerrainLightPatch(face,(points,projection)=>paintRoundLightPatch(
     points,projection,lightRanges,(target,projected)=>{
      const tint=roomLighting(target,lightBlockers,true);
      if(tint)polygon(projected,tint,null);
     },0,stage.mediumBudget,false,face.surfaceLightOffset,null));
    return;
   }
  }
  const saved=face.paintKey?[]:null;
  if(sceneDark)measurePaint('terrainLighting',()=>forEachTerrainLightPatch(face,(points,projection)=>{
   // In player top-down view, refine light boundaries across floor tiles,
   // even when Sharp quality is off. A shared budget avoids per-cell
   // exhaustion causing large square discontinuities.
   const playerFloorLight=topDown&&roomProfile?.gm===false&&!face.p&&quality>0;
   const smoothLight=quality===2||playerFloorLight;
   const depth=playerFloorLight?Math.max(3,lightEdgeDepth):lightEdgeDepth;
   const patchBudget=sharpLight?{remaining:21,shadowProbes:5}:lightEdgeBudget;
   const screen=projection??(overlap?points.map(vertex=>point(...vertex)):null);
   if(!insideOverlap(screen))paintRoundLightPatch(points,screen,lightRanges,saved?(target,projected,world)=>{
    const tint=roomLighting(target,lightBlockers,smoothLight);
    if(tint){saved.push([world,tint]);polygon(projected,tint,null)}
   }:(target,projected)=>{
    const tint=roomLighting(target,lightBlockers,smoothLight);
    if(tint)polygon(projected,tint,null);
   },depth,patchBudget,false,face.surfaceLightOffset,shadowSample);
  }));
  if(saved&&!cameraPreview&&(fogMemoryState.shading.has(face.paintKey)||fogMemoryState.shading.size<16000))
   fogMemoryState.shading.set(face.paintKey,{signature:lightingFrame.terrainLightSignature,patches:saved});
 }
 if(lowGrid&&!cached?.painted)drawLowAngleGrid(paintedGround);
 function paintTerrainPatterns(value,face){
  drawPatternLayers(value,face,null,2,flatTerrainTextures);
 }
 const floorRooms=areas.filter(a=>a.shape==='room'&&a.floorFinish);
 const tracedFloorRooms=wallRooms().filter(a=>a.floorFinish);
 const volumeGridPaths=new Map();
 let snapshot=cacheable&&!cached&&faces.every(f=>!f.preview||f.standee||f.shadow);
 let playerFaceOrder=-1;
 for(const f of cached?.painted?faces.slice(cached.faces.length):faces){
  playerFaceOrder++;
  if(!reachedFaces&&f.p){
   if(performanceDraw)finishPaintPass('groundMs');
   reachedFaces=true;
  }
  if(snapshot&&f.preview){
   // In this path preview faces are appended after stationary terrain and standees.
   snapshot=false;
   if(faces.slice(faces.indexOf(f)).every(face=>face.preview)){
    const painted=document.createElement('canvas');
    painted.width=canvas.width;painted.height=canvas.height;
    painted.getContext('2d').drawImage(canvas,0,0);
    movementRenderCache.painted=painted;
   }
  }
  if(f.perimeterOnly){
   // Outline only: never shade or paint the concealed horizontal surface.
   paintRaisedPlatformOutline(f);
   continue;
  }
  if(paintFocusCutaway(f))continue;
  if(!f.p){
   ctx.globalAlpha=1;
   if(!lowGrid)polygon(f.projected,paintedGround?'#0000':f.fill,gridVisible()&&gridOpacity()>0?gridStrokeColor():null);
   if(!fog&&interiorVision&&f.world){
    const [x,y]=f.world[0],target=[x+.5,y+.5,0];
    if(interiorVision.rooms.some(a=>a.origin[2]===0&&target[0]>=a.origin[0]&&target[0]<a.origin[0]+a.size&&target[1]>=a.origin[1]&&target[1]<a.origin[1]+a.depth)&&!interiorVision.visible(target)){
     polygon(f.projected,'#202329',null);continue;
    }
   }
   const stamp=showTerrainTextures&&sceneStyle?.groundStamps?.[groundStampKey(f)];
   if(stamp)paintTerrainPatterns(stamp,f);
   const roomFloor=floorRooms.length&&paintRoomFloor(f,floorRooms,showTerrainTextures,flatTerrainTextures);
   if(stamp||roomFloor)paintFloorImageOnFace(floorImage,f);
   if(tracedFloorRooms.length)paintRoomFloor(f,tracedFloorRooms,showTerrainTextures,flatTerrainTextures);
   shadeTerrain(f);
   continue;
  }
  ctx.globalAlpha=f.preview?.72:1;
  if(f.pathWall){
   ctx.save();
   const cameraFade=playerCameraCutaway?.cutawayWallIds?.has(f.wallId);
   ctx.globalAlpha=f.pathWall.opacity*(cameraFade?.16:1);
   polygon(f.projected,f.fill,null);
   if(showTerrainTextures&&f.pathWall.texture!=='plain'&&(f.projected.length===4||f.capPattern)){
    const pattern=f.pathWall.texture==='mesa'?[{kind:'mesa',seed:1000+(f.pathWall.mesaStrata??pathWallDefaults.mesaStrata)}]:f.pathWall.texture;
    paintTerrainPatterns(pattern,f);
   }
   shadeTerrain(f);
   if(f.pathEdges){
    ctx.strokeStyle='#30251eaa';ctx.lineWidth=1.15;ctx.beginPath();
    f.pathEdges.forEach((edge,i)=>{
     if(!edge)return;
     const [x,y]=f.projected[i],[nx,ny]=f.projected[(i+1)%f.projected.length];
     ctx.moveTo(x,y);ctx.lineTo(nx,ny);
    });
    ctx.stroke();
   }
   ctx.restore();continue;
  }
  if(f.doorFace||f.fixtureFace){polygon(f.projected,f.fill,f.spellBubble?f.p.tint+'88':'#452c1c');if(f.doorFace&&!f.windowPane){if(!simplified&&f.doorDetailReverse!==undefined&&f.p.details)paintDoorDetails(f);shadeTerrain(f);}continue;}
  if(f.preview&&f.standee&&(useStandeeLayer||f.p===topDownStandeePreview))continue;
  if(f.shadow||f.standee){
   if(separatePlayerStandees&&ownsRoomStandee(f.p)&&!f.preview)playerStandeeFaces.push([f,playerFaceOrder]);
   else paintBattlefieldStandee(f,showLighting,lightBlockers);
   continue;
  }
  const outline=(f.p&&(f.p===selected||group.has(f.p)))?'#9a511e':!f.p?(gridVisible()&&gridOpacity()>0?gridStrokeColor():null):f.z===null?'#4837255c':'#5847359c';
  if(f.sceneryArt){
   if(lightOrbit||!showTerrainTextures){polygon(f.projected,f.fill||'#746853',null);shadeTerrain(f);continue}
   const art=getArt(f.sceneryArt);if(art.naturalWidth)mapImage(art,f.projected);
   shadeTerrain(f);
   if(f.preview||f.p===selected)polygon(f.projected,'#0000',outline);continue;
  }
  if(f.canopy!==undefined){
   if(lightOrbit)continue;
   ctx.save();
   if(textureTestEffect!=='foliageFilters'&&showLighting&&!f.preview){
    const ambient=ambientAt(f.lightSample,lightBlockers);
    const level=ambient?.level??0;
    const bright=level<3&&lightAt(f.lightSample,lightBlockers,false,true);
    const dim=!bright&&level<2&&lightAt(f.lightSample,lightBlockers);
    const brightness=bright?1:interpolateLight([.27,.47,.65,.82,.93,1],dim?2:level);
    const saturation=bright?1:Math.min(1,interpolateLight([.12,.25,.45,.7,.88,1],dim?2:level)+(ambient?.saturation??0)/200*(level/5));
    ctx.filter='brightness('+brightness+') saturate('+saturation+')';
   }
   if(showTerrainTextures)mapImage(foliageTexture(f.canopy,f.leafColor),f.projected);
   else polygon(f.projected,f.leafColor||f.fill,null);
   ctx.restore();continue;
  }
  if(f.flatColumn){
   const [a,,c]=f.projected;
   ctx.beginPath();ctx.ellipse((a[0]+c[0])/2,(a[1]+c[1])/2,(c[0]-a[0])/2,(c[1]-a[1])/2,0,0,Math.PI*2);
   ctx.fillStyle=f.preview?f.fill:theme?.column||f.fill;ctx.fill();
   ctx.strokeStyle=outline;ctx.stroke();
   shadeTerrain(f);
   continue;
  }
  if(f.special){
   const column=theme&&f.p.type==='column'&&!f.preview&&!f.biomeShape;
   polygon(f.projected,column&&!f.columnTrim?theme.column:f.fill,outline);
   if(showTerrainTextures&&column&&f.z===null&&theme.columnPattern)paintTerrainPatterns(theme.columnPattern,f);
   if(showTerrainTextures&&!f.preview)drawImportedTexture(f.p.surfaceTextures?.[f.edge??4],sceneStyle,f,flatTerrainTextures);
   shadeTerrain(f);
   continue;
  }
  const themed=theme&&!f.preview&&!['stream','waterfall','fountain'].includes(f.p.type);
  const siding=themed&&theme.sidePattern==='barn'&&f.z===null&&barnWall(f.p);
  const groundTop=f.z!==null&&f.p.groundSurface&&!f.preview;
  if(groundTop)polygon(f.projected,theme?.ground||'#e2d4b5',outline);
  else if(themed)polygon(f.projected,f.z===null?(siding?theme.wall:theme.side):theme.top,outline);
  else if(f.cut&&!f.preview)polygon(f.projected,'hsl(38 33% '+(67+13*f.shade)+'%)',null);
  else if(f.preview||!f.p)polygon(f.projected,f.fill,outline);
  else if(f.shaped)polygon(f.projected,f.fill,outline);
  else if(f.p.plainFaces?.[f.edge??4])polygon(f.projected,f.z===null?'#c9b694':'#e7d8b7',outline);
  else if(quality===0||!showTerrainTextures)polygon(f.projected,f.material?.startsWith('flow')||f.material==='fountain-pool'?'#bbc8bf':f.z===null?'#c9b694':'#e7d8b7',outline);
  else{
   const surface=measurePaint('materialTexture',()=>texture(f.fill,f.material||f.p.type,f.z!==null));
   if(flatTerrainTextures)polygon(f.projected,averageTerrainColor(surface),null);else mapImage(surface,f.projected);
   ctx.beginPath();f.projected.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.strokeStyle=outline;ctx.stroke();
  }
  if(showTerrainTextures&&themed&&!f.p.plainFaces?.[f.edge??4]){
   const kind=groundTop?(appearance?.ground==='image'?theme.groundPattern:appearance?.ground||theme.groundPattern):f.z===null?(theme.sidePattern==='barn'&&!siding?'dirt':theme.sidePattern):theme.topPattern;
   if(kind)paintTerrainPatterns(theme.formation==='boulder'?[{kind,seed:terrainThemeSeed(f.p)}]:kind,f);
  }
  if(showTerrainTextures&&groundTop&&!themed&&appearance?.ground!=='image')paintTerrainPatterns(appearance?.ground,f);
  if(showTerrainTextures&&!f.preview)drawImportedTexture(f.p.surfaceTextures?.[f.edge??4],sceneStyle,f,flatTerrainTextures);
  if(showTerrainTextures&&!f.preview)paintTerrainPatterns(f.p.patterns?.[f.edge??4],f);
  const roomFloor=floorRooms.length&&paintRoomFloor(f,floorRooms,showTerrainTextures,flatTerrainTextures);
  if(groundTop||roomFloor)paintFloorImageOnFace(floorImage,f);
  if(tracedFloorRooms.length)paintRoomFloor(f,tracedFloorRooms,showTerrainTextures,flatTerrainTextures);
  if(topDown&&movementTerrainBlock(f.p)){
   const height=dimensions(f.p)[2];
   if(height>0)polygon(f.projected,height>1?'#432f3429':'#c083262b',height>1?'#754941':'#90652b');
  }
  if(textureTestEffect!=='grids'&&paintVolumeGrids&&f.volumeTop&&!f.p.terrainYaw){
   if(fog){
    // Fog splits broad tops into visible patches. Keep the parent grid inside this patch.
    ctx.save();
    ctx.beginPath();
    f.projected.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();
    ctx.clip();
   }
   measurePaint('volumeGrid',()=>drawVolumeGrid(f,volumeGridPaths));
   if(fog)ctx.restore();
  }
  const pigment=f.p?.wash?.[f.edge??4];
  if(pigment&&!f.preview){
   ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.38;
   polygon(f.projected,pigment,null);ctx.restore();
  }
  const opaque=f.p.opaquePaint?.[f.edge??4];
  if(opaque&&!f.preview)polygon(f.projected,opaque,outline);
  shadeTerrain(f);
  if(f.volumeTop&&!f.preview)paintNearbyStairCells(f,playerCameraCutaway?.stairCells.get(f.p));
 }
 ctx.globalAlpha=1;
 if(performanceDraw){
  delete performanceDraw.collectPaintBreakdown;
  delete performanceDraw.paintScope;
  finishPaintPass(reachedFaces?'facePaintMs':'groundMs');
  for(const entry of Object.values(performanceDraw.paintBreakdown))entry.ms=roundedMs(entry.ms);
 }
 for(const token of tokens){
  const aura=visibleStandeeAura(token);
  if(aura)drawAreaVolume(aura);
 }
 drawAreaTemplates();
 drawCutter();
 drawFloorEdit();
 drawVolumeHandles();
 drawRoute();
 drawWallRoomLabels();
 drawWallHandles();
 positionMoveActions();
 updateStandeeTally();
 drawStandeeMarks(useStandeeLayer?faces.filter(face=>!face.preview):faces);
 drawFloorElevationLabels();
 if(useStandeeLayer){
  movingStandeeLayer={carry,tokens,pieces,areas,view:standeeLayerViewKey(),lighting:lightingFrame,showLighting,blockers,stationary:faces.filter(face=>!face.preview)};
  paintMovingStandeeLayer(movingStandeeLayer);
 }
 if(separatePlayerStandees){
  const cover=faces.flatMap((face,index)=>face.p&&!face.standee&&!face.shadow&&!face.preview&&
   !face.perimeterOnly&&face.projected?.length>=3&&(!face.pathWall||face.p.opacity===undefined||face.p.opacity>=1)
   ?[[index,face,projectedBounds(face.projected)]]:[]);
  playerStandeeFrame={view:standeeLayerViewKey(),faces:playerStandeeFaces,cover,lighting:showLighting,blockers};
  paintPlayerStandees(topDownStandeePreview);
 }else if(!useStandeeLayer)playerStandeeFrame=null;
 if(pinnedStatus)pinnedStatus=statusMarks.find(mark=>mark.token===pinnedStatus.token&&mark.id===pinnedStatus.id);
 statusTooltip(pinnedStatus);
 const standeeReadouts=drawStandeeNames();
 drawInitiativePing();
 drawBoardPings();
 updateMapHandleLayer(blockers,standeeReadouts);
 updateObjectHandleHover();
 if(!cached?.painted){
  el('topDown').setAttribute('aria-pressed',String(topDown));
  for(const id of ['left','right','lowAngle','isoLock','standeeVisibility'])if(el(id))el(id).hidden=topDown;
  el('lowAngle').disabled=isoLocked;
  el('lowAngle').setAttribute('aria-pressed',String(tilt<=.13));
  drawArcaneEyes();
  drawJournalPins();
  positionCharacterPanel();
 }
 updatePlayCombatStats();
 el('startup').hidden=true;
 if(performanceDraw)finishPaintPass('overlayMs');
 if(performanceDraw)performanceDraw.paintMs=Number(Math.max(0,performance.now()-paintStart-(performanceDraw.lightingMs-paintLighting)).toFixed(2));
 }finally{if(overlap)ctx.restore()}
}
function hit(x,y,exclude=null,surfaceOnly=false,accept=null,includeDoors=false,source=faces){
 for(let index=source.length-1;index>=0;index--){
  const f=source[index];
  if(playerCameraCutaway?.terrain.get(f.p)==='hide'||(f.doorFace||f.fixtureFace)&&!includeDoors||accept&&!accept(f))continue;
  if(f.fogRemembered||f.preview||f.pathWall&&(!includeDoors||!f.pathOpening)||f.canopy!==undefined||(exclude instanceof Set?exclude.has(f.p):exclude&&f.p===exclude)||(surfaceOnly&&(f.z===null||f.p?.type==='column'&&!f.landing)))continue;
  if(f.flatColumn){
   const [a,,c]=f.projected;
   if(((2*x-a[0]-c[0])/(c[0]-a[0]))**2+((2*y-a[1]-c[1])/(c[1]-a[1]))**2<=1)return f;
   continue;
  }
  if(f.flat){
   const [cx,cy,r]=f.flat;
   if((x-cx)**2+(y-cy)**2<=r*r)return f;
   continue;
  }
  if(f.standee){
   const [left,right,base]=f.projected;
   const width=f.baseWidth,cx=(left[0]+right[0])/2;
   if(((x-cx)/(width*.55))**2+((y-base[1])/(width*.22))**2<=1)return f;
   if(f.dead)continue;
  }
  let positive=false,negative=false;
  for(let i=0;i<f.projected.length;i++){
   const a=f.projected[i],b=f.projected[(i+1)%f.projected.length];
   const cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
   positive ||= cross>.01;
   negative ||= cross<-.01;
  }
  if(!(positive&&negative)&&(!topDown||positive||negative))return f;
 }
}
function measurePoint(x,y,f=hit(x,y)){
 if(f?.standee||f?.shadow)return basePoint(f.p);
 if(f?.world){
  for(const indices of [[0,1,2],[0,2,3]]){
   const [i,j,k]=indices,[a,b,c]=indices.map(n=>f.projected[n]);
   const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1];
   const det=ux*vy-uy*vx;
   if(Math.abs(det)<1e-8)continue;
   const u=((x-a[0])*vy-(y-a[1])*vx)/det;
   const v=(ux*(y-a[1])-uy*(x-a[0]))/det;
   if(u>=-.001&&v>=-.001&&u+v<=1.001){
    return f.world[i].map((value,n)=>value*(1-u-v)+f.world[j][n]*u+f.world[k][n]*v);
   }
  }
 }
 return [...inverse(x,y,0),0];
}
function rulerPoint(x,y,free=false){
 const face=hit(x,y);
 if(!free&&(face?.standee||face?.shadow))return basePoint(face.p);
 const [u,v,z]=measurePoint(x,y,free&&(face?.standee||face?.shadow)?hit(x,y,null,true):face);
 return free?[u,v,z]:[Math.floor(u+1e-8)+.5,Math.floor(v+1e-8)+.5,z];
}
function basePoint(p){return [p.x+p.size/2,p.y+p.size/2,p.z]}
// Return the part of a segment that overlaps the open bounds.
function movementInterval(start,end,bounds){
 let low=0,high=1;
 for(let i=0;i<bounds.length;i++){
  const [min,max]=bounds[i],delta=end[i]-start[i];
  if(!delta){if(start[i]<=min||start[i]>=max)return null;continue}
  const a=(min-start[i])/delta,b=(max-start[i])/delta;
  low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));
  if(high-low<1e-8)return null;
 }
 return [low,high];
}
function movementSide(token){
 return token.movementSide==='party'||token.movementSide==='monsters'?token.movementSide:standeeRole(token)==='enemy'?'monsters':'party';
}
function movementTerrainBlock(p){
 if(isFurniture(p))return p.terrainShape.componentKind!=='rug'&&(p.terrainShape.furnMove??true);
 return ['terrace','stone','wall','volume','pillar','bridge','crate'].includes(p.type);
}
function movementPlatformSupports(piece,[x,y,z]){
 return !piece.openingCut&&(!wallVolume(piece)||Math.min(...dimensions(piece).slice(0,2))>0.5)&&
  (piece.groundSurface||piece.stairTread||['volume','terrace','stone','bridge'].includes(piece.type))&&
  Math.abs(piece.z+dimensions(piece)[2]-z)<1e-7&&
  carryPointInsideFloor([x,y],terrainFootprint(piece));
}
function movementSegment(start,end,mover,members=[]){
 const distance=5*Math.hypot(...end.map((v,i)=>v-start[i]));
 if(!mover||!distance)return {cost:distance,hazards:[],blocked:false};
 const half=mover.size/2, height=dimensions(mover)[2],intervals=[];
 const wall=pathWallSolids().find(solid=>wallStopsMovement(solid)&&wallPrismInterval(solid,start,end,0,height));
 if(wall)return {cost:distance,hazards:[],blocked:true,blocker:wall};
 for(const opening of visionObjects()){
  const window=opening.kind==='Window';
  if(opening.shape!=='opening'||(!window&&opening.kind!=='Door'))continue;
  const [x,y,z]=opening.origin;
  const offset=(1-(opening.doorWidth??1))/2;
  const axis=opening.angle===0?1:0;
  const bounds=axis===1?[[x+offset,x+1-offset],[y+.45,y+.55]]:[[x+.45,x+.55],[y+offset,y+1-offset]];
  const interval=movementInterval(start,end,[...bounds,[z+(window?windowBottom(opening):0)-height,z+(window?windowTop(opening):doorLeafHeight(opening))]]);
  if(!interval)continue;
  if(!opening.open)return {cost:distance,hazards:[],blocked:true,blocker:{name:window?'A closed window':'A closed opening'}};
  const plane=opening.origin[axis]+.5;
  const delta=end[axis]-start[axis];
  if(!delta)continue;
  const crossing=(plane-start[axis])/delta;
  if(crossing<interval[0]||crossing>interval[1]||crossing===0)continue;
  if(!window){
   const configured=standeeSizes.findIndex(size=>size.id===opening.doorSize);
   const gap=standeeSizeIndex(mover)-(configured<0?2:configured);
   if(gap>1)return {cost:distance,hazards:[],blocked:true,blocker:{name:'A doorway too small for this standee'}};
   if(gap<=0)continue;
  }
  const length=Math.min(1,5/distance),lo=Math.max(0,Math.min(1-length,crossing-length/2));
  intervals.push([lo,lo+length]);
 }
 if(!mover.flying){
  const stairCrossings=pieces.filter(p=>p.stairTread).flatMap(p=>{
   const [w,d,h]=dimensions(p);
   const span=movementInterval(start.slice(0,2),end.slice(0,2),[[p.x,p.x+w],[p.y,p.y+d]]);
   return span?[{p,span,top:p.z+h}]:[];
  });
  // Include a floor that meets the stair run so a gradual route can step onto
  // that floor before the treads, rather than intersecting its riser as a ramp.
  if(stairCrossings.length)for(const p of pieces){
   if(p.stairTread||p.form||!['volume','terrace','stone','bridge'].includes(p.type))continue;
   const [w,d,h]=dimensions(p),top=p.z+h;
   if(top>Math.max(start[2],end[2])+1e-7||top<Math.min(start[2],end[2])-1e-7)continue;
   const span=movementInterval(start.slice(0,2),end.slice(0,2),[[p.x,p.x+w],[p.y,p.y+d]]);
   if(span&&(Math.abs(top-start[2])<1e-7&&span[0]<1e-7||Math.abs(top-end[2])<1e-7&&span[1]>1-1e-7||stairCrossings.some(t=>t.p.stairTread&&span[0]<=t.span[1]+1e-7&&span[1]>=t.span[0]-1e-7)))stairCrossings.push({p,span,top});
  }
  stairCrossings.sort((a,b)=>a.span[0]-b.span[0]);
  const changingElevation=Math.abs(start[2]-end[2])>1e-7;
  let stairHeight=start[2];
  const walkableStairs=new Set();
  let lastStairSpan=null;
  for(const {p,top,span} of stairCrossings){
   if(p.z>Math.max(start[2],end[2])+height)continue;
   if(top>Math.max(start[2],end[2])+1e-7||top<Math.min(start[2],end[2])-1e-7)continue;
   if(!changingElevation&&top-stairHeight>1+1e-7)return {cost:distance,hazards:[],blocked:true,blocker:p};
   if(stairHeight-top>1+1e-7)continue;
   walkableStairs.add(p);stairHeight=top;lastStairSpan=span;
  }
  for(const p of [...windowApertureTerrain(),...areas.filter(a=>a.kind==='Window'&&a.windowTop&&a.windowTop!=='flat').flatMap(windowWallSections)]){
   if(!movementTerrainBlock(p))continue;
   const [w,d,h]=dimensions(p),top=p.z+h;
   if((mover.size>=3||carry?.light)&&h<=1&&!p.stairTread)continue;
   if(h<=0||p.z>=Math.max(start[2],end[2])+height)continue;
   // A rising or descending path may intersect the riser of its own landing.
   if(changingElevation&&(movementPlatformSupports(p,start)||movementPlatformSupports(p,end)))continue;
   if(p.terrainYaw){
    const path=turnTerrainPoints([start,end],p,-p.terrainYaw),margin=h>1?0:half;
    const span=movementInterval(...path,[[p.x-margin,p.x+w+margin],[p.y-margin,p.y+d+margin],[p.z-height,top]]);
    if(span&&h>1)return {cost:distance,hazards:[],blocked:true,blocker:p};
    if(span)intervals.push(span);
    continue;
   }
   const margin=p.stairTread?0:half;
   const footprint=[[p.x-margin,p.x+w+margin],[p.y-margin,p.y+d+margin]];
   if(walkableStairs.has(p))continue;
   // A straight rising segment intersects a landing's riser even when stairs lead onto its top.
   // Allow the landing only after the center path has reached a connected stair run.
   if(!p.stairTread&&['volume','terrace','stone','bridge'].includes(p.type)&&!p.form&&
    lastStairSpan&&Math.abs(top-end[2])<1e-7&&Math.abs(stairHeight-end[2])<=1+1e-7&&
    end[0]>=p.x&&end[0]<=p.x+w&&end[1]>=p.y&&end[1]<=p.y+d){
    const landingSpan=movementInterval(start.slice(0,2),end.slice(0,2),[[p.x,p.x+w],[p.y,p.y+d]]);
    if(landingSpan&&landingSpan[0]>=lastStairSpan[0]-1e-7&&landingSpan[0]<=lastStairSpan[1]+1e-7)continue;
   }
   if(h>1||p.stairTread){
    // The controlled square can overlap a corner in transit. Check the center path.
    const solid=[[p.x,p.x+w],[p.y,p.y+d],[p.z-height,top]];
    if(movementInterval(start,end,solid))return {cost:distance,hazards:[],blocked:true,blocker:p};
   }else{
    const interval=movementInterval(start,end,[...footprint,[p.z-height,top+1e-8]]);
    if(interval)intervals.push(interval);
   }
  }
 }
 for(const area of areas){
  if(area.shape!=='difficult'||start[2]!==area.origin[2]||end[2]!==area.origin[2])continue;
  const interval=movementInterval(start,end,difficultBounds(area).map(([lo,hi])=>[lo-half,hi+half]));
  if(interval)intervals.push(interval);
 }
 for(const token of tokens){
  if(token===mover||members.includes(token)||standeeHidden(token))continue;
  if(token.conditions?.includes('dead')){
   if(!mover.flying){
    const interval=movementInterval(start,end,[[token.x-half,token.x+token.size+half],[token.y-half,token.y+token.size+half],[token.z-.25,token.z+.25]]);
    if(interval)intervals.push(interval);
   }
   continue;
  }
  if(onStandeePlatform(token,mover,start)||onStandeePlatform(token,mover,end))continue;
  const interval=movementInterval(start,end,[[token.x-half,token.x+token.size+half],[token.y-half,token.y+token.size+half],[token.z-1,token.z+1]]);
  if(!interval)continue;
  if(movementSide(token)!==movementSide(mover))return {cost:distance,hazards:[],blocked:true,blocker:token};
  if(standeeSizeIndex(token)-standeeSizeIndex(mover)<2)intervals.push(interval);
 }
 const hazards=[];
 for(const interval of intervals.sort((a,b)=>a[0]-b[0])){
  const last=hazards.at(-1);
  if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else hazards.push(interval);
 }
 return {cost:distance*(1+hazards.reduce((sum,[a,b])=>sum+b-a,0)),hazards,blocked:false};
}
function carriedMembers(){return carry?.members||[carry?.piece]}
function carriedPosition(member){
 const leader=carry.piece;
 return {...member,x:member.x+ghost.x-leader.x,y:member.y+ghost.y-leader.y,z:member.z+ghost.z-leader.z};
}
function carryPointInsideFloor(point,polygon){
 const tolerance=1e-7;
 return polygon.every(([x,y],index)=>{
  const [u,v]=polygon[(index+1)%polygon.length];
  const dx=u-x,dy=v-y;
  return dx*(point[1]-y)-dy*(point[0]-x)>=-tolerance*Math.hypot(dx,dy);
 });
}
function floorAcceptsDestination(x,y,width,depth,image=importedFloorFootprint()){
 if(![x,y,width,depth].every(Number.isFinite))return false;
 const grid=sceneGrid(),left=Number(grid.floorOriginX)||0,top=Number(grid.floorOriginY)||0;
 const floor=[[left,top],[left+grid.width,top],[left+grid.width,top+grid.depth],[left,top+grid.depth]];
 // The imported artwork can extend beyond the original battlefield. Accept
 // partial squares by their center, while keeping the normal footprint rule.
 if(image&&carryPointInsideFloor(gridToWorld(x+width/2,y+depth/2),image))return true;
 return [[x,y],[x+width,y],[x+width,y+depth],[x,y+depth]]
  .every(([u,v])=>carryPointInsideFloor(gridToWorld(u,v),floor));
}
function validCarryDestination(){
 if(!ghost||!carry)return false;
 const image=importedFloorFootprint();
 if(carry.arcaneEye)return Number.isFinite(ghost.z)&&ghost.z>=0&&floorAcceptsDestination(ghost.x,ghost.y,1,1,image);
 // The GM adjudicates elevation. Route collision is checked independently.
 return carriedMembers().every(member=>{
  const p=carriedPosition(member),[w,d]=dimensions(p);
  return Number.isFinite(p.z)&&p.z>=-1e-7&&floorAcceptsDestination(p.x,p.y,w,d,image);
 });
}
function carrySegment(start,end){
 // Standee moves must be checked against path-wall solids, just like other movement.
 // Only explicit GM override and arcane-eye movement bypass collision checks.
 if(carry?.arcaneEye||carry?.gmMovementOverride)return {cost:5*Math.hypot(...end.map((v,i)=>v-start[i])),hazards:[],blocked:false};
 if(!carry)return movementSegment(start,end);
 const leader=basePoint(carry.piece),members=carriedMembers();
 return members.map(member=>{
  const offset=basePoint(member).map((v,i)=>v-leader[i]);
  const translate=p=>p.map((v,i)=>v+offset[i]);
  return movementSegment(translate(start),translate(end),member,members);
 }).reduce((a,b)=>a.blocked?a:b.blocked||b.cost>a.cost?b:a);
}
function standeeDetour(start,end,blocker){
 const mover=carry.piece,z=start[2];
 if(z!==end[2])return [];
 const half=mover.size/2;
 const bounds=[[blocker.x-half,blocker.x+blocker.size+half],[blocker.y-half,blocker.y+blocker.size+half]];
 const occupied=[...pieces,...tokens];
 let best=[],bestCost=Infinity;
 const corners=bounds[0].flatMap(x=>bounds[1].map(y=>[x,y,z]))
  .filter(([x,y])=>valid({...mover,x:x-half,y:y-half,z},occupied,mover));
 const consider=waypoints=>{
  const points=[start,...waypoints,end];
  const segments=points.slice(1).map((point,i)=>carrySegment(points[i],point));
  if(segments.some(segment=>segment.blocked))return;
  const cost=segments.reduce((sum,segment)=>sum+segment.cost,0);
  if(cost<bestCost){best=waypoints;bestCost=cost}
 };
 for(const corner of corners){
  consider([corner]);
  for(const next of corners){
   if(next!==corner&&(next[0]===corner[0]||next[1]===corner[1]))consider([corner,next]);
  }
 }
 return best;
}
function routeWithDetours(points){
 return points.flatMap((end,i)=>{
  if(!i||carriedMembers().length!==1)return [end];
  const start=points[i-1],direct=carrySegment(start,end);
  if(!direct.blocked)return [end];
  if(direct.blocker.type==='standee')return [...standeeDetour(start,end,direct.blocker),end];
  if(!movementTerrainBlock(direct.blocker))return [end];
  let best=[],bestCost=Infinity;
  for(const door of visionObjects()){
   if(door.shape!=='opening'||door.kind!=='Door'||!door.open)continue;
   const normal=door.angle===0?1:0,along=1-normal;
   const center=[door.origin[0]+.5,door.origin[1]+.5,door.origin[2]];
   const before=start[normal]-center[normal],after=end[normal]-center[normal];
   if(before*after>=0)continue;
   const t=before/(before-after);
   if(Math.abs(start[along]+t*(end[along]-start[along])-center[along])>1||
    Math.abs(start[2]+t*(end[2]-start[2])-center[2])>=.5)continue;
   const clearance=.5+carry.piece.size/2;
   const entry=[...center],exit=[...center];
   entry[normal]+=Math.sign(before)*Math.min(clearance,Math.abs(before));
   exit[normal]+=Math.sign(after)*Math.min(clearance,Math.abs(after));
   const segments=[carrySegment(start,entry),carrySegment(entry,exit),carrySegment(exit,end)];
   if(segments.some(segment=>segment.blocked))continue;
   const cost=segments.reduce((sum,segment)=>sum+segment.cost,0);
   if(cost<bestCost){best=[entry,exit];bestCost=cost}
  }
  // A diagonal can clip a wall even when both squares are clear.
  if(start[2]===end[2]){
   const mover=carry.piece,half=mover.size/2;
   for(const corner of [[start[0],end[1],start[2]],[end[0],start[1],start[2]]]){
    if(!valid({...mover,x:corner[0]-half,y:corner[1]-half,z:corner[2]},undefined,mover))continue;
    const first=carrySegment(start,corner),second=carrySegment(corner,end);
    if(!first.blocked&&!second.blocked&&first.cost+second.cost<bestCost){
     best=[corner];bestCost=first.cost+second.cost;
    }
   }
  }
  return [...best,end];
 });
}
function movementBlocked(){
 if(!carry||!ghost||!route)return false;
 const points=routeWithDetours([...route.points,basePoint(ghost)]);
 return points.slice(1).map((end,i)=>carrySegment(points[i],end)).find(segment=>segment.blocked)?.blocker;
}
function prepareRouteLayer(visible){
 const layer=el('routeOverlay');
 layer.hidden=moveConfirmPending||!visible;
 if(layer.hidden||!W||!H)return null;
 const ratio=Math.min(devicePixelRatio||1,2);
 const width=Math.round(W*ratio),height=Math.round(H*ratio);
 if(layer.width!==width)layer.width=width;
 if(layer.height!==height)layer.height=height;
 const ctx=layer.getContext('2d');
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,W,H);
 return ctx;
}
function drawInitialMoveArrow(x,y){
 const ctx=prepareRouteLayer(true);
 if(!ctx)return;
 const [u,v]=point(...basePoint(carry.piece)),angle=Math.atan2(y-v,x-u);
 ctx.beginPath();ctx.moveTo(u,v);ctx.lineTo(x,y);
 ctx.moveTo(x-11*Math.cos(angle-.5),y-11*Math.sin(angle-.5));ctx.lineTo(x,y);
 ctx.lineTo(x-11*Math.cos(angle+.5),y-11*Math.sin(angle+.5));
 ctx.lineWidth=5;ctx.strokeStyle='#fff2d2';ctx.stroke();
 ctx.lineWidth=2.5;ctx.strokeStyle='#244e67';ctx.stroke();
}
let movementPaintFrame=null;
function cancelMovementPaint(){
 if(movementPaintFrame!==null)cancelAnimationFrame(movementPaintFrame);
 movementPaintFrame=null;
}
function queueMovementPaint(first=false){
 if(movementPaintFrame!==null)return;
 const current=carry;
 const paint=()=>{
  movementPaintFrame=null;
  if(!current||carry!==current||moveConfirmPending)return;
  // v1.491: reuse the last painted scene for immediate drag feedback.
  // A full fog/lighting redraw remains necessary after confirmation.
  if(current.piece?.type==='standee'&&!current.light&&!current.arcaneEye&&
     !movingStandeeLayer&&paintedCamera&&faces.length&&lightingFrame){
   movingStandeeLayer={carry:current,tokens,pieces,areas,view:standeeLayerViewKey(),
    lighting:lightingFrame,showLighting:false,blockers:[],
    stationary:faces.filter(face=>!face.preview)};
  }
  draw(carriedMembers().length>1?'Group movement':'Standee movement');
 };
 // Let the lightweight first arrow reach the screen before rendering the scene.
 movementPaintFrame=requestAnimationFrame(first?()=>{
  movementPaintFrame=requestAnimationFrame(paint);
 }:paint);
}
function drawRoute(){
 const visible=carry&&!route?.end&&route?.points.length===1&&carry.previousRoute?carry.previousRoute:route;
 const ctx=prepareRouteLayer(visible);
 if(!ctx)return;
 const routePoints=visible.end?[...visible.points,visible.end]:visible.points;
 const points=carry?routeWithDetours(routePoints):routePoints;
 let total=0;
 ctx.save();
 ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
 for(let i=0;i<points.length;i++){
  const [x,y]=point(...points[i]);
  if(i){
   const [a,b]=point(...points[i-1]);
   const segment=carrySegment(points[i-1],points[i]);
   total+=segment.cost;
   ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(x,y);ctx.strokeStyle='#fff2d2';ctx.lineWidth=5;ctx.stroke();
   ctx.strokeStyle=segment.blocked?'#a8322b':'#244e67';ctx.lineWidth=2.5;ctx.stroke();
   for(const [lo,hi] of segment.hazards){
    const t=(lo+hi)/2,px=a+(x-a)*t,py=b+(y-b)*t;
    ctx.beginPath();ctx.moveTo(a+(x-a)*lo,b+(y-b)*lo);ctx.lineTo(a+(x-a)*hi,b+(y-b)*hi);ctx.strokeStyle='#a46b1b';ctx.stroke();
    ctx.beginPath();ctx.moveTo(px,py-10);ctx.lineTo(px+9,py+7);ctx.lineTo(px-9,py+7);ctx.closePath();ctx.fillStyle='#f4ce73';ctx.fill();ctx.strokeStyle='#67421c';ctx.stroke();ctx.fillStyle='#432b14';ctx.fillText('!',px,py+2);
   }
  }
  ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#244e67';ctx.fill();
  const label=(Math.round(total/5)*5)+' ft', width=ctx.measureText(label).width+14;
  ctx.fillStyle='#23343d';ctx.fillRect(x-width/2,y-27,width,19);
  ctx.fillStyle='#fff2d2';ctx.fillText(label,x,y-17);
 }
 ctx.restore();
}
function updateCarry(x,y,altKey=false){
 const gridSpell=carry.arcaneEye||carry.light?.spell==='dancing'||carry.piece?.familiarCaster;
 const snap=gridSpell?true:carry.piece?.type==='standee'&&!carry.light?!altKey:null;
 carry.gmMovementOverride=Boolean(altKey&&roomProfile?.gm&&!carry.arcaneEye&&!carry.light&&carry.piece.type==='standee');
 ghost=candidate(x,y,carry.piece,carry.dx,carry.dy,snap,altKey);
 if(carry.arcaneEye){const z=hit(x,y,null,true)?.z??carry.piece.z;const [u,v]=inverse(x,y,z+.65);ghost={...carry.piece,x:Math.floor(u),y:Math.floor(v),z}}
 if(carry.piece?.familiarCaster&&!ghost.stairLanding){
  const offset=(1-carry.piece.size)/2;
  ghost.x+=offset;ghost.y+=offset;
 }
 if(roomProfile?.gm===false&&snap===false&&!carry.light){
  ghost.x=Math.round(ghost.x*8)/8;
  ghost.y=Math.round(ghost.y*8)/8;
 }
 delete ghost.stairLanding;
 route.end=basePoint(ghost);
}
function positionMoveActions(){
 const box=el('moveActions');
 if(!carry||moveConfirmPending){box.hidden=true;return}
 const token=ghost||carry.piece,[x,y]=point(...basePoint(token));
 if(x<0||x>W||y<0||y>H){box.hidden=true;return}
 box.hidden=false;
 box.style.left=Math.max(54,Math.min(W-54,x))+'px';
 box.style.top=Math.max(0,Math.min(H-33,y+S*token.size*.22+8+(standeeName(token)?(20+standeeStatRows(token).length*15)*preferences.standeeReadoutSize/100:0)))+'px';
 el('moveConfirm').disabled=!validCarryDestination()||movementBlocked();
}
function pauseMove(){
 const blocker=movementBlocked();
 if(blocker){message(carryBlockerLabel(blocker)+' blocks this route. Choose a waypoint around it.');draw();return}
 if(!validCarryDestination()){message('That destination is outside the playable floor. Choose another destination.');draw();return}
 carry.paused=true;
 message('Tap '+pathLabel()+' to continue, or hold '+pathLabel()+' and click to add waypoints. Use × or ✓ to finish.');
 positionMoveActions();
 // A camera redraw may have invalidated the previous movement layer.
 // Queue the final position without delaying the confirmation controls.
 if(carry.piece?.type==='standee'&&!carry.light&&!carry.arcaneEye)queueMovementPaint();
}
function resumeMove(){
 if(!carry?.paused||!ghost||!route?.points?.length)return;
 const endpoint=basePoint(ghost),last=route.points.at(-1);
 if(endpoint.some((value,i)=>value!==last[i]))route.points.push(endpoint);
 route.end=null;carry.paused=false;
 message('Move to the next point. Click to pause or use ✓ to confirm.');
 draw();
}
function cancelMove(){
 if(!carry)return;
 route=null;carry=null;ghost=null;drag=null;
 message('Move canceled.');refresh();
}
el('moveCancel').onclick=cancelMove;
el('moveConfirm').onclick=()=>{if(carry)dropCarry()};
let moveConfirmPending=false;
async function dropCarry(){
 if(!carry||moveConfirmPending)return;
 const pendingCarry=carry,confirmedAt=performance.now();
 moveConfirmPending=true;
 el('moveActions').hidden=true;
 el('routeOverlay').hidden=true;
 const dismissed=!carry.light&&!carry.arcaneEye?dismissMovedReadouts(carriedMembers()):null;
 try{
  // One paint opportunity for the confirmation indicator; do not impose
  // a second animation-frame delay on every movement.
  await new Promise(resolve=>requestAnimationFrame(resolve));
  if(carry===pendingCarry)await commitCarry(confirmedAt);
 }finally{
  moveConfirmPending=false;
  if(dismissed&&carry===pendingCarry){
   for(const key of dismissed)currentMoveReadouts().delete(key);
   drawStandeeNames();
  }
  drawRoute();
  positionMoveActions();
  updateObjectHandleHover();
 }
}
function carryBlockerLabel(blocker){
 if(!blocker)return 'An obstacle';
 if(blocker.name)return blocker.name;
 if(blocker.displayName)return blocker.displayName;
 if(blocker.type==='standee')return standeeObscured(blocker)?'An obscured creature':'Another standee';
 if(blocker.wallId||blocker.pathId||blocker.poly)return 'A wall';
 if(movementTerrainBlock(blocker))return 'An obstacle or raised terrain';
 return 'An obstacle';
}
let progressiveLight=null,progressiveLightTimer=null;
let lastProgressiveInput=-Infinity;
for(const type of ['pointerdown','wheel','keydown'])
 window.addEventListener(type,()=>{lastProgressiveInput=performance.now()},{capture:true,passive:true});
function progressiveViewKey(){
 return JSON.stringify([currentSceneId,roomState.sceneId,roomRevision,angle,tilt,zoom,panX,panY,topDown,W,H]);
}
function progressiveLightFrame(action,eligible){
 if(!eligible||action?.startsWith?.('Test: '))return null;
 const key=progressiveViewKey(),signature=lightingFrame.signature;
 if(action==='Confirmed move · medium'){
  progressiveLight={key,signature,phase:'medium',patches:new Map(),faces:new Map(),cursor:0,
   frame:lightingFrame,observer:tokens.find(ownsRoomStandee)};
 }
 const job=progressiveLight;
 if(!job)return null;
 if(job.key!==key||job.signature!==signature){progressiveLight=null;return null}
 job.mediumBudget={remaining:120};
 if(job.phase==='sharp')progressiveLight=null;
 return job;
}
function scheduleProgressiveLightSlice(){
 if(progressiveLightTimer!==null||!progressiveLight)return;
 progressiveLightTimer=setTimeout(runProgressiveLightSlice,24);
}
function runProgressiveLightSlice(){
 progressiveLightTimer=null;
 const job=progressiveLight;
 if(!job)return;
 if(job.key!==progressiveViewKey()||preferences.graphicsQuality!==2){progressiveLight=null;return}
 if(document.hidden||carry||drag||roomMoving||moveConfirmPending||performance.now()-lastProgressiveInput<100){
  scheduleProgressiveLightSlice();return;
 }
 if(!job.queue){
  const eye=job.observer?basePoint(job.observer):null;
  job.queue=[...job.faces.values()];
  if(eye)job.queue.sort((a,b)=>{
   const distance=part=>{const p=part.patches[0][0];return Math.hypot(p[0]-eye[0],p[1]-eye[1],p[2]-eye[2])};
   return distance(a)-distance(b);
  });
 }
 const deadline=performance.now()+6;
 lightingFrame=job.frame;
 try{
  while(job.cursor<job.queue.length&&performance.now()<deadline){
   const face=job.queue[job.cursor],points=face.patches[face.cursor??0];
   const patches=face.shades??=[];
   paintRoundLightPatch(points,null,job.ranges, (target,projected,world)=>{
    const tint=roomLighting(target,job.frame.blockers,true);
    if(tint)patches.push([world,tint]);
   },face.depth,{remaining:21,shadowProbes:5},false,face.offset,job.shadowSample,true);
   face.cursor=(face.cursor??0)+1;
   if(face.cursor===face.patches.length){job.patches.set(face.key,patches);job.cursor++}
  }
 }finally{lightingFrame=null}
 if(job.cursor===job.queue.length){
  job.phase='sharp';
  draw('Confirmed move · Sharp settled');
 }else if(job.phase==='medium'&&job.cursor>=Math.ceil(job.queue.length*.35)){
  job.phase='near';
  draw('Confirmed move · nearby Sharp');
 }
 scheduleProgressiveLightSlice();
}
let confirmedMovementRepaint=null;
function scheduleConfirmedMovementRepaint(action,scene=currentSceneId,preview=null){
 clearTimeout(confirmedMovementRepaint);
 confirmedMovementRepaint=setTimeout(()=>{
  confirmedMovementRepaint=null;
  if(currentSceneId!==scene){
   if(playerStandeePreview===preview)playerStandeePreview=null;
   return;
  }
  if(preview&&playerStandeePreview!==preview)return;
  if(document.hidden||preview?.awaitingFrame||carry||drag||roomMoving||moveConfirmPending||performance.now()-lastProgressiveInput<75){
   scheduleConfirmedMovementRepaint(action,scene,preview);return;
  }
  const workerJob=preview?.workerJob;
  if(workerJob?.pending&&workerJob.cache===fogSectorRayCache&&performance.now()-workerJob.started<webGLFogWarmupBudgetMs){
   scheduleConfirmedMovementRepaint(action,scene,preview);return;
  }
  playerStandeePreview=null;
  const sample=preview?.sample;
  if(sample)sample.confirmToRepaintStartMs=roundedMs(performance.now()-preview.confirmedAt);
  refresh(action);
  if(sample)sample.confirmToRepaintDrawMs=roundedMs(performance.now()-preview.confirmedAt);
 },40);
}
async function commitCarry(confirmedAt=performance.now()){
 const blocker=movementBlocked();
 if(blocker){message(carryBlockerLabel(blocker)+' blocks this route. Choose a waypoint around it.');draw();return}
 if(!validCarryDestination()){message('That destination is outside the playable floor. Choose another destination.');draw();return}
 const piece=carry.piece;
 if(carry.arcaneEye){
  if(roomMoving||playerScenePaused())return;
  roomMoving=true;
  try{
   await customizeRoomObject(carry.arcaneEye,'arcane_eye_move',{x:ghost.x+.5,y:ghost.y+.5,z:ghost.z});
   route=null;carry=null;ghost=null;await pollRoom();refresh();
  }catch(err){message(err.message);await pollRoom()}
  finally{roomMoving=false}
  return;
 }
 if(roomProfile&&!roomProfile.gm){
  if(roomMoving||roomState.paused||!ownsRoomStandee(piece))return;
  roomMoving=true;
  const moveStart=performance.now();
  let preview=null;
  try{
   if(carry.light)await customizeRoomObject(carry.light,'move_light',[ghost.x,ghost.y,ghost.z]);
   else{
    const webgl=studioWebGLEnabled&&!!studioWebGLFrame;
    preview={scene:currentSceneId,token:{...piece,x:ghost.x,y:ghost.y,z:ghost.z},confirmedAt,awaitingFrame:true};
    playerStandeePreview=preview;
    if(paintPlayerStandees()&&!el('performancePanel').hidden){
     preview.sample={renderer:webgl?'WebGL trial':'Standard',confirmToPreviewDrawMs:roundedMs(performance.now()-confirmedAt)};
     standeeInputSamples.push(preview.sample);
     if(standeeInputSamples.length>100)standeeInputSamples.shift();
    }
    // Allow the preview frame to reach the compositor before preparing fog work.
    requestAnimationFrame(()=>{
     preview.awaitingFrame=false;
     if(playerStandeePreview!==preview||currentSceneId!==preview.scene)return;
     if(preview.sample)preview.sample.confirmToPreviewFrameOpportunityMs=roundedMs(performance.now()-confirmedAt);
     const job=queueWorkerSightlines(preview.token,piece);
     if(webgl)preview.workerJob=job;
    });
    await moveRoomStandee(piece,ghost);
    if(currentSceneId===preview.scene)pendingStandeeInput={scene:preview.scene,standee:piece.roomId,confirmedAt};
   }
   const serverMs=performance.now()-moveStart;
   if(!carry.light&&piece.type==='standee'&&route)rememberFogTravel(routeWithDetours([...route.points,basePoint(ghost)]),piece);
   const pollStart=performance.now();
   await pollRoom();
   const pollMs=performance.now()-pollStart;
   route=null;carry=null;ghost=null;
   // v1.545: prioritize browser input before the confirmed sharp-light repaint.
   // Keep the last verified visibility bitmap; never preview undiscovered terrain.
   // Coalesce successive confirmed movements so an obsolete queued repaint
   // cannot compete with a newer position. This does not interrupt an active
   // synchronous draw; a worker/chunked renderer is still needed for that.
   scheduleConfirmedMovementRepaint(preview?'Confirmed move · medium':undefined,preview?.scene??currentSceneId,preview);
   if(performanceDraw)performanceDraw.movementCommit={serverMs:Math.round(serverMs),pollMs:Math.round(pollMs),totalMs:Math.round(performance.now()-moveStart)};
  }catch(err){
   if(preview&&playerStandeePreview===preview){
    playerStandeePreview=null;
    if(currentSceneId===preview.scene)paintPlayerStandees();
   }
   message(err.message);await pollRoom();
  }
  finally{roomMoving=false}
  return;
 }
 if(piece.x!==ghost.x||piece.y!==ghost.y||piece.z!==ghost.z){
  const moves=carriedMembers().map(member=>[member,carriedPosition(member)]);
  remember();for(const [member,next] of moves)Object.assign(member,next);
 }
 route=null;carry=null;ghost=null;message('Move confirmed.');refresh();
}
async function moveRoomStandee(piece,destination){
 const profile=roomProfile,sceneId=roomState.sceneId,testing=roomState.testing,origin=[piece.x,piece.y,piece.z];
 const payload={ticket:profile.token,token_id:piece.roomId,px:destination.x,py:destination.y,pz:destination.z};
 for(let attempt=0;;attempt++){
  try{return await roomRpc('move',{...payload,expected_revision:roomRevision})}
  catch(error){
   if(!error.transient||attempt>=2)throw error;
   await new Promise(resolve=>setTimeout(resolve,roomBackoff(attempt+1,180)));
   if(!await pollRoom()||roomProfile!==profile||roomState.sceneId!==sceneId||roomState.testing!==testing)throw error;
   const current=tokens.find(token=>token.roomId===piece.roomId);
   if(!current||!ownsRoomStandee(current)||roomState.paused)throw error;
   if(current.x===payload.px&&current.y===payload.py&&current.z===payload.pz)return {ok:true};
   if([current.x,current.y,current.z].some((value,i)=>value!==origin[i]))throw error;
  }
 }
}
function coords(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left+(zoomTransformActive?zoomOffset[0]:0),e.clientY-r.top+(zoomTransformActive?zoomOffset[1]:0)]}
function expandBattlemapLayout(layout){
 const {width,depth}=layout.grid??defaultGrid;
 if(layout.version!==1||!Array.isArray(layout.blocks)||layout.blocks.length>width*depth)throw Error('Invalid layout blocks.');
 const terrainTheme=layout.theme||'';
 if(terrainTheme&&!Object.hasOwn(terrainThemes,terrainTheme))throw Error('Unknown terrain theme.');
 const pieces=layout.blocks.map(block=>{
  if(!Array.isArray(block)||block.length!==6||!block.every(Number.isFinite))throw Error('Use [x,y,z,width,depth,height] for blocks.');
  const [x,y,z,w,d,h]=block;
  return {type:'volume',x,y,z,r:0,extents:[w,d,h]};
 });
 if(!Array.isArray(layout.columns??[])||(layout.columns??[]).length>width*depth)throw Error('Invalid columns.');
 for(const column of layout.columns??[]){
  if(!Array.isArray(column)||column.length!==3||!column.every(Number.isInteger))throw Error('Use [x,y,z] for columns.');
  const [x,y,z]=column;pieces.push({type:'column',x:x+.25,y:y+.25,z,r:0});
 }
 const groundStamps={};
 if(!Array.isArray(layout.paths??[])||(layout.paths??[]).length>width*depth)throw Error('Invalid paths.');
 for(const path of layout.paths??[]){
  if(!Array.isArray(path)||path.length!==4||!path.every(Number.isInteger))throw Error('Use [x,y,width,depth] for paths.');
  const [x,y,w,d]=path;
  if(x<0||y<0||w<1||d<1||x+w>width||y+d>depth)throw Error('Path outside the map.');
  for(let a=x;a<x+w;a++)for(let b=y;b<y+d;b++)groundStamps[a+','+b]='cobble';
 }
 return {version:2,grid:layout.grid,pieces,tokens:[],areas:[{shape:'appearance',size:1,angle:0,origin:[0,0,0],appearance:{terrainTheme},groundStamps}]};
}
function terrainGroupPositions(drag,destination){
 const {piece,members}=drag,dx=destination.x-piece.x,dy=destination.y-piece.y,dz=destination.z-piece.z;
 return members.map(p=>({...p,x:p.x+dx,y:p.y+dy,z:p.z+dz}));
}
function furniturePlacementSurface(x,y,exclude){
 const f=hit(x,y,exclude,false,face=>face.z!=null||(
  isFurniture(face.p)&&face.world?.length&&face.world.every(point=>point[2]===face.world[0][2])
 ));
 return f?{...f,z:f.z??f.world[0][2]}:null;
}
function draggedTerrainPosition(x,y,alt){
 const {piece,dx,dy}=drag;
 if(!alt)return candidate(x,y,piece,dx,dy,null,false);
 // Alt-drag must project onto the block's ORIGINAL elevation, not onto
 // whichever raised surface happens to be under the cursor.
 const [u,v]=inverse(x,y,piece.z),[a,b]=inverse(drag.x,drag.y,piece.z);
 const moved={...piece,x:Math.round((piece.x+u-a)*4)/4,y:Math.round((piece.y+v-b)*4)/4};
 if(piece.type!=='volume'||piece.stairTread)return moved;
 const dims=dimensions(moved),epsilon=1e-6;
 // Snap the nearest adjacent face, never overlapping the neighbor.
 let best=null;
 for(const neighbor of pieces){
  if(neighbor===piece||neighbor.type!=='volume'||neighbor.stairTread)continue;
  const other=dimensions(neighbor);
  if(moved.z+dims[2]<=neighbor.z+epsilon||neighbor.z+other[2]<=moved.z+epsilon)continue;
  for(let axis=0;axis<2;axis++){
   const key=axis===0?'x':'y',cross=axis===0?'y':'x',crossAxis=1-axis;
   if(moved[cross]+dims[crossAxis]<=neighbor[cross]+epsilon||neighbor[cross]+other[crossAxis]<=moved[cross]+epsilon)continue;
   for(const edge of [neighbor[key]-dims[axis],neighbor[key]+other[axis]]){
    const distance=Math.abs(moved[key]-edge);
    if(distance<=.5&&(!best||distance<best.distance)){
     const trial={...moved,[key]:edge};
     if(valid(trial,undefined,piece,areas,false,false,false))best={trial,distance};
    }
   }
  }
 }
 return best?.trial??moved;
}
function candidate(x,y,p,dx=0,dy=0,snap=null,alt=false){
 const excluded=drag?.members?new Set(drag.members):carry?.piece||drag?.piece||(visionTool==='moveTerrain'?visionSelection:null);
 let f=hit(x,y,excluded,p.type==='standee'||!!drag?.members);
 if(p.type==='standee'&&!p.flying&&carry&&!carry.light&&!carry.arcaneEye&&
  (p===carry.piece||carry.members?.includes(p))&&(!f?.p||f.p.stairTread)){
  // Fog can remove the lower floor or a tread from render hit testing.
  // Physical surfaces still determine where a walking standee lands.
  f=hit(x,y,excluded,true,null,false,movementSurfaces)??f;
 }
 if(p.type==='column'||sceneryPiece(p)){
  const surface=alt&&isFurniture(p)?furniturePlacementSurface(x,y,excluded):hit(x,y,excluded,true),z=p.type==='ceilingArt'?p.z:surface?.z??0;
  const [a,b]=inverse(x,y,p.type==='ceilingArt'?0:z),offset=p.type==='column'?.25:0;
  if(alt&&p.type==='column'&&!isFurniture(p)){
    const [w,d]=dimensions(p);
    return {...p,x:a-w/2,y:b-d/2,z,freePlacement:true};
   }
   if(alt&&isFurniture(p)){
   const [w,d]=dimensions(p),grab=drag?.piece===p?drag.freeFurnitureGrab:null;
   return {...p,x:a-(grab?.[0]??w/2),y:b-(grab?.[1]??d/2),z};
  }
  return {...p,x:Math.floor(a)-dx+offset,y:Math.floor(b)-dy+offset,z};
 }
 if(carry?.gmMovementOverride&&carry.piece===p){
  const surface=furniturePlacementSurface(x,y,excluded);
  if(isFurniture(surface?.p)){
   const z=surface.z;
   const [a,b]=inverse(x,y,surface.z);
   return {...p,x:a-p.size/2,y:b-p.size/2,z};
  }
 }
 const ground=p.type==='standee'&&el(playing?'playLayer':'layer').value==='ground';
 if(p.type==='standee'&&!ground&&!p.flying&&!carry?.light&&!carry?.arcaneEye){
  const surface=hit(x,y,excluded,false);
  const platform=surface?.standee?surface.p:null;
  if(platform&&standeeSupports(platform,p)){
   const z=platform.z+1,[u,v]=inverse(x,y,z);
   const snapToPlatform=(value,origin)=>Math.round(Math.max(origin,Math.min(origin+platform.size-p.size,Math.floor(value)))*4)/4;
   return {...p,x:snapToPlatform(u,platform.x),y:snapToPlatform(v,platform.y),z};
  }
 }
 const z=p.type==='volume'&&alt?p.z:p.type==='ceilingArt'?p.z:p.flying?p.z:ground?0:(f?.z??(f?.p?f.p.z+dimensions(f.p)[2]:p.type==='standee'?0:p.z));
 const [a,b]=inverse(x,y,p.flying?(carry?.grabPlane??drag?.grabPlane??z):z);
 if(p.type==='standee'&&!ground&&!p.flying&&f?.p?.stairTread){
  const tread=f.p,[w,d]=dimensions(tread);
  const treadCenter=(value,origin,length)=>{
   const inset=Math.min(.125,length/2);
   return Math.max(origin+inset,Math.min(origin+length-inset,Math.floor(value)+.5));
  };
  return {...p,x:treadCenter(a,tread.x,w)-p.size/2,
   y:treadCenter(b,tread.y,d)-p.size/2,z,...(carry?.piece===p?{stairLanding:true}:{})};
 }
 if(snap===true)return {...p,x:Math.floor(a)-Math.round(dx),y:Math.floor(b)-Math.round(dy),z};
 if(snap===false)return {...p,x:a-dx-.5,y:b-dy-.5,z};
 if(p.type==='standee'&&!ground&&!p.flying&&(f?.landing||f?.p?.stairTread))
  return {...p,x:Math.round((a-p.size/2)*4)/4,y:Math.round((b-p.size/2)*4)/4,z};
 return {...p,x:Math.floor(a)-dx,y:Math.floor(b)-dy,z};
}
function remember(withInitiative=false){
 scheduleRoomPatch();redoHistory.length=0;history.push(JSON.stringify({pieces,tokens,areas,...(withInitiative?{initiative:[...initiativeEntries],activeInitiative}:{})}));if(history.length>60)history.shift()}
function canEditDifficultTerrain(){return roomProfile?.gm===false?!roomState.paused:!playing}
function canEditArea(area){
 return Object.hasOwn(areaSizes,area.shape)&&
  (roomProfile?.gm!==false||!roomState.paused&&area.areaOwner===roomProfile.name);
}
function renderRoomPresence(){
 const panel=el('roomPresence');
 panel.hidden=!playing||!roomProfile?.gm;
 if(!panel.hidden)panel.textContent='Online · '+[ (roomProfile.name||'GM')+' (DM)',...(roomState.onlinePlayers||[]) ].join(' · ');
}
function refresh(action){
 if(!currentSceneId&&roomProfile?.gm&&recoveryReady&&!roomState.active&&(pieces.length||tokens.length||areas.length))void ensureNamedWorkingScene();
 scheduleSceneAutosave();
 const wallMenu=el('wallPathMenu');
 if(wallMenu){
  wallMenu.hidden=playing||roomProfile?.gm===false;
  if(wallMenu.hidden&&wallTool){wallTool=null;wallDrag=null;wallPreview=null;el('wallPathPanel').hidden=true}
 }
 updateJoinSharedEncounter();
 renderImagePush();
 const {width,depth}=sceneGrid();
 el('sceneGridLabel').textContent=width+' × '+depth+' squares · '+width*5+' × '+depth*5+' ft';
 renderRoomPresence();
 for(const door of areas)if(door.shape==='opening'&&door.kind==='Door')fitDoorToJambs(door);
 if(roomProfile?.gm!==false)for(const light of areas){
  if(!wallMountedLight(light)||light.freePlacement)continue;
  const placement=wallFixturePlacement(light,light.origin);
  if(placement)Object.assign(light,placement);
 }
 document.body.classList.toggle('dm-laptop',playing&&roomProfile?.gm===true&&dmLaptopPlay);
 if(!canEditFloor())floorEdit=null;
 el('floorEdit').disabled=!canEditFloor();
 el('floorOptions').hidden=!floorEdit;
 if(repeatSource&&(playing||terrainLocked||!pieces.includes(repeatSource)))repeatSource=null;
 el('repeatTerrain').disabled=playing||terrainLocked||!selected||selected.type==='standee'||!!repeatSource;
 el('repeatOptions').hidden=!repeatSource;
 el('repeatApply').disabled=!repeatSource||!repeatPreview.length;
 el('stairsOptions').hidden=brush!=='stairsBrush';
 el('volumeTools').hidden=playing||terrainLocked||selected?.type!=='volume';
 if(cutter&&(playing||terrainLocked||selected!==cutter.target||!pieces.includes(selected)))cutter=null;
 el('cutActions').hidden=!cutter;
 el('volumeShape').disabled=!!cutter;
 el('volumeShape').value=selected?.form||'box';
 el('halfCutter').disabled=el('volumeSubtract').disabled=!!selected?.form||!!cutter;
 for(const button of el('areaChoices').children){
  button.disabled=button.dataset.shape==='difficult'&&!canEditDifficultTerrain();
  button.setAttribute('aria-pressed',String(button.dataset.shape===el('areaShape').value));
 }
 if(!canEditDifficultTerrain()&&el('areaShape').value==='difficult'){el('areaShape').value='line';el('areaShape').onchange()}
 scheduleRoomPatch();
 if(hudToken&&(!tokens.includes(hudToken)||standeeHidden(hudToken)||!hudTorchOnly&&!canSeeStandeeStats(hudToken)))closeStandeeHud();
 applyChatFilters();
 const count=selectedStandees().length;
 el("bulkMarkerButton").hidden=!playing||count<2;
 el("bulkMarkerButton").textContent="Edit markers ("+count+")";
 queueRecovery();
 el("areaTool").setAttribute("aria-pressed",String(areaMode));
 el("areaOptions").hidden=!areaMode;
 el("coneOriginOption").hidden=!conePointAim();
 el("coneAimOption").hidden=!['cone','cone3d'].includes(el("areaShape").value);
 updateInitiativePanel();
 el('selection').textContent=selected?(selected.type==='standee'?selected.name:types[selected.type][0])+' · base '+selected.z*5+' ft · top '+(selected.z+dimensions(selected)[2])*5+' ft':'Select terrain to move it.';
 if(group.size>1)el('selection').textContent=group.size+' terrain pieces selected. Ctrl/Cmd+C to copy or Ctrl/Cmd+X to cut.';
 el('edit').querySelectorAll('button').forEach(b=>b.disabled=!selected);
 for(const kind of ['chamfer','fillet','square','stairsBrush','wash','eraseWash','opaquePaint','eraseOpaquePaint','paintTexture','eraseTexture','paintPattern','erasePattern','hideBasePattern','showBasePattern'])el(kind).setAttribute('aria-pressed',String(brush===kind));
 updateTargetCursor();
 canvas.style.cursor=facingTarget?'crosshair':areaMode?'url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2236%22%20height%3D%2236%22%20viewBox%3D%220%200%2036%2036%22%3E%3Cpath%20d%3D%22M18%202v11m0%2010v11M2%2018h11m10%200h11%22%20stroke%3D%22%23151515%22%20stroke-width%3D%226%22%2F%3E%3Cpath%20d%3D%22M18%202v11m0%2010v11M2%2018h11m10%200h11%22%20stroke%3D%22%23fff%22%20stroke-width%3D%222%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%2218%22%20r%3D%222%22%20fill%3D%22%23fff%22%20stroke%3D%22%23151515%22%2F%3E%3C%2Fsvg%3E") 18 18, crosshair':brush||measuring||carry?'crosshair':'';
 el('mode').checked=playing;
 el('ruler').setAttribute('aria-pressed',String(measuring));
 el('buildTools').hidden=playing||roomProfile?.gm===false;
 if(el('buildTools').hidden&&el('buildCategory').open)el('buildCategory').close();el('playHelp').hidden=!playing;
 el('waypoint').hidden=!carry;
 el('exitTool').hidden=!(brush||tool||tokenTool||panMode||measuring||carry||route||linkingInitiative!==null||areaMode||journalPlacing||facingTarget||repeatSource);
 el('rotate').disabled=!selected||selected.type==='standee';
 el('terrainAngle').disabled=el('rotate').disabled||terrainLocked;
 el('selectedFaceToward').hidden=selected?.type!=='standee';
 el('undo').disabled=!history.length;
 el('redo').disabled=!redoHistory.length;
 el('terrainLock').checked=terrainLocked;
 el('terrainLock').closest('label').hidden=playing||roomProfile?.gm===false;
 for(const b of el('palette').children){b.disabled=terrainLocked;b.classList.toggle('active',b.dataset.type===tool)}
 for(const id of ['chamfer','fillet','square','stairsBrush','wash','eraseWash','opaquePaint','eraseOpaquePaint','paintTexture','eraseTexture','paintPattern','erasePattern','hideBasePattern','showBasePattern'])el(id).disabled=terrainLocked;
 refreshTexturePalette();
 draw(action);
}
function message(s){el('hint').textContent=s}
let targetCursorPointer=null;
function updateTargetCursor(event){
 if(event)targetCursorPointer={clientX:event.clientX,clientY:event.clientY};
 const icon=el('targetCursor');
 if(!facingTarget||!targetCursorPointer){icon.hidden=true;return}
 event=targetCursorPointer;
 const bounds=canvas.parentElement.getBoundingClientRect();
 icon.style.left=event.clientX-bounds.left+'px';icon.style.top=event.clientY-bounds.top+'px';
 icon.hidden=false;
}
canvas.addEventListener('pointermove',updateTargetCursor);
canvas.addEventListener('pointerleave',()=>{targetCursorPointer=null;updateTargetCursor()});
for(const [type,[name,w,d,h,cap]] of Object.entries(types)){
 if(sceneryPiece({type}))continue;
 const b=document.createElement('button');b.dataset.type=type;
 b.innerHTML='<i class="swatch" style="background:'+cap+'"></i>'+name+'<span>'+w+' × '+d+' squares · '+(h?h*5+' ft high':'flush with surface')+'</span>';
 b.onclick=()=>{componentPlacement=null;measuring=false;route=null;panMode=false;el('pan').classList.toggle('active',false);brush=null;tokenTool=null;tool=tool===type?null:type;selected=null;group.clear();ghost=null;message(tool?'Click a surface to place '+name.toLowerCase()+'. Esc cancels.':'Drag terrain to move it. Drag open ground to pan. Middle-drag to rotate.');refresh()};
 el('palette').append(b);
}
function placeToken(token){
 if(playing)return;
 measuring=false;route=null;
 panMode=false;el('pan').classList.toggle('active',false);brush=null;
 tool=null;tokenTool={...token,...(baseStandeeRole(token)==='enemy'&&token.darkvision==null&&token.blindsight==null?{darkvision:60}:{})};selected=null;group.clear();ghost=null;
 message('Click a destination for '+token.name+'. Esc cancels.');refresh();
}
el('heroes').onclick=()=>placeToken({name:'Adventurer',icon:'⚔',color:'#e0b36a'});
el('monsters').onclick=()=>placeToken({name:'Goblin',icon:'◆',color:'#a4bf72'});
let importLook=null;
el('art').onclick=()=>{
 importLook={name:'Default',front:'',back:'',sameImage:false};
 el('importStandeeName').value='';el('importArtError').textContent='';
 updateImportLook();
 el('importStandeeDialog').showModal();
};
function updateImportLook(){
 el('importFrontStatus').textContent=importLook.front?'Front ready':'Front required';
 el('importBackStatus').textContent=importLook.back?'Back ready':'Back optional';
 el('importStandeePlace').disabled=!importLook.front;
}
for(const [id,side] of [['importFront','front'],['importBack','back']]){
 el(id).onclick=()=>{uploadSide=side;el('defaultImageFile').click()};
}
el('importStandeeDialog').onclose=()=>{importLook=null};
el('importStandeeCancel').onclick=()=>el('importStandeeDialog').close();
el('importStandeeForm').onsubmit=e=>{
 e.preventDefault();
 if(!importLook?.front)return;
 const name=el('importStandeeName').value.trim()||'Imported standee';
 placeToken({name,icon:'◆',color:'#dbb66d',looks:[{...importLook,sameImage:!importLook.back}],activeLook:0});
 el('importStandeeDialog').close();
};
function foldedHalf(image,{x,y,width,height,turns}){
 const tile=document.createElement('canvas'),sideways=turns%2;
 tile.width=sideways?height:width;tile.height=sideways?width:height;
 const paint=tile.getContext('2d',{willReadFrequently:true});
 paint.translate(tile.width/2,tile.height/2);
 paint.rotate(turns*Math.PI/2);
 paint.drawImage(image,x,y,width,height,-width/2,-height/2,width,height);
 height=tile.height;
 const {data}=paint.getImageData(0,0,tile.width,height);
 // Some transparent print sheets have opaque black borders and fold guides.
 const hasPrintBorder=data[3]===255&&data[0]+data[1]+data[2]===0&&
  data.some((value,index)=>index%4===3&&value===0);
 let left=tile.width,right=-1,top=height,bottom=-1;
 for(let row=0;row<height;row++){
  for(let col=0;col<tile.width;col++){
   const pixel=(row*tile.width+col)*4;
   if(!data[pixel+3]||(hasPrintBorder&&Math.max(data[pixel],data[pixel+1],data[pixel+2])<=12))continue;
   left=Math.min(left,col);right=Math.max(right,col);
   top=Math.min(top,row);bottom=Math.max(bottom,row);
  }
 }
 if(right<left)throw new Error('Both halves need artwork.');
 if(hasPrintBorder){
  left=Math.max(0,left-3);right=Math.min(tile.width-1,right+3);
  top=Math.max(0,top-3);bottom=Math.min(height-1,bottom+3);
 }
 return {tile,left,top,width:right-left+1,height:bottom-top+1};
}
function foldedRegions({width,height},layout){
 if(layout==='side-by-side'){
  const half=Math.floor(width/2);
  if(!half)throw new Error('The image needs a left and right half.');
  return [{x:0,y:0,width:half,height,turns:0},{x:width-half,y:0,width:half,height,turns:0}];
 }
 const half=Math.floor(height/2);
 if(!half)throw new Error('The image needs a top and bottom half.');
 return [{x:0,y:height-half,width,height:half,turns:0},{x:0,y:0,width,height:half,turns:2}];
}
function alignFoldedViews(originals,trims){
 const halves=originals.map((half,i)=>{
  const [left,right,top,bottom]=trims[i];
  const x=Math.min(left,half.width-1),y=Math.min(top,half.height-1);
  return {...half,left:half.left+x,top:half.top+y,
   width:Math.max(1,half.width-x-right),height:Math.max(1,half.height-y-bottom)};
 });
 const width=Math.max(...halves.map(half=>half.width)),height=Math.max(...halves.map(half=>half.height));
 const scale=Math.min(1,576/Math.max(width,height));
 return halves.map(half=>{
  const tile=document.createElement('canvas');
  tile.width=Math.ceil(width*scale);tile.height=Math.ceil(height*scale);
  const w=half.width*scale,h=half.height*scale;
  tile.getContext('2d').drawImage(half.tile,half.left,half.top,half.width,half.height,(tile.width-w)/2,tile.height-h,w,h);
  return tile;
 });
}
let foldedDraft=null,foldedLook=null,foldedUploading=false;
const foldedTrimGroups=['Front','Back'].map(side=>['Left','Right','Top','Bottom'].map(edge=>'folded'+side+edge));
const foldedTrimIds=foldedTrimGroups.flat();
function previewFoldedStandee(){
 if(!foldedDraft?.halves)return;
 [foldedDraft.front,foldedDraft.back]=alignFoldedViews(foldedDraft.halves,foldedTrimGroups.map(ids=>ids.map(id=>Math.max(0,Math.trunc(Number(el(id).value)||0)))));
 for(const [id,view] of [['foldedFront',foldedDraft.front],['foldedBack',foldedDraft.back]]){
  const tile=el(id),paint=tile.getContext('2d');
  const scale=Math.min(tile.width/view.width,tile.height/view.height);
  const width=view.width*scale,height=view.height*scale;
  paint.clearRect(0,0,tile.width,tile.height);
  paint.drawImage(view,(tile.width-width)/2,tile.height-height,width,height);
 }
}
el('foldedArt').onclick=()=>{foldedLook=null;el('foldedFile').click()};
el('uploadFoldedLook').onclick=()=>{
 if(!readLook())return;
 foldedLook=artDraft;el('foldedFile').click();
};
el('foldedFile').onchange=e=>{
 const file=e.target.files[0];e.target.value='';
 return openFoldedImage(file,foldedLook);
};
async function openFoldedImage(file,lookDraft){
 if(el('foldedDialog').open||foldedUploading)return;
 if(!file)return;
 let image;
 try{
  if(file.size>8000000||!['image/png','image/webp'].includes(file.type))throw new Error('Choose a PNG or WebP under 8 MB.');
  image=await createImageBitmap(file);
  if(image.width>6000||image.height>6000)throw new Error('Choose an image up to 6,000 pixels per side.');
  if(el('foldedDialog').open||lookDraft&&(artDraft!==lookDraft||artDraft.index!==0))return;
  foldedDraft={name:file.name.replace(/\.[^.]+$/,''),image,lookDraft};
  image=null;
  el('foldedLayout').value=foldedDraft.image.width>foldedDraft.image.height?'side-by-side':'stacked';
  el('foldedLayout').onchange();
  el('foldedDialog').showModal();
 }catch(error){message(error.message||'Could not open the folded standee image.')}
 finally{image?.close()}
};
function rebuildFoldedPreviews(){
 const draft=foldedDraft;
 if(!draft||draft.uploading)return;
 draft.halves=null;draft.front=draft.back=null;
 el('foldedUse').disabled=true;
 for(const id of ['foldedFront','foldedBack']){
  const canvas=el(id);canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
 }
 try{
  draft.regions??=foldedRegions(draft.image,el('foldedLayout').value);
  draft.halves=draft.regions.map(region=>foldedHalf(draft.image,region));
  previewFoldedStandee();
  el('foldedStatus').textContent='';el('foldedUse').disabled=false;
 }catch(error){el('foldedStatus').textContent=error.message}
}
el('foldedLayout').onchange=()=>{
 if(!foldedDraft||foldedDraft.uploading)return;
 foldedDraft.regions=null;
 for(const id of foldedTrimIds)el(id).value=0;
 rebuildFoldedPreviews();
};
for(const [id,index] of [['foldedRotateFront',0],['foldedRotateBack',1]])el(id).onclick=()=>{
 const region=foldedDraft?.regions?.[index];
 if(!region||foldedDraft.uploading)return;
 region.turns=(region.turns+1)%4;
 for(const trim of foldedTrimGroups[index])el(trim).value=0;
 rebuildFoldedPreviews();
};
el('foldedSwap').onclick=()=>{
 if(!foldedDraft?.halves||foldedDraft.uploading)return;
 foldedDraft.regions.reverse();
 foldedDraft.halves.reverse();
 foldedTrimGroups[0].forEach((id,i)=>{
  const front=el(id),back=el(foldedTrimGroups[1][i]);
  [front.value,back.value]=[back.value,front.value];
 });
 previewFoldedStandee();
};
for(const id of foldedTrimIds)el(id).oninput=previewFoldedStandee;
el('foldedCancel').onclick=()=>el('foldedDialog').close();
el('foldedDialog').onclose=()=>{foldedDraft?.image.close();foldedDraft=null};
async function hostStandeeImages(images, button, status=button){
 if(!roomProfile?.gm)throw Error('Sign in as GM to upload standee art.');
 button.disabled=true;
 const label=button.textContent;
 status.textContent='Uploading…';
 try{
  const response=await fetch(new URL('/functions/v1/standee-art',roomApi),{
   method:'POST',headers:{apikey:roomKey,'Content-Type':'application/json'},
   body:JSON.stringify({ticket:roomProfile.token,images}),signal:AbortSignal.timeout(30000)
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Artwork upload failed.');
  const prefix=new URL('art/standees/',location.href).href;
  if(result.urls?.length!==images.length||!result.urls.every(url=>url.startsWith(prefix)))throw Error('Invalid artwork URL.');
  status.textContent='Waiting for GitHub Pages…';
  for(let attempt=0;attempt<20;attempt++){
   const ready=await Promise.all([...new Set(result.urls)].map(async url=>{
    try{return (await fetch(url,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(5000)})).ok}catch{return false}
   }));
   if(ready.every(Boolean))return result.urls;
   await new Promise(resolve=>setTimeout(resolve,3000));
  }
  throw Error('Artwork is still publishing. Try again shortly to use the same upload.');
 }finally{button.disabled=false;status.textContent=status===button?label:''}
}
el('foldedUse').onclick=async()=>{
 const draft=foldedDraft;
 if(!draft?.front||!draft.back||draft.uploading)return;
 const {name,front,back,lookDraft}=draft;
 const look={name:'Default',front:front.toDataURL('image/webp',.88),back:back.toDataURL('image/webp',.88)};
 if(!uploadedStandeeImage(look.front)||!uploadedStandeeImage(look.back))return;
 const editorIds=['foldedLayout','foldedSwap','foldedRotateFront','foldedRotateBack',...foldedTrimIds];
 foldedUploading=draft.uploading=true;
 for(const id of editorIds)el(id).disabled=true;
 try{[look.front,look.back]=await hostStandeeImages([look.front,look.back],el('foldedUse'),el('foldedStatus'))}
 catch(error){if(foldedDraft===draft)el('foldedStatus').textContent=error.message;return}
 finally{
  foldedUploading=draft.uploading=false;
  for(const id of editorIds)el(id).disabled=false;
 }
 if(foldedDraft!==draft||lookDraft&&artDraft!==lookDraft)return;
 el('foldedDialog').close();
 if(lookDraft){
  Object.assign(lookDraft.looks[0],{front:look.front,back:look.back,sameImage:false});
  showLook();draw();
 }else placeToken({name,icon:'◆',color:'#dbb66d',looks:[look],activeLook:0});
};
const assetArchives=[["PaperForge_01_GoblinWarrior_Free.zip","Humanoids","Free",""],["PaperForge_01_GoblinWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge_01_GoblinWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge_02_GoblinArcher_Free.zip","Humanoids","Free",""],["PaperForge_02_GoblinArcher_Tier1.zip","Humanoids","Copper",""],["PaperForge_02_GoblinArcher_Tier2.zip","Humanoids","Iron",""],["PaperForge03_GoblinSpearman_Free.zip","Humanoids","Free",""],["PaperForge03_GoblinSpearman_Tier1.zip","Humanoids","Copper",""],["PaperForge03_Goblin_Spearman_Tier2.zip","Humanoids","Iron",""],["PaperForge04_GoblinElder_Free.zip","Humanoids","Free",""],["PaperForge04_GoblinElder_Tier1.zip","Humanoids","Copper",""],["PaperForge04_GoblinElder_Tier2.zip","Humanoids","Iron",""],["PaperForge05_Goblin_Boss_Free.zip","Humanoids","Free",""],["PaperForge05_Goblin_Boss_Tier1.zip","Humanoids","Copper",""],["PaperForge05_Goblin_Boss_Tier2.zip","Humanoids","Iron",""],["PaperForge06_Barbarian_Free.zip","Other / review","Free",""],["PaperForge06_Barbarian_Tier1.zip","Other / review","Copper",""],["PaperForge06_Barbarian_Tier2.zip","Other / review","Iron",""],["PaperForge07_Spectator_Free.zip","Other / review","Free",""],["PaperForge07_Spectator_Tier1 .zip","Other / review","Copper",""],["PaperForge07_Spectator_Tier2 .zip","Other / review","Iron",""],["PaperForge08_Ghast_Free.zip","Undead","Free",""],["PaperForge08_Ghast_Tier1.zip","Undead","Copper",""],["PaperForge08_Ghast_Tier2.zip","Undead","Iron",""],["PaperForge09_Kobold_Free.zip","Humanoids","Free",""],["PaperForge09_Kobold_Tier1.zip","Humanoids","Copper",""],["PaperForge09_Kobold_Tier2.zip","Humanoids","Iron",""],["PaperForge10_KoboldSorcerer_Free.zip","Humanoids","Free",""],["PaperForge10_KoboldSorcerer_Tier1.zip","Humanoids","Copper",""],["PaperForge10_KoboldSorcerer_Tier2.zip","Humanoids","Iron",""],["PaperForge11_WingedKobold_Free.zip","Humanoids","Free",""],["PaperForge11_WingedKobold_Tier1.zip","Humanoids","Copper",""],["PaperForge11_WingedKobold_Tier2.zip","Humanoids","Iron",""],["PaperForge12_Ogre_Free.zip","Giants","Free",""],["PaperForge12_Ogre_Tier1.zip","Giants","Copper",""],["PaperForge12_Ogre_Tier2.zip","Giants","Iron",""],["PaperForge13_HumanThief_Free.zip","Humanoids","Free",""],["PaperForge13_HumanThief_Tier1.zip","Humanoids","Copper",""],["PaperForge13_HumanThief_Tier2.zip","Humanoids","Iron",""],["PaperForge14_HalflingAssassin_Free.zip","Humanoids","Free",""],["PaperForge14_HalflingAssassin_Tier1.zip","Humanoids","Copper",""],["Paperforge14_HalflingAssassin_Tier2.zip","Humanoids","Iron",""],["PaperForge15_BEAR_Free.zip","Beasts","Free",""],["PaperForge15_Bear_Tier1.zip","Beasts","Copper",""],["PaperForge15_Bear_Tier2.zip","Beasts","Iron",""],["Paperforge16_Wolf_Free.zip","Beasts","Free",""],["Paperforge16_Wolf_Tier1.zip","Beasts","Copper",""],["Paperforge16_Wolf_Tier2.zip","Beasts","Iron",""],["PaperForge17_BanditsPack_Free.zip","Humanoids","Free",""],["PaperForge17_BanditsPack_Tier1.zip","Humanoids","Copper",""],["PaperForge17_BanditsPack_Tier2-1.zip","Humanoids","Iron",""],["PaperForge18_Panther_Free.zip","Beasts","Free",""],["PaperForge18_Panther_Tier1.zip","Beasts","Copper",""],["PaperForge18_Panther_Tier2.zip","Beasts","Iron",""],["PaperForge19_GiantSnake_Free.zip","Giants","Free",""],["PaperForge19_GiantSnake_Tier1.zip","Giants","Copper",""],["PaperForge19_GiantSnake_Tier2.zip","Giants","Iron",""],["PaperForge20_Erinyes_Free.zip","Other / review","Free",""],["PaperForge20_Erinyes_Tier1.zip","Other / review","Copper",""],["PaperForge20_Erinyes_Tier2.zip","Other / review","Iron",""],["PaperForge21_Griffon_Free.zip","Monstrosities","Free",""],["PaperForge21_Griffon_Tier1.zip","Monstrosities","Copper",""],["PaperForge21_Griffon_Tier2.zip","Monstrosities","Iron",""],["PaperForge22_DwarfFighter_Free.zip","Humanoids","Free",""],["PaperForge22_DwarfFighter_Tier1.zip","Humanoids","Copper",""],["PaperForge22_DwarfFighter_Tier2.zip","Humanoids","Iron",""],["PaperForge23_Monk_Free.zip","Humanoids","Free",""],["PaperForge23_Monk_Tier1.zip","Humanoids","Copper",""],["PaperForge23_Monk_Tier2.zip","Humanoids","Iron",""],["PaperForge24_DwarfFighter#2_Tier1.zip","Humanoids","Copper",""],["PaperForge24_DwarfFighter#2_Tier2.zip","Humanoids","Iron",""],["PaperForge25__Owlbear_Free.zip","Monstrosities","Free",""],["PaperForge25_Owlbear_Tier1.zip","Monstrosities","Copper",""],["PaperForge25_Owlbear_Tier2.zip","Monstrosities","Iron",""],["PaperForge26_Knight_Tier1.zip","Humanoids","Copper",""],["PaperForge26_Knight_Tier2.zip","Humanoids","Iron",""],["PaperForge27_Bard_Free.zip","Other / review","Free",""],["PaperForge27_Bard_Tier1.zip","Other / review","Copper",""],["PaperForge27_Bard_Tier2.zip","Other / review","Iron",""],["PaperForge28_Barlgura_Free.zip","Fiends","Free",""],["PaperForge28_Barlgura_Tier1.zip","Fiends","Copper",""],["PaperForge28_Barlgura_Tier2.zip","Fiends","Iron",""],["PaperForge29_Centaur_Free.zip","Other / review","Free",""],["PaperForge29_Centaur_Tier1.zip","Other / review","Copper",""],["PaperForge29_Centaur_Tier2.zip","Other / review","Iron",""],["PaperForge30_Ninja_Free.zip","Other / review","Free",""],["PaperForge30_Ninja_Tier1.zip","Other / review","Copper",""],["PaperForge30_Ninja_Tier2.zip","Other / review","Iron",""],["PaperForge31_Manes_Free.zip","Other / review","Free",""],["PaperForge31_Manes_Tier1.zip","Other / review","Copper",""],["PaperForge31_Manes_Tier2.zip","Other / review","Iron",""],["PaperForge31_Manes_Tier3.zip","Other / review","Steel",""],["PaperForge32_GnollHunter_ Free.zip","Other / review","Free",""],["PaperForge32_GnollHunter_ Tier1.zip","Other / review","Copper",""],["PaperForge32_GnollHunter_Tier2.zip","Other / review","Iron",""],["PaperForge33_GnollWarrior_Free.zip","Humanoids","Free",""],["PaperForge33_GnollWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge33_GnollWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge34_Flind_Free.zip","Other / review","Free",""],["PaperForge34_Flind_Tier1.zip","Other / review","Copper",""],["PaperForge34_Flind_Tier2.zip","Other / review","Iron",""],["PaperForge35_GnollCaster_Free.zip","Other / review","Free",""],["PaperForge35_GnollCaster_Tier1.zip","Other / review","Copper",""],["PaperForge35_GnollCaster_Tier2.zip","Other / review","Iron",""],["PaperForge36_Hyena_Free.zip","Other / review","Free",""],["PaperForge36_Hyena_Tier1.zip","Other / review","Copper",""],["PaperForge36_Hyena_Tier2.zip","Other / review","Iron",""],["PaperForge37_GnollWhiterling_Free.zip","Other / review","Free",""],["PaperForge37_GnollWhiterling_Tier1.zip","Other / review","Copper",""],["PaperForge37_GnollWhiterling_Tier2.zip","Other / review","Iron",""],["PaperForge38_Shoosuva_Free.zip","Other / review","Free",""],["PaperForge38_Shoosuva_Tier1.zip","Other / review","Copper",""],["PaperForge38_Shoosuva_Tier2.zip","Other / review","Iron",""],["PaperForge39_Leucrotta_Free.zip","Other / review","Free",""],["PaperForge39_Leucrotta_Tier1.zip","Other / review","Copper",""],["PaperForge39_Leucrotta_Tier2.zip","Other / review","Iron",""],["PaperForge40__VistanaTiefling__free.zip","Humanoids","Free",""],["PaperForge40__VistanaTiefling__Tier1.zip","Humanoids","Copper",""],["PaperForge40__VistanaTiefling__Tier2.zip","Humanoids","Iron",""],["PaperForge41_GiantGnoll_Free.zip","Giants","Free",""],["PaperForge41_GiantGnoll_Tier1.zip","Giants","Copper",""],["PaperForge41_GiantGnoll_Tier2.zip","Giants","Iron",""],["PaperForge42_TreasureGoblin_Free.zip","Humanoids","Free",""],["PaperForge42_TreasureGoblin_Tier1.zip","Humanoids","Copper",""],["PaperForge42_TreasureGoblin_Tier2.zip","Humanoids","Iron",""],["PaperForge43_Samurai_Free.zip","Other / review","Free",""],["PaperForge43_Samurai_Tier1.zip","Other / review","Copper",""],["PaperForge43_Samurai_Tier2.zip","Other / review","Iron",""],["PaperForge44_Worg_Free.zip","Other / review","Free",""],["PaperForge44_Worg_Tier1.zip","Other / review","Copper",""],["PaperForge44_Worg_Tier2.zip","Other / review","Iron",""],["PaperForge45_WorgRiders_Free.zip","Other / review","Free",""],["PaperForge45_WorgRiders_Tier1.zip","Other / review","Copper",""],["PaperForge45_WorgRiders_Tier2.zip","Other / review","Iron",""],["PaperForge46_Centaur2_Free.zip","Other / review","Free",""],["PaperForge46_Centaur2_Tier1.zip","Other / review","Copper",""],["PaperForge46_Centaur2_Tier2.zip","Other / review","Iron",""],["PaperForge47_Minotaur_Free.zip","Monstrosities","Free",""],["PaperForge47_Minotaurs_Tier1.zip","Monstrosities","Copper",""],["PaperForge47_Minotaurs_Tier2.zip","Monstrosities","Iron",""],["PaperForge48_Barbarian_Free.zip","Other / review","Free",""],["PaperForge48_Barbarian_Tier1.zip","Other / review","Copper",""],["PaperForge48_Barbarian_Tier2.zip","Other / review","Iron",""],["PaperForge_49_50_51(Wererat Pack)_Free.zip","Beasts","Free",""],["PaperForge_49_50_51(Wererat Pack)_Tier1.zip","Beasts","Copper",""],["PaperForge_49_50_51(Wererat Pack)_Tier2.zip","Beasts","Iron",""],["PaperForge52_Werewolf(Humanoid)_Free.zip","Beasts","Free",""],["PaperForge52_Werewolf(Humanoid)_Tier1.zip","Beasts","Copper",""],["PaperForge52_Werewolf(Humanoid)_Tier2.zip","Beasts","Iron",""],["Paperforge53_Werewolf(Hybrid)_Free.zip","Beasts","Free",""],["Paperforge53_Werewolf(Hybrid)_Tier1.zip","Beasts","Copper",""],["Paperforge53_Werewolf(Hybrid)_Tier2.zip","Beasts","Iron",""],["PaperForge54_Wolf_Free.zip","Beasts","Free",""],["PaperForge54_Wolf_Tier1.zip","Beasts","Copper",""],["PaperForge54_Wolf_Tier2.zip","Beasts","Iron",""],["PaperForge55_DireWolf_Tier1.zip","Beasts","Copper",""],["PaperForge55_DireWolf_Tier2.zip","Beasts","Iron",""],["PaperForge56_LargeBear_Free.zip","Beasts","Free",""],["PaperForge56_LargeBear_Tier1.zip","Beasts","Copper",""],["PaperForge56_LargeBear_Tier2.zip","Beasts","Iron",""],["PaperForge57_MediumBear_Tier1.zip","Beasts","Copper",""],["PaperForge57_MediumBear_Tier2.zip","Beasts","Iron",""],["PaperForge58_HumanoidWerebear_Free.zip","Beasts","Free",""],["PaperForge58_HumanoidWerebear_Tier1.zip","Beasts","Copper",""],["PaperForge58_HumanoidWerebear_Tier2.zip","Beasts","Iron",""],["PaperForge59_HybridWerebear_Free.zip","Beasts","Free",""],["PaperForge59_HybridWerebear_Tier1.zip","Beasts","Copper",""],["PaperForge59_HybridWerebear_Tier2.zip","Beasts","Iron",""],["PaperForge60_WereTiger(Humanoid)_Free.zip","Beasts","Free",""],["PaperForge60_WereTiger(Humanoid)_Tier1.zip","Beasts","Copper",""],["PaperForge60_WereTiger(Humanoid)_Tier2.zip","Beasts","Iron",""],["PaperForge61_HeadlessHorseman_Free.zip","Beasts","Free",""],["PaperForge61_HeadlessHorseman_Tier1.zip","Beasts","Copper",""],["PaperForge61_HeadlessHorseman_Tier2.zip","Beasts","Iron",""],["PaperForge62_FlamingHorseman_Tier1.zip","Beasts","Copper",""],["PaperForge62_FlamingHorseman_Tier2.zip","Beasts","Iron",""],["PaperForge63_Kraken_Free.zip","Monstrosities","Free",""],["PaperForge63_Kraken_Tier1.zip","Monstrosities","Copper",""],["PaperForge63_Kraken_Tier2.zip","Monstrosities","Iron",""],["PaperForge63_Kraken_Tier3.zip","Monstrosities","Steel",""],["PaperForge64_WereTiger(Hybrid)_Free.zip","Beasts","Free",""],["PaperForge64_WereTiger(Hybrid)_Tier1.zip","Beasts","Copper",""],["PaperForge64_WereTiger(Hybrid)_Tier2.zip","Beasts","Iron",""],["Paperforge65_Zombies_Free.zip","Undead","Free",""],["Paperforge65_Zombies_Tier1.zip","Undead","Copper",""],["Paperforge65_Zombies_Tier2.zip","Undead","Iron",""],["Paperforge65_Zombies_Tier3.zip  -           Paperforge65_ZombiesReskinMagic_Tier3.zip","Undead","Steel",""],["Paperforge66_Necromancer_Free.zip","Other / review","Free",""],["Paperforge66_Necromancer_Tier1.zip","Other / review","Copper",""],["Paperforge66_Necromancer_Tier2.zip","Other / review","Iron",""],["Paperforge66_Necromancer_Tier3.zip  -         Paperforge66_NecromancerReskinMagic_Tier3.zip","Other / review","Steel",""],["PaperForge67_Tiger_Free.zip","Beasts","Free",""],["PaperForge67_Tiger_Tier1.zip","Beasts","Copper",""],["PaperForge67_Tiger_Tier2.zip","Beasts","Iron",""],["PaperForge68_Werecrocodile_Free.zip","Beasts","Free",""],["PaperForge68_Werecrocodile_Tier1.zip","Beasts","Copper",""],["PaperForge68_Werecrocodile_Tier2.zip","Beasts","Iron",""],["PaperForge69_ArmoredWereCroc_Free.zip","Beasts","Free",""],["PaperForge69_ArmoredWereCroc_Tier1.zip","Beasts","Copper",""],["PaperForge69_ArmoredWereCroc_Tier2.zip","Beasts","Iron",""],["PaperForge70_Crocodile_Free.zip","Beasts","Free",""],["PaperForge70_Crocodile_Tier1.zip","Beasts","Copper",""],["PaperForge70_Crocodile_Tier2.zip","Beasts","Iron",""],["PaperForge71_WereCrocodile(Humanoid)_Free.zip","Beasts","Free",""],["PaperForge71_WereCrocodile(Humanoid)_Tier1.zip","Beasts","Copper",""],["PaperForge71_WereCrocodile(Humanoid)_Tier2.zip","Beasts","Iron",""],["PaperForge72_DragonbornPaladin_Free.zip","Humanoids","Free",""],["PaperForge72_DragonbornPaladin_Tier1.zip","Humanoids","Copper",""],["PaperForge72_DragonbornPaladin_Tier2.zip","Humanoids","Iron",""],["PaperForge73_DragonbornRanger_Free.zip","Humanoids","Free",""],["PaperForge73_DragonbornRanger_Tier1.zip","Humanoids","Copper",""],["PaperForge73_DragonbornRanger_Tier2.zip","Humanoids","Iron",""],["PaperForge74_TieflingSorceress_Free.zip","Humanoids","Free",""],["PaperForge74_TieflingSorceress_Tier1.zip","Humanoids","Copper",""],["PaperForge74_TieflingSorceress_Tier2.zip","Humanoids","Iron",""],["PaperForge75_HalflingRanger_Free.zip","Humanoids","Free",""],["PaperForge75_HalflingRanger_Tier1.zip","Humanoids","Copper",""],["PaperForge75_HalflingRanger_Tier2.zip","Humanoids","Iron",""],["PaperForge76_HalforcWarrior_Free.zip","Humanoids","Free",""],["PaperForge76_HalforcWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge76_HalforcWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge77_ForestSpirit_Tier1.zip PaperForge77_ForestSpiritsExtras_Tier1.zip","Bundles and rewards","Copper",""],["PaperForge77_ForestSpirit_Tier2.zip PaperForge77_ForestSpiritsExtras_Tier2.zip","Bundles and rewards","Iron",""],["PaperForg78_Medusa_Free.zip","Bundles and rewards","Free",""],["PaperForg78_Medusa_Tier1.zip","Bundles and rewards","Copper",""],["PaperForg78_Medusa_Tier2.zip","Bundles and rewards","Iron",""],["PaperForg79_MedusaPriestess_Tier1.zip","Bundles and rewards","Copper",""],["PaperForg79_MedusaPriestess_Tier2.zip","Bundles and rewards","Iron",""],["PaperForge82_ClockworkGolem_Tier1.zip","Constructs","Copper",""],["PaperForge82_ClockworkGolem_Tier2.zip","Constructs","Iron",""],["PaperForge83_HumanCleric_Free.zip","Humanoids","Free",""],["PaperForge83_HumanCleric_Tier1.zip","Humanoids","Copper",""],["PaperForge83_HumanCleric_Tier2.zip","Humanoids","Iron",""],["PaperForge84_HalforcMonk_Free.zip","Humanoids","Free",""],["PaperForge84_HalforcMonk_Tier1.zip","Humanoids","Copper",""],["PaperForge84_HalforcMonk_Tier2.zip","Humanoids","Iron",""],["PaperForge85_Hydra_Free.zip","Monstrosities","Free",""],["PaperForge85_Hydra_Tier1.zip","Monstrosities","Copper",""],["PaperForge85_Hydra_Tier2.zip","Monstrosities","Iron",""],["PaperForge86_UndeadKnightA_Free.zip","Humanoids","Free",""],["PaperForge86_UndeadKnights_Tier1.zip","Humanoids","Copper",""],["PaperForge86_UndeadKnights_Tier2.zip","Humanoids","Iron",""],["PaperForge87_HookHorror_Free.zip","Aberrations","Free",""],["PaperForge87_HookHorror_Tier1.zip","Aberrations","Copper",""],["PaperForge87_HookHorror_Tier2.zip","Aberrations","Iron",""],["PaperForge88_MawDemon_Free.zip","Fiends","Free",""],["PaperForge88_MawDemon_Tier1.zip","Fiends","Copper",""],["PaperForge88_MawDemon_Tier2.zip","Fiends","Iron",""],["PaperForge89_Banshee_Free.zip","Undead","Free",""],["PaperForge89_Banshee_Tier1.zip","Undead","Copper",""],["PaperForge89_Banshee_Tier2.zip","Undead","Iron",""],["PaperForge90_Herculean_Free.zip","Other / review","Free",""],["PaperForge90_Herculean_Tier1.zip","Other / review","Copper",""],["PaperForge90_Herculean_Tier2.zip","Other / review","Iron",""],["PaperForge91_SwarmMaster_Free.zip","Other / review","Free",""],["PaperForge91_SwarmMaster_Tier1.zip","Other / review","Copper",""],["PaperForge91_SwarmMaster_Tier2.zip","Other / review","Iron",""],["PaperForge92_GiantWasps_Tier1.zip","Beasts","Copper",""],["PaperForge92_GiantWasps_Tier2.zip","Beasts","Iron",""],["PaperForge93_Skyscout_Free.zip","Other / review","Free",""],["PaperForge93_Skyscout_Tier1.zip","Other / review","Copper",""],["PaperForge93_Skyscout_Tier2.zip","Other / review","Iron",""],["PaperForge94_Mantid_Free.zip","Other / review","Free",""],["PaperForge94_Mantid_Tier1.zip","Other / review","Copper",""],["PaperForge94_Mantid_Tier2.zip","Other / review","Iron",""],["PaperForge95_HarpyMatriarch_Free.zip","Monstrosities","Free",""],["PaperForge95_HarpyMatriarch_Tier1.zip","Monstrosities","Copper",""],["PaperForge95_HarpyMatriarch_Tier2.zip","Monstrosities","Iron",""],["PaperForge96_Harpy_Free.zip","Monstrosities","Free",""],["PaperForge96_Harpy_Tier1.zip","Monstrosities","Copper",""],["PaperForge96_Harpy_Tier2.zip","Monstrosities","Iron",""],["PaperForge97_VenomCrawler_Free.zip","Other / review","Free",""],["PaperForge97_VenomCrawler_Tier 1.zip","Other / review","Copper",""],["PaperForge97_VenomCrawler_Tier 2.zip","Other / review","Iron",""],["PaperForge98_VenomCrawlerHatchling_Free.zip","Other / review","Free",""],["PaperForge98_VenomCrawlerHatchling_Tier1.zip","Other / review","Copper",""],["PaperForge98_VenomCrawlerHatchling_Tier2.zip","Other / review","Iron",""],["PaperForge99_VenomQueenGargantuan_Tier1.zip","Other / review","Copper",""],["PaperForge99_VenomQueenGargantuan_Tier2.zip","Other / review","Iron",""],["PaperForge100_EggCluster_Tier1.zip","Other / review","Copper",""],["PaperForge100_EggCluster_Tier2.zip","Other / review","Iron",""],["PaperForge101_WebbedHumanoid_Free.zip","Humanoids","Free",""],["PaperForge101_WebbedHumanoid_Tier2.zip","Humanoids","Iron",""],["PaperForge_102_SkeletalBird_Free.zip","Other / review","Free",""],["PaperForge_102_SkeletalBird_Tier1.zip","Other / review","Copper",""],["PaperForge_102_SkeletalBird_Tier2.zip","Other / review","Iron",""],["PaperForge_103_HumanMonk_Free.zip","Humanoids","Free",""],["PaperForge_103_HumanMonk_Tier1.zip","Humanoids","Copper",""],["PaperForge_103_HumanMonk_Tier2.zip","Humanoids","Iron",""],["PaperForge104_TavernKeeper_Free.zip","Other / review","Free",""],["PaperForge104_TavernKeeper_Tier1.zip","Other / review","Copper",""],["PaperForge104_TavernKeeper_Tier2.zip","Other / review","Iron",""],["PaperForge105_RedCap_Free.zip","Other / review","Free",""],["PaperForge105_RedCap_Tier1.zip","Other / review","Copper",""],["PaperForge105_RedCap_Tier2.zip","Other / review","Iron",""],["PaperForge106_TavernMaiden_Free.zip","Other / review","Free",""],["PaperForge106_TavernMaiden_Tier1.zip","Other / review","Copper",""],["PaperForge106_TavernMaiden_Tier2.zip","Other / review","Iron",""],["PaperForge107_BoneDevil_Free.zip","Fiends","Free",""],["PaperForge107_BoneDevil_Tier1.zip","Fiends","Copper",""],["PaperForge107_BoneDevil_Tier2.zip","Fiends","Iron",""],["PaperForge108_RedDragon_Tier1.zip","Dragons","Copper",""],["PaperForge109_FireElemental_Tier1.zip","Elementals","Copper",""],["PaperForge110_BoozeServerKobold_Tier1.zip","Oozes","Copper",""],["PaperForge110_BoozeServerKobold_Tier2.zip","Oozes","Iron",""],["PaperForge111_CaskHaulerKobold_Tier1.zip","Humanoids","Copper",""],["PaperForge111_CaskHaulerKobold_Tier2.zip","Humanoids","Iron",""],["PaperForge_112_Townsman1_Free.zip","Other / review","Free",""],["PaperForge_112_Townsman1_Tier1.zip","Other / review","Copper",""],["PaperForge_112_Townsman1_Tier2.zip","Other / review","Iron",""],["PaperForge113_Townsman2_Free.zip","Other / review","Free",""],["PaperForge113_Townsman2_Tier1.zip","Other / review","Copper",""],["PaperForge113_Townsman2_Tier2.zip","Other / review","Iron",""],["PaperForge114_KoboldWingSorceror_Free.zip","Humanoids","Free",""],["PaperForge114_KoboldWingSorceror_Tier1.zip","Humanoids","Copper",""],["PaperForge114_KoboldWingSorceror_Tier2.zip","Humanoids","Iron",""],["PaperForge115_MoltenOoze_Free.zip","Oozes","Free",""],["PaperForge115_MoltenOoze_Tier1.zip","Oozes","Copper",""],["PaperForge116_DrunkenTownsman_Free.zip","Other / review","Free",""],["PaperForge116_DrunkenTownsman_Tier1.zip","Other / review","Copper",""],["PaperForge116_DrunkenTownsman_Tier2.zip","Other / review","Iron",""],["PaperForge117_LegionErinyes_Tier1.zip","Other / review","Copper",""],["PaperForge117_LegionErinyes_Tier2.zip","Other / review","Iron",""],["PaperForge118_ReanimatedGroundskeeper_Free.zip","Other / review","Free",""],["PaperForge118_ReanimatedGroundskeeper_Tier1.zip","Other / review","Copper",""],["PaperForge118_ReanimatedGroundskeeper_Tier2.zip","Other / review","Iron",""],["PaperForge119_GhostlyHound_Free.zip","Undead","Free",""],["PaperForge119_GhostlyHound_Tier1.zip","Undead","Copper",""],["PaperForge119_GhostlyHound_Tier2.zip","Undead","Iron",""],["PaperForge120_GhostMatron_Free.zip","Undead","Free",""],["PaperForge120_GhostMatron_Tier1.zip","Undead","Copper",""],["PaperForge120_GhostMatron_Tier2.zip","Undead","Iron",""],["PaperForge121_WispBorn_Free.zip","Other / review","Free",""],["PaperForge121_WispBorn_Tier1.zip","Other / review","Copper",""],["PaperForge121_WispBorn_Tier2.zip","Other / review","Iron",""],["PaperForge122_Crone_Free.zip","Other / review","Free",""],["PaperForge122_Crone_Tier1.zip","Other / review","Copper",""],["PaperForge122_Crone_Tier2.zip","Other / review","Iron",""],["PaperForge123_Vapul_Free.zip","Other / review","Free",""],["PaperForge123_Vapul_Tier1.zip","Other / review","Copper",""],["PaperForge123_Vapul_Tier2.zip","Other / review","Iron",""],["PaperForge124_SoulScorcherDragon_Free.zip","Dragons","Free",""],["PaperForge124_SoulScorcherDragon_Tier 1.zip","Dragons","Copper",""],["PaperForge124_SoulScorcherDragon_Tier 2.zip","Dragons","Iron",""],["PaperForge125_Urchin_Free.zip","Other / review","Free",""],["PaperForge125_Urchin_Tier1.zip","Other / review","Copper",""],["PaperForge125_Urchin_Tier2.zip","Other / review","Iron",""],["PaperForge126_Urchin_Free.zip","Other / review","Free",""],["PaperForge126_Urchin_Tier1.zip","Other / review","Copper",""],["PaperForge126_Urchin_Tier2.zip","Other / review","Iron",""],["PaperForge127_Townswoman_Free.zip","Other / review","Free",""],["PaperForge127_Townswoman_Tier1.zip","Other / review","Copper",""],["PaperForge127_Townswoman_Tier2.zip","Other / review","Iron",""],["PaperForge128_Cultist_SM_Hide_Free.zip","Other / review","Free",""],["PaperForge128_Cultist_SM_Hide_Tier1.zip","Other / review","Copper",""],["PaperForge128_Cultist_SM_Hide_Tier2.zip","Other / review","Iron",""],["PaperForge129_Cultist_SM_Claw_Free.zip","Other / review","Free",""],["PaperForge129_Cultist_SM_Claw_Tier1.zip","Other / review","Copper",""],["PaperForge129_Cultist_SM_Claw_Tier2.zip","Other / review","Iron",""],["PaperForge130_Cultist_SM_CatsEye_Free.zip","Other / review","Free",""],["PaperForge130_Cultist_SM_CatsEye_Tier1.zip","Other / review","Copper",""],["PaperForge130_Cultist_SM_CatsEye_Tier2.zip","Other / review","Iron",""],["PaperForge131_Cultist_SM_Warlock_Free.zip","Other / review","Free",""],["PaperForge131_Cultist_SM_Warlock_Tier1.zip","Other / review","Copper",""],["PaperForge131_Cultist_SM_Warlock_Tier2.zip","Other / review","Iron",""],["PaperForge132_Cultist_SM_Abomination_Free.zip","Other / review","Free",""],["PaperForge132_Cultist_SM_Abomination_Tier1.zip","Other / review","Copper",""],["PaperForge132_Cultist_SM_Abomination_Tier2.zip","Other / review","Iron",""],["PaperForge133_BlackTeztatlipoca_Free.zip","Other / review","Free",""],["PaperForge133_BlackTeztatlipoca_Tier1.zip","Other / review","Copper",""],["PaperForge133_BlackTeztatlipoca_Tier2.zip","Other / review","Iron",""],["PaperForge134_Teztatlipoca  Spawn_Free.zip","Other / review","Free",""],["PaperForge134_Teztatlipoca  Spawn_Tier1.zip","Other / review","Copper",""],["PaperForge134_Teztatlipoca  Spawn_Tier2.zip","Other / review","Iron",""],["PaperForge135_Teztastlipoca Tendril_Free.zip","Other / review","Free",""],["PaperForge135_Teztastlipoca Tendril_Tier1.zip","Other / review","Copper",""],["PaperForge135_Teztastlipoca Tendril_Tier2.zip","Other / review","Iron",""],["PaperForge136_Reskin_FlamingHeraldErinyes_Tier3.zip","Other / review","Steel",""],["PaperForge137_AarakocraWarrior_Free.zip","Humanoids","Free",""],["PaperForge137_AarakocraWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge137_AarakocraWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge138_AarakocraChampion_Tier3.zip","Other / review","Steel",""],["PaperForge139_Reskin_AarakocraMage_Tier3.zip","Other / review","Steel",""],["PaperForge140_Chameleonfolk Warrior_Free.zip","Humanoids","Free",""],["PaperForge140_Chameleonfolk Warrior_Tier1.zip","Humanoids","Copper",""],["PaperForge140_Chameleonfolk Warrior_Tier2.zip","Humanoids","Iron",""],["PaperForge141_ChameleonfolkChieftain_Free.zip","Other / review","Free",""],["PaperForge141_ChameleonfolkChieftain_Tier1.zip","Other / review","Copper",""],["PaperForge141_ChameleonfolkChieftain_Tier2.zip","Other / review","Iron",""],["PaperForge142_ElderCoatl_Free.zip","Other / review","Free",""],["PaperForge142_ElderCoatl_Tier1.zip","Other / review","Copper",""],["PaperForge142_ElderCoatl_Tier2.zip","Other / review","Iron",""],["PaperForge143_Manticore_Free.zip","Monstrosities","Free",""],["PaperForge143_Manticore_Tier1.zip","Monstrosities","Copper",""],["PaperForge143_Manticore_Tier2.zip","Monstrosities","Iron",""],["PaperForge144_Mastiff_Free.zip","Other / review","Free",""],["PaperForge144_Mastiff_Tier1.zip","Other / review","Copper",""],["PaperForge144_Mastiff_Tier2.zip","Other / review","Iron",""],["PaperForge145_[Reskin]Giant_Snake_tier3.zip","Beasts","Steel",""],["PaperForge146_RemoteTraveller_Free.zip","Other / review","Free",""],["PaperForge146_RemoteTraveller_Tier1.zip","Other / review","Copper",""],["PaperForge146_RemoteTraveller_Tier2.zip","Other / review","Iron",""],["PaperForge147_FirbolgDruid_Free.zip","Other / review","Free",""],["PaperForge147_FirbolgDruid_Tier1.zip","Other / review","Copper",""],["PaperForge147_FirbolgDruid_Tier2.zip","Other / review","Iron",""],["PaperForge148_HalfOrcBarbarian_Tier3.zip","Humanoids","Steel",""],["PaperForge149_WarforgedArtificer_Free.zip","Constructs","Free",""],["PaperForge149_WarforgedArtificer_Tier1.zip","Constructs","Copper",""],["PaperForge149_WarforgedArtificer_Tier2.zip","Constructs","Iron",""],["PaperForge150_SteelDefender_Free.zip","Other / review","Free",""],["PaperForge150_SteelDefender_Tier1.zip","Other / review","Copper",""],["PaperForge150_SteelDefender_Tier2.zip","Other / review","Iron",""],["PaperForge151_GnomeWizard_Free.zip","Humanoids","Free",""],["PaperForge151_GnomeWizard_Tier1.zip","Humanoids","Copper",""],["PaperForge151_GnomeWizard_Tier2.zip","Humanoids","Iron",""],["PaperForge152_ElfRanger_Free.zip","Humanoids","Free",""],["PaperForge152_ElfRanger_Tier1.zip","Humanoids","Copper",""],["PaperForge152_ElfRanger_Tier2.zip","Humanoids","Iron",""],["PaperForge153_HalfElfRogue_Free.zip","Humanoids","Free",""],["PaperForge153_HalfElfRogue_Tier1.zip","Humanoids","Copper",""],["PaperForge153_HalfElfRogue_Tier2.zip","Humanoids","Iron",""],["PaperForge154_Leprechaun_Free.zip","Other / review","Free",""],["PaperForge154_Leprechaun_Tier1.zip","Other / review","Copper",""],["PaperForge154_Leprechaun_Tier2.zip","Other / review","Iron",""],["PaperForge155_Rakshasa_Free.zip","Other / review","Free",""],["PaperForge155_Rakshasa_Tier1.zip","Other / review","Copper",""],["PaperForge155_Rakshasa_Tier2.zip","Other / review","Iron",""],["PaperForge156_GoblinSorceror_Free.zip","Humanoids","Free",""],["PaperForge156_GoblinSorceror_Tier1.zip","Humanoids","Copper",""],["PaperForge156_GoblinSorceror_Tier2.zip","Humanoids","Iron",""],["PaperForge157_GiantScorpion_Free.zip","Beasts","Free",""],["PaperForge157_GiantScorpion_Tier1.zip","Beasts","Copper",""],["PaperForge157_GiantScorpion_Tier2.zip","Beasts","Iron",""],["PaperForge158_Bullywug_Free.zip","Other / review","Free","158-bullywug-35845366"],["PaperForge158_Bullywug_Tier1.zip","Other / review","Copper","158-bullywug-35845366"],["PaperForge158_Bullywug_Tier2.zip","Other / review","Iron","158-bullywug-35845366"],["PaperForge159_BullywugRoyalGuard_Tier3.zip","Humanoids","Steel",""],["PaperForge160_BullywugQueen_Free.zip","Other / review","Free",""],["PaperForge160_BullywugQueen_Tier1.zip","Other / review","Copper",""],["PaperForge160_BullywugQueen_Tier2.zip","Other / review","Iron",""],["PaperForge161_Bugbear_Free.zip","Beasts","Free",""],["PaperForge161_Bugbear_Tier1.zip","Beasts","Copper",""],["PaperForge161_Bugbear_Tier2.zip","Beasts","Iron",""],["PaperForge162_Otyugh_Free.zip","Aberrations","Free",""],["PaperForge162_Otyugh_Tier1.zip","Aberrations","Copper",""],["PaperForge162_Otyugh_Tier2.zip","Aberrations","Iron",""],["PaperForge163_GiantCentipede_Free.zip","Other / review","Free",""],["PaperForge163_GiantCentipede_Tier1.zip","Other / review","Copper",""],["PaperForge163_GiantCentipede_Tier2.zip","Other / review","Iron",""],["PaperForge164_Ogre_Free.zip","Giants","Free",""],["PaperForge164_Ogre_Tier1.zip","Giants","Copper",""],["PaperForge164_Ogre_Tier2.zip","Giants","Iron",""],["PaperForge165_TieflingWarlock_Free.zip","Humanoids","Free",""],["PaperForge165_TieflingWarlock_Tier1.zip","Humanoids","Copper",""],["PaperForge165_TieflingWarlock_Tier2.zip","Humanoids","Iron",""],["PaperForge166_Sleuth_Free.zip","Other / review","Free",""],["PaperForge166_Sleuth_Tier1.zip","Other / review","Copper",""],["PaperForge166_Sleuth_Tier2.zip","Other / review","Iron",""],["PaperForge167_Operative_Free.zip","Other / review","Free",""],["PaperForge167_Operative_tier1.zip","Other / review","Copper",""],["PaperForge167_Operative_tier2.zip","Other / review","Iron",""],["PaperForge168_SpectralAgent_Free.zip","Other / review","Free",""],["PaperForge168_SpectralAgent_Tier1.zip","Other / review","Copper",""],["PaperForge168_SpectralAgent_Tier2.zip","Other / review","Iron",""],["PaperForge169_SpectralAgentDuplicate_Tier3.zip","Other / review","Steel",""],["PaperForge170_HalfOrcPaladin_Free.zip","Humanoids","Free",""],["PaperForge170_HalfOrcPaladin_Tier1.zip","Humanoids","Copper",""],["PaperForge170_HalfOrcPaladin_Tier2.zip","Humanoids","Iron",""],["PaperForge171_Paladin_Free.zip","Humanoids","Free",""],["PaperForge171_Paladin_Tier1.zip","Humanoids","Copper",""],["PaperForge171_Paladin_Tier2.zip","Humanoids","Iron",""],["PaperForge172_Reskin_GreenKnight_Tier3.zip","Humanoids","Steel",""],["PaperForge173_ChempunkOgre_Free.zip","Giants","Free",""],["PaperForge173_ChempunkOgre_Tier1.zip","Giants","Copper",""],["PaperForge173_ChempunkOgre_Tier2.zip","Giants","Iron",""],["PaperForge174_ChempunkScientist_Free.zip","Other / review","Free",""],["PaperForge174_ChempunkScientist_Tier1.zip","Other / review","Copper",""],["PaperForge174_ChempunkScientist_Tier2.zip","Other / review","Iron",""],["PaperForge175_AutomatedHose_Free.zip","Other / review","Free",""],["PaperForge175_AutomatedHose_Tier1.zip","Other / review","Copper",""],["PaperForge175_AutomatedHose_Tier2.zip","Other / review","Iron",""],["PaperForge176_Skeleton_Free.zip","Undead","Free",""],["PaperForge176_Skeleton_Tier1.zip","Undead","Copper",""],["PaperForge176_Skeleton_Tier2.zip","Undead","Iron",""],["PaperForge177_SkeletonArcher_Free.zip","Undead","Free",""],["PaperForge177_SkeletonArcher_Tier1.zip","Undead","Copper",""],["PaperForge177_SkeletonArcher_Tier2.zip","Undead","Iron",""],["PaperForge178_SkeletonRogue_Free.zip","Undead","Free",""],["PaperForge178_SkeletonRogue_Tier1.zip","Undead","Copper",""],["PaperForge178_SkeletonRogue_Tier2.zip","Undead","Iron",""],["PaperForge179_SkeletonSpearman_Free.zip","Undead","Free",""],["PaperForge179_SkeletonSpearman_Tier1.zip","Undead","Copper",""],["PaperForge179_SkeletonSpearman_Tier2.zip","Undead","Iron",""],["PaperForge180_SkeletonWarrior_Free.zip","Undead","Free",""],["PaperForge180_SkeletonWarrior_Tier1.zip","Undead","Copper",""],["PaperForge180_SkeletonWarrior_Tier2.zip","Undead","Iron",""],["PaperForge181_SkeletonExecutioner_Tier3.zip","Undead","Steel",""],["PaperForge182_SkeletonGuardian_Tier3.zip","Undead","Steel",""],["PaperForge183_Hogshead_Free.zip","Other / review","Free",""],["PaperForge183_Hogshead_Tier1.zip","Other / review","Copper",""],["PaperForge183_Hogshead_Tier2.zip","Other / review","Iron",""],["PaperForge184_HogsheadB_Free.zip","Other / review","Free",""],["PaperForge184_HogsheadB_Tier1.zip","Other / review","Copper",""],["PaperForge184_HogsheadB_Tier2.zip","Other / review","Iron",""],["PaperForge185_Troll_Free.zip","Giants","Free",""],["PaperForge185_Troll_Tier1.zip","Giants","Copper",""],["PaperForge185_Troll_Tier2.zip","Giants","Iron",""],["PaperForge186_TwoHeadedTroll_Tier3.zip","Giants","Steel",""],["PaperForge187_OrcWarrior_Free.zip","Humanoids","Free",""],["PaperForge187_OrcWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge187_OrcWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge188_OrcSwordsman_Free.zip","Humanoids","Free",""],["PaperForge188_OrcSwordsman_Tier1.zip","Humanoids","Copper",""],["PaperForge188_OrcSwordsman_Tier2.zip","Humanoids","Iron",""],["PaperForge189_OrcSpearman_Free.zip","Humanoids","Free",""],["PaperForge189_OrcSpearman_Tier1.zip","Humanoids","Copper",""],["PaperForge189_OrcSpearman_Tier2.zip","Humanoids","Iron",""],["PaperForge190_OrcBerserker_Tier3.zip","Humanoids","Steel",""],["PaperForge191_OrcInfested_Tier3.zip","Humanoids","Steel",""],["PaperForge_192_Cat_Free.zip","Other / review","Free",""],["PaperForge_192_Cat_Tier1.zip","Other / review","Copper",""],["PaperForge_192_Cat_Tier2.zip","Other / review","Iron",""],["PaperForge193_WhiteDragon_Tier1.zip","Dragons","Copper",""],["PaperForge194_IceTerrain_Tier1.zip","Environmental scatter","Copper",""],["PaperForge194_IceTerrain_Tier2.zip","Environmental scatter","Iron",""],["PaperForge195_Weasel_Free.zip","Other / review","Free",""],["PaperForge195_Weasel_Tier1.zip","Other / review","Copper",""],["PaperForge195_Weasel_Tier2.zip","Other / review","Iron",""],["PaperForge196_SwarmofCentipedes_Free.zip","Other / review","Free",""],["PaperForge196_SwarmofCentipedes_Tier1.zip","Other / review","Copper",""],["PaperForge196_SwarmofCentipedes_Tier2.zip","Other / review","Iron",""],["PaperForge197_ThrendlKeeper_Free.zip","Other / review","Free",""],["PaperForge197_ThrendlKeeper_Tier1.zip","Other / review","Copper",""],["PaperForge197_ThrendlKeeper_Tier2.zip","Other / review","Iron",""],["PaperForge198_ThrendlScout_Free.zip","Other / review","Free",""],["PaperForge198_ThrendlScout_Tier1.zip","Other / review","Copper",""],["PaperForge198_ThrendlScout_Tier2.zip","Other / review","Iron",""],["PaperForge199_ThrendlKnight_Tier3.zip","Humanoids","Steel",""],["PaperForge200_SatyrFemale_Free.zip","Fey","Free",""],["PaperForge200_SatyrFemale_Tier1.zip","Fey","Copper",""],["PaperForge200_SatyrFemale_Tier2.zip","Fey","Iron",""],["PaperForge201_SatyrMale_Free.zip","Fey","Free",""],["PaperForge201_SatyrMale_Tier1.zip","Fey","Copper",""],["PaperForge201_SatyrMale_Tier2.zip","Fey","Iron",""],["PaperForge202_SatyrBardFemale_Free.zip","Fey","Free",""],["PaperForge202_SatyrBardFemale_Tier1.zip","Fey","Copper",""],["PaperForge202_SatyrBardFemale_Tier2.zip","Fey","Iron",""],["PaperForge203_SatyrBardMale_Free.zip","Fey","Free",""],["PaperForge203_SatyrBardMale_Tier1.zip","Fey","Copper",""],["PaperForge203_SatyrBardMale_Tier2.zip","Fey","Iron",""],["PaperForge204_SatyrWarriorFemale_Free.zip","Fey","Free",""],["PaperForge204_SatyrWarriorFemale_Tier1.zip","Fey","Copper",""],["PaperForge204_SatyrWarriorFemale_Tier2.zip","Fey","Iron",""],["PaperForge205_SatyrWarriorMale_Free.zip","Fey","Free",""],["PaperForge205_SatyrWarriorMale_Tier1.zip","Fey","Copper",""],["PaperForge205_SatyrWarriorMale_Tier2.zip","Fey","Iron",""],["PaperForge206_SatyrHopliteFemale_Tier3.zip","Fey","Steel",""],["PaperForge207_SatyrHopliteMale_Tier3.zip","Fey","Steel",""],["PaperForge208_SatyrRogueFemale_Tier3.zip","Fey","Steel",""],["PaperForge209_SatyrRogueMale_Tier3.zip","Fey","Steel",""],["Paperforge210_GreenDragon_Tier1.zip","Dragons","Copper",""],["PaperForge211_Owl_Free.zip","Other / review","Free",""],["PaperForge211_Owl_Tier1.zip","Other / review","Copper",""],["PaperForge211_Owl_Tier2.zip","Other / review","Iron",""],["PaperForge212_EldritchCannon_Free.zip","Other / review","Free",""],["PaperForge212_EldritchCannon_Tier1.zip","Other / review","Copper",""],["PaperForge212_EldritchCannon_Tier2.zip","Other / review","Iron",""],["PaperForge213_ChempunkCannon_Tier3.zip","Other / review","Steel",""],["PaperForge214_MechanicalHomunculus_Free.zip","Other / review","Free",""],["PaperForge214_MechanicalHomunculus_Tier1.zip","Other / review","Copper",""],["PaperForge214_MechanicalHomunculus_Tier2.zip","Other / review","Iron",""],["PaperForge215_ChempunkHomunculus_Tier3.zip","Other / review","Steel",""],["PaperForge216_Lizardfolk_Free.zip","Other / review","Free",""],["PaperForge216_Lizardfolk_Tier1.zip","Other / review","Copper",""],["PaperForge216_Lizardfolk_Tier2.zip","Other / review","Iron",""],["PaperForge217_LizardfolkWarrior_Free.zip","Humanoids","Free",""],["PaperForge217_LizardfolkWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge217_LizardfolkWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge218_LizardfolkChampion_Tier3.zip","Other / review","Steel",""],["PaperForge219_ThePaleOutlaw_Free.zip","Other / review","Free",""],["PaperForge219_ThePaleOutlaw_Tier1.zip","Other / review","Copper",""],["PaperForge219_ThePaleOutlaw_Tier2.zip","Other / review","Iron",""],["PaperForge220_AnimatedRevolver_Free.zip","Other / review","Free",""],["PaperForge220_AnimatedRevolver_Tier1.zip","Other / review","Copper",""],["PaperForge220_AnimatedRevolver_Tier2.zip","Other / review","Iron",""],["PaperForge221_TerrorWeed_Free.zip","Other / review","Free",""],["PaperForge221_TerrorWeed_Tier1.zip","Other / review","Copper",""],["PaperForge221_TerrorWeed_Tier2.zip","Other / review","Iron",""],["PaperForge222_[Reskin]FrostTroll_Tier3.zip","Giants","Steel",""],["PaperForge223_DwarfBarbarian_Free.zip","Humanoids","Free",""],["PaperForge223_DwarfBarbarian_Tier1.zip","Humanoids","Copper",""],["PaperForge223_DwarfBarbarian_Tier2.zip","Humanoids","Iron",""],["PaperForge224_DwarfBarbarian_Free.zip","Humanoids","Free",""],["PaperForge224_DwarfBarbarian_Tier1.zip","Humanoids","Copper",""],["PaperForge224_DwarfBarbarian_Tier2.zip","Humanoids","Iron",""],["PaperForge225_DwarfPaladin_Free.zip","Humanoids","Free",""],["PaperForge225_DwarfPaladin_Tier1.zip","Humanoids","Copper",""],["PaperForge225_DwarfPaladin_Tier2.zip","Humanoids","Iron",""],["PaperForge226_DwarfPaladin_Free.zip","Humanoids","Free",""],["PaperForge226_DwarfPaladin_Tier1.zip","Humanoids","Copper",""],["PaperForge226_DwarfPaladin_Tier2.zip","Humanoids","Iron",""],["PaperForge227_DwarfCleric_Free.zip","Humanoids","Free",""],["PaperForge227_DwarfCleric_Tier1.zip","Humanoids","Copper",""],["PaperForge227_DwarfCleric_Tier2.zip","Humanoids","Iron",""],["PaperForge228_dwarfCleric_Free.zip","Humanoids","Free",""],["PaperForge228_dwarfCleric_Tier1.zip","Humanoids","Copper",""],["PaperForge228_dwarfCleric_Tier2.zip","Humanoids","Iron",""],["PaperForge229_Bear_Free.zip","Beasts","Free",""],["PaperForge229_Bear_Tier1.zip","Beasts","Copper",""],["PaperForge229_Bear_Tier2.zip","Beasts","Iron",""],["PaperForge230_(Reskin)Bear_Tier3.zip","Beasts","Steel",""],["PaperForge231_BlackDragon_Tier1.zip","Dragons","Copper",""],["PaperForge233_CrawlingHands_Free.zip","Other / review","Free",""],["PaperForge233_CrawlingHands_Tier1.zip","Other / review","Copper",""],["PaperForge233_CrawlingHands_Tier2.zip","Other / review","Iron",""],["PaperForge234_Goblin Alchemist_Free.zip","Humanoids","Free",""],["PaperForge234_Goblin Alchemist_Tier1.zip","Humanoids","Copper",""],["PaperForge234_Goblin Alchemist_Tier2.zip","Humanoids","Iron",""],["PaperForge235_GiantFireBeetle_Free.zip","Giants","Free",""],["PaperForge235_GiantFireBeetle_Tier1.zip","Giants","Copper",""],["PaperForge235_GiantFireBeetle_Tier2.zip","Giants","Iron",""],["PaperForge236_BlueDragon_Tier1.zip","Dragons","Copper",""],["PaperForge237_[Reskin]GiantHerculesBeetle_Tier3.zip","Giants","Steel",""],["PaperForge238_Monk_Free.zip","Humanoids","Free",""],["PaperForge238_Monk_Tier1.zip","Humanoids","Copper",""],["PaperForge238_Monk_Tier2.zip","Humanoids","Iron",""],["PaperForge239_Flying Hammer_Free.zip","Other / review","Free",""],["PaperForge239_Flying Hammer_Tier1.zip","Other / review","Copper",""],["PaperForge239_Flying Hammer_Tier2.zip","Other / review","Iron",""],["PaperForge240_[Reskin]SpiritualWeapon(Hammer)_Tier3.zip","Other / review","Steel",""],["PaperForge241_[Reskin]Goblin Inventor_Tier3.zip","Humanoids","Steel",""],["PaperForge242_FlyingSword_Free.zip","Other / review","Free",""],["PaperForge242_FlyingSword_Tier1.zip","Other / review","Copper",""],["PaperForge242_FlyingSword_Tier2.zip","Other / review","Iron",""],["PaperForge243_Animated Voodoo Doll_Free.zip","Other / review","Free",""],["PaperForge243_Animated Voodoo Doll_Tier1.zip","Other / review","Copper",""],["PaperForge243_Animated Voodoo Doll_Tier2.zip","Other / review","Iron",""],["PaperForge244_GiantFrog_Free.zip","Beasts","Free",""],["PaperForge244_GiantFrog_Tier1.zip","Beasts","Copper",""],["PaperForge244_GiantFrog_Tier2.zip","Beasts","Iron",""],["PaperForge245_Monk_Free.zip","Humanoids","Free",""],["PaperForge245_Monk_Tier1.zip","Humanoids","Copper",""],["PaperForge245_Monk_Tier2.zip","Humanoids","Iron",""],["PaperForge246_[Reskin]Spiritual Weapon(Sword)_Tier3.zip","Other / review","Steel",""],["PaperForge247_Human Sorceress_Free.zip","Humanoids","Free",""],["PaperForge247_Human Sorceress_Tier1.zip","Humanoids","Copper",""],["PaperForge247_Human Sorceress_Tier2.zip","Humanoids","Iron",""],["PaperForge248_Elf Warrior_Free.zip","Humanoids","Free",""],["PaperForge248_Elf Warrior_Tier1.zip","Humanoids","Copper",""],["PaperForge248_Elf Warrior_Tier2.zip","Humanoids","Iron",""],["PaperForge249_[Reskin]ArmoredMastiff_Tier3.zip","Other / review","Steel",""],["PaperForge250_SnowGolem_Free.zip","Constructs","Free",""],["PaperForge250_SnowGolem_Tier1.zip","Constructs","Copper",""],["PaperForge250_SnowGolem_Tier2.zip","Constructs","Iron",""],["PaperForge251_TreasureChests_Free.zip","Other / review","Free",""],["PaperForge251_TreasureChests_Tier1.zip","Other / review","Copper",""],["PaperForge251_TreasureChests_Tier2.zip","Other / review","Iron",""],["PaperForge252_PumpkinHarvester_Free.zip","Other / review","Free",""],["PaperForge252_PumpkinHarvester_Tier1.zip","Other / review","Copper",""],["PaperForge252_PumpkinHarvester_Tier2.zip","Other / review","Iron",""],["PaperForge253_Skeletal Mage_Free.zip","Other / review","Free",""],["PaperForge253_Skeletal Mage_Tier1.zip","Other / review","Copper",""],["PaperForge253_Skeletal Mage_Tier2.zip","Other / review","Iron",""],["PaperForge254_Flameskull_Free.zip","Other / review","Free",""],["PaperForge254_Flameskull_Tier1.zip","Other / review","Copper",""],["PaperForge254_Flameskull_Tier2.zip","Other / review","Iron",""],["PaperForge255_Ghast _Free.zip","Undead","Free",""],["PaperForge255_Ghast _Tier1.zip","Undead","Copper",""],["PaperForge255_Ghast _Tier2.zip","Undead","Iron",""],["PaperForge256_GnomeBard_Free.zip","Other / review","Free",""],["PaperForge256_GnomeBard_Tier1.zip","Other / review","Copper",""],["PaperForge256_GnomeBard_Tier2.zip","Other / review","Iron",""],["PaperForge257_[Reskin]SkeletalNecromancer_Tier3.zip","Other / review","Steel",""],["PaperForge258_Bandit_Free.zip","Humanoids","Free",""],["PaperForge258_Bandit_Tier1.zip","Humanoids","Copper",""],["PaperForge258_Bandit_Tier2.zip","Humanoids","Iron",""],["PaperForge259_Bandit_Free.zip","Humanoids","Free",""],["PaperForge259_Bandit_Tier1.zip","Humanoids","Copper",""],["PaperForge259_Bandit_Tier2.zip","Humanoids","Iron",""],["PaperForge260_HumanRogue_Free.zip","Humanoids","Free","260-human-rogue-43610688"],["PaperForge260_HumanRogue_Tier1.zip","Humanoids","Copper","260-human-rogue-43610688"],["PaperForge260_HumanRogue_Tier2.zip","Humanoids","Iron","260-human-rogue-43610688"],["PaperForge261_LoxodonWizard_Free.zip","Humanoids","Free",""],["PaperForge261_LoxodonWizard_Tier1.zip","Humanoids","Copper",""],["PaperForge261_LoxodonWizard_Tier2.zip","Humanoids","Iron",""],["PaperForge262_LoxodonDruid_Free.zip","Other / review","Free",""],["PaperForge262_LoxodonDruid_Tier1.zip","Other / review","Copper",""],["PaperForge262_LoxodonDruid_Tier2.zip","Other / review","Iron",""],["PaperForge263_Loxodon Cleric_Tier3.zip","Humanoids","Steel",""],["PaperForge264_Tiefling Paladin_Free.zip","Humanoids","Free",""],["PaperForge264_Tiefling Paladin_Tier1.zip","Humanoids","Copper",""],["PaperForge264_Tiefling Paladin_Tier2.zip","Humanoids","Iron",""],["PaperForge265_Tiefling Paladin_Free.zip","Humanoids","Free",""],["PaperForge265_Tiefling Paladin_Tier1.zip","Humanoids","Copper",""],["PaperForge265_Tiefling Paladin_Tier2.zip","Humanoids","Iron",""],["PaperForge266_Ranger_Free.zip","Humanoids","Free",""],["PaperForge266_Ranger_Tier1.zip","Humanoids","Copper",""],["PaperForge266_Ranger_Tier2.zip","Humanoids","Iron",""],["PaperForge267[Reskin]_Bandit_Tier3.zip","Humanoids","Steel",""],["PaperForge268_TieflingRanger_Free.zip","Humanoids","Free",""],["PaperForge268_TieflingRanger_Tier1.zip","Humanoids","Copper",""],["PaperForge268_TieflingRanger_Tier2.zip","Humanoids","Iron",""],["PaperForge269[Reskin]_TieflingBandit_Tier3.zip","Humanoids","Steel",""],["PaperForge270_Wizard_Free.zip","Humanoids","Free",""],["PaperForge270_Wizard_Tier1.zip","Humanoids","Copper",""],["PaperForge270_Wizard_Tier2.zip","Humanoids","Iron",""],["PaperForge271_TieflingWizard_Free.zip","Humanoids","Free",""],["PaperForge271_TieflingWizard_Tier1.zip","Humanoids","Copper",""],["PaperForge271_TieflingWizard_Tier2.zip","Humanoids","Iron",""],["PaperForge272[Reskin]_ Druid_Tier3.zip","Other / review","Steel",""],["PaperForge273_Dragonborn Wizard_Free.zip","Humanoids","Free",""],["PaperForge273_Dragonborn Wizard_Tier1.zip","Humanoids","Copper",""],["PaperForge273_Dragonborn Wizard_Tier2.zip","Humanoids","Iron",""],["PaperForge274_DwarfWarrior _Free.zip","Humanoids","Free",""],["PaperForge274_DwarfWarrior _Tier1.zip","Humanoids","Copper",""],["PaperForge274_DwarfWarrior _Tier2.zip","Humanoids","Iron",""],["PaperForge275_Flying Dagger_Free.zip","Other / review","Free",""],["PaperForge275_Flying Dagger_Tier1.zip","Other / review","Copper",""],["PaperForge275_Flying Dagger_Tier2.zip","Other / review","Iron",""],["PaperForge276_[Reskin]SpiritualWeapon(Dagger)_Tier3.zip","Other / review","Steel",""],["PaperForge277_Specter_Free.zip","Undead","Free",""],["PaperForge277_Specter_Tier1.zip","Undead","Copper",""],["PaperForge277_Specter_Tier2.zip","Undead","Iron",""],["PaperForge278_Wraith_Free.zip","Undead","Free",""],["PaperForge278_Wraith_Tier1.zip","Undead","Copper",""],["PaperForge278_Wraith_Tier2.zip","Undead","Iron",""],["PaperForge279_GreaterWraith_Tier3.zip","Undead","Steel",""],["PaperForge280_CharonFerryman_Free.zip","Other / review","Free",""],["PaperForge280_CharonFerryman_Tier1.zip","Other / review","Copper",""],["PaperForge280_CharonFerryman_Tier2.zip","Other / review","Iron",""],["PaperForge281_Charon_Free.zip","Other / review","Free",""],["PaperForge281_Charon_Tier1.zip","Other / review","Copper",""],["PaperForge281_Charon_Tier2.zip","Other / review","Iron",""],["PaperForge282_CharonsFerry _Free.zip","Other / review","Free",""],["PaperForge282_CharonsFerry _Tier1.zip","Other / review","Copper",""],["PaperForge282_CharonsFerry _Tier2.zip","Other / review","Iron",""],["PaperForge283_StyxianSoul_Free.zip","Other / review","Free",""],["PaperForge283_StyxianSoul_Tier1.zip","Other / review","Copper",""],["PaperForge283_StyxianSoul_Tier2.zip","Other / review","Iron",""],["PaperForge284_FloatingEmber_Free.zip","Other / review","Free",""],["PaperForge284_FloatingEmber_Tier1.zip","Other / review","Copper",""],["PaperForge284_FloatingEmber_Tier2.zip","Other / review","Iron",""],["PaperForge285_Boar_Free.zip","Beasts","Free",""],["PaperForge285_Boar_Tier1.zip","Beasts","Copper",""],["PaperForge285_Boar_Tier2.zip","Beasts","Iron",""],["PaperForge286_Boarlet_Free.zip","Beasts","Free",""],["PaperForge286_Boarlet_Tier1.zip","Beasts","Copper",""],["PaperForge286_Boarlet_Tier2.zip","Beasts","Iron",""],["PaperForge287_Boar_Free.zip","Beasts","Free",""],["PaperForge287_Boar_Tier1.zip","Beasts","Copper",""],["PaperForge287_Boar_Tier2.zip","Beasts","Iron",""],["PaperForge288_Thunderboar_Tier3.zip","Beasts","Steel",""],["PaperForge289_Pseudodragon_Free.zip","Dragons","Free",""],["PaperForge289_Pseudodragon_Tier1.zip","Dragons","Copper",""],["PaperForge289_Pseudodragon_Tier2.zip","Dragons","Iron",""],["PaperForge290_FaerieDragon_Tier3.zip","Dragons","Steel",""],["PaperForge291_GnomeArtificer_Free.zip","Other / review","Free",""],["PaperForge291_GnomeArtificer_Tier1.zip","Other / review","Copper",""],["PaperForge291_GnomeArtificer_Tier2.zip","Other / review","Iron",""],["PaperForge292_HalflingDruid_Free.zip","Humanoids","Free",""],["PaperForge292_HalflingDruid_Tier1.zip","Humanoids","Copper",""],["PaperForge292_HalflingDruid_Tier2.zip","Humanoids","Iron",""],["PaperForge293_TabaxiMonk_Free.zip","Humanoids","Free",""],["PaperForge293_TabaxiMonk_Tier1.zip","Humanoids","Copper",""],["PaperForge293_TabaxiMonk_Tier2.zip","Humanoids","Iron",""],["PaperForge294_TabaxiRogue_Free.zip","Humanoids","Free",""],["PaperForge294_TabaxiRogue_Tier1.zip","Humanoids","Copper",""],["PaperForge294_TabaxiRogue_Tier2.zip","Humanoids","Iron",""],["PaperForge295_[Reskin]TabaxiAssassin_Tier3.zip","Other / review","Steel",""],["PaperForge296_Tabaxi Monk_Free.zip","Humanoids","Free",""],["PaperForge296_Tabaxi Monk_Tier1.zip","Humanoids","Copper",""],["PaperForge296_Tabaxi Monk_Tier2.zip","Humanoids","Iron",""],["PaperForge297_Crelid_Free.zip","Other / review","Free",""],["PaperForge297_Crelid_Tier1.zip","Other / review","Copper",""],["PaperForge297_Crelid_Tier2.zip","Other / review","Iron",""],["PaperForge298[EnvironmentProp]Fire_Free.zip","Environmental scatter","Free",""],["PaperForge298[EnvironmentProp]Fire_Tier1.zip","Environmental scatter","Copper",""],["PaperForge298[EnvironmentProp]Fire_Tier2.zip","Environmental scatter","Iron",""],["PaperForge299_CultistFang_Free.zip","Other / review","Free",""],["PaperForge299_CultistFang_Tier1.zip","Other / review","Copper",""],["PaperForge299_CultistFang_Tier2.zip","Other / review","Iron",""],["PaperForge300_CultAssassin_Free.zip","Other / review","Free",""],["PaperForge300_CultAssassin_Tier1.zip","Other / review","Copper",""],["PaperForge300_CultAssassin_Tier2.zip","Other / review","Iron",""],["PaperForge301_HalflingMonk_Free.zip","Humanoids","Free",""],["PaperForge301_HalflingMonk_Tier1.zip","Humanoids","Copper",""],["PaperForge301_HalflingMonk_Tier2.zip","Humanoids","Iron",""],["PaperForge302_CultistWing_Free.zip","Other / review","Free",""],["PaperForge302_CultistWing_Tier1.zip","Other / review","Copper",""],["PaperForge302_CultistWing_Tier2.zip","Other / review","Iron",""],["PaperForge303_[Reskin]AstralSelfMonk _Tier3.zip","Humanoids","Steel",""],["PaperForge304_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge304_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge304_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge305_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge305_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge305_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge306_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge306_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge306_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge307_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge307_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge307_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge308_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge308_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge308_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge309_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge309_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge309_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge310_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge310_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge310_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge311_TownGuard_Free.zip","Humanoids","Free",""],["PaperForge311_TownGuard_Tier1.zip","Humanoids","Copper",""],["PaperForge311_TownGuard_Tier2.zip","Humanoids","Iron",""],["PaperForge312_TownGuardCaptain_Free.zip","Humanoids","Free",""],["PaperForge312_TownGuardCaptain_Tier1.zip","Humanoids","Copper",""],["PaperForge312_TownGuardCaptain_Tier2.zip","Humanoids","Iron",""],["PaperForge313_TownGuardCaptain_Free.zip","Humanoids","Free",""],["PaperForge313_TownGuardCaptain_Tier1.zip","Humanoids","Copper",""],["PaperForge313_TownGuardCaptain_Tier2.zip","Humanoids","Iron",""],["PaperForge314_[Reskin]EliteGuard _Tier3.zip","Humanoids","Steel",""],["PaperForge315_[Reskin]EliteGuard_Tier3.zip","Humanoids","Steel",""],["PaperForge316_[Reskin]EliteGuardCaptain_Tier3.zip","Humanoids","Steel",""],["PaperForge317_Cart_Free.zip","Other / review","Free",""],["PaperForge317_Cart_Tier1.zip","Other / review","Copper",""],["PaperForge317_Cart_Tier2.zip","Other / review","Iron",""],["PaperForge318_Cart_Free.zip","Other / review","Free",""],["PaperForge318_Cart_Tier1.zip","Other / review","Copper",""],["PaperForge318_Cart_Tier2.zip","Other / review","Iron",""],["PaperForge319_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge319_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge319_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge320_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge320_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge320_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge321_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge321_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge321_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge322_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge322_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge322_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge323_DepthWatcher_Free.zip","Other / review","Free",""],["PaperForge323_DepthWatcher_Tier1.zip","Other / review","Copper",""],["PaperForge323_DepthWatcher_Tier2.zip","Other / review","Iron",""],["PaperForge324_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge324_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge324_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge325_PirateCaptain_Free.zip","Other / review","Free",""],["PaperForge325_PirateCaptain_Tier1.zip","Other / review","Copper",""],["PaperForge325_PirateCaptain_Tier2.zip","Other / review","Iron",""],["PaperForge326_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge326_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge326_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge327_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge327_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge327_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge328_PirateCrewMember_Free.zip","Other / review","Free",""],["PaperForge328_PirateCrewMember_Tier1.zip","Other / review","Copper",""],["PaperForge328_PirateCrewMember_Tier2.zip","Other / review","Iron",""],["PaperForge329_PirateCaptain_Free.zip","Other / review","Free",""],["PaperForge329_PirateCaptain_Tier1.zip","Other / review","Copper",""],["PaperForge329_PirateCaptain_Tier2.zip","Other / review","Iron",""],["PaperForge330_Monkey_Free.zip","Humanoids","Free",""],["PaperForge330_Monkey_Tier1.zip","Humanoids","Copper",""],["PaperForge330_Monkey_Tier2.zip","Humanoids","Iron",""],["PaperForge331_[Reskin]PirateMonkey_Tier3.zip","Humanoids","Steel",""],["PaperForge332_Parrot_Free.zip","Other / review","Free",""],["PaperForge332_Parrot_Tier1.zip","Other / review","Copper",""],["PaperForge332_Parrot_Tier2.zip","Other / review","Iron",""],["PaperForge333_[Reskin]Cockatoo _Tier3.zip","Other / review","Steel",""],["PaperForge334_[Reskin]SkeletonPirate_Tier3.zip","Undead","Steel",""],["PaperForge335_[Reskin]SkeletonPirate_Tier3.zip","Undead","Steel",""],["PaperForge336_[Reskin]SkeletonPirateCaptain_Tier3.zip","Undead","Steel",""],["PaperForge337_[Reskin]GhostPirateCaptain_Tier3.zip","Undead","Steel",""],["PaperForge338_[Reskin]GhostPirate_Tier3.zip","Undead","Steel",""],["PaperForge339_[Reskin]GhostPirate_Tier3.zip","Undead","Steel",""],["PaperForge340_IntellectDevourer_Free.zip","Aberrations","Free",""],["PaperForge340_IntellectDevourer_Tier1.zip","Aberrations","Copper",""],["PaperForge340_IntellectDevourer_Tier2.zip","Aberrations","Iron",""],["PaperForge341_IntellectDevourer_Free.zip","Aberrations","Free",""],["PaperForge341_IntellectDevourer_Tier1.zip","Aberrations","Copper",""],["PaperForge341_IntellectDevourer_Tier2.zip","Aberrations","Iron",""],["342_GnomeCeremorph_PNGs.zip","Other / review","Free",""],["PaperForge342_GnomeCeremorph_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge342_GnomeCeremorph_Tier8_FREE.zip","Other / review","Free",""],["343_GnomeCeremorph_PNGs.zip","Other / review","Free",""],["PaperForge343_GnomeCeremorph_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge343_GnomeCeremorph_Tier8_FREE.zip","Other / review","Free",""],["344_GnomeSquidling_PNGs.zip","Other / review","Free",""],["PaperForge344_GnomeSquidling_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge344_GnomeSquidling_Tier8_FREE.zip","Other / review","Free",""],["PaperForge345_PotionMerchantPortrait_Free.zip","Other / review","Free",""],["PaperForge345_PotionMerchantPortrait_Tier1.zip","Other / review","Copper",""],["PaperForge345_PotionMerchantPortrait_Tier2.zip","Other / review","Iron",""],["PaperForge346_[Reskin]WarCleric_Tier3.zip","Humanoids","Steel",""],["PaperForge347_[Reskin]Knight_Tier3.zip","Humanoids","Steel",""],["PaperForge348_MindFlayer_PNGs.zip","Other / review","Free",""],["PaperForge348_MindFlayer_CUTFILE_Free.zip","Other / review","Free",""],["PaperForge348_MindFlayer_Tier8_FREE.zip","Other / review","Free",""],["PaperForge349_MindFlayer_PNGs.zip","Other / review","Free",""],["PaperForge349_MindFlayer_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge349_MindFlayer_Tier8_FREE.zip","Other / review","Free",""],["PaperForge350_DarkMantle_Free.zip","Other / review","Free",""],["PaperForge350_DarkMantle_Tier1.zip","Other / review","Copper",""],["PaperForge350_DarkMantle_Tier2.zip","Other / review","Iron",""],["PaperForge351_[Environment Props] Rocks 1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge351_[Environment Props] Rocks 1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge352_Griffon_Free.zip","Monstrosities","Free",""],["PaperForge352_Griffon_Tier1.zip","Monstrosities","Copper",""],["PaperForge352_Griffon_Tier2.zip","Monstrosities","Iron",""],["PaperForge353 _Griffon Fledgling_ Free.zip","Monstrosities","Free",""],["PaperForge353 _Griffon Fledgling_ Tier1.zip","Monstrosities","Copper",""],["PaperForge353 _Griffon Fledgling_ Tier2.zip","Monstrosities","Iron",""],["PaperForge354_GriffonFledgling_Free.zip","Monstrosities","Free",""],["PaperForge354_GriffonFledgling_Tier1.zip","Monstrosities","Copper",""],["PaperForge354_GriffonFledgling_Tier2.zip","Monstrosities","Iron",""],["PaperForge355_[Environment Props] Rocks 2_Tier1.zip","Environmental scatter","Copper",""],["PaperForge355_[Environment Props] Rocks 2_Tier2.zip","Environmental scatter","Iron",""],["PaperForge356_[ReskinEnvironmentProp]GriffonNest_Tier3.zip","Environmental scatter","Steel",""],["PaperForge357_HalflingBard_Free.zip","Humanoids","Free",""],["PaperForge357_HalflingBard_Tier1.zip","Humanoids","Copper",""],["PaperForge357_HalflingBard_Tier2.zip","Humanoids","Iron",""],["PaperForge_358Halfling Wizard_Free.zip","Humanoids","Free",""],["PaperForge_358Halfling Wizard_Tier1.zip","Humanoids","Copper",""],["PaperForge_358Halfling Wizard_Tier2.zip","Humanoids","Iron",""],["PaperForge359_[Reskin]GoblinWizard_Tier3.zip","Humanoids","Steel",""],["PaperForge360_GnomePaladin_Free.zip","Humanoids","Free",""],["PaperForge360_GnomePaladin_Tier1.zip","Humanoids","Copper",""],["PaperForge360_GnomePaladin_Tier2.zip","Humanoids","Iron",""],["PaperForge361_[Reskin]GnomeCleric_Tier3.zip","Humanoids","Steel",""],["PaperForge362_Homunculus_Free.zip","Other / review","Free",""],["PaperForge362_Homunculus_Tier1.zip","Other / review","Copper",""],["PaperForge362_Homunculus_Tier2.zip","Other / review","Iron",""],["PaperForge363_[Reskin]ArmoredHomunculus_Tier3.zip","Other / review","Steel",""],["PaperForge364_ForgeworkDragon_Free.zip","Dragons","Free",""],["PaperForge364_ForgeworkDragon_Tier1.zip","Dragons","Copper",""],["PaperForge364_ForgeworkDragon_Tier2.zip","Dragons","Iron",""],["PaperForge365_ForgeworkDragonWyrmling_Free.zip","Dragons","Free",""],["PaperForge365_ForgeworkDragonWyrmling_Tier1.zip","Dragons","Copper",""],["PaperForge365_ForgeworkDragonWyrmling_Tier2.zip","Dragons","Iron",""],["PaperForge366_ForgeworkDragonEgg_Free.zip","Dragons","Free",""],["PaperForge366_ForgeworkDragonEgg_Tier1.zip","Dragons","Copper",""],["PaperForge366_ForgeworkDragonEgg_Tier2.zip","Dragons","Iron",""],["PaperForge367_HalfOgre_Free.zip","Giants","Free",""],["PaperForge367_HalfOgre_Tier1.zip","Giants","Copper",""],["PaperForge367_HalfOgre_Tier2.zip","Giants","Iron",""],["PaperForge368_HalfOgreTorcher_Tier3.zip","Giants","Steel",""],["PaperForge369_HobgoblinSoldier_Free.zip","Humanoids","Free",""],["PaperForge369_HobgoblinSoldier_Tier1.zip","Humanoids","Copper",""],["PaperForge369_HobgoblinSoldier_Tier2.zip","Humanoids","Iron",""],["PaperForge370_Doppleganger_Free.zip","Other / review","Free",""],["PaperForge370_Doppleganger_Tier1.zip","Other / review","Copper",""],["PaperForge370_Doppleganger_Tier2.zip","Other / review","Iron",""],["PaperForge371_[Environment Prop]StonePillar_Tier1.zip","Environmental scatter","Copper",""],["PaperForge371_[Environment Prop]StonePillar_Tier2.zip","Environmental scatter","Iron",""],["PaperForge372_[EnvironmentProp]SmallStoneWall_Tier1.zip","Environmental scatter","Copper",""],["PaperForge372_[EnvironmentProp]SmallStoneWall_Tier2.zip","Environmental scatter","Iron",""],["PaperForge373_[EnvironmentProp]Pillar&SmallWall_Tier1.zip","Environmental scatter","Copper",""],["PaperForge373_[EnvironmentProp]Pillar&SmallWall_Tier2.zip","Environmental scatter","Iron",""],["PaperForge374_[Reskin][Environment Prop]TorchLitStonePillar_Tier3.zip","Environmental scatter","Steel",""],["PaperForge375_[Reskin][Environment Prop]TorchLitPillar&SmallWall_Tier3.zip","Environmental scatter","Steel",""],["PaperForge376_[Environment Prop]Statue_Tier1.zip","Environmental scatter","Copper",""],["PaperForge376_[Environment Prop]Statue_Tier2.zip","Environmental scatter","Iron",""],["PaperForge377_[Environment Prop]Statue_Tier1.zip","Environmental scatter","Copper",""],["PaperForge377_[Environment Prop]Statue_Tier2.zip","Environmental scatter","Iron",""],["PaperForge378_FireGenasi_Free.zip","Other / review","Free",""],["PaperForge378_FireGenasi_Tier1.zip","Other / review","Copper",""],["PaperForge378_FireGenasi_Tier2.zip","Other / review","Iron",""],["PaperForge379_FireGenasiWizard_Free.zip","Humanoids","Free",""],["PaperForge379_FireGenasiWizard_Tier1.zip","Humanoids","Copper",""],["PaperForge379_FireGenasiWizard_Tier2.zip","Humanoids","Iron",""],["PaperForge380_[EnvironmentProp]Wall_Tier1.zip","Environmental scatter","Copper",""],["PaperForge380_[EnvironmentProp]Wall_Tier2.zip","Environmental scatter","Iron",""],["PaperForge381_FireGenasi_Free.zip","Other / review","Free",""],["PaperForge381_FireGenasi_Tier1.zip","Other / review","Copper",""],["PaperForge381_FireGenasi_Tier2.zip","Other / review","Iron",""],["PaperForge382_FireGenasiWizard_Free.zip","Humanoids","Free",""],["PaperForge382_FireGenasiWizard_Tier1.zip","Humanoids","Copper",""],["PaperForge382_FireGenasiWizard_Tier2.zip","Humanoids","Iron",""],["PaperForge383_[EnvironmentProp]Doorway_Tier1.zip","Environmental scatter","Copper",""],["PaperForge383_[EnvironmentProp]Doorway_Tier2.zip","Environmental scatter","Iron",""],["PaperForge384_[EnvironmentProp]Doorway_Tier1.zip","Environmental scatter","Copper",""],["PaperForge384_[EnvironmentProp]Doorway_Tier2.zip","Environmental scatter","Iron",""],["PaperForge385_FairySorceress_Free.zip","Humanoids","Free",""],["PaperForge385_FairySorceress_Tier1.zip","Humanoids","Copper",""],["PaperForge385_FairySorceress_Tier2.zip","Humanoids","Iron",""],["PaperForge386_FairyWarrior_Free.zip","Humanoids","Free",""],["PaperForge386_FairyWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge386_FairyWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge387_[Reskin][EnvironmentProp]TorchlitDoorway_Tier3.zip","Environmental scatter","Steel",""],["PaperForge388_FairyMage_Free.zip","Other / review","Free",""],["PaperForge388_FairyMage_Tier1.zip","Other / review","Copper",""],["PaperForge388_FairyMage_Tier2.zip","Other / review","Iron",""],["PaperForge389_[Reskin]FairyRogue_Tier3.zip","Humanoids","Steel",""],["PaperForge390_Yeti_Free.zip","Other / review","Free",""],["PaperForge390_Yeti_Tier1.zip","Other / review","Copper",""],["PaperForge390_Yeti_Tier2.zip","Other / review","Iron",""],["PaperForge391_BabyYeti_Free.zip","Other / review","Free",""],["PaperForge391_BabyYeti_Tier1.zip","Other / review","Copper",""],["PaperForge391_BabyYeti_Tier2.zip","Other / review","Iron",""],["PaperForge392_[EnvironmentProp]RuinedPillar_Tier1.zip","Environmental scatter","Copper",""],["PaperForge392_[EnvironmentProp]RuinedPillar_Tier2.zip","Environmental scatter","Iron",""],["PaperForge393_FlailSnail_PNGs.zip","Other / review","Free",""],["PaperForge393_FlailSnail_Cutfile_Free.zip","Other / review","Free",""],["PaperForge393_FlailSnail_Tier8_Free.zip","Other / review","Free",""],["PaperForge394_[EnvironmentProp]RuinedWall_Tier1.zip","Environmental scatter","Copper",""],["PaperForge394_[EnvironmentProp]RuinedWall_Tier2.zip","Environmental scatter","Iron",""],["PaperForge395_Boggle_PNGs.zip","Other / review","Free",""],["PaperForge395_Boggle_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge395_Boggle_Tier8_FREE.zip","Other / review","Free",""],["PaperForge396_HobgoblinDevastator_Free.zip","Humanoids","Free",""],["PaperForge396_HobgoblinDevastator_Tier1.zip","Humanoids","Copper",""],["PaperForge396_HobgoblinDevastator_Tier2.zip","Humanoids","Iron",""],["PaperForge397_[EnvironmentProp]RuinedPillar_Tier1.zip","Environmental scatter","Copper",""],["PaperForge397_[EnvironmentProp]RuinedPillar_Tier2.zip","Environmental scatter","Iron",""],["PaperForge398_Bodak_Free.zip","Other / review","Free",""],["PaperForge398_Bodak_Tier1.zip","Other / review","Copper",""],["PaperForge398_Bodak_Tier2.zip","Other / review","Iron",""],["PaperForge399_[Reskin]FirbolgDruid_Tier3.zip","Other / review","Steel",""],["PaperForge400_HumanWarrior_Free.zip","Humanoids","Free",""],["PaperForge400_HumanWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge400_HumanWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge401_[EnvironmentProp]RuinedWall_Tier1.zip","Environmental scatter","Copper",""],["PaperForge401_[EnvironmentProp]RuinedWall_Tier2.zip","Environmental scatter","Iron",""],["PaperForge402_CaveFisher_Free.zip","Other / review","Free",""],["PaperForge402_CaveFisher_Tier1.zip","Other / review","Copper",""],["PaperForge402_CaveFisher_Tier2.zip","Other / review","Iron",""],["PaperForge403_[Reskin]FirbolgFighter_Tier3.zip","Other / review","Steel",""],["PaperForge404_HumanFighter_Free.zip","Humanoids","Free",""],["PaperForge404_HumanFighter_Tier1.zip","Humanoids","Copper",""],["PaperForge404_HumanFighter_Tier2.zip","Humanoids","Iron",""],["PaperForge405_Vargouille_Free.zip","Other / review","Free",""],["PaperForge405_Vargouille_Tier1.zip","Other / review","Copper",""],["PaperForge405_Vargouille_Tier2.zip","Other / review","Iron",""],["PaperForge406_Kirin_Free.zip","Other / review","Free",""],["PaperForge406_Kirin_Tier1.zip","Other / review","Copper",""],["PaperForge406_Kirin_Tier2.zip","Other / review","Iron",""],["PaperForge407_Zombie_Free.zip","Undead","Free",""],["PaperForge407_Zombie_Tier1.zip","Undead","Copper",""],["PaperForge407_Zombie_Tier2.zip","Undead","Iron",""],["PaperForge408_Vargouille_Free.zip","Other / review","Free",""],["PaperForge408_Vargouille_T1.zip","Other / review","Copper",""],["PaperForge408_Vargouille_T2.zip","Other / review","Iron",""],["PaperForge409_Devourer_Free.zip","Other / review","Free",""],["PaperForge409_Devourer_Tier1.zip","Other / review","Copper",""],["PaperForge409_Devourer_Tier2.zip","Other / review","Iron",""],["PaperForge410_Devourer(Empty)_Free.zip","Other / review","Free",""],["PaperForge410_Devourer(Empty)_Tier1.zip","Other / review","Copper",""],["PaperForge410_Devourer(Empty)_Tier2.zip","Other / review","Iron",""],["PaperForge411_Zombie_Free.zip","Undead","Free",""],["PaperForge411_Zombie_Tier1.zip","Undead","Copper",""],["PaperForge411_Zombie_Tier2.zip","Undead","Iron",""],["PaperForge412_Vargouille_Free.zip","Other / review","Free",""],["PaperForge412_Vargouille_Tier1.zip","Other / review","Copper",""],["PaperForge412_Vargouille_Tier2.zip","Other / review","Iron",""],["PaperForge413_[Reskin]PoisonMerchant_Tier3.zip","Other / review","Steel",""],["PaperForge414_Zombie_Free.zip","Undead","Free",""],["PaperForge414_Zombie_Tier1.zip","Undead","Copper",""],["PaperForge414_Zombie_Tier2.zip","Undead","Iron",""],["PaperForge415_Mimic_Free.zip","Monstrosities","Free",""],["PaperForge415_Mimic_Tier1.zip","Monstrosities","Copper",""],["PaperForge415_Mimic_Tier2.zip","Monstrosities","Iron",""],["PaperForge416_Mimic_Free.zip","Monstrosities","Free",""],["PaperForge416_Mimic_Tier1.zip","Monstrosities","Copper",""],["PaperForge416_Mimic_Tier2.zip","Monstrosities","Iron",""],["PaperForge417_Mindwitness_FREE.zip","Other / review","Free",""],["PaperForge417_Mindwitness_PNGs.zip","Other / review","Free",""],["PaperForge417_Mindwitness_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge417_Mindwitness_Tier8FREE.zip","Other / review","Free",""],["PaperForge418_Mimic_Free.zip","Monstrosities","Free",""],["PaperForge418_Mimic_Tier1.zip","Monstrosities","Copper",""],["PaperForge418_Mimic_Tier2.zip","Monstrosities","Iron",""],["PaperForge419_Noble_Free.zip","Other / review","Free",""],["PaperForge419_Noble_Tier1.zip","Other / review","Copper",""],["PaperForge419_Noble_Tier2.zip","Other / review","Iron",""],["PaperForge420_[Reskin]Zombie_Tier3.zip","Undead","Steel",""],["PaperForge421_[Reskin]Zombie_Tier3.zip","Undead","Steel",""],["PaperForge422_WoodWoad_Free.zip","Other / review","Free",""],["PaperForge422_WoodWoad_Tier1.zip","Other / review","Copper",""],["PaperForge422_WoodWoad_Tier2.zip","Other / review","Iron",""],["PaperForge423_Nilbog_Free.zip","Other / review","Free",""],["PaperForge423_Nilbog_Tier1.zip","Other / review","Copper",""],["PaperForge423_Nilbog_Tier2.zip","Other / review","Iron",""],["PaperForge424_[EnvironmentProp]TreeStump_Tier1.zip","Environmental scatter","Copper",""],["PaperForge424_[EnvironmentProp]TreeStump_Tier2.zip","Environmental scatter","Iron",""],["PaperForge425_[EnvironmentProp]TreeStump_Tier1.zip","Environmental scatter","Copper",""],["PaperForge425_[EnvironmentProp]TreeStump_Tier2.zip","Environmental scatter","Iron",""],["PaperForge426_Babau_Free.zip","Other / review","Free",""],["PaperForge426_Babau_Tier1.zip","Other / review","Copper",""],["PaperForge426_Babau_Tier2.zip","Other / review","Iron",""],["PaperForge427_[Reskin][EnvironmentProp]TreeStump_Tier3.zip","Environmental scatter","Steel",""],["PaperForge428_[Reskin][EnvironmentProp]Tree Stump_Tier3.zip","Environmental scatter","Steel",""],["PaperForge429_ZombieMage_Free.zip","Undead","Free",""],["PaperForge429_ZombieMage_Tier1.zip","Undead","Copper",""],["PaperForge429_ZombieMage_Tier2.zip","Undead","Iron",""],["PaperForge430_HobgoblinIronShadow_Free.zip","Humanoids","Free",""],["PaperForge430_HobgoblinIronShadow_Tier1.zip","Humanoids","Copper",""],["PaperForge430_HobgoblinIronShadow_Tier2.zip","Humanoids","Iron",""],["PaperForge431_GoblinBarbarian_Free.zip","Humanoids","Free",""],["PaperForge431_GoblinBarbarian_Tier1.zip","Humanoids","Copper",""],["PaperForge431_GoblinBarbarian_Tier2.zip","Humanoids","Iron",""],["PaperForge432_[Reskin]GoblinBarbarian_Tier3.zip","Humanoids","Steel",""],["PaperForge433_[Reskin]ZombieMage_Tier3.zip","Undead","Steel",""],["PaperForge434_ZombieCrawler_Free.zip","Undead","Free",""],["PaperForge434_ZombieCrawler_Tier1.zip","Undead","Copper",""],["PaperForge434_ZombieCrawler_Tier2.zip","Undead","Iron",""],["PaperForge435_HulkingZombie_Free.zip","Undead","Free",""],["PaperForge435_HulkingZombie_Tier1.zip","Undead","Copper",""],["PaperForge435_HulkingZombie_Tier2.zip","Undead","Iron",""],["PaperForge436_[Reskin]GoblinRogue_Tier3.zip","Humanoids","Steel",""],["PaperForge437_ [Reskin] TheTwins_Tier3.zip","Other / review","Steel",""],["PaperForge438_FleshGolem_Free.zip","Constructs","Free",""],["PaperForge438_FleshGolem_Tier1.zip","Constructs","Copper",""],["PaperForge438_FleshGolem_Tier2.zip","Constructs","Iron",""],["PaperForge439_AaracokraFighter_Free.zip","Other / review","Free",""],["PaperForge439_AaracokraFighter_Tier1.zip","Other / review","Copper",""],["PaperForge439_AaracokraFighter_Tier2.zip","Other / review","Iron",""],["PaperForge440_AaracokraRogue_Free.zip","Humanoids","Free",""],["PaperForge440_AaracokraRogue_Tier1.zip","Humanoids","Copper",""],["PaperForge440_AaracokraRogue_Tier2.zip","Humanoids","Iron",""],["PaperForge441_ShadowSorcerer_Free.zip","Humanoids","Free",""],["PaperForge441_ShadowSorcerer_Tier1.zip","Humanoids","Copper",""],["PaperForge441_ShadowSorcerer_Tier2.zip","Humanoids","Iron",""],["PaperForge_442_ShadowHound_Free.zip","Other / review","Free",""],["PaperForge_442_ShadowHound_Tier1.zip","Other / review","Copper",""],["PaperForge_442_ShadowHound_Tier2.zip","Other / review","Iron",""],["PaperForge443_[Reskin]Hunter_Tier3.zip","Other / review","Steel",""],["PaperForge444_[Variant]ShadowSorcerer_Tier2.zip","Humanoids","Iron",""],["PaperForge445_Octopus_Free.zip","Other / review","Free",""],["PaperForge445_Octopus_Tier1.zip","Other / review","Copper",""],["PaperForge445_Octopus_Tier2.zip","Other / review","Iron",""],["PaperForge446_GiantOctopus_Free.zip","Other / review","Free",""],["PaperForge446_GiantOctopus_Tier1.zip","Other / review","Copper",""],["PaperForge446_GiantOctopus_Tier2.zip","Other / review","Iron",""],["PaperForge447Claspid_Free.zip","Other / review","Free",""],["PaperForge447Claspid_Tier1.zip","Other / review","Copper",""],["PaperForge447Claspid_Tier2.zip","Other / review","Iron",""],["PaperForge448_SandstoneGolem_Free.zip","Constructs","Free",""],["PaperForge448_SandstoneGolem_Tier1.zip","Constructs","Copper",""],["PaperForge448_SandstoneGolem_Tier2.zip","Constructs","Iron",""],["PaperForge449_Ruffian_Free.zip","Other / review","Free",""],["PaperForge449_Ruffian_Tier1.zip","Other / review","Copper",""],["PaperForge449_Ruffian_Tier2.zip","Other / review","Iron",""],["PaperForge450_Ruffian_Free.zip","Other / review","Free",""],["PaperForge450_Ruffian_Tier1.zip","Other / review","Copper",""],["PaperForge450_Ruffian_Tier2.zip","Other / review","Iron",""],["PaperForge451_ModularTerrain_DungeonWall_1x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonWall_1x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge451_ModularTerrain_DungeonWall_3x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonWall_3x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge451_ModularTerrain_DungeonWall_4x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonWall_4x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge451_ModularTerrain_DungeonWall_6x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonWall_6x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge451_ModularTerrain_DungeonTile_3x3_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonTile_3x3_Tier2.zip","Environmental scatter","Iron",""],["PaperForge451_ModularTerrain_DungeonTile_4x4_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonTile_4x4_Tier2.zip","Environmental scatter","Iron",""],["PaperForge451_ModularTerrain_DungeonTile_6x2_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonTile_6x2_Tier2.zip","Environmental scatter","Iron",""],["PaperForge451_ModularTerrain_DungeonTile_6x6_Tier1.zip","Environmental scatter","Copper",""],["PaperForge451_ModularTerrain_DungeonTile_6x6_Tier2.zip","Environmental scatter","Iron",""],["PaperForge452_Sahuagin_Free.zip","Other / review","Free",""],["PaperForge452_Sahuagin_Tier1.zip","Other / review","Copper",""],["PaperForge452_Sahuagin_Tier2.zip","Other / review","Iron",""],["PaperForge453_Ruffian_Free.zip","Other / review","Free",""],["PaperForge453_Ruffian_Tier1.zip","Other / review","Copper",""],["PaperForge453_Ruffian_Tier2.zip","Other / review","Iron",""],["PaperForge454_Ruffian_Free.zip","Other / review","Free",""],["PaperForge454_Ruffian_Tier1.zip","Other / review","Copper",""],["PaperForge454_Ruffian_Tier2.zip","Other / review","Iron",""],["PaperForge455_ReefShark_Free.zip","Beasts","Free",""],["PaperForge455_ReefShark_Tier1.zip","Beasts","Copper",""],["PaperForge455_ReefShark_Tier2.zip","Beasts","Iron",""],["PaperForge456_GiantShark_Free.zip","Beasts","Free",""],["PaperForge456_GiantShark_Tier1.zip","Beasts","Copper",""],["PaperForge456_GiantShark_Tier2.zip","Beasts","Iron",""],["PaperForge457_LeoninBarbarian_Free.zip","Other / review","Free",""],["PaperForge457_LeoninBarbarian_Tier1.zip","Other / review","Copper",""],["PaperForge457_LeoninBarbarian_Tier2.zip","Other / review","Iron",""],["PaperForge458_LeoninFighter_Free.zip","Other / review","Free",""],["PaperForge458_LeoninFighter_Tier1.zip","Other / review","Copper",""],["PaperForge458_LeoninFighter_Tier2.zip","Other / review","Iron",""],["PaperForge459_HalfElfRanger_Free.zip","Humanoids","Free",""],["PaperForge459_HalfElfRanger_Tier1.zip","Humanoids","Copper",""],["PaperForge459_HalfElfRanger_Tier2.zip","Humanoids","Iron",""],["PaperForge460_[Variant]HalfElfRanger_Tier2.zip","Humanoids","Iron",""],["PaperForge461_Monk_Free.zip","Humanoids","Free",""],["PaperForge461_Monk_Tier1.zip","Humanoids","Copper",""],["PaperForge461_Monk_Tier2.zip","Humanoids","Iron",""],["PaperForge462_[Variant]LeoninFighter_Tier2.zip","Other / review","Iron",""],["PaperForge463_KenkuThief_Free.zip","Other / review","Free",""],["PaperForge463_KenkuThief_Tier1.zip","Other / review","Copper",""],["PaperForge463_KenkuThief_Tier2.zip","Other / review","Iron",""],["PaperForge464_[Variant]KenkuThief_Tier2.zip","Other / review","Iron",""],["PaperForge465_[Variant]KenkuThief_Tier2.zip","Other / review","Iron",""],["PaperForge466_Druid_Free.zip","Other / review","Free",""],["PaperForge466_Druid_Tier1.zip","Other / review","Copper",""],["PaperForge466_Druid_Tier2.zip","Other / review","Iron",""],["PaperForge467_Modular Walls_Town_2x1_Tier1.zip","Other / review","Copper",""],["PaperForge467_Modular Walls_Town_2x1_Tier2.zip","Other / review","Iron",""],["PaperForge467_Modular Walls_Town_4x1_Tier1.zip","Other / review","Copper",""],["PaperForge467_Modular Walls_Town_4x1_Tier2.zip","Other / review","Iron",""],["PaperForge467_Modular Walls_Town_6x1_Tier1.zip","Other / review","Copper",""],["PaperForge467_Modular Walls_Town_6x1_Tier2.zip","Other / review","Iron",""],["PaperForge468_Auto-gnome_Free.zip","Other / review","Free",""],["PaperForge468_Auto-gnome_Tier1.zip","Other / review","Copper",""],["PaperForge468_Auto-gnome_Tier2.zip","Other / review","Iron",""],["PaperForge469_Auto-gnome_Tier2.zip","Other / review","Iron",""],["PaperForge470_Auto-gnome_Tier2.zip","Other / review","Iron",""],["PaperForge471_Auto-gnome_Tier2.zip","Other / review","Iron",""],["PaperForge472_Auto-gnome_Tier2.zip","Other / review","Iron",""],["PaperForge473_GiffWarlord_Free.zip","Other / review","Free",""],["PaperForge473_GiffWarlord_Tier1.zip","Other / review","Copper",""],["PaperForge473_GiffWarlord_Tier2.zip","Other / review","Iron",""],["PaperForge474_Brawler_Free.zip","Other / review","Free",""],["PaperForge474_Brawler_Tier1.zip","Other / review","Copper",""],["PaperForge474_Brawler_Tier2.zip","Other / review","Iron",""],["PaperForge475_RoundTable_Tier1.zip","Other / review","Copper",""],["PaperForge475_RoundTable_Tier2.zip","Other / review","Iron",""],["PaperForge476_LongTable_Tier1.zip","Other / review","Copper",""],["PaperForge476_LongTable_Tier2.zip","Other / review","Iron",""],["PaperForge477_SquareTable_Tier1.zip","Other / review","Copper",""],["PaperForge477_SquareTable_Tier2.zip","Other / review","Iron",""],["PaperForge478_Vampire_Free.zip","Undead","Free",""],["PaperForge478_Vampire_Tier1.zip","Undead","Copper",""],["PaperForge478_Vampire_Tier2.zip","Undead","Iron",""],["PaperForge479_[Variant] Vampire_Tier2.zip","Undead","Iron",""],["PaperForge480_Starlancer_Free.zip","Other / review","Free",""],["PaperForge480_Starlancer_Tier1.zip","Other / review","Copper",""],["PaperForge480_Starlancer_Tier2.zip","Other / review","Iron",""],["PaperForge481_Vampire_Free.zip","Undead","Free",""],["PaperForge481_Vampire_Tier1.zip","Undead","Copper",""],["PaperForge481_Vampire_Tier2.zip","Undead","Iron",""],["PaperForge482_[Variant]Vampire_Tier2.zip","Undead","Iron",""],["PaperForge483_Vampire_Free.zip","Undead","Free",""],["PaperForge483_Vampire_Tier1.zip","Undead","Copper",""],["PaperForge483_Vampire_Tier2.zip","Undead","Iron",""],["PaperForge484[Variant]Vampire_Tier2.zip","Undead","Iron",""],["PaperForge_485_Scarecrow_Free.zip","Other / review","Free",""],["PaperForge_485_Scarecrow_Tier1.zip","Other / review","Copper",""],["PaperForge_485_Scarecrow_Tier2.zip","Other / review","Iron",""],["PaperForge486_[Reskin]HobgoblinSamurai_Tier3.zip","Humanoids","Steel",""],["PaperForgee487_[Reskin]HobgoblinRonin_Tier3.zip","Bundles and rewards","Steel",""],["PaperForge488_Nobleman_Free.zip","Other / review","Free",""],["PaperForge488_Nobleman_Tier1.zip","Other / review","Copper",""],["PaperForge488_Nobleman_Tier2.zip","Other / review","Iron",""],["PaperForge489_Auto-gnome_Free.zip","Other / review","Free",""],["PaperForge489_Auto-gnome_Tier1.zip","Other / review","Copper",""],["PaperForge489_Auto-gnome_Tier2.zip","Other / review","Iron",""],["PaperForge490_Werewolf_Free.zip","Beasts","Free",""],["PaperForge490_Werewolf_Tier1.zip","Beasts","Copper",""],["PaperForge490_Werewolf_Tier2.zip","Beasts","Iron",""],["PaperForge491_[Variant]Werewolf_Tier2.zip","Beasts","Iron",""],["PaperForge492_Ooze_Free.zip","Oozes","Free",""],["PaperForge492_Ooze_Tier1.zip","Oozes","Copper",""],["PaperForge492_Ooze_Tier2.zip","Oozes","Iron",""],["PaperForge493_SlitheringTracker_PDFFree.zip","Other / review","Free",""],["PaperForge493_SlitheringTracker_PNGsFREE.zip","Other / review","Free",""],["PaperForge493_SlitheringTracker_CutfileFREE.zip","Other / review","Free",""],["PaperForge493_SlitheringTrackerPSD.zip","Other / review","Free",""],["PaperForge494_Bugbear_Free.zip","Beasts","Free",""],["PaperForge494_Bugbear_Tier1.zip","Beasts","Copper",""],["PaperForge494_Bugbear_Tier2.zip","Beasts","Iron",""],["PaperForge495_Ettin_Free.zip","Giants","Free",""],["PaperForge495_Ettin_Tier1.zip","Giants","Copper",""],["PaperForge495_Ettin_Tier2.zip","Giants","Iron",""],["PaperForge496_[Reskin]Autognome_Tier3.zip","Other / review","Steel",""],["PaperForge497_Fomorian_Free.zip","Other / review","Free",""],["PaperForge497_Fomorian_Tier1.zip","Other / review","Copper",""],["PaperForge497_Fomorian_Tier2.zip","Other / review","Iron",""],["PaperForge498_[Variant]Nobleman_Tier2.zip","Other / review","Iron",""],["PaperForge499_[Variant]Nobleman_Tier2.zip","Other / review","Iron",""],["PaperForge500_[Variant]Nobleman_Tier2.zip","Other / review","Iron",""],["PaperForge501_[Reskin]Duelist_Tier3.zip","Other / review","Steel",""],["PaperForge502_RoadBandit_Free.zip","Humanoids","Free",""],["PaperForge502_RoadBandit_Tier1.zip","Humanoids","Copper",""],["PaperForge502_RoadBandit_Tier2.zip","Humanoids","Iron",""],["PaperForge503_[Variant]RoadBandit_Tier2.zip","Humanoids","Iron",""],["PaperForge504_Gorgon_Free.zip","Other / review","Free",""],["PaperForge504_Gorgon_Tier1.zip","Other / review","Copper",""],["PaperForge504_Gorgon_Tier2.zip","Other / review","Iron",""],["PaperForge505_BanditSpellcaster_Free.zip","Humanoids","Free",""],["PaperForge505_BanditSpellcaster_Tier1.zip","Humanoids","Copper",""],["PaperForge505_BanditSpellcaster_Tier2.zip","Humanoids","Iron",""],["PaperForge506_ChainDevil_Free.zip","Fiends","Free",""],["PaperForge506_ChainDevil_Tier1.zip","Fiends","Copper",""],["PaperForge506_ChainDevil_Tier2.zip","Fiends","Iron",""],["PaperForge507_AnimatedChain_Free.zip","Other / review","Free",""],["PaperForge507_AnimatedChain_Tier1.zip","Other / review","Copper",""],["PaperForge507_AnimatedChain_Tier2.zip","Other / review","Iron",""],["PaperForge508_Marilinth_Free.zip","Other / review","Free",""],["PaperForge508_Marilinth_Tier1.zip","Other / review","Copper",""],["PaperForge508_Marilinth_Tier2.zip","Other / review","Iron",""],["PaperForge_509_(3dProp)Chair_Free.zip","Other / review","Free",""],["PaperForge510_(3dProp)Crate_Free.zip","Other / review","Free",""],["PaperForge510_(3dProp)Crate_Tier1.zip","Other / review","Copper",""],["PaperForge510_(3dProp)Crate_Tier2.zip","Other / review","Iron",""],["PaperForge511_PitFiend_Free.zip","Fiends","Free",""],["PaperForge511_PitFiend_Tier1.zip","Fiends","Copper",""],["PaperForge511_PitFiend_Tier2.zip","Fiends","Iron",""],["PaperForge512_Bat_Free.zip","Beasts","Free",""],["PaperForge512_Bat_Tier1.zip","Beasts","Copper",""],["PaperForge512_Bat_Tier2.zip","Beasts","Iron",""],["PaperForge513_SwarmofBats_Tier1.zip","Other / review","Copper",""],["PaperForge513_SwarmofBats_Tier2.zip","Other / review","Iron",""],["PaperForge514_VampireLord_Free.zip","Undead","Free",""],["PaperForge514_VampireLord_Tier1.zip","Undead","Copper",""],["PaperForge514_VampireLord_Tier2.zip","Undead","Iron",""],["PaperForge515_(Variant)VampireLord_Tier2.zip","Undead","Iron",""],["PaperForge516[Reskin]_AlchemicalBerserker_Tier3.zip","Other / review","Steel",""],["PaperForge517_ChemicalTank_Tier1.zip","Other / review","Copper",""],["PaperForge517_ChemicalTank_Tier2.zip","Other / review","Iron",""],["PaperForge518_ChemicalTank_Tier1.zip","Other / review","Copper",""],["PaperForge518_ChemicalTank_Tier2.zip","Other / review","Iron",""],["PaperForge519[Reskin]_ChemicalTank_Tier3.zip","Other / review","Steel",""],["PaperForge520_Treant_Free.zip","Plants","Free",""],["PaperForge520_Treant_Tier1.zip","Plants","Copper",""],["PaperForge520_Treant_Tier2.zip","Plants","Iron",""],["PaperForge521_AwakenedShrub_Free.zip","Other / review","Free",""],["PaperForge521_AwakenedShrub_Tier1.zip","Other / review","Copper",""],["PaperForge521_AwakenedShrub_Tier2.zip","Other / review","Iron",""],["PaperForge522_AwakenedShrub_Free.zip","Other / review","Free",""],["PaperForge522_AwakenedShrub_Tier1.zip","Other / review","Copper",""],["PaperForge522_AwakenedShrub_Tier2.zip","Other / review","Iron",""],["PaperForge523_Goblin_Free.zip","Humanoids","Free",""],["PaperForge523_Goblin_Tier1.zip","Humanoids","Copper",""],["PaperForge523_Goblin_Tier2.zip","Humanoids","Iron",""],["PaperForge524_Goblin_Free.zip","Humanoids","Free",""],["PaperForge524_Goblin_Tier1.zip","Humanoids","Copper",""],["PaperForge524_Goblin_Tier2.zip","Humanoids","Iron",""],["PaperForge525_Goblin_Free.zip","Humanoids","Free",""],["PaperForge525_Goblin_Tier1.zip","Humanoids","Copper",""],["PaperForge525_Goblin_Tier2.zip","Humanoids","Iron",""],["PaperForge526_Oni_Free.zip","Giants","Free",""],["PaperForge526_Oni_Tier1.zip","Giants","Copper",""],["PaperForge526_Oni_Tier2.zip","Giants","Iron",""],["PaperForge527_Goblin_Free.zip","Humanoids","Free",""],["PaperForge527_Goblin_Tier1.zip","Humanoids","Copper",""],["PaperForge527_Goblin_Tier2.zip","Humanoids","Iron",""],["PaperForge528_Goblin_Free.zip","Humanoids","Free",""],["PaperForge528_Goblin_Tier1.zip","Humanoids","Copper",""],["PaperForge528_Goblin_Tier2.zip","Humanoids","Iron",""],["PaperForge529_[Reskin]Oni_Tier3.zip","Giants","Steel",""],["PaperForge530_TheButcher_FREE.zip","Other / review","Free",""],["PaperForge530_TheButcher_PNGS_FREE.zip","Other / review","Free",""],["PaperForge530_TheButcher_Cutfile FREE.zip","Other / review","Free",""],["PaperForge530_TheButcherPSD_FREE.zip","Other / review","Free",""],["PaperForge531_ShadowDemon_Free.zip","Fiends","Free",""],["PaperForge531_ShadowDemon_Tier1.zip","Fiends","Copper",""],["PaperForge531_ShadowDemon_Tier2.zip","Fiends","Iron",""],["PaperForge532_Sailor_Free.zip","Other / review","Free",""],["PaperForge532_Sailor_Tier1.zip","Other / review","Copper",""],["PaperForge532_Sailor_Tier2.zip","Other / review","Iron",""],["PaperForge533_[Variant]Sailor_Tier2.zip","Other / review","Iron",""],["PaperForge534_Lich_Free.zip","Undead","Free",""],["PaperForge534_Lich_Tier1.zip","Undead","Copper",""],["PaperForge534_Lich_Tier2.zip","Undead","Iron",""],["PaperForge535_[Variant]Lich_Tier2.zip","Undead","Iron",""],["PaperForge536_Pikeman_Free.zip","Other / review","Free",""],["PaperForge536_Pikeman_Tier1.zip","Other / review","Copper",""],["PaperForge536_Pikeman_Tier2.zip","Other / review","Iron",""],["PaperForge537_[Reskin] Fighter_Tier3.zip","Other / review","Steel",""],["PaperForge538_[Reskin]Swashbuckler_Tier3.zip","Other / review","Steel",""],["PaperForge539_[ModularTerrain]Boulder_1x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge539_[ModularTerrain]Boulder_1x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge539_[ModularTerrain]Boulder_2x1_01_Tier1.zip","Environmental scatter","Copper",""],["PaperForge539_[ModularTerrain]Boulder_2x1_01_Tier2.zip","Environmental scatter","Iron",""],["PaperForge539_[ModularTerrain]Boulder_2x1_02_Tier1.zip","Environmental scatter","Copper",""],["PaperForge539_[ModularTerrain]Boulder_2x1_02_Tier2.zip","Environmental scatter","Iron",""],["PaperForge539_[ModularTerrain]Boulder_3x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge539_[ModularTerrain]Boulder_3x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_1x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_1x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_2x1_01_Tier1.zip","Environmental scatter","Copper",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_2x1_01_Tier2.zip","Environmental scatter","Iron",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_2x1_02_Tier1.zip","Environmental scatter","Copper",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_2x1_02_Tier2.zip","Environmental scatter","Iron",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_3x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_3x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_1x1_Tier3.zip","Environmental scatter","Steel",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_2x1_1_Tier3.zip","Environmental scatter","Steel",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_2x1_2_Tier3.zip","Environmental scatter","Steel",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_3x1_Tier3.zip","Environmental scatter","Steel",""],["PaperForge542_DraconianDreadnought_Free.zip","Other / review","Free",""],["PaperForge542_DraconianDreadnought_Tier1.zip","Other / review","Copper",""],["PaperForge542_DraconianDreadnought_Tier2.zip","Other / review","Iron",""],["PaperForge543_[Variant]DragonbornWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge544_[Reskin]ForgeworkBull_Tier3.zip","Other / review","Steel",""],["PaperForge545_DraconianFootSoldier_Free.zip","Other / review","Free",""],["PaperForge545_DraconianFootSoldier_Tier1.zip","Other / review","Copper",""],["PaperForge545_DraconianFootSoldier_Tier2.zip","Other / review","Iron",""],["PaperForge546_[Variant]Dragonborn_Tier2.zip","Humanoids","Iron",""],["PaperForge547_Horse_Free.zip","Beasts","Free",""],["PaperForge547_Horse_Tier1.zip","Beasts","Copper",""],["PaperForge547_Horse_Tier2.zip","Beasts","Iron",""],["PaperForge548_[VariantHorse_Tier2.zip","Beasts","Iron",""],["PaperForge549_Mule_Free.zip","Other / review","Free",""],["PaperForge549_Mule_Tier1.zip","Other / review","Copper",""],["PaperForge549_Mule_Tier2.zip","Other / review","Iron",""],["PaperForge550_[Variant]Mule_Tier2.zip","Other / review","Iron",""],["PaperForge551_[Reskin]PackMule_Tier3.zip","Bundles and rewards","Steel",""],["PaperForge552_TwigBlight_Free.zip","Plants","Free",""],["PaperForge552_TwigBlight_Tier1.zip","Plants","Copper",""],["PaperForge552_TwigBlight_Tier2.zip","Plants","Iron",""],["PaperForge553_TwigBlight_Free.zip","Plants","Free",""],["PaperForge553_TwigBlight_Tier1.zip","Plants","Copper",""],["PaperForge553_TwigBlight_Tier2.zip","Plants","Iron",""],["PaperForge554_[Fanart]Kyra_FREE.zip","Other / review","Free",""],["PaperForge554_[Fanart]Kyra_PNGS_FREE.zip","Other / review","Free",""],["PaperForge554_[Fanart]Kyra_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge554_[Fanart]KyraPSD_FREE.zip","Other / review","Free",""],["PaperForge555_[Reskin]Barbarian_Tier3.zip","Other / review","Steel",""],["PaperForge556_Fighter_Free.zip","Other / review","Free",""],["PaperForge556_Fighter_Tier1.zip","Other / review","Copper",""],["PaperForge556_Fighter_Tier2.zip","Other / review","Iron",""],["PaperForge557_[Variant]Fighter_Tier2.zip","Other / review","Iron",""],["PaperForge558_[Reskin]Sorceress_Tier3.zip","Humanoids","Steel",""],["PaperForge559_SahuaginBaron_Free.zip","Other / review","Free",""],["PaperForge559_SahuaginBaron_Tier1.zip","Other / review","Copper",""],["PaperForge559_SahuaginBaron_Tier2.zip","Other / review","Iron",""],["PaperForge560_SahuaginPriestess_Free.zip","Other / review","Free",""],["PaperForge560_SahuaginPriestess_Tier1.zip","Other / review","Copper",""],["PaperForge560_SahuaginPriestess_Tier2.zip","Other / review","Iron",""],["PaperForge561_[Reskin]SahuaginHighPriestess_Tier3.zip","Other / review","Steel",""],["PaperForge562_Fox_Free.zip","Other / review","Free",""],["PaperForge562_Fox_Tier1.zip","Other / review","Copper",""],["PaperForge562_Fox_Tier2.zip","Other / review","Iron",""],["PaperForge563_Stirge_Free.zip","Other / review","Free",""],["PaperForge563_Stirge_Tier1.zip","Other / review","Copper",""],["PaperForge563_Stirge_Tier2.zip","Other / review","Iron",""],["PaperForge564_[Reskin]ShellShark_Tier3.zip","Beasts","Steel",""],["PaperForge565_[Fanart]Seoni_FREE.zip","Other / review","Free",""],["PaperForge565_[Fanart]Seoni_PNGs_FREE.zip","Other / review","Free",""],["PaperForge565_[Fanart]Seoni_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge565_[Fanart]SeoniPSD_FREE.zip","Other / review","Free",""],["PaperForge566_ShamblingMound_Free.zip","Plants","Free",""],["PaperForge566_ShamblingMound_Tier1.zip","Plants","Copper",""],["PaperForge566_ShamblingMound_Tier2.zip","Plants","Iron",""],["PaperForge567_ForceBallista_Free.zip","Humanoids","Free",""],["PaperForge567_ForceBallista_Tier1.zip","Humanoids","Copper",""],["PaperForge567_ForceBallista_Tier2.zip","Humanoids","Iron",""],["PaperForgete568_Flamethrower_Free.zip","Bundles and rewards","Free",""],["PaperForgete568_Flamethrower_Tier1.zip","Bundles and rewards","Copper",""],["PaperForgete568_Flamethrower_Tier2.zip","Bundles and rewards","Iron",""],["PaperForge569_Protector_Free.zip","Other / review","Free",""],["PaperForge569_Protector_Tier1.zip","Other / review","Copper",""],["PaperForge569_Protector_Tier2.zip","Other / review","Iron",""],["PaperForge570_PDFs.zip","Other / review","Copper",""],["PaperForge570_PNGs.zip","Other / review","Copper",""],["PaperForge571_Crab_Free.zip","Other / review","Free",""],["PaperForge571_Crab_Tier1.zip","Other / review","Copper",""],["PaperForge571_Crab_Tier2.zip","Other / review","Iron",""],["PaperForge572_Magmin_Free.zip","Other / review","Free",""],["PaperForge572_Magmin_Tier1.zip","Other / review","Copper",""],["PaperForge572_Magmin_Tier2.zip","Other / review","Iron",""],["PaperForge573_[Reskin]SahuaginBlademaster_Tier3.zip","Other / review","Steel",""],["PaperForge574_[Reskin]SahuaginCoralSmasher_Tier3.zip","Other / review","Steel",""],["PaperForge575_EarthElemental_Free.zip","Elementals","Free",""],["PaperForge575_EarthElemental_Tier1.zip","Elementals","Copper",""],["PaperForge575_EarthElemental_Tier2.zip","Elementals","Iron",""],["PaperForge576_[Fanart]Merisiel_FREE.zip","Other / review","Free",""],["PaperForge576_[Fanart]Merisiel_PNGs_FREE.zip","Other / review","Free",""],["PaperForge576_[Fanart]Merisiel_Cutfile_Free.zip","Other / review","Free",""],["PaperForge576_[Fanart]MerisielPSD_FREE.zip","Other / review","Free",""],["PaperForge577_AirElemental_Free.zip","Elementals","Free",""],["PaperForge577_AirElemental_Tier1.zip","Elementals","Copper",""],["PaperForge577_AirElemental_Tier2.zip","Elementals","Iron",""],["PaperForge578_WaterElemental_Free.zip","Elementals","Free",""],["PaperForge578_WaterElemental_Tier1.zip","Elementals","Copper",""],["PaperForge578_WaterElemental_Tier2.zip","Elementals","Iron",""],["PaperForge579_MagmaMephit_Free.zip","Elementals","Free",""],["PaperForge579_MagmaMephit_Tier1.zip","Elementals","Copper",""],["PaperForge579_MagmaMephit_Tier2.zip","Elementals","Iron",""],["PaperForge580_IceMephit_Free.zip","Elementals","Free",""],["PaperForge580_IceMephit_Tier1.zip","Elementals","Copper",""],["PaperForge580_IceMephit_Tier2.zip","Elementals","Iron",""],["PaperForge581_MudMephit_Free.zip","Elementals","Free",""],["PaperForge581_MudMephit_Tier1.zip","Elementals","Copper",""],["PaperForge581_MudMephit_Tier2.zip","Elementals","Iron",""],["PaperForge582_SmokeMephit_Free.zip","Elementals","Free",""],["PaperForge582_SmokeMephit_Tier1.zip","Elementals","Copper",""],["PaperForge582_SmokeMephit_Tier2.zip","Elementals","Iron",""],["PaperForge583_FireElemental_Free.zip","Elementals","Free",""],["PaperForge583_FireElemental_Tier1.zip","Elementals","Copper",""],["PaperForge583_FireElemental_Tier2.zip","Elementals","Iron",""],["PaperForge584_[Reskin]WaterElementalMyrmidon_Tier3.zip","Elementals","Steel",""],["PaperForge585_[Fanart]Valeros_FREE.zip","Other / review","Free",""],["PaperForge585_[Fanart]Valeros_PNGs_FREE.zip","Other / review","Free",""],["PaperForge585_[Fanart]Valeros_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge585_[Fanart]ValerosPSD_FREE.zip","Other / review","Free",""],["PaperForge586_[Fanart]Valeros_FREE.zip","Other / review","Free",""],["PaperForge586_[Fanart]Valeros_PNGs_FREE.zip","Other / review","Free",""],["PaperForge586_[Fanart]Valeros_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge586_[Fanart]ValerosPSD_FREE.zip","Other / review","Free",""],["PaperForge587_AnimatedArmor_Free.zip","Constructs","Free",""],["PaperForge587_AnimatedArmor_Tier1.zip","Constructs","Copper",""],["PaperForge587_AnimatedArmor_Tier2.zip","Constructs","Iron",""],["PaperForge588_[Variant]AnimatedArmor_Tier2.zip","Constructs","Iron",""],["PaperForge589_AnimatedArmor_Free.zip","Constructs","Free",""],["PaperForge589_AnimatedArmor_Tier1.zip","Constructs","Copper",""],["PaperForge589_AnimatedArmor_Tier2.zip","Constructs","Iron",""],["PaperForge590_[Variant]AnimatedArmor_Tier2.zip","Constructs","Iron",""],["PaperForge591_Sharklin_Free.zip","Beasts","Free",""],["PaperForge591_Sharklin_Tier1.zip","Beasts","Copper",""],["PaperForge591_Sharklin_Tier2.zip","Beasts","Iron",""],["PaperForge592_SharklinNetter_Free.zip","Beasts","Free",""],["PaperForge592_SharklinNetter_Tier1.zip","Beasts","Copper",""],["PaperForge592_SharklinNetter_Tier2.zip","Beasts","Iron",""],["PaperForge593_SharklinHarpooner_Free.zip","Beasts","Free",""],["PaperForge593_SharklinHarpooner_Tier1.zip","Beasts","Copper",""],["PaperForge593_SharklinHarpooner_Tier2.zip","Beasts","Iron",""],["PaperForge594_Trees_Tier1.zip","Environmental scatter","Copper",""],["PaperForge594_Trees_Tier2.zip","Environmental scatter","Iron",""],["PaperForge595_[Fanart]Beholde595_[Fanart]Beholder_FREE.zip","Other / review","Free",""],["PaperForge595_[Fanart]Beholde595_[Fanart]Beholder_PNGS_FREE.zip","Other / review","Free",""],["PaperForge595_[Fanart]Beholde595_[Fanart]Beholder_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge595_[Fanart]Beholde595_[Fanart]Beholder_PSD_FREE.zip","Other / review","Free",""],["PaperForge596_Knight_Free.zip","Humanoids","Free",""],["PaperForge596_Knight_Tier1.zip","Humanoids","Copper",""],["PaperForge596_Knight_Tier2.zip","Humanoids","Iron",""],["PaperForge597_[Reskin]Knight_Tier3.zip","Humanoids","Iron",""],["PaperForge598_GibberingMouther_Free.zip","Aberrations","Free",""],["PaperForge598_GibberingMouther_Tier1.zip","Aberrations","Copper",""],["PaperForge598_GibberingMouther_Tier2.zip","Aberrations","Iron",""],["PaperForge599_Ranger_Free.zip","Humanoids","Free",""],["PaperForge599_Ranger_Tier1.zip","Humanoids","Copper",""],["PaperForge599_Ranger_Tier2.zip","Humanoids","Iron",""],["PaperForge600_[Variant]Ranger_Tier2.zip","Humanoids","Iron",""],["PaperForge601_HobgoblinSoldier_Free.zip","Humanoids","Free",""],["PaperForge601_HobgoblinSoldier_Tier1.zip","Humanoids","Copper",""],["PaperForge601_HobgoblinSoldier_Tier2.zip","Humanoids","Iron",""],["PaperForge602_HobgoblinSoldie_Free.zip","Humanoids","Free",""],["PaperForge602_HobgoblinSoldie_Tier1.zip","Humanoids","Copper",""],["PaperForge602_HobgoblinSoldie_Tier2.zip","Humanoids","Iron",""],["PaperForge603_HobgoblinSoldier_Free.zip","Humanoids","Free",""],["PaperForge603_HobgoblinSoldier_Tier1.zip","Humanoids","Copper",""],["PaperForge603_HobgoblinSoldier_Tier2.zip","Humanoids","Iron",""],["PaperForge604_TheOverseer_Free.zip","Other / review","Free",""],["PaperForge604_TheOverseer_Free.zip","Other / review","Copper",""],["PaperForge604_TheOverseer_Tier2.zip","Other / review","Iron",""],["PaperForge605_UndeadWorker_Free.zip","Other / review","Free",""],["PaperForge605_UndeadWorker_Tier1.zip","Other / review","Copper",""],["PaperForge605_UndeadWorker_Tier2.zip","Other / review","Iron",""],["PaperForge606_UndeadWorker_Free.zip","Other / review","Free",""],["PaperForge606_UndeadWorker_Tier1.zip","Other / review","Copper",""],["PaperForge606_UndeadWorker_Tier2.zip","Other / review","Iron",""],["PaperForge607_GiantRat_Free.zip","Beasts","Free",""],["PaperForge607_GiantRat_Tier1.zip","Beasts","Copper",""],["PaperForge607_GiantRat_Tier2.zip","Beasts","Iron",""],["PaperForge608_Cyclops_Free.zip","Giants","Free",""],["PaperForge608_Cyclops_Tier1.zip","Giants","Copper",""],["PaperForge608_Cyclops_Tier2.zip","Giants","Iron",""],["PaperForge609_DungeonWalls1x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge609_DungeonWalls1x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge609_DungeonWalls2x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge609_DungeonWalls2x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge609_DungeonWalls3x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge609_DungeonWalls3x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge609_DungeonWalls6x1_Tier1.zip","Environmental scatter","Copper",""],["PaperForge609_DungeonWalls6x1_Tier2.zip","Environmental scatter","Iron",""],["PaperForge610_RuinedWalls1x1_Tier1.zip","Other / review","Copper",""],["PaperForge610_RuinedWalls1x1_Tier2.zip","Other / review","Iron",""],["PaperForge610_RuinedWalls2x1_Tier1.zip","Other / review","Copper",""],["PaperForge610_RuinedWalls2x1_Tier2.zip","Other / review","Iron",""],["PaperForge610_RuinedWalls3x1_Tier1.zip","Other / review","Copper",""],["PaperForge610_RuinedWalls3x1_Tier2.zip","Other / review","Iron",""],["PaperForge610_RuinedWalls6x1_Tier1.zip","Other / review","Copper",""],["PaperForge610_RuinedWalls6x1_Tier2.zip","Other / review","Iron",""],["PaperForge611_RuinedWalls1x1_Tier1.zip","Other / review","Copper",""],["PaperForge611_RuinedWalls1x1_Tier2.zip","Other / review","Iron",""],["PaperForge611_RuinedWalls2x1_Tier1.zip","Other / review","Copper",""],["PaperForge611_RuinedWalls2x1_Tier2.zip","Other / review","Iron",""],["PaperForge611_RuinedWalls3x1_Tier1.zip","Other / review","Copper",""],["PaperForge611_RuinedWalls3x1_Tier2.zip","Other / review","Iron",""],["PaperForge611_RuinedWalls6x1_Tier1.zip","Other / review","Copper",""],["PaperForge611_RuinedWalls6x1_Tier2.zip","Other / review","Iron",""],["PaperForge612_RuinedWalls1x1_Tier1.zip","Other / review","Copper",""],["PaperForge612_RuinedWalls1x1_Tier2.zip","Other / review","Iron",""],["PaperForge612_RuinedWalls2x1_Tier1.zip","Other / review","Copper",""],["PaperForge612_RuinedWalls2x1_Tier2.zip","Other / review","Iron",""],["PaperForge612_RuinedWalls3x1_Tier1.zip","Other / review","Copper",""],["PaperForge612_RuinedWalls3x1_Tier2.zip","Other / review","Iron",""],["PaperForge612_RuinedWalls6x1_Tier1.zip","Other / review","Copper",""],["PaperForge612_RuinedWalls6x1_Tier2.zip","Other / review","Iron",""],["PaperForge613_DungeonTiles4x4_Tier1.zip","Environmental scatter","Copper",""],["PaperForge613_DungeonTiles4x4_Tier2.zip","Environmental scatter","Iron",""],["PaperForge613_DungeonTiles6x2_Tier1.zip","Environmental scatter","Copper",""],["PaperForge613_DungeonTiles6x2_Tier2.zip","Environmental scatter","Iron",""],["PaperForge613_DungeonTiles6x6_Tier1.zip","Environmental scatter","Copper",""],["PaperForge613_DungeonTiles6x6_Tier2.zip","Environmental scatter","Iron",""],["PaperForge613_DungeonTiles8x10_Tier1.zip","Environmental scatter","Copper",""],["PaperForge613_DungeonTiles8x10_Tier2.zip","Environmental scatter","Iron",""],["PaperForge614_[Fanart]Seelah_FREE.zip","Other / review","Free",""],["PaperForge614_[Fanart]Seelah_PNGs_FREE.zip","Other / review","Free",""],["PaperForge614_[Fanart]Seelah_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge614_[Fanart]SeelahPSD_FREE.zip","Other / review","Free",""],["PaperForge615_Commoner_Free.zip","Other / review","Free",""],["PaperForge615_Commoner_Tier1.zip","Other / review","Copper",""],["PaperForge615_Commoner_Tier2.zip","Other / review","Iron",""],["PaperForge616_Commoner_Free.zip","Other / review","Free",""],["PaperForge616_Commoner_Tier1.zip","Other / review","Copper",""],["PaperForge616_Commoner_Tier2.zip","Other / review","Iron",""],["PaperForge617_[Reskin]DarkElfKnight_Tier3.zip","Humanoids","Steel",""],["PaperForge618_Commoner_Free.zip","Other / review","Free",""],["PaperForge618_Commoner_Tier1.zip","Other / review","Copper",""],["PaperForge618_Commoner_Tier2.zip","Other / review","Iron",""],["PaperForge619_Commoner_Free.zip","Other / review","Free",""],["PaperForge619_Commoner_Tier1.zip","Other / review","Copper",""],["PaperForge619_Commoner_Tier2.zip","Other / review","Iron",""],["PaperForge620_[Reskin]DarkElfWarrior_Tier3.zip","Humanoids","Steel",""],["PaperForge621_[Reskin]DarkElfWarrior_Tier3.zip","Humanoids","Steel",""],["PaperForge622_Priestess_Free.zip","Other / review","Free",""],["PaperForge622_Priestess_Tier1.zip","Other / review","Copper",""],["PaperForge622_Priestess_Tier2.zip","Other / review","Iron",""],["PaperForge623_StormGiant_Free.zip","Giants","Free",""],["PaperForge623_StormGiant_Tier1.zip","Giants","Copper",""],["PaperForge623_StormGiant_Tier2.zip","Giants","Iron",""],["PaperForge624_[Reskin]TotSWalls1x1_Tier3.zip","Other / review","Steel",""],["PaperForge624_[Reskin]TotSWalls2x1_Tier3.zip","Other / review","Steel",""],["PaperForge624_[Reskin]TotSWalls3x1_Tier3.zip","Other / review","Steel",""],["PaperForge624_[Reskin]TotSWalls6x1_Tier3.zip","Other / review","Steel",""],["PaperForge625_TotS_Sarcophagus_Tier1.zip","Fey","Copper",""],["PaperForge625_TotS_Sarcophagus_Tier2.zip","Fey","Iron",""],["PaperForge626_MagicCircle_Tier1.zip","Other / review","Copper",""],["PaperForge626_MagicCircle_Tier2.zip","Other / review","Iron",""],["PaperForge627_ToTS_Vase_Tier1.zip","Other / review","Copper",""],["PaperForge627_ToTS_Vase_Tier2.zip","Other / review","Iron",""],["PaperForge628_ToTS_Brazier_Tier1.zip","Other / review","Copper",""],["PaperForge628_ToTS_Brazier_Tier2.zip","Other / review","Iron",""],["PaperForge629_ToTS_Statue_Tier1.zip","Other / review","Copper",""],["PaperForge629_ToTS_Statue_Tier2.zip","Other / review","Iron",""],["PaperForge630_VampireSpawn_Free.zip","Undead","Free",""],["PaperForge630_VampireSpawn_Tier1.zip","Undead","Copper",""],["PaperForge630_VampireSpawn_Tier2.zip","Undead","Iron",""],["PaperForge631_InfectedTownswoman_Free.zip","Other / review","Free",""],["PaperForge631_InfectedTownswoman_Tier1.zip","Other / review","Copper",""],["PaperForge631_InfectedTownswoman_Tier2.zip","Other / review","Iron",""],["PaperForge632_SnakePriestess_Free.zip","Beasts","Free",""],["PaperForge632_SnakePriestess_Tier1.zip","Beasts","Copper",""],["PaperForge632_SnakePriestess_Tier2.zip","Beasts","Iron",""],["PaperForge633_[Reskin]HulkingWorker_Tier3.zip","Other / review","Steel",""],["PaperForge634_VampireSpawn_Free.zip","Undead","Free",""],["PaperForge634_VampireSpawn_Tier1.zip","Undead","Copper",""],["PaperForge634_VampireSpawn_Tier2.zip","Undead","Iron",""],["PaperForge635_InfectedTownsman_Free.zip","Other / review","Free",""],["PaperForge635_InfectedTownsman_Tier1.zip","Other / review","Copper",""],["PaperForge635_InfectedTownsman_Tier2.zip","Other / review","Iron",""],["PaperForge636_Commoner_Free.zip","Other / review","Free",""],["PaperForge636_Commoner_Tier1.zip","Other / review","Copper",""],["PaperForge636_Commoner_Tier2.zip","Other / review","Iron",""],["PaperForge637_Commoner_Free.zip","Other / review","Free",""],["PaperForge637_Commoner_Tier1.zip","Other / review","Copper",""],["PaperForge637_Commoner_Tier2.zip","Other / review","Iron",""],["PaperFroge638_Commoner_Free.zip","Bundles and rewards","Free",""],["PaperFroge638_Commoner_Tier1.zip","Bundles and rewards","Copper",""],["PaperFroge638_Commoner_Tier2.zip","Bundles and rewards","Iron",""],["PaperForge639_Cleric_Free.zip","Humanoids","Free",""],["PaperForge639_Cleric_Tier1.zip","Humanoids","Copper",""],["PaperForge639_Cleric_Tier2.zip","Humanoids","Iron",""],["PaperForge640_AcidZombie_Free.zip","Undead","Free",""],["PaperForge640_AcidZombie_Tier1.zip","Undead","Copper",""],["PaperForge640_AcidZombie_Tier2.zip","Undead","Iron",""],["PaperForge641_Druid_Free.zip","Other / review","Free",""],["PaperForge641_Druid_Tier1.zip","Other / review","Copper",""],["PaperForge641_Druid_Tier2.zip","Other / review","Iron",""],["PaperForge642_DireBat_Free.zip","Beasts","Free",""],["PaperForge642_DireBat_Tier1.zip","Beasts","Copper",""],["PaperForge642_DireBat_Tier2.zip","Beasts","Iron",""],["PaperForge643_WarBat_Free.zip","Beasts","Free",""],["PaperForge643_WarBat_Tier1.zip","Beasts","Copper",""],["PaperForge643_WarBat_Tier2.zip","Beasts","Iron",""],["PaperForge644_GoblinBatRider_Free.zip","Beasts","Free",""],["PaperForge644_GoblinBatRider_Tier1.zip","Beasts","Copper",""],["PaperForge644_GoblinBatRider_Tier2.zip","Beasts","Iron",""],["PaperForge645_[Reskin]GoblinGuanoBomber_Tier3.zip","Humanoids","Steel",""],["PaperForge646_[Reskin]TheGhostlinRider_Tier3.zip","Undead","Steel",""],["PaperForge647_[Reskin]SporesDruid_Tier3.zip","Other / review","Steel",""],["PaperForge648_PaperBoy_Free.zip","Other / review","Free",""],["PaperForge648_PaperBoy_Tier1.zip","Other / review","Copper",""],["PaperForge648_PaperBoy_Tier2.zip","Other / review","Iron",""],["PaperForge649_NoticeBoard_Tier1.zip","Beasts","Copper",""],["PaperForge649_NoticeBoard_Tier2.zip","Beasts","Iron",""],["PaperForge650_Guard_Free.zip","Humanoids","Free",""],["PaperForge650_Guard_Tier1.zip","Humanoids","Copper",""],["PaperForge650_Guard_Tier2.zip","Humanoids","Iron",""],["PaperForge651_Guard_Free.zip","Humanoids","Free",""],["PaperForge651_Guard_Tier1.zip","Humanoids","Copper",""],["PaperForge651_Guard_Tier2.zip","Humanoids","Iron",""],["PaperForge652_Guard_Free.zip","Humanoids","Free",""],["PaperForge652_Guard_Tier1.zip","Humanoids","Copper",""],["PaperForge652_Guard_Tier2.zip","Humanoids","Iron",""],["PaperForge653_Guard_Free.zip","Humanoids","Free",""],["PaperForge653_Guard_Tier1.zip","Humanoids","Copper",""],["PaperForge653_Guard_Tier2.zip","Humanoids","Iron",""],["PaperForge654_Guard_Free.zip","Humanoids","Free",""],["PaperForge654_Guard_Tier2.zip","Humanoids","Copper",""],["PaperForge654_Guard_Tier2.zip","Humanoids","Iron",""],["PaperForge655_GiantRaven_Free.zip","Giants","Free",""],["PaperForge655_GiantRaven_Tier2.zip","Giants","Copper",""],["PaperForge655_GiantRaven_Tier2.zip","Giants","Iron",""],["PaperForge656_Child_Free.zip","Other / review","Free",""],["PaperForge656_Child_Tier1.zip","Other / review","Copper",""],["PaperForge656_Child_Tier2.zip","Other / review","Iron",""],["PaperForge657_Child_Free.zip","Other / review","Free",""],["PaperForge657_Child_Tier1.zip","Other / review","Copper",""],["PaperForge657_Child_Tier2.zip","Other / review","Iron",""],["PaperForge658_Child_Free.zip","Other / review","Free",""],["PaperForge658_Child_Tier1.zip","Other / review","Copper",""],["PaperForge658_Child_Tier2.zip","Other / review","Iron",""],["PaperForge659_Child_Free.zip","Other / review","Free",""],["PaperForge659_Child_Tier1.zip","Other / review","Copper",""],["PaperForge659_Child_Tier2.zip","Other / review","Iron",""],["PaperForge660_[Fanart]AdultKruthik_PNGs_FREE.zip","Other / review","Free",""],["PaperForge660_[Fanart]AdultKruthik_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge661_[Fanart]YoungKruthik_PNG_FREE.zip","Other / review","Free",""],["PaperForge661_[Fanart]YoungKruthik_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge662_[Reskin]YoungZharraki_Tier3.zip","Other / review","Steel",""],["PaperForge663_[Reskin]AdultZharraki_Tier3.zip","Other / review","Steel",""],["PaperForge664_[Reskin]ZharrakiSpitter_Tier3.zip","Other / review","Steel",""],["PaperForge665_[Fanart]Umberhulk_PNG_FREE.zip","Other / review","Free",""],["PaperForge665_[Fanart]Umberhulk_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge666_[Fanart]Asmodeus_FREE.zip","Other / review","Free",""],["PaperForge666_[Fanart]Asmodeus_PNGs_FREE.zip","Other / review","Free",""],["PaperForge666_[Fanart]Asmodeus_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge666_[Fanart]AsmodeusPSD_FREE.zip","Other / review","Free",""],["PaperForge667_[Fanart]Ezren_FREE.zip","Other / review","Free",""],["PaperForge667_[Fanart]Ezren_PNGs_FREE.zip","Other / review","Free",""],["PaperForge667_[Fanart]Ezren_Cutfile_FREE.zip","Other / review","Free",""],["PaperForge667_[Fanart]EzrenPSD_FREE.zip","Other / review","Free",""],["PaperForge668_[Reskin]ImpalerHulk_Tier3.zip","Other / review","Steel",""],["PaperForge669_[Reskin]SpellbladeTier3.zip","Other / review","Steel",""],["PaperForge670_Gatorling_Free.zip","Other / review","Free",""],["PaperForge670_Gatorling_Tier1.zip","Other / review","Copper",""],["PaperForge670_Gatorling_Tier2.zip","Other / review","Iron",""],["PaperForge671_Gatorling_Free.zip","Other / review","Free",""],["PaperForge671_Gatorling_Tier1.zip","Other / review","Copper",""],["PaperForge671_Gatorling_Tier2.zip","Other / review","Iron",""],["PaperForge672_Gatorling_Tier2.zip","Other / review","Iron",""],["PaperForge673_Gatorling_Tier2.zip","Other / review","Iron",""],["PaperForge674_LeDouanier_Tier2.zip","Other / review","Iron",""],["PaperForge675_UndeadWarrior_Free.zip","Humanoids","Free",""],["PaperForge675_UndeadWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge675_UndeadWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge676_[Reskin]PhantomWarrior_Tier3.zip","Humanoids","Steel",""],["PaperForge677_UndeadArcher_Free.zip","Other / review","Free",""],["PaperForge677_UndeadArcher_Tier1.zip","Other / review","Copper",""],["PaperForge677_UndeadArcher_Tier2.zip","Other / review","Iron",""],["PaperForge678_[Reskin]PhantomArcher_Tier3.zip","Other / review","Steel",""],["PaperForge679_SharklinChief_Tier1.zip","Beasts","Free",""],["PaperForge679_SharklinChief_Tier1.zip","Beasts","Copper",""],["PaperForge679_SharklinChief_Tier2.zip","Beasts","Iron",""],["PaperForge680_Barbarian_Free.zip","Other / review","Free",""],["PaperForge680_Barbarian_Tier1.zip","Other / review","Copper",""],["PaperForge680_Barbarian_Tier2.zip","Other / review","Iron",""],["PaperForge681_[Reskin]Monk_Tier3.zip","Humanoids","Steel",""],["PaperForge682_[Reskin]Barbarian_Tier3.zip","Other / review","Steel",""],["PaperForge683_NoviceFighter_Free.zip","Other / review","Free",""],["PaperForge683_NoviceFighter_Tier1.zip","Other / review","Copper",""],["PaperForge683_NoviceFighter_Tier2.zip","Other / review","Iron",""],["PaperForge684_NoviceWizard_Free.zip","Humanoids","Free",""],["PaperForge684_NoviceWizard_Tier1.zip","Humanoids","Copper",""],["PaperForge684_NoviceWizard_Tier2.zip","Humanoids","Iron",""],["PaperForge685_GelatinousCube_Free.zip","Oozes","Free",""],["PaperForge685_GelatinousCube_Tier1.zip","Oozes","Copper",""],["PaperForge685_GelatinousCube_Tier2.zip","Oozes","Iron",""],["PaperForge686_[Reskin]GelatinousCube_Tier3.zip","Oozes","Steel",""],["PaperForge687_[Reskin]GelatinousCube_Tier3.zip","Oozes","Steel",""],["PaperForge688_NoviceCleric_Free.zip","Humanoids","Free",""],["PaperForge688_NoviceCleric_Tier1.zip","Humanoids","Copper",""],["PaperForge688_NoviceCleric_Tier2.zip","Humanoids","Iron",""],["PaperForge689_NoviceRogue_Free.zip","Humanoids","Free",""],["PaperForge689_NoviceRogue_Tier1.zip","Humanoids","Copper",""],["PaperForge689_NoviceRogue_Tier2.zip","Humanoids","Iron",""],["PaperForge690_Dog_Free.zip","Other / review","Free",""],["PaperForge690_Dog_Tier1.zip","Other / review","Copper",""],["PaperForge690_Dog_Tier2.zip","Other / review","Iron",""],["PaperForge691_Dog_Free.zip","Other / review","Free",""],["PaperForge691_Dog_Tier1.zip","Other / review","Copper",""],["PaperForge691_Dog_Tier2.zip","Other / review","Iron",""],["PaperForge692_[Reskin]NoviceWitch_Tier3.zip","Other / review","Steel",""],["PaperForge693_[Reskin]Dog_Tier3.zip","Other / review","Steel",""],["PaperForge694_Blink Dog_Free.zip","Other / review","Free",""],["PaperForge694_Blink Dog_Tier1.zip","Other / review","Copper",""],["PaperForge694_Blink Dog_Tier2.zip","Other / review","Iron",""],["PaperForge695_[Variant]BlinkDog_Tier2.zip","Other / review","Iron",""],["PaperForge696_Kenku_Free.zip","Other / review","Free",""],["PaperForge696_Kenku_Tier1.zip","Other / review","Copper",""],["PaperForge696_Kenku_Tier2.zip","Other / review","Iron",""],["PaperForge697_Kenku_Free.zip","Other / review","Free",""],["PaperForge697_Kenku_Tier1.zip","Other / review","Copper",""],["PaperForge697_Kenku_Tier2.zip","Other / review","Iron",""],["PaperForge698_[Variant]Kenk_Tier2.zip","Other / review","Iron",""],["PaperForge699_[Reskin]Kenku_Tier3.zip","Other / review","Steel",""],["PaperForge700_NoviceMonk_Free.zip","Humanoids","Free",""],["PaperForge700_NoviceMonk_Tier1.zip","Humanoids","Copper",""],["PaperForge700_NoviceMonk_Tier2.zip","Humanoids","Iron",""],["PaperForge701_Mermaid_Free.zip","Other / review","Free",""],["PaperForge701_Mermaid_Tier1.zip","Other / review","Copper",""],["PaperForge701_Mermaid_Tier2.zip","Other / review","Iron",""],["PaperForge702_Siren_Free.zip","Other / review","Free",""],["PaperForge702_Siren_Tier1.zip","Other / review","Copper",""],["PaperForge702_Siren_Tier2.zip","Other / review","Iron",""],["PaperForge703_[Variant]Siren_Tier2.zip","Other / review","Iron",""],["PaperForge704_AxeBeak_Free.zip","Other / review","Free",""],["PaperForge704_AxeBeak_Tier1.zip","Other / review","Copper",""],["PaperForge704_AxeBeak_Tier2.zip","Other / review","Iron",""],["PaperForge705_[Variant]AxeBeak_Tier2.zip","Other / review","Iron",""],["Paperforge706_[Reskin]Siren_Tier3.zip","Other / review","Steel",""],["PaperForge707_[Reskin]AxeBeak_Tier3.zip","Other / review","Steel",""],["PaperForge708_PitFighter_Free.zip","Other / review","Free",""],["PaperForge708_PitFighter_Tier1.zip","Other / review","Copper",""],["PaperForge708_PitFighter_Tier2.zip","Other / review","Iron",""],["PaperForge709_PitFighter_Free.zip","Other / review","Free",""],["PaperForge709_PitFighter_Tier1.zip","Other / review","Copper",""],["PaperForge709_PitFighter_Tier2.zip","Other / review","Iron",""],["PaperForge710_PitFighter_Free.zip","Other / review","Free",""],["PaperForge710_PitFighter_Tier1.zip","Other / review","Copper",""],["PaperForge710_PitFighter_Tier2.zip","Other / review","Iron",""],["PaperForge711_PitFighter_Free.zip","Other / review","Free",""],["PaperForge711_PitFighter_Tier1.zip","Other / review","Copper",""],["PaperForge711_PitFighter_Tier2.zip","Other / review","Iron",""],["PaperForge712_SmallArena_Tier1.zip","Other / review","Copper",""],["PaperForge712_SmallArena_Tier2.zip","Other / review","Iron",""],["PaperForge713_ArenaWalls3x1_Tier1.zip","Other / review","Copper",""],["PaperForge713_ArenaWalls3x1_Tier2.zip","Other / review","Iron",""],["PaperForge714_ArenaWalls3x1_Tier1.zip","Other / review","Copper",""],["PaperForge714_ArenaWalls3x1_Tier2.zip","Other / review","Iron",""],["PaperForge715_GeneralGoodsMerchant_Free.zip","Other / review","Free",""],["PaperForge715_GeneralGoodsMerchant_Tier1.zip","Other / review","Copper",""],["PaperForge715_GeneralGoodsMerchant_Tier2.zip","Other / review","Iron",""],["PaperForge716_GeneralGoodsMerchant_Free.zip","Other / review","Free",""],["PaperForge716_GeneralGoodsMerchant_Tier1.zip","Other / review","Copper",""],["PaperForge716_GeneralGoodsMerchant_Tier2.zip","Other / review","Iron",""],["PaperForge717_GeneralGoodsStall.zip","Other / review","Steel",""],["PaperForge718_[Reskin]Mule_GeneralGoods_Tier3.zip","Other / review","Steel",""],["PaperForge719_RedDragon_Tier1.zip","Dragons","Copper",""],["PaperForge720_DragonWyrmling_Free.zip","Dragons","Free",""],["PaperForge720_DragonWyrmling_Tier1.zip","Dragons","Copper",""],["PaperForge720_DragonWyrmling_Tier2.zip","Dragons","Iron",""],["PaperForge721_DragonEggs_Free.zip","Dragons","Free",""],["PaperForge721_DragonEggs_Tier1.zip","Dragons","Copper",""],["PaperForge721_DragonEggs_Tier2.zip","Dragons","Iron",""],["PaperForge722_PsiBrawler_Free.zip","Other / review","Free",""],["PaperForge722_PsiBrawler_Tier1.zip","Other / review","Copper",""],["PaperForge722_PsiBrawler_Tier2.zip","Other / review","Iron",""],["PaperForge723_PsiCommander_Free.zip","Other / review","Free",""],["PaperForge723_PsiCommander_Tier1.zip","Other / review","Copper",""],["PaperForge723_PsiCommander_Tier2.zip","Other / review","Iron",""],["PaperForge724_PsiSwordsman_Free.zip","Other / review","Free",""],["PaperForge724_PsiSwordsman_Tier1.zip","Other / review","Copper",""],["PaperForge724_PsiSwordsman_Tier2.zip","Other / review","Iron",""],["PaperForge725_PsiChosenOne_Free.zip","Other / review","Free",""],["PaperForge725_PsiChosenOne_Tier1.zip","Other / review","Copper",""],["PaperForge725_PsiChosenOne_Tier2.zip","Other / review","Iron",""],["PaperForge726_PsiBrawler_Free.zip","Other / review","Free",""],["PaperForge726_PsiBrawler_Tier1.zip","Other / review","Copper",""],["PaperForge726_PsiBrawler_Tier2.zip","Other / review","Iron",""],["PaperForge727_Grick_Free.zip","Other / review","Free",""],["PaperForge727_Grick_Tier1.zip","Other / review","Copper",""],["PaperForge727_Grick_Tier2.zip","Other / review","Iron",""],["PaperForge728_VioletFungusNecrohulk_Free.zip","Plants","Free",""],["PaperForge728_VioletFungusNecrohulk_Tier1.zip","Plants","Copper",""],["PaperForge728_VioletFungusNecrohulk_Tier2.zip","Plants","Iron",""],["PaperForge729_GithyankiWarrior_Free.zip","Humanoids","Free",""],["PaperForge729_GithyankiWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge729_GithyankiWarrior_Tier2.zip","Humanoids","Iron",""],["PaperForge730_GithyankiWarrior_Free.zip","Humanoids","Free",""],["PaperForge730_GithyankiWarrior_Tier1.zip","Humanoids","Copper",""],["PaperForge730_GithyankiWarrior_Tier2.zip","Humanoids","Iron",""],["805_Walls_Hastoria_T1_PDFs.zip","Environmental scatter","Copper",""],["805_Walls_Hastoria_T1_PNGs.zip","Environmental scatter","Copper",""],["808_Tiles_Hastoria_T1_PDFs.zip","Environmental scatter","Copper",""],["808_Tiles_Hastoria_T1_PNGs.zip","Environmental scatter","Copper",""],["802_Pillars_Hastoria_T1_PDF.zip","Environmental scatter","Copper",""],["802_Pillars_Hastoria_T1_PNGs.zip","Environmental scatter","Copper",""],["Copper Novice (T1) Rewards_812.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 813-814.zip","Bundles and rewards","Copper",""],["812_Nalfeshnee_T1_VTT.zip","Fiends","Copper",""],["813_BrainInAJar_T1_VTT.zip","Aberrations","Copper",""],["Copper Novice (T1) Rewards 822-823.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 827.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 830.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 831.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 832.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 835.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 839.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 844.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 845.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 846.zip","Bundles and rewards","Copper",""],["PumpklinSlashers.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 850-851-852-853.zip","Bundles and rewards","Copper",""],["Copper Novice (T1) Rewards 854-855-856-857-858-859.zip","Bundles and rewards","Copper",""],["PaperForge64_WereTigerHybrid_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge67_Tiger_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge65_Zombies_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge66_Necromancer_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge70_Crocodile_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge68_WereCrocodile_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge71_WereCrocodileHumanoid_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge72_DragonbornPaladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge69_ArmoredWereCrocodile_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge73_DragonbornRanger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge74_TieflingSorceress_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge75_HalflingRanger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge76_HalfOrcWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge78_Medusa_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge79_MedusaPriestess_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge80_MedusaArcher_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge77_ForestSpiritPack_Cutfile.zip","Bundles and rewards","Titanium cut file",""],["PaperForge81_MedusaWarrior_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge83_Cleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge84_HalfOrcMonk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge82_ClockworkGolemPack_Cutfile.zip","Constructs","Titanium cut file",""],["85_Hydra_Studio3File.zip","Monstrosities","Titanium cut file",""],["PaperForge88_MawDemon_Cutfile.zip","Fiends","Titanium cut file",""],["PaperForge86_UndeadKnights_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge89_Banshee_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge87_HookHorror_Cutfile.zip","Aberrations","Titanium cut file",""],["PaperForge91_SwarmMaster_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge92_GiantWasp_Cutfile.zip","Beasts","Titanium cut file",""],["Paperforge93_SkyScout_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge94_Mantid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge90_Herculean_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge95_HarpyMatriarch_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge96_Harpy_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge99_VenomQueenGargantuan_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge97_VenomCrawlerCutfile.zip","Other / review","Titanium cut file",""],["PaperForge98_VenomCrawlerHatchling_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge99_VenomQueenHuge_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge100_EggCluster_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge101_WebbedHumanoid_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge60_WeretigerHumanoid.zip","Beasts","Tier unverified",""],["PaperForge61_HeadlessHorseman.zip","Beasts","Tier unverified",""],["PaperForge62_FlamingHorseman.zip","Beasts","Tier unverified",""],["PaperForge59_WerebearHybrid.zip","Beasts","Tier unverified",""],["PaperForge102_SkeletalBird.zip","Other / review","Tier unverified",""],["PaperForge103_HumanMonk.zip","Humanoids","Tier unverified",""],["PaperForge63_Kraken.zip","Monstrosities","Tier unverified",""],["PaperForge104_TavernKeeper Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge105_RedCap Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge106_TavernMaiden_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge107_BondeDevil_Cutfile.zip","Fiends","Titanium cut file",""],["PaperForge111_CaskHaulerKobold_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge109_FireElemental_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge110_BoozeServerKobold_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge108_AdultRedDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge_112_Townsman1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge113_Townsman2_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge_114_KoboldWingSorceror_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge_115_MoltenOoze_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge_116_Drunken Townsman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge_117_LegionErinyes_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge118_ReanimatedGroundskeeper_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge119_GhostlyHound_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge120_GhostMatron_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge121_Wispborn_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge123_Vapul_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge122_Crone_Cutfile.zip","Other / review","Titanium cut file",""],["85_HydraPNGs.zip","Monstrosities","Tier unverified",""],["PaperForge124_SoulscorcherDragon_Cutfiles_PNGs.zip","Dragons","Titanium cut file",""],["PaperForge124_SoulscorcherDragon_Gargantuan_RectangularBase.zip","Dragons","Tier unverified",""],["PaperForge124_SoulscorcherDragon_Gargantuan_CircularBase.zip","Dragons","Tier unverified",""],["PaperForge124_SoulscorcherDragon_Huge_RectangularBase.zip","Dragons","Tier unverified",""],["PaperForge124_SoulscorcherDragon_Huge_CircularBase.zip","Dragons","Tier unverified",""],["PaperForge125_Urchin_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge126_Urchin_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge127_ Townswoman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge128_Cultist_SM_Hide_Titanium.zip","Other / review","Tier unverified",""],["PaperForge129_Cultist_SM_Claw_Titanium.zip","Other / review","Tier unverified",""],["PaperForge130_Cultist_SM_CatsEye_Titanium.zip","Other / review","Tier unverified",""],["PaperForge131_Cultist_SM_Warlock_Titanium.zip","Other / review","Tier unverified",""],["PaperForge132_Cultist_SM_Abomination_Titanium.zip","Other / review","Tier unverified",""],["PaperForge133_BlackTeztatlipoca cutfile.zip","Other / review","Titanium cut file",""],["PaperForge134_Teztatlipoca Spawn_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge135_Teztastlipoca Tendril_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge136_Reskin_FlamingHeraldErinyes_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge137_AarakocraWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge138_Reskin_AarakocraChampion_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge139_Reskin_AarakocraMage_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge140_ChameleonfolkWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge142_Elder Coatl_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge141_Chameleonfolk Chieftain_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge143_Manticore_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge144_Mastiff_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge145_[Reskin]Giant_Snake_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge146_RemoteTraveller_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge147_FirbolgDruid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge148_HalfOrcBarbarian_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge149_WarforgedArtificer_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge150_SteelDefender_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge_01_GoblinWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge_02_GoblinArcher_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge03_GoblinSpearman_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge04_GoblinElder_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge05_Goblin_Boss_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge151_GnomeWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge54_Wolf_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge55_DireWolf_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge56_LargeBear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge57_MediumBear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge58_HumanoidWerebear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge6_Barbarian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge7_Spectator_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge8_Ghast_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge9_Kobold_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge10_KoboldSorcerer_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge11_Winged-Wingless Kobold_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge12_Ogre_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge13_HumanThief_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge152_ElfRanger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge14_HalflingAssassin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge15_Bear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge16_Wolf_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge153_HalfElfRogue_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge154_Leprechaun_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge17_Bandits pack_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge18_Panther_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge19_Giant Poisonous Snake_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge20_Erinyes_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge21_Griffon_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge22_DwarfFighter_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge155_Rakshasa_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge156_GoblinSorceror_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge157_GiantScorpion_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge158_Bullywug_Cutfile.zip","Other / review","Titanium cut file","158-bullywug-35845366"],["PaperForge24_DwarfFigther2_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge25_Owlbear and cub_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge26_Knight and Squire_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge27_Bard_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge28_Barlgura_Cutfile.zip","Fiends","Titanium cut file",""],["PaperForge29_Centaur_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge30_Ninja_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge159_BullywugRoyalGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge160_BullywugQueen_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge162_Otyugh_Cutfile.zip","Aberrations","Titanium cut file",""],["PaperForge163_GiantCentipede_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge164_Ogre_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge165_TieflingWarlock_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge31_Manes_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge32_GnollHunter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge33_GnollWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge34_Flind_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge35_GnollCaster_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge36_Hyena_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge37_Whiterling_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge38_Shoosuva_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge39_Leucrotta_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge166_Sleuth_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge167_Operative_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge168_SpectralAgent_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge169_SpectralAgentDuplicate_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge40_VistanaTiefling_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge41_GiantGnoll_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge42_TreasureGoblin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge43_Samurai_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge44_Worg_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge45_WorgRiders_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge46_Centaur_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge47_Minotaurs_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge48_Barbarians_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge49-50-51_WereRatPack_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge52_Werewolf (Humanoid)_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge53_WerewolfHybridPack_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge23_Monk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge170_HalfOrcPaladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge171_Paladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge172_Reskin_GreenKnight_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge175_AutomatedHose_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge174_ChempunkScientist_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge173_ChempunkOgre_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge176_Skeleton_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge177_SkeletonArcher_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge178_SkeletonRogue_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge179_SkeletonSpearman_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge180_SkeletonWarrior_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge181_SkeletonExecutioner_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge182_SkeletonGuardian_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge183_Hogshead_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge184_HogsheadB_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge185_Troll_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge186_TwoHeadedTroll_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge187_OrcWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge188_OrcSwordsman_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge189_OrcSpearman_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge190_OrcBerserker_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge191_OrcInfested_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge_192_Cat_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge193_WhiteDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge194_IceBlock_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge194_IceFormation_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge194_IceStalagmite_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge194_IceTerrain_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge195_Weasel_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge197_ThrendlKeeper_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge198_ThrendlScout_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge199_ThrendlKnight_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge196_SwarmofCentipedes_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge200_SatyrFemale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge201_SatyrMale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge202_SatyrBardFemale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge203_SatyrBardMale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge204_SatyrWarriorFemale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge205_SatyrWarriorMale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge206_SatyrHopliteFemale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge207_SatyrHopliteMale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge208_SatyrRogueFemale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge209_SatyrRogueMale_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge210_GreenDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge211_Owl_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge212_EldritchCannon_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge213_ChempunkCannon_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge214_MechanicalHomunculus_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge215_ChempunkHomunculus_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge216_Lizardfolk_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge217_LizardfolkWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge218_LizardfolkChampion_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge219_ThePaleOutlaw_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge221_TerrorWeed_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge220_AnimatedRevolver_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge222_[Reskin]FrostTroll_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge223_DwarfBarbarian_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge224_DwarfBarbarian_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge225_DwarfPaladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge226_DwarfPaladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge227_DwarfCleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge228_dwarfCleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge229_Bear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge230_(Reskin)Bear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge231_BlackDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge232_Ghoul_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge233_CrawlingHands_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge234_Goblin Alchemist_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge235_GiantFireBeetle_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge236_BlueDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge237_[Reskin]GiantHerculesBeetle_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge238_Monk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge239_FlyingHammer_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge240_[Reskin]SpiritualWeapon(Hammer)_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge241_[Reskin]Goblin Inventor_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge242_FlyingSword_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge243_Animated Voodoo Doll_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge244_GiantFrog_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge245_Monk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge246_[Reskin]Spiritual Weapon(Sword)_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge248_Elf Warrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge249_[Reskin]ArmoredMastiff_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge250_SnowGolem_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge251_TreasureChests_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge247_Human Sorceress_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge252_PumpkinHarvester_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge253_Skeletal Mage_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge254_Flameskull_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge255_Ghast_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge256_GnomeBard_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge257_[Reskin]SkeletalNecromancer_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge258_Bandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge259_Bandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge260_HumanRogue_Cutfile.zip","Humanoids","Titanium cut file","260-human-rogue-43610688"],["PaperForge161_Bugbear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge261_LoxodonWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge262_LoxodonDruid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge263_Loxodon Cleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge264_TieflingPaladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge265_Tiefling Paladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge266_Ranger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge267[Reskin]_Bandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge268_TieflingRanger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge269[Reskin]_TieflingBandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge270_Wizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge271_TieflingWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge272[Reskin]_ Druid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge273_DragonbornWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge274_DwarfWarrior _Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge275_FlyingDagger_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge276_[Reskin]SpiritualWeapon(Dagger)_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge277_Specter_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge278_Wraith_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge279_GreaterWraith_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge_CharonPack_CutfileA.zip","Bundles and rewards","Titanium cut file",""],["PaperForge_CharonPack_CutfileB.zip","Bundles and rewards","Titanium cut file",""],["PaperForge280_CharonFerryman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge281_Charon_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge282_CharonsFerry_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge283_StyxianSoul_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge284_FloatingEmber_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge285_Boar_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge286_Boarlet_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge287_Boar_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge288_Thunderboar_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge289_Pseudodragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge290_FaerieDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge291_GnomeArtificer_Cutfile.zip","Other / review","Titanium cut file",""],["Paperforge292_HalflingDruid_Cutfile.zip","Humanoids","Titanium cut file",""],["Paperforge293_TabaxiMonk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge294_TabaxiRogue_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge295_[Reskin]TabaxiAssassin_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge296_Tabaxi Monk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge297_Crelid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge298[EnvironmentProp]Fire_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge299_CultistFang_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge300_CultAssassin_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge301_HalflingMonk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge302_CultistWing_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge303_[Reskin]AstralSelfMonk _Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge304_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge305_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge306_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge307_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge308_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge309_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge310_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge311_TownGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["GUARDS PACK Cutfiles.zip","Humanoids","Titanium cut file",""],["PaperForge_TownGuards_Cutfiles.zip","Humanoids","Titanium cut file",""],["PaperForge312_TownGuardCaptain_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge313_TownGuardCaptain_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge314_[Reskin]EliteGuard _Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge315_[Reskin]EliteGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge316_[Reskin]EliteGuardCaptain_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge317_Cart_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge318_Cart_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge319_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge320_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge321_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge322_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge323_DepthWatcher_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge324_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge325_PirateCaptain_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge326_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge327_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge328_PirateCrewMember_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge329_PirateCaptain_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge330_Monkey_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge331_[Reskin]PirateMonkey_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge332_Parrot_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge333_[Reskin]Cockatoo _Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge334_[Reskin]SkeletonPirate_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge336_[Reskin]SkeletonPirateCaptain_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge335_[Reskin]SkeletonPirate_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge337_[Reskin]GhostPirateCaptain_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge338_[Reskin]GhostPirate_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge339_[Reskin]GhostPirate_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge341_IntellectDevourer_Cutfile.zip","Aberrations","Titanium cut file",""],["PaperForge340_IntellectDevourer_Cutfile.zip","Aberrations","Titanium cut file",""],["PaperForge345_PotionMerchantPortrait_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge346_[Reskin]WarCleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge347_[Reskin]Knight_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge350_DarkMantle_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge351_[Environment Props] Rocks 1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge352_Griffon_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge353 _Griffon Fledgling_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge354_GriffonFledgling_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge355_[Environment Props] Rocks 2_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge356_[ReskinEnvironmentProp]GriffonNest_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge357_HalflingBard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge358_HalflingWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge359_[Reskin]GoblinWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge360_GnomePaladin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge361_[Reskin]GnomeCleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge362_Homunculus_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge363_[Reskin]ArmoredHomunculus_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge364_ForgeworkDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge365_ForgeworkDragonWyrmling_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge366_ForgeworkDragonEgg_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge368_HalfOgreTorcher_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge367_HalfOgre_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge369_HobgoblinSoldier_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge370_Doppleganger_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge372_[EnvironmentProp]SmallStoneWall_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge371_[Environment Prop]StonePillar_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge374_[Reskin][Environment Prop]TorchLitStonePillar_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge373_[EnvironmentProp]Pillar&SmallWall_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge375_[Reskin][Environment Prop]TorchLitPillar&SmallWall_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge377_[Environment Prop]Statue_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge376_[Environment Prop]Statue_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge378_FireGenasi_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge379_FireGenasiWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge380_[EnvironmentProp]Wall_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge381_FireGenasi_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge382_FireGenasiWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge385_FairySorceress_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge384_[EnvironmentProp]Doorway_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge383_[EnvironmentProp]Doorway_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge386_FairyWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge388_FairyMage_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge389_[Reskin]FairyRogue_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge387_[Reskin][EnvironmentProp]TorchlitDoorway_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge391_BabyYeti_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge390_Yeti_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge392_[EnvironmentProp]RuinedPillar_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge394_[EnvironmentProp]RuinedWall_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge396_HobgoblinDevastator_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge397_[EnvironmentProp]RuinedPillar_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge398_Bodak_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge400_HumanWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge399_[Reskin]FirbolgDruid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge401_[EnvironmentProp]RuinedWall_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge402_CaveFisher_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge403_[Reskin]FirbolgFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge404_HumanFighter_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge405_Vargouille_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge406_Kirin_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge407_Zombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge408_Vargouille_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge409_Devourer_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge411_Zombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge410_Devourer(Empty)_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge412_Vargouille_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge413_[Reskin]PoisonMerchant_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge414_Zombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge415_Mimic_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge416_Mimic_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge418_Mimic_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge419_Noble_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge421_[Reskin]Zombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge420_[Reskin]Zombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge422_WoodWoad_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge424_[EnvironmentProp]TreeStump_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge425_[EnvironmentProp]TreeStump_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge426_Babau_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge428_[Reskin][EnvironmentProp]Tree Stump_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge427_[Reskin][EnvironmentProp]TreeStump_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge429_ZombieMage_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge430_HobgoblinIronShadow_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge432_[Reskin]GoblinBarbarian_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge431_GoblinBarbarian_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge433_[Reskin]ZombieMage_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge434_ZombieCrawler_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge435_HulkingZombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge436_[Reskin]GoblinRogue_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge437_ [Reskin] TheTwins_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge438_FleshGolem_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge440_AaracokraRogue_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge439_AaracokraFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge441_ShadowSorcerer_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge_442_ShadowHound_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge443_[Reskin]Hunter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge444_[Variant]ShadowSorcerer_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge445_Octopus_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge446_GiantOctopus_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge447Claspid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge448_SandstoneGolem_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge423_Nilbog_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge449_Ruffian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge450_Ruffian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonWall_1x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonWall_3x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonWall_4x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonWall_6x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonTile_ALL_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge452_Sahuagin_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonTile_4x4_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonTile_6x2_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonTile_3x3_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge451_ModularTerrain_DungeonTile_6x6_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge453_Ruffian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge454_Ruffian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge455_ReefShark_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge456_GiantShark_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge458_LeoninFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge457_LeoninBarbarian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge459_HalfElfRanger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge460_[Variant]HalfElfRanger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge461_Monk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge462_[Variant]LeoninFighter_Cutfile.zip","Other / review","Titanium cut file",""],["Paperforge463_KenkuThief_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge464_[Variant]KenkuThief_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge465_[Variant]KenkuThief_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge466_Druid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge467_Modular Walls_Town_2x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge467_Modular Walls_Town_4x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge467_Modular Walls_Town_6x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge468_Auto-gnome_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge469_Auto-gnome_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge470_Auto-gnome_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge471_Auto-gnome_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge472_Auto-gnome_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge474_Brawler_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge473_GiffWarlord_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge475_RoundTable_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge476_LongTable_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge477_SquareTable_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge478_Vampire_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge479_[Variant] Vampire_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge480_Starlancer_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge481_Vampire_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge482_[Variant]Vampire_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge483_Vampire_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge484[Variant]Vampire_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge_485_Scarecrow_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge486_[Reskin]HobgoblinSamurai_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge487_[Reskin]HobgoblinRonin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge488_Nobleman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge489_Auto-gnome_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge491_[Variant]Werewolf_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge490_Werewolf_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge492_Ooze_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge494_Bugbear_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge495_Ettin_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge496_[Reskin]Autognome_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge497_Fomorian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge498_[Variant]Nobleman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge499_[Variant]Nobleman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge500_[Variant]Nobleman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge501_[Reskin]Duelist_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge502_RoadBandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge503_[Variant]RoadBandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge505_BanditSpellcaster_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge504_Gorgon_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge506_ChainDevil_Cutfile.zip","Fiends","Titanium cut file",""],["PaperForge507_AnimatedChain_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge508_Marilinth_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge_509_(3dProp)Chair_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge510_(3dProp)Crate_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge511_PitFiend_Cutfile.zip","Fiends","Titanium cut file",""],["PaperForge512_ChemicalTank_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge512_Bat_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge513_SwarmofBats_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge514_VampireLord_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge515_(Variant)VampireLord_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge518_ChemicalTank_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge516[Reskin]_AlchemicalBerserker_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge517_ChemicalTank_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge519[Reskin]_ChemicalTank_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge521_AwakenedShrub_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge522_AwakenedShrub_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge520_Treant_Cutfile.zip","Plants","Titanium cut file",""],["PaperForge523_Goblin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge525_Goblin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge524_Goblin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge526_Oni_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge528_Goblin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge527_Goblin_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge529_[Reskin]Oni_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge531_ShadowDemon_Cutfile.zip","Fiends","Titanium cut file",""],["PaperForge533_[Variant]Sailor_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge532_Sailor_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge534_Lich_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge535_[Variant]Lich_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge536_Pikeman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge537_[Reskin] Fighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge538_[Reskin]Swashbuckler_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge539_[ModularTerrain]Boulder_1x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge539_[ModularTerrain]Boulder_2x1_01_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge539_[ModularTerrain]Boulder_2x1_02_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_1x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge539_[ModularTerrain]Boulder_3x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_2x1_01_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_2x1_02_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_1x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_2x1_1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge540_[ModularTerrain][Variant]MossyBoulder_3x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_2x1_2_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge541_[ModularTerrain][Reskin]Boulder+Tree_3x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge543_[Variant]DragonbornWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge542_DraconianDreadnought_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge544_[Reskin]ForgeworkBull_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge546_[Variant]Dragonborn_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge545_DraconianFootSoldier_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge549_Mule_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge547_Horse_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge548_[VariantHorse_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge550_[Variant]Mule_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge551_[Reskin]PackMule_Cutfile.zip","Bundles and rewards","Titanium cut file",""],["PaperForge553_TwigBlight_Cutfile.zip","Plants","Titanium cut file",""],["PaperForge552_TwigBlight_Cutfile.zip","Plants","Titanium cut file",""],["PaperForge555_[Reskin]Barbarian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge556_Fighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge557_[Variant]Fighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge558_[Reskin]Sorceress_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge559_SahuaginBaron_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge560_SahuaginPriestess_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge561_[Reskin]SahuaginHighPriestess_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge563_Stirge_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge562_Fox_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge564_[Reskin]ShellShark_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge566_ShamblingMound_Cutfile.zip","Plants","Titanium cut file",""],["PaperForge567_ForceBallista_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge569_Protector_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForgete568_Flamethrower_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge570_SailingShip_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge571_Crab_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge572_Magmin_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge573_[Reskin]SahuaginBlademaster_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge574_[Reskin]SahuaginCoralSmasher_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge575_EarthElemental_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge577_AirElemental_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge578_WaterElemental_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge161_Bugbear_Cutfile-1.zip","Beasts","Titanium cut file",""],["PaperForge579_MagmaMephit_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge580_IceMephit_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge581_MudMephit_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge582_SmokeMephit_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge583_FireElemental_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge584_[Reskin]WaterElementalMyrmidon_Cutfile.zip","Elementals","Titanium cut file",""],["PaperForge587_AnimatedArmor_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge588_[Variant]AnimatedArmor_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge589_AnimatedArmor_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge590_[Variant]AnimatedArmor_Cutfile.zip","Constructs","Titanium cut file",""],["PaperForge591_Sharklin_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge593_SharklinHarpooner_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge592_SharklinNetter_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge594_Trees_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge597_[Reskin]Knight_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge596_Knight_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge598_GibberingMouther_Cutfile.zip","Aberrations","Titanium cut file",""],["PaperForge599_Ranger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge600_[Variant]Ranger_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge601_HobgoblinSoldier_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge602_HobgoblinSoldie_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge603_HobgoblinSoldier_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge605_UndeadWorker_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge606_UndeadWorker_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge604_TheOverseer_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge607_GiantRat_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge608_Cyclops_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge609_DungeonWalls1x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge609_DungeonWalls2x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge609_DungeonWalls3x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge610_RuinedWalls1x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge610_RuinedWalls2x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge609_DungeonWalls6x1_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge610_RuinedWalls3x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge611_RuinedWalls1x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge611_RuinedWalls2x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge610_RuinedWalls6x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge611_RuinedWalls3x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge612_RuinedWalls1x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge612_RuinedWalls2x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge612_RuinedWalls3x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge611_RuinedWalls6x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge612_RuinedWalls6x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge613_DungeonTiles6x2_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge613_DungeonTiles4x4_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge613_DungeonTiles6x6_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge613_DungeonTiles8x10_Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge610_RuinedWalls_ALL Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge611_RuinedWalls_ALL Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge609_DungeonWalls_ALL Cutfile.zip","Environmental scatter","Titanium cut file",""],["PaperForge612_RuinedWalls_ALL Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge615_Commoner_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge616_Commoner_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge617_[Reskin]DarkElfKnight_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge618_Commoner_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge619_Commoner_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge621_[Reskin]DarkElfWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge620_[Reskin]DarkElfWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge622_Priestess_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge623_StormGiant_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge624_[Reskin]TotSWalls1x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge624_[Reskin]TotSWalls2x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge624_[Reskin]TotSWalls3x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge625_TotS_Sarcophagus_Cutfile.zip","Fey","Titanium cut file",""],["PaperForge627_ToTS_Vase_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge624_[Reskin]TotSWalls6x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge628_ToTS_Brazier_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge626_MagicCircle_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge629_ToTS_Statue_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge630_VampireSpawn_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge631_InfectedTownswoman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge633_[Reskin]HulkingWorker_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge632_SnakePriestess_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge634_VampireSpawn_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge635_InfectedTownsman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge637_Commoner_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge636_Commoner_Cutfile.zip","Other / review","Titanium cut file",""],["PaperFroge638_Commoner_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge640_AcidZombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge639_Cleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge641_Druid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge642_DireBat_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge643_WarBat_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge644_GoblinBatRider_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge646_[Reskin]TheGhostlinRider_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge645_[Reskin]GoblinGuanoBomber_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge647_[Reskin]SporesDruid Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge648_PaperBoy_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge649_NoticeBoard_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge650_Guard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge651_Guard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge653_Guard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge652_Guard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge655_GiantRaven_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge654_Guard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge657_Child_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge656_Child_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge658_Child_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge659_Child_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge662_[Reskin]YoungZharraki_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge663_[Reskin]AdultZharraki_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge664_[Reskin]ZharrakiSpitter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge668_[Reskin]ImpalerHulk_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge669_[Reskin]SpellbladeCutfile.zip","Other / review","Titanium cut file",""],["PaperForge671_Gatorling_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge670_Gatorling_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge672_Gatorling_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge673_Gatorling_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge674_LeDouanier_Cutfile.zip","Other / review","Titanium cut file",""],["672-673-674 Radiance de Rosalie Cutfiles (All).zip","Other / review","Titanium cut file",""],["PaperForge675_UndeadWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge676_[Reskin]PhantomWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["Radiance CUTFILES.zip","Other / review","Titanium cut file",""],["PaperForge677_UndeadArcher_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge678_[Reskin]PhantomArcher_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge679_SharklinChief_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge680_Barbarian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge681_[Reskin]Monk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge682_[Reskin]Barbarian_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge683_NoviceFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge684_NoviceWizard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge685_GelatinousCube_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge687_[Reskin]GelatinousCube_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge686_[Reskin]GelatinousCube_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge690_Dog_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge691_Dog_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge689_NoviceRogue_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge688_NoviceCleric_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge692_[Reskin]NoviceWitch_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge693_[Reskin]Dog_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge694_Blink Dog_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge695_[Variant]BlinkDog_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge696_Kenku_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge697_Kenku_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge698_[Variant]Kenku_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge699_[Reskin]Kenku_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge701_Mermaid_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge700_NoviceMonk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge702_Siren_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge703_[Variant]Siren_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge704_AxeBeak_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge705_[Variant]AxeBeak_Cutfile.zip","Other / review","Titanium cut file",""],["Paperforge706_[Reskin]Siren_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge707_[Reskin]AxeBeak_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge708_PitFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge713_ArenaWalls3x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge711_PitFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge709_PitFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge712_SmallArena_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge714_ArenaWalls3x1_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge710_PitFighter_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge715_GeneralGoodsMerchant_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge716_GeneralGoodsMerchant_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge718_[Reskin]Mule_GeneralGoods_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge717_GeneralGoodsStall_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge719_RedDragon_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge721_DragonEggs_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge720_DragonWyrmling_Cutfile.zip","Dragons","Titanium cut file",""],["PaperForge722_PsiBrawler_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge723_PsiCommander_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge724_PsiSwordsman_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge725_PsiChosenOne_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge726_PsiBrawler_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge727_Grick_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge728_VioletFungusNecrohulk_Cutfile.zip","Plants","Titanium cut file",""],["PaperForge729_GithyankiWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge730_GithyankiWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge731_GithyankiKnight_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge732_GithyankiDracomancer_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge734_Cloaker_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge733_Cloaker_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge735_OchreJelly_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge736_[Reskin]OchreJellyHalf1_Cutfile.zip","Oozes","Titanium cut file",""],["PaperForge737_GithzeraiMonk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge738_GithzeraiMonk_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge739_GithzeraiZerth_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge740_GithzeraiScion_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge740_GithzeraiPsion_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge741_DeadTownspeople_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge742_DeadTownspeople_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge743_DeadTownspeople_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge745_DeadTownspeople_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge744_DeadTownspeople_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge746_DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge753_[Variant]DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge748_DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge747_DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge751_[Variant]DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge749_DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge752_[Variant]DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge750_[Variant]DeadGuard_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge754_Arcanist_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge755_Arcanist_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge756_[Variant]Arcanist_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge758_Owlbear_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge759_OwlbearCub_Cutfile.zip","Monstrosities","Titanium cut file",""],["PaperForge761_GoblinBoss_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge764_GoblinHexer_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge763_GoblinWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge765_GoblinMinion_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge762_GoblinWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge766_Worg_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge767_[Reskin]WorgRider_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge768_FlamingSkeleton_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge769_BugbearWarrior_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge770_BugbearStalker_Cutfile.zip","Beasts","Titanium cut file",""],["PaperForge771_HobgoblinWarrior_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge772_Ghast_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge773_GhastGravecaller_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge774_Skeleton_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge777_Skeleton_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge776_Skeleton_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge775_Skeleton_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge778_Wight_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge779_Wight_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge780_Ogre_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge781_[Reskin]OgreZombie_Cutfile.zip","Undead","Titanium cut file",""],["PaperForge782_Bandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge783_Bandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge784_Bandit_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge785_BanditDeceiver_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge786_BanditCaptain_Cutfile.zip","Humanoids","Titanium cut file",""],["PaperForge787_TheAmputator_Cutfile.zip","Other / review","Titanium cut file",""],["PaperForge788_Ogre_Cutfile.zip","Giants","Titanium cut file",""],["PaperForge789_[Reskin]Ogre_Cutfile.zip","Giants","Titanium cut file",""],["790_HalflingWizard_T4.zip","Humanoids","Tier unverified",""],["791_[Variant]HalflingWizard_T4.zip","Humanoids","Tier unverified",""],["792_[Variant]HalflingWizard_T4.zip","Humanoids","Tier unverified",""],["793_[Reskin]HalflingWizard_T4.zip","Humanoids","Tier unverified",""],["Titanium Adept (T4) Rewards.zip","Bundles and rewards","Tier unverified",""],["794_HalflingRogue_T4.zip","Humanoids","Tier unverified",""],["795_[Variant]HalflingRogue_T4.zip","Humanoids","Tier unverified",""],["796_[Reskin]HalflingRogue_T4.zip","Humanoids","Tier unverified",""],["829 fanart slaad","Other / review","Post · tier unverified","829-fanart-slaad-166983274"],["837 reskin rat","Other / review","Post · tier unverified","837-reskin-rat-169110370"],["838 reskin dog","Other / review","Post · tier unverified","838-reskin-dog-169110458"],["839 flying snake","Other / review","Post · tier unverified","839-flying-snake-169471364"],["840 reskin snake","Other / review","Post · tier unverified","840-reskin-snake-169471545"],["841 reskin wolf","Other / review","Post · tier unverified","841-reskin-wolf-169471657"],["842 reskin wolf","Other / review","Post · tier unverified","842-reskin-wolf-169471710"],["843 reskin wolf","Other / review","Post · tier unverified","843-reskin-wolf-169471803"],["844 will o wisp","Other / review","Post · tier unverified","844-will-o-wisp-170217629"],["845 will o wisp","Other / review","Post · tier unverified","845-will-o-wisp-170404381"],["846 will o wisp","Other / review","Post · tier unverified","846-will-o-wisp-170404416"],["statues 850 851","Environmental scatter","Post · tier unverified","statues-850-851-172800207"],["statues 850 851","Environmental scatter","Post · tier unverified","statues-850-851-172800207"],["ghosts 854 855","Other / review","Post · tier unverified","ghosts-854-855-173653566"],["ghosts 854 855","Other / review","Post · tier unverified","ghosts-854-855-173653566"]];
const assetMaster='https://www.patreon.com/paperforge/posts/paper-miniatures-14469204';
const paperForgeHome='https://www.paperforgeminis.com';
let assetPage=0;
for(const category of ['All categories',...[...new Set(assetArchives.map(row=>row[1]))].sort()]){
 const option=document.createElement('option');option.textContent=category;el('assetCategory').append(option);
}
function catalogLink(label,href){
 const link=document.createElement('a');link.textContent=label;link.href=href;link.target='_blank';link.rel='noopener noreferrer';return link;
}
function renderAssetCatalog(){
 const query=el('assetQuery').value.toLowerCase().trim(),category=el('assetCategory').value;
 const matching=assetArchives.filter(row=>(el('assetHigherTiers').checked||row[2]!=='Titanium cut file')&&(category==='All categories'||row[1]===category)&&
  (!query||row.join(' ').toLowerCase().replace(/([a-z])([0-9])/g,'$1 $2').includes(query)||
  row.join(' ').toLowerCase().replace(/[^a-z0-9]/g,'').includes(query.replace(/[^a-z0-9]/g,''))));
 el('assetCount').textContent=matching.length+' archives'+(matching.length>50?' · page '+(assetPage+1)+' of '+Math.ceil(matching.length/50):'');
 const list=el('assetResults');list.replaceChildren();
 for(const [archive,category,tier,post] of matching.slice(assetPage*50,(assetPage+1)*50)){
  const row=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('small');
  title.textContent=archive;detail.textContent=category+' · '+tier;
  row.append(title,detail);
  if(post)row.append(catalogLink('Open asset post','https://www.patreon.com/paperforge/posts/'+post));
  row.append(catalogLink('Find in minis index',assetMaster+'#:~:text='+encodeURIComponent(archive).replace(/-/g,'%2D')),catalogLink('Paper Forge catalog',paperForgeHome));list.append(row);
 }
 for(const [label,delta] of [['Previous',-1],['Next',1]]){
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.disabled=assetPage+delta<0||(assetPage+delta)*50>=matching.length;
  button.onclick=()=>{assetPage+=delta;renderAssetCatalog();el('assetCatalogDialog').scrollTop=0};
  if(matching.length>50)list.append(button);
 }
}
el('assetHigherTiers').onchange=el('assetQuery').oninput=el('assetCategory').onchange=()=>{assetPage=0;renderAssetCatalog()};
el('assetCatalog').onclick=()=>{renderAssetCatalog();el('assetCatalogDialog').showModal();el('assetQuery').focus()};
el('sceneryUpload').onclick=()=>el('sceneryFile').click();
el('sceneryFile').onchange=async e=>{
 const file=e.target.files[0],type=el('sceneryKind').value;e.target.value='';
 if(!file||playing||roomProfile?.gm===false)return;
 try{
  if(file.size>8000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error();
  const image=await createImageBitmap(file);
  try{
   const layer=document.createElement('canvas'),scale=Math.min(1,900/Math.max(image.width,image.height));
   layer.width=Math.max(1,Math.round(image.width*scale));layer.height=Math.max(1,Math.round(image.height*scale));
   layer.getContext('2d').drawImage(image,0,0,layer.width,layer.height);
   const art=layer.toDataURL('image/webp',.86);
   if(!uploadedStandeeImage(art))throw Error();
   if(playing||roomProfile?.gm===false)return;
   exitTool();tool=type;sceneryBrush=art;selected=null;
   message('Click the map to place the '+types[type][0].toLowerCase()+'.');refresh();
  }finally{image.close()}
 }catch{message('Choose a PNG, JPEG, or WebP scenery image under 8 MB.')}
};
let sceneryBrush=null;
function newPiece(){
 if(tool==='column'&&componentPlacement&&componentPlacement.kind!=='light')
  return {type:'column',r:componentPlacement.rotation??0,z:0,terrainShape:{...componentPlacement.settings,componentKind:componentPlacement.kind}};
 if(tool&&sceneryPiece({type:tool}))return {type:tool,r:0,z:tool==='ceilingArt'?3:0,art:sceneryBrush};
 const size=standeeSizes.find(size=>size.id===el('footprint').value)||standeeSizes[2];
 return tokenTool?{type:'standee',...tokenTool,size:size.footprint,sizeCategory:size.id,z:0}:{type:tool,r:0,z:0};
}
el('pan').onclick=()=>{panMode=!panMode;el('pan').classList.toggle('active',panMode);message(panMode?'Drag anywhere to pan.':'Drag open ground to pan. Middle-drag to rotate.');refresh()};
el('standeeVisibility').onclick=()=>{
 showThroughTerrain=!showThroughTerrain;
 el('standeeVisibility').setAttribute('aria-pressed',String(showThroughTerrain));
 draw();
};
function unoccupiedCameraSpace(x,y,face=hit(x,y,null,false,null,true)){
 if(carry||drag||visionTool||measuring||facingTarget||floorEdit||repeatSource||cutter||areaMode||journalPlacing||tool||tokenTool||brush||linkingInitiative!==null||spellPlacement||pendingPolymorph)return false;
 if(face?.standee||face?.shadow||face?.p?.type==='standee'||face?.doorFace||face?.fixtureFace)return false;
 if(!playing&&!terrainLocked&&pieces.includes(face?.p))return false;
 return !hitArea(x,y);
}
function terrainMouseAction(button){return preferences[['terrainLeft','terrainMiddle','terrainRight'][button]]??[1,0,2][button]}
let terrainMenuPress=null,terrainMenuSuppressUntil=0;
function startTerrainCamera(e,x,y,allowPing=true){
 if(e.button===2){
  terrainMenuPress={id:e.pointerId,x,y,clientX:e.clientX,clientY:e.clientY,moved:false};
  canvas.setPointerCapture(e.pointerId);
 }
 const action=panMode?1:terrainMouseAction(e.button);
 e.preventDefault();
 if(action===2)return;
 canvas.setPointerCapture(e.pointerId);
 drag=action===1||topDown?{pan:true,x,y,panX,panY,button:e.button}:{orbit:true,x,y,angle,tilt,pivot:measurePoint(x,y)};
 if(drag.pan){cancelPanSettle();const handles=el('visionMarkers');if(handles)handles.style.visibility='hidden'}
 if(allowPing&&e.button===0&&action===0)armBoardPing(drag,hit(x,y));
}
canvas.addEventListener('pointercancel',()=>{terrainMenuPress=null});
window.addEventListener('blur',()=>{terrainMenuPress=null});
canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault()});
canvas.addEventListener('contextmenu',e=>{
 if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){
  if(terrainMenuPress||performance.now()<terrainMenuSuppressUntil){e.preventDefault();return}
  const [x,y]=coords(e);
  if(unoccupiedCameraSpace(x,y)){e.preventDefault();openGroundContext(x,y,e.clientX,e.clientY);return}
  if(drag?.orbit||drag?.pan){e.preventDefault();return}
 }
 if(playerScenePaused()){e.preventDefault();return}
 if(!e.ctrlKey&&!carry&&!drag&&!visionTool){
  const [x,y]=coords(e);
  const panel=hit(x,y,null,false,null,true);
  const door=(panel?.doorFace||panel?.fixtureFace)?[...visionMarkers.children].find(node=>node.visionObject===panel.p):null;
  if(door){e.preventDefault();openVisionActions(door.visionObject,door,true);return;}
 }
 if(roomProfile&&!roomProfile.gm){
  e.preventDefault();
  if(carry||drag||e.ctrlKey||e.metaKey)return;
  const token=hit(...coords(e),null,false,face=>(face.standee||face.shadow)&&ownsRoomStandee(face.p))?.p;
  if(token&&!standeeHidden(token)){
   const selectionChanged=selected!==token;
   selected=token;openStandeeHud(token);
   if(selectionChanged)draw('Standee selection');
  }else{
   const area=hitArea(...coords(e));
   if(area&&canEditArea(area))openAreaEditor(area,e.clientX,e.clientY);
  }
  return;
 }
 if(e.ctrlKey){
  e.preventDefault();
  if(playing&&selectedStandees().length>1&&(!drag||drag.orbit&&!drag.moved)){
   drag=null;openBulkMarks(selectedStandees());
  }
  return;
 }
 if(carry||drag)return;
 const [x,y]=coords(e),token=hit(x,y)?.p;
 if(token&&pieces.includes(token)&&!playing){
  e.preventDefault();
  if(terrainLocked)message('Terrain is locked. Turn off Lock terrain to edit this piece.');
  else openTerrainContext(token,e.clientX,e.clientY);
  return;
 }
 if(token?.type==='standee'){
  e.preventDefault();
  const targets=playing?selectedStandees():[];
  if(targets.length>1)openBulkMarks(targets);else openStandeeArt(token);
  return;
 }
 const area=hitArea(...coords(e));
 if(area&&canEditArea(area)&&(area.shape!=='difficult'||canEditDifficultTerrain())){e.preventDefault();openAreaEditor(area,e.clientX,e.clientY)}
});
function positionGroundMenu(menu,x,y){
 menu.hidden=false;
 menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';
 menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
 menu.firstElementChild?.focus();
 menu.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();menu.hidden=true;canvas.focus()}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();
   const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
   buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }
 };
}
function groundMenuPing(pivot,normal,recenter=false){
 if(playerScenePaused()||recenter&&roomProfile?.gm!==true)return;
 const [x,y,z]=pivot;
 if(roomProfile)roomRpc('ping',{ticket:roomProfile.token,payload:{x,y,z,normal,recenter}})
  .then(()=>queueRoomPoll(40),error=>message(error.message));
 else{boardPings.push({x,y,z,normal,name:'',started:performance.now()});drawBoardPings()}
}
function openGroundContext(x,y,clientX,clientY){
 const menu=el('terrainContext'),face=hit(x,y,null,false,null,true),pivot=measurePoint(x,y,face);
 if(!pivot.every(Number.isFinite)||!floorAcceptsDestination(pivot[0],pivot[1],0,0))return;
 const scene=currentSceneId;
 const close=()=>{menu.hidden=true};
 const add=(label,action)=>menu.append(catalogButton(label,()=>{
  close();if(currentSceneId===scene)action();
 }));
 menu.replaceChildren();
 add('Center here',()=>focusMapTarget(pivot,null,{preserveAngle:true}));
 add('Home View',()=>el('cubeHome').click());
 add('Measure from here',()=>{
  exitTool();measuring=true;const start=rulerPoint(x,y,false);
  route={points:[start],end:start};message('Click the destination to finish measuring.');refresh();
 });
 if(!playerScenePaused()){
  add('Ping here',()=>groundMenuPing(pivot,pingSurfaceNormal(face)));
  const caster=mapDimensionDoorCaster();
  const destination=caster&&spellRangeTargetAt(x,y,caster,'dimension_door',true);
  if(destination?.inRange)add('Dimension Door here',()=>castDimensionDoorAtSquare(caster,destination));
  add('Place area template…',()=>{
   menu.replaceChildren();
   for(const shape of ['circle','square','cone','line','sphere','cube','cone3d']){
    menu.append(catalogButton(({cone3d:'3D cone',sphere:'Sphere',cube:'Cube'})[shape]||shape[0].toUpperCase()+shape.slice(1),()=>{
     close();if(currentSceneId!==scene||playerScenePaused())return;
     exitTool();areaMode=true;el('areaShape').value=shape;el('areaShape').onchange();placeArea(x,y);
    }));
   }
   menu.append(catalogButton('Back',()=>openGroundContext(x,y,clientX,clientY)));
   positionGroundMenu(menu,clientX,clientY);
  });
 }
 if(roomProfile?.gm===true&&!playerScenePaused())add('Bring everyone here',()=>groundMenuPing(pivot,pingSurfaceNormal(face),true));
 if(roomProfile?.gm===false&&roomState.sceneId&&!playerScenePaused()){
  const origin=[Math.floor(pivot[0]+1e-8)+.5,Math.floor(pivot[1]+1e-8)+.5,pivot[2]];
  if(floorAcceptsDestination(origin[0],origin[1],0,0))add('Add scene note…',()=>openPlayerNote({origin}));
 }
 if(canUseJournal())add('Place journal pin here',()=>editJournalPin({shape:'journal',size:1,angle:0,origin:areaAnchor(pivot),marker:'1'}));
 if(roomProfile?.gm!==false&&!playing&&!terrainLocked)add('Place component…',()=>{
  el('buildTools').querySelector('[data-build-category="0"]').click();
 });
 add('Close',()=>{});
 positionGroundMenu(menu,clientX,clientY);
}
function openTerrainContext(piece,x,y){
 const menu=el('terrainContext');
 menu.replaceChildren();
 const close=()=>{menu.hidden=true};
 if(piece.stairTread&&piece.stairGroup&&!playing&&!terrainLocked){
  const members=pieces.filter(p=>p.stairTread&&p.stairGroup===piece.stairGroup);
  menu.append(catalogButton('Delete entire staircase ('+members.length+' segments)…',()=>{
   close();
   if(!pieces.includes(piece)||playing||terrainLocked)return;
   if(!confirm('Delete the entire staircase and all '+members.length+' segments? This can be undone.'))return;
   remember();
   const removing=new Set(members);
   pieces=pieces.filter(p=>!removing.has(p));
   for(const member of members)group.delete(member);
   if(selected&&removing.has(selected))selected=null;
   if(visionSelection&&removing.has(visionSelection))visionSelection=null;
   refresh();message('Entire staircase deleted ('+members.length+' segments).');
  }));
 }
 if(piece.curvedStair&&piece.stairGroup&&!playing&&!terrainLocked)
  menu.append(catalogButton('Transform staircase footprint / height…',()=>{close();editCurvedStairFootprint(piece)}));
 if(piece.type==='column')menu.append(catalogButton('Edit component',()=>{close();openFormationEditor(piece)}));
 if(piece.type==='volume'&&!playing&&!terrainLocked)menu.append(catalogButton('Set base elevation… ('+Number((piece.z*5).toFixed(2))+' ft)',()=>{
  close();
  const answer=prompt('Set the bottom elevation of this block in feet (0–'+Number(((maxHeight-dimensions(piece)[2])*5).toFixed(2))+').',String(Number((piece.z*5).toFixed(2))));
  if(answer===null)return;
  const feet=Number(answer);
  if(answer.trim()===''||!Number.isFinite(feet)||feet<0||feet/5+dimensions(piece)[2]>maxHeight){
   message('Enter a valid elevation in feet.');return;
  }
  selected=piece;
  change({z:Math.round(feet*4/5)/4});
 }));
 menu.append(catalogButton('Rotate to angle…',()=>{close();editTerrainAngle(piece)}));
 menu.append(catalogButton('Move',()=>{
  close();exitTool();selected=piece;visionSelection=piece;visionTool='moveTerrain';
  message('Click a new location. Esc cancels.');draw();
 }),catalogButton('Delete',()=>{
  close();
  if(!pieces.includes(piece)||playing||terrainLocked)return;
  selected=piece;el('remove').click();
 }),catalogButton('Close',close));
 menu.hidden=false;
 menu.style.left=Math.max(0,Math.min(x,innerWidth-menu.offsetWidth))+'px';
 menu.style.top=Math.max(0,Math.min(y,innerHeight-menu.offsetHeight))+'px';
 menu.firstElementChild.focus();
 menu.onkeydown=e=>{if(e.key==='Escape')close()};
}
document.addEventListener('pointerdown',e=>{
 if(!el('terrainContext').contains(e.target))el('terrainContext').hidden=true;
 if(hudToken&&!el('hudConditionsDialog').open&&!el('standeeHud').contains(e.target))closeStandeeHud();
});
function playerScenePaused(){return roomProfile?.gm===false&&roomState.active&&roomState.paused}
function dismissStatus(){pinnedStatus=null;statusTooltip(null)}
canvas.addEventListener('pointermove',e=>{
 if(!pinnedStatus&&!carry&&!drag&&!zoomTransformActive)statusTooltip(statusAt(e));
});
document.addEventListener('pointerdown',e=>{if(e.target!==canvas)dismissStatus()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')dismissStatus()});
canvas.onpointerdown=e=>{
 if(moveConfirmPending)return;
 if(e.button===0&&playerNoteMoveDraft){
  e.preventDefault();e.stopImmediatePropagation();
  const draft=playerNoteMoveDraft;
  if(draft.scene!==roomState.sceneId||draft.profile!==roomProfile){playerNoteMoveDraft=null;message('The scene changed. Start the note move again.');return}
  const [x,y]=coords(e),face=hit(x,y,null,false,null,true),pivot=measurePoint(x,y,face);
  const origin=[Math.floor(pivot[0]+1e-8)+.5,Math.floor(pivot[1]+1e-8)+.5,pivot[2]];
  if(!pivot.every(Number.isFinite)||!floorAcceptsDestination(origin[0],origin[1],0,0)){
   message('Choose a clear map square for the note.');return;
  }
  playerNoteMoveDraft=null;
  void movePlayerNoteTo(draft.note,origin);
  return;
 }
 let downFace;
 if(e.button===0&&!carry&&!drag&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){
  const mark=statusAt(e);
  if(mark){
   e.preventDefault();
   pinnedStatus=pinnedStatus===mark?null:mark;
   statusTooltip(pinnedStatus);
   return;
  }
 }
 dismissStatus();
 if(!phoneLayout.matches&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&!cameraFocusHeld&&[0,1,2].includes(e.button)){
  const [x,y]=coords(e);
  downFace=hit(x,y,null,false,null,true);
  if(unoccupiedCameraSpace(x,y,downFace)){startTerrainCamera(e,x,y);return}
 }
 if(playerScenePaused()&&!measuring){
  if(e.button!==0&&e.button!==1||drag)return;
  const [x,y]=coords(e);
  if(e.button===0&&cameraFocusHeld){cameraFocusUsed=true;focusMapAt(x,y);return}
  startTerrainCamera(e,x,y);
  return;
 }
 if(measuring&&e.button===0){
  e.preventDefault();
  const p=rulerPoint(...coords(e),e.altKey);
  if(!route||route.done)route={points:[p],end:p};
  else{route.end=p;route.done=true}
  draw();return;
 }

 if(pendingPolymorph&&e.button===0){
  const target=hit(...coords(e),null,false,face=>face.standee||face.shadow)?.p;
  if(!target||standeeHidden(target)){message('Choose a visible standee.');return}
  const {caster,form}=pendingPolymorph;pendingPolymorph=null;
  void applyPolymorph(caster,target,form);return;
 }
 if(spellPlacement&&e.button===0){e.preventDefault();placeStandeeSpell(e);return}
 if(zoomTransformActive&&!(panSettleTimer!==null&&(e.button===1||panMode))){clearTimeout(cameraDetailTimer);cameraDetailTimer=null;draw('Camera settled')}
 if(e.button===0&&cameraFocusHeld&&!drag){
  e.preventDefault();cameraFocusUsed=true;
  focusMapAt(...coords(e));
  return;
 }
 if(e.button!==2)visionMarkers.querySelector('[data-vision-actions]')?.remove();
 if(e.button===0&&!e.ctrlKey&&!e.metaKey&&visionTool){
  if(visionTool==='moveTerrain'){
   const piece=visionSelection,[x,y]=coords(e),next=candidate(x,y,piece,0,0,null,e.altKey);
   if(!playing&&!terrainLocked&&pieces.includes(piece)&&valid(next,undefined,piece,areas,e.altKey)&&preservesSupport(next)){
    remember();Object.assign(piece,next);visionTool=null;visionSelection=null;refresh();
   }else message('Choose a clear, supported destination.');
   return;
  }
  const cell=visionCell(e);
  if(['pasteFixture','moveFixture','light'].includes(visionTool)){
   const surface=hit(...coords(e),null,true);
   if(surface?.z!=null){
    const [x,y]=inverse(...coords(e),surface.z);
    cell[0]=Math.max(0,Math.min(gridLimit(0)-1,Math.floor(x)));cell[1]=Math.max(0,Math.min(gridLimit(1)-1,Math.floor(y)));cell[2]=surface.z;
   }
  }
  if(visionTool==='room'){visionStart=cell;canvas.setPointerCapture(e.pointerId);}
  else if(visionTool==='moveRoom'){
   if(areas.includes(visionSelection)){
    const room=visionSelection;
    if(cell[0]+room.size>gridLimit(0)||cell[1]+room.depth>gridLimit(1)){message('The room must fit on the map.');return}
    remember();room.origin=[cell[0],cell[1],room.origin[2]];
   }
   visionTool=null;visionSelection=null;refresh();
  }else if(visionTool==='moveFixture'){
   if(areas.includes(visionSelection)){
    const placement=fixtureMovePlacement(visionSelection,cell,e.altKey&&roomProfile?.gm!==false);
    if(!placement){message('Choose a location near a wall.');return}
    remember();Object.assign(visionSelection,placement);
   }
   visionTool=null;visionSelection=null;refresh();
  }else if(visionTool==='pasteFixture'){
   const {roomId,...fixture}=structuredClone(fixtureClipboard);
   const placement=fixtureMovePlacement(fixture,cell,fixture.freePlacement);
   if(!placement){message('Choose a location near a wall.');return}
   remember();areas.push({...fixture,...placement});visionTool=null;message('Light pasted.');refresh();
  }else if(visionTool==='moveDoor'){
   if(areas.includes(visionSelection)){
    const object=visionSelection;
    if(!placeOpeningOnWall(object,cell,coords(e)))return;
    message(object.kind+' moved.');
   }
   visionTool=null;refresh();
  }else placeVisionObject(cell,cell,visionTool==='opening'?coords(e):null);
  return;
 }
 const middle=e.button===1;
 if(e.button!==0&&!middle)return;
 if(middle)e.preventDefault();
 if(drag)return;
 const [x,y]=coords(e);
 let f=downFace&&!downFace.doorFace&&!downFace.fixtureFace?downFace:hit(x,y);
 if(playing&&roomProfile&&!roomProfile.gm&&!carry&&!areaMode&&!measuring&&e.button===0&&
    !e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!panMode&&f?.p?.type!=='standee'){
  f=hit(x,y,null,false,face=>(face.standee||face.shadow)&&ownsRoomStandee(face.p))??f;
 }
 pointer=[x,y];
 canvas.setPointerCapture(e.pointerId);
 const sharedPing=!middle&&playing&&roomProfile?.gm&&e.metaKey&&!e.ctrlKey;
 const modifier=e.ctrlKey||(e.metaKey&&!sharedPing);
 if(sharedPing){
  e.preventDefault();
  const surface=hit(x,y,null,false,face=>!!face.world&&!face.standee&&!face.shadow,true);
  drag={x,y,angle,tilt,pivot:measurePoint(x,y,surface)};
  armBoardPing(drag,surface,true);
  return;
 }
 if(!middle&&modifier&&!topDown){e.preventDefault();if(!carry)ghost=null;drag={orbit:true,x,y,angle,tilt,pivot:measurePoint(x,y)};return}
 if(middle||panMode||(topDown&&modifier)){if(!carry)ghost=null;cancelPanSettle();drag={pan:true,x,y,panX,panY,button:e.button};if(carry)draw();return}
 if(facingTarget){void applyFacingTarget(f);return}
 if(floorEdit&&canEditFloor()){pickFloorEdit(x,y,e.altKey,e.shiftKey);return}
 if(!carry&&!areaMode&&!journalPlacing&&!measuring&&!tool&&!tokenTool&&!brush){
  const fixture=hit(x,y,null,false,null,true);
  const light=fixture?.fixtureFace&&areas.includes(fixture.p)?fixture.p:null;
  if(light&&(!terrainLocked||playing)&&(!wallMountedLight(light)||roomProfile?.gm!==false)&&(!f?.standee||e.altKey&&roomProfile?.gm!==false)&&(!roomProfile||roomProfile.gm||!light.locked&&!light.secret&&!roomState.paused)){
   drag={fixture:light,x,y,origin:light.origin,alt:e.altKey&&roomProfile?.gm!==false};return;
  }
 }
 if(roomProfile&&!roomProfile.gm&&(roomState.paused||f?.p?.type==='standee'&&!carry&&!ownsRoomStandee(f.p))){
  if(phoneLayout.matches&&e.pointerType!=='mouse'){selected=f?.p??null;closeStandeeHud();refresh();return}
  if(f?.p?.type==='standee'){startTerrainCamera(e,x,y,false);return}
  drag={x,y,angle,tilt,pivot:measurePoint(x,y)};
  armBoardPing(drag,f);
  return;
 }
 if(repeatSource){drag={repeat:true};updateRepeat(x,y);draw();return}
 if(startVolumeResize(x,y))return;
 if(cutter){const p=cutter.box;drag={moveCutter:true,anchor:inverse(x,y,p.z),start:[p.x,p.y]};return}
 if(carry?.paused&&pathHeld){pathUsed=true;resumeMove()}
 if(carry?.paused){
  message('Press '+pathLabel()+' to continue, or use × or ✓ below the standee.');
  return;
 }
 if(!roomProfile?.gm&&roomProfile&&e.shiftKey)return;
 if(playing&&e.shiftKey&&f?.p?.type==='standee'&&!areaMode&&!measuring&&linkingInitiative===null){
  if(carry){
   for(const member of carriedMembers())playStandeeGroup.add(member);route=carry.previousRoute;
   carry=null;ghost=null;
  }
  if(playStandeeGroup.has(f.p))playStandeeGroup.delete(f.p);else playStandeeGroup.add(f.p);
  selected=null;
  message(playStandeeGroup.size?playStandeeGroup.size+' standee(s) selected. Click a selected standee to move the group, or right-click to edit markers.':'Standee selection cleared.');
  refresh();return;
 }
 if(playing&&!e.shiftKey&&!playStandeeGroup.has(f?.p)&&!carry)playStandeeGroup.clear();
 if(carry){drag={drop:true};updateCarry(x,y,e.altKey);draw();return}
 if(!journalPlacing&&canEditDifficultTerrain()&&!brush&&!measuring&&!tool&&!tokenTool&&!carry&&linkingInitiative===null){
  const edge=difficultEdge(x,y);
  if(edge&&roomProfile?.gm!==false&&canEditArea(edge.area)){const coordinate=inverse(x,y,edge.area.origin[2])[edge.axis];drag={resizeTerrain:edge,coordinate,x,y};return}
 }
 if(!journalPlacing&&(areaMode||(!brush&&!measuring&&!tool&&!tokenTool&&!carry&&linkingInitiative===null&&f?.p?.type!=='standee'))){
  const area=areaMode&&conePointAim()&&f?.standee?null:hitAreaOrigin(x,y);
  if(!areaMode&&area&&canEditArea(area)&&(area.shape!=='difficult'||canEditDifficultTerrain())){drag={area,x,y};return}
 }
 if(journalPlacing&&canUseJournal()){
  const origin=areaAnchor(measurePoint(x,y)),pin=journalMoving;
  exitTool();
  if(pin&&areas.includes(pin)){remember();pin.origin=origin;refresh()}
  else editJournalPin({shape:'journal',size:1,angle:0,origin,marker:'1'});
  return;
 }
 if(areaMode){placeArea(x,y);return}
 if(linkingInitiative!==null){
  if(f?.p?.type==='standee'){
   remember();
   for(const token of tokens)if(token.initiativeKey===linkingInitiative)delete token.initiativeKey;
   f.p.initiativeKey=linkingInitiative;
   if(activeInitiative===linkingInitiative)pingStarted=performance.now();
   linkingInitiative=null;refresh();
  }else el('initiativeHint').textContent='Click a standee on the map to link it.';
  return;
 }
 if(playing){
  if(f?.p?.type==='standee'){
   selected=f.p;
   recordStandeeInput(e,selected);
   closeStandeeHud();
   drag={standee:selected,grabPlane:f.shadow?f.shadowLevel:selected.z,x,y,previewVision:gmVisionArmed};
   gmVisionArmed=false;
   drawStandeeNames();return;
  }
  gmVisionStandee=null;
  if(phoneLayout.matches){selected=f?.p??null;closeStandeeHud();refresh();return}
  selected=null;closeStandeeHud();drag={x,y,angle,tilt,pivot:measurePoint(x,y)};
  armBoardPing(drag,f);refresh();return;
 }
 if(brush){drag={paint:true,visited:new Map()};paintEdge(x,y);return}
 if(tool||tokenTool){
  if(!terrainLocked&&isFurniture(f?.p)&&pieces.includes(f.p)){
   tool=null;tokenTool=null;ghost=null;
  }else{drag={place:true,x,y};return}
 }
 if(e.shiftKey){
  if(terrainLocked)return;
  const p=f?.p;
  if(p&&p.type!=='standee'){
   if(group.has(p))group.delete(p);else group.add(p);
   selected=group.has(p)?p:[...group].at(-1)||null;
   refresh();
  }
  return;
 }
 selected=terrainLocked&&f?.p?.type!=='standee'?null:f?.p??null;
 closeStandeeHud();
 if(!group.has(selected))group=new Set(selected&&selected.type!=='standee'?[selected]:[]);
 if(selected){
  const [w,d,h]=dimensions(selected),grabPlane=f?.shadow?f.shadowLevel:selected.z;
  const [a,b]=inverse(x,y,selected.type==='standee'?grabPlane:selected.z+h);
  drag={piece:selected,members:group.has(selected)&&group.size>1?[...group]:null,x,y,grabPlane,dx:Math.max(0,Math.min(w-1,Math.floor(a)-selected.x)),dy:Math.max(0,Math.min(d-1,Math.floor(b)-selected.y))};
  if(isFurniture(selected))drag.freeFurnitureGrab=[a-selected.x,b-selected.y];
 }else if(!phoneLayout.matches)drag={x,y,angle,tilt,pivot:measurePoint(x,y)};
 refresh();
};
const phoneLayout=matchMedia('(max-width:600px)');
let phonePress=null,phoneMenuClickUntil=0;
const cameraMap=canvas.parentElement;
const mapTouches=new Map();
let mapGesture=null;
function pinchSpan(){
 const [a,b]=mapTouches.values();
 return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};
}
cameraMap.addEventListener('pointerdown',e=>{
 if(!phoneLayout.matches||e.pointerType!=='touch'||e.target!==canvas)return;
 const [x,y]=coords(e);
 const idle=!(carry||spellPlacement||visionTool||tool||tokenTool||brush||areaMode||measuring||repeatSource||cutter||facingTarget||journalPlacing);
 const face=hit(x,y,null,false,null,true);
 mapTouches.set(e.pointerId,{x,y,canPan:idle&&(!face?.p||playing&&face.p.type!=='standee'&&!face.fixtureFace)});
 if(mapTouches.size<2&&!mapGesture)return;
 clearTimeout(phonePress?.timer);phonePress=null;
 clearTimeout(drag?.pingTimer);drag=null;
 mapGesture={type:'pinch',span:pinchSpan()};
 canvas.setPointerCapture(e.pointerId);
 e.stopImmediatePropagation();
},true);
cameraMap.addEventListener('pointermove',e=>{
 const touch=mapTouches.get(e.pointerId);
 if(!touch)return;
 const [x,y]=coords(e),dx=x-touch.x,dy=y-touch.y;
 if(!mapGesture&&(!touch.canPan||phonePress?.opened||Math.hypot(dx,dy)<8))return;
 if(!mapGesture){
  clearTimeout(phonePress?.timer);phonePress=null;
  clearTimeout(drag?.pingTimer);drag=null;
  mapGesture={type:'pan'};
 }
 touch.x=x;touch.y=y;
 if(mapGesture.type==='pan'){panX+=dx;panY+=dy;draw('Touch pan')}
 else if(mapTouches.size>=2){
  const next=pinchSpan(),previous=mapGesture.span;
  if(next.distance>0&&previous.distance>0){
   panX+=next.x-previous.x;panY+=next.y-previous.y;
   const factor=next.distance/previous.distance;
   const priorZoom=zoom;
   scale(factor,next.x,next.y,'Touch zoom');
   if(zoom===priorZoom)draw('Touch pan');
  }
  mapGesture.span=next;
 }
 e.stopImmediatePropagation();
},true);
for(const name of ['pointerup','pointercancel','lostpointercapture'])cameraMap.addEventListener(name,e=>{
 if(!mapTouches.delete(e.pointerId)||!mapGesture)return;
 if(mapTouches.size===0)mapGesture=null;
 else if(mapGesture.type==='pinch'&&mapTouches.size>=2)mapGesture.span=pinchSpan();
 phoneMenuClickUntil=performance.now()+400;
 e.preventDefault();e.stopImmediatePropagation();
},true);

cameraMap.addEventListener('pointerdown',e=>{
 if(!phoneLayout.matches||e.pointerType==='mouse'||e.button!==0||
  !(e.target===canvas||e.target.closest('[data-map-handle]')))return;
 if(e.target===canvas&&(carry||spellPlacement||visionTool||tool||tokenTool||brush||areaMode||measuring))return;
 if(phonePress){clearTimeout(phonePress.timer);phonePress=null;return}
 const {pointerId,clientX,clientY,target}=e;
 const press={pointerId,clientX,clientY,opened:false};
 phonePress=press;
 press.timer=setTimeout(()=>{
  if(phonePress!==press)return;
  clearTimeout(drag?.pingTimer);drag=null;
  press.opened=true;
  target.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX,clientY}));
 },500);
},true);
cameraMap.addEventListener('pointermove',e=>{
 if(phonePress?.pointerId===e.pointerId&&Math.hypot(e.clientX-phonePress.clientX,e.clientY-phonePress.clientY)>8)clearTimeout(phonePress.timer);
},true);
for(const name of ['pointerup','pointercancel'])cameraMap.addEventListener(name,e=>{
 if(phonePress?.pointerId!==e.pointerId)return;
 clearTimeout(phonePress.timer);
 if(phonePress.opened){phoneMenuClickUntil=performance.now()+400;e.preventDefault();e.stopImmediatePropagation()}
 phonePress=null;
},true);
cameraMap.addEventListener('click',e=>{
 if(performance.now()<phoneMenuClickUntil&&(e.target===canvas||e.target.closest('[data-map-handle]'))){
  e.preventDefault();e.stopImmediatePropagation();
 }
},true);
cameraMap.addEventListener('contextmenu',e=>{
 if(phoneLayout.matches&&phonePress&&e.isTrusted){e.preventDefault();e.stopImmediatePropagation()}
},true);

let isoLocked=phoneLayout.matches,cameraFocusHeld=false,cameraFocusUsed=false;
if(phoneLayout.matches)topDown=false;
let cubePreferredAngle=null;
function hasCubePreferredAngle(){
 return cubePreferredAngle&&cubePreferredAngle.angle===angle&&cubePreferredAngle.tilt===tilt&&cubePreferredAngle.topDown===topDown;
}
function centerCubeStandee(){
 C=Math.cos(angle);D=Math.sin(angle);
 if(selected?.type!=='standee'||standeeHidden(selected)){
  panX=0;panY=-H*.05;
  return;
 }
 const [x,y]=point(...basePoint(selected));
 panX+=W/2-x;panY+=H/2-(y-standeeArtHeight(selected)/2);
 setFocusCutaway(selected);
}
function rememberCubeAngle(){cubePreferredAngle={angle,tilt,topDown}}
function focusMapAt(x,y){
 const face=hit(x,y,null,false,null,true);
 if(face?.p?.type==='standee'){
  if(!standeeHidden(face.p))focusMapTarget(basePoint(face.p),face.p,{preserveAngle:true});
  return;
 }
 if(face?.p?.origin){focusMapObject(face.p);return}
 if(face?.world){
  const pivot=measurePoint(x,y,face);
  if(face.z!=null&&face.world.every(vertex=>vertex[2]===face.z)){
   pivot[0]=Math.floor(pivot[0]+1e-8)+.5;
   pivot[1]=Math.floor(pivot[1]+1e-8)+.5;
  }
  focusMapTarget(pivot,null,{preserveAngle:true});
  return;
 }
 const [col,row]=inverse(x,y,0);
 if(col>=0&&col<gridLimit(0)&&row>=0&&row<gridLimit(1))focusMapTarget([Math.floor(col)+.5,Math.floor(row)+.5,0],null,{preserveAngle:true});
}
function focusMapObject(object){
 const [x,y,z]=object.origin;
 const height=object.kind==='Door'?doorLeafHeight(object)/2:object.kind==='Window'?1:object.fixture==='chandelier'?fixtureElevation(object):object.lightElevation??0;
 focusMapTarget([x+(object.shape==='room'?object.size/2:.5),y+(object.shape==='room'?object.depth/2:.5),z+height],null,{preserveAngle:true});
}
function focusMapTarget(pivot,standee=null,{deferDraw=false,avoidStandees=false,preferFront=false,preserveAngle=false}={}){
 if(standee)currentMoveReadouts().delete(moveReadoutKey(standee));
 if(standee&&standeeHidden(standee))return;
 if(!topDown&&!hasCubePreferredAngle()&&!preserveAngle&&!cameraFocusHeld){
  const blockers=visionBlockers();
  const aim=standee?[pivot[0],pivot[1],pivot[2]+standee.size*.65]:pivot;
  const standeeBounds=avoidStandees?tokens.filter(token=>!standeeHidden(token)).map(token=>{
   const [x,y,z]=basePoint(token),radius=token.size*.45;
   return [[x-radius,x+radius],[y-radius,y+radius],[z,z+standeeArtHeight(token)/S]];
  }):[];
  const tilts=isoLocked?[.69]:[tilt,.69,1.1];
  let best={score:Infinity,angle,tilt};
  for(const pitch of tilts)for(const step of [0,1,-1,2,-2,3,-3,4]){
   const yaw=angle+step*Math.PI/4;
   const eye=[aim[0]+200*Math.sin(yaw)*Math.cos(pitch),aim[1]+200*Math.cos(yaw)*Math.cos(pitch),aim[2]+200*Math.sin(pitch)];
   const standeeCost=standeeBounds.some(bounds=>movementInterval(aim,eye,bounds))?1:0;
   const score=(preferFront&&standee?1000*Math.abs(pitch-tilt)+100*(1-Math.cos(yaw+.64-trackingFacing(standee)*Math.PI/180)):0)+standeeCost+blockers.reduce((cost,bounds)=>{
    const interval=movementInterval(aim,eye,bounds);
    return cost+(interval&&interval[0]>1e-7?1:0);
   },0)+Math.abs(step)*.03+Math.abs(pitch-tilt)*.25;
   if(score<best.score)best={score,angle:yaw,tilt:pitch};
  }
  ({angle,tilt}=best);C=Math.cos(angle);D=Math.sin(angle);
 }
 if(standee){focusStandee(standee,'Camera focus');return}
 setFocusCutaway(null);
 zoom=preferences.focusZoom/100;
 S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;
 const [x,y]=point(...pivot);
 panX+=W/2-x;panY+=H/2-y;
 if(!deferDraw)draw('Camera focus');
}
el('isoLock').onclick=()=>{
 isoLocked=!isoLocked;
 el('isoLock').setAttribute('aria-pressed',String(isoLocked));
 const x=W/2,y=H/2;
 orbitAround(angle,tilt,measurePoint(x,y),x,y);
};
function orbitAround(nextAngle,nextTilt,pivot,x,y){
 angle=nextAngle;tilt=isoLocked?.69:nextTilt;
 C=Math.cos(angle);D=Math.sin(angle);
 const [px,py]=point(...pivot);
 panX+=x-px;panY+=y-py;
 draw('Camera rotation');
}
function orbit(x,y){
 if(topDown){
  drag.panX??=panX;drag.panY??=panY;
  panX=drag.panX+x-drag.x;panY=drag.panY+y-drag.y;draw('Camera pan');return;
 }
 const nextTilt=Math.max(.07,Math.min(1.45,drag.tilt+(y-drag.y)*.008));
 orbitAround(drag.angle-(x-drag.x)*.012,nextTilt,drag.pivot,drag.x,drag.y);
}
function orbitViewport(delta){
 const x=W/2,y=H/2;
 orbitAround(angle+delta,tilt,measurePoint(x,y),x,y);
}
canvas.onpointermove=e=>{
 if(moveConfirmPending)return;
 if(terrainMenuPress?.id===e.pointerId){
  const press=terrainMenuPress;
  press.moved||=Math.hypot(e.clientX-press.clientX,e.clientY-press.clientY)>5;
  if(!press.moved)return;
 }
 if(zoomTransformActive&&!drag?.pan)return;
 const [x,y]=coords(e);pointer=[x,y];
 if(drag?.pan){panX=drag.panX+x-drag.x;panY=drag.panY+y-drag.y;draw('Camera pan');return}
 if(drag?.fixture){
  if(!drag.next&&Math.hypot(x-drag.x,y-drag.y)<5)return;
  const free=roomProfile?.gm!==false&&(drag.alt||e.altKey);
  const surface=free?furniturePlacementSurface(x,y,drag.fixture):hit(x,y,null,true);
  const z=surface?.z??(free&&wallMountedLight(drag.fixture)?drag.origin[2]:0);
  const start=inverse(drag.x,drag.y,drag.origin[2]),end=inverse(x,y,z);
  const step=free?4:1;
  drag.next=[...end.map((v,i)=>Math.max(0,Math.min(gridLimit(i)-1,Math.round((drag.origin[i]+v-start[i])*step)/step))),z];
  drag.freePlacement=free;
  draw();return;
 }
 if(!drag&&!carry){
  const hover=hit(x,y)?.p;
  const nextHover=hover?.type==='standee'?hover:null;
  if(nextHover!==hoveredStandee){
   if(nextHover&&moveReadoutKey(nextHover)!==moveReadoutKey(hoveredStandee))
    currentMoveReadouts().delete(moveReadoutKey(nextHover));
   hoveredStandee=nextHover;drawStandeeNames();
  }
 }
 if(repeatSource&&(!drag||drag.repeat)){updateRepeat(x,y);draw();return}
 if(drag?.moveCutter&&cutter){
  const p=cutter.box,[w,d]=dimensions(p),pos=inverse(x,y,p.z);
  [p.x,p.y]=[w,d].map((size,i)=>Math.max(0,Math.min(gridLimit(i)-size,drag.start[i]+Math.round(pos[i]-drag.anchor[i]))));
  draw();return;
 }
 if(drag?.volume){
  const resize=drag.volume;
  resize.next=resize.corner!==undefined?moveVolumeCorner(resize,inverse(x,y,resize.height)):volumeResizeAt(resize,x,y,e.altKey);
  draw();return;
 }
 if(drag?.resizeTerrain){
  const {area,axis,side}=drag.resizeTerrain;
  const delta=inverse(x,y,area.origin[2])[axis]-drag.coordinate;
  drag.preview=resizeDifficultArea(area,axis,side,difficultBounds(area)[axis][side]+delta);draw();return;
 }
 if(facingTarget&&!drag)return;
 if(drag?.orbit){if(Math.hypot(x-drag.x,y-drag.y)>5)drag.moved=true;orbit(x,y);return}
 if(drag?.standee){
  if(Math.hypot(x-drag.x,y-drag.y)<5)return;
  const {standee,grabPlane}=drag;
  if(!tokens.includes(standee)){drag=null;return}
  const [u,v]=inverse(drag.x,drag.y,grabPlane);
  carry={piece:standee,grabPlane,previousRoute:route?.done?route:null,dx:Math.max(0,Math.min(standee.size-1,Math.floor(u)-standee.x)),dy:Math.max(0,Math.min(standee.size-1,Math.floor(v)-standee.y))};
  if((!roomProfile||roomProfile.gm)&&playStandeeGroup.has(standee))carry.members=selectedStandees();
  route={points:[basePoint(standee)],end:null};
  updateObjectHandleHover();
  drag.pickup=true;delete drag.standee;
 }
 if(carry){
  if(carry.paused)return;
  if(drag?.pickup)drag.moved=true;
  const before=ghost,override=carry.gmMovementOverride;
  const first=!route.end;
  if(first)drawInitialMoveArrow(x,y);
  updateCarry(x,y,e.altKey);
  if(first||!before||before.x!==ghost.x||before.y!==ghost.y||before.z!==ghost.z||override!==carry.gmMovementOverride)
   queueMovementPaint(first);
  return;
 }
 if(drag?.area){
  if(!drag.changed&&Math.hypot(x-drag.x,y-drag.y)<4)return;
  const z=effectiveArea(drag.area).origin[2];
  const origin=drag.area.shape==='difficult'?difficultPlacement(x,y,drag.area.size,drag.area.width??drag.area.size):areaAnchor([...inverse(x,y,z),z]);
  if(drag.area.shape==='difficult'&&!validDifficultTerrain({...drag.area,origin}))return;
  if(roomProfile?.gm===false){drag.preview={...drag.area,origin};draw();return}
  if(!drag.changed){remember();drag.changed=true}
  drag.area.origin=origin;
  if(drag.area.anchorId){const caster=tokens.find(t=>t.trackingId===drag.area.anchorId);if(caster)drag.area.anchorOffset=origin.map((v,i)=>v-basePoint(caster)[i])}
  draw();return;
 }
 if(areaMode&&areaOrigin){areaPreview=makeArea(x,y);draw();return}
 if(measuring&&route&&!route.done){route.end=rulerPoint(x,y,e.altKey);draw();return}
 if(drag?.paint){paintEdge(x,y);return}
 if((tool||tokenTool)&&!panMode){ghost=candidate(x,y,newPiece(),0,0,null,e.altKey);draw();return}
 if(!drag)return;
 if(drag.didPing)return;
 if(drag.pingTimer!==undefined){
  if(Math.hypot(x-drag.x,y-drag.y)<6)return;
  clearTimeout(drag.pingTimer);delete drag.pingTimer;
 }
 if(drag.piece){
  if(!ghost&&Math.hypot(x-drag.x,y-drag.y)<5)return;
  ghost=draggedTerrainPosition(x,y,e.altKey);
 }else{if(!phoneLayout.matches)orbit(x,y);return}
 draw();
};
function finishCameraPan(){
 drag=null;
 clearTimeout(cameraDetailTimer);
 cameraDetailTimer=null;
 lightOrbitActive=cameraPanPreview=false;
 const frame=paintedCamera;
 if(zoomTransformActive||!frame||frame.preview||frame.topDown!==topDown||
  frame.angle!==angle||frame.tilt!==tilt||frame.zoom!==zoom||frame.panX!==panX||frame.panY!==panY||
  frame.width!==canvas.clientWidth||frame.height!==canvas.clientHeight){
  if(!el('performancePanel').hidden)cameraReleasedAt=performance.now();
  cancelPanSettle();
  // Give a follow-up pointerdown a chance to supersede this repaint.
  panSettleTimer=setTimeout(()=>{
   panSettleTimer=null;
   if(!drag)draw('Camera settled',true);
  },80);
 }else{
  el('visionMarkers').style.visibility='';
  lastCameraDraw=cameraReleasedAt=null;
 }
}
canvas.onpointerup=e=>{
 if(terrainMenuPress?.id===e.pointerId&&e.button===2){
  const press=terrainMenuPress;terrainMenuPress=null;terrainMenuSuppressUntil=performance.now()+400;
  press.moved||=Math.hypot(e.clientX-press.clientX,e.clientY-press.clientY)>5;
  if(!press.moved){
   if(drag)clearTimeout(drag.pingTimer);
   if(drag?.pan&&!carry)finishCameraPan();
   else drag=null;
   if(!wallOpeningContext(e,[press.x,press.y]))openGroundContext(press.x,press.y,e.clientX,e.clientY);
   return;
  }
 }
 if(!drag||(drag.pan&&e.button!==drag.button))return;
 clearTimeout(drag.pingTimer);
 const [x,y]=coords(e);
 if(drag.fixture){
  const {fixture,next,freePlacement}=drag;drag=null;
  if(!next){refresh();return}
  if(roomProfile?.gm===false){
   const [x,y,z]=fixture.origin;
   const piece={type:'standee',name:'Light',icon:'🔥',color:'#ffcc80',size:1,x,y,z,roomId:fixture.roomId,controllerNames:[roomProfile.name]};
   carry={piece,light:fixture,dx:0,dy:0,previousRoute:route};
   ghost={...piece,x:next[0],y:next[1],z:next[2]};
   route={points:[basePoint(piece)],end:basePoint(ghost)};
   dropCarry();
  }else{
   const placement=fixtureMovePlacement(fixture,next,freePlacement);
   if(!placement){message('Choose a location near a wall at the selected mounting height.');refresh();return}
   remember();Object.assign(fixture,placement);refresh();
  }
  return;
 }
 if(drag.standee){
  const {standee:token,previewVision}=drag;drag=null;
  if(roomProfile?.gm===true&&!e.shiftKey)tallyStandee=token;
  gmVisionStandee=roomProfile?.gm!==false&&playing&&previewVision&&!e.shiftKey?token:null;
  draw(gmVisionStandee?'Standee vision':'Standee selection');
  return;
 }
 if(drag.pickup||drag.drop){
  const drop=drag.drop||(drag.moved&&!drag.waypointSet);
  drag=null;
  if(drop){
   const before=ghost,override=carry.gmMovementOverride;
   updateCarry(x,y,e.altKey);
   if(pathHeld){pathUsed=true;setWaypoint()}
   else{
    pauseMove();
    if(carry?.paused&&(!before||before.x!==ghost.x||before.y!==ghost.y||before.z!==ghost.z||override!==carry.gmMovementOverride))
     queueMovementPaint();
   }
  }else refresh();
  return;
 }
 if(drag.repeat){drag=null;updateRepeat(x,y);refresh();return}
 if(drag.moveCutter){drag=null;refresh();return}
 if(drag.volume){
  const {piece,next:preview,corner}=drag.volume;
  const next=preview&&corner===undefined?volumeResizeAt(drag.volume,x,y,e.altKey):preview;
  drag=null;
  if(cutter?.box===piece){if(next)cutter.box=next;refresh();return}
  if(next&&canonicalSceneValue(next)!==canonicalSceneValue(piece)){
   const overlap=e.altKey&&wallVolume(piece)&&wallVolume(next)&&corner===undefined;
   if(overlap)next.wallOverlap=true;
   if(valid(next,undefined,piece,areas,false,false,overlap)&&preservesSupport(next)){remember();Object.assign(piece,next)}
   else message('That resize overlaps another piece or removes support.');
  }
  refresh();return;
 }
 if(drag.resizeTerrain){
  const {area,axis}=drag.resizeTerrain,preview=drag.preview;
  if(preview&&!validDifficultTerrain(preview))message('The full footprint needs support at this height.');
  else if(preview&&difficultBounds(area)[axis].some((edge,i)=>edge!==difficultBounds(preview)[axis][i])){remember();Object.assign(area,preview)}
  drag=null;refresh();return;
 }
 if(drag.area){
  const {area,preview}=drag;drag=null;refresh();
  if(preview&&canEditArea(area))changePlayerArea('area_update',preview);
  return;
 }
 if(drag.pan&&!carry){finishCameraPan();return}
 if(drag.pan||drag.orbit){
  if(cameraDetailTimer!==null&&!el('performancePanel').hidden)cameraReleasedAt=performance.now();
  lastCameraDraw=null;
  drag=null;refresh();return;
 }
 if(drag.place&&(tool||tokenTool)&&Math.hypot(x-drag.x,y-drag.y)<8){
  const p=candidate(x,y,newPiece(),0,0,null,e.altKey);
  if(tokenTool?.folderMembers){
   const members=folderStandeePositions(p,tokenTool.folderMembers);
   const occupied=[...pieces,...tokens,...members];
   const linkedIds=members.map(member=>member.characterRoomId).filter(Boolean);
   if(new Set(linkedIds).size!==linkedIds.length||linkedIds.some(id=>tokens.some(token=>token.roomId===id||token.characterRoomId===id))){
    message('A standee in this group already appears on this map.');
   }else if(members.every(member=>valid(member,occupied,member))){
    remember();tokens.push(...members);tokenTool=null;message('Placed '+members.length+' standees.');
   }else message('The whole group needs a clear, supported placement. Choose another point.');
  }else if(p.characterRoomId&&tokens.some(token=>token.roomId===p.characterRoomId||token.characterRoomId===p.characterRoomId)){
   message('This standee already appears on this map. Use Place as new for a separate standee.');
  }else if(valid(p,undefined,null,areas,e.altKey)){
   remember();if(!tokenTool)p.roomId=crypto.randomUUID();(tokenTool?tokens:pieces).push(p);
   message('Piece placed. Click to place another, or press Esc.');
  }
  else message('That piece does not fit here.');
 }else if(drag.members&&ghost){
  const positions=terrainGroupPositions(drag,ghost),stationary=pieces.filter(p=>!drag.members.includes(p));
  const terrain=[...stationary,...positions];
  if(positions.every(p=>valid(p,[...stationary,...tokens],null,areas,e.altKey))&&tokens.every(t=>supported(t,terrain))&&areas.every(a=>a.shape!=='difficult'||validDifficultTerrain(a,terrain))){
   remember();drag.members.forEach((piece,i)=>Object.assign(piece,positions[i]));message('Terrain group moved.');
  }else message('The group does not fit there.');
 }else if(drag.piece&&ghost){
  if(isFurniture(drag.piece)||drag.piece.stairTread||drag.piece.type==='volume'&&e.altKey)ghost=draggedTerrainPosition(x,y,e.altKey);
  const stairOverride=e.altKey&&drag.piece.stairTread;
  if(valid(ghost,undefined,drag.piece,areas,e.altKey,stairOverride)&&(stairOverride||preservesSupport(ghost))){remember();Object.assign(drag.piece,ghost);if(stairOverride)drag.piece.floorAdjusted=true;message('Piece moved.')}
  else message('That piece does not fit here.');
 }
 ghost=null;drag=null;refresh();
};
canvas.onpointerleave=()=>{
 if(!pinnedStatus)statusTooltip(null);
 pointer=null;
 const hadHover=!!hoveredStandee;
 hoveredStandee=null;
 if(drag||carry)return;
 if(ghost){ghost=null;draw()}
 else if(hadHover)drawStandeeNames();
};
canvas.onpointercancel=()=>{
 if(drag?.pan&&!carry){finishCameraPan();return}
 drag=null;ghost=null;if(carry){route=carry.previousRoute;carry=null}refresh();
};
canvas.ondblclick=e=>{
 if(statusAt(e)||playerScenePaused())return;
 if(!playing||carry||measuring||areaMode||facingTarget||visionTool||spellPlacement||pendingPolymorph||e.shiftKey||e.ctrlKey||e.metaKey)return;
 const standee=hit(...coords(e))?.p;
 if(standee?.type!=='standee')return;
 const path=carry?.previousRoute||route;
 if(roomProfile?.gm!==false){openPlayCombat(standee);return}
 if(!ownsRoomStandee(standee))return;
 if(path?.standee===standee){
  carry=null;route=null;drag=null;ghost=null;
  message('Path cleared.');refresh();
  return;
 }
 void openOwnedStandeeCombat(standee);
};
function change(delta){
 if(playing||!selected||terrainLocked&&selected.type!=='standee')return;
 const next={...selected,...delta};
 if(!valid(next)||!preservesSupport(next)){message('That position overlaps another piece or exceeds the map bounds.');return}
 remember();Object.assign(selected,next);refresh();
}
function edgeCuts(p){
 return p.cuts||Array(4).fill(p.cut||null);
}
function groundStampKey(face){return face.world[0].slice(0,2).join(',')}
const textureIdPattern=/^[a-z0-9][a-z0-9-]{0,63}$/;
const textureImagePattern=/^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i;
const jadeTextureIds=['cave-rock','cut-masonry','stone-floor','weathered-timber'];
function textureSceneStyle(create=false){
 let style=areas.find(a=>a.shape==='appearance');
 if(!style&&create){
  style={shape:'appearance',origin:[0,0,0],angle:0,size:1};
  areas.push(style);
 }
 return style;
}
function validTexturePack(pack){
 return pack&&typeof pack==='object'&&!Array.isArray(pack)&&Object.keys(pack).length<=24&&
  Object.entries(pack).every(([id,src])=>textureIdPattern.test(id)&&typeof src==='string'&&
   src.length<=400000&&textureImagePattern.test(src));
}
async function textureZipEntries(file){
 if(file.size>12*1024*1024)throw Error('Choose a ZIP smaller than 12 MB.');
 const bytes=await file.arrayBuffer(),view=new DataView(bytes);
 let end=bytes.byteLength-22;
 while(end>=Math.max(0,bytes.byteLength-65557)&&
  (view.getUint32(end,true)!==0x06054b50||end+22+view.getUint16(end+20,true)!==bytes.byteLength))end--;
 if(end<Math.max(0,bytes.byteLength-65557))throw Error('Invalid ZIP directory.');
 const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
 if(count>100||offset>end||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('Unsupported ZIP directory.');
 let next=offset;
 const result=[];
 for(let i=0;i<count;i++){
  const at=next;
  if(at+46>end||view.getUint32(at,true)!==0x02014b50)throw Error('Invalid ZIP entry.');
  const length=view.getUint16(at+28,true),packed=view.getUint32(at+20,true),size=view.getUint32(at+24,true);
  next=at+46+length+view.getUint16(at+30,true)+view.getUint16(at+32,true);
  if(next>end)throw Error('Truncated ZIP directory.');
  const name=new TextDecoder().decode(new Uint8Array(bytes,at+46,length)).split('/').at(-1);
  if(!/\.(png|jpe?g|webp)$/i.test(name)||name.startsWith('._'))continue;
  const local=view.getUint32(at+42,true),method=view.getUint16(at+10,true);
  if(size>2*1024*1024||result.length>=24||local+30>offset||
   view.getUint32(local,true)!==0x04034b50||view.getUint16(at+8,true)&1||![0,8].includes(method))
   throw Error('Unsupported texture entry: '+name);
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
  if(start+packed>offset)throw Error('Truncated texture: '+name);
  let blob=new Blob([bytes.slice(start,start+packed)]);
  if(method===8){
   const reader=blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
   const chunks=[];let total=0;
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.length;
    if(total>size){await reader.cancel();throw Error('Invalid texture size: '+name);}
    chunks.push(value);
   }
   blob=new Blob(chunks);
  }
  if(blob.size!==size)throw Error('Invalid texture size: '+name);
  result.push(new File([blob],name));
 }
 return result;
}
async function prepareTexture(file){
 if(file.size>2*1024*1024)throw Error('Texture is larger than 2 MB: '+file.name);
 const id=file.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
 if(!textureIdPattern.test(id))throw Error('Invalid texture filename.');
 const bitmap=await createImageBitmap(file);
 try{
  const tile=document.createElement('canvas');
  tile.width=tile.height=512;
  tile.getContext('2d').drawImage(bitmap,0,0,512,512);
  const src=tile.toDataURL('image/webp',.88);
  if(!validTexturePack({[id]:src}))throw Error('Could not encode '+file.name);
  return [id,src];
 }finally{bitmap.close()}
}
function refreshTexturePalette(){
 const pack=textureSceneStyle()?.texturePack??{};
 const picker=el('surfaceTexture'),prior=picker.value;
 if(Object.keys(pack).join(',')!==[...picker.options].map(o=>o.value).join(',')){
  picker.replaceChildren(...Object.keys(pack).map(id=>new Option(id.replaceAll('-',' '),id)));
  if(Object.hasOwn(pack,prior))picker.value=prior;
 }
 const preview=el('texturePreview'),src=pack[picker.value];
 preview.hidden=!src;
 if(src&&preview.getAttribute('src')!==src)preview.src=src;
 const editable=!playing&&!terrainLocked&&roomProfile?.gm!==false;
 el('textureRepeat').disabled=!editable;
 if(document.activeElement!==el('textureRepeat'))el('textureRepeat').value=textureSceneStyle()?.textureRepeat??2;
 el('importTextures').disabled=!editable;
 el('applyJadeTextures').disabled=!editable||!jadeTextureIds.every(id=>Object.hasOwn(pack,id));
 el('paintTexture').disabled=!editable||!picker.value;
 el('groundTexture').disabled=!editable||!picker.value;
}
el('surfaceTexture').onchange=refreshTexturePalette;
el('textureRepeat').onchange=()=>{
 const input=el('textureRepeat');
 if(input.disabled||!input.validity.valid||!Number.isFinite(input.valueAsNumber))return;
 remember();textureSceneStyle(true).textureRepeat=input.valueAsNumber;refresh();
};
el('importTextures').onclick=()=>el('textureFiles').click();
el('textureFiles').onchange=async e=>{
 const files=[...e.target.files];e.target.value='';
 if(!files.length)return;
 const terrain=pieces,styleAtStart=areas,status=el('textureStatus');
 status.textContent='Reading textures…';
 try{
  const images=files.length===1&&/\.zip$/i.test(files[0].name)?await textureZipEntries(files[0]):files;
  if(!images.length||images.length>24)throw Error('Choose between 1 and 24 texture images.');
  const imported=Object.fromEntries(await Promise.all(images.map(prepareTexture)));
  if(Object.keys(imported).length!==images.length)throw Error('Texture filenames must be unique.');
  if(terrain!==pieces||styleAtStart!==areas||playing||terrainLocked||roomProfile?.gm===false)throw Error('The editable scene changed during import.');
  const pack={...textureSceneStyle()?.texturePack,...imported};
  if(!validTexturePack(pack))throw Error('A scene can contain up to 24 textures.');
  remember();textureSceneStyle(true).texturePack=pack;
  refresh();status.textContent='Imported '+images.length+' textures.';
 }catch(error){status.textContent=error.message}
};
function jadeTextureFaces(p){
 if(sceneryPiece(p)||['stream','waterfall','fountain'].includes(p.type))return null;
 if(isFurniture(p)||['bridge','crate'].includes(p.type))return Array(5).fill('weathered-timber');
 const [, ,height]=dimensions(p);
 const floor=p.groundSurface||p.stairTread||p.type==='terrace'||p.type==='volume'&&height<=1;
 const side=floor||p.type==='column'?'cave-rock':'cut-masonry';
 return [side,side,side,side,floor?'stone-floor':side];
}
el('applyJadeTextures').onclick=()=>{
 if(el('applyJadeTextures').disabled)return;
 remember();
 const style=textureSceneStyle(true);
 style.groundTexture='stone-floor';style.texturePreset='jade-mines';
 for(const p of pieces){
  const faces=jadeTextureFaces(p);
  if(faces)p.surfaceTextures=faces.map((id,i)=>p.surfaceTextures?.[i]??id);
 }
 refresh();el('textureStatus').textContent='Jade Mines textures applied. Export to save a textured JSON copy.';
};
el('groundTexture').onclick=()=>{
 if(el('groundTexture').disabled)return;
 remember();textureSceneStyle(true).groundTexture=el('surfaceTexture').value;refresh();
};
const terrainColorCache=new WeakMap();
let terrainColorSampler;
function averageTerrainColor(image){
 if(terrainColorCache.has(image))return terrainColorCache.get(image);
 if(!terrainColorSampler){
  const sample=document.createElement('canvas');
  sample.width=sample.height=16;
  terrainColorSampler=sample.getContext('2d',{willReadFrequently:true});
 }
 const sampler=terrainColorSampler;
 let color=null;
 try{
  sampler.clearRect(0,0,16,16);
  sampler.drawImage(image,0,0,16,16);
  const pixels=sampler.getImageData(0,0,16,16).data;
  let red=0,green=0,blue=0,alpha=0;
  for(let i=0;i<pixels.length;i+=4){
   const opacity=pixels[i+3];
   red+=pixels[i]*opacity;green+=pixels[i+1]*opacity;blue+=pixels[i+2]*opacity;alpha+=opacity;
  }
  if(alpha)color='rgba('+[red,green,blue].map(channel=>Math.round(channel/alpha)).join(',')+','+alpha/(255*256)+')';
 }catch{
  // A cross-origin image may render normally but prevent pixel reads.
  sampler.canvas.width=16;
 }
 terrainColorCache.set(image,color);
 return color;
}
function drawImportedTexture(id,style,face,flat=false){
 if(!performanceDraw?.collectPaintBreakdown)return drawImportedTextureImpl(id,style,face,flat);
 return measurePaint('importedTextures',()=>drawImportedTextureImpl(id,style,face,flat));
}
function drawImportedTextureImpl(id,style,face,flat){
 const src=style?.texturePack?.[id];
 if(typeof src!=='string')return false;
 const image=getArt(src);
 if(!image.naturalWidth)return false;
 const repeat=Number(style.textureRepeat);
 return drawPatternLayers(null,face,image,repeat>=.5&&repeat<=12?repeat:2,flat)!==false;
}
function patternLayers(value){
 return Array.isArray(value)?value:typeof value==='string'?[{kind:value,seed:1}]:[];
}
function drawPatternLayers(value,face,image=null,period=2,flat=false){
 if(!performanceDraw?.collectPaintBreakdown)return drawPatternLayersImpl(value,face,image,period,flat);
 return measurePaint('texturePatterns',()=>drawPatternLayersImpl(value,face,image,period,flat));
}
const repeatPatterns=new WeakMap();
function repeatPattern(image){
 let pattern=repeatPatterns.get(image);
 if(!pattern){
  pattern=ctx.createPattern(image,'repeat');
  if(pattern)repeatPatterns.set(image,pattern);
 }
 return pattern;
}
const repeatedPatternBitmaps=new WeakMap();
function repeatedPatternBitmap(tile){
 let bitmap=repeatedPatternBitmaps.get(tile);
 if(bitmap)return bitmap;
 bitmap=document.createElement('canvas');
 bitmap.width=bitmap.height=512;
 const paint=bitmap.getContext('2d');
 for(let y=0;y<512;y+=128)for(let x=0;x<512;x+=128)paint.drawImage(tile,x,y,128,128);
 repeatedPatternBitmaps.set(tile,bitmap);
 return bitmap;
}
function drawRepeatedPatternBitmap(tile,left,top,right,bottom){
 const bitmap=repeatedPatternBitmap(tile),size=bitmap.width;
 for(let row=Math.floor(top/size)*size;row<bottom;row+=size){
  const y=Math.max(top,row),height=Math.min(bottom,row+size)-y;
  for(let column=Math.floor(left/size)*size;column<right;column+=size){
   const x=Math.max(left,column),width=Math.min(right,column+size)-x;
   ctx.drawImage(bitmap,x-column,y-row,width,height,x,y,width,height);
  }
 }
}
function drawPatternLayersImpl(value,face,image=null,period=2,flatColor=false){
 if(textureTestEffect==='patterns'&&!image)return;
 const layers=patternLayers(value);
 if(!layers.length&&!image)return;
 const {world,projected}=face;
 if(!world||projected.length<3)return;
 const {capPattern:cap,sidePattern:side}=face;
 const flat=world.every(p=>Math.abs(p[2]-world[0][2])<1e-6);
 const wallAxis=[0,1].find(i=>world.every(p=>Math.abs(p[i]-world[0][i])<1e-6));
 if(!flat&&wallAxis===undefined&&projected.length!==4)return false;
 if(flatColor){
  if(image){
   const color=averageTerrainColor(image);
   if(!color)return false;
   polygon(projected,color,null);
  }else for(const {kind} of layers){
   const color=averageTerrainColor(scenePattern(kind,1));
   if(color)polygon(projected,color,null);
  }
  return true;
 }
 if(!side&&!flat&&wallAxis===undefined){
  if(projected.length===4){
   if(image)mapImage(image,projected);
   else for(const {kind,seed} of layers)mapImage(scenePattern(kind,seed),projected);
  }
  return;
 }
 const basis=cap??side;
 const [ax,ay]=basis?.along??[1,0];
 const [ox,oy]=basis?.origin??[0,0];
 const phase=basis?basis.distance%period:0;
 const toWorld=side?(u,v)=>[ox+(u-phase)*ax,oy+(u-phase)*ay,-v]:cap?(u,v)=>[ox+(u-phase)*ax-v*ay,oy+(u-phase)*ay+v*ax,world[0][2]]:flat?(u,v)=>[u,v,world[0][2]]:wallAxis===0?(u,v)=>[world[0][0],u,-v]:(u,v)=>[u,world[0][1],-v];
 const [x,y]=point(...toWorld(0,0)),[u,v]=point(...toWorld(1,0)),[j,k]=point(...toWorld(0,1));
 const coords=world.map(p=>basis?
  [(p[0]-ox)*ax+(p[1]-oy)*ay+phase,side?-p[2]:-(p[0]-ox)*ay+(p[1]-oy)*ax]:
  flat?[p[0],p[1]]:[p[1-wallAxis],-p[2]]);
 const pixels=image?.naturalWidth||128;
 const scale=pixels/period;
 const bitmapPatterns=!image&&textureTestEffect!=='legacyPatterns'&&textureTestEffect!=='directPatterns';
 const useClipping=!!basis||!!image||bitmapPatterns||textureTestEffect==='legacyPatterns';
 ctx.save();
 if(useClipping){
  ctx.beginPath();projected.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();
  measurePaint('textureClip',()=>ctx.clip());
 }
 ctx.transform((u-x)/scale,(v-y)/scale,(j-x)/scale,(k-y)/scale,x,y);
 if(useClipping){
  const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
  const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
  if(image){
   ctx.fillStyle=repeatPattern(image);
   ctx.fillRect(left*pixels/period,top*pixels/period,width*pixels/period,height*pixels/period);
  }
  for(const {kind,seed} of layers){
   const tile=scenePattern(kind,seed);
   if(bitmapPatterns){
    measurePaint('bitmapPatterns',()=>drawRepeatedPatternBitmap(tile,left*scale,top*scale,(left+width)*scale,(top+height)*scale));
   }else{
    ctx.fillStyle=repeatPattern(tile);
    ctx.fillRect(left*128/period,top*128/period,width*128/period,height*128/period);
   }
  }
 }else{
  // Fill the visible face directly in texture coordinates, retaining the world-space pattern origin.
  ctx.beginPath();
  coords.forEach(([px,py],i)=>i?ctx.lineTo(px*scale,py*scale):ctx.moveTo(px*scale,py*scale));
  ctx.closePath();
  for(const {kind,seed} of layers){
   ctx.fillStyle=repeatPattern(scenePattern(kind,seed));
   ctx.fill();
  }
 }
 ctx.restore();
}
function editPattern(value){
 const layers=patternLayers(value);
 if(brush==='erasePattern')return layers.length?layers.slice(0,-1):null;
 if(layers.length>=12){message('This surface has 12 stamps. Remove one before adding another.');return null}
 return [...layers,{kind:el('facePattern').value,seed:el('randomPattern').checked?(drag.patternSeed??=Math.floor(Math.random()*4294967296)):1}];
}
let repeatSource=null,repeatPreview=[],repeatEnd=null;
function repeatTerrainRow(source,endpoint,spacing){
 const [x,y]=endpoint.map((v,i)=>Math.max(0,Math.min(gridLimit(i),v))),delta=[x-source.x,y-source.y];
 const axis=Math.abs(delta[0])>=Math.abs(delta[1])?0:1;
 const count=Math.floor(Math.abs(delta[axis])/spacing+1e-6),direction=Math.sign(delta[axis]);
 return Array.from({length:count},(_,i)=>{
  const copy={...source,roomId:undefined},key=axis?'y':'x';
  copy[key]+=direction*spacing*(i+1);
  return copy;
 });
}
function updateRepeat(x,y){
 repeatEnd=[x,y];
 const spacing=Number(el('repeatSpacing').value);
 repeatPreview=Number.isInteger(spacing)&&spacing>=1&&spacing<=100
  ?repeatTerrainRow(repeatSource,inverse(x,y,repeatSource.z),spacing):[];
 el('repeatApply').disabled=!repeatPreview.length;
}
el('repeatTerrain').onclick=()=>{
 if(playing||terrainLocked||!selected||selected.type==='standee')return;
 const source=selected;exitTool();repeatSource=source;repeatEnd=null;
 message('Drag along a grid axis to preview copies. Choose Place row to confirm.');refresh();
};
el('repeatSpacing').oninput=()=>{if(repeatSource&&repeatEnd){updateRepeat(...repeatEnd);draw()}};
el('repeatApply').onclick=()=>{
 if(!repeatSource||playing||terrainLocked||!repeatPreview.length)return;
 const occupied=[...pieces,...tokens];
 for(const copy of repeatPreview){
  if(!valid(copy,occupied,null)){message('A copy overlaps terrain or falls outside the map.');return}
  occupied.push(copy);
 }
 remember();
 const copies=repeatPreview.map(copy=>structuredClone(copy));
 pieces.push(...copies);group.clear();for(const piece of [repeatSource,...copies])group.add(piece);
 repeatSource=null;repeatPreview=[];refresh();message('Terrain row placed.');
};
function stairSections(p,edge,rise,run){
 const bounds=dimensions(p),axis=edge<2?0:1,reverse=edge%2===1;
 const steps=Math.ceil(bounds[2]/rise)-1;
 if(steps<1||bounds[axis]<=.25)return null;
 // Fit the requested stair count inside the available depth rather than
 // rejecting an otherwise usable block. Preserve a small top landing.
 run=Math.min(run,(bounds[axis]-.25)/steps);
 return Array.from({length:steps+1},(_,i)=>{
  const from=i*run,to=i===steps?bounds[axis]:from+run;
  const origin=[p.x,p.y],extents=[...bounds];
  origin[axis]+=reverse?bounds[axis]-to:from;
  extents[axis]=to-from;extents[2]=Math.min(bounds[2],bounds[2]-steps*rise+i*rise);
  return {...p,type:'volume',stairTread:true,x:origin[0],y:origin[1],extents:p.r%2?[extents[1],extents[0],extents[2]]:extents,roomId:undefined};
 });
}
// Build curved staircases as small convex polygon treads. This reuses
// the existing shaped-volume renderer and terrain collision machinery.
function pointInPolygon(point,outline){
 let inside=false;
 for(let i=0,j=outline.length-1;i<outline.length;j=i++){
  const [xi,yi]=outline[i],[xj,yj]=outline[j];
  if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
function curvedStairSections(p,edge,rise,run,shape){
 const [w,d,h]=dimensions(p),steps=Math.ceil(h/rise)-1;
 const radius=Math.min(w,d)/2;
 if(steps<1||radius<=.25)return null;
 // Curved stairs have only half the block's short dimension as radial run.
 // Auto-fit the treads and retain a central landing instead of failing.
 run=Math.min(run,(radius-.25)/steps);
 // Each angular slice is a separate volume; limit unnecessary tessellation.
 const full=shape==='circle',segments=full?16:8;
 const center=full?[p.x+w/2,p.y+d/2]:
  edge===0?[p.x,p.y+d/2]:edge===1?[p.x+w,p.y+d/2]:
  edge===2?[p.x+w/2,p.y]:[p.x+w/2,p.y+d];
 const start=full?0:edge===0?-Math.PI/2:edge===1?Math.PI/2:edge===2?0:Math.PI;
 const span=full?Math.PI*2:Math.PI;
 const result=[];
 for(let i=0;i<=steps;i++){
  const outer=radius-i*run,inner=i===steps?0:radius-(i+1)*run;
  const height=Math.min(h,h-steps*rise+i*rise);
  for(let j=0;j<segments;j++){
   const a=start+span*j/segments,b=start+span*(j+1)/segments;
   const coords=[[outer*Math.cos(a),outer*Math.sin(a)],[outer*Math.cos(b),outer*Math.sin(b)],
    [inner*Math.cos(b),inner*Math.sin(b)],[inner*Math.cos(a),inner*Math.sin(a)]];
   const verticesWorld=coords.map(([x,y])=>[center[0]+x,center[1]+y]);
   const xs=verticesWorld.map(v=>v[0]),ys=verticesWorld.map(v=>v[1]);
   const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,depth=Math.max(...ys)-y;
   if(width<1e-7||depth<1e-7)continue;
   const vertices=verticesWorld.map(([u,v])=>[(u-x)/width,(v-y)/depth]);
   result.push({...p,type:'volume',form:'polygon',vertices,r:0,terrainYaw:0,
    stairTread:true,curvedStair:true,x,y,z:p.z,extents:[width,depth,height],roomId:undefined});
  }
 }
 return result;
}
function updateStairSliders(){
 for(const [id,label] of [['stairRise','stairRiseValue'],['stairRun','stairRunValue']])el(label).textContent=(Number(el(id).value)*1.25)+' ft';
}
for(const id of ['stairRise','stairRun'])el(id).oninput=updateStairSliders;
updateStairSliders();
function editCurvedStairFootprint(piece){
 const members=pieces.filter(p=>p.curvedStair&&p.stairGroup===piece.stairGroup);
 if(!members.length)return;
 const left=Math.min(...members.map(p=>p.x)),front=Math.min(...members.map(p=>p.y));
 const right=Math.max(...members.map(p=>p.x+dimensions(p)[0]));
 const back=Math.max(...members.map(p=>p.y+dimensions(p)[1]));
 const bottom=Math.min(...members.map(p=>p.z)),top=Math.max(...members.map(p=>p.z+dimensions(p)[2]));
 const old=[right-left,back-front,top-bottom];
 const dialog=document.createElement('dialog');dialog.className='form-dialog';
 const form=document.createElement('form');form.style.cssText='display:grid;gap:10px;padding:18px';
 const heading=document.createElement('h2');heading.textContent='Transform entire curved staircase';form.append(heading);
 const inputs=[];
 for(const [i,label] of ['Footprint width (ft)','Footprint depth (ft)','Total height (ft)'].entries()){
  const row=document.createElement('label'),input=document.createElement('input');
  input.type='number';input.min='1.25';input.max=String(i===2?maxHeight*5:100*5);
  input.step='1.25';input.value=String(Number((old[i]*5).toFixed(3)));
  row.append(label,input);form.append(row);inputs.push(input);
 }
 const note=document.createElement('p');note.textContent='Scales all stair treads together, preserving their relative rise and curved outline.';form.append(note);
 const buttons=document.createElement('div');buttons.className='bar';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
 const apply=document.createElement('button');apply.textContent='Apply transformation';buttons.append(cancel,apply);form.append(buttons);
 form.onsubmit=e=>{
  e.preventDefault();
  const next=inputs.map(input=>Number(input.value)/5);
  if(next.some(v=>!Number.isFinite(v)||v<.25)||bottom+next[2]>maxHeight){message('Enter valid staircase dimensions.');return}
  const scale=next.map((v,i)=>v/old[i]);
  const transformed=members.map(p=>{
   const outline=terrainFootprint(p).map(([x,y])=>[left+(x-left)*scale[0],front+(y-front)*scale[1]]);
   const xs=outline.map(v=>v[0]),ys=outline.map(v=>v[1]);
   const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,d=Math.max(...ys)-y;
   return {...p,x,y,z:bottom+(p.z-bottom)*scale[2],extents:[w,d,dimensions(p)[2]*scale[2]],
    vertices:outline.map(([u,v])=>[(u-x)/w,(v-y)/d])};
  });
  const terrain=pieces.flatMap(p=>members.includes(p)?p===members[0]?transformed:[]:[p]);
  if(transformed.some(p=>p.x<0||p.y<0||p.x+dimensions(p)[0]>gridLimit(0)||p.y+dimensions(p)[1]>gridLimit(1))||
   tokens.some(t=>!supported(t,terrain))){message('The transformed staircase exceeds the map or displaces a standee.');return}
  remember();pieces=terrain;group.clear();for(const p of transformed)group.add(p);
  selected=transformed[0];dialog.close();refresh();message('Curved staircase resized as one structure.');
 };
 dialog.append(form);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
}
function cutStairEdge(p,edge){
 if(!['terrace','stone','wall','pillar','bridge','crate','volume'].includes(p.type)||p.form||edge>3)return;
 if(drag.changed)return;
 const rise=Number(el('stairRise').value)/4,run=Number(el('stairRun').value)/4;
 const shape=el('stairShape').value;
 const sections=shape==='straight'?stairSections(p,edge,rise,run):curvedStairSections(p,edge,rise,run,shape);
 if(!sections){message('This block is too shallow for the requested staircase. Increase its footprint or reduce its height.');return}
 {
  const stairGroup=crypto.randomUUID();
  for(const section of sections)section.stairGroup=stairGroup;
 }
 const terrain=pieces.flatMap(piece=>piece===p?sections:[piece]);
 if(tokens.some(t=>!supported(t,terrain))||areas.some(a=>a.shape==='difficult'&&!validDifficultTerrain(a,terrain))){
  message('Move standees or difficult terrain off the cut first.');return;
 }
 remember();drag.changed=true;pieces=terrain;group.delete(p);if(selected===p)selected=null;
 refresh();message('Staircase cut.');
}
function paintEdge(x,y){
 if(terrainLocked)return;
 const f=hit(x,y),p=f?.p;
 if(!f||p?.type==='standee')return;
 const pattern=brush==='paintPattern'||brush==='erasePattern';
 const basePattern=brush==='hideBasePattern'||brush==='showBasePattern';
 if(!p){
  if(!pattern)return;
  const key=groundStampKey(f);
  if(drag.visited.has(key))return;
  drag.visited.set(key,true);
  let style=areas.find(a=>a.shape==='appearance');
  const next=editPattern(style?.groundStamps?.[key]);
  if(next===null)return;
  if(roomProfile?.gm===false){drag.preview={...drag.area,origin};draw();return}
  if(!drag.changed){remember();drag.changed=true}
  if(!style){style={shape:'appearance',size:1,angle:0,origin:[0,0,0]};areas.push(style)}
  const stamps=style.groundStamps??={};
  if(next.length)stamps[key]=next;else delete stamps[key];
  refresh();return;
 }
 const texture=brush==='paintTexture'||brush==='eraseTexture';
 const opaque=brush==='opaquePaint'||brush==='eraseOpaquePaint';
 const watercolor=basePattern||pattern||opaque||texture||brush==='wash'||brush==='eraseWash';
 if(!watercolor&&p.type==='stream')return;
 let edge=watercolor?(f.edge??4):f.edge;
 if(edge===undefined){
  const [w,d,h]=dimensions(p),[u,v]=inverse(x,y,p.z+h);
  const distances=[u-p.x,p.x+w-u,v-p.y,p.y+d-v];
  edge=distances.indexOf(Math.min(...distances));
 }
 if(brush==='stairsBrush'){
   // Use the clicked world-space perimeter, rather than a potentially
   // reversed face index on a rotated or resized volume.
   const [w,d,h]=dimensions(p),[u,v]=inverse(x,y,p.z+h);
   const distances=[u-p.x,p.x+w-u,v-p.y,p.y+d-v];
   cutStairEdge(p,distances.indexOf(Math.min(...distances)));return;
  }
 const seen=drag.visited.get(p)||new Set();
 if(seen.has(edge))return;
 seen.add(edge);drag.visited.set(p,seen);
 if(pattern&&el('stampWholeBlock').checked){
  if(seen.has('whole'))return;
  seen.add('whole');
  const layers=Array.from({length:5},(_,i)=>editPattern(p.patterns?.[i]));
  if(layers.every(value=>value===null))return;
  if(roomProfile?.gm===false){drag.preview={...drag.area,origin};draw();return}
  if(!drag.changed){remember();drag.changed=true}
  p.patterns=layers.map((value,i)=>value??p.patterns?.[i]??null);refresh();return;
 }
 if(texture){
  if(roomProfile?.gm===false)return;
  const id=brush==='paintTexture'?el('surfaceTexture').value:null;
  if(id&&!Object.hasOwn(textureSceneStyle()?.texturePack??{},id))return;
  const assigned=p.surfaceTextures?.slice()??Array(5).fill(null);
  const edges=el('textureWholeBlock').checked?[0,1,2,3,4]:[edge];
  if(edges.every(i=>assigned[i]===id))return;
  if(!drag.changed){remember();drag.changed=true}
  for(const i of edges)assigned[i]=id;
  p.surfaceTextures=assigned;refresh();return;
 }
 if(pattern||basePattern){
  const next=pattern?editPattern(p.patterns?.[edge]):brush==='hideBasePattern';
  if(next===null||basePattern&&Boolean(p.plainFaces?.[edge])===next)return;
  if(roomProfile?.gm===false){drag.preview={...drag.area,origin};draw();return}
  if(!drag.changed){remember();drag.changed=true}
  const property=pattern?'patterns':'plainFaces';
  (p[property]??=Array(5).fill(null))[edge]=next;
  refresh();return;
 }
 if(watercolor){
  const property=opaque?'opaquePaint':'wash';
  const next=brush==='wash'||brush==='opaquePaint'?el('washColor').value:null;
  const wash=p[property]?.slice()||Array(5).fill(null);
  if(wash[edge]===next)return;
  if(roomProfile?.gm===false){drag.preview={...drag.area,origin};draw();return}
  if(!drag.changed){remember();drag.changed=true}
  wash[edge]=next;p[property]=wash;refresh();return;
 }
 const cuts=edgeCuts(p).slice();
 const next=brush==='square'?null:{kind:brush,depth:Number(el('cutDepth').value)};
 if(JSON.stringify(cuts[edge])===JSON.stringify(next))return;
 if(!drag.changed){remember();drag.changed=true}
 cuts[edge]=next;p.cuts=cuts;delete p.cut;
 refresh();
}
for(const kind of ['chamfer','fillet','square','stairsBrush','wash','eraseWash','opaquePaint','eraseOpaquePaint','paintTexture','eraseTexture','paintPattern','erasePattern','hideBasePattern','showBasePattern']){
 el(kind).onclick=()=>{
  if(playing)return;
  measuring=false;route=null;brush=brush===kind?null:kind;panMode=false;el('pan').classList.toggle('active',false);tool=null;tokenTool=null;ghost=null;
  message(brush?(kind==='hideBasePattern'||kind==='showBasePattern'?'Drag over block faces to hide or restore their original texture.':kind==='paintPattern'||kind==='erasePattern'?'Drag over ground squares or block faces. Each stroke adds or removes one layer.':['wash','eraseWash','opaquePaint','eraseOpaquePaint'].includes(kind)?'Drag across terrain faces to apply or remove color. Ctrl-drag to orbit.':'Drag near a terrain edge to shape it. Ctrl-drag to orbit.'):'Drag terrain to move it. Middle-drag to rotate.');
  refresh();
 };
}
function rotateTerrain(turn){
 if(playing||!selected||selected.type==='standee')return;
 const edges=turn>0?[3,2,0,1]:[2,3,1,0];
 const rotate=values=>values&&[...edges.map(i=>values[i]),...values.slice(4)];
 change({r:(selected.r+turn+4)%4,cuts:rotate(selected.cuts),wash:rotate(selected.wash),patterns:rotate(selected.patterns),plainFaces:rotate(selected.plainFaces)});
}
el('rotate').onclick=()=>rotateTerrain(1);
el('terrainAngle').onclick=()=>editTerrainAngle(selected);
function editTerrainAngle(piece){
 if(playing||terrainLocked||!pieces.includes(piece)||piece.type==='standee')return;
 const text=prompt('Terrain rotation in degrees',String((piece.r*90+(piece.terrainYaw??0))%360));
 if(text===null||!text.trim())return;
 const degrees=Number(text);
 if(!Number.isFinite(degrees)){message('Enter a rotation in degrees.');return;}
 selected=piece;change({terrainYaw:((degrees-piece.r*90)%360+360)%360});
}
function copyTerrain(cut=false){
 standeeClipboard=null;
 if(cut&&terrainLocked){message('Unlock terrain before cutting.');return}
 const selection=[...group];
 if(!selection.length)return;
 const remaining=cut?pieces.filter(p=>!group.has(p)):null;
 if(cut&&!tokens.every(t=>supported(t,remaining))){
  message('Move the standees off the selected terrain before cutting.');return;
 }
 const min=key=>Math.min(...selection.map(p=>p[key]));
 const x=min('x'),y=min('y'),z=min('z');
 copiedTerrain=selection.map(p=>({...structuredClone(p),x:p.x-x,y:p.y-y,z:p.z-z}));
 if(cut){remember();pieces=remaining;group.clear();selected=null;refresh()}
 message(selection.length+' terrain piece(s) '+(cut?'cut':'copied')+'. Point at the map and paste.');
}
function pasteTerrain(){
 if(terrainLocked){message('Unlock terrain before pasting.');return}
 if(!copiedTerrain.length)return;
 if(!pointer){message('Point at the map to paste terrain.');return}
 const [x,y,z]=measurePoint(...pointer);
 const pending=copiedTerrain.map(p=>({...structuredClone(p),roomId:crypto.randomUUID(),x:p.x+Math.floor(x+1e-8),y:p.y+Math.floor(y+1e-8),z:p.z+Math.round(z)}));
 const occupied=[...pieces,...tokens];
 const previous=selected;selected=null;
 for(const p of pending){
  if(!valid(p,occupied)){
   selected=previous;message('The copied terrain does not fit here.');return;
  }
  occupied.push(p);
 }
 remember();pieces.push(...pending);group=new Set(pending);selected=pending[0];
 message(pending.length+' terrain piece(s) pasted.');refresh();
}
el('up').onclick=()=>{if(selected)change({z:selected.z+1})};
el('down').onclick=()=>{if(selected)change({z:selected.z-1})};
el('remove').onclick=()=>{if(playing||terrainLocked&&selected?.type!=='standee')return;if(selected&&!preservesSupport(null)){message('Move the standees off this piece before deleting it.');return}if(selected){remember();pieces=pieces.filter(p=>p!==selected);tokens=tokens.filter(p=>p!==selected);selected=null;group.clear();refresh()}};
let tallyStandee=null,tallySignature='';
function updateStandeeTally(){
 const panel=el('standeeTally'),token=tallyStandee;
 const visible=token&&roomProfile?.gm===true&&playing&&!carry&&tokens.includes(token)&&faces.some(face=>face.standee&&face.p===token);
 panel.hidden=!visible;
 if(!visible)return;
 const stats=['HP '+(Number.isFinite(token.hp)?token.hp:'—')];
 if(Number.isFinite(token.ac))stats.push('AC '+token.ac);
 if(Number.isFinite(token.saveDc))stats.push('DC '+token.saveDc);
 el('standeeTallyName').textContent=token.displayName||token.name;
 const label=stats.join(' · ');
 if(el('standeeTallyStats').textContent!==label)el('standeeTallyStats').textContent=label;
 const marks=el('standeeTallyMarks'),values=[100,10,5,1];
 const signature=String(token.hp);
 if(tallySignature!==signature){
  tallySignature=signature;
  marks.replaceChildren();
  const hp=Math.max(0,Math.floor(token.hp||0));
  // Reserve a five and a one whenever the total can represent both.
  const reserve=hp>=6?6:0;
  let remaining=hp-reserve;
  for(const [index,value] of values.entries()){
   const count=Math.floor(remaining/value)+(reserve&&value<=5?1:0);
   remaining%=value;
   if(!count)continue;
   const row=document.createElement('div');
   row.style.cssText='display:flex;gap:3px;flex-wrap:wrap';
   for(let i=0;i<Math.min(count,12);i++){
    const button=catalogButton(['C','×','Ⅴ','Ⅰ'][index]+(count>12&&i===11?' · '+(count-11):''),()=>{
     const current=tallyStandee;
     if(panel.hidden||roomProfile?.gm!==true||!tokens.includes(current)||current.hp<value)return;
     changeCombatStats(current,{hp:Math.max(0,current.hp-value)});
     refresh();
    });
    button.title='Subtract '+value+' HP';button.setAttribute('aria-label',button.title);
    row.append(button);
   }
   marks.append(row);
  }
 }
 const bounds=playCombatTokenBounds(token),width=panel.offsetWidth;
 const left=bounds.right+8+width<=innerWidth?bounds.right+8:bounds.left-width-8;
 panel.style.left=Math.max(4,Math.min(innerWidth-width-4,left))+'px';
 panel.style.top=Math.max(4,Math.min(innerHeight-panel.offsetHeight-4,bounds.top))+'px';
}
document.addEventListener('pointerdown',event=>{
 if(!el('standeeTally').contains(event.target)){
  tallyStandee=null;el('standeeTally').hidden=true;
 }
},true);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'){tallyStandee=null;el('standeeTally').hidden=true}
});
function changeCombatStats(token,values){
 const edits=new Map([[token,values]]);
 if(token.hpPoolId&&Object.hasOwn(values,'hp'))for(const member of tokens)
  if(member!==token&&member.hpPoolId===token.hpPoolId)edits.set(member,{hp:values.hp});
 const changes=[];
 for(const [member,next] of edits){
  const keys=Object.keys(next).filter(key=>member[key]!==next[key]);
  if(!keys.length)continue;
  member.trackingId??=crypto.randomUUID();
  changes.push({id:member.trackingId,fields:keys.map(key=>({key,before:member[key],after:next[key]}))});
  Object.assign(member,next);
 }
 if(changes.length){
  redoHistory.length=0;
  history.push(JSON.stringify({combatStats:changes}));
  if(history.length>60)history.shift();
  scheduleRoomPatch();
 }
}
el('undo').onclick=()=>{
 if(!history.length||roomProfile?.gm===false)return;
 const snapshot=JSON.parse(history.at(-1));
 if(snapshot.combatStats){
  history.pop();
  const redoChanges=[];
  let restored=0;
  for(const change of snapshot.combatStats){
   const token=tokens.find(item=>item.trackingId===change.id);
   if(!token)continue;
   for(const field of change.fields){
    if(token[field.key]!==field.after)continue;
    redoChanges.push({id:change.id,key:field.key,before:field.before,after:field.after});
    if(Object.hasOwn(field,'before'))token[field.key]=field.before;else delete token[field.key];
    restored++;
   }
  }
  if(redoChanges.length)redoHistory.push({kind:'combat',changes:redoChanges});
  message(restored?'Combat stats restored.':'The affected combat stats have changed since that edit.');
  refresh();return;
 }
 if(terrainLocked&&JSON.stringify(snapshot.pieces)!==JSON.stringify(pieces)){
  message('Unlock terrain to undo this map edit.');return;
 }
 history.pop();
 redoHistory.push({kind:'scene',before:JSON.stringify(snapshot),after:JSON.stringify({pieces,tokens,areas,...(snapshot.initiative?{initiative:[...initiativeEntries],activeInitiative}:{})})});
 if(redoHistory.length>60)redoHistory.shift();
 scheduleRoomPatch();carry=null;route=null;drag=null;
 const previousTokens=tokens;({pieces,tokens,areas}=snapshot);undoCombatPersistence(previousTokens);
 if(snapshot.initiative){
  initiativeEntries.clear();for(const [key,value] of snapshot.initiative)initiativeEntries.set(key,value);
  activeInitiative=snapshot.activeInitiative;publishInitiative();
 }
 selected=null;group.clear();ghost=null;refresh();
};
el('redo').onclick=()=>{
 if(!redoHistory.length||roomProfile?.gm===false)return;
 const entry=redoHistory.at(-1);
 if(entry.kind==='combat'){
  const restored=[];
  for(const change of entry.changes){
   const token=tokens.find(item=>item.trackingId===change.id);
   if(!token||token[change.key]!==change.before)continue;
   restored.push(change);
   if(change.after===undefined)delete token[change.key];else token[change.key]=change.after;
  }
  redoHistory.pop();
  if(restored.length){
   history.push(JSON.stringify({combatStats:[...new Map(restored.map(c=>[c.id,c.id])).keys()].map(id=>({id,fields:restored.filter(c=>c.id===id).map(({key,before,after})=>({key,before,after}))}))}));
   scheduleRoomPatch();
  }
  message(restored.length?'Combat stats reapplied.':'Cannot redo: combat stats changed since undo.');
  refresh();return;
 }
 const snapshot=JSON.parse(entry.after);
 if(terrainLocked&&JSON.stringify(snapshot.pieces)!==JSON.stringify(pieces)){message('Unlock terrain to redo this map edit.');return}
 redoHistory.pop();history.push(entry.before);
 if(history.length>60)history.shift();
 scheduleRoomPatch();carry=null;route=null;drag=null;
 const previousTokens=tokens;({pieces,tokens,areas}=snapshot);undoCombatPersistence(previousTokens);
 if(snapshot.initiative){
  initiativeEntries.clear();for(const [key,value] of snapshot.initiative)initiativeEntries.set(key,value);
  activeInitiative=snapshot.activeInitiative;publishInitiative();
 }
 selected=null;group.clear();ghost=null;refresh();
};
function scale(f,x=W/2,y=H*.55,action='Camera zoom'){
 const next=Math.max(.45,Math.min(12,zoom*f));
 if(next===zoom||!W||!H)return;
 const ratio=next/zoom;
 panX=x-W/2+(W/2+panX-x)*ratio;
 panY=y-H*.55+(H*.55+panY-y)*ratio;
 zoom=next;draw(action);
}
el('left').onclick=()=>orbitViewport(Math.PI/4);
el('right').onclick=()=>orbitViewport(-Math.PI/4);
el('minus').onclick=()=>scale(.85);
el('plus').onclick=()=>scale(1.18);
for(const [id,apply] of [
 ['phonePan',(x,y,dt)=>{panX+=x*dt*.009;panY+=y*dt*.009;draw('Camera pan')}],
 ['phoneRotate',(x,y,dt)=>{
  if(topDown)el('topDown').click();
  isoLocked=true;
  orbitViewport(x*dt*.000045);
 }],
 ['phoneZoom',(_x,y,dt)=>scale(Math.exp(-y*dt*.000065))]
]){
 const button=el(id),panel=button.parentElement,directions=panel.querySelector('.phone-directions');
 let gesture=null,frame=0;
 const stop=e=>{
  if(e.pointerId!==gesture?.id)return;
  gesture=null;cancelAnimationFrame(frame);
  button.removeAttribute('aria-pressed');
  panel.classList.remove('phone-active');directions.hidden=true;
 };
 button.onpointerdown=e=>{
  if(e.button!==0||gesture||panel.classList.contains('phone-active'))return;
  e.preventDefault();
  button.setPointerCapture(e.pointerId);
  gesture={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:0,y:0,last:performance.now()};
  button.setAttribute('aria-pressed','true');
  const arrows={phonePan:[['up','↑'],['down','↓'],['left','←'],['right','→']],
   phoneRotate:[['left','↶'],['right','↷']],phoneZoom:[['up','+ ↑'],['down','− ↓']]};
  directions.replaceChildren(...arrows[id].map(([side,label])=>{
   const arrow=document.createElement('span');arrow.className=side;arrow.textContent=label;return arrow;
  }));
  directions.hidden=false;panel.classList.add('phone-active');
  const tick=now=>{
   if(!gesture)return;
   const dt=Math.min(32,now-gesture.last);
   gesture.last=now;
   if(gesture.x||gesture.y)apply(gesture.x,gesture.y,dt);
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
 };
 button.onpointermove=e=>{
  if(e.pointerId!==gesture?.id)return;
  const offset=value=>Math.abs(value)<5?0:Math.max(-100,Math.min(100,value));
  gesture.x=offset(e.clientX-gesture.startX);
  gesture.y=offset(e.clientY-gesture.startY);
 };
 button.onpointerup=button.onpointercancel=button.onlostpointercapture=stop;
}

let previousCameraTilt=.69;
el('lowAngle').onclick=()=>{
 if(!W||!H)return;
 const x=W/2,y=H/2,pivot=measurePoint(x,y);
 if(tilt>.13){
  previousCameraTilt=tilt;
  orbitAround(angle,.10,pivot,x,y);
 }else orbitAround(angle,previousCameraTilt,pivot,x,y);
 queueRecovery();
};
el('topDown').onclick=()=>{
 if(drag)return;
 viewCameras[Number(topDown)]={zoom,panX,panY};
 topDown=!topDown;queueWorkspacePreferences();
 ({zoom,panX,panY}=viewCameras[Number(topDown)]||{zoom:1,panX:0,panY:0});
 try{localStorage.setItem('battlemap.topDown',String(topDown))}catch{}
 refresh();
};
function captureHomeView(){
 return {angle,tilt,zoom,topDown,panX:panX/Math.max(W,1),panY:panY/Math.max(H,1)};
}
function homeStorageKey(){return 'battlemap.homeView:'+JSON.stringify([roomProfile?.name||'local',currentSceneId])}
function sessionViewKey(){return 'battlemap.lastView:'+JSON.stringify([roomProfile?.name||'local',currentSceneId])}
function chosenSessionView(){
 try{return JSON.parse(localStorage.getItem(sessionViewKey()))}catch{return null}
}
let sessionViewSaveTimer=null;
function scheduleSessionViewSave(){
 if(!currentSceneId||!W||!H||carry||drag)return;
 clearTimeout(sessionViewSaveTimer);
 sessionViewSaveTimer=setTimeout(()=>{
  try{localStorage.setItem(sessionViewKey(),JSON.stringify(captureHomeView()))}catch{}
 },300);
}
window.addEventListener('pagehide',()=>{
 clearTimeout(sessionViewSaveTimer);
 if(currentSceneId&&W&&H)try{localStorage.setItem(sessionViewKey(),JSON.stringify(captureHomeView()))}catch{}
});
function chosenHomeView(){
 try{const saved=JSON.parse(localStorage.getItem(homeStorageKey()));if(saved)return saved}catch{}
 return areas.find(area=>area.shape==='appearance')?.appearance?.startingView;
}
function applyHomeView(view){
 cubePreferredAngle=null;
 const valid=view&&['angle','tilt','zoom','panX','panY'].every(key=>Number.isFinite(view[key]))&&view.zoom>0&&view.zoom<=40;
 setFocusCutaway(null);
 angle=valid?view.angle:-.64;tilt=valid?Math.max(.10,Math.min(1.5,view.tilt)):.69;
 zoom=valid?view.zoom:1;panX=valid?view.panX*W:0;panY=valid?view.panY*H:0;
 topDown=valid?!!view.topDown:topDown;
}
el('home').textContent='Home View';
el('home').title='Home View';
el('home').onclick=el('cubeHome').onclick=()=>{if(drag||carry)return;applyHomeView(chosenHomeView());draw('Home view')};
el('savePlayerHome').onclick=()=>{
 try{localStorage.setItem(homeStorageKey(),JSON.stringify(captureHomeView()));message('Home View saved for this scene.')}catch{message('Home View could not be saved.')}
};
el('clearPlayerHome').onclick=()=>{try{localStorage.removeItem(homeStorageKey())}catch{}el('cubeHome').click()};
el('saveSceneCamera').onclick=()=>{
 if(roomProfile?.gm===false)return;
 remember();
 let area=areas.find(area=>area.shape==='appearance');
 if(!area){area={shape:'appearance',origin:[0,0,0],angle:0,size:1,appearance:{}};areas.push(area)}
 area.appearance??={};
 area.appearance.startingView=captureHomeView();
 el('sceneCameraStatus').textContent='Starting view captured. Save this scene to keep it.';
 queueRecovery();scheduleRoomPatch();
};
// Every compass preset is a complete, predictable camera framing operation.
// Resolve player ownership rather than relying on the GM's selected standee.
function compassFocusStandee(){
 if(roomProfile?.gm===false){
  const owned=tokens.filter(token=>ownsRoomStandee(token)&&!standeeHidden(token));
  return owned.find(token=>token.roomId&&roomProfile?.characters?.some(character=>character.id===token.roomId))||owned[0]||null;
 }
 return selected?.type==='standee'&&!standeeHidden(selected)?selected:null;
}
function frameCompassView(action){
 C=Math.cos(angle);D=Math.sin(angle);
 const preferred=Number(preferences.focusZoom)/100;
 zoom=Number.isFinite(preferred)?Math.max(.45,Math.min(12,preferred)):1;
 S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;
 panX=0;panY=0;
 const target=compassFocusStandee();
 if(target){
  const [x,y]=point(...basePoint(target));
  panX+=W/2-x;
  panY+=H/2-(y-standeeArtHeight(target)/2);
  setFocusCutaway(target);
 }else{
  // Preserve the old center-of-battlefield fallback when no token is assigned.
  panY=-H*.05;
  setFocusCutaway(null);
 }
 rememberCubeAngle();
 draw(action);
}
for(const button of el('viewCube').querySelectorAll('[data-view]'))button.onclick=()=>{
 if(drag||carry)return;
 const name=button.dataset.view;
 if(name==='Top')topDown=true;
 else{topDown=false;angle={N:0,NE:Math.PI/4,E:Math.PI/2,SE:Math.PI*3/4,S:Math.PI,SW:Math.PI*5/4,W:Math.PI*1.5,NW:-Math.PI/4}[name];tilt=.69}
 frameCompassView('Camera preset');
};
// Rotation arrows use the same safe recenter and preferred zoom behavior.
for(const [id,delta] of [['cubeRotateLeft',-Math.PI/4],['cubeRotateRight',Math.PI/4]]){
 el(id).onclick=()=>{
  if(drag||carry)return;
  angle=(angle+delta+Math.PI*2)%(Math.PI*2);
  topDown=false;
  frameCompassView('Compass rotation');
 };
}
el('playerShowAllies').onclick=()=>{
 if(roomProfile?.gm!==false||!playing)return;
 playerShowAllies=!playerShowAllies;
 el('playerShowAllies').setAttribute('aria-pressed',String(playerShowAllies));
 el('playerShowAllies').textContent=playerShowAllies?'Hide Allies':'Show Allies';
 movementRenderCache=null;
 draw('Player ally camera visibility');
};
el('cubeIn').onclick=()=>scale(1.2,W/2,H/2);
el('cubeOut').onclick=()=>scale(1/1.2,W/2,H/2);
function compassBearing(yaw,pitch,overhead){
 // North is the map's negative Y axis. Project it through this camera,
 // including pitch, so the arrow points north on the actual screen.
 return overhead?0:Math.atan2(Math.sin(yaw),Math.cos(yaw)*Math.sin(pitch))*180/Math.PI;
}
function updateCameraCompass(){
 const compass=el('cameraCompass');if(!compass)return;
 const bearing=compassBearing(angle,tilt,topDown),rounded=bearing.toFixed(3);
 if(compass.dataset.bearing===rounded)return;
 compass.dataset.bearing=rounded;
 el('cameraCompassRose').setAttribute('transform','rotate('+rounded+' 60 60)');
 for(const [id,offset] of [['N',0],['E',90],['S',180],['W',270]]){
  const radians=(bearing+offset)*Math.PI/180,label=el('compass'+id);
  label.setAttribute('x',60+Math.sin(radians)*49);
  label.setAttribute('y',60-Math.cos(radians)*49);
 }
 const directions=['up','upper right','right','lower right','down','lower left','left','upper left'];
 const direction=directions[Math.round(((bearing%360+360)%360)/45)%8];
 el('cameraCompassTitle').textContent='North points '+direction+' on your screen';
}

function viewCubePlacement(width,height,obstacles,preferredHeight){
 let regions=[{left:8,top:8,right:width-8,bottom:height-8}];
 for(const obstacle of obstacles){
  const block={left:obstacle.left-8,top:obstacle.top-8,right:obstacle.right+8,bottom:obstacle.bottom+8};
  regions=regions.flatMap(r=>{
   if(block.right<=r.left||block.left>=r.right||block.bottom<=r.top||block.top>=r.bottom)return [r];
   return [{...r,right:Math.min(r.right,block.left)},{...r,left:Math.max(r.left,block.right)},
    {...r,bottom:Math.min(r.bottom,block.top)},{...r,top:Math.max(r.top,block.bottom)}]
    .filter(a=>a.right-a.left>=32&&a.bottom-a.top>=32);
  });
 }
 let best=null;
 for(const r of regions){
  const w=Math.min(174,r.right-r.left),h=Math.min(preferredHeight,r.bottom-r.top);
  const score=w*h-(width-r.right+height-r.bottom)*.01;
  if(!best||score>best.score)best={left:r.right-w,top:r.bottom-h,width:w,height:h,score};
 }
 return best;
}
const viewCube=el('viewCube');
const compassToggle=el('compassToggle');
const cubeControls=el('cubeControls');
const compactCompass=matchMedia('(max-width:600px),(pointer:coarse) and (max-height:600px)');
function setCubeExpanded(expanded){
 viewCube.toggleAttribute('data-expanded',expanded);
 compassToggle.setAttribute('aria-expanded',String(expanded));
 cubeControls.hidden=compactCompass.matches&&!expanded;
}
compassToggle.onclick=()=>{
 if(compactCompass.matches)setCubeExpanded(cubeControls.hidden);
 if(drag||carry||selected?.type==='standee'&&!standeeHidden(selected))return;
 setFocusCutaway(null);centerCubeStandee();draw('Center map');
};
document.addEventListener('pointerdown',event=>{
 if(viewCube.hasAttribute('data-expanded')&&!viewCube.contains(event.target))setCubeExpanded(false);
},true);
viewCube.addEventListener('keydown',event=>{
 if(event.key!=='Escape'||!viewCube.hasAttribute('data-expanded'))return;
 event.stopPropagation();
 setCubeExpanded(false);
 compassToggle.focus();
});
function syncCompassLayout(){
 compassToggle.setAttribute('aria-label',compactCompass.matches?'Camera controls':'Center map');
 setCubeExpanded(false);
 if(compactCompass.matches)viewCube.removeAttribute('style');
 scheduleViewCubeLayout();
}
let cubeLayoutFrame=null;
function scheduleViewCubeLayout(){
 if(cubeLayoutFrame!==null)return;
 cubeLayoutFrame=requestAnimationFrame(()=>{
  cubeLayoutFrame=null;
  if(compactCompass.matches)return;
  const host=canvas.parentElement.getBoundingClientRect();
  const obstacles=[el('rollsPanel'),canvas.parentElement.querySelector('.camera')].filter(node=>node&&!node.hidden&&node.getClientRects().length)
   .map(node=>{const r=node.getBoundingClientRect();return {left:r.left-host.left,top:r.top-host.top,right:r.right-host.left,bottom:r.bottom-host.top}});
  const placement=viewCubePlacement(host.width,host.height,obstacles,Math.max(280,viewCube.scrollHeight+2));
  if(!placement)return;
  Object.assign(viewCube.style,{right:'auto',bottom:'auto',left:placement.left+'px',top:placement.top+'px',width:placement.width+'px',maxHeight:placement.height+'px'});
 });
}
const cubeLayoutObserver=new ResizeObserver(scheduleViewCubeLayout);
for(const node of [canvas.parentElement,el('rollsPanel'),canvas.parentElement.querySelector('.camera')])if(node)cubeLayoutObserver.observe(node);
window.addEventListener('resize',scheduleViewCubeLayout);
compactCompass.addEventListener('change',syncCompassLayout);
syncCompassLayout();

canvas.parentElement.addEventListener('wheel',e=>{
 if(e.target!==canvas&&!e.target.closest?.('#visionMarkers button[data-map-handle]'))return;
 e.preventDefault();
 const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?H:1);
 scale(Math.exp(delta*.001*(preferences.scrollZoomDirection===1?1:-1)),...coords(e));
},{passive:false});
let visionTool=null,visionStart=null,visionSelection=null,visionRoomsShown=true;
const visionMarkers=document.createElement('div');
visionMarkers.id='visionMarkers';
visionMarkers.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:8';
canvas.parentElement.append(visionMarkers);
function beginArcaneEyeMove(token){
 if(carry){message('Finish or cancel the current move first.');return}
 const [x,y,z]=token.arcaneEye;
 const piece={type:'standee',name:'Arcane Eye',icon:'◉',color:'#ae80ff',size:1,x:x-.5,y:y-.5,z,flying:true,roomId:token.roomId};
 carry={piece,arcaneEye:token,dx:0,dy:0,grabPlane:z,previousRoute:route};
 ghost={...piece};route={points:[basePoint(piece)],end:basePoint(piece)};
 message('Move Arcane Eye: aim on the map, add waypoints, then ✓ to confirm or × to cancel.');
 draw('Arcane Eye movement');
}
const eyeMarkers=new Map();
function drawArcaneEyes(){
 const visible=new Set();
 for(const token of tokens){
  if(!Array.isArray(token.arcaneEye)||token.incognito||!token.roomId||!(roomProfile?.gm||ownsRoomStandee(token)))continue;
  visible.add(token.roomId);
  let eye=eyeMarkers.get(token.roomId);
  if(!eye){
   eye=document.createElement('button');eye.type='button';eye.className='arcane-eye';
   eye.dataset.mapHandle='';eye.setAttribute('aria-label','Arcane Eye — click to move, right-click to dismiss');eye.title='Click to begin movement · Right-click to dismiss';
   eye.innerHTML='<svg width="25" height="16" viewBox="0 0 25 16" aria-hidden="true"><path d="M1 8Q12.5 -5 24 8Q12.5 21 1 8Z" fill="#d5a5ff"/><circle cx="12.5" cy="8" r="4" fill="#792fc0"/><circle cx="12.5" cy="8" r="1.8" fill="#210a39"/></svg>';
   eyeMarkers.set(token.roomId,eye);visionMarkers.append(eye);
  }
  const [x,y]=point(token.arcaneEye[0],token.arcaneEye[1],token.arcaneEye[2]+.65);
  if(eye.dragPointer===undefined){eye.style.left=x+'px';eye.style.top=y+'px'}
  eye.oncontextmenu=async e=>{
   e.preventDefault();e.stopPropagation();
   if(!(roomProfile?.gm||ownsRoomStandee(token))||playerScenePaused())return;
   if(!confirm('Dismiss '+(standeeName(token)||'caster')+'’s Arcane Eye?'))return;
   try{await customizeRoomObject(token,'arcane_eye',null);await pollRoom();draw('Arcane Eye dismissed')}
   catch(error){message(error.message)}
  };
  eye.onpointerdown=e=>{
   if(e.button!==0||!(roomProfile?.gm||ownsRoomStandee(token))||playerScenePaused())return;
   e.preventDefault();e.stopPropagation();
   beginArcaneEyeMove(token);
  };
 }
 for(const [id,eye] of eyeMarkers)if(!visible.has(id)){eye.remove();eyeMarkers.delete(id)}
}
function visionObjects(){return areas.filter(a=>['room','opening','light'].includes(a.shape))}
function visionCell(e){
 const [x,y]=inverse(...coords(e),0);
 return [Math.max(0,Math.min(gridLimit(0)-1,Math.floor(x))),Math.max(0,Math.min(gridLimit(1)-1,Math.floor(y))),0];
}
function snapDoor(origin,angle,ignore=null){
 const walls=pieces.filter(p=>movementTerrainBlock(p)&&dimensions(p)[2]>=1&&!p.form);
 let best=null,nearest=1.25;
 for(const axis of [0,1]){
  const across=1-axis;
  const spans=walls.map(p=>{
   const d=dimensions(p),pos=[p.x,p.y];
   return {start:pos[axis],end:pos[axis]+d[axis],low:pos[across],high:pos[across]+d[across],z:p.z,top:p.z+d[2]};
  }).filter(w=>Math.abs((w.low+w.high)/2-origin[across]-.5)<1.5);
  for(const a of spans)for(const b of spans){
   const gap=b.start-a.end,low=Math.max(a.low,b.low),high=Math.min(a.high,b.high),z=Math.max(a.z,b.z);
   if(gap<.5||gap>3||high<=low||Math.min(a.top,b.top)<z+1)continue;
   const center=(a.end+b.start)/2,line=(low+high)/2;
   if(spans.some(w=>w.start<b.start&&w.end>a.end&&w.low<line&&w.high>line&&w.z<z+1&&w.top>z))continue;
   const snapped=[0,0,z];snapped[axis]=center-.5;snapped[across]=line-.5;
   if(visionObjects().some(o=>o!==ignore&&o.shape==='opening'&&o.origin.every((v,i)=>v===snapped[i])))continue;
   const distance=Math.hypot(snapped[0]-origin[0],snapped[1]-origin[1])+Math.abs(z-origin[2])*.25;
   if(distance<nearest){nearest=distance;best={origin:snapped,angle:axis?Math.PI/2:0,doorWidth:gap}}
  }
 }
 return best??{origin,angle,doorWidth:1};
}
function wallMountedLight(light){return ['sconce','wallTorch'].includes(light?.fixture)}
function sconceFloor(origin){
 const [u,v,z]=origin,x=u+.5,y=v+.5;
 let floor=0;
 for(const piece of pieces){
  if(!piece.groundSurface&&!['volume','terrace','stone','bridge'].includes(piece.type))continue;
  const [w,d,h]=dimensions(piece),top=piece.z+h;
  if(top>z||top<=floor||!piece.groundSurface&&h>.5)continue;
  if(x>=piece.x&&x<piece.x+w&&y>=piece.y&&y<piece.y+d)floor=top;
 }
 return floor;
}
function fixtureMovePlacement(light,origin,freePlacement){
 if(freePlacement)return {origin,freePlacement:true,
  ...(light.fixture==='sconce'?{mountHeight:(origin[2]-sconceFloor(origin))*5}:{})};
 const adjusted=[...origin];
 if(light.fixture==='sconce'&&Number.isFinite(light.mountHeight)){
  const base=sconceFloor(adjusted);
  adjusted[2]=base+light.mountHeight/5;
 }
 const placement=wallFixturePlacement(light,adjusted);
 return placement&&{...placement,freePlacement:false};
}
function wallFixturePlacement(light,origin){
 if(!wallMountedLight(light))return {origin};
 const [x,y,z]=[origin[0]+.5,origin[1]+.5,origin[2]];
 const offset=.3*(light.fixtureScale??1);
 let nearest=null,best=Infinity;
 for(const wall of pieces){
  if(!['wall','volume','stone'].includes(wall.type)||wall.stairTread||wall.form)continue;
  const [w,d,h]=dimensions(wall);
  if(h<=1&&!windowMasonry(wall)||z<wall.z||z>=wall.z+h)continue;
  const bounds=[[wall.x,wall.x+w],[wall.y,wall.y+d]];
  for(const axis of [0,1]){
   const along=1-axis,point=[x,y],value=point[axis];
   for(const sign of [-1,1]){
    const edge=bounds[axis][sign===1?1:0];
    if(sign*(value-edge)<-1e-8)continue;
    point[axis]=edge;
    point[along]=Math.max(bounds[along][0],Math.min(bounds[along][1],along===0?x:y));
    const distance=Math.hypot(point[0]-x,point[1]-y);
    if(distance>=best||distance>1.5)continue;
    best=distance;
    const angle=axis===0?(sign===1?0:Math.PI):sign*Math.PI/2;
    nearest={origin:[point[0]+offset*Math.cos(angle)-.5,point[1]+offset*Math.sin(angle)-.5,z],angle};
   }
  }
 }
 return nearest;
}
function openingWall(piece){
 return !piece?.terrainYaw&&(piece?.type==='wall'||wallVolume(piece)&&Math.min(...dimensions(piece).slice(0,2))<=1);
}
function wallOpeningBlock(piece,along,left,right,bottom,top){
 const origin=[piece.x,piece.y,piece.z],extents=dimensions(piece);
 origin[along]=left;origin[2]=bottom;
 extents[along]=right-left;extents[2]=top-bottom;
 return {...piece,type:'volume',x:origin[0],y:origin[1],z:origin[2],r:piece.r,extents:piece.r%2?[extents[1],extents[0],extents[2]]:extents,openingCut:true};
}
function windowMasonry(piece){
 return openingWall(piece)||piece?.type==='volume'&&!piece.terrainYaw&&!piece.form&&!piece.stairTread&&!piece.groundSurface&&
  Math.min(...dimensions(piece).slice(0,2))<=1;
}
function carveWallOpening(terrain,along,plane,left,right,bottom,top,accept=openingWall){
 const across=1-along;
 const replacements=new Map();
 for(const piece of terrain){
  if(!accept(piece))continue;
  const origin=[piece.x,piece.y,piece.z],extent=dimensions(piece),end=origin.map((value,i)=>value+extent[i]);
  const crosses=accept===windowMasonry?origin[across]<=plane+1e-7&&end[across]>=plane-1e-7:origin[across]<plane&&end[across]>plane;
  if(!crosses||end[along]<=left||origin[along]>=right||end[2]<=bottom||origin[2]>=top)continue;
  const cutLeft=Math.max(left,origin[along]),cutRight=Math.min(right,end[along]);
  const fragments=[];
  function fragment(start,finish,low,high){
   if(finish>start&&high>low)fragments.push(wallOpeningBlock(piece,along,start,finish,low,high));
  }
  fragment(origin[along],cutLeft,origin[2],end[2]);
  fragment(cutRight,end[along],origin[2],end[2]);
  fragment(cutLeft,cutRight,origin[2],Math.max(bottom,origin[2]));
  fragment(cutLeft,cutRight,Math.min(top,end[2]),end[2]);
  replacements.set(piece,fragments);
 }
 return replacements;
}
function wallOpeningCut(screen,opening){
 const {kind,angle}=opening;
 const face=hit(...screen,null,false,null,true);
 const wall=face?.p;
 if(!openingWall(wall)||!pieces.includes(wall)||dimensions(wall)[2]<1)return null;
 const size=dimensions(wall),position=[wall.x,wall.y,wall.z];
 const along=size[0]===size[1]?(angle===0?0:1):size[0]>size[1]?0:1;
 const across=1-along,plane=position[across]+size[across]/2;
 let aim=inverse(...screen,face.z??wall.z+size[2]/2);
 // Resolve the cursor against the clicked side, so the placement follows the wall in isometric view.
 if(!topDown&&face.z===null&&face.world.every(point=>point[across]===face.world[0][across])){
  const next=inverse(...screen,wall.z+size[2]/2+1);
  const delta=next[across]-aim[across];
  if(Math.abs(delta)>1e-8)aim=inverse(...screen,wall.z+size[2]/2+(face.world[0][across]-aim[across])/delta);
 }
 const window=kind==='Window',customSize=window&&opening.windowHeight!==undefined;
 const width=customSize?Math.round(opening.doorWidth*4)/4:Math.min(1,size[along]),first=position[along],last=first+size[along];
 const sill=window?(customSize?Math.round(windowBottom(opening)*4)/4:.5):0;
 const height=customSize?Math.round(opening.windowHeight*4)/4:Math.min(size[2],1.5)-sill;
 if(width<.25||height<.25||width>size[along]||sill+height>size[2]||window&&opening.windowTop==='semicircle'&&height<width/2)return {tooLarge:true};
 const jamb=size[along]>=width+.5?.25:0;
 const left=Math.max(first+jamb,Math.min(last-width-jamb,Math.round((aim[along]-width/2)*4)/4));
 const right=left+width,bottom=wall.z+sill,top=bottom+height;
 const replacements=carveWallOpening(pieces,along,plane,left,right,bottom,top,window?windowMasonry:openingWall);
 const origin=[0,0,wall.z];
 origin[along]=(left+right)/2-.5;origin[across]=plane-.5;
 return {replacements,placement:{origin,angle:along===0?0:Math.PI/2,doorWidth:width,cutHeight:top-wall.z,...(customSize?{sillHeight:sill,windowHeight:height}:{})}};
}
function placeOpeningOnWall(opening,start,screen){
 if(screen&&hit(...screen,null,false,null,true)?.p?.shape==='opening'){
  message('Choose a spot clear of the existing opening.');return false;
 }
 const cut=screen&&['Door','Window'].includes(opening.kind)?wallOpeningCut(screen,opening):null;
 if(cut?.tooLarge){message('This window does not fit the selected wall.');return false;}
 const placement=cut?.placement??snapDoor(start,opening.angle,opening);
 if(!cut&&opening.kind==='Window'&&opening.windowHeight!==undefined){
  if(placement.origin!==start&&Math.abs(placement.doorWidth-opening.doorWidth)>1e-8){
   message('This window does not fit the selected gap.');return false;
  }
  placement.doorWidth=opening.doorWidth;
 }
 const {angle,origin,doorWidth}=placement,along=angle===0?0:1,across=1-along;
 if(areas.some(a=>a!==opening&&a.shape==='opening'&&a.angle===angle&&a.origin[2]===origin[2]&&
   Math.abs(a.origin[across]-origin[across])<.05&&
   Math.abs(a.origin[along]-origin[along])<((a.doorWidth??1)+doorWidth)/2)){
  message('Choose a spot clear of the existing opening.');return false;
 }
 remember();
 delete opening.cutHeight;
 Object.assign(opening,placement);
 if(cut){
  pieces=pieces.flatMap(piece=>cut.replacements.get(piece)??[piece]);
  if(cut.replacements.has(selected))selected=null;
  for(const piece of cut.replacements.keys())group.delete(piece);
 }
 return true;
}
function placeVisionObject(origin,end=origin,screen=null){
 const shape=visionTool;
 const config=shape==='light'&&componentPlacement?.kind==='light'?{fixture:'torch',radius:20,tint:'#ffcc80',on:true,...componentPlacement.settings}:shape==='opening'?{kind:el('visionKind').value,secret:el('visionSecret').checked,open:false,locked:false}:
  shape==='light'?{radius:Math.max(5,Math.min(100,Number(el('visionRadius').value)||20)),tint:el('visionTint').value,fixture:'torch',on:true}:
  {depth:Math.abs(end[1]-origin[1])+1};
 const start=origin.map((v,i)=>Math.min(v,end[i]));
 const angle=config.angle??(el('visionAxis').checked?Math.PI/2:0);
 if(shape==='opening'){
  const opening={shape,size:1,...config,origin:start,angle};
  if(placeOpeningOnWall(opening,start,screen)){
   areas.push(opening);
   message('Placed '+opening.kind+'.');refresh();
  }
  return;
 }
 const placement=shape==='light'?fixtureMovePlacement(config,start,false):{origin:start,angle};
 if(!placement){message('Choose a location near a wall.');return}
 remember();
 areas.push({shape,...placement,size:shape==='room'?Math.abs(end[0]-origin[0])+1:1,...config,...placement});
 message(shape==='room'?'Room footprint added.':'Placed '+(config.kind||'light')+'.');refresh();
}
canvas.addEventListener('pointerup',e=>{
 if(!visionStart)return;
 const start=visionStart;visionStart=null;placeVisionObject(start,visionCell(e));
});
canvas.addEventListener('pointercancel',()=>{visionStart=null});
for(const [id,toolName] of [['visionRoom','room'],['visionOpening','opening'],['visionLight','light']]){
 el(id).onclick=()=>{
  if(playing||roomProfile&&!roomProfile.gm)return;
  exitTool();visionTool=toolName;el('visionInspector').hidden=false;
  message(toolName==='room'?'Drag across the room footprint. Esc cancels.':'Click a map square to place the '+toolName+'. Esc cancels.');
  draw();
 };
}
el('visionRoofs').onclick=()=>{
 visionRoomsShown=!visionRoomsShown;el('visionRoofs').setAttribute('aria-pressed',String(visionRoomsShown));draw();
};
el('visionDelete').onclick=()=>{
 if(!visionSelection||playing||roomProfile&&!roomProfile.gm)return;
 remember();areas=areas.filter(a=>a!==visionSelection);visionSelection=null;
 el('visionDelete').hidden=true;refresh();
};
const doorMaterials={
 Wood:['#95613b','#69452b','#bd8856',.075],
 Iron:['#616972','#363e46','#939da7',.065],
 Stone:['#827c70','#545047','#aaa294',.15]
};
const fixtureTypes={
 spellLight:['Spell light',0,10,'#bbddff',.8],
 torch:['Torch',20,40,'#ffb762',.7],
 lantern:['Lantern',30,60,'#ffe19a',.55],
 wallTorch:['Torch on wall',20,40,'#ffb762',1.15],
 sconce:['Wall sconce with candle',5,10,'#ffce88',1],
 candle:['Candle on table',5,10,'#ffce88',.8],
 fungus:['Bioluminescent fungus bloom',10,20,'#79f3cb',.35],
 campfire:['Campfire',20,40,'#ff9f53',.28],
 brazier:['Brazier',20,40,'#ffc06c',.65],
 chandelier:['Chandelier',20,40,'#ffd696',2.5]
};
let fixtureClipboard=null;
function fixtureType(light){return Object.hasOwn(fixtureTypes,light.fixture)?fixtureTypes[light.fixture]:fixtureTypes.torch}
const flamingFixtures=new Set(['torch','wallTorch','sconce','candle','campfire','brazier','chandelier']);
const chandelierMaterials={iron:['Wrought iron','#454650'],brass:['Brass','#ae853f'],bronze:['Bronze','#83573f'],wood:['Wood','#6f4d37']};
function chandelierDimensions(light){
 const value=(key,fallback,min,max)=>Number.isFinite(light[key])?Math.max(min,Math.min(max,light[key])):fallback;
 return {height:value('chandelierHeight',12.5,1.25,maxHeight*5)/5,radius:value('chandelierDiameter',5,1.25,20)/10,
  tiers:Math.round(value('chandelierTiers',1,1,3)),candles:Math.round(value('chandelierCandles',6,1,24))};
}
function stationaryFixtureVisible(fixture,anchor,blockers){
 if(fixture.secret)return false;
 const key='fixture:'+JSON.stringify([fixture.roomId,fixture.fixture,fixture.origin]);
 if(fogMemoryState?.seen.has(key))return true;
 return !!fogRemember(key,playerCanSeePoint(anchor,blockers));
}
function fixtureElevation(light){
 if(light.fixture==='chandelier'){
  const {height,tiers}=chandelierDimensions(light);
  return height+(tiers-1)*.16+.20;
 }
 return light.fixture==='spellLight'?light.lightElevation??.8:0;
}
function addFixtureFaces(blockers){
 const player=roomProfile?.gm===false;
 const carried=tokens.filter(t=>t.carriedFixture&&!standeeHidden(t)).map(t=>({
  ...t.carriedFixture,shape:'light',fixture:t.carriedFixture.fixture||'torch',
  fixtureHeight:.22,fixtureScale:.55,on:t.torch,
  origin:[t.x+(t.size-1)/2+.28,t.y+(t.size-1)/2,t.z+.55],dropped:false
 }));
 for(const original of [...visionObjects(),...carried]){
  const light=drag?.fixture===original&&drag.next?{...original,origin:drag.next}:original;
  if(hiddenByCutaway(light))continue;
  if(light.shape!=='light'||(!light.fixture&&!light.dropped))continue;
  const [x,y,z]=light.origin;
  const staticFixture=!!(light.fixture&&light.fixture!=='spellLight'&&!light.dropped&&!light.spellOwner&&!carried.includes(original));
  const spellMote=light.fixture==='spellLight'&&light.spell==='dancing';
  const anchor=[x+.5,y+.5,z+fixtureElevation(light)];
  if(spellMote&&gmVisionObserver()&&!fogPointVisible(anchor))continue;
  if(player){
   if(staticFixture&&fogMemoryState){
    if(!stationaryFixtureVisible(light,anchor,blockers))continue;
   }else{
    const ownedMote=spellMote&&light.spellOwner===roomProfile.name;
    if(light.secret||(!ownedMote&&!(spellMote&&mapFogEnabled()?
       fogPointVisible(anchor):playerCanSeePoint(anchor,blockers))))continue;
   }
  }
  const type=light.fixture||'torch',height=type==='spellLight'?(light.lightElevation??.8):light.dropped?.12:light.fixtureHeight??fixtureType(light)[4];
  const scale=type==='chandelier'?1:light.fixtureScale??1,angle=light.angle||0,c=Math.cos(angle),d=Math.sin(angle);
  const tint=light.tint||fixtureType(light)[3],metal='#49464a',wood='#735031';
  const world=(u,v,w)=>[x+.5+scale*(u*c-v*d),y+.5+scale*(u*d+v*c),z+w];
  const emit=(points,color)=>{
   face(points,color,light,null,false);
   Object.assign(faces.at(-1),{fixtureFace:true,staticFixture});
  };
  function mesh(u,v,levels,colors,sides=6,cap=true){
   const rings=levels.map(([h,r])=>Array.from({length:sides},(_,i)=>{
    const a=i*2*Math.PI/sides+Math.PI/sides;return world(u+r*Math.cos(a),v+r*Math.sin(a),h);
   }));
   if(!topDown)for(let l=1;l<rings.length;l++)for(let j=0;j<sides;j++){
    const k=(j+1)%sides;emit([rings[l-1][j],rings[l-1][k],rings[l][k],rings[l][j]],colors[j%colors.length]);
   }
   if(cap&&levels.at(-1)[1]>0)emit(rings.at(-1),colors[0]);
  }
  const box=(u,v,base,h,r,color)=>mesh(u,v,[[base,r],[base+h,r]],[color],4);
  const flame=(u,v,h,index=0)=>{
   const variation=(light.flameVariety??0)/100;
   const stretch=1+variation*[.35,-.35,.18][index%3];
   u=(u+variation*[0,.065,-.065][index%3])+(light.flameX??0)/100;
   v+=(light.flameY??0)/100;
   const rise=(light.flameHeight??100)/100*stretch;
   if(!light.on)return;
   const size=light.flameScale??1,color=light.flameColor??tint;
   if(topDown){mesh(u,v,[[h+.2*size*rise,.075*size]],[color]);return;}
   mesh(u,v,[[h,.045*size],[h+.07*size*rise,.075*size],[h+.2*size*rise,.015*size]],[color]);
  };
  if(type==='chandelier'){
   const {height:bottom,radius,tiers,candles}=chandelierDimensions(light);
   const body=light.chandelierColor??chandelierMaterials[light.chandelierMaterial]?.[1]??chandelierMaterials.iron[1];
   const shade=shadeTreeColor(body,light.chandelierMaterial==='wood'?.60:.72);
   const rim=light.chandelierMaterial==='wood'?.12:.085;
   mesh(0,0,[[bottom,.055],[bottom+(tiers-1)*.32+.52,.045]],[body,shade]);
   for(let tier=0;tier<tiers;tier++){
    const h=bottom+tier*.32,r=radius*(1-tier*.18),segments=16;
    for(let i=0;i<segments;i++){
     const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
     const at=(r,a,h)=>world(r*Math.cos(a),r*Math.sin(a),h);
     const inside=Math.max(.02,r-rim);
     emit([at(r,a,h),at(r,b,h),at(inside,b,h),at(inside,a,h)],body);
     if(!topDown)emit([at(r,a,h-.055),at(r,b,h-.055),at(r,b,h),at(r,a,h)],shade);
    }
    const count=Math.floor(candles/tiers)+(tier<candles%tiers?1:0);
    for(let i=0;i<count;i++){
     const a=(i+.5*tier)*Math.PI*2/count,ca=Math.cos(a),sa=Math.sin(a),u=r*ca,v=r*sa;
     emit([world(-sa*.025,ca*.025,h),world(u-sa*.025,v+ca*.025,h),world(u+sa*.025,v-ca*.025,h),world(sa*.025,-ca*.025,h)],body);
     mesh(u,v,[[h,.085],[h+.035,.085]],[shade,body],6);
     mesh(u,v,[[h+.035,.037],[h+.15,.035]],['#eadab5','#c6ad83'],6);
     flame(u,v,h+.15,i);
    }
   }
  }else if(type==='spellLight'){
   const ring=Array.from({length:24},(_,i)=>{
    const a=i*Math.PI/12,center=world(0,0,height);
    const right=.18*Math.cos(a),up=.18*Math.sin(a);
    return [center[0]+(topDown?right:right*C+up*D*Math.sin(tilt)),center[1]+(topDown?up:-right*D+up*C*Math.sin(tilt)),center[2]-(topDown?0:up*Math.cos(tilt))];
   });
   face(ring,tint+'24',light,null,false);Object.assign(faces.at(-1),{fixtureFace:true,spellBubble:true,spellMote});
   face(ring.map(p=>p.map((v,i)=>world(0,0,height)[i]+.48*(v-world(0,0,height)[i]))),tint,light,null,false);
   Object.assign(faces.at(-1),{fixtureFace:true,spellMote});
  }else if(type==='campfire'){
   for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    mesh(.26*Math.cos(a),.26*Math.sin(a),[[0,.08],[height*.36,.09],[height*.48,.055]],['#777067','#544d46'],5);
   }
   for(const [u,v] of [[-.09,0],[.09,0],[0,.09],[0,-.09]])box(u,v,height*.1,height*.28,.085,wood);
   flame(0,0,height*.38);flame(.08,.06,height*.32,1);flame(-.08,-.05,height*.3,2);
  }else if(type==='brazier'){
   mesh(0,0,[[0,.15],[height*.12,.12],[height*.65,.045]], [metal,'#827054']);
   mesh(0,0,[[height*.58,.09],[height*.83,.2],[height,.21]], [metal,'#827054'],8,false);
   mesh(0,0,[[height,.21],[height-Math.min(.055,height*.12),.16]],['#62564a','#403832'],8,false);
   const bed=height-Math.min(.055,height*.12);
   // Small coal facets leave gaps around the flame roots.
   if(light.on){
    for(const [u,v] of [[-.08,.04],[.08,-.045],[.015,-.09],[-.025,.09]]){
     mesh(u,v,[[bed,.028],[bed+.013,.021]],['#ae4927','#533025'],5);
    }
   }else mesh(0,0,[[bed,.16]],['#292622'],8);
   flame(0,0,bed);flame(.07,.04,bed,1);
  }else if(type==='fungus'){
   for(const [u,v,f] of [[0,0,1],[-.18,.08,.72],[.14,.14,.55],[.09,-.17,.8]]){
    const h=height*f;
    mesh(u,v,[[0,.04],[h,.045]],['#77938a','#526f65']);
    mesh(u,v,[[h*.76,.075],[h,.14],[h+.05,.085]],light.on?[tint,'#478e81']:['#49665b','#374d45']);
   }
  }else if(type==='lantern'){
   box(0,0,height*.1,.1,.16,metal);
   box(0,0,height*.1+.1,height*.55,.125,light.on?tint:'#585047');
   for(const u of [-.08,.08])for(const v of [-.08,.08])box(u,v,height*.1,.1+height*.56,.021,metal);
   mesh(0,0,[[height*.65+.1,.17],[height+.12,.07]],[metal,'#827054'],4);
  }else if(type==='candle'||type==='sconce'){
   if(type==='candle'){
    for(const u of [-.15,.15])for(const v of [-.15,.15])box(u,v,0,height*.72,.044,wood);
    box(0,0,height*.72,.055,.27,wood);
   }else{
    box(-.21,0,height*.66,.25,.12,metal);
    box(-.085,0,height*.72,.06,.16,metal);
   }
   box(0,0,height*.72+.055,height*.28,.06,'#e3d1a8');flame(0,0,height+.055);
  }else{
   if(type==='wallTorch'){box(-.22,0,height*.46,.24,.12,metal);box(-.11,0,height*.52,.06,.16,metal)}
   mesh(0,0,[[type==='wallTorch'?height*.42:0,.033],[height,.071]],[wood,'#a77347']);
   mesh(0,0,[[height-.1,.07],[height,.079]],['#47382c','#665043']);flame(0,0,height);
  }
 }
}
function editLightFixture(light){
 const dialog=document.createElement('dialog'),form=document.createElement('form');
 dialog.className='form-dialog';dialog.setAttribute('aria-labelledby','fixtureEditorTitle');
 const type=document.createElement('select');
 for(const [key,[name]] of Object.entries(fixtureTypes))type.add(new Option(name,key));
 type.value=Object.hasOwn(fixtureTypes,light.fixture)?light.fixture:'torch';
 function field(name,control){
  const label=document.createElement('label');label.append(name+' ',control);form.append(label);return control;
 }
 function slider(name,value,min,max,step=1,unit=''){
  const input=document.createElement('input'),output=document.createElement('output');
  input.type='range';
  Object.assign(input,{min,max,step,value});
  const label=document.createElement('label');
  label.append(name+' ',output,input);form.append(label);
  input.updateReadout=()=>{output.textContent=input.value+unit};
  input.addEventListener('input',input.updateReadout);
  input.updateReadout();return input;
 }
 const heading=document.createElement('h2');heading.id='fixtureEditorTitle';heading.textContent='Light fixture';form.append(heading);
 field('Type',type);
 const bright=slider('Bright radius',light.bright??light.radius,0,120,1,' ft');
 const dim=slider('Outer dim radius',light.radius,0,120,1,' ft');
 const color=document.createElement('input');color.type='color';color.value=light.tint||'#ffb762';field('Light color',color);
 const height=slider('Height',Math.round((light.fixtureHeight??fixtureType(light)[4])/fixtureType(light)[4]*100),10,300,1,'%');
 const size=slider('Width',Math.round((light.fixtureScale??1)*100),25,300,1,'%');
 const drop=slider('Chandelier height above floor',light.chandelierHeight??12.5,1.25,maxHeight*5,.25,' ft');
 const mount=slider('Sconce mounting height above floor',light.mountHeight??(light.fixture==='sconce'?(light.origin[2]-sconceFloor(light.origin))*5:5),0,maxHeight*5,.25,' ft');
 const diameter=slider('Chandelier diameter',light.chandelierDiameter??5,1.25,20,.25,' ft');
 const tiers=slider('Chandelier layers',light.chandelierTiers??1,1,3);
 const candles=slider('Total candles',light.chandelierCandles??6,1,24);
 const material=document.createElement('select'),bodyColor=document.createElement('input');
 for(const [id,[label]] of Object.entries(chandelierMaterials))material.add(new Option(label,id));
 material.value=Object.hasOwn(chandelierMaterials,light.chandelierMaterial)?light.chandelierMaterial:'iron';
 bodyColor.type='color';bodyColor.value=light.chandelierColor??chandelierMaterials[material.value][1];
 material.onchange=()=>{bodyColor.value=chandelierMaterials[material.value][1]};
 field('Chandelier body material',material);field('Chandelier body color',bodyColor);
 const facing=slider('Rotation',((Math.round((light.angle||0)*180/Math.PI)%360)+360)%360,0,359,1,'°');
 const flameSize=slider('Flame size',Math.round((light.flameScale??1)*100),25,300,1,'%');
 const flameColor=document.createElement('input');flameColor.type='color';field('Flame color',flameColor);
 const flameHeight=slider('Flame height',light.flameHeight??100,25,300,1,'%');
 const flameX=slider('Flame center · side to side',light.flameX??0,-25,25,1,'% of a square');
 const flameY=slider('Flame center · front to back',light.flameY??0,-25,25,1,'% of a square');
 const flameVariety=slider('Flame variety',light.flameVariety??0,0,100,1,'%');
 const updateFlameFields=()=>{
  const chandelier=type.value==='chandelier';
  mount.closest('label').hidden=type.value!=='sconce';
  for(const input of [drop,diameter,tiers,candles,material,bodyColor])input.closest('label').hidden=!chandelier;
  for(const input of [height,size])input.closest('label').hidden=chandelier;
  const visible=flamingFixtures.has(type.value);
  for(const input of [flameSize,flameColor,flameHeight,flameX,flameY])input.closest('label').hidden=!visible;
  flameVariety.closest('label').hidden=!['campfire','brazier'].includes(type.value);
 };
 flameColor.value=light.flameColor??color.value;
 updateFlameFields();
 const hint=document.createElement('small');hint.textContent='Wall fixtures face away from the wall they snap to.';form.append(hint);
 type.onchange=()=>{
  const [,b,r,t]=fixtureTypes[type.value];bright.value=b;dim.value=r;color.value=t;height.value=100;
  flameColor.value=t;flameSize.value=100;flameSize.updateReadout();
  flameHeight.value=100;flameX.value=flameY.value=flameVariety.value=0;
  for(const input of [flameHeight,flameX,flameY,flameVariety])input.updateReadout();
  updateFlameFields();
  for(const input of [bright,dim,height])input.updateReadout();
 };
 const syncRadii=()=>{if(dim.valueAsNumber<bright.valueAsNumber){dim.value=bright.value;dim.updateReadout()}};
 bright.addEventListener('input',syncRadii);dim.addEventListener('change',syncRadii);
 const actions=document.createElement('div');actions.className='dialog-actions';
 const save=document.createElement('button');save.type='submit';save.textContent='Apply';
 actions.append(catalogButton('Save template',()=>{
  syncRadii();
  const settings=readFixtureSettings();
  saveComponentTemplate('light',settings);
 }),catalogButton('Cancel',()=>dialog.close()),save);form.append(actions);
 function readFixtureSettings(){
  const settings={fixture:type.value,bright:bright.valueAsNumber,radius:dim.valueAsNumber,
   tint:color.value,fixtureHeight:fixtureTypes[type.value][4]*height.valueAsNumber/100,fixtureScale:size.valueAsNumber/100,angle:facing.valueAsNumber*Math.PI/180,on:light.on};
  if(flamingFixtures.has(type.value)){
   Object.assign(settings,{flameScale:flameSize.valueAsNumber/100,flameColor:flameColor.value,
    flameHeight:flameHeight.valueAsNumber,flameX:flameX.valueAsNumber,flameY:flameY.valueAsNumber});
   if(['campfire','brazier'].includes(type.value))settings.flameVariety=flameVariety.valueAsNumber;
  }
  if(type.value==='sconce')settings.mountHeight=mount.valueAsNumber;
  if(type.value==='chandelier')Object.assign(settings,{
   chandelierHeight:drop.valueAsNumber,chandelierDiameter:diameter.valueAsNumber,chandelierTiers:tiers.valueAsNumber,
   chandelierCandles:candles.valueAsNumber,chandelierMaterial:material.value,chandelierColor:bodyColor.value
  });
  return settings;
 }
 form.onsubmit=e=>{
  e.preventDefault();syncRadii();
  const settings=readFixtureSettings(),origin=[...light.origin];
  if(settings.fixture==='sconce')origin[2]=sconceFloor(light.origin)+settings.mountHeight/5;
  const placement=light.freePlacement?{origin}:wallFixturePlacement(settings,origin);
  if(origin[2]>maxHeight||!placement){hint.textContent='There is no wall at that mounting height. Choose a height within the wall.';return}
  remember();
  for(const key of ['flameScale','flameColor','flameHeight','flameX','flameY','flameVariety'])delete light[key];
  Object.assign(light,settings,placement);dialog.close();refresh();
 };
 dialog.onclose=()=>dialog.remove();dialog.append(form);document.body.append(dialog);dialog.showModal();
}
function windowWall(window){
 const {along,across,left,right,plane,bottom,top}=windowBounds(window);
 let nearest=.3,match;
 for(const wall of pieces){
  if(!windowMasonry(wall))continue;
  const origin=[wall.x,wall.y],size=dimensions(wall);
  if(plane<=origin[across]||plane>=origin[across]+size[across]||wall.z>=top||wall.z+size[2]<=bottom)continue;
  const gap=Math.min(Math.abs(origin[along]+size[along]-left),Math.abs(origin[along]-right));
  if(gap<nearest){nearest=gap;match=wall;}
 }
 return match;
}
function windowBounds(window){
 const along=window.angle===0?0:1,across=1-along,width=window.doorWidth??1;
 const center=window.origin[along]+.5,plane=window.origin[across]+.5,z=window.origin[2];
 return {along,across,center,plane,width,left:center-width/2,right:center+width/2,
  bottom:z+windowBottom(window),top:z+windowTop(window)};
}
function windowBottom(window){return window.sillHeight??(window.cutHeight ? .5 : .35)}
function windowTop(window){return window.windowHeight!==undefined?windowBottom(window)+window.windowHeight:window.cutHeight??1.6}
function windowProfile(window,width,height){
 const shape=window.windowTop;
 const rise=shape==='semicircle'?Math.min(width/2,height):shape==='pointed'?Math.min(width*.6,height*.65):0;
 return offset=>{
  const x=Math.min(1,Math.abs(offset/width*2-1));
  const curve=shape==='pointed'?Math.sqrt(Math.max(0,(1-((1+x)/2)**2)/.75)):Math.sqrt(1-x*x);
  return height-rise+rise*curve;
 };
}
function windowWallSections(window){
 if(window.cutHeight&&(!window.windowTop||window.windowTop==='flat'))return [];
 const wall=windowWall(window);
 if(!wall)return [];
 const {along,left,right,width,bottom,top}=windowBounds(window),height=top-bottom;
 const sections=[];
 if(!window.cutHeight){
  if(bottom>wall.z)sections.push(wallOpeningBlock(wall,along,left,right,wall.z,bottom));
  const wallTop=wall.z+dimensions(wall)[2];
  if(wallTop>top)sections.push(wallOpeningBlock(wall,along,left,right,top,wallTop));
 }
 if(window.windowTop&&window.windowTop!=='flat'){
  const profile=windowProfile(window,width,height),step=width/16;
  for(let i=0;i<16;i++){
   const lower=bottom+Math.max(profile(i*step),profile((i+1)*step));
   if(top-lower>1e-7)sections.push(wallOpeningBlock(wall,along,left+i*step,left+(i+1)*step,lower,top));
  }
 }
 return sections;
}
function windowApertureCuts(){
 if(lightingFrame?.apertureCuts)return lightingFrame.apertureCuts;
 const cuts=new Map();
 for(const window of areas){
  if(window.kind!=='Window'||window.secret&&roomProfile?.gm===false)continue;
  const b=windowBounds(window);
  if(!(b.right>b.left&&b.top>b.bottom))continue;
  // Existing saves can have a taller stored sash and a shorter masonry cut.
  // The stored aperture is authoritative for drawing and obstruction.
  const terrain=pieces.flatMap(piece=>cuts.get(piece)??[piece]);
  const next=carveWallOpening(terrain,b.along,b.plane,b.left,b.right,b.bottom,b.top,windowMasonry);
  if(!next.size)continue;
  for(const piece of pieces){
   const prior=cuts.get(piece);
   if(prior?.some(part=>next.has(part)))cuts.set(piece,prior.flatMap(part=>next.get(part)??[part]));
   else if(next.has(piece))cuts.set(piece,next.get(piece));
  }
 }
 if(lightingFrame)lightingFrame.apertureCuts=cuts;
 return cuts;
}
function windowApertureTerrain(){
 const cuts=windowApertureCuts();
 return cuts.size?pieces.flatMap(piece=>cuts.get(piece)??[piece]):pieces;
}
function resizeWindow(window,next,report=()=>{}){
 const reject=reason=>{report(reason);return null};
 const old=windowBounds(window),bounds=windowBounds(next),wall=windowWall(window);
 const {along,across,plane,left,right,bottom,top}=bounds;
 if(left<0||right>gridLimit(along)||bottom<0||top>maxHeight)return reject('The opening exceeds the scene bounds.');
 const wallTop=wall&&wall.z+dimensions(wall)[2];
 if(areas.some(other=>{
  if(other===window||other.shape!=='opening'||other.angle!==window.angle||Math.abs(other.origin[across]+.5-plane)>.05)return false;
  const half=(other.doorWidth??1)/2,center=other.origin[along]+.5,z=other.origin[2];
  const low=z+(other.kind==='Window'?windowBottom(other):0);
  const high=z+(other.kind==='Window'?windowTop(other):doorLeafHeight(other)+doorHeaderThickness);
  return left<center+half&&right>center-half&&bottom<high&&top>low;
 }))return reject('The opening overlaps another door or window.');
 // Preserve the existing gap when only the head moves upward. Carve the
 // visible masonry above it directly, even when jambs are segmented or absent.
 if(left===old.left&&right===old.right&&Math.abs(bottom-old.bottom)<=.101&&top>old.top){
  // Persist only quarter-grid masonry. The renderer and line-of-sight
  // use the exact saved sash height for the remaining fraction.
  const gridHead=Math.floor((top+1e-7)*4)/4;
  const oldHead=window.cutHeight?window.origin[2]+window.cutHeight:old.top;
  const cut=gridHead>oldHead?carveWallOpening(pieces,along,plane,left,right,oldHead,gridHead,windowMasonry):new Map();
  if(!cut.size)return pieces;
  const terrain=pieces.flatMap(piece=>cut.get(piece)??[piece]);
  if(tokens.some(token=>supported(token,pieces)&&!supported(token,terrain)))return reject('The masonry supports a standee. Move the standee before resizing.');
  if([...cut.values()].flat().some(piece=>![piece.x,piece.y,piece.z,...dimensions(piece)].every(n=>Math.abs(n*4-Math.round(n*4))<1e-7)))return pieces;
  if(window.cutHeight)next.cutHeight=gridHead-window.origin[2];
  return terrain;
 }
 if(!wall)return window.cutHeight?reject('The saved opening has no aligned wall at this location.'):pieces;
 // A jamb can be one short piece in a stack. Count the old gap and every
 // aligned masonry course instead of using the nearest jamb's height as a cap.
 const oldBottom=window.cutHeight?old.bottom:wall.z,oldTop=window.cutHeight?window.origin[2]+window.cutHeight:wallTop;
 const masonry=[[old.left,old.right,oldBottom,oldTop]];
 for(const piece of pieces){
  if(!windowMasonry(piece))continue;
  const position=[piece.x,piece.y],size=dimensions(piece);
  if(plane<position[across]-1e-7||plane>position[across]+size[across]+1e-7)continue;
  const start=position[along],end=start+size[along],low=piece.z,high=low+size[2];
  if(start<right&&end>left&&low<top&&high>bottom)masonry.push([start,end,low,high]);
 }
 masonry.sort((a,b)=>a[0]-b[0]);
 const levels=[bottom,...masonry.flatMap(([, ,low,high])=>[low,high]).filter(z=>z>bottom&&z<top)];
 for(const z of new Set(levels)){
  let reach=left;
  for(const [start,end,low,high] of masonry){
   if(start>reach+1e-7)break;
   if(z>=low-1e-7&&z<high-1e-7)reach=Math.max(reach,end);
  }
  if(reach<right-1e-7)return reject('The requested opening extends past the connected wall.');
 }
 // Refill the old gap before recutting, retaining the finish and thickness of the adjacent wall.
 const fill=wallOpeningBlock(wall,along,old.left,old.right,oldBottom,oldTop);
 let patch=[fill];
 for(const piece of pieces){
  if(!windowMasonry(piece))continue;
  const size=dimensions(piece),start=[piece.x,piece.y][along];
  const split=carveWallOpening(patch,along,plane,start,start+size[along],piece.z,piece.z+size[2],windowMasonry);
  if(plane>=[piece.x,piece.y][across]-1e-7&&plane<=[piece.x,piece.y][across]+size[across]+1e-7)patch=patch.flatMap(p=>split.get(p)??[p]);
 }
 const terrain=[...pieces,...patch],cut=carveWallOpening(terrain,along,plane,left,right,bottom,top,windowMasonry);
 const resized=terrain.flatMap(piece=>cut.get(piece)??[piece]);
 if(resized.some(piece=>!pieces.includes(piece)&&(![piece.x,piece.y,piece.z,...dimensions(piece)].every(n=>Number.isInteger(n*4))||
   !valid(piece,tokens,null,areas))))return null;
 if(tokens.some(token=>supported(token,pieces)&&!supported(token,resized)))return null;
 next.cutHeight=windowTop(next);
 return resized;
}
function addWindowFaces(window,placement){
 const [x,y,z]=window.origin,width=window.doorWidth??1,vertical=window.angle!==0;
 const bottom=windowBottom(window),height=windowTop(window)-bottom;
 if(!(width>0&&height>0))return;
 const frame=window.frameColor??'#594531',glass=window.glassTint??'#89b6c7',cover=window.coverColor??'#8b6546';
 const shuttered=window.shaded===true,stained=window.windowStyle==='stained';
 const profile=windowProfile(window,width,height);
 const trim=Math.min(.07,width/6,height/6);
 const world=placement?.world??((u,v,h)=>vertical?[x+.5+v,y+.5+u-width/2,z+bottom+h]:[x+.5+u-width/2,y+.5+v,z+bottom+h]);
 function emit(points,color,pane=false,swing=false){
  const radians=Math.PI/3;
  face(points.map(([u,h,v=0])=>swing?world(u*Math.cos(radians),v+u*Math.sin(radians),h):world(u,v,h)),color,placement?.owner??window,null,false);
  if(placement)placement.mark(pane);
  else Object.assign(faces.at(-1),{doorFace:true,windowPane:pane});
 }
 const paneColor=shuttered?cover:stained?(window.glassAccent??'#d4994f')+'c4':glass+'30';
 if(topDown){
  emit([[0,0,-.085],[width,0,-.085],[width,0,.085],[0,0,.085]],frame);
  if(!window.open||shuttered)emit([[trim,.01,-.06],[width-trim,.01,-.06],[width-trim,.01,.06],[trim,.01,.06]],paneColor,!shuttered);
  return;
 }
 const path=(left,right,fn)=>{
  const segments=window.windowTop&&window.windowTop!=='flat'?Math.max(1,Math.ceil(16*(right-left)/width)):1;
  return Array.from({length:segments+1},(_,i)=>{const u=left+(right-left)*i/segments;return [u,fn(u)]});
 };
 const rectangle=(left,right,low,high)=>[[left,low],[right,low],[right,high],[left,high]];
 emit(rectangle(0,width,0,trim),frame);
 for(const [left,right] of [[0,trim],[width-trim,width]])emit([[left,trim],[right,trim],...path(left,right,profile).reverse()],frame);
 emit([...path(trim,width-trim,u=>profile(u)-trim),...path(trim,width-trim,profile).reverse()],frame);
 const swung=window.open&&!shuttered&&(stained||placement);
 if(window.open&&!shuttered&&!swung)return;
 if(swung)emit([[trim,trim],[width-trim,trim],...path(trim,width-trim,u=>profile(u)-trim).reverse()],frame,false,true);
 const glaze=(points,color,pane)=>emit(points,color,pane,swung);
 const xs=shuttered?(window.windowCover==='shade'?[0,1]:[0,.5,1]):stained?[0,.14,.32,.68,.86,1]:window.windowStyle==='single'?[0,1]:[0,.5,1];
 const ys=shuttered?(window.windowCover==='shade'?[0,1]:[0,.25,.5,.75,1]):stained?[0,.16,.39,.61,.84,1]:window.windowStyle==='grid'?[0,.5,1]:[0,1];
 const palette=[glass+'70',(window.glassAccent??'#d4994f')+'c4',(window.glassSecondary??'#618b77')+'c4',(window.glassHighlight??'#934b41')+'c4'];
 for(let row=0;row<ys.length-1;row++)for(let col=0;col<xs.length-1;col++){
  const left=trim+xs[col]*(width-2*trim),right=trim+xs[col+1]*(width-2*trim);
  const level=(u,f)=>trim+(profile(u)-2*trim)*f;
  const index=row===0||row===ys.length-2?(col===1||col===4?3:1):col===0||col===xs.length-2?2:(row+col)%3===0?1:0;
  if(stained&&!shuttered&&row===2&&col===2){
   const center=(left+right)/2,low=ys[row],high=ys[row+1],middle=(low+high)/2;
   const west=[left,level(left,middle)],east=[right,level(right,middle)];
   const north=[center,level(center,high)],south=[center,level(center,low)];
   glaze([west,south,east,north],palette[1],true);
   glaze([[left,level(left,low)],south,west],palette[0],true);
   glaze([south,[right,level(right,low)],east],palette[2],true);
   glaze([east,[right,level(right,high)],north],palette[0],true);
   glaze([north,[left,level(left,high)],west],palette[2],true);
   continue;
  }
  glaze([...path(left,right,u=>level(u,ys[row])),...path(left,right,u=>level(u,ys[row+1])).reverse()],
   stained&&!shuttered?palette[index]:paneColor,!shuttered);
 }
}
function editWindow(window){
 const dialog=document.createElement('dialog'),form=document.createElement('form'),title=document.createElement('h2');
 dialog.className='form-dialog window-editor';title.textContent='Edit window';title.id='windowEditorTitle';
 dialog.setAttribute('aria-labelledby',title.id);form.append(title);
 let grab=null;
 title.onpointerdown=e=>{
  if(e.button!==0)return;
  const {left,top}=dialog.getBoundingClientRect();
  grab={x:e.clientX-left,y:e.clientY-top};
  title.setPointerCapture(e.pointerId);
 };
 title.onpointermove=e=>{
  if(!grab)return;
  const {width,height}=dialog.getBoundingClientRect();
  dialog.style.margin='0';dialog.style.inset='auto';
  dialog.style.left=Math.max(0,Math.min(innerWidth-width,e.clientX-grab.x))+'px';
  dialog.style.top=Math.max(0,Math.min(innerHeight-height,e.clientY-grab.y))+'px';
 };
 title.onlostpointercapture=()=>{grab=null};
 const controls={};
 function field(key,label,options,fallback){
  const row=document.createElement('label'),input=document.createElement(options?'select':'input');
  if(options)for(const [value,name] of options)input.add(new Option(name,value));else input.type='color';
  input.value=window[key]??fallback;controls[key]=input;row.append(label,input);form.append(row);
 }
 function measure(label,value,max){
  const row=document.createElement('label'),input=document.createElement('input');
  input.type='number';input.required=true;input.min=1.25;input.max=max;input.step='any';
  input.value=Number((value*5).toFixed(2));row.append(label,input);form.append(row);
  return input;
 }
 const width=measure('Width (ft)',window.doorWidth??1,gridLimit(window.angle===0?0:1)*5);
 const height=measure('Height (ft)',windowTop(window)-windowBottom(window),(maxHeight-window.origin[2]-windowBottom(window))*5);
 field('windowTop','Top profile',[['flat','Flat'],['semicircle','Semicircular'],['pointed','Pointed arch']],'flat');
 field('windowStyle','Pane style',[['single','Single pane'],['split','Two panes'],['grid','Four panes'],['stained','Geometric stained glass']],'split');
 field('frameColor','Frame color',null,'#594531');
 field('glassTint','Glass tint',null,'#89b6c7');
 field('glassAccent','Accent glass',null,'#d4994f');
 field('glassSecondary','Border glass',null,'#618b77');
 field('glassHighlight','Highlight glass',null,'#934b41');
 const updatePalette=()=>{
  for(const key of ['glassAccent','glassSecondary','glassHighlight'])controls[key].parentElement.style.display=controls.windowStyle.value==='stained'?'':'none';
 };
 controls.windowStyle.onchange=updatePalette;updatePalette();
 field('windowCover','Shade style',[['shutter','Wooden shutters'],['shade','Roll-down shade']],'shutter');
 field('coverColor','Cover color',null,'#8b6546');
 const actions=document.createElement('div'),apply=document.createElement('button');
 actions.className='dialog-actions';apply.textContent='Apply';apply.type='submit';
 actions.append(catalogButton('Cancel',()=>dialog.close()),apply);form.append(actions);
 const error=document.createElement('p');error.setAttribute('role','alert');error.style.cssText='grid-column:1/-1;margin:0;color:#ffcf83';form.append(error);
 function draft(){
  if(!width.validity.valid||!height.validity.valid)return {error:'Enter a positive width and height within the scene bounds.'};
  const next={...window,...Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.value]))};
  const before=windowBounds(window),oldHeight=before.top-before.bottom;
  const widthChanged=Math.abs(width.valueAsNumber/5-before.width)>.001;
  const heightChanged=Math.abs(height.valueAsNumber/5-oldHeight)>.001;
  const raiseHead=heightChanged&&!widthChanged&&height.valueAsNumber/5>oldHeight;
  let terrain=pieces;
  if(widthChanged||heightChanged){
   const attached=window.cutHeight||windowWall(window);
   const step=value=>Math.round(value/1.25)/4;
   next.doorWidth=widthChanged?(attached?step(width.valueAsNumber):width.valueAsNumber/5):before.width;
   next.windowHeight=heightChanged?(attached&&!raiseHead?step(height.valueAsNumber):height.valueAsNumber/5):oldHeight;
   if(attached){
    next.sillHeight=raiseHead||window.cutHeight?windowBottom(window):Math.round(windowBottom(window)*4)/4;
    if(!raiseHead)next.windowHeight=Math.round((next.origin[2]+next.sillHeight+next.windowHeight)*4)/4-next.origin[2]-next.sillHeight;
    if(widthChanged){
     const left=Math.round((before.center-next.doorWidth/2)*4)/4;
     next.origin=[...window.origin];next.origin[before.along]=left+next.doorWidth/2-.5;
    }
   }
  }
  const after=windowBounds(next);
  if(next.windowTop==='semicircle'&&after.top-after.bottom<after.width/2){
   return {error:'A semicircular top needs a height of at least half the width.'};
  }
  if(widthChanged||heightChanged){
   let reason;
   terrain=resizeWindow(window,next,error=>{reason=error});
   if(!terrain)return {error:reason??'The wall cut could not be made at that size.'};
  }
  return {next,terrain};
 }
 let previewFrame=0;
 function preview(){
  previewFrame=0;
  updatePalette();
  const result=draft();
  const actual=result.next&&windowBounds(result.next);
  const actualHeight=actual&&actual.top-actual.bottom;
  const snapped=actual&&(Math.abs(actual.width*5-width.valueAsNumber)>.01||Math.abs(actualHeight*5-height.valueAsNumber)>.01);
  error.textContent=result.error??(snapped?'Wall-grid size: '+Number((actual.width*5).toFixed(2))+' × '+Number((actualHeight*5).toFixed(2))+' ft.':'');
  apply.disabled=!!result.error;
  if(!result.error)windowPreview={source:window,window:{...result.next,shaded:shade.checked},terrain:result.terrain};
  draw('Window preview');
 }
 const shadeLabel=document.createElement('label'),shade=document.createElement('input');
 shade.type='checkbox';shade.checked=window.shaded===true;shadeLabel.append('Preview with shade lowered',shade);
 form.insertBefore(shadeLabel,actions);
 form.oninput=form.onchange=()=>{if(!previewFrame)previewFrame=requestAnimationFrame(preview)};
 form.onsubmit=e=>{
  e.preventDefault();
  if(!areas.includes(window)||playing||roomProfile?.gm===false)return;
  if(terrainLocked){error.textContent='Unlock terrain before applying window changes.';return;}
  const {next,terrain,error:issue}=draft();
  if(issue){error.textContent=issue;return;}
  windowPreview=null;
  remember();pieces=terrain;
  if(selected&&!pieces.includes(selected))selected=null;
  for(const piece of group)if(!pieces.includes(piece))group.delete(piece);
  const {open,shaded}=window;
  Object.assign(window,next,{open,shaded});
  dialog.close();refresh();
  message('Window saved at '+Number(((windowTop(window)-windowBottom(window))*5).toFixed(2))+' ft tall.');
 };
 dialog.onclose=()=>{
  cancelAnimationFrame(previewFrame);dialog.remove();
  if(windowPreview?.source===window){windowPreview=null;draw('Window preview closed')}
 };
 dialog.append(form);document.body.append(dialog);dialog.showModal();preview();
}
const doorHeaderThickness=.1;
function fitDoorToJambs(door){
 const normal=door.angle===0?1:0,along=1-normal;
 const center=door.origin[along]+.5,z=door.origin[2];
 const reach=(door.doorWidth??1)/2+1;
 // Some generated scenes store the wall center directly in the door origin.
 for(const plane of [door.origin[normal]+.5,door.origin[normal]]){
  let left=-Infinity,right=Infinity,leftJamb,rightJamb;
  for(const piece of pieces){
   if(piece.type!=='wall'&&!wallVolume(piece))continue;
   const position=[piece.x,piece.y],size=dimensions(piece);
   const low=position[normal],high=low+size[normal];
   if(plane<=low||plane>=high||piece.z>z||piece.z+size[2]<z+1)continue;
   const start=position[along],end=start+size[along];
   if(start<center&&end>center){left=Infinity;break}
   if(end<=center&&end>left){left=end;leftJamb=[low,high]}
   if(start>=center&&start<right){right=start;rightJamb=[low,high]}
  }
  if(!Number.isFinite(left)||!Number.isFinite(right)||right-left<.25)continue;
  if(Math.min(center-left,right-center)>reach)continue;
  const origin=[...door.origin];
  origin[along]=(left+right)/2-.5;
  origin[normal]=(Math.max(leftJamb[0],rightJamb[0])+Math.min(leftJamb[1],rightJamb[1]))/2-.5;
  if(right-left!==door.doorWidth||origin.some((value,i)=>value!==door.origin[i]))Object.assign(door,{origin,doorWidth:right-left});
  return;
 }
}
function doorLeafHeight(door){
 const normal=door.angle===0?1:0,along=1-normal;
 const plane=door.origin[normal]+.5,center=door.origin[along]+.5,z=door.origin[2];
 const half=(door.doorWidth??1)/2;
 let left=z,right=z,lintel=Infinity;
 for(const piece of pieces){
  if(piece.type!=='wall'&&(piece.type!=='volume'||piece.form||piece.stairTread))continue;
  const position=[piece.x,piece.y],size=dimensions(piece);
  if(plane<=position[normal]||plane>=position[normal]+size[normal])continue;
  const top=piece.z+size[2];
  if(piece.z>z+1e-8){
   if(position[along]<center+half&&position[along]+size[along]>center-half)lintel=Math.min(lintel,piece.z);
   continue;
  }
  if(top<=z)continue;
  if(Math.abs(position[along]+size[along]-(center-half))<.01)left=Math.max(left,top);
  if(Math.abs(position[along]-(center+half))<.01)right=Math.max(right,top);
 }
 const wallHeight=Math.min(left,right,lintel)-z;
 return wallHeight>doorHeaderThickness?wallHeight-doorHeaderThickness:(door.cutHeight??1.35)-doorHeaderThickness;
}
const doorDetailOptions={
 paneling:['Plain','Vertical planks','Two recessed panels','Four recessed panels'],
 handle:['None','Round knob','Lever','Pull ring'],
 knocker:['None','Iron ring','Diamond plate'],
 kickplate:['None','Brass','Iron'],
 upperWindow:['None','Square','Half-moon']
};
function editDoorDetails(door){
 const dialog=document.createElement('dialog'),form=document.createElement('form');
 dialog.className='form-dialog';
 const title=document.createElement('h2');title.textContent='Door details';form.append(title);
 const controls={};
 for(const [key,label] of Object.entries({paneling:'Paneling',handle:'Handle',knocker:'Knocker',kickplate:'Kickplate',upperWindow:'Upper window'})){
  const row=document.createElement('label'),select=document.createElement('select');
  for(const option of doorDetailOptions[key])select.add(new Option(option,option));
  select.value=door.details?.[key]??doorDetailOptions[key][0];
  row.append(label,select);form.append(row);controls[key]=select;
 }
 const styleRow=document.createElement('label'),doorStyle=document.createElement('select');
 for(const [value,label] of [['single','Single door'],['double','Double door — opposite hinges, center latch']])doorStyle.add(new Option(label,value));
 doorStyle.value=door.doorStyle??'single';styleRow.append('Door style',doorStyle);form.append(styleRow);
 const sizeRow=document.createElement('label'),doorSize=document.createElement('select');
 for(const size of standeeSizes)doorSize.add(new Option(size.name+' · '+size.footprint+'×'+size.footprint,size.id));
 doorSize.value=door.doorSize??'medium';
 sizeRow.append('Opening size',doorSize);form.append(sizeRow);
 const save=document.createElement('button');save.textContent='Apply';
 form.append(catalogButton('Cancel',()=>dialog.close()),save);
 form.onsubmit=e=>{
  e.preventDefault();
  if(areas.includes(door)&&roomProfile?.gm!==false){
   remember();door.doorStyle=doorStyle.value;door.doorSize=doorSize.value;door.details=Object.fromEntries(Object.entries(controls).map(([key,select])=>[key,select.value]));refresh();
  }
  dialog.close();
 };
 dialog.append(form);dialog.onclose=()=>dialog.remove();
 document.body.append(dialog);dialog.showModal();
}
function paintDoorDetails(f){
 const {paneling,handle,knocker,kickplate,upperWindow}=f.p.details;
 const [a,b,,d]=f.projected,reverse=f.doorDetailReverse;
 const project=([u,v])=>{
  if(reverse)u=1-u;
  return [a[0]+(b[0]-a[0])*u+(d[0]-a[0])*v,a[1]+(b[1]-a[1])*u+(d[1]-a[1])*v];
 };
 const shape=(points,fill,stroke)=>polygon(points.map(project),fill,stroke);
 const rect=(x,y,w,h,fill,stroke)=>shape([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill,stroke);
 const ring=(x,y,rx,ry,fill,stroke)=>shape(Array.from({length:16},(_,i)=>{
  const angle=i*Math.PI/8;return [x+rx*Math.cos(angle),y+ry*Math.sin(angle)];
 }),fill,stroke);
 const trim='#493223',metal='#dbb473';
 if(f.pathOpening)for(const y of [.18,.74])rect(.012,y,.075,.055,'#776551',trim);
 if(paneling==='Vertical planks')for(const x of [.2,.4,.6,.8])rect(x,.025,.012,.95,trim);
 if(paneling==='Two recessed panels'||paneling==='Four recessed panels'){
  const columns=paneling==='Four recessed panels'?[[.12,.32],[.56,.32]]:[[.14,.72]];
  for(const [x,w] of columns)for(const y of [.14,.54])rect(x,y,w,.32,'#2d201738',trim);
 }
 if(kickplate&&kickplate!=='None')rect(.035,.025,.93,.115,kickplate==='Brass'?'#a58046':'#69696a',trim);
 if(upperWindow==='Square')rect(.28,.69,.44,.22,'#7897a1','#342c24');
 if(upperWindow==='Half-moon')shape(Array.from({length:17},(_,i)=>{
  const angle=i*Math.PI/16;return [.5+.24*Math.cos(angle),.71+.18*Math.sin(angle)];
 }),'#7897a1','#342c24');
 if(handle==='Round knob')ring(.84,.48,.053,.025,metal,trim);
 if(handle==='Lever'){ring(.84,.48,.038,.02,metal,trim);rect(.69,.47,.15,.02,metal,trim)}
 if(handle==='Pull ring')ring(.84,.46,.042,.035,'#0000',metal);
 if(knocker==='Iron ring')ring(.5,.57,.065,.045,'#0000','#b5aba0');
 if(knocker==='Diamond plate')shape([[.5,.64],[.57,.59],[.5,.54],[.43,.59]],metal,trim);
}
function addDoorFaces(){
 for(const door of visionObjects()){
  if(hiddenByCutaway(door))continue;
  if(!['Door','Window'].includes(door.kind)||door.secret&&(roomProfile&&!roomProfile.gm||playing&&!roomProfile?.gm))continue;
  if(door.kind==='Window'){addWindowFaces(door);continue;}
  const [x,y,z]=door.origin,vertical=door.angle!==0,reverse=door.hinge==='far';
  const [front,edge,top,thickness]=Object.hasOwn(doorMaterials,door.material)?doorMaterials[door.material]:doorMaterials.Wood;
  const width=door.doorWidth??1,offset=(1-width)/2;
  const leafHeight=doorLeafHeight(door),frameHeight=leafHeight+doorHeaderThickness;
  const emit=(points,color)=>{
   face(points,color,door,null,false);
   const surface=faces.at(-1);
   surface.doorFace=true;
   if(!door.open)setDoorFaceLighting(surface,[x+.5,y+.5],vertical?[1,0]:[0,1],.515);
  };
  for(const [start,leafWidth,fromRight] of door.doorStyle==='double'?[[0,width/2,false],[width/2,width/2,true]]:[[0,width,reverse]]){
   const hinge=vertical?[x+.5,y+offset+start+(fromRight?leafWidth:0)]:[x+offset+start+(fromRight?leafWidth:0),y+.5];
   const direction=fromRight?-1:1,swing=door.swingReversed?-1:1;
   const [dx,dy]=door.open?(vertical?[swing,0]:[0,swing]):vertical?[0,direction]:[direction,0];
   const bottom=[[0,-1],[1,-1],[1,1],[0,1]].map(([u,v])=>[
    hinge[0]+u*leafWidth*dx-v*dy*thickness/2,hinge[1]+u*leafWidth*dy+v*dx*thickness/2,z
   ]);
   const upper=bottom.map(([px,py])=>[px,py,z+leafHeight]);
   if(!topDown)for(let i=0;i<4;i++){
    const j=(i+1)%4;emit([bottom[i],bottom[j],upper[j],upper[i]],i%2?edge:front);
    if(i%2===0)faces.at(-1).doorDetailReverse=i===2;
   }
   emit(upper,top);
  }
  const frame=(u,v,w)=>vertical?[x+.5+v,y+offset+u,z+w]:[x+offset+u,y+.5+v,z+w];
  for(const [left,right,base,height] of [[-.075,0,0,frameHeight],[width,width+.075,0,frameHeight],[-.075,width+.075,leafHeight,frameHeight]]){
   const corners=[[left,-.095],[right,-.095],[right,.095],[left,.095]];
   const cap=corners.map(([u,v])=>frame(u,v,height));
   if(!topDown)for(let i=0;i<4;i++){
    const j=(i+1)%4;
    emit([frame(...corners[i],base),frame(...corners[j],base),cap[j],cap[i]],'#554333');
   }
   emit(cap,'#79604a');
  }
 }
}
function createMapHandle(){
 const button=document.createElement('button');
 button.type='button';button.dataset.mapHandle='';
 button.style.cssText='position:absolute;pointer-events:auto;transform:translate(-50%,-50%);padding:2px 6px;font-size:11px';
 visionMarkers.append(button);
 return button;
}
let mapHandlePointer=null,hoveredMapHandle=null;
function objectHandlesBlocked(){return !!(carry||moveConfirmPending)}
function updateObjectHandleHover(){
 visionMarkers.toggleAttribute('data-handles-blocked',objectHandlesBlocked());
 let next=null;
 if(mapHandlePointer&&!objectHandlesBlocked()&&!drag&&!zoomTransformActive){
  const [x,y]=coords(mapHandlePointer);
  const handles=[...visionMarkers.querySelectorAll('[data-hover-handle]:not([hidden])')];
  const target=mapHandlePointer.target;
  if(handles.includes(target)&&target.matches(':hover'))next=target;
  else if(handles.length){
   const face=hit(x,y,null,false,null,true);
   next=handles.find(button=>face?.pathOpening?button.pathOpening===face.pathOpening:
    (face?.fixtureFace||face?.doorFace)&&button.visionObject===face.p);
   if(!next){
    // Open apertures and marker-only lights have no face at their anchor.
    let nearest=Infinity;
    for(const button of handles){
     if(!button.hoverAnchor||face?.standee||face?.fixtureFace||face?.doorFace)continue;
     const [sx,sy,depth]=button.hoverAnchor;
     if(!topDown&&face?.p&&!face.wallId&&face.depth>depth+.12)continue;
     const distance=Math.hypot(x-sx,y-sy);
     if(distance<=Math.max(10,Math.min(18,S*.35))&&distance<nearest){
      next=button;nearest=distance;
     }
    }
   }
  }
 }
 if(hoveredMapHandle!==next){
  hoveredMapHandle?.removeAttribute('data-hovered');
  next?.setAttribute('data-hovered','');
  hoveredMapHandle=next??null;
 }
 if(objectHandlesBlocked())visionMarkers.querySelector('[data-vision-actions]')?.remove();
}
for(const type of ['pointerover','pointermove','pointerdown','pointerup'])canvas.parentElement.addEventListener(type,event=>{
 mapHandlePointer=event;updateObjectHandleHover();
});
canvas.parentElement.addEventListener('pointerleave',()=>{
 mapHandlePointer=null;updateObjectHandleHover();
});
function drawPathObjectHandles(standeeReadouts){
 const existing=new Map([...visionMarkers.children].filter(node=>node.dataset.pathHandle).map(node=>[node.dataset.pathHandle,node]));
 const place=(id,world,label,caption,action,opening=null,nearby=false)=>{
  const anchor=point(...world),[x,y]=anchor;
  if(x<0||x>W||y<0||y>H||!playing&&standeeReadouts.some(([l,t,r,b])=>x>=l-10&&x<=r+10&&y>=t-10&&y<=b+10))return;
  const button=existing.get(id)??createMapHandle();
  existing.delete(id);button.dataset.pathHandle=id;
  button.toggleAttribute('data-hover-handle',!!opening&&!nearby);
  button.toggleAttribute('data-reachable-door',nearby);
  button.pathOpening=opening;button.hoverAnchor=opening?.open||topDown||nearby?anchor:null;
  const left=x+'px',top=y+'px';
  if(button.style.left!==left)button.style.left=left;
  if(button.style.top!==top)button.style.top=top;
  if(button.textContent!==caption)button.textContent=caption;
  if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  if(button.title!==label)button.title=label;
  const activate=()=>{if(!opening||!objectHandlesBlocked())action()};
  button.onclick=activate;
  button.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();activate()};
  button.onkeydown=event=>{if(event.shiftKey&&event.key==='F10'){event.preventDefault();activate()}};
 };
 if((playing?true:!carry&&!drag&&wallCanEdit())&&(!wallTool||['edit','view','inspect'].includes(wallTool.mode))){
  for(const [index,wall] of sceneWallPaths().entries()){
   const path=compileWallPath(wall),middle=sampleWall(path,path.length/2);
   if(!playing)place(wall.id+':wall',[...middle,wall.z+wall.height+.18],'Edit wall '+(index+1),'▰',()=>{
    wallSelection.clear();wallSelection.add(wall.id);wallOpeningIndex=-1;setWallTool('edit');
   });
   for(const [index,{opening,start,end}] of path.openings.entries()){
    const anchor=sampleWall(path,(start+end)/2),door=opening.kind==='Door';
    const z=topDown?wall.z:wall.z+opening.sill+opening.height*.55;
    const label=playing?(door?(opening.open?'Close door':'Open door'):(opening.shaded?'Open window cover':'Close window cover')):'Edit '+opening.kind.toLowerCase();
    // Only expose path-wall door controls to a player when the door borders
    // their occupied topology region and is visible to their camera.
    const nearby=roomProfile?.gm===false&&door&&playerCanReachDoor([...anchor,wall.z+opening.sill],1);
    if(playing&&!roomProfile?.gm){
     if(!door||opening.secret)continue;
     const topology=wallVisibilityTopology();
     const portal=topology.portals?.find(p=>p.wallId===wall.id&&p.kind==='Door'&&
      Math.hypot(p.center[0]-anchor[0],p.center[1]-anchor[1])<.35);
     const ownRegions=new Set(prepareFogObservers().observers.map(o=>topology.regionAt?.(o.distance)));
     if(!nearby&&!portal?.regions?.some(region=>region!==null&&ownRegions.has(region)))continue;
     if(!nearby&&!cameraHandleTest(visionBlockers())([...anchor,z]))continue;
    }
    place(wall.id+':opening:'+index,[...anchor,z],label,door?(opening.open?'◯':'▣'):'▦',()=>{
     const current=sceneWallPaths().find(pathWall=>pathWall.id===wall.id);
     const currentOpening=current&&compileWallPath(current).openings[index]?.opening;
     if(!currentOpening)return;
     if(playing&&roomProfile&&!roomProfile.gm){
      void togglePlayerPathDoor(current,currentOpening);
     }else if(playing)togglePathOpening(current,currentOpening,door?'open':'shaded');
     else editPathOpening(current,currentOpening);
    },opening,nearby);
   }
  }
 }
 for(const button of existing.values())button.remove();
}
let lastMapHandleLayout=null;
function handleBlockerKey(blockers){
 return blockers.map(bounds=>[bounds,bounds.terrain?.terrainYaw,bounds.wallPrism?.axes,bounds.wallPrism?.spans]);
}
function updateMapHandleLayer(blockers,standeeReadouts){
 const objects=visionObjects();
 const key=playing?JSON.stringify([currentSceneId,roomProfile?.gm,W,H,S,angle,tilt,topDown,panX,panY,
  String(cutawayHeight),visionTool,objects,sceneWallPaths(),roomProfile?.gm===false?
  [handleBlockerKey(blockers),tokens.filter(ownsRoomStandee).map(t=>[basePoint(t),t.size,t.incognito,t.conditions?.includes('dead')])]:null]):null;
 if(key!==null&&key===lastMapHandleLayout){
  // A scene snapshot may replace object references even if its fixtures are identical.
  const live=new Map(objects.filter(object=>object.roomId).map(object=>[object.roomId,object]));
  for(const node of visionMarkers.children){
   const id=node.visionObject?.roomId;
   if(id&&live.has(id)&&node.visionObject!==live.get(id))node.visionObject=live.get(id);
   if(node.pathOpening){
    const [,wallId,index]=node.dataset.pathHandle.match(/^(.*):opening:(\d+)$/)??[];
    const wall=sceneWallPaths().find(item=>item.id===wallId);
    if(wall)node.pathOpening=compileWallPath(wall).openings[index]?.opening;
   }
  }
  return;
 }
 drawVisionObjects(blockers,standeeReadouts);
 lastMapHandleLayout=key;
}
let cameraHandleVisibility=null;
function cameraHandleTest(blockers){
 blockers=blockers.filter(bounds=>!bounds.piece||!(
  playerCameraCutaway?.terrain.has(bounds.piece)||!topDown&&focusCutaway?.terrain.has(bounds.piece)));
 const key=JSON.stringify([currentSceneId,topDown,angle,tilt,String(cutawayHeight),
  handleBlockerKey(blockers)]);
 if(cameraHandleVisibility?.key!==key)cameraHandleVisibility={key,results:new Map()};
 const {results}=cameraHandleVisibility;
 const direction=topDown?[0,0,1]:[D*Math.cos(tilt),C*Math.cos(tilt),Math.sin(tilt)];
 return anchor=>{
  const id=anchor.join(',');
  if(results.has(id))return results.get(id);
  const end=anchor.map((value,index)=>value+direction[index]*200);
  const visible=!blockers.some(bounds=>{
   if(bounds[2][0]>=cutawayHeight)return false;
   const path=bounds.terrain?turnTerrainPoints([anchor,end],bounds.terrain,-bounds.terrain.terrainYaw):[anchor,end];
   const hit=bounds.wallPrism?wallPrismInterval(bounds.wallPrism,anchor,end):movementInterval(...path,bounds);
   // An opening or sconce mounted in its own wall must keep its handle.
   return hit&&hit[0]>.0025;
  });
  if(results.size<1500)results.set(id,visible);
  return visible;
 };
}
// Player door controls are limited to the observer's current authored-wall
// region. Never use camera visibility alone to reveal another room's doors.
function playerDoorInOccupiedRoom(object){
 const topology=wallVisibilityTopology();
 if(typeof topology?.regionAt!=='function')return false;
 const observers=prepareFogObservers().observers;
 if(!observers.length)return false;
 const [x,y,z]=object.origin;
 const doorPoint=[x+.5,y+.5,z];
 const doorRegion=topology.regionAt(doorPoint);
 if(doorRegion===null||doorRegion===undefined)return false;
 return observers.some(observer=>{
  if(Math.abs(observer.distance[2]-z)>1.5)return false;
  const own=topology.regionAt(observer.distance);
  return own!==null&&own!==undefined&&own===doorRegion;
 });
}
function drawVisionObjects(blockers,standeeReadouts){
 const player=roomProfile?.gm===false;
 const cameraVisible=player?cameraHandleTest(blockers):null;
 const objects=visionObjects().filter(a=>!player||!a.secret&&(a.shape==='light'||a.shape==='opening'&&(a.kind==='Door'||a.kind==='Window')));
 const active=new Set(),byObject=new Map(),byId=new Map();
 for(const node of visionMarkers.children)if(node.visionObject){
  byObject.set(node.visionObject,node);
  if(node.visionObject.roomId)byId.set(node.visionObject.roomId,node);
 }
 for(const object of objects){
  if(hiddenByCutaway(object))continue;
  if(object.shape==='room'){
   if(player)continue;
   const [x,y,z]=object.origin;
   if(visionRoomsShown&&visionTool==='room')polygon([[x,y],[x+object.size,y],[x+object.size,y+object.depth],[x,y+object.depth]].map(([a,b])=>point(a,b,z)),playing?'#0000':'#6db1dc20','#8ec6de');
   if(!visionRoomsShown||visionTool!=='room')continue;
  }
  if(playing&&object.secret&&!roomProfile?.gm)continue;
  const [x,y,z]=object.origin;
  const anchor=[x+(object.shape==='room'?object.size/2:.5),y+(object.shape==='room'?object.depth/2:.5),z+fixtureElevation(object)];
  const projected=point(...anchor),[sx,sy]=projected;
  const doorInReach=player&&nearbyPlayerDoor(object,1);
  if(player&&(sx<0||sx>W||sy<0||sy>H||!doorInReach&&!cameraVisible(anchor)))continue;
  if(player&&object.kind==='Door'&&!doorInReach&&!playerDoorInOccupiedRoom(object))continue;
  let button=byObject.get(object)??(object.roomId?byId.get(object.roomId):null);
  if(!button){
   button=createMapHandle();
   button.onclick=e=>{
    const object=button.visionObject;
    if(object.shape!=='room'&&objectHandlesBlocked())return;
    if(spellPlacement?.spell==='arcane_eye'){placeStandeeSpell(e);return}
    if(cameraFocusHeld&&e.detail){cameraFocusUsed=true;focusMapObject(object);return}
    openVisionActions(object,button,false);
   };
   button.oncontextmenu=e=>{e.preventDefault();openVisionActions(button.visionObject,button,true)};
   button.onkeydown=e=>{if(e.shiftKey&&e.key==='F10' ){e.preventDefault();openVisionActions(button.visionObject,button,true)}};
  }
  button.visionObject=object;
  button.toggleAttribute('data-hover-handle',object.shape!=='room'&&!doorInReach);
  button.toggleAttribute('data-reachable-door',doorInReach);
  const isPlayerDoor=player&&object.kind==='Door';
  button.toggleAttribute('data-player-door',isPlayerDoor);
  if(isPlayerDoor){
   button.style.background='rgba(24,36,43,.88)';
   button.style.color='#ffe4a0';
   button.style.border='1px solid #e5b95b';
   button.style.borderRadius='7px';
   button.style.boxShadow='0 0 0 2px rgba(0,0,0,.45)';
   button.style.fontWeight='700';
   button.style.fontSize='15px';
   button.style.padding='4px 8px';
  }else if(button.hasAttribute('data-player-door-style')){
   for(const key of ['background','color','border','borderRadius','boxShadow','fontWeight','fontSize','padding'])button.style[key]='';
  }
  button.toggleAttribute('data-player-door-style',isPlayerDoor);
  button.hoverAnchor=object.shape==='light'?(!object.fixture&&!object.dropped?projected:null):
   (object.open||topDown||doorInReach?projected:null);
  active.add(button);
  const left=sx+'px',top=sy+'px';
  if(button.style.left!==left)button.style.left=left;
  if(button.style.top!==top)button.style.top=top;
  const label=object.dropped?(object.on?'🔥 Dropped light':'◈ Dropped light'):object.fixture?fixtureType(object)[0]+(object.on?' · on':' · off'):object.shape==='room'?(object.dark?'Dark room':'Room') : object.kind==='Door'?(object.open?'Open door':'Closed door'):object.kind||(object.on?'Light on':'Light off');
  button.classList.toggle('spell-light-target',object.fixture==='spellLight');
  if(object.fixture==='spellLight')button.style.setProperty('--spell-target',Math.max(26,S*.86)+'px');
  const caption=isPlayerDoor?(object.open?'◯':'▣'):object.fixture==='spellLight'?'':player||playing?(object.shape==='light'?'✦':object.kind==='Window'?'▦':'▯'):object.shape==='room'&&!object.dark?'◈':label;
  if(button.textContent!==caption)button.textContent=caption;
  if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  let hidden=!!visionTool&&object.shape!=='room';
  if(!playing&&!player&&!hidden&&standeeReadouts.length){
   // A control hidden by a readout has zero layout size; retain its last measured dimensions.
   const width=button.offsetWidth||button.handleWidth||0,height=button.offsetHeight||button.handleHeight||0;
   if(width)button.handleWidth=width;
   if(height)button.handleHeight=height;
   hidden=standeeReadouts.some(([left,top,right,bottom])=>
    sx+width/2>left&&sx-width/2<right&&sy+height/2>top&&sy-height/2<bottom);
  }
  if(button.hidden!==hidden)button.hidden=hidden;
 }
 for(const node of visionMarkers.children)if(node.visionObject&&!active.has(node))node.remove();
 drawPathObjectHandles(standeeReadouts);
}
function editRoomFinish(room){
 const dialog=document.createElement('dialog'),form=document.createElement('form'),heading=document.createElement('h2');
 dialog.className='form-dialog';heading.textContent='Room lighting and flooring';form.append(heading);
 const lighting=document.createElement('select'),pattern=document.createElement('select');
 lighting.add(new Option('Normal light','normal'));lighting.add(new Option('Dark','dark'));lighting.value=room.dark?'dark':'normal';
 pattern.add(new Option('Scene default',''));for(const [id,label] of Object.entries(roomFloorPatterns))pattern.add(new Option(label,id));
 pattern.value=room.floorFinish?.pattern??'';
 const base=document.createElement('input'),accent=document.createElement('input');
 base.type=accent.type='color';base.value=room.floorFinish?.base??'#b19369';accent.value=room.floorFinish?.accent??'#65513c';
 for(const [label,input] of [['Lighting',lighting],['Floor pattern',pattern],['Floor color',base],['Grain or grout color',accent]]){
  const row=document.createElement('label');row.append(label,input);form.append(row);
 }
 const actions=document.createElement('div'),apply=document.createElement('button');
 actions.className='dialog-actions';apply.textContent='Apply';
 actions.append(catalogButton('Cancel',()=>dialog.close()),apply);form.append(actions);
 form.onsubmit=e=>{
  e.preventDefault();
  if(playing||roomProfile?.gm===false||!areas.includes(room))return;
  remember();room.dark=lighting.value==='dark';
  if(pattern.value)room.floorFinish={pattern:pattern.value,base:base.value,accent:accent.value};else delete room.floorFinish;
  dialog.close();refresh();
 };
 dialog.onclose=()=>dialog.remove();dialog.append(form);document.body.append(dialog);dialog.showModal();
}
function openVisionActions(object,button,admin){
 if(object.shape!=='room'&&objectHandlesBlocked())return;
 visionMarkers.querySelector('[data-vision-actions]')?.remove();
 const strip=document.createElement('div');strip.dataset.visionActions='';
 strip.style.cssText='position:absolute;pointer-events:auto;display:flex;gap:4px;background:#222c26;padding:5px;border-radius:6px';
 strip.style.left=button.style.left;strip.style.top='calc('+button.style.top+' + 16px)';
 if(object.kind==='Window'){
  Object.assign(strip.style,{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',
   width:'min(20rem, calc(100% - 10px))',boxSizing:'border-box'});
  const fit=()=>{
   if(!strip.isConnected)return;
   const left=parseFloat(button.style.left),top=parseFloat(button.style.top);
   strip.style.left=Math.max(0,Math.min(left,visionMarkers.clientWidth-strip.offsetWidth))+'px';
   strip.style.top=Math.max(0,Math.min(top+16,visionMarkers.clientHeight-strip.offsetHeight))+'px';
  };
  requestAnimationFrame(fit);
 }
 const close=()=>{strip.remove();button.focus()};
 const add=(label,action)=>strip.append(catalogButton(label,()=>{remember();action();close();refresh()}));
 if(roomProfile&&!roomProfile.gm){
  if(object.kind==='Window'&&object.shaded)strip.append(document.createTextNode('Shaded'));
  if(roomState.paused||object.locked)strip.append(document.createTextNode(roomState.paused?'Scene paused':'Locked'));
  else if(!object.spellOwner)strip.append(catalogButton(object.shape==='light'?(object.on?'Extinguish':'Light'):object.kind==='Window'?(object.open?'Close window':'Open window'):(object.open?'Close':'Open'),async e=>{
   e.currentTarget.disabled=true;
   try{
    if(object.shape==='light')await customizeRoomObject(object,'light',!object.on);
    else await roomRpc('opening',{ticket:roomProfile.token,opening_id:object.roomId,desired_open:!object.open,expected_revision:roomRevision});
    close();await pollRoom();
   }catch(err){message(err.message);close();await pollRoom()}
  }));
  if(object.shape==='light'&&object.fixture!=='chandelier'&&!wallMountedLight(object)&&!object.locked&&!roomState.paused&&(!object.spellOwner||object.spellOwner===roomProfile.name)){
   strip.append(catalogButton(object.spellOwner?'Move spell light':'Move / throw',()=>{
    close();const [x,y,z]=object.origin;
    const piece={type:'standee',name:'Dropped light',icon:'🔥',color:'#ffcc80',size:1,x,y,z,roomId:object.roomId,controllerNames:[roomProfile.name]};
    carry={piece,light:object,dx:0,dy:0,previousRoute:route};ghost={...piece};
    route={points:[basePoint(piece)],end:basePoint(piece)};
    message('Aim the light, then click to pause or press Enter to confirm.');draw();
   }));

   const [x,y,z]=object.origin;
   const nearby=tokens.filter(t=>ownsRoomStandee(t)&&!t.torch&&!t.carriedDrop&&!standeeHidden(t)&&!t.conditions?.includes('dead')&&
    Math.abs(t.x+t.size/2-x-.5)<=1.5&&Math.abs(t.y+t.size/2-y-.5)<=1.5&&Math.abs(t.z-z)<=.5);
   if(object.spellOwner)strip.append(catalogButton('Set height',async()=>{
    const input=prompt('Height above the placement surface (0–30 ft)',String(Math.round((object.lightElevation??.8)*50)/10));
    if(input===null||!input.trim())return;
    const height=Number(input);
    if(!Number.isFinite(height)||height<0||height>30){message('Choose a height from 0 to 30 ft.');return}
    close();
    try{await customizeRoomObject(object,'spell_light_height',height);await pollRoom()}
    catch(error){message(error.message);await pollRoom()}
   }));
   if(object.spellOwner)strip.append(catalogButton('Remove spell light',async e=>{
    e.currentTarget.disabled=true;
    try{await customizeRoomObject(object,'spell_light_remove',null);close();await pollRoom()}
    catch(error){message(error.message);close();await pollRoom()}
   }));
   for(const carrier of object.spellOwner?[]:nearby)strip.append(catalogButton(nearby.length===1?'Pick up':'Pick up with '+libraryName(carrier),async e=>{
    e.currentTarget.disabled=true;
    try{await customizeRoomObject(object,'pickup',carrier.roomId);close();await pollRoom()}
    catch(err){message(err.message);close();await pollRoom()}
   }));
  }
  strip.append(catalogButton('Cancel',close));
  strip.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close()}};
  visionMarkers.append(strip);strip.querySelector('button').focus();return;
 }
 if(admin&&object.shape==='room')strip.append(catalogButton('Move room',()=>{
  close();exitTool();visionSelection=object;visionTool='moveRoom';
  message('Click a new room origin. Esc cancels.');draw();
 }));
 if(admin&&!playing&&object.shape==='room')strip.append(catalogButton('Lighting & floor',()=>{close();editRoomFinish(object)}));
 if(object.shape==='room')add(object.dark?'Set room to normal light':'Darken room',()=>{object.dark=!object.dark});
 if(object.shape==='light'){
  if(object.spellOwner&&admin)add('Remove spell light',()=>{areas=areas.filter(area=>area!==object)});
  add(object.on?'Extinguish':'Light',()=>{object.on=!object.on});
  if(admin||roomProfile?.gm){
   strip.append(catalogButton('Move light',()=>{
    close();exitTool();visionSelection=object;visionTool='moveFixture';
    message('Click a surface to move the light. Esc cancels.');draw();
   }));
   strip.append(catalogButton('Edit fixture',()=>{close();editLightFixture(object)}));
   strip.append(catalogButton('Copy light',()=>{fixtureClipboard=structuredClone(object);close();message('Light copied. Ctrl/Cmd+V, then click a surface to paste.');}));
   if(fixtureClipboard)strip.append(catalogButton('Paste light',()=>{close();exitTool();visionTool='pasteFixture';message('Click a surface to paste the light. Esc cancels.');}));
   add(object.locked?'Unlock light':'Lock light',()=>{object.locked=!object.locked});add(object.secret?'Reveal light':'Hide light',()=>{object.secret=!object.secret});}
 }
 if(object.kind==='Door'||object.kind==='Window'){
  if(!object.locked||admin&&object.kind!=='Window')add((object.open?'Close':'Open')+(object.kind==='Window'?' window':''),()=>{object.open=!object.open});
  else strip.textContent='Locked';
  if(object.kind==='Window')add(object.shaded?'Raise shade':'Lower shade',()=>{object.shaded=!object.shaded});
 }
 if(admin&&object.shape==='opening'){
  if(!playing&&object.kind==='Window'){
   strip.append(catalogButton('Edit window',()=>{close();editWindow(object)}));
   if(!object.cutHeight)add('Rotate 90°',()=>{object.angle=object.angle===0?Math.PI/2:0});
  }
  if(!playing&&object.kind==='Door'){
   strip.append(catalogButton('Door details',()=>{close();editDoorDetails(object)}));
   if(!object.cutHeight)add('Rotate 90°',()=>{
    if(object.angle!==0)object.swingReversed=!object.swingReversed;
    object.angle=object.angle===0?Math.PI/2:0;
   });


   add('Swap hinge side',()=>{object.hinge=object.hinge==='far'?'near':'far'});
   const material=document.createElement('select');
   material.setAttribute('aria-label','Door material');
   for(const name of Object.keys(doorMaterials))material.add(new Option(name,name));
   material.value=object.material||'Wood';
   material.onchange=()=>{remember();object.material=material.value;close();refresh()};
   strip.append(material);
  }
  add((object.locked?'Unlock':'Lock')+(object.kind==='Window'?' window':''),()=>{object.locked=!object.locked});
  add(object.secret?'Reveal':'Conceal',()=>{object.secret=!object.secret});
 }
 if(admin){
  if(object.shape==='opening')strip.append(catalogButton('Move '+object.kind.toLowerCase(),()=>{
   close();exitTool();visionSelection=object;visionTool='moveDoor';
   message('Click a new position. Esc cancels.');draw();
  }));
  add('Delete '+(object.kind||object.shape).toLowerCase(),()=>{
   areas=areas.filter(area=>area!==object);
   if(visionSelection===object)visionSelection=null;
  });
 }
 if(!playing)strip.append(catalogButton('Select',()=>{visionSelection=object;el('visionInspector').hidden=false;el('visionDelete').hidden=false;close()}));
 strip.append(catalogButton('Close',close));
 strip.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close()}};
 visionMarkers.append(strip);strip.querySelector('button')?.focus();
}
function exitTool(){
 if(wallTool){wallTool=null;wallDrag=null;wallPreview=null;wallRoomPick=null;el('wallPathPanel').hidden=true}
 floorEdit=null;
 journalPlacing=false;journalMoving=null;
 componentPlacement=null;
 visionTool=null;visionStart=null;visionSelection=null;
 el('visionInspector').hidden=true;el('visionDelete').hidden=true;
 visionMarkers.querySelector('[data-vision-actions]')?.remove();
 repeatSource=null;repeatPreview=[];
 cutter=null;
 closeStandeeHud();
 facingTarget=null;
 playStandeeGroup.clear();
 areaMode=false;areaOrigin=null;areaPreview=null;
 linkingInitiative=null;
 measuring=false;route=null;carry=null;brush=null;tool=null;tokenTool=null;ghost=null;drag=null;panMode=false;
 el('pan').classList.toggle('active',false);
 message('Drag terrain to move it. Ctrl-drag to orbit. Middle-drag to rotate.');refresh();
}
el('exitTool').onclick=exitTool;
const dmLaptopKey='battlemap.dmLaptopPlay';
let dmLaptopPlay=false;
try{dmLaptopPlay=localStorage.getItem(dmLaptopKey)==='true'}catch{}
el('dmLaptopPlay').checked=dmLaptopPlay;
el('dmLaptopPlay').onchange=e=>{
 dmLaptopPlay=e.target.checked;
 try{localStorage.setItem(dmLaptopKey,String(dmLaptopPlay))}catch{}
 queueWorkspacePreferences();
 if(!dmLaptopPlay)closeLaptopPanels();
 refresh();
};
const laptopPanels=new Map();
function closeLaptopPanels(){
 for(const [key,win] of laptopPanels)if(detachedPanels.get(key)?.win===win&&!win.closed)win.close();
 laptopPanels.clear();
}
el('mode').onchange=()=>{
 playing=el('mode').checked;gmVisionArmed=false;gmVisionStandee=null;selected=null;group.clear();exitTool();
 message(playing?'Drag a standee to move it, or choose Measure.':'Build terrain or choose Measure.');
 if(!playing){closeLaptopPanels();return}
 if(!roomProfile?.gm||!dmLaptopPlay)return;
 for(const [key,title,show] of [['initiative','Initiative',showInitiative],['rolls','Chat',showRolls]]){
  if(panelIsDetached(key))continue;
  show(true);
  const win=detachPanel(key,title,true);
  if(win)laptopPanels.set(key,win);
 }
};
el('ruler').onclick=()=>{
 const next=!measuring;exitTool();measuring=next;
 if(measuring)message('Click two points to measure. Hold Alt for free placement.');
 refresh();
};
function setWaypoint(){
 if(!carry||carry.paused||(drag&&!drag.pickup))return;
 if(!ghost){message('Move the standee to a turning point, then press '+pathLabel()+' or use Path.');return}
 const blocker=movementBlocked();
 if(blocker){message(carryBlockerLabel(blocker)+' blocks this route. Choose a waypoint around it.');return}
 if(!validCarryDestination()){message('That waypoint is blocked. Choose another square.');return}
 const waypoint=basePoint(ghost),last=route.points[route.points.length-1];
 if(waypoint.every((value,i)=>value===last[i])){
  message('Move to a different square to add another waypoint.');return;
 }
 route.points.push(waypoint);route.end=null;
 if(drag?.pickup)drag.waypointSet=true;
 message('Waypoint '+(route.points.length-1)+' set. Move to the next point or click to pause.');
 draw();
}
let pathHeld=false,pathUsed=false;
window.addEventListener('blur',()=>{pathHeld=false;pathUsed=false;cameraFocusHeld=false;cameraFocusUsed=false});
window.addEventListener('keyup',e=>{
 if(e.code==='Space'){
  if(cameraFocusUsed)e.preventDefault();
  cameraFocusHeld=false;cameraFocusUsed=false;
 }
 if(e.key.toLowerCase()!==pathKey||!pathHeld)return;
 pathHeld=false;
 if(!pathUsed&&carry)continuePath();
 pathUsed=false;
});
function continuePath(){if(carry?.paused)resumeMove();else setWaypoint()}
el('waypoint').onclick=continuePath;
function stepStandeeWithArrow(key){
 const token=carry?.piece||selected;
 if(token?.type!=='standee'||!tokens.includes(token)||standeeHidden(token)||roomMoving||
    roomProfile&&!roomProfile.gm&&(roomState.paused||!ownsRoomStandee(token)))return false;
 if(carry&&!carry.keyboard)return false;
 const [sx,sy]={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[key];
 const [cx,cy]=point(0,0,0);
 const directions=[[1,0],[-1,0],[0,1],[0,-1]];
 const alignment=([x,y])=>{
  const [px,py]=point(x,y,0);
  return ((px-cx)*sx+(py-cy)*sy)/Math.hypot(px-cx,py-cy);
 };
 directions.sort((a,b)=>alignment(b)-alignment(a));
 const [dx,dy]=directions[0],from=ghost&&carry?ghost:token;
 const next={...from,x:from.x+dx,y:from.y+dy};
 if(!valid(next,[...pieces,...tokens],token)||movementSegment(basePoint(from),basePoint(next),token).blocked){
  message('That step is blocked.');return true;
 }
 if(!carry){carry={piece:token,keyboard:true,paused:true,previousRoute:route};route={points:[basePoint(token)]};}
 else route.points.push(basePoint(from));
 ghost=next;route.end=basePoint(next);
 message('Arrow keys to move. Enter to confirm, Esc to cancel.');draw();return true;
}
window.addEventListener('keyup',e=>{if(e.key.toLowerCase()==='e'&&elevationKeyHeld){elevationKeyHeld=false;draw('Elevation labels hidden')}});
window.addEventListener('blur',()=>{if(elevationKeyHeld){elevationKeyHeld=false;draw('Elevation labels hidden')}});
window.addEventListener('keydown',e=>{
 if(el('sceneDialog').open||el('standeeLibraryDialog').open||el('formationDialog').open||el('assetCatalogDialog').open||appearancePanel.contains(e.target)||el('importStandeeDialog').open||el('userAccountsDialog').open||el('standeePasteDialog').open||e.target?.matches?.('textarea,input,select')||el('foldedDialog').open||el('standeeCropDialog').open||el('preferencesDialog').open||el('standeeArtDialog').open||el('sceneDialog').open||el('areaEditDialog').open)return;
 const editing=e.target?.matches?.('input, select, textarea, [contenteditable]');
 if(e.key.toLowerCase()==='e'&&!editing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target?.closest?.('[contenteditable]')&&!document.querySelector('dialog[open]')){
  e.preventDefault();if(!elevationKeyHeld){elevationKeyHeld=true;draw('Elevation labels shown')}return;
 }
 if(playing&&roomProfile?.gm!==false&&!editing&&!e.target?.closest?.('[contenteditable], dialog')&&
    e.key.toLowerCase()==='l'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!drag&&!carry){
  e.preventDefault();
  gmVisionArmed=true;
  message('Select a standee to preview its vision.');
  return;
 }
 if(e.key==='Escape')gmVisionArmed=false;
 if(componentPlacement&&!editing&&!e.target?.closest?.('[contenteditable]')&&
    ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!e.repeat){
  e.preventDefault();
  const turn=e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1;
  componentPlacement.rotation=((componentPlacement.rotation??0)+turn+4)%4;
  if(ghost&&tool==='column')ghost={...ghost,r:componentPlacement.rotation};
  draw();return;
 }
 if(e.key==='Escape'&&componentPlacement){e.preventDefault();exitTool();return}
 if(!editing&&!e.target?.closest?.('[contenteditable]')&&
    e.key.toLowerCase()==='t'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!carry&&!drag&&
    !measuring&&!areaMode&&!visionTool&&!pendingPolymorph&&!spellPlacement&&
    !document.querySelector('dialog[open]:not(#playCombatDialog)')){
  let actor=selected?.type==='standee'&&tokens.includes(selected)?selected:playCombatStandee;
  if(roomProfile?.gm===false&&(!actor||!tokens.includes(actor)||!ownsRoomStandee(actor)||standeeHidden(actor))){
   const controlled=tokens.filter(token=>ownsRoomStandee(token)&&!standeeHidden(token));
   actor=controlled.find(token=>token.roomId===roomProfile.characterKey)
    ??(controlled.length===1?controlled[0]:null);
  }
  if(actor&&tokens.includes(actor)&&!standeeHidden(actor)&&
     (roomProfile?.gm!==false||ownsRoomStandee(actor)&&!roomState.paused)){
   e.preventDefault();gmVisionStandee=null;armFacingTarget(actor);return;
  }
 }
 if(e.key==='Escape'&&facingTarget&&el('playCombatDialog').open){
  facingTarget=null;message('Target selection canceled.');refresh();return;
 }
 if(el('playCombatDialog').open&&!editing&&!e.target?.closest?.('[contenteditable]')&&
    (e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&!document.querySelector('dialog[open]:not(#playCombatDialog)')){
  e.preventDefault();el('undo').click();return;
 }
 if(document.querySelector('dialog[open]'))return;
 if(e.code==='Space'&&!editing&&!e.target?.closest?.('[contenteditable]')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
  cameraFocusHeld=true;
  if(cameraFocusUsed||!e.target?.closest?.('button,a,[role=button]'))e.preventDefault();
  return;
 }
 if(fixtureClipboard&&roomProfile?.gm!==false&&!editing&&!drag&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){
  e.preventDefault();exitTool();visionTool='pasteFixture';message('Click a surface to paste the light. Esc cancels.');return;
 }
 if(playing&&!editing&&!drag&&!measuring&&!areaMode&&!facingTarget&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&
    ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&stepStandeeWithArrow(e.key)){
  e.preventDefault();return;
 }
 if(e.key==='Enter'&&carry&&!editing&&!drag&&!e.repeat){e.preventDefault();dropCarry();return}
 if((!roomProfile||roomProfile.gm)&&!editing&&!drag&&(e.ctrlKey||e.metaKey)){
  const key=e.key.toLowerCase(),token=carry?.piece||selected||[...playStandeeGroup].at(-1);
  if(key==='c'&&token?.type==='standee'){
   e.preventDefault();standeeClipboard={source:token,template:structuredClone(token)};message('Standee copied. Point at a destination and paste.');return;
  }
  if(key==='v'&&standeeClipboard){e.preventDefault();openStandeePaste();return}
 }
 if(!playing&&!editing&&!drag){
  const key=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&(['c','x','v'].includes(key))){
   if(key==='v'?copiedTerrain.length:group.size){
    e.preventDefault();if(key==='v')pasteTerrain();else copyTerrain(key==='x');
   }
   return;
  }
  if(selected&&selected.type!=='standee'&&['arrowleft','arrowright','arrowup','arrowdown'].includes(key)){
   e.preventDefault();rotateTerrain(key==='arrowright'||key==='arrowdown'?1:-1);return;
  }
 }

 if(e.key.toLowerCase()===pathKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&carry){
  e.preventDefault();
  if(!e.repeat){pathHeld=true;pathUsed=false}
 }
 if(e.key==='Escape'&&gmVisionObserver()&&!facingTarget&&!carry&&!spellPlacement&&!pendingPolymorph){gmVisionStandee=null;draw('GM vision');return}
 if(e.key==='Escape'){if(facingTarget){facingTarget=null;message('Target selection canceled.');refresh()}else if(carry)cancelMove();else exitTool()}
 if(roomProfile&&!roomProfile.gm)return;
 if(e.key==='Delete')el('remove').click();
 if(e.key.toLowerCase()==='r')el('rotate').click();
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();el('undo').click()}
});
el('save').onclick=()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify({version:2,pieces,tokens,areas,view:savePanelView()},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='battlemap.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
el('load').onclick=()=>el('file').click();
el('file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 let context='JSON syntax';
 try{
  const raw=JSON.parse(await file.text());
  context='Scene format';
  if(!raw||typeof raw!=='object')throw Error('Expected a JSON object.');
  const data=raw.format==='battlemap-layout'?expandBattlemapLayout(raw):raw,incoming=[];
  const incomingAreas=data.areas??[];
  const floorAdjusted=Array.isArray(data.pieces)&&data.pieces.some(p=>p?.floorAdjusted===true)||
   Array.isArray(data.tokens)&&data.tokens.some(t=>t?.floorAdjusted===true);
  if(!Array.isArray(incomingAreas))throw Error('areas must be an array.');
  if(incomingAreas.some(a=>a?.shape==='appearance'&&a.texturePack!==undefined&&!validTexturePack(a.texturePack)))throw Error('Invalid embedded texture pack.');
  if(data.grid!==undefined){if(!validSceneGrid(data.grid))throw Error('Grid width and depth must be integers from 10 to 100.');setSceneGrid(incomingAreas,data.grid)}
  const declaredGrid=incomingAreas.find(a=>a?.shape==='appearance')?.grid;
  if(declaredGrid!==undefined&&!validSceneGrid(declaredGrid))throw Error('Appearance grid width and depth must be integers from 10 to 100.');
  const {width,depth}=sceneGrid(incomingAreas);
  if(![1,2].includes(data.version)||!Array.isArray(data.pieces)||data.pieces.length>width*depth*maxHeight)throw Error('Expected version 1 or 2 and a pieces array within the scene capacity.');
  for(const [i,p] of data.pieces.entries()){
   context='Terrain #'+(i+1)+' ('+(p?.type??'unknown')+' at '+[p?.x,p?.y,p?.z].join(', ')+')';
   if(p?.type==='volume'&&p.extents!==undefined&&(!Array.isArray(p.extents)||p.extents.length!==3||p.extents.some(n=>(!p.curvedStair&&!Number.isInteger(n*4))||n<.001||n>100)))throw Error('extents '+JSON.stringify(p.extents)+' must contain three dimensions, each a multiple of 0.25 from 0.25 to 100.');
   if(!p||!Object.prototype.hasOwnProperty.call(types,p.type))throw Error('Unknown terrain type.');
   if(!(p.type==='column'?(p.freePlacement===true?[p.x,p.y].every(Number.isFinite):[p.x,p.y].every(v=>Number.isFinite(v)&&Number.isInteger(v-.25)))&&Number.isInteger(p.floorAdjusted===true?p.z*4:p.z):(p.type==='volume'?[p.x*4,p.y*4,p.z*4]:[p.x,p.y,p.floorAdjusted===true?p.z*4:p.z]).every(p.curvedStair?Number.isFinite:Number.isInteger))||![p.x,p.y,p.z].every(Number.isFinite))throw Error('Invalid coordinates: volumes use quarter units, columns use integer + 0.25 for x/y and integer z, other terrain uses integers.');
   if(![0,1,2,3].includes(p.r))throw Error('Rotation r must be 0, 1, 2 or 3.');
   if(!valid(p,incoming,null,incomingAreas,false,floorAdjusted,true))throw Error('Placement is out of bounds, unsupported or overlaps earlier terrain.');
   if(p.form==='polygon'&&!validPolygon(p.vertices))throw Error('Invalid polygon vertices.');
   const {type,x,y,z,r,cut}=p;
   if(cut!==undefined&&(!cut||!['chamfer','fillet'].includes(cut.kind)||![.125,.25,.375].includes(cut.depth)))throw Error('Invalid cut.');
   const {cuts,wash,opaquePaint,surfaceTextures}=p;
   if(surfaceTextures!==undefined&&(!Array.isArray(surfaceTextures)||surfaceTextures.length!==5||surfaceTextures.some(id=>id!==null&&(typeof id!=='string'||!textureIdPattern.test(id)))))throw Error('Invalid surface textures.');
   if(opaquePaint!==undefined&&(!Array.isArray(opaquePaint)||opaquePaint.length!==5||opaquePaint.some(c=>c!==null&&(typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c)))))throw Error('Invalid opaque paint.');
   if(wash!==undefined&&(!Array.isArray(wash)||wash.length!==5||wash.some(c=>c!==null&&(typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c)))))throw Error('Invalid wash.');
   if(cuts!==undefined&&(!Array.isArray(cuts)||cuts.length!==4||cuts.some(c=>c!==null&&(!c||!['chamfer','fillet'].includes(c.kind)||![.125,.25,.375].includes(c.depth)))))throw Error('Invalid cuts.');
   if(sceneryPiece(p)&&!uploadedStandeeImage(p.art))throw Error('Invalid scenery artwork.');
   if(p.form!==undefined&&(!['wedge','pyramid','corners','polygon'].includes(p.form)||type!=='volume'))throw Error('Invalid form.');
   if(p.corners!==undefined&&(!Array.isArray(p.corners)||p.corners.length!==4||p.corners.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(v=>!Number.isFinite(v)||v<0||v>1))))throw Error('Invalid corners.');
   incoming.push({type,x,y,z,r,...(Number.isFinite(p.terrainYaw)&&p.terrainYaw>=0&&p.terrainYaw<360?{terrainYaw:p.terrainYaw}:{}),...(p.floorAdjusted===true?{floorAdjusted:true}:{}),...(p.wallOverlap===true&&wallVolume(p)?{wallOverlap:true}:{}),...(type==='volume'&&p.openingCut===true?{openingCut:true}:{}),...(type==='volume'&&p.groundSurface===true?{groundSurface:true}:{}),stairTread:type==='volume'&&p.stairTread===true,curvedStair:p.curvedStair===true,stairGroup:typeof p.stairGroup==='string'?p.stairGroup:undefined,terrainShape:type==='column'&&p.terrainShape?cleanFormationSettings(p.terrainShape):undefined,form:p.form,vertices:p.form==='polygon'?p.vertices:undefined,corners:p.corners,extents:type==='volume'?p.extents:undefined,cut:cut&&{kind:cut.kind,depth:cut.depth},cuts,wash,opaquePaint,surfaceTextures,patterns:Array.isArray(p.patterns)?p.patterns.slice(0,5).map(value=>Array.isArray(value)?value.filter(layer=>layer&&typeof layer.kind==='string'&&Number.isFinite(layer.seed)).slice(0,12):typeof value==='string'?value:null):undefined,plainFaces:Array.isArray(p.plainFaces)?p.plainFaces.slice(0,5).map(Boolean):undefined,art:sceneryPiece(p)?p.art:undefined});
  }
  context='Standees';
  const importedTokens=[];
  if(data.version===2){
   if(!Array.isArray(data.tokens)||data.tokens.length>500)throw Error('Expected a tokens array with at most 500 entries.');
   for(const [i,t] of data.tokens.entries()){
    context='Standee #'+(i+1)+' ('+(t?.name??'unnamed')+' at '+[t?.x,t?.y,t?.z].join(', ')+')';
    if(!t||t.type!=='standee'||typeof t.name!=='string'||typeof t.icon!=='string'||!/^#[a-f0-9]{6}$/i.test(t.color)||![1,2,3].includes(t.size)||![t.x*4,t.y*4,t.z*4].every(Number.isInteger)||t.src!==undefined&&(typeof t.src!=='string'||t.src.length>2000000||!/^data:image\/(webp|png);base64,[a-z0-9+/=]+$/i.test(t.src)))throw Error('Invalid standee type, name, icon, color, size, coordinates or embedded art.');
    if(!valid(t,[...incoming,...importedTokens],null,incomingAreas,false,floorAdjusted))throw Error('Placement is out of bounds, unsupported or overlaps terrain or another standee.');
    if(t.initiativeKey!==undefined&&typeof t.initiativeKey!=='string')throw Error('Invalid initiativeKey.');
    if(t.facing!==undefined&&(!Number.isInteger(t.facing)||t.facing<0||t.facing>359))throw Error('Invalid facing (integer 0–359).');
    if(t.flying!==undefined&&typeof t.flying!=='boolean')throw Error('Invalid flying.');
    if(['trackingId','targetId'].some(k=>t[k]!==undefined&&(typeof t[k]!=='string'||t[k].length>80)))throw Error('Invalid trackingId or targetId.');
    if(t.displayName!==undefined&&(typeof t.displayName!=='string'||t.displayName.length>80))throw Error('Invalid displayName.');
    if(t.nameVisibility!==undefined&&![0,1,2,3,4,5].includes(t.nameVisibility))throw Error('Invalid nameVisibility.');
    if(['tempHp','saveDc','ac'].some(k=>t[k]!=null&&(!Number.isInteger(t[k])||t[k]<0||t[k]>(k==='tempHp'?99999:99))))throw Error('Invalid tempHp, saveDc or ac.');
    if(['hp','maxHp','initiativeModifier'].some(k=>t[k]!=null&&!Number.isInteger(t[k]))||(t.hpPoolId!==undefined&&typeof t.hpPoolId!=='string'))throw Error('Invalid hp, maxHp, initiativeModifier or hpPoolId.');
    if(t.role!==undefined&&!['pc','enemy','ally'].includes(t.role))throw Error('Invalid role.');
    if(t.squad!==undefined&&!['','1','2','3','4','5'].includes(t.squad))throw Error('Invalid squad.');
    if(t.incognito!==undefined&&typeof t.incognito!=='boolean')throw Error('Invalid incognito.');
    if(!validLooks(t)||(t.manualTarget!==undefined&&typeof t.manualTarget!=='boolean')||(t.conditions!==undefined&&(!Array.isArray(t.conditions)||t.conditions.length>Object.keys(standeeConditions).length||t.conditions.some(id=>!Object.hasOwn(standeeConditions,id)))))throw Error('Invalid looks, activeLook, manualTarget or conditions.');
    if(t.aura!==undefined&&(!t.aura||!Number.isFinite(t.aura.radius)||t.aura.radius<1||t.aura.radius>120||!/^#[0-9a-f]{6}$/i.test(t.aura.color)))throw Error('Invalid aura.');
    importedTokens.push(t);
   }
  }
  context='Areas';
  const invalidArea=incomingAreas.findIndex(a=>!a||!['line','circle','square','cone','sphere','cube','cone3d','difficult','appearance','room','opening','light','journal'].includes(a.shape)||(a.shape==='difficult'&&a.width!==undefined&&(!Number.isInteger(a.width)||a.width<1||a.width>40))||!Number.isInteger(a.size)||a.size<1||a.size>40||!Array.isArray(a.origin)||a.origin.length!==3||!a.origin.every(Number.isFinite)||!Number.isFinite(a.angle)||(a.pitch!==undefined&&(!Number.isFinite(a.pitch)||Math.abs(a.pitch)>90))); 
  if(incomingAreas.some(a=>a?.wallPaths!==undefined&&!validSceneWallPaths(a.wallPaths)))throw Error('Invalid wall paths.');
  if(incomingAreas.some(a=>a?.wallRoomRegions!==undefined&&(!Array.isArray(a.wallRoomRegions)||a.wallRoomRegions.length>100||
   a.wallRoomRegions.some(r=>!r||!Array.isArray(r.seed)||r.seed.length!==2||!r.seed.every(Number.isFinite)||!Number.isFinite(r.z)))))
   throw Error('Invalid detected rooms.');
  if(invalidArea>=0)throw Error('Area #'+(invalidArea+1)+' ('+(incomingAreas[invalidArea]?.shape??'unknown')+'): invalid shape, size, origin, angle, width or pitch.');
  context='Applying scene';
  if(roomPatchBusy||roomPatchPending){await flushRoomPatch();if(roomPatchBusy||roomPatchPending)throw Error('Previous scene has unsynchronized edits. Finish synchronization before importing.');}
  clearTimeout(roomPatchTimer);gmAmbientPending=null;roomBaseline=null;
  exitTool();remember();currentSceneId=null;areas=incomingAreas;pieces=incoming;tokens=importedTokens;selected=null;group.clear();tool=null;tokenTool=null;ghost=null;roomDraftAttached=false;restoreActiveRoom=false;restorePanelView(data.view);refresh();
  el('sceneSource').value='current';el('sceneSource').onchange();
  el('sceneName').value=file.name.replace(/\.json$/i,'').slice(0,80);
  message('Map imported. Use Scenes → Save draft as scene to keep a named copy.');
  queueRecovery();
 }catch(error){const detail='Import failed — '+context+': '+(error?.message||'Invalid data.');message(detail);el('mapImportErrorText').textContent=detail;if(!el('mapImportErrorDialog').open)el('mapImportErrorDialog').showModal();}
};
function showRolls(open){
 el('openGroupChallenge').hidden=roomProfile?.gm!==true;
 if(!open)el('chatFilterDetails').open=false;
 el('rollsPanel').hidden=!open||panelIsDetached('rolls');
 if(open){const feed=el('rollsFeed');feed.scrollTop=feed.scrollHeight;}
 el('rollsToggle').setAttribute('aria-expanded',String(open));queueRecovery();
}
el('rollsToggle').onclick=()=>{if(panelIsDetached('rolls'))detachedPanels.get('rolls').win.focus();else showRolls(el('rollsPanel').hidden)};
el('rollsClear').onclick=()=>{if(roomProfile?.gm)publishRoom('clear_chat');else if(!roomProfile){el('rollsFeed').replaceChildren();applyChatFilters();queueRecovery()}};
// Character health comes from Beyond20; Battlemap never writes to D&D Beyond.
function beyond20Health(event){
 const args=Array.isArray(event.detail)?event.detail:[event.detail];
 const data=args[0];
 if(!data||!roomProfile)return;
 const character=data.character&&typeof data.character==='object'?data.character:{};
 learnBeyondPlayerProfile(character);
 const idSource=character.id??character.characterId??character.url??data.characterId??'';
 const idMatch=String(idSource).match(/(?:characters\/)?(\d+)(?:[/?#]|$)/);
 const id=idMatch?.[1];
 if(!id)return;
 const matching=tokens.filter(t=>String(t.ddbCharacterId||ddbCharacterIdFromUrl(t.ddbCharacterUrl)||'')===id);
 if(!matching.length)return;
 const read=(...values)=>values.find(v=>v!==null&&v!==undefined&&v!=='');
 const hp=Number(read(data.currentHP,data.currentHp,data.hp,character.hp,character.currentHP));
 const temp=Number(read(data.tempHP,data.tempHp,data['temp-hp'],character['temp-hp'],character.tempHp,0));
 const max=Number(read(data.maxHP,data.maxHp,data['max-hp'],character['max-hp'],character.maxHp));
 if(!Number.isInteger(hp)||hp<0||hp>99999||!Number.isInteger(temp)||temp<0||temp>99999)return;
 const apply=async()=>{
  for(const token of matching){
   if(roomProfile.gm){
    remember();
    for(const other of tokens.filter(t=>t===token||token.hpPoolId&&t.hpPoolId===token.hpPoolId)){
     other.hp=hp;other.tempHp=temp;
     if(Number.isInteger(max)&&max>0&&max<=99999)other.maxHp=max;
    }
   }else if(ownsRoomStandee(token)&&token.roomId){
    await customizeRoomObject(token,'stats',{hp:String(hp),tempHp:String(temp)});
   }
  }
  if(roomProfile.gm)refresh();else await pollRoom();
  if(artDraft?.token)updateStandeeHealthReadout(artDraft.token);
  if(hudToken&&!hudTorchOnly){
   for(const [id,key] of [['hudHp','hp'],['hudTempHp','tempHp']])
    if(document.activeElement!==el(id))el(id).value=hudToken[key]??'';
  }
 };
 apply().catch(error=>message('Beyond20 health sync: '+error.message));
}
document.addEventListener('Beyond20_UpdateHP',beyond20Health);
document.addEventListener('Beyond20_Loaded',()=>{
 el('rollsStatus').textContent='Beyond20 connected. Waiting for a roll.';
});
let artDraft=null,bulkMarks=null;
const playStandeeGroup=new Set();
function hostedImage(value){
 if(!value)return '';
 const url=new URL(value,location.href);
 if(url.protocol!=='https:'||url.username||url.password)throw Error();
 return url.href;
}
function validLooks(t){
 if(t.looks===undefined)return t.activeLook===undefined;
 return Array.isArray(t.looks)&&t.looks.length>0&&t.looks.length<=40&&Number.isInteger(t.activeLook)&&t.activeLook>=0&&t.activeLook<t.looks.length&&t.looks.every(look=>{
  if(!look||(look.sameImage!==undefined&&typeof look.sameImage!=='boolean')||typeof look.name!=='string'||!look.name.trim()||look.name.length>80)return false;
  if(look.sideThickness!==undefined&&!standeeThicknessOptions.includes(look.sideThickness))return false;
  if(look.backFill!==undefined&&!['front','solid','gradient'].includes(look.backFill))return false;
  if(['backColor','backEnd'].some(key=>look[key]!==undefined&&!/^#[0-9a-f]{6}$/i.test(look[key])))return false;
  return ['front','back'].every(side=>{
   if(typeof look[side]!=='string')return false;
   if(look===t.looks[0]&&uploadedStandeeImage(look[side]))return true;
   if(look[side].length>2048)return false;
   try{return !look[side]||hostedImage(look[side])===look[side]}catch{return false}
  });
 });
}
function uploadedStandeeImage(value){
 return typeof value==='string'&&value.length<=1100000&&/^data:image\/(webp|png);base64,[a-z0-9+/=]+$/i.test(value);
}
let cropDraft=null,uploadSide=null;
for(const [id,side] of [['uploadFront','front'],['uploadBack','back']]){
 el(id).onclick=()=>{
  if(!readLook())return;
  uploadSide=side;el('defaultImageFile').click();
 };
}
function standeeDrop(id,accept){
 const zone=el(id);
 zone.ondragover=e=>{
  if(!e.dataTransfer.types.includes('Files'))return;
  e.preventDefault();e.dataTransfer.dropEffect='copy';zone.classList.add('drop-ready');
 };
 zone.ondragleave=()=>zone.classList.remove('drop-ready');
 zone.ondrop=e=>{
  e.preventDefault();zone.classList.remove('drop-ready');
  const files=e.dataTransfer.files;
  if(files.length!==1){
   const status=importLook?el('importArtError'):artDraft?el('artError'):null;
   if(status)status.textContent='Drop one file at a time.';else message('Drop one file at a time.');
   return;
  }
  accept(files[0]);
 };
}
for(const [id,side] of [['importFront','front'],['importBack','back'],['uploadFront','front'],['uploadBack','back']]){
 standeeDrop(id,file=>{
  if(id.startsWith('upload')&&!readLook())return;
  openStandeeImage(file,side);
 });
}
standeeDrop('foldedArt',file=>openFoldedImage(file,null));
standeeDrop('uploadFoldedLook',file=>{if(readLook())openFoldedImage(file,artDraft)});
function drawCrop(target){
 const image=cropDraft.image;
 const scale=Math.min(target.width/image.width,target.height/image.height)*Number(el('cropZoom').value);
 const width=image.width*scale,height=image.height*scale;
 const x=(target.width-width)*Number(el('cropX').value),y=(target.height-height)*Number(el('cropY').value);
 const paint=target.getContext('2d');
 paint.clearRect(0,0,target.width,target.height);
 paint.drawImage(image,x,y,width,height);
}
el('defaultImageFile').onchange=e=>{
 const file=e.target.files[0];e.target.value='';
 return openStandeeImage(file,uploadSide);
};
async function openStandeeImage(file,side){
 const draft=artDraft,importing=importLook;
 if(el('standeeCropDialog').open)return;
 if(!file)return;
 try{
  if(file.size>5000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error();
  const image=await createImageBitmap(file);
  if(importing?importing!==importLook:draft!==artDraft||artDraft?.index!==0){image.close();return}
  if(image.width>6000||image.height>6000){image.close();throw Error()}
  cropDraft={image,side,importing,fileName:file.name};
  el('cropTitle').textContent='Crop '+side+' artwork';
  el('cropZoom').value=1;el('cropX').value=.5;el('cropY').value=1;
  drawCrop(el('cropPreview'));el('standeeCropDialog').showModal();
 }catch{if(importing?importing===importLook:draft===artDraft)el(importing?'importArtError':'artError').textContent='Choose a PNG, JPEG, or WebP up to 5 MB and 6,000 pixels per side.'}
};
for(const id of ['cropZoom','cropX','cropY'])el(id).oninput=()=>drawCrop(el('cropPreview'));
el('cropCancel').onclick=()=>el('standeeCropDialog').close();
el('standeeCropDialog').onclose=()=>{cropDraft?.image.close();cropDraft=null};
el('cropUse').onclick=async()=>{
 if(!cropDraft||(!cropDraft.importing&&!artDraft))return;
 const target=document.createElement('canvas');target.width=384;target.height=576;
 drawCrop(target);
 const crop=cropDraft,editor=artDraft;
 let image=target.toDataURL('image/webp',.88);
 if(!uploadedStandeeImage(image))return;
 try{[image]=await hostStandeeImages([image],el('cropUse'))}
 catch(error){if(cropDraft===crop)message(error.message);return}
 if(cropDraft!==crop||(!crop.importing&&artDraft!==editor))return;
 if(cropDraft.importing){
  if(cropDraft.importing!==importLook)return;
  importLook[cropDraft.side]=image;
  if(cropDraft.side==='front'&&!el('importStandeeName').value)el('importStandeeName').value=cropDraft.fileName.replace(/\.[^.]+$/,'').slice(0,80);
  updateImportLook();el('importArtError').textContent='';
 }else{
  artDraft.looks[0][cropDraft.side]=image;
  if(cropDraft.side==='back')artDraft.looks[0].sameImage=false;
  showLook();
 }
 el('standeeCropDialog').close();
};
function defaultStandeeLook(token){
 const model=token.icon==='⚔'?'adventurer':token.icon==='◆'?'goblin':null;
 return {name:'Default',
  front:model&&!token.src?new URL('art/'+model+'-front.svg',location.href).href:'',
  back:model&&!token.src?new URL('art/'+model+'-back.svg',location.href).href:''};
}
function readLook(){
 const name=el('artLookName').value.trim();
 if(!name){el('artError').textContent='Enter a name for this look.';return false}
 try{
  const readSide=(id,side)=>{
   const raw=el(id).value.trim(),previous=artDraft.looks[artDraft.index][side];
   return !raw&&artDraft.index===0&&uploadedStandeeImage(previous)?previous:hostedImage(raw);
  };
  const front=readSide('artFront','front'),back=readSide('artBack','back');
  if([front,back].some(url=>url.length>2048&&!uploadedStandeeImage(url)))throw Error();
  if(artDraft.index===0){
   const previous=artDraft.looks[0];
   if((front&&front!==previous.front&&new URL(front).origin!==location.origin)||
      (back&&back!==previous.back&&new URL(back).origin!==location.origin)){
    el('artError').textContent='Use artwork hosted on this Battlemap site for the default look.';return false;
   }
  }else if(!front&&!back){
   el('artError').textContent='Link a hosted image for this alternate look.';return false;
  }
  const backFill=el('standeeBackFill').value,sideThickness=Number(el('standeeSideThickness').value);
 artDraft.looks[artDraft.index]={name,front,back,sameImage:el('sameStandeeImage').checked,backFill,
  backColor:el('standeeBackColor').value,backEnd:el('standeeBackEnd').value,
  ...(sideThickness?{sideThickness}:{})};
  el('artError').textContent='';return true;
 }catch{el('artError').textContent='Enter an HTTPS image URL or a path on this host.';return false}
}
function updateSameStandeeImage(){
 const shared=el('sameStandeeImage').checked;
 el('artBack').hidden=el('artBackLabel').hidden=el('managedLookBack').hidden=shared;
}
function updateStandeeBackFill(){
 const fill=el('standeeBackFill').value;
 el('standeeBackColors').hidden=fill==='front';
 el('standeeBackEndLabel').hidden=fill!=='gradient';
}
el('sameStandeeImage').onchange=updateSameStandeeImage;
el('standeeBackFill').onchange=updateStandeeBackFill;
function showLook(){
 const select=el('artLook');
 select.replaceChildren();
 artDraft.looks.forEach((look,i)=>{
  const option=document.createElement('option');option.value=i;option.textContent=look.name;select.append(option);
 });
 select.value=artDraft.index;
 const {name,front,back,sameImage,backFill,backColor,backEnd,sideThickness}=artDraft.looks[artDraft.index];
 el('standeeBackFill').value=backFill||'front';
 el('standeeBackColor').value=backColor||'#252d36';
 el('standeeBackEnd').value=backEnd||'#708496';
 el('standeeSideThickness').value=sideThickness??'';
 updateStandeeBackFill();
 el('sameStandeeImage').checked=!!sameImage;
 updateSameStandeeImage();
 el('defaultUploads').hidden=artDraft.index!==0;
 el('artLookName').value=name;el('artFront').value=uploadedStandeeImage(front)?'':front;el('artBack').value=uploadedStandeeImage(back)?'':back;
 el('artFront').placeholder=uploadedStandeeImage(front)?'Uploaded front image':artDraft.index===0?'art/standee-front.png':'https://…';
 el('artBack').placeholder=uploadedStandeeImage(back)?'Uploaded back image':artDraft.index===0?'art/standee-back.png':'https://…';
 el('artRemoveLook').disabled=artDraft.index===0;
 el('artAddLook').disabled=artDraft.looks.length>=40;
 el('artError').textContent='';
}
function selectedStandees(){return tokens.filter(token=>playStandeeGroup.has(token))}
el('bulkMarkerButton').onclick=()=>{
 const targets=selectedStandees();
 if(playing&&targets.length>1)openBulkMarks(targets);
};
function markerInputs(){return [...el('standeeMarks').querySelectorAll('#standeeTargeted, [data-condition]')]}
function configureMarkerEditor(bulk){
 el('standeeAddInitiative').hidden=bulk||roomProfile?.gm===false;
 el('obscuredControl').hidden=roomProfile?.gm===false;
 el('squadControls').hidden=bulk||playing;
 el('incognitoControls').hidden=bulk||(roomProfile?!roomProfile.gm:playing);
 el('standeeNameVisibility').disabled=playing;
 el('standeeFlightRow').hidden=bulk;
 el('standeeLooks').hidden=bulk;el('standeeMovement').hidden=bulk;el('artLookName').required=!bulk;
 el('standeeArtTitle').textContent=bulk?'Markers for '+bulkMarks.targets.length+' standees':'Standee';
 for(const input of markerInputs()){input.indeterminate=false;input.onchange=null}
}
function hasMarker(token,input){
 return input.id==='standeeTargeted'?!!token.manualTarget:
  !!(token.conditions?.includes(input.value)||(input.value==='violet'&&token.conditions?.includes('red')));
}
function openBulkMarks(targets){
 bulkMarks={targets,changes:new Map()};
 configureMarkerEditor(true);
 for(const input of markerInputs()){
  const count=targets.filter(token=>hasMarker(token,input)).length;
  input.checked=count===targets.length;
  input.indeterminate=count>0&&count<targets.length;
  input.onchange=()=>bulkMarks.changes.set(input.id==='standeeTargeted'?'targeted':input.value,input.checked);
 }
 el('artError').textContent='Mixed markers stay as they are unless you change them.';
 el('standeeArtDialog').showModal();
}
function saveBulkMarks(){
 if(!bulkMarks.changes.size)return;
 remember();
 for(const token of bulkMarks.targets){
  const conditions=new Set(token.conditions||[]);
  for(const [key,checked] of bulkMarks.changes){
   if(key==='targeted'){token.manualTarget=checked;continue}
   if(key==='violet')conditions.delete('red');
   if(checked)conditions.add(key);else conditions.delete(key);
  }
  token.conditions=[...conditions];
 }
}
function rollStandeeInitiative(token,modifier){
 if(!tokens.includes(token)||playerScenePaused())return;
 const player=roomProfile?.gm===false;
 if(player&&!ownsRoomStandee(token))return;
 if(!Number.isSafeInteger(modifier))modifier=token.initiativeModifier??0;
 const roll=chatRoll('1d20'+(modifier>=0?'+':'')+modifier);
 if(!roll)return;
 if(player){
  sendSharedChat(playerInitiativeCard(token,roll),'public',roll.total);
  showRolls(true);
  return;
 }
 remember(true);
 const key=initiativeKeyFor(token)??crypto.randomUUID();
 token.initiativeKey=key;
 initiativeEntries.set(key,{...initiativeEntries.get(key),name:libraryName(token),total:roll.total,modifier});
 showInitiative(true);publishInitiative();refresh();
}
async function rollContextInitiative(token){
 if(!token)return;
 let modifier=loadPlayerRollProfile(token)?.initiative??token.initiativeModifier;
 if(canUsePlayerRolls(token)&&roomState.sceneId&&token.roomId){
  try{
   const profile=await roomRpc('player_roll_profile',{
    ticket:roomProfile.token,scene_key:roomState.sceneId,standee_key:token.roomId
   });
   modifier=combatInteger(profile?.source?.initiative)??modifier;
  }catch(error){
   if(roomProfile?.gm===false){message(error.message);return}
  }
 }
 rollStandeeInitiative(token,modifier);
}
el('standeeAddInitiative').onclick=()=>rollContextInitiative(artDraft?.token);
el('hudRollInitiative').onclick=()=>{
 const token=hudToken;
 closeStandeeHud();
 void rollContextInitiative(token);
};
function ddbCharacterIdFromUrl(url){
 return String(url??'').match(/^https:\/\/(?:www\.)?dndbeyond\.com\/characters\/(\d+)\/?(?:[?#].*)?$/i)?.[1];
}
function updateStandeeHealthReadout(token){
 const readout=el('standeeHealthReadout');
 readout.hidden=!canSeeStandeeStats(token);
 readout.textContent=readout.hidden?'':'HP '+(token.hp??'—')+
  (token.maxHp!=null?' / '+token.maxHp:'')+' · Temp HP '+(token.tempHp??'—');
}
function openStandeeArt(token){
 configureMarkerEditor(false);
 artDraft={token,size:token.size,sizeIndex:standeeSizeIndex(token),index:token.activeLook??0,looks:token.looks?structuredClone(token.looks):[defaultStandeeLook(token)]};
 el('standeeDisplayName').value=token.displayName||'';
 el('standeeDdbUrl').value=token.ddbCharacterUrl||'';
 el('standeeNameVisibility').value=token.nameVisibility||0;
 const showStats=canSeeStandeeStats(token);
 updateStandeeHealthReadout(token);
 el('standeeMovementSide').value=token.movementSide||'';
 el('standeeRole').value=baseStandeeRole(token);el('standeeRole').disabled=playing;
 el('editStandeeTorch').hidden=roomProfile?.gm===false;
 el('standeeMaxHpLabel').hidden=el('standeeInitModLabel').hidden=el('editCombatStats').hidden=!showStats;
 el('standeeMaxHp').disabled=el('standeeInitMod').disabled=!showStats;
 el('openPlannerCombat').hidden=roomProfile?.gm===false||(playing&&!token.plannerCombat&&!canUsePlayerRolls(token));
 el('openPlannerCombat').textContent=playing?(canUsePlayerRolls(token)?'Rolls':'Combat Actions'):'Link, refresh or paint';
 el('standeeMaxHp').value=showStats?token.maxHp??'':'';
 el('standeeInitMod').value=showStats?token.initiativeModifier??'':'';
 el('standeePoolHint').textContent=showStats&&token.hpPoolId?'HP is shared with linked standees.':'';
 updateStandeeSize();
 el('standeeClearTarget').disabled=!token.targetId;
 el('standeeFlying').checked=!!token.flying;
 el('standeeAltitude').value=token.z*5;
 updateStandeeAltitude();
 el('standeeSquad').value=token.squad||'';
 el('standeeIncognito').checked=!!token.incognito;
 el('darkvisionControls').hidden=!!(roomProfile&&!roomProfile.gm);
 el('standeeVisionType').value=token.blindsight>0?'blindsight':token.darkvision>0?'dark':'regular';el('standeeDarkvision').value=token.blindsight||token.darkvision||60;
 el('standeeTargeted').checked=!!token.manualTarget;
 el('standeeMarks').querySelectorAll('[data-condition]').forEach(input=>input.checked=(token.conditions?.includes(input.value)||(input.value==='violet'&&token.conditions?.includes('red')))||false);
 const player=roomProfile?.gm===false;
 for(const id of ['standeeMovement','standeeMarks'])el(id).hidden=player;
 for(const id of ['standeeDisplayName','standeeNameVisibility','standeeDdbUrl'])el(id).disabled=player;
 el('catalogPolymorph').hidden=!roomProfile?.gm||playing;
 el('saveSharedFamiliar').hidden=!roomProfile?.gm||playing;
 el('managedLookImages').hidden=player;
 el('standeeLooks').open=player;showLook();el('standeeArtDialog').showModal();
}
function updateStandeeSize(){
 const {name,footprint}=standeeSizes[artDraft.sizeIndex];
 artDraft.size=footprint;
 el('standeeSizeValue').textContent=name+' · '+footprint+' × '+footprint;
 el('standeeShrink').disabled=artDraft.sizeIndex===0;
 el('standeeGrow').disabled=artDraft.sizeIndex===standeeSizes.length-1;
}
el('standeeShrink').onclick=()=>{if(artDraft?.sizeIndex>0){artDraft.sizeIndex--;updateStandeeSize()}};
el('standeeGrow').onclick=()=>{if(artDraft&&artDraft.sizeIndex<standeeSizes.length-1){artDraft.sizeIndex++;updateStandeeSize()}};
function updateStandeeAltitude(){
 el('standeeAltitudeControls').hidden=!el('standeeFlying').checked;
 el('standeeAltitudeValue').textContent=el('standeeAltitude').value+' ft';
}
el('standeeFlying').onchange=el('standeeAltitude').oninput=updateStandeeAltitude;
el('artLook').onchange=e=>{
 const index=Number(e.target.value);
 if(!readLook()){e.target.value=artDraft.index;return}
 artDraft.index=index;showLook();
};
el('artAddLook').onclick=()=>{
 if(!readLook())return;
 artDraft.looks.push({name:'Look '+(artDraft.looks.length+1),front:'',back:''});
 artDraft.index=artDraft.looks.length-1;showLook();el('artLookName').focus();
};
el('artRemoveLook').onclick=()=>{
 artDraft.looks.splice(artDraft.index,1);
 artDraft.index=Math.min(artDraft.index,artDraft.looks.length-1);showLook();
};
el('standeeClearTarget').onclick=()=>{
 const token=artDraft?.token;
 if(!token?.targetId)return;
 remember();
 const facing=trackingFacing(token);
 if(facing!==undefined)token.facing=facing;
 delete token.targetId;
 el('standeeClearTarget').disabled=true;
 el('artError').textContent='Target cleared.';
 draw();queueRecovery();
};
el('editStandeeTorch').onclick=()=>{
 const token=artDraft?.token;
 if(!token||roomProfile?.gm===false)return;
 el('standeeArtDialog').close();openStandeeHud(token,true);
};
el('editCombatStats').onclick=()=>{
 const token=artDraft?.token;
 if(!token||!canSeeStandeeStats(token))return;
 el('standeeArtDialog').close();openStandeeHud(token);
};
el('openPlannerCombat').onclick=()=>{
 const token=artDraft?.token;
 if(!token||roomProfile?.gm===false)return;
 el('standeeArtDialog').close();
 if(playing&&canUsePlayerRolls(token))openPlayCombat(token);else openPlannerCombat(token);
};
const catalogPolymorph=document.createElement('button');
catalogPolymorph.id='catalogPolymorph';
catalogPolymorph.type='button';
catalogPolymorph.textContent='Add to Polymorph catalog';
el('standeeLooks').append(catalogPolymorph);
catalogPolymorph.onclick=async()=>{
 if(!roomProfile?.gm||playing||!artDraft||!readLook())return;
 const {token,looks,index,size,sizeIndex}=artDraft;
 const name=prompt('Polymorph form name',el('standeeDisplayName').value.trim()||token.name)?.trim();
 if(!name)return;
 try{
  await roomRpc('polymorph',{ticket:roomProfile.token,operation:'save',draft:{
   ...token,name,looks,activeLook:index,size,sizeCategory:standeeSizes[sizeIndex].id,
   maxHp:optionalNumber('standeeMaxHp'),ac:token.ac
  }});
  el('artError').textContent='Polymorph form saved.';
 }catch(error){el('artError').textContent=error.message}
};
const saveSharedFamiliar=document.createElement('button');
saveSharedFamiliar.id='saveSharedFamiliar';
saveSharedFamiliar.type='button';
saveSharedFamiliar.textContent='Add to familiar catalog';
saveSharedFamiliar.hidden=true;
el('standeeLooks').append(saveSharedFamiliar);
saveSharedFamiliar.onclick=async()=>{
 if(!roomProfile?.gm||playing||!artDraft||!readLook())return;
 const {token,looks,index}=artDraft;
 const name=el('standeeDisplayName').value.trim();
 try{await saveFamiliarCatalogEntry({...token,displayName:name,looks,activeLook:index},true)}
 catch(error){el('artError').textContent=error.message}
};
el('artCancel').onclick=()=>el('standeeArtDialog').close();
el('standeeArtDialog').onclose=()=>{artDraft=null;bulkMarks=null;draw()};
el('standeeArtForm').onsubmit=async e=>{
 e.preventDefault();
 const faceAfterSave=e.submitter?.id==='standeeFaceToward';
 if(bulkMarks){saveBulkMarks();el('standeeArtDialog').close();refresh();return}
 if(!readLook()){el('standeeLooks').open=true;return}
 const {token,looks,index}=artDraft;
 if(roomProfile?.gm===false){
  if(!token||roomProfile?.gm===false&&!ownsRoomStandee(token))return;
  const submit=e.submitter;
  if(submit)submit.disabled=true;
  try{await customizeRoomObject(token,'looks',{looks,activeLook:index});el('standeeArtDialog').close();await pollRoom()}
  catch(err){el('artError').textContent=err.message;await pollRoom()}
  finally{if(submit)submit.disabled=false}
  return;
 }
 const ddbUrl=el('standeeDdbUrl').value.trim();
 const ddbId=ddbCharacterIdFromUrl(ddbUrl);
 if(ddbUrl&&!ddbId){el('artError').textContent='Enter a D&D Beyond character URL.';return}
 const hp=token.hp,maxHp=canSeeStandeeStats(token)?optionalNumber('standeeMaxHp'):token.maxHp;
 if(canSeeStandeeStats(token)&&hp!=null&&maxHp!=null&&hp>maxHp){el('artError').textContent='Current HP must be at or below max HP.';return}
 const flying=el('standeeFlying').checked;
 const altitude=flying?Number(el('standeeAltitude').value)/5:token.z;
 const otherPieces=[...pieces,...tokens.filter(t=>t!==token)];
 let position={...token,size:artDraft.size,flying,z:altitude};
 if(!flying&&token.flying){
  const levels=[...new Set([token.z,0,...pieces.map(p=>p.z+dimensions(p)[2])])].filter(z=>z<=token.z).sort((a,b)=>b-a);
  const landing=levels.map(z=>({...position,z})).find(p=>valid(p,otherPieces,null));
  if(landing)position=landing;
 }
 if(position.size!==token.size)position=resizedStandeePosition(token,position,otherPieces);
 if(!position||!valid(position,otherPieces,null)){
  el('artError').textContent=artDraft.size!==token.size?'The new base does not fit here. Move the standee to an open area or choose a smaller size.':'That altitude intersects terrain or another standee. Choose a clear height or move to a landing spot.';return;
 }
 const replacingDefault=token.looks?.[0]&&['front','back'].some(side=>uploadedStandeeImage(token.looks[0][side])&&token.looks[0][side]!==looks[0][side]);
 if(!replacingDefault)remember();
 token.x=position.x;token.y=position.y;token.flying=position.flying;token.z=position.z;token.size=position.size;
 token.sizeCategory=standeeSizes[artDraft.sizeIndex].id;
 token.looks=looks;token.activeLook=index;
 if(ddbId){token.ddbCharacterUrl=ddbUrl;token.ddbCharacterId=ddbId}else{delete token.ddbCharacterUrl;delete token.ddbCharacterId}
 if(canSeeStandeeStats(token)){
  for(const other of tokens)if(other===token||token.hpPoolId&&other.hpPoolId===token.hpPoolId)other.maxHp=maxHp;
  token.initiativeModifier=optionalNumber('standeeInitMod');
 }
 if(!playing){token.role=el('standeeRole').value;delete token.baseRole}
 const side=el('standeeMovementSide').value;
 if(side)token.movementSide=side;else delete token.movementSide;
 if(hudToken===token)openStandeeHud(token);
 token.displayName=el('standeeDisplayName').value.trim();
 token.nameVisibility=Number(el('standeeNameVisibility').value);
 if(roomProfile?roomProfile.gm:!playing){
  const changed=!!token.incognito!==el('standeeIncognito').checked;
  if(!roomProfile||roomProfile.gm){const range=Math.max(0,Math.min(300,Number(el('standeeDarkvision').value)||0)),kind=el('standeeVisionType').value;token.darkvision=kind==='dark'?range:0;token.blindsight=kind==='blindsight'?range:0;}
 token.incognito=el('standeeIncognito').checked;token.squad=el('standeeSquad').value;
  if(changed)publishInitiative();
 }
 const wasTargeted=token.manualTarget;
 token.manualTarget=el('standeeTargeted').checked;
 if(token.manualTarget&&!wasTargeted)faceTarget(token);
 token.conditions=[...el('standeeMarks').querySelectorAll('[data-condition]:checked')].map(input=>input.value);
 el('standeeArtDialog').close();
 if(faceAfterSave)armFacingTarget(token);else refresh();
};
const preferenceFields=[
 ['pingAnimation','battlemap.pingAnimation',1,value=>['0','1'].includes(value)],
 ['scrollZoomDirection','battlemap.scrollZoomDirection',0,value=>['0','1'].includes(value)],
 ...[['terrainLeft',1],['terrainMiddle',0],['terrainRight',2]].map(([id,fallback])=>[id,'battlemap.'+id,fallback,value=>['0','1','2'].includes(value)]),
 ['standeeReadoutSize','battlemap.standeeReadoutSize',100,value=>Number(value)>=60&&Number(value)<=200],
 ['standeeNameDefault','battlemap.standeeNameDefault',3,value=>['1','2','3','4','5'].includes(value)],
 ['fogMemory','battlemap.fogMemory',1,value=>['0','1'].includes(value)],
 ['graphicsQuality','battlemap.graphicsQuality',2,value=>['0','1','2','3','4'].includes(value)],
 ['focusZoom','battlemap.standeeFocusZoom',350,value=>Number(value)>=100&&Number(value)<=1200],
 ['markerSize','battlemap.initiativeMarkerSize',100,value=>Number(value)>=50&&Number(value)<=200],
 ['markerColor','battlemap.initiativeMarkerColor','#f3e2b8',value=>/^#[0-9a-f]{6}$/i.test(value)]
];
const preferences={};
try{el('hideOtherHp').checked=localStorage.getItem('battlemap.hideOtherHp')==='1'}catch{}
el('hideOtherHp').onchange=()=>{
 const enabled=el('hideOtherHp').checked;
 try{localStorage.setItem('battlemap.hideOtherHp',enabled?'1':'0')}catch(error){
  console.warn('HP privacy preference could not be cached locally; the scene setting will still apply.',error);
 }
 if(roomProfile?.gm!==false){
  for(const t of tokens)t.hideOtherHp=enabled;
  draw('HP privacy preference');
  scheduleRoomPatch();
 }
};
const persistentDisplayFields=new Set(['pingAnimation','scrollZoomDirection','terrainLeft','terrainMiddle','terrainRight','standeeReadoutSize','standeeNameDefault','graphicsQuality']);
const displayPreferenceRecords=new Map();
function displayPreferenceRecord(key){
 try{
  const raw=localStorage.getItem(key+'.record');
  return raw?JSON.parse(raw):null;
 }catch{return null}
}
function setPreferenceControl(id,value){
 const input=el(id),output=el(id+'Value');
 if(id==='fogMemory')input.checked=Number(value)===0;
 input.value=value;
 preferences[id]=id==='markerColor'?input.value:Number(input.value);
 if(output)output.textContent=input.value+'%';
}
async function recoverDisplayPreferences(){
 await Promise.all(preferenceFields.filter(([id])=>persistentDisplayFields.has(id)).map(async ([id,key,,valid])=>{
  const backup=await savedValue(key+'.record',null),local=displayPreferenceRecords.get(id);
  if(backup&&valid(String(backup.value))&&Number.isFinite(backup.at)&&(!local||backup.at>local.at)){
   displayPreferenceRecords.set(id,backup);setPreferenceControl(id,backup.value);
  }
 }));
}
let preferencePreview=null;
for(const [id,key,fallback,valid] of preferenceFields){
 let saved;
 try{saved=localStorage.getItem(key)}catch{}
 const input=el(id);
 const record=persistentDisplayFields.has(id)?displayPreferenceRecord(key):null;
 if(record&&valid(String(record.value))&&Number.isFinite(record.at)){
  displayPreferenceRecords.set(id,record);saved=String(record.value);
 }
 setPreferenceControl(id,saved&&valid(saved)?saved:fallback);
 function save(){
  const value=id==='fogMemory'?(input.checked?'0':'1'):input.value;
  if(!valid(value))return;
  setPreferenceControl(id,value);
  try{localStorage.setItem(key,value)}catch{}
  if(persistentDisplayFields.has(id)){
   const previous=displayPreferenceRecords.get(id);
   if(previous?.value!==value){
    const next={value,at:Date.now()};
    displayPreferenceRecords.set(id,next);
    try{localStorage.setItem(key+'.record',JSON.stringify(next))}catch{}
    storeValue(key+'.record',next);
   }
  }
  if(id!=='graphicsQuality')queueWorkspacePreferences();
  if(id.startsWith('terrain')||id==='scrollZoomDirection'||id==='pingAnimation')return;
  queueRecovery();drawPreferencePreview();
 }
 input.oninput=save;
 input.onchange=save;
}
function untouchedOldMouseDefaults(saved){
 return Number(saved.terrainLeft)===0&&Number(saved.terrainMiddle)===1&&
  !displayPreferenceRecords.has('terrainLeft')&&!displayPreferenceRecords.has('terrainMiddle');
}
if(untouchedOldMouseDefaults(preferences)){
 setPreferenceControl('terrainLeft',1);setPreferenceControl('terrainMiddle',0);
}
el('resetTerrainMouse').onclick=()=>{
 for(const [id,value] of [['terrainLeft',1],['terrainMiddle',0],['terrainRight',2]]){el(id).value=value;el(id).onchange()}
};
function drawPreferencePreview(){
 if(!preferencePreview){draw();return}
 preferencePreview.started=true;
 focusStandee(preferencePreview.target);
}
el('preferences').onclick=()=>{
 el('standeeNameDefault').disabled=playing;
 const token=linkedStandee(activeInitiative)||tokens[0];
 preferencePreview={zoom,panX,panY,target:token||{x:19.5,y:19.5,z:0,size:1}};
 el('previewHint').textContent=token?'Adjust a setting to preview it on the map.':'Adjust a setting to preview it with a sample marker.';
 el('hideOtherHp').parentElement.hidden=roomProfile?.gm===false;
 // The active scene is authoritative: localStorage may be full or unavailable.
 const sceneHpSetting=tokens.find(t=>typeof t.hideOtherHp==='boolean');
 if(sceneHpSetting)el('hideOtherHp').checked=sceneHpSetting.hideOtherHp;
 el('preferencesDialog').showModal();
};
el('preferencesDialog').onclose=()=>{
 if(!preferencePreview)return;
 const preview=preferencePreview;
 preferencePreview=null;
 if(!preview.started)return;
 ({zoom,panX,panY}=preview);
 draw();
};
function focusStandee(token,action='Focus standee',partyRoster=false,{preserveZoom=false}={}){
 if(standeeHidden(token)&&!(partyRoster&&baseStandeeRole(token)==='pc'&&!token.incognito))return;
 if(!preferencePreview)currentMoveReadouts().delete(moveReadoutKey(token));
 if(!preferencePreview){focusedTitle=token;focusedTitleFade=null}
 const target=carry?.piece===token&&ghost?ghost:token;
 if(!preserveZoom)zoom=preferences.focusZoom/100;
 S=Math.min(W/(gridLimit(0)+17),H/(gridLimit(1)+6))*zoom;
 const [x,y]=point(...basePoint(target));
 panX+=W/2-x;
 panY+=H*(preferencePreview&&W<600?.30:.50)-(y-standeeArtHeight(target)/2);
 if(!preferencePreview)setFocusCutaway(token);
 draw(action);
}
const initiativeEntries=new Map();
let activeInitiative=null,linkingInitiative=null,pingStarted=null,pingFrame=null;
function initiativeOrder(){
 return [...initiativeEntries.entries()].sort((a,b)=>b[1].total-a[1].total);
}
function initiativeKeyFor(token){return [...initiativeEntries.keys()].find(key=>token.initiativeKey===key||token.roomId&&initiativeEntries.get(key)?.roomId===token.roomId)}
function linkedStandee(key){return tokens.find(token=>token.initiativeKey===key||token.roomId&&token.roomId===initiativeEntries.get(key)?.roomId)}
function moveInitiative(step,focus=false){
 const order=initiativeOrder();
 if(!order.length||roomProfile&&!roomProfile.gm)return;
 const index=order.findIndex(([key])=>key===activeInitiative);
 const next=index<0?(step>0?0:order.length-1):(index+step+order.length)%order.length;
 if(index>=0&&step>0&&next===0)roomRound++;
 if(index>=0&&step<0&&next===order.length-1&&index===0)roomRound=Math.max(1,roomRound-1);
 activeInitiative=order[next][0];linkingInitiative=null;
 pingStarted=performance.now();
 const token=focus?linkedStandee(activeInitiative):null;
 if(token)focusStandee(token,'Initiative focus');
 publishInitiative();refresh('Initiative advance');
}
function drawInitiativePing(){
 const token=preferencePreview?.target||(activeInitiative===null?null:linkedStandee(activeInitiative));
 if(!token||standeeHidden(token)||standeeObscured(token))return;
 const [x,baseY]=point(...basePoint(carry?.piece===token&&ghost?ghost:token));
 const scale=markerScale(S*token.size*(token.size>1?.95:.78)*standeeScale(token));
 const size=preferences.markerSize/100*scale;
 const rendered=faces.find(f=>f.standee&&(f.p===token||(carry?.piece===token&&f.p===ghost)));
 const top=rendered?.artTop??(baseY-(preferencePreview?.target===token&&!tokens.includes(token)?0:standeeArtHeight(token)));
 const y=top-15*size-(token.manualTarget||hasTrackedTargetMark(token)||token.conditions?.length||token.squad?17*scale:0);
 const age=preferencePreview||pingStarted===null?Infinity:(performance.now()-pingStarted)/1100;
 ctx.save();
 if(age<1){
  ctx.globalAlpha=.45*(1-age);
  ctx.strokeStyle='#644d35';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(x,y,(10+14*age)*size,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=1;
  if(pingFrame===null)pingFrame=requestAnimationFrame(()=>{pingFrame=null;draw()});
 }
 ctx.translate(x,y);ctx.scale(size,size);
 polygon([[0,-9],[8,-2],[0,9],[-8,-2]],preferences.markerColor,'#382c20');
 const color=preferences.markerColor;
 const luminance=[1,3,5].reduce((sum,i,n)=>sum+parseInt(color.slice(i,i+2),16)*[.2126,.7152,.0722][n],0);
 polygon([[-3,-2],[3,-2],[0,3]],luminance>135?'#382c20':'#fff6e5',null);
 ctx.restore();
}
function focusInitiativeStandee(token,openCombat=false,preserveAngle=false){
 const target=carry?.piece===token&&ghost?ghost:token;
 if(openCombat&&roomProfile?.gm!==false)gmVisionStandee=null;
 focusMapTarget(basePoint(target),token,{preserveAngle});
 if(openCombat)openPlayCombat(token);
}
function initiativeFocusButton(name,center){
 const focus=document.createElement('button');
 focus.type='button';focus.className='initiative-focus';
 focus.title='Center standee';focus.setAttribute('aria-label','Center '+name+' on the map');
 focus.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/></svg>';
 focus.onclick=center;
 return focus;
}
function updateInitiativePanel(){
 const entries=initiativeOrder();
 const takingTurns=initiativeEntries.has(activeInitiative);
 el('initiativeRound').textContent=entries.length?'· Round '+roomRound:'';
 const list=el('initiativeList');
 list.replaceChildren();
 for(const [key,{name,total}] of entries){
  const item=document.createElement('li');
  const label=document.createElement('span'),score=document.createElement('strong');
  const members=tokens.filter(t=>t.initiativeKey===key&&!standeeHidden(t)).length;
  label.textContent=name+(members>1?' · '+members+' standees':'');score.textContent=String(total);
  if(key===activeInitiative)item.setAttribute('aria-current','true');
  const link=document.createElement('button');link.type='button';
  const token=linkedStandee(key);
  if(token&&!standeeHidden(token)){
   label.dataset.initiativeName='';
   label.title='Space+click to focus on the map';
   label.onclick=(e,detachedSpaceHeld=false)=>{
    if(!cameraFocusHeld&&!detachedSpaceHeld)return;
    e.preventDefault();
    if(!detachedSpaceHeld)cameraFocusUsed=true;
    focusInitiativeStandee(token,false,true);
   };
  }
  link.textContent=linkingInitiative===key?'Cancel':token?'Relink':'Link';
  link.setAttribute('aria-label',linkingInitiative===key?'Cancel standee linking':(token?'Relink ':'Link ')+'standee for '+name);
  link.onclick=()=>{
   const next=linkingInitiative===key?null:key;
   exitTool();linkingInitiative=next;refresh();
  };
  if(roomProfile?.gm!==false){
   const edit=catalogButton(String(total),()=>{
    const raw=prompt('Initiative for '+name,String(total));
    if(raw===null||!raw.trim()||!Number.isFinite(Number(raw)))return;
    remember(true);
    initiativeEntries.get(key).total=Number(raw);
    publishInitiative();refresh();
   });
   edit.setAttribute('aria-label','Edit initiative for '+name);
   item.append(label,edit,link);
   const linked=tokens.filter(t=>t.initiativeKey===key||t===token);
   for(const member of linked){
    const toggle=catalogButton(member.incognito?'Reveal':'Incognito',()=>{
     remember(true);
     member.incognito=!member.incognito;
     publishInitiative();refresh();
    });
    toggle.setAttribute('aria-label',(member.incognito?'Reveal ':'Hide ')+libraryName(member));
    if(linked.length>1)toggle.textContent+=' '+libraryName(member);
    item.append(toggle);
   }
  }else item.append(label,score,link);
  if(token){
   item.append(initiativeFocusButton(name,()=>roomProfile?.gm===false?focusStandee(token):focusInitiativeStandee(token,true)));
  }
  list.append(item);
 }
 if(!takingTurns)for(const token of tokens){
  if(baseStandeeRole(token)!=='pc'||roomProfile?.gm===false&&token.incognito||initiativeKeyFor(token)!==undefined)continue;
  const name=libraryName(token),item=document.createElement('li'),label=document.createElement('span');
  label.textContent=name;
  item.append(label,initiativeFocusButton(name,()=>focusStandee(token,'Focus standee',true)));
  list.append(item);
 }
 el('initiativeEmpty').hidden=list.childElementCount>0;
 el('initiativeClear').disabled=!entries.length;
 for(const id of ['initiativePrevious','initiativeNext','initiativePreviousFocus','initiativeNextFocus'])el(id).disabled=!entries.length;
 el('initiativeHint').textContent=linkingInitiative!==null?'Click a standee to link '+initiativeEntries.get(linkingInitiative)?.name+'.':initiativeEntries.has(activeInitiative)?initiativeEntries.get(activeInitiative).name+' is up.':'';
}
function showInitiative(open){
 el('initiativePanel').hidden=!open||panelIsDetached('initiative');
 el('initiativeToggle').setAttribute('aria-expanded',String(open));queueRecovery();
}
el('initiativeToggle').onclick=()=>{if(panelIsDetached('initiative'))detachedPanels.get('initiative').win.focus();else showInitiative(el('initiativePanel').hidden)};
el('initiativeClear').onclick=()=>{if(roomProfile&&!roomProfile.gm)return;initiativeEntries.clear();activeInitiative=null;linkingInitiative=null;roomRound=1;publishInitiative();refresh()};
el('initiativePrevious').onclick=()=>moveInitiative(-1);
el('initiativeNext').onclick=()=>moveInitiative(1);
el('initiativePreviousFocus').onclick=()=>moveInitiative(-1,true);
el('initiativeNextFocus').onclick=()=>moveInitiative(1,true);
function captureInitiative(data,character){
 const request=data.request;
 if(request?.type!=='initiative'&&!(String(request?.type??'')===''&&/^initiative$/i.test(String(data.title??'').trim())))return false;
 const name=String(character||request?.character?.name||'').trim();
 const rolls=Array.isArray(data.attack_rolls)?data.attack_rolls:[];
 const roll=rolls.find(r=>r&&!r.discarded&&r.total!=null&&String(r.total).trim()!==''&&Number.isFinite(Number(r.total)));
 if(!name||!roll)return false;
 const actor=request?.character;
 const id=actor?.id;
 const key=(id==null?'':String(id)+':')+name.toLowerCase();
 const rawModifier=request?.initiative;
 const modifier=rawModifier!=null&&/^[+-]?\d+$/.test(String(rawModifier))?Number(rawModifier):null;
 const matching=tokens.filter(token=>[token.displayName,token.name].some(value=>value?.trim().toLowerCase()===name.toLowerCase()));
 const token=matching.length===1?matching[0]:null;
 const entryKey=token?(initiativeKeyFor(token)??key):key;
 if(token)token.initiativeKey=entryKey;
 initiativeEntries.set(entryKey,{...initiativeEntries.get(entryKey),name,total:Number(roll.total),modifier});
 updateInitiativePanel();
 showInitiative(true);
 return true;
}
const chatFilterIds=['chatFilterName','chatFilterType','chatFilterVisibility','chatFilterHidden','chatFilterSearch'];
