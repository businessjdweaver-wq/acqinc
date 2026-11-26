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
  // Adapters must use the combat engine's authoritative mutation functions.
  function createHandlers(ctx){
    const living=()=>ctx.enemies().filter(e=>e.hp>0);
    const injured=()=>living().filter(e=>e.hp<e.max).sort((a,b)=>a.hp/a.max-b.hp/b.max)[0];
    return Object.freeze({
      damage:{select:()=>ctx.frontHero(),apply:(a,p,t)=>ctx.damageHero(t,p.amount)},
      heal:{select:injured,apply:(a,p,t)=>ctx.healEnemy(t,p.amount)},
      siphon:{select:()=>ctx.frontHero(),apply:async(a,p,t)=>{
        await ctx.damageHero(t,p.amount);
        const ally=injured();if(ally)await ctx.healEnemy(ally,p.heal);
      }},
      'drain-resource':{select:(a,p)=>ctx.heroResources()[p.targetColor]>0?p.targetColor:null,
        apply:(a,p,t)=>ctx.drainHeroResource(t,p.amount)},
      'create-special':{select:()=>ctx.ordinaryTiles()[0],
        apply:(a,p,t)=>ctx.createEnemySpecial(t,p.special,p.amount,a)},
      'amplify-special':{select:()=>ctx.enemySpecialTiles()[0],
        apply:(a,p,t)=>ctx.amplifyEnemySpecial(t,p.amount)}
    });
  }
  return Object.freeze({activate,createHandlers});
});
