'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RQMonsterTorVex=api;
})(globalThis,function(){
 'use strict';

 // Tor's charge and Vex's false flag are delegated to the combat adapter so
 // the board keeps ownership of tile eligibility, animation, and mutations.
 function createHandlers(ctx){
  return {
   'unstoppable-charge':{
    select:(_actor,power)=>ctx.chargeTiles?.(power) || null,
    apply:(actor,power,tiles)=>ctx.applyCharge?.(actor,power,tiles)
   },
   'false-flag':{
    select:()=>ctx.ordinaryTiles?.().find(tile=>ctx.falseFlagEligible?.(tile)) || null,
    apply:(actor,power,tile)=>ctx.createFalseFlag?.(actor,power,tile)
   },
   'immovable-object':{
    select:()=>ctx.defenseTiles?.().find(tile=>ctx.immovableEligible?.(tile)) || null,
    apply:(actor,power,tile)=>ctx.immovableObject?.(actor,power,tile)
   },
   'feed-the-chaos':{
    select:()=>ctx.enemySpecialStrength?.()>0?ctx.enemySpecialStrength():null,
    apply:(actor,power,strength)=>ctx.feedTheChaos?.(actor,power,strength)
   }
  };
 }
 function chargeSpan(level=1){return level===1?2:level===4?5:3;}
 function rageEngineBursts(damage,bank=0){
  let remaining=Math.max(0,bank)+Math.max(0,damage),bursts=0;
  while(remaining>=40&&bursts<3){remaining-=40;bursts++;}
  return Object.freeze({remaining,bursts,tileCount:bursts,strength:2});
 }
 function uncannyDodgeReduction(enemyAttackTiles){return Math.min(.85,.25+Math.max(0,enemyAttackTiles)*.05);}
 return Object.freeze({createHandlers,chargeSpan,rageEngineBursts,uncannyDodgeReduction,immovableObjectReduction:()=>.15});
});
