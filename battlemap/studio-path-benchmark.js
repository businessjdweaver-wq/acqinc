// Run the production render paths against local copies of one doorway and
// observer. Each synthetic draw restores the live state before yielding.
const pathWallBenchmarkButton=document.createElement('button');
pathWallBenchmarkButton.type='button';
pathWallBenchmarkButton.textContent='Compare path-wall renderers';
wallCompareButton.insertAdjacentElement('afterend',pathWallBenchmarkButton);
const pathWallBenchmarkStatus=document.createElement('output');
pathWallBenchmarkStatus.id='pathWallBenchmarkStatus';
pathWallBenchmarkStatus.setAttribute('role','status');
pathWallBenchmarkButton.insertAdjacentElement('afterend',pathWallBenchmarkStatus);
pathWallBenchmarkButton.onclick=()=>{
 pathWallBenchmarkStatus.textContent='Preparing renderer comparison…';
 void runPathWallBenchmark().catch(error=>{
  pathWallBenchmarkStatus.textContent='Could not start the renderer comparison: '+error.message;
  console.error('Path-wall benchmark setup failed',error);
 });
};

function benchmarkDoorRoute(token){
 const start=basePoint(token);
 const walls=sceneWallPaths(),candidates=[];
 const appearance=areas.find(a=>a.shape==='appearance');
 function addCandidate(opening,a,b,z,thickness,withDoor,kind){
  if(opening.secret||opening.locked||Math.abs(start[2]-z)>.25)return;
  const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
  const distance=Math.hypot(start[0]-x,start[1]-y),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(distance>3||length+1e-5<token.size)return;
  const nx=(a[1]-b[1])/length,ny=(b[0]-a[0])/length;
  const side=Math.sign((start[0]-x)*nx+(start[1]-y)*ny)||1;
  const offset=(token.size/2+thickness/2+.25)*side;
  const from=[x+nx*offset,y+ny*offset,start[2]],to=[x-nx*offset,y-ny*offset,start[2]];
  if(![from,to].every(([px,py])=>px>=token.size/2&&py>=token.size/2&&
   px<=gridLimit(0)-token.size/2&&py<=gridLimit(1)-token.size/2&&visibleProjection([point(px,py,z)])))return;
  candidates.push({kind,distance,from,to,withDoor});
 }
 for(const wall of walls){
  for(const {opening,a,b} of compileWallPath(wall).openings){
   if(opening.kind!=='Door')continue;
   addCandidate(opening,a,b,wall.z+opening.sill,wall.thickness,open=>areas.map(area=>area!==appearance?area:{
    ...area,wallPaths:walls.map(item=>item!==wall?item:{...item,openings:item.openings.map(door=>door!==opening?door:{...door,open})})
   }),'Path-wall door');
  }
 }
 for(const opening of areas){
  if(opening.shape!=='opening'||opening.kind!=='Door'||!opening.origin)continue;
  const [x,y,z]=opening.origin;
  const half=(opening.doorWidth??1)/2;
  const a=opening.angle===0?[x+.5-half,y+.5]:[x+.5,y+.5-half];
  const b=opening.angle===0?[x+.5+half,y+.5]:[x+.5,y+.5+half];
  addCandidate(opening,a,b,z,.1,open=>areas.map(area=>area!==opening?area:{...area,open}),'Legacy door');
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 for(const candidate of candidates){
  const {withDoor,...route}=candidate;
  const opened=withDoor(true),closed=withDoor(false);
  const liveAreas=areas;
  try{
   areas=opened;
   if(!movementSegment(candidate.from,candidate.to,token).blocked)return {...route,opened,closed};
  }finally{areas=liveAreas}
 }
 return null;
}

function pathWallBenchmarkStats(samples,key,quantile=.5){
 const values=samples.map(s=>s[key]).filter(Number.isFinite).sort((a,b)=>a-b);
 if(!values.length)return null;
 if(quantile===.5&&values.length%2===0)return roundedMs((values[values.length/2-1]+values[values.length/2])/2);
 return values[Math.ceil(values.length*quantile)-1];
}

function pathWallBenchmarkCamera(midpoint,heading){
 const live={angle,tilt,C,D,panX,panY};
 try{
  angle=heading;tilt=.69;
  C=Math.cos(angle);D=Math.sin(angle);
  panX=0;panY=0;
  const [x,y]=point(...midpoint);
  return {angle,tilt,zoom,panX:W/2-x,panY:H*.55-y};
 }finally{({angle,tilt,C,D,panX,panY}=live)}
}

async function runPathWallBenchmark(){
 const status=pathWallBenchmarkStatus;
 if(pathWallBenchmarkButton.disabled)return;
 if(roomProfile?.gm!==false){status.textContent='Join as a player to run this lighting and visibility comparison.';return}
 const unsupported=studioWebGLUnavailableReason();
 if(unsupported){status.textContent=unsupported;return}
 const floorImage=webGLFloorImage(areas.find(a=>a.shape==='appearance')?.appearance);
 if(floorImage&&!floorImage.complete){status.textContent='The floor image is loading. Retry when it finishes.';return}

 if(document.hidden||drag||carry||moveConfirmPending||cameraDetailTimer!==null||!W||!H){
  status.textContent='Finish movement and let the camera settle before running the benchmark.';return;
 }
 if(topDown){status.textContent='Switch to the 3D view to run the rotation comparison.';return}
 const eligible=t=>t?.type==='standee'&&ownsRoomStandee(t)&&!t.flying&&!t.incognito&&!t.conditions?.includes('dead');
 const token=eligible(selected)?selected:tokens.find(eligible);
 if(!token){status.textContent='Select a standee you control to run the benchmark.';return}
 const door=benchmarkDoorRoute(token);
 if(!door){status.textContent='Move beside a visible, unlocked door with room on both sides, then retry.';return}
 try{prepareStudioWebGL()}
 catch(error){status.textContent='WebGL unavailable. '+error.message;return}

 const midpoint=door.from.map((value,index)=>(value+door.to[index])/2);
 const camera=pathWallBenchmarkCamera(midpoint,-.64),scene=currentSceneId,revision=roomRevision;
 const dimensionsAtStart=[W,H],quality=preferences.graphicsQuality;
 const rendererBefore=studioWebGLEnabled,results=[];
 const controls=[pathWallBenchmarkButton,wallCompareButton,railButton,
  ...['studioWebGLToggle','performanceTest','performanceTextureTest','performanceReset','performanceCopy'].map(el)];
 const disabled=controls.map(control=>control.disabled);
 controls.forEach(control=>control.disabled=true);
 const interrupt=new AbortController();
 for(const type of ['pointerdown','keydown','wheel','visibilitychange']){
  document.addEventListener(type,()=>interrupt.abort(),{capture:true,signal:interrupt.signal});
 }
 pathWallBenchmarkReport=null;
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 const validate=()=>{
  if(interrupt.signal.aborted||document.hidden||scene!==currentSceneId||revision!==roomRevision||
   !tokens.includes(token)||carry||drag||!playing||topDown||W!==dimensionsAtStart[0]||H!==dimensionsAtStart[1]||
   preferences.graphicsQuality!==quality)throw Error('Benchmark interrupted. Keep the scene still and the tab visible, then retry.');
 };
 try{
  for(const [index,webgl] of [false,true,true,false].entries()){
   validate();
   const renderer=webgl?'WebGL':'Standard';
   status.textContent='Path-wall comparison · pass '+(index+1)+' of 4 · '+renderer;
   const observer={...token};
   const testTokens=tokens.map(t=>t===token?observer:t);
   studioWebGLFrame=null;
   fogCache=null;fogSectorRayCache=null;
   const memory=fogMemoryState;
   let testMemory=memory?{...memory,seen:new Set(memory.seen),shading:new Map(memory.shading)}:null;
   const samples=[];
   let workerJob=null;
   function measure(phase,action,position,opened,offset=0,preview=false){
    const live={areas,tokens,selected,angle,tilt,zoom,panX,panY,C,D,fogMemoryState,pendingFogTravel,
     progressiveLight,studioWebGLEnabled,playerStandeePreview};
    pathWallBenchmarkDrawing=true;
    try{
     areas=opened?door.opened:door.closed;
     tokens=testTokens;selected=observer;
     Object.assign(observer,{x:position[0]-token.size/2,y:position[1]-token.size/2,z:position[2]});
     ({angle,tilt,zoom,panX,panY}=offset?pathWallBenchmarkCamera(midpoint,camera.angle+offset):camera);
     C=Math.cos(angle);D=Math.sin(angle);
     studioWebGLEnabled=webgl;
     fogMemoryState=testMemory;
     pendingFogTravel=null;
     playerStandeePreview=null;
     const started=performance.now();
     if(preview){
      const next={...observer,x:door.to[0]-token.size/2,y:door.to[1]-token.size/2,z:door.to[2]};
      playerStandeePreview={scene:currentSceneId,token:next};
      paintPlayerStandees(next);
      samples.push({phase,drawMs:roundedMs(performance.now()-started)});
      if(webgl)workerJob=queueWorkerSightlines(next,observer);
      return;
     }
     draw(action);
     const sample=performanceSamples.at(-1);
     if(sample?.action!==action||webgl&&sample.renderer!=='WebGL trial'||webgl&&!studioWebGLEnabled)
      throw Error('The selected renderer could not finish the benchmark.');
     if(phase!=='Warmup')samples.push({...sample,phase});
    }finally{
     testMemory=fogMemoryState;
     ({areas,tokens,selected,angle,tilt,zoom,panX,panY,C,D,fogMemoryState,pendingFogTravel,
      progressiveLight,studioWebGLEnabled,playerStandeePreview}=live);
     pathWallBenchmarkDrawing=false;
    }
   }
   const step=async(...args)=>{const time=await frame();validate();measure(...args);return time};
   const orbit=async(opened,position,afterMove)=>{
    let prior;
    for(const [i,offset] of offsets.entries()){
     const phase=afterMove?(i===0?'First orbit after move':'Orbit after move'):'Orbit before move';
     const time=await step(phase,'Test: Orbit preview',position,opened,offset);
     if(prior!==undefined)samples.at(-1).frameIntervalMs=roundedMs(time-prior);
     prior=time;
    }
   };
   const offsets=[-.06,-.12,-.18,-.24,-.18,-.12,-.06,0];
   await step('Warmup','Test: Path wall warmup',door.from,false);
   await orbit(false,door.from,false);
   await step('Open door','Test: Path wall opening',door.from,true);
   await step('Standee preview','Test: Path wall standee preview',door.from,true,0,true);
   if(workerJob){
    const waiting=performance.now();
    await waitForWebGLFogRays(workerJob);
    samples.push({phase:'Fog worker preparation',waitMs:roundedMs(performance.now()-waiting),
     workerMs:workerJob.workerMs??null,pending:workerJob.pending,points:workerJob.points.length,lightPoints:workerJob.lightPoints.length});
   }
   await step('Confirmed move','Confirmed move · medium',door.to,true);
   await orbit(true,door.to,true);
   results.push({renderer,pass:index+1,samples});
  }
  const phases=['Orbit before move','Open door','Standee preview','Confirmed move','First orbit after move','Orbit after move'];
  const summary=['Standard','WebGL'].map(renderer=>({renderer,phases:phases.map(phase=>{
   const samples=results.filter(result=>result.renderer===renderer).flatMap(result=>result.samples).filter(s=>s.phase===phase);
   return {phase,count:samples.length,medianDrawMs:pathWallBenchmarkStats(samples,'drawMs'),
    p95DrawMs:pathWallBenchmarkStats(samples,'drawMs',.95),p95FrameIntervalMs:pathWallBenchmarkStats(samples,'frameIntervalMs',.95),medianFogMs:pathWallBenchmarkStats(samples,'fogGeometryMs'),
    medianTexturedFaces:pathWallBenchmarkStats(samples,'webGLTexturedFaces'),
    medianCutawayFaces:pathWallBenchmarkStats(samples,'webGLCutawayFaces'),
    medianWorkerSightHits:pathWallBenchmarkStats(samples,'fogWorkerSightHits'),medianWorkerLightHits:pathWallBenchmarkStats(samples,'fogWorkerLightHits')};
  })}));
  pathWallBenchmarkReport={camera,viewport:dimensionsAtStart,quality,pieces:pieces.length,
   pathWalls:sceneWallPaths().length,door:{kind:door.kind,from:door.from,to:door.to},
   summary,passes:results,notes:'Local synthetic replay. Draw times exclude network, presentation and deferred sharp-light work. Orbit frame intervals are measured between animation callbacks.'};
  status.textContent=summary.map(({renderer,phases})=>renderer+' · move '+phases[3].medianDrawMs+
   ' ms · first orbit '+phases[4].medianDrawMs+' ms').join(' / ')+' · Copy log to share.';
 }catch(error){status.textContent=error.message;console.error('Path-wall benchmark interrupted',error)}
 finally{
  interrupt.abort();
  studioWebGLEnabled=rendererBefore;
  studioWebGLFrame=null;fogCache=null;fogSectorRayCache=null;
  controls.forEach((control,index)=>control.disabled=disabled[index]);
  draw('Test: restore');updatePerformanceReadout();
 }
}
