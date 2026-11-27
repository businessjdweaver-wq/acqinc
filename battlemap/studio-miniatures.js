// Miniatures share terrain's camera and depth buffer. The 2D standee still
// supplies interaction geometry, nameplates, facing indicators and markers.
function createStudioMiniaturePass(gl, compile) {
 const program=gl.createProgram();
 const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
 layout(location=0) in vec3 position;
 layout(location=1) in vec3 normal;
 layout(location=2) in vec2 uv;
 uniform mat4 camera;
 uniform mat4 model;
 out vec3 worldNormal;
 out vec2 texCoord;
 void main(){
  gl_Position=camera*model*vec4(position,1.);
  worldNormal=mat3(model)*normal;
  texCoord=uv;
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
 out vec4 pixel;
 vec3 toSRGB(vec3 rgb){
  return mix(12.92*rgb,1.055*pow(max(rgb,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),rgb));
 }
 void main(){
  vec4 color=texture(albedo,texCoord)*baseColor;
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
    resource.meshes.push({vao,primitive,count:primitive.indices.length});
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
   for(const {resource,transform,light,desaturate} of instances){
    gl.uniformMatrix4fv(uniforms.model,false,transform);
    gl.uniform3fv(uniforms.light,light);
    gl.uniform1f(uniforms.desaturate,desaturate);
    for(const {vao,primitive,count} of resource.meshes){
     if(primitive.material.doubleSided)gl.disable(gl.CULL_FACE);
     else gl.enable(gl.CULL_FACE);
     gl.bindVertexArray(vao);
     gl.bindTexture(gl.TEXTURE_2D,resource.textures[primitive.material.image]||white);
     gl.uniform4fv(uniforms.baseColor,primitive.material.baseColor);
     gl.uniform1f(uniforms.alphaCutoff,primitive.material.alphaCutoff??0);
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

function studioMiniatureTransform(asset,[x,y,z],height,heading){
 const {min,max}=asset.bounds;
 const scale=height/(max[1]-min[1]);
 const c=Math.cos(heading)*scale,s=Math.sin(heading)*scale;
 const centerX=(min[0]+max[0])/2,centerZ=(min[2]+max[2])/2;
 return new Float32Array([
  c,s,0,0, 0,0,scale,0, s,-c,0,0,
  x-c*centerX-s*centerZ,y-s*centerX+c*centerZ,z-scale*min[1]+.002,1
 ]);
}

let studioMiniaturePreview=null;
function renderStudioMiniaturePreview(asset){
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
  const {min,max}=asset.bounds;
  const height=Math.min(1.35,1.35*(max[1]-min[1])/Math.max(max[0]-min[0],max[2]-min[2],.000001));
  const heading=(180+Number(el('miniaturePreviewRotation').value))*Math.PI/180;
  const pitch=Number(el('miniaturePreviewElevation').value)*Math.PI/180;
  const c=Math.cos(pitch),s=Math.sin(pitch);
  const camera=new Float32Array([.65,0,0,0, 0,-.85*s,-.3*c,0,
   0,.85*c,-.3*s,0, 0,-height*.425*c,0,1]);
  pass.retain(new Set([asset]));
  const resource=pass.prepare(asset);
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(.13,.12,.1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  pass.draw(camera,[{resource,transform:studioMiniatureTransform(asset,[0,0,0],height,heading),light:[1,1,1],desaturate:0}]);
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
