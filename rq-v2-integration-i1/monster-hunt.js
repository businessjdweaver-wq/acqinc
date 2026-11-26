'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RQMonsterHunt=api;
})(globalThis,function(){
  function marshGuidePair(tiles,distance,preferred=[]){
    const legal=(a,b)=>a&&b&&a!==b&&!a.locked&&!b.locked&&
      Math.abs(a.r-b.r)+Math.abs(a.c-b.c)<=distance;
    const recommendation=preferred.find(([a,b])=>legal(a,b));
    if(recommendation)return recommendation;
    for(const [index,a] of tiles.entries()){
      const b=tiles.slice(index+1).find(tile=>legal(a,tile));
      if(b)return [a,b];
    }
    return null;
  }

  function canChowmp(t){
    return t?.v===4&&!t.special&&!t.locked&&!t.effectFortified&&!t.fortifyLayers&&
      !t.trap&&!t.hiddenTrap&&!t.rat&&!t.friendlyRat&&!t.hay&&!t.lore&&!t.returnShield&&
      !t.power&&!t.groveRoot&&!t.groveVillager&&!t.grovePetrified&&!t.sluiceGear&&
      !t.sluiceWaterlock&&!t.towerBrazier&&!t.lumberFire&&!t.smoke;
  }

  function fullestResource(resources){
    const amount=Math.max(0,...resources);
    return amount>0?resources.indexOf(amount):null;
  }

  function createHandlers(ctx){
    return {
      'marsh-guide':{
        select:(actor,power)=>marshGuidePair(ctx.tiles(),power.distance,ctx.preferredSwaps?.()),
        apply:async(actor,power,[a,b])=>{
          const distance=Math.abs(a.r-b.r)+Math.abs(a.c-b.c);
          ctx.say(power.name+' swaps two tiles '+distance+' space(s) apart.');
          await ctx.swapTiles(a,b);
        }
      },
      chowmp:{
        select:()=>ctx.frontHero(),
        apply:async(actor,power)=>{
          const pool=ctx.tiles().filter(canChowmp);
          let destroyed=0;
          for(let n=0;n<power.count&&pool.length;n++){
            if(ctx.ended())return;
            const tile=pool.splice(ctx.randomIndex(pool.length),1)[0];
            if(!ctx.tiles().includes(tile)||!canChowmp(tile))continue;
            await ctx.animateTile(tile,'🐊');
            if(ctx.ended())return;
            await ctx.collapseTile(tile);
            destroyed++;
          }
          const damage=Math.round(power.amount*(1+power.bonusPercent/100*destroyed));
          ctx.damageFront(damage);
          ctx.say(power.name+' destroys '+destroyed+' green tile(s) and deals '+damage+' damage to the frontline.');
        }
      },
      'energy-thief':{
        select:()=>fullestResource(ctx.heroEnergy()),
        apply:(actor,power,color)=>{
          const amount=Math.min(ctx.heroEnergy()[color],power.amount);
          ctx.heroEnergy()[color]-=amount;
          ctx.enemyEnergy()[color]+=amount;
          ctx.say(power.name+' transfers '+amount+' '+ctx.labels[color]+' energy to the monsters.');
        }
      },
      'psychic-blade':{
        select:()=>ctx.frontHero(),
        apply:async(actor,power)=>{
          ctx.damageAll(power.amount);
          if(ctx.ended())return;
          const slashes=ctx.feedbackSlashes();
          if(!slashes.length||ctx.random()*100>=power.feedbackChance)return;
          const {tiles}=slashes[ctx.randomIndex(slashes.length)];
          for(const tile of tiles){
            if(ctx.ended())break;
            if(ctx.tiles().includes(tile)&&!tile.special)await ctx.collapseTile(tile);
          }
          ctx.say(power.name+' feedback destroys three basic tiles in a horizontal slash without cascades.');
        }
      }
    };
  }

  function syncFleetFoot({tiles,enemies,enemyOrder,enemyEnergy,targetable,ended,eligibleTile,linkTile,paint,randomIndex,stunned}){
    const board=tiles(),actors=enemies(),order=enemyOrder(),energy=enemyEnergy();
    let rear;
    if(!ended()){
      const fleet=order.find(index=>{
        const actor=actors[index],power=actor?.sandboxPowers?.find(item=>item.effect==='fleet-foot');
        return power&&targetable(actor)&&!stunned?.(index)&&energy[power.color]>=power.threshold;
      });
      if(fleet!==undefined){
        const position=order.indexOf(fleet);
        if(position>0)order.unshift(order.splice(position,1)[0]);
        // Fleet Foot needs an ally in front, matching the hero's rear-rank rule.
        if(order.some(index=>index!==fleet&&actors[index]&&targetable(actors[index])))rear=fleet;
      }
    }
    let active=0;
    for(const tile of board){
      const owner=tile?.monsterFleetFootOwner;
      if(!Number.isInteger(owner))continue;
      // Ownership may have been transferred or the special consumed.
      const stillOwned=tile.special==='attack'&&tile.specialOwner==='enemy'&&tile.linkedEnemy===owner;
      if(owner===rear&&stillOwned){
        active++;
        continue;
      }
      delete tile.monsterFleetFootOwner;
      if(!stillOwned)continue;
      tile.special=null;
      tile.specialOwner=null;
      tile.specialStrength=1;
      tile.linkedEnemy=null;
      tile.independent=false;
      paint(tile);
    }
    if(rear===undefined||active>=5)return;
    const available=board.filter(eligibleTile);
    while(active<5&&available.length){
      const tile=available.splice(randomIndex(available.length),1)[0];
      tile.special='attack';
      tile.specialOwner='enemy';
      tile.specialStrength=1;
      tile.monsterFleetFootOwner=rear;
      linkTile(tile,rear);
      active++;
    }
  }

  return Object.freeze({canChowmp,createHandlers,syncFleetFoot});
});
