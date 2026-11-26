(function (root) {
  'use strict';

  const catalog = root.RQCharacterCatalog;
  const { planRegistry, loadRegistry, approvedSpritePaths } = root.RQContentRegistry;

  async function readJson(path) {
    const response = await fetch(root.RQRelease.url(path), { redirect: 'error' });
    if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
    return response.json();
  }

  async function load() {
    const [manifest, legacyIds, roster] = await Promise.all([
      readJson('content/registry.json'),
      readJson('content/legacy-character-ids.json'),
      readJson('assets/sprites/roster-manifest.json')
    ]);
    const paths = planRegistry(manifest, legacyIds);
    const data = new Map(await Promise.all(paths.map(async ({ path }) =>
      [path, await readJson('content/' + path)])));
    const sprites = approvedSpritePaths(roster, legacyIds);
    const records = loadRegistry(manifest, path => data.get(path), sprites, legacyIds);
    const heroes = new Map();
    const enemyParties = new Map();
    const encounters = new Map();
    for (const record of records.values()) {
      if (record.kind === 'character' && record.rarity === 2) {
        heroes.set(record.id, combatTemplate(record, sprites.get(record.spriteId)));
      }
      if (record.kind === 'encounter') encounters.set(record.id, record);
      if (record.kind === 'enemy-party') {
        enemyParties.set(record.id, {
          ...record,
          foes: record.combatants.map(enemy => ({
            name: enemy.name, max: enemy.hp, icon: '🪙',
            sandboxSprite: sprites.get(enemy.spriteId), sandboxPower: enemy.power
          }))
        });
      }
    }
    return { heroes, enemyParties, encounters };
  }

  function combatTemplate(record, spritePath) {
    return {
      name: record.name,
      icon: '🧪',
      background: record.background,
      feature: record.subclass,
      max: record.baseHp,
      level: 100,
      starTier: record.rarity,
      archetype: 6, // Existing class progression profile, never a persisted archetype.
      sandboxSprite: spritePath,
      powers: record.powers.map(power => [
        power.name, catalog.tileColorNames.indexOf(power.color), power.levels[0].cost,
        power.description, 'card-pattern',
        { costs: power.levels.map(level => level.cost), sandboxLevels: power.levels }
      ])
    };
  }

  function pattern(power, level) {
    const { effect } = power[5].sandboxLevels[level - 1];
    return {
      centerMode: 'selected', count: 1, cells: [{ x: 0, y: 0 }],
      effect: effect.type, sandboxOrdinary: true, amount: 1,
      ...(effect.type === 'transform'
        ? { color: catalog.tileColorNames.indexOf(effect.value) }
        : { special: effect.value })
    };
  }

  function describe(power, level) {
    const { effect } = power[5].sandboxLevels[level - 1];
    return effect.type === 'transform'
      ? 'Turn one selected ordinary tile ' + effect.value + '.'
      : 'Create one ' + effect.value + ' tile on a selected ordinary tile.';
  }

  function seededRandom(seed) {
    let state = seed;
    return limit => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return Math.floor(state / 4294967296 * limit);
    };
  }

  root.RQSandboxCharacters = Object.freeze({ load, pattern, describe, seededRandom });
})(window);
