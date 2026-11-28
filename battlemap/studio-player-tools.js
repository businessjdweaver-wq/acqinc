/* Player interaction toolbar; uses existing shared-scope map tools. */
(function(){
 const ruler=el('ruler'),area=el('areaAnchor'),areaButton=el('areaTool');
 const rulerHome=document.createComment('ruler home'),areaHome=document.createComment('area home');
 ruler.before(rulerHome);area.before(areaHome);
 const nav=document.createElement('nav');nav.id='playerInteractionTools';nav.hidden=true;nav.setAttribute('aria-label','Map interaction tools');
 nav.style.cssText='position:absolute;top:12px;left:12px;z-index:86;display:grid;gap:5px;justify-items:start';
 const select=document.createElement('button');select.type='button';select.textContent='↖ Select';select.title='Return to token selection';nav.append(select);
 const target=document.createElement('button');target.type='button';target.textContent='◎ Target';target.title='Choose a target (T)';
 const section=canvas.closest('section');section.append(nav);
 const label=document.createElement('label');label.textContent='Hold-to-measure shortcut ';
 label.textContent='Player tool shortcuts ';const defaults={select:'s',area:'a',target:'t',measure:'r'},inputs={};for(const [tool,caption] of Object.entries({select:'Select',area:'Area templates',target:'Target',measure:'Hold to measure'})){const field=document.createElement('label');field.textContent=caption+' ';const input=document.createElement('input');input.type='text';input.maxLength=1;input.size=2;input.setAttribute('aria-label',caption+' shortcut');field.append(input);label.append(field);inputs[tool]=input}
 const hint=document.createElement('small');hint.setAttribute('role','status');label.append(hint);el('preferencesTitle').after(label);
 let held=null;
 const storageKey=()=> 'battlemap.measureHoldKey:'+encodeURIComponent(roomProfile?.name||'local');
 function validKey(k){return /^[a-z]$/.test(k)&&!['e',String(pathKey).toLowerCase()].includes(k)}
 function keys(){let result={...defaults};try{const legacy=localStorage.getItem(storageKey());if(validKey(legacy||'')&&!Object.values(defaults).includes(legacy))result.measure=legacy;const saved=JSON.parse(localStorage.getItem(storageKey()+'.tools')||'null');if(saved&&Object.keys(defaults).every(t=>validKey(saved[t]))&&new Set(Object.keys(defaults).map(t=>saved[t])).size===4)result={...defaults,...saved}}catch{}return result}
 function key(){return keys().measure}
 const manage=document.createElement('details');manage.hidden=true;manage.style.cssText='background:var(--panel,#292d27);color:inherit;padding:6px;max-width:240px;max-height:40vh;overflow:auto';
 const summary=document.createElement('summary');summary.textContent='My placed templates';manage.append(summary);
 const list=document.createElement('div');manage.append(list);el('areaOptions').append(manage);
 const originalCanEditArea=canEditArea,originalCanEditDifficultTerrain=canEditDifficultTerrain;
 canEditDifficultTerrain=function(){return roomProfile?.gm===false?false:originalCanEditDifficultTerrain()};
 canEditArea=function(a){return !(roomProfile?.gm===false&&a.shape==='difficult')&&originalCanEditArea(a)};
 let lastList='';
 function updateAreas(){
  const player=roomProfile?.gm===false&&playing;
  manage.hidden=!player;if(!player||!areaMode)hoveredPlayerAreaId=null;
  const difficult=el('areaChoices').querySelector('[data-shape="difficult"]');
  if(difficult)difficult.hidden=player;
  el('difficultTerrainOption').hidden=player;
  if(!player)return;
  const own=areas.filter(a=>a.areaOwner===roomProfile.name&&Object.hasOwn(areaSizes,a.shape)&&a.shape!=='difficult');
  const signature=JSON.stringify([currentSceneId,roomProfile.name,roomState.paused,own]);
  if(signature===lastList)return;lastList=signature;
  hoveredPlayerAreaId=null;list.replaceChildren();
  if(!own.length){list.textContent='No placed templates';return}
  for(const a of own){
   const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:4px;margin-top:4px';
   const name=document.createElement('span');name.style.flex='1';name.textContent=({cone3d:'3D cone'})[a.shape]||a.shape[0].toUpperCase()+a.shape.slice(1);name.textContent+=' · '+a.size*5+' ft';row.append(name);
   const resolve=()=>areas.find(x=>x.roomId===a.roomId&&canEditArea(x));
   const edit=document.createElement('button');edit.type='button';edit.textContent='Edit';edit.disabled=!!roomState.paused;edit.onclick=()=>{const current=resolve();if(!current)return;exitTool();const r=edit.getBoundingClientRect();openAreaEditor(current,r.right,r.top)};
   const del=document.createElement('button');del.type='button';del.textContent='Delete';del.disabled=!!roomState.paused;del.onclick=async()=>{const current=resolve();if(current&&await changePlayerArea('area_delete',current))refresh()};
   const highlight=()=>{hoveredPlayerAreaId=a.roomId;draw()};
   const clear=()=>{if(hoveredPlayerAreaId===a.roomId){hoveredPlayerAreaId=null;draw()}};
   row.addEventListener('pointerenter',highlight);row.addEventListener('pointerleave',clear);
   row.addEventListener('focusin',highlight);row.addEventListener('focusout',e=>{if(!row.contains(e.relatedTarget))clear()});
   row.append(edit,del);list.append(row);
  }
 }
 const originalRefresh=refresh;
 refresh=function(...args){const result=originalRefresh(...args);updateAreas();return result};
 function update(){
  const player=roomProfile?.gm===false&&playing;
  nav.hidden=!player;label.hidden=!player;updateAreas();
  if(player&&ruler.parentNode!==nav){nav.append(ruler,area,target)}
  if(!player&&ruler.parentNode===nav){rulerHome.after(ruler);areaHome.after(area)}
  if(player){const k=keys();select.title='Select ('+k.select.toUpperCase()+')';areaButton.title='Area templates ('+k.area.toUpperCase()+')';target.title='Target ('+k.target.toUpperCase()+')';ruler.title='Measure (hold '+k.measure.toUpperCase()+')';select.setAttribute('aria-pressed',String(!measuring&&!areaMode&&!facingTarget));target.setAttribute('aria-pressed',String(!!facingTarget))}
 }
 function release(restore=true){
  if(!held)return;
  const old=held;held=null;
  if(old.profile!==roomProfile||old.scene!==currentSceneId)return;
  if(measuring){measuring=false;route=restore?old.route:null;if(restore){areaMode=old.areaMode;areaOrigin=old.areaOrigin;areaPreview=old.areaPreview;facingTarget=old.facingTarget;panMode=old.panMode}refresh()}
 }
 select.onclick=()=>{release(false);if(carry)cancelMove();exitTool();message('Select or drag your token.');update()};
 target.onclick=()=>{release(false);if(carry||drag||roomState.paused)return;const controlled=tokens.filter(t=>ownsRoomStandee(t)&&!standeeHidden(t));const actor=controlled.includes(selected)?selected:controlled.find(t=>t.roomId===roomProfile.characterKey)??(controlled.length===1?controlled[0]:null);if(actor){exitTool();armFacingTarget(actor);update()}else message('Select your character first.')};
 ruler.addEventListener('click',()=>release(false),true);areaButton.addEventListener('click',()=>release(false),true);
 el('preferences').addEventListener('click',()=>{const k=keys();for(const t in inputs)inputs[t].value=k[t].toUpperCase();hint.textContent=''},true);
 for(const t in inputs)inputs[t].onchange=()=>{const k=keys(),v=inputs[t].value.toLowerCase();if(!validKey(v)||Object.keys(k).some(other=>other!==t&&k[other]===v)){hint.textContent=' Choose an unused letter (not E or the waypoint shortcut).';inputs[t].value=k[t].toUpperCase();return}k[t]=v;try{localStorage.setItem(storageKey()+'.tools',JSON.stringify(k));hint.textContent=' Saved on this device.'}catch{hint.textContent=' Could not save shortcut.'}update()};
 window.addEventListener('keydown',e=>{
  if(roomProfile?.gm!==false||!playing||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.target?.closest?.('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]'))return;
  const k=keys(),pressed=e.key.toLowerCase();
  if(e.key==='Escape'&&(held||measuring||areaMode||facingTarget)){e.preventDefault();e.stopImmediatePropagation();release(false);exitTool();update();return}
  const action=Object.keys(k).find(t=>k[t]===pressed);
  if(!action){if(pressed==='t'){e.stopImmediatePropagation()}return}
  if(carry||drag||spellPlacement||pendingPolymorph||visionTool||journalPlacing||playerNoteMoveDraft)return;
  e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
  if(action!=='measure'){release(false);if(action==='select')select.click();else if(action==='area'){areaButton.click()}else target.click();return}
  if(held||measuring)return;
  held={code:e.code,profile:roomProfile,scene:currentSceneId,route,areaMode,areaOrigin,areaPreview,facingTarget,panMode};
  route=null;areaMode=false;areaOrigin=null;areaPreview=null;facingTarget=null;panMode=false;measuring=true;message('Click two points to measure. Release '+key().toUpperCase()+' to return.');refresh();
 },true);
 window.addEventListener('keyup',e=>{if(held&&e.code===held.code){e.preventDefault();release()}},true);
 window.addEventListener('blur',()=>release());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
 const observer=new MutationObserver(update);observer.observe(document.body,{attributes:true,attributeFilter:['class']});observer.observe(ruler,{attributes:true,attributeFilter:['aria-pressed']});observer.observe(areaButton,{attributes:true,attributeFilter:['aria-pressed']});
 update();
})();