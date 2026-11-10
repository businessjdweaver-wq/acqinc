/* Malvek / Fiend Warlock: Patron Debt encounter mechanics.
 * Standalone pure module; integrate into combat49 before enabling collectible cards.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RQPatronDebt=api;})(globalThis,function(){
'use strict';
const BARGAIN=Object.freeze([
 Object.freeze({energy:4,counters:1,countdown:3,damage:8}),
 Object.freeze({energy:6,counters:2,countdown:3,damage:8}),
 Object.freeze({energy:8,counters:2,countdown:4,damage:12}),
 Object.freeze({energy:10,counters:3,countdown:4,damage:12})
]);
function levelConfig(level){return BARGAIN[Math.max(0,Math.min(3,Math.floor(Number(level)||1)-1))];}
function attach(tile,owner,level,extraCountdown=0,fortified=false){
 if(!tile||tile.patronDebt||tile.effectFortified) return false;
 const cfg=levelConfig(level);
 tile.patronDebt={owner,remaining:cfg.countdown+Math.max(0,extraCountdown),damage:cfg.damage,fortified:!!fortified,hitsRemaining:fortified?2:1};if(fortified)tile.effectFortified=true;
 return true;
}
function settle(tile){if(!tile?.patronDebt)return false;if(tile.patronDebt.hitsRemaining>1){tile.patronDebt.hitsRemaining--;return false;}if(tile.patronDebt.fortified)tile.effectFortified=false;delete tile.patronDebt;return true;}
function defer(tile){if(!tile?.patronDebt)return false;tile.patronDebt.remaining+=2;return true;}
function advance(tiles,damageOwner){
 const expired=[];
 for(const tile of tiles){if(!tile?.patronDebt)continue;
  if(--tile.patronDebt.remaining<=0){expired.push({...tile.patronDebt});if(tile.patronDebt.fortified)tile.effectFortified=false;delete tile.patronDebt;}
 }
 for(const debt of expired)damageOwner(debt.owner,debt.damage);
 return expired.length;
}
function endEncounter(tiles,damageOwner){let damage=0;for(const tile of tiles){if(tile?.patronDebt?.fortified){const debt=tile.patronDebt;damage+=debt.damage;damageOwner(debt.owner,debt.damage);}}clear(tiles);return damage;}
function clear(tiles){let count=0;for(const tile of tiles){if(tile?.patronDebt){if(tile.patronDebt.fortified)tile.effectFortified=false;delete tile.patronDebt;count++;}}return count;}
function invoke({tiles,owner,level,random=Math.random}){
 const cfg=levelConfig(level),eligible=tiles.filter(t=>t&&!t.patronDebt&&!t.effectFortified&&!t.locked&&!t.lumberFire&&!t.groveRoot&&!t.towerBrazier);
 if(eligible.length<cfg.counters)return {ok:false,reason:'Not enough eligible tiles'};
 const pool=eligible.slice();const assigned=[];
 for(let i=0;i<cfg.counters;i++){const index=Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)));const tile=pool.splice(index,1)[0];attach(tile,owner,level);assigned.push(tile);}
 return {ok:true,energy:cfg.energy,tiles:assigned};
}
return {BARGAIN,levelConfig,attach,settle,defer,advance,clear,endEncounter,invoke};
});
