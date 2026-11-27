(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RQGrimmCorvinEnemies=api;
})(globalThis,function(){
 'use strict';

 // Rank-one values mirror the level-one hero kits. combat49 supplies state,
 // legality, animation and damage through the documented context hooks below.
 const kits=Object.freeze({
  grimm:Object.freeze([
   Object.freeze({name:'Crimson Trail',color:0,cost:7,effect:'grimm-trail',duration:3,bonus:2,cap:30}),
   Object.freeze({name:'Extraction',color:6,cost:6,effect:'grimm-extraction',sacrifice:24,heal:16}),
   Object.freeze({name:'Bleed Out',color:4,cost:7,effect:'grimm-bleed',damage:4,conversions:1})
  ]),
  corvin:Object.freeze([
   Object.freeze({name:'Seeds of Dread',color:3,cost:6,effect:'corvin-traps',count:2,duration:3,damage:6}),
   Object.freeze({name:'Vanish from Sight',color:2,cost:6,effect:'corvin-vanish',duration:1,evasion:50}),
   Object.freeze({name:'Echo of Terror',color:1,cost:7,effect:'corvin-echo',delay:5,stun:1})
  ])
 });

 function ordinary(t){return !!t&&Number.isInteger(t.v)&&t.v>=0&&t.v<6&&!t.special&&!t.locked&&!t.effectFortified&&!t.fortifyLayers&&!t.power&&!t.trap&&!t.hiddenTrap&&!t.rat&&!t.friendlyRat&&!t.lore&&!t.hay&&!t.returnShield&&!t.grimmTrail&&!t.wovenLife&&!t.groveRoot&&!t.groveVillager&&!t.grovePetrified&&!t.sluiceGear&&!t.sluiceWaterlock&&!t.lumberFire&&!t.towerBrazier&&!t.smoke;}
 function bleedEligible(t){return !!t&&(t.special&&t.specialOwner==='player'||t.trap>0&&t.trapOwner==='player'||t.hiddenTrap?.owner==='player')&&!t.hay&&!t.lore&&!t.towerBrazier&&!t.groveRoot&&!t.groveVillager&&!t.grovePetrified&&!t.sluiceGear&&!t.sluiceWaterlock&&!t.lumberFire&&!t.smoke&&!t.supply&&!t.friendlyRat;}
 function adjacentOrdinary(tiles,origin){return tiles.filter(t=>ordinary(t)&&Math.abs(t.r-origin.r)+Math.abs(t.c-origin.c)===1);}
 function crimsonMultiplier(trail,redCount){return trail?1+Math.min(trail.cap,Math.max(0,redCount)*trail.bonus)/100:1;}
 function extractionPlan(actor,allies,p){return actor.hp>p.sacrifice?allies.filter(a=>a!==actor&&a.hp>0&&a.hp<a.max).map(ally=>({ally,heal:Math.min(p.heal,ally.max-ally.hp)})):[];}
 function bleedRound(tile,tiles,frontHero,randomIndex=Math.floor){
  if(!tile?.bleedOut)return null;
  const target=Number.isInteger(tile.linkedHero)&&!tile.independent?tile.linkedHero:frontHero;
  const pool=adjacentOrdinary(tiles,tile),converted=pool.length?[pool.splice(randomIndex(pool.length),1)[0]]:[];
  for(const t of converted)t.v=0;
  return {target,damage:tile.bleedOut.damage,converted};
 }
 const combat49Hooks=Object.freeze([
  'tiles() -> live board tile array; paint(tile); randomIndex(length); round()',
  'enemies() -> live combatant array; damageActor(actor,amount); healActor(actor,amount)',
  'trapEligible(tile) -> hero-compatible Seeds of Dread tile predicate',
  'frontHero() -> current living front hero; stunHero(heroIndex,rounds)',
  'bleed tick must call bleedRound(tile,tiles,frontHero,randomIndex), damage its returned target, paint converted tiles, then resolve player matches when any tile converted',
  'enemy match damage must apply crimsonMultiplier(activeTrail,redTileCount); trail remaining time ticks once per enemy turn',
  'hero match on corvinVeilOwner tile clears veil and actor.corvinVeil; otherwise decrement that duration once per enemy turn',
  'corvinEcho decrements once per enemy turn; on expiry stun the next living enemy rank reassessed at expiry, then plant a fresh yellow echo when an eligible tile exists'
 ]);
 function createHandlers(ctx){
  const handlers={
   'grimm-trail':{select:(_a,p)=>!ctx.tiles().some(t=>t.grimmTrail)&&(()=>{const pool=ctx.tiles().filter(ordinary);return pool[ctx.randomIndex(pool.length)];})()||null,apply:(actor,p,t)=>{t.grimmTrail={owner:ctx.enemyIndex(actor),team:'enemy',remaining:p.duration,bonus:p.bonus,cap:p.cap};ctx.paint(t);ctx.say('Crimson Trail holds the front rank; enemy match damage gains '+p.bonus+'% per red tile, capped at '+p.cap+'%, for '+p.duration+' rounds.');}},
   'grimm-extraction':{select:(actor,p)=>extractionPlan(actor,ctx.enemies(),p).length?actor:null,apply:async(actor,p)=>{const plan=extractionPlan(actor,ctx.enemies(),p);if(!plan.length)return;ctx.damageActor(actor,p.sacrifice);for(const entry of plan)ctx.healActor(entry.ally,entry.heal);ctx.say('Extraction sacrifices '+p.sacrifice+' of Grimm’s HP to heal each wounded living ally.');}},
   'grimm-bleed':{select:()=>ctx.tiles().find(bleedEligible)||null,apply:(actor,p,t)=>{t.bleedOut={owner:ctx.enemyIndex(actor),team:'enemy',damage:p.damage,conversions:p.conversions,introducedLock:!t.locked};t.locked=true;ctx.paint(t);ctx.say('Bleed Out locks a hostile special. Each round it damages the original owner, or the front hero if team-owned, and converts an adjacent ordinary tile to red.');}},
   'corvin-traps':{select:()=>ctx.tiles().some(ctx.trapEligible)?ctx.tiles().find(ctx.trapEligible):null,apply:(actor,p)=>{const pool=ctx.tiles().filter(ctx.trapEligible);let count=0;for(let n=0;n<p.count&&pool.length;n++){const t=pool.splice(ctx.randomIndex(pool.length),1)[0];t.hiddenTrap={id:'dreadshade-'+(ctx.round?.()??0)+'-'+n,owner:'enemy',enemyCaster:ctx.enemyIndex(actor),triggerTeam:'player',trigger:'matched',charges:1,duration:p.duration,maxDuration:p.duration,age:0,baseDamage:p.damage,effect:{type:'damage',amount:p.damage}};ctx.paint(t);count++;}ctx.say('Seeds of Dread conceals '+count+' traps. They trigger when matched by heroes.');}},
   'corvin-vanish':{select:actor=>ctx.tiles().find(t=>ordinary(t)&&t.v===2&&!Number.isInteger(t.corvinVeilOwner))||null,apply:(actor,p,t)=>{if(!t)return;for(const tile of ctx.tiles())if(tile?.enemyVeilOwner===ctx.enemyIndex(actor)){delete tile.enemyVeilOwner;ctx.paint(tile);}
    t.enemyVeilOwner=ctx.enemyIndex(actor);actor.enemyVeilExpires=ctx.round()+p.duration;ctx.paint(t);ctx.say('Vanish from Sight grants '+p.evasion+'% evasion for '+p.duration+' enemy turn, or until the veil tile is matched.');}},
   'corvin-echo':{select:()=>ctx.tiles().some(t=>ordinary(t)&&t.v===1&&!t.corvinEcho)?ctx.tiles().find(t=>ordinary(t)&&t.v===1&&!t.corvinEcho):null,apply:(actor,p,t)=>{const front=ctx.frontHero();if(!t||front==null)return;ctx.stunHero(front,p.stun);t.corvinEcho=p.delay;t.corvinEchoDuration=p.delay;t.corvinEchoOwner=ctx.enemyIndex(actor);ctx.paint(t);ctx.say('Echo of Terror stuns the frontline now and plants a yellow echo that stuns again after '+p.delay+' enemy turns.');}}
  };
  return Object.freeze(handlers);
 }
 return Object.freeze({kits,ordinary,bleedEligible,adjacentOrdinary,crimsonMultiplier,extractionPlan,bleedRound,combat49Hooks,createHandlers});
});
