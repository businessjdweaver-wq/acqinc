const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {biologicalMesh,biologicalComponents,biologicalPatterns,biologicalPresets}=require('./studio-biological.js');

test('asset meshes are finite, deterministic and reuse cached detail levels',()=>{
 for(const kind of Object.keys(biologicalComponents)){
  const mesh=biologicalMesh(kind,77);
  assert.ok(mesh.length>8,kind);
  assert.equal(mesh,biologicalMesh(kind,77));
  assert.notDeepEqual(mesh,biologicalMesh(kind,78));
  assert.ok(biologicalMesh(kind,77,0).length<=mesh.length);
  for(const {points} of mesh)for(const point of points){
   assert.equal(point.length,3);
   assert.ok(point.every(Number.isFinite));
  }
 }
});
test('patterns and components reference bundled materials',()=>{
 for(const [,material] of [...Object.values(biologicalComponents),...Object.values(biologicalPatterns)]){
  const image=readFileSync(path.join(__dirname,'art/biological',material+'.webp'));
  assert.equal(image.toString('ascii',8,12),'WEBP');
 }
 for(const [, , , , top,side] of Object.values(biologicalPresets)){
  assert.ok(biologicalPatterns[top]);
  assert.ok(biologicalPatterns[side]);
 }
});
test('sample includes each component, a tissue door, terrain stamps and a bridge',()=>{
 const scene=require('./examples/living-dungeon.json');
 assert.equal(scene.version,2);
 for(const kind of Object.keys(biologicalComponents))assert.ok(scene.pieces.some(p=>p.terrainShape?.componentKind===kind));
 assert.ok(scene.pieces.some(p=>p.type==='ropeBridge'&&p.biological));
 assert.equal(scene.areas[0].wallPaths[0].openings[0].material,'Tissue');
 assert.ok(Object.values(scene.areas[0].groundStamps).every(layers=>layers.every(({kind})=>biologicalPatterns[kind])));
});
