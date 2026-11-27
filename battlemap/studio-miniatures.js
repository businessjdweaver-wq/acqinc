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
 uniform mat4 camera;
 uniform mat4 model;
 out vec3 worldNormal;
 out vec2 texCoord;
 void main(){
  gl_Position=camera*model*vec4(position,1.);
  worldNormal=mat3(model)*normal;
  texCoord=uv;surfacePaint=paintColor;
 }`);
 const fragment=compile(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;
 uniform sampler2D albedo;
 uniform vec4 baseColor;
 uniform vec3 light;
 uniform float alphaCutoff;
 uniform float desaturate;
 in vec3 worldNormal;
 in vec2 texCoord;
 in vec4 surfacePaint;
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
  float shade=.62+.38*max(0.,dot(n,normalize(vec3(-.5,-.7,1.))));
  vec3 rgb=toSRGB(clamp(color.rgb*light*shade,0.,1.));
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
 const uniforms=Object.fromEntries(['albedo','camera','model','baseColor','light','alphaCutoff','desaturate']
  .map(name=>[name,gl.getUniformLocation(program,name)]));
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
  for(const mesh of resource.meshes)gl.deleteVertexArray(mesh.vao);
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
   for(const {resource,transform,light,desaturate,doubleSided,forceOpaque,colors,paint} of instances){
    gl.uniformMatrix4fv(uniforms.model,false,transform);
    gl.uniform3fv(uniforms.light,light);
    gl.uniform1f(uniforms.desaturate,desaturate);
    for(const mesh of resource.meshes){
     const {vao,primitive,count}=mesh;
     if(doubleSided||primitive.material.doubleSided)gl.disable(gl.CULL_FACE);
     else gl.enable(gl.CULL_FACE);
     gl.bindVertexArray(vao);
     if(mesh.paintBuffer&&mesh.lastPaint!==paint){const data=new Float32Array(primitive.positions.length/3*4);for(const [face,hex] of Object.entries(paint||{})){const i=Number(face);if(!Number.isInteger(i)||i<0||i*3>=count||!/^#[0-9a-f]{6}$/i.test(hex))continue;const c=studioMiniatureBaseColor(hex);for(let v=0;v<3;v++)data.set(c,primitive.indices[i*3+v]*4);}gl.bindBuffer(gl.ARRAY_BUFFER,mesh.paintBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);mesh.lastPaint=paint;}
     if(!mesh.paintBuffer)gl.vertexAttrib4f(3,0,0,0,0);
     gl.bindTexture(gl.TEXTURE_2D,resource.textures[primitive.material.image]||white);
     gl.uniform4fv(uniforms.baseColor,colors?.[primitive.colorSlot]??primitive.material.baseColor);
     gl.uniform1f(uniforms.alphaCutoff,forceOpaque?0:(primitive.material.alphaCutoff??0));
     gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,0);
    }
   }
  }finally{
   gl.bindVertexArray(null);
   gl.activeTexture(gl.TEXTURE0);
   gl.disable(gl.CULL_FACE);
  }
 }
 return {prepare,retain,draw,destroy(){retain(new Set());gl.deleteTexture(white);gl.deleteProgram(program)}};
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
function renderStudioMiniaturePreview(asset,{base,doubleSided,forceOpaque,rotation,paint}={}){
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
  const height=Math.min(1.35,1.35*(max[1]-min[1])/Math.max(max[0]-min[0],max[2]-min[2],.000001));
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
  const light=[1,1,1],desaturate=0,baseFootprint=1;
  const lift=baseAsset?studioMiniatureBaseHeight(baseFootprint):0;
  const instances=[];
  if(baseAsset)instances.push(studioMiniatureBaseInstance(pass,baseAsset,base,[0,0,0],baseFootprint,heading,light,desaturate));
  instances.push({resource,transform:studioMiniatureTransform(asset,[0,0,lift],height,heading,!!baseAsset,rotation),light,desaturate,doubleSided,forceOpaque,paint});
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
 let best=-1,depth=Infinity;
 for(let i=0;i<p.indices.length;i+=3){const a=p.indices[i]*3,b=p.indices[i+1]*3,c=p.indices[i+2]*3,ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-12)continue;const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,w=1-u-v;if(Math.min(u,v,w)<0)continue;const z=u*projected[a+2]+v*projected[b+2]+w*projected[c+2];if(z<depth){depth=z;best=i/3;}}
 return best<0?[]:[best];
}
