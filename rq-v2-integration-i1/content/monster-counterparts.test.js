'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { characters, tileColorNames } = require('../character-catalog.js');

const root = __dirname;
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const counterparts = readJson('monster-counterparts.json');
const legacyIds = readJson('legacy-character-ids.json');
const expectedFormations = {
  'sandbox-rotting-grove': [
    ['heartwood-guardian', 'Heartwood Guardian', 'heartwood-guardian', 1],
    ['spore-sovereign', 'Spore Sovereign', 'spore-sovereign', 2],
    ['moonmold-wisp', 'Moonmold Wisp', 'moonmold-wisp', 3]
  ],
  'sandbox-ashen-covenant': [
    ['emberbound-colossus', 'Emberbound Colossus', 'emberbound-colossus', 1],
    ['bloodroot-reaver', 'Bloodroot Reaver', 'bloodroot-reaver', 2],
    ['cinder-imp', 'Cinder Imp', 'cinder-imp', 3]
  ],
  'sandbox-shattered-laboratory': [
    ['mirror-mimic', 'Mirror Mimic', 'mirror-mimic', 1],
    ['prismatic-ooze', 'Prismatic Ooze', 'prismatic-ooze', 2],
    ['chronophage', 'Chronophage', 'chronophage', 3]
  ],
  'sandbox-iron-brood': [
    ['ironback-beetle', 'Ironback Beetle', 'ironback-beetle', 1],
    ['astral-mantis', 'Astral Mantis', 'astral-mantis', 2],
    ['watcher-construct', 'Watcher Construct', 'watcher-construct', 3]
  ],
  'sandbox-drowned-hunt': [
    ['bogmaw-stalker', 'Bogmaw Stalker', 'bogmaw-stalker', 1],
    ['dreadshade', 'Dreadshade', 'dreadshade', 2],
    ['psychic-leech', 'Psychic Leech', 'psychic-leech', 3]
  ],
  'sandbox-fallen-constellation': [
    ['star-eater', 'Star Eater', 'star-eater', 1],
    ['clockwork-scorpion', 'Clockwork Scorpion', 'clockwork-scorpion', 2],
    ['shard-harrier', 'Shard Harrier', 'shard-harrier', 3]
  ]
};

function expectedMasteryOneCost(power) {
  const details = power[5];
  return details?.costs?.[0] ?? (Array.isArray(details?.cost) ? details.cost[0] : details?.cost) ?? power[2];
}

test('all 18 monster kits match their canonical hero power names, colors, costs, and slot order', () => {
  const colorNames = tileColorNames;
  const errors = [];
  let total = 0;

  for (const [partyId, heroMap] of Object.entries(counterparts)) {
    const party = readJson(`enemy-parties/${partyId}.json`);
    const enemiesById = new Map(party.combatants.map(enemy => [enemy.id, enemy]));
    const mappedIds = Object.keys(heroMap).sort();
    const combatantIds = party.combatants.map(enemy => enemy.id).sort();
    if (JSON.stringify(mappedIds) !== JSON.stringify(combatantIds)) {
      errors.push(`${partyId}: counterpart ids ${JSON.stringify(mappedIds)} do not cover formation combatants ${JSON.stringify(combatantIds)}`);
    }
    for (const [enemyId, heroId] of Object.entries(heroMap)) {
      const enemy = enemiesById.get(enemyId);
      const heroIndex = legacyIds.indexOf(heroId);
      const hero = characters[heroIndex];
      if (!enemy) {
        errors.push(`${partyId}/${enemyId}: counterpart mapping has no combatant`);
        continue;
      }
      if (!hero) {
        errors.push(`${partyId}/${enemyId}: unknown hero id ${heroId} at legacy catalog index ${heroIndex}`);
        continue;
      }
      if (enemy.powers.length !== hero.powers.length) {
        errors.push(`${partyId}/${enemyId} (${heroId}): ${enemy.powers.length} monster powers vs ${hero.powers.length} hero powers`);
      }
      for (let slot = 0; slot < Math.max(enemy.powers.length, hero.powers.length); slot++) {
        total++;
        const monsterPower = enemy.powers[slot];
        const heroPower = hero.powers[slot];
        if (!monsterPower || !heroPower) continue;
        const expectedColor = heroPower[1];
        const expectedCost = expectedMasteryOneCost(heroPower);
        const label = `${partyId}/${enemyId} (${heroId}) power ${slot + 1}`;
        if (monsterPower.name !== heroPower[0]) errors.push(`${label}: name ${JSON.stringify(monsterPower.name)}; expected ${JSON.stringify(heroPower[0])}`);
        if (monsterPower.color !== expectedColor) errors.push(`${label} ${heroPower[0]}: color ${monsterPower.color} (${colorNames[monsterPower.color] ?? 'unknown'}); expected ${expectedColor} (${colorNames[expectedColor]})`);
        if (monsterPower.cost !== expectedCost) errors.push(`${label} ${heroPower[0]}: cost ${monsterPower.cost}; expected mastery-one cost ${expectedCost}`);
      }
    }
  }
  assert.equal(Object.values(counterparts).reduce((count, heroes) => count + Object.keys(heroes).length, 0), 18, 'Expected exactly 18 mapped monster kits');
  assert.equal(total, 54, `Expected 54 mapped monster power slots (three per kit); inspected ${total}`);
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('the six monster parties retain their original combatant formation identities', () => {
  assert.deepEqual(Object.keys(counterparts).sort(), Object.keys(expectedFormations).sort(), 'counterpart records should cover exactly the original six monster parties');
  const errors = [];
  for (const [partyId, expected] of Object.entries(expectedFormations)) {
    const party = readJson(`enemy-parties/${partyId}.json`);
    const actual = party.combatants.map(({ id, name, spriteId, rank }) => [id, name, spriteId, rank]);
    if (party.id !== partyId) errors.push(`${partyId}: party id is ${party.id}`);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`${partyId}: formation identity mismatch; got ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`);
    }
  }
  assert.deepEqual(errors, [], errors.join('\n'));
});
