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
