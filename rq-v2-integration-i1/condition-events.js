(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./conditions.js'):root.RQConditions,typeof module==='object'&&module.exports?require('./power-events.js'):root.RQPowerEvents);if(typeof module==='object'&&module.exports)module.exports=api;else root.RQConditionEvents=api;})(typeof globalThis!=='undefined'?globalThis:this,function(conditions,events){
'use strict';
function createConditionEventSystem({rules=[],maxDepth=8,maxEvents=128,onEffect=()=>{}}={}){
 const notifications=[],pending=[];let dispatching=false;
 const dispatcher=events.createDispatcher({maxDepth,maxEvents,onEffect:ctx=>{onEffect(ctx);}});
 const engine=conditions.createConditions();
 rules.forEach((r,i)=>dispatcher.add(r.id||'rule-'+i,r));
 function signal(type,actor,condition,extra={}){const e={type,actor,condition,subject:extra.subject||'self',...extra};notifications.push(e);pending.push(e);if(!dispatching)flush();}
 function flush(){dispatching=true;try{while(pending.length){const e=pending.shift();dispatcher.emit(e)}}finally{dispatching=false}}
 function apply(actor,type,config,meta={}){const before=engine.get(actor,type);const next=engine.apply(actor,type,config);if(next!==before){signal('condition-gained',actor,type,{...meta,reapplied:!!before})}return next}
 function remove(actor,type,reason='manual',meta={}){const exists=!!engine.get(actor,type);if(exists&&engine.remove(actor,type))signal('condition-lost',actor,type,{...meta,reason});return exists}
 function reconcile(before,reason){for(const item of before)if(!engine.get(item.actor,item.type))signal('condition-lost',item.actor,item.type,{reason})}
 function tick(actor,boundary){const before=engine.list();engine.tick(actor,boundary);reconcile(before,'turns')}
 function emit(event){const before=engine.list();engine.emit(event);reconcile(before,'event');dispatcher.emit(event)}
 function consume(actor,type){const before=engine.list();const result=engine.consume(actor,type);reconcile(before,'charges');return result}
 function endEncounter(){const before=engine.list();engine.endEncounter();reconcile(before,'encounter');dispatcher.newEncounter()}
 return{apply,remove,tick,emit,consume,endEncounter,get:engine.get,list:engine.list,dispatcher,notifications};
}
return{createConditionEventSystem};
});
