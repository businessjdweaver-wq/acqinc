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
return Object.freeze({CONDITIONS,actor,stats,transform,revert,damage,setCondition,tick,specialTile,reactions});
});
