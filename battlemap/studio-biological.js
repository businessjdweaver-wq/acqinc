/* WebGL living-dungeon assets. All coordinates are local to the component footprint. */
const biologicalComponents=Object.freeze({
 tissueWall:['Fleshy wall','flesh','#943c52'], tissueColumn:['Tissue column','muscle','#962b43'],
 incubationSac:['Incubation sacs','flesh','#ae6cbb'], organCluster:['Brain and organs','flesh','#ac596c'],
 heart:['Heart','muscle','#a52343'], tendrils:['Branching tendrils','muscle','#853d62'],
 ribCage:['Teeth and ribs','bone','#d5ba96'], tissuePit:['Tissue pit','necrosis','#68374b'],
 nerveNode:['Nerve node','chitin','#533040'], biologicalPool:['Biological pool','fluid','#717943']
});
const biologicalPatterns=Object.freeze({
 bioVeins:['Vascular network','flesh','#650f38'],bioMuscle:['Muscle fibers','muscle','#a24a50'],
 bioCells:['Cell membranes','flesh','#985079'],bioHoneycomb:['Organic cavities','chitin','#54313d'],
 bioFolds:['Intestinal folds','flesh','#995145'],bioPustules:['Pustules','flesh','#cb925b'],
 bioCalcified:['Calcified growth','bone','#cbae8b'],bioNerves:['Black nerves','chitin','#251624'],
 bioMucous:['Mucous patches','fluid','#92974a'],bioCorruption:['Corrupted tissue','necrosis','#4a394c']
});
const biologicalPresets=Object.freeze({
 bioLiving:['Living organism','#794351','#94485b','#663241','bioVeins','bioMuscle'],
 bioHive:['Aberration hive','#513761','#835895','#423040','bioCells','bioHoneycomb'],
 bioDigestive:['Digestive tract','#716335','#8c7941','#74503b','bioMucous','bioFolds'],
 bioNecrotic:['Necrotic infestation','#383735','#53543e','#49354a','bioCorruption','bioNerves'],
 bioSkeletal:['Skeletal interior','#827361','#bda686','#71434a','bioCalcified','bioFolds']
});
function biologicalRandom(seed){
 let state=seed>>>0;
 return ()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
}
const biologicalMeshCache=new Map();
function biologicalMesh(kind,seed=1,detail=1){
 const key=kind+':'+seed+':'+detail;
 if(biologicalMeshCache.has(key))return biologicalMeshCache.get(key);
 const rand=biologicalRandom(seed),faces=[],tau=Math.PI*2,sides=[6,8,12][detail]??8;
 const emit=(points,tone=1,material)=>faces.push({points,tone,material});
 function ringStrip(rings,material){
  for(let i=1;i<rings.length;i++)for(let j=0;j<sides;j++){
   const n=(j+1)%sides;
   emit([rings[i-1][j],rings[i-1][n],rings[i][n],rings[i][j]],.75+.22*(1+Math.sin(j*tau/sides))/2,material);
  }
 }
 function tube(path,radius,material,ridge=.14){
  const phase=rand()*tau;
  const rings=path.map(([x,y,z],i)=>{
   const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
   const [dx,dy,dz]=b.map((v,j)=>v-a[j]),l=Math.hypot(dx,dy,dz)||1;
   const h=Math.hypot(dx,dy),u=h>1e-7?[-dy/h,dx/h,0]:[1,0,0];
   const v=[dy*u[2]-dz*u[1],dz*u[0]-dx*u[2],dx*u[1]-dy*u[0]].map(n=>n/l);
   return Array.from({length:sides},(_,j)=>{
    const angle=tau*j/sides, r=radius(i,path.length)*(1+ridge*Math.sin(j*3+i+phase));
    return [x,y,z].map((value,k)=>value+r*(u[k]*Math.cos(angle)+v[k]*Math.sin(angle)));
   });
  });
  ringStrip(rings,material);
  emit([...rings[0]].reverse(),.85,material);emit(rings.at(-1),.95,material);
 }
 function lobe(x,y,z,w,d,h,material){
  const phase=rand()*tau,count=detail+4;
  ringStrip(Array.from({length:count+1},(_,i)=>{
   const a=.02+(Math.PI-.04)*i/count;
   return Array.from({length:sides},(_,j)=>{
    const b=j*tau/sides,bulge=Math.sin(a)*(1+.11*Math.sin(3*b+phase+i*.6));
    return [x+w*Math.cos(b)*bulge,y+d*Math.sin(b)*bulge,z+h*Math.cos(a)];
   });
  }),material);
 }
 function basin(fluid){
  const phase=rand()*tau;
  const rings=[[.48,.24],[.42,.29],[.34,.18],[.28,.08]].map(([r,z])=>
   Array.from({length:sides},(_,j)=>{
    const a=j*tau/sides,k=1+.08*Math.sin(a*3+phase)+.06*Math.cos(a*5);
    return [r*k*Math.cos(a),r*k*Math.sin(a),z];
   }));
  ringStrip(rings,'flesh');
  emit(rings.at(-1),fluid ? .95 : .48,fluid?'fluid':'necrosis');
 }
 switch(kind){
 case 'tissueWall':
  for(let z=.18;z<.9;z+=.19)tube([[-.4,-.08,z],[-.22,.07,z+.035],[.04,-.025,z-.04],[.22,.08,z+.035],[.38,-.05,z]],i=>.095+.025*Math.sin(i+z*8),'flesh',.25);
  break;
 case 'tissueColumn':
  tube([[0,0,.08],[.08,-.06,.25],[-.06,.09,.47],[.08,.05,.69],[0,-.03,.87]],i=>[.26,.2,.15,.19,.12][i],'muscle',.23);
  break;
 case 'incubationSac':
  lobe(0,0,.4,.30,.3,.38,'flesh');
  for(let i=0;i<3;i++){const a=i*tau/3;lobe(.3*Math.cos(a),.3*Math.sin(a),.19,.15,.15,.17,'flesh')}
  break;
 case 'organCluster':
  for(let i=0;i<6;i++){const a=i*tau/6;lobe(.22*Math.cos(a),.22*Math.sin(a),.24+rand()*.1,.24,.20,.22,'flesh')}
  break;
 case 'heart':
  lobe(-.1,0,.39,.27,.27,.33,'muscle');lobe(.14,0,.41,.23,.24,.28,'flesh');
  for(const s of [-1,1])tube([[0,0,.55],[s*.12,.03,.75],[s*.31,.07,.85]],i=>.085-i*.022,'muscle');
  break;
 case 'tendrils':
 case 'nerveNode':
  if(kind==='nerveNode')lobe(0,0,.22,.24,.21,.2,'chitin');
  for(let i=0;i<5;i++){
   const a=(i+rand()*.45)*tau/5,c=Math.cos(a),s=Math.sin(a),end=kind==='tendrils'?.55+rand()*.3:.12;
   tube([[0,0,.08],[c*.15,s*.15,.20],[c*.24,s*.24,end*.68],[c*.39,s*.39,end]],i=>.07-i*.021,kind==='tendrils'?'muscle':'chitin');
   if(detail>0)tube([[c*.15,s*.15,.2],[c*.19+s*.1,s*.19-c*.1,end*.5],[c*.35+s*.08,s*.35-c*.08,end*.72]],i=>.038-i*.016);
  }
  break;
 case 'ribCage':
  for(const y of [-.29,-.09,.12,.31]){
   const h=.56+rand()*.25;
   tube([[-.39,y,.07],[-.35,y,h*.53],[-.15,y,h],[.07,y,h*.98],[.29,y,h*.65],[.39,y,.1]],i=>.048+(i%3)*.006,'bone');
  }
  for(const s of [-1,1])tube([[s*.27,-.36,.05],[s*.23,-.35,.28],[s*.15,-.34,.4]],i=>.065-i*.03,'bone');
  break;
 case 'tissuePit':basin(false);break;
 case 'biologicalPool':basin(true);break;
 }
 if(biologicalMeshCache.size>=96)biologicalMeshCache.delete(biologicalMeshCache.keys().next().value);
 biologicalMeshCache.set(key,faces);
 return faces;
}
if(typeof module==='object'&&module.exports)module.exports={biologicalMesh,biologicalComponents,biologicalPatterns,biologicalPresets};

function biologicalTheme(key){
 if(!Object.hasOwn(biologicalPresets,key))return null;
 const preset=biologicalPresets[key];
 const [,ground,top,side,groundPattern,sidePattern]=preset;
 return {ground,top,side,column:side,wall:side,groundPattern,topPattern:groundPattern,sidePattern};
}
function biologicalPatternCanvas(kind,seed){
 const [,material,color]=biologicalPatterns[kind];
 const tile=document.createElement('canvas');
 tile.width=tile.height=128;
 const ctx=tile.getContext('2d'),rand=biologicalRandom(seed);
 const texture=getArt('./art/biological/'+material+'.webp?build=1.618');
 function paint(){
  ctx.clearRect(0,0,128,128);
  ctx.fillStyle=color;ctx.strokeStyle=color;
  const random=biologicalRandom(seed);
  const veins=['bioVeins','bioNerves','bioMuscle','bioFolds'].includes(kind);
  for(let i=0;i<(veins?15:30);i++){
   const x=random()*128,y=random()*128,r=3+random()*11,turn=random()*Math.PI;
   ctx.globalAlpha=.35+random()*.55;
   for(const dx of [-128,0,128])for(const dy of [-128,0,128]){
    ctx.save();ctx.translate(x+dx,y+dy);ctx.rotate(turn);
    ctx.beginPath();
    if(veins){
     ctx.lineWidth=kind==='bioNerves'?1.8:2+r*.16;
     ctx.moveTo(-r*2,0);ctx.bezierCurveTo(-r,-r,r,r,r*2,0);
     if(kind==='bioVeins'||kind==='bioNerves'){ctx.moveTo(0,0);ctx.quadraticCurveTo(r,-r*.25,r*1.4,-r)}
     ctx.stroke();
    }else{
     if(kind==='bioHoneycomb'){
      for(let side=0;side<6;side++){
       const a=side*Math.PI/3,irregular=1+.19*Math.sin(side*3+r);
       const x=Math.cos(a)*r*irregular,y=Math.sin(a)*r*irregular;
       if(side===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.lineWidth=2.1;ctx.stroke();
     }else{
      ctx.ellipse(0,0,r,r*(kind==='bioMucous' ? .37 : .62),0,0,Math.PI*2);
      if(kind==='bioCells'){ctx.lineWidth=2;ctx.stroke();}
      else{
       ctx.fill();
       if(kind==='bioPustules'||kind==='bioCalcified'){
        ctx.fillStyle=kind==='bioPustules'?'#f9c997':'#e3d1bb';
        ctx.beginPath();ctx.ellipse(-r*.25,-r*.16,r*.35,r*.22,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=color;
       }
      }
     }
    }
    ctx.restore();
   }
  }
  ctx.globalAlpha=1;
  if(texture.naturalWidth){
   ctx.globalCompositeOperation='source-atop';
   ctx.globalAlpha=.32+rand()*.08;ctx.drawImage(texture,0,0,128,128);
   ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
 }
 paint();
 if(!texture.complete)texture.addEventListener('load',()=>{
  paint();studioWebGLPatternTiles.clear();studioWebGLFrame=null;draw('Biological texture loaded');
 },{once:true});
 return tile;
}
function biologicalWebGLFaces(source){
 const emitted=new Set(),result=[];
 const count=new Set(source.map(face=>face.p).filter(piece=>Object.hasOwn(biologicalComponents,piece?.terrainShape?.componentKind))).size;
 for(const face of source){
  const p=face.p,settings=p?.terrainShape,kind=settings?.componentKind;
  const definition=Object.hasOwn(biologicalComponents,kind)?biologicalComponents[kind]:null;
  if(!definition||face.fogOverview){result.push(face);continue}
  if(emitted.has(p))continue;
  emitted.add(p);
  const [dw,dd,h]=dimensions(p),[w,d]=furnitureFootprint(furnitureValues(p));
  const angle=(p.r??0)*Math.PI/2,cos=Math.cos(angle),sin=Math.sin(angle),cx=p.x+dw/2,cy=p.y+dd/2;
  const detail=preferences.graphicsQuality===3||count>64?0:settings.furnDetail>70?2:1;
  const seed=settings.bioSeed??1;
  for(const part of biologicalMesh(kind,seed,detail)){
   const world=turnTerrainPoints(part.points.map(([x,y,z])=>[cx+w*x*cos-d*y*sin,cy+w*x*sin+d*y*cos,p.z+z*h]),p);
   result.push({...face,z:null,world,fill:shadeTreeColor(settings.furnColor??definition[2],part.tone),
    special:true,biomeShape:true,biologicalMaterial:part.material??definition[1]});
  }
 }
 return result;
}
