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

function object(value, fields, location, optional = []) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), location, 'expected an object');
  for (const field of fields) {
    requireValue(Object.hasOwn(value, field), location, `missing field "${field}"`);
  }
  for (const field of Object.keys(value)) {
    requireValue((fields.includes(field) || optional.includes(field)), location, `unknown field "${field}"`);
  }
}

function oneOf(value, choices, location) {
  requireValue(choices.includes(value), location, `expected one of ${choices.join(', ')}`);
}

const creatureSizeScales = Object.freeze({ tiny: .35, small: .70, medium: 1, large: 1.35, huge: 1.65, gargantuan: 1.95 });
function validateCreatureSize(record, location) {
  if (Object.hasOwn(record, 'creatureSize')) oneOf(record.creatureSize, Object.keys(creatureSizeScales), location + '.creatureSize');
  if (Object.hasOwn(record, 'visualScale')) requireValue(Number.isFinite(record.visualScale) && record.visualScale >= .5 && record.visualScale <= 2, location + '.visualScale', 'expected a finite number from 0.5 to 2');
}
function creatureSizeMetadata(record = {}) {
  validateCreatureSize(record, 'creature');
  return { creatureSize: record.creatureSize ?? 'medium', visualScale: record.visualScale ?? 1 };
}
function creatureSizeMultiplier(record) {
  const { creatureSize, visualScale } = creatureSizeMetadata(record);
  return creatureSizeScales[creatureSize] * visualScale;
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
    'spriteId', 'baseHp', 'progression', 'visibility', 'recruitment', 'powers'], location, ['creatureSize', 'visualScale']);
  validateCreatureSize(record, location);
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

function approvedSpritePaths(roster, ids = legacyIds) {
  const sprites = new Map();
  for (const sprite of roster.characters) {
    if (sprite.status !== 'approved-idle' || !ids[sprite.id]) continue;
    requireValue(/^assets\/sprites\/clean\/[a-z0-9_-]+\.png$/.test(sprite.asset),
      sprite.name, 'invalid approved character sprite path');
    sprites.set(ids[sprite.id], sprite.asset);
  }
  for (const sprite of roster.enemies) {
    if (sprite.status === 'approved-idle') {
      requireValue(typeof sprite.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sprite.id),
        sprite.name, 'invalid approved monster sprite ID');
      requireValue(/^assets\/sprites\/clean\/[a-z0-9_]+\.png$/.test(sprite.asset),
        sprite.name, 'invalid approved monster sprite path');
      requireValue(!sprites.has(sprite.id), sprite.name, 'duplicate approved sprite ID');
      sprites.set(sprite.id, sprite.asset);
      continue;
    }
    if (sprite.status !== 'existing-idle') continue;
    requireValue(/^merchant-[a-z0-9-]+\.png$/.test(sprite.asset),
      sprite.name, 'invalid approved enemy sprite path');
    sprites.set(sprite.asset.slice(0, -4), 'assets/sprites/' + sprite.asset);
  }
  return sprites;
}

function validateEnemyParty(record, location, approvedSprites) {
  object(record, ['schemaVersion', 'kind', 'id', 'name', 'ai', 'combatants'], location);
  oneOf(record.ai, ['merchant', 'monster'], `${location}.ai`);
  list(record.combatants, 1, 3, `${location}.combatants`);
  const combatantIds = new Set();
  for (const [index, enemy] of record.combatants.entries()) {
    const path = `${location}.combatants[${index}]`;
    object(enemy, ['id', 'name', 'spriteId', 'hp', 'rank', record.ai === 'monster' && Object.hasOwn(enemy,'powers') ? 'powers' : 'power'], path, ['creatureSize', 'visualScale']);
    validateCreatureSize(enemy, path);
    id(enemy.id, `${path}.id`);
    requireValue(!combatantIds.has(enemy.id), `${path}.id`, 'duplicate combatant ID');
    combatantIds.add(enemy.id);
    displayText(enemy.name, `${path}.name`);
    id(enemy.spriteId, `${path}.spriteId`);
    requireValue(approvedSprites.has(enemy.spriteId) && (record.ai === 'merchant'
      ? enemy.spriteId.startsWith('merchant-')
      : /^assets\/sprites\/clean\/[a-z0-9]+_[a-z0-9_]+\.png$/.test(approvedSprites.get(enemy.spriteId))),
      `${path}.spriteId`, 'unknown approved enemy sprite');
    integer(enemy.hp, 1, 10000, `${path}.hp`);
    oneOf(enemy.rank, [index + 1], `${path}.rank`);
    const powerPath = `${path}.power`;
    if (record.ai === 'monster') {
      const powers = enemy.powers || [enemy.power];
      list(powers, enemy.powers ? 3 : 1, enemy.powers ? 3 : 1, powerPath);
      const names = new Set();
      for (const [slot,p] of powers.entries()) {
      const powerPath = path + (enemy.powers ? '.powers[' + slot + ']' : '.power');
      requireValue(p && typeof p === 'object', powerPath, 'expected power');
      displayText(p.name, powerPath + '.name');
      requireValue(!names.has(p.name), powerPath + '.name', 'duplicate power name'); names.add(p.name);
      integer(p.color, 0, 6, powerPath + '.color');
      const passive = ['knockout-intercept','fleet-foot','rage-engine','uncanny-dodge'].includes(p.effect);
      integer(p.cost, passive ? 0 : 1, passive ? 0 : 20, powerPath + '.cost');
      if(Object.hasOwn(p,'levels')){
        list(p.levels, 3, 3, powerPath+'.levels');
        for(const [i,override] of p.levels.entries()){
          requireValue(override && typeof override==='object' && !Array.isArray(override),powerPath+'.levels['+i+']','expected power override');
          requireValue(Object.keys(override).every(k=>!['name','color','effect','levels'].includes(k)&&Object.hasOwn(p,k)),powerPath+'.levels['+i+']','override must preserve power identity and existing fields');
          const {levels,...base}=p;
          const resolved={...base,...override};
          if(base.effects)requireValue(Array.isArray(resolved.effects)&&resolved.effects.length===base.effects.length&&resolved.effects.every((e,j)=>e?.effect===base.effects[j].effect),powerPath+'.levels['+i+']','composite effect identity must remain unchanged');
          const single={...record,combatants:record.combatants.map((c,j)=>j===index?{...c,...(enemy.powers?{powers:enemy.powers.map((q,k)=>k===slot?resolved:(({levels,...rest})=>rest)(q))}:{power:resolved})}:({...c,...(c.powers?{powers:c.powers.map(({levels,...rest})=>rest)}:{power:(({levels,...rest})=>rest)(c.power)})}))};
          validateEnemyParty(single,location,approvedSprites);
        }
      }
      const composite = Object.hasOwn(p,'effects');
      if(composite){
        object(p,['name','color','cost','effects'],powerPath,['levels']);
        requireValue(Array.isArray(p.effects)&&p.effects.length>=1&&p.effects.length<=4,powerPath+'.effects','expected one to four effects');
      }
      for(const [effectIndex,effect] of (composite?p.effects:[p]).entries()){
      const powerPathEffect=composite?powerPath+'.effects['+effectIndex+']':powerPath;
      requireValue(effect&&typeof effect==='object',powerPathEffect,'expected effect');
      const metadata=composite?[]:['name','color','cost'];
      const optional=composite?['optional']:['levels'];
      if(composite&&Object.hasOwn(effect,'optional'))requireValue(typeof effect.optional==='boolean',powerPathEffect+'.optional','expected boolean');
      if(Object.hasOwn(advancedMonsterEffects,effect.effect)){
        validateAdvancedMonsterEffect(effect,powerPathEffect,metadata,optional);
        continue;
      }
      if(effect.effect==='damage')optional.push('scaling');
      oneOf(effect.effect, ['damage', 'heal', 'siphon', 'drain-resource', 'create-special', 'amplify-special', 'steal-resource', 'convert-tile', 'capture-special', 'consume-special', 'heal-all', 'ward', 'evasion', 'countdown', 'lock-tile', 'intercept', 'retaliate', 'damage-all', 'counterspell', 'recurring', 'delayed'], powerPathEffect + '.effect');
      const timed = ['recurring','delayed'].includes(effect.effect);
      const resourcePayload = ['drain-resource','steal-resource'].includes(effect.payload);
      if(timed){
        oneOf(effect.payload, ['damage','heal','drain-resource','steal-resource',...(effect.effect==='delayed'?['hero-stun']:[])], powerPathEffect+'.payload');
        oneOf(effect.targetPolicy, ['fixed','reassess'], powerPathEffect+'.targetPolicy');
        if(Object.hasOwn(effect,'surviveOwner')) requireValue(typeof effect.surviveOwner==='boolean',powerPathEffect+'.surviveOwner','expected boolean');
      }
      object(effect, [...(composite ? [] : ['name','color','cost']), 'effect', 'amount',
        ...(timed ? ['payload','duration','targetPolicy',...(resourcePayload?['targetColor']:[])] : []),
        ...(['ward','evasion','countdown','lock-tile','intercept','retaliate','counterspell'].includes(effect.effect) ? ['duration'] : []),
        ...(effect.effect === 'siphon' ? ['heal'] : ['drain-resource','steal-resource','convert-tile'].includes(effect.effect) ? ['targetColor'] : effect.effect === 'create-special' ? ['special'] : [])], powerPathEffect, [...(timed?['surviveOwner']:[]),...optional]);
      integer(effect.amount, 1, effect.payload==='hero-stun' ? 8 : ['ward','intercept'].includes(effect.effect) ? 85 : 100, powerPathEffect + '.amount');
      if(effect.scaling!==undefined)validateMonsterScaling(effect.scaling,powerPathEffect+'.scaling',effect.amount);
      if (timed || ['ward','evasion','countdown','lock-tile','intercept','retaliate','counterspell'].includes(effect.effect)) integer(effect.duration, 1, 8, powerPathEffect + '.duration');
      if (effect.effect === 'siphon') integer(effect.heal, 1, 100, powerPathEffect + '.heal');
      if (resourcePayload || ['drain-resource','steal-resource','convert-tile'].includes(effect.effect)) integer(effect.targetColor, 0, 6, powerPathEffect + '.targetColor');
      if (effect.effect === 'create-special') oneOf(effect.special, ['attack', 'defense', 'energy'], powerPathEffect + '.special');
      }
      }
      continue;
    }
    if (index === 0) {
      object(enemy.power, ['effect', 'target', 'interval', 'countdown'], powerPath);
      oneOf(enemy.power.effect, ['merchant-fee'], `${powerPath}.effect`);
      oneOf(enemy.power.target, ['eligible-tile'], `${powerPath}.target`);
      integer(enemy.power.interval, 1, 8, `${powerPath}.interval`);
      object(enemy.power.countdown, ['min', 'max'], `${powerPath}.countdown`);
      integer(enemy.power.countdown.min, 1, 8, `${powerPath}.countdown.min`);
      integer(enemy.power.countdown.max, enemy.power.countdown.min, 8, `${powerPath}.countdown.max`);
    } else {
      object(enemy.power, ['effect', 'target', 'color', 'cost'], powerPath);
      oneOf(enemy.power.effect, [index === 1 ? 'stamina-drain' : 'progress-drain'], `${powerPath}.effect`);
      oneOf(enemy.power.target, ['party-front'], `${powerPath}.target`);
      oneOf(enemy.power.color, [index === 1 ? 'red' : 'purple'], `${powerPath}.color`);
      integer(enemy.power.cost, 1, 20, `${powerPath}.cost`);
    }
  }
}

const advancedMonsterEffects = {
  'merrix-surge': {},
  'merrix-bend': {},
  'merrix-overchannel': {},
  'grimm-trail': {duration:[1,8],bonus:[1,20],cap:[1,100]},
  'grimm-extraction': {sacrifice:[1,100],heal:[1,100]},
  'grimm-bleed': {damage:[1,100],conversions:[1,8]},
  'corvin-traps': {count:[1,8],duration:[1,8],damage:[1,100]},
  'corvin-vanish': {duration:[1,8],evasion:[1,100]},
  'corvin-echo': {delay:[1,8],stun:[1,8]},
  'iris-rewrite': {rounds:[1,4]},
  'iris-lengthen': {ticks:[1,4]},
  'iris-stop-time': {duration:[1,8]},
  'astral-arms': {swaps:[1,2]},
  'astral-flurry': {damagePerMatch:[1,10]},
  'astral-stillness': {reduction:[1,85],swaps:[1,2]},
  'unstoppable-charge': {amount:[1,100],span:[2,8]},
  'immovable-object': {amount:[1,85],duration:[1,8]},
  'rage-engine': {threshold:[1,100],amount:[1,100]},
  'false-flag': {amount:[1,100]},
  'uncanny-dodge': {baseReduction:[1,85],perAttackTile:[1,20],reductionCap:[1,85]},
  'feed-the-chaos': {baseDamage:[1,100],perSpecialStrength:[1,20]},
  constellation: {shape:['dragon','chalice','archer'],amount:[1,100]},
  'mycelial-network': {amount:[1,100],cap:[1,8]},
  'spore-slumber': {duration:[1,8]},
  'spore-bloom': {},
  'patron-bargain': {benefit:[2,20]},
  'patron-hellfire': {amount:[1,100],bonus:[1,20]},
  'ranked-strike': {rankTwo:[1,100],rankThree:[1,100]},
  'knockout-intercept': {reduction:[1,85]},
  'shove-strike': {amount:[1,100]},
  'radiant-strike': {amount:[1,100]},
  'refill-aura': {duration:[1,8],chance:[1,100]},
  'watcher-tile': {},
  'twilight-sanctuary': {count:[1,8],strength:[1,100]},
  'twilight-absolution': {},
  'ivory-mirage': {},
  turncoat: {},
  'prismatic-veil': {amount:[1,100]},
  'marsh-guide': {distance:[1,8]},
  chowmp: {amount:[1,100],count:[1,8],bonusPercent:[1,100]},
  'energy-thief': {amount:[1,20]},
  'psychic-blade': {amount:[1,100],feedbackChance:[0,100]},
  'fleet-foot': {threshold:[1,99]},
  'amplify-board-special': {amount:[1,100]},
  'salvage-special': {baseDamage:[1,100],damagePerStrength:[1,10]},
  'woven-life': {duration:[1,8],reduction:[1,85]},
  leafspeech: {range:[1,7],percent:[1,100],cap:[1,7]},
  'withering-blight': {percent:[1,100],damagePerPoint:[1,10]},
  'tile-pattern': {operation:['convert','destroy','propagate'],pattern:['random','row','column','cross','cluster'],count:[1,16],eligibility:['ordinary','hero-special','enemy-special']},
  'hero-stun': {duration:[1,8]},
  cleanse: {team:['hero','monster']},
  suppression: {duration:[1,8],amount:[1,100]},
  formation: {operation:['forward','backward','exchange','rank'],rank:[1,3]},
  exchange: {source:['caster-hp','enemy-energy','hero-energy','enemy-special'],destination:['caster-hp','enemy-energy','hero-energy'],amount:[1,100],benefit:[1,100],sourceColor:[0,6],targetColor:[0,6]},
  temporal: {operation:['advance','extend','resolve'],target:['countdown','delayed','recurring'],owner:['caster','enemy-team'],amount:[1,8]},
  'repeated-strikes': {count:[2,8],amount:[1,100],targetPolicy:['fixed','reassess']}
};

function validateAdvancedMonsterEffect(effect, path, metadata, optional) {
  const schema=advancedMonsterEffects[effect.effect];
  const fields={...schema};
  if(effect.effect==='tile-pattern'){
    if(effect.operation==='convert')optional.push('targetColor');
    if(effect.operation==='propagate')requireValue(effect.eligibility==='ordinary',path+'.eligibility','propagation needs ordinary destination tiles');
    optional.push('filterColor','cascade');
  }
  if(effect.effect==='repeated-strikes')optional.push('retarget','scaling');
  if(effect.effect==='formation'&&!['exchange','rank'].includes(effect.operation))delete fields.rank;
  if(effect.effect==='exchange'){
    if(effect.source===effect.destination){
      requireValue(['hero-energy','enemy-energy'].includes(effect.source)&&effect.sourceColor!==effect.targetColor,
        path+'.destination','exchange requires different resources or energy colors');
      requireValue(effect.benefit<=effect.amount,path+'.benefit','within-team energy conversion cannot increase the total pool');
    }
    if(!effect.source?.endsWith?.('-energy'))delete fields.sourceColor;
    if(!effect.destination?.endsWith?.('-energy'))delete fields.targetColor;
    if(effect.source==='enemy-special')requireValue(effect.amount<=16,path+'.amount','special tile sacrifice maximum is 16');
  }
  object(effect,[...metadata,'effect',...Object.keys(fields)],path,optional);
  for(const [key,range] of Object.entries(fields)){
    if(typeof range[0]==='number')integer(effect[key],...range,path+'.'+key);
    else oneOf(effect[key],range,path+'.'+key);
  }
  for(const key of ['cascade','retarget'])if(Object.hasOwn(effect,key))requireValue(typeof effect[key]==='boolean',path+'.'+key,'expected boolean');
  for(const key of ['targetColor','filterColor'])if(optional.includes(key)&&Object.hasOwn(effect,key))integer(effect[key],0,6,path+'.'+key);
  if(effect.scaling!==undefined)validateMonsterScaling(effect.scaling,path+'.scaling',effect.amount);
}

function validateMonsterScaling(scaling,path,base){
  object(scaling,['metric','multiplier','cap'],path);
  oneOf(scaling.metric,['hero-energy','enemy-energy','strongest-hero-energy','enemy-specials','hero-specials','caster-missing-hp','target-missing-hp'],path+'.metric');
  integer(scaling.multiplier,1,10,path+'.multiplier');
  integer(scaling.cap,base,100,path+'.cap');
}

function validateEncounter(record, location) {
  oneOf(record.mode, ['combat', 'puzzle'], `${location}.mode`);
  const combat = record.mode === 'combat';
  object(record, ['schemaVersion', 'kind', 'id', 'name', 'mode', 'handler', 'board',
    'intro', 'win', 'loss', 'objective', 'rewardPolicy',
    ...(combat ? ['enemyPartyId'] : ['turnLimit'])], location, combat ? ['monsterPowerLevel'] : []);
  if (combat && Object.hasOwn(record, 'monsterPowerLevel')) integer(record.monsterPowerLevel, 1, 4, `${location}.monsterPowerLevel`);
  oneOf(record.handler, [combat ? 'merchant' : 'harvest'], `${location}.handler`);
  for (const field of ['intro', 'win', 'loss']) displayText(record[field], `${location}.${field}`);
  object(record.board, ['layout', 'seed'], `${location}.board`);
  oneOf(record.board.layout, ['standard-8x8'], `${location}.board.layout`);
  integer(record.board.seed, 0, 4294967295, `${location}.board.seed`);
  if (combat) {
    id(record.enemyPartyId, `${location}.enemyPartyId`);
    object(record.objective, ['type'], `${location}.objective`);
    oneOf(record.objective.type, ['defeat-party'], `${location}.objective.type`);
  } else {
    object(record.objective, ['type', 'count'], `${location}.objective`);
    oneOf(record.objective.type, ['collect-hay'], `${location}.objective.type`);
    integer(record.objective.count, 1, 20, `${location}.objective.count`);
    integer(record.turnLimit, 1, 60, `${location}.turnLimit`);
  }
  oneOf(record.rewardPolicy, ['sandbox-only'], `${location}.rewardPolicy`);
}

function validateMagicItem(record, location) {
  object(record, ['schemaVersion', 'kind', 'id', 'name', 'form', 'itemType',
    'effect', 'trigger', 'charges', 'acquisition', 'eligibility', 'consumption',
    'duration', 'stacking', 'equip'], location);
  oneOf(record.form, ['potion'], `${location}.form`);
  oneOf(record.itemType, ['consumable'], `${location}.itemType`);
  oneOf(record.effect, ['restorative-elixir'], `${location}.effect`);
  oneOf(record.trigger, ['manual'], `${location}.trigger`);
  oneOf(record.charges, [1], `${location}.charges`);
  oneOf(record.acquisition, ['sandbox-only'], `${location}.acquisition`);
  object(record.eligibility, ['target', 'minLevel'], `${location}.eligibility`);
  oneOf(record.eligibility.target, ['injured-living-party'], `${location}.eligibility.target`);
  oneOf(record.eligibility.minLevel, [1], `${location}.eligibility.minLevel`);
  oneOf(record.consumption, ['on-activation'], `${location}.consumption`);
  oneOf(record.duration, ['instant'], `${location}.duration`);
  oneOf(record.stacking, ['none'], `${location}.stacking`);
  oneOf(record.equip, ['support-slot'], `${location}.equip`);
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
    if (record.kind === 'encounter' && record.mode === 'combat') {
      requireValue(records.get(record.enemyPartyId)?.kind === 'enemy-party',
        `${record.id}.enemyPartyId`, 'unknown enemy party');
    }
  }
  return records;
}

return { loadRegistry, planRegistry, resolveLegacyPower, approvedSpritePaths, directories, creatureSizeScales, creatureSizeMetadata, creatureSizeMultiplier };
});
