'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectProvider } = require('../src/llm');

const AZURE = {
  AZURE_OPENAI_ENDPOINT: 'https://x.openai.azure.com',
  AZURE_OPENAI_KEY: 'k',
  AZURE_OPENAI_DEPLOYMENT: 'gpt-4o',
};

test('explicit LLM_PROVIDER=openai beats complete Azure vars', () => {
  assert.equal(selectProvider({ ...AZURE, LLM_PROVIDER: 'openai' }), 'openai');
});

test('complete Azure vars alone select azure', () => {
  assert.equal(selectProvider({ ...AZURE }), 'azure');
});

test('only LLM_API_KEY selects openai', () => {
  assert.equal(selectProvider({ LLM_API_KEY: 'sk-1' }), 'openai');
});

test('only LLM_BASE_URL (keyless Ollama) selects openai', () => {
  assert.equal(selectProvider({ LLM_BASE_URL: 'http://localhost:11434/v1' }), 'openai');
});

test('empty env selects no provider', () => {
  assert.equal(selectProvider({}), null);
});

test('unknown LLM_PROVIDER falls back to auto-detection', () => {
  assert.equal(selectProvider({ ...AZURE, LLM_PROVIDER: 'bogus' }), 'azure');
  assert.equal(selectProvider({ LLM_PROVIDER: 'bogus' }), null);
});

test('partial Azure vars do not select azure', () => {
  assert.equal(selectProvider({ AZURE_OPENAI_KEY: 'k' }), null);
});
