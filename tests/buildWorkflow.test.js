'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildWorkflow } = require('../n8n/build-workflow');

const FILE = path.join(__dirname, '..', 'n8n', 'scout-job-discovery.json');
const NORMALIZE_SRC = fs.readFileSync(path.join(__dirname, '..', 'n8n', 'normalize.js'), 'utf8');

const workflow = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const node = (name) => workflow.nodes.find(n => n.name === name);

test('workflow JSON has a fixed id and the expected nodes', () => {
  assert.equal(workflow.id, 'scout-job-discovery');
  const names = workflow.nodes.map(n => n.name);
  for (const expected of ['Schedule Trigger', "When clicking 'Test workflow'", 'Fetch Himalayas Jobs',
    'Fetch Arbeitnow Jobs', 'Fetch RemoteOK Jobs', 'Normalize & Deduplicate', 'Save to Supabase']) {
    assert.ok(names.includes(expected), `missing node ${expected}`);
  }
});

test('nodes are chained sequentially from both triggers', () => {
  const next = (name) => workflow.connections[name]?.main?.[0]?.map(c => c.node);
  assert.deepEqual(next('Schedule Trigger'), ['Fetch Himalayas Jobs']);
  assert.deepEqual(next("When clicking 'Test workflow'"), ['Fetch Himalayas Jobs']);
  assert.deepEqual(next('Fetch Himalayas Jobs'), ['Fetch Arbeitnow Jobs']);
  assert.deepEqual(next('Fetch Arbeitnow Jobs'), ['Fetch RemoteOK Jobs']);
  assert.deepEqual(next('Fetch RemoteOK Jobs'), ['Normalize & Deduplicate']);
  assert.deepEqual(next('Normalize & Deduplicate'), ['Save to Supabase']);
});

test('fetch nodes continue on error so one dead source does not stop the run', () => {
  for (const name of ['Fetch Himalayas Jobs', 'Fetch Arbeitnow Jobs', 'Fetch RemoteOK Jobs']) {
    assert.equal(node(name).onError, 'continueRegularOutput', name);
  }
});

test('Save node targets listings with real expressions for auth and body', () => {
  const save = node('Save to Supabase').parameters;
  assert.ok(save.url.endsWith('/rest/v1/listings?on_conflict=canonical_url'));
  assert.ok(save.url.startsWith('={{ $env.SUPABASE_URL }}'));
  const headers = Object.fromEntries(save.headerParameters.parameters.map(h => [h.name, h.value]));
  assert.ok(headers.apikey.startsWith('='));
  assert.ok(headers.Authorization.startsWith('='));
  assert.ok(headers.Authorization.includes('Bearer'));
  assert.ok(headers.Authorization.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.equal(headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
  assert.equal(save.jsonBody, '={{ JSON.stringify($json.rows) }}');
});

const code = node('Normalize & Deduplicate').parameters.jsCode;

test('Code node embeds normalize.js (without the module.exports line) and compiles', () => {
  assert.ok(code.includes('function normalize('));
  assert.ok(code.includes('function canonicalizeUrl('));
  assert.ok(!code.includes('module.exports'));
  assert.doesNotThrow(() => new vm.Script('(async()=>{' + code + '\n})'));
  assert.ok(NORMALIZE_SRC.includes('module.exports'));
});

function runCode(fixtures) {
  const stub = (name) => ({
    first: () => ({ json: fixtures[name]?.[0] }),
    all: () => (fixtures[name] || []).map(json => ({ json })),
  });
  // A bare context (no URL, no Node globals) mimics the strictest possible n8n sandbox.
  const fn = vm.runInNewContext('(async()=>{' + code + '\n})', { $: stub });
  // Results come from another realm; round-trip through JSON so deepEqual compares plain values.
  return fn().then((out) => JSON.parse(JSON.stringify(out)));
}

test('Code node returns one item with rows when fixtures contain matches', async () => {
  const out = await runCode({
    'Fetch Himalayas Jobs': [{ jobs: [{ title: 'Backend Engineer', companyName: 'Acme', applicationLink: 'https://a.com/1' }] }],
    'Fetch Arbeitnow Jobs': [{ data: [] }],
    'Fetch RemoteOK Jobs': [{ legal: 'meta' }, { position: 'Python Engineer', company: 'G', apply_url: 'https://b.com/2' }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].json.rows.length, 2);
});

test('Code node returns [] when there is nothing to save (Save node then does not fire)', async () => {
  assert.deepEqual(await runCode({}), []);
  assert.deepEqual(await runCode({ 'Fetch Himalayas Jobs': [{ error: 'timeout' }] }), []);
});

test('the JSON file on disk is exactly what build-workflow generates', () => {
  assert.deepEqual(buildWorkflow(), workflow);
});
