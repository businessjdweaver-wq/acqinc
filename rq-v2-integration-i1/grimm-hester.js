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
 return {splitDamage,leafspeechCandidates,leafspeechSelection,convertLeafspeech,blight,eligibleBleedOut,clearBleedOut,bleedTarget,matchMultiplier};
});
