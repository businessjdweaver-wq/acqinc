'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { checkRelease } = require('./check-build-version.js');

test('release checker accepts a manifest-only bump and rejects bad page markers', () => {
  const project = join(__dirname, '..');
  const read = file => readFileSync(join(project, file), 'utf8');
  const run = (overrides = {}) => checkRelease(
    file => overrides[file] ?? read(file),
    file => existsSync(join(project, file))
  );
  assert.deepEqual(run().errors, []);
  const manifest = 'release.js';
  const bumped = run({
    [manifest]: read(manifest).replace(/const version = '[^']+'/,
      "const version = 'I1.99.999'")
  });
  assert.deepEqual(bumped, { version: 'I1.99.999', errors: [] });

  const page = 'two-star-sandbox.html';
  const source = read(page);
  for (const [bad, message] of [
    [source.replace(' data-rq-build', ''), /expected one visible release marker/],
    [source.replace('</h1>', '<small data-rq-build>Loading build…</small></h1>'),
      /expected one visible release marker/],
    [source.replace('Loading build…', 'I1.16.283'), /expected one visible release marker/],
    [source.replace('</h1>', '</h1><a href="combat49.html?build=I1.16.283">Combat</a>'),
      /hardcoded cache version/],
  ]) {
    const check = run({ [page]: bad });
    assert.match(check.errors.join('\n'), message);
  }
});
