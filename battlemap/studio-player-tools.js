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
 const keyInput=document.createElement('input');keyInput.type='text';keyInput.maxLength=1;keyInput.size=2;keyInput.setAttribute('aria-label','Hold-to-measure shortcut');label.append(keyInput);
 const hint=document.createElement('small');hint.setAttribute('role','status');label.append(hint);el('preferencesTitle').after(label);
 let held=null;
 const storageKey=()=> 'battlemap.measureHoldKey:'+encodeURIComponent(roomProfile?.name||'local');
 function validKey(k){return /^[a-z]$/.test(k)&&!['e','t','l',String(pathKey).toLowerCase()].includes(k)}
 function key(){try{const k=localStorage.getItem(storageKey());return validKey(k||'')?k:'r'}catch{return 'r'}}
 function update(){
  const player=roomProfile?.gm===false&&playing;
  nav.hidden=!player;label.hidden=!player;
  if(player&&ruler.parentNode!==nav){nav.append(ruler,area,target)}
  if(!player&&ruler.parentNode===nav){rulerHome.after(ruler);areaHome.after(area)}
  if(player){ruler.title='Measure (hold '+key().toUpperCase()+')';select.setAttribute('aria-pressed',String(!measuring&&!areaMode&&!facingTarget));target.setAttribute('aria-pressed',String(!!facingTarget))}
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
 el('preferences').addEventListener('click',()=>{keyInput.value=key().toUpperCase();hint.textContent=''},true);
 keyInput.onchange=()=>{const k=keyInput.value.toLowerCase();if(!validKey(k)){hint.textContent=' Choose a letter other than E, T, L or the waypoint shortcut.';keyInput.value=key().toUpperCase();return}try{localStorage.setItem(storageKey(),k);hint.textContent=' Saved on this device.'}catch{hint.textContent=' Could not save shortcut.'}update()};
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&held){e.preventDefault();e.stopImmediatePropagation();release();return}
  if(roomProfile?.gm!==false||!playing||e.key.toLowerCase()!==key()||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.target?.closest?.('input,textarea,select,[contenteditable]')||document.querySelector('dialog[open]'))return;
  if(carry||drag||spellPlacement||pendingPolymorph||visionTool||journalPlacing||playerNoteMoveDraft||measuring&&!held)return;
  e.preventDefault();e.stopImmediatePropagation();if(e.repeat||held)return;
  held={code:e.code,profile:roomProfile,scene:currentSceneId,route,areaMode,areaOrigin,areaPreview,facingTarget,panMode};
  route=null;areaMode=false;areaOrigin=null;areaPreview=null;facingTarget=null;panMode=false;measuring=true;message('Click two points to measure. Release '+key().toUpperCase()+' to return.');refresh();
 },true);
 window.addEventListener('keyup',e=>{if(held&&e.code===held.code){e.preventDefault();release()}},true);
 window.addEventListener('blur',()=>release());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
 const observer=new MutationObserver(update);observer.observe(document.body,{attributes:true,attributeFilter:['class']});observer.observe(ruler,{attributes:true,attributeFilter:['aria-pressed']});observer.observe(areaButton,{attributes:true,attributeFilter:['aria-pressed']});
 update();
})();