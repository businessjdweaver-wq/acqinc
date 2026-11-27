// Compatibility reader for the standalone, static UnityFS tabletop export.
const unityMiniatureBundleLimit=32*1024*1024;
const unityMiniatureSignature=[85,110,105,116,121,70,83,0];
function isStudioUnityBundle(bytes){
 return unityMiniatureSignature.every((byte,i)=>bytes[i]===byte);
}
function unityBundleError(detail){
 return new Error('Unity miniature: '+detail);
}
function validateStudioUnityBundle(bytes,decompressLz4){
 if(bytes.length<50||!isStudioUnityBundle(bytes))throw unityBundleError('Expected a UnityFS .unity3d file.');
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(header.getUint32(8)!==6)throw unityBundleError('This UnityFS version is unsupported.');
 const engineEnd=bytes.indexOf(0,12),revisionEnd=bytes.indexOf(0,engineEnd+1);
 if(engineEnd<13||revisionEnd<=engineEnd+1||revisionEnd>128||revisionEnd+21>bytes.length)
  throw unityBundleError('Invalid bundle header.');
 const version=new TextDecoder().decode(bytes.subarray(engineEnd+1,revisionEnd));
 if(!/^2019\.[1-3]\./.test(version))throw unityBundleError('Expected a Unity 2019.1–2019.3 tabletop bundle.');
 const base=revisionEnd+1;
 const packedInfo=header.getUint32(base+8),unpackedInfo=header.getUint32(base+12),flags=header.getUint32(base+16);
 const compression=flags&63;
 if(header.getBigUint64(base)!==BigInt(bytes.length)||!packedInfo||packedInfo>unpackedInfo+1024||
  unpackedInfo<20||unpackedInfo>65536||![0,2,3].includes(compression)||(flags&~0xc3)||!(flags&64))
  throw unityBundleError('Invalid or unsupported bundle metadata.');
 const infoAt=flags&128?bytes.length-packedInfo:base+20;
 if(infoAt<base+20||infoAt+packedInfo>bytes.length)throw unityBundleError('Truncated bundle metadata.');
 const packed=bytes.subarray(infoAt,infoAt+packedInfo);
 const infoBytes=compression?decompressLz4(packed,unpackedInfo):packed;
 if(infoBytes.length!==unpackedInfo)throw unityBundleError('Invalid metadata size.');
 const info=new DataView(infoBytes.buffer,infoBytes.byteOffset,infoBytes.byteLength);
 const blockCount=info.getUint32(16);
 if(blockCount<1||blockCount>1024||20+blockCount*10+4>infoBytes.length)throw unityBundleError('Invalid block count.');
 let offset=20,expanded=0,compressed=0;
 const dataAt=base+20+(flags&128?0:packedInfo);
 for(let i=0;i<blockCount;i++,offset+=10){
  const size=info.getUint32(offset),stored=info.getUint32(offset+4),type=info.getUint16(offset+8)&63;
  const start=dataAt+compressed;
  if(!size||!stored||![0,1,2,3].includes(type)||(type===0&&size!==stored)||start+stored>bytes.length)
   throw unityBundleError('Unsupported data block.');
  if(type===1&&(stored<=5||header.getUint32(start+1,true)>unityMiniatureBundleLimit))
   throw unityBundleError('LZMA dictionary exceeds the expansion limit.');
  expanded+=size;compressed+=stored;
 }
 if(expanded>unityMiniatureBundleLimit||compressed!==bytes.length-base-20-packedInfo)
  throw unityBundleError('Bundle exceeds the expansion limit or is truncated.');
 const files=info.getUint32(offset);
 if(files<1||files>8)throw unityBundleError('Unsupported number of embedded files.');
 offset+=4;
 for(let i=0;i<files;i++){
  if(offset+21>infoBytes.length)throw unityBundleError('Truncated file entry.');
  const end=info.getBigUint64(offset)+info.getBigUint64(offset+8);
  const nameEnd=infoBytes.indexOf(0,offset+20);
  if(end>BigInt(expanded)||nameEnd<offset+21)throw unityBundleError('Invalid file entry.');
  const name=new TextDecoder().decode(infoBytes.subarray(offset+20,nameEnd));
  if(!/^CAB-[a-f0-9]+(?:\.(?:resS|resource))?$/i.test(name))
   throw unityBundleError('Unsupported embedded file path.');
  offset=nameEnd+1;
 }
}
function unityColor565(color){
 return [Math.round((color>>11)*255/31),Math.round(((color>>5)&63)*255/63),Math.round((color&31)*255/31),255];
}
function decodeUnityMiniatureTexture(texture){
 const {m_Width:width,m_Height:height,m_TextureFormat:format,imageData}=texture;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048)
  throw unityBundleError('Base color texture exceeds 2048 pixels per side.');
 if(![10,12].includes(format))throw unityBundleError('This export needs a DXT1 or DXT5 base color texture.');
 const blockSize=format===10?8:16,columns=Math.ceil(width/4),rows=Math.ceil(height/4);
 if(!imageData||imageData.byteLength<columns*rows*blockSize)throw unityBundleError('Truncated texture data.');
 const view=new DataView(imageData.buffer,imageData.byteOffset,imageData.byteLength);
 const rgba=new Uint8ClampedArray(width*height*4);
 for(let blockY=0;blockY<rows;blockY++)for(let blockX=0;blockX<columns;blockX++){
  const start=(blockY*columns+blockX)*blockSize;
  const colorsAt=start+(format===12?8:0);
  const a=view.getUint16(colorsAt,true),b=view.getUint16(colorsAt+2,true);
  const first=unityColor565(a),second=unityColor565(b);
  const fourColors=a>b||format===12;
  const mix=(p,q,d)=>first.map((value,i)=>Math.floor((value*p+second[i]*q)/d));
  const colors=[first,second,fourColors?mix(2,1,3):mix(1,1,2),fourColors?mix(1,2,3):[0,0,0,0]];
  const selector=view.getUint32(colorsAt+4,true);
  let alphaBits=0n,alphaTable=null;
  if(format===12){
   const a0=view.getUint8(start),a1=view.getUint8(start+1);
   alphaBits=view.getBigUint64(start,true)>>16n;
   const n=a0>a1?7:5;
   alphaTable=[a0,a1];
   for(let i=1;i<n;i++)alphaTable.push(Math.floor(((n-i)*a0+i*a1)/n));
   if(n===5)alphaTable.push(0,255);
  }
  for(let i=0;i<16;i++){
   const x=blockX*4+i%4,y=blockY*4+(i>>2);
   if(x>=width||y>=height)continue;
   const dst=((height-y-1)*width+x)*4;
   rgba.set(colors[(selector>>>(i*2))&3],dst);
   if(alphaTable)rgba[dst+3]=alphaTable[Number((alphaBits>>BigInt(3*i))&7n)];
  }
 }
 return {rgba,width,height};
}
function encodeUnityMiniatureGlb(glb,png,nodes,color,cutoff){
 const source=new DataView(glb.buffer,glb.byteOffset,glb.byteLength);
 const jsonSize=source.getUint32(12,true);
 const json=JSON.parse(new TextDecoder().decode(glb.subarray(20,20+jsonSize)));
 const geometry=glb.subarray(28+jsonSize);
 json.nodes[0].mesh=0;
 for(const node of nodes){
  const index=json.nodes.length;
  json.nodes.push({...node,children:[index-1]});
 }
 json.scenes[0].nodes=[json.nodes.length-1];
 const view=json.bufferViews.length;
 json.bufferViews.push({buffer:0,byteOffset:geometry.length,byteLength:png.length});
 json.images=[{bufferView:view,mimeType:'image/png'}];
 json.textures=[{source:0}];
 json.materials=[{pbrMetallicRoughness:{baseColorFactor:color,baseColorTexture:{index:0}},
  ...(cutoff===null?{}:{alphaMode:'MASK',alphaCutoff:cutoff})}];
 for(const primitive of json.meshes[0].primitives){
  if(primitive.attributes.TEXCOORD_0===undefined)throw unityBundleError('The mesh is missing texture coordinates.');
  primitive.material=0;
 }
 json.buffers[0].byteLength=geometry.length+png.length;
 const body=new TextEncoder().encode(JSON.stringify(json));
 const jsonLength=Math.ceil(body.length/4)*4,binLength=Math.ceil((geometry.length+png.length)/4)*4;
 const output=new ArrayBuffer(28+jsonLength+binLength);
 const bytes=new Uint8Array(output),header=new DataView(output);
 header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,output.byteLength,true);
 header.setUint32(12,jsonLength,true);header.setUint32(16,0x4e4f534a,true);
 bytes.fill(32,20,20+jsonLength);bytes.set(body,20);
 header.setUint32(20+jsonLength,binLength,true);header.setUint32(24+jsonLength,0x004e4942,true);
 bytes.set(geometry,28+jsonLength);bytes.set(png,28+jsonLength+geometry.length);
 return output;
}
async function convertStudioUnityMiniature(bytes,reader){
 validateStudioUnityBundle(bytes,reader.decompressLz4);
 const bundle=reader.readBundle(bytes);
 const files=bundle.files.map(({path,data})=>{
  const text=new TextDecoder().decode(data.subarray(0,16));
  if(/^Unity(?:FS|Web|Raw|Archive)/.test(text)||data[0]===31&&data[1]===139)
   throw unityBundleError('Nested archives are unsupported.');
  return {name:path,data};
 });
 const env=reader.load(files);
 if(env.objects.length>128)throw unityBundleError('The export contains too many objects.');
 const one=(type)=>{
  const matches=[...env.assets(type)];
  if(matches.length!==1)throw unityBundleError('Expected one '+type+' in a static miniature.');
  return matches[0].reader;
 };
 const local=(pointer,from)=>{
  if(!pointer||pointer.m_FileID!==0||!pointer.m_PathID)throw unityBundleError('Missing or external asset reference.');
  const target=env.resolve(pointer,from);
  if(!target?.object)throw unityBundleError('An embedded asset reference could not be resolved.');
  return target.object;
 };
 const filterObject=one('MeshFilter'),filter=filterObject.read();
 const meshObject=one('Mesh');
 if(filter.m_Mesh.m_FileID!==0||filter.m_Mesh.m_PathID!==meshObject.pathId)throw unityBundleError('Invalid mesh reference.');
 const mesh=meshObject.read();
 if(mesh.vertexCount>200000||!mesh.indices?.length||mesh.indices.length>64||
  mesh.indices.reduce((sum,part)=>sum+part.length,0)>600000)throw unityBundleError('Mesh exceeds the geometry budget.');
 const renderer=one('MeshRenderer'),surface=renderer.read();
 const refs=surface.m_Materials;
 if(surface.m_GameObject.m_PathID!==filter.m_GameObject.m_PathID||refs.length!==1)
  throw unityBundleError('Expected a single material on the miniature mesh.');
 const materialObject=local(refs[0],renderer);
 const material=materialObject.read().m_SavedProperties;
 const texPointer=material.m_TexEnvs.find(([key])=>key==='_MainTex')?.[1]?.m_Texture;
 const texture=local(texPointer,materialObject).read();
 const tint=material.m_Colors.find(([key])=>key==='_Color')?.[1]??{r:1,g:1,b:1,a:1};
 const mode=material.m_Floats.find(([key])=>key==='_Mode')?.[1]??0;
 if(![0,1].includes(mode))throw unityBundleError('Only opaque and cutout materials are supported.');
 const cutoff=mode===1?material.m_Floats.find(([key])=>key==='_Cutoff')?.[1]??.5:null;
 const transforms=new Map([...env.assets('Transform')].map(asset=>[asset.pathId,asset.reader]));
 let transform=[...transforms.values()].find(obj=>obj.read().m_GameObject.m_PathID===filter.m_GameObject.m_PathID);
 const nodes=[],seen=new Set();
 if(!transform)throw unityBundleError('The mesh is missing its transform.');
 while(transform){
  if(seen.has(transform.pathId)||nodes.length>=12)throw unityBundleError('Invalid transform hierarchy.');
  seen.add(transform.pathId);
  const {m_LocalPosition:p,m_LocalRotation:q,m_LocalScale:s,m_Father:parent}=transform.read();
  nodes.push({translation:[-p.x,p.y,p.z],rotation:[q.x,-q.y,-q.z,q.w],scale:[s.x,s.y,s.z]});
  if(!parent.m_PathID)break;
  transform=transforms.get(parent.m_PathID);
  if(!transform||parent.m_FileID!==0)throw unityBundleError('Missing parent transform.');
 }
 const image=decodeUnityMiniatureTexture(texture);
 const canvas=new OffscreenCanvas(image.width,image.height);
 canvas.getContext('2d').putImageData(new ImageData(image.rgba,image.width,image.height),0,0);
 const png=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
 return encodeUnityMiniatureGlb(reader.meshToGltf(mesh),png,nodes,[tint.r,tint.g,tint.b,tint.a],cutoff);
}

if(typeof module==='object'&&module.exports)module.exports={isStudioUnityBundle,validateStudioUnityBundle,decodeUnityMiniatureTexture};
