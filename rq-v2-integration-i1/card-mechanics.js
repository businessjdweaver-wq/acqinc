/* RQ V2 card mechanics: independent, no cloud calls. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RQCardMechanics=api;})(globalThis,function(){
'use strict';
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const CONDITIONS=['stunned','flying','invisible','transformed'];
function actor(spec={}){
 const maxHp=Math.max(1,n(spec.maxHp,100));
 return {id:spec.id||'',base:{maxHp,damage:n(spec.damage),defense:n(spec.defense),powers:[...(spec.powers||[])]},hp:clamp(n(spec.hp,maxHp),0,maxHp),temporaryHp:0,forms:spec.forms||{},form:null,conditions:{}};
}
function stats(a){
 const b=a.base,f=a.form&&a.forms[a.form.id];if(!f)return {...b,powers:[...b.powers]};
 const m=f.modifiers||{};
 const powers=f.replacePowers?[...(f.powers||[])]:[...b.powers,...(f.powers||[])];
 return {maxHp:Math.max(1,Math.round(b.maxHp*n(m.maxHpMultiplier,1)+n(m.maxHpFlat))),damage:b.damage*n(m.damageMultiplier,1)+n(m.damageFlat),defense:b.defense*n(m.defenseMultiplier,1)+n(m.defenseFlat),powers:powers.filter(p=>!(f.disablePowers||[]).includes(p))};
}
function revert(a){
 if(!a.form)return false;
 const previous=stats(a),policy=a.form.exitHpPolicy,oldHp=a.hp;
 a.form=null;delete a.conditions.transformed;
 const normal=stats(a);
 a.hp=clamp(policy==='preserve-ratio'?Math.round(oldHp/previous.maxHp*normal.maxHp):oldHp,0,normal.maxHp);
 a.temporaryHp=0;return true;
}
function transform(a,id,options={}){
 const f=a.forms[id];if(!f)throw Error('Unknown transformation');
 if(a.form)revert(a);
 const before=stats(a),oldHp=a.hp;
 const duration=Math.max(0,Math.floor(n(options.duration,f.duration||0)));
 a.form={id,remaining:duration,exitHpPolicy:f.exitHpPolicy||'preserve-absolute'};
 const after=stats(a),policy=f.enterHpPolicy||'preserve-ratio';
 a.hp=clamp(policy==='heal-to-full'?after.maxHp:policy==='preserve-ratio'?Math.round(oldHp/before.maxHp*after.maxHp):oldHp,0,after.maxHp);
 a.temporaryHp=Math.max(0,n(f.temporaryHp));
 a.conditions.transformed={remaining:duration,label:f.label||id};
 return stats(a);
}
function damage(a,amount){
 let remaining=Math.max(0,n(amount));
 const absorbed=Math.min(remaining,a.temporaryHp);a.temporaryHp-=absorbed;remaining-=absorbed;
 const dealt=Math.min(remaining,a.hp);a.hp-=dealt;
 if(a.form&&a.forms[a.form.id].revertOnTemporaryHpExhausted&&absorbed>0&&a.temporaryHp===0)revert(a);
 return {absorbed,dealt,hp:a.hp};
}
function setCondition(a,type,duration,label){
 if(!CONDITIONS.includes(type)||type==='transformed')throw Error('Unknown standalone condition');
 a.conditions[type]={remaining:Math.max(0,Math.floor(n(duration))),label:label||type};
}
function tick(a){
 for(const type of Object.keys(a.conditions)){
  if(type==='transformed')continue;
  const status=a.conditions[type];
  if(status.remaining>0&&--status.remaining===0)delete a.conditions[type];
 }
 if(a.form&&a.form.remaining>0){
  a.form.remaining--;
  if(a.form.remaining===0)revert(a);
  else a.conditions.transformed.remaining=a.form.remaining;
 }
}
function specialTile(type,emoji,owner,strength=0){
 if(!/^[a-z][a-z0-9_-]{0,47}$/.test(type)||typeof emoji!=='string'||!emoji.trim()||emoji.length>16)throw Error('Invalid tile definition');
 return {type,emoji,owner:String(owner),strength:n(strength)};
}
function reactions(rules=[],maxEvents=100,maxFires=50){
 const queue=[],log=[],counts=new Map();let processed=0,fired=0;
 const emit=e=>{if(queue.length>=maxEvents)throw Error('Reaction queue limit');queue.push(e);};
 function drain(context={}){
  while(queue.length){
   if(++processed>maxEvents)throw Error('Reaction event limit');
   const event=queue.shift();
   for(const rule of rules){
    if(rule.trigger!==event.type||rule.predicate&&!rule.predicate(event,context))continue;
    const key=String(rule.id||rules.indexOf(rule)),count=counts.get(key)||0;
    if(count>=n(rule.maxFires,maxFires))continue;
    if(++fired>maxFires)throw Error('Reaction fire limit');
    counts.set(key,count+1);log.push({rule:key,event:event.type});
    if(typeof rule.effect==='function')rule.effect(event,{emit,context});
   }
  }
  return log.slice();
 }
 return {emit,drain,log};
}

/* Pattern coordinates are offsets from the chosen center, independent of board size. */
function pattern(cells){
 if(!Array.isArray(cells)||cells.length>225)throw Error('Pattern must have at most 225 cells');
 const seen=new Set(),out=[];
 for(const p of cells){const x=Number(p.x),y=Number(p.y);
  if(!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>7||Math.abs(y)>7)throw Error('Invalid pattern offset');
  const key=x+','+y;if(!seen.has(key)){seen.add(key);out.push({x,y});}
 }
 return out;
}
const PATTERNS=Object.freeze({
 ring8:pattern(Array.from({length:9},(_,i)=>({x:i%3-1,y:Math.floor(i/3)-1})).filter(p=>p.x||p.y)),
 x:pattern([{x:-2,y:-2},{x:-1,y:-1},{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:-2,y:2},{x:-1,y:1},{x:1,y:-1},{x:2,y:-2}]),
 star:pattern([{x:0,y:0},{x:0,y:-2},{x:0,y:-1},{x:0,y:1},{x:0,y:2},{x:-2,y:0},{x:-1,y:0},{x:1,y:0},{x:2,y:0},{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:1,y:1}])
});
function patternTargets(width,height,cells,center){
 const w=Math.floor(n(width)),h=Math.floor(n(height)),cx=center.x,cy=center.y;
 if(w<1||h<1||w*h>10000||!Number.isInteger(cx)||!Number.isInteger(cy)||cx<0||cx>=w||cy<0||cy>=h)throw Error('Invalid board/center');
 return pattern(cells).map(p=>({x:cx+p.x,y:cy+p.y})).filter(p=>p.x>=0&&p.x<w&&p.y>=0&&p.y<h);
}
function applyPattern(board,width,height,options){
 if(!Array.isArray(board)||board.length!==width*height)throw Error('Board size mismatch');
 const count=Math.max(1,Math.min(100,Math.floor(n(options.count,1))));
 const rng=options.random||Math.random, centers=[];
 for(let i=0;i<count;i++){
  let c;
  if(options.centerMode==='selected'){c=options.centers?.[i]||options.center;if(!c)throw Error('Selected center required');}
  else {c={x:Math.min(width-1,Math.floor(clamp(rng(),0,0.999999)*width)),y:Math.min(height-1,Math.floor(clamp(rng(),0,0.999999)*height))};}
  centers.push(c);
 }
 const affected=new Set(),resources={};
 for(const center of centers)for(const pos of patternTargets(width,height,options.cells,center)){
  const index=pos.y*width+pos.x;if(affected.has(index))continue;affected.add(index);
  const tile=board[index];if(!tile)continue;
  const result=options.change(tile,{index,...pos,center})||{};
  if(result.changed&&options.gainResources&&result.collectable!==false&&Number.isInteger(tile.color??tile.v)){
   resources[tile.color??tile.v]=(resources[tile.color??tile.v]||0)+Math.max(0,n(result.resourceAmount,1));
  }
 }
 return {indices:[...affected],centers,resources};
}
/* Resource colors are numeric keys; ties break by ascending color ID. */
function rankResourceColor(resources,mode='best',eligible=null){
 const ids=(eligible||Object.keys(resources).map(Number)).map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
 if(!ids.length)return null;
 if(mode!=='best'&&mode!=='worst')throw Error('Invalid ranking');
 return ids.reduce((best,id)=>best===null||(mode==='best'?n(resources[id])>n(resources[best]):n(resources[id])<n(resources[best]))?id:best,null);
}
function changeResource(resources,color,delta,{maximum=Infinity}={}){
 const before=Math.max(0,n(resources[color]));
 const after=clamp(before+n(delta),0,maximum);
 resources[color]=after;return {before,after,delta:after-before};
}
function chooseTeamColor(teams,side,mode='best',eligible=null){
 if(side!=='ally'&&side!=='enemy')throw Error('Invalid team');
 if(!teams[side])throw Error('Missing team resources');
 return rankResourceColor(teams[side],mode,eligible);
}
/* Hidden traps are overlays, not replacement match colors. */
function makeTrap({id,owner,triggerTeam,trigger='matched',effect,charges=1,emoji='⚠️'}){
 if(!id||!owner||!triggerTeam||typeof effect!=='object'||effect===null)throw Error('Invalid trap');
 return {kind:'trap',id:String(id),owner:String(owner),triggerTeam:String(triggerTeam),trigger,emoji,charges:Math.max(1,Math.floor(n(charges,1))),effect:{...effect}};
}
function visibleTile(tile,viewerTeam){
 if(!tile)return tile;
 const copy={...tile};
 if(copy.hiddenTrap&&copy.hiddenTrap.owner!==viewerTeam)delete copy.hiddenTrap;
 return copy;
}
function triggerTraps(matchedTiles,actingTeam){
 const fired=[];
 for(const tile of matchedTiles){
  const trap=tile?.hiddenTrap;
  if(!trap||trap.triggerTeam!==actingTeam||trap.trigger!=='matched'||trap.charges<=0)continue;
  trap.charges--;
  fired.push({trapId:trap.id,owner:trap.owner,targetTeam:actingTeam,effect:{...trap.effect}});
  if(!trap.charges)delete tile.hiddenTrap;
 }
 return fired;
}

return Object.freeze({CONDITIONS,actor,stats,transform,revert,damage,setCondition,tick,specialTile,reactions,pattern,PATTERNS,patternTargets,applyPattern,rankResourceColor,changeResource,chooseTeamColor,makeTrap,visibleTile,triggerTraps});
});
