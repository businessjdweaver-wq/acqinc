'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {activate}=require('./enemy-powers.js');
function fixture(){
 const energy=[6,0],actor={hp:10},power={name:'Strike',color:0,cost:4,effect:'strike'};
 let hits=0;
 const handlers={strike:{select:()=>({hp:10}),apply:()=>{hits++;}}};
 return {energy,actor,power,handlers,activation:async(name,apply)=>{await apply();return true;},hits:()=>hits};
}
test('enemy power spends only its own energy and applies once',async()=>{
 const f=fixture();assert.equal(await activate(f),true);assert.deepEqual(f.energy,[2,0]);assert.equal(f.hits(),1);
 assert.equal(await activate(f),false);assert.equal(f.hits(),1);
});
test('blocked, defeated, unsupported and targetless powers do not spend',async()=>{
 for(const mutate of [f=>f.blocked=true,f=>f.actor.hp=0,f=>f.power.effect='unknown',f=>f.handlers.strike.select=()=>null]){
  const f=fixture();mutate(f);assert.equal(await activate(f),false);assert.equal(f.energy[0],6);assert.equal(f.hits(),0);
 }
});
test('counterspell spends energy but prevents effect',async()=>{
 const f=fixture();f.activation=async()=>false;assert.equal(await activate(f),false);assert.equal(f.energy[0],2);assert.equal(f.hits(),0);
});

test('effect adapters select injured allies and preserve enemy ownership',async()=>{
 const {createHandlers}=require('./enemy-powers.js');
 const a={hp:8,max:10},b={hp:2,max:10},hero={hp:20},tile={},special={};
 const events=[];
 const ctx={enemies:()=>[a,b],frontHero:()=>hero,heroResources:()=>[3],ordinaryTiles:()=>[tile],enemySpecialTiles:()=>[special],
 damageHero:(t,n)=>events.push(['damage',t,n]),healEnemy:(t,n)=>events.push(['heal',t,n]),
 drainHeroResource:(t,n)=>events.push(['drain',t,n]),createEnemySpecial:(...args)=>events.push(['create',...args]),amplifyEnemySpecial:(...args)=>events.push(['amplify',...args])};
 const handlers=createHandlers(ctx);
 assert.equal(handlers.heal.select(),b);
 await handlers.siphon.apply(a,{amount:4,heal:2},hero);
 assert.deepEqual(events,[['damage',hero,4],['heal',b,2]]);
 assert.equal(handlers['drain-resource'].select(a,{targetColor:0}),0);
 assert.equal(handlers['create-special'].select(),tile);
 assert.equal(handlers['amplify-special'].select(),special);
});

test('ordered activation skips unavailable powers and stops after counterspell',async()=>{
 const {activateOne}=require('./enemy-powers.js');
 const f=fixture();const powers=[{...f.power,effect:'missing'},f.power,{...f.power,cost:1}];
 const result=await activateOne({...f,powers,activation:async()=>false});
 assert.equal(result.attempted,true);assert.equal(result.resolved,false);assert.equal(f.energy[0],2);assert.equal(f.hits(),0);
});
test('optional effect adapters do not spend without runtime support',async()=>{
 const {createHandlers}=require('./enemy-powers.js');const f=fixture();
 const handlers=createHandlers({enemies:()=>[],frontHero:()=>({}),ordinaryTiles:()=>[{}],enemySpecialTiles:()=>[{}],heroResources:()=>[3]});
 for(const effect of ['steal-resource','convert-tile','capture-special','consume-special','lock-tile','damage-all']){
  assert.equal(await activate({...f,handlers,power:{...f.power,effect,targetColor:0}}),false);
 }
 assert.equal(f.energy[0],6);
});

test('status ledger expires, rejects duplicates and cleans up defeated owners',()=>{
 const {createStatusLedger}=require('./enemy-powers.js');
 const ledger=createStatusLedger(),owner={hp:10},target={hp:20},events=[];
 const status={owner,target,kind:'ward',duration:2,amount:3,cleanup:r=>events.push(r)};
 assert.equal(ledger.add(status),true);assert.equal(ledger.add(status),false);
 ledger.tick();assert.equal(ledger.active('ward',target)[0].remaining,1);
 ledger.tick();assert.deepEqual(events,['expired']);
 assert.equal(ledger.add(status),true);owner.hp=0;ledger.prune();
 assert.equal(ledger.active('ward').length,0);assert.deepEqual(events,['expired','defeated']);
 owner.hp=10;ledger.add(status);ledger.clear();assert.deepEqual(events,['expired','defeated','reset']);
});

test('composite preflight permits a created special and checks counterspell once',async()=>{
 const f=fixture(),events=[],tiles=[];
 f.power.effects=[{effect:'create-special',special:'attack'},{effect:'amplify-special'},{effect:'strike'}];
 f.handlers['create-special']={select:()=>({}),apply:()=>{events.push('create');tiles.push({});}};
 f.handlers['amplify-special']={select:()=>tiles[0],apply:()=>events.push('amplify')};
 let checks=0;
 f.activation=async(name,apply)=>{checks++;await apply();return true;};
 assert.equal(await activate(f),true);
 assert.deepEqual(events,['create','amplify']);
 assert.equal(checks,1);
 assert.equal(f.energy[0],2);
 assert.equal(f.hits(),1);
});

test('composite optional steps skip missing targets and encounter end stops later steps',async()=>{
 const f=fixture();
 let ended=false;
 f.power.effects=[{effect:'missing-target',optional:true},{effect:'finish'},{effect:'strike'}];
 f.handlers['missing-target']={select:()=>null,apply:()=>assert.fail()};
 f.handlers.finish={select:()=>({}),apply:()=>{ended=true;}};
 assert.equal(await activate({...f,ended:()=>ended}),true);
 assert.equal(f.hits(),0);
 assert.equal(f.energy[0],2);
});

test('required targets lost after commitment stop the suffix without refund',async()=>{
 const f=fixture(),target={hp:1};
 f.power.effects=[{effect:'defeat'},{effect:'require'},{effect:'strike'}];
 f.handlers.defeat={select:()=>target,apply:()=>{target.hp=0;}};
 f.handlers.require={select:()=>target.hp>0?target:null,apply:()=>assert.fail()};
 assert.equal(await activate(f),true);
 assert.equal(f.hits(),0);
 assert.equal(f.energy[0],2);
});

test('status phase waits for recurring ticks and expires after the last tick',async()=>{
 const {createStatusLedger}=require('./enemy-powers.js');
 const ledger=createStatusLedger(),owner={hp:10},target={hp:20},events=[];
 ledger.add({owner,target,kind:'recurring:damage',duration:2,onTick:async n=>{
  await Promise.resolve();
  events.push(n);
 },cleanup:reason=>events.push(reason)});
 await ledger.advance('hero');
 assert.deepEqual(events,[]);
 await ledger.advance();
 assert.equal(ledger.entries()[0].remaining,1);
 await ledger.advance();
 assert.deepEqual(events,[2,1,'expired']);
 assert.equal(ledger.entries().length,0);
});

test('timed statuses can retain a defeated owner and accelerate in order',async()=>{
 const {createStatusLedger}=require('./enemy-powers.js');
 const ledger=createStatusLedger(),owner={hp:10},target={hp:20},events=[];
 for(const kind of ['recurring:heal','delayed:damage'])ledger.add({
  owner,target,kind,duration:3,surviveOwner:kind.startsWith('delayed'),
  onTick:n=>events.push([kind,n]),cleanup:reason=>events.push(reason)
 });
 owner.hp=0;
 await ledger.adjust(e=>e.kind.startsWith('delayed'),'resolve',1,()=>false);
 assert.deepEqual(events,['defeated',['delayed:damage',3],['delayed:damage',2],['delayed:damage',1],'expired']);
});

test('cleansing removes specified debuffs without removing other statuses',()=>{
 const {createStatusLedger}=require('./enemy-powers.js');
 const ledger=createStatusLedger(),owner={hp:10},target={hp:20},events=[];
 for(const kind of ['hero-stun','ward'])ledger.add({
  owner,target,kind,duration:2,cleanup:reason=>events.push(reason)
 });
 assert.equal(ledger.cleanse(target,['hero-stun']),1);
 assert.deepEqual(ledger.entries().map(e=>e.kind),['ward']);
 target.hp=0;
 ledger.prune();
 assert.deepEqual(events,['cleansed','defeated']);
});

test('a required temporal step can target a timer created by the same activation',async()=>{
 const f=fixture(),timer=[];
 f.power.effects=[{effect:'countdown'},{effect:'temporal',target:'countdown'}];
 f.handlers.countdown={select:()=>({}),apply:()=>timer.push(3)};
 f.handlers.temporal={select:()=>timer.length?timer:null,apply:(a,p,t)=>{t[0]-=2;}};
 assert.equal(await activate(f),true);
 assert.deepEqual(timer,[1]);
 assert.equal(f.energy[0],2);
});

test('board replacement invalidates a status without running its expiration effect',async()=>{
 const {createStatusLedger}=require('./enemy-powers.js');
 const ledger=createStatusLedger(),owner={hp:10},tile={},events=[];
 let board=[tile];
 ledger.add({owner,target:tile,kind:'countdown',duration:1,
  valid:()=>board.includes(tile),cleanup:reason=>events.push(reason)});
 board=[{...tile}];
 await ledger.advance();
 assert.equal(ledger.entries().length,0);
 assert.deepEqual(events,['defeated']);
});
