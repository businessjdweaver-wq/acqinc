(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RQCharacterCatalog=api;})(globalThis,function(){'use strict';
const cell=[{x:0,y:0}],cross=[{x:0,y:0},{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}],line=[{x:0,y:0},{x:0,y:1},{x:0,y:-1}];
const power=(name,color,cost,description,effect,cells=cell,amount=1,special=null)=>[name,color,cost,description,'card-pattern',{centerMode:'selected',count:1,cells,effect,amount,special,...(effect==='transform'?{color:6}:{} )}];
const characters=[
{name:'Mira · Scholar',icon:'🔎',background:'Sage',max:88,powers:[['Magnifying Glass',2,5,'Examine a dangerous trap','inspect'],['Unanswered Questions',3,7,'Turn clues blue','convert'],['Mentor’s Promise',1,6,'Heal allies','heal32']]},
{name:'Tobin · Farmer',icon:'🐄',background:'Folk Hero',max:110,powers:[['Loyal Mastiff',1,6,'Summon attack tiles','spawn-attack'],['Stubborn Stand',4,6,'Returning protection','return-shield'],['Harvest Wisdom',0,6,'Change a tile green','single-convert']]},
{name:'Lark · Entertainer',icon:'🎭',background:'Entertainer',max:92,powers:[['Traveling Lute',2,6,'Energy tiles','spawn-energy'],['Rival’s Challenge',0,5,'Remove an ordinary tile','single-remove'],['Crowd Favorite',4,6,'Defense tiles','spawn-defense']]},
{name:'Sable · Locksmith',icon:'🗝️',background:'Criminal / Guild Artisan',trait:'Methodical',bond:'Protect the workshop apprentices',flaw:'Distrusts shortcuts',feature:'Underworld contacts and fine tools',max:94,powers:[power('Pin the Mechanism',0,5,'Lock a selected tile in place; gravity flows around it.','lock'),power('Release the Catch',3,4,'Unlock a selected tile and nearby tiles.','unlock',cross),['Hardened Tumblers',4,0,'Passive: steal enemy energy whenever a lock is unlocked.','unlock-theft']]},
{name:'Bran · Veteran',icon:'🛡️',background:'Soldier',trait:'Protective',bond:'Keep the old regiment alive',flaw:'Takes every setback personally',feature:'Military rank and tactical training',max:116,powers:[power('Raise the Bulwark',1,7,'Fortify a cross of tiles.','fortify',cross),power('Sharpen the Edge',2,6,'Amplify special tile strength by 4.','amplify',cell,4),['Rallying Cry',6,8,'Heal allies after a hard exchange.','heal32']]},
{name:'Nessa · Wayfarer',icon:'🧭',background:'Outlander',trait:'Restless explorer',bond:'Guide travelers home',flaw:'Never stays still',feature:'Wanderer and wilderness routes',max:96,powers:[power('Quiet the Trail',3,5,'Dampen a special tile by 4.','dampen',cell,4),power('Unsnare',6,5,'Unlock tiles and heal per released lock.','unlock',cell),power('Ambush Marker',0,6,'Create fortified attack tiles.','create',cell,3,'attack')]}
,{name:'Orin · Artificer',icon:'⚙️',background:'Guild Artisan',max:100,powers:[power('Deploy Turret',0,6,'Create an attack tile.','create',cell,3,'attack'),power('Overclock',2,6,'Amplify a special tile by 3.','amplify',cell,3),['Salvage Burst',1,6,'Consume a special tile to damage the enemy.','consume-special']]}
,{name:'Pip · Swarmkeeper',icon:'🐀',background:'Outlander',max:98,powers:[['Scurry Up',4,5,'Move a selected tile upward one row.','move-up'],['Sideways Swarm',3,6,'Shift an unlocked row one space.','shift-row'],['Granary Uprising',1,5,'Release friendly rats to scramble the board and attack enemies.','friendly-rats']]}
,{name:'Vex · Saboteur',icon:'🧨',background:'Criminal',max:94,powers:[['False Flag',0,5,'Create an enemy-owned attack tile.','spawn-enemy-attack'],['Uncanny Dodge',2,0,'Passive: evade damage based on enemy-owned attack tiles.','uncanny-dodge'],['Feed the Chaos',3,6,'Deal damage based on enemy special tiles.','enemy-special-burst']]}
,{name:'Alda · Warden',icon:'🛡️',background:'Soldier',max:112,powers:[['Shield Wall',6,6,'Create defense tiles.','spawn-defense'],power('Reinforced Guard',4,6,'Amplify and later fortify allied defense tiles.','amplify',cell,3),['Shield Bash',1,6,'Strike and stun the front enemy using fortifications.','shield-bash']]}
,{name:'Iris · Chronomancer',icon:'⌛',background:'Sage',max:90,powers:[['Delayed Danger',3,6,'Conceal friendly traps that grow more dangerous with age.','spawn-trap'],['Lengthen the Hour',2,5,'Extend a friendly concealed trap duration.','lengthen-trap'],power('Stop Time',6,6,'Lock a countdown tile.','lock')]}
,{name:'Elowen · Illusionist',icon:'🎭',background:'Charlatan',max:92,powers:[power('Ivory Mirage',6,6,'Turn eligible ordinary tiles Ivory.','transform',cell,1),['Turncoat',3,6,'Change ownership of a special tile.','flip-owner'],['Prismatic Veil',2,6,'Create a phantom target that absorbs and retaliates.','phantom-target']]}


,{name:'Seren · Twilight Cleric',icon:'🌙',background:'Acolyte',max:103,powers:[
 ['Moonlit Benediction',2,6,'Heal a wounded ally; at higher levels revive an unconscious ally.','twilight-heal'],
 ['Sanctuary at Dusk',6,7,'Create protective defense tiles, fortified at level four.','twilight-sanctuary'],
 ['Twilight Absolution',3,5,'Purify locks, hostile fortification and enemy special strength.','twilight-absolution']]}
,{name:'Morrow · Fungus Druid',icon:'🍄',background:'Hermit',max:95,powers:[
 ['Mycelial Network',4,6,'Grow a capped healing network; recasting strengthens existing network healing by 50% without removing tiles.','mycelial-network'],
 ['Spore of Slumber',3,6,'Plant a delayed spore that cascades stun through enemies.','spore-slumber'],
 ['Spore Bloom',1,6,'Plant a spore that releases attack tiles when matched.','spore-bloom']]}
,{name:'Tor · Juggernaut Barbarian',icon:'🔨',background:'Outlander',max:129,powers:[
 ['Unstoppable Charge',0,7,'Smash ordinary tiles and break fortification with a charging strike.','unstoppable-charge'],
 ['Rage Engine',1,0,'Passive: damage taken generates attack tiles at a rage threshold.','rage-engine'],
 ['Immovable Object',4,6,'Fortify defenses and temporarily reduce incoming damage.','immovable-object']]}
,{name:'Kael · Astral Self Monk',icon:'🪷',background:'Hermit',max:97,powers:[
 ['Arms of the Astral Self',2,6,'L1: one free adjacent swap (6 blue). L2: one swap (5 blue). L3: two swaps (7 blue). L4: two swaps (6 blue). A normal match follows.','astral-arms'],
 ['Astral Flurry',3,6,'Strike based on matches made during the current allied turn.','astral-flurry'],
 ['Stillness Beyond Form',6,6,'Reduce damage and reposition ordinary tiles.','astral-stillness']]}

,{
 name:'Rook · Battle Master Fighter',
 rosterTitle:'Battle Master Fighter',
 icon:'⛏️',
 background:'Soldier',
 starTier:2,
 max:108,
 powers:[
  ['Over the Line',3,6,'Throw a pickaxe at a rank 2 or rank 3 enemy.','rook-throw',{damage:[[24,32],[28,38],[32,44],[36,50]]}],
  ['Step Into the Blow',1,0,'Intercept a knockout hit aimed at an ally ahead of Rook.','rook-intercept',{reduction:[20,30,40,50]}],
  ['Break Formation',0,6,'Damage and shove the frontline enemy back one rank.','rook-shove',{damage:[12,16,20,20],cost:[6,6,6,5]}]
 ]
},
{
 name:'Malvek · Fiend Warlock',rosterTitle:'Fiend Warlock',cardTitle:'Fiend Warlock',icon:'🔥',background:'Charlatan',starTier:2,max:100,
 powers:[
 ['Siphon Life',0,6,'Drain the frontline enemy and restore a wounded ally.','malvek-siphon',{damage:[16,22,28,36],heal:[8,12,16,22]}],
 ['Faustian Bargain',4,2,'Spend 2 green energy to gain blue energy: half the normal reward without debt, or the full reward when invoking Patron Debt.','malvek-bargain',{energy:[4,6,8,10]}],
 ["Patron's Claim",4,6,'Mark the frontline enemy; its defeat yields a Patron Debt counter with two extra turns.','malvek-claim',{damage:[10,14,18,24]}]
 ]
}
];const cardTitles=['Scholar','Farmer','Entertainer','Locksmith','Veteran','Wayfarer','Artificer','Swarmkeeper','Saboteur','Warden','Chronomancer','Illusionist','Twilight Cleric','Fungus Druid','Juggernaut Barbarian','Astral Self Monk','Battle Master Fighter','Fiend Warlock'];characters.forEach((c,i)=>{c.rosterTitle=i===13?'Shroomkeeper':cardTitles[i];c.cardTitle=cardTitles[i];c.starTier=i<6?1:2;if(i>=6)c.max=Math.round(c.max*1.9);});// Excess-card character levels: tier baselines are 1 and 100, respectively.
const characterLevelProgress=(archetype,level)=>{const base=Number(archetype)>=6?100:1;const cap=base+99;return Math.max(0,Math.min(99,Math.floor(Number(level)||base)-base));};
// Rank sets the baseline; card mastery and character progression are independent.
const characterDamageMultiplier=(archetype,level)=>1+characterLevelProgress(archetype,level)*(Number(archetype)>=6?0.005:0.002);
const characterColorStrength=(archetype,level,color,isNatural,powerLevel=0)=>{
 const twoStar=Number(archetype)>=6;
 const base=isNatural?(twoStar?15:10):(twoStar?4:2);
 const mastery=isNatural&&powerLevel>0?[1,1.08,1.18,1.35][Math.max(0,Math.min(3,powerLevel-1))]:1;
 return Math.round(base*mastery*characterDamageMultiplier(archetype,level));
};
const characterMaxHp=(character,archetype,level)=>Math.round(character.max*(1+characterLevelProgress(archetype,level)*0.0025));
return{characters,characterLevelProgress,characterDamageMultiplier,characterColorStrength,characterMaxHp,defaultSelection:[0,1,2],storageKey:'rq-v2-character-selection-v1'};
});
