'use strict';

/**
 * Generates n8n/scout-job-discovery.json.
 *
 * The Code node embeds n8n/normalize.js so the logic is unit-tested in Node and
 * the workflow JSON is never hand-edited. Regenerate with:
 *   node n8n/build-workflow.js
 */

const fs = require('node:fs');
const path = require('node:path');

const OUTPUT = path.join(__dirname, 'scout-job-discovery.json');
/**
 * The text embedded in the n8n Code node: normalize.js without its export line, with LF line
 * endings. Git on Windows may check the file out with CRLF; the generated JSON must not depend on that.
 */
function prepareSource(text) {
  return text.replace(/\r\n/g, '\n').replace(/^module\.exports\s*=.*$/m, '').trim();
}

const NORMALIZE_SOURCE = prepareSource(fs.readFileSync(path.join(__dirname, 'normalize.js'), 'utf8'));

const GLUE = `
// ── n8n glue: read the three fetch nodes and emit one item holding all rows ──
const fromNode = (name, key) => {
  try {
    const json = $(name).first()?.json;
    return key ? json?.[key] : json;
  } catch (e) {
    return null;
  }
};
const allItems = (name) => {
  try {
    return $(name).all().map((item) => item.json);
  } catch (e) {
    return [];
  }
};

const rows = normalize({
  himalayas: fromNode('Fetch Himalayas Jobs', 'jobs'),
  arbeitnow: fromNode('Fetch Arbeitnow Jobs', 'data'),
  remoteok: allItems('Fetch RemoteOK Jobs'),
});

return rows.length > 0 ? [{ json: { rows } }] : [];
`;

const fetchNode = (id, name, url, position, extra = {}) => ({
  id,
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position,
  // Run once and always emit an item: an empty response must not halt the chain, and
  // one dead source must not stop the others from being saved.
  onError: 'continueRegularOutput',
  executeOnce: true,
  alwaysOutputData: true,
  parameters: { method: 'GET', url, options: { timeout: 20000 }, ...extra },
});

function buildWorkflow() {
  const nodes = [
    {
      id: 'schedule',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } },
    },
    {
      id: 'manual',
      name: "When clicking 'Test workflow'",
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 200],
      parameters: {},
    },
    fetchNode('http-himalayas', 'Fetch Himalayas Jobs', 'https://himalayas.app/jobs/api?category=developer', [260, 100]),
    fetchNode('http-arbeitnow', 'Fetch Arbeitnow Jobs', 'https://www.arbeitnow.com/api/job-board-api', [520, 100]),
    fetchNode('http-remoteok', 'Fetch RemoteOK Jobs', 'https://remoteok.com/api', [780, 100], {
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'User-Agent', value: 'Scout/1.0 (personal job tracker)' }] },
    }),
    {
      id: 'normalize',
      name: 'Normalize & Deduplicate',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1040, 100],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `${NORMALIZE_SOURCE}\n${GLUE}`,
      },
    },
    {
      id: 'save',
      name: 'Save to Supabase',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1300, 100],
      parameters: {
        method: 'POST',
        url: '={{ $env.SUPABASE_URL }}/rest/v1/listings?on_conflict=canonical_url',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' },
            { name: 'Authorization', value: "={{ 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY }}" },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Prefer', value: 'resolution=ignore-duplicates,return=minimal' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.rows) }}',
        options: { timeout: 30000 },
      },
    },
  ];

  const link = (node) => ({ main: [[{ node, type: 'main', index: 0 }]] });

  return {
    id: 'scout-job-discovery',
    name: 'Scout Job Discovery',
    active: false,
    nodes,
    connections: {
      'Schedule Trigger': link('Fetch Himalayas Jobs'),
      "When clicking 'Test workflow'": link('Fetch Himalayas Jobs'),
      'Fetch Himalayas Jobs': link('Fetch Arbeitnow Jobs'),
      'Fetch Arbeitnow Jobs': link('Fetch RemoteOK Jobs'),
      'Fetch RemoteOK Jobs': link('Normalize & Deduplicate'),
      'Normalize & Deduplicate': link('Save to Supabase'),
    },
    settings: { executionOrder: 'v1' },
    pinData: {},
  };
}

if (require.main === module) {
  fs.writeFileSync(OUTPUT, JSON.stringify(buildWorkflow(), null, 2) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
}

module.exports = { buildWorkflow, prepareSource };
