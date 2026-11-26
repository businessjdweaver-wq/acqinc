const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  splitDamage, leafspeechCandidates, leafspeechSelection, convertLeafspeech, blight, bleedTarget, matchMultiplier,
} = require('./grimm-hester.js');
const { characters, characterMaxHp, grimmHesterPowerDetail } = require('./character-catalog.js');

const grimm = characters[24], hester = characters[25];

test('Grimm and Hester have two-star level-100 HP and all four mastery levels', () => {
  for (const [id, hero, hp, colors] of [[24, grimm, 205, [0, 6, 4]], [25, hester, 182, [2, 1, 4]]]) {
    assert.equal(hero.starTier, 2);
    assert.equal(characterMaxHp(hero, id, 100), hp);
    assert.deepEqual(hero.powers.map(power => power[1]), colors);
    for (const power of hero.powers) {
      assert.equal(power[5].costs.length, 4);
      assert.equal(new Set([1, 2, 3, 4].map(rank => grimmHesterPowerDetail(power, rank))).size, 4);
    }
    const png = fs.readFileSync(path.join(__dirname, 'assets/sprites/clean', 'rqv2-' + hero.spriteKey + '-idle.png'));
    assert.equal(png[25], 6); // RGBA
  }
  assert.deepEqual(grimm.powers[1][5], { costs: [6, 6, 6, 5], sacrifice: 24, heal: [16, 20, 24, 28] });
});

test('Crimson Trail strength and countdown duration follow mastery, with a cap', () => {
  const { duration, bonus, cap } = grimm.powers[0][5];
  assert.deepEqual(duration, [3, 3, 4, 4]);
  assert.deepEqual(bonus.map((value, i) => matchMultiplier({ bonus: value, cap: cap[i] }, 10)), [1.2, 1.3, 1.3, 1.4]);
  assert.deepEqual(bonus.map((value, i) => matchMultiplier({ bonus: value, cap: cap[i] }, 30)), [1.3, 1.45, 1.45, 1.6]);
  assert.equal(matchMultiplier(null, 30), 1);
});

test('Bleed Out follows a linked owner or the current front for a team tile', () => {
  const { damage, conversions } = grimm.powers[2][5];
  assert.deepEqual(damage, [4, 6, 8, 10]);
  assert.deepEqual(conversions, [1, 1, 2, 2]);
  assert.equal(bleedTarget({ linkedEnemy: 1 }, () => true, 0), 1);
  assert.equal(bleedTarget({ linkedEnemy: 1 }, () => false, 0), undefined);
  assert.equal(bleedTarget({ linkedEnemy: null }, () => true, 0), 0);
  assert.equal(bleedTarget({ linkedEnemy: null }, () => true, 2), 2);
  assert.equal(bleedTarget({ linkedEnemy: 1, independent: true }, () => true, 2), 2);
});

test('Woven Life distributes only the reduced total over living recipients', () => {
  const { duration, reduction } = hester.powers[0][5];
  assert.deepEqual(duration, [3, 3, 4, 4]);
  for (const [rank, expected] of [17, 16, 15, 14].entries()) {
    const shares = splitDamage(20, reduction[rank], [2, 0, 1]);
    assert.deepEqual(shares.map(share => share.index), [2, 0, 1]);
    assert.equal(shares.reduce((sum, share) => sum + share.damage, 0), expected);
    assert.ok(shares[0].damage - shares[2].damage <= 1);
  }
  assert.deepEqual(splitDamage(1, 30, [2, 0]), [{ index: 2, damage: 1 }, { index: 0, damage: 0 }]);
});

test('Leafspeech obeys range and cap while honoring locks and fortification', () => {
  const { range, percent, cap } = hester.powers[1][5];
  const tiles = Array.from({ length: 8 }, (_, r) => ({ r, c: 1, v: 2 }));
  for (const [rank, expected] of [2, 3, 4, 6].entries()) {
    const chosen = leafspeechSelection(tiles, tiles[7], range[rank], percent[rank], cap[rank], () => 0);
    assert.equal(chosen.length, expected);
    assert.ok(chosen.every(tile => tile.r >= 7 - range[rank] && tile.r < 7));
  }
  const special = { r: 5, c: 1, v: 4, locked: true, effectFortified: true, special: 'attack', specialOwner: 'enemy', specialStrength: 2, linkedEnemy: 0 };
  const ally = { r: 5, c: 1, v: 2, special: 'attack', specialOwner: 'player' };
  assert.deepEqual(leafspeechSelection([special, ally], tiles[7], 4, 50, 2, () => 0), [special]);
  convertLeafspeech(special);
  assert.equal(special.locked, true);
  assert.equal(special.effectFortified, true);
  assert.equal(special.special, null);
  assert.equal(special.linkedEnemy, null);
  const bleeding = { ...special, special: 'attack', specialOwner: 'enemy', bleedOut: {} };
  convertLeafspeech(bleeding);
  assert.equal(bleeding.locked, false);
  assert.equal(bleeding.bleedOut, undefined);
});

test('Withering Blight uses the actual floored reduction and preserves other energy', () => {
  const { percent, damage } = hester.powers[2][5];
  const pool = [13, 12, 13, 0, 0, 0, 1];
  for (const [rank, expected] of [3, 5, 6, 7].entries()) {
    assert.deepEqual(blight(pool, percent[rank], damage[rank], () => 0.99), {
      color: 2, destroyed: expected, damage: expected * damage[rank],
    });
    assert.equal(blight(pool, percent[rank], damage[rank], () => 0).color, 0);
  }
  assert.deepEqual(pool, [13, 12, 13, 0, 0, 0, 1]);
  assert.equal(blight([1], 60, 3), null);
});

test('all four randomized pull branches include both recruits and retain their unlock gates', () => {
  const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
  const original = [read('expand-two-star-hero-pool.sql'), read('expand-encounter-two-star-pool.sql')];
  const migration = read('grimm-hester-two-star-pools.sql');
  const existing = original.flatMap(sql => [...sql.matchAll(/CREATE OR REPLACE FUNCTION[^]*?end \$function\$;?/gi)].map(match => match[0]));
  const replacements = [...migration.matchAll(/CREATE OR REPLACE FUNCTION[^]*?end \$function\$;/gi)].map(match => match[0]);
  assert.equal(existing.length, 3);
  assert.deepEqual(replacements, existing.map(sql => sql.replaceAll('random()*18', 'random()*20').replace(/;?$/, ';')));
  const widths = [...migration.matchAll(/6\s*\+\s*floor\(random\(\)\*(\d+)\)/g)].map(match => Number(match[1]));
  assert.deepEqual(widths, [20, 20, 20, 20]);
});

test('Bleed Out accepts hostile effects including locked and fortified tiles', () => {
  const { eligibleBleedOut } = require('./grimm-hester.js');
  for (const special of ['attack', 'defense', 'strike', 'energy', 'energy5', 'wild', 'watcher']) {
    assert.equal(eligibleBleedOut({ special, specialOwner: 'enemy', locked: true, effectFortified: true }), true);
  }
  for (const tile of [{ trap: 3, trapOwner: 0 }, { trap: 1, trapOwner: 2 }, { trap: 2 }, { rat: true }]) {
    assert.equal(eligibleBleedOut(tile), true);
  }
  for (const tile of [null, { v: 0 }, { v: 5 }, { trap: 0 }, { trap: 3, trapOwner: 'player' },
    { hiddenTrap: { owner: 'player' }, trap: 3 }, { friendlyRat: {}, rat: true },
    { special: 'attack', specialOwner: 'player' }]) {
    assert.equal(eligibleBleedOut(tile), false);
  }
  for (const objective of ['hay', 'lore', 'towerBrazier', 'groveRoot', 'groveVillager',
    'grovePetrified', 'sluiceGear', 'sluiceWaterlock', 'lumberFire', 'smoke', 'supply']) {
    assert.equal(eligibleBleedOut({ [objective]: true, trap: 3, trapOwner: 0 }), false, objective);
  }
});

test('Bleed Out clears only its own lock after restore or Leafspeech', () => {
  const { clearBleedOut, eligibleBleedOut } = require('./grimm-hester.js');
  for (const introducedLock of [true, false, undefined]) {
    const state = JSON.parse(JSON.stringify({
      trap: 3, trapOwner: 0, bleedOut: { owner: 0, introducedLock }, locked: true, effectFortified: true,
    }));
    assert.equal(eligibleBleedOut(state), true);
    state.trap = 0;
    assert.equal(eligibleBleedOut(state), false);
    clearBleedOut(state);
    assert.equal(state.locked, introducedLock === false);
    assert.equal(state.effectFortified, true);
    assert.equal(state.bleedOut, undefined);
  }
  const lockedSpecial = { special: 'attack', specialOwner: 'enemy', locked: true,
    effectFortified: true, bleedOut: { introducedLock: false } };
  convertLeafspeech(lockedSpecial);
  assert.equal(lockedSpecial.locked, true);
  assert.equal(lockedSpecial.effectFortified, true);
  assert.equal(lockedSpecial.bleedOut, undefined);
});

test('Leafspeech excludes the anchor, lower rows, other columns and out-of-range rows', () => {
  const origin = { r: 4, c: 3, v: 2 };
  const above = { r: 2, c: 3, v: 2 };
  const tiles = [origin, above, { r: 1, c: 3, v: 2 }, { r: 5, c: 3, v: 2 }, { r: 3, c: 4, v: 2 }];
  assert.deepEqual(leafspeechCandidates(tiles, origin, 2), [above]);
  assert.deepEqual(leafspeechCandidates(tiles, { r: 0, c: 3 }, 7), []);
});

test('enemy Leafspeech targets player specials and preserves monster specials',()=>{
 const {leafspeechSelection,convertLeafspeech}=require('./grimm-hester.js');
 const anchor={r:4,c:0,v:2};
 const hero={r:3,c:0,v:4,special:'attack',specialOwner:'player',specialStrength:3};
 const monster={r:2,c:0,v:2,special:'defense',specialOwner:'enemy',specialStrength:3};
 assert.deepEqual(leafspeechSelection([hero,monster],anchor,4,50,2,()=>0,'player'),[hero]);
 convertLeafspeech(hero,'player');
 assert.equal(hero.special,null);
 assert.equal(hero.v,4);
 assert.equal(monster.special,'defense');
});
