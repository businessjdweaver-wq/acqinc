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
