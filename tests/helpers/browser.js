'use strict';

/**
 * Real-browser test harness.
 *  - serveFixtures(): serves tests/fixtures/forms over HTTP on an ephemeral port
 *  - launch(): headless Chromium
 *  - mockLlm(): an OpenAI-compatible /chat/completions server that records every request
 *    and answers with a fixed free-text answer, so the whole LLM path runs for real
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const FORMS_DIR = path.join(__dirname, '..', 'fixtures', 'forms');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
const close = (server) => new Promise((resolve) => server.close(resolve));

async function serveFixtures() {
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url, 'http://x').pathname) || 'index.html';
    const file = path.join(FORMS_DIR, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });
  const port = await listen(server);
  return { base: `http://127.0.0.1:${port}`, close: () => close(server) };
}

async function launch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  return { browser, page, close: () => browser.close() };
}

/**
 * @param {string} answer  free-text answer the "model" returns for any question
 * @param {number} confidence
 */
async function mockLlm(answer = 'I admire the product and want to help build it.', confidence = 0.9) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_) { /* ignore */ }
      requests.push({ url: req.url, body: parsed });
      const userMessage = parsed.messages?.find(m => m.role === 'user')?.content || '';
      const isClassification = /Classify this form field/.test(userMessage);
      const content = isClassification
        ? JSON.stringify({ fieldMeaning: 'unknown', confidence: 0.1, action: 'skip' })
        : JSON.stringify({ answer, confidence, evidence: ['projects[0].name'] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  const port = await listen(server);
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests, close: () => close(server) };
}

module.exports = { serveFixtures, launch, mockLlm };
