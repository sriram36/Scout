'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { selectProvider } = require('../src/llm');

const parsed = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.example')));

test('a fresh copy of .env.example selects no LLM provider, so placeholders never shadow the real choice', () => {
  assert.equal(selectProvider(parsed), null);
});

test('adding only an LLM_API_KEY to the example selects the openai provider', () => {
  assert.equal(selectProvider({ ...parsed, LLM_API_KEY: 'sk-real' }), 'openai');
});
