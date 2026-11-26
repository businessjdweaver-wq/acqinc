'use strict';

const { run, planRecord } = require('./generate-content.js');

if (require.main === module) run('character', process.argv.slice(2));

module.exports = { planCharacter: (...args) => planRecord('character', ...args) };
