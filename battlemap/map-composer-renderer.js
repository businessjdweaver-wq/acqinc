/* Battlemap Studio Map Composer rendering adapter.
 * Draws each image on a fixed world-space quad through the host projection.
 * Does not mutate the scene grid, floor-image transform, or camera state.
 */
(function(global){
'use strict';
const core=()=>global.BattlemapMapComposer;
function quad(piece){
 const api=core();
 if(!api)throw Error('Map Composer core unavailable.');
 return [api.worldFromLocal(piece,0,0),api.worldFromLocal(piece,1,0),api.worldFromLocal(piece,1,1),api.worldFromLocal(piece,0,1)];
}
function projectQuad(piece,project){
 if(typeof project!=='function')throw Error('A world-to-screen projector is required.');
 return quad(piece).map(([x,y,z])=>project(x,y,z));
}
function clippedImage(image,crop){
 if(!image?.naturalWidth||!image?.naturalHeight)return null;
 const width=image.naturalWidth,height=image.naturalHeight;
 const surface=document.createElement('canvas');
 surface.width=width;surface.height=height;
 const g=surface.getContext('2d');
 if(!g)return null;
 g.save();
 global.BattlemapMapCrop.path(g,crop,width,height);
 g.clip();
 g.drawImage(image,0,0,width,height);
 g.restore();
 return surface;
}
const cache=new WeakMap();
function texture(image,crop){
 if(!image?.naturalWidth)return null;
 let entries=cache.get(image);
 if(!entries){entries=new Map();cache.set(image,entries)}
 const key=JSON.stringify(crop);
 if(!entries.has(key)){
  if(entries.size>8)entries.clear();
  entries.set(key,clippedImage(image,crop));
 }
 return entries.get(key);
}
function paint(items,options){
 const {project,resolveImage,mapImage,context,shouldPaint}=options||{};
 if(typeof project!=='function'||typeof resolveImage!=='function'||typeof mapImage!=='function')
  throw Error('Map Composer renderer requires project, resolveImage, and mapImage callbacks.');
 const ordered=[...items].filter(p=>p.visible!==false).sort((a,b)=>a.order-b.order);
 let painted=0;
 for(const piece of ordered){
  if(shouldPaint&&!shouldPaint(piece))continue;
  const image=resolveImage(piece.assetId);
  if(!image?.naturalWidth)continue;
  const imageLayer=texture(image,piece.crop);
  if(!imageLayer)continue;
  const projected=projectQuad(piece,project);
  if(projected.some(point=>!Array.isArray(point)||point.length<2||!point.every(Number.isFinite)))continue;
  if(context)context.save();
  try{
   if(context)context.globalAlpha*=piece.opacity;
   mapImage(imageLayer,projected,piece);
   painted++;
  }finally{if(context)context.restore()}
 }
 return painted;
}
global.BattlemapMapComposerRenderer=Object.freeze({quad,projectQuad,paint,clippedImage,texture});
})(window);
