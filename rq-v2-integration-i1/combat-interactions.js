/* Pure in-memory combat interactions for the Power Test Lab. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./condition-events.js'):root.RQConditionEvents);if(typeof module==='object'&&module.exports)module.exports=api;else root.RQCombatInteractions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(conditionEvents){
'use strict';
function createCombatInteractions({actors={},rules=[],maxEvents=128}={}){
 const units=new Map(),log=[];
 for(const [id,data] of Object.entries(actors)){const max=Number(data.maxHp),hp=Number(data.hp);if(!Number.isSafeInteger(max)||max<1||!Number.isSafeInteger(hp)||hp<0||hp>max)throw Error('Invalid health');units.set(id,{hp,maxHp:max})}
 let actions=0;
 const system=conditionEvents.createConditionEventSystem({rules,maxEvents,onEffect:({rule,event})=>{
  const effect=rule.effect;if(!effect)return;
  if(!['damage','heal'].includes(effect.type))return;
  const target=effect.target==='event-actor'?event.actor:effect.target==='event-target'?event.target:effect.target;
  if(!units.has(target))return;
  if(++actions>maxEvents)throw Error('Combat effect budget exceeded');
  change(effect.type,target,effect.amount,{source:'power',emitEvent:false});
 }});
 function change(kind,target,amount,{source='direct',emitEvent=true}={}){
  if(!units.has(target))throw Error('Unknown target');
  const n=Number(amount);if(!Number.isSafeInteger(n)||n<0||n>9999)throw Error('Invalid amount');
  const u=units.get(target),before=u.hp;
  u.hp=kind==='damage'?Math.max(0,u.hp-n):Math.min(u.maxHp,u.hp+n);
  const actual=Math.abs(u.hp-before);
  log.push({kind,target,requested:n,actual,before,after:u.hp,source});
  if(emitEvent&&actual>0){system.emit({type:kind==='damage'?'damage-taken':'healing-received',actor:target,target,subject:'self',condition:'any',amount:actual})}
  return actual;
 }
 return{damage:(id,n)=>change('damage',id,n),heal:(id,n)=>change('heal',id,n),apply:system.apply,remove:system.remove,getCondition:system.get,health:id=>({...units.get(id)}),events:system,log};
}
return{createCombatInteractions};
});
