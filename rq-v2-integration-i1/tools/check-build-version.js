const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Match the rendered labels, excluding titles, comments and script strings.
const markers = [
  ['index.html', /<h1\b[^>]*>[^<]*<small\b[^>]*\bid="appVersion"[^>]*>\s*(I\d+(?:\.\d+)+)\s*<\/small>/g],
  ['combat49.html', /<div\b[^>]*\bid="rqVisibleBuild"[^>]*>\s*RQV2\s+(I\d+(?:\.\d+)+)\s*<\/div>/g],
  ['two-star-sandbox.html', /<h1\b[^>]*>[^<]*<small\b[^>]*>\s*(I\d+(?:\.\d+)+)\s*<\/small>/g],
  ['character-manager.html', /<h1\b[^>]*>[^<]*<small\b[^>]*>\s*(I\d+(?:\.\d+)+)\s*<\/small>/g],
  ['cloud-collection.html', /<h1\b[^>]*>[^<]*<small\b[^>]*>\s*(I\d+(?:\.\d+)+)\s*<\/small>/g],
];

const versions = new Map();
for (const [file, marker] of markers) {
  const html = readFileSync(join(__dirname, '..', file), 'utf8')
    .replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const matches = [...html.matchAll(marker)];
  if (matches.length !== 1) {
    console.error(`${file}: expected one displayed build marker, found ${matches.length}`);
    process.exitCode = 1;
    continue;
  }
  versions.set(file, matches[0][1]);
}

const expected = versions.get('index.html');
for (const [file, version] of versions) {
  if (expected && version !== expected) {
    console.error(`${file}: displays ${version}; index.html displays ${expected}`);
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`All ${versions.size} build markers match ${expected}`);
}
