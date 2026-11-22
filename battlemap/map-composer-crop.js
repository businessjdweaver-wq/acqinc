/* Map Composer crop geometry and canvas clipping helpers.
 * Pure geometry; coordinates are normalized to the source image.
 */
(function(global){
'use strict';
const valid = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
function rectangleFromCorners(a,b){
 if(!valid(a)||!valid(b))throw Error('Crop corners must be finite normalized coordinates.');
 const clamp=n=>Math.max(0,Math.min(1,n));
 const x=clamp(Math.min(a[0],b[0])),y=clamp(Math.min(a[1],b[1]));
 const right=clamp(Math.max(a[0],b[0])),bottom=clamp(Math.max(a[1],b[1]));
 if(right-x<.0001||bottom-y<.0001)throw Error('Crop selection is too small.');
 return {type:'rect',x,y,width:right-x,height:bottom-y};
}
function path(ctx,crop,width,height){
 ctx.beginPath();
 if(crop.type==='rect'){
  ctx.rect(crop.x*width,crop.y*height,crop.width*width,crop.height*height);
 }else if(crop.type==='bezier'){
  const segments=crop.segments;
  if(!segments?.length)throw Error('Empty Bézier path.');
  ctx.moveTo(segments[0].anchor[0]*width,segments[0].anchor[1]*height);
  for(let i=0;i<segments.length;i++){
   const a=segments[i],b=segments[(i+1)%segments.length];
   ctx.bezierCurveTo(a.out[0]*width,a.out[1]*height,b.in[0]*width,b.in[1]*height,b.anchor[0]*width,b.anchor[1]*height);
  }
  ctx.closePath();
 }else throw Error('Unknown crop type.');
}
function hit(crop,u,v){
 if(crop.type==='rect')return u>=crop.x&&u<=crop.x+crop.width&&v>=crop.y&&v<=crop.y+crop.height;
 if(crop.type!=='bezier')return false;
 // Flatten cubic curves for consistent selection and masking.
 const polygon=[];
 const bez=(a,b,c,d,t)=>{const s=1-t;return s*s*s*a+3*s*s*t*b+3*s*t*t*c+t*t*t*d};
 for(let i=0;i<crop.segments.length;i++){
  const a=crop.segments[i],b=crop.segments[(i+1)%crop.segments.length];
  for(let step=0;step<16;step++){
   const t=step/16;
   polygon.push([0,1].map(axis=>bez(a.anchor[axis],a.out[axis],b.in[axis],b.anchor[axis],t)));
  }
 }
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const [xi,yi]=polygon[i],[xj,yj]=polygon[j];
  if((yi>v)!==(yj>v)&&u<(xj-xi)*(v-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
global.BattlemapMapCrop=Object.freeze({rectangleFromCorners,path,hit});
})(window);
