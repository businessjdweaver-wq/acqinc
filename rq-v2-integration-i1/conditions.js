(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RQConditions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function createConditions(){
 const active=new Map(),key=(actor,type)=>actor+'::'+type;
 function apply(actor,type,config){
  const mode=config.mode,stacking=config.stacking||'refresh',value=Number(config.value||1);
  if(!['turns','event','charges','encounter','manual'].includes(mode)||!['refresh','extend','stack','ignore'].includes(stacking)||!Number.isInteger(value)||value<1||value>99)throw Error('Invalid condition');
  const k=key(actor,type),old=active.get(k);if(old&&stacking==='ignore')return old;
  const next={actor,type,mode,stacking,boundary:config.boundary||'owner-end',event:config.event||'',remaining:old&&stacking==='extend'?old.remaining+value:old&&stacking==='stack'?Math.max(old.remaining,value):value,stacks:old&&stacking==='stack'?old.stacks+1:old?.stacks||1};
  active.set(k,next);return next;
 }
 function remove(actor,type){return active.delete(key(actor,type))}
 function tick(actor,boundary){for(const c of [...active.values()])if(c.actor===actor&&c.mode==='turns'&&c.boundary===boundary&&--c.remaining<=0)remove(actor,c.type)}
 function emit(event){for(const c of [...active.values()])if(c.mode==='event'&&c.event===event.type&&(c.actor===event.actor||c.actor===event.target))remove(c.actor,c.type)}
 function consume(actor,type){const c=active.get(key(actor,type));if(!c||c.mode!=='charges')return false;if(--c.remaining<=0)remove(actor,type);return true}
 function endEncounter(){for(const c of [...active.values()])if(c.mode==='encounter')remove(c.actor,c.type)}
 return{apply,remove,tick,emit,consume,endEncounter,get:(a,t)=>active.get(key(a,t)),list:()=>[...active.values()].map(c=>({...c}))};
}
return{createConditions};
});