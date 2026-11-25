const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { checkBuildVersion } = require('./check-build-version');

const sandboxMarker = '<h1>Two-Star Combat Sandbox <small>I1.16.264</small></h1>';
const pages = {
  'index.html': '<h1>Task Manager <small id="appVersion">I1.16.264</small></h1>',
  'combat49.html': '<div id="rqVisibleBuild">RQV2 I1.16.264</div>',
  'two-star-sandbox.html': sandboxMarker,
  'character-manager.html': '<h1>Assemble Your Heroes <small>I1.16.264</small></h1>',
  'cloud-collection.html': '<h1>Cloud Collection <small>I1.16.264</small></h1>',
};

function runChecker(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rqv2-build-markers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const [file, html] of Object.entries({ ...pages, ...overrides })) {
    writeFileSync(join(root, file), html);
  }

  return checkBuildVersion(root);
}

test('accepts one matching displayed marker on each page', (t) => {
  const result = runChecker(t);
  assert.deepEqual(result, { errors: [], version: 'I1.16.264', count: 5 });
});

test('rejects a page with a marker only in non-rendered content', (t) => {
  const result = runChecker(t, {
    'two-star-sandbox.html': `
      <title>Two-Star Combat Sandbox I1.16.264</title>
      <!-- ${sandboxMarker} -->
      <script>const example = '${sandboxMarker}';</script>
      <h1>Two-Star Combat Sandbox</h1>
    `,
  });
  assert.deepEqual(result.errors, ['two-star-sandbox.html: expected one displayed build marker, found 0']);
});

test('rejects duplicate displayed markers even if their versions match', (t) => {
  const result = runChecker(t, { 'two-star-sandbox.html': `${sandboxMarker}\n${sandboxMarker}` });
  assert.deepEqual(result.errors, ['two-star-sandbox.html: expected one displayed build marker, found 2']);
});

test('rejects a displayed version that differs from index.html', (t) => {
  const result = runChecker(t, { 'two-star-sandbox.html': sandboxMarker.replace('I1.16.264', 'I1.16.263') });
  assert.deepEqual(result.errors, ['two-star-sandbox.html: displays I1.16.263; index.html displays I1.16.264']);
});
