/* Map Composer editor prototype.
 * Standalone, opt-in sandbox UI: no scene writes, no changes to battlefield.
 * Asset references and server synchronization will be wired in the next integration.
 */
(function(global){
'use strict';
function mount(options={}){
 const api=global.BattlemapMapComposer;
 if(!api)throw Error('Map Composer core is not loaded.');
 if(document.getElementById('mapComposerOpen'))return;
 const host=options.host||null;
 const store=api.createStore(host?.load?.()||[]);
 const urls=new Map();
 let current=null,drag=null;
 const trigger=document.createElement('button');
 trigger.id='mapComposerOpen';trigger.type='button';trigger.textContent='Map Composer (preview)';
 const imageManagerButton=document.getElementById('openManagedImages');
 const imageManagerDialog=document.getElementById('managedImageDialog');
 const anchor=imageManagerButton||document.getElementById('sceneAppearance');
 if(!anchor)return;
 anchor.insertAdjacentElement('afterend',trigger);
 // Keep a second entry point inside Image Manager, without placing controls after a hidden dialog.
 let managerTrigger=null;
 if(imageManagerDialog){
  managerTrigger=document.createElement('button');
  managerTrigger.type='button';managerTrigger.id='mapComposerFromImageManager';
  managerTrigger.textContent='Open Map Composer';
  const catalogButton=imageManagerDialog.querySelector('#managedExportCatalog');
  if(catalogButton)catalogButton.insertAdjacentElement('afterend',managerTrigger);
  else imageManagerDialog.querySelector('form')?.insertAdjacentElement('beforebegin',managerTrigger);
 }
 const dialog=document.createElement('dialog');
 dialog.id='mapComposerDialog';
 dialog.style.cssText='max-width:min(95vw,1000px);width:900px;color:#f6eddb;background:#272a28;border:1px solid #8c806b;border-radius:10px';
 dialog.innerHTML='<h2>Map Composer — isolated preview</h2><p>This editor previews image placement only. It does not yet change or save the live battlefield.</p><label>Import images <input type="file" accept="image/png,image/jpeg,image/webp" multiple></label><div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:2;min-width:280px"><canvas width="700" height="480" style="width:100%;touch-action:none;background:#a79d83;border:1px solid #827760"></canvas></div><div style="flex:1;min-width:180px"><label>Piece <select style="width:100%"></select></label><div class="map-composer-fields"></div><button type="button" data-action="delete">Remove piece</button></div></div><p role="status"></p><button type="button" data-action="close">Close</button>';
 document.body.append(dialog);
 const file=dialog.querySelector('input[type=file]'),canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),select=dialog.querySelector('select'),fields=dialog.querySelector('.map-composer-fields'),status=dialog.querySelector('[role=status]');
 const images=new Map();
 const resolveImage=assetId=>images.get(assetId)||host?.resolveImage?.(assetId)||null;
 // Native pixel dimensions describe the image; width/depth describe battlefield grid squares.
 // Fit a newly imported image inside a 40-square preview envelope without distortion.
 function fittedDimensions(img){
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  if(!(w>0&&h>0))return {width:20,depth:20};
  const scale=40/Math.max(w,h);
  return {width:Number((w*scale).toFixed(3)),depth:Number((h*scale).toFixed(3))};
 }
 const worldScale=10;
 const toScreen=(x,y)=>[canvas.width/2+x*worldScale,canvas.height/2+y*worldScale];
 const toWorld=(x,y)=>[(x-canvas.width/2)/worldScale,(y-canvas.height/2)/worldScale];
 const piecePath=(p)=>[api.worldFromLocal(p,0,0),api.worldFromLocal(p,1,0),api.worldFromLocal(p,1,1),api.worldFromLocal(p,0,1)].map(([x,y])=>toScreen(x,y));
 function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#b6a788';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#83775f';ctx.lineWidth=.5;ctx.beginPath();
  for(let x=canvas.width%50;x<canvas.width;x+=50){ctx.moveTo(x,0);ctx.lineTo(x,canvas.height)}
  for(let y=canvas.height%50;y<canvas.height;y+=50){ctx.moveTo(0,y);ctx.lineTo(canvas.width,y)}
  ctx.stroke();
  for(const p of store.list().sort((a,b)=>a.order-b.order)){
   const img=resolveImage(p.assetId);if(!img?.naturalWidth)continue;
   const [cx,cy]=toScreen(p.x,p.y);
   ctx.save();ctx.translate(cx,cy);ctx.rotate(p.rotation*Math.PI/180);ctx.globalAlpha=p.opacity;
   const dx=-p.width*worldScale/2,dy=-p.depth*worldScale/2,dw=p.width*worldScale,dh=p.depth*worldScale;
   if(p.crop.type==='rect'){
    const c=p.crop;ctx.drawImage(img,c.x*img.width,c.y*img.height,c.width*img.width,c.height*img.height,dx,dy,dw,dh);
   }else{
    // Preview only: Bézier clipping uses the same normalized control points stored by the core.
    ctx.translate(dx,dy);
    global.BattlemapMapCrop.path(ctx,p.crop,dw,dh);
    ctx.clip();ctx.drawImage(img,0,0,dw,dh);
   }
   ctx.restore();
   if(p.id===current){
    const poly=piecePath(p);ctx.strokeStyle='#ffdc80';ctx.lineWidth=3;ctx.beginPath();poly.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();
   }
  }
 }
 // Reuse the Scene Appearance crop interaction model: drag a rectangle, or drag
 // Bézier anchors and their incoming/outgoing handles. Store normalized geometry.
 function openCropEditor(piece){
  const img=resolveImage(piece.assetId);
  if(!img?.naturalWidth){status.textContent='Wait for the image to load before cropping.';return}
  const cropDialog=document.createElement('dialog');
  cropDialog.style.cssText='width:min(94vw,1000px);max-width:1000px;background:#252b29;color:#f4e9d2;border:1px solid #92836a;border-radius:10px';
  cropDialog.innerHTML='<h3>Crop image</h3><p>Marquee: drag a rectangle. Bézier: drag the square anchors or round control handles, as in Scene Appearance.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button type="button" data-mode="rect">Marquee selection</button><button type="button" data-mode="bezier">Bézier curve</button><button type="button" data-reset>Reset crop</button></div><canvas width="900" height="580" style="width:100%;max-height:65vh;object-fit:contain;touch-action:none;border:1px solid #786d5a;background:#5c584f"></canvas><div style="display:flex;gap:8px;margin-top:10px"><button type="button" data-apply>Apply crop</button><button type="button" data-cancel>Cancel</button></div>';
  document.body.append(cropDialog);
  const preview=cropDialog.querySelector('canvas'),g=preview.getContext('2d');
  let mode=piece.crop.type==='bezier'?'bezier':'rect',crop=JSON.parse(JSON.stringify(piece.crop)),drag=null;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const defaultBezier=()=>({type:'bezier',segments:[
   {anchor:[.1,.1],in:[.1,.3],out:[.3,.1]},
   {anchor:[.9,.1],in:[.7,.1],out:[.9,.3]},
   {anchor:[.9,.9],in:[.9,.7],out:[.7,.9]},
   {anchor:[.1,.9],in:[.3,.9],out:[.1,.7]}
  ]});
  function rect(){const scale=Math.min((preview.width-32)/img.naturalWidth,(preview.height-32)/img.naturalHeight);const w=img.naturalWidth*scale,h=img.naturalHeight*scale;return {x:(preview.width-w)/2,y:(preview.height-h)/2,w,h}}
  function pixel(point,r){return [r.x+point[0]*r.w,r.y+point[1]*r.h]}
  function draw(){
   const r=rect();g.clearRect(0,0,preview.width,preview.height);g.drawImage(img,r.x,r.y,r.w,r.h);
   g.save();g.fillStyle='rgba(0,0,0,.5)';g.fillRect(r.x,r.y,r.w,r.h);
   g.save();global.BattlemapMapCrop.path(g,crop,r.w,r.h);g.translate(r.x,r.y); // path is already built in local coordinates
   g.restore();g.restore();
   g.save();g.translate(r.x,r.y);global.BattlemapMapCrop.path(g,crop,r.w,r.h);g.clip();g.drawImage(img,0,0,r.w,r.h);g.restore();
   g.save();g.translate(r.x,r.y);global.BattlemapMapCrop.path(g,crop,r.w,r.h);g.strokeStyle='#ffe6a1';g.lineWidth=2;g.stroke();g.restore();
   if(mode==='bezier'){
    for(const node of crop.segments){const a=pixel(node.anchor,r);
     for(const key of ['in','out']){const b=pixel(node[key],r);g.strokeStyle='#f6dca4';g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke();g.fillStyle='#73d3e0';g.beginPath();g.arc(...b,5,0,Math.PI*2);g.fill()}
     g.fillStyle='#ffe6a1';g.fillRect(a[0]-5,a[1]-5,10,10);
    }
   }
  }
  const pos=e=>{const b=preview.getBoundingClientRect();const r=rect();const x=(e.clientX-b.left)*preview.width/b.width,y=(e.clientY-b.top)*preview.height/b.height;return {screen:[x,y],uv:[clamp((x-r.x)/r.w),clamp((y-r.y)/r.h)]}};
  preview.onpointerdown=e=>{
   if(e.button!==0)return;const {screen,uv}=pos(e);
   if(mode==='rect'){drag={kind:'rect',start:uv};crop={type:'rect',x:uv[0],y:uv[1],width:.0001,height:.0001}}
   else{
    const r=rect();let best=16,chosen=null;
    crop.segments.forEach((node,i)=>{for(const key of ['anchor','in','out']){const xy=pixel(node[key],r),d=Math.hypot(xy[0]-screen[0],xy[1]-screen[1]);if(d<best){best=d;chosen={kind:'handle',index:i,key}}}});
    drag=chosen;
   }
   if(drag)preview.setPointerCapture(e.pointerId);draw();
  };
  preview.onpointermove=e=>{
   if(!drag)return;const uv=pos(e).uv;
   if(drag.kind==='rect'){
    const x=Math.min(drag.start[0],uv[0]),y=Math.min(drag.start[1],uv[1]);
    crop={type:'rect',x,y,width:Math.max(.0001,Math.abs(uv[0]-drag.start[0])),height:Math.max(.0001,Math.abs(uv[1]-drag.start[1]))};
   }else{
    const node=crop.segments[drag.index],before=node.anchor.slice();node[drag.key]=uv;
    if(drag.key==='anchor'){const dx=uv[0]-before[0],dy=uv[1]-before[1];for(const key of ['in','out'])node[key]=[clamp(node[key][0]+dx),clamp(node[key][1]+dy)]}
   }
   draw();
  };
  preview.onpointerup=preview.onpointercancel=()=>{drag=null};
  cropDialog.querySelector('[data-mode=rect]').onclick=()=>{mode='rect';crop={type:'rect',x:0,y:0,width:1,height:1};draw()};
  cropDialog.querySelector('[data-mode=bezier]').onclick=()=>{mode='bezier';crop=defaultBezier();draw()};
  cropDialog.querySelector('[data-reset]').onclick=()=>{crop=mode==='rect'?{type:'rect',x:0,y:0,width:1,height:1}:defaultBezier();draw()};
  cropDialog.querySelector('[data-apply]').onclick=()=>{try{store.update(piece.id,{crop});cropDialog.close()}catch(error){status.textContent=error.message}};
  cropDialog.querySelector('[data-cancel]').onclick=()=>cropDialog.close();
  cropDialog.addEventListener('close',()=>cropDialog.remove(),{once:true});
  draw();cropDialog.showModal();
 }
 function refresh(){
  const previous=current;select.replaceChildren(new Option('Select piece',''));
  for(const p of store.list())select.add(new Option(p.name,p.id));
  current=store.get(previous)?previous:store.list()[0]?.id||null;select.value=current||'';
  fields.replaceChildren();const p=current&&store.get(current);
  if(p){
   const source=resolveImage(p.assetId);
   if(source?.naturalWidth){const info=document.createElement('p');info.textContent='Source: '+source.naturalWidth+' × '+source.naturalHeight+' pixels · placement dimensions below are grid squares';info.style.cssText='font-size:12px;line-height:1.35;color:#d5c6a5';fields.append(info)}
   for(const [key,step] of [['x',.5],['y',.5],['width',.5],['depth',.5],['rotation',1],['opacity',.05]]){
    const label=document.createElement('label');label.style.cssText='display:block;margin:8px 0';label.textContent=key+' ';
    const input=document.createElement('input');input.type='number';input.step=step;input.value=p[key];input.style.width='90px';
    input.disabled=p.locked;
    input.onchange=()=>{try{store.update(current,{[key]:Number(input.value)});refresh()}catch(error){status.textContent=error.message}};
    label.append(input);fields.append(label);
   }
   const lock=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=p.locked;
   checkbox.onchange=()=>{store.setLocked(current,checkbox.checked);refresh()};
   lock.append(checkbox,document.createTextNode(' Locked'));fields.append(lock);
   const cropButton=document.createElement('button');cropButton.type='button';cropButton.textContent='Crop image (marquee / Bézier)…';
   cropButton.onclick=()=>openCropEditor(p);cropButton.disabled=p.locked;fields.append(cropButton);
  }
  render();
 }
 store.subscribe(refresh);
 select.onchange=()=>{current=select.value;refresh()};
 file.onchange=async()=>{
  for(const f of file.files){
   if(!/^image\/(png|jpeg|webp)$/.test(f.type))continue;
   const url=URL.createObjectURL(f),img=new Image();
   try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
    const assetId='preview-'+(global.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
    images.set(assetId,img);urls.set(assetId,url);
    const p=store.add({assetId,name:f.name,...fittedDimensions(img),order:store.list().length});
    current=p.id;
   }catch{URL.revokeObjectURL(url);status.textContent='Could not load '+f.name}
  }
  file.value='';refresh();
 };
 function canvasPoint(event){const r=canvas.getBoundingClientRect();return [(event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height]}
 canvas.onpointerdown=e=>{
  const [sx,sy]=canvasPoint(e),[x,y]=toWorld(sx,sy);
  const candidates=store.list().sort((a,b)=>b.order-a.order);
  const hit=candidates.find(p=>{const [u,v]=api.localFromWorld(p,x,y);return u>=0&&u<=1&&v>=0&&v<=1&&p.visible});
  if(!hit)return;
  current=hit.id;refresh();if(hit.locked)return;
  drag={id:hit.id,x,y,startX:hit.x,startY:hit.y};canvas.setPointerCapture(e.pointerId);
 };
 canvas.onpointermove=e=>{if(!drag)return;const [x,y]=toWorld(...canvasPoint(e));try{store.update(drag.id,{x:drag.startX+x-drag.x,y:drag.startY+y-drag.y})}catch{}};
 canvas.onpointerup=canvas.onpointercancel=()=>{drag=null};
 dialog.querySelector('[data-action=delete]').onclick=()=>{if(current)try{store.remove(current)}catch(error){status.textContent=error.message}};
 dialog.querySelector('[data-action=close]').onclick=()=>dialog.close();
 const openComposer=()=>{if(host?.load)store.replace(host.load());refresh();if(imageManagerDialog?.open)imageManagerDialog.close();dialog.showModal()};
 trigger.onclick=openComposer;
 if(managerTrigger)managerTrigger.onclick=openComposer;
 if(host?.listImages){
  const managed=document.createElement('button');managed.type='button';managed.textContent='Add from Image Manager';
  managed.onclick=()=>{const items=host.listImages();if(!items.length){status.textContent='No managed images available.';return}
   const names=items.map((item,i)=>(i+1)+'. '+item.name).join('\\n');
   const index=Number(prompt('Choose an image by number:\\n'+names));
   if(!Number.isInteger(index)||index<1||index>items.length)return;
   const item=items[index-1],img=resolveImage(item.url);
   const p=store.add({assetId:item.url,name:item.name,...fittedDimensions(img),order:store.list().length});current=p.id;refresh();
  };
  file.before(managed);
 }
 if(host?.save){const save=document.createElement('button');save.type='button';save.textContent='Apply to scene';
  save.onclick=()=>{try{host.save(store.list());status.textContent='Applied to scene. Scene synchronization is managed by Battlemap Studio.';dialog.close()}catch(error){status.textContent=error.message}};
  dialog.querySelector('[data-action=close]').before(save);
 }
 dialog.addEventListener('close',()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();images.clear();store.replace([]);current=null});
 return {open:()=>dialog.showModal(),store};
}
global.BattlemapMapComposerEditor=Object.freeze({mount});
// Mounted by the host after its scene and managed-image systems initialize.
})(window);
