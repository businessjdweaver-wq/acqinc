'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RQMonsterMerrix=api;
})(globalThis,function(){
 'use strict';

 // Mastery-one Wild Magic outcomes, copied from Merrix's three actual tables.
 // The combat adapter owns board legality, animation, and authoritative state.
 const outcomes=Object.freeze({
  'merrix-surge':Object.freeze([
   {name:'Damage Resistance',effect:'vex-dodge',reduction:.25},
   {name:'Healing Unicorn',effect:'unicorn',amount:20},
   {name:'Flumphs',effect:'flumphs',level:1,strengthMultiplier:1},
   {name:'Fog Cloud',effect:'fog',amount:20},
   {name:'Mass Invisibility',effect:'invisibility',duration:1},
   {name:'Reincarnation',effect:'reincarnate',hp:1},
   {name:'Sorcery Restoration',effect:'restore',colors:[0,2,3],cap:10}
  ]),
  'merrix-bend':Object.freeze([
   {name:'Extra Action',effect:'extra',swaps:1},
   {name:'Sheep Charge',effect:'sheep',rows:1},
   {name:'Potted Plants',effect:'plant-stun',duration:5},
   {name:'Modron March',effect:'plant-tiles',count:1,color:6},
   {name:'Teleport',effect:'teleport'},
   {name:'Tidal Weave',effect:'cascade',count:3,color:2},
   {name:'Confusion',effect:'confusion',duration:1}
  ]),
  'merrix-overchannel':Object.freeze([
   {name:'Magic Missile',effect:'missile',damage:35},
   {name:'Fireball',effect:'fireball',damage:8,selfBacklash:.75},
   {name:'Necrotic Eruption',effect:'necrotic',damage:12,heal:8},
   {name:'Lightning Strike',effect:'lightning',rows:1},
   {name:'Butterflies and Flowers',effect:'butterflies',count:2,damage:0,finish:12},
   {name:'Grease',effect:'grease',count:1,strength:1,fortified:true}
  ])
 });
 const kits=Object.freeze([
  Object.freeze({name:'Protective Wild Magic',color:2,cost:7,effect:'merrix-surge'}),
  Object.freeze({name:'Destructive Wild Magic',color:0,cost:7,effect:'merrix-overchannel'}),
  Object.freeze({name:'Reality Distortion',color:3,cost:5,effect:'merrix-bend'})
 ]);

 function createHandlers(ctx){
  const pending=new WeakMap();
  const makeHandler=kind=>Object.freeze({
   // Selection is resolved before the enemy pays energy. Return the chosen
   // concrete outcome (and adapter selection) or null when no outcome applies.
   select:(actor,power)=>{
    const pool=outcomes[kind];
    if(!pool)return null;
    const roll=pending.get(actor);
    const start=power.committed&&roll?.kind===kind?roll.index:Math.floor((ctx.random?.()??Math.random())*pool.length);
    for(let offset=0;offset<pool.length;offset++){
     const outcome=pool[(start+offset)%pool.length];
     const target=ctx.selectOutcome?.(outcome.effect,actor,outcome,power);
     if(target!==null&&target!==undefined){pending.set(actor,{kind,index:(start+offset)%pool.length});return {outcome,target};}
    }
    return null;
   },
   apply:(actor,power,selection)=>ctx.applyOutcome?.(selection.outcome.effect,actor,selection.outcome,selection.target,power)
  });
  return Object.freeze(Object.fromEntries(Object.keys(outcomes).map(kind=>[kind,makeHandler(kind)])));
 }
 return Object.freeze({kits,outcomes,createHandlers});
});
