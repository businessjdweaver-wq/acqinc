'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RQEnemyPowers=api;
})(globalThis,function(){
  // Runtime adapters own targeting, animation and combat mutations.
  // An unavailable target must not consume resources.
  async function activate({power,energy,actor,blocked,handlers,activation}){
    if(!actor||actor.hp<=0||blocked||!power)return false;
    if(!Number.isInteger(power.color)||power.color<0||power.color>=energy.length||
       !Number.isInteger(power.cost)||power.cost<1||!(energy[power.color]>=power.cost))return false;
    if(!Object.hasOwn(handlers,power.effect))return false;
    const handler=handlers[power.effect];
    const target=handler.select(actor,power);
    if(target==null)return false;
    energy[power.color]-=power.cost;
    // Counterspell deliberately retains the resource expenditure.
    return await activation(power.name,()=>handler.apply(actor,power,target));
  }
  return Object.freeze({activate});
});
