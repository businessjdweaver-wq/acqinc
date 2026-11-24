"use strict";
const roomApi='https://burtvenqfzextswpjziw.supabase.co/rest/v1/rpc/battlemap_room_';
const roomKey="sb_publishable_eKBLY77ZQR4GKCKAuuMu_g_NCYupdt1";
let restoreActiveRoom=false;
let roomProfile=null,roomRevision=-1,roomState={},roomMoving=false,roomDraftTitle='Battlemap',roomDraftAttached=false;
const roomBackoff=(failures,base=450)=>Math.round(Math.min(20000,base*2**Math.min(6,Math.max(0,failures-1)))*(.8+Math.random()*.4));
let roomFailureCount=0,roomRetryAt=0,roomPatchPending=false,roomPatchFailures=0;
function roomConnection(label,issue=false){
 const indicator=el('roomConnection');
 if(indicator.textContent!==label)indicator.textContent=label;
 indicator.dataset.issue=String(issue);
}
function roomProblem(message,kind,transient=false){
 return Object.assign(Error(message),{kind,transient});
}
let requestedRoomScene=sessionStorage.getItem('battlemap.viewedScene')||null;
const sceneActionNames=new Set(['manage','list','sync','publish','test_open','move','opening','customize','gm_eye','polymorph','ping']);
const testPreviewPrefix='test-preview:';
function isTestPreview(sceneId=roomState.sceneId){
 return typeof sceneId==='string'&&sceneId.startsWith(testPreviewPrefix);
}
async function roomRpc(name,args,accessToken){
 const sceneAction=sceneActionNames.has(name);
 if(sceneAction&&!Object.hasOwn(args,'requested_scene')){
  args={...args,requested_scene:name==='sync'?requestedRoomScene:roomState.sceneId};
 }
 const rpcBase=sceneAction?roomApi.replace(/room_$/,'scene_'):roomApi;
 let response;
 try{
  response=await fetch(rpcBase+name,{method:'POST',headers:{apikey:roomKey,'Content-Type':'application/json',...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 }catch(error){
  if(error.name==='TimeoutError'||error.name==='AbortError')throw roomProblem('The session request timed out.','timeout',true);
  throw roomProblem('Could not reach the session server. Check your connection.','network',true);
 }
 const data=await response.json().catch(()=>null);
 if(!response.ok){
  console.error('Battlemap room request failed',name,response.status,data?.code);
  if(response.status===401)throw roomProblem('Session authentication failed.','authentication');
  if(response.status===403||data?.code==='42501')throw roomProblem('This account does not have permission for that update.','authorization');
  if(data?.code==='57014'||data?.code==='55P03'||response.status===504)throw roomProblem('The database timed out while processing the update.','timeout',true);
  if(data?.code==='40001'||data?.code==='40P01'||response.status===409)throw roomProblem('The scene changed while processing the update.','conflict',true);
  if(response.status===429||response.status>=500)throw roomProblem('The session server is temporarily unavailable (HTTP '+response.status+').','server',true);
  throw roomProblem('The session server rejected '+name+' (HTTP '+response.status+').','request');
 }
 if(!data)throw roomProblem('The session server returned an incomplete response.','network',true);
 if(data.error){
  const kind=/scene changed|workspace changed|revision/i.test(data.error)?'conflict':
   /session expired|password|choose your profile/i.test(data.error)?'authentication':
   /does not have|unavailable|sign in as gm|not allowed/i.test(data.error)?'authorization':'request';
  throw roomProblem(data.error,kind,kind==='conflict');
 }
 return data;
}
function roomOptions(select,values){
 const previous=select.value;
 for(const option of [...select.options])if(option.dataset.room)option.remove();
 for(const item of values){
  const option=document.createElement('option');option.dataset.room='1';option.value=typeof item==='string'?item:item.id;option.textContent=typeof item==='string'?item:item.name;
  select.append(option);
 }
 if([...select.options].some(option=>option.value===previous))select.value=previous;
}
function updateRoomPicker(){
 const selected=el('roomProfile').value,gm=['gm1000','gm2000'].includes(selected);
 el('roomCharacterFields').hidden=!selected||gm;
 el('roomPasswordField').hidden=!gm&&!(roomState.profiles||[]).some(profile=>profile.name===selected&&profile.passwordRequired);
 if(el('roomPasswordField').hidden)el('roomPassword').value='';
}
function updateCharacterChoices(){
 const profile=(roomState.profiles||[]).find(p=>p.name===el('roomProfile').value);
 const select=el('roomCharacter'),choices=new Map();
 for(const character of profile?.characters||[]){
  const key=character.name.trim().replace(/\s+/g,' ').toLowerCase();
  if(!choices.has(key)||character.id===select.value)choices.set(key,character);
 }
 const characters=[...choices.values()];
 roomOptions(select,characters);
 if(!select.value&&characters.length===1)select.value=characters[0].id;
}
el('roomProfile').onchange=()=>{
 el('roomCharacter').value='';el('roomDisplayName').value='';
 updateCharacterChoices();el('roomCharacter').onchange();updateRoomPicker();
};
el('roomCharacter').onchange=()=>{
 const select=el('roomCharacter');
 el('roomDisplayName').value=select.value?select.selectedOptions[0].textContent:'';
};
function ownsRoomStandee(token){
 const name=roomProfile?.name;
 return token?.type==='standee'&&!!name&&
  (token.familiarOwner===name||token.controllerNames?.includes(name));
}
function syncAccountControllers(){
 const profiles=roomState.profiles||[];
 for(const token of tokens){
  token.controllerNames=token.roomId?profiles.filter(p=>p.characters?.some(c=>c.id===token.roomId)).map(p=>p.name):[];
  if(token.familiarOwner&&!token.controllerNames.includes(token.familiarOwner))token.controllerNames.push(token.familiarOwner);
 }
}
const accountCatalogKey='battlemap.accountStandeeCatalog.v1';
let accountCatalog=new Map(),accountSelection=new Map(),accountInitial=new Map();
function registerSceneStandees(items,sceneName){
 let changed=false;
 for(const token of items||[]){
  const linkedId=token.characterRoomId;
  // Keep a legacy placement's own ID if it already has an explicit account assignment.
  const profiles=roomState.profiles||[];
  const assigned=id=>profiles.some(profile=>profile.characters?.some(character=>character.id===id));
  const canLink=!token.roomId||assigned(linkedId)&&!assigned(token.roomId);
  if(linkedId&&linkedId!==token.roomId&&canLink&&!items.some(other=>other!==token&&other.roomId===linkedId)){
   token.roomId=linkedId;changed=true;
  }
  if(!token.roomId){token.roomId=token.trackingId||crypto.randomUUID();changed=true}
  const previous=accountCatalog.get(token.roomId);
  const sceneNames=[...new Set([...(previous?.scenes||[]),sceneName])];
  accountCatalog.set(token.roomId,{id:token.roomId,name:(token.displayName||token.name||'Standee').slice(0,80),role:baseStandeeRole(token),scenes:sceneNames});
 }
 return changed;
}
async function collectAccountCatalog(){
 let sceneIdsChanged=false;
 for(const scene of scenes)if(registerSceneStandees(scene.map.tokens,scene.name))sceneIdsChanged=true;
 registerSceneStandees(tokens,roomDraftTitle==='Battlemap'?'Current map':roomDraftTitle);
 for(const profile of roomState.profiles||[])for(const character of profile.characters||[]){
  if(!accountCatalog.has(character.id))accountCatalog.set(character.id,{id:character.id,name:character.name,role:'',scenes:[]});
 }
 const saved=await storeValue(accountCatalogKey,[...accountCatalog.values()]);
 const sceneSaved=!sceneIdsChanged||await storeValue(scenesKey,scenes);
 if(!saved||!sceneSaved)throw Error('Could not save the standee roster in this browser.');
}
function resetAccountSelection(){
 const profile=(roomState.profiles||[]).find(p=>p.name===el('accountPicker').value);
 accountInitial=new Map((profile?.characters||[]).map(c=>[c.id,c.name]));
 accountSelection=new Map([...accountInitial.keys()].map(id=>[id,true]));
 renderAccountStandees();loadAccountAccess(profile?.name);
}
function renderAccountStandees(){
 const list=el('accountStandeeList');list.replaceChildren();
 const account=el('accountPicker').value;
 const query=el('accountStandeeSearch').value.trim().toLowerCase();
 const entries=[...accountCatalog.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 const visible=entries.filter(entry=>[entry.name,entry.role,...entry.scenes].join(' ').toLowerCase().includes(query));
 el('accountStandeeCount').textContent=visible.length+' of '+entries.length+' standees';
 el('accountSave').disabled=!account||!entries.length;
 if(!account)return;
 for(const entry of visible){
  const label=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.checked=accountSelection.get(entry.id)===true;
  input.onchange=()=>accountSelection.set(entry.id,input.checked);
  const detail=[entry.role?.toUpperCase(),entry.scenes.join(', ')].filter(Boolean).join(' · ');
  label.append(input,document.createTextNode(entry.name+(detail?' · '+detail:'')));
  list.append(label);
 }
}
function refreshAccountPicker(){
 roomOptions(el('accountPicker'),(roomState.profiles||[]).map(p=>p.name));
 resetAccountSelection();
}
el('userAccounts').onclick=async()=>{
 if(!roomProfile?.gm||playing)return;
 await pollRoom();
 el('accountStandeeSearch').value='';
 el('accountStatus').textContent='';
 try{await collectAccountCatalog()}catch(err){el('accountStatus').textContent=err.message}
 refreshAccountPicker();el('userAccountsDialog').showModal();
};
el('accountPicker').onchange=resetAccountSelection;
let accountAccessRequest=0;
async function loadAccountAccess(account){
 const request=++accountAccessRequest;
 const panel=el('accountAccess'),status=el('accountAccessStatus');
 panel.hidden=!account;panel.disabled=true;
 el('accountPassword').value='';el('accountClearPassword').checked=false;
 if(!account||!roomProfile?.gm)return;
 status.textContent='Loading account access…';
 try{
  const access=await roomRpc('accounts',{ticket:roomProfile.token,operation:'get_access',account_name:account});
  if(request!==accountAccessRequest)return;
  el('accountCanTest').checked=access.canTest;
  status.textContent=access.passwordRequired?'Password set.':'No password set.';
  panel.disabled=false;
 }catch(error){if(request===accountAccessRequest)status.textContent=error.message}
}
el('accountSaveAccess').onclick=async()=>{
 const account=el('accountPicker').value,panel=el('accountAccess'),status=el('accountAccessStatus');
 if(!account||!roomProfile?.gm||panel.disabled)return;
 const request=accountAccessRequest,password=el('accountPassword').value,clearPassword=el('accountClearPassword').checked;
 if(password&&clearPassword){status.textContent='Choose either a new password or Remove password.';return}
 if(new TextEncoder().encode(password).length>72){status.textContent='Password is too long. Try a shorter one.';return}
 panel.disabled=true;
 try{
  await roomRpc('accounts',{ticket:roomProfile.token,operation:'access',account_name:account,
   assignments:{canTest:el('accountCanTest').checked,clearPassword,...(password?{password}:{})}});
  if(request===accountAccessRequest)await loadAccountAccess(account);
 }catch(error){if(request===accountAccessRequest){status.textContent=error.message;panel.disabled=false}}
};
el('accountStandeeSearch').oninput=renderAccountStandees;
el('addAccountForm').onsubmit=async e=>{
 e.preventDefault();
 const name=el('newAccountName').value.trim();
 try{
  await roomRpc('accounts',{ticket:roomProfile.token,operation:'add',account_name:name});
  roomState={...roomState,profiles:(await roomRpc('state',{since_revision:Number.MAX_SAFE_INTEGER})).profiles};refreshAccountPicker();
  el('accountPicker').value=name;resetAccountSelection();el('newAccountName').value='';
  el('accountStatus').textContent='Player name added.';
 }catch(err){el('accountStatus').textContent=err.message}
};
el('accountLinksForm').onsubmit=async e=>{
 e.preventDefault();
 const account=el('accountPicker').value;
 if(!account)return;
 const assignments=[...accountCatalog.values()].filter(entry=>
  (accountSelection.get(entry.id)===true)!==accountInitial.has(entry.id)||
  accountSelection.get(entry.id)===true&&accountInitial.get(entry.id)!==entry.name
 ).map(entry=>({id:entry.id,name:entry.name,allowed:accountSelection.get(entry.id)===true}));
 if(!assignments.length){el('accountStatus').textContent='No assignment changes to save.';return}
 el('accountSave').disabled=true;
 try{
  await roomRpc('accounts',{ticket:roomProfile.token,operation:'assign',account_name:account,assignments});
  roomState={...roomState,profiles:(await roomRpc('state',{since_revision:Number.MAX_SAFE_INTEGER})).profiles};
  syncAccountControllers();resetAccountSelection();refresh();
  el('accountStatus').textContent='Standee assignments saved.';
 }catch(err){el('accountStatus').textContent=err.message;el('accountSave').disabled=false}
};
function playerRoomView(state){
 const ready=state.active;
 el('roomLobby').hidden=ready||!!state.canBrowseScenes;
 el('roomJoin').hidden=true;el('roomBack').hidden=false;
 el('roomLobbyStatus').textContent=state.gmOnline?'Waiting for the GM to activate a scene.':'Waiting for the GM to activate the first scene.';
 el('roomTurnState').hidden=!ready;
 el('roomTurnState').textContent=(state.title||'Battlemap')+' · '+(state.paused?'Paused':'Live');
 if(roomProfile?.gm===false&&state.paused&&carry){carry=null;ghost=null;drag=null;route=null}
 if(ready&&state.scene&&state.revision!==roomRevision){
  carry=null;ghost=null;drag=null;route=null;selected=null;
  ({pieces,tokens,areas}=state.scene);areas??=[];
  for(const token of tokens)if(ownsRoomStandee(token)&&token.roomId===roomProfile.characterKey&&roomProfile.character)token.playerDisplayName=roomProfile.character;
  roomRevision=state.revision;
  tacticalScheduleScan();
  refresh();
 }else if(!ready){roomRevision=-1;carry=null;ghost=null;drag=null;route=null}
 else draw();
}
let roomCursor=-1,roomRound=1,roomBaseline=null,roomPatchTimer=null,roomPatchBusy=false,roomSyncAgain=false,realtimeReady=false,roomChannel=null;
let outboundRoom=Promise.resolve();
const buckets=['pieces','tokens','areas'];
function roomSnapshot(){
 registerSceneStandees(tokens,roomDraftTitle);
 for(const list of [pieces,areas]){const seen=new Set();for(const item of list){if(!item.roomId||seen.has(item.roomId))item.roomId=crypto.randomUUID();seen.add(item.roomId)}}
 return structuredClone({pieces,areas:areas.filter(a=>a.shape!=='journal'&&!(a.shape==='light'&&a.secret)),tokens:tokens.map(t=>{
  const shared={...t,baseRole:baseStandeeRole(t),role:standeeRole(t)};
  delete shared.plannerMonster;delete shared.plannerCombat;delete shared.ddbMonsterSource;
  return shared;
 })});
}
function canonicalSceneValue(value){
 return JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
function sceneDelta(before,after){
 const changes=[];
 for(const bucket of buckets){
  const old=new Map((before?.[bucket]||[]).map(item=>[item.roomId,item]));
  for(const item of after[bucket]){
   if(canonicalSceneValue(old.get(item.roomId))!==canonicalSceneValue(item))changes.push({bucket,id:item.roomId,item});
   old.delete(item.roomId);
  }
  for(const id of old.keys())changes.push({bucket,id,item:null});
 }
 return changes;
}
function applySceneChange(scene,change){
 const list=scene[change.bucket];
 if(!list)return;
 const i=list.findIndex(item=>item.roomId===change.id);
 if(change.item===null){if(i>=0)list.splice(i,1);return}
 if(i>=0){
  for(const key of Object.keys(list[i]))if(!Object.hasOwn(change.item,key))delete list[i][key];
  Object.assign(list[i],structuredClone(change.item));
 }else list.push(structuredClone(change.item));
}
function scheduleRoomPatch(delay=180){
 if(!roomProfile?.gm||!roomDraftAttached||!roomBaseline||currentSceneId!==roomState.sceneId)return;
 clearTimeout(roomPatchTimer);
 roomPatchTimer=setTimeout(flushRoomPatch,Math.max(delay,roomRetryAt-Date.now()));
}
async function inheritStandeeOwners(placements){
 const linked=placements.filter(t=>t?.type==='standee'&&[t.ownerStandeeId,t.characterRoomId].some(id=>id&&id!==t.roomId));
 if(!linked.length)return;
 const ticket=roomProfile.token;
 const {profiles=[]}=await roomRpc('state',{since_revision:Number.MAX_SAFE_INTEGER});
 const owners=new Map();
 for(const profile of profiles)for(const character of profile.characters||[]){
  if(!owners.has(character.id))owners.set(character.id,[]);
  owners.get(character.id).push({profile:profile.name,name:character.name});
 }
 const byOwner=new Map();
 for(const token of linked){
  if(owners.has(token.roomId))continue;
  const inherited=owners.get(token.ownerStandeeId)||owners.get(token.characterRoomId)||[];
  for(const {profile,name} of inherited){
   if(!byOwner.has(profile))byOwner.set(profile,[]);
   byOwner.get(profile).push({id:token.roomId,name,allowed:true});
  }
 }
 for(const [account_name,assignments] of byOwner){
  await roomRpc('accounts',{ticket,operation:'assign',account_name,assignments});
  const profile=profiles.find(p=>p.name===account_name);
  profile.characters.push(...assignments.map(({id,name})=>({id,name})));
 }
 roomState={...roomState,profiles};
 syncAccountControllers();
}
async function flushRoomPatch(){
 if(roomPatchBusy||!roomProfile?.gm||!roomDraftAttached||!roomBaseline||currentSceneId!==roomState.sceneId)return;
 if(roomRetryAt>Date.now()){scheduleRoomPatch();return}
 const baseline=roomBaseline,revision=roomRevision;
 const changes=sceneDelta(baseline,roomSnapshot());
 if(!changes.length){roomPatchPending=false;roomPatchFailures=0;gmAmbientPending=null;return}
 roomPatchPending=true;
 if(!navigator.onLine){roomConnection('Offline — changes pending',true);queueRecovery();return}
 roomPatchBusy=true;
 let retry=false;
 try{
  const existingIds=new Set((baseline.tokens||[]).map(t=>t.roomId));
  await inheritStandeeOwners(changes.filter(change=>change.bucket==='tokens'&&!existingIds.has(change.id)).map(change=>change.item));
  await roomRpc('publish',{ticket:roomProfile.token,operation:'patch',payload:{revision,changes}});
  if(roomBaseline===baseline&&roomRevision===revision)
   for(const change of changes)applySceneChange(baseline,change);
  roomPatchFailures=0;roomPatchPending=false;retry=true;
  // Persist the acknowledged live state into the scene catalog as well.
  scheduleSceneAutosave(800);
  if(gmAmbientPending&&changes.some(c=>c.bucket==="areas"&&canonicalSceneValue(c.item?.appearance?.ambient)===canonicalSceneValue(gmAmbientPending))){gmAmbientPending=null;message("Scene lighting synchronized.");}
 }catch(error){
  message(error.message);retry=!!error.transient;
  if(retry){roomPatchFailures++;roomConnection(navigator.onLine?'Reconnecting':'Offline — changes pending',true)}
  else roomConnection('Connection failed',true);
 }finally{
  roomPatchBusy=false;
  await pollRoom();
  if(retry)scheduleRoomPatch(roomPatchFailures?roomBackoff(roomPatchFailures):180);
 }
}
function publishRoom(operation,payload){
 if(!roomProfile)return Promise.resolve();
 const ticket=roomProfile.token,requested_scene=roomState.sceneId;
 const request=outboundRoom.then(()=>roomRpc('publish',{ticket,requested_scene,operation,payload:payload??null}));
 outboundRoom=request.catch(()=>{});
 return request.then(result=>{pollRoom();return result},err=>{message(err.message);return null});
}
function sendSharedChat(card,audience,initiative=null){
 return publishRoom('chat',{card:cardData(card),audience,initiative:initiative===null?null:{total:initiative}});
}
let initiativeWriteVersion=0,initiativeWritesPending=0;
function publishInitiative(){
 if(!roomProfile?.gm)return;
 const entries=[...initiativeEntries].map(([key,entry])=>{
  const token=linkedStandee(key);
  if(token)token.roomId??=crypto.randomUUID();
  return [key,{...entry,roomId:token?.roomId??entry.roomId,private:!!token&&tokens.filter(member=>member===token||member.initiativeKey===key).every(member=>member.incognito)}];
 });
 initiativeWriteVersion++;
 initiativeWritesPending++;
 publishRoom('initiative',{entries,active:activeInitiative,round:roomRound}).finally(()=>{
  initiativeWritesPending--;
  if(!initiativeWritesPending)pollRoom();
 });
}
function applyRoomInitiative(value){
 if(!value)return false;
 const entries=value.entries||[],round=value.round||1,active=value.active??null;
 if(JSON.stringify(entries)===JSON.stringify([...initiativeEntries])&&round===roomRound&&active===activeInitiative)return false;
 const previous=activeInitiative;
 initiativeEntries.clear();
 for(const [key,item] of entries)initiativeEntries.set(key,item);
 activeInitiative=active;roomRound=round;
 if(previous!==activeInitiative)pingStarted=performance.now();
 return true;
}
function mergeRoomToken(local,prior,remote){
 if(local&&prior)for(const key of ['hp','tempHp','ac','saveDc','conditions','darkvision','blindsight','targetRoomId','targetId','torch','carriedDrop','carriedFixture','torchColor','torchBright','torchDim','aura','arcaneEye','looks','activeLook','nameVisibility','size','sizeCategory','polymorph','maxHp','src','icon','color'])if(canonicalSceneValue(local[key])===canonicalSceneValue(prior[key])){if(remote[key]===undefined)delete local[key];else local[key]=structuredClone(remote[key]);}
     if(local&&prior&&['x','y','z'].every(key=>local[key]===prior[key])){
      Object.assign(local,{x:remote.x,y:remote.y,z:remote.z});
     }
}
function mergeRoomPathDoorState(local,prior,remote){
 if(!local?.wallPaths||!prior?.wallPaths||!remote?.wallPaths)return;
 const baseline=new Map(prior.wallPaths.map(wall=>[wall.id,wall]));
 const incoming=new Map(remote.wallPaths.map(wall=>[wall.id,wall]));
 local.wallPaths=local.wallPaths.map(wall=>{
  const before=baseline.get(wall.id),after=incoming.get(wall.id);
  if(!before||!after||
   canonicalSceneValue([wall.nodes,wall.closed,wall.z])!==canonicalSceneValue([before.nodes,before.closed,before.z]))return wall;
  let changed=false;
  const openings=wall.openings.map((opening,index)=>{
   const previous=before.openings[index],next=after.openings[index];
   if(opening.kind!=='Door'||!previous||!next||opening.open!==previous.open||next.open===previous.open)return opening;
   const geometry=o=>[o.kind,o.at,o.width,o.height,o.sill];
   if(canonicalSceneValue(geometry(opening))!==canonicalSceneValue(geometry(previous))||
    canonicalSceneValue(geometry(next))!==canonicalSceneValue(geometry(previous)))return opening;
   changed=true;
   return {...opening,open:next.open};
  });
  return changed?{...wall,openings}:wall;
 });
}
function mergeRoomOpeningState(local,prior,remote){
 if(remote?.shape==='appearance'){
  mergeRoomPathDoorState(local,prior,remote);
  return;
 }
 if(!local||!prior||!remote||!['opening','light'].includes(remote.shape))return;
 const keys=remote.shape==='light'?['on','origin']:remote.kind==='Window'?['open','shaded']:['open'];
 for(const key of keys){
  if(canonicalSceneValue(local[key])!==canonicalSceneValue(prior[key]))continue;
  if(Object.hasOwn(remote,key))local[key]=structuredClone(remote[key]);else delete local[key];
 }
}
const challengeOptions={
 check:['Acrobatics','Animal Handling','Arcana','Athletics','Deception','History','Insight','Intimidation','Investigation','Medicine','Nature','Perception','Performance','Persuasion','Religion','Sleight of Hand','Stealth','Survival','Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'],
 save:['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma']
};
const challengeDialog=el('groupChallengeDialog');
let groupChallenge=null;
function challengeKey(value){return String(value??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function updateChallengePurpose(){
 const options=challengeOptions[el('challengeKind').value];
 el('challengePurpose').replaceChildren(...options.map(name=>new Option(name)));
}
el('challengeKind').onchange=updateChallengePurpose;
updateChallengePurpose();
function groupChallengeLabel(challenge){
 return challenge.purpose+(challenge.kind==='save'?' saving throw':' check');
}
function updateChallengeStatus(){
 const active=groupChallenge;
 const banner=el('activeGroupChallenge');
 banner.hidden=!active||roomProfile?.gm!==true;
 if(!active)banner.textContent='';
 el('challengeSetup').hidden=!!active;
 el('challengeActive').hidden=!active;
 if(!active)return;
 const received=active.results.size,total=active.participants.length;
 const status=groupChallengeLabel(active)+' · DC '+active.dc+' · '+received+' of '+total+' rolls received.';
 el('challengeStatus').textContent=status;
 banner.textContent=status;
 el('challengeFinish').disabled=active.pending||!received;
 el('challengeCancel').disabled=active.pending;
}
el('openGroupChallenge').onclick=()=>{
 if(!roomProfile?.gm)return;
 if(groupChallenge&&(groupChallenge.ticket!==roomProfile.token||groupChallenge.sceneId!==roomState.sceneId))groupChallenge=null;
 const roster=el('challengeRoster');
 roster.replaceChildren();
 for(const token of tokens){
  const label=document.createElement('label'),box=document.createElement('input');
  box.type='checkbox';box.disabled=token.incognito===true;
  box.checked=!box.disabled&&baseStandeeRole(token)==='pc'&&!token.conditions?.includes('dead');
  box.challengeToken=token;
  label.append(box,' '+(token.displayName||token.name)+(box.disabled?' (incognito)':''));
  roster.append(label);
 }
 updateChallengeStatus();
 el('challengeError').textContent='';
 if(!challengeDialog.open)challengeDialog.showModal();
};
el('challengeClose').onclick=()=>challengeDialog.close();
function challengeGrade(margin){
 if(margin>=10)return {points:100,color:'challenge-green'};
 if(margin>=5)return {points:80,color:'challenge-blue'};
 if(margin>=0)return {points:60,color:''};
 if(margin<=-10)return {points:0,color:'challenge-red'};
 if(margin<=-5)return {points:20,color:'challenge-orange'};
 return {points:40,color:''};
}
function challengeCard(challenge,state='active'){
 const card=document.createElement('li');
 card.dataset.chatType='text';
 card.dataset.challengeId=challenge.id;
 const count=challenge.results.size;
 rollNode(card,'strong','Group '+groupChallengeLabel(challenge));
 rollNode(card,'p','DC '+challenge.dc+' · '+count+' of '+challenge.participants.length+' rolls received.');
 if(state==='active')rollNode(card,'p','Roll the requested check or save publicly in D&D Beyond.');
 for(const participant of challenge.participants){
  const total=challenge.results.get(participant);
  const grade=total===undefined?null:challengeGrade(total-challenge.dc);
  const row=rollNode(card,'div',null,'challenge-roll'+(grade?.color?' '+grade.color:''));
  rollNode(row,'span',participant.name);
  rollNode(row,'strong',grade?total+' · '+(total>=challenge.dc?'Success':'Failure'):
   state==='active'?'Waiting for roll':'No roll');
 }
 if(state==='cancelled')rollNode(card,'p','Challenge cancelled.');
 if(state==='complete'){
  const points=[...challenge.results.values()].map(total=>challengeGrade(total-challenge.dc).points);
  const score=points.length?points.reduce((sum,value)=>sum+value,0)/points.length:null;
  const complete=count===challenge.participants.length;
  if(score!==null){
   const passes=[...challenge.results.values()].filter(total=>total>=challenge.dc).length;
   if(complete&&challenge.kind==='check')rollNode(card,'strong',score>=50?'Group success':'Group failure');
   rollNode(card,'p',Math.round(score)+'% weighted success · '+(100-Math.round(score))+'% weighted failure · '+passes+' of '+count+' met DC.');
  }
 }
 return card;
}
el('challengeSetup').onsubmit=async event=>{
 event.preventDefault();
 if(!roomProfile?.gm||groupChallenge)return;
 const error=el('challengeError'),dc=el('challengeDc').valueAsNumber;
 const selected=[...el('challengeRoster').querySelectorAll('input:checked')].map(box=>box.challengeToken);
 if(!Number.isInteger(dc)||dc<1||dc>99||!selected.length||selected.some(token=>!tokens.includes(token)||token.incognito)){
  error.textContent='Select at least one visible character and enter a DC from 1 to 99.';return;
 }
 const participants=selected.map(token=>({
  name:token.displayName||token.name,
  aliases:[...new Set([token.name,token.displayName].map(challengeKey).filter(Boolean))]
 }));
 const aliases=participants.flatMap(participant=>participant.aliases);
 if(new Set(aliases).size!==aliases.length){
  error.textContent='Selected characters need distinct names for rolls to match.';return;
 }
 const challenge={id:crypto.randomUUID(),kind:el('challengeKind').value,purpose:el('challengePurpose').value,dc,
  participants,results:new Map(),sceneId:roomState.sceneId,ticket:roomProfile.token,after:Number(roomCursor),pending:true};
 groupChallenge=challenge;updateChallengeStatus();
 const sent=await sendSharedChat(challengeCard(challenge),'public');
 if(groupChallenge!==challenge)return;
 if(!sent){
  groupChallenge=null;updateChallengeStatus();error.textContent='Could not send the challenge prompt.';return;
 }
 challenge.pending=false;updateChallengeStatus();challengeDialog.close();
 if(challenge.results.size===challenge.participants.length)finishGroupChallenge();
 else if(challenge.results.size)sendSharedChat(challengeCard(challenge),'public');
};
async function finishGroupChallenge(cancel=false){
 const challenge=groupChallenge;
 if(!challenge||challenge.pending||!roomProfile?.gm||challenge.ticket!==roomProfile.token||challenge.sceneId!==roomState.sceneId)return;
 challenge.pending=true;updateChallengeStatus();
 const sent=await sendSharedChat(challengeCard(challenge,cancel?'cancelled':'complete'),'public');
 if(groupChallenge!==challenge)return;
 if(sent){groupChallenge=null;updateChallengeStatus();challengeDialog.close()}
 else{challenge.pending=false;updateChallengeStatus();el('challengeError').textContent='Could not post the result. Try Finish now again.'}
}
el('challengeFinish').onclick=()=>finishGroupChallenge();
el('challengeCancel').onclick=()=>finishGroupChallenge(true);
function captureGroupChallengeRoll(card,id){
 const challenge=groupChallenge;
 if(!challenge||!roomProfile?.gm||challenge.ticket!==roomProfile.token||challenge.sceneId!==roomState.sceneId||
  Number(id)<=challenge.after||card.dataset.audience==='gm'||card.dataset.chatHidden==='true'||
  (card.dataset.chatType!==challenge.kind&&(challenge.kind!=='check'||card.dataset.chatType!=='dice')))return false;
 const title=' '+challengeKey(card.querySelector('h3')?.textContent)+' ';
 if(!title.includes(' '+challengeKey(challenge.purpose)+' '))return false;
 const name=challengeKey(card.dataset.chatName);
 const exact=challenge.participants.filter(p=>p.aliases.includes(name));
 const matches=exact.length?exact:challenge.participants.filter(p=>p.aliases.some(alias=>
  name&&alias&&(name.startsWith(alias+' ')||alias.startsWith(name+' '))));
 if(matches.length!==1)return false;
 const [participant]=matches;
 // Beyond20 can display two ordinary rolls. Use the first kept roll.
 const kept=card.querySelector('.roll-grid > .roll-result:not(.discarded) .roll-total');
 if(!kept?.textContent.trim())return false;
 const total=Number(kept.textContent);
 if(!Number.isFinite(total))return false;
 if(challenge.results.has(participant))return false;
 challenge.results.set(participant,total);updateChallengeStatus();
 if(!challenge.pending){
  if(challenge.results.size===challenge.participants.length)finishGroupChallenge();
  else sendSharedChat(challengeCard(challenge),'public');
 }
 return true;
}
function receiveRoomChat(id,body){
 const card=restoreCard(body.card);
 card.dataset.chatId=String(id);
 card.dataset.chatHidden=String(body.hidden===true);
 const speaker=card.querySelector('.roll-speaker')?.textContent;
 if(speaker==='Private roll')card.dataset.audience='gm';
 if(!card.dataset.chatName)card.dataset.chatName=(speaker==='Private roll'?'':speaker)||body.sender||card.firstElementChild?.textContent||'';
 if(body.sender&&card.firstElementChild?.tagName==='STRONG'&&['Player','DM','Whisper to GM'].includes(card.firstElementChild.textContent))
  card.firstElementChild.textContent=body.sender+(card.dataset.audience==='gm'?' · Whisper':'');
 if(!captureGroupChallengeRoll(card,id))appendChatCard(card);
}
function applyRoomEvents(events,reset,fromRevision){

 let redraw=false;
 if(reset)el('rollsFeed').replaceChildren();
 for(const event of events){
  if(event.kind==='chat'&&event.body?.card)receiveRoomChat(event.id,event.body);
  else if(event.kind==='chat_moderation'){
   const {id,action,message}=event.body||{},card=[...el('rollsFeed').children].find(item=>item.dataset.chatId===String(id));
   if(action==='show'&&message?.card)receiveRoomChat(id,message);
   else if(card){
    if(action==='hide'&&roomProfile?.gm){card.dataset.chatHidden='true';attachChatControls(card)}
    else card.remove();
   }
  }else if(event.kind==='clear_chat')el('rollsFeed').replaceChildren();
  else if(event.kind==='ping'){
   const age=Math.max(0,Date.now()-Date.parse(event.at));
   if(age<pingSpiralMs+pingMarkerMs){
    const {x,y,z,recenter}=event.body;
    boardPings.push({...event.body,name:event.body.name||event.body.sender||'',started:performance.now()});
    if(!roomProfile.gm&&recenter===true){
     focusMapTarget([x,y,z],null,{deferDraw:true,avoidStandees:true});
     redraw=true;
    }else drawBoardPings();
   }
  }else if(event.kind==='delta'&&event.body.revision>fromRevision){
   for(const change of event.body.changes||[]){
    if(roomProfile.gm){
     if(!roomDraftAttached||!roomBaseline)continue;
     const prior=roomBaseline[change.bucket]?.find(t=>t.roomId===change.id);
     if(change.bucket==='tokens'&&change.item){
      const local=tokens.find(t=>t.roomId===change.id);
      if(!local&&!prior&&change.item.familiarCaster)tokens.push(structuredClone(change.item));
      else mergeRoomToken(local,prior,change.item);
     }
     if(change.bucket==='tokens'&&!change.item&&prior?.familiarCaster){
      applySceneChange({tokens},change);
     }
     if(change.bucket==='areas'){
      const local=areas.find(area=>area.roomId===change.id);
      if(((change.item??prior)?.spellOwner||(change.item??prior)?.shape==='player_note')&&(!local||canonicalSceneValue(local)===canonicalSceneValue(prior)))
       applySceneChange({areas},change);
      else mergeRoomOpeningState(local,prior,change.item);
     }
     applySceneChange(roomBaseline,change);
    }else applySceneChange({pieces,tokens,areas},change);
   }
   redraw=true;
  }
 }
 if(reset||events.some(event=>event.kind==='chat_moderation'||event.kind==='clear_chat'))applyChatFilters();
 return redraw;
}
async function connectRoomRealtime(){
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm');
  if(!roomProfile||roomChannel)return;
  const client=createClient(roomApi.split('/rest/')[0],roomKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  roomChannel=client.channel('battlemap-room-signal').on('postgres_changes',{event:'UPDATE',schema:'public',table:'battlemap_room_signal'},()=>queueRoomPoll()).subscribe(status=>{
   realtimeReady=status==='SUBSCRIBED';
   if(realtimeReady)queueRoomPoll();
  });
  client.channel('battlemap-ping-wakeup').on('broadcast',{event:'ping'},()=>queueRoomPoll(55)).subscribe();
 }catch{realtimeReady=false}
}
el('roomLobbyChat').onclick=()=>detachPanel('rolls','Chat');
function hasCompleteRoomDeltas(update,revision){
 if(update.revision<=revision)return true;
 if(update.reset)return false;
 for(const event of update.events){
  if(event.kind!=='delta'||event.body?.revision<=revision)continue;
  if(event.body?.revision!==revision+1||!Array.isArray(event.body.changes))return false;
  revision=event.body.revision;
 }
 return revision===update.revision;
}
let roomPollTask=null,roomPollTimer=null;
const seenRoomPings=new Map();
function queueRoomPoll(delay=130){
 const wait=Math.max(delay,roomRetryAt-Date.now());
 if(roomPollTimer!==null)return;
 roomPollTimer=setTimeout(()=>{roomPollTimer=null;pollRoom()},wait);
}
function pollRoom(){
 if(roomIdleSigningOut||!navigator.onLine)return Promise.resolve(false);
 if(roomRetryAt>Date.now()){queueRoomPoll();return Promise.resolve(false)}
 if(roomPollTask){roomSyncAgain=true;return roomPollTask}
 roomPollTask=syncRoomOnce().finally(()=>{
  roomPollTask=null;
  if(roomSyncAgain){roomSyncAgain=false;queueRoomPoll()}
 });
 return roomPollTask;
}
async function syncRoomOnce(){
 const profileAtStart=roomProfile;let sceneAtStart=requestedRoomScene;
 // Routine background polling should not flicker the connection badge.
 if(!roomFailureCount&&!el('roomConnection').textContent.trim())roomConnection('Connecting');
 try{
  if(!roomProfile){
   const lobby=await roomRpc('state',{since_revision:Number.MAX_SAFE_INTEGER});
   if(roomProfile)return;
   delete lobby.scene;
   roomState=lobby;
   const profiles=roomState.profiles||[];
   roomOptions(el('roomProfile'),profiles.map(p=>p.name).filter(n=>!['gm1000','gm2000'].includes(n.toLowerCase())));
   updateCharacterChoices();el('roomLobbyStatus').textContent=sessionStorage.getItem('battlemap.signOutNotice')||'';
   roomFailureCount=0;roomRetryAt=0;roomConnection('Connected');return true;
  }
  const initiativeVersionAtRead=initiativeWriteVersion;
  let update=await roomRpc('sync',{ticket:roomProfile.token,since_event:roomCursor});
  if(profileAtStart!==roomProfile||sceneAtStart!==requestedRoomScene)return false;
  // Older tester tabs may still be looking at the catalog preview directly.
  // Give them a dedicated encounter ID before accepting any scene actions.
  if(!roomProfile.gm&&requestedRoomScene&&update.canBrowseScenes&&update.active&&
   update.sceneId===requestedRoomScene&&update.activeSceneId!==requestedRoomScene&&
   !isTestPreview(requestedRoomScene)){
   const preview=await roomRpc('test_open',{ticket:roomProfile.token,requested_scene:requestedRoomScene});
   if(profileAtStart!==roomProfile||sceneAtStart!==requestedRoomScene)return false;
   if(preview.testPreview&&preview.sceneId){
    requestedRoomScene=preview.sceneId;sceneAtStart=requestedRoomScene;
    sessionStorage.setItem('battlemap.viewedScene',requestedRoomScene);
    roomCursor=-1;roomRevision=-1;
    update=await roomRpc('sync',{ticket:roomProfile.token,requested_scene:requestedRoomScene,since_event:-1,snapshot:true});
   }
  }
  const sceneChanged=(update.sceneId||null)!==(roomState.sceneId||null);
  const missingRevision=(!roomProfile.gm||roomDraftAttached)&&!hasCompleteRoomDeltas(update,roomRevision);
  if(!roomProfile.gm&&update.active&&(sceneChanged||el('roomTurnState').hidden)){
   el('scenePreparing').hidden=false;
   if(!document.hidden)await Promise.race([
    new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),
    new Promise(resolve=>setTimeout(resolve,120))
   ]);
  }
  if(update.active&&!update.scene&&(update.events.some(e=>e.kind==='reset')||
   sceneChanged||missingRevision||restoreActiveRoom||!roomProfile.gm&&el('roomTurnState').hidden)){
   update=await roomRpc('sync',{ticket:roomProfile.token,since_event:sceneChanged?-1:roomCursor,snapshot:true});
  }
  if(profileAtStart!==roomProfile||sceneAtStart!==requestedRoomScene)return false;
  const oldRevision=roomRevision,wasPaused=roomState.paused;
  const fogSettings=()=>areas.find(area=>area.shape==='appearance')?.appearance;
  const previousFog=fogSettings();
  const wasFogEnabled=previousFog?.fogOfWar===true,previousFogRevision=previousFog?.fogRevision;
  if(sceneChanged){gmVisionArmed=false;gmVisionStandee=null;pendingAreaSpell=null;seenRoomPings.clear();carry=null;ghost=null;drag=null;route=null;selected=null;closeStandeeHud();}
  roomState={...roomState,sceneId:null,...update};
  if(playerScenePaused()&&(!wasPaused||sceneChanged)){
   if(carry||drag&&!drag.pan&&!drag.orbit){
    clearTimeout(drag?.pingTimer);carry=null;ghost=null;drag=null;route=null;
   }
   facingTarget=null;pendingPolymorph=null;
   if(spellPlacement)clearSpellPlacement();
   closeStandeeHud();
   for(const id of ['standeeArtDialog','hudConditionsDialog','playCombatDialog'])if(el(id)?.open)el(id).close();
  }
  el('testerScenes').hidden=roomProfile.gm||!update.canBrowseScenes;
  if(!el('testerScenes').hidden&&!requestedRoomScene&&testerPickerTicket!==roomProfile.token){
   testerPickerTicket=roomProfile.token;
   void openTesterScenePicker();
  }
  renderRoomPresence();
  delete roomState.scene;delete roomState.events;delete roomState.pings;
  const ready=update.active;
  if(ready&&roomProfile.gm===false)void refreshPlayerPreload();
  if(roomProfile.gm){
   if(!roomState.profiles){
    const roster=await roomRpc('state',{since_revision:Number.MAX_SAFE_INTEGER});
    roomState.profiles=roster.profiles;
   }
   el('roomPause').disabled=!update.active;el('roomPause').textContent=update.paused?'Unpause':'Pause';
   if((restoreActiveRoom||sceneChanged&&roomDraftAttached)&&update.scene){
    await workspaceLoad;
    const title=update.title||'Battlemap';
    const sameScene=currentSceneId===update.sceneId;
    const previousTokens=sameScene?tokens:[];
    const sourceId=isTestPreview(update.sceneId)?update.sceneId.slice(testPreviewPrefix.length):update.sceneId;
    const savedScene=scenes.find(scene=>scene.id===sourceId);
    currentSceneId=update.sceneId||savedScene?.id||null;
    const privatePins=(sameScene&&roomDraftAttached?areas:savedScene?.map.areas||[]).filter(area=>area.shape==='journal');
    ({pieces,tokens,areas}=structuredClone(update.scene));
    areas=[...(areas||[]),...privatePins];
    inheritStandeeCombat(tokens,savedScene?.map.tokens||[]);
    inheritStandeeCombat(tokens,previousTokens);
    if(!isTestPreview(update.sceneId))privateCombatLoad=hydrateStandeeCombat(currentSceneId,tokens,true);
    roomDraftTitle=update.title||'Battlemap';
    roomBaseline=structuredClone(update.scene);
    roomDraftAttached=true;
   }
   if(update.scene||!ready)restoreActiveRoom=false;
   preloadQueuedScenes();
   if(update.scene&&roomDraftAttached){
    const remotePlayerAreas=(update.scene.areas||[]).filter(area=>area.areaOwner);
    const remotePlayerIds=new Set(remotePlayerAreas.map(area=>area.roomId));
    const previousPlayerIds=new Set((roomBaseline?.areas||[]).filter(area=>area.areaOwner).map(area=>area.roomId));
    areas=areas.filter(area=>!area.areaOwner||!previousPlayerIds.has(area.roomId)||remotePlayerIds.has(area.roomId));
    for(const remote of remotePlayerAreas){
     const index=areas.findIndex(area=>area.roomId===remote.roomId);
     const previous=roomBaseline?.areas.find(area=>area.roomId===remote.roomId);
     if(index<0&&!previous)areas.push(structuredClone(remote));
     else if(index>=0&&canonicalSceneValue(areas[index])===canonicalSceneValue(previous))areas[index]=structuredClone(remote);
    }
    const remoteAreaIds=new Set((update.scene.areas||[]).map(a=>a.roomId));
    const removedLights=new Set((roomBaseline?.areas||[]).filter(a=>a.shape==='light'&&!remoteAreaIds.has(a.roomId)).map(a=>a.roomId));
    if(removedLights.size)areas=areas.filter(a=>!removedLights.has(a.roomId));
    for(const remote of update.scene.areas||[]){
     if(!['opening','light','appearance'].includes(remote.shape))continue;
     const matches=a=>remote.shape==='appearance'?a.shape==='appearance':a.roomId===remote.roomId;
     const local=areas.find(matches);
     const previous=roomBaseline?.areas.find(matches);
     mergeRoomOpeningState(local,previous,remote);
     if(remote.dropped&&!local&&!previous)areas.push(structuredClone(remote));
    }
    // A snapshot can arrive before the movement delta. Reconcile positions
    // before advancing the baseline, while preserving pending DM moves.
    const priorTokens=new Map((roomBaseline?.tokens||[]).map(token=>[token.roomId,token]));
    const localTokens=new Map(tokens.map(token=>[token.roomId,token]));
    const remoteTokens=new Map((update.scene.tokens||[]).map(token=>[token.roomId,token]));
    for(const [id,prior] of priorTokens){
     if(prior.familiarCaster&&!remoteTokens.has(id))applySceneChange({tokens},{bucket:'tokens',id,item:null});
    }
    for(const [id,remote] of remoteTokens){
     const local=localTokens.get(id),prior=priorTokens.get(id);
     if(!local&&!prior&&remote.familiarCaster)tokens.push(structuredClone(remote));
     else mergeRoomToken(local,prior,remote);
    }
    roomBaseline=structuredClone(update.scene);
    // Server snapshots (including player moves) update the catalog backup.
    scheduleSceneAutosave(1200);
   }
  }else{
   el('roomLobby').hidden=ready||!!update.canBrowseScenes;
   el('roomLobbyChat').hidden=!update.gmOnline;
   el('roomLobbyStatus').textContent=update.gmOnline?'Waiting for the GM to activate a scene.':'Waiting for the GM to activate the first scene.';
   if(update.scene){
    carry=null;ghost=null;drag=null;route=null;selected=null;
    const hudId=hudToken?.roomId;
    ({pieces,tokens,areas}=update.scene);areas??=[];
    if(hudId){
     const current=tokens.find(token=>token.roomId===hudId&&ownsRoomStandee(token)&&!standeeHidden(token));
     if(current){selected=current;openStandeeHud(current)}else closeStandeeHud();
    }
   }
   if(!ready){
    carry=null;ghost=null;drag=null;route=null;selected=null;
    if(pieces.length||tokens.length||areas.length){pieces=[];tokens=[];areas=[];closeStandeeHud();draw()}
   }
   if(update.paused&&carry){carry=null;ghost=null;drag=null;route=null}

  }
  el('roomTurnState').hidden=!roomProfile.gm&&!ready;
  const draftName=roomProfile.gm&&scenes.find(scene=>scene.id===currentSceneId)?.name;
  const editingDraft=draftName&&(!roomDraftAttached||roomState.sceneId!==currentSceneId);
  el('roomTurnState').textContent=editingDraft?draftName+' · Editing inactive scene':
   ready?(update.title||draftName||'Battlemap')+' · '+(isTestPreview()?'Test preview':'Live encounter'):'No scene selected';
  
  if(roomProfile.gm){
   el('roomActivate').hidden=isTestPreview(currentSceneId);
   el('roomPause').hidden=isTestPreview(currentSceneId);
   if(el('sceneDialog').open&&sceneChanged)renderScenes();
  }
  const now=Date.now(),pings=[];
  for(const [id,expires] of seenRoomPings)if(expires<now)seenRoomPings.delete(id);
  for(const ping of update.pings||[])if(!seenRoomPings.has(ping.id)){
   seenRoomPings.set(ping.id,now+15000);pings.push(ping);
  }
  const changed=applyRoomEvents([...update.events,...pings],update.reset,update.scene?update.revision:oldRevision);
  roomCursor=update.cursor;roomRevision=update.revision;
  if(!roomProfile.gm&&update.active)tacticalScheduleScan();
  if(hudToken&&ownsRoomStandee(hudToken))updateHudSize(hudToken);
  const initiativeChanged=(!roomProfile.gm||(!initiativeWritesPending&&initiativeVersionAtRead===initiativeWriteVersion))&&applyRoomInitiative(update.initiative);
  if(!roomProfile.gm)for(const token of tokens)if(ownsRoomStandee(token)&&token.roomId===roomProfile.characterKey&&roomProfile.character)token.playerDisplayName=roomProfile.character;
  updateJoinSharedEncounter();
  const fog=fogSettings();
  const fogChanged=wasFogEnabled!==(fog?.fogOfWar===true)||previousFogRevision!==fog?.fogRevision;
  const localMoveRepaint=!roomProfile.gm&&playerStandeePreview?.scene===currentSceneId&&
   !sceneChanged&&!fogChanged&&wasPaused===update.paused;
  if((changed||initiativeChanged||update.scene||wasPaused!==update.paused)&&!localMoveRepaint)refresh();
  roomFailureCount=0;roomRetryAt=0;roomConnection(roomPatchPending&&roomPatchFailures?'Synchronizing':'Connected',!!(roomPatchPending&&roomPatchFailures));
  return true;
 }catch(err){
  if(roomProfile&&['GM session expired.','Choose your profile again.'].includes(err.message)){
   sessionStorage.setItem('battlemap.signOutNotice',err.message);
   roomProfile=null;sessionStorage.removeItem('battlemap.viewedScene');
 sessionStorage.removeItem('battlemap.roomProfile');location.reload();return;
  }
  console.error('Battlemap room sync failed',err);
  if(!roomProfile||!roomProfile.gm&&!el('roomLobby').hidden)el('roomLobbyStatus').textContent=err.message;
  roomFailureCount++;
  roomRetryAt=Date.now()+roomBackoff(roomFailureCount,700);
  roomConnection(!navigator.onLine?(roomPatchPending?'Offline — changes pending':'Offline'):
   err.transient&&roomFailureCount<6?'Reconnecting':'Connection failed',true);
  queueRoomPoll();
  return false;
 }finally{el('scenePreparing').hidden=true}
}
const workspaceKeys=new Set([scenesKey,sceneFoldersKey,standeeLibraryKey,componentKey,accountCatalogKey]);
let workspaceLoad=null,workspaceQueue=Promise.resolve(),preferenceTimer,workspaceRetryTimer=null,workspaceFailures=0;
const workspaceVersions=new Map();
function workspacePreferences(){return {...preferences,dmLaptopPlay,terrainLocked,topDown,pathKey}}
function saveWorkspaceItem(key,value,reportError=false){
 if(!roomProfile?.gm)return Promise.resolve(true);
 const ticket=roomProfile.token,data=structuredClone(value);
 const save=workspaceQueue.then(async()=>{
  await workspaceLoad;
  if(roomProfile?.token!==ticket||!workspaceVersions.has(key))return false;
  try{
   const result=await roomRpc('workspace',{ticket,item_key:key,item_value:data,expected_version:workspaceVersions.get(key)});
   workspaceVersions.set(key,result.version);return true;
  }catch(err){if(reportError)throw err;message(err.message);return false}
 });
 workspaceQueue=save.catch(()=>false);return save;
}
function queueWorkspacePreferences(){
 if(!roomProfile?.gm)return;
 clearTimeout(preferenceTimer);
 preferenceTimer=setTimeout(()=>saveWorkspaceItem('preferences',workspacePreferences()),400);
}
async function loadWorkspace(ticket){
 try{
  const remote=await roomRpc('workspace',{ticket});
  const local=new Map([[scenesKey,scenes],[sceneFoldersKey,sceneFolders],[standeeLibraryKey,standeeLibrary],
   [componentKey,componentTemplates],[accountCatalogKey,[...accountCatalog.values()]],['preferences',workspacePreferences()]]);
  for(const [key,value] of local){
   if(roomProfile?.token!==ticket)return;
   if(!remote[key]){
    const result=await roomRpc('workspace',{ticket,item_key:key,item_value:value,expected_version:0});
    workspaceVersions.set(key,result.version);
   }else workspaceVersions.set(key,remote[key].version);
  }
  if(roomProfile?.token!==ticket)return;
  if(remote[scenesKey])scenes=remote[scenesKey].value;
  if(remote[sceneFoldersKey])sceneFolders=remote[sceneFoldersKey].value;
  if(el('sceneDialog').open)renderScenes();
  if(remote[standeeLibraryKey])standeeLibrary=remote[standeeLibraryKey].value;
  if(remote[componentKey])componentTemplates=remote[componentKey].value;
  if(remote[accountCatalogKey])accountCatalog=new Map(remote[accountCatalogKey].value.map(entry=>[entry.id,entry]));
  const saved=remote.preferences?.value;
  if(saved){
   for(const [id,,,valid] of preferenceFields){
    if(['terrainLeft','terrainMiddle'].includes(id)&&untouchedOldMouseDefaults(saved))continue;
    if(!(id==='graphicsQuality'&&displayPreferenceRecords.has(id))&&valid(String(saved[id])))setPreferenceControl(id,saved[id]);
   }
   dmLaptopPlay=saved.dmLaptopPlay===true;el('dmLaptopPlay').checked=dmLaptopPlay;
   terrainLocked=saved.terrainLocked===true;topDown=!phoneLayout.matches&&saved.topDown===true;
   if(typeof saved.pathKey==='string'&&[...el('pathKey').options].some(option=>option.value===saved.pathKey)){
    pathKey=saved.pathKey;el('pathKey').value=pathKey;refreshPathLabels();
   }
  }
  workspaceFailures=0;updateComponentOptions();refresh();
 }catch(err){
  message('Workspace sync failed. '+err.message);
  if(err.transient&&roomProfile?.token===ticket){
   clearTimeout(workspaceRetryTimer);
   workspaceRetryTimer=setTimeout(()=>{
    if(roomProfile?.token===ticket)workspaceLoad=loadWorkspace(ticket);
   },roomBackoff(++workspaceFailures,900));
  }
 }
}
const roomActivityKey='battlemap.lastInput';
const roomIdleMinutes=30;
const roomIdleMs=roomIdleMinutes*60000;
let roomIdleTimer,roomIdleSigningOut=false;
function checkRoomIdle(){
 clearTimeout(roomIdleTimer);
 if(!roomProfile||roomIdleSigningOut)return;
 const remaining=Number(sessionStorage.getItem(roomActivityKey))+roomIdleMs-Date.now();
 if(remaining>0){
  roomIdleTimer=setTimeout(checkRoomIdle,remaining);
  return;
 }
 roomIdleSigningOut=true;
 void leaveRoom('Signed out after '+roomIdleMinutes+' minutes of inactivity.');
}
function recordRoomInput(event){
 if(!event.isTrusted||document.hidden||!roomProfile||roomIdleSigningOut)return;
 const now=Date.now(),last=Number(sessionStorage.getItem(roomActivityKey));
 if(now-last>=roomIdleMs){checkRoomIdle();return}
 if(event.type==='pointermove'&&now-last<1000)return;
 sessionStorage.setItem(roomActivityKey,String(now));
 // The scheduled check reads the latest activity and extends its deadline.
}
for(const type of ['pointerdown','pointermove','keydown','wheel','touchstart'])
 window.addEventListener(type,recordRoomInput,{capture:true,passive:true});
let gmHeartbeatPending=false;
async function keepGmSessionAlive(){
 const profile=roomProfile;
 if(!profile?.gm||gmHeartbeatPending||roomIdleSigningOut)return;
 gmHeartbeatPending=true;
 try{await roomRpc('gm',{ticket:profile.token,operation:'heartbeat'})}
 catch(error){
  if(roomProfile===profile&&error.message==='GM session expired.')pollRoom();
  console.warn('Battlemap GM heartbeat failed',error.message);
 }finally{gmHeartbeatPending=false}
}
let roomPresencePending=false;
async function announcePlayerPresence(){
 const profile=roomProfile;
 if(!profile||profile.gm||roomPresencePending||!navigator.onLine||roomRetryAt>Date.now())return;
 roomPresencePending=true;
 try{await roomRpc('presence',{ticket:profile.token})}
 catch(error){console.warn('Battlemap presence failed',error.kind)}
 finally{roomPresencePending=false}
}
setInterval(()=>{if(roomRetryAt<=Date.now()&&navigator.onLine)keepGmSessionAlive();announcePlayerPresence()},18000);
window.addEventListener('offline',()=>roomConnection(roomPatchPending?'Offline — changes pending':'Offline',true));
window.addEventListener('online',()=>{
 roomRetryAt=0;clearTimeout(roomPollTimer);roomPollTimer=null;
 keepGmSessionAlive();announcePlayerPresence();pollRoom().then(ok=>{if(ok)scheduleRoomPatch()});
});
async function updateCampaignSpellSharing(operation,ticket){
 const args={ticket,scene_key:null,operation};
 if(operation==='unshare')return roomRpc('spell_catalog',args);
 const auth=JSON.parse(localStorage.getItem('rq_auth_session')||sessionStorage.getItem('rq_auth_session')||'null');
 if(!auth?.access_token||auth.expires_at&&auth.expires_at*1000<=Date.now())
  throw Error('Open Spell Workshop and sign in, then try again.');
 return roomRpc('spell_catalog',args,auth.access_token);
}
const campaignSpellDialog=el('campaignSpellDialog'),campaignSpellStatus=el('campaignSpellStatus');
const campaignSpellButtons=[el('shareCampaignSpells'),el('unshareCampaignSpells')];
el('campaignSpellCatalog').onclick=()=>{
 if(roomProfile?.gm!==true)return;
 campaignSpellDialog.showModal();
};
async function changeCampaignSpellSharing(operation){
 if(roomProfile?.gm!==true)return;
 for(const button of campaignSpellButtons)button.disabled=true;
 campaignSpellStatus.textContent=operation==='share'?'Sharing catalog…':'Stopping catalog sharing…';
 try{
  await updateCampaignSpellSharing(operation,roomProfile.token);
  campaignSpellStatus.textContent=operation==='share'?'Catalog shared with Battlemap players.':'Catalog sharing stopped.';
 }catch(error){campaignSpellStatus.textContent=error.message}
 finally{for(const button of campaignSpellButtons)button.disabled=false}
}
campaignSpellButtons[0].onclick=()=>changeCampaignSpellSharing('share');
campaignSpellButtons[1].onclick=()=>changeCampaignSpellSharing('unshare');

function enterRoom(profile){
 sessionStorage.removeItem('battlemap.signOutNotice');
 roomProfile=profile;roomRevision=-1;roomCursor=-1;
 el('playerPreloadPreference').hidden=profile.gm!==false;
 if(profile.gm)void restoreSharedSceneQueue(profile);
 el('openGroupChallenge').hidden=!profile.gm;
 updateChallengeStatus();
 if(!sessionStorage.getItem(roomActivityKey))sessionStorage.setItem(roomActivityKey,String(Date.now()));
 checkRoomIdle();
 if(roomIdleSigningOut)return;
 el('roomLobbyChat').hidden=!profile.gm;
 el('roomLeave').hidden=false;
 el('campaignSpellCatalog').hidden=profile.gm!==true;
 el('roomActivate').hidden=el('roomPause').hidden=el('userAccounts').hidden=!profile.gm;
 el('roomTurnState').hidden=!profile.gm;
 if(profile.gm){
  restoreActiveRoom=isTestPreview(requestedRoomScene)||!recoveredDetachedDraft;recoveredDetachedDraft=false;
  workspaceLoad=loadWorkspace(profile.token);
  if(!restoreActiveRoom&&currentSceneId)privateCombatLoad=hydrateStandeeCombat(currentSceneId,tokens);
  el('roomLobby').hidden=true;playing=false;refresh();
 }else{
  document.body.classList.add('room-player');playing=true;
  el('roomJoin').hidden=true;el('roomBack').hidden=false;
  for(const key of ['rolls','initiative'])el(key+'Panel').hidden=true;
 }
 keepGmSessionAlive();announcePlayerPresence();pollRoom();connectRoomRealtime();
}
el('roomJoin').onsubmit=async e=>{
 e.preventDefault();
 const selection=el('roomProfile').value;
 const name=selection;
 const character=el('roomDisplayName').value.trim();
 const choice=el('roomCharacter').value;
 if(!name||!['gm1000','gm2000'].includes(selection) && ['gm1000','gm2000'].includes(name.toLowerCase())){el('roomLobbyStatus').textContent='Choose a valid profile.';return}
 el('roomLoad').disabled=true;
 try{
  let result;
  if(['gm1000','gm2000'].includes(selection)){
   const password=el('roomPassword').value;
   result=await roomRpc('gm_login_named',{gm_name:selection,password});
   if(result.takeover){
    if(!confirm('The GM is signed in on another tab or device. Sign it out and continue here?')){
     el('roomLobbyStatus').textContent='The other GM session is still signed in.';return;
    }
    result=await roomRpc('gm_login_named',{gm_name:selection,password,takeover:result.takeover});
   }
  }else result=await roomRpc('login',{player_name:name,character_key:choice,character_display:character,gm_password:el('roomPassword').value||null});
  const profile={...result,name,character,characterKey:choice};
  sessionStorage.setItem(roomActivityKey,String(Date.now()));
  sessionStorage.setItem('battlemap.roomProfile',JSON.stringify(profile));
  el('roomPassword').value='';enterRoom(profile);
 }catch(err){el('roomLobbyStatus').textContent=err.message}
 finally{el('roomLoad').disabled=false}
};
async function leaveRoom(idleNotice){
 if(roomProfile?.gm){
  try{await roomRpc('gm',{ticket:roomProfile.token,operation:'logout'})}catch(err){if(!idleNotice){message(err.message);return}}
 }
 if(idleNotice)sessionStorage.setItem('battlemap.signOutNotice',idleNotice);
 sessionStorage.removeItem(roomActivityKey);
 sessionStorage.removeItem('battlemap.viewedScene');
 sessionStorage.removeItem('battlemap.roomProfile');location.reload();
}
el('roomLeave').onclick=el('roomBack').onclick=()=>leaveRoom();
let startingRoomScene=false;
function viewRoomScene(sceneId){
 requestedRoomScene=sceneId;
 if(sceneId)sessionStorage.setItem('battlemap.viewedScene',sceneId);
 else sessionStorage.removeItem('battlemap.viewedScene');
 roomCursor=-1;
 roomRevision=-1;
 restoreActiveRoom=!!roomProfile?.gm;
}
async function startRoomScene(operation,scene,{requireShared=false}={}){
 if(!roomProfile?.gm||startingRoomScene)return;
 if(operation==='test'&&roomDraftAttached&&currentSceneId===testPreviewPrefix+scene?.id)return;
 const switchingScene=currentSceneId!==scene?.id;
 if(operation==='test'||switchingScene&&(operation==='open'||operation==='activate'&&isTestPreview(currentSceneId))){
  if(roomPatchBusy||roomPatchPending){await flushRoomPatch();if(roomPatchBusy||roomPatchPending){message('Live edits are still synchronizing. Scene switch cancelled.');return}}
  const saved=await flushOrPreserveDetachedDraft();
  if(!saved){message('Could not save the current scene; scene switch cancelled.');return}
 }
 if(!scene){el('sceneDialog').showModal();return}
 startingRoomScene=true;
 try{
  await outboundRoom;
  await flushRoomPatch();
  if(roomPatchBusy||roomPatchPending)throw Error('Wait for pending scene edits to synchronize.');
  if(roomPollTask)await roomPollTask;
  if(operation==='test'){
   const preview=await roomRpc('test_open',{ticket:roomProfile.token,requested_scene:scene.id});
   if(!preview.testPreview)throw Error('This scene is active. Open its live encounter instead.');
   if(roomPollTask)await roomPollTask;
   viewRoomScene(preview.sceneId);
   const opened=await pollRoom();
   if(!opened||!roomDraftAttached||currentSceneId!==preview.sceneId)
    throw Error('Could not join the test preview. Try again after reconnecting.');
   if(el('sceneDialog').open)el('sceneDialog').close();
   return;
  }
  let initial_scene=null;
  if(operation==='open'||operation==='activate'){
   // scene_sync can return a saved-catalog preview with active=true even
   // when no encounter row exists. Always provide the saved snapshot and
   // invoke scene_manage: it creates a missing encounter and preserves an
   // existing encounter (including live player edits) without replacing it.
   const previous={pieces,tokens,areas};
   try{
    ({pieces,tokens,areas}=structuredClone(scene.map));
    initial_scene=roomSnapshot();
   }finally{({pieces,tokens,areas}=previous)}
  }
  if(initial_scene)await inheritStandeeOwners(initial_scene.tokens);
  await roomRpc('manage',{ticket:roomProfile.token,requested_scene:scene.id,operation,initial_scene});
  if(operation==='open'||operation==='activate'){
   // Finish any poll for the previous scene before attaching the new one.
   if(roomPollTask)await roomPollTask;
   viewRoomScene(scene.id);
   const opened=await pollRoom();
   if(!opened||!roomDraftAttached||currentSceneId!==scene.id||roomState.sceneId!==scene.id)
    throw Error('Could not load '+scene.name+' from the session server. Try again after reconnecting.');
   if(el('sceneDialog').open)el('sceneDialog').close();
  }else await pollRoom();
  if(el('sceneDialog').open)renderScenes();
 }catch(error){
  if(el('sceneDialog').open)el('sceneStatus').textContent=error.message;
  else message(error.message);
 }finally{startingRoomScene=false}
}
el('roomActivate').onclick=()=>startRoomScene('activate',scenes.find(scene=>scene.id===currentSceneId));
function updateJoinSharedEncounter(){
 // A saved scene and its active encounter are no longer separate GM destinations.
 el('joinSharedEncounter').hidden=true;
}
el('joinSharedEncounter').onclick=()=>{
 if(!roomProfile?.gm||roomDraftAttached)return;
 const scene=scenes.find(item=>item.id===currentSceneId);
 if(!scene){message('Save this draft before joining a shared encounter.');return}
 if(confirm('Join the shared encounter for '+scene.name+'? Save your local draft first if you want to keep its changes.'))
  void startRoomScene('open',scene,{requireShared:true});
};
el('roomPause').onclick=()=>startRoomScene(roomState.paused?'resume':'pause',scenes.find(scene=>scene.id===roomState.sceneId));
let testerPickerTicket=null;
async function openTesterScenePicker(){
 const profile=roomProfile;
 try{
  const options=await roomRpc('list',{ticket:profile.token,requested_scene:null});
  if(profile!==roomProfile)return;
  const list=el('testerSceneList'),dialog=el('testerSceneDialog');
  list.replaceChildren();
  for(const scene of options)list.append(catalogButton(scene.title+' · '+(scene.status==='Active'?'Live scene':'Test preview'),async()=>{
   try{
    const preview=await roomRpc('test_open',{ticket:profile.token,requested_scene:scene.id});
    if(profile!==roomProfile)return;
    viewRoomScene(preview.sceneId||scene.id);
    dialog.close();
    await pollRoom();
   }catch(error){message(error.message)}
  }));
  if(!options.length)list.textContent='No saved scenes are available yet.';
  if(!dialog.open)dialog.showModal();
 }catch(error){message(error.message)}
}
el('testerScenes').onclick=openTesterScenePicker;
async function startRoom(){
 let saved;
 try{saved=JSON.parse(sessionStorage.getItem('battlemap.roomProfile'))}catch{}
 updateRoomPicker();
 if(saved?.gm&&saved.token){
  try{
   await roomRpc('gm',{ticket:saved.token,operation:'heartbeat'});
  }catch(error){
   if(error.message==='GM session expired.'){
    sessionStorage.removeItem('battlemap.roomProfile');
    sessionStorage.setItem('battlemap.signOutNotice','GM session expired. Sign in again.');
   }else{
    sessionStorage.setItem('battlemap.signOutNotice','Could not reconnect to the GM session. '+error.message);
   }
   saved=null;
  }
 }
 if(saved?.token)enterRoom(saved);else pollRoom();
 let lastCheck=0;
 setInterval(()=>{
  const now=Date.now(),delay=roomProfile?5000:12000;
  if((!document.hidden||roomProfile?.gm)&&now-lastCheck>=delay){lastCheck=now;pollRoom()}
 },1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkRoomIdle();keepGmSessionAlive();pollRoom()}});
}
async function startStudio(){
 const surfaces=document.querySelectorAll('header, main');
 surfaces.forEach(surface=>surface.inert=true);
 try{
  const savedCatalog=await savedValue(accountCatalogKey,[]);
  if(Array.isArray(savedCatalog))accountCatalog=new Map(savedCatalog.map(entry=>[entry.id,entry]));
  const savedScenes=await savedValue(scenesKey,[]);
  if(Array.isArray(savedScenes))scenes=savedScenes.map((scene,index)=>({...scene,id:scene.id||"legacy-"+index}));
  const savedQueue=await savedValue(nextSessionQueueKey,[]);
  nextSessionQueue=Array.isArray(savedQueue)?savedQueue:[];
  const savedFolders=await savedValue(sceneFoldersKey,[]);
  if(Array.isArray(savedFolders))sceneFolders=savedFolders;
  const savedLibrary=await savedValue(standeeLibraryKey,[]);
  const savedImages=await savedValue(battlemapImageKey,[]);
  managedImages=Array.isArray(savedImages)?savedImages:Array.isArray(savedImages?.images)?savedImages.images:[];
  managedFolders=Array.isArray(savedImages?.folders)?savedImages.folders:[];
  if(Array.isArray(savedLibrary))standeeLibrary=savedLibrary;
  await recoverSession();
  await recoverDisplayPreferences();
  terrainLocked=await savedValue('battlemap.terrainLockPreference',terrainLocked)===true;
 }finally{surfaces.forEach(surface=>surface.inert=false)}
 try{
  const view=JSON.parse(localStorage.getItem('battlemap.camera'));
  if(view&&[view.angle,view.tilt,view.zoom,view.panX,view.panY].every(Number.isFinite)){
   ({angle,tilt,zoom,panX,panY}=view);
   if(isoLocked)tilt=.69;
   C=Math.cos(angle);D=Math.sin(angle);
   topDown=view.topDown===true;
  }
 }catch{}
 const saveView=()=>{
  saveFogMemory();
  void syncFogMemory(fogMemoryState);
  try{localStorage.setItem('battlemap.camera',JSON.stringify({angle,tilt,zoom,panX,panY,topDown}))}catch{}
 };
 setInterval(saveView,3000);
 window.addEventListener('pagehide',saveView);
 recoveryReady=true;
 if(typeof ResizeObserver==='function')new ResizeObserver(draw).observe(canvas);
else window.addEventListener('resize',draw);
 refresh();
}
initializeWallPaths();
startStudio().then(startRoom);
