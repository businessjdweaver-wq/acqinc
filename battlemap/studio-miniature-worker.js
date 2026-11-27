function miniatureScript(path){
 const url=new URL(path,location.href);
 url.search=location.search;
 return url;
}
importScripts(miniatureScript('./studio-miniature-glb.js'),miniatureScript('./studio-miniature-unity.js'));

function generatedNormals(positions,indices){
 const normals=new Float32Array(positions.length);
 for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
  const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
  const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
  const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
  for(const offset of [a,b,c]){
   normals[offset]+=x;normals[offset+1]+=y;normals[offset+2]+=z;
  }
 }
 for(let i=0;i<normals.length;i+=3){
  const length=Math.hypot(normals[i],normals[i+1],normals[i+2]);
  if(length>0&&Number.isFinite(length)){
   normals[i]/=length;normals[i+1]/=length;normals[i+2]/=length;
  }else normals.set([0,1,0],i);
 }
 return normals;
}
// Read standard binary or ASCII STL, converting Z-up to Y-up.
// Spatial vertex clustering collapses edges rather than dropping arbitrary faces.
function simplifyStudioStl(source,target){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<source.length;i++){const a=i%3;min[a]=Math.min(min[a],source[i]);max[a]=Math.max(max[a],source[i]);}
 const span=Math.max(...max.map((v,i)=>v-min[i]));
 function cluster(divisions){
  const cells=new Map(),ids=new Uint32Array(source.length/3),points=[];
  for(let i=0;i<source.length;i+=3){
   const key=[0,1,2].map(a=>Math.floor((source[i+a]-min[a])/span*divisions)).join(',');
   let cell=cells.get(key);
   if(!cell){cell={id:points.length,x:0,y:0,z:0,n:0};cells.set(key,cell);points.push(cell);}
   cell.x+=source[i];cell.y+=source[i+1];cell.z+=source[i+2];cell.n++;ids[i/3]=cell.id;
  }
  const faces=[],seen=new Set();
  for(let i=0;i<ids.length;i+=3){
   const a=ids[i],b=ids[i+1],c=ids[i+2];if(a===b||b===c||a===c)continue;
   const key=[a,b,c].sort((x,y)=>x-y).join(',');if(seen.has(key))continue;seen.add(key);
   faces.push(a,b,c);
  }
  return {points,faces};
 }
 let lo=2,hi=512,best=null;
 while(lo<=hi){const mid=(lo+hi)>>1,result=cluster(mid),n=result.faces.length/3;
  if(n<=target){if(n&&(!best||n>best.faces.length/3))best=result;lo=mid+1;}else hi=mid-1;
 }
 if(!best)throw Error('Could not simplify STL to this resolution.');
 const out=new Float32Array(best.faces.length*3);
 best.faces.forEach((id,i)=>{const p=best.points[id];out.set([p.x/p.n,p.y/p.n,p.z/p.n],i*3);});
 return out;
}

function parseStudioMiniatureStl(buffer,target=60000){
 const view=new DataView(buffer), limit=500000;
 let positions;
 const count=buffer.byteLength>=84?view.getUint32(80,true):0;
 if(count&&84+50*count===buffer.byteLength){
  if(count>limit)throw Error('STL exceeds 500,000 source triangles.');
  positions=new Float32Array(count*9);
  for(let t=0;t<count;t++)for(let v=0;v<3;v++){
   const at=84+t*50+12+v*12,i=t*9+v*3;
   positions.set([view.getFloat32(at,true),view.getFloat32(at+8,true),-view.getFloat32(at+4,true)],i);
  }
 }else{
  const source=new TextDecoder().decode(buffer);
  if(!/^\s*solid\b/i.test(source))throw Error('Invalid STL file.');
  const values=[], pattern=/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  for(const match of source.matchAll(pattern)){
   if(values.length>=limit*9)throw Error('STL exceeds 500,000 source triangles.');
   values.push(Number(match[1]),Number(match[3]),-Number(match[2]));
  }
  if(!values.length||values.length%9)throw Error('Invalid ASCII STL triangles.');
  positions=new Float32Array(values);
 }
 if(!positions.every(Number.isFinite))throw Error('Invalid STL coordinates.');
 const sourceTriangles=positions.length/9;
 target=Math.max(1000,Math.min(120000,Number(target)||60000));
 if(sourceTriangles>target)positions=simplifyStudioStl(positions,target);
 const indices=Uint32Array.from({length:positions.length/3},(_,i)=>i);
 return {sourceTriangles,meshes:[{positions,indices,material:{alphaMode:'OPAQUE',baseColorFactor:[.48,.48,.48,1],doubleSided:true}}]};
}

async function readMiniature({id,buffer,expectUnity,expectZip,expectStl,stlTarget}){
 const bitmaps=[];
 try{
  let raw=new Uint8Array(buffer);
  const limit=24*1024*1024;
  if(expectZip||(raw[0]===80&&raw[1]===75&&raw[2]===3&&raw[3]===4)){
   importScripts(miniatureScript('./studio-miniature-zip.js'));
   raw=await readStudioMiniatureZip(raw,limit);
   expectUnity=true;
  }
  const unity=isStudioUnityBundle(raw);
  if(expectUnity&&!unity)throw Error('Expected a UnityFS .unity3d file.');
  if(unity){
   if(raw.length>24*1024*1024)throw Error('Choose a miniature no larger than 24 MB.');
   if(typeof StudioUnityReader==='undefined')importScripts(miniatureScript('./vendor/miniature-unity/reader.js'));
   buffer=await convertStudioUnityMiniature(raw,StudioUnityReader);
  }
  const {meshes,sourceTriangles}=expectStl?parseStudioMiniatureStl(buffer,stlTarget):parseStudioMiniatureGlb(buffer,{limits:{
   fileBytes:24*1024*1024,vertices:200000,indices:600000,primitives:64,textureDimension:2048
  }});
  const usedImages=[...new Set(meshes.map(mesh=>mesh.material.baseColorTexture).filter(Boolean))];
  if(usedImages.reduce((total,image)=>total+image.width*image.height,0)>4194304)
   throw Error('Combined base color textures exceed 4.2 megapixels.');
  for(const image of usedImages){
   const bitmap=await createImageBitmap(new Blob([image.data],{type:image.mimeType}),{
    premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'
   });
   bitmaps.push(bitmap);
   if(bitmap.width!==image.width||bitmap.height!==image.height)throw Error('Texture dimensions do not match the file.');
  }
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const primitives=meshes.map(({positions,normals,uvs,indices,material})=>{
   if(material.alphaMode==='BLEND')throw Error('Translucent GLB materials are unavailable. Use opaque or cutout materials.');
   if(material.baseColorTexture&&!uvs)throw Error('A textured miniature needs UV coordinates.');
   for(let i=0;i<positions.length;i++){
    const value=positions[i],axis=i%3;
    if(!Number.isFinite(value)||Math.abs(value)>1000000)throw Error('Miniature coordinates are out of range.');
    min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
   }
   return {positions,normals:normals??generatedNormals(positions,indices),texcoords:uvs,indices,
    material:{image:usedImages.indexOf(material.baseColorTexture),baseColor:material.baseColorFactor,
     alphaCutoff:material.alphaMode==='MASK'?material.alphaCutoff:0,doubleSided:material.doubleSided}};
  });
  const height=max[1]-min[1];
  if(height<=.000001||Math.max(max[0]-min[0],max[2]-min[2])>height*12)
   throw Error('Use an upright, Y-up 3D miniature.');
  // Anchor optional bases under the lowest part of the figure. A sword
  // extended at shoulder height should not move the figure off its base.
  let groundXMin=Infinity,groundXMax=-Infinity,groundZMin=Infinity,groundZMax=-Infinity;
  const groundLevel=min[1]+height*.18;
  for(const {positions} of primitives)for(let i=0;i<positions.length;i+=3){
   if(positions[i+1]>groundLevel)continue;
   groundXMin=Math.min(groundXMin,positions[i]);groundXMax=Math.max(groundXMax,positions[i]);
   groundZMin=Math.min(groundZMin,positions[i+2]);groundZMax=Math.max(groundZMax,positions[i+2]);
  }
  const groundCenter=[(groundXMin+groundXMax)/2,(groundZMin+groundZMax)/2];
  const buffers=primitives.flatMap(p=>[p.positions,p.normals,p.texcoords,p.indices].filter(Boolean).map(array=>array.buffer));
  const byteCost=buffers.reduce((total,array)=>total+array.byteLength,0)+bitmaps.reduce((total,img)=>total+img.width*img.height*6,0);
  self.postMessage({id,asset:{sourceTriangles,primitives,bitmaps,bounds:{min,max,groundCenter},byteCost}},[...buffers,...bitmaps]);
 }catch(error){
  for(const bitmap of bitmaps)bitmap.close();
  self.postMessage({id,error:error.message||'The miniature could not be read.'});
 }
}

function bakeMiniatureFinishes({id,positions,indices}){
 try{
  if(typeof computeStudioMiniatureFinishes==='undefined')
   importScripts(miniatureScript('./studio-miniature-finishes.js'));
  const finishData=computeStudioMiniatureFinishes(positions,indices);
  self.postMessage({id,finishData},[finishData.buffer]);
 }catch(error){
  self.postMessage({id,error:error.message||'The miniature finishes could not be computed.'});
 }
}

let queue=Promise.resolve();
self.onmessage=({data})=>{
 queue=queue.then(()=>data.finishGeometry?bakeMiniatureFinishes(data):readMiniature(data));
};
