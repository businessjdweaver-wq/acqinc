(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.RQGrimmHester=api;
})(globalThis,function(){'use strict';
 function splitDamage(hit,reduction,recipients){
  if(!recipients.length)return [];
  const total=Math.max(0,Math.round(hit*(1-reduction/100)));
  const share=Math.floor(total/recipients.length),remainder=total%recipients.length;
  return recipients.map((index,position)=>({index,damage:share+Number(position<remainder)}));
 }
 function leafspeechCandidates(tiles,origin,range,hostile='enemy'){
  return tiles.filter(tile=>tile&&tile.c===origin.c&&tile.r<origin.r&&tile.r>=origin.r-range&&
    (tile.v!==4||tile.specialOwner===hostile)&&
    (!tile.special||tile.specialOwner===hostile)&&!tile.trap&&!tile.hiddenTrap&&!tile.power&&!tile.lore&&!tile.rat&&!tile.friendlyRat&&!tile.hay&&
    !tile.groveRoot&&!tile.groveVillager&&!tile.grovePetrified&&!tile.sluiceGear&&!tile.sluiceWaterlock&&!tile.lumberFire&&!tile.towerBrazier&&!tile.returnShield&&
    !tile.grimmTrail&&!tile.wovenLife);
 }
 function leafspeechSelection(tiles,origin,range,percent,cap,random=Math.random,hostile='enemy'){
  const pool=leafspeechCandidates(tiles,origin,range,hostile);
  const count=Math.min(cap,Math.round(pool.length*percent/100));
  return Array.from({length:count},()=>pool.splice(Math.floor(random()*pool.length),1)[0]);
 }
 function convertLeafspeech(tile,hostile='enemy'){
  tile.v=4;
  if(tile.specialOwner===hostile){
   tile.special=null;tile.specialOwner=null;tile.specialStrength=0;tile.linkedEnemy=null;
   if(!eligibleBleedOut(tile))clearBleedOut(tile);
  }
 }
 function blight(resources,percent,damagePerPoint,random=Math.random){
  const largest=Math.max(0,...resources);
  const destroyed=Math.floor(largest*percent/100);
  if(!destroyed)return null;
  const tied=resources.flatMap((amount,color)=>amount===largest?[color]:[]);
  return {color:tied[Math.floor(random()*tied.length)],destroyed,damage:destroyed*damagePerPoint};
 }
 function blightSpread(resources,percent,damagePerPoint,poolCount,cap=Infinity){
  let remaining=cap;
  const eligible=resources.map((amount,color)=>({amount,color})).filter(({amount,color})=>color!==5&&Math.floor(amount*percent/100)>0);
  const preferred=eligible.filter(({amount})=>amount>3);
  const drains=(preferred.length?preferred:eligible).sort((a,b)=>b.amount-a.amount||a.color-b.color).slice(0,poolCount).map(({amount,color})=>{const destroyed=Math.min(remaining,Math.floor(Math.max(0,amount)*percent/100));remaining-=destroyed;return {color,destroyed};}).filter(d=>d.destroyed>0);
  const destroyed=drains.reduce((sum,d)=>sum+d.destroyed,0);
  return destroyed?{drains,destroyed,damage:destroyed*damagePerPoint}:null;
 }
 function monsterBlightConfig(percent,damagePerPoint){
  const level=percent>=60?3:percent>=50?2:percent>=40?1:0;
  return {poolCount:[2,3,4,Infinity][level],cap:[3,4,5,6][level],damagePerPoint:[3,4,5,6][level]};
 }
 function eligibleBleedOut(tile){
  if(!tile||tile.hay||tile.lore||tile.towerBrazier||tile.groveRoot||tile.groveVillager||
    tile.grovePetrified||tile.sluiceGear||tile.sluiceWaterlock||tile.lumberFire||
    tile.smoke||tile.supply||tile.friendlyRat||tile.hiddenTrap?.owner==='player'||
    (tile.trap>0&&tile.trapOwner==='player')||(tile.special&&tile.specialOwner==='player'))return false;
  return !!(tile.special&&tile.specialOwner==='enemy'||tile.trap>0||tile.rat);
 }
 function clearBleedOut(tile){
  if(!tile.bleedOut)return;
  // Before lock ownership was serialized, Bleed Out could only lock unlocked tiles.
  if(tile.bleedOut.introducedLock!==false)tile.locked=false;
  delete tile.bleedOut;
 }
 function bleedTarget(tile,isLiving,front){
  return Number.isInteger(tile.linkedEnemy)&&!tile.independent?(isLiving(tile.linkedEnemy)?tile.linkedEnemy:undefined):front;
 }
 function matchMultiplier(trail,redCount){
  return trail?1+Math.min(trail.cap,redCount*trail.bonus)/100:1;
 }
 return {splitDamage,leafspeechCandidates,leafspeechSelection,convertLeafspeech,blight,blightSpread,monsterBlightConfig,eligibleBleedOut,clearBleedOut,bleedTarget,matchMultiplier};
});
