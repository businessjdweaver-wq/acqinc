'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { characters } = require('../character-catalog.js');
const { loadApprovedSprites } = require('../tools/validate-content.js');
const { planRecord } = require('../tools/generate-content.js');
const manifest = require('./registry.json');
const { planCharacter } = require('../tools/generate-character.js');
const pilot = require('../tests/fixtures/sandbox-mirage.json');
const { loadRegistry, resolveLegacyPower } = require('./registry.js');

const approvedSprites = loadApprovedSprites();
const merchant = require('../tests/fixtures/sandbox-merchant.json');
const merchantEncounter = require('../tests/fixtures/sandbox-merchant-encounter.json');
const harvestEncounter = require('../tests/fixtures/sandbox-harvest-encounter.json');
const elixir = require('../tests/fixtures/sandbox-restorative-elixir.json');

function fixture(id) {
  return {
    schemaVersion: 1, kind: 'character', id, name: 'Sandbox Hero',
    background: 'Sage', subclass: 'Sandbox', rarity: 2, spriteId: 'alda',
    baseHp: 100, progression: 'class', visibility: 'sandbox',
    recruitment: { eligible: false, pools: [] },
    powers: ['first', 'second', 'third'].map((id, slot) => ({
      id, slot, name: id, description: 'Transform an ordinary tile.',
      color: 'blue', mode: 'activated', trigger: 'manual',
      levels: [6, 6, 5, 5].map(cost => ({
        cost, effect: { type: 'transform', target: 'selected-ordinary-tile', value: 'ivory' }
      }))
    }))
  };
}

function entry(id, path = `characters/${id}.json`) {
  return { id, kind: 'character', path };
}

test('legacy slots stay fixed for every existing catalog entry', () => {
  for (const [index, character] of characters.entries()) {
    const expected = character.name.split(' ')[0].toLowerCase();
    for (const slot of [0, 1, 2]) {
      assert.deepEqual(resolveLegacyPower(index, slot), { characterId: expected, slot });
    }
  }
  assert.equal(resolveLegacyPower(24, 3), null);
  assert.equal(resolveLegacyPower(-1, 0), null);
});

test('registry order has no effect on load order or legacy slot resolution', () => {
  const names = ['sandbox-z', 'sandbox-a'];
  const records = new Map(names.map(id => [entry(id).path, fixture(id)]));
  const read = path => records.get(path);
  for (const ids of [names, [...names].reverse()]) {
    const loaded = loadRegistry({ schemaVersion: 1, entries: ids.map(id => entry(id)) }, read, approvedSprites);
    assert.deepEqual([...loaded.keys()], ['sandbox-a', 'sandbox-z']);
    assert.deepEqual(resolveLegacyPower(24, 2), { characterId: 'grimm', slot: 2 });
  }
  assert.equal(loadRegistry({ schemaVersion: 1, entries: [] }, read, approvedSprites).size, 0);
});

test('registry rejects reserved IDs, duplicates, and paths outside the content directory', () => {
  const read = () => assert.fail('invalid registry must be rejected before reading records');
  for (const entries of [[entry('alda')], [entry('sandbox-a'), entry('sandbox-a')], [entry('sandbox-a', '../sandbox-a.json')]]) {
    assert.throws(() => loadRegistry({ schemaVersion: 1, entries }, read, approvedSprites));
  }
});

test('invalid character data fails before the caller can activate a snapshot', () => {
  const registry = { schemaVersion: 1, entries: [entry('sandbox-a')] };
  for (const [mutate, error] of [
    [record => { record.schemaVersion = 2; }, /schemaVersion/],
    [record => { record.spriteId = 'unknown'; }, /approved sprite/],
    [record => { record.recruitment.eligible = true; }, /recruitment.eligible/],
    [record => { record.name = '<b>Sandbox</b>'; }, /plain display text/],
    [record => { record.powers[0].mode = 'scheduled'; }, /activated/],
    [record => { record.powers[0].levels[0].effect.type = 'emit'; }, /transform, create/],
    [record => { record.powers[0].levels[0].effect.target = 'front-enemy'; }, /selected-ordinary-tile/],
    [record => { record.powers[0].levels[0].effect.script = 'execute'; }, /unknown field/]
  ]) {
    const record = fixture('sandbox-a');
    mutate(record);
    assert.throws(() => loadRegistry(registry, () => record, approvedSprites), error);
  }
});

test('sandbox encounter links resolve to a valid enemy party and rewards stay isolated', () => {
  const records = {
    'encounters/sandbox-encounter.json': {
      ...merchantEncounter, id: 'sandbox-encounter', enemyPartyId: 'sandbox-party'
    },
    'enemy-parties/sandbox-party.json': {
      ...merchant, id: 'sandbox-party', combatants: merchant.combatants.slice(0, 1)
    },
    'magic-items/sandbox-item.json': {
      ...elixir, id: 'sandbox-item'
    }
  };
  const entries = Object.entries(records).map(([path, { id, kind }]) => ({ id, kind, path }));
  const read = path => records[path];
  const load = () => loadRegistry({ schemaVersion: 1, entries }, read, approvedSprites);
  assert.equal(load().size, 3);
  const encounter = records['encounters/sandbox-encounter.json'];
  encounter.enemyPartyId = 'sandbox-item';
  assert.throws(load, /unknown enemy party/);
  encounter.enemyPartyId = 'sandbox-party';
  encounter.rewardPolicy = 'live';
  assert.throws(load, /sandbox-only/);
});

test('generator round-trips its fixture and rejects accidental replacement', () => {
  const read = path => require('./' + path);
  const plan = planCharacter(pilot, { schemaVersion: 1, entries: [] }, read, approvedSprites);
  assert.equal(plan.entry.path, 'characters/sandbox-mirage.json');
  assert.deepEqual(loadRegistry(manifest, read, approvedSprites).get(pilot.id), pilot);
  assert.throws(() => planCharacter(pilot, manifest, read, approvedSprites), /already exists/);
  assert.equal(planCharacter(pilot, manifest, read, approvedSprites, true).existing.id, pilot.id);
});


test('enemy-party generator validates one to three ordered combatants and supported powers', () => {
  const registry = { schemaVersion: 1, entries: [] };
  const read = path => require('./' + path);
  for (const count of [1, 2, 3]) {
    const record = { ...merchant, combatants: merchant.combatants.slice(0, count) };
    assert.equal(planRecord('enemy-party', record, registry, read, approvedSprites).entry.path,
      'enemy-parties/sandbox-merchant.json');
  }
  assert.deepEqual(loadRegistry(manifest, read, approvedSprites).get(merchant.id), merchant);
  for (const [mutate, error] of [
    [party => { party.combatants[1].rank = 1; }, /rank/],
    [party => { party.combatants[1].id = party.combatants[0].id; }, /duplicate combatant ID/],
    [party => { party.combatants[0].power.countdown.max = 1; }, /countdown.max/],
    [party => { party.combatants[1].power.color = 'green'; }, /power.color/],
    [party => { party.combatants[2].power.cost = 0; }, /power.cost/],
    [party => { party.combatants[2].power.target = 'party-back'; }, /power.target/]
  ]) {
    const party = structuredClone(merchant);
    mutate(party);
    assert.throws(() => planRecord('enemy-party', party, registry, read, approvedSprites), error);
  }
});


test('encounter generator round-trips combat and puzzle fixtures and rejects unsupported rules', () => {
  const read = path => require('./' + path);
  for (const input of [merchantEncounter, harvestEncounter]) {
    const registry = { ...manifest, entries: manifest.entries.filter(entry => entry.id !== input.id) };
    const plan = planRecord('encounter', input, registry, read, approvedSprites);
    assert.equal(plan.entry.path, `encounters/${input.id}.json`);
    assert.deepEqual(loadRegistry(plan.next, read, approvedSprites).get(input.id), input);
  }
  const registry = { ...manifest, entries: manifest.entries.filter(entry => entry.id !== harvestEncounter.id) };
  for (const [mutate, error] of [
    [record => { record.board.seed = -1; }, /board.seed/],
    [record => { record.board.layout = 'arbitrary'; }, /board.layout/],
    [record => { record.turnLimit = 0; }, /turnLimit/],
    [record => { record.objective.count = 0; }, /objective.count/],
    [record => { record.enemyPartyId = merchant.id; }, /unknown field/],
    [record => { record.handler = 'merchant'; }, /handler/],
    [record => { record.rewardPolicy = 'live'; }, /sandbox-only/],
  ]) {
    const record = structuredClone(harvestEncounter);
    mutate(record);
    assert.throws(() => planRecord('encounter', record, registry, read, approvedSprites), error);
  }
});


test('magic-item generator round-trips the elixir and rejects other item rules', () => {
  const read = path => require('./' + path);
  const registry = { ...manifest, entries: manifest.entries.filter(entry => entry.id !== elixir.id) };
  const plan = planRecord('magic-item', elixir, registry, read, approvedSprites);
  assert.equal(plan.entry.path, `magic-items/${elixir.id}.json`);
  assert.deepEqual(loadRegistry(plan.next, read, approvedSprites).get(elixir.id), elixir);
  for (const [mutate, error] of [
    [record => { record.itemType = 'equipment'; }, /itemType/],
    [record => { record.effect = 'revive'; }, /effect/],
    [record => { record.trigger = 'passive'; }, /trigger/],
    [record => { record.acquisition = 'store'; }, /acquisition/],
    [record => { record.eligibility.minLevel = 100; }, /eligibility.minLevel/],
    [record => { record.eligibility.target = 'unconscious'; }, /eligibility.target/],
    [record => { record.charges = 2; }, /charges/],
    [record => { record.consumption = 'on-equip'; }, /consumption/],
    [record => { record.duration = 'turn'; }, /duration/],
    [record => { record.stacking = 'stack'; }, /stacking/],
    [record => { record.equip = 'ring'; }, /equip/],
  ]) {
    const record = structuredClone(elixir);
    mutate(record);
    assert.throws(() => planRecord('magic-item', record, registry, read, approvedSprites), error);
  }
});

test('monster party accepts approved monster art and bounded activated effects', () => {
  const record={schemaVersion:1,kind:'enemy-party',id:'sandbox-monster-test',name:'Monster Test',ai:'monster',combatants:[
    {id:'heartwood-guardian',name:'Heartwood Guardian',spriteId:'heartwood-guardian',hp:150,rank:1,
     power:{name:'Bark Shield',effect:'create-special',color:4,cost:6,amount:3,special:'defense'}}
  ]};
  const registry={schemaVersion:1,entries:[{id:record.id,kind:record.kind,path:'enemy-parties/'+record.id+'.json'}]};
  assert.deepEqual(loadRegistry(registry,()=>record,approvedSprites).get(record.id),record);
  for(const mutate of [r=>r.combatants[0].power.cost=0,r=>r.combatants[0].power.effect='script',r=>r.combatants[0].power.special='unknown',r=>r.combatants[0].spriteId='missing']){
    const invalid=structuredClone(record);mutate(invalid);
    assert.throws(()=>loadRegistry(registry,()=>invalid,approvedSprites));
  }
});

test('monster effect catalog accepts valid specimens and rejects unsupported parameters', () => {
  const {createHandlers}=require('../enemy-powers.js');
  const record=structuredClone(require('./enemy-parties/sandbox-rotting-grove.json'));
  const registry={schemaVersion:1,entries:[{id:record.id,kind:record.kind,path:'enemy-parties/'+record.id+'.json'}]};
  const cases=[
    {effect:'woven-life',duration:3,reduction:15},
    {effect:'leafspeech',range:4,percent:50,cap:2},
    {effect:'withering-blight',percent:30,damagePerPoint:2},
    {effect:'damage',amount:8,scaling:{metric:'hero-energy',multiplier:2,cap:30}},
    {effect:'damage-all',amount:8},{effect:'heal',amount:8},{effect:'heal-all',amount:8},
    {effect:'siphon',amount:8,heal:4},{effect:'drain-resource',amount:4,targetColor:2},
    {effect:'steal-resource',amount:4,targetColor:2},{effect:'create-special',special:'attack',amount:4},
    {effect:'amplify-special',amount:4},{effect:'capture-special',amount:1},
    {effect:'consume-special',amount:8},{effect:'convert-tile',targetColor:0,amount:1},
    ...['ward','evasion','intercept','retaliate','countdown','lock-tile','counterspell'].map(effect=>({effect,amount:8,duration:2})),
    {effect:'recurring',payload:'steal-resource',targetColor:0,targetPolicy:'fixed',amount:2,duration:3},
    {effect:'delayed',payload:'hero-stun',targetPolicy:'reassess',amount:2,duration:3,surviveOwner:true},
    {effect:'tile-pattern',operation:'destroy',pattern:'cross',count:5,eligibility:'ordinary',filterColor:2,cascade:true},
    {effect:'hero-stun',duration:2},{effect:'cleanse',team:'monster'},{effect:'suppression',amount:50,duration:2},
    {effect:'formation',operation:'rank',rank:2},
    {effect:'exchange',source:'enemy-energy',sourceColor:1,destination:'caster-hp',amount:4,benefit:6},
    {effect:'temporal',operation:'advance',target:'delayed',owner:'enemy-team',amount:2},
    {effect:'repeated-strikes',count:3,amount:8,targetPolicy:'fixed',retarget:true},
  ];
  const handlers=createHandlers({});
  assert.deepEqual(Object.keys(handlers).sort(),cases.map(effect=>effect.effect).sort());
  const mob=record.combatants[0];
  delete mob.powers;
  for(const specimen of cases){
    mob.power={name:'Test power',color:1,cost:5,effects:[specimen]};
    assert.doesNotThrow(()=>loadRegistry(registry,()=>record,approvedSprites),specimen.effect);
    assert.equal(typeof handlers[specimen.effect].select,'function');
    assert.equal(typeof handlers[specimen.effect].apply,'function');
    mob.power.effects=[{...specimen,script:'{}'}];
    assert.throws(()=>loadRegistry(registry,()=>record,approvedSprites),/unknown field "script"/);
  }
  const invalidEffects=[
    {effect:'recurring',payload:'damage',targetPolicy:'fixed',amount:2,duration:9},
    {effect:'delayed',payload:'delayed',targetPolicy:'fixed',amount:2,duration:1},
    {effect:'tile-pattern',operation:'propagate',pattern:'cross',count:4,eligibility:'hero-special'},
    {effect:'tile-pattern',operation:'destroy',pattern:'cross',count:17,eligibility:'ordinary'},
    {effect:'repeated-strikes',count:9,amount:6,targetPolicy:'fixed'},
    {effect:'damage',amount:8,scaling:{metric:'eval',multiplier:2,cap:30}},
    {effect:'exchange',source:'enemy-energy',sourceColor:1,destination:'enemy-energy',targetColor:2,amount:4,benefit:6},
  ];
  for(const invalid of invalidEffects){
    mob.power.effects=[invalid];
    assert.throws(()=>loadRegistry(registry,()=>record,approvedSprites),/\.effects\[0\]\./);
  }
  mob.power.effects=Array(5).fill({effect:'damage',amount:8});
  assert.throws(()=>loadRegistry(registry,()=>record,approvedSprites),/one to four/);
});

test('the six sandbox monster parties provide 54 powers on approved sprites', () => {
  const loaded=loadRegistry(manifest,path=>require('./'+path),approvedSprites);
  const parties=[...loaded.values()].filter(record=>record.kind==='enemy-party'&&record.ai==='monster');
  assert.equal(parties.length,6);
  const monsters=parties.flatMap(record=>{
    assert.equal(record.combatants.length,3,record.id);
    return record.combatants;
  });
  assert.equal(new Set(monsters.map(monster=>monster.spriteId)).size,18);
  for(const monster of monsters){
    assert.equal(monster.powers.length,3,monster.id);
    assert.ok(approvedSprites.has(monster.spriteId),monster.spriteId);
  }
});

test('the confirmed monster lineup resolves to 18 distinct two-star hero kits', () => {
  const { auditMonsterCounterparts } = require('../tools/audit-monster-counterparts.js');
  const kits = auditMonsterCounterparts();
  assert.equal(kits.length, 18);
  assert.equal(kits.flatMap(kit => kit.expected).length, 54);
  const heartwood = kits.find(kit => kit.monster === 'Heartwood Guardian');
  assert.deepEqual(heartwood.expected.map(power => power.name), [
    'Woven Life', 'Leafspeech', 'Withering Blight'
  ]);
});

test('Heartwood Guardian uses the canonical Hester rank-one power parameters', () => {
  const {characters}=require('../character-catalog.js');
  const ids=require('./legacy-character-ids.json');
  const {combatants}=require('./enemy-parties/sandbox-rotting-grove.json');
  const heartwood=combatants.find(enemy=>enemy.id==='heartwood-guardian');
  const hester=characters[ids.indexOf('hester')];
  const [woven,leaf,blight]=hester.powers.map(([name,color,cost,description,kind,parameters])=>({
    name,color,cost:parameters.costs[0],parameters
  }));
  assert.deepEqual(heartwood.powers,[
    {name:woven.name,color:woven.color,cost:woven.cost,effect:'woven-life',duration:woven.parameters.duration[0],reduction:woven.parameters.reduction[0]},
    {name:leaf.name,color:leaf.color,cost:leaf.cost,effect:'leafspeech',range:leaf.parameters.range[0],percent:leaf.parameters.percent[0],cap:leaf.parameters.cap[0]},
    {name:blight.name,color:blight.color,cost:blight.cost,effect:'withering-blight',percent:blight.parameters.percent[0],damagePerPoint:blight.parameters.damage[0]},
  ]);
});
