'use strict';

const { readFileSync, realpathSync, statSync } = require('node:fs');
const { join, relative, isAbsolute, sep } = require('node:path');
const { loadRegistry, resolveLegacyPower } = require('../content/registry.js');

const project = join(__dirname, '..');
const content = join(project, 'content');

function fileWithin(root, path) {
  const file = realpathSync(join(root, path));
  const location = relative(realpathSync(root), file);
  if (!location || location === '..' || location.startsWith('..' + sep) ||
      isAbsolute(location) || !statSync(file).isFile()) {
    throw new Error(`${path}: expected a file inside ${root}`);
  }
  return file;
}

function readJson(root, path) {
  try {
    return JSON.parse(readFileSync(fileWithin(root, path), 'utf8'));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
}

function loadApprovedSprites() {
  const roster = readJson(project, 'assets/sprites/roster-manifest.json');
  const approvedSprites = new Set();
  for (const sprite of roster.characters) {
    const identity = resolveLegacyPower(sprite.id, 0);
    if (sprite.status !== 'approved-idle' || !identity) continue;
    if (!/^assets\/sprites\/clean\/[a-z0-9_-]+\.png$/.test(sprite.asset)) {
      throw new Error(`Invalid approved sprite path for ${identity.characterId}`);
    }
    fileWithin(join(project, 'assets/sprites'), sprite.asset.replace(/^assets\/sprites\//, ''));
    approvedSprites.add(identity.characterId);
  }

  return approvedSprites;
}

if (require.main === module) {
  try {
    const approvedSprites = loadApprovedSprites();
    const registry = readJson(content, 'registry.json');
    const records = loadRegistry(registry, path => readJson(content, path), approvedSprites);
    console.log(`Validated ${records.size} content records (schema v${registry.schemaVersion})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { content, readJson, loadApprovedSprites };
