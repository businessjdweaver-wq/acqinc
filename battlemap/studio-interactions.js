"use strict";
function chatIsGm(){return roomProfile?.gm===true||!roomProfile&&!playing}
function chatContent(card){
 return [...card.children].filter(child=>!child.classList.contains('chat-card-controls')).map(child=>child.textContent).join(' ');
}
function chatKind(type,title,hasDice=true){
 const key=String(type||'').toLowerCase().replace(/_/g,'-');
 const name=String(title||'').trim();
 if(key==='chat-message'||!hasDice)return 'text';
 if(/saving.throw|(?:^|-)save(?:$|-)/i.test(key)||/saving throw|\bsave(?:s)?\b/i.test(name))return 'save';
 if(/skill|ability|check|initiative/.test(key)||/\b(?:check|initiative)\b/i.test(name))return 'check';
 if(/attack/.test(key)||/\b(?:attack|to hit)\b/i.test(name))return 'attack';
 return 'dice';
}
function applyChatFilters(){
 const feed=el('rollsFeed'),byName=el('chatFilterName'),name=byName.value,gm=chatIsGm();
 const cards=[...feed.children],names=new Set();
 for(const card of cards){
  if(!gm&&(card.dataset.audience==='gm'||card.dataset.chatHidden==='true'))continue;
  if(card.dataset.chatName)names.add(card.dataset.chatName);
 }
 if(name)names.add(name);
 const sorted=[...names].sort((a,b)=>a.localeCompare(b));
 if(sorted.length!==byName.options.length-1||sorted.some((value,i)=>byName.options[i+1]?.value!==value)){
  byName.replaceChildren(new Option('All names',''),...sorted.map(value=>new Option(value,value)));byName.value=name;
 }
 el('chatHiddenControl').hidden=!gm;
 const type=el('chatFilterType').value,audience=el('chatFilterVisibility').value,hidden=el('chatFilterHidden').value;
 const query=el('chatFilterSearch').value.trim().toLowerCase();
 const active=[name,type,audience,gm&&hidden!=='all'&&hidden,query].filter(Boolean).length;
 const summary=el('chatFilterDetails').firstElementChild;
 const label='Filters & search'+(active?' ('+active+' active)':'');
 if(summary.textContent!==label)summary.textContent=label;
 for(const card of cards){
  const privateCard=card.dataset.audience==='gm',moderated=card.dataset.chatHidden==='true';
  const hide=(!gm&&(privateCard||moderated))||(gm&&((hidden==='hidden'&&!moderated)||(hidden==='visible'&&moderated)))||
   (name&&name!==card.dataset.chatName)||(type&&type!==card.dataset.chatType)||
   (audience&&audience!==(privateCard?'gm':'public'))||
   (query&&!(card.dataset.chatName+' '+chatContent(card)).toLowerCase().includes(query));
  if(card.hidden!==!!hide)card.hidden=!!hide;
 }
}
for(const id of chatFilterIds){
 el(id).addEventListener(id==='chatFilterSearch'?'input':'change',()=>{
  applyChatFilters();
  sourceChatFilterChanged();
 });
}
function sourceChatFilterChanged(){
 const panel=detachedPanels.get('rolls');
 if(panel&&!panel.win.closed)panel.syncChatFilters?.();
}
const damageMultipliers=[[-1,'-x'],[0,'0x'],[.25,'.25x'],[.5,'.5x'],[1,'x'],[2,'2x']];
const rollApplications=new WeakMap();
const appliedRollDamage=new Set();
try{
 for(const key of JSON.parse(sessionStorage.getItem('battlemap.appliedRollDamage')||'[]'))
  if(typeof key==='string')appliedRollDamage.add(key);
}catch{}
function rollDamageChanges(token,damage,multiplier){
 const amount=Math.floor(damage*Math.abs(multiplier));
 if(multiplier===0||amount===0)return {};
 if(multiplier<0)return {hp:Math.min(token.maxHp??99999,token.hp+amount)};
 const temp=Math.max(0,token.tempHp??0);
 return {hp:Math.max(0,token.hp-Math.max(0,amount-temp)),
  ...(temp>0?{tempHp:Math.max(0,temp-amount)}:{})};
}

function rollDamageAmount(card){
 const totals=[...card.querySelectorAll('.roll-damage-total')].map(node=>
  node.textContent.trim().match(/^([^:]+):\s*(\d+)$/));
 const normal=totals.find(match=>match&&/^(?:(?:total |regular )?damage|damage before riders)$/i.test(match[1]));
 if(normal)return Number(normal[2]);
 const rows=[...card.querySelectorAll('.roll-card-damage > .roll-result')].filter(row=>
  !/critical|heal|temporary|temp hp/i.test(row.querySelector('.roll-label')?.textContent||''));
 const values=rows.map(row=>row.querySelector('.roll-total')?.textContent.trim());
 if(!values.length||values.some(value=>!/^\d+$/.test(value??'')))return null;
 return values.reduce((sum,value)=>sum+Number(value),0);
}
function rolledTargetActor(card){
 const name=challengeKey(card.dataset.chatName);
 if(!name)return null;
 const aliases=token=>[token.name,token.displayName].map(challengeKey).filter(Boolean);
 const exact=tokens.filter(token=>aliases(token).includes(name));
 const candidates=exact.length?exact:tokens.filter(token=>aliases(token).some(alias=>
  name.startsWith(alias+' ')||alias.startsWith(name+' ')));
 return candidates.length===1?candidates[0]:null;
}
function rollTargetAssessment(card,target){
 const attack=card.dataset.chatType==='attack'?card.querySelector('.roll-grid > .roll-result:not(.discarded) .roll-total'):null;
 const critical=card.querySelector(':scope > .roll-grid > .roll-critical');
 const hit=attack&&Number(attack.textContent);
 const inventory=[];
 if(critical)inventory.push('Natural 20 · Critical hit');
 else if(Number.isFinite(hit)&&target.ac!=null)inventory.push('Attack '+hit+' vs AC '+target.ac+(hit>=target.ac?' · meets AC':' · below AC'));
 const saves=chatContent(card).matchAll(/\bDC\s+(\d+)\s+(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\b/gi);
 for(const save of saves){
  const ability=save[2].slice(0,3).toLowerCase(),bonus=target.plannerCombat?.saves?.[ability];
  inventory.push('DC '+save[1]+' '+ability.toUpperCase()+' save'+(Number.isInteger(bonus)?' · '+(bonus>=0?'+':'')+bonus:''));
 }
 return inventory.join(' · ');
}
function attachRollApplication(card,bar,applicationId=card.dataset.chatId,rollContext=card){
 const damage=rollDamageAmount(card);
 const hasDamage=Number.isSafeInteger(damage)&&damage>=0&&damage<=99999;
 const requiredSaves=card.querySelector(':scope > .combat-required-saves');
 const conditionalDamage=[...card.querySelectorAll('.roll-card-damage > .combat-conditional-damage')].map(row=>({
  label:row.querySelector('.roll-label')?.textContent??'Conditional damage',
  total:Number(row.querySelector('.roll-total')?.textContent)
 })).filter(part=>Number.isSafeInteger(part.total)&&part.total>=0);
 if(!hasDamage&&!requiredSaves&&card.dataset.chatType!=='attack')return;
 let state=rollApplications.get(card);
 if(!state){
  const actor=rolledTargetActor(rollContext);
  const targetId=card.dataset.rollTargetId||rollContext.dataset.rollTargetId;
  const target=targetId
   ?tokens.find(token=>token.roomId===targetId||token.trackingId===targetId)
   :actor&&trackedTarget(actor);
  const marked=tokens.filter(token=>token.manualTarget&&token!==actor);
  const known=target?[target]:targetId?[]:marked;
  state={sceneId:currentSceneId,attached:roomDraftAttached,targets:known.map(token=>({token,id:token.roomId,multiplier:1,applied:false}))};
  rollApplications.set(card,state);
 }
 const panel=document.createElement('section');
 panel.className='roll-application';
 const targets=document.createElement('details');
 targets.open=true;targets.append(combatText('summary','Targets'));
 const names=state.targets.map(entry=>entry.token.displayName||entry.token.name);
 targets.append(combatText('p',names.length?names.join(', '):'No target identified for this roll.'));
 if(!hasDamage){
  for(const entry of state.targets){
   const assessment=rollTargetAssessment(card,entry.token);
   if(assessment)targets.append(combatText('p',assessment));
  }
  panel.append(targets);
  if(!requiredSaves)panel.append(combatText('p','Waiting for damage from Beyond20. Apply appears here when damage arrives.'));
  bar.append(panel);return;
 }
 const apply=document.createElement('details');
 apply.open=true;apply.append(combatText('summary','Apply'));
 for(const entry of state.targets){
  const resolve=()=>entry.id?tokens.find(token=>token.roomId===entry.id):tokens.includes(entry.token)?entry.token:null;
  const key=applicationId&&entry.id?applicationId+':'+entry.id:null;
  const row=document.createElement('div'),heading=combatText('strong',entry.token.displayName||entry.token.name);
  const delta=combatText('span',''),choices=document.createElement('div'),status=combatText('small','');
  choices.className='roll-damage-multipliers';
  status.setAttribute('role','status');
  row.append(heading,delta);
  const assessment=rollTargetAssessment(card,resolve()||entry.token);
  if(assessment)row.append(combatText('p',assessment));
  const done=()=>entry.applied||key&&appliedRollDamage.has(key);
  entry.riders??=new Set();
  const riderInputs=conditionalDamage.map((part,index)=>{
   const input=document.createElement('input');
   input.type='checkbox';input.checked=entry.riders.has(index);
   input.onchange=()=>{if(input.checked)entry.riders.add(index);else entry.riders.delete(index);update()};
   playerProfileField(row,part.label+' ('+part.total+')',input);
   return input;
  });
  const selectedDamage=()=>damage+conditionalDamage.reduce((total,part,index)=>total+(entry.riders.has(index)?part.total:0),0);
  const amount=()=>Math.floor(selectedDamage()*Math.abs(entry.multiplier));
  const button=catalogButton('Apply',event=>{
   event?.preventDefault();event?.stopPropagation();
   if(!chatIsGm()||done())return;
   const token=resolve();
   if(!token||state.sceneId!==currentSceneId||state.attached!==roomDraftAttached){
    status.textContent='This target is no longer in the displayed scene.';return;
   }
   if(!Number.isFinite(token.hp)&&entry.multiplier!==0){status.textContent='Set the target’s current HP first.';return}
   const changes=rollDamageChanges(token,selectedDamage(),entry.multiplier);
   const tookDamage=changes.hp<token.hp||changes.tempHp<token.tempHp;
   changeCombatStats(token,changes);
   if(tookDamage){
    token.damageFlashAt=Date.now();
    scheduleRoomPatch();
   }
   entry.applied=true;
   if(key){
    appliedRollDamage.add(key);
    if(appliedRollDamage.size>1000)appliedRollDamage.delete(appliedRollDamage.values().next().value);
    try{sessionStorage.setItem('battlemap.appliedRollDamage',JSON.stringify([...appliedRollDamage]))}catch{}
   }
   update();refresh();
  });
  function update(){
   delta.textContent=entry.multiplier<0?' +'+amount()+' HP':entry.multiplier===0?' Immune':' −'+amount()+' HP';
   button.disabled=!!done()||!resolve()||!selectedDamage();
   for(const input of riderInputs)input.disabled=!!done();
   for(const choice of choices.children){
    choice.disabled=!!done();
    choice.setAttribute('aria-pressed',String(Number(choice.dataset.multiplier)===entry.multiplier));
   }
   if(done())status.textContent='Applied.';
  }
  for(const [value,label] of damageMultipliers){
   const choice=catalogButton(label,event=>{event?.preventDefault();event?.stopPropagation();entry.multiplier=value;update()});
   choice.dataset.multiplier=String(value);choices.append(choice);
  }
  row.append(choices,button,status);apply.append(row);update();
 }
 panel.append(targets);if(state.targets.length)panel.append(apply);
 bar.append(panel);
}
function attachAreaSpellApplication(card,bar){
 if(!card.dataset.areaSpell)return false;
 let spell;
 try{spell=JSON.parse(card.dataset.areaSpell)}catch{return true}
 if(!Array.isArray(spell?.targets)||spell.scene!==currentSceneId)return true;
 const key=card.dataset.chatId?card.dataset.chatId+':area':null;
 const done=()=>areaSpellResolved.has(card)||key&&appliedRollDamage.has(key);
 const resolve=id=>tokens.find(token=>token.roomId===id||token.trackingId===id);
 const ids=[...new Set(spell.targets.filter(id=>typeof id==='string'))];
 const ability=plannerAbilities.includes(spell.ability)?spell.ability:null;
 const dc=Number.isInteger(spell.dc)&&spell.dc>=1&&spell.dc<=99?spell.dc:null;
 const rolledDamage=rollDamageAmount(card);
 if(spell.awaitDamage&&rolledDamage===null&&!card.querySelector('.area-spell-healing')){
  bar.append(combatText('p','Waiting for Beyond20 damage.'));
  return true;
 }
 const values=[...card.querySelectorAll(spell.beyond?'.roll-card-damage .area-spell-healing .roll-total':':scope > .roll-grid .roll-total')].map(node=>Number(node.textContent));
 const healing=spell.healing||spell.beyond&&values.length>0&&rolledDamage===null;
 const damage=healing?Math.max(0,values.reduce((a,b)=>a+b,0)):rolledDamage;
 const amount=Number.isSafeInteger(damage)&&damage>0&&damage<=99999?damage:0;
 if(!ids.length||!amount&&!(ability&&dc))return true;
 const button=catalogButton(ability&&dc?'Resolve area saves':'Apply to area targets',()=>{
  if(done()||el('areaSpellDialog').open||!chatIsGm()||spell.scene!==currentSceneId)return;
  const dialog=el('areaSpellDialog'),body=el('areaSpellTargets'),status=el('areaSpellStatus'),form=el('areaSpellForm');
  const attached=roomDraftAttached;
  body.replaceChildren();status.textContent='';
  const targets=ids.map(resolve).filter(Boolean);
  if(!targets.length){message('The area targets are no longer in this scene.');return}
  const saving=!!(ability&&dc);
  const selectedSuccess=document.createElement('select');
  for(const [value,label] of [['0','No damage'],['0.5','Half damage'],['1','Full damage']])
   selectedSuccess.add(new Option(label,value));
  selectedSuccess.value=spell.half?'0.5':'0';
  el('areaSpellTitle').textContent=card.querySelector('h3')?.textContent||'Area spell';
  el('areaSpellPrompt').textContent=saving?'DC '+dc+' '+ability.toUpperCase()+' saving throw for each target.':'Apply the spell to the captured targets.';
  if(amount)body.append(combatText('p',(healing?'Healing: ':'Damage: ')+amount));
  if(saving&&amount&&!healing)playerProfileField(body,'On a successful save',selectedSuccess);
  const rows=targets.map(token=>{
   const row=combatSection(libraryName(token)),mode=document.createElement('select'),bonus=document.createElement('input');
   body.append(row);
   const include=document.createElement('input');
   include.type='checkbox';include.checked=true;
   playerProfileField(row,'Include target',include);
   include.onchange=()=>{mode.disabled=bonus.disabled=!include.checked;status.textContent=''};
   if(amount&&!Number.isFinite(token.hp))row.append(combatText('small','Current HP is missing. Apply the result manually.'));
   if(saving){
    for(const [value,label] of [['normal','Normal'],['advantage','Advantage'],['disadvantage','Disadvantage']])
     mode.add(new Option(label,value));
    bonus.type='number';bonus.min='-100';bonus.max='100';bonus.step='1';bonus.required=true;
    bonus.defaultValue=String(token.plannerCombat?.saves?.[ability]??0);
    playerProfileField(row,'Roll',mode);
    playerProfileField(row,'Save bonus',bonus);
   }else if(card.dataset.chatType==='attack'){
    mode.add(new Option('Hit','normal'));mode.add(new Option('Miss','miss'));
    const chosen=card.querySelector(':scope > .roll-grid .roll-result:not(.discarded) .roll-total');
    const attack=Number(chosen?.textContent);
    if(Number.isFinite(token.ac)&&Number.isFinite(attack)&&attack<token.ac&&!card.querySelector('.roll-critical'))mode.value='miss';
    playerProfileField(row,'Attack result',mode);
   }
   return {token,mode,bonus,include};
  });
  el('areaSpellConfirm').textContent=saving?'Confirm and roll':'Confirm and apply';
  const confirm=el('areaSpellConfirm');
  confirm.disabled=saving;
  dialog.showModal();
  if(saving){
   const session=roomProfile;
   Promise.allSettled(rows.filter(({token})=>session?.gm&&roomState.sceneId&&token.roomId&&baseStandeeRole(token)==='pc')
    .map(async({token,bonus})=>{
     const record=await roomRpc('player_roll_profile',{ticket:session.token,scene_key:roomState.sceneId,standee_key:token.roomId});
     const source=record?.source;
     const saved=source&&combatInteger(source.saves?.[ability],source.saves?.[ability.toUpperCase()]);
     if(saved!=null&&bonus.value===bonus.defaultValue&&Math.abs(saved)<=100)bonus.value=saved;
    })).then(()=>{if(form.onsubmit===submit&&dialog.open)confirm.disabled=false});
  }
  function submit(event){
   event.preventDefault();
   if(done()||spell.scene!==currentSceneId||attached!==roomDraftAttached||!chatIsGm()){
    status.textContent='This spell is no longer available in the displayed scene.';return;
   }
   const included=rows.filter(row=>row.include.checked);
   if(!included.length){status.textContent='Include at least one target to continue.';return}
   const current=included.map(row=>({...row,token:resolve(row.token.roomId||row.token.trackingId)}));
   if(!current.some(row=>row.token)){status.textContent='The included targets are no longer in this scene.';return}
   const result=document.createElement('li');
   result.dataset.chatType='text';
   result.dataset.chatName='GM';
   result.append(combatText('h3',el('areaSpellTitle').textContent+' · Area results'));
   for(const {token,mode,bonus} of current){
    if(!token){result.append(combatText('p','A target left the scene and was skipped.'));continue}
    let multiplier=mode.value==='miss'?0:healing?-1:1;
    let summary=libraryName(token);
    if(saving){
     const modifier=bonus.valueAsNumber,formula='1d20'+(modifier>=0?'+':'')+modifier;
     const first=chatRoll(formula),second=mode.value==='normal'?null:chatRoll(formula);
     const total=second?(mode.value==='advantage'?Math.max(first.total,second.total):Math.min(first.total,second.total)):first.total;
     const success=total>=dc;
     if(success&&!healing)multiplier=Number(selectedSuccess.value);
     summary+=' · '+total+(second?' ('+first.total+', '+second.total+'; '+mode.value+')':'')+' · '+(success?'success':'failure');
    }else if(mode.value==='miss')summary+=' · Miss';
    const delta=Math.floor(amount*Math.abs(multiplier));
    const missingHp=delta>0&&!Number.isFinite(token.hp);
    const changes=missingHp?{}:rollDamageChanges(token,amount,multiplier);
    if(amount)summary+=' · '+(multiplier<0?delta+' healing':delta+' damage');
    if(missingHp)summary+=' (apply manually: current HP is missing)';
    if(changes.hp<token.hp||changes.tempHp<token.tempHp)token.damageFlashAt=Date.now();
    changeCombatStats(token,changes);
    result.append(combatText('p',summary));
   }
   const template=amount&&typeof spell.templateId==='string'&&areas.find(area=>
    area.roomId===spell.templateId&&Object.hasOwn(areaSizes,area.shape)&&area.shape!=='difficult');
   if(template){
    remember();
    areas=areas.filter(area=>area!==template);
    if(pendingAreaSpell?.area.roomId===spell.templateId)pendingAreaSpell=null;
   }
   areaSpellResolved.add(card);
   if(key){
    appliedRollDamage.add(key);
    if(appliedRollDamage.size>1000)appliedRollDamage.delete(appliedRollDamage.values().next().value);
    try{sessionStorage.setItem('battlemap.appliedRollDamage',JSON.stringify([...appliedRollDamage]))}catch{}
   }
   button.disabled=true;button.textContent='Area spell resolved';dialog.close();
   const audience=card.dataset.audience==='gm'||spell.privateResults||current.some(({token})=>token?.incognito||token?.conditions?.includes('invisible'))?'gm':'public';
   if(roomProfile)sendSharedChat(result,audience);
   else appendChatCard(result);
   refresh();
  }
  form.onsubmit=submit;
 });
 button.disabled=!!done();
 if(done())button.textContent='Area spell resolved';
 bar.append(button);
 return true;
}
const areaSpellResolved=new WeakSet();
function spellDescriptionText(description){
 const template=document.createElement('template');
 template.innerHTML=String(description||'').replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi,'\n');
 template.content.querySelectorAll('script,style').forEach(node=>node.remove());
 return template.content.textContent.trim();
}
function addChatSpellDescription(card,description){
 if(!description)return;
 const details=rollNode(card,'details',null,'combat-spell-description');
 rollNode(details,'summary','Spell description');
 for(const paragraph of description.split(/\n+/).map(text=>text.trim()).filter(Boolean))rollNode(details,'p',paragraph);
}
function multiTargetSpellLimit(title,description){
 if(challengeKey(title)==='steel wind strike')return 5;
 if(!/\b(?:spell )?attack(?: roll)? (?:against|for) each (?:target|creature)\b/i.test(description))return 0;
 const count=/\b(?:choose|target|strike)\s+(?:up to\s+)?(two|three|four|five|six|seven|eight|nine|ten|[2-9]|10)\s+(?:different\s+)?(?:targets|creatures)\b/i.exec(description)?.[1].toLowerCase();
 return ({two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10})[count]||Number(count)||0;
}
function multiTargetSpellEntry(entry){
 return !!entry&&typeof entry.formula==='string'&&typeof entry.type==='string'&&validProfileDamageFormula(entry.formula)&&
  (entry.type==='Attack'?/^1d20(?:[+-]\d+)?$/.test(entry.formula):entry.isDamage===true);
}
function spellTargetId(token){
 return token.roomId||(token.trackingId??=crypto.randomUUID());
}
function multiTargetCreature(token){
 return !standeeHidden(token)&&!token.incognito&&!token.conditions?.some(condition=>['invisible','dead'].includes(condition))&&
  !dimensionDoorIgnoredObject(token);
}
function queueMultiTargetSpell(card,actor,limit,entries,mode,description){
 const capture=actor&&captureAreaSpell(actor,{});
 if(capture?.pending.sending)return null;
 const marked=tokens.filter(token=>token!==actor&&multiTargetCreature(token)&&
  (capture?capture.spell.targets.includes(spellTargetId(token)):token.manualTarget||actor&&token===trackedTarget(actor)));
 card.dataset.spellCastId=crypto.randomUUID();
 card.dataset.multiTargetSpell=JSON.stringify({scene:currentSceneId,actor:actor?spellTargetId(actor):null,
  targets:marked.map(spellTargetId),templateId:capture?.spell.templateId,limit,entries,mode});
 rollNode(card,'p',marked.length+(capture?' in area':' marked')+' · up to '+limit+' targets · awaiting DM');
 addChatSpellDescription(card,description);
 if(capture)capture.pending.sending=true;
 const sent=roomProfile?sendSharedChat(card,card.dataset.audience==='gm'?'gm':'public'):appendChatCard(card);
 if(capture)finishAreaSpellSend(capture.pending,sent);
 showRolls(true);queueRecovery();
 return sent;
}
function attachMultiTargetSpell(card,bar){
 if(!card.dataset.multiTargetSpell)return false;
 let cast;
 try{cast=JSON.parse(card.dataset.multiTargetSpell)}catch{return true}
 if(cast?.scene!==currentSceneId||!Number.isInteger(cast.limit)||cast.limit<2||cast.limit>10||
  !Array.isArray(cast.targets)||!Array.isArray(cast.entries)||cast.entries.length>8||
  !cast.entries.every(multiTargetSpellEntry)||cast.entries.filter(entry=>entry.type==='Attack').length!==1)return true;
 const button=catalogButton('Choose targets and roll',()=>{
  const dialog=el('areaSpellDialog'),body=el('areaSpellTargets'),status=el('areaSpellStatus'),form=el('areaSpellForm');
  if(dialog.open||!chatIsGm()||!card.isConnected||cast.scene!==currentSceneId)return;
  const attached=roomDraftAttached,confirm=el('areaSpellConfirm');
  const title=card.querySelector('h3')?.textContent||'Spell';
  el('areaSpellTitle').textContent=title;
  // The DM may have placed the area on a separate client from the caster.
  const template=cast.templateId?null:pendingSpellTemplate();
  const areaFilter=token=>cast.templateId?cast.targets.includes(spellTargetId(token)):
   !template||areaCoversStandee(template,token);
  const eligible=token=>multiTargetCreature(token)&&spellTargetId(token)!==cast.actor&&areaFilter(token);
  el('areaSpellPrompt').textContent=cast.templateId||template?
   'Choose from creatures inside the spell area.':'Choose the creatures affected by this cast.';
  const mode=document.createElement('select');
  mode.add(new Option('Separate rolls for each target','separate'));
  mode.add(new Option('One shared roll for all targets','shared'));
  body.replaceChildren();
  playerProfileField(body,'Rolls',mode);
  const candidates=tokens.filter(eligible);
  const nameOf=token=>token.displayName||token.name||'Standee';
  const counts=new Map(),ordinals=new Map();
  for(const token of candidates){
   const name=nameOf(token);
   counts.set(name,(counts.get(name)||0)+1);
  }
  const picks=candidates.map(token=>{
   const name=nameOf(token),ordinal=(ordinals.get(name)||0)+1;
   ordinals.set(name,ordinal);
   const label=counts.get(name)>1?name+' #'+ordinal+' (column '+(Math.floor(token.x)+1)+', row '+(Math.floor(token.y)+1)+')':name;
   const input=document.createElement('input');
   input.type='checkbox';input.checked=!!template||cast.targets.includes(spellTargetId(token));
   playerProfileField(body,label,input);
   return {token,input,label};
  });
  const chosen=()=>picks.filter(({input})=>input.checked);
  const update=()=>{
   const count=chosen().length;
   status.textContent=picks.length?count+' selected · choose 1–'+cast.limit:'No eligible creatures in this area.';
   confirm.disabled=count<1||count>cast.limit;
  };
  for(const {input} of picks)input.onchange=update;
  confirm.textContent='Confirm and roll';
  update();
  let sending=false;
  form.onsubmit=async event=>{
   event.preventDefault();
   const targets=chosen();
   if(sending||!chatIsGm()||!card.isConnected||cast.scene!==currentSceneId||roomDraftAttached!==attached||
    !targets.length||targets.length>cast.limit||targets.some(({token})=>!tokens.includes(token)||!eligible(token))){
    status.textContent='The targets changed. Reopen this cast to choose again.';return;
   }
   sending=true;confirm.disabled=true;
   const result=document.createElement('li');
   for(const key of ['chatName','chatType','spellCastId','audience'])if(card.dataset[key])result.dataset[key]=card.dataset[key];
   result.append(combatText('strong',card.dataset.chatName),combatText('h3',title));
   const shared=mode.value==='shared';
   rollNode(result,'p',targets.length+(targets.length===1?' target':' targets')+' · '+(shared?'shared roll':'separate rolls'));
   const description=card.querySelector(':scope > .combat-spell-description');
   if(description)result.append(description.cloneNode(true));
   const sharedResults=shared?document.createElement('div'):null;
   const roll=parent=>renderPlannerRollResults(parent,cast.entries,null,
    ['advantage','disadvantage','super-advantage','super-disadvantage'].includes(cast.mode)?cast.mode:'normal');
   if(shared)roll(sharedResults);
   for(const {token,label} of targets){
    const row=rollNode(result,'details',null,'combat-mob-attack');
    row.dataset.chatType='attack';
    row.dataset.rollTargetId=spellTargetId(token);
    const summary=rollNode(row,'summary',label);
    if(shared)row.append(...[...sharedResults.children].map(child=>child.cloneNode(true)));
    else roll(row);
    const attack=row.querySelector('.roll-grid > .roll-result:not(.discarded)');
    const total=combatInteger(attack?.querySelector('.roll-total')?.textContent);
    const natural=combatInteger(attack?.dataset.naturalD20);
    const ac=combatInteger(token.ac,token.plannerCombat?.ac);
    const damage=rollDamageAmount(row);
    const miss=natural===1||natural!==20&&ac!==null&&total<ac;
    if(miss)row.dataset.spellAttackMiss='true';
    summary.textContent+=' · '+(natural===20?'Critical hit':natural===1?'Natural 1 · Miss':
     total+' to hit'+(ac===null?'':miss?' · Miss':' · Hit'));
    if(damage!==null)summary.textContent+=' · '+damage+' damage rolled';
   }
   const hide=card.dataset.chatHidden==='true';
   const audience=card.dataset.audience==='gm'||hide?'gm':'public';
   if(audience==='gm')result.dataset.audience='gm';
   if(!roomProfile){appendChatCard(result);dialog.close();return}
   const saved=await sendSharedChat(result,audience);
   if(saved===null){sending=false;update();status.textContent='Chat did not confirm the roll. Try again.';return}
   button.disabled=true;
   if(card.dataset.chatId)void publishRoom('chat_moderate',{id:card.dataset.chatId,action:'delete'});
   dialog.close();
  };
  dialog.showModal();
 });
 bar.append(button);
 return true;
}
function attachChatControls(card){
 for(const controls of card.querySelectorAll('.chat-card-controls'))controls.remove();
 if(!chatIsGm())return;
 const bar=document.createElement('div'),hidden=card.dataset.chatHidden==='true';
 bar.className='chat-card-controls';
 const attacks=[...card.querySelectorAll(':scope > .combat-mob-attack')];
 if(!attacks.length&&!attachMultiTargetSpell(card,bar)&&!attachAreaSpellApplication(card,bar))attachRollApplication(card,bar);
 for(const [index,attack] of attacks.entries()){
  const controls=document.createElement('div');
  controls.className='chat-card-controls';
  const applicationId=card.dataset.spellCastId?'spell:'+card.dataset.spellCastId:
   card.dataset.chatId?card.dataset.chatId+':mob:'+index:null;
  if(attack.dataset.spellAttackMiss!=='true')attachRollApplication(attack,controls,applicationId,card);
  if(controls.children.length)attack.append(controls);
 }
 if(hidden)bar.append(combatText('span','Hidden from players'));
 for(const [action,label] of [[hidden?'show':'hide',hidden?'Unhide':'Hide'],['delete','Delete']]){
  const button=catalogButton(label,()=>{
   if(!chatIsGm())return;
   if(action==='delete'&&!confirm('Delete this chat item?'))return;
   if(roomProfile){
    if(card.dataset.chatId)publishRoom('chat_moderate',{id:card.dataset.chatId,action}).then(result=>{if(result)pollRoom()});
   }else{
    if(action==='delete')card.remove();else{card.dataset.chatHidden=String(action==='hide');attachChatControls(card)}
    applyChatFilters();queueRecovery();
   }
  });
  if(roomProfile&&!card.dataset.chatId)button.disabled=true;
  bar.append(button);
 }
 card.append(bar);
}
function mergeBeyondDamageCard(item,feed){
 if(!item.dataset.beyondRollAt||item.querySelector('.roll-grid .roll-result')||
    rollDamageAmount(item)===null&&!item.querySelector('.area-spell-healing'))return false;
 const actor=item.dataset.chatName, title=challengeKey(item.querySelector('h3')?.textContent).replace(/ damage$/,'');
 if(!actor||!title)return false;
 const time=Number(item.dataset.beyondRollAt),id=item.dataset.chatId;
 if(id&&[...feed.children].some(card=>card.dataset.beyondDamageId===id))return true;
 const prior=[...feed.children].reverse().find(card=>{
  const elapsed=time-Number(card.dataset.beyondRollAt);
  return card.dataset.beyondRollAt&&elapsed>=0&&elapsed<=120000&&
   challengeKey(card.dataset.chatName)===challengeKey(actor)&&card.dataset.audience===item.dataset.audience&&
   card.dataset.chatHidden===item.dataset.chatHidden&&challengeKey(card.querySelector('h3')?.textContent)===title&&
   card.dataset.chatType==='attack'&&card.querySelector('.roll-grid .roll-result');
 });
 if(!prior||rollDamageAmount(prior)!==null||prior.querySelector('.area-spell-healing'))return false;
 const controls=prior.querySelector('.chat-card-controls');
 for(const node of item.querySelectorAll(':scope > .roll-card-damage, :scope > .roll-damage-total'))
  prior.insertBefore(node.cloneNode(true),controls);
 if(id)prior.dataset.beyondDamageId=id;
 if(!prior.dataset.areaSpell&&item.dataset.areaSpell)prior.dataset.areaSpell=item.dataset.areaSpell;
 attachChatControls(prior);
 return true;
}
function appendChatCard(item){
 const panel=el('rollsPanel'),feed=el('rollsFeed');
 if(!item.dataset.chatName)item.dataset.chatName=item.querySelector('.roll-speaker,strong')?.textContent||'';
 if(!item.dataset.chatType)item.dataset.chatType=chatKind('',chatContent(item),!!item.querySelector('.roll-formula,.roll-result'));
 if(mergeBeyondDamageCard(item,feed)){applyChatFilters();queueRecovery();return}
 attachChatControls(item);
 const id=Number(item.dataset.chatId);
 const old=id&&[...feed.children].find(node=>Number(node.dataset.chatId)===id||
  item.dataset.challengeId&&node.dataset.challengeId===item.dataset.challengeId||
  item.dataset.spellCastId&&node.dataset.spellCastId===item.dataset.spellCastId);
 if(old&&Number(old.dataset.chatId)>id)return;
 if(old)old.replaceWith(item);
 else{
  const later=id&&[...feed.children].find(node=>Number(node.dataset.chatId)>id);
  if(later)feed.insertBefore(item,later);else feed.append(item);
 }
 while(feed.children.length>100)feed.firstElementChild.remove();
 applyChatFilters();
 if(!panel.hidden&&!item.hidden&&!old)feed.scrollTop=feed.scrollHeight;
}
function chatRoll(formula,diceMultiplier=1){
 const match=/^(\d+)d(\d+)(?:([+-])(\d+))?$/i.exec(formula.replace(/\s/g,''));
 if(!match)return null;
 const count=Number(match[1]),faces=Number(match[2]),modifier=Number(match[4]||0)*(match[3]==='-'?-1:1);
 if(count<1||count>100||faces<2||faces>1000||Math.abs(modifier)>100000)return null;
 const dice=Array.from({length:count*diceMultiplier},()=>1+Math.floor(Math.random()*faces));
 const total=dice.reduce((a,b)=>a+b,modifier);
 return {formula:dice.length+'d'+faces+(modifier===0?'':modifier>0?'+'+modifier:modifier),dice,faces,modifier,total};
}
function rollNode(parent,tag,text,className){
 const node=document.createElement(tag);
 if(text!=null)node.textContent=String(text).slice(0,1200);
 if(className)node.className=className;
 parent.append(node);return node;
}
function isMaximumDie(die,faces){
 const value=die?.roll??die?.result;
 return value!=null&&Number(faces)>=2&&Number(value)===Number(faces);
}
function rollBreakdown(parent,roll,parts){
 const pieces=[];
 const add=(value,style)=>{
  const last=pieces.at(-1);
  if(!style&&last&&!last.style)last.text+=value;
  else pieces.push({text:String(value),style});
 };
 if(roll.formula)add(roll.formula);
 if(parts.length){
  if(roll.formula)add(' · ');
  parts.forEach((part,index)=>{
   if(index)add(' ');
   if(typeof part==='string'||typeof part==='number'){add(part);return}
   if(!Array.isArray(part?.rolls))return;
   add('[');
   part.rolls.forEach((die,i)=>{
    if(i)add(', ');
    add(die?.roll??die?.result??'?',isMaximumDie(die,part.faces)?'roll-max-die':'');
    if(die?.discarded)add(' dropped');
   });
   add(']');
  });
  if(roll.modifier)add(' · Modifier: '+roll.modifier);
 }
 if(parent)for(const piece of pieces)rollNode(parent,'span',piece.text,piece.style);
 return pieces.map(piece=>piece.text).join('');
}
function natural20(roll){
 if(!roll||roll.discarded)return false;
 if(roll.faces===20)return roll.dice.includes(20);
 const d20=Array.isArray(roll.parts)&&roll.parts.find(part=>Number(part?.faces)===20);
 return !!d20?.rolls?.some(die=>!die.discarded&&isMaximumDie(die,20));
}
function markCritical(grid){
 rollNode(grid,'strong','Natural 20 · Critical hit','roll-critical');
}
function rollCardResult(parent,roll,label='',totalDamage=false){
 if(!roll||roll.total==null||!Number.isFinite(Number(roll.total)))return false;
 const block=rollNode(parent,'div',null,totalDamage?'roll-damage-total roll-total':'roll-result'+(roll.discarded?' discarded':''));
 if(totalDamage){block.textContent=label+': '+roll.total;return true}
 if(label)rollNode(block,'div',label,'roll-label');
 const parts=roll.dice?.length
  ?[{faces:roll.faces,rolls:roll.dice.map(value=>({roll:value}))}]
  :Array.isArray(roll.parts)?roll.parts:[];
 const keptD20s=parts.filter(part=>Number(part?.faces)===20).flatMap(part=>part.rolls??[])
  .filter(die=>!die.discarded&&Number.isInteger(Number(die.roll??die.result)));
 if(keptD20s.length===1)block.dataset.naturalD20=String(keptD20s[0].roll??keptD20s[0].result);
 const hasMaximum=parts.some(part=>part?.rolls?.some(die=>isMaximumDie(die,part.faces)));
 const detail=rollBreakdown(null,roll,parts);
 if(detail){
  const details=rollNode(block,'details',null,'roll-compact');
  details.open=hasMaximum;
  const summary=rollNode(details,'summary',roll.total,'roll-total');
  summary.title=detail;
  rollBreakdown(rollNode(details,'div',null,'roll-breakdown'),roll,parts);
 }else rollNode(block,'div',roll.total,'roll-total');
 return true;
}
async function postChat(text,audience){
 const error=el('chatError');
 error.textContent='';
 const input=text.trim();
 if(!input)return false;
 const command=/^\/roll(?:\s|$)/i.test(input),roll=command?chatRoll(input.slice(5)):null;
 if(command&&!roll){error.textContent='Use /roll 2d6+3. Up to 100 dice with 2–1,000 faces each.';return false}
 const card=document.createElement('li');
 card.dataset.chatType=roll?'dice':'text';
 if(audience==='gm')card.dataset.audience='gm';
 function add(tag,text,className){
  const node=document.createElement(tag);node.textContent=text;
  if(className)node.className=className;
  card.append(node);return node;
 }
 add('strong',audience==='gm'?'Whisper to GM':playing?'Player':'DM');
 if(roll){
  rollCardResult(card,roll);
 }else add('p',input);
 if(roomProfile){
  const result=await sendSharedChat(card,audience);
  if(!result){error.textContent='Chat update was not confirmed.';return false}
  if(audience==='gm'&&!roomProfile.gm)error.textContent='Whisper sent to GM.';
 }
 else appendChatCard(card);
 queueRecovery();return true;
}
let chatComposerPending=false;
async function submitChatDraft(input,audience){
 if(chatComposerPending)return false;
 chatComposerPending=true;
 try{return await postChat(input,audience)}
 finally{chatComposerPending=false}
}
el('chatComposer').onsubmit=async e=>{
 e.preventDefault();
 const input=el('chatInput'),value=input.value;
 if(await submitChatDraft(value,el('chatAudience').value)&&input.value===value)input.value='';
};
document.querySelectorAll('[data-chat-die]').forEach(button=>{
 button.onclick=()=>postChat('/roll 1d'+button.dataset.chatDie,el('chatAudience').value);
});
// Beyond20 flags distinguish hit riders from damage triggered by a later event.
const beyondDamageFlags={versatile:2,additional:4,healing:8,critical:16,conditional:32};
function beyondDamageKey(label,flags){
 return (flags&beyondDamageFlags.versatile)+':'+String(label||'')
  .toLowerCase().replace(/\s*\(?critical(?: hit| damage)?\)?\s*/g,' ').trim();
}
function beyondExtraDice(roll){
 const groups=Array.isArray(roll.parts)?roll.parts.filter(part=>Array.isArray(part?.rolls)):[];
 if(!groups.length){
  const simple=roll.formula&&chatRoll(roll.formula.replace(/[+-]\s*\d+\s*$/,''));
  return simple||null;
 }
 const extra=groups.map(part=>chatRoll(Number(part.amount||part.rolls.length)+'d'+Number(part.faces)));
 if(extra.some(result=>!result))return null;
 return {
  formula:extra.map(result=>result.formula).join(' + '),
  parts:extra.flatMap((result,index)=>[
   ...(index?['+']:[]),
   {faces:result.faces,rolls:result.dice.map(value=>({roll:value}))}
  ]),
  total:extra.reduce((sum,result)=>sum+result.total,0)
 };
}
function renderBeyondDamage(card,data,critical){
 const damage=rollNode(card,'div',null,'roll-card-damage');
 const entries=(Array.isArray(data.damage_rolls)?data.damage_rolls:[]).filter(Array.isArray);
 const provided=new Map();
 const isCritical=([label,,flags])=>Boolean(flags&beyondDamageFlags.critical)||/\bcritical\b/i.test(label||'');
 for(const entry of entries){
  const [label,value,flags]=entry;
  if(!isCritical(entry)||!Number.isFinite(value?.total))continue;
  const key=beyondDamageKey(label,flags);
  provided.set(key,(provided.get(key)||0)+1);
 }
 const base=[],extras=[];
 for(const entry of entries){
  const [label,value,flags]=entry;
  if(typeof value==='string'){rollNode(damage,'div',label+': '+value);continue}
  const extra=isCritical(entry);
  // For a damage-only follow-up, the extension may already have supplied the critical dice.
  if(!rollCardResult(damage,value,label||'Damage'))continue;
  if((flags&beyondDamageFlags.healing||/heal/i.test(label||''))&&!/temporary|temp hp/i.test(label||''))
   damage.lastElementChild.classList.add('area-spell-healing');
  if(flags&(beyondDamageFlags.healing|beyondDamageFlags.conditional)||/heal|temporary|temp hp/i.test(label||''))continue;
  if(extra){extras.push({total:Number(value.total),flags});continue}
  base.push({total:Number(value.total),flags});
  if(!critical)continue;
  const key=beyondDamageKey(label,flags),count=provided.get(key)||0;
  if(count){provided.set(key,count-1);continue}
  const additional=beyondExtraDice(value);
  if(additional){
   rollCardResult(damage,additional,(label||'Damage')+' · Critical dice');
   extras.push({total:additional.total,flags});
  }
 }
 const canApplyCritical=critical||!data.attack_rolls?.length&&extras.length>0;
 if(canApplyCritical&&base.length){
  const total=parts=>parts.reduce((sum,part)=>sum+part.total,0);
  const versatile=part=>Boolean(part.flags&beyondDamageFlags.versatile);
  const primary=base.filter(part=>!versatile(part));
  const alternative=base.filter(versatile);
  const primaryExtras=extras.filter(part=>!versatile(part));
  rollCardResult(card,{total:total(primary.length?primary:alternative)+total(primary.length?primaryExtras:extras)},'Total damage',true);
  if(primary.length&&alternative.length){
   const riders=primary.filter(part=>part.flags&beyondDamageFlags.additional);
   const riderExtras=primaryExtras.filter(part=>part.flags&beyondDamageFlags.additional);
   rollCardResult(card,{total:total(alternative)+total(riders)+total(extras.filter(versatile))+total(riderExtras)},'Two-handed damage',true);
  }
  return;
 }
 let hasTotal=false;
 if(data.total_damages&&typeof data.total_damages==='object'){
  for(const [label,total] of Object.entries(data.total_damages))
   hasTotal=rollCardResult(card,typeof total==='object'?total:{total},label,true)||hasTotal;
 }
 if(!hasTotal&&base.length)rollCardResult(card,{total:base.reduce((sum,part)=>sum+part.total,0)},'Total damage',true);
}
const beyondMultiTargetCasts=new Map();
function beyondSpellEntries(request,attacks,spellName){
 const first=attacks.find(roll=>roll&&!roll.discarded&&Number.isFinite(Number(roll.total)));
 const modifier=combatInteger(request['to-hit']);
 const attack=modifier===null?combatFormula(first?.formula):'1d20'+(modifier>=0?'+':'')+modifier;
 if(!attack)return [];
 const entries=[{formula:attack,type:'Attack',d20:true}];
 if(challengeKey(spellName)==='steel wind strike'){
  entries.push({formula:'6d10',type:'Force',isDamage:true});
 }else if(Array.isArray(request.damages)&&request.damages.length){
  for(const [index,value] of request.damages.entries()){
   entries.push({formula:combatFormula(value),type:String(request['damage-types']?.[index]||'Damage'),isDamage:true});
  }
 }
 return entries.length>1&&entries.length<=8&&entries.every(multiTargetSpellEntry)?entries:[];
}
function renderBeyond20(event){
 if(!roomProfile)return;
 const data=Array.isArray(event.detail)?event.detail[0]:event.detail;
 if(data?.action!=='rendered-roll')return;
 learnBeyondPlayerProfile(data.request?.character||(typeof data.character==='object'?data.character:null),data.request);
 const item=document.createElement('li');
 function add(parent,tag,value,className){
  const node=document.createElement(tag);
  if(value!=null)node.textContent=String(value).slice(0,1200);
  if(className)node.className=className;
  parent.append(node);return node;
 }
 const character=typeof data.character==='string'?data.character:data.character?.name;
 const title=data.title||data.request?.name||'Roll';
 const isInitiative=data.request?.type==='initiative'||(!data.request?.type&&/^initiative$/i.test(String(data.title??'').trim()));
 const actorName=String(character||data.request?.character?.name||'').trim().toLowerCase();
 if(isInitiative&&actorName&&tokens.some(token=>token.incognito&&[token.displayName,token.name].some(name=>name?.trim().toLowerCase()===actorName))){
  if(roomProfile.gm&&tokens.filter(token=>[token.displayName,token.name].some(name=>name?.trim().toLowerCase()===actorName)).length===1&&captureInitiative(data,character)){publishInitiative();refresh()}
  return;
 }
 const request=data.request;
 const privateRoll=Number(data.whisper??request?.whisper??0)!==0;
 const isSpell=['spell-attack','spell-card'].includes(request?.type);
 const description=isSpell&&!privateRoll?spellDescriptionText(request.description??data.description):'';
 const attacks=Array.isArray(data.attack_rolls)?data.attack_rolls:[];
 const spellName=String(request?.name||title).replace(/\s+(?:[–—-]\s*)?damage$/i,'');
 const spellKey=actorName+'|'+challengeKey(spellName);
 const queuedAt=beyondMultiTargetCasts.get(spellKey);
 if(isSpell&&!privateRoll&&!attacks.length&&data.damage_rolls?.length&&Date.now()-queuedAt<120000)return;
 item.dataset.chatName=String(character||data.request?.character?.name||'');
 item.dataset.chatType=chatKind(data.request?.type,title,data.request?.type!=='chat-message');
 if(privateRoll)item.dataset.audience='gm';
 const header=add(item,'div',null,'roll-header');
 add(header,'span',privateRoll?'◆':String(character||'Dice').trim().slice(0,1).toUpperCase(),'roll-avatar');
 add(header,'strong',privateRoll?'Private roll':character||'Dice roll','roll-speaker');
 const now=new Date();
 if(!privateRoll)item.dataset.beyondRollAt=String(now.getTime());
 const time=add(header,'time',now.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
 time.dateTime=now.toISOString();
 if(privateRoll){
  add(item,'p','Details hidden in this test build.');
 }else{
  add(item,'h3',title);
  const grid=rollNode(item,'div',null,'roll-grid');
  attacks.forEach(roll=>rollCardResult(grid,roll));
  const critical=attacks.some(roll=>(roll?.type==='to-hit'||item.dataset.chatType==='attack')&&natural20(roll));
  if(critical){item.dataset.chatType='attack';markCritical(grid)}
  renderBeyondDamage(item,data,critical);
  if(data.request?.type==='chat-message'&&typeof data.request.message==='string')add(item,'p',data.request.message);
 }
 if(!privateRoll&&data.request?.type==='skill')item.dataset.chatType='check';
 if(!roomProfile){appendChatCard(item);return}
 const roll=data.request?.type==='initiative'&&!privateRoll?data.attack_rolls?.find(r=>r&&!r.discarded&&Number.isFinite(Number(r.total))):null;
 let capture=null;
 if(!privateRoll&&playing&&isSpell){
  const linkedId=request.character?.id??ddbCharacterIdFromUrl(request.character?.url);
  const candidates=tokens.filter(token=>!standeeHidden(token)&&(roomProfile.gm||ownsRoomStandee(token)));
  const linked=linkedId==null?[]:candidates.filter(token=>
   String(token.ddbCharacterId||ddbCharacterIdFromUrl(token.ddbCharacterUrl)||'')===String(linkedId));
  const actors=linked.length?linked:candidates.filter(token=>actorName&&
   [token.name,token.displayName,token.playerDisplayName].some(name=>name?.trim().toLowerCase()===actorName));
  const limit=multiTargetSpellLimit(spellName,description);
  if(limit&&attacks.length&&actors.length===1){
   const entries=beyondSpellEntries(request,attacks,spellName);
   if(entries.length){
    const mode=({3:'advantage',4:'disadvantage',6:'super-advantage',7:'super-disadvantage'})[Number(request.advantage)]||'normal';
    const pending=document.createElement('li');
    pending.dataset.chatName=item.dataset.chatName||actors[0].displayName||actors[0].name;
    pending.dataset.chatType='attack';
    if(actors[0].incognito)pending.dataset.audience='gm';
    pending.append(header,combatText('h3',spellName));
    const now=Date.now();
    beyondMultiTargetCasts.set(spellKey,now);
    if(beyondMultiTargetCasts.size>100)beyondMultiTargetCasts.delete(beyondMultiTargetCasts.keys().next().value);
    Promise.resolve(queueMultiTargetSpell(pending,actors[0],limit,entries,mode,description)).then(sent=>{
     if(sent===null&&beyondMultiTargetCasts.get(spellKey)===now)beyondMultiTargetCasts.delete(spellKey);
    });
    el('rollsStatus').textContent='Spell received. Waiting for the DM to choose targets.';
    return;
   }
  }
  const ability=String(request['save-ability']??'').trim().slice(0,3).toLowerCase();
  const dc=combatInteger(request['save-dc']);
  const saving=plannerAbilities.includes(ability)&&dc>=1&&dc<=99;
  const healing=item.querySelector('.area-spell-healing')!==null&&rollDamageAmount(item)===null;
  const hasDamage=rollDamageAmount(item)!==null;
  const awaitDamage=!hasDamage&&!healing&&request.rollDamage===false&&request.damages?.length>0;
  if(actors.length===1&&(saving||healing||hasDamage||awaitDamage)){
   capture=captureAreaSpell(actors[0],{ability:saving?ability:null,dc:saving?dc:null,healing,awaitDamage,beyond:true,
    half:areaSpellHalfDamage(request.description??data.description)});
   if(capture?.spell.targets.length&&!capture.pending.sending){
    capture.pending.sending=true;
    item.dataset.areaSpell=JSON.stringify(capture.spell);
    add(item,'p','Area template cast');
   }else capture=null;
  }
 }
 addChatSpellDescription(item,description);
 const sent=sendSharedChat(item,privateRoll?'gm':'public',roll?Number(roll.total):null);
 if(capture)finishAreaSpellSend(capture.pending,sent);
 el('rollsStatus').textContent='Received a Beyond20 roll.';
 if(!privateRoll&&roomProfile.gm&&captureInitiative(data,character))publishInitiative();
 else showRolls(true);
 queueRecovery();
}
document.addEventListener('Beyond20_RenderedRoll',renderBeyond20);
const recoveryKey='battlemap.sessionRecovery.v1',scenesKey='battlemap.scenes.v1';
const pingSpiralMs=2200,pingMarkerMs=5000;
const pingOverlay=el('pingOverlay'),pingContext=pingOverlay.getContext('2d');
let boardPings=[],boardPingFrame=null,boardPingTimeout=null;
function pingCross(a,b){
 return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
}
function pingUnit(vector){
 const length=Math.hypot(...vector);
 return length>1e-8&&Number.isFinite(length)?vector.map(value=>value/length):[0,0,1];
}
function pingSurfaceNormal(face){
 if(!face?.world||face.world.length<3)return [0,0,1];
 const [a,b,c]=face.world;
 const normal=pingUnit(pingCross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i])));
 const towardViewer=[D*Math.cos(tilt),C*Math.cos(tilt),Math.sin(tilt)];
 if(topDown?normal[2]<0:normal.reduce((sum,v,i)=>sum+v*towardViewer[i],0)<0)return normal.map(v=>-v);
 return normal;
}
function armBoardPing(gesture,face,recenter=false){
 const normal=pingSurfaceNormal(face);
 gesture.pingTimer=setTimeout(()=>{
  if(drag!==gesture||!playing)return;
  const [x,y,z]=gesture.pivot;
  if(x<0||y<0||x>gridLimit(0)||y>gridLimit(1))return;
  gesture.didPing=true;
  if(roomProfile)roomRpc('ping',{ticket:roomProfile.token,payload:{x,y,z,normal,recenter}})
   .then(()=>queueRoomPoll(40),error=>message(error.message));
  else{
   boardPings.push({x,y,z,normal,name:'',started:performance.now()});
   drawBoardPings();
  }
 },500);
}
let cachedPingGlow;
function pingGlowSprite(){
 if(cachedPingGlow)return cachedPingGlow;
 const sprite=document.createElement('canvas');
 sprite.width=sprite.height=72;
 const context=sprite.getContext('2d');
 const glow=context.createRadialGradient(36,36,0,36,36,36);
 glow.addColorStop(0,'#fff');
 glow.addColorStop(.24,'#fff');
 glow.addColorStop(.38,'#d5efffc0');
 glow.addColorStop(1,'#bde6ff00');
 context.fillStyle=glow;
 context.fillRect(0,0,72,72);
 cachedPingGlow=sprite;
 return sprite;
}
const pingFrameInterval=1000/30;
let lastPingPaint=-Infinity;
function drawBoardPings(){
 const now=performance.now(),lifetime=pingSpiralMs+pingMarkerMs;
 boardPings=boardPings.filter(p=>now-p.started<lifetime);
 if(!boardPings.length){pingOverlay.hidden=true;return}
 if(!W||!H)return;
 pingOverlay.hidden=false;
 const width=Math.min(canvas.width,Math.ceil(W)),height=Math.min(canvas.height,Math.ceil(H));
 if(pingOverlay.width!==width)pingOverlay.width=width;
 if(pingOverlay.height!==height)pingOverlay.height=height;
 pingContext.setTransform(width/W,0,0,height/H,0,0);
 lastPingPaint=now;
 pingContext.clearRect(0,0,W,H);
 let animating=false;
 for(const p of boardPings){
  const age=Math.max(0,now-p.started);
  const [px,py]=point(p.x,p.y,p.z);
  pingContext.save();
  pingContext.lineCap='round';
  if(age<pingSpiralMs&&preferences.pingAnimation!==0){
   animating=true;
   const progress=age/pingSpiralMs;
   const normal=Array.isArray(p.normal)&&p.normal.length===3&&p.normal.every(Number.isFinite)?pingUnit(p.normal):[0,0,1];
   const right=pingUnit(pingCross(Math.abs(normal[2])>.9?[0,1,0]:[0,0,1],normal));
   const forward=pingCross(normal,right),origin=[p.x,p.y,p.z];
   const spiral=t=>{
    const lift=Math.sin(Math.PI*t);
    const radius=42*lift/Math.max(S,1),height=55*lift/Math.max(S,1),angle=t*10*Math.PI;
    return point(...origin.map((value,i)=>value+normal[i]*height+radius*(right[i]*Math.cos(angle)+forward[i]*Math.sin(angle)))).slice(0,2);
   };
   const glow=pingGlowSprite();
   for(let i=18;i>=0;i--){
    const t=progress-i*.013;
    if(t<=0)continue;
    const [x,y]=spiral(t);
    const strength=(1-i/19)**2;
    const radius=4+9*strength;
    pingContext.globalAlpha=strength*.65;
    pingContext.drawImage(glow,x-radius,y-radius,2*radius,2*radius);
   }
   const [x,y]=spiral(progress);
   pingContext.globalAlpha=1;
   pingContext.drawImage(glow,x-18,y-18,36,36);
  }else{
   pingContext.beginPath();
   pingContext.moveTo(px-13,py);pingContext.lineTo(px-4,py);
   pingContext.moveTo(px+4,py);pingContext.lineTo(px+13,py);
   pingContext.moveTo(px,py-13);pingContext.lineTo(px,py-4);
   pingContext.moveTo(px,py+4);pingContext.lineTo(px,py+13);
   pingContext.strokeStyle='#151d2b';pingContext.lineWidth=6;pingContext.stroke();
   pingContext.strokeStyle='#fff';pingContext.lineWidth=2.5;pingContext.stroke();
   if(p.name){
    pingContext.font='bold 14px system-ui';pingContext.textAlign='center';pingContext.textBaseline='bottom';
    pingContext.strokeStyle='#151d2b';pingContext.lineWidth=4;pingContext.strokeText(p.name,px,py-17);
    pingContext.fillStyle='#fff';pingContext.fillText(p.name,px,py-17);
   }
  }
  pingContext.restore();
 }
 if(animating&&boardPingFrame===null)boardPingFrame=requestAnimationFrame(advanceBoardPing);
 else if(!animating&&boardPingFrame!==null){cancelAnimationFrame(boardPingFrame);boardPingFrame=null;}
 clearTimeout(boardPingTimeout);
 boardPingTimeout=setTimeout(drawBoardPings,Math.max(0,Math.min(...boardPings.map(p=>p.started+lifetime))-now));
}
function advanceBoardPing(now){
 boardPingFrame=null;
 if(now-lastPingPaint>=pingFrameInterval-1)drawBoardPings();
 else boardPingFrame=requestAnimationFrame(advanceBoardPing);
}
let recoveryTimer=null,areaMode=false,areaOrigin=null,areaPreview=null,areas=[];
let storageDb=null;
const storageReady=new Promise(resolve=>{
 let request;
 try{request=indexedDB.open('BattlemapStudio',1)}catch{resolve(null);return}
 request.onupgradeneeded=()=>request.result.createObjectStore('saves');
 request.onsuccess=()=>{storageDb=request.result;resolve(storageDb)};
 request.onerror=request.onblocked=()=>resolve(null);
});
function legacyValue(key,fallback){
 try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}
}
async function savedValue(key,fallback){
 const db=storageDb||await storageReady;
 if(db){
  try{
   const stored=await new Promise((resolve,reject)=>{
    const request=db.transaction('saves').objectStore('saves').get(key);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
   });
   if(stored!==undefined)return stored;
   const legacy=legacyValue(key,undefined);
   if(legacy!==undefined){await storeValue(key,legacy);return legacy}
  }catch{}
 }
 return legacyValue(key,fallback);
}
async function storeValue(key,value,{skipWorkspace=false}={}){
 if(!skipWorkspace&&workspaceKeys.has(key)&&!await saveWorkspaceItem(key,value))return false;
 const db=storageDb||await storageReady;
 if(db){
  try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('saves','readwrite');
    tx.oncomplete=resolve;
    tx.onabort=tx.onerror=()=>reject(tx.error);
    tx.objectStore('saves').put(value,key);
   });
   return true;
  }catch{return false}
 }
 try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}
}
function queueRecovery(){
 if(!recoveryReady)return;
 clearTimeout(recoveryTimer);
 recoveryTimer=setTimeout(saveRecovery,180);
}
function cardData(node){
 const children=[...node.children].filter(child=>!child.classList.contains('chat-card-controls'));
 return {tag:node.localName,text:node.children.length?'':node.textContent,style:node.className,title:node.classList.contains('roll-total')?node.title||undefined:undefined,audience:node.dataset.audience,
  challengeId:node.dataset.challengeId,beyondRollAt:node.dataset.beyondRollAt,beyondDamageId:node.dataset.beyondDamageId,chatName:node.dataset.chatName,chatType:node.dataset.chatType,chatId:node.dataset.chatId,chatHidden:node.dataset.chatHidden,rollTargetId:node.dataset.rollTargetId,areaSpell:node.dataset.areaSpell,spellCastId:node.dataset.spellCastId,multiTargetSpell:node.dataset.multiTargetSpell,
  naturalD20:node.dataset.naturalD20,spellAttackMiss:node.dataset.spellAttackMiss,children:children.map(cardData)};
}
function restoreCard(data){
 const tag=['li','div','strong','span','time','h3','p','details','summary'].includes(data.tag)?data.tag:'div';
 const node=document.createElement(tag);node.className=String(data.style||'');
 if(node.classList.contains('roll-total')&&typeof data.title==='string')node.title=data.title.slice(0,1200);
 if(data.audience==='gm')node.dataset.audience='gm';
 for(const key of ['chatName','chatType','chatId','chatHidden','challengeId','beyondRollAt','beyondDamageId','rollTargetId','areaSpell','spellCastId','multiTargetSpell','naturalD20','spellAttackMiss'])if(typeof data[key]==='string')node.dataset[key]=data[key];
 if(Array.isArray(data.children)&&data.children.length)node.append(...data.children.map(restoreCard));
 else node.textContent=String(data.text||'');
 if(node.matches('details.roll-compact')&&node.querySelector('.roll-max-die'))node.open=true;
 return node;
}
async function saveRecovery(){
 if(!roomProfile?.gm)return false;
 const pendingDraft=roomDraftAttached&&roomBaseline&&sceneDelta(roomBaseline,roomSnapshot()).length>0;
 const state={pieces,tokens,areas,currentSceneId,roomDraftTitle,roomDraftAttached,pendingDraft,playing,zoom,panX,panY,angle,tilt,initiative:[...initiativeEntries],activeInitiative,view:savePanelView(),chatOrder:'chronological',chat:[...el('rollsFeed').children].map(cardData)};
 const ok=await storeValue(recoveryKey,state);
 if(!ok&&!el('sceneDialog').open)message('Could not save session recovery. Export the map to keep a backup.');
 return ok;
}
let recoveredDetachedDraft=false;
async function recoverSession(){
 const state=await savedValue(recoveryKey,null);
 if(!state||!Array.isArray(state.pieces)||!Array.isArray(state.tokens))return;
 currentSceneId=scenes.some(scene=>scene.id===state.currentSceneId)?state.currentSceneId:null;
 recoveredDetachedDraft=state.roomDraftAttached===false||state.pendingDraft===true;
 if(typeof state.roomDraftTitle==='string')roomDraftTitle=state.roomDraftTitle;
 pieces=state.pieces;tokens=state.tokens;areas=Array.isArray(state.areas)?state.areas:[];
 playing=state.playing===true;
 ({zoom,panX,panY,angle,tilt}={zoom,panX,panY,angle,tilt,...Object.fromEntries(['zoom','panX','panY','angle','tilt'].filter(k=>Number.isFinite(state[k])).map(k=>[k,state[k]]))});
 for(const [key,value] of state.initiative||[])initiativeEntries.set(key,value);
 activeInitiative=initiativeEntries.has(state.activeInitiative)?state.activeInitiative:null;
 if(Array.isArray(state.chat)){
  const cards=state.chatOrder==='chronological'?state.chat.slice(-100):state.chat.slice(0,100).reverse();
  for(const card of cards)appendChatCard(restoreCard(card));
 }
 restorePanelView(state.view);
 message('Previous session restored.');
}
let recoveryReady=false;
window.addEventListener('pagehide',()=>{if(recoveryReady)saveRecovery()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&recoveryReady)saveRecovery()});
let scenes=[],sceneFolders=[],currentSceneId=null,standeeLibrary=[];
const sceneFoldersKey="battlemap.sceneFolders.v1";
const standeeLibraryKey='battlemap.standeeLibrary.v1';
let savingScenes=false,savingLibrary=false;
const folderPath=value=>value.split('/').map(part=>part.trim()).filter(Boolean).join('/');
const libraryName=token=>token.displayName||token.name||'Standee';
function catalogButton(label,action){
 const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=action;return button;
}
function catalogFolders(list,input,entries,renderRow,emptyFolders=[],renderFolderAction=null){
 list.replaceChildren();input.replaceChildren();
 const folders=new Map([['',list]]);
 function folder(path){
  if(folders.has(path))return folders.get(path);
  const split=path.lastIndexOf('/'),parent=folder(split<0?'':path.slice(0,split));
  const details=document.createElement('details'),summary=document.createElement('summary');
  details.open=true;summary.textContent=path.slice(split+1);details.append(summary);
  if(renderFolderAction)details.append(renderFolderAction(path));
  parent.append(details);
  folders.set(path,details);
  const option=document.createElement('option');option.value=path;input.append(option);
  return details;
 }
 for(const path of emptyFolders)folder(path);
 for(const entry of entries)folder(entry.folder||'').append(renderRow(entry));
}
function editCatalogEntry(entry,save){
 const name=prompt('Name',entry.name)?.trim().slice(0,80);
 if(!name)return;
 const folder=prompt('Folder path (blank for Unfiled)',entry.folder||'');
 if(folder===null)return;
 return save({...entry,name,folder:folderPath(folder.slice(0,100))});
}
async function changeScenes(next){
 if(savingScenes)return false;
 savingScenes=true;
 const button=el('saveSceneButton'),status=el('sceneStatus');
 button.disabled=true;status.textContent='Saving scenes…';
 try{
  if(roomProfile?.gm){
   const saved=await saveWorkspaceItem(scenesKey,next,true);
   if(!saved)throw Error('The shared workspace is unavailable. Reopen Scenes and try again.');
   scenes=next;renderScenes();
   const localSaved=await storeValue(scenesKey,next,{skipWorkspace:true});
   status.textContent=localSaved?'Scenes saved to the shared workspace.':
    'Scenes saved to the shared workspace. This browser could not update its backup.';
  }else{
   if(!await storeValue(scenesKey,next))throw Error('Browser storage is full or unavailable.');
   scenes=next;renderScenes();status.textContent='Scenes saved in this browser.';
  }
  return true;
 }catch(error){status.textContent='Could not save scenes. '+error.message;return false}
 finally{savingScenes=false;button.disabled=false}
}
// Persist the working catalog scene independently of publication and activation.
// A live encounter remains authoritative on the session server; this is a backup,
// never a replacement for live state or a reason to detach the GM.
let sceneAutosaveTimer=null,sceneAutosaveBusy=false,sceneAutosaveAgain=false,creatingWorkingScene=false;
async function ensureNamedWorkingScene(){
 if(creatingWorkingScene||currentSceneId||!roomProfile?.gm||roomState.active)return;
 creatingWorkingScene=true;
 try{
  await workspaceLoad;
  if(currentSceneId||roomState.active)return;
  const date=new Date(),label='New scene '+date.toLocaleDateString()+' '+date.toLocaleTimeString();
  const scene={id:crypto.randomUUID(),name:label,folder:'',published:false,map:structuredClone({pieces,tokens,areas,view:savePanelView()})};
  if(await changeScenes([...scenes,scene])){
   currentSceneId=scene.id;roomDraftTitle=scene.name;queueRecovery();
   message('Created and autosaved '+label+'. Rename it from Scenes when ready.');
  }
 }finally{creatingWorkingScene=false}
}

function scheduleSceneAutosave(delay=1200){
 if(!recoveryReady||!roomProfile?.gm||!currentSceneId)return;
 clearTimeout(sceneAutosaveTimer);
 sceneAutosaveTimer=setTimeout(()=>{void flushSceneAutosave()},delay);
}
async function flushSceneAutosave(){
 clearTimeout(sceneAutosaveTimer);sceneAutosaveTimer=null;
 if(sceneAutosaveBusy){
  for(let attempt=0;attempt<40&&sceneAutosaveBusy;attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  if(sceneAutosaveBusy)return false;
 }
 if(!roomProfile?.gm||!currentSceneId)return true;
 const id=currentSceneId,scene=scenes.find(item=>item.id===id);
 if(!scene)return true;
 // Do not persist an out-of-date detached copy of the active encounter.
 if(roomState.active&&roomState.sceneId===id&&!roomDraftAttached)return false;
 // Never persist an unsynchronized active encounter as its authoritative catalog copy.
 if(roomState.active&&roomState.sceneId===id&&(roomPatchBusy||roomPatchPending||!roomBaseline||sceneDelta(roomBaseline,roomSnapshot()).length)){
  scheduleSceneAutosave(1500);return false;
 }
 sceneAutosaveBusy=true;
 try{
  const map=structuredClone({pieces,tokens,areas,view:savePanelView()});
  const old=JSON.stringify(scene.map),next=JSON.stringify(map);
  if(old===next)return true;
  const updated=scenes.map(item=>item.id===id?{...item,map}:item);
  const ok=await changeScenes(updated);
  if(!ok){message('Scene autosave failed. Your changes remain in session recovery.');return false}
  return true;
 }finally{
  sceneAutosaveBusy=false;
  if(sceneAutosaveAgain){sceneAutosaveAgain=false;scheduleSceneAutosave(250)}
 }
}
async function loadSavedScene(scene,resetInitiative=false){
 // Never substitute the catalog snapshot for an active encounter's server state.
 if(roomProfile?.gm&&roomState.active&&scene.id===roomState.sceneId){
  if(currentSceneId!==scene.id&&!(await flushSceneAutosave())){message('Scene switch cancelled: changes could not be saved.');return}
  if(el('sceneDialog').open)el('sceneDialog').close();
  restoreActiveRoom=true;viewRoomScene(scene.id);void pollRoom();return;
 }
 if(currentSceneId!==scene.id){
  const saved=await flushSceneAutosave();
  if(!saved){message('Scene switch cancelled: changes could not be saved.');return}
 }
 exitTool();remember(resetInitiative);
 currentSceneId=scene.id;
 if(resetInitiative){initiativeEntries.clear();activeInitiative=null;roomRound=1}
 if(registerSceneStandees(scene.map.tokens,scene.name))storeValue(scenesKey,scenes);
 ({pieces,tokens,areas}=structuredClone(scene.map));
 restorePanelView(scene.map.view);
 group.clear();selected=null;
 roomDraftTitle=scene.name;roomDraftAttached=false;restoreActiveRoom=false;syncAccountControllers();
 el('sceneDialog').close();message('Loaded '+scene.name+'.');refresh();
 privateCombatLoad=hydrateStandeeCombat(scene.id,tokens);
}
const nextSessionQueueKey='battlemap.nextSessionQueue';
let nextSessionQueue=[],savingSessionQueue=false;
let playerPreloadManifestPending=false;
let playerPreloadEnabled=true,playerPreloadFetchAt=0,playerPreloadScheduled=false,playerPreloadRunning=false;
let playerPreloadAssets=[];
const playerPreloadKey='battlemap.playerScenePreload';
try{playerPreloadEnabled=localStorage.getItem(playerPreloadKey)!=='off'}catch{}
el('playerPreload').checked=playerPreloadEnabled;
el('playerPreload').onchange=()=>{
 playerPreloadEnabled=el('playerPreload').checked;
 try{localStorage.setItem(playerPreloadKey,playerPreloadEnabled?'on':'off')}catch{}
 if(playerPreloadEnabled){playerPreloadFetchAt=0;void refreshPlayerPreload()}
 else playerPreloadAssets=[];
};
const scenePreloadQuietMs=1500;
let lastScenePreloadInput=performance.now();
for(const type of ['pointerdown','pointermove','pointerup','wheel','keydown','input']){
 window.addEventListener(type,()=>{lastScenePreloadInput=performance.now()},{capture:true,passive:true});
}
function whenScenePreloadIdle(eligible,work){
 const busy=()=>document.hidden||drag||carry||cameraDetailTimer!==null||el('performanceReset').disabled;
 function check(){
  if(!eligible()){work(false);return}
  const quietRemaining=scenePreloadQuietMs-(performance.now()-lastScenePreloadInput);
  if(busy()||quietRemaining>0){
   setTimeout(check,Math.max(250,quietRemaining));return;
  }
  if(window.requestIdleCallback){
   window.requestIdleCallback(deadline=>{
    if(!eligible()){work(false);return}
    if(deadline.timeRemaining()<5||busy()||
     performance.now()-lastScenePreloadInput<scenePreloadQuietMs){setTimeout(check,250);return}
    work(true);
   });
  }else work(true);
 }
 setTimeout(check,250);
}
function preloadPlayerArt(){
 if(playerPreloadScheduled||playerPreloadRunning||!playerPreloadEnabled||roomProfile?.gm!==false)return;
 if(!playerPreloadAssets.length)return;
 playerPreloadScheduled=true;
 const profile=roomProfile;
 whenScenePreloadIdle(()=>profile===roomProfile&&playerPreloadEnabled&&playerPreloadAssets.length>0,async ready=>{
  playerPreloadScheduled=false;
  if(!ready){preloadPlayerArt();return}
  const src=playerPreloadAssets.find(value=>!artCache.has(value));
  if(!src)return;
  playerPreloadRunning=true;
  try{await getArt(src,true).decode()}catch{}
  finally{playerPreloadRunning=false;preloadPlayerArt()}
 });
}
function refreshPlayerPreload(){
 const profile=roomProfile;
 if(profile?.gm!==false||!playerPreloadEnabled||playerPreloadManifestPending||Date.now()<playerPreloadFetchAt)return;
 playerPreloadManifestPending=true;
 whenScenePreloadIdle(()=>profile===roomProfile&&playerPreloadEnabled,async ready=>{
  try{
   if(!ready)return;
   playerPreloadFetchAt=Date.now()+30000;
   const result=await roomRpc('scene_preload',{ticket:profile.token});
   if(profile!==roomProfile||!playerPreloadEnabled)return;
   playerPreloadAssets=(result.assets??[]).filter(src=>typeof src==='string'&&src.startsWith('https://'));
   preloadPlayerArt();
  }catch(error){console.warn('Could not refresh upcoming scene art.',error.message)}
  finally{playerPreloadManifestPending=false}
 });
}
async function restoreSharedSceneQueue(profile){
 try{
  const result=await roomRpc('scene_preload',{ticket:profile.token});
  if(profile!==roomProfile||savingSessionQueue)return;
  if(Array.isArray(result.queue))nextSessionQueue=result.queue;
  else if(nextSessionQueue.length)await roomRpc('scene_preload',{ticket:profile.token,queue_ids:nextSessionQueue});
  renderScenes();
 }catch(error){console.warn('Could not restore the next session queue.',error.message)}
}
const queuedSceneArt=new Set();
let scenePreloadScheduled=false,scenePreloadRunning=false;
function preloadQueuedScenes(){
 if(scenePreloadScheduled||scenePreloadRunning||!roomProfile?.gm||!nextSessionQueue.length)return;
 scenePreloadScheduled=true;
 const profile=roomProfile;
 whenScenePreloadIdle(()=>profile===roomProfile&&nextSessionQueue.length>0,ready=>{
  scenePreloadScheduled=false;
  if(!ready){preloadQueuedScenes();return}
  for(const id of nextSessionQueue){
   const scene=scenes.find(item=>item.id===id);
   if(!scene?.map)continue;
   const {tokens=[],areas=[]}=scene.map;
   const sources=[
    ...tokens.flatMap(token=>{
     const look=token.looks?.[token.activeLook];
     return [look?.front||token.src,look?.back||token.backSrc];
    }),
    ...areas.filter(area=>area.shape==='appearance').flatMap(area=>[area.appearance?.groundImage,area.appearance?.backdropImage])
   ];
   const src=sources.find(value=>typeof value==='string'&&value&&!queuedSceneArt.has(value)&&!artCache.has(value));
   if(!src)continue;
   queuedSceneArt.add(src);
   scenePreloadRunning=true;
   getArt(src,true).decode().catch(()=>{}).finally(()=>{scenePreloadRunning=false;preloadQueuedScenes()});
   break;
  }
 });
}
async function toggleQueuedScene(id){
 if(savingSessionQueue)return;
 savingSessionQueue=true;
 try{
  const next=nextSessionQueue.includes(id)?nextSessionQueue.filter(item=>item!==id):[...nextSessionQueue,id];
  await roomRpc('scene_preload',{ticket:roomProfile.token,queue_ids:next});
  nextSessionQueue=next;
  void storeValue(nextSessionQueueKey,next);
  renderScenes();
 }catch(error){el('sceneStatus').textContent=error.message}
 finally{savingSessionQueue=false}
}
function renderScenes(){
 preloadQueuedScenes();
 const queue=el('nextSessionQueue');
 queue.hidden=!roomProfile?.gm;
 queue.replaceChildren();
 if(roomProfile?.gm){
  queue.append(combatText('strong','Next session'));
  const list=document.createElement('ol');
  for(const id of nextSessionQueue){
   const scene=scenes.find(item=>item.id===id);
   if(!scene)continue;
   const row=combatText('li',scene.name+' ');
   row.append(catalogButton('Open',()=>startRoomScene('open',scene)),catalogButton('Remove',()=>toggleQueuedScene(id)));
   list.append(row);
  }
  queue.append(list.children.length?list:combatText('p','Queue scenes from the list below.'));
 }
 catalogFolders(el('sceneList'),el('sceneFolders'),scenes,scene=>{
  const row=document.createElement('div'),name=document.createElement('strong');
  const save=catalogButton('Save',async()=>{
   if(currentSceneId!==scene.id||savingScenes)return;
   registerSceneStandees(tokens,scene.name);
   const next={...scene,map:structuredClone({pieces,tokens,areas,view:savePanelView()})};
   if(await changeScenes(scenes.map(item=>item===scene?next:item))){
    storeValue(accountCatalogKey,[...accountCatalog.values()]);
    el('sceneStatus').textContent='Saved '+scene.name+'.';
   }
  });
  save.disabled=currentSceneId!==scene.id;
  save.hidden=true; // All scene changes save automatically.
  if(!save.disabled)name.title='Current scene';
  row.className='scene-row';name.textContent=scene.name;
  const heading=document.createElement('div'),actions=document.createElement('div');
  heading.className='scene-heading';actions.className='scene-actions';
  const active=roomState.activeSceneId===scene.id;
  const viewing=roomState.sceneId===scene.id&&roomDraftAttached;
  const status=combatText('span',(active?'Active':scene.published?'Published':'Unpublished')+(viewing?' · Viewing':''));
  status.className='scene-publication';
  heading.append(name,status);
  actions.append(catalogButton('Open',()=>roomProfile?.gm?startRoomScene('open',scene):loadSavedScene(scene)));
  if(roomProfile?.gm){
   if(!nextSessionQueue.includes(scene.id))actions.append(catalogButton('Queue for next session',()=>toggleQueuedScene(scene.id)));
   if(!active)actions.append(catalogButton(scene.published?'Unpublish':'Publish',async()=>{
    if(savingScenes)return;
    if(await changeScenes(scenes.map(item=>item===scene?{...item,published:!scene.published}:item)))await pollRoom();
   }));
   if(!active&&scene.published)actions.append(catalogButton('Activate',()=>startRoomScene('activate',scene)));
   if(active)actions.append(catalogButton('Deactivate',()=>startRoomScene('deactivate',scene)));
   if(viewing)actions.append(catalogButton(roomState.paused?'Unpause':'Pause',()=>startRoomScene(roomState.paused?'resume':'pause',scene)));
  }
  // Manual Save is obsolete; edits are autosaved regardless of publication.
  if(!active&&!scene.published)actions.append(
   catalogButton('Rename / move',()=>editCatalogEntry(scene,next=>changeScenes(scenes.map(item=>item===scene?next:item)))),
   catalogButton('Delete',()=>{if(confirm('Delete scene '+scene.name+'?'))changeScenes(scenes.filter(item=>item!==scene))}));
  row.append(heading,actions);
  return row;
 },sceneFolders);
}
el('newSceneFolder').onclick=async()=>{
 const path=folderPath((prompt('Folder path (for example Campaign/Chapter)')||'').slice(0,100));
 if(!path)return;
 const next=[...new Set([...sceneFolders,path])];
 if(!await storeValue(sceneFoldersKey,next)){el('sceneStatus').textContent='Could not save the folder.';return}
 sceneFolders=next;renderScenes();el('sceneFolder').value=path;
 el('sceneStatus').textContent='Folder saved.';
};
function newSceneMap(theme,populate,random=Math.random){
 const terrain=[];
 const between=(min,max)=>min+Math.floor(random()*(max-min+1));
 if(populate){
  for(let i=0;i<4;i++){
   let x=3+(i%2)*20+between(0,4),y=3+Math.floor(i/2)*20+between(0,4);
   let w=between(8,12),d=between(7,11),z=0;
   for(let level=0,count=between(1,3);level<count;level++){
    const height=between(1,2);
    terrain.push({type:'volume',x,y,z,r:0,extents:[w,d,height]});
    x++;y++;w-=2;d-=2;z+=height;
   }
  }
  for(let i=0,placed=0;i<100&&placed<22;i++){
   const column={type:'column',x:between(1,38)+.25,y:between(1,38)+.25,z:0,r:between(0,3)};
   for(const p of terrain){
    if(p.type!=='volume')continue;
    const [w,d,h]=p.extents;
    if(column.x>=p.x&&column.x+.5<=p.x+w&&column.y>=p.y&&column.y+.5<=p.y+d)column.z=Math.max(column.z,p.z+h);
   }
   if(!valid(column,terrain,null))continue;
   if(theme==='forest')column.terrainShape={treeFoliage:random()<.8};
   terrain.push(column);placed++;
  }
 }
 return {pieces:terrain,tokens:[],areas:theme?[{shape:'appearance',size:1,origin:[0,0,0],angle:0,appearance:{terrainTheme:theme}}]:[],view:savePanelView()};
}
const resizeSceneButton=catalogButton('Resize battlefield',()=>{
 const {width,depth}=sceneGrid();
 const answer=prompt('Width and depth in squares (10–100 each)',width+' × '+depth);
 if(answer===null)return;
 const match=answer.match(/^\s*(\d+)\s*[x×,]\s*(\d+)\s*$/i);
 const grid=match&&{width:Number(match[1]),depth:Number(match[2])};
 const status=el('sceneStatus');
 if(!validSceneGrid(grid)){status.textContent='Enter width × depth, 10–100 squares each.';return}
 if([...pieces,...tokens].some(p=>{
  const [w,d]=dimensions(p);
  return p.x+w>grid.width||p.y+d>grid.depth;
 })||areas.some(a=>a.origin&&(a.origin[0]>=grid.width||a.origin[1]>=grid.depth))){
  status.textContent='Move objects inside the new bounds before resizing.';return;
 }
 remember();setSceneGrid(areas,grid);movementRenderCache=null;refresh();
 status.textContent='Battlefield resized. Save the scene to keep it.';
});
el('sceneStatus').before(resizeSceneButton);
el('scenes').onclick=async()=>{
 if(roomProfile&&!roomProfile.gm)return;
 await workspaceLoad;
 void saveRecovery();
 el('sceneSource').onchange();
 renderScenes();if(!el('sceneDialog').open)el('sceneDialog').showModal();
};
function mergeSceneBackup(existing,backup){
 if(!Array.isArray(backup)||!backup.length)throw new Error('Choose a scene backup containing at least one scene.');
 const merged=[...existing],added=[];
 for(const scene of backup){
  if(!scene||typeof scene.name!=='string'||!scene.name.trim()||
   (scene.folder!=null&&typeof scene.folder!=='string')||
   !scene.map||!['pieces','tokens','areas'].every(key=>Array.isArray(scene.map[key])))throw new Error('The backup contains an invalid scene.');
  const folder=folderPath(scene.folder||''),map=JSON.stringify(scene.map);
  if(merged.some(saved=>saved.name===scene.name&&(saved.folder||'')===folder&&JSON.stringify(saved.map)===map))continue;
  const id=typeof scene.id==='string'&&scene.id&&!merged.some(saved=>saved.id===scene.id)?scene.id:crypto.randomUUID();
  const restored={...scene,id,folder};
  merged.push(restored);added.push(restored);
 }
 return {merged,added};
}
el('restoreSceneBackup').onclick=()=>el('sceneBackupFile').click();
el('sceneBackupFile').onchange=async e=>{
 const file=e.target.files[0];
 e.target.value='';
 if(!file||savingScenes)return;
 const ticket=roomProfile?.token;
 const status=el('sceneStatus');
 try{
  const backup=JSON.parse(await file.text());
  await workspaceLoad;
  if(roomProfile?.token!==ticket||savingScenes)return;
  const {merged,added}=mergeSceneBackup(scenes,backup);
  if(!added.length){status.textContent='All backup scenes are already present.';return}
  const list=added.map(scene=>[scene.folder,scene.name].filter(Boolean).join(' / ')).join('\n');
  if(!confirm('Restore '+added.length+' scene(s)? Existing scenes will be kept.\n\n'+list))return;
  if(await changeScenes(merged))status.textContent='Restored '+added.length+' scene(s)'+(roomProfile?.gm?' to the shared workspace.':'.');
  else status.textContent='Could not confirm the restore. Reload Scenes before retrying.';
 }catch(err){status.textContent='Could not restore the backup. '+err.message}
};
el('sceneSource').onchange=()=>{
 const current=el('sceneSource').value==='current';
 el('newSceneThemeLabel').hidden=current;
 el('saveSceneButton').textContent=current
  ?(currentSceneId?'Save current scene':'Create scene from current map')
  :'Create and load scene';
};
el('sceneForm').onsubmit=async e=>{
 e.preventDefault();
 const name=el('sceneName').value.trim(),folder=folderPath(el('sceneFolder').value);
 if(!name||savingScenes)return;
 const source=el('sceneSource').value;
 const existing=scenes.find(scene=>scene.name===name&&(scene.folder||'')===folder);
 if(existing&&!confirm('Replace scene '+name+'?'))return;
 if(source==='current')registerSceneStandees(tokens,name);
 const map=source==='current'?structuredClone({pieces,tokens,areas,view:savePanelView()}):
  newSceneMap(el('newSceneTheme').value,source==='random');
 const scene={id:existing?.id||crypto.randomUUID(),name,folder,map};
 if(!await changeScenes([...scenes.filter(item=>item!==existing),scene]))return;
 if(source==='current'){
  currentSceneId=scene.id;roomDraftTitle=scene.name;el('sceneSource').onchange();renderScenes();queueRecovery();scheduleSceneAutosave();
  storeValue(accountCatalogKey,[...accountCatalog.values()]);
 }
 else await loadSavedScene(scene,true);
};
async function changeStandeeLibrary(next){
 if(savingLibrary)return;
 savingLibrary=true;
 const ok=await storeValue(standeeLibraryKey,next);
 savingLibrary=false;
 if(ok){standeeLibrary=next;renderStandeeLibrary()}
 el('libraryStatus').textContent=ok?'Standee library saved in this browser.':'Could not save the standee library.';
}
function libraryPlacement(item,fresh=false){
 const {size,sizeCategory,x,y,z,roomId,trackingId,initiativeKey,targetId,hpPoolId,controllerNames,...template}=structuredClone(item.token);
 const sourceId=roomId||item.token.characterRoomId;
 return {...(baseStandeeRole(template)==='enemy'&&template.darkvision==null&&template.blindsight==null?{darkvision:60}:{}),...template,characterRoomId:fresh?undefined:sourceId,ownerStandeeId:sourceId||template.ownerStandeeId,name:item.name,displayName:item.name,hp:template.maxHp??template.hp,tempHp:0,conditions:[],manualTarget:false};
}
function folderStandeePositions(anchor,members){
 const spacing=Math.max(...members.map(p=>p.size)),columns=Math.ceil(Math.sqrt(members.length));
 const rows=Math.ceil(members.length/columns),cx=anchor.x+.5,cy=anchor.y+.5;
 return members.map((p,i)=>{
  const row=Math.floor(i/columns),count=Math.min(columns,members.length-row*columns);
  return {...p,z:anchor.z,x:Math.round(cx+(i%columns-(count-1)/2)*spacing-p.size/2),
   y:Math.round(cy+(row-(rows-1)/2)*spacing-p.size/2)};
 });
}
let townsfolkLibrary=[],townsfolkLibraryLoad=null;
function loadTownsfolkLibrary(){
 if(townsfolkLibraryLoad)return townsfolkLibraryLoad;
 townsfolkLibraryLoad=Promise.all([1,2,3,4].map(async group=>{
  const response=await fetch('./art/townsfolk-'+group+'.json');
  if(!response.ok)throw Error('Could not load townsfolk standees.');
  return response.json();
 })).then(groups=>{
  const items=groups.flat();
  if(!Array.isArray(items)||items.length!==24||items.some(item=>!validLooks(item.token)))throw Error('Townsfolk library data is incomplete.');
  townsfolkLibrary=items;
 }).catch(error=>{
  townsfolkLibraryLoad=null;
  el('libraryStatus').textContent=error.message;
 });
 return townsfolkLibraryLoad;
}
function renderStandeeLibrary(){
 const query=el('librarySearch').value.trim().toLowerCase();
 const available=[...standeeLibrary,...townsfolkLibrary];
 const entries=available.filter(item=>[item.name,item.folder,baseStandeeRole(item.token)].join(' ').toLowerCase().includes(query));
 catalogFolders(el('libraryList'),el('libraryFolders'),entries,item=>{
  const row=document.createElement('div'),name=document.createElement('strong');
  const place=fresh=>{
    exitTool();selected=null;
    tokenTool=libraryPlacement(item,fresh);
    el('footprint').value=standeeSizes[standeeSizeIndex(item.token)].id;
    el('standeeLibraryDialog').close();message('Click the map to place '+item.name+'.');refresh();
  };
  row.className='library-row';name.textContent=item.name;row.append(name,catalogButton('Place',()=>place(false)),catalogButton('Place as new',()=>place(true)));
  if(standeeLibrary.includes(item))row.append(
   catalogButton('Rename / move',()=>editCatalogEntry(item,next=>changeStandeeLibrary(standeeLibrary.map(entry=>entry===item?next:entry)))),
   catalogButton('Delete',()=>{if(confirm('Delete '+item.name+' from the library?'))changeStandeeLibrary(standeeLibrary.filter(entry=>entry!==item))}));
  return row;
 },[],path=>catalogButton('Place all',()=>{
  const members=available.filter(item=>item.folder===path||item.folder?.startsWith(path+'/')).map(item=>{
   const size=standeeSizes[standeeSizeIndex(item.token)];
   return {type:'standee',...libraryPlacement(item),size:size.footprint,sizeCategory:size.id};
  });
  exitTool();selected=null;tokenTool={folderMembers:members};
  el('standeeLibraryDialog').close();
  message('Click the map to place '+members.length+' standees. Esc cancels.');refresh();
 }));
 if(!entries.length)el('libraryList').textContent=query?'No matching standees.':'No saved standees.';
}
el('standeeLibrary').onclick=()=>{
 if(playing||roomProfile&&!roomProfile.gm)return;
 const picker=el('librarySource');picker.replaceChildren();
 tokens.forEach((token,i)=>{
  const option=document.createElement('option');option.value=i;option.textContent=libraryName(token);picker.append(option);
  if(token===selected)picker.value=i;
 });
 picker.disabled=el('librarySave').disabled=!tokens.length;
 renderStandeeLibrary();el('standeeLibraryDialog').showModal();
 if(!townsfolkLibrary.length)void loadTownsfolkLibrary().then(renderStandeeLibrary);
};
el('librarySearch').oninput=renderStandeeLibrary;
async function exportArtworkCatalog(statusId){
 if(roomProfile&&!roomProfile.gm)return;
 await workspaceLoad;
 if(roomProfile&&!roomProfile.gm)return;
 const entries=standeeLibrary.map(item=>{
  const t=item.token;
  const size=standeeSizes[standeeSizeIndex(t)];
  const template={type:'standee',name:item.name,displayName:item.name,role:baseStandeeRole(t),baseRole:baseStandeeRole(t),icon:t.icon,color:t.color,size:size.footprint,sizeCategory:size.id,activeLook:t.activeLook??0,looks:structuredClone(t.looks??[{...defaultStandeeLook(t),name:'Default',front:t.src||defaultStandeeLook(t).front}])};
  for(const k of ['facing','nameVisibility','ac','maxHp','saveDc','initiativeModifier','darkvision','blindsight','plannerCombat','plannerMonster'])if(t[k]!==undefined)template[k]=structuredClone(t[k]);
  template.hp=t.maxHp??t.hp??null;template.tempHp=0;template.conditions=[];template.controllerNames=[];template.manualTarget=false;template.incognito=false;template.flying=false;template.squad='';
  return {name:item.name,folder:item.folder||'',token:template};
 });
 const images=managedImages.filter(item=>typeof item.url==='string'&&item.url).map(item=>({name:item.name,folder:item.folder||'',url:item.url}));
 const catalog={format:'battlemap-artwork-catalog',version:2,generatedAt:new Date().toISOString(),instructions:'Reference catalog, not a scene. entries contains configured standee templates; images contains all uploaded Image Manager artwork, across every folder. For image-only creatures, create a valid standee using a reference scene and use the exact image url as looks[0].front; if no separate back is identified, use back equal to front and sameImage:true. Assign unique roomId and valid x/y/z. Do not invent URLs, monster stats or character associations from artwork alone. Artwork availability is not checked by this export.',entries,images};
 const url=URL.createObjectURL(new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='battlemap-artwork-catalog.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 el(statusId).textContent='Exported '+entries.length+' standee templates and '+images.length+' uploaded images.';
}
el('libraryExportCatalog').onclick=()=>exportArtworkCatalog('libraryStatus').catch(error=>{el('libraryStatus').textContent='Export failed: '+error.message});
el('libraryForm').onsubmit=e=>{
 e.preventDefault();
 const token=tokens[Number(el('librarySource').value)];
 if(token){
  registerSceneStandees(tokens,roomDraftTitle);
  changeStandeeLibrary([...standeeLibrary,{name:libraryName(token),folder:folderPath(el('libraryFolder').value),token:structuredClone(token)}]);
 }
};
const areaSizes={difficult:15,line:30,circle:20,square:30,cone:15,sphere:20,cube:30,cone3d:15};
const areaLabels={difficult:'Side (ft)',circle:'Radius (ft)',sphere:'Radius (ft)',square:'Side (ft)',cube:'Side (ft)'};
function areaAnchor([x,y,z]){
 const snap=el('areaSnap').checked;
 return [snap?Math.floor(x+1e-8)+.5:x,snap?Math.floor(y+1e-8)+.5:y,z];
}
function conePointAim(){
 return ['cone','cone3d'].includes(el('areaShape').value)&&el('coneAim').checked;
}
function coneAimPoint(x,y,start=false){
 const f=hit(x,y);
 if(!f?.standee&&!f?.shadow)return areaAnchor(measurePoint(x,y));
 const origin=basePoint(f.p);
 if(start&&f.p.size>1&&el("coneCenterOrigin").checked)origin[2]+=f.p.size/2;
 return origin;
}
function makeArea(x,y){
 const shape=el('areaShape').value,size=Math.max(5,Math.min(200,Math.round((Number(el('areaSize').value)||areaSizes[shape])/5)*5))/5;
 if(shape==='difficult')return {shape,size,origin:areaOrigin,angle:0};
 const aimed=conePointAim();
 const [u,v,z]=aimed?coneAimPoint(x,y):[...inverse(x,y,areaOrigin[2]),areaOrigin[2]];
 const dx=u-areaOrigin[0],dy=v-areaOrigin[1];
 const area={shape,size,origin:areaOrigin,angle:['square','cube'].includes(shape)?0:Math.atan2(dy,dx)};
 if(aimed&&shape==='cone3d')area.pitch=Math.atan2(z-areaOrigin[2],Math.hypot(dx,dy))*180/Math.PI;
 return area;
}
let coneCaster=null;
function placeArea(x,y){
 if(roomProfile?.gm===false&&(roomState.paused||playerAreaBusy))return;
 if(!areaOrigin){
  const start=hit(x,y);
  coneCaster=['cone','cone3d'].includes(el('areaShape').value)&&(start?.standee||start?.shadow)?start.p:null;
  if(el('areaShape').value==='difficult'&&!canEditDifficultTerrain())return;
  areaOrigin=el('areaShape').value==='difficult'?difficultPlacement(x,y,Number(el('areaSize').value)/5||3):conePointAim()?coneAimPoint(x,y,true):areaAnchor(measurePoint(x,y));
  areaPreview=makeArea(x,y);
  if(['circle','square','sphere','cube','difficult'].includes(areaPreview.shape)){
   if(areaPreview.shape==='difficult'&&!validDifficultTerrain(areaPreview)){areaOrigin=null;areaPreview=null;message('The full footprint needs support at this height.');draw();return}
   addPlacedArea(areaPreview);finishAreaPlacement();return;
  }
  message(conePointAim()?'Click the destination standee or map point to aim the cone.':'Point in the desired direction, then click to place the template.');draw();return;
 }
 if(conePointAim()&&coneAimPoint(x,y).every((v,i)=>v===areaOrigin[i])){message('Choose an end point different from the origin.');return}
 const placed=makeArea(x,y);
 addPlacedArea(placed);
 if(roomProfile?.gm!==false&&coneCaster&&tokens.includes(coneCaster)&&['cone','cone3d'].includes(placed.shape)){
  placed.anchorId=coneCaster.trackingId??=crypto.randomUUID();
  placed.anchorOffset=placed.origin.map((v,i)=>v-basePoint(coneCaster)[i]);
  faceHeading(coneCaster,placed.angle);
 }
 finishAreaPlacement();
}
function finishAreaPlacement(){
 areaMode=false;coneCaster=null;areaOrigin=null;areaPreview=null;
 message('Choose Areas to place another template.');refresh();
}
const areaLayer=document.createElement('canvas'),areaCtx=areaLayer.getContext('2d');
let playerAreaBusy=false;
async function changePlayerArea(action,area){
 if(playerAreaBusy||roomState.paused)return false;
 playerAreaBusy=true;
 try{
  await customizeRoomObject(area,action,action==='area_delete'?null:area);
  await pollRoom();
  return true;
 }catch(error){message(error.message);return false}
 finally{playerAreaBusy=false}
}
let pendingAreaSpell=null;
function armAreaSpell(area){
 if(!playing||area.shape==='difficult')return;
 const actor=coneCaster||selected;
 const caster=actor?.type==='standee'&&(roomProfile?.gm!==false||ownsRoomStandee(actor))
  ?actor.roomId||actor.trackingId:roomProfile?.gm===false?roomProfile.characterKey:null;
 area.roomId??=crypto.randomUUID();
 pendingAreaSpell={area,caster,scene:currentSceneId,ticket:roomProfile?.token};
}
function pendingSpellTemplate(){
 const pending=pendingAreaSpell;
 if(!pending||pending.scene!==currentSceneId||pending.ticket!==roomProfile?.token)return null;
 return areas.find(area=>area===pending.area||pending.area.roomId&&area.roomId===pending.area.roomId)||null;
}
function isPendingAreaTarget(token){
 const template=pendingSpellTemplate();
 return !!template&&!token.incognito&&!token.conditions?.includes('dead')&&areaCoversStandee(template,token);
}
function addPlacedArea(area){
 if(roomProfile?.gm===false){
  const draft={...area,roomId:crypto.randomUUID()};
  armAreaSpell(draft);
  changePlayerArea('area_create',draft).then(saved=>{
   if(pendingAreaSpell?.area!==draft)return;
   if(!saved)pendingAreaSpell=null;
   draw();
  });
 }else{remember();areas.push(area);armAreaSpell(area)}
}
let editingArea=null;
function difficultPlacement(x,y,length,width=length){
 const f=hit(x,y,null,true),z=f?.z??0;
 const [u,v]=inverse(x,y,z);
 return el('areaSnap').checked?[Math.floor(u)-Math.floor(length/2)+length/2,Math.floor(v)-Math.floor(width/2)+width/2,z]:[u,v,z];
}
function validDifficultTerrain(area,terrain=pieces){
 const bounds=difficultBounds(area),z=area.origin[2];
 if(z<0||bounds.some(([lo,hi],axis)=>lo<0||hi>gridLimit(axis)))return false;
 if(z===0)return true;
 const [[left,right],[top,bottom]]=bounds;
 for(let x=Math.floor(left);x<right;x++)for(let y=Math.floor(top);y<bottom;y++){
  if(!terrain.some(p=>{const [w,d,h]=dimensions(p);return p.z+h===z&&x>=p.x&&x<p.x+w&&y>=p.y&&y<p.y+d}))return false;
 }
 return true;
}
function difficultBounds(area){
 return [area.size,area.width??area.size].map((length,axis)=>[area.origin[axis]-length/2,area.origin[axis]+length/2]);
}
function difficultCorners(area){
 const [[left,right],[top,bottom]]=difficultBounds(area);
 return [[left,top],[right,top],[right,bottom],[left,bottom]];
}
function difficultEdge(x,y){
 for(const area of areas.toReversed()){
  if(area.shape!=='difficult')continue;
  const corners=difficultCorners(area).map(v=>point(...v,area.origin[2]));
  for(const [edge,[axis,side]] of [[1,0],[0,1],[1,1],[0,0]].entries()){
   const [ax,ay]=corners[edge],[bx,by]=corners[(edge+1)%4],dx=bx-ax,dy=by-ay;
   const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
   if(Math.hypot(x-ax-t*dx,y-ay-t*dy)<=7&&areaOriginVisible(area,x,y))return {area,axis,side};
  }
 }
 return null;
}
function resizeDifficultArea(area,axis,side,coordinate){
 const bounds=difficultBounds(area),[low,high]=bounds[axis],fixed=side?low:high;
 const distance=(side?1:-1)*(coordinate-fixed);
 const length=Math.max(1,Math.min(100,Math.round(distance)));
 const origin=[...area.origin];
 origin[axis]=fixed+(side?1:-1)*length/2;
 return {...area,origin,size:axis===0?length:area.size,width:axis===1?length:area.width??area.size};
}
function areaOutline(area){
 const {shape,size,origin,angle}=area;
 const c=Math.cos(angle),d=Math.sin(angle);
 let vertices;
 if(shape==='circle'||shape==='sphere')vertices=Array.from({length:48},(_,i)=>[size*Math.cos(i*Math.PI/24),size*Math.sin(i*Math.PI/24)]);
 else if(shape==='difficult')return difficultCorners(area).map(v=>point(...v,area.origin[2]));
 else if(shape==='square'||shape==='cube')vertices=[[-size/2,-size/2],[size/2,-size/2],[size/2,size/2],[-size/2,size/2]];
 else if(shape==='line')vertices=[[0,-.5],[size,-.5],[size,.5],[0,.5]];
 else vertices=[[0,0],[size,-size/2],[size,size/2]];
 return vertices.map(([u,v])=>point(origin[0]+u*c-v*d,origin[1]+u*d+v*c,origin[2]));
}
function areaOccluders(height){
 const masks=[];
 for(const f of faces){
  if(!f.p||!f.world||!f.world.some(v=>v[2]>height+1e-7))continue;
  const clipped=[];
  f.world.forEach((v,i)=>{
   const next=f.world[(i+1)%f.world.length];
   if(v[2]>=height)clipped.push(v);
   if((v[2]>=height)!==(next[2]>=height)){
    const t=(height-v[2])/(next[2]-v[2]);
    clipped.push(v.map((value,n)=>value+t*(next[n]-value)));
   }
  });
  if(clipped.length>=3)masks.push(clipped.map(v=>point(...v)));
 }
 return masks;
}
function areaPath(points){
 areaCtx.beginPath();
 points.forEach(([x,y],i)=>i?areaCtx.lineTo(x,y):areaCtx.moveTo(x,y));
 areaCtx.closePath();
}
function drawAreaTemplates(){
 if(!areas.length&&!areaPreview)return;
 if(areaLayer.width!==canvas.width||areaLayer.height!==canvas.height){
  areaLayer.width=canvas.width;areaLayer.height=canvas.height;
 }
 areaCtx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
 const masksByHeight=new Map();
 for(const item of areaPreview?[...areas,areaPreview]:areas){
  if(['appearance','room','opening','light','journal'].includes(item.shape))continue;
  const area=(item===drag?.area||item===drag?.resizeTerrain?.area)&&drag.preview?drag.preview:item===editingArea?editedAreaPreview():effectiveArea(item);
  if(playerFogEnabled()&&!fogPointVisible(area.origin))continue;
  const height=area.origin[2];
  if(!masksByHeight.has(height))masksByHeight.set(height,areaOccluders(height));
  areaCtx.clearRect(0,0,W,H);
  areaCtx.globalCompositeOperation='source-over';
  areaPath(areaOutline(area));
  areaCtx.fillStyle=area.shape==='difficult'?'#b980275e':'#9a4c4550';areaCtx.fill();
  areaCtx.strokeStyle='#16120f';areaCtx.lineWidth=5;areaCtx.stroke();
  areaCtx.strokeStyle=area.shape==='difficult'?'#ffdc78':'#fff2dd';areaCtx.lineWidth=2.5;areaCtx.stroke();
  areaCtx.globalCompositeOperation='destination-out';areaCtx.fillStyle='#000';
  for(const mask of masksByHeight.get(height)){areaPath(mask);areaCtx.fill()}
  if(area.shape==='difficult')for(const f of faces){
   if(!f.standee)continue;
   if(f.flat){
    const [x,y,r]=f.flat;
    areaCtx.beginPath();areaCtx.arc(x,y,r,0,Math.PI*2);areaCtx.fill();
    continue;
   }
   areaPath(f.projected);areaCtx.fill();
   const [left,right,base]=f.projected;
   areaCtx.beginPath();areaCtx.ellipse((left[0]+right[0])/2,base[1],f.baseWidth*.55,f.baseWidth*.22,0,0,Math.PI*2);areaCtx.fill();
  }
  ctx.drawImage(areaLayer,0,0,W,H);
  if(!topDown)drawAreaVolume(area);
  if(item!==areaPreview){
   const masks=masksByHeight.get(height);
   drawAreaOrigin(area,masks);
   if(area.shape==='difficult'&&canEditDifficultTerrain()){
    const corners=difficultCorners(area);
    ctx.save();ctx.fillStyle='#f4ce73';ctx.strokeStyle='#67421c';
    corners.forEach(([x,y],i)=>{const [u,v]=corners[(i+1)%4],[px,py]=point((x+u)/2,(y+v)/2,height);if(areaOriginVisible(area,px,py,masks)){ctx.fillRect(px-3,py-3,6,6);ctx.strokeRect(px-3,py-3,6,6)}});
    ctx.restore();
   }
  }
 }
}
function drawAreaVolume(area){
 const {shape,size,origin,angle}=area;
 if(!['sphere','cube','cone3d'].includes(shape))return;
 const [x,y,z]=origin,c=Math.cos(angle),d=Math.sin(angle);
 const pitch=(area.pitch||0)*Math.PI/180,cp=Math.cos(pitch),sp=Math.sin(pitch);
 const project=(u,v,w)=>{
  const forward=u*cp-w*sp;
  return point(x+forward*c-v*d,y+forward*d+v*c,z+u*sp+w*cp);
 };
 function wire(points){
  ctx.beginPath();
  points.forEach(([u,v,w],i)=>{const [px,py]=project(u,v,w);if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py)});
  if(area.auraColor){
   ctx.setLineDash([2,4]);ctx.strokeStyle=area.auraColor;ctx.lineWidth=2.5;ctx.stroke();
   return;
  }
  ctx.setLineDash([]);ctx.strokeStyle='#17120f';ctx.lineWidth=4;ctx.stroke();
  ctx.setLineDash([5,3]);ctx.strokeStyle='#fff2d8';ctx.lineWidth=2;ctx.stroke();
 }
 ctx.save();
 if(shape==='cube'){
  const h=size/2,corners=[[-h,-h],[h,-h],[h,h],[-h,h]];
  wire([...corners,corners[0]].map(([u,v])=>[u,v,size]));
  for(const [u,v] of corners)wire([[u,v,0],[u,v,size]]);
 }else if(shape==='sphere'){
  for(const axis of area.auraColor?(topDown?[2]:[0,1,2]):[0,1])wire(Array.from({length:49},(_,i)=>{
   const a=i*Math.PI/24,u=size*Math.cos(a),v=size*Math.sin(a);
   return axis===2?[u,v,0]:axis?[0,u,v]:[u,0,v];
  }));
 }else{
  const ring=Array.from({length:49},(_,i)=>[size,size*.5*Math.cos(i*Math.PI/24),size*.5*Math.sin(i*Math.PI/24)]);
  wire(ring);
  for(const i of [0,12,24,36])wire([[0,0,0],ring[i]]);
 }
 ctx.restore();
}
function areaOriginVisible(area,x,y,masks=areaOccluders(area.origin[2])){
 areaCtx.save();areaCtx.setTransform(1,0,0,1,0,0);
 const visible=!masks.some(mask=>{areaPath(mask);return areaCtx.isPointInPath(x,y)});
 areaCtx.restore();return visible;
}
function drawAreaOrigin(area,masks){
 const [x,y]=point(...area.origin);
 if(!areaOriginVisible(area,x,y,masks))return;
 ctx.save();ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);
 ctx.fillStyle='#f3e2b8';ctx.strokeStyle='#8c392e';ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
}
function hitAreaOrigin(x,y){
 return areas.findLast(area=>{
  if(!Object.hasOwn(areaSizes,area.shape))return false;
  area=effectiveArea(area);
  if(playerFogEnabled()&&!fogPointVisible(area.origin))return false;
  const [px,py]=point(...area.origin);
  return Math.hypot(x-px,y-py)<=9&&areaOriginVisible(area,px,py);
 });
}
function hitArea(x,y){
 const origin=hitAreaOrigin(x,y);if(origin)return origin;
 for(let i=areas.length-1;i>=0;i--){
  const area=effectiveArea(areas[i]);
  if(!Object.hasOwn(areaSizes,area.shape)||playerFogEnabled()&&!fogPointVisible(area.origin))continue;
  areaCtx.save();
  areaCtx.setTransform(1,0,0,1,0,0);
  areaPath(areaOutline(area));
  const inside=areaCtx.isPointInPath(x,y);
  const hidden=inside&&areaOccluders(area.origin[2]).some(mask=>{areaPath(mask);return areaCtx.isPointInPath(x,y)});
  areaCtx.restore();
  if(inside&&!hidden)return areas[i];
 }
 return null;
}
function editedAreaPreview(){
 const size=el('areaEditSize'),rotation=el('areaEditRotation');
 const next={...effectiveArea(editingArea),size:size.validity.valid?Number(size.value)/5:editingArea.size,
  angle:!rotation.disabled&&rotation.validity.valid?Number(rotation.value)*Math.PI/180:editingArea.angle};
 if(next.shape==='difficult')next.width=editingArea.width??editingArea.size;
 const altitude=el('areaAltitude'),pitch=el('areaPitch');
 if(!altitude.disabled&&altitude.validity.valid&&altitude.value!=='')next.origin=[...next.origin.slice(0,2),Number(altitude.value)/5];
 if(next.shape==='cone3d'&&pitch.validity.valid&&pitch.value!=='')next.pitch=Number(pitch.value);
 return next;
}
for(const [fieldId,sliderId] of [['areaEditSize','areaSizeSlider'],['areaEditRotation','areaRotationSlider'],['areaAltitude','areaAltitudeSlider'],['areaPitch','areaPitchSlider']]){
 const field=el(fieldId),slider=el(sliderId);
 field.oninput=()=>{if(field.validity.valid)slider.value=field.value;draw()};
 slider.oninput=()=>{field.value=slider.value;draw()};
}
function openAreaEditor(area,x,y){
 editingArea=area;
 el('areaEditSizeLabel').textContent=area.shape==='difficult'?'Length (ft)':areaLabels[area.shape]||'Length (ft)';
 el('areaEditSize').value=area.size*5;
 const degrees=Math.round(area.angle*180/Math.PI);
 el('areaEditRotation').value=(degrees%360+360)%360;
 el('areaEditRotation').disabled=['circle','sphere','difficult'].includes(area.shape);
 el('areaSizeSlider').value=el('areaEditSize').value;
 el('areaRotationSlider').value=el('areaEditRotation').value;
 el('areaRotationSlider').disabled=el('areaEditRotation').disabled;
 const cone=area.shape==='cone3d',hasAltitude=['cube','sphere','cone3d'].includes(area.shape);
 el('areaAltitudeLabel').textContent=({cube:'Base altitude (ft)',sphere:'Center altitude (ft)',cone3d:'Origin altitude (ft)'})[area.shape]||'Altitude (ft)';
 el('areaAltitudeControls').hidden=!hasAltitude;el('areaAltitude').disabled=!hasAltitude;
 el('areaPitchControls').hidden=!cone;el('areaPitch').disabled=!cone;
 el('areaAltitude').value=el('areaAltitudeSlider').value=Math.round(effectiveArea(area).origin[2]*5);
 el('areaPitch').value=el('areaPitchSlider').value=area.pitch??0;
 const dialog=el('areaEditDialog');
 dialog.showModal();
 const {width,height}=dialog.getBoundingClientRect();
 const left=x+8+width<=innerWidth-8?x+8:x-8-width;
 const top=y+8+height<=innerHeight-8?y+8:y-8-height;
 dialog.style.left=Math.max(8,Math.min(left,innerWidth-width-8))+'px';
 dialog.style.top=Math.max(8,Math.min(top,innerHeight-height-8))+'px';
}
el('areaEditDelete').onclick=async()=>{
 if(!editingArea||!canEditArea(editingArea))return;
 if(roomProfile?.gm===false){if(!await changePlayerArea('area_delete',editingArea))return}
 else{remember();areas=areas.filter(area=>area!==editingArea)}
 el('areaEditDialog').close();refresh();
};
el('areaEditCancel').onclick=()=>el('areaEditDialog').close();
el('areaEditDialog').onclose=()=>{editingArea=null;draw()};
el('areaEditForm').onsubmit=async e=>{
 e.preventDefault();
 if(!editingArea||!canEditArea(editingArea))return;
 const preview=editedAreaPreview();
 if(preview.shape==='difficult'&&!validDifficultTerrain(preview)){message('The full footprint needs support at this height.');return}
 if(preview.anchorId){const caster=tokens.find(t=>t.trackingId===preview.anchorId);if(caster)preview.anchorOffset=preview.origin.map((v,i)=>v-basePoint(caster)[i])}
 if(roomProfile?.gm===false){if(!await changePlayerArea('area_update',{...editingArea,...preview}))return}
 else{remember();Object.assign(editingArea,preview)}
 armAreaSpell(editingArea);
 el('areaEditDialog').close();
 refresh();
};
el('areaTool').onclick=()=>{
 if(roomProfile?.gm===false&&roomState.paused)return;
 const next=!areaMode;exitTool();areaMode=next;
 if(next)message('Choose an area shape and size, then click the map.');
 refresh();
 if(next){
  const panel=el('areaOptions');
  panel.style.marginLeft='0px';
  const overflow=panel.getBoundingClientRect().right-innerWidth+8;
  panel.style.marginLeft=-Math.max(0,overflow)+'px';
 }
};
el('areaShape').onchange=()=>{
 const shape=el('areaShape').value;
 el('areaSize').value=areaSizes[shape];
 el('areaSizeLabel').textContent=areaLabels[shape]||'Length (ft)';
 areaOrigin=null;areaPreview=null;refresh();
};
el('coneAim').onchange=el('coneCenterOrigin').onchange=()=>{areaOrigin=null;areaPreview=null;refresh()};
for(const option of el('areaShape').options){
 const button=catalogButton(option.textContent,()=>{
  el('areaShape').value=option.value;
  el('areaShape').onchange();
 });
 button.dataset.shape=option.value;
 el('areaChoices').append(button);
}
el('clearAreas').onclick=async()=>{
 const removable=areas.filter(canEditArea);
 if(!removable.length)return;
 if(roomProfile?.gm===false){
  for(const area of removable)if(!await changePlayerArea('area_delete',area))break;
 }else{remember();areas=areas.filter(area=>!removable.includes(area))}
 refresh();
};
const buildCategory=el('buildCategory');
const buildCategoryHeader=el('buildCategoryHeader');
function positionBuildCategory(left,top){
 const {width,height}=buildCategory.getBoundingClientRect();
 Object.assign(buildCategory.style,{position:'fixed',margin:'0',right:'auto',bottom:'auto',
  left:Math.max(0,Math.min(innerWidth-width,left))+'px',
  top:Math.max(0,Math.min(innerHeight-height,top))+'px'});
}
let buildCategoryDrag=null;
buildCategoryHeader.onpointerdown=e=>{
 if(e.button!==0||!e.isPrimary||e.target.closest('button'))return;
 const {left,top}=buildCategory.getBoundingClientRect();
 buildCategoryDrag={id:e.pointerId,x:e.clientX-left,y:e.clientY-top};
 buildCategoryHeader.setPointerCapture(e.pointerId);
 e.preventDefault();
};
buildCategoryHeader.onpointermove=e=>{
 if(buildCategoryDrag?.id!==e.pointerId)return;
 positionBuildCategory(e.clientX-buildCategoryDrag.x,e.clientY-buildCategoryDrag.y);
};
buildCategoryHeader.onlostpointercapture=()=>{buildCategoryDrag=null};
function keepBuildCategoryVisible(){
 if(buildCategory.open&&buildCategory.style.left)
  positionBuildCategory(parseFloat(buildCategory.style.left),parseFloat(buildCategory.style.top));
}
window.addEventListener('resize',keepBuildCategoryVisible);
for(const button of el('buildTools').querySelectorAll('[data-build-category]')){
 button.onclick=()=>{
  buildCategory.dataset.category=button.dataset.buildCategory;
  el('buildCategoryTitle').textContent=button.textContent;
  for(const content of buildCategory.querySelectorAll('[data-build-content]')){
   content.hidden=content.dataset.buildContent!==button.dataset.buildCategory;
   if(!content.hidden)for(const details of content.querySelectorAll('details'))details.open=true;
  }
  el('fogOfWar').checked=areas.some(area=>area.shape==='appearance'&&area.appearance?.fogOfWar===true);
  el('fogStatus').textContent='';
  if(!buildCategory.open)buildCategory.show();
  keepBuildCategoryVisible();
 };
}
el('buildCategoryClose').onclick=()=>buildCategory.close();
buildCategory.onkeydown=e=>{if(e.key==='Escape')buildCategory.close()};
let journalPlacing=false,journalDraft=null,journalMoving=null;
const journalDialog=el('journalDialog');
const journalSymbols=[...Array.from({length:21},(_,i)=>String(i)),
 '★','⚔','☠','👑','🚪','🔒','🔑','💎','📜','🧩','❓','!','👁','🕯','🔥','💧','🌿','🕸','🪤','🌀'];
for(const symbol of journalSymbols)el('journalMarker').add(new Option(symbol,symbol));
function canUseJournal(){return roomProfile?.gm!==false}
el('journalPlace').onclick=()=>{
 if(!canUseJournal())return;
 exitTool();journalPlacing=true;message('Click the map to place a journal pin.');refresh();
};
function drawJournalPins(){
 const layer=el('journalPins');
 layer.replaceChildren();
 if(!canUseJournal())return;
 for(const pin of areas.filter(area=>area.shape==='journal')){
  const [x,y]=point(...pin.origin);
  if(x<0||y<0||x>W||y>H)continue;
  const button=catalogButton(pin.marker||'•',()=>editJournalPin(pin));
  button.style.left=x+'px';button.style.top=y+'px';
  button.title=pin.title||'Journal pin';
  button.setAttribute('aria-label',button.title);
  layer.append(button);
 }
}
function editJournalPin(pin){
 if(!canUseJournal())return;
 journalDraft={pin,node:pin.node,image:pin.image};
 renderManagedPin();
 el('journalTitle').value=pin.title||'';
 el('journalNotes').value=pin.notes||'';
 el('journalMarker').value=pin.marker||'1';
 el('journalSearch').value='';
 el('journalStatus').textContent='';
 el('journalResults').replaceChildren();
 el('journalDelete').hidden=el('journalMove').hidden=!areas.includes(pin);
 renderJournalNode();
 journalDialog.showModal();
}
function renderJournalNode(){
 const node=journalDraft?.node;
 const text=node?[node.title,node.summary,...Object.entries(node.fields||{}).filter(([,value])=>typeof value==='string'&&value).map(([key,value])=>key+'  '+value)].filter(Boolean).join('\n\n'):'';
 el('journalContent').textContent=text;
 const rolls=el('journalRolls');
 rolls.replaceChildren();
 const source=[text,el('journalNotes').value,node?JSON.stringify(node.fields||{}):''].join(' ');
 const formulas=new Set((source.match(/\b\d+d\d+(?:\s*[+-]\s*\d+)?\b/gi)||[]).map(value=>value.replace(/\s/g,'')));
 for(const formula of formulas)rolls.append(catalogButton('Roll '+formula,()=>{
  const roll=chatRoll(formula);
  el('journalStatus').textContent=roll?roll.formula+' → '+roll.total:'Unsupported dice formula.';
 }));
}
el('journalNotes').oninput=renderJournalNode;
el('journalFind').onclick=async()=>{
 const draft=journalDraft,query=el('journalSearch').value.trim().toLowerCase();
 if(!draft||!query||!canUseJournal())return;
 const results=el('journalResults');
 results.replaceChildren();
 el('journalStatus').textContent='Searching…';
 try{
  const auth=JSON.parse(sessionStorage.getItem('rq_auth')||localStorage.getItem('rq_auth')||'null');
  if(!auth?.access_token)throw Error('Sign in to Session Planner Canvas, then retry.');
  const headers={apikey:roomKey,Authorization:'Bearer '+auth.access_token};
  const groups=await Promise.all(['sessions','arcs','campaigns'].map(async table=>{
   const rows=[];
   for(let offset=0;;offset+=100){
    const url=new URL('/rest/v1/'+table,roomApi);
    url.search=new URLSearchParams({select:table==='sessions'?'id,title,blocks':'id,name,blocks',order:'id',limit:'100',offset:String(offset)});
    const response=await fetch(url,{headers});
    if(!response.ok)throw Error('Planner search failed. Check your planner sign-in.');
    const page=await response.json();
    rows.push(...page);
    if(page.length<100)break;
   }
   return rows;
  }));
  if(journalDraft!==draft)return;
  const found=groups.flat().flatMap(row=>(row.blocks?.nodes||[]).map(node=>({node,source:row.title||row.name})))
   .filter(({node})=>[node.title,node.summary,JSON.stringify(node.fields||{})].join(' ').toLowerCase().includes(query)).slice(0,30);
  for(const {node,source} of found)results.append(catalogButton([node.title||'Untitled node',source].filter(Boolean).join(' · '),()=>{
   draft.node=node;
   if(!el('journalTitle').value)el('journalTitle').value=node.title||'';
   results.replaceChildren();renderJournalNode();
  }));
  el('journalStatus').textContent=found.length?found.length+' results':'No matching nodes.';
 }catch(error){if(journalDraft===draft)el('journalStatus').textContent=error.message}
};
el('journalForm').onsubmit=e=>{
 e.preventDefault();
 if(!journalDraft||!canUseJournal())return;
 const {pin,node,image}=journalDraft;
 remember();
 if(image)pin.image=image;else delete pin.image;
 Object.assign(pin,{marker:el('journalMarker').value,title:el('journalTitle').value,notes:el('journalNotes').value,node});
 if(!areas.includes(pin))areas.push(pin);
 journalDialog.close();refresh();
};
el('journalDelete').onclick=()=>{
 if(!journalDraft||!canUseJournal())return;
 remember();areas=areas.filter(area=>area!==journalDraft.pin);
 journalDialog.close();refresh();
};
el('journalMove').onclick=()=>{
 const pin=journalDraft?.pin;
 if(!pin||!canUseJournal()||!areas.includes(pin))return;
 journalDialog.close();exitTool();journalMoving=pin;journalPlacing=true;
 message('Click a new location for the pin. Esc cancels.');refresh();
};
el('journalCancel').onclick=()=>journalDialog.close();
journalDialog.onclose=()=>{journalDraft=null};
const detachedPanels=new Map();
const panelKeys=['rolls','initiative'];
const panelPlacement={rolls:{},initiative:{}};
function windowBounds(win){
 return {left:win.screenX,top:win.screenY,width:win.outerWidth,height:win.outerHeight};
}
function savePanelView(){
 const panels={};
 for(const key of panelKeys){
  const detached=detachedPanels.get(key);
  if(detached&&!detached.win.closed)Object.assign(panelPlacement[key],windowBounds(detached.win),{detached:true});
  panels[key]={...panelPlacement[key],open:panelIsDetached(key)||!el(key+'Panel').hidden};
 }
 return {panels,markerSize:preferences.markerSize,markerColor:preferences.markerColor};
}
function restorePanelView(view){
 if(!view||typeof view!=='object')return;
 for(const key of panelKeys){
  const saved=view.panels?.[key];
  if(!saved||typeof saved.open!=='boolean')continue;
  const current=detachedPanels.get(key);
  if(current){detachedPanels.delete(key);current.observer.disconnect();current.win.close()}
  const placement={detached:saved.detached===true};
  for(const field of ['left','top','width','height'])if(Number.isFinite(saved[field]))placement[field]=Math.round(saved[field]);
  panelPlacement[key]=placement;
  el(key+'Popout').textContent=placement.detached?'Reopen window':'Pop out';
  if(key==='rolls')showRolls(saved.open);else showInitiative(saved.open);
 }
 if(Number.isFinite(view.markerSize)&&view.markerSize>=50&&view.markerSize<=200){
  preferences.markerSize=view.markerSize;el('markerSize').value=view.markerSize;el('markerSizeValue').textContent=view.markerSize+'%';
 }
 if(typeof view.markerColor==='string'&&/^#[0-9a-f]{6}$/i.test(view.markerColor)){
  preferences.markerColor=view.markerColor;el('markerColor').value=view.markerColor;
 }
}
setInterval(()=>{
 for(const [key,{win}] of detachedPanels){
  if(win.closed)continue;
  const bounds=windowBounds(win);
  if(Object.keys(bounds).some(field=>bounds[field]!==panelPlacement[key][field])){
   Object.assign(panelPlacement[key],bounds);queueRecovery();
  }
 }
},2000);

function panelIsDetached(key){
 const entry=detachedPanels.get(key);
 return !!entry&&!entry.win.closed;
}
function detachPanel(key,title,laptop=false){
 const existing=detachedPanels.get(key);
 if(existing&&!existing.win.closed){existing.win.focus();return}
 const placement=panelPlacement[key];
 const width=Math.max(280,Math.min(2000,placement.width||430));
 const height=Math.max(240,Math.min(1600,placement.height||680));
 const coordinates=['left','top'].filter(field=>Number.isFinite(placement[field])).map(field=>field+'='+placement[field]);
 const win=window.open('','_blank',['popup','width='+width,'height='+height,...coordinates].join(','));
 if(!win){message('Allow pop-ups for this site to open '+title+' in a separate window.');return}
 const source=el(key+'Panel'),doc=win.document;
 doc.title=title+' · Battlemap Studio';
 doc.documentElement.lang='en';
 const viewport=doc.createElement('meta');
 viewport.name='viewport';viewport.content='width=device-width, initial-scale=1';doc.head.append(viewport);
 const css=doc.createElement('style');
 css.textContent=[...document.querySelectorAll('style')].map(node=>node.textContent).join('\n')+
  '\nbody{display:block;height:auto;min-height:100dvh;padding:10px}#rollsPanel,#initiativePanel{position:static;width:100%;max-height:none;margin:0}#rollsPanel{height:calc(100dvh - 66px);bottom:auto}.detached-return{margin-bottom:8px}';
 doc.head.append(css);
 const dock=doc.createElement('button');dock.className='detached-return';dock.textContent='Return to map';
 dock.onclick=()=>win.close();
 const host=doc.createElement('div');
 doc.body.replaceChildren(dock,host);
 doc.body.classList.toggle('dm-laptop',laptop);
 let spaceHeld=false;
 win.addEventListener('pointerdown',fadeFocusedTitle,true);
 win.addEventListener('wheel',fadeFocusedTitle,true);
 if(key==='initiative'){
  win.addEventListener('keydown',e=>{
   if(e.code!=='Space'||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,textarea,select,[contenteditable]'))return;
   spaceHeld=true;
   if(!e.target?.closest?.('button,a,[role=button]'))e.preventDefault();
  });
  win.addEventListener('keyup',e=>{if(e.code==='Space')spaceHeld=false});
  win.addEventListener('blur',()=>{spaceHeld=false});
 }
 let closePanelOnExit=false;
 function sync(){
  if(win.closed)return;
  const scroll=win.scrollY;
  const oldFeed=host.querySelector('#rollsFeed');
  const feedTop=oldFeed?.scrollTop??0;
  const atBottom=!oldFeed||oldFeed.scrollHeight-oldFeed.clientHeight-feedTop<35;
  const draft=host.querySelector('#chatInput'),audience=host.querySelector('#chatAudience');
  const focused=draft&&doc.activeElement===draft;
  const activeFilter=chatFilterIds.includes(doc.activeElement?.id)?doc.activeElement:null;
  const clone=source.cloneNode(true);
  if(key==='rolls'){
   for(const id of chatFilterIds){
    const control=clone.querySelector('#'+id),original=el(id);
    control.value=original.value;
    control.addEventListener(id==='chatFilterSearch'?'input':'change',()=>{
     original.value=control.value;applyChatFilters();
    });
   }
   const input=clone.querySelector('#chatInput'),select=clone.querySelector('#chatAudience');
   if(draft)input.value=draft.value;
   if(audience)select.value=audience.value;
   clone.querySelector('#chatComposer').onsubmit=async e=>{
    e.preventDefault();
    const value=input.value,sent=await submitChatDraft(value,select.value);
    const currentInput=host.querySelector('#chatInput');
    if(sent&&currentInput?.value===value)currentInput.value='';
    const status=host.querySelector('#chatError');
    if(status)status.textContent=el('chatError').textContent;
   };
  }
  clone.hidden=false;
  const originalButtons=[...source.querySelectorAll('button')];
  clone.querySelectorAll('button').forEach((button,i)=>{
   if(button.id===key+'Popout'){button.remove();return}
   if(button.id===key+'Close'){button.onclick=()=>{closePanelOnExit=true;win.close()};return}
   if(button.dataset.chatDie){button.onclick=()=>postChat('/roll 1d'+button.dataset.chatDie,clone.querySelector('#chatAudience').value);return}
   if(key==='initiative'||button.type!=='submit'){
    const original=originalButtons[i];
    button.onclick=e=>{
     e.preventDefault();e.stopPropagation();
     if(original?.isConnected)original.click();
     sync();
    };
   }
  });
  const names=[...source.querySelectorAll('[data-initiative-name]')];
  clone.querySelectorAll('[data-initiative-name]').forEach((label,i)=>{
   label.onclick=e=>{
    if(!spaceHeld)return;
    e.preventDefault();
    names[i]?.onclick(e,true);
   };
  });
  const originals=[...source.querySelectorAll('details')];
  clone.querySelectorAll('details').forEach((details,i)=>details.ontoggle=()=>{if(details.isConnected&&originals[i]?.isConnected)originals[i].open=details.open});
  host.replaceChildren(clone);
  if(focused){const input=clone.querySelector('#chatInput');input.focus({preventScroll:true});input.setSelectionRange(draft.selectionStart,draft.selectionEnd)}
  if(activeFilter){
   const control=clone.querySelector('#'+activeFilter.id);control?.focus({preventScroll:true});
   if(control?.type==='search')control.setSelectionRange(activeFilter.selectionStart,activeFilter.selectionEnd);
  }
  const feed=clone.querySelector('#rollsFeed');
  if(feed)feed.scrollTop=atBottom?feed.scrollHeight:feedTop;
  win.scrollTo(0,scroll);
 }
 const observer=new MutationObserver(sync);
 observer.observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','aria-current','hidden']});
 detachedPanels.set(key,{win,observer,syncChatFilters(){
  for(const id of chatFilterIds){const control=host.querySelector('#'+id);if(control)control.value=el(id).value}
 }});
 Object.assign(panelPlacement[key],windowBounds(win),{detached:true});
 queueRecovery();
 source.hidden=true;
 sync();
 win.addEventListener('pagehide',()=>{
  observer.disconnect();
  if(detachedPanels.get(key)?.win!==win)return;
  detachedPanels.delete(key);
  panelPlacement[key].detached=false;el(key+'Popout').textContent='Pop out';
  if(key==='rolls')showRolls(!closePanelOnExit);else showInitiative(!closePanelOnExit);
 },{once:true});
 return win;
}
el('rollsClose').onclick=()=>showRolls(false);
el('initiativeClose').onclick=()=>showInitiative(false);
el('rollsPopout').onclick=()=>detachPanel('rolls','Chat');
el('initiativePopout').onclick=()=>detachPanel('initiative','Initiative');
window.addEventListener('pagehide',()=>{
 const openPanels=[...detachedPanels.values()];
 detachedPanels.clear();
 for(const {win,observer} of openPanels){observer.disconnect();if(!win.closed)win.close()}
});
let facingTarget=null,pathKey='w';
const pathChoices='abcdefghijklmnopqstuvwxyz';
try{
 const saved=localStorage.getItem('battlemap.pathKey');
 if(saved?.length===1&&pathChoices.includes(saved))pathKey=saved;
}catch{}
const pathKeySelect=el('pathKey');
for(const key of pathChoices){
 const option=document.createElement('option');option.value=key;option.textContent=key.toUpperCase();pathKeySelect.append(option);
}
pathKeySelect.value=pathKey;
function pathLabel(){return pathKey.toUpperCase()}
function refreshPathLabels(){
 el('waypoint').textContent='Path ('+pathLabel()+')';
 el('playHelp').querySelector('p').textContent='Drag a standee to move it. Hold '+pathLabel()+' and click to add waypoints. Click to pause, then tap '+pathLabel()+' to resume. Use ✓ or × to finish.';
}
pathKeySelect.onchange=()=>{
 pathKey=pathKeySelect.value;pathHeld=false;pathUsed=false;
 try{localStorage.setItem('battlemap.pathKey',pathKey)}catch{}
 refreshPathLabels();
};
refreshPathLabels();
function armFacingTarget(token){
 if(!token)return;
 facingTarget=token;
 message('Click another standee to target it. Esc cancels.');
 refresh();
}
async function applyFacingTarget(hitFace){
 const actor=facingTarget,target=hitFace?.p;
 if(!tokens.includes(actor)){facingTarget=null;message('Select a standee first.');refresh();return}
 if(target?.type!=='standee'||target===actor){message('Click another standee to target it.');return}
 if(roomProfile?.gm===false){
  if(!ownsRoomStandee(actor)||standeeHidden(target)||!target.roomId)return;
  try{await customizeRoomObject(actor,'target',target.roomId);facingTarget=null;await pollRoom();message('Target set.');refresh();}
  catch(err){message(err.message)}
  return;
 }
 delete actor.targetRoomId;
 remember();
 actor.trackingId??=crypto.randomUUID();
 target.trackingId??=crypto.randomUUID();
 actor.targetId=target.trackingId;
 const facing=trackingFacing(actor);
 if(facing!==undefined)actor.facing=facing;
 if(carry?.piece===actor&&ghost){ghost.targetId=actor.targetId;ghost.facing=actor.facing}
 facingTarget=null;message('Target set. The standee will keep facing it.');refresh();
}
el('moveFaceToward').onclick=()=>armFacingTarget(carry?.piece);
el('selectedFaceToward').onclick=()=>armFacingTarget(selected);
el('terrainLock').onchange=()=>{
 terrainLocked=el('terrainLock').checked;
 if(terrainLocked){
  tool=null;brush=null;group.clear();
  if(selected&&selected.type!=='standee')selected=null;
  if(!carry&&!tokenTool)ghost=null;
  if(drag?.piece?.type!=='standee')drag=null;
 }
 try{localStorage.setItem('battlemap.terrainLocked',String(terrainLocked))}catch{}
 void storeValue('battlemap.terrainLockPreference',terrainLocked);queueWorkspacePreferences();
 message(terrainLocked?'Terrain locked. Standees are still editable.':'Terrain unlocked.');
 refresh();
};
let standeeClipboard=null,standeePastePoint=null;
function optionalNumber(id){
 const value=el(id).value;
 return value===''?null:Number(value);
}
function openStandeePaste(){
 if(!pointer){message('Point at the map to paste the standee.');return}
 standeePastePoint=pointer.slice();
 el('standeePasteMode').value='individual';
 el('standeePasteHint').textContent='Choose how the new standee handles initiative and HP.';
 el('standeePasteDialog').showModal();
}
function assignStandeeInitiative(source,clone,mode){
 const existing=initiativeEntries.get(source.initiativeKey);
 const modifier=source.initiativeModifier??existing?.modifier??null;
 const roll=()=>1+Math.floor(Math.random()*20)+(modifier??0);
 const name=source.displayName||source.name||'Standee';
 if(mode==='individual'||mode==='true'){
  if(mode==='individual'||existing){
   clone.initiativeKey=crypto.randomUUID();
   initiativeEntries.set(clone.initiativeKey,{name:name+' (copy)',total:mode==='true'?existing.total:roll(),modifier});
  }
  return;
 }
 const key=source.initiativeKey||crypto.randomUUID();
 source.initiativeKey=clone.initiativeKey=key;
 if(!existing)initiativeEntries.set(key,{name,total:roll(),modifier});
}
el('standeePasteCancel').onclick=()=>el('standeePasteDialog').close();
el('standeePasteForm').onsubmit=e=>{
 e.preventDefault();
 if(!standeeClipboard||!standeePastePoint)return;
 const mode=el('standeePasteMode').value;
 const source=tokens.includes(standeeClipboard.source)?standeeClipboard.source:
  tokens.find(t=>t.trackingId&&t.trackingId===standeeClipboard.template.trackingId);
 const original=source||standeeClipboard.template;
 const error=message=>el('standeePasteHint').textContent=message;
 if(['shared','split','life'].includes(mode)&&!source){error('The original standee must still be on this map.');return}
 if(mode==='split'&&(original.hp==null||original.hpPoolId)){error('Split stats needs current HP and an unlinked original.');return}
 if(mode==='life'&&original.hp==null){error('Set current HP on the original before linking its pool.');return}
 const [x,y,z]=measurePoint(...standeePastePoint);
 const clone={...structuredClone(original),x:Math.floor(x+1e-8),y:Math.floor(y+1e-8),z:original.flying?original.z:Math.round(z),trackingId:crypto.randomUUID()};
 clone.ownerStandeeId=original.roomId||original.characterRoomId||original.ownerStandeeId;
 delete clone.targetId;delete clone.initiativeKey;delete clone.hpPoolId;delete clone.roomId;delete clone.characterRoomId;delete clone.controllerNames;
 if(!valid(clone,[...pieces,...tokens],null)){error('The standee does not fit there. Cancel and point at another square.');return}
 remember(true);
 if(mode==='individual'||mode==='shared')clone.hp=clone.maxHp??null;
 if(mode==='split'){clone.hp=Math.floor(source.hp/2);source.hp-=clone.hp}
 if(mode==='life'){source.hpPoolId??=crypto.randomUUID();clone.hpPoolId=source.hpPoolId}
 assignStandeeInitiative(original,clone,mode);
 tokens.push(clone);
 if(clone.initiativeKey)publishInitiative();
 el('standeePasteDialog').close();
 message('Standee pasted.');refresh();
};
let hudToken=null;
let hudDisplayPreferences={};
try{hudDisplayPreferences=JSON.parse(localStorage.getItem('battlemap.hudDisplay')||'{}')||{}}catch{}
function hudDisplayKey(token){return token.roomId||token.trackingId||libraryName(token)}
function hudDisplays(token,key){return hudDisplayPreferences[hudDisplayKey(token)]?.[key]!==false}
function saveHudDisplay(token,display){
 hudDisplayPreferences[hudDisplayKey(token)]=display;
 try{localStorage.setItem('battlemap.hudDisplay',JSON.stringify(hudDisplayPreferences))}catch{}
}
function standeeVision(token){
 return token.conditions?.includes('blinded')?'blind':token.darkvision>0?'dark':'regular';
}
let hudConditionToken=null;
el('hudConditions').onclick=()=>{
 hudConditionToken=hudToken;
 if(!hudConditionToken)return;
 const readOnly=roomProfile?.gm===false&&!ownsRoomStandee(hudConditionToken),list=el('hudConditionList');
 list.replaceChildren();el('hudConditionError').textContent='';
 for(const condition of Object.keys(standeeConditions)){
  if(condition==='red'||condition==='violet')continue;
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.value=condition;input.checked=hudConditionToken.conditions?.includes(condition)||false;input.disabled=readOnly;
  label.append(input,' '+condition);list.append(label,document.createElement('br'));
 }
 el('hudConditionSave').hidden=readOnly;
 el('hudConditionsDialog').showModal();
};
el('hudConditionClose').onclick=()=>el('hudConditionsDialog').close();
el('hudConditionsForm').onsubmit=async e=>{
 e.preventDefault();
 const token=hudConditionToken;
 if(!tokens.includes(token))return;
 const checked=[...el('hudConditionList').querySelectorAll('input:checked')].map(input=>input.value);
 if(roomProfile?.gm===false){
  if(!ownsRoomStandee(token))return;
  el('hudConditionSave').disabled=true;
  try{
   await customizeRoomObject(token,'conditions',checked);
   await pollRoom();
  }catch(error){el('hudConditionError').textContent=error.message;return}
  finally{el('hudConditionSave').disabled=false}
 }else{
  remember();
  token.conditions=[...(token.conditions||[]).filter(value=>value==='red'||value==='violet'||!Object.hasOwn(standeeConditions,value)),...checked];
  el('hudVision').closest('fieldset').hidden=hudTorchOnly;
 el('hudConditions').hidden=hudTorchOnly;
 el('hudVision').value=standeeVision(token);el('hudVision').onchange();
 }
 el('hudConditionsDialog').close();refresh();
};
el('hudVision').onchange=()=>{el('hudVisionRange').hidden=el('hudVision').value!=='dark'};
const hudFields={hudHp:'hp',hudTempHp:'tempHp',hudDc:'saveDc',hudAc:'ac'};
async function customizeRoomObject(object,action,value){
 if(playerScenePaused())throw Error('The scene is paused.');
 if(roomProfile?.gm&&['arcane_eye','arcane_eye_move'].includes(action))return roomRpc('gm_eye',{ticket:roomProfile.token,object_id:object.roomId,action,value});
 return roomRpc('customize',{ticket:roomProfile.token,object_id:object.roomId,action,value,expected_revision:roomRevision});
}
let hudResizing=false;
function updateHudSize(token){
 const index=standeeSizeIndex(token),{name,footprint}=standeeSizes[index];
 el('hudSizeValue').textContent=name+' · '+footprint+' × '+footprint;
 el('hudShrink').disabled=hudResizing||roomState.paused||index===0;
 el('hudGrow').disabled=hudResizing||roomState.paused||index===standeeSizes.length-1;
}
for(const [id,step] of [['hudShrink',-1],['hudGrow',1]])el(id).onclick=async()=>{
 const token=hudToken;
 if(roomProfile?.gm!==false||!ownsRoomStandee(token)||roomState.paused||hudResizing)return;
 const size=standeeSizes[standeeSizeIndex(token)+step];
 if(!size)return;
 const profile=roomProfile,sceneId=roomState.sceneId,viewedScene=requestedRoomScene;
 const resize=async current=>{
  const position=size.footprint===current.size?current:
   resizedStandeePosition(current,{...current,size:size.footprint},[...pieces,...tokens]);
  if(!position)throw Error('That size does not fit here.');
  await customizeRoomObject(current,'standee_size',{category:size.id,x:position.x,y:position.y});
 };
 hudResizing=true;updateHudSize(token);
 el('standeeHudStatus').textContent='';
 try{
  try{await resize(token)}
  catch(error){
   if(error.kind!=='conflict')throw error;
   const pendingPoll=roomPollTask;
   if(pendingPoll)await pendingPoll;
   const synced=await pollRoom();
   const current=tokens.find(candidate=>candidate.roomId===token.roomId);
   if(!synced||roomProfile!==profile||roomState.sceneId!==sceneId||
    requestedRoomScene!==viewedScene||roomState.paused||!ownsRoomStandee(current))throw error;
   if(standeeSizes[standeeSizeIndex(current)].id!==size.id)await resize(current);
  }
  await pollRoom();
 }
 catch(error){
  if(roomProfile===profile&&roomState.sceneId===sceneId&&hudToken?.roomId===token.roomId)
   el('standeeHudStatus').textContent=error.message;
 }
 finally{hudResizing=false;if(hudToken)updateHudSize(hudToken)}
};
el('hudLooks').onclick=()=>{const token=hudToken;if(token&&(roomProfile?.gm!==false||ownsRoomStandee(token))){closeStandeeHud();openStandeeArt(token)}};
el('hudRange').onclick=async()=>{
 const token=hudToken,bright=el('hudBright').valueAsNumber,dim=el('hudDim').valueAsNumber;
 if(!token||roomProfile?.gm===false&&!ownsRoomStandee(token))return;
 if(!Number.isFinite(bright)||!Number.isFinite(dim)||bright<0||dim<bright||dim>120){
  el('standeeHudStatus').textContent='Enter a bright radius and a total dim radius up to 120 ft.';return;
 }
 try{if(roomProfile?.gm===false){await customizeRoomObject(token,'torch_range',{bright,dim});await pollRoom()}else{remember();Object.assign(token,{torchBright:bright,torchDim:dim});openStandeeHud(token);refresh()}}
 catch(err){el('standeeHudStatus').textContent=err.message}
};
el('hudDrop').onclick=async()=>{
 const token=hudToken;
 if(!ownsRoomStandee(token)||!(token.torch||token.carriedDrop))return;
 try{await customizeRoomObject(token,'torch_drop',true);await pollRoom()}
 catch(err){el('standeeHudStatus').textContent=err.message}
};
el('hudTorchColor').onchange=async e=>{
 const token=hudToken;
 if(!token||roomProfile?.gm===false&&!ownsRoomStandee(token))return;
 try{if(roomProfile?.gm===false){await customizeRoomObject(token,'torch_color',e.target.value);await pollRoom()}else{remember();Object.assign(token,{torchColor:e.target.value});openStandeeHud(token);refresh()}}
 catch(err){message(err.message);e.target.value=token.torchColor||'#ffcc80';await pollRoom()}
};
el('hudTorch').onclick=async()=>{
 const token=hudToken;
 if(!token||roomProfile?.gm===false&&!ownsRoomStandee(token))return;
 try{if(roomProfile?.gm===false){await customizeRoomObject(token,'torch',!token.torch);await pollRoom()}else{remember();Object.assign(token,{torch:!token.torch});openStandeeHud(token);refresh()}}
 catch(err){message(err.message);await pollRoom()}
};
async function applyStandeeAura(remove){
 const token=hudToken,radius=el('hudAuraRadius').valueAsNumber;
 if(!token||roomProfile?.gm===false&&!ownsRoomStandee(token))return;
 if(!remove&&(!Number.isFinite(radius)||radius<1||radius>120)){message('Enter an aura radius from 1 to 120 ft.');return}
 const aura=remove?null:{radius,color:el('hudAuraColor').value};
 try{
  if(roomProfile?.gm===false){await customizeRoomObject(token,'aura',aura);await pollRoom()}
  else{remember();if(aura)token.aura=aura;else delete token.aura;refresh()}
  const updated=tokens.find(t=>t===token||token.roomId&&t.roomId===token.roomId);
  if(updated&&hudToken)openStandeeHud(updated);
 }catch(error){message(error.message);await pollRoom()}
}
el('hudAuraApply').onclick=()=>applyStandeeAura(false);
el('hudAuraRemove').onclick=()=>applyStandeeAura(true);
for(const [id,spell] of [['hudLightSpell','light'],['hudDancingLights','dancing']]){
 el(id).onclick=async e=>{
  const token=hudToken,button=e.currentTarget;
  if(!token||!ownsRoomStandee(token)||roomState.paused)return;
  button.disabled=true;
  try{
   await customizeRoomObject(token,'spell_light_create',{spell,tint:el('hudSpellColor').value});
   closeStandeeHud();await pollRoom();
   message('Spell light created. Use its map marker to move or remove it.');
  }catch(error){message(error.message);await pollRoom()}
  finally{button.disabled=false}
 };
}
async function saveFamiliarCatalogEntry(token,shared){
 const ticket=roomProfile.token;
 const name=prompt('Familiar template name',token.displayName||token.name||'Familiar')?.trim();
 if(!name)return;
 const current=standeeSizes[standeeSizeIndex(token)].id;
 const size=shared?prompt('Familiar size: Tiny or Small',current==='small'?'Small':'Tiny')?.trim().toLowerCase():current;
 if(!['tiny','small'].includes(size)){message('Choose Tiny or Small.');return}
 const draft=shared?{...token,name,size}:{roomId:token.roomId,name,size};
 await roomRpc('familiar_catalog',{ticket,draft});
 message('Familiar template saved to the server.');
}
for(const [id,spell] of [['dimensionDoor','dimension_door'],['arcaneEye','arcane_eye'],['familiar','find_familiar']]){
 el(id).onclick=async()=>{
  const caster=hudToken;
  if(!caster||roomProfile?.gm!==false||!ownsRoomStandee(caster)||roomState.paused)return;
  let sizeCategory,templateId;
  if(spell==='find_familiar'){
   let catalog;
   try{catalog=await roomRpc('familiar_catalog',{ticket:roomProfile.token})}
   catch(error){message(error.message);return}
   if(hudToken!==caster||roomState.paused)return;
   const options=catalog.map(entry=>({...entry,label:entry.name+' · '+entry.size+(entry.shared?' · GM catalog':'')}));
   options.push({size:'tiny',label:'New Tiny familiar'},{size:'small',label:'New Small familiar'});
   const answer=prompt('Choose a familiar by number.\n'+options.map(({label},i)=>(i+1)+'. '+label).join('\n'),'1');
   if(answer===null)return;
   const chosen=options[Number(answer)-1];
   if(!chosen){message('Choose a listed familiar.');return}
   sizeCategory=chosen.size;templateId=chosen.id;
  }
  const allyId=spell==='dimension_door'?chooseDimensionDoorAlly(caster):null;
  if(allyId===undefined)return;
  spellPlacement={token:caster,spell,sizeCategory,allyId,templateId};
  closeStandeeHud();message('Click a destination on the map. Esc cancels.');
 };
}
function chooseDimensionDoorAlly(caster){
 let allyId=null;
 const [x,y,z]=basePoint(caster);
 const allies=tokens.filter(t=>t!==caster&&t.size<=1&&['pc','ally'].includes(baseStandeeRole(t))&&
  !standeeHidden(t)&&!t.conditions?.includes('dead')&&Math.abs(t.z-z)<1&&
  Math.max(Math.abs(t.x+.5-x),Math.abs(t.y+.5-y))<=caster.size/2+.5);
 if(allies.length===1&&confirm('Take '+libraryName(allies[0])+' through Dimension Door?'))allyId=allies[0].roomId;
 if(allies.length>1){
  const answer=prompt('Who should travel with you? Choose 0 to go alone.\n'+allies.map((t,i)=>(i+1)+'. '+libraryName(t)).join('\n'),'0');
  if(answer===null)return undefined;
  const choice=Number(answer);
  if(!Number.isInteger(choice)||choice<0||choice>allies.length){message('Choose a listed ally or 0 to go alone.');return undefined}
  allyId=allies[choice-1]?.roomId??null;
 }
 return allyId;
}
function mapDimensionDoorCaster(){
 if(!playing||roomProfile?.gm!==false||playerScenePaused()||roomMoving)return null;
 const candidates=[selected,hudToken,...tokens.filter(t=>t.roomId===roomProfile.characterKey),...tokens];
 return candidates.find(t=>tokens.includes(t)&&t.roomId&&ownsRoomStandee(t)&&!t.incognito&&!t.conditions?.includes('dead'))??null;
}
function castDimensionDoorAtSquare(caster,target){
 if(!tokens.includes(caster)||!ownsRoomStandee(caster)||standeeHidden(caster)||caster.conditions?.includes('dead')||
  playerScenePaused()||carry||spellPlacement||roomMoving||!target.inRange)return;
 const allyId=chooseDimensionDoorAlly(caster);
 if(allyId===undefined)return;
 spellPlacement={token:caster,spell:'dimension_door',allyId};
 closeStandeeHud();
 void placeStandeeSpell(null,target);
}
let eyeRangeLine;
function clearSpellPlacement(){
 spellPlacement=null;
 eyeRangeLine?.remove();
 eyeRangeLine=null;
}
const placementSpellRanges={arcane_eye:6,find_familiar:2,dimension_door:100};
function dimensionDoorIgnoredObject(object){
 return !!object&&(object.conditions?.includes('dead')||['light','torch','spellLight'].includes(object.type)||
  object.shape==='light'||object.terrainShape?.componentKind==='light');
}
function spellRangeTarget(e,token,spell){
 return spellRangeTargetAt(...coords(e),token,spell);
}
function spellRangeTargetAt(x,y,token,spell,square=false){
 const accept=spell==='dimension_door'?face=>!dimensionDoorIgnoredObject(face.p):null;
 const z=spell==='arcane_eye'?token.z:hit(x,y,token,true,accept)?.z??0;
 const [rawU,rawV]=inverse(x,y,z);
 return spellRangeTargetInGrid(rawU,rawV,z,token,spell,square);
}
function spellRangeTargetInGrid(rawU,rawV,z,token,spell,square=false){
 const teleport=spell==='dimension_door';
 const u=teleport&&!square?rawU:Math.floor(rawU+1e-8)+.5,v=teleport&&!square?rawV:Math.floor(rawV+1e-8)+.5;
 const width=teleport?token.size:1;
 const px=teleport?u-width/2:Math.floor(rawU+1e-8),py=teleport?v-width/2:Math.floor(rawV+1e-8);
 const start=[Math.max(token.x,Math.min(u,token.x+token.size)),Math.max(token.y,Math.min(v,token.y+token.size))];
 const dz=spell==='dimension_door'?z-token.z:0;
 const range=placementSpellRanges[spell];
 return {u,v,px,py,z,start,inRange:floorAcceptsDestination(px,py,width,width)&&
  (u-start[0])**2+(v-start[1])**2+dz**2<=range**2};
}
el('map').parentElement.addEventListener('pointermove',e=>{
 const placement=spellPlacement;
 if(!placement)return;
 const token=tokens.find(t=>t.roomId===placement.token.roomId)??placement.token;
 const {u,v,z,start,inRange}=spellRangeTarget(e,token,placement.spell);
 const [x,y]=point(...start,token.z),rect=el('map').getBoundingClientRect();
 const left=rect.left+x,top=rect.top+y;
 const [targetX,targetY]=point(u,v,z);
 const dx=targetX-x,dy=targetY-y;
 if(!eyeRangeLine){
  eyeRangeLine=document.createElement('div');
  eyeRangeLine.style.cssText='position:fixed;pointer-events:none;height:3px;transform-origin:left center;z-index:1000;box-shadow:0 0 4px #000';
  document.body.append(eyeRangeLine);
 }
 Object.assign(eyeRangeLine.style,{left:left+'px',top:top+'px',
  width:Math.hypot(dx,dy)+'px',transform:'rotate('+Math.atan2(dy,dx)+'rad)',
  background:inRange?'#6ef0a0':'#ff6464'});
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&spellPlacement){clearSpellPlacement();message('Spell placement canceled.')}});
// Dimension Door visual feedback runs independently of the network request.
let dimensionDoorAnimation=null;
const dimensionDoorHidden=new Set();
function dimensionDoorEffect(token,phase,delay=0){
 const canvas=el('map'),rect=canvas.getBoundingClientRect();
 const overlay=document.createElement('canvas');
 overlay.width=canvas.width;overlay.height=canvas.height;
 Object.assign(overlay.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',pointerEvents:'none',zIndex:'2147483647'});
 document.body.append(overlay);
 const g=overlay.getContext('2d'),start=performance.now()+delay,duration=phase==='depart'?310:500;
 // point() returns CSS pixels; the canvas backing store may use devicePixelRatio.
 const pixelScaleX=overlay.width/rect.width,pixelScaleY=overlay.height/rect.height;
 g.setTransform(pixelScaleX,0,0,pixelScaleY,0,0);
 const location=point(...basePoint(token));
 const x=location[0],y=location[1],size=topDown?S*token.size*.9:standeeArtHeight(token);
 const look=token.looks?.[token.activeLook],src=look?.front||token.src||defaultStandeeLook(token).front;
 const art=src&&getArt(src);
 return new Promise(resolve=>{
  function frame(now){
   if(now<start){requestAnimationFrame(frame);return}
   const t=Math.min(1,(now-start)/duration);
   g.clearRect(0,0,rect.width,rect.height);
   const squeeze=phase==='depart'?Math.max(.015,1-t):Math.max(.015,Math.min(1,(t-.15)/.5));
   const glow=phase==='depart'?1-t:1-t*.8;
   g.save();g.translate(x,y);g.globalCompositeOperation='screen';
   const radius=size*(.55+(phase==='arrive'?t*.65:0));
   const halo=g.createRadialGradient(0,-size*.55,1,0,-size*.55,radius);
   halo.addColorStop(0,'rgba(100,225,255,'+(.65*glow)+')');halo.addColorStop(.45,'rgba(23,107,255,'+(.38*glow)+')');halo.addColorStop(1,'rgba(18,75,200,0)');
   g.fillStyle=halo;g.beginPath();g.arc(0,-size*.55,radius,0,Math.PI*2);g.fill();
   g.restore();
   if(phase==='depart'||t>.12){
    g.save();g.translate(x,y);g.scale(squeeze,1);g.globalAlpha=phase==='depart'?1-t*.3:Math.min(1,t*2);
    if(art?.complete&&art.naturalWidth){
     const ratio=Math.min((topDown?size:size*.8)/art.naturalWidth,size/art.naturalHeight);
     const w=art.naturalWidth*ratio,h=art.naturalHeight*ratio;
     g.drawImage(art,-w/2,-h,w,h);
    }else{
     g.fillStyle='#86cfff';g.fillRect(-size*.25,-size,size*.5,size);
    }
    g.restore();
   }
   const smoke=phase==='arrive'?1-t:t;
   g.save();g.globalAlpha=(phase==='arrive'?.72:.28)*(1-t);
   for(let i=0;i<9;i++){
    const angle=i*Math.PI*2/9,dist=size*(.15+smoke*.65);
    g.fillStyle=i%2?'#52b6ff':'#9be9ff';g.beginPath();
    g.arc(x+Math.cos(angle)*dist,y-size*.35+Math.sin(angle)*dist*.5,size*(.12+.12*t),0,Math.PI*2);g.fill();
   }
   g.restore();
   if(t<1)requestAnimationFrame(frame);else{overlay.remove();resolve()}
  }
  requestAnimationFrame(frame);
 });
}
async function placeStandeeSpell(e,target=null){
 const placement=spellPlacement;
 if(!placement||placement.pending)return;
 const {spell,sizeCategory,allyId,templateId}=placement;
 const token=tokens.find(t=>t.roomId===placement.token.roomId)??placement.token;
 const {u,v,z,px,py,inRange}=target??spellRangeTarget(e,token,spell);
 if(!inRange){message('Choose a point within '+placementSpellRanges[spell]*5+' ft of the caster’s footprint. Esc cancels.');return}
 if(spell==='arcane_eye'){
  placement.pending=true;
  try{
   await customizeRoomObject(token,spell,{x:u,y:v,z:token.z});
   if(spellPlacement===placement)clearSpellPlacement();
   await pollRoom();
   refresh();
  }catch(error){
   message(error.message);await pollRoom();
  }finally{placement.pending=false}
  return;
 }
 if(spell==='find_familiar'&&!playerCanSeePoint([px+.5,py+.5,z])){message('Choose a point you can see.');return}
 clearSpellPlacement();
 const travelers=spell==='dimension_door'?[token,...(allyId?tokens.filter(t=>t.roomId===allyId):[])]:[];
  if(spell==='dimension_door')for(const traveler of travelers)tacticalTeleportPending.add(String(traveler.roomId));
 // Start the visual effect immediately; do not wait for the server response.
 let arrivalFailed=false;
 const castProfile=roomProfile,castScene=roomState.sceneId,castRevision=roomRevision;
 const sameEncounter=()=>roomProfile===castProfile&&roomState.sceneId===castScene;
 const departure=travelers.map(t=>dimensionDoorEffect(t,'depart'));
 if(spell==='dimension_door'){
  // Hide the original tokens once their departure squeeze completes, even if the RPC is pending.
  Promise.all(departure).then(()=>{
   if(arrivalFailed||!sameEncounter())return;
   travelers.forEach(t=>dimensionDoorHidden.add(t.roomId));
   movementRenderCache=null;draw('Dimension Door departure');
  });
 }
 // Give the caster immediate local visual feedback while the server resolves the spell.
 // Keep the actual standee positions authoritative until the server confirms them.
 const destinationGlow=spell==='dimension_door'?document.createElement('div'):null;
 if(destinationGlow){
  const [sx,sy]=point(u,v,z);
  const rect=el('map').getBoundingClientRect();
  Object.assign(destinationGlow.style,{
   position:'fixed',left:(rect.left+sx-34)+'px',
   top:(rect.top+sy-70)+'px',
   width:'68px',height:'68px',borderRadius:'50%',pointerEvents:'none',
   zIndex:'2147483646',background:'radial-gradient(circle,rgba(160,237,255,.95) 0%,rgba(32,126,255,.65) 32%,rgba(35,105,255,0) 73%)',
   boxShadow:'0 0 24px 10px rgba(25,145,255,.65)',opacity:'.85',
   animation:'dimensionDoorPulse .55s ease-in-out infinite alternate'
  });
  if(!document.getElementById('dimensionDoorPulseStyle')){
   const style=document.createElement('style');style.id='dimensionDoorPulseStyle';
   style.textContent='@keyframes dimensionDoorPulse{from{transform:scale(.7);opacity:.45}to{transform:scale(1.5);opacity:1}}';
   document.head.append(style);
  }
  document.body.append(destinationGlow);
 }
 try{
  const result=await customizeRoomObject(token,spell,{x:px,y:py,z,sizeCategory,allyId,templateId});
  for(const roll of result?.damage??[])postChat('Dimension Door · '+roll.name+' materialized in a blocked space and was redirected. Force damage: 4d6 ('+roll.dice.join(', ')+') = '+roll.total+'.','public');
  await pollRoom();
  destinationGlow?.remove();
  if(spell==='dimension_door'){
   await Promise.all(departure);
   if(!sameEncounter()){
    travelers.forEach(t=>dimensionDoorHidden.delete(t.roomId));
    return;
   }
   // A poll already in flight when the cast completed can return the old
   // revision. Apply the accepted position locally until the next poll.
   const arrivals=travelers.map(traveler=>{
    const current=tokens.find(updated=>updated.roomId===traveler.roomId);
    const arrival=result?.arrivals?.[traveler.roomId];
    if(current&&arrival&&roomRevision<=castRevision+1&&[arrival.x,arrival.y,arrival.z].every(Number.isFinite)){
     Object.assign(current,{x:arrival.x,y:arrival.y,z:arrival.z});
    }
    return current;
   }).filter(Boolean);
   if(playerStandeePreview?.scene===currentSceneId&&
      travelers.some(traveler=>traveler.roomId===playerStandeePreview.token.roomId)){
    playerStandeePreview=null;
   }
   arrivals.forEach(t=>dimensionDoorHidden.add(t.roomId));
   movementRenderCache=null;
   const caster=arrivals.find(standee=>standee.roomId===token.roomId);
   if(caster){
    selected=caster;
    focusStandee(caster,'Dimension Door arrival',false,{preserveZoom:true});
   }else draw('Dimension Door arrival hidden');
   await Promise.all(arrivals.map(t=>dimensionDoorEffect(t,'arrive')));
   travelers.forEach(t=>dimensionDoorHidden.delete(t.roomId));
   movementRenderCache=null;draw('Dimension Door arrival complete');
  }
  refresh();
 }catch(error){arrivalFailed=true;destinationGlow?.remove();travelers.forEach(t=>dimensionDoorHidden.delete(t.roomId));movementRenderCache=null;message(error.message);await pollRoom();draw('Dimension Door failed')}
}
el('removeEye').onclick=async()=>{
 if(!(roomProfile?.gm||ownsRoomStandee(hudToken))||!hudToken.arcaneEye)return;
 try{await customizeRoomObject(hudToken,'arcane_eye',null);await pollRoom();draw('Arcane Eye dismissed')}catch(error){message(error.message)}
};
el('familiarVision').onclick=()=>{
 const target=familiarVisionTarget(hudToken);
 if(!target)return;
 familiarView=target.familiarCaster?target.roomId:null;
 closeStandeeHud();refresh();
};
el('saveFamiliar').onclick=async()=>{
 const token=hudToken;
 if(!token?.familiarCaster||!ownsRoomStandee(token))return;
 try{await saveFamiliarCatalogEntry(token,false)}catch(error){message(error.message)}
};
function positionCharacterPanel(){
 if(!hudToken)return;
 const panel=el('standeeHud'),[x,y]=point(...basePoint(hudToken));
 panel.style.transform='none';
 panel.style.left=Math.max(8,Math.min(W-panel.offsetWidth-8,x+20))+'px';
 panel.style.top=Math.max(8,Math.min(H-panel.offsetHeight-8,y-panel.offsetHeight-12))+'px';
}
let hudTorchOnly=false;
let pendingPolymorph=null;
function polymorphLanding(target,size){
 const occupied=[...pieces,...tokens];
 const candidates=[[0,0],[1,0],[-1,0],[0,1],[0,-1]];
 for(const [dx,dy] of candidates){
  const x=target.x+dx,y=target.y+dy;
  const heights=[target.z,...new Set(pieces.filter(piece=>{
   const [w,d,h]=dimensions(piece);
   return x<piece.x+w&&x+size>piece.x&&y<piece.y+d&&y+size>piece.y&&
    Math.abs(piece.z+h-target.z)<=1;
  }).map(piece=>{const [, , h]=dimensions(piece);return piece.z+h;})),0];
  for(const z of heights){
   if(Math.abs(z-target.z)>1||(!dx&&!dy&&z!==target.z))continue;
   if(valid({...target,x,y,z,size},occupied,target))return {x,y,z};
  }
 }
 return null;
}
async function applyPolymorph(caster,target,form){
 const landing=form?polymorphLanding(target,form.size):null;
 if(form&&!landing){
  message('That form does not fit here or within one square.');return;
 }
 try{
  await roomRpc('polymorph',{ticket:roomProfile.token,operation:form?'cast':'end',draft:{
   caster:caster.roomId,target:target.roomId,name:form?.name,revision:roomRevision,...landing
  }});
  await pollRoom();
 }catch(error){message(error.message);await pollRoom()}
}
el('hudPolymorph').onclick=async()=>{
 const caster=hudToken;
 if(!caster||!(roomProfile?.gm||ownsRoomStandee(caster)))return;
 try{
  const forms=await roomRpc('polymorph',{ticket:roomProfile.token,operation:'list'});
  if(hudToken!==caster)return;
  if(!forms.length){message('The GM has not cataloged any Polymorph forms.');return}
  const answer=prompt('Choose a form by number:\n'+forms.map((f,i)=>(i+1)+'. '+f.name).join('\n'));
  const form=forms[Number(answer)-1];
  if(!form)return;
  const target=prompt('Choose 1 to transform this standee, or 2 to select another standee.','1');
  if(target!=='1'&&target!=='2')return;
  closeStandeeHud();
  if(target==='1')await applyPolymorph(caster,caster,form);
  else{pendingPolymorph={caster,form};message('Left-click the target standee. Esc cancels.')}
 }catch(error){message(error.message)}
};
function polymorphEndTargets(caster){
 return tokens.filter(target=>target.polymorph&&
  (target===caster||target.polymorph.caster===caster.roomId));
}
el('hudEndPolymorph').onclick=()=>{
 const caster=hudToken;
 if(!caster||!(roomProfile?.gm||ownsRoomStandee(caster))||
  roomState.paused&&!roomProfile?.gm)return;
 const targets=polymorphEndTargets(caster);
 if(!targets.length)return;
 let target=targets[0];
 if(targets.length>1){
  const answer=prompt('Choose which Polymorph to end:\n'+targets.map((item,i)=>
   (i+1)+'. '+(item.displayName||item.name||'Standee')).join('\n'));
  target=targets[Number(answer)-1];
  if(!target)return;
 }
 closeStandeeHud();void applyPolymorph(caster,target,null);
};
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&pendingPolymorph){pendingPolymorph=null;message('Polymorph canceled.')}
});
function openStandeeHud(token,torchOnly=token===hudToken&&hudTorchOnly){
 hudTorchOnly=torchOnly&&roomProfile?.gm!==false;
 if(!hudTorchOnly&&!canSeeStandeeStats(token)){closeStandeeHud();return}
 hudToken=token;
 el('hudClearTarget').hidden=!(token.targetRoomId||token.targetId);
 el('hudClearTarget').disabled=roomProfile?.gm===false&&(!ownsRoomStandee(token)||roomState.paused);
 const canTransform=!!roomProfile&&(roomProfile.gm||ownsRoomStandee(token)&&!roomState.paused)&&!hudTorchOnly;
 el('hudPolymorph').hidden=!canTransform;
 el('hudEndPolymorph').hidden=!canTransform||!polymorphEndTargets(token).length;
 const own=roomProfile?.gm===false&&ownsRoomStandee(token);
 el('hudRollInitiative').hidden=hudTorchOnly||!own;
 for(const id of ['dimensionDoor','arcaneEye','familiar'])el(id).hidden=!own;
 el('removeEye').hidden=!(own||roomProfile?.gm)||!token.arcaneEye;
 el('saveFamiliar').hidden=!own||!token.familiarCaster;
 el('familiarVision').hidden=!own||!familiarVisionTarget(token);
 el('familiarVision').textContent=token.familiarCaster?'Return vision to caster':'Transfer vision to familiar';
 const form=el('standeeHudForm');
 for(const selector of ['.hud-panels > div','.hud-stats','button[type=submit]','#hudLooks']){
  form.querySelector(selector).hidden=hudTorchOnly;
 }
 if(hudTorchOnly){
  form.querySelector('.hud-panels > div').hidden=false;
 }
 el('standeeHud').hidden=false;
 el('standeeHudName').textContent=token.displayName||token.name||'Standee';
 for(const [id,key] of Object.entries(hudFields))el(id).value=token[key]??'';
 const player=roomProfile?.gm===false;
 el('openPlannerRolls').hidden=hudTorchOnly||!playing||!(canUsePlayerRolls(token)||!player&&token.plannerCombat);
 el('openPlannerRolls').textContent=canUsePlayerRolls(token)?'Rolls':'Combat Actions';
 el('hudLooks').hidden=hudTorchOnly||player&&!ownsRoomStandee(token);
 el('hudSize').hidden=hudTorchOnly||!own;
 if(own)updateHudSize(token);
 el('hudVision').value=standeeVision(token);
 el('hudDarkvision').value=token.darkvision||60;
 el('hudVision').disabled=el('hudDarkvision').disabled=player&&!ownsRoomStandee(token);
 el('hudVision').onchange();
 for(const checkbox of el('standeeHudForm').querySelectorAll('[data-display]'))checkbox.checked=hudDisplays(token,hudFields[checkbox.dataset.display]);
 el('hudTorch').hidden=player&&!ownsRoomStandee(token);
 el('hudTorchColorRow').hidden=el('hudLightSettings').hidden=el('hudTorch').hidden;
 el('hudAuraControls').hidden=el('hudTorch').hidden;
 el('hudAuraColor').value=token.aura?.color||'#83d8ee';
 el('hudAuraRadius').value=token.aura?.radius??10;
 el('hudAuraRemove').disabled=!token.aura;
 el('hudSpellControls').hidden=!player||!ownsRoomStandee(token)||roomState.paused;
 el('hudBright').value=token.torchBright??20;
 el('hudDim').value=token.torchDim??40;
 el('hudDrop').hidden=!player||!(token.torch||token.carriedDrop);
 el('hudDrop').disabled=!!token.flying;
 el('hudTorchColor').value=token.torchColor||'#ffcc80';
 el('hudTorch').textContent=token.torch?'Extinguish torch':'Light torch';
 positionCharacterPanel();
 for(const id of Object.keys(hudFields))el(id).readOnly=player&&!ownsRoomStandee(token);
 for(const button of el('standeeHudForm').querySelectorAll('button[type=submit],button:not([type])'))button.hidden=hudTorchOnly||player&&!ownsRoomStandee(token);
 el('standeeHudStatus').textContent=[token.maxHp!=null?'Max HP '+token.maxHp:'',token.darkvision?'Darkvision '+token.darkvision+' ft':'',...(token.conditions||[])].filter(Boolean).join(' · ');
}
function closeStandeeHud(){
 hudToken=null;el('standeeHud').hidden=true;
}
for(const [id,key] of [['hudHp','hp'],['hudTempHp','tempHp']]){
 const input=el(id);
 input.onfocus=()=>input.select();
 input.onkeydown=async e=>{
  if(e.key!=='Enter')return;
  e.preventDefault();e.stopPropagation();
  const token=hudToken,value=input.value.trim();
  if(!token||input.readOnly||input.disabled)return;
  if(!/^[+-]?[0-9]{1,5}$/.test(value)){
   el('standeeHudStatus').textContent='Enter a number or an adjustment such as +5 or -3.';return;
  }
  input.disabled=true;
  try{
   if(roomProfile?.gm===false){await customizeRoomObject(token,'stats',{[key]:value});await pollRoom()}
   else{
    const next=Number(value)+(/^[+-]/.test(value)?token[key]??0:0);
    changeCombatStats(token,{[key]:Math.max(0,Math.min(key==='hp'?token.maxHp??99999:99999,next))});
    openStandeeHud(token);refresh();
   }
  }catch(err){el('standeeHudStatus').textContent=err.message}
  finally{input.disabled=false}
 };
}
el('standeeHudClose').onclick=closeStandeeHud;
el('openPlannerRolls').onclick=()=>{
 const token=hudToken;
 if(!token||roomProfile?.gm===false&&!canUsePlayerRolls(token))return;
 closeStandeeHud();
 if(canUsePlayerRolls(token))openPlayCombat(token);else openPlannerCombat(token);
};
el('hudClearTarget').onclick=async()=>{
 const token=hudToken;
 if(!token)return;
 if(roomProfile?.gm===false){
  if(!ownsRoomStandee(token)||roomState.paused)return;
  try{await customizeRoomObject(token,'clear_target',null);closeStandeeHud();await pollRoom()}
  catch(error){el('standeeHudStatus').textContent=error.message}
 }else{
  remember();
  const facing=trackingFacing(token);
  if(facing!==undefined)token.facing=facing;
  delete token.targetRoomId;delete token.targetId;
  openStandeeHud(token);refresh();
 }
};
el('standeeHudTarget').onclick=()=>{const token=hudToken;closeStandeeHud();armFacingTarget(token)};
el('standeeHudForm').onsubmit=async e=>{
 e.preventDefault();
 const token=hudToken;
 if(!token||!tokens.includes(token)||standeeHidden(token)||!canSeeStandeeStats(token))return;
 const vision=el('hudVision').value,range=vision==='dark'?Number(el('hudDarkvision').value):0;
 const display=Object.fromEntries([...el('standeeHudForm').querySelectorAll('[data-display]')].map(input=>[hudFields[input.dataset.display],input.checked]));
 if(roomProfile?.gm===false){
  if(!ownsRoomStandee(token))return;
  const edits=Object.fromEntries(Object.entries(hudFields).map(([id,key])=>[key,el(id).value.trim()]).filter(([key,value])=>value!==''&&value!==String(token[key]??'')));
  if(vision!==standeeVision(token)||vision==='dark'&&range!==token.darkvision)edits.vision={type:vision,range};
  try{
   if(Object.keys(edits).length)await customizeRoomObject(token,'stats',edits);
   saveHudDisplay(token,display);
   if(hudToken===token)closeStandeeHud();
   draw();
   if(Object.keys(edits).length)await pollRoom();
  }
  catch(err){el('standeeHudStatus').textContent=err.message}
  return;
 }
 const next=Object.fromEntries(Object.entries(hudFields).map(([id,key])=>[key,optionalNumber(id)]));
 if(next.hp!=null&&token.maxHp!=null&&next.hp>token.maxHp){
  el('standeeHudStatus').textContent='Current HP cannot exceed max HP.';return;
 }
 remember();
 if(vision==='dark')token.darkvision=Number(el('hudDarkvision').value);
 if(vision==='regular')token.darkvision=0;
 token.conditions=(token.conditions||[]).filter(condition=>condition!=='blinded');
 if(vision==='blind')token.conditions.push('blinded');
 saveHudDisplay(token,display);
 Object.assign(token,next);
 if(token.hpPoolId)for(const other of tokens)if(other.hpPoolId===token.hpPoolId)other.hp=next.hp;
 closeStandeeHud();
 refresh();
};
const plannerAbilities=['str','dex','con','int','wis','cha'];
const plannerActionGroups={
 actions:'Actions',bonus_actions:'Bonus actions',reactions:'Reactions',
 legendary_actions:'Legendary actions',lair_actions:'Lair actions',
 mythic_actions:'Mythic actions',villain_actions:'Villain actions',special_abilities:'Special abilities'
};
function combatInteger(...values){
 for(const raw of values){
  const value=Array.isArray(raw)?raw[0]:raw;
  const match=/^\s*([+-]?\d+)(?=\s|\(|$)/.exec(String(value??''));
  if(match&&Number.isSafeInteger(Number(match[1])))return Number(match[1]);
 }
 return null;
}
function combatFormula(value,mod){
 const formula=String(value??'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,'')
  .replace(/\+@mod/g,mod==null?'@mod':mod>=0?'+'+mod:String(mod)).replace(/d(?=\d)/i,'d');
 if(/^[+-]?\d+$/.test(formula))return formula;
 return /^\d*d\d+(?:[+-]\d+)?$/i.test(formula)?formula.replace(/^d/i,'1d'):null;
}
function plannerCombatBlock(row){
 const checks={},saves={},skills={};
 for(const key of plannerAbilities){
  const score=combatInteger(row.abilities?.[key],row.abilities?.[key.toUpperCase()]);
  if(score!==null)checks[key]=Math.floor((score-10)/2);
  const bonus=combatInteger(row.saves?.[key],row.saves?.[key.toUpperCase()],checks[key]);
  if(bonus!==null)saves[key]=bonus;
 }
 for(const [skill,value] of Object.entries(row.skills||{})){
  const bonus=combatInteger(value);
  if(bonus!==null)skills[skill]=bonus;
 }
 const actions=[];
 for(const [key,group] of Object.entries(plannerActionGroups)){
  for(const a of Array.isArray(row[key])?row[key]:[]){
   if(!a||a._override?.hidden)continue;
   const o=a._override||{},desc=String(a.desc||a.description||'');
   const proseSave=desc.match(/\bDC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
   const proseDamage=[...desc.matchAll(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\)?\s+(\w+) damage\b/gi)];
   const damage=[];
   const count=Array.isArray(a.requiredSaves)&&Array.isArray(a.damages)?a.damages.length:
    Math.max(1,a.damages?.length||0,proseDamage.length,a.extra||o.extra?2:0);
   for(let i=0;i<count;i++){
    const prose=proseDamage[i];
    const value=(i===0?o.damage:i===1?o.extra:null)||a.damages?.[i]||
     (i===0?a.damage:i===1?a.extra||a.extra_damage:null);
    const type=(i===0?o.damageType:i===1?o.extraType:null)||a.damageTypes?.[i]||
     (i===0?a.damageType||a.dmgType||a.damage_type:i===1?a.extraType||a.extra_type:null)||prose?.[2]||'Damage';
    const formula=combatFormula(value,combatInteger(a.mod,a.abilityModifier))||combatFormula(prose?.[1]);
    if(formula)damage.push({formula,type,...(typeof a.damageConditions?.[i]==='string'&&a.damageConditions[i]?{condition:a.damageConditions[i]}:{})});
   }
   actions.push({
    group,name:o.name||a.name||'Action',desc,damage,
    attack:combatInteger(o.toHit,a.toHit,a.attack_bonus,desc.match(/([+-]\d+)\s+to hit/i)?.[1]),
    dc:combatInteger(o.saveDC,o.saveDc,a.saveDC,a.saveDc,a.save_dc,a.dc,proseSave?.[1]),
    save:o.saveAbility||a.saveAbility||a.save_ability||proseSave?.[2]||'',
    customButton:a.customButton===true,
    requiredSaves:Array.isArray(a.requiredSaves)?a.requiredSaves.filter(save=>
     Number.isInteger(save?.dc)&&save.dc>0&&save.dc<=99&&challengeOptions.save.includes(save.ability)):[]
   });
  }
 }
 return {name:row.name||'Monster',maxHp:combatInteger(row.hp),ac:combatInteger(row.ac),
  saveDc:combatInteger(row.spell_save_dc,row.save_dc,row.saveDc),checks,saves,skills,actions};
}
function applyPlannerCombat(token,link,block){
 if(link){token.plannerMonster={...link};delete token.ddbMonsterSource}
 token.plannerCombat=block;
 token.maxHp=block.maxHp;
 token.ac=block.ac;
 token.saveDc=block.saveDc;
 if(token.hp==null&&!token.hpPoolId)token.hp=block.maxHp;
}
const privateCombatFields=['plannerMonster','plannerCombat','ddbMonsterSource'];
function standeeCombatDetails(token){
 return Object.fromEntries(privateCombatFields.filter(key=>token[key]!==undefined).map(key=>[key,token[key]]));
}
function applyPrivateCombat(token,details){
 for(const key of privateCombatFields){
  if(Object.hasOwn(details,key))token[key]=structuredClone(details[key]);else delete token[key];
 }
}
let privateCombatWrite=Promise.resolve();
async function savePrivateCombat(sceneId,updates){
 if(!sceneId||!roomProfile?.gm||!updates.length)return;
 const ticket=roomProfile.token;
 const changes=structuredClone(Object.fromEntries(updates.map(([token,details])=>[token.roomId,details])));
 const request=privateCombatWrite.then(()=>roomRpc('standee_combat',{ticket,scene_key:sceneId,changes}));
 privateCombatWrite=request.catch(()=>{});
 await request;
}
function undoCombatPersistence(previous){
 if(!roomProfile?.gm||!currentSceneId)return;
 const before=new Map(previous.map(token=>[token.roomId,standeeCombatDetails(token)]));
 const changes=tokens.filter(token=>token.roomId&&before.has(token.roomId)&&
  canonicalSceneValue(before.get(token.roomId))!==canonicalSceneValue(standeeCombatDetails(token)))
  .map(token=>[token,standeeCombatDetails(token)]);
 savePrivateCombat(currentSceneId,changes).catch(error=>message('Could not save the combat-stat undo. '+error.message));
}
function inheritStandeeCombat(items,prior){
 const entries=new Map(prior.filter(token=>token.roomId&&(token.plannerMonster||token.plannerCombat||token.ddbMonsterSource)).map(token=>[token.roomId,token]));
 for(const token of items){
  const previous=entries.get(token.roomId);
  if(previous)applyPrivateCombat(token,standeeCombatDetails(previous));
 }
}
let privateCombatLoad=null;
async function hydrateStandeeCombat(sceneId,items,live=false){
 if(!roomProfile?.gm||!sceneId)return;
 const ticket=roomProfile.token;
 // Keep a newer import or undo if a delayed read was started before it.
 const before=new Map(items.map(token=>[token,canonicalSceneValue(standeeCombatDetails(token))]));
 try{
  await privateCombatWrite;
  const records=await roomRpc('standee_combat',{ticket,scene_key:sceneId});
  if(tokens!==items||currentSceneId!==sceneId||roomProfile?.token!==ticket)return;
  for(const token of items){
   if(!Object.hasOwn(records,token.roomId)||before.get(token)!==canonicalSceneValue(standeeCombatDetails(token)))continue;
   const details=records[token.roomId];
   if(!live&&details.plannerCombat&&canonicalSceneValue(token.plannerCombat)!==canonicalSceneValue(details.plannerCombat))
    applyPlannerCombat(token,null,details.plannerCombat);
   applyPrivateCombat(token,details);
  }
  refresh();
 }catch(error){if(tokens===items)message('Could not load saved combat stats. '+error.message)}
}
async function commitCombatImport(targets,link,block,source){
 const sceneId=currentSceneId,items=tokens;
 registerSceneStandees(items,roomDraftTitle);
 const details=block?{plannerCombat:block,...(link?{plannerMonster:link}:source?{ddbMonsterSource:source}:{})}:{};
 await savePrivateCombat(sceneId,targets.map(token=>[token,details]));
 if(sceneId!==currentSceneId||items!==tokens)return false;
 remember();
 for(const token of targets){
  if(!tokens.includes(token))continue;
  if(block)applyPlannerCombat(token,link,block);
  applyPrivateCombat(token,details);
 }
 refresh();
 if(roomProfile?.gm)await saveRecovery();
 return true;
}
function samePlannerMonster(a,b){
 return !!a&&!!b&&a.sessionId===b.sessionId&&a.nodeId===b.nodeId&&a.monsterId===b.monsterId;
}
async function plannerRead(table,query){
 let auth;
 try{
  auth=JSON.parse(sessionStorage.getItem('rq_auth')||localStorage.getItem('rq_auth')||'null');
 }catch{}
 if(!auth?.access_token)throw Error('Sign in to Session Planner Canvas in this browser first.');
 const response=await fetch(new URL('../'+table+'?'+query,roomApi),{
  cache:'no-store',signal:AbortSignal.timeout(12000),
  headers:{apikey:roomKey,Authorization:'Bearer '+auth.access_token}
 });
 if(response.status===401)throw Error('Reopen Session Planner Canvas to renew your sign-in, then try again.');
 if(!response.ok)throw Error('Could not read saved sessions from Session Planner Canvas.');
 return response.json();
}
async function plannerMonsters(sessionId){
 const select='blocks,campaign_id,arc_id';
 const [session]=await plannerRead('sessions',new URLSearchParams({id:'eq.'+sessionId,select}));
 if(!session)throw Error('That Planner session is unavailable.');
 const scopes=[['Session',session.blocks]];
 const parentBlocks=await Promise.all([['Campaign','campaigns',session.campaign_id],['Arc','arcs',session.arc_id]]
  .filter(([, ,id])=>id).map(async ([label,table,id])=>{
   const [row]=await plannerRead(table,new URLSearchParams({id:'eq.'+id,select:'blocks'}));
   return [label,row?.blocks];
  }));
 const result=[],seen=new Set();
 for(const [label,blocks] of [...scopes,...parentBlocks]){
  for(const node of blocks?.nodes||[]){
   if(node.type!=='encounter')continue;
   for(const monster of node.fields?.monsters||[]){
    if(!monster.monster_id||!monster.snapshot)continue;
    const key=JSON.stringify([node.id,monster.monster_id]);
    if(seen.has(key))continue;
    seen.add(key);
    result.push({link:{sessionId,nodeId:node.id,monsterId:monster.monster_id},
     label:label+' · '+(node.title||'Encounter')+' · '+(monster.snapshot.name||'Monster'),row:monster.snapshot});
   }
  }
 }
 return result;
}
function combatSection(title){
 const section=document.createElement('fieldset'),legend=document.createElement('legend');
 legend.textContent=title;section.append(legend);return section;
}
function combatText(tag,value){
 const node=document.createElement(tag);node.textContent=value;return node;
}
function combatFloatPlacement(bounds,viewport){
 const gap=12,left=viewport.left??0,top=viewport.top??0,right=viewport.right??viewport.width,bottom=viewport.bottom??viewport.height;
 const x=left+gap,y=top+gap,w=right-left-2*gap,h=bottom-top-2*gap;
 const leftWidth=Math.min(w,bounds.left-gap-x),rightStart=Math.max(x,bounds.right+gap);
 const topHeight=Math.min(h,bounds.top-gap-y),bottomStart=Math.max(y,bounds.bottom+gap);
 const candidates=[
  {x,y,width:leftWidth,height:h},
  {x:rightStart,y,width:right-gap-rightStart,height:h},
  {x,y,width:w,height:topHeight},
  {x,y:bottomStart,width:w,height:bottom-gap-bottomStart}
 ].filter(rect=>rect.width>0&&rect.height>0)
  .map(rect=>({...rect,width:Math.min(rect.width,rect.height,480)}));
 const usable=candidates.filter(rect=>rect.width>=220&&rect.height>=120);
 return (usable.length?usable:candidates).reduce((best,rect)=>
  !best||rect.width*rect.height>best.width*best.height?rect:best,null);
}
function playCombatTokenBounds(token){
 const bounds=canvas.getBoundingClientRect(),face=faces.find(entry=>entry.standee&&entry.p===token);
 const [x,y]=point(...basePoint(token)),radius=S*token.size*.55*standeeScale(token);
 const shape=face?.projected||[[x-radius,y-standeeArtHeight(token)],[x+radius,y]];
 const xs=[...shape.map(([px])=>px),x-radius,x+radius],ys=[...shape.map(([,py])=>py),y+radius*.45];
 return {left:bounds.left+Math.min(...xs),right:bounds.left+Math.max(...xs),
  top:bounds.top+Math.min(...ys),bottom:bounds.top+Math.max(...ys)};
}
function positionPlayCombat(token){
 const bounds=canvas.getBoundingClientRect(),chat=el('rollsPanel');
 const right=chat.hidden?innerWidth:Math.min(innerWidth,chat.getBoundingClientRect().left);
 const viewport={top:Math.max(0,bounds.top),right,bottom:Math.min(innerHeight,bounds.bottom)};
 const target=playCombatTokenBounds(token);
 const rect=combatFloatPlacement(target,viewport)||combatFloatPlacement(target,{...viewport,right:innerWidth});
 if(!rect)return false;
 const {x,y,width,height}=rect,panel=el('playCombatDialog');
 Object.assign(panel.style,{left:x+'px',top:y+'px',width:width+'px',maxHeight:height+'px'});
 panel.style.setProperty('--combat-height',height+'px');
 return true;
}
function updatePlayCombatStats(){
 if(!playCombatStandee)return;
 const token=playCombatStandee;
 if(!playing||!tokens.includes(token)||roomProfile?.gm===false&&!canUsePlayerRolls(token)){
  el('playCombatDialog').close();playCombatStandee=null;return;
 }
 for(const input of playCombatStats?.querySelectorAll('input')??[]){
  const next=String(token[input.name]??'');
  if(input.value!==input.dataset.synced||next===input.dataset.synced)continue;
  input.value=input.dataset.synced=next;
 }
 const conditions=playCombatStats?.querySelector('output');
 const text=(token.conditions||[]).map(condition=>condition.charAt(0).toUpperCase()+condition.slice(1)).join(' · ');
 if(conditions&&conditions.textContent!==text)conditions.textContent=text;
 const panel=el('playCombatDialog');
 if(panel.open){
  const rect=panel.getBoundingClientRect(),target=playCombatTokenBounds(token);
  if(combatPanelOverlaps(rect,target)&&!positionPlayCombat(token))panel.close();
 }
}
function combatPanelOverlaps(a,b){
 return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
}
function playCombatStatValue(raw,previous,adjustable){
 if(raw==='')return null;
 if(!(adjustable?/^[+-]?\d{1,5}$/:/^\d{1,5}$/).test(raw))throw Error('Enter a whole number. HP fields also accept +5 or -3.');
 return Math.max(0,Math.min(99999,Number(raw)+(adjustable&&/^[+-]/.test(raw)?previous??0:0)));
}
function renderPlayCombatStats(token){
 const section=combatSection('Combat stats'),form=document.createElement('form'),fields=document.createElement('div');
 fields.className='combat-fields';
 for(const [key,title] of [['hp','HP'],['maxHp','Max HP'],['tempHp','Temp HP'],['ac','AC'],['saveDc','Save DC']]){
  const label=combatText('label',title),input=document.createElement('input');
  input.name=key;input.inputMode=key==='hp'||key==='tempHp'?'text':'numeric';
  input.value=input.dataset.synced=String(token[key]??'');label.append(input);fields.append(label);
 }
 const footer=document.createElement('div'),save=combatText('button','Apply stats'),status=combatText('span',''),conditions=document.createElement('output');
 footer.className='combat-stat-footer';save.type='submit';status.setAttribute('role','status');
 footer.append(save,status,conditions);form.append(fields,footer);
 form.onsubmit=event=>{
  event.preventDefault();
  if(playCombatStandee!==token||!playing||roomProfile?.gm===false||!tokens.includes(token))return;
  try{
   const inputs=[...form.querySelectorAll('input')],next={};
   for(const input of inputs)if(input.value!==input.dataset.synced)next[input.name]=playCombatStatValue(input.value.trim(),token[input.name],['hp','tempHp'].includes(input.name));
   const hp=Object.hasOwn(next,'hp')?next.hp:token.hp,maxHp=Object.hasOwn(next,'maxHp')?next.maxHp:token.maxHp;
   if(hp!=null&&maxHp!=null&&hp>maxHp&&(Object.hasOwn(next,'hp')||Object.hasOwn(next,'maxHp')))
    throw Error('Current HP cannot exceed max HP.');
   if(Object.keys(next).length){
    changeCombatStats(token,next);
   }
   for(const input of inputs)input.value=input.dataset.synced=String(token[input.name]??'');
   status.textContent='Stats updated.';refresh();
  }catch(error){status.textContent=error.message}
 };
 section.append(form);playCombatStats=form;return section;
}
function canUsePlayerRolls(token){
 return tokens.includes(token)&&baseStandeeRole(token)==='pc'&&!token.incognito&&
  (roomProfile?.gm===true||ownsRoomStandee(token));
}
function playerRollProfileKey(token){
 return 'battlemap.playerRollProfile.'+(token.ddbCharacterId||ddbCharacterIdFromUrl(token.ddbCharacterUrl)||token.characterRoomId||token.roomId||token.name);
}
function mergeBeyondPlayerProfile(previous,character,request){
 const source={...previous,abilities:{...previous?.abilities},skills:{...previous?.skills},saves:{...previous?.saves},actions:[...(previous?.actions||[])]};
 for(const ability of Array.isArray(character.abilities)?character.abilities:[]){
  if(!Array.isArray(ability))continue;
  const key=String(ability[1]).toLowerCase(),score=combatInteger(ability[2]);
  if(plannerAbilities.includes(key)&&score!==null)source.abilities[key]=score;
 }
 const ac=combatInteger(character.ac);
 if(ac!==null)source.ac=ac;
 const dcs=[...new Set(Object.values(character.spell_saves||{}).map(value=>combatInteger(value)).filter(value=>value!==null))];
 if(dcs.length===1)source.saveDc=dcs[0];
 if(!request)return source;
 const ability=String(request.ability??'').toLowerCase(),modifier=combatInteger(request.modifier);
 if(request.type==='saving-throw'&&plannerAbilities.includes(ability)&&modifier!==null)source.saves[ability]=modifier;
 if(request.type==='skill'&&typeof request.skill==='string'&&request.skill.trim()&&modifier!==null)
  source.skills={...source.skills,[request.skill.trim().slice(0,80)]:modifier};
 if(request.type==='initiative'){
  const initiative=combatInteger(request.initiative,request.modifier);
  if(initiative!==null)source.initiative=initiative;
 }
 if(['attack','spell-attack'].includes(request.type)&&typeof request.name==='string'&&request.name.trim()){
  const name=request.name.trim().slice(0,100);
  const action={name,toHit:combatInteger(request['to-hit']),saveDC:combatInteger(request['save-dc']),
   saveAbility:String(request['save-ability']??'').slice(0,30),
   damages:Array.isArray(request.damages)?request.damages.slice(0,12):[],
   damageTypes:Array.isArray(request['damage-types'])?request['damage-types'].slice(0,12):[]};
  if(action.toHit!==null||action.saveDC!==null||action.damages.length){
   const index=source.actions.findIndex(entry=>entry?.name===name);
   if(index<0){if(source.actions.length<100)source.actions.push(action)}
   else source.actions[index]=action;
  }
 }
 return source;
}
function learnBeyondPlayerProfile(character,request){
 const id=character?.id??character?.characterId??ddbCharacterIdFromUrl(character?.url);
 if(id==null||!/^\d+$/.test(String(id)))return;
 const token=tokens.find(token=>canUsePlayerRolls(token)&&
  String(token.ddbCharacterId||ddbCharacterIdFromUrl(token.ddbCharacterUrl)||'')===String(id));
 if(!token)return;
 const saved=loadPlayerRollProfile(token);
 const source=mergeBeyondPlayerProfile(saved?.source,character,request);
 if(canonicalSceneValue(source)===canonicalSceneValue(saved?.source))return;
 const block=plannerCombatBlock({...source,name:token.displayName||token.name});
 // Ability scores do not tell us whether a character is proficient in a save.
 block.saves=Object.fromEntries(Object.entries(block.saves).filter(([key])=>Object.hasOwn(source.saves,key)));
 try{
  localStorage.setItem(playerRollProfileKey(token),JSON.stringify({source,block,initiative:combatInteger(source.initiative)}));
 }catch{return}
 if(playCombatStandee===token&&el('playCombatDialog').open&&!el('playCombatBody').contains(document.activeElement))
  openPlayCombat(token,token.plannerCombat,activePlayerRollProfile);
}
function loadPlayerRollProfile(token){
 try{return JSON.parse(localStorage.getItem(playerRollProfileKey(token))||'null')}catch{return null}
}
function renderPlayerRollProfile(token,body,tabs,reactions,sharedBlock=token.plannerCombat){
 const saved=loadPlayerRollProfile(token);
 const session=activePlayerRollProfile;
 if(!session.record&&!session.error){
  body.append(combatText('p','Loading shared roll profile…'));
  return;
 }
 const source=session?.record?.source;
 const hasSharedCombat=source&&Object.keys(source).some(key=>key!=='spellbook');
 const profile=source?normalizePlayerRollProfile(token,hasSharedCombat?source:{...saved?.source,...source}):saved;
 const hasCombatProfile=profile&&Object.keys(profile.source).some(key=>key!=='spellbook');
 const block=(hasCombatProfile&&profile.block)||sharedBlock;
 const combat=document.createElement('div');
 body.append(combat);
 if(roomProfile?.gm===false){
  const statLine=[['HP',token.hp],['Max HP',token.maxHp??block?.maxHp],['Temp HP',token.tempHp],['AC',token.ac??block?.ac],['Save DC',token.saveDc??block?.saveDc]];
  body.append(combatText('p',statLine.map(([label,value])=>label+' '+(value??'—')).join(' · ')));
 }
 if(!block)combat.append(combatText('p','Waiting for character data from Beyond20. Roll from the linked sheet to populate this launcher.'));
 const initiative=profile?.initiative??token.initiativeModifier;
 if(Number.isInteger(initiative)){
  const formula='1d20'+(initiative>=0?'+':'')+initiative;
  combat.append(catalogButton('Roll initiative ('+formula+')',()=>{
   if(!canUsePlayerRolls(token))return;
   const roll=chatRoll(formula);
   if(!roll)return;
   sendSharedChat(playerInitiativeCard(token,roll),'public',roomProfile.gm?null:roll.total);
   if(roomProfile.gm&&captureInitiative({request:{type:'initiative',initiative},attack_rolls:[roll]},token.displayName||token.name))
    publishInitiative();
   showRolls(true);
  }));
 }
 if(token.ddbCharacterUrl&&ddbCharacterIdFromUrl(token.ddbCharacterUrl)){
  const link=combatText('a','Open character sheet');
  link.href=token.ddbCharacterUrl;link.target='_blank';link.rel='noopener noreferrer';combat.append(link);
 }
 const draft=hasCombatProfile?profile.source:{...profile?.source,initiative:token.initiativeModifier??0,abilities:{},saves:{},skills:{},actions:[]};
 const status=combatText('p',session?.error||(source?'Shared with the DM and character controllers.':
  saved?'This browser has a local profile. Save it to share it with the DM and character controllers.':
  'Save a profile to share it with the DM and character controllers.'));
 status.setAttribute('role','status');
 let saving=false;
 async function save(next,feedback=status,{preserveSpellbook=true}={}){
  if(saving||session!==activePlayerRollProfile||!canUsePlayerRolls(token))return;
  saving=true;
  try{
   if(preserveSpellbook&&source?.spellbook)next={...next,spellbook:source.spellbook};
   normalizePlayerRollProfile(token,next);
   if(!session.record)throw Error(session.error||'The shared profile is still loading. Try again in a moment.');
   if(roomProfile?.token!==session.ticket||roomState.sceneId!==session.scene)throw Error('Reopen the launcher in the active scene.');
   feedback.textContent='Saving shared profile…';
   if(canonicalSceneValue(next)!==canonicalSceneValue(session.record.source)){
    session.record=await roomRpc('player_roll_profile',{
     ticket:session.ticket,scene_key:session.scene,standee_key:token.roomId,
     profile_source:next,expected_revision:session.record.revision
    });
   }
   if(session===activePlayerRollProfile&&playCombatStandee===token&&el('playCombatDialog').open)
    openPlayCombat(token,sharedBlock,session);
  }catch(error){feedback.textContent=error.message}
  finally{saving=false}
 }
 const editor=document.createElement('details');
 editor.append(combatText('summary','Import / export roll profile JSON'));
 const input=document.createElement('textarea');
 input.rows=8;input.setAttribute('aria-label','Character roll profile JSON');
 input.value=JSON.stringify(draft,null,2);
 editor.append(input,catalogButton('Save roll profile',()=>{
  try{void save(JSON.parse(input.value))}
  catch(error){status.textContent=error.message}
 }));
 combat.append(status,playerProfileFields(draft,save,status),playerActionEditor(draft,save,status),editor);
 const spellbook=renderPlayerSpellbook(token,session,profile?.source??{},save);
 tabs.hidden=false;
 if(block){
  reactions.hidden=false;
  renderPlannerRolls(token,body,tabs,reactions,block,profile?.source?.abilities,{spellbook,combat,session});
  body.append(combat);
 }else{
  body.append(spellbook.page);
  function show(active){
   session.combatTab=active;
   combat.hidden=active==='spells';spellbook.page.hidden=!combat.hidden;
   for(const [key,button] of Object.entries(buttons))button.setAttribute('aria-pressed',String(key===active));
   if(combat.hidden)spellbook.activate();
  }
  const buttons={attack:catalogButton('Combat',()=>show('attack')),spells:catalogButton('Spells',()=>show('spells'))};
  tabs.append(...Object.values(buttons));
  show(session.combatTab==='spells'?'spells':'attack');
 }
}
function renderPlayerSpellbook(token,session,source,save){
 const page=document.createElement('div'),status=combatText('p','');
 status.setAttribute('role','status');
 const raw=source.spellbook;
 const book={spellcastingAbility:raw?.spellcastingAbility??'',spellSaveDC:raw?.spellSaveDC??null,
  spellAttackBonus:raw?.spellAttackBonus??null,spells:Array.isArray(raw?.spells)?
   raw.spells.filter(ref=>typeof ref?.spell_id==='string').map(ref=>({...ref})):[]};
 const valid=()=>session===activePlayerRollProfile&&roomProfile?.token===session.ticket&&
  roomState.sceneId===session.scene&&canUsePlayerRolls(token)&&el('playCombatDialog').open;
 const settings=combatSection('Spellcasting');
 const ability=playerProfileField(settings,'Spellcasting ability',document.createElement('select'));
 ability.add(new Option('Choose ability',''));
 for(const key of plannerAbilities)ability.add(new Option(key.toUpperCase(),key));
 ability.value=book.spellcastingAbility;
 const number=(label,value,min,max)=>{
  const input=playerProfileField(settings,label,document.createElement('input'));
  input.type='number';input.value=value??'';input.min=min;input.max=max;input.step='1';return input;
 };
 const dc=number('Spell save DC',book.spellSaveDC,1,99);
 const attack=number('Spell attack bonus',book.spellAttackBonus,-100,100);
 const picker=document.createElement('details'),results=document.createElement('div'),list=document.createElement('div');
 picker.append(combatText('summary','Add Spells'));
 const search=playerProfileField(picker,'Search by name',document.createElement('input'));
 search.type='search';
 const level=playerProfileField(picker,'Spell level',document.createElement('select'));
 level.add(new Option('All levels',''));
 const spellLevel=value=>value===0?'Cantrips':'Level '+value;
 for(let n=0;n<=9;n++)level.add(new Option(spellLevel(n),String(n)));
 const spellClass=playerProfileField(picker,'Class',document.createElement('select'));
 spellClass.add(new Option('All classes',''));
 const selected=new Set();
 const add=catalogButton('Add selected spells',()=>{
  for(const spell_id of selected)if(!book.spells.some(ref=>ref.spell_id===spell_id))
   book.spells.push({spell_id,prepared:false});
  selected.clear();render();picker.open=false;
 });
 picker.append(add,results);
 const saveButton=catalogButton('Save spellbook',async()=>{
  if(!valid())return;
  if(!dc.reportValidity()||!attack.reportValidity())return;
  book.spellcastingAbility=ability.value;
  book.spellSaveDC=dc.value===''?null:dc.valueAsNumber;
  book.spellAttackBonus=attack.value===''?null:attack.valueAsNumber;
  saveButton.disabled=true;
  try{await save({...source,spellbook:book},status,{preserveSpellbook:false})}
  finally{saveButton.disabled=!session.record}
 });
 saveButton.disabled=!session.record;
 page.append(settings,saveButton,status);
 if(session.error)status.textContent=session.error;
 const catalogStatus=combatText('p','');
 catalogStatus.setAttribute('role','status');
 page.append(catalogStatus,picker,list);
 let spells=new Map(),loaded=false,loading=false;
 const catalogArgs={ticket:session.ticket,scene_key:session.scene};
 async function load(){
  if(loading||!valid())return;
  loading=true;picker.hidden=true;
  catalogStatus.textContent='Loading spell catalog…';
  try{
   const next=new Map();
   let data;
   for(let page_offset=0;;page_offset+=250){
    data=await roomRpc('spell_catalog',{...catalogArgs,page_offset});
    if(!valid())return;
    if(!data.shared){next.clear();break}
    for(const spell of data.spells)next.set(spell.id,spell);
    if(data.spells.length<250)break;
   }
   selected.clear();spells=next;loaded=true;
   catalogStatus.textContent=data.shared?'':'The GM has not shared a spell catalog.';
   picker.hidden=!data.shared;
   const classes=[...new Set([...spells.values()].flatMap(spell=>spell.classes||[]))].sort();
   spellClass.replaceChildren(new Option('All classes',''),...classes.map(name=>new Option(name,name)));
   render();
  }catch(error){
   if(valid()){
    catalogStatus.textContent=error.message+' ';
    catalogStatus.append(catalogButton('Retry catalog',load));
   }
  }finally{loading=false}
 }
 if(roomProfile?.gm){
  const controls=document.createElement('details'),connectionStatus=combatText('p','');
  controls.append(combatText('summary','Campaign spell catalog'),
   combatText('p','Sign in to Spell Workshop in this browser, then share your catalog with players in Battlemap.'));
  async function changeSharing(operation){
   if(loading||!valid())return;
   const buttons=controls.querySelectorAll('button');
   for(const button of buttons)button.disabled=true;
   try{
    await updateCampaignSpellSharing(operation,session.ticket);
    connectionStatus.textContent=operation==='share'?'Catalog shared.':'Catalog sharing stopped.';
    await load();
   }catch(error){connectionStatus.textContent=error.message}
   finally{for(const button of buttons)button.disabled=false}
  }
  controls.append(catalogButton('Share my catalog',()=>changeSharing('share')),
   catalogButton('Stop sharing',()=>changeSharing('unshare')),connectionStatus);
  page.insertBefore(controls,picker);
 }
 function renderChoices(){
  const term=search.value.trim().toLowerCase(),owned=new Set(book.spells.map(ref=>ref.spell_id));
  const matches=[...spells.values()].filter(spell=>!owned.has(spell.id)&&spell.name.toLowerCase().includes(term)&&
   (level.value===''||spell.level===Number(level.value))&&
   (!spellClass.value||spell.classes?.includes(spellClass.value)));
  results.replaceChildren();
  for(const spell of matches.slice(0,100)){
   const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(spell.id);
   check.onchange=()=>{if(check.checked)selected.add(spell.id);else selected.delete(spell.id);updateAdd()};
   const label=combatText('label',' '+spell.name+' · '+spellLevel(spell.level));label.prepend(check);
   results.append(label,document.createElement('br'));
  }
  if(!matches.length)results.append(combatText('p','No matching spells.'));
  else if(matches.length>100)results.append(combatText('p','Showing the first 100 spells. Search or filter to narrow the list.'));
  updateAdd();
 }
 function updateAdd(){
  add.textContent=selected.size?'Add selected spells ('+selected.size+')':'Add selected spells';
  add.disabled=!selected.size;
 }
 function render(){
  list.replaceChildren();
  if(!book.spells.length)list.append(combatText('p','This character has no spells yet.'));
  const entries=book.spells.map(ref=>({ref,spell:spells.get(ref.spell_id)})).sort((a,b)=>
   (a.spell?.level??99)-(b.spell?.level??99)||(a.spell?.name??'').localeCompare(b.spell?.name??''));
  let previousLevel;
  for(const {ref,spell} of entries){
   const currentLevel=spell?.level??null;
   if(currentLevel!==previousLevel){
    list.append(combatText('h3',currentLevel===null?'Unresolved spells':spellLevel(currentLevel)));
    previousLevel=currentLevel;
   }
   const details=document.createElement('details'),name=spell?.name??ref.spell_id;
   const info=spell?[spell.school,spell.casting_time,spell.range,spell.concentration?'Concentration':'',spell.ritual?'Ritual':'',
    spell.level>0?(ref.prepared?'Prepared':'Unprepared'):''].filter(Boolean):[];
   const summary=combatText('summary',[name,...info].join(' · '));
   details.append(summary);
   list.append(details);
   if(spell){
    const controls=document.createElement('div'),diceCounts=[];
    controls.className='spellbook-controls';
    for(const [index,raw,type] of [[0,spell.damage,spell.damage_type],[1,spell.extra,spell.extra_type]]){
     const formula=combatFormula(raw,0);
     const match=formula&&validProfileDamageFormula(formula)&&/^(\d+)d(\d+)/.exec(formula);
     if(!match)continue;
     const [,quantity,sides]=match,group=document.createElement('span'),count=combatText('output','');
     const label=type||'Roll '+(index+1);
     group.className='spellbook-dice';
     group.setAttribute('role','group');
     group.setAttribute('aria-label',name+' '+label+' dice');
     const less=catalogButton('−',()=>adjust(-1)),more=catalogButton('+',()=>adjust(1));
     less.setAttribute('aria-label','Remove one '+label+' die from '+name);
     more.setAttribute('aria-label','Add one '+label+' die to '+name);
     diceCounts[index]=Number(quantity);
     function adjust(amount){
      diceCounts[index]+=amount;
      count.textContent=diceCounts[index]+'d'+sides;
      less.disabled=diceCounts[index]<=1;
      more.disabled=diceCounts[index]>=100;
     }
     adjust(0);
     group.append(combatText('span',label),less,count,more);
     controls.append(group);
    }
    controls.append(catalogButton('Cast '+name,event=>{
     if(!valid())return;
     try{castPlayerSpell(token,source,spell,dc,attack,ability,event,diceCounts);status.textContent=''}
     catch(error){status.textContent=error.message}
    }));
    list.append(controls);
    const rules=[['Target',spell.target],['Components',spell.components],['Duration',spell.duration],
     ['Damage',[spell.damage,spell.damage_type,spell.extra,spell.extra_type].filter(Boolean).join(' ')],
     ['Saving throw',spell.save_ability],['Description',spell.description],['At higher levels',spell.higher_levels],['Scaling',spell.scaling]];
    for(const [label,value] of rules)if(value){
     const row=combatText('p',label+': '+value);row.className='spell-rules';details.append(row);
    }
    if(spell.level>0){
     const prepared=document.createElement('input');prepared.type='checkbox';prepared.checked=ref.prepared===true;
     prepared.onchange=()=>{
      ref.prepared=prepared.checked;
      info[info.length-1]=ref.prepared?'Prepared':'Unprepared';
      summary.textContent=[name,...info].join(' · ');
     };
     playerProfileField(details,'Prepared',prepared);
    }
   }else details.append(combatText('p',loaded?'This spell is unavailable in the shared catalog.':'Spell details are awaiting the catalog.'));
   details.append(catalogButton('Remove spell',()=>{book.spells=book.spells.filter(item=>item!==ref);render()}));
  }
  renderChoices();
 }
 search.oninput=level.onchange=spellClass.onchange=renderChoices;
 picker.hidden=true;
 render();
 return {page,activate:()=>{if(!loaded&&!loading)void load()}};
}
function castPlayerSpell(token,source,spell,dc,attack,ability,event,diceCounts){
 if(!dc.reportValidity()||!attack.reportValidity())throw Error('Enter valid spellcasting settings.');
 const healing=spell.attack_type?.toLowerCase()==='heal';
 const entries=[],bonus=attack.value===''?null:attack.valueAsNumber,saveDC=dc.value===''?null:dc.valueAsNumber;
 if(['msak','rsak','mwak','rwak'].includes(spell.attack_type?.toLowerCase())){
  if(bonus===null)throw Error('Set this character’s spell attack bonus first.');
  entries.push({formula:'1d20'+(bonus>=0?'+':'')+bonus,type:'Attack',d20:true});
 }
 const saveAbility=spell.save_ability?.trim().toLowerCase();
 const saveName=challengeOptions.save.find(key=>key.toLowerCase()===saveAbility||key.slice(0,3).toLowerCase()===saveAbility);
 if(saveAbility&&(!saveName||saveDC===null))throw Error('Set a spell save DC and check the spell’s saving throw ability.');
 const score=combatInteger(source.abilities?.[ability.value],source.abilities?.[ability.value.toUpperCase()]);
 const mod=score===null?null:Math.floor((score-10)/2);
 const manual=[];
 for(const [index,raw,type] of [[0,spell.damage,spell.damage_type],[1,spell.extra,spell.extra_type]]){
  if(!raw)continue;
  const baseFormula=combatFormula(raw,mod),count=diceCounts[index];
  const formula=count==null?baseFormula:baseFormula?.replace(/^\d+(?=d)/,String(count));
  if(formula&&validProfileDamageFormula(formula))entries.push({formula,type:type||(healing?'Healing':'Damage'),isDamage:!healing});
  else manual.push([raw,type].filter(Boolean).join(' '));
 }
 const effect=[spell.description,spell.higher_levels&&'At higher levels: '+spell.higher_levels,
  manual.length?'Roll manually: '+manual.join(', '):''].filter(Boolean).join('\n\n');
 const limit=multiTargetSpellLimit(spell.name,spell.description||'');
 if(limit){
  if(bonus===null)throw Error('Set this character’s spell attack bonus first.');
  if(!entries.some(entry=>entry.type==='Attack'))entries.unshift({formula:'1d20'+(bonus>=0?'+':'')+bonus,type:'Attack',d20:true});
  if(spell.name.trim().toLowerCase()==='steel wind strike'&&!entries.some(entry=>entry.isDamage))
   entries.push({formula:'6d10',type:'Force',isDamage:true});
  if(entries.every(multiTargetSpellEntry)&&entries.some(entry=>entry.isDamage)){
   const card=document.createElement('li');
   card.dataset.chatName=token.displayName||token.name;
   card.dataset.chatType='attack';
   if(token.incognito)card.dataset.audience='gm';
   card.append(combatText('strong',card.dataset.chatName),combatText('h3',spell.name));
   return queueMultiTargetSpell(card,token,limit,entries,effectiveCombatRollMode(event),effect);
  }
 }
 const capture=captureAreaSpell(token,{ability:saveName?saveName.slice(0,3).toLowerCase():null,dc:saveDC,healing,
  half:areaSpellHalfDamage(spell.description)});
 if(capture?.pending.sending)throw Error('This area spell is already being sent.');
 if(capture&&!capture.spell.targets.length)throw Error('The area template has no targets. Reposition or remove it before casting.');
 if(capture)capture.pending.sending=true;
 const sent=postPlannerCombatRoll(token,spell.name,entries,saveName?'DC '+saveDC+' '+saveName+' save':'',event,effect,0,true,capture?.spell,true);
 if(capture)finishAreaSpellSend(capture.pending,sent);
}
function areaSpellHalfDamage(description){
 return /half as much (?:damage )?on a successful (?:save|one)|half (?:as much )?damage on a success/i.test(description||'');
}
function captureAreaSpell(token,mechanics){
 const template=pendingSpellTemplate(),pending=pendingAreaSpell;
 if(!template||pending.caster&&![token.roomId,token.trackingId,token.characterRoomId].includes(pending.caster))return null;
 const targets=tokens.filter(isPendingAreaTarget);
 return {pending,spell:{...mechanics,templateId:template.roomId,scene:currentSceneId,
  targets:targets.map(target=>target.roomId||(target.trackingId??=crypto.randomUUID())),
  privateResults:targets.some(target=>standeeHidden(target)||target.conditions?.includes('invisible'))
 }};
}
function finishAreaSpellSend(pending,sent){
 Promise.resolve(sent).then(result=>{
  pending.sending=false;
  if(result!==null&&pendingAreaSpell===pending){pendingAreaSpell=null;draw()}
 });
}
function normalizePlayerRollProfile(token,source){
 if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Enter a JSON object.');
 if(new TextEncoder().encode(JSON.stringify(source)).length>60000)throw Error('The profile is too large.');
 return {source,block:plannerCombatBlock({...source,name:token.displayName||token.name}),initiative:combatInteger(source.initiative)};
}
function playerProfileField(parent,name,control){
 const label=combatText('label',name+' ');
 label.append(control);parent.append(label,document.createElement('br'));
 return control;
}
function playerProfileFields(source,save,status){
 const editor=document.createElement('details');
 editor.append(combatText('summary','Edit checks, saves and initiative'));
 const number=(label,value)=>{
  const input=document.createElement('input');
  input.type='number';input.step='1';input.value=value??'';
  return playerProfileField(editor,label,input);
 };
 const initiative=number('Initiative bonus',source.initiative);
 const abilities=plannerAbilities.map(key=>[key,number(key.toUpperCase()+' score',source.abilities?.[key]??source.abilities?.[key.toUpperCase()]),
  number(key.toUpperCase()+' save bonus',source.saves?.[key]??source.saves?.[key.toUpperCase()])]);
 const skills=playerProfileField(editor,'Skills (one name and bonus per line)',document.createElement('textarea'));
 skills.rows=5;skills.placeholder='Athletics: +4';
 skills.value=Object.entries(source.skills||{}).map(([name,value])=>name+': '+value).join('\n');
 editor.append(catalogButton('Save checks and saves',()=>{
  try{
   const read=input=>{
    if(input.value==='')return null;
    if(!Number.isSafeInteger(input.valueAsNumber))throw Error('Enter whole numbers.');
    return input.valueAsNumber;
   };
   const next={...source,abilities:{},saves:{},skills:{}};
   const bonus=read(initiative);
   if(bonus===null)delete next.initiative;else next.initiative=bonus;
   for(const [key,score,saveBonus] of abilities){
    const value=read(score),modifier=read(saveBonus);
    if(value!==null)next.abilities[key]=value;
    if(modifier!==null)next.saves[key]=modifier;
   }
   const entries=skills.value.split('\n').filter(line=>line.trim()).map(line=>{
    const match=/^(.+):\s*([+-]?\d+)\s*$/.exec(line);
    if(!match||!Number.isSafeInteger(Number(match[2])))throw Error('Enter skills as Name: bonus.');
    return [match[1].trim(),Number(match[2])];
   });
   next.skills=Object.fromEntries(entries);
   void save(next);
  }catch(error){status.textContent=error.message}
 }));
 return editor;
}
function playerActionEditor(source,save,status){
 const editor=document.createElement('details');
 editor.append(combatText('summary','Add or edit combat buttons'));
 const fields=['actions','bonus_actions','reactions'];
 const existing=playerProfileField(editor,'Button',document.createElement('select'));
 existing.add(new Option('New combat button',''));
 const options=[];
 for(const key of fields)for(const [index,action] of (Array.isArray(source[key])?source[key]:[]).entries()){
  if(!action||typeof action!=='object')continue;
  existing.add(new Option((action._override?.name||action.name||'Action')+' · '+plannerActionGroups[key],String(options.length)));
  options.push({key,index,action});
 }
 const slot=playerProfileField(editor,'Category',document.createElement('select'));
 for(const key of fields)slot.add(new Option(plannerActionGroups[key],key));
 const name=playerProfileField(editor,'Button name',document.createElement('input'));
 const attack=playerProfileField(editor,'Attack bonus (optional)',document.createElement('input'));
 attack.type='number';attack.step='1';
 const damage=playerProfileField(editor,'Damage (formula and type per line, optional | condition)',document.createElement('textarea'));
 damage.rows=3;damage.placeholder='1d8+4 slashing\n1d6 fire | Failed Constitution save';
 const saves=playerProfileField(editor,'Required saves (one DC and ability per line)',document.createElement('textarea'));
 saves.rows=2;saves.placeholder='15 Constitution';
 const desc=playerProfileField(editor,'Effect and rider notes',document.createElement('textarea'));
 desc.rows=3;desc.placeholder='On a failed Constitution save, the target is poisoned.';
 const chosen=()=>existing.value===''?null:options[Number(existing.value)];
 const remove=catalogButton('Remove button',()=>void save(withoutChosen()));
 function withoutChosen(){
  const next={...source};
  const item=chosen();
  if(item)next[item.key]=source[item.key].filter((_,index)=>index!==item.index);
  return next;
 }
 existing.onchange=()=>{
  const item=chosen(),action=item?.action;
  const parsed=action?plannerCombatBlock({[item.key]:[action]}).actions[0]:null;
  slot.value=item?.key??'actions';name.value=parsed?.name??action?.name??'';
  attack.value=parsed?.attack??'';
  damage.value=(parsed?.damage||[]).map(part=>part.formula+' '+part.type+(part.condition?' | '+part.condition:'')).join('\n');
  saves.value=(parsed?.requiredSaves?.length?parsed.requiredSaves:parsed?.dc&&parsed?.save?[{dc:parsed.dc,ability:parsed.save}]:[]).map(save=>save.dc+' '+save.ability).join('\n');
  desc.value=parsed?.desc??'';remove.disabled=!item;
 };
 existing.onchange();
 editor.append(catalogButton('Save combat button',()=>{
  try{
   if(!name.value.trim())throw Error('Enter a button name.');
   const toHit=attack.value===''?null:attack.valueAsNumber;
   if(toHit!==null&&(!Number.isSafeInteger(toHit)||Math.abs(toHit)>1000))throw Error('Enter a valid attack bonus.');
   const lines=value=>value.split('\n').map(line=>line.trim()).filter(Boolean);
   const parts=lines(damage.value).map(line=>{
    const match=/^(\S+)\s+([a-z][a-z -]{0,39}?)(?:\s*\|\s*(.{1,120}))?$/i.exec(line);
    const formula=match&&combatFormula(match[1]);
    if(!formula||!validProfileDamageFormula(formula))throw Error('Enter damage as a formula and type, such as 1d8+4 slashing.');
    return {formula,type:match[2].trim(),condition:match[3]??''};
   });
   const requiredSaves=lines(saves.value).map(line=>{
    const match=/^(\d{1,2})\s+(\w+)$/.exec(line);
    const ability=match&&challengeOptions.save.find(key=>key.toLowerCase()===match[2].toLowerCase()||
     key.slice(0,3).toLowerCase()===match[2].toLowerCase());
    if(!ability||Number(match[1])<1)throw Error('Enter required saves as DC and ability, such as 15 Constitution.');
    return {dc:Number(match[1]),ability};
   });
   if(!parts.length&&!requiredSaves.length&&toHit===null&&!desc.value.trim())throw Error('Add a roll, save, or effect.');
   const next=withoutChosen(),item=chosen(),key=slot.value;
   const action={customButton:true,name:name.value.trim(),desc:desc.value.trim(),toHit,damages:parts.map(part=>part.formula),
    damageTypes:parts.map(part=>part.type),damageConditions:parts.map(part=>part.condition),requiredSaves};
   const actions=Array.isArray(next[key])?[...next[key]]:[];
   actions.splice(item?.key===key?item.index:actions.length,0,action);
   next[key]=actions;void save(next);
  }catch(error){status.textContent=error.message}
 }),remove);
 return editor;
}
function validProfileDamageFormula(formula){
 if(/^\+?\d+$/.test(formula))return Number(formula)<=99999;
 const match=/^(\d+)d(\d+)([+-]\d+)?$/.exec(formula);
 return !!match&&+match[1]>=1&&+match[1]<=100&&+match[2]>=2&&+match[2]<=1000&&Math.abs(Number(match[3]||0))<=100000;
}
function playerInitiativeCard(token,roll){
 const card=document.createElement('li');
 card.dataset.chatName=token.displayName||token.name;
 card.dataset.chatType='check';
 rollNode(card,'strong',card.dataset.chatName);
 rollNode(card,'h3','Initiative');
 rollCardResult(card,roll);
 return card;
}
let ownedCombatRequest=0,activePlayerRollProfile=null;
async function loadSharedPlayerRollProfile(token,sharedBlock,session){
 try{
  if(!session.scene||!token.roomId)throw Error('Activate the scene to load or save a shared profile.');
  session.record=await roomRpc('player_roll_profile',{
   ticket:session.ticket,scene_key:session.scene,standee_key:token.roomId
  });
 }catch(error){session.error=error.message}
 if(activePlayerRollProfile!==session||playCombatStandee!==token||!el('playCombatDialog').open||
    roomProfile?.token!==session.ticket||roomState.sceneId!==session.scene)return;
 openPlayCombat(token,sharedBlock,session);
}
async function openOwnedStandeeCombat(token){
 const scene=roomState.sceneId,profile=roomProfile;
 if(!scene||!ownsRoomStandee(token)||standeeHidden(token))return;
 const request=++ownedCombatRequest;
 const current=()=>request===ownedCombatRequest&&playing&&roomProfile===profile&&roomState.sceneId===scene?
  tokens.find(item=>item.roomId===token.roomId&&ownsRoomStandee(item)&&!standeeHidden(item)):null;
 try{
  const records=await roomRpc('standee_combat',{ticket:profile.token,scene_key:scene});
  const standee=current();
  if(standee)openPlayCombat(standee,records[standee.roomId]);
 }catch(error){
  const standee=current();
  if(standee){
   openPlayCombat(standee);
   if(!canUsePlayerRolls(standee))message('Could not load shared combat actions. '+error.message);
  }
 }
}
function openPlayCombat(token,sharedBlock=token.plannerCombat,session=null){
 if(!playing||!tokens.includes(token)||standeeHidden(token)||roomProfile?.gm===false&&!ownsRoomStandee(token))return;
 const panel=el('playCombatDialog'),body=el('playCombatBody');
 closeStandeeHud();
 playCombatStandee=selected=token;
 el('playCombatTitle').textContent=token.displayName||token.name||'Standee';
 const player=roomProfile?.gm===false;
 playCombatStats=null;
 body.replaceChildren(...(player?[]:[renderPlayCombatStats(token)]));
 const tabs=el('combatTabs'),reactions=el('combatReactions');
 tabs.replaceChildren();reactions.replaceChildren();tabs.hidden=reactions.hidden=!sharedBlock;
 if(canUsePlayerRolls(token)){
  activePlayerRollProfile=session??{ticket:roomProfile.token,scene:roomState.sceneId,record:null,error:''};
  renderPlayerRollProfile(token,body,tabs,reactions,sharedBlock);
  if(!session)void loadSharedPlayerRollProfile(token,sharedBlock,activePlayerRollProfile);
 }
 else if(sharedBlock)renderPlannerRolls(token,body,tabs,reactions,sharedBlock);
 else body.append(combatText('p','No combat actions linked.'));
 updatePlayCombatStats();
 if(!positionPlayCombat(token)){panel.close();playCombatStandee=null;return}
 if(!panel.open)panel.show();
 body.scrollTop=0;
}
const playCombatPanel=el('playCombatDialog'),playCombatHeader=el('playCombatHeader');
const combatRollModeKey='battlemap.combatRollMode';
let combatRollMode='normal';
try{
 const saved=localStorage.getItem(combatRollModeKey);
 if(saved==='advantage'||saved==='disadvantage')combatRollMode=saved;
}catch{}
let combatRollModifiers=null;
function effectiveCombatRollMode(event){
 if(event?.shiftKey&&event?.altKey)return 'normal';
 if(event?.shiftKey)return 'advantage';
 if(event?.altKey)return 'disadvantage';
 return combatRollMode;
}
function updateCombatRollMode(){
 const mode=effectiveCombatRollMode(combatRollModifiers);
 for(const button of el('combatRollMode').querySelectorAll('button'))
  button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
}
for(const button of el('combatRollMode').querySelectorAll('button'))button.onclick=()=>{
 combatRollMode=button.dataset.mode;
 try{localStorage.setItem(combatRollModeKey,combatRollMode)}catch{}
 updateCombatRollMode();
};
function trackCombatRollModifiers(event){
 const shiftKey=event.shiftKey===true,altKey=event.altKey===true;
 if(shiftKey===!!combatRollModifiers?.shiftKey&&altKey===!!combatRollModifiers?.altKey)return;
 combatRollModifiers={shiftKey,altKey};
 updateCombatRollMode();
}
window.addEventListener('keydown',trackCombatRollModifiers,true);
window.addEventListener('keyup',trackCombatRollModifiers,true);
window.addEventListener('pointerdown',trackCombatRollModifiers,true);
window.addEventListener('blur',()=>trackCombatRollModifiers({}));
updateCombatRollMode();
el('playCombatClose').onclick=()=>{playCombatStandee=null;playCombatPanel.close()};
playCombatPanel.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!facingTarget){event.stopPropagation();el('playCombatClose').click()}
});
let playCombatDrag=null;
playCombatHeader.onpointerdown=event=>{
 if(event.button!==0||event.target.closest('button'))return;
 const rect=playCombatPanel.getBoundingClientRect();
 playCombatDrag={id:event.pointerId,x:event.clientX-rect.left,y:event.clientY-rect.top};
 playCombatHeader.setPointerCapture(event.pointerId);
};
playCombatHeader.onpointermove=event=>{
 if(playCombatDrag?.id!==event.pointerId)return;
 const panel=playCombatPanel.getBoundingClientRect();
 const left=Math.max(0,Math.min(innerWidth-panel.width,event.clientX-playCombatDrag.x));
 const top=Math.max(0,Math.min(innerHeight-panel.height,event.clientY-playCombatDrag.y));
 if(playCombatStandee&&combatPanelOverlaps({left,right:left+panel.width,top,bottom:top+panel.height},playCombatTokenBounds(playCombatStandee)))return;
 playCombatPanel.style.left=left+'px';
 playCombatPanel.style.top=top+'px';
};
playCombatHeader.onlostpointercapture=()=>{playCombatDrag=null};
window.addEventListener('resize',()=>{if(playCombatStandee&&playCombatPanel.open)positionPlayCombat(playCombatStandee)});
function openPlannerCombat(token){
 if(playing){openPlayCombat(token);return}
 if(roomProfile?.gm===false||!tokens.includes(token))return;
 const dialog=el('plannerCombatDialog'),body=el('plannerCombatBody');
 body.replaceChildren();
 el('plannerCombatTitle').textContent=(token.displayName||token.name)+ ' · Combat Stats';
 renderPlannerStats(token,body);
 dialog.showModal();
}
function renderPlannerStats(token,body){
 const dialog=el('plannerCombatDialog'),link=token.plannerMonster;
 const section=combatSection('Session Planner Canvas'),status=combatText('p',
  link?'Linked to '+(token.plannerCombat?.name||'monster')+'. Save your Planner changes before refreshing.':token.plannerCombat?'Using an imported stat block. Choose a saved Planner monster to replace it.':'Choose an encounter monster from a saved session.');
 status.setAttribute('role','status');
 const actions=document.createElement('div');
 let busy=false;
 const available=()=>dialog.open&&body.contains(section)&&tokens.includes(token)&&!playing&&roomProfile?.gm!==false;
 const run=async action=>{
  if(busy||!available())return;
  busy=true;section.disabled=true;status.textContent='Loading from Session Planner Canvas…';
  try{await action()}catch(error){if(available())status.textContent=error.message}
  finally{busy=false;section.disabled=false}
 };
 const sync=(all)=>run(async()=>{
  const options=await plannerMonsters(link.sessionId);
  if(!available())return;
  const item=options.find(option=>samePlannerMonster(option.link,link));
  if(!item)throw Error('The linked encounter monster is missing. Choose another monster to relink.');
  const targets=all?tokens.filter(t=>samePlannerMonster(t.plannerMonster,link)):[token];
  const block=plannerCombatBlock(item.row);
  if(!await commitCombatImport(targets,link,block))return;
  status.textContent='Refreshed '+targets.length+(targets.length===1?' standee.':' matching standees.');
 });
 if(link)actions.append(catalogButton('Refresh this standee',()=>sync(false)),
  catalogButton('Refresh all matching',()=>sync(true)),catalogButton('Unlink',()=>run(async()=>{
   if(await commitCombatImport([token],null,null)&&available()){body.replaceChildren();renderPlannerStats(token,body)}
  })));
 const sessions=document.createElement('select'),monsters=document.createElement('select');
 sessions.setAttribute('aria-label','Planner session');
 monsters.setAttribute('aria-label','Encounter monster');
 sessions.hidden=monsters.hidden=true;
 let choices=[];
 const confirm=catalogButton('Link selected monster',()=>run(async()=>{
  const item=choices[monsters.value];
  if(!item)return;
  if(await commitCombatImport([token],item.link,plannerCombatBlock(item.row))&&available()){
   body.replaceChildren();renderPlannerStats(token,body);
  }
 }));
 confirm.hidden=true;
 sessions.onchange=()=>run(async()=>{
  choices=[];monsters.hidden=confirm.hidden=true;
  if(sessions.value)choices=await plannerMonsters(sessions.value);
  if(!available())return;
  monsters.replaceChildren(...choices.map((item,i)=>new Option(item.label,i)));
  monsters.hidden=confirm.hidden=!choices.length;
  status.textContent=choices.length?'Select the encounter monster to link.':'No linked monster stat blocks were found in that session.';
 });
 actions.append(catalogButton(link?'Choose another monster':'Find encounter monster',()=>run(async()=>{
  const rows=await plannerRead('sessions','select=id,title&order=session_date.desc.nullslast,title.asc');
  if(!available())return;
  sessions.replaceChildren(new Option('Choose a session',''),...rows.map(row=>new Option(row.title||'Untitled session',row.id)));
  sessions.hidden=false;monsters.hidden=confirm.hidden=true;
  status.textContent=rows.length?'Select a saved Planner session.':'No saved Planner sessions are visible to this account.';
 })));
 section.append(actions,sessions,monsters,confirm,status);
 body.append(section);
 renderDdbImport(token,body);
 if(!link&&!token.ddbMonsterSource&&!token.plannerCombat)renderCombatPainter(token,body);
}
function renderCombatPainter(source,body){
 const section=combatSection('Paint HP, DC and AC');
 const targets=tokens.filter(t=>t!==source&&!t.plannerCombat&&!t.plannerMonster);
 const readout=()=>['hp','saveDc','ac'].map((key,i)=>['HP','DC','AC'][i]+' '+(source[key]??'—')).join(' · ');
 const list=document.createElement('div'),status=combatText('p',readout());
 status.setAttribute('role','status');
 list.style.cssText='max-height:12rem;overflow:auto';
 const options=targets.map(target=>{
  const input=document.createElement('input'),label=document.createElement('label');
  input.type='checkbox';
  label.append(input,document.createTextNode(' '+(target.displayName||target.name)+' ('+(target.x+1)+', '+(target.y+1)+')'));
  list.append(label);return {input,target};
 });
 const paint=catalogButton('Paint selected standees',()=>{
  if(playing||roomProfile?.gm===false||!tokens.includes(source)||source.plannerMonster)return;
  const chosen=options.filter(({input,target})=>input.checked&&tokens.includes(target)&&!target.plannerMonster&&!target.plannerCombat).map(({target})=>target);
  if(!chosen.length){status.textContent='Select at least one standee.';return}
  const pools=new Set(chosen.map(t=>t.hpPoolId).filter(Boolean));
  const hpTargets=tokens.filter(t=>chosen.includes(t)||pools.has(t.hpPoolId));
  if(hpTargets.some(t=>t.plannerMonster||t.plannerCombat||!chosen.includes(t))||
   hpTargets.some(t=>source.hp!=null&&t.maxHp!=null&&source.hp>t.maxHp)){
   status.textContent='Select every member of a shared HP pool and ensure each target’s max HP can hold the painted HP.';
   return;
  }
  remember();
  for(const target of chosen)for(const key of ['hp','saveDc','ac']){
   if(source[key]==null)delete target[key];else target[key]=source[key];
  }
  refresh();
  status.textContent='Painted '+chosen.length+(chosen.length===1?' standee.':' standees.');
 });
 paint.disabled=!options.length;
 section.append(status,list,paint);body.append(section);
}
function plannerRollFormula(formula,diceMultiplier=1){
 const flat=combatInteger(formula);
 return /^[+-]?\d+$/.test(String(formula))&&flat!==null?
  {formula:String(flat),total:flat,dice:[],modifier:0}:chatRoll(formula,diceMultiplier);
}
function postPlannerCombatRoll(token,label,entries,save='',event,effect='',mobCount=0,captureTarget=false,areaSpell=null,spellDescription=false){
 if(!playing||!tokens.includes(token)||standeeHidden(token)||roomProfile?.gm===false&&!ownsRoomStandee(token))return;
 const card=document.createElement('li');
 const audience=token.incognito||mobCount>0&&trackedTarget(token)?.incognito?'gm':'public';
 card.dataset.chatName=token.displayName||token.name;
 card.dataset.chatType=entries.some(entry=>entry.type==='Attack')?'attack':label.startsWith('Saving throws')||save?'save':label.includes('checks')?'check':entries.length?'dice':'text';
 if(audience==='gm')card.dataset.audience='gm';
 card.append(combatText('strong',token.displayName||token.name),combatText('h3',label));
 if(save)rollNode(card,'div','Target must make: '+save,'combat-required-saves');
 if(spellDescription)addChatSpellDescription(card,effect);
 else if(effect)rollNode(card,'p',effect);
 const offensive=save||entries.some(entry=>entry.type==='Attack'||entry.isDamage);
 if(areaSpell){
  card.dataset.areaSpell=JSON.stringify(areaSpell);
  rollNode(card,'p','Area template cast');
 }else if(captureTarget&&offensive||roomProfile?.gm!==false&&(mobCount>0||standeeRole(token)==='enemy'&&offensive)){
  const target=trackedTarget(token);
  if(target&&(captureTarget||mobCount>0||standeeRole(target)==='pc')&&(!target.incognito||audience==='gm')&&(!captureTarget||!standeeHidden(target))){
   rollNode(card,'p','Target: '+(target.displayName||target.name),'combat-roll-target');
   card.dataset.rollTargetId=target.roomId||target.trackingId||'';
  }
 }
 if(mobCount>0){
  rollNode(card,'p',mobCount+' attack'+(mobCount===1?'':'s'),'combat-mob-count');
  for(let index=1;index<=mobCount;index++){
   const attack=rollNode(card,'details',null,'combat-mob-attack');
   attack.dataset.chatName=card.dataset.chatName;
   attack.dataset.chatType='attack';
   if(card.dataset.rollTargetId)attack.dataset.rollTargetId=card.dataset.rollTargetId;
   const summary=combatText('summary','Attack '+index);
   attack.append(summary);
   if(save)rollNode(attack,'div','Target must make: '+save,'combat-required-saves');
   renderPlannerRollResults(attack,entries,event);
   const hit=attack.querySelector('.roll-grid > .roll-result:not(.discarded) .roll-total')?.textContent;
   const damage=rollDamageAmount(attack);
   if(attack.querySelector('.roll-critical'))summary.textContent+=' · Critical hit';
   else if(hit)summary.textContent+=' · '+hit+' to hit';
   if(damage!==null)summary.textContent+=' · '+damage+' damage rolled';
  }
 }else renderPlannerRollResults(card,entries,event);
 const sent=roomProfile?sendSharedChat(card,audience):appendChatCard(card);
 showRolls(true);queueRecovery();
 return sent;
}
function renderPlannerRollResults(card,entries,event,mode=effectiveCombatRollMode(event)){
 const grid=rollNode(card,'div',null,'roll-grid');
 const damage=rollNode(card,'div',null,'roll-card-damage');
 let critical=false;
 for(const {formula,type,d20,isDamage} of entries){
  if(isDamage)continue;
  const roll=plannerRollFormula(formula);
  if(!roll)continue;
  const rolls=[roll];
  const advantage=mode==='advantage'||mode==='super-advantage';
  if(d20&&mode!=='normal'){
   const count=mode.startsWith('super-')?2:1;
   for(let index=0;index<count;index++)rolls.push(chatRoll(formula));
  }
  const kept=rolls.reduce((best,next)=>(advantage?next.total>best.total:next.total<best.total)?next:best);
  rolls.forEach((result,index)=>rollCardResult(grid,{...result,discarded:result!==kept},
   index?(advantage?'Advantage':'Disadvantage'):type));
  if(type==='Attack'&&natural20(kept))critical=true;
 }
 if(critical)markCritical(grid);
 let damageTotal=0,hasDamage=false;
 for(const {formula,type,isDamage,condition} of entries){
  if(!isDamage)continue;
  const roll=plannerRollFormula(formula,critical?2:1);
  if(!roll)continue;
  const result={...roll,total:Math.max(0,roll.total)};
  rollCardResult(damage,result,condition?type+' · '+condition:type);
  if(condition)damage.lastElementChild.classList.add('combat-conditional-damage');
  else damageTotal+=result.total;
  hasDamage=true;
 }
 if(hasDamage)rollCardResult(card,{total:damageTotal},entries.some(entry=>entry.condition)?'Damage before riders':'Total damage',true);
}
function combatRollTable(title,columns){
 const table=document.createElement('table');
 table.className='combat-roll-table';
 table.createCaption().textContent=title;
 const header=table.createTHead().insertRow();
 for(const name of columns){const cell=combatText('th',name);cell.scope='col';header.append(cell)}
 return {table,rows:table.createTBody()};
}
function combatDiceMentions(text){
 return [...text.matchAll(/(?<![\w.])(?:[1-9]\d?|100)?d(?:[2-9]|[1-9]\d{1,2}|1000)(?!\w)(?:[ \t]*[+−-][ \t]*\d{1,5}(?!\w))?/gi)]
  .map(match=>({index:match.index,text:match[0],formula:match[0].replace(/\s/g,'').replace('−','-').replace(/^d/i,'1d')}));
}
function combatDescription(token,action){
 const p=document.createElement('p');
 let start=0;
 for(const {index,text,formula} of combatDiceMentions(action.desc)){
  p.append(document.createTextNode(action.desc.slice(start,index)));
  const button=catalogButton(text,event=>postPlannerCombatRoll(token,action.name,[{formula,type:'Dice'}],'',event));
  button.className='combat-die';button.title='Roll '+formula;p.append(button);
  start=index+text.length;
 }
 p.append(document.createTextNode(action.desc.slice(start)));return p;
}
function renderPlannerRolls(token,body,tabs,reactions,block=token.plannerCombat,abilityScores,playerTabs){
 if(!block)return;
 const signed=bonus=>(bonus>=0?'+':'')+bonus,d20=bonus=>'1d20'+signed(bonus);
 const pages=Object.fromEntries(['skill','attack','bonus'].map(key=>[key,document.createElement('section')]));
 if(playerTabs)pages.spells=playerTabs.spellbook.page;
 body.append(...Object.values(pages));
 const keys=[...new Set([...Object.keys(block.checks||{}),...Object.keys(block.saves||{})])];
 const rollCell=(row,bonus,label,name)=>{
  const cell=row.insertCell();
  if(bonus==null){cell.textContent='—';return}
  const button=catalogButton(signed(bonus),event=>
   postPlannerCombatRoll(token,label+' · '+(challengeOptions.save.find(ability=>ability.slice(0,3).toUpperCase()===name)||name),[{formula:d20(bonus),type:name,d20:true}],'',event));
  button.setAttribute('aria-label',name+' '+label.toLowerCase()+' '+signed(bonus));
  button.title='Shift for advantage, Alt for disadvantage';cell.append(button);
 };
 if(keys.length){
  const {table,rows}=combatRollTable('Ability checks and saves',['Ability','Check','Save']);
  for(const key of [...plannerAbilities.filter(key=>keys.includes(key)),...keys.filter(key=>!plannerAbilities.includes(key))]){
   const row=rows.insertRow(),name=key.toUpperCase();
   const score=abilityScores?.[key];
   row.insertCell().textContent=score==null?name:name+' '+score;
   rollCell(row,block.checks?.[key],'Ability checks',name);
   rollCell(row,block.saves?.[key],'Saving throws',name);
  }
  pages.skill.append(table);
 }
 const skills=Object.entries(block.skills||{});
 if(skills.length){
  const {table,rows}=combatRollTable('Skills',['Skill','Check']);
  for(const [name,bonus] of skills){const row=rows.insertRow();row.insertCell().textContent=name;rollCell(row,bonus,'Skill checks',name)}
  pages.skill.append(table);
 }
 const groups=new Map();
 const mob=roomProfile?.gm!==false?document.createElement('input'):null;
 if(mob){
  mob.type='number';mob.min='0';mob.max='10';mob.step='1';mob.value='0';mob.style.width='4em';
  mob.setAttribute('aria-label','Mob attack count');
 }
 for(const action of block.actions||[]){
  if(!groups.has(action.group)){
   const group=combatRollTable(action.group,['Action','Attack / save','Damage']);
   if(mob&&String(action.group).toLowerCase()==='actions'){
    const label=combatText('label',' · Mob ');
    label.append(mob);group.table.caption.append(label);
   }
   groups.set(action.group,group);
  }
  const row=groups.get(action.group).rows.insertRow(),name=row.insertCell(),mechanic=row.insertCell(),damageCell=row.insertCell(),entries=[];
  if(action.attack!=null)entries.push({formula:d20(action.attack),type:'Attack',d20:true});
  const damage=(action.damage||[]).map(entry=>({...entry,isDamage:true}));
  const save=(action.requiredSaves?.length?action.requiredSaves:action.dc==null?[]:[{dc:action.dc,ability:action.save}])
   .map(({dc,ability})=>'DC '+dc+' '+ability+' save').join(' · ');
  const rollAction=(event,attackOnly=false)=>{
   const count=mob?.isConnected&&String(action.group).toLowerCase()==='actions'&&action.attack!=null?mob.valueAsNumber||0:0;
   if(count&&(!Number.isInteger(count)||count<0||count>10)){mob.reportValidity();return}
   if(count>0&&!trackedTarget(token)){message('Set a target before rolling a mob attack.');return}
   postPlannerCombatRoll(token,action.name,attackOnly&&!count?entries:[...entries,...damage],
    attackOnly&&!count?'':save,event,!attackOnly&&action.customButton?action.desc:'',count);
  };
  const alternatives=!action.customButton&&(action.desc?.match(/(?:^|\n|\.\s+)\d+[.:]\s*/g)||[]).length>1;
  if(!alternatives&&(entries.length||save||damage.length||action.customButton&&action.desc)){
   name.append(catalogButton(action.name,event=>rollAction(event)));
  }else name.append(combatText('strong',action.name));
  if(alternatives){mechanic.textContent='Varies by effect';damageCell.textContent='See description'}
  else{
   if(action.attack!=null)mechanic.append(catalogButton(signed(action.attack)+' to hit',event=>rollAction(event,true)));
   if(save)mechanic.append(combatText('div',save));
   if(!mechanic.children.length)mechanic.textContent='—';
   for(const entry of damage)damageCell.append(catalogButton(entry.formula+' '+entry.type+(entry.condition?' · '+entry.condition:''),event=>postPlannerCombatRoll(token,action.name,[{...entry,condition:''}],'',event)));
   if(!damage.length)damageCell.textContent='—';
  }
  if(action.desc){
   const details=document.createElement('details');
   details.open=alternatives;details.append(combatText('summary','Description'),combatDescription(token,action));
   name.append(details);
  }
 }
 for(const [name,{table}] of groups){
  const kind=String(name).toLowerCase();
  (kind.includes('reaction')?reactions:kind.includes('bonus')?pages.bonus:pages.attack).append(table);
 }
 if(!reactions.children.length)reactions.append(combatText('p','No reactions listed.'));
 const labels={skill:'Skills / saves',attack:'Attacks',bonus:'Bonus actions',spells:'Spells'};
 const buttons={};
 const show=active=>{
  for(const [key,panel] of Object.entries(pages)){
   panel.hidden=key!==active;buttons[key].setAttribute('aria-pressed',String(key===active));
  }
  if(playerTabs){
   playerTabs.session.combatTab=active;
   playerTabs.combat.hidden=reactions.hidden=active==='spells';
   if(active==='spells')playerTabs.spellbook.activate();
  }
  body.scrollTop=0;
 };
 const preferred=playerTabs?.session.combatTab;
 const initial=Object.hasOwn(pages,preferred)?preferred:pages.attack.children.length?'attack':'skill';
 for(const [key,panel] of Object.entries(pages)){
  if(!panel.children.length)panel.append(combatText('p','No '+labels[key].toLowerCase()+' listed.'));
  buttons[key]=catalogButton(labels[key],()=>show(key));tabs.append(buttons[key]);
 }
 show(initial);
}

const battlemapImageKey='battlemap.imageManager.v1';
let managedImages=[],managedFolders=[],managedFolder='',imageJobs=[],imageManagerBusy=false,imageChoice=null,imageCatalogBusy=false;
let imagePushText='',imagePushDismissed=false;
function renderImagePush(){
 el('imagePushNotice').hidden=playing||roomProfile?.gm===false||!imagePushText||imagePushDismissed;
 if(el('imagePushStatus').textContent!==imagePushText)el('imagePushStatus').textContent=imagePushText;
}
el('dismissImagePush').onclick=()=>{imagePushDismissed=true;renderImagePush()};
function showManagedImages(choose=null){
 imageChoice=choose;
 el('managedImageUploadLabel').hidden=el('managedFolderControls').hidden=!!choose;
 el('managedImageStatus').textContent='';
 el('managedExportCatalog').hidden=!!choose;
 renderManagedImages();
 el('managedImageDialog').showModal();
}
function imageFolderOptions(){
 return [new Option('All images / root',''),...managedFolders.map(folder=>new Option(folder,folder))];
}
async function saveManagedCatalog(images,folders){
 if(!await storeValue(battlemapImageKey,{images,folders}))throw Error('Could not save the image catalog.');
 managedImages=images;managedFolders=folders;
}
async function editManagedCatalog(action){
 if(imageManagerBusy||imageCatalogBusy)return;
 imageCatalogBusy=true;renderManagedImages();
 try{await action();el('managedImageStatus').textContent=''}
 catch(error){el('managedImageStatus').textContent=error.message}
 finally{imageCatalogBusy=false;renderManagedImages()}
}
function managedName(label,current=''){
 const name=prompt(label,current)?.trim();
 if(name&&(/[\/]/.test(name)||name.length>80))throw Error('Use a name of 80 characters or fewer without slashes.');
 return name;
}
function renderManagedImages(){
 const list=el('managedImageList'),folder=el('managedFolder'),locked=imageManagerBusy||imageCatalogBusy;
 folder.replaceChildren(...imageFolderOptions());folder.value=managedFolder;
 list.replaceChildren();
 for(const job of imageChoice?[]:imageJobs){
  const row=document.createElement('div');
  const rename=catalogButton('Rename',()=>{
   try{job.name=managedName('Image name',job.name)||job.name;renderManagedImages()}
   catch(error){el('managedImageStatus').textContent=error.message}
  });
  const remove=catalogButton('Remove from queue',()=>{imageJobs=imageJobs.filter(item=>item!==job);renderManagedImages()});
  rename.disabled=remove.disabled=locked;
  row.append(combatText('span',job.name+' — '+job.status),rename,remove);list.append(row);
 }
 for(const item of managedImages.filter(item=>!managedFolder||item.folder===managedFolder)){
  const row=document.createElement('div'),image=document.createElement('img');
  image.src=item.url;image.alt='';image.loading='lazy';
  row.append(image);
  if(imageChoice)row.append(catalogButton(item.name,()=>{
   const choose=imageChoice;el('managedImageDialog').close();choose(item.url);
  }));
  else{
   const rename=catalogButton('Rename',()=>editManagedCatalog(async()=>{
    const name=managedName('Image name',item.name);
    if(name)await saveManagedCatalog(managedImages.map(entry=>entry===item?{...entry,name}:entry),managedFolders);
   }));
   const move=document.createElement('select');move.setAttribute('aria-label','Move '+item.name+' to folder');
   move.replaceChildren(...imageFolderOptions());move.options[0].textContent='Root';move.value=item.folder||'';
   move.onchange=()=>{
    const destination=move.value;
    editManagedCatalog(()=>saveManagedCatalog(managedImages.map(entry=>entry===item?{...entry,folder:destination}:entry),managedFolders));
   };
   rename.disabled=move.disabled=locked;
   row.append(combatText('span',item.name),rename,move);
  }
  list.append(row);
 }
 if(!list.children.length)list.textContent='No images here yet.';
 el('managedExportCatalog').disabled=locked||roomProfile?.gm===false;
 el('managedImageRetry').disabled=locked||!imageJobs.length||!roomProfile?.gm;
 el('managedImageFiles').disabled=locked||!roomProfile?.gm;
 el('managedFolderCreate').disabled=locked;
 el('managedFolderRename').disabled=el('managedFolderDelete').disabled=locked||!managedFolder;
}
el('managedExportCatalog').onclick=()=>exportArtworkCatalog('managedImageStatus').catch(error=>{el('managedImageStatus').textContent='Export failed: '+error.message});
el('managedFolder').onchange=event=>{managedFolder=event.target.value;renderManagedImages()};
el('managedFolderCreate').onclick=()=>editManagedCatalog(async()=>{
 const name=managedName('Folder name');
 if(!name)return;
 const path=managedFolder?managedFolder+'/'+name:name;
 if(managedFolders.includes(path))throw Error('A folder with that name already exists.');
 await saveManagedCatalog(managedImages,[...managedFolders,path].sort());
 managedFolder=path;
});
el('managedFolderRename').onclick=()=>editManagedCatalog(async()=>{
 const path=managedFolder,parts=path.split('/'),name=managedName('Folder name',parts.pop());
 if(!name)return;
 const next=[...parts,name].join('/');
 if(next===path)return;
 if(managedFolders.includes(next))throw Error('A folder with that name already exists.');
 const rename=folder=>folder===path||folder?.startsWith(path+'/')?next+folder.slice(path.length):folder;
 await saveManagedCatalog(managedImages.map(item=>({...item,folder:rename(item.folder)})),managedFolders.map(rename).sort());
 for(const job of imageJobs)job.folder=rename(job.folder);
 managedFolder=next;
});
el('managedFolderDelete').onclick=()=>editManagedCatalog(async()=>{
 const path=managedFolder;
 if(managedImages.some(item=>item.folder===path)||imageJobs.some(job=>job.folder===path)||managedFolders.some(folder=>folder.startsWith(path+'/')))
  throw Error('Move images and remove subfolders before deleting this folder.');
 await saveManagedCatalog(managedImages,managedFolders.filter(folder=>folder!==path));
 managedFolder=path.split('/').slice(0,-1).join('/');
});
async function prepareManagedImage(file){
 if(file.size>5000000||!['image/png','image/jpeg','image/webp'].includes(file.type))
  throw Error('Choose a PNG, JPEG or WebP up to 5 MB.');
 const image=await createImageBitmap(file);
 try{
  if(image.width>6000||image.height>6000)throw Error('Image dimensions exceed 6,000 pixels.');
  const factor=Math.min(1,1024/Math.max(image.width,image.height));
  const surface=document.createElement('canvas');
  surface.width=Math.max(1,Math.round(image.width*factor));
  surface.height=Math.max(1,Math.round(image.height*factor));
  surface.getContext('2d').drawImage(image,0,0,surface.width,surface.height);
  const data=surface.toDataURL('image/webp',.85);
  if(!uploadedStandeeImage(data))throw Error('Image could not be compressed for upload.');
  return data;
 }finally{image.close()}
}
async function uploadManagedImages(jobs){
 if(imageManagerBusy||imageCatalogBusy||!roomProfile?.gm||!jobs.length)return;
 imageManagerBusy=true;
 imagePushDismissed=false;
 let completed=0,failed=0;
 const updatePush=stage=>{
  imagePushText='Image push · '+completed+' of '+jobs.length+' uploaded'+(failed?' · '+failed+' failed':'')+' · '+stage;
  renderImagePush();
  el('managedImageStatus').textContent=imagePushText;
 };
 updatePush('Starting');
 renderManagedImages();
 for(const job of jobs){
  job.failed=false;job.status='Queued';
 }
 try{
  for(let i=0;i<jobs.length;i+=2){
   const batch=jobs.slice(i,i+2),prepared=[];
   for(const job of batch){
    try{
     if(!job.url)prepared.push({job,data:await prepareManagedImage(job.file)});
     job.status='Uploading';
    }catch(error){job.failed=true;job.status=error.message}
   }
   renderManagedImages();
   updatePush('Uploading batch '+(Math.floor(i/2)+1));
   try{
    if(prepared.length){
     const urls=await hostStandeeImages(prepared.map(item=>item.data),el('managedImageRetry'),{set textContent(value){if(value)updatePush(value)}});
     prepared.forEach(({job},index)=>job.url=urls[index]);
    }
    const saved=batch.filter(job=>job.url);
    if(saved.length){
     const next=[...managedImages,...saved.map(job=>({url:job.url,name:job.name,folder:job.folder}))];
     await saveManagedCatalog(next,managedFolders);
     completed+=saved.length;
     imageJobs=imageJobs.filter(job=>!saved.includes(job));
    }
   }catch(error){
    for(const job of batch.filter(job=>!job.failed)){job.failed=true;job.status=error.message}
   }
   failed+=batch.filter(job=>job.failed).length;
   renderManagedImages();
  }
 }finally{imageManagerBusy=false;renderManagedImages();updatePush(failed?'Finished with errors. Reopen Image Manager to retry.':'Complete')}
}
function chooseManagedLook(side){
 if(!artDraft)return;
 const draft=artDraft,index=draft.index;
 showManagedImages(url=>{
  if(artDraft!==draft||!el('standeeArtDialog').open)return;
  if(draft.index!==index)return;
  el(side==='front'?'artFront':'artBack').value=url;
  if(side==='back'){el('sameStandeeImage').checked=false;updateSameStandeeImage()}
  el('artError').textContent='Image selected. Apply the standee changes to save it.';
 });
}
function renderManagedPin(){
 const image=el('journalManagedPreview');
 image.hidden=!journalDraft?.image;
 if(image.hidden)image.removeAttribute('src');else image.src=journalDraft.image;
 el('journalManagedRemove').hidden=image.hidden;
}
function ddbMonsterPath(value){
 const url=new URL(value.trim());
 if(url.protocol!=='https:'||!['www.dndbeyond.com','dndbeyond.com'].includes(url.hostname)||
  url.username||url.password||url.port||!/^\/monsters\/\d{1,12}-[a-z0-9-]{1,140}\/?$/i.test(url.pathname))
  throw Error('Enter a D&D Beyond monster page URL.');
 return url.pathname.replace(/\/$/,'');
}
const ddbSections={'Traits':'special_abilities','Actions':'actions','Bonus Actions':'bonus_actions',
 'Reactions':'reactions','Legendary Actions':'legendary_actions','Lair Actions':'lair_actions',
 'Mythic Actions':'mythic_actions'};
function readDdbMonster(html,text){
 const template=document.createElement('template');
 if(html)template.innerHTML=html;
 const root=template.content.querySelector('.mon-stat-block-2024,.mon-stat-block')||template.content;
 const getText=node=>node?.textContent.trim().replace(/[−–]/g,'-')||'';
 const $=selector=>root.querySelector(selector);
 const plain=(text||getText(root)).replace(/[−–]/g,'-');
 const name=getText($('[class$="__name"]'))||
  plain.split(/\r?\n/).map(line=>line.trim()).find(Boolean);
 const row={name,abilities:{},saves:{},skills:{}};
 for(const item of root.querySelectorAll('[class$="__attribute"],[class$="__tidbit"]')){
  const label=getText(item.querySelector('[class$="attribute-label"],[class$="tidbit-label"]'));
  const value=getText(item.querySelector('[class$="attribute-data-value"],[class$="attribute-data"],[class$="tidbit-data"]'));
  if(['AC','Armor Class'].includes(label))row.ac=combatInteger(value);
  if(['HP','Hit Points'].includes(label))row.hp=combatInteger(value);
 }
 row.ac??=combatInteger(plain.match(/\b(?:AC|Armor Class)\s+(\d+)/i)?.[1]);
 row.hp??=combatInteger(plain.match(/\b(?:HP|Hit Points)\s+(\d+)/i)?.[1]);
 if(!name||row.ac==null||row.hp==null)throw Error('Copy the full stat block, starting with the monster name and including AC and HP.');
 for(const line of root.querySelectorAll('tbody tr')){
  const cells=[...line.cells].map(getText),key=cells[0]?.toLowerCase();
  if(!plannerAbilities.includes(key))continue;
  row.abilities[key]=combatInteger(cells[1]);
  const save=combatInteger(cells[3]);if(save!==null)row.saves[key]=save;
 }
 for(const key of plannerAbilities){
  const ability=plain.match(new RegExp('\\b'+key+'\\s+(\\d{1,2})\\s*\\(?([+-]\\d+)\\)?(?:\\s+([+-]\\d+))?','i'));
  if(ability){
   row.abilities[key]??=Number(ability[1]);
   if(ability[3])row.saves[key]??=Number(ability[3]);
  }
 }
 for(const match of plain.matchAll(/\b(STR|DEX|CON|INT|WIS|CHA)\s*([+-]\d+)/g))
  row.saves[match[1].toLowerCase()]??=Number(match[2]);
 const skillLine=plain.match(/\bSkills\s+([^\n]+?)(?=\s+(?:Senses|Languages|Resistances|Immunities|CR)\b|\n|$)/i);
 for(const skill of skillLine?.[1].matchAll(/([A-Za-z][A-Za-z ]+?)\s*([+-]\d+)/g)||[])row.skills[skill[1].trim()]=Number(skill[2]);
 const add=(group,line,title,element)=>{
  const desc=line.replace(/\s+/g,' ').trim();
  const match=title?null:desc.match(/^(.{1,110}?)[.!](?:\s|$)/);
  const action=title||match?.[1];
  if(!action)return;
  const attack=element?.querySelector('[data-rolltype="to hit"]');
  const damage=[...element?.querySelectorAll('[data-rolltype="damage"]')||[]];
  const save=desc.match(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC (\d+)/i);
  (row[group]??=[]).push({name:action.replace(/\.$/,''),desc,
   toHit:combatInteger(getText(attack),desc.match(/Attack Roll:\s*([+-]\d+)/i)?.[1]),
   damages:damage.map(node=>node.dataset.dicenotation),
   damageTypes:damage.map(node=>node.dataset.rolldamagetype),
   saveAbility:save?.[1],saveDC:save?.[2]});
 };
 for(const section of root.querySelectorAll('[class$="__description-block"]')){
  const title=getText(section.querySelector('[class$="__description-block-heading"]'));
  for(const p of section.querySelectorAll('p')){
   const heading=p.querySelector('strong')||p.querySelector('em');
   const label=getText(heading).split(/\.\s/)[0];
   if(label)add(Object.hasOwn(ddbSections,title)?ddbSections[title]:'special_abilities',getText(p),label,p);
  }
 }
 if(!Object.keys(ddbSections).some(key=>row[ddbSections[key]]?.length)){
  let group='special_abilities';
  for(const line of plain.split(/\r?\n/).map(line=>line.trim())){
   if(Object.hasOwn(ddbSections,line)){group=ddbSections[line];continue}
   if(line&&(/\b(?:to hit|attack roll|saving throw|damage|regains)\b/i.test(line)||group!=='special_abilities'))add(group,line);
  }
 }
 return plannerCombatBlock(row);
}
function renderDdbImport(token,body){
 const section=combatSection('D&D Beyond stat block'),url=document.createElement('input'),paste=document.createElement('textarea');
 const summary=document.createElement('ul');
 const status=combatText('p',token.ddbMonsterSource?'Imported from '+token.ddbMonsterSource+'.':'Import by URL or paste the full stat block.');
 status.setAttribute('role','status');url.type='url';url.placeholder='D&D Beyond monster URL';
 url.setAttribute('aria-label','D&D Beyond monster URL');url.value=token.ddbMonsterSource||'';
 paste.rows=5;paste.placeholder='Paste the full stat block';paste.setAttribute('aria-label','Paste monster stat block');
 let clipboardHtml='',preview=null,previewSource='';
 const apply=catalogButton('Apply imported stat block',async()=>{
  if(apply.disabled||!preview||!tokens.includes(token)||playing||roomProfile?.gm===false)return;
  apply.disabled=section.disabled=true;status.textContent='Saving stat block…';
  try{
   if(await commitCombatImport([token],null,preview,previewSource)&&body.contains(section)){
    body.replaceChildren();renderPlannerStats(token,body);
   }
  }catch(error){status.textContent=error.message}
  finally{apply.disabled=!preview;section.disabled=false}
 });
 apply.disabled=true;
 const show=(html,text,source)=>{
  preview=readDdbMonster(html,text);previewSource=source;
  status.textContent=preview.name+' · AC '+preview.ac+' · HP '+preview.maxHp+
   ' · '+Object.keys(preview.checks).length+' ability scores · '+preview.actions.length+' actions and traits';
  summary.replaceChildren(...preview.actions.map(action=>combatText('li',[
   action.name,action.attack==null?'':'Attack '+(action.attack>=0?'+':'')+action.attack,
   action.dc==null?'':'DC '+action.dc+' '+action.save,
   ...action.damage.map(damage=>damage.formula+' '+damage.type)
  ].filter(Boolean).join(' · '))));
  apply.disabled=false;
 };
 const run=async action=>{
  preview=null;apply.disabled=true;summary.replaceChildren();section.disabled=true;
  try{await action()}catch(error){status.textContent=error.message}
  finally{section.disabled=false}
 };
 paste.oninput=()=>{clipboardHtml='';preview=null;apply.disabled=true;summary.replaceChildren()};
 paste.onpaste=event=>{
  const html=event.clipboardData?.getData('text/html');
  if(!html)return;
  event.preventDefault();paste.value=event.clipboardData.getData('text/plain');
  clipboardHtml=html;preview=null;apply.disabled=true;
 };
 const fetchBlock=catalogButton('Preview from URL',()=>run(async()=>{
  const path=ddbMonsterPath(url.value);
  if(!roomProfile?.gm)throw Error('Sign in as GM to fetch a URL, or paste the stat block.');
  status.textContent='Reading the public D&D Beyond stat block…';
  const response=await fetch(new URL('/functions/v1/battlemap-monster-import',roomApi),{
   method:'POST',headers:{apikey:roomKey,'Content-Type':'application/json'},
   body:JSON.stringify({ticket:roomProfile.token,path}),signal:AbortSignal.timeout(16000)
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Could not read the URL. Paste the stat block from D&D Beyond.');
  show(data.html,'','https://www.dndbeyond.com'+path);
 }));
 const previewPaste=catalogButton('Preview pasted stat block',()=>run(()=>{
  show(clipboardHtml,paste.value,url.value.trim()?'https://www.dndbeyond.com'+ddbMonsterPath(url.value):'');
 }));
 const openSource=catalogButton('Open source page',()=>run(()=>{
  window.open('https://www.dndbeyond.com'+ddbMonsterPath(url.value),'_blank','noopener,noreferrer');
  status.textContent='Copy the stat block from D&D Beyond, then paste it here.';
 }));
 section.append(url,fetchBlock,openSource,paste,previewPaste,apply,status,summary);
 body.append(section);
}

el('openManagedImages').onclick=()=>{
 if(playing||roomProfile?.gm===false)return;
 showManagedImages();
 if(!roomProfile?.gm)el('managedImageStatus').textContent='Sign in as GM to upload images.';
};
function queueManagedImages(files){
 if(imageChoice||imageManagerBusy||imageCatalogBusy||!roomProfile?.gm)return;
 imageJobs.push(...[...files].map(file=>({file,name:file.name,folder:managedFolder,status:'Queued',failed:false})));
 renderManagedImages();
}
el('managedImageFiles').onchange=event=>{
 queueManagedImages(event.target.files);event.target.value='';
};
const managedDrop=el('managedImageDrop');
managedDrop.ondragover=event=>{
 if(!event.dataTransfer.types.includes('Files'))return;
 event.preventDefault();managedDrop.classList.add('drop-ready');
};
managedDrop.ondragleave=()=>managedDrop.classList.remove('drop-ready');
managedDrop.ondrop=event=>{
 event.preventDefault();managedDrop.classList.remove('drop-ready');queueManagedImages(event.dataTransfer.files);
};
el('managedImageRetry').onclick=()=>uploadManagedImages(imageJobs.slice());
el('managedLookFront').onclick=()=>chooseManagedLook('front');
el('managedLookBack').onclick=()=>chooseManagedLook('back');
el('journalManagedChoose').onclick=()=>{
 const draft=journalDraft;
 if(!draft||!canUseJournal())return;
 showManagedImages(url=>{if(journalDraft===draft){draft.image=url;renderManagedPin()}});
};
el('journalManagedRemove').onclick=()=>{
 if(journalDraft&&canUseJournal()){delete journalDraft.image;renderManagedPin()}
};



// Map Composer is intentionally hosted outside index.html. Its pieces live
// in the existing appearance area, so scene autosave and room patches see them.
if(window.BattlemapMapComposerEditor){
 window.BattlemapMapComposerEditor.mount({host:{
  load:()=>structuredClone(areas.find(a=>a.shape==='appearance')?.appearance?.mapComposerPieces||[]),
  listImages:()=>managedImages.filter(item=>typeof item.url==='string'&&item.url).map(item=>({name:item.name,url:item.url})),
  resolveImage:src=>getArt(src),
  save:items=>{
   if(playing||roomProfile?.gm===false)throw Error('Map Composer editing requires GM build mode.');
   if(items.some(item=>item.assetId.startsWith('preview-')))throw Error('Local preview uploads cannot be saved yet. Add images through Image Manager first.');
   const normalized=items.map(item=>window.BattlemapMapComposer.normalizePiece(item));
   remember();
   let area=areas.find(a=>a.shape==='appearance');
   if(!area){area={shape:'appearance',origin:[0,0,0],angle:0,size:1,appearance:{}};areas.push(area)}
   area.appearance??={};
   area.appearance.mapComposerPieces=normalized;
   movementRenderCache=null;
   refresh('Map Composer pieces applied');
  }
 }});
}
