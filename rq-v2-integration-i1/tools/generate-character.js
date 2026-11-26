'use strict';

const { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, lstatSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { loadRegistry, planRegistry } = require('../content/registry.js');
const { content, readJson, loadApprovedSprites } = require('./validate-content.js');

const json = value => JSON.stringify(value, null, 2) + '\n';

function planCharacter(record, registry, readRecord, approvedSprites, replace = false) {
  if (record?.kind !== 'character') throw new Error('Expected a character definition');
  const existing = registry.entries.find(entry => entry.id === record.id);
  if (existing && (!replace || existing.kind !== 'character')) {
    throw new Error('ID already exists. Review the diff and use --replace for an approved character replacement.');
  }
  const entry = { id: record.id, kind: 'character', path: `characters/${record.id}.json` };
  const next = { ...registry, entries: registry.entries.filter(item => item !== existing).concat(entry) };
  next.entries = planRegistry(next);
  loadRegistry(next, path => path === entry.path ? record : readRecord(path), approvedSprites);
  return { entry, next, existing };
}

function preview(path, before, after) {
  console.log('--- ' + (before ? path : '/dev/null'));
  console.log('+++ ' + path);
  const oldLines = before ? before.trimEnd().split('\n') : [];
  const newLines = after.trimEnd().split('\n');
  console.log(`@@ -${oldLines.length ? 1 : 0},${oldLines.length} +1,${newLines.length} @@`);
  for (const line of oldLines) console.log('-' + line);
  for (const line of newLines) console.log('+' + line);
}

function replaceFile(path, value) {
  const temporaryPath = path + '.' + randomUUID();
  writeFileSync(temporaryPath, value, { flag: 'wx' });
  try {
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function main([input, ...flags]) {
  if (!input || flags.some(flag => !['--write', '--replace'].includes(flag))) {
    throw new Error('Usage: node tools/generate-character.js input.json [--write] [--replace]');
  }
  const record = JSON.parse(readFileSync(input, 'utf8'));
  const registry = readJson(content, 'registry.json');
  const { entry, next, existing } = planCharacter(record, registry,
    path => readJson(content, path), loadApprovedSprites(), flags.includes('--replace'));
  const path = join(content, entry.path);
  const parent = dirname(path);
  if (existsSync(parent) && !lstatSync(parent).isDirectory()) throw new Error('Expected a real characters directory');
  if (existsSync(path) && (!existing || !lstatSync(path).isFile())) throw new Error('Character file already exists');
  if (!flags.includes('--write')) {
    preview(entry.path, existing ? json(readJson(content, entry.path)) : '', json(record));
    if (!existing) preview('registry.json', json(registry), json(next));
    return;
  }

  mkdirSync(parent, { recursive: true });
  if (existing) {
    replaceFile(path, json(record));
  } else {
    writeFileSync(path, json(record), { flag: 'wx' });
    try {
      replaceFile(join(content, 'registry.json'), json(next));
    } catch (error) {
      unlinkSync(path);
      throw error;
    }
  }
  console.log('Wrote ' + entry.path);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { planCharacter };
