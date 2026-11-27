const {test}=require('node:test');
const assert=require('node:assert/strict');
const {computeStudioMiniatureFinishes}=require('./studio-miniature-finishes.js');

function surfaceMesh(divisions,height){
 const positions=[];
 for(let row=0;row<divisions;row++)for(let column=0;column<divisions;column++){
  const x=column/divisions,z=row/divisions;
  const nextX=(column+1)/divisions,nextZ=(row+1)/divisions;
  for(const [px,pz] of [[x,z],[x,nextZ],[nextX,z],[nextX,z],[x,nextZ],[nextX,nextZ]]){
   positions.push(px,height(px),pz);
  }
 }
 return new Float32Array(positions);
}

function finish(positions){
 const indices=Uint32Array.from({length:positions.length/3},(_,i)=>i);
 return computeStudioMiniatureFinishes(positions,indices);
}

test('a flat mesh has no occlusion or curvature and welded vertex outputs agree',()=>{
 const flat=surfaceMesh(12,()=>0);
 assert.ok(finish(flat).every(value=>value===0));
 const fold=surfaceMesh(12,x=>Math.abs(x-.5));
 const result=finish(fold),seen=new Map();
 for(let v=0;v<fold.length/3;v++){
  const key=fold.subarray(v*3,v*3+3).join(',');
  const fields=Array.from(result.subarray(v*2,v*2+2));
  if(seen.has(key))assert.deepEqual(fields,seen.get(key));
  else seen.set(key,fields);
 }
});

test('a geometry blocker increases ambient occlusion without adding curvature',()=>{
 const lower=surfaceMesh(12,()=>0);
 const upper=surfaceMesh(12,()=>.07);
 const combined=new Float32Array(lower.length+upper.length);
 combined.set(lower);combined.set(upper,lower.length);
 const result=finish(combined);
 let lowerAO=0;
 for(let i=0;i<result.length;i+=2){
  assert.equal(result[i+1],0);
  if(i<lower.length/3*2)lowerAO+=result[i];
  else assert.equal(result[i],0);
 }
 assert.ok(lowerAO/(lower.length/3)>.2);
});

test('dihedral sign distinguishes raised and recessed folds',()=>{
 const ridge=surfaceMesh(40,x=>-Math.abs(x-.5));
 const valley=surfaceMesh(40,x=>Math.abs(x-.5));
 const ridgeFields=finish(ridge),valleyFields=finish(valley);
 for(let i=0;i<ridge.length/3;i++){
  if(ridge[i*3]!==.5||ridge[i*3+2]<.2||ridge[i*3+2]>.8)continue;
  assert.ok(ridgeFields[i*2+1]>.1);
  assert.ok(valleyFields[i*2+1]<-.1);
  assert.ok(valleyFields[i*2]>ridgeFields[i*2]);
 }
 assert.ok(ridgeFields.every(Number.isFinite));
 assert.ok(valleyFields.every(Number.isFinite));
});

test('large-mesh sampling interpolates a welded finish field',()=>{
 const valley=surfaceMesh(130,x=>Math.abs(x-.5));
 const fields=finish(valley),center=new Map();
 for(let i=0;i<valley.length/3;i++){
  assert.ok(Number.isFinite(fields[i*2]));
  assert.ok(Number.isFinite(fields[i*2+1]));
  if(valley[i*3]===.5)center.set(valley[i*3+2],fields[i*2]);
 }
 const centralValues=[...center].sort(([a],[b])=>a-b).filter(([z])=>z>.2&&z<.8).map(([,ao])=>ao);
 assert.ok(centralValues.every(ao=>ao>.05));
 assert.ok(centralValues.slice(1).every((ao,i)=>Math.abs(ao-centralValues[i])<.04));
});

test('rejects nonfinite positions and out-of-range indices',()=>{
 assert.throws(()=>computeStudioMiniatureFinishes([0,0,Infinity],[0,0,0]),/Unsupported/);
 assert.throws(()=>computeStudioMiniatureFinishes([0,0,0],[0,1,0]),/Unsupported/);
});
