'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RQMonsterIrisKael=api;
})(globalThis,function(){

// Rank-one enemy-side counterparts for the existing Iris and Kael hero kits.
// These definitions intentionally stay separate from the shared dispatcher;
// combat integration supplies the engine adapters for these effect IDs.
const kits = Object.freeze({
  iris: Object.freeze([
    Object.freeze({name:'Temporal Reversal',color:3,cost:6,effect:'chronophage-reversal',percent:50}),
    Object.freeze({name:'Stolen Seconds',color:2,cost:5,effect:'chronophage-steal',amount:3}),
    Object.freeze({name:'Stop Time',color:6,cost:6,effect:'iris-stop-time',duration:1})
  ]),
  kael: Object.freeze([
    Object.freeze({name:'Arms of the Astral Self',color:2,cost:6,effect:'astral-arms',swaps:1}),
    Object.freeze({name:'Astral Flurry',color:3,cost:6,effect:'astral-flurry',damagePerMatch:4}),
    Object.freeze({name:'Stillness Beyond Form',color:6,cost:6,effect:'astral-stillness',reduction:20,swaps:1})
  ])
});

// Engine hooks keep this module independent of combat state. The host owns
// legality, mutations, animation and normal damage resolution.
function createHandlers(ctx) {
  const handler=(select,apply)=>Object.freeze({select,apply});
  return Object.freeze({
    'chronophage-reversal':handler((actor,p)=>ctx.temporalRecovery(actor,p.percent)||null,(actor,p,amount)=>ctx.temporalHeal(actor,amount)),
    'chronophage-steal':handler(()=>ctx.strongestResource(),(actor,p,color)=>ctx.stealSeconds(color,p.amount,p.color)),
    'iris-rewrite':handler(
      (actor,p)=>ctx.rewriteTarget?.(actor,p.rounds) ?? null,
      (actor,p,target)=>ctx.rewriteMove(actor,target,p.rounds)
    ),
    'iris-lengthen':handler(
      actor=>ctx.lengthenableCountdown?.(actor) ?? null,
      (actor,p,target)=>ctx.extendCountdown(actor,target,p.ticks)
    ),
    'iris-stop-time':handler(
      actor=>ctx.lockableCountdown?.(actor) ?? null,
      (actor,p,target)=>ctx.lockCountdown(actor,target,p.duration)
    ),
    'astral-arms':handler(
      actor=>ctx.adjacentOrdinaryPair?.(actor) ?? null,
      async(actor,p,pair)=>ctx.swapForEnemy(actor,pair,{allowMatch:true,swaps:p.swaps})
    ),
    'astral-flurry':handler(
      actor=>ctx.frontHero?.()!==undefined?actor:null,
      (actor,p)=>ctx.releaseFlurry(actor,p.damagePerMatch)
    ),
    'astral-stillness':handler(
      actor=>ctx.stillnessTarget?.(actor) ?? null,
      async(actor,p,pair)=>{
        ctx.reduceIncomingDamage(actor,p.reduction);
        await ctx.swapForEnemy(actor,pair,{allowMatch:true,swaps:p.swaps});
      }
    )
  });
}

return {kits,createHandlers};
});
