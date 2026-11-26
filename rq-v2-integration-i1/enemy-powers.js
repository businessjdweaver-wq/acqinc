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
    const effects=power.effects??[power];
    if(!Array.isArray(effects)||effects.length<1||effects.length>4)return false;
    const steps=[];
    for(const effect of effects){
      if(!effect||!Object.hasOwn(handlers,effect.effect))return false;
      const params={...effect,name:power.name,color:power.color,cost:power.cost};
      const handler=handlers[effect.effect];
      const target=handler.select(actor,params);
      if(target==null)return false;
      steps.push({handler,params});
    }
    energy[power.color]-=power.cost;
    // One payment and one counterspell check for the entire activation.
    return await activation(power.name,async()=>{
      for(const {handler,params} of steps){
        if(actor.hp<=0)break;
        const target=handler.select(actor,params);
        if(target!=null)await handler.apply(actor,params,target);
      }
    });
  }
  // Try ordered powers until one is attempted. Countered powers still consume
  // the actor's activation opportunity; unavailable targets do not.
  async function activateOne(options){
    const powers=options.powers||[];
    for(const power of powers){
      let attempted=false;
      const result=await activate({...options,power,activation:async(name,apply)=>{
        attempted=true;return options.activation(name,apply);
      }});
      if(attempted)return {attempted:true,resolved:result,power};
    }
    return {attempted:false,resolved:false,power:null};
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
      intercept:{select:(a,p)=>ctx.statusTarget?.(a,p,'intercept'),apply:(a,p,t)=>ctx.addStatus(a,p,t,'intercept')},
      retaliate:{select:(a,p)=>ctx.statusTarget?.(a,p,'retaliate'),apply:(a,p,t)=>ctx.addStatus(a,p,t,'retaliate')},
      counterspell:{select:(a,p)=>ctx.statusTarget?.(a,p,'counterspell'),apply:(a,p,t)=>ctx.addStatus(a,p,t,'counterspell')},
      ward:{select:(a,p)=>ctx.statusTarget?.(a,p,'ward'),apply:(a,p,t)=>ctx.addStatus(a,p,t,'ward')},
      evasion:{select:(a,p)=>ctx.statusTarget?.(a,p,'evasion'),apply:(a,p,t)=>ctx.addStatus(a,p,t,'evasion')},
      countdown:{select:(a,p)=>ctx.countdownTarget?.(a,p),apply:(a,p,t)=>ctx.addCountdown(a,p,t)},
      'steal-resource':{select:(a,p)=>ctx.stealHeroResource&&ctx.heroResources()[p.targetColor]>0?p.targetColor:null,
        apply:(a,p,t)=>ctx.stealHeroResource(t,p.amount,p.color)},
      'convert-tile':{select:(a,p)=>ctx.convertTile?ctx.ordinaryTiles().find(t=>t.v!==p.targetColor):null,
        apply:(a,p,t)=>ctx.convertTile(t,p.targetColor)},
      'capture-special':{select:()=>ctx.captureSpecial?ctx.heroSpecialTiles?.()[0]:null,
        apply:(a,p,t)=>ctx.captureSpecial(t,a)},
      'consume-special':{select:()=>ctx.consumeSpecial?ctx.enemySpecialTiles()[0]:null,
        apply:(a,p,t)=>ctx.consumeSpecial(t,p.amount,a)},
      'lock-tile':{select:()=>ctx.lockTile?ctx.ordinaryTiles()[0]:null,
        apply:(a,p,t)=>ctx.lockTile(t,p.duration,a)},
      'damage-all':{select:()=>ctx.damageAll?ctx.frontHero():null,
        apply:(a,p,t)=>ctx.damageAll(p.amount)},
      'heal-all':{select:()=>ctx.healEnemy&&injured(),
        apply:async(a,p)=>{for(const ally of living())if(ally.hp<ally.max)await ctx.healEnemy(ally,p.amount);}},
      'amplify-special':{select:()=>ctx.enemySpecialTiles()[0],
        apply:(a,p,t)=>ctx.amplifyEnemySpecial(t,p.amount)}
    });
  }
  // Encounter-local status ledger. Owners and targets are object identities,
  // not formation ranks, so rearranging the formation cannot transfer effects.
  function createStatusLedger(){
    const entries=[];
    function remove(entry,reason){
      const i=entries.indexOf(entry);if(i<0)return;
      entries.splice(i,1);entry.cleanup?.(reason,entry);
    }
    function prune(){
      for(const e of [...entries])if(e.owner.hp<=0||(e.target&&typeof e.target.hp==='number'&&e.target.hp<=0))remove(e,'defeated');
    }
    return Object.freeze({
      add({owner,target=null,kind,duration,amount=0,cleanup}){
        prune();
        if(!owner||owner.hp<=0||typeof kind!=='string'||!Number.isInteger(duration)||duration<1||duration>8)return false;
        if(entries.some(e=>e.owner===owner&&e.target===target&&e.kind===kind))return false;
        entries.push({owner,target,kind,remaining:duration,amount,cleanup});return true;
      },
      active(kind,target){prune();return entries.filter(e=>e.kind===kind&&(target===undefined||e.target===target)).map(e=>({...e}));},
      consume(kind,target){prune();const e=entries.find(e=>e.kind===kind&&(target===undefined||e.target===target));if(!e)return null;remove(e,'consumed');return {...e};},
      tick(){prune();for(const e of [...entries])if(--e.remaining<=0)remove(e,'expired');},
      prune,
      clear(){for(const e of [...entries])remove(e,'reset');}
    });
  }
  return Object.freeze({activate,activateOne,createHandlers,createStatusLedger});
});
