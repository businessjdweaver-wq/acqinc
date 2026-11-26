'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const pages = [
  'index', 'combat49', 'two-star-sandbox', 'character-manager', 'cloud-collection',
  'power-collection', 'tutorial', 'dailies', 'sprite-comparison', 'sprite-layout-lab',
  'card-manager', 'pattern-editor', 'power-test-lab',
];
const read = file => readFileSync(join(root, file), 'utf8');
const bootstrap = /<script data-rq-release>document\.write\('<script src="release\.js\?request='\+Date\.now\(\)\+'"><\\\/script>'\);<\/script>/g;

function checkRelease(readPage, assetExists) {
  const errors = [];
  const fail = (file, message) => errors.push(`${file}: ${message}`);
  const versions = [...readPage('release.js').matchAll(/\bconst version = '(I\d+(?:\.\d+)+)';/g)];
  if (versions.length !== 1) fail('release.js', 'expected one canonical version');

  for (const page of pages) {
    const file = page + '.html';
    const source = readPage(file).replace(/<!--[\s\S]*?-->/g, '');
    const markup = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const marker = /<(?:small|div)\b[^>]*\sdata-rq-build(?:="[^"]*")?[^>]*>Loading build…<\/(?:small|div)>/g;
    if ([...markup.matchAll(marker)].length !== 1 ||
        [...markup.matchAll(/\sdata-rq-build\b/g)].length !== 1) {
      fail(file, 'expected one visible release marker');
    }
    if ([...source.matchAll(bootstrap)].length !== 1) fail(file, 'expected one fresh release bootstrap');
    if (/[?&]build=[a-z0-9.-]+/i.test(source)) fail(file, 'hardcoded cache version');
    if (/<script\b[^>]*\bsrc="(?:\.\/)?(?:content\/)?[a-z0-9-]+\.js"/i.test(source)) {
      fail(file, 'local scripts must be loaded through the release');
    }
    for (const [, script] of source.matchAll(/RQRelease\.loadScripts\("((?:content\/)?[a-z0-9-]+\.js)"\)/g)) {
      if (!assetExists(script)) fail(file, `missing release asset ${script}`);
    }
  }

  return { version: versions[0]?.[1], errors };
}

if (require.main === module) {
  const { version, errors } = checkRelease(read, file => existsSync(join(root, file)));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`All ${pages.length} pages use release ${version}`);
  }
}

module.exports = { checkRelease };
