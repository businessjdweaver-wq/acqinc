'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RQEnemyPowers=api;
})(globalThis,function(){
  // Runtime adapters own targeting, animation and combat mutations.
  // An unavailable target must not consume resources.
  async function activate({power,energy,actor,blocked,handlers,activation,ended=()=>false}){
    if(ended()||!actor||actor.hp<=0||blocked||!power)return false;
    if(!Number.isInteger(power.color)||power.color<0||power.color>=energy.length||
       !Number.isInteger(power.cost)||power.cost<1||!(energy[power.color]>=power.cost))return false;
    const effects=power.effects??[power];
    if(!Array.isArray(effects)||effects.length<1||effects.length>4)return false;
    const steps=[];
    for(const effect of effects){
      if(!effect||!Object.hasOwn(handlers,effect.effect))return false;
      const params={...effect,name:power.name,color:power.color,cost:power.cost};
      const handler=handlers[effect.effect];
      const producer=effect.effect==='amplify-special'?'create-special':
        effect.effect==='temporal'&&['countdown','delayed','recurring'].includes(effect.target)?effect.target:null;
      const dependent=producer&&steps.some(step=>step.available&&step.params.effect===producer);
      const available=handler.select(actor,params)!=null||dependent;
      if(!available&&!params.optional)return false;
      steps.push({handler,params,available});
    }
    if(!steps.some(step=>step.available))return false;
    energy[power.color]-=power.cost;
    return (await activation(power.name,async()=>{
      for(const {handler,params} of steps){
        if(ended()||actor.hp<=0)break;
        const committed={...params,committed:true};
        const target=handler.select(actor,committed);
        if(target!=null)await handler.apply(actor,committed,target);
        else if(!params.optional)break;
      }
    }))===true;
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
    const timedKinds=['damage','heal','drain-resource','steal-resource','hero-stun'];
    function timedTarget(a,p){
      if(p.payload==='damage'||p.payload==='hero-stun')return ctx.frontHero();
      if(p.payload==='heal')return injured();
      return ctx.heroResources()[p.targetColor]>0?p.targetColor:null;
    }
    function timedHandler(kind){
      return {
        select:(a,p)=>timedKinds.includes(p.payload)&&ctx.timedAvailable?.(a,p,kind)?timedTarget(a,p):null,
        apply:(a,p,t)=>ctx.addTimed(a,p,kind,t,()=>{
          const target=p.targetPolicy==='fixed'?t:timedTarget(a,p);
          if(target==null)return;
          switch(p.payload){
            case 'damage':return ctx.damageHero(target,p.amount);
            case 'heal':return ctx.healEnemy(target,p.amount);
            case 'drain-resource':return ctx.drainHeroResource(target,p.amount);
            case 'steal-resource':return ctx.stealHeroResource(target,p.amount,p.color);
            case 'hero-stun':return ctx.stunHero(target,p.amount);
          }
        })
      };
    }
    const delegated=kind=>({
      select:(a,p)=>ctx.selectAdvanced?.(kind,a,p),
      apply:(a,p,t)=>ctx.applyAdvanced(kind,a,p,t)
    });
    function strength(a,p,t){
      if(!p.scaling)return p.amount;
      const {metric,multiplier,cap}=p.scaling;
      return Math.min(cap,p.amount+multiplier*ctx.measure(metric,a,t));
    }
    return Object.freeze({
      'amplify-board-special':delegated('amplify-board-special'),
      'salvage-special':delegated('salvage-special'),
      'woven-life':delegated('woven-life'),
      leafspeech:delegated('leafspeech'),
      'withering-blight':delegated('withering-blight'),
      'tile-pattern':delegated('tile-pattern'),
      'hero-stun':delegated('hero-stun'),
      cleanse:delegated('cleanse'),
      suppression:delegated('suppression'),
      formation:delegated('formation'),
      exchange:delegated('exchange'),
      temporal:delegated('temporal'),
      'repeated-strikes':{
        select:()=>ctx.frontHero(),
        async apply(a,p,target){
          for(let strike=0;strike<p.count&&!ctx.ended?.()&&a.hp>0;strike++){
            if(p.targetPolicy==='reassess'||(p.retarget&&target?.hp<=0))target=ctx.frontHero();
            if(!target||target.hp<=0)break;
            await ctx.damageHero(target,strength(a,p,target));
          }
        }
      },
      recurring:timedHandler('recurring'),
      delayed:timedHandler('delayed'),
      damage:{select:()=>ctx.frontHero(),apply:(a,p,t)=>ctx.damageHero(t,strength(a,p,t))},
      heal:{select:injured,apply:(a,p,t)=>ctx.healEnemy(t,p.amount)},
      siphon:{select:()=>ctx.frontHero(),apply:async(a,p,t)=>{
        await ctx.damageHero(t,p.amount);
        if(ctx.ended?.()||a.hp<=0)return;
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
      'consume-special':{select:()=>ctx.consumeSpecial&&ctx.frontHero()?ctx.enemySpecialTiles()[0]:null,
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
    function reduceDuration(entry){
      if(--entry.remaining<=0)remove(entry,'expired');
      else if(entries.includes(entry))entry.onChange?.(entry.remaining);
    }
    function prune(){
      for(const e of [...entries])if(e.valid?.()===false||(!e.surviveOwner&&e.owner.hp<=0)||(e.target&&typeof e.target.hp==='number'&&e.target.hp<=0))remove(e,'defeated');
    }
    return Object.freeze({
      add({owner,target=null,kind,duration,amount=0,cleanup,onTick,onChange,valid,surviveOwner=false,phase='enemy'}){
        prune();
        if(!owner||owner.hp<=0||typeof kind!=='string'||!Number.isInteger(duration)||duration<1||duration>8)return false;
        if(entries.some(e=>e.owner===owner&&e.target===target&&e.kind===kind))return false;
        entries.push({owner,target,kind,remaining:duration,amount,cleanup,onTick,onChange,valid,surviveOwner,phase});return true;
      },
      active(kind,target){prune();return entries.filter(e=>e.kind===kind&&(target===undefined||e.target===target)).map(e=>({...e}));},
      consume(kind,target){prune();const e=entries.find(e=>e.kind===kind&&(target===undefined||e.target===target));if(!e)return null;remove(e,'consumed');return {...e};},
      tick(){prune();for(const e of [...entries])if(e.phase==='enemy'&&!e.onTick&&--e.remaining<=0)remove(e,'expired');},
      async advance(phase='enemy',ended=()=>false){
        for(const e of [...entries]){
          if(ended())break;
          prune();
          if(!entries.includes(e)||e.phase!==phase)continue;
          await e.onTick?.(e.remaining);
          reduceDuration(e);
        }
      },
      entries(){prune();return entries.map(e=>({...e}));},
      cleanse(target,kinds){
        prune();
        const removed=entries.filter(e=>e.target===target&&kinds.includes(e.kind));
        for(const entry of removed)remove(entry,'cleansed');
        return removed.length;
      },
      async adjust(filter,operation,amount,ended){
        for(const e of [...entries]){
          if(ended())break;
          prune();
          if(!entries.includes(e)||!filter(e))continue;
          if(operation==='extend'){e.remaining=Math.min(8,e.remaining+amount);e.onChange?.(e.remaining);continue;}
          const ticks=operation==='resolve'?e.remaining:Math.min(e.remaining,amount);
          for(let i=0;i<ticks&&entries.includes(e)&&!ended();i++){
            await e.onTick?.(e.remaining);
            reduceDuration(e);
            prune();
          }
        }
      },
      prune,
      clear(){for(const e of [...entries])remove(e,'reset');}
    });
  }
  return Object.freeze({activate,activateOne,createHandlers,createStatusLedger});
});
