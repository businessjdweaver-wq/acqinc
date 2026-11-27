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
async function readMiniature({id,buffer,expectUnity,expectZip}){
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
  const {meshes}=parseStudioMiniatureGlb(buffer,{limits:{
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
  const buffers=primitives.flatMap(p=>[p.positions,p.normals,p.texcoords,p.indices].filter(Boolean).map(array=>array.buffer));
  const byteCost=buffers.reduce((total,array)=>total+array.byteLength,0)+bitmaps.reduce((total,img)=>total+img.width*img.height*6,0);
  self.postMessage({id,asset:{primitives,bitmaps,bounds:{min,max},byteCost}},[...buffers,...bitmaps]);
 }catch(error){
  for(const bitmap of bitmaps)bitmap.close();
  self.postMessage({id,error:error.message||'The miniature could not be read.'});
 }
}

let queue=Promise.resolve();
self.onmessage=({data})=>{
 queue=queue.then(()=>readMiniature(data));
};
