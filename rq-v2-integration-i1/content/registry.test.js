'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { characters } = require('../character-catalog.js');
const sprites = require('../assets/sprites/roster-manifest.json');
const manifest = require('./registry.json');
const { planCharacter } = require('../tools/generate-character.js');
const pilot = require('../tests/fixtures/sandbox-mirage.json');
const { loadRegistry, resolveLegacyPower } = require('./registry.js');

const approvedSprites = new Set(sprites.characters
  .filter(sprite => sprite.status === 'approved-idle' &&
    existsSync(join(__dirname, '..', sprite.asset)))
  .map(sprite => resolveLegacyPower(sprite.id, 0)?.characterId)
  .filter(Boolean));

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
      schemaVersion: 1, kind: 'encounter', id: 'sandbox-encounter', name: 'Sandbox Encounter',
      mode: 'combat', enemyPartyId: 'sandbox-party', rewardPolicy: 'sandbox-only'
    },
    'enemy-parties/sandbox-party.json': {
      schemaVersion: 1, kind: 'enemy-party', id: 'sandbox-party', name: 'Sandbox Party',
      combatants: [{ id: 'opponent', name: 'Opponent', spriteId: 'alda', hp: 100, rank: 1 }]
    },
    'magic-items/sandbox-item.json': {
      schemaVersion: 1, kind: 'magic-item', id: 'sandbox-item', name: 'Sandbox Elixir',
      form: 'potion', itemType: 'consumable', effect: 'restorative-elixir', trigger: 'manual',
      charges: 1, acquisition: 'sandbox-only'
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
