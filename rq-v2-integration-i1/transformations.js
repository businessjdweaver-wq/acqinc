/* Reversible character transformation layer; no persistence. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./condition-events.js'):root.RQConditionEvents);if(typeof module==='object'&&module.exports)module.exports=api;else root.RQTransformations=api;})(typeof globalThis!=='undefined'?globalThis:this,function(events){
'use strict';
function createTransformations({characters={},rules=[]}={}){
 const base=new Map(),forms=new Map(),system=events.createConditionEventSystem({rules});
 for(const [id,stats] of Object.entries(characters))base.set(id,Object.freeze({...stats}));
 function stats(id){const original=base.get(id);if(!original)throw Error('Unknown character');const form=forms.get(id);return {...original,...(form?.overrides||{})}}
 function transform(id,overrides,expiration){
  if(!base.has(id)||!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw Error('Invalid transformation');
  const allowed=['attack','defense','speed','maxHp','name','form'];for(const [k,v] of Object.entries(overrides)){if(!allowed.includes(k))throw Error('Unsupported transformation property');if(['attack','defense','speed','maxHp'].includes(k)&&(!Number.isFinite(v)||v<0))throw Error('Invalid stat override')}
  const existing=forms.get(id);
  const config={...expiration,stacking:expiration?.stacking||'refresh'};
  const next=system.apply(id,'transformed',config);
  if(existing&&config.stacking==='ignore')return stats(id);
  forms.set(id,{overrides:{...overrides}});
  if(!existing)system.emit({type:'character-transformed',actor:id,subject:'self',condition:'transformed'});
  return stats(id);
 }
 function restore(id){const had=forms.delete(id);if(had)system.remove(id,'transformed');return had}
 function reconcile(){for(const id of [...forms.keys()])if(!system.get(id,'transformed')){forms.delete(id);system.emit({type:'character-restored',actor:id,subject:'self',condition:'transformed'})}}
 function tick(id,boundary){system.tick(id,boundary);reconcile()}
 function emit(event){system.emit(event);reconcile()}
 function endEncounter(){system.endEncounter();reconcile()}
 return{stats,transform,restore,tick,emit,endEncounter,events:system,active:id=>forms.has(id)};
}
return{createTransformations};
});
