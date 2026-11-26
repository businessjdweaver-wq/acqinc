'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./legacy-character-ids.json'));
  } else {
    root.RQContentRegistry = factory([]);
  }
})(globalThis, function (legacyIds) {

const directories = { character: 'characters', 'enemy-party': 'enemy-parties', encounter: 'encounters', 'magic-item': 'magic-items' };
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const colors = ['red', 'yellow', 'blue', 'purple', 'green', 'gray', 'ivory'];
const slots = [0, 1, 2];

function requireValue(condition, location, message) {
  if (!condition) throw new Error(`${location}: ${message}`);
}

function object(value, fields, location) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), location, 'expected an object');
  for (const field of fields) {
    requireValue(Object.hasOwn(value, field), location, `missing field "${field}"`);
  }
  for (const field of Object.keys(value)) {
    requireValue(fields.includes(field), location, `unknown field "${field}"`);
  }
}

function oneOf(value, choices, location) {
  requireValue(choices.includes(value), location, `expected one of ${choices.join(', ')}`);
}

function integer(value, min, max, location) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max,
    location, `expected an integer from ${min} to ${max}`);
}

function list(value, min, max, location) {
  requireValue(Array.isArray(value), location, 'expected an array');
  integer(value.length, min, max, `${location}.length`);
}

function id(value, location) {
  requireValue(typeof value === 'string' && value.length <= 64 && idPattern.test(value),
    location, 'expected a lowercase stable ID');
}

function displayText(value, location) {
  requireValue(typeof value === 'string' && value.trim().length > 0 &&
    value.length <= 240 && !/[<>&"'\u0000-\u001f]/u.test(value),
  location, 'expected plain display text up to 240 characters');
}

function validateEffect(effect, location) {
  object(effect, ['type', 'target', 'value'], location);
  oneOf(effect.type, ['transform', 'create'], `${location}.type`);
  oneOf(effect.target, ['selected-ordinary-tile'], `${location}.target`);
  oneOf(effect.value, effect.type === 'transform' ? colors : ['attack', 'defense', 'energy'],
    `${location}.value`);
}

function validateCharacter(record, location, approvedSprites) {
  object(record, ['schemaVersion', 'kind', 'id', 'name', 'background', 'subclass', 'rarity',
    'spriteId', 'baseHp', 'progression', 'visibility', 'recruitment', 'powers'], location);
  for (const field of ['background', 'subclass']) displayText(record[field], `${location}.${field}`);
  integer(record.rarity, 1, 2, `${location}.rarity`);
  integer(record.baseHp, 1, 10000, `${location}.baseHp`);
  oneOf(record.progression, [record.rarity === 1 ? 'background' : 'class'], `${location}.progression`);
  oneOf(record.visibility, ['sandbox'], `${location}.visibility`);
  id(record.spriteId, `${location}.spriteId`);
  requireValue(approvedSprites.has(record.spriteId), `${location}.spriteId`, 'unknown approved sprite');
  object(record.recruitment, ['eligible', 'pools'], `${location}.recruitment`);
  oneOf(record.recruitment.eligible, [false], `${location}.recruitment.eligible`);
  list(record.recruitment.pools, 0, 0, `${location}.recruitment.pools`);
  list(record.powers, 3, 3, `${location}.powers`);
  const powerIds = new Set();
  for (const [slot, power] of record.powers.entries()) {
    const path = `${location}.powers[${slot}]`;
    object(power, ['id', 'slot', 'name', 'description', 'color', 'mode', 'trigger', 'levels'], path);
    id(power.id, `${path}.id`);
    requireValue(!powerIds.has(power.id), `${path}.id`, 'duplicate power ID');
    powerIds.add(power.id);
    oneOf(power.slot, [slot], `${path}.slot`);
    displayText(power.name, `${path}.name`);
    displayText(power.description, `${path}.description`);
    oneOf(power.color, colors, `${path}.color`);
    oneOf(power.mode, ['activated'], `${path}.mode`);
    oneOf(power.trigger, ['manual'], `${path}.trigger`);
    list(power.levels, 4, 4, `${path}.levels`);
    for (const [index, level] of power.levels.entries()) {
      const levelPath = `${path}.levels[${index}]`;
      object(level, ['cost', 'effect'], levelPath);
      integer(level.cost, 1, 100, `${levelPath}.cost`);
      validateEffect(level.effect, `${levelPath}.effect`);
    }
  }
}

function validateEnemyParty(record, location, approvedSprites) {
  object(record, ['schemaVersion', 'kind', 'id', 'name', 'combatants'], location);
  list(record.combatants, 1, 3, `${location}.combatants`);
  const combatantIds = new Set();
  for (const [index, enemy] of record.combatants.entries()) {
    const path = `${location}.combatants[${index}]`;
    object(enemy, ['id', 'name', 'spriteId', 'hp', 'rank'], path);
    id(enemy.id, `${path}.id`);
    requireValue(!combatantIds.has(enemy.id), `${path}.id`, 'duplicate combatant ID');
    combatantIds.add(enemy.id);
    displayText(enemy.name, `${path}.name`);
    id(enemy.spriteId, `${path}.spriteId`);
    requireValue(approvedSprites.has(enemy.spriteId), `${path}.spriteId`, 'unknown approved sprite');
    integer(enemy.hp, 1, 10000, `${path}.hp`);
    oneOf(enemy.rank, [index + 1], `${path}.rank`);
  }
}

function validateEncounter(record, location) {
  object(record, ['schemaVersion', 'kind', 'id', 'name', 'mode', 'enemyPartyId', 'rewardPolicy'], location);
  oneOf(record.mode, ['combat'], `${location}.mode`);
  id(record.enemyPartyId, `${location}.enemyPartyId`);
  oneOf(record.rewardPolicy, ['sandbox-only'], `${location}.rewardPolicy`);
}

function validateMagicItem(record, location) {
  object(record, ['schemaVersion', 'kind', 'id', 'name', 'form', 'itemType',
    'effect', 'trigger', 'charges', 'acquisition'], location);
  oneOf(record.form, ['potion'], `${location}.form`);
  oneOf(record.itemType, ['consumable'], `${location}.itemType`);
  oneOf(record.effect, ['restorative-elixir'], `${location}.effect`);
  oneOf(record.trigger, ['manual'], `${location}.trigger`);
  oneOf(record.charges, [1], `${location}.charges`);
  oneOf(record.acquisition, ['sandbox-only'], `${location}.acquisition`);
}

const validators = {
  character: validateCharacter,
  'enemy-party': validateEnemyParty,
  encounter: validateEncounter,
  'magic-item': validateMagicItem
};

function resolveLegacyPower(archetype, slot) {
  if (!Number.isInteger(archetype) || !slots.includes(slot) || !legacyIds[archetype]) return null;
  return { characterId: legacyIds[archetype], slot };
}

function planRegistry(manifest, reservedIds = legacyIds) {
  object(manifest, ['schemaVersion', 'entries'], 'registry');
  oneOf(manifest.schemaVersion, [1], 'registry.schemaVersion');
  list(manifest.entries, 0, 1000, 'registry.entries');
  const ids = new Set(reservedIds);
  const paths = new Set();
  for (const entry of manifest.entries) {
    object(entry, ['id', 'kind', 'path'], 'registry entry');
    id(entry.id, 'registry entry.id');
    oneOf(entry.kind, Object.keys(directories), `${entry.id}.kind`);
    requireValue(entry.path === `${directories[entry.kind]}/${entry.id}.json`, entry.id, 'unexpected record path');
    requireValue(!ids.has(entry.id) && !paths.has(entry.path), entry.id, 'duplicate or reserved ID/path');
    ids.add(entry.id);
    paths.add(entry.path);
  }
  return [...manifest.entries].sort((a, b) => a.id < b.id ? -1 : 1);
}

function loadRegistry(manifest, readRecord, approvedSprites, reservedIds) {
  const records = new Map();
  for (const entry of planRegistry(manifest, reservedIds)) {
    const record = readRecord(entry.path);
    requireValue(record && typeof record === 'object', entry.path, 'expected a record');
    oneOf(record.schemaVersion, [1], `${entry.path}.schemaVersion`);
    requireValue(record.id === entry.id && record.kind === entry.kind, entry.path, 'record does not match registry entry');
    displayText(record.name, `${entry.path}.name`);
    validators[entry.kind](record, entry.path, approvedSprites);
    records.set(entry.id, record);
  }
  for (const record of records.values()) {
    if (record.kind === 'encounter') {
      requireValue(records.get(record.enemyPartyId)?.kind === 'enemy-party',
        `${record.id}.enemyPartyId`, 'unknown enemy party');
    }
  }
  return records;
}

return { loadRegistry, planRegistry, resolveLegacyPower };
});
