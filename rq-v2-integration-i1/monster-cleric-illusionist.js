(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RQMonsterClericIllusionist=api;
})(globalThis,function(){
 'use strict';

 // Prismatic Veil's phantom is a team shield that persists until spent.
 // Key by the encounter ledger so resetting the encounter discards it.
 const phantoms=new WeakMap();
 function absorbPhantom(ledger,damage){
  const remaining=ledger&&phantoms.get(ledger);
  if(!remaining||damage<=0)return null;
  const blocked=Math.min(damage,remaining);
  const hp=remaining-blocked;
  if(hp)phantoms.set(ledger,hp);
  else phantoms.delete(ledger);
  return {blocked,hp};
 }

 function createHandlers(ctx){
  return {
   'twilight-sanctuary':{
    select:()=>ctx.tiles().find(ctx.sanctuaryEligible),
    apply:(actor,power)=>{
     const pool=ctx.tiles().filter(ctx.sanctuaryEligible);
     for(let n=0;n<power.count&&pool.length;n++){
      const [tile]=pool.splice(ctx.random(pool.length),1);
      ctx.createSpecial(tile,'defense',power.strength,actor);
     }
     ctx.say('Sanctuary at Dusk creates protective tiles.');
    }
   },
   'twilight-absolution':{
    select:()=>ctx.tiles().find(ctx.absolutionEligible),
    apply:(_actor,_power,tile)=>ctx.absolve(tile)
   },
   'ivory-mirage':{
    select:()=>ctx.tiles().find(tile=>ctx.ivoryEligible(tile)&&tile.v!==6),
    apply:(_actor,_power,tile)=>ctx.applyCardPattern({
     effect:'transform',color:6,count:1,cells:[{x:0,y:0}],
     centerMode:'selected',center:{x:tile.c,y:tile.r}
    },'enemy')
   },
   turncoat:{
    select:()=>ctx.tiles().find(tile=>tile?.special&&tile.specialOwner==='player'&&
     !tile.towerBrazier&&!tile.grovePetrified&&!tile.groveRoot&&!tile.smoke),
    apply:(actor,_power,tile)=>{
     tile.specialStrength=Math.max(1,Number(tile.specialStrength??1));
     ctx.captureSpecial(tile,actor);
     ctx.say('Turncoat captures a hostile special tile.');
    }
   },
   'prismatic-veil':{
    select:()=>ctx.ledger,
    apply:(_actor,power,ledger)=>{
     phantoms.set(ledger,power.amount);
     ctx.say('Prismatic Veil conjures an enemy phantom with '+power.amount+' protection.');
    }
   }
  };
 }
 return Object.freeze({createHandlers,absorbPhantom,phantomHp:ledger=>ledger&&phantoms.get(ledger)||0});
});
