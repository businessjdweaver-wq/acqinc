// Miniatures share terrain's camera and depth buffer. The 2D standee still
// supplies interaction geometry, nameplates, facing indicators and markers.
const studioMiniatureFinishDefaults=Object.freeze({
 washStrength:.30,washTint:'#342a31',dryBrushStrength:.20,dryBrushTint:'#d3c6a9',
 zenithalStrength:.15,material:'matte'
});
const studioMiniatureMaterials={
 matte:[.87,0],satin:[.58,0],gloss:[.29,0],metallic:[.38,.8]
};
function studioMiniatureFinishSettings(value){
 const strength=key=>typeof value?.[key]==='number'&&Number.isFinite(value[key])?
  Math.max(0,Math.min(1,value[key])):studioMiniatureFinishDefaults[key];
 const tint=key=>typeof value?.[key]==='string'&&/^#[\da-f]{6}$/i.test(value[key])?
  value[key]:studioMiniatureFinishDefaults[key];
 return {washStrength:strength('washStrength'),washTint:tint('washTint'),
  dryBrushStrength:strength('dryBrushStrength'),dryBrushTint:tint('dryBrushTint'),
  zenithalStrength:strength('zenithalStrength'),
  material:Object.hasOwn(studioMiniatureMaterials,value?.material)?value.material:'matte'};
}

// A single job runs across both WebGL contexts. Cache by decoded geometry so
// copies of one miniature share the bake, and each resolution has its own field.
const studioMiniatureFinishRequests=new Map();
const studioMiniatureFinishCache=new WeakMap();
const studioMiniatureFinishLru=new Set();
const studioMiniatureFinishFailures=new WeakSet();
const studioMiniatureFinishCacheLimit=16*1024*1024;
let studioMiniatureFinishJob=null,studioMiniatureFinishCacheBytes=0;
function studioMiniatureFinishField(primitive){
 const entry=studioMiniatureFinishCache.get(primitive);
 if(entry?.field){studioMiniatureFinishLru.delete(entry);studioMiniatureFinishLru.add(entry);}
 return entry?.field;
}
function studioMiniatureScheduleFinishes(owner,primitives,onReady){
 if(primitives.size)studioMiniatureFinishRequests.set(owner,{primitives,onReady});
 else studioMiniatureFinishRequests.delete(owner);
 studioMiniatureStartFinishJob();
}
function studioMiniatureStartFinishJob(){
 if(!studioMiniatureFinishJob&&!studioMiniatureFinishRequests.size)return;
 const wanted=new Set([...studioMiniatureFinishRequests.values()].flatMap(request=>[...request.primitives]));
 if(studioMiniatureFinishJob&&!wanted.has(studioMiniatureFinishJob.primitive)){
  const {worker,timer}=studioMiniatureFinishJob;
  clearTimeout(timer);worker.terminate();studioMiniatureFinishJob=null;
 }
 if(studioMiniatureFinishJob)return;
 for(const primitive of wanted){
  if(studioMiniatureFinishCache.get(primitive)?.field||studioMiniatureFinishFailures.has(primitive))continue;
  let worker;
  try{
   const url=new URL('./studio-miniature-worker.js',document.baseURI);
   url.searchParams.set('build',el('battlemapBuild').textContent.trim());
   worker=new Worker(url);
  }catch{
   studioMiniatureFinishFailures.add(primitive);
   continue;
  }
  const complete=field=>{
   if(studioMiniatureFinishJob?.worker!==worker)return;
   clearTimeout(studioMiniatureFinishJob.timer);worker.terminate();studioMiniatureFinishJob=null;
   if(field instanceof Float32Array&&field.length===primitive.positions.length/3*2){
    const entry={field};
    studioMiniatureFinishCache.set(primitive,entry);studioMiniatureFinishLru.add(entry);
    studioMiniatureFinishCacheBytes+=field.byteLength;
    while(studioMiniatureFinishCacheBytes>studioMiniatureFinishCacheLimit){
     const old=studioMiniatureFinishLru.values().next().value;
     studioMiniatureFinishLru.delete(old);studioMiniatureFinishCacheBytes-=old.field.byteLength;
     old.field=null;
    }
   }else studioMiniatureFinishFailures.add(primitive);
   const requests=[...studioMiniatureFinishRequests.values()];
   for(const request of requests)if(request.primitives.has(primitive))request.onReady();
   studioMiniatureStartFinishJob();
  };
  const timer=setTimeout(()=>complete(null),25000);
  studioMiniatureFinishJob={primitive,worker,timer};
  worker.onmessage=({data})=>complete(data.finishData);
  worker.onerror=worker.onmessageerror=()=>complete(null);
  try{
   const {positions,indices}=primitive;
   const vertices=positions.slice(),elements=indices.slice();
   worker.postMessage({id:1,finishGeometry:true,positions:vertices,indices:elements},[vertices.buffer,elements.buffer]);
  }catch{queueMicrotask(()=>complete(null));}
  return;
 }
}
function createStudioMiniaturePass(gl, compile, onFinishReady=()=>{}) {
 const finishOwner={};
 const program=gl.createProgram();
 const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
 layout(location=0) in vec3 position;
 layout(location=1) in vec3 normal;
 layout(location=2) in vec2 uv;
 layout(location=3) in vec4 paintColor;
 layout(location=4) in vec2 finishData;
 out vec4 surfacePaint;
 out vec2 surfaceFinish;
 uniform mat4 camera;
 uniform mat4 model;
 out vec3 worldNormal;
 out vec2 texCoord;
 void main(){
  gl_Position=camera*model*vec4(position,1.);
  worldNormal=mat3(model)*normal;
  texCoord=uv;surfacePaint=paintColor;surfaceFinish=finishData;
 }`);
 const fragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;
 uniform sampler2D albedo;
 uniform vec4 baseColor;
 uniform vec3 light;
 uniform float alphaCutoff;
 uniform float desaturate;
 uniform float sculptShade;
 uniform bool normalPass;
 uniform bool enhancedFinish;
 uniform vec3 finishStrength;
 uniform vec3 washTint;
 uniform vec3 dryBrushTint;
 uniform vec2 materialFinish;
 uniform vec3 viewDirection;
 uniform vec3 inspectionDirection;
 uniform float inspectionIntensity;
 in vec3 worldNormal;
 in vec2 texCoord;
 in vec4 surfacePaint;
 in vec2 surfaceFinish;
 out vec4 pixel;
 vec3 toSRGB(vec3 rgb){
  return mix(12.92*rgb,1.055*pow(max(rgb,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),rgb));
 }
 void main(){
  vec4 color=texture(albedo,texCoord)*baseColor;
  color.rgb=mix(color.rgb,surfacePaint.rgb,surfacePaint.a);
  if(color.a<alphaCutoff)discard;
  vec3 n=normalize(worldNormal);
  if(!gl_FrontFacing)n=-n;
  if(normalPass){pixel=vec4(n*.5+.5,1.);return;}
  vec3 key=normalize(vec3(-.5,-.7,1.));
  float ndl=max(0.,dot(n,key));
  float shade=mix(.62+.38*ndl,.32+.68*ndl,sculptShade);
  if(sculptShade>0.){
   float crease=clamp(length(dFdx(n))+length(dFdy(n)),0.,1.);
   float rim=pow(1.-abs(dot(n,normalize(vec3(.35,-.45,1.)))),3.);
   shade*=1.-.28*sculptShade*crease;
   shade+=sculptShade*(.14*rim+.12*crease*ndl);
  }
  vec3 paint=color.rgb;
  vec3 reflected=vec3(0.);
  if(enhancedFinish){
   // Scene and preview projectors use the opposite winding from their depth
   // direction. Orient the finish response toward the actual visible side.
   vec3 finishNormal=dot(n,viewDirection)<0.?-n:n;
   float wash=finishStrength.x*clamp(surfaceFinish.x,0.,1.);
   paint*=mix(vec3(1.),.20+.54*sqrt(washTint),wash);
   float raised=smoothstep(.025,.45,surfaceFinish.y);
   paint=mix(paint,dryBrushTint,finishStrength.y*raised*.55);
   float zenithal=smoothstep(-.2,.95,finishNormal.z);
   paint*=1.+finishStrength.z*(.48*zenithal-.12);
   paint+=.018*finishStrength.z*zenithal;
   float roughness=materialFinish.x;
   float metallic=materialFinish.y;
   vec3 keyView=key+viewDirection;
   vec3 halfway=keyView/max(length(keyView),.00001);
   float gloss=5.+115.*pow(1.-roughness,3.);
   float lobe=pow(clamp(dot(finishNormal,halfway),0.,1.),gloss)*max(0.,dot(finishNormal,key));
   vec3 f0=mix(vec3(.04),paint,metallic);
   float grazing=pow(1.-clamp(dot(halfway,viewDirection),0.,1.),5.);
   reflected=mix(f0,vec3(1.),grazing)*lobe*mix(2.8,.55,roughness);
   paint*=1.-metallic*.45;
  }
  float lamp=0.;
  if(inspectionIntensity>0.){
   lamp=max(0.,dot(n,normalize(inspectionDirection)));
   shade+=inspectionIntensity*(.18+.85*lamp);
  }
  vec3 rgb=toSRGB(clamp(light*(paint*shade+reflected),0.,1.));
  if(inspectionIntensity>0.)rgb=mix(rgb,vec3(1.),clamp(inspectionIntensity*.32*lamp*lamp,0.,.65));
  if(sculptShade>0.)rgb+=light*(.10*sculptShade*ndl*ndl*ndl);
  rgb=mix(rgb,vec3(dot(rgb,vec3(.2126,.7152,.0722))),desaturate);
  pixel=vec4(rgb,1.);
 }`);
 gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
 gl.deleteShader(vertex);gl.deleteShader(fragment);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
  const error=gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  throw new Error(error);
 }
 const uniforms=Object.fromEntries(['albedo','camera','model','baseColor','light','alphaCutoff','desaturate','sculptShade','inspectionDirection','inspectionIntensity','normalPass','enhancedFinish','finishStrength','washTint','dryBrushTint','materialFinish','viewDirection']
  .map(name=>[name,gl.getUniformLocation(program,name)]));
 const contourProgram=gl.createProgram();
 const cv=compile(gl.VERTEX_SHADER,`#version 300 es
 layout(location=0) in vec3 a;
 layout(location=1) in vec3 b;
 layout(location=2) in float score;
 uniform mat4 camera,model;
 uniform vec2 viewport;
 uniform float width;
 out vec2 local;
 flat out float lengthPx;
 flat out float strength;
 void main(){
 vec4 p=camera*model*vec4(a,1.),q=camera*model*vec4(b,1.);
 vec2 d=(q.xy/q.w-p.xy/p.w)*viewport*.5;
 lengthPx=length(d);vec2 t=d/max(lengthPx,.001),n=vec2(-t.y,t.x);
 int k=gl_VertexID%6;bool end=k==1||k==2||k==4;float side=(k==0||k==1||k==3)?-1.:1.;
 // Two triangles: start-, end-, end+, start-, end+, start+.
 vec4 pos=end?q:p;float r=width*.5+1.;
 vec2 offset=t*(end?r:-r)+n*side*r;
 pos.xy+=offset*2./viewport*pos.w;pos.z-=.00035*pos.w;
 gl_Position=pos;local=vec2(end?lengthPx+r:-r,side*r);strength=score;
 }`);
 const cf=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;
 in vec2 local;flat in float lengthPx;flat in float strength;
 uniform float width,sensitivity;uniform vec3 color;
 out vec4 pixel;
 void main(){if(strength<sensitivity)discard;
 float d=length(vec2(local.x-clamp(local.x,0.,lengthPx),local.y));
 float aa=max(.5,fwidth(d)*.75);float alpha=1.-smoothstep(max(0.,width*.5-aa),width*.5+aa,d);
 if(alpha<.01)discard;pixel=vec4(color,alpha);}
 `);
 gl.attachShader(contourProgram,cv);gl.attachShader(contourProgram,cf);gl.linkProgram(contourProgram);gl.deleteShader(cv);gl.deleteShader(cf);
 if(!gl.getProgramParameter(contourProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(contourProgram));
 const cu=Object.fromEntries(['camera','model','viewport','width','sensitivity','color'].map(n=>[n,gl.getUniformLocation(contourProgram,n)]));
 const celProgram=gl.createProgram();
 const sv=compile(gl.VERTEX_SHADER,`#version 300 es
 void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`);
 const sf=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;
 uniform sampler2D normals,depths;
 uniform vec2 origin;
 uniform float width,scale,smoothing;
 uniform vec3 color;
 out vec4 pixel;
 vec4 sampleN(vec2 p){return texture(normals,p);}
 void main(){
 vec2 size=vec2(textureSize(normals,0)),uv=(gl_FragCoord.xy-origin)/size;
 vec4 center=sampleN(uv);if(center.a<.5)discard;
 float z=texture(depths,uv).r;
 float radius=max(1.,width*.5+1.);
 float edge=0.;
 for(int i=0;i<8;i++){
 float a=float(i)*.785398;vec2 d=vec2(cos(a),sin(a))*radius/size;
 vec4 nearN=sampleN(uv+d),farN=sampleN(uv+d*(2.+smoothing*2.));
 if(nearN.a<.5){edge=max(edge,1.);continue;}
 if(farN.a<.5)continue;
 vec3 n=normalize(center.rgb*2.-1.),m=normalize((nearN.rgb+farN.rgb)-1.);
 float bend=1.-dot(n,m);
 float dz=abs(texture(depths,uv+d).r-z);
 edge=max(edge,max(smoothstep(.10+scale*.55,.25+scale*.65,bend),smoothstep(.0015,.006,dz)));
 }
 float alpha=edge*min(1.,width);if(alpha<.01)discard;
 gl_FragDepth=max(0.,z-.00003);pixel=vec4(color,alpha);
 }`);
 gl.attachShader(celProgram,sv);gl.attachShader(celProgram,sf);gl.linkProgram(celProgram);gl.deleteShader(sv);gl.deleteShader(sf);
 if(!gl.getProgramParameter(celProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(celProgram));
 const su=Object.fromEntries(['normals','depths','origin','width','scale','smoothing','color'].map(n=>[n,gl.getUniformLocation(celProgram,n)]));
 const celVao=gl.createVertexArray();let target=null;
 function releaseTarget(){if(target){gl.deleteFramebuffer(target.fbo);gl.deleteTexture(target.normal);gl.deleteTexture(target.depth);target=null;}}
 function ensureTarget(w,h){if(target?.w===w&&target.h===h)return target;releaseTarget();
 const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
 const make=(internal,format,type,attachment)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,null);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);gl.framebufferTexture2D(gl.FRAMEBUFFER,attachment,gl.TEXTURE_2D,t,0);return t;};
 target={w,h,fbo,normal:make(gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,gl.COLOR_ATTACHMENT0),depth:make(gl.DEPTH_COMPONENT24,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,gl.DEPTH_ATTACHMENT)};
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){releaseTarget();throw Error('Miniature cel framebuffer incomplete');}return target;}
 const white=gl.createTexture();
 const cache=new Map();
 gl.activeTexture(gl.TEXTURE2);
 gl.bindTexture(gl.TEXTURE_2D,white);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
 gl.activeTexture(gl.TEXTURE0);

 function releaseContours(mesh){
  if(!mesh.contourVao)return;
  gl.deleteVertexArray(mesh.contourVao);gl.deleteBuffer(mesh.contourBuffer);
  mesh.contourVao=null;mesh.contourBuffer=null;mesh.contourLevel=null;
 }
 function dispose(resource){
  for(const texture of resource.textures)gl.deleteTexture(texture);
  for(const buffer of resource.buffers)gl.deleteBuffer(buffer);
  for(const mesh of resource.meshes){
   if(mesh.finishBuffer)gl.deleteBuffer(mesh.finishBuffer);
   releaseContours(mesh);
   gl.deleteVertexArray(mesh.vao);
  }
 }
 function upload(asset){
  const resource={textures:[],buffers:[],meshes:[],isStl:!!asset.sourceTriangles};
  gl.activeTexture(gl.TEXTURE2);
  try{
   for(const image of asset.bitmaps){
    const texture=gl.createTexture();
    resource.textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.generateMipmap(gl.TEXTURE_2D);
   }
   for(const primitive of asset.primitives){
    const vao=gl.createVertexArray();
    const mesh={vao,primitive,count:primitive.indices.length};resource.meshes.push(mesh);
    gl.bindVertexArray(vao);
    for(const [attribute,size,array] of [[0,3,primitive.positions],[1,3,primitive.normals],[2,2,primitive.texcoords]]){
     if(!array)continue;
     const buffer=gl.createBuffer();
     resource.buffers.push(buffer);
     gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
     gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);
     gl.enableVertexAttribArray(attribute);
     gl.vertexAttribPointer(attribute,size,gl.FLOAT,false,0,0);
    }
    if(asset.sourceTriangles){mesh.paintBuffer=gl.createBuffer();resource.buffers.push(mesh.paintBuffer);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.paintBuffer);gl.bufferData(gl.ARRAY_BUFFER,primitive.positions.length/3*16,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,4,gl.FLOAT,false,0,0);}

    const elements=gl.createBuffer();
    resource.buffers.push(elements);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,primitive.indices,gl.STATIC_DRAW);
   }
   return resource;
  }catch(error){
   dispose(resource);
   throw error;
  }finally{
   gl.bindVertexArray(null);
   gl.activeTexture(gl.TEXTURE0);
  }
 }
 function prepare(asset){
  const existing=cache.get(asset);
  if(existing)return existing;
  const resource=upload(asset);
  cache.set(asset,resource);
  return resource;
 }
 function retain(assets){
  for(const [asset,resource] of cache)if(!assets.has(asset)){
   dispose(resource);cache.delete(asset);
  }
  if(!assets.size)studioMiniatureScheduleFinishes(finishOwner,new Set(),onFinishReady);
 }
 function bindFinishField(mesh,field){
  if(!field&&!mesh.finishBuffer){
   gl.disableVertexAttribArray(4);gl.vertexAttrib2f(4,0,0);
   return;
  }
  if(!mesh.finishBuffer){
   mesh.finishBuffer=gl.createBuffer();
   gl.bindBuffer(gl.ARRAY_BUFFER,mesh.finishBuffer);
   gl.bufferData(gl.ARRAY_BUFFER,field,gl.STATIC_DRAW);
   gl.vertexAttribPointer(4,2,gl.FLOAT,false,0,0);
  }
  gl.enableVertexAttribArray(4);
 }
 function bindContours(mesh,smoothing){
  if(!mesh.contourVao){
   mesh.contourVao=gl.createVertexArray();
   mesh.contourBuffer=gl.createBuffer();
   gl.bindVertexArray(mesh.contourVao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.contourBuffer);
   for(const [loc,size,offset] of [[0,3,0],[1,3,12],[2,1,24]]){
    gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset);
    gl.vertexAttribDivisor(loc,1);
   }
  }
  gl.bindVertexArray(mesh.contourVao);
  const level=Math.round(Math.max(0,Math.min(1,smoothing??.6))*10)/10;
  if(mesh.contourLevel!==level){
   const data=studioMiniatureContours(mesh.primitive,level);
   gl.bindBuffer(gl.ARRAY_BUFFER,mesh.contourBuffer);
   gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
   mesh.contourCount=data.length/7;mesh.contourLevel=level;
  }
 }
 function draw(matrix,instances){
  const wanted=new Set(),missing=new Set();
  for(const {resource,finishes} of instances)if(finishes&&(finishes.washStrength>0||finishes.dryBrushStrength>0)){
   for(const mesh of resource.meshes){
    wanted.add(mesh.primitive);
    if(!mesh.finishBuffer)missing.add(mesh.primitive);
   }
  }
  studioMiniatureScheduleFinishes(finishOwner,missing,onFinishReady);
  const outlined=instances.filter(i=>i.edgeWidth>0&&(i.edgeStyle==='cel'||i.edgeStyle!=='off'&&i.resource.isStl));
  const celInstances=outlined.filter(i=>i.edgeStyle==='cel');
  const geometricResources=new Set(outlined.filter(i=>i.edgeStyle!=='cel').map(i=>i.resource));
  if(!celInstances.length)releaseTarget();
  if(!instances.length)return;
  gl.useProgram(program);
  gl.uniform1i(uniforms.albedo,2);gl.uniform1i(uniforms.normalPass,0);
  gl.uniformMatrix4fv(uniforms.camera,false,matrix);
  gl.activeTexture(gl.TEXTURE2);
  try{
   if(instances.some(i=>i.finishes)){
    const x=-matrix[2],y=-matrix[6],z=-matrix[10];
    const length=Math.hypot(x,y,z)||1;
    gl.uniform3f(uniforms.viewDirection,x/length,y/length,z/length);
   }
   for(const {resource,transform,light,desaturate,doubleSided,forceOpaque,colors,paint,sculptShade,inspectionDirection,inspectionIntensity,finishes} of instances){
    gl.uniformMatrix4fv(uniforms.model,false,transform);
    gl.uniform3fv(uniforms.light,light);
    gl.uniform1f(uniforms.desaturate,desaturate);
    gl.uniform3fv(uniforms.inspectionDirection,inspectionDirection||[0,0,1]);
    gl.uniform1f(uniforms.inspectionIntensity,inspectionIntensity||0);
    gl.uniform1f(uniforms.sculptShade,Math.max(0,Math.min(1,Number(sculptShade)||0)));
    gl.uniform1i(uniforms.enhancedFinish,!!finishes);
    if(finishes){
     gl.uniform3f(uniforms.finishStrength,finishes.washStrength,finishes.dryBrushStrength,finishes.zenithalStrength);
     gl.uniform3fv(uniforms.washTint,studioMiniatureBaseColor(finishes.washTint).slice(0,3));
     gl.uniform3fv(uniforms.dryBrushTint,studioMiniatureBaseColor(finishes.dryBrushTint).slice(0,3));
     gl.uniform2fv(uniforms.materialFinish,studioMiniatureMaterials[finishes.material]);
    }
    for(const mesh of resource.meshes){
     const {vao,primitive,count}=mesh;
     if(!geometricResources.has(resource))releaseContours(mesh);
     if(doubleSided||primitive.material.doubleSided)gl.disable(gl.CULL_FACE);
     else gl.enable(gl.CULL_FACE);
     gl.bindVertexArray(vao);
     if(mesh.paintBuffer&&mesh.lastPaint!==paint){const data=new Float32Array(primitive.positions.length/3*4);for(const [face,hex] of Object.entries(paint||{})){const i=Number(face);if(!Number.isInteger(i)||i<0||i*3>=count||!/^#[0-9a-f]{6}$/i.test(hex))continue;const c=studioMiniatureBaseColor(hex);for(let v=0;v<3;v++)data.set(c,primitive.indices[i*3+v]*4);}gl.bindBuffer(gl.ARRAY_BUFFER,mesh.paintBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);mesh.lastPaint=paint;}
     if(!mesh.paintBuffer)gl.vertexAttrib4f(3,0,0,0,0);
     if(finishes&&wanted.has(primitive))bindFinishField(mesh,mesh.finishBuffer?null:studioMiniatureFinishField(primitive));
     else{
      gl.disableVertexAttribArray(4);gl.vertexAttrib2f(4,0,0);
      if(!wanted.has(primitive)){
       if(mesh.finishBuffer)gl.deleteBuffer(mesh.finishBuffer);
       mesh.finishBuffer=null;
      }
     }
     gl.bindTexture(gl.TEXTURE_2D,resource.textures[primitive.material.image]||white);
     gl.uniform4fv(uniforms.baseColor,colors?.[primitive.colorSlot]??primitive.material.baseColor);
     gl.uniform1f(uniforms.alphaCutoff,forceOpaque?0:(primitive.material.alphaCutoff??0));
     gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,0);
    }
   }
   if(!outlined.length)return;
   const viewport=gl.getParameter(gl.VIEWPORT),blend=gl.isEnabled(gl.BLEND),depthMask=gl.getParameter(gl.DEPTH_WRITEMASK);
   const blendState=[gl.BLEND_SRC_RGB,gl.BLEND_DST_RGB,gl.BLEND_SRC_ALPHA,gl.BLEND_DST_ALPHA].map(k=>gl.getParameter(k));
   try{
    gl.useProgram(contourProgram);gl.uniformMatrix4fv(cu.camera,false,matrix);gl.uniform2f(cu.viewport,viewport[2],viewport[3]);
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    for(const {resource,transform,edgeWidth,edgeColor,edgeSensitivity,edgeSmoothing,edgeStyle,light} of outlined){
     if(!resource.isStl||edgeStyle==='cel')continue;
     gl.uniformMatrix4fv(cu.model,false,transform);gl.uniform1f(cu.width,edgeWidth);gl.uniform1f(cu.sensitivity,edgeSensitivity??.65);
     gl.uniform3fv(cu.color,studioMiniatureBaseColor(edgeColor||'#202020').slice(0,3).map((v,i)=>v*light[i]));
     for(const mesh of resource.meshes){
      bindContours(mesh,edgeSmoothing);
      gl.drawArraysInstanced(gl.TRIANGLES,0,6,mesh.contourCount);
     }
    }
   // Render a miniature-only normal/depth image, then composite visible surface boundaries.
    if(celInstances.length){
     const drawFbo=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),readFbo=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),clear=gl.getParameter(gl.COLOR_CLEAR_VALUE),clearDepth=gl.getParameter(gl.DEPTH_CLEAR_VALUE),depthFunc=gl.getParameter(gl.DEPTH_FUNC),depthEnabled=gl.isEnabled(gl.DEPTH_TEST),scissor=gl.isEnabled(gl.SCISSOR_TEST);
     gl.activeTexture(gl.TEXTURE0);const tex0=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.activeTexture(gl.TEXTURE1);const tex1=gl.getParameter(gl.TEXTURE_BINDING_2D);
     try{
      gl.disable(gl.SCISSOR_TEST);gl.enable(gl.DEPTH_TEST);
      const t=ensureTarget(viewport[2],viewport[3]);
      for(const i of celInstances){
       gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.viewport(0,0,t.w,t.h);gl.disable(gl.BLEND);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
       gl.useProgram(program);gl.uniform1i(uniforms.normalPass,1);gl.uniformMatrix4fv(uniforms.model,false,i.transform);gl.activeTexture(gl.TEXTURE2);
       for(const mesh of i.resource.meshes){const p=mesh.primitive;if(i.doubleSided||p.material.doubleSided)gl.disable(gl.CULL_FACE);else gl.enable(gl.CULL_FACE);gl.bindVertexArray(mesh.vao);gl.bindTexture(gl.TEXTURE_2D,i.resource.textures[p.material.image]||white);gl.uniform4fv(uniforms.baseColor,p.material.baseColor);gl.uniform1f(uniforms.alphaCutoff,i.forceOpaque?0:(p.material.alphaCutoff??0));gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}
       gl.uniform1i(uniforms.normalPass,0);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,drawFbo);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readFbo);gl.viewport(...viewport);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.depthMask(false);
       gl.useProgram(celProgram);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t.normal);gl.uniform1i(su.normals,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,t.depth);gl.uniform1i(su.depths,1);gl.uniform2f(su.origin,viewport[0],viewport[1]);gl.uniform1f(su.width,i.edgeWidth);gl.uniform1f(su.scale,i.edgeSensitivity??.65);gl.uniform1f(su.smoothing,i.edgeSmoothing??.6);gl.uniform3fv(su.color,studioMiniatureBaseColor(i.edgeColor||'#202020').slice(0,3).map((v,j)=>v*i.light[j]));gl.bindVertexArray(celVao);gl.drawArrays(gl.TRIANGLES,0,3);
      }
     }finally{gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,drawFbo);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,readFbo);gl.viewport(...viewport);gl.clearColor(...clear);gl.clearDepth(clearDepth);gl.depthFunc(depthFunc);if(!depthEnabled)gl.disable(gl.DEPTH_TEST);if(scissor)gl.enable(gl.SCISSOR_TEST);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,tex1);gl.useProgram(program);gl.uniform1i(uniforms.normalPass,0);}
    }
   }finally{gl.depthMask(depthMask);gl.blendFuncSeparate(...blendState);if(!blend)gl.disable(gl.BLEND);gl.useProgram(program);}
  }finally{
   gl.bindVertexArray(null);
   gl.activeTexture(gl.TEXTURE0);
   gl.disable(gl.CULL_FACE);
  }
 }
 return {prepare,retain,draw,destroy(){retain(new Set());gl.deleteTexture(white);gl.deleteProgram(program);gl.deleteProgram(contourProgram);gl.deleteProgram(celProgram);gl.deleteVertexArray(celVao);releaseTarget()}};
}

const studioMiniatureOrientationCache=new WeakMap();
function studioMiniatureOriented(asset,rotation){
 const turns=[0,1,2].map(i=>((Math.round((Number(rotation?.[i])||0)/90)%4)+4)%4);
 if(!turns.some(Boolean))return {bounds:asset.bounds,axes:[[1,0,0],[0,1,0],[0,0,1]]};
 let cache=studioMiniatureOrientationCache.get(asset);
 if(!cache){cache=new Map();studioMiniatureOrientationCache.set(asset,cache);}
 const key=turns.join(',');
 if(cache.has(key))return cache.get(key);
 const rotate=(x,y,z)=>{
  for(let i=0;i<turns[0];i++)[y,z]=[-z,y];
  for(let i=0;i<turns[1];i++)[x,z]=[z,-x];
  for(let i=0;i<turns[2];i++)[x,y]=[-y,x];
  return [x,y,z];
 };
 const axes=[rotate(1,0,0),rotate(0,1,0),rotate(0,0,1)];
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const {positions:p} of asset.primitives)for(let i=0;i<p.length;i+=3){
  const v=rotate(p[i],p[i+1],p[i+2]);
  for(let j=0;j<3;j++){min[j]=Math.min(min[j],v[j]);max[j]=Math.max(max[j],v[j]);}
 }
 let gx=Infinity,gz=Infinity,hx=-Infinity,hz=-Infinity;
 const level=min[1]+(max[1]-min[1])*.18;
 for(const {positions:p} of asset.primitives)for(let i=0;i<p.length;i+=3){
  const [x,y,z]=rotate(p[i],p[i+1],p[i+2]);
  if(y<=level){gx=Math.min(gx,x);hx=Math.max(hx,x);gz=Math.min(gz,z);hz=Math.max(hz,z);}
 }
 const result={axes,bounds:{min,max,groundCenter:[(gx+hx)/2,(gz+hz)/2]}};
 cache.set(key,result);return result;
}
function studioMiniatureSizedHeight(asset,rotation,referenceHeight,footprint,scale=1,mode='height'){
 const {min,max}=studioMiniatureOriented(asset,rotation).bounds;
 return (mode==='footprint'?footprint*(max[1]-min[1])/Math.max(max[0]-min[0],max[2]-min[2],.000001):referenceHeight)*scale;
}
function studioMiniatureTransform(asset,[x,y,z],height,heading,centerOnGround=false,rotation){
 const {bounds,axes}=studioMiniatureOriented(asset,rotation),{min,max}=bounds;
 const scale=height/Math.max(max[1]-min[1],.000001);
 const c=Math.cos(heading)*scale,s=Math.sin(heading)*scale;
 const [centerX,centerZ]=centerOnGround&&bounds.groundCenter||
  [(min[0]+max[0])/2,(min[2]+max[2])/2];
 return new Float32Array([
  ...axes.flatMap(([a,b,d])=>[c*a+s*d,s*a-c*d,scale*b,0]),
  x-c*centerX-s*centerZ,y-s*centerX+c*centerZ,z-scale*min[1]+.002,1
 ]);
}

// Original procedural textures shared between round and square bases.
const studioMiniatureBaseTextures=new Map();
function studioMiniatureBaseTexture(pattern){
 if(pattern==='solid')return null;
 if(studioMiniatureBaseTextures.has(pattern))return studioMiniatureBaseTextures.get(pattern);
 const canvas=document.createElement('canvas');
 const size=128;
 canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d');
 const palette={
  stone:['#4e4d4d','#9b9890','#777873'],
  sand:['#c59c64','#e9cb8c','#946f43'],
  snow:['#e9f1f5','#ffffff','#a3bccc'],
  grass:['#566b33','#8b9d4e','#344822']
 }[pattern];
 if(!palette)return null;
 let state=29;
 const random=()=>{
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  return state/4294967296;
 };
 ctx.fillStyle=palette[0];ctx.fillRect(0,0,size,size);
 if(pattern==='stone'){
  for(let row=0;row<5;row++)for(let x=row%2?-15:0;x<size;x+=30){
   const y=row*26;
   ctx.fillStyle=palette[1];ctx.fillRect(x+1,y+1,28,24);
   ctx.fillStyle=palette[2];ctx.fillRect(x+2,y+3,26,21);
  }
 }else{
  for(let i=0;i<9;i++){
   const y=i*17;
   ctx.beginPath();ctx.moveTo(-16,y);
   ctx.bezierCurveTo(24,y-12,69,y+14,size+16,y-4);
   ctx.strokeStyle=palette[1];ctx.globalAlpha=pattern==='grass'?.14:.34;
   ctx.lineWidth=pattern==='snow'?8:pattern==='sand'?3:5;
   ctx.stroke();
  }
 }
 ctx.globalAlpha=.45;
 for(let i=0;i<850;i++){
  const x=random()*size,y=random()*size,n=random();
  ctx.fillStyle=palette[n<.5?1:2];
  if(pattern==='grass'){
   ctx.fillRect(x,y,1+n*1.6,2+n*4);
  }else ctx.fillRect(x,y,1+n*1.7,1+n*.8);
 }
 ctx.globalAlpha=1;
 studioMiniatureBaseTextures.set(pattern,canvas);
 return canvas;
}

const studioMiniatureBases=new Map();
function studioMiniatureBaseAsset(shape,pattern='solid',ringCount=0,ringWidth=.28){
 ringCount=Math.max(0,Math.min(3,Math.trunc(Number(ringCount)||0)));
 ringWidth=Math.max(.05,Math.min(.5,Number(ringWidth)||.28));
 const key=shape+':'+pattern+':'+ringCount+':'+ringWidth;
 if(studioMiniatureBases.has(key))return studioMiniatureBases.get(key);
 const texture=studioMiniatureBaseTexture(pattern);
 const top={positions:[],normals:[]},rim={positions:[],normals:[]};
 const rings=Array.from({length:ringCount},()=>({positions:[],normals:[]}));
 const sides=shape==='square'?4:32;
 const corners=Array.from({length:sides},(_,i)=>{
  const angle=2*Math.PI*i/sides+(sides===4?Math.PI/4:0);
  const radius=sides===4?Math.SQRT1_2:.5;
  return [Math.cos(angle)*radius,Math.sin(angle)*radius];
 });
 const point=([x,z],scale,height)=>[x*scale,height,z*scale];
 const flat=[0,1,0];
 const emit=(part,normal,...points)=>{
  for(const p of points){
   part.positions.push(...p);
   part.normals.push(...normal);
  }
 };
 for(let i=0;i<sides;i++){
  const a=corners[i],b=corners[(i+1)%sides];
  const insideA=point(a,ringCount?.94-ringWidth:.82,1),insideB=point(b,ringCount?.94-ringWidth:.82,1);
  const outerA=point(a,.94,1),outerB=point(b,.94,1);
  const bottomA=point(a,1,0),bottomB=point(b,1,0);
  const edge=[(a[0]+b[0])/2,.16,(a[1]+b[1])/2];
  emit(top,flat,[0,1,0],insideB,insideA);
  if(!ringCount)emit(rim,flat,insideA,insideB,outerB,insideA,outerB,outerA);
  else for(let j=0;j<ringCount;j++){
   const inner=.94-ringWidth+ringWidth*j/ringCount,outer=.94-ringWidth+ringWidth*(j+1)/ringCount;
   const ia=point(a,inner,1),ib=point(b,inner,1),oa=point(a,outer,1),ob=point(b,outer,1);
   emit(rings[ringCount-1-j],flat,ia,ib,ob,ia,ob,oa);
  }
  emit(rim,edge,bottomA,outerA,outerB,bottomA,outerB,bottomB);
 }
 const primitives=[top,rim,...rings].map(({positions,normals},colorSlot)=>({
  positions:new Float32Array(positions),normals:new Float32Array(normals),
  indices:Uint32Array.from({length:positions.length/3},(_,i)=>i),
  texcoords:colorSlot===0&&texture?Float32Array.from(
   Array.from({length:positions.length/3},(_,i)=>[.5+positions[i*3],.5+positions[i*3+2]]).flat()):null,
  material:{image:colorSlot===0&&texture?0:-1,baseColor:[1,1,1,1],doubleSided:true},
  colorSlot
 }));
 const asset={primitives,bitmaps:texture?[texture]:[]};
 studioMiniatureBases.set(key,asset);
 return asset;
}
function studioMiniatureBaseColor(hex){
 const srgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 return [...srgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),1];
}
function studioMiniatureBaseInstance(pass,asset,base,[x,y,z],footprint,heading,light,desaturate){
 const width=footprint*.85*base.size,thickness=studioMiniatureBaseHeight(footprint);
 const c=Math.cos(heading)*width,s=Math.sin(heading)*width;
 const color=studioMiniatureBaseColor(base.color);
 const surfaceColor=base.pattern!=='solid'?color.map(value=>.75+.25*value):color;
 return {resource:pass.prepare(asset),light,desaturate,
  colors:[surfaceColor,studioMiniatureBaseColor(base.rimColor),...(base.ringColors||[]).slice(0,base.ringCount||0).map(studioMiniatureBaseColor)],
  transform:new Float32Array([c,s,0,0, 0,0,thickness,0, s,-c,0,0, x,y,z+.002,1])};
}
function studioMiniatureBaseHeight(footprint){return Math.min(.18,footprint*.075)}

let studioMiniaturePreview=null;
function renderStudioMiniaturePreview(asset,{base,doubleSided,forceOpaque,rotation,paint,sculptShade,inspectionDirection,inspectionIntensity,edgeWidth,edgeColor,edgeSensitivity,edgeSmoothing,edgeStyle,finishes,enhancedFinishes=true,modelScale=1,scaleMode='height',footprint=1,referenceHeight=1.35}={}){
 const canvas=el('miniaturePreview');
 try{
  if(!studioMiniaturePreview){
   const gl=canvas.getContext('webgl2',{antialias:true});
   if(!gl)throw Error('WebGL 2 is unavailable for the preview.');
   const pass=createStudioMiniaturePass(gl,(type,source)=>{
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    return shader;
   },()=>{
    if(studioMiniaturePreview?.pass===pass&&miniatureEditor?.asset)updateMiniatureEditor();
   });
   gl.enable(gl.DEPTH_TEST);
   studioMiniaturePreview={gl,pass};
  }
  const {gl,pass}=studioMiniaturePreview;
  canvas.hidden=false;
  const rect=canvas.getBoundingClientRect();
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1)*1.5);
  if(rect.width>0&&rect.height>0){const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}}
  const pixelScale=rect.width>0?canvas.width/rect.width:1;
  const height=studioMiniatureSizedHeight(asset,rotation,referenceHeight,footprint,modelScale,scaleMode);
  const heading=(180+Number(el('miniaturePreviewRotation').value))*Math.PI/180;
  const pitch=Number(el('miniaturePreviewElevation').value)*Math.PI/180;
  const c=Math.cos(pitch),s=Math.sin(pitch);
  const camera=new Float32Array([.65,0,0,0, 0,-.85*s,-.3*c,0,
   0,.85*c,-.3*s,0, 0,-height*.425*c,0,1]);
  const baseAsset=base?.shape&&base.shape!=='off'?studioMiniatureBaseAsset(base.shape,base.pattern,base.ringCount,base.ringWidth):null;
  pass.retain(new Set(baseAsset?[asset,baseAsset]:[asset]));
  const resource=pass.prepare(asset);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(.13,.12,.1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const light=[1,1,1],desaturate=0,baseFootprint=footprint;
  const lift=baseAsset?studioMiniatureBaseHeight(baseFootprint):0;
  const instances=[];
  if(baseAsset)instances.push(studioMiniatureBaseInstance(pass,baseAsset,base,[0,0,0],baseFootprint,heading,light,desaturate));
  instances.push({resource,transform:studioMiniatureTransform(asset,[0,0,lift],height,heading,!!baseAsset,rotation),
   light,desaturate,doubleSided,forceOpaque,paint,inspectionDirection,inspectionIntensity,
   sculptShade:enhancedFinishes?sculptShade:0,edgeWidth:enhancedFinishes?edgeWidth*pixelScale:0,edgeColor,edgeSensitivity,edgeSmoothing,edgeStyle,
   finishes:enhancedFinishes&&asset.sourceTriangles?studioMiniatureFinishSettings(finishes):null});
  studioMiniaturePreview.pick={asset,camera,model:instances.at(-1).transform};
  pass.draw(camera,instances);
  canvas.hidden=false;
 }catch(error){
  disposeStudioMiniaturePreview();
  canvas.hidden=true;
  el('miniatureStatus').textContent=error.message;
 }
}
function disposeStudioMiniaturePreview(){
 studioMiniaturePreview?.pass.destroy();
 studioMiniaturePreview=null;
}

// Pick the nearest projected STL triangle in the current orthographic preview.
function studioMiniaturePaintPick(event,radius=0){
 const pick=studioMiniaturePreview?.pick;if(!pick?.asset.sourceTriangles)return [];
 const canvas=el('miniaturePreview'),rect=canvas.getBoundingClientRect();
 const x=(event.clientX-rect.left)/rect.width*2-1,y=1-(event.clientY-rect.top)/rect.height*2;
 const {camera,model,asset}=pick,p=asset.primitives[0],m=(a,b)=>Array.from({length:16},(_,i)=>{const row=i%4,col=i>>2;return [0,1,2,3].reduce((v,k)=>v+a[k*4+row]*b[col*4+k],0);}),t=m(camera,model);
 const projected=new Float32Array(p.positions.length);
 for(let i=0;i<p.positions.length;i+=3){const a=p.positions[i],b=p.positions[i+1],c=p.positions[i+2];for(let j=0;j<3;j++)projected[i+j]=t[j]*a+t[4+j]*b+t[8+j]*c+t[12+j];}
 const samples=[{x,y,best:-1,depth:Infinity}];
 if(radius>0)for(let dy=-radius;dy<=radius;dy+=Math.max(2,radius/5))for(let dx=-radius;dx<=radius;dx+=Math.max(2,radius/5))if(dx*dx+dy*dy<=radius*radius)samples.push({x:x+2*dx/rect.width,y:y-2*dy/rect.height,best:-1,depth:Infinity});
 for(let i=0;i<p.indices.length;i+=3){const a=p.indices[i]*3,b=p.indices[i+1]*3,c=p.indices[i+2]*3,ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-12)continue;for(const sample of samples){const {x,y}=sample;if(x<Math.min(ax,bx,cx)||x>Math.max(ax,bx,cx)||y<Math.min(ay,by,cy)||y>Math.max(ay,by,cy))continue;const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,w=1-u-v;if(Math.min(u,v,w)<0)continue;const z=u*projected[a+2]+v*projected[b+2]+w*projected[c+2];if(z<sample.depth){sample.depth=z;sample.best=i/3;}}}
 return [...new Set(samples.map(s=>s.best).filter(i=>i>=0))];
}

const studioPaintTopology=new WeakMap();
function studioMiniaturePaintRegion(asset,seed,angle,paint,range=25,cleanup=true){
 let topo=studioPaintTopology.get(asset);
 if(!topo){
 const p=asset.primitives[0],v=p.positions,idx=p.indices,edges=new Map(),adj=Array.from({length:idx.length/3},()=>[]),norm=[],centers=[];
 const key=i=>[v[i*3],v[i*3+1],v[i*3+2]].map(n=>Math.round(n*1e5)).join(',');
 for(let i=0;i<idx.length;i+=3){
 const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3,u=[0,1,2].map(j=>v[b+j]-v[a+j]),w=[0,1,2].map(j=>v[c+j]-v[a+j]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],l=Math.hypot(...n)||1;norm.push(n.map(x=>x/l));centers.push([0,1,2].map(j=>(v[a+j]+v[b+j]+v[c+j])/3));
 for(let j=0;j<3;j++){const k=[key(idx[i+j]),key(idx[i+(j+1)%3])].sort().join('|'),prev=edges.get(k);if(prev!==undefined){adj[i/3].push(prev);adj[prev].push(i/3);}else edges.set(k,i/3);}
 }
 topo={adj,norm,centers};studioPaintTopology.set(asset,topo);
 }
 const {adj,norm,centers}=topo,threshold=Math.cos(angle*Math.PI/180),seen=new Set([seed]),queue=[seed],color=paint?.[seed];
 const span=Math.max(...asset.bounds.max.map((v,i)=>v-asset.bounds.min[i]));
 const within=i=>Math.hypot(...centers[i].map((v,j)=>v-centers[seed][j]))<=span*range/100;
 for(let i=0;i<queue.length;i++)for(const next of adj[queue[i]])if(!seen.has(next)&&within(next)&&paint?.[next]===color&&norm[queue[i]].reduce((a,v,j)=>a+v*norm[next][j],0)>=threshold){seen.add(next);queue.push(next);}
 if(cleanup){for(let pass=0;pass<2;pass++){const candidates=new Set(queue.flatMap(i=>adj[i]));const add=[...candidates].filter(i=>!seen.has(i)&&within(i)&&paint?.[i]===undefined&&adj[i].length>=2&&adj[i].filter(j=>seen.has(j)).length>=Math.max(2,Math.ceil(adj[i].length*.75)));for(const i of add){seen.add(i);queue.push(i);}}}
 return queue;
}

// STL vertices are sequential triangle corners. Mark actual shared creases, not all tessellation edges.
const studioFeatureCache=new WeakMap();
function studioMiniatureContours(p,level=0){
 let variants=studioFeatureCache.get(p);if(!variants){variants=new Map();studioFeatureCache.set(p,variants);}if(variants.has(level))return variants.get(level);
 const v=p.positions,idx=p.indices,segments=[],edges=new Map(),allPaths=[];
 const key=i=>[v[i*3],v[i*3+1],v[i*3+2]].join(',');
 for(let i=0;i<idx.length;i+=3){
  const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
  const u=[0,1,2].map(j=>v[b+j]-v[a+j]),w=[0,1,2].map(j=>v[c+j]-v[a+j]);
  const n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],len=Math.hypot(...n)||1;
  for(let j=0;j<3;j++){const k=[key(idx[i+(j+1)%3]),key(idx[i+(j+2)%3])].sort().join('|');const entry={i,j,n:n.map(x=>x/len)};if(edges.has(k))edges.get(k).push(entry);else edges.set(k,[entry]);}
 }
 // Score coherent crease chains, rejecting isolated short edges and mesh holes.
 const candidates=[],nodes=new Map();
 for(const [key,list] of edges){
  if(list.length!==2)continue;
  const dot=list[0].n.reduce((sum,x,j)=>sum+x*list[1].n[j],0);
  if(dot>.94)continue;
  const ends=key.split('|'),a=ends[0].split(',').map(Number),b=ends[1].split(',').map(Number);
  const e={list,ends,length:Math.hypot(...a.map((x,j)=>x-b[j])),angle:Math.acos(Math.max(-1,Math.min(1,dot))),seen:false};
  candidates.push(e);for(const k of ends){if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(e);}
 }
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<v.length;i++){let j=i%3;min[j]=Math.min(min[j],v[i]);max[j]=Math.max(max[j],v[i]);}
 const span=Math.max(...max.map((x,j)=>x-min[j]))||1;
 for(const seed of candidates){if(seed.seen)continue;seed.seen=true;const chain=[seed];let length=0,weighted=0;
  for(let i=0;i<chain.length;i++){const e=chain[i];length+=e.length;weighted+=e.length*e.angle;
   for(const k of e.ends){const neighbors=nodes.get(k);if(neighbors.length>3)continue;for(const n of neighbors)if(!n.seen){n.seen=true;chain.push(n);}}
  }
  if(length<span*.025||chain.length<3)continue;
  const score=Math.min(1,length/(span*.18))*.65+Math.min(1,weighted/Math.max(length,1e-9)/1.2)*.35;
  // Walk unbranched paths and smooth interior points, preserving sharp corners.
  const links=new Map(),unused=new Set(chain);
  for(const e of chain)for(const k of e.ends){if(!links.has(k))links.set(k,[]);links.get(k).push(e);}
  const paths=[];
  const walk=(k,e)=>{const path=[k];while(e&&unused.delete(e)){k=e.ends.find(x=>x!==k);path.push(k);if(links.get(k).length!==2)break;e=links.get(k).find(x=>unused.has(x));}return path;};
  for(const [k,es] of links)if(es.length!==2)for(const e of es)if(unused.has(e))paths.push(walk(k,e));
  while(unused.size){const e=unused.values().next().value;paths.push(walk(e.ends[0],e));}
  for(const path of paths){
   const points=path.map(k=>k.split(',').map(Number));
   let smooth=points;
   // Repeated bounded smoothing removes mesh-scale zigzags without moving endpoints.
   for(let pass=0;pass<3;pass++)smooth=smooth.map((p,i,arr)=>{
    if(!i||i===arr.length-1)return p;
    const a=arr[i-1],b=arr[i+1],u=p.map((x,j)=>x-a[j]),w=b.map((x,j)=>x-p[j]);
    const dot=u.reduce((sum,x,j)=>sum+x*w[j],0)/(Math.hypot(...u)*Math.hypot(...w)||1);
    if(dot<-.35)return p;
    const q=p.map((x,j)=>.5*x+.25*(a[j]+b[j]));
    const delta=q.map((x,j)=>x-points[i][j]),d=Math.hypot(...delta),limit=span*.0015;
    return d>limit?points[i].map((x,j)=>x+delta[j]*limit/d):q;
   });
   allPaths.push({points:smooth,score});
  }
 }
 const dist=(a,b)=>Math.hypot(...a.map((x,j)=>x-b[j]));
 const length=p=>p.slice(1).reduce((sum,x,i)=>sum+dist(x,p[i]),0);
 const dot=(a,b)=>a.reduce((sum,x,j)=>sum+x*b[j],0)/(Math.hypot(...a)*Math.hypot(...b)||1);
 const sub=(a,b)=>a.map((x,j)=>x-b[j]);
 let paths=allPaths.filter(p=>level===0||length(p.points)>=span*(.003+.012*level));
 // Spatially bucket endpoints; bridge only mutually facing, nearby open paths.
 if(level>0){
 const gap=span*.012*level, bins=new Map(),key=p=>p.map(x=>Math.floor(x/gap));
 for(const path of paths){if(dist(path.points[0],path.points.at(-1))<1e-9)continue;for(const end of [0,1]){const p=end?path.points.at(-1):path.points[0],k=key(p).join(',');if(!bins.has(k))bins.set(k,[]);bins.get(k).push({path,end,p});}}
 const used=new Set();
 for(const entries of bins.values())for(const a of entries){if(used.has(a.path))continue;const k=key(a.p);let best=null,bd=gap;
 const tangent=e=>sub(e.p,e.end?e.path.points.at(-2):e.path.points[1]);
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const b of bins.get([k[0]+x,k[1]+y,k[2]+z].join(','))||[]){if(a.path===b.path||used.has(b.path))continue;const d=dist(a.p,b.p),v=sub(b.p,a.p);if(d>1e-9&&d<bd&&dot(tangent(a),v)>.65&&dot(tangent(b),v)<-.65){best=b;bd=d;}}
 if(best){used.add(a.path);used.add(best.path);const ap=a.end?a.path.points:[...a.path.points].reverse(),bp=best.end?[...best.path.points].reverse():best.path.points;paths.push({points:[...ap,...bp],score:Math.min(a.path.score,best.path.score)});}
 }
 paths=paths.filter(p=>!used.has(p));
 }
 for(const path of paths){let pts=path.points;
 if(level>0){
 // Corner-aware quadratic interpolation with bounded displacement.
 const out=[pts[0]];
 for(let i=1;i<pts.length-1;i++){const a=pts[i-1],p=pts[i],b=pts[i+1];if(dot(sub(p,a),sub(b,p))<-.15){out.push(p);continue;}
 const t=Math.min(.45*level,span*.0025/Math.max(dist(a,p),dist(b,p),1e-9));
 const q=p.map((x,j)=>x+(a[j]-x)*t),r=p.map((x,j)=>x+(b[j]-x)*t);
 for(let k=0;k<=3;k++){const u=k/3;out.push(q.map((x,j)=>(1-u)**2*x+2*u*(1-u)*p[j]+u*u*r[j]));}}
 out.push(pts.at(-1));pts=out;
 }
 for(let i=1;i<pts.length;i++)segments.push(...pts[i-1],...pts[i],path.score);
 }
 const data=new Float32Array(segments);if(variants.size>=3)variants.delete(variants.keys().next().value);variants.set(level,data);return data;
}
