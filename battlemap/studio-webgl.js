// GPU terrain for the opt-in 3D play view. Studio still supplies the
// authoritative, visibility-filtered surfaces and owns the interactive canvas.
function createStudioWebGL(onContextLost) {
 const layer=document.createElement('canvas');
 layer.id='studioWebGL';
 layer.hidden=true;
 layer.setAttribute('aria-hidden','true');
 const gl=layer.getContext('webgl2',{antialias:true,alpha:false});
 if(!gl)throw new Error('WebGL 2 is unavailable.');
 function shader(type,source){
  const result=gl.createShader(type);
  gl.shaderSource(result,source);
  gl.compileShader(result);
  if(!gl.getShaderParameter(result,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(result));
  return result;
 }
 const program=gl.createProgram();
 const vertex=shader(gl.VERTEX_SHADER,`#version 300 es
 layout(location=0) in vec3 position;
 layout(location=1) in vec3 color;
 layout(location=2) in vec3 previousColor;
 layout(location=3) in float grid;
 layout(location=4) in float floorSurface;
 layout(location=5) in vec4 material;
 layout(location=6) in float overview;
 layout(location=7) in vec2 gridPosition;
 uniform mat3 floorMapping;
 uniform mat4 camera;
 uniform float transition;
 out vec3 tint;
 out vec2 tile;
 out vec2 floorUV;
 out vec2 materialUV;
 flat out float materialIndex;
 flat out float materialCutout;
 flat out float drawFloor;
 flat out float ghostTerrain;
 flat out float drawGrid;
 void main(){
  gl_Position=camera*vec4(position,1.);
  tint=mix(previousColor,color,transition);
  tile=gridPosition;
  drawGrid=grid;
  drawFloor=floorSurface;
  ghostTerrain=overview;
  floorUV=(floorMapping*vec3(position.xy,1.)).xy;
  materialUV=material.xy;
  materialIndex=material.z;
  materialCutout=material.w;
 }`);
 const fragment=shader(gl.FRAGMENT_SHADER,`#version 300 es
 precision highp float;
 in vec3 tint;
 in vec2 tile;
 in vec2 floorUV;
 in vec2 materialUV;
 flat in float materialIndex;
 flat in float materialCutout;
 flat in float drawFloor;
 flat in float ghostTerrain;
 uniform sampler2D floorTexture;
 uniform float floorOpacity;
 uniform vec3 floorBase;
 uniform highp sampler2DArray terrainTextures;
 uniform float terrainOpacity;
 uniform vec3 gridColor;
 flat in float drawGrid;
 out vec4 pixel;
 void main(){
  vec2 cell=abs(fract(tile-.5)-.5)/max(fwidth(tile),vec2(.0001));
  float line=drawGrid*(1.-smoothstep(.08,.85,min(cell.x,cell.y)));
  vec3 surface=tint;
  if(materialIndex>=0.){
   vec4 art=texture(terrainTextures,vec3(materialUV,materialIndex));
   if(materialCutout>.5&&art.a<.15)discard;
   surface=mix(surface,art.rgb,art.a);
  }
  if(drawFloor>.5&&floorOpacity>0.&&all(greaterThanEqual(floorUV,vec2(0.)))&&all(lessThanEqual(floorUV,vec2(1.)))){
   vec4 art=texture(floorTexture,floorUV);
   surface=mix(surface,art.rgb*clamp(tint/max(floorBase,vec3(.05)),vec3(0.),vec3(1.5)),art.a*floorOpacity);
  }
  if(ghostTerrain>.5){
   float gray=dot(surface,vec3(.2126,.7152,.0722));
   surface=vec3((gray*.58+.21)*.87);
  }
  surface=mix(surface,gridColor,clamp(line,0.,1.));
  pixel=vec4(surface,terrainOpacity);
 }`);
 gl.attachShader(program,vertex);
 gl.attachShader(program,fragment);
 gl.linkProgram(program);
 gl.deleteShader(vertex);gl.deleteShader(fragment);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
 const camera=gl.getUniformLocation(program,'camera');
 const transition=gl.getUniformLocation(program,'transition');
 const floorMapping=gl.getUniformLocation(program,'floorMapping');
 const floorOpacity=gl.getUniformLocation(program,'floorOpacity');
 const floorBase=gl.getUniformLocation(program,'floorBase');
 const terrainOpacity=gl.getUniformLocation(program,'terrainOpacity');
 const gridColor=gl.getUniformLocation(program,'gridColor');
 const floorTexture=gl.createTexture();
 gl.bindTexture(gl.TEXTURE_2D,floorTexture);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
 const atlas=gl.createTexture(),tileSize=128;
 const maxTiles=Math.min(256,gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS));
 const tiles=new Map();
 const tile=document.createElement('canvas');
 tile.width=tile.height=tileSize;
 const tileBrush=tile.getContext('2d');
 gl.activeTexture(gl.TEXTURE1);
 gl.bindTexture(gl.TEXTURE_2D_ARRAY,atlas);
 gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,tileSize,tileSize,maxTiles);
 gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.activeTexture(gl.TEXTURE0);
 gl.useProgram(program);
 gl.uniform1i(gl.getUniformLocation(program,'terrainTextures'),1);
 function tileIndex(image){
  if(!image)return -1;
  if(tiles.has(image))return tiles.get(image);
  if(tiles.size>=maxTiles)return -1;
  const index=tiles.size;
  tileBrush.clearRect(0,0,tileSize,tileSize);
  tileBrush.drawImage(image,0,0,tileSize,tileSize);
  gl.activeTexture(gl.TEXTURE1);
  try{gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,index,tileSize,tileSize,1,gl.RGBA,gl.UNSIGNED_BYTE,tile)}
  catch(error){
   if(error.name!=='SecurityError')throw error;
   tile.width=tileSize;
   return -1;
  }
  finally{gl.activeTexture(gl.TEXTURE0)}
  tiles.set(image,index);
  return index;
 }
 const positionBuffer=gl.createBuffer(),styleBuffer=gl.createBuffer(),cutawayBuffer=gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);
 gl.enableVertexAttribArray(0);
 gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);
 gl.bindBuffer(gl.ARRAY_BUFFER,styleBuffer);
 for(const [index,size,offset] of [[1,3,0],[2,3,12],[3,1,24],[4,1,28],[5,4,32],[6,1,48],[7,2,52]]){
  gl.enableVertexAttribArray(index);
  gl.vertexAttribPointer(index,size,gl.FLOAT,false,60,offset);
 }
 gl.enable(gl.DEPTH_TEST);
 gl.depthFunc(gl.LEQUAL);
 let count=0,colors=new Map(),blendAt=-Infinity,frame=0;
 let ranges=[],cutawayKey=null,opaqueCount=0,fadeCount=0;
 let lastView=null,positionKeys=[],trianglesBySurface=new Map(),floor=null,floorLayer=null;
 const blendWeight=now=>blendAt===null?0:Math.min(1,Math.max(0,(now-blendAt)/130));
 function render(now){
  frame=0;
  if(layer.hidden||!lastView)return;
  const {matrix,background,gridColor:lineColor}=lastView;
  const weight=blendWeight(now);
  gl.viewport(0,0,layer.width,layer.height);
  gl.clearColor(...background,1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniformMatrix4fv(camera,false,matrix);
  gl.uniform1f(transition,weight);
  gl.uniform1f(floorOpacity,floor?.opacity??0);
  if(floor){
   gl.uniformMatrix3fv(floorMapping,false,floor.mapping);
   gl.uniform3fv(floorBase,floor.base);
  }
  gl.uniform1f(terrainOpacity,1);
  gl.uniform3fv(gridColor,lineColor||[.3,.3,.3]);
  if(cutawayKey){
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,cutawayBuffer);
   gl.drawElements(gl.TRIANGLES,opaqueCount,gl.UNSIGNED_INT,0);
   if(fadeCount){
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(terrainOpacity,.17);
    gl.drawElements(gl.TRIANGLES,fadeCount,gl.UNSIGNED_INT,opaqueCount*4);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
   }
  }else gl.drawArrays(gl.TRIANGLES,0,count);
  if(weight<1)frame=requestAnimationFrame(time=>{
   blendAt??=time;
   render(time);
  });
 }
 function setFloor(next){
  if(next&&floorLayer!==next.layer){
   let source=next.layer;
   const cap=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE));
   const scale=Math.min(1,cap/Math.max(source.width,source.height));
   if(scale<1){
    const reduced=document.createElement('canvas');
    reduced.width=Math.max(1,Math.round(source.width*scale));
    reduced.height=Math.max(1,Math.round(source.height*scale));
    reduced.getContext('2d').drawImage(source,0,0,reduced.width,reduced.height);
    source=reduced;
   }
   gl.bindTexture(gl.TEXTURE_2D,floorTexture);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
   floorLayer=next.layer;
  }
  floor=next;
 }
 function upload(surfaces,blend){
  const styles=[],nextColors=new Map(),nextKeys=[],triangles=[];
  let tessellationHits=0,texturedFaces=0;
  const now=performance.now();
  const weight=blendWeight(now);
  const needed=new Set(surfaces.map(surface=>surface.material?.image).filter(image=>image&&!tiles.has(image)));
  if(needed.size&&tiles.size+needed.size>maxTiles)tiles.clear();
  ranges=[];
  for(const {world,color,grid,key,floorSurface=false,material,face,ghostTerrain=false} of surfaces){
   const old=blend&&colors.get(key);
   const previous=old?old.color.map((value,i)=>old.previous[i]+(value-old.previous[i])*weight):color;
   if(key)nextColors.set(key,{color,previous});
   const positionKey=JSON.stringify(world);
   let mesh=trianglesBySurface.get(positionKey);
   if(mesh)tessellationHits++;
   else{
    mesh=studioWebGLTriangles(world);
    if(trianglesBySurface.size>=12000)trianglesBySurface.delete(trianglesBySurface.keys().next().value);
    trianglesBySurface.set(positionKey,mesh);
   }
   nextKeys.push(positionKey);
   triangles.push(mesh);
   ranges.push({start:styles.length/15,count:mesh.length,face});
   const slot=tileIndex(material?.image);
   if(slot>=0&&mesh.length)texturedFaces++;
   for(const point of mesh){
    const [u,v]=slot>=0?material.uv(point):[0,0];
    const gridCoordinates=face&&!face.p?worldToGrid(point[0],point[1]):point;
    styles.push(...color,...previous,grid,Number(floorSurface),u,v,slot,Number(!!material?.cutout),Number(ghostTerrain),gridCoordinates[0],gridCoordinates[1]);
   }
  }
  const positionsReused=nextKeys.length===positionKeys.length&&nextKeys.every((key,i)=>key===positionKeys[i]);
  if(!positionsReused){
   const positions=[];
   for(const mesh of triangles)for(const point of mesh)positions.push(...point);
   gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);
   positionKeys=nextKeys;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,styleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(styles),gl.DYNAMIC_DRAW);
  count=styles.length/15;
  cutawayKey=null;
  colors=nextColors;
  blendAt=blend?null:-Infinity;
  return {positionsReused,tessellationHits,texturedFaces};
 }
 function setCutaway(modes){
  const key=modes.size?[...modes].map(([index,mode])=>index+mode).join(','):'';
  if(cutawayKey===key)return;
  cutawayKey=key;
  if(!key)return;
  const opaque=[],faded=[];
  ranges.forEach(({start,count,face})=>{
   const mode=modes.get(face?.terrainIndex);
   if(mode==='hide')return;
   const target=mode==='fade'?faded:opaque;
   for(let i=0;i<count;i++)target.push(start+i);
  });
  opaqueCount=opaque.length;fadeCount=faded.length;
  const elements=new Uint32Array(opaqueCount+fadeCount);
  elements.set(opaque);elements.set(faded,opaqueCount);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,cutawayBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,elements,gl.DYNAMIC_DRAW);
 }
 function draw(view){
  if(layer.width!==view.width)layer.width=view.width;
  if(layer.height!==view.height)layer.height=view.height;
  lastView=view;
  layer.hidden=false;
  cancelAnimationFrame(frame);
  render(performance.now());
 }
 function hide(){
  layer.hidden=true;
  cancelAnimationFrame(frame);
  frame=0;
  lastView=null;
 }
 function destroy(){
  hide();
  layer.remove();
  gl.deleteTexture(floorTexture);gl.deleteTexture(atlas);gl.deleteBuffer(cutawayBuffer);
  gl.deleteBuffer(positionBuffer);gl.deleteBuffer(styleBuffer);gl.deleteProgram(program);
 }
 layer.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  onContextLost();
 });
 return {layer,setFloor,setCutaway,upload,draw,hide,destroy};
}

// Project planar faces to their dominant plane before triangulating. Path
// walls, stairs, and shaped volumes can have concave caps.
function studioWebGLTriangles(points){
 if(points.length<3)return [];
 if(points.length===3)return points;
 const normal=[0,0,0];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];
  for(let k=0;k<3;k++)normal[k]+=(a[(k+1)%3]-b[(k+1)%3])*(a[(k+2)%3]+b[(k+2)%3]);
 }
 const dominant=normal.reduce((best,value,i)=>Math.abs(value)>Math.abs(normal[best])?i:best,0);
 const u=(dominant+1)%3,v=(dominant+2)%3,sign=Math.sign(normal[dominant]);
 if(!sign)return [];
 const indices=points.map((_,i)=>i),result=[];
 const turn=(a,b,c)=>sign*((b[u]-a[u])*(c[v]-a[v])-(b[v]-a[v])*(c[u]-a[u]));
 while(indices.length>3){
  let clipped=false;
  for(let i=0;i<indices.length;i++){
   const previous=(i+indices.length-1)%indices.length,next=(i+1)%indices.length;
   const a=points[indices[previous]],b=points[indices[i]],c=points[indices[next]];
   const bend=turn(a,b,c);
   if(Math.abs(bend)<=1e-9){
    indices.splice(i,1);clipped=true;break;
   }
   if(bend<0||indices.some((index,j)=>j!==i&&j!==previous&&j!==next&&
    turn(a,b,points[index])>=-1e-9&&turn(b,c,points[index])>=-1e-9&&turn(c,a,points[index])>=-1e-9))continue;
   result.push(a,b,c);
   indices.splice(i,1);clipped=true;break;
  }
  if(!clipped)return [];
 }
 result.push(...indices.map(i=>points[i]));
 return result;
}

let studioWebGLEnabled=true,studioWebGL=null,studioWebGLFrame=null,studioWebGLCapture=false;
let studioWebGLOverlayTokens=null;
let studioWebGLBoundedCapture=false;
function studioWebGLCoverageContains(coverage,view){
 if(!coverage)return true;
 return coverage.angle===view.angle&&coverage.tilt===view.tilt&&coverage.zoom===view.zoom&&
  coverage.width===view.width&&coverage.height===view.height&&
  Math.abs(coverage.panX-view.panX)<=coverage.margin&&Math.abs(coverage.panY-view.panY)<=coverage.margin;
}
function studioWebGLCaptureMargin(){return Math.ceil(Math.min(W,H)*.2)}
function studioWebGLView(){
 return {angle,tilt,zoom,panX,panY,width:canvas.clientWidth,height:canvas.clientHeight};
}
const studioWebGLCameraAction=/^(Camera (pan|rotation|zoom|settled|focus)|Compass rotation|Test: (Orbit|Pan|Zoom)( .*)?)$/;
const studioWebGLColors=new Map();
let studioWebGLColorContext;
function prepareStudioWebGL(){
 studioWebGL??=createStudioWebGL(()=>{
  disableStudioWebGL('WebGL context lost. Restored the standard view.');
  requestAnimationFrame(()=>draw('WebGL fallback'));
 });
 if(!studioWebGL.layer.isConnected)canvas.before(studioWebGL.layer);
}
function toggleStudioWebGL(){
 if(!studioWebGLEnabled){
  const reason=studioWebGLUnavailableReason();
  if(reason){message(reason);return}
  try{
   prepareStudioWebGL();
  }catch(error){
   message('WebGL trial unavailable: '+error.message);
   return;
  }
 }
 studioWebGLEnabled=!studioWebGLEnabled;
 studioWebGLFrame=null;
 draw('WebGL toggle');
}
function disableStudioWebGL(text){
 studioWebGLEnabled=false;
 studioWebGLFrame=null;
 studioWebGL?.destroy();
 studioWebGL=null;
 canvas.classList.remove('studioWebGLActive');
 el('studioWebGLToggle').setAttribute('aria-pressed','false');
 message(text);
}
function studioWebGLUnavailableReason(){
 if(!playing||topDown)return 'WebGL is available in 3D Play.';
 if(floorEdit||floorSceneEditing||windowPreview)return 'Finish the current edit to switch renderers.';
 const appearance=areas.find(area=>area.shape==='appearance')?.appearance;
 if(appearance?.mapComposerPieces?.length)
  return 'This scene uses the standard renderer because it contains Map Composer pieces.';
 const image=webGLFloorImage(appearance);
 if(image?.complete&&!image.naturalWidth)
  return 'The floor image could not be loaded for WebGL. Try re-uploading the artwork or hiding the floor image for the comparison.';
 return '';
}
function studioWebGLKey(){
 // A camera-only draw can reuse only the last authoritative scene inputs.
 return [currentSceneId,roomProfile,roomRevision,pieces,areas,tokens,gmVisionObserver(),
  gmIgnoreLighting,playerFogOverview(),preferences.fogMemory,showThroughTerrain,playerShowAllies,focusCutaway,cutawayHeight,preferences.graphicsQuality];
}
function studioWebGLColor(value){
 if(studioWebGLColors.has(value))return studioWebGLColors.get(value);
 studioWebGLColorContext??=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
 const color=studioWebGLColorContext;
 color.clearRect(0,0,1,1);
 color.fillStyle='#746853';
 color.fillStyle=value||'#746853';
 color.fillRect(0,0,1,1);
 const rgba=Array.from(color.getImageData(0,0,1,1).data,n=>n/255);
 if(studioWebGLColors.size<4096)studioWebGLColors.set(value,rgba);
 return rgba;
}
function studioWebGLProjector(){
 const origin=point(0,0,0);
 const axes=[[1,0,0],[0,1,0],[0,0,1]].map(input=>point(...input).map((value,i)=>value-origin[i]));
 return {origin,axes,project:([x,y,z])=>[
  origin[0]+x*axes[0][0]+y*axes[1][0]+z*axes[2][0],
  origin[1]+x*axes[0][1]+y*axes[1][1]+z*axes[2][1],
  origin[2]+x*axes[0][2]+y*axes[1][2]+z*axes[2][2]
 ]};
}
function studioWebGLDrawTerrain(appearance,{origin,axes}){
 const matrix=[];
 for(const [x,y,d] of axes)matrix.push(2*x/W,-2*y/H,-d/512,0);
 matrix.push(2*origin[0]/W-1,1-2*origin[1]/H,-origin[2]/512,1);
 studioWebGL.draw({matrix:new Float32Array(matrix),width:canvas.width,height:canvas.height,
  background:studioWebGLColor(mapFogEnabled()&&!playerFogOverview()?'#23272a':appearance?.outsideColor||'#c4b99f').slice(0,3),
  gridColor:studioWebGLColor(gridColor()).slice(0,3)});
 canvas.classList.add('studioWebGLActive');
}
let studioWebGLFloorSource=null;
function webGLFloorImage(appearance){
 const src=appearance?.ground==='image'&&appearance.groundImage;
 if(!src||areas.find(a=>a.shape==='appearance')?.floorImageHidden)return null;
 if(studioWebGLFloorSource?.src!==src){
  const image=new Image();
  image.crossOrigin='anonymous';
  image.onload=()=>{if(studioWebGLFloorSource?.image===image&&studioWebGLEnabled)draw('WebGL floor image ready')};
  image.onerror=()=>{if(studioWebGLFloorSource?.image===image&&studioWebGLEnabled)draw('WebGL floor image unavailable')};
  studioWebGLFloorSource={src,image};
  image.src=src;
 }
 return studioWebGLFloorSource.image;
}
function studioWebGLFloorMapping([origin,right,,bottom]){
 const ux=right[0]-origin[0],uy=right[1]-origin[1];
 const vx=bottom[0]-origin[0],vy=bottom[1]-origin[1];
 const determinant=ux*vy-uy*vx;
 if(Math.abs(determinant)<1e-9)return null;
 const uv=(x,y)=>{
  const dx=x-origin[0],dy=y-origin[1];
  return [(dx*vy-dy*vx)/determinant,(ux*dy-uy*dx)/determinant];
 };
 const p=uv(0,0),q=uv(1,0),r=uv(0,1);
 return new Float32Array([q[0]-p[0],q[1]-p[1],0,r[0]-p[0],r[1]-p[1],0,...p,1]);
}
const studioWebGLPatternTiles=new Map();
function studioWebGLPatternTile(...patterns){
 const layers=patterns.flatMap(patternLayers).filter(({kind})=>kind&&kind!=='plain');
 if(!layers.length)return null;
 if(layers.length===1)return scenePattern(layers[0].kind,layers[0].seed);
 const key=JSON.stringify(layers);
 if(studioWebGLPatternTiles.has(key))return studioWebGLPatternTiles.get(key);
 const tile=document.createElement('canvas');
 tile.width=tile.height=128;
 const brush=tile.getContext('2d');
 for(const {kind,seed} of layers)brush.drawImage(scenePattern(kind,seed),0,0);
 if(studioWebGLPatternTiles.size>=128)studioWebGLPatternTiles.delete(studioWebGLPatternTiles.keys().next().value);
 studioWebGLPatternTiles.set(key,tile);
 return tile;
}
function studioWebGLBaseColor(face,theme){
 const {p}=face;
 if(!p)return theme?.ground||face.fill||'#e2d4b5';
 const paint=p.opaquePaint?.[face.edge??4]||p.wash?.[face.edge??4];
 if(paint)return paint;
 if(face.doorFace||face.fixtureFace||face.pathWall||face.sceneryArt)return face.fill;
 if(face.flatColumn)return theme?.column||face.fill;
 if(face.special){
  const themedColumn=theme&&p.type==='column'&&!face.preview&&!face.biomeShape;
  return themedColumn&&!face.columnTrim?theme.column:face.fill;
 }
 const themed=theme&&!face.preview&&!['stream','waterfall','fountain'].includes(p.type);
 const groundTop=face.z!==null&&p.groundSurface&&!face.preview;
 if(groundTop)return theme?.ground||'#e2d4b5';
 if(themed){
  const siding=theme.sidePattern==='barn'&&face.z===null&&barnWall(p);
  return face.z===null?(siding?theme.wall:theme.side):theme.top;
 }
 return face.fill;
}
function studioWebGLMaterial(face,appearance,style,theme,floorRooms){
 if(preferences.graphicsQuality===3||face.rememberedFog||face.flatColumn)return null;
 const {world,p,capPattern,sidePattern}=face,edge=face.edge??4;
 const flat=world.every(point=>Math.abs(point[2]-world[0][2])<1e-6);
 const groundTop=!p||face.z!==null&&p.groundSurface;
 const siding=theme?.sidePattern==='barn'&&p&&barnWall(p);
 const basePattern=groundTop?(appearance?.ground==='image'?null:appearance?.ground||theme?.groundPattern):
  flat?theme?.topPattern:theme?.sidePattern==='barn'&&!siding?'dirt':theme?.sidePattern;
 let image,period=2;
 if(face.sceneryArt){
  const art=getArt(face.sceneryArt);
  if(art.naturalWidth)image=art;
 }else if(face.pathWall){
  const pattern=face.pathWall.texture==='mesa'?[{kind:'mesa',seed:1000+(face.pathWall.mesaStrata??58)}]:face.pathWall.texture;
  image=studioWebGLPatternTile(pattern);
 }else if(face.special&&!face.doorFace&&!face.fixtureFace){
  const themedColumn=theme&&p?.type==='column'&&!face.preview&&!face.biomeShape;
  const textureId=p?.surfaceTextures?.[edge];
  const src=style?.texturePack?.[textureId];
  const imported=typeof src==='string'?getArt(src):null;
  if(imported?.naturalWidth){
   image=imported;
   const repeat=Number(style.textureRepeat);
   if(repeat>=.5&&repeat<=12)period=repeat;
  }else if(themedColumn&&face.z===null&&theme.columnPattern)image=studioWebGLPatternTile(theme.columnPattern);
 }else if(!face.doorFace&&!face.fixtureFace&&!p?.opaquePaint?.[edge]){
  const textureId=p?.surfaceTextures?.[edge]??(groundTop&&appearance?.ground!=='image'?style?.groundTexture:null);
  const src=style?.texturePack?.[textureId];
  const imported=typeof src==='string'?getArt(src):null;
  const floor=flat&&floorRooms.findLast(room=>{
   const [x,y,z]=room.origin;
   return Math.abs(z-world[0][2])<1e-6&&world.every(([u,v])=>room.wallOutline?
    wallContainsPoint(room.wallOutline,u,v):u>=x&&u<=x+room.size&&v>=y&&v<=y+room.depth);
  });
  if(floor&&(!p||groundTop||['volume','terrace','stone'].includes(p.type)))image=roomFloorTile(floor.floorFinish);
  else if(imported?.naturalWidth){
   image=imported;
   const repeat=Number(style.textureRepeat);
   if(repeat>=.5&&repeat<=12)period=repeat;
  }else{
   const themed=p?.plainFaces?.[edge]?null:basePattern;
   const pattern=theme?.formation==='boulder'&&p&&themed?[{kind:themed,seed:terrainThemeSeed(p)}]:themed;
   image=studioWebGLPatternTile(pattern,!p&&style?.groundStamps?.[groundStampKey(face)],p?.patterns?.[edge]);
   if(!image&&p&&!theme&&!p.plainFaces?.[edge]&&!face.special&&preferences.graphicsQuality!==0)
    image=texture(face.fill,face.material||p.type,flat);
  }
 }
 if(!image)return null;
 const basis=capPattern??sidePattern;
 const [ax,ay]=basis?.along??[1,0],[ox,oy]=basis?.origin??[0,0];
 const phase=basis?basis.distance%period:0;
 const useY=!flat&&Math.abs(world[1][1]-world[0][1])>Math.abs(world[1][0]-world[0][0]);
 const groundStamp=!p&&style?.groundStamps?.[groundStampKey(face)];
 const mapGround=groundTop&&!p&&!groundStamp&&!style?.groundTexture&&appearance?.ground!=='image';
 const groundPeriodX=mapGround?gridLimit(0)/8:period;
 const groundPeriodY=mapGround?gridLimit(1)/8:period;
 return {image,uv:([x,y,z])=>basis?
  [((x-ox)*ax+(y-oy)*ay+phase)/period,(sidePattern?-z:-(x-ox)*ay+(y-oy)*ax)/period]:
  [(useY?y/groundPeriodY:x/groundPeriodX),(flat?y/groundPeriodY:-z)/period]};
}
function studioWebGLMapsFloorImage(face){
 if(face.perimeterOnly||overviewMasksFloor(face)||!face.world?.length)return false;
 if(!face.p)return !face.rememberedFog;
 return !!face.p.groundSurface&&face.z!==null&&
  face.world.every(vertex=>Math.abs(vertex[2]-face.world[0][2])<1e-7);
}
function uploadStudioWebGLFrame(blockers,showLighting,appearance,action){
 const key=studioWebGLKey();
 const prior=studioWebGLFrame;
 const blend=!!prior&&prior.key[0]===key[0]&&action?.startsWith?.('Confirmed move')&&
  !matchMedia('(prefers-reduced-motion: reduce)').matches;
 const terrain=faces.filter(face=>!face.standee&&!face.shadow&&!face.preview&&
  !face.perimeterOnly&&(face.world?.length>=3||face.canopy!==undefined));
 const visibleTokens=new Set(faces.filter(face=>face.standee&&!face.preview).map(face=>face.p));
 const theme=terrainThemes[appearance?.terrainTheme];
 const art=webGLFloorImage(appearance);
 const style=areas.find(a=>a.shape==='appearance');
 const floorRooms=[...areas.filter(a=>a.shape==='room'&&a.floorFinish),...wallRooms().filter(a=>a.floorFinish)];
 const floor=art?.naturalWidth?prepareFloorImage(art,appearance.floorImage??{}):null;
 const mapping=floor&&studioWebGLFloorMapping(floor.corners);
 studioWebGL.setFloor(mapping?{layer:floor.layer,mapping,opacity:style.floorImageOpacity??1,
  base:studioWebGLColor(theme?.ground||'#e2d4b5').slice(0,3)}:null);
 const surfaces=[];
 const overviewFog=playerFogOverview();
 for(const [terrainIndex,face] of terrain.entries()){
  const f=face;
  f.terrainIndex=terrainIndex;
  const ghostTerrain=f.fogOverview==='alley';
  const base=f.fogOverview==='interior'?fogOverviewInterior:studioWebGLBaseColor(f,theme)||f.leafColor||f.fill;
  const color=studioWebGLColor(base);
  const tint=f.rememberedFog?'#222936b0':!f.fogOverview&&showLighting&&f.world&&(!overviewFog||f.overviewLit)
   ?roomLighting(surfaceLightPoint(fogFaceCenter(f.world),f.surfaceLightOffset),blockers,true):null;
  const shaded=tint?blendStudioWebGLColor(color,studioWebGLColor(tint)):color.slice(0,3);
  const grid=!overviewMasksFloor(f)&&gridVisible()&&(!f.p||f.volumeTop&&!f.p.terrainYaw)?gridOpacity():0;
  if(f.world){
   const material=f.fogOverview?null:studioWebGLMaterial(f,appearance,style,theme,floorRooms);
   surfaces.push({world:f.world,color:shaded,grid,material,face:f,
    floorSurface:studioWebGLMapsFloorImage(f),ghostTerrain,key:JSON.stringify([!!f.rememberedFog,f.fogOverview,f.world])});
  }else{
   // Use crossed, world-space silhouettes for the legacy tree billboards.
   const [x,y,z]=f.lightSample;
   const radius=(f.projected[1][0]-f.projected[0][0])/(2*S);
   const height=radius*.66;
   for(const [dx,dy] of [[radius,0],[0,radius]]){
    const world=[[x-dx,y-dy,z],[x,y,z+height],[x+dx,y+dy,z],[x,y,z-height]];
    const material=preferences.graphicsQuality!==3?{image:foliageTexture(f.canopy,f.leafColor),cutout:true,
     uv:([u,v,w])=>[(dx?(u-x)/dx:(v-y)/dy)*.5+.5,1-(w-z)/height]}:null;
    surfaces.push({world,material,face:f,color:studioWebGLColor(f.leafColor||'#52683a').slice(0,3),grid:0,ghostTerrain,key:null});
   }
  }
 }
 const upload=studioWebGL.upload(surfaces,blend);
 const coverage=studioWebGLBoundedCapture?{...studioWebGLView(),margin:studioWebGLCaptureMargin()}:null;
 if(performanceDraw){
  performanceDraw.webGLFogScope=coverage?'Viewport plus margin':'Full scene';
  performanceDraw.webGLPositionsReused=upload.positionsReused;
  performanceDraw.webGLTessellationHits=upload.tessellationHits;
  performanceDraw.webGLTexturedFaces=upload.texturedFaces;
  performanceDraw.webGLMissingTextureFaces=surfaces.filter(surface=>surface.material).length-upload.texturedFaces;
 }
 studioWebGLFrame={key,coverage,terrain:terrain.filter(f=>f.world),movement:movementSurfaces.slice(),
  visibleTokens,blockers,appearance,texturedFaces:upload.texturedFaces,
  outlines:faces.filter(face=>face.perimeterOnly&&face.world?.length>=3)};
}
function studioWebGLCutaway(frame){
 const token=playerCameraCutawayToken();
 const focus=focusCutaway&&tokens.includes(focusCutaway.token)?focusCutaway:null;
 const view=[token,token?.x,token?.y,token?.z,token?.size,angle,tilt,S,focus];
 if(frame.cutawayView?.every((value,i)=>Object.is(value,view[i])))return frame.cutawayModes;
 const cutaway=buildPlayerCameraCutaway(token);
 const modes=new Map();
 for(const {p,wallId,terrainIndex,z,doorFace} of frame.terrain){
  let mode=cutaway?.terrain.get(p)||focus?.terrain.get(p);
  if(wallId&&cutaway?.cutawayWallIds.has(wallId))mode='fade';
  else if(mode==='fade'&&z!==null&&openingWall(p))mode=null;
  if(doorFace&&focus?.openings.has(p))mode='hide';
  if(mode)modes.set(terrainIndex,mode);
 }
 frame.cutawayView=view;
 return frame.cutawayModes=modes;
}
function blendStudioWebGLColor(base,tint){
 return base.slice(0,3).map((value,index)=>value*(1-tint[3])+tint[index]*tint[3]);
}
function studioWebGLStandeeOverlay(visibleTokens,focal,preview,carried){
 const matches=(token,other)=>token===other||!!other?.roomId&&token.roomId===other.roomId;
 const allowed=[...visibleTokens].filter(token=>!matches(token,preview)&&
  !(preview&&!preview.roomId&&token===carried)&&!matches(token,focal));
 // Terrain capture may omit the focal actor during a carry or at the edge
 // of the viewport. Draw the current owned actor independently of that cache.
 if(focal&&!matches(focal,preview)&&!(preview&&!preview.roomId&&focal===carried))allowed.push(focal);
 return {allowed,focalOverlay:focal&&(matches(focal,preview)||preview&&!preview.roomId&&focal===carried?preview:focal)};
}
function drawStudioWebGLFrame(frame,ratio,destination=null,retainTerrain=false){
 const {terrain,movement,visibleTokens,blockers,appearance}=frame;
 const projector=studioWebGLProjector();
 const cutaway=retainTerrain?frame.cutawayModes??new Map():studioWebGLCutaway(frame);
 if(!retainTerrain){
  studioWebGL.setCutaway(cutaway);
  studioWebGLDrawTerrain(appearance,projector);
 }
 if(performanceDraw){
  performanceDraw.webGLCutawayFaces=cutaway.size;
  performanceDraw.webGLTexturedFaces=frame.texturedFaces;
 }
 ctx.setTransform(ratio,0,0,ratio,0,0);
 ctx.clearRect(0,0,W,H);
 const reproject=f=>{
  const projected=f.world.map(projector.project);
  return {...f,projected,depth:projected.reduce((sum,point)=>sum+point[2],0)/projected.length};
 };
 for(const face of frame.outlines??[]){
  const outline=reproject(face);
  if(visibleProjection(outline.projected))paintRaisedPlatformOutline(outline);
 }
 const surfaceFaces=terrain.filter(f=>cutaway.get(f.terrainIndex)!=='hide').map(reproject).filter(f=>visibleProjection(f.projected));
 const front=(a,b)=>Number(a.z!==0||a.standee)-Number(b.z!==0||b.standee)||a.depth-b.depth;
 movementSurfaces=movement.map(reproject).filter(f=>visibleProjection(f.projected)).sort(front);
 faces=[];
 const confirmed=playerStandeePreview?.scene===currentSceneId?playerStandeePreview.token:null;
 const preview=destination||confirmed;
 // Keep the standees that passed the last frame’s fog checks until the new
 // terrain and visibility list are ready to replace that frame together.
 const {allowed,focalOverlay}=studioWebGLStandeeOverlay(visibleTokens,playerCameraCutawayToken(),preview,carry?.piece);
 studioWebGLOverlayTokens=new Set(preview?[...allowed,preview]:allowed);
 try{
 for(const token of allowed)if(visiblePiece(token))drawStandee(token,false);
 if(preview&&visiblePiece(preview))drawStandee(preview,!confirmed);
 const standees=faces.sort((a,b)=>a.depth-b.depth);
 faces=surfaceFaces.concat(standees).sort(front);
 const indexByFace=new Map(faces.map((face,index)=>[face,index]));
 const hideBehindTerrain=face=>face.p!==focalOverlay&&!isMovingStandeePreview(face.p)&&!showThroughTerrain&&!playerAllyCameraVisible(face.p);
 const cover=surfaceFaces.filter(f=>f.p&&!f.windowPane&&!cutaway.has(f.terrainIndex)).map(f=>[indexByFace.get(f),f,projectedBounds(f.projected)]);
 for(const f of standees){
  ctx.save();ctx.globalAlpha=f.preview?.72:1;
  if(hideBehindTerrain(f)){
   const [left,top,right,bottom]=projectedBounds(f.projected);
   for(const [order,surface,box] of cover){
    if(order<=indexByFace.get(f)||box[2]<=left||box[0]>=right||box[3]<=top||box[1]>=bottom)continue;
    ctx.beginPath();ctx.rect(0,0,W,H);
    surface.projected.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();ctx.clip('evenodd');
   }
  }
  // Camera-only frames use the already accepted visibility list.
  paintBattlefieldStandee(f,false,blockers);
  ctx.restore();
 }
 for(const token of allowed){
  const aura=visibleStandeeAura(token);
  if(aura)drawAreaVolume(aura);
 }
 drawAreaTemplates();drawRoute();positionMoveActions();
 drawStandeeMarks();drawFloorElevationLabels(true);updateStandeeTally();
 const readouts=drawStandeeNames();
 drawInitiativePing();drawBoardPings();updateMapHandleLayer(blockers,readouts);updateObjectHandleHover();
 drawArcaneEyes();drawJournalPins();positionCharacterPanel();updatePlayCombatStats();
 el('startup').hidden=true;
 }finally{studioWebGLOverlayTokens=null}
}
