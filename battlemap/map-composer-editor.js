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
 const store=api.createStore();
 const urls=new Map();
 let current=null,drag=null;
 const trigger=document.createElement('button');
 trigger.id='mapComposerOpen';trigger.type='button';trigger.textContent='Map Composer (preview)';
 const anchor=document.getElementById('openManagedImages');
 anchor?.insertAdjacentElement('afterend',trigger);
 if(!anchor)return;
 const dialog=document.createElement('dialog');
 dialog.id='mapComposerDialog';
 dialog.style.cssText='max-width:min(95vw,1000px);width:900px;color:#f6eddb;background:#272a28;border:1px solid #8c806b;border-radius:10px';
 dialog.innerHTML='<h2>Map Composer — isolated preview</h2><p>This editor previews image placement only. It does not yet change or save the live battlefield.</p><label>Import images <input type="file" accept="image/png,image/jpeg,image/webp" multiple></label><div style="display:flex;gap:12px;flex-wrap:wrap"><div style="flex:2;min-width:280px"><canvas width="700" height="480" style="width:100%;touch-action:none;background:#a79d83;border:1px solid #827760"></canvas></div><div style="flex:1;min-width:180px"><label>Piece <select style="width:100%"></select></label><div class="map-composer-fields"></div><button type="button" data-action="delete">Remove piece</button></div></div><p role="status"></p><button type="button" data-action="close">Close</button>';
 document.body.append(dialog);
 const file=dialog.querySelector('input[type=file]'),canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),select=dialog.querySelector('select'),fields=dialog.querySelector('.map-composer-fields'),status=dialog.querySelector('[role=status]');
 const images=new Map();
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
   const img=images.get(p.assetId);if(!img)continue;
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
 function refresh(){
  const previous=current;select.replaceChildren(new Option('Select piece',''));
  for(const p of store.list())select.add(new Option(p.name,p.id));
  current=store.get(previous)?previous:store.list()[0]?.id||null;select.value=current||'';
  fields.replaceChildren();const p=current&&store.get(current);
  if(p){
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
   const crop=document.createElement('button');crop.type='button';crop.textContent='Rectangular crop…';
   crop.onclick=()=>{const value=prompt('Crop rectangle as x,y,width,height (fractions from 0 to 1)',Object.values(p.crop.type==='rect'?{x:p.crop.x,y:p.crop.y,width:p.crop.width,height:p.crop.height}:{x:0,y:0,width:1,height:1}).join(','));if(value===null)return;const parts=value.split(',').map(Number);if(parts.length!==4||parts.some(n=>!Number.isFinite(n))){status.textContent='Enter four valid numbers.';return}try{store.update(current,{crop:{type:'rect',x:parts[0],y:parts[1],width:parts[2],height:parts[3]}});refresh()}catch(error){status.textContent=error.message}};
   crop.disabled=p.locked;fields.append(crop);
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
    const p=store.add({assetId,name:f.name,width:Math.max(5,Math.min(40,img.width/40)),depth:Math.max(5,Math.min(40,img.height/40)),order:store.list().length});
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
 trigger.onclick=()=>{refresh();dialog.showModal()};
 dialog.addEventListener('close',()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();images.clear();store.replace([]);current=null});
 return {open:()=>dialog.showModal(),store};
}
global.BattlemapMapComposerEditor=Object.freeze({mount});
try { mount(); } catch (error) { console.error('Map Composer preview unavailable', error); }
})(window);
