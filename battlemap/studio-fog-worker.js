'use strict';

// The visibility query uses the same prism, terrain rotation, and interval
// tests as the main renderer. Keep these in sync with studio-engine.js.
const dimensions=terrain=>terrain.size;
let currentSceneId=null,blockers=[];
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
function turnTerrainPoints(points,p,degrees=p?.terrainYaw){
 if(!degrees||p.type==='standee')return points;
 const [w,d]=dimensions(p),cx=p.x+w/2,cy=p.y+d/2;
 const radians=degrees*Math.PI/180,c=Math.cos(radians),sin=Math.sin(radians);
 return points.map(([x,y,...rest])=>[cx+(x-cx)*c-(y-cy)*sin,cy+(x-cx)*sin+(y-cy)*c,...rest]);
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
function sightlineClear(eye,target,blockers){
 return !rayBlockerCandidates(blockers,eye,target).some(bounds=>{
  if(bounds.wallPrism){
   const solid=bounds.wallPrism,span=!wallPassage(solid).sight&&wallPrismInterval(solid,eye,target);
   return span&&span[0]<.995;
  }
  const path=bounds.terrain?turnTerrainPoints([eye,target],bounds.terrain,-bounds.terrain.terrainYaw):[eye,target];
  const interval=movementInterval(...path,bounds);
  return interval&&interval[0]<.995;
 });
}
function wallPassage(solid){return solid}
function wallRayTransmission(start,end,blockers){
 let transmission=1;
 const traversed=new Map();
 for(const bounds of rayBlockerCandidates(blockers,start,end)){
  if(bounds.wallPrism){
   const solid=bounds.wallPrism;
   if(!wallPrismInterval(solid,start,end))continue;
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

self.onmessage=({data})=>{
 const {id,eye,points=[],lightStart,lightPoints=[],repaintRays}=data;
 try{
  if(data.blockers){
   blockers=data.blockers.map(record=>Object.assign(record.bounds,{wallPrism:record.prism,terrain:record.terrain}));
   completeSceneRayBlockers=blockers;
  }
  const started=performance.now(),visible=new Uint8Array(points.length);
  for(let i=0;i<points.length;i++)visible[i]=sightlineClear(eye,points[i],blockers);
  const transmission=new Float64Array(repaintRays?.length??lightPoints.length);
  if(repaintRays){
   for(let i=0;i<repaintRays.length;i++){
    const [start,end]=repaintRays[i];
    transmission[i]=wallRayTransmission(start,end,blockers);
   }
  }else{
   for(let i=0;i<lightPoints.length;i++)transmission[i]=wallRayTransmission(lightStart,lightPoints[i],blockers);
  }
  self.postMessage({id,visible,transmission,elapsedMs:performance.now()-started},[visible.buffer,transmission.buffer]);
 }catch{self.postMessage({id,error:true})}
};
