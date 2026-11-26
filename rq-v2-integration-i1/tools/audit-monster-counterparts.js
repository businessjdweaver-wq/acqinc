'use strict';

const assert = require('node:assert/strict');
const manifest = require('../content/registry.json');
const counterparts = require('../content/monster-counterparts.json');
const heroIds = require('../content/legacy-character-ids.json');
const { characters } = require('../character-catalog.js');

function auditMonsterCounterparts() {
  const parties = manifest.entries
    .filter(entry => entry.kind === 'enemy-party')
    .map(entry => require('../content/' + entry.path))
    .filter(party => party.ai === 'monster');
  assert.deepEqual(Object.keys(counterparts).sort(), parties.map(party => party.id).sort());

  const seenHeroes = new Set();
  const audit = [];
  for (const party of parties) {
    const assignments = counterparts[party.id];
    assert.deepEqual(Object.keys(assignments).sort(), party.combatants.map(enemy => enemy.id).sort(), party.id);
    for (const enemy of party.combatants) {
      const heroId = assignments[enemy.id];
      const hero = characters[heroIds.indexOf(heroId)];
      assert.equal(hero?.starTier, 2, heroId);
      assert.equal(hero.powers.length, 3, heroId);
      assert.ok(!seenHeroes.has(heroId), 'Duplicate counterpart: ' + heroId);
      seenHeroes.add(heroId);
      audit.push({
        party: party.name,
        monster: enemy.name,
        hero: hero.name,
        current: (enemy.powers || [enemy.power]).map(power => power.name),
        expected: hero.powers.map(([name, color, cost, description, handler]) => ({
          name, color, cost, description, handler
        }))
      });
    }
  }
  return audit;
}

if (require.main === module) {
  console.log(JSON.stringify(auditMonsterCounterparts(), null, 2));
}

module.exports = { auditMonsterCounterparts };
