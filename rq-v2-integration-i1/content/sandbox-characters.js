(function (root) {
  'use strict';

  const catalog = root.RQCharacterCatalog;
  const { planRegistry, loadRegistry } = root.RQContentRegistry;

  async function readJson(path) {
    const response = await fetch(root.RQRelease.url(path), { redirect: 'error' });
    if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status);
    return response.json();
  }

  function approvedSprites(roster, legacyIds) {
    return new Map(roster.characters.flatMap(sprite => {
      const id = legacyIds[sprite.id];
      const approved = sprite.status === 'approved-idle' &&
        /^assets\/sprites\/clean\/[a-z0-9_-]+\.png$/.test(sprite.asset);
      return id && approved ? [[id, sprite.asset]] : [];
    }));
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
    const sprites = approvedSprites(roster, legacyIds);
    const records = loadRegistry(manifest, path => data.get(path), sprites, legacyIds);
    const heroes = new Map();
    for (const record of records.values()) {
      if (record.kind === 'character' && record.rarity === 2) {
        heroes.set(record.id, combatTemplate(record, sprites.get(record.spriteId)));
      }
    }
    return heroes;
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

  root.RQSandboxCharacters = Object.freeze({ load, pattern, describe });
})(window);
