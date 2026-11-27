// Miniatures share terrain's camera and depth buffer. The 2D standee still
// supplies interaction geometry, nameplates, facing indicators and markers.
function createStudioMiniaturePass(gl, compile) {
 const program=gl.createProgram();
 const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
 layout(location=0) in vec3 position;
 layout(location=1) in vec3 normal;
 layout(location=2) in vec2 uv;
 layout(location=3) in vec4 paintColor;
 out vec4 surfacePaint;
 layout(location=4) in vec3 featureMask;
 flat out vec3 edgeMask;
 out vec3 bary;
 uniform mat4 camera;
 uniform mat4 model;
 out vec3 worldNormal;
 out vec2 texCoord;
 void main(){
  gl_Position=camera*model*vec4(position,1.);
  worldNormal=mat3(model)*normal;
  texCoord=uv;surfacePaint=paintColor;edgeMask=featureMask;
  int k=gl_VertexID%3;bary=vec3(k==0?1.:0.,k==1?1.:0.,k==2?1.:0.);
 }`);
 const fragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;
 uniform sampler2D albedo;
 uniform vec4 baseColor;
 uniform vec3 light;
 uniform float alphaCutoff;
 uniform float desaturate;
 uniform float sculptShade;
 uniform float edgeWidth;
 uniform float edgeSensitivity;
 uniform vec3 edgeColor;
 uniform vec3 inspectionDirection;
 uniform float inspectionIntensity;
 in vec3 worldNormal;
 in vec2 texCoord;
 in vec4 surfacePaint;
 flat in vec3 edgeMask;
 in vec3 bary;
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
  float ndl=max(0.,dot(n,normalize(vec3(-.5,-.7,1.))));
  float shade=mix(.62+.38*ndl,.32+.68*ndl,sculptShade);
  float crease=clamp(length(dFdx(n))+length(dFdy(n)),0.,1.);
  float rim=pow(1.-abs(dot(n,normalize(vec3(.35,-.45,1.)))),3.);
  shade*=1.-.28*sculptShade*crease;
  shade+=sculptShade*(.14*rim+.12*crease*ndl);
  float lamp=max(0.,dot(n,normalize(inspectionDirection)));
  shade+=inspectionIntensity*(.18+.85*lamp);
  vec3 rgb=toSRGB(clamp(color.rgb*light*shade,0.,1.));
  rgb=mix(rgb,vec3(1.),clamp(inspectionIntensity*.32*pow(lamp,2.),0.,.65));
  rgb+=light*(.10*sculptShade*pow(ndl,3.));
  float edge=length(dFdx(n))+length(dFdy(n));
  vec3 dist=bary/max(fwidth(bary),vec3(.000001));
  vec3 lines=(1.-smoothstep(vec3(max(0.,edgeWidth-.75)),vec3(edgeWidth+.75),dist))*step(vec3(edgeSensitivity),edgeMask);
  float ink=max(max(lines.x,lines.y),lines.z)*step(.001,edgeWidth);
  // Do not ink individual normal derivatives: they reveal tessellation noise.
  rgb=mix(rgb,edgeColor*light,ink);
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
 const uniforms=Object.fromEntries(['albedo','camera','model','baseColor','light','alphaCutoff','desaturate','sculptShade','inspectionDirection','inspectionIntensity','edgeWidth','edgeColor','edgeSensitivity']
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
 pos.xy+=offset*2./viewport*pos.w;pos.z-=.00015*pos.w;
 gl_Position=pos;local=vec2(end?lengthPx+r:-r,side*r);strength=score;
 }`);
 const cf=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;
 in vec2 local;flat in float lengthPx;flat in float strength;
 uniform float width,sensitivity;uniform vec3 color;
 out vec4 pixel;
 void main(){if(strength<sensitivity)discard;
 float d=length(vec2(local.x-clamp(local.x,0.,lengthPx),local.y));
 float alpha=1.-smoothstep(max(0.,width*.5-.65),width*.5+.65,d);
 if(alpha<.01)discard;pixel=vec4(color,alpha);}
 `);
 gl.attachShader(contourProgram,cv);gl.attachShader(contourProgram,cf);gl.linkProgram(contourProgram);gl.deleteShader(cv);gl.deleteShader(cf);
 if(!gl.getProgramParameter(contourProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(contourProgram));
 const cu=Object.fromEntries(['camera','model','viewport','width','sensitivity','color'].map(n=>[n,gl.getUniformLocation(contourProgram,n)]));
 const white=gl.createTexture();
 const cache=new Map();
 gl.activeTexture(gl.TEXTURE2);
 gl.bindTexture(gl.TEXTURE_2D,white);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
 gl.activeTexture(gl.TEXTURE0);

 function dispose(resource){
  for(const texture of resource.textures)gl.deleteTexture(texture);
  for(const buffer of resource.buffers)gl.deleteBuffer(buffer);
  for(const mesh of resource.meshes){gl.deleteVertexArray(mesh.vao);if(mesh.contourVao)gl.deleteVertexArray(mesh.contourVao);}
 }
 function upload(asset){
  const resource={textures:[],buffers:[],meshes:[]};
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
    if(asset.sourceTriangles){
     const data=studioMiniatureContours(primitive);
     mesh.contourCount=data.length/7;
     if(mesh.contourCount){mesh.contourVao=gl.createVertexArray();gl.bindVertexArray(mesh.contourVao);
      const buffer=gl.createBuffer();resource.buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      for(const [loc,size,offset] of [[0,3,0],[1,3,12],[2,1,24]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,28,offset);gl.vertexAttribDivisor(loc,1);}
     }
    }
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
 }
 function draw(matrix,instances){
  if(!instances.length)return;
  gl.useProgram(program);
  gl.uniform1i(uniforms.albedo,2);
  gl.uniformMatrix4fv(uniforms.camera,false,matrix);
  gl.activeTexture(gl.TEXTURE2);
  try{
   for(const {resource,transform,light,desaturate,doubleSided,forceOpaque,colors,paint,sculptShade,inspectionDirection,inspectionIntensity,edgeWidth,edgeColor,edgeSensitivity} of instances){
    gl.uniformMatrix4fv(uniforms.model,false,transform);
    gl.uniform3fv(uniforms.light,light);
    gl.uniform1f(uniforms.desaturate,desaturate);
    gl.uniform3fv(uniforms.inspectionDirection,inspectionDirection||[0,0,1]);
    gl.uniform1f(uniforms.inspectionIntensity,inspectionIntensity||0);
    gl.uniform1f(uniforms.edgeSensitivity,Math.max(.01,Number(edgeSensitivity)||.65));
    gl.uniform1f(uniforms.edgeWidth,0);
    gl.uniform3fv(uniforms.edgeColor,studioMiniatureBaseColor(edgeColor||'#202020').slice(0,3));
    gl.uniform1f(uniforms.sculptShade,Math.max(0,Math.min(1,Number(sculptShade)||0)));
    for(const mesh of resource.meshes){
     const {vao,primitive,count}=mesh;
     if(doubleSided||primitive.material.doubleSided)gl.disable(gl.CULL_FACE);
     else gl.enable(gl.CULL_FACE);
     gl.bindVertexArray(vao);
     if(mesh.paintBuffer&&mesh.lastPaint!==paint){const data=new Float32Array(primitive.positions.length/3*4);for(const [face,hex] of Object.entries(paint||{})){const i=Number(face);if(!Number.isInteger(i)||i<0||i*3>=count||!/^#[0-9a-f]{6}$/i.test(hex))continue;const c=studioMiniatureBaseColor(hex);for(let v=0;v<3;v++)data.set(c,primitive.indices[i*3+v]*4);}gl.bindBuffer(gl.ARRAY_BUFFER,mesh.paintBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);mesh.lastPaint=paint;}
     if(!mesh.paintBuffer){gl.vertexAttrib4f(3,0,0,0,0);gl.vertexAttrib3f(4,0,0,0);}
     gl.bindTexture(gl.TEXTURE_2D,resource.textures[primitive.material.image]||white);
     gl.uniform4fv(uniforms.baseColor,colors?.[primitive.colorSlot]??primitive.material.baseColor);
     gl.uniform1f(uniforms.alphaCutoff,forceOpaque?0:(primitive.material.alphaCutoff??0));
     gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,0);
    }
   }
   const viewport=gl.getParameter(gl.VIEWPORT),blend=gl.isEnabled(gl.BLEND),depthMask=gl.getParameter(gl.DEPTH_WRITEMASK);
   const blendState=[gl.BLEND_SRC_RGB,gl.BLEND_DST_RGB,gl.BLEND_SRC_ALPHA,gl.BLEND_DST_ALPHA].map(k=>gl.getParameter(k));
   try{
    gl.useProgram(contourProgram);gl.uniformMatrix4fv(cu.camera,false,matrix);gl.uniform2f(cu.viewport,viewport[2],viewport[3]);
    gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    for(const {resource,transform,edgeWidth,edgeColor,edgeSensitivity,light} of instances){
     if(!(edgeWidth>0))continue;
     gl.uniformMatrix4fv(cu.model,false,transform);gl.uniform1f(cu.width,edgeWidth);gl.uniform1f(cu.sensitivity,edgeSensitivity??.65);
     gl.uniform3fv(cu.color,studioMiniatureBaseColor(edgeColor||'#202020').slice(0,3).map((v,i)=>v*light[i]));
     for(const mesh of resource.meshes)if(mesh.contourVao){gl.bindVertexArray(mesh.contourVao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,mesh.contourCount);}
    }
   }finally{gl.depthMask(depthMask);gl.blendFuncSeparate(...blendState);if(!blend)gl.disable(gl.BLEND);gl.useProgram(program);}
  }finally{
   gl.bindVertexArray(null);
   gl.activeTexture(gl.TEXTURE0);
   gl.disable(gl.CULL_FACE);
  }
 }
 return {prepare,retain,draw,destroy(){retain(new Set());gl.deleteTexture(white);gl.deleteProgram(program);gl.deleteProgram(contourProgram)}};
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
function renderStudioMiniaturePreview(asset,{base,doubleSided,forceOpaque,rotation,paint,sculptShade,inspectionDirection,inspectionIntensity,edgeWidth,edgeColor,edgeSensitivity,modelScale=1,scaleMode='height',footprint=1,referenceHeight=1.35}={}){
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
   });
   gl.enable(gl.DEPTH_TEST);
   studioMiniaturePreview={gl,pass};
  }
  const {gl,pass}=studioMiniaturePreview;
  const {min,max}=studioMiniatureOriented(asset,rotation).bounds;
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
  instances.push({resource,transform:studioMiniatureTransform(asset,[0,0,lift],height,heading,!!baseAsset,rotation),light,desaturate,doubleSided,forceOpaque,paint,sculptShade,inspectionDirection,inspectionIntensity,edgeWidth,edgeColor,edgeSensitivity});
  studioMiniaturePreview.pick={asset,camera,model:instances.at(-1).transform};
  pass.draw(camera,instances);
  canvas.hidden=false;
 }catch(error){
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
function studioMiniatureContours(p){
 if(studioFeatureCache.has(p))return studioFeatureCache.get(p);
 const v=p.positions,idx=p.indices,segments=[],edges=new Map();
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
   const smooth=points.map((p,i)=>{if(!i||i===points.length-1)return p;const a=points[i-1],b=points[i+1],u=p.map((x,j)=>x-a[j]),w=b.map((x,j)=>x-p[j]);const dot=u.reduce((sum,x,j)=>sum+x*w[j],0)/(Math.hypot(...u)*Math.hypot(...w)||1);return dot<.5?p:p.map((x,j)=>.75*x+.125*(a[j]+b[j]));});
   for(let i=1;i<smooth.length;i++)segments.push(...smooth[i-1],...smooth[i],score);
  }
 }
 const data=new Float32Array(segments);studioFeatureCache.set(p,data);return data;
}
