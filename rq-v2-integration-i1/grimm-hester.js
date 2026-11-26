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
 function leafspeechCandidates(tiles,origin,range){
  return tiles.filter(tile=>tile&&tile.c===origin.c&&tile.r<origin.r&&tile.r>=origin.r-range&&
    (tile.v!==4||tile.specialOwner==='enemy')&&
    (!tile.special||tile.specialOwner==='enemy')&&!tile.trap&&!tile.hiddenTrap&&!tile.power&&!tile.lore&&!tile.rat&&!tile.friendlyRat&&!tile.hay&&
    !tile.groveRoot&&!tile.groveVillager&&!tile.grovePetrified&&!tile.sluiceGear&&!tile.sluiceWaterlock&&!tile.lumberFire&&!tile.towerBrazier&&!tile.returnShield&&
    !tile.grimmTrail&&!tile.wovenLife);
 }
 function leafspeechSelection(tiles,origin,range,percent,cap,random=Math.random){
  const pool=leafspeechCandidates(tiles,origin,range);
  const count=Math.min(cap,Math.round(pool.length*percent/100));
  return Array.from({length:count},()=>pool.splice(Math.floor(random()*pool.length),1)[0]);
 }
 function convertLeafspeech(tile){
  tile.v=4;
  if(tile.specialOwner==='enemy'){
   tile.special=null;tile.specialOwner=null;tile.specialStrength=0;tile.linkedEnemy=null;
   if(tile.bleedOut)tile.locked=false;
   delete tile.bleedOut;
  }
 }
 function blight(resources,percent,damagePerPoint,random=Math.random){
  const largest=Math.max(0,...resources);
  const destroyed=Math.floor(largest*percent/100);
  if(!destroyed)return null;
  const tied=resources.flatMap((amount,color)=>amount===largest?[color]:[]);
  return {color:tied[Math.floor(random()*tied.length)],destroyed,damage:destroyed*damagePerPoint};
 }
 function bleedTarget(tile,isLiving,front){
  return Number.isInteger(tile.linkedEnemy)&&!tile.independent?(isLiving(tile.linkedEnemy)?tile.linkedEnemy:undefined):front;
 }
 function matchMultiplier(trail,redCount){
  return trail?1+Math.min(trail.cap,redCount*trail.bonus)/100:1;
 }
 return {splitDamage,leafspeechCandidates,leafspeechSelection,convertLeafspeech,blight,bleedTarget,matchMultiplier};
});
