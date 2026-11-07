'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');

test('n8n is published on loopback only (it holds the service key and has no owner account yet)', () => {
  assert.ok(compose.includes('"127.0.0.1:5678:5678"'));
  assert.ok(!/-\s*"5678:5678"/.test(compose));
});

test('the workflow import is conditional so re-running up never overwrites edits or deactivates the workflow', () => {
  assert.ok(compose.includes('list:workflow'), 'import must first check whether the workflow already exists');
});
