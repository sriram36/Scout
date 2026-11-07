'use strict';

/**
 * Azure OpenAI transport.
 *
 * Understands both endpoint styles:
 *   classic  https://<resource>.openai.azure.com                -> /openai/deployments/<deployment>/chat/completions?api-version=...
 *   v1       https://<resource>.openai.azure.com/openai/v1      -> /chat/completions with the deployment as `model`
 * Prompts and validation live in operations.js; parameter quirks of newer models are handled in chatRequest.js.
 */

const log = require('../logger');
const { postChatCompletion } = require('./chatRequest');

const name = 'azure';
const API_VERSION = '2024-10-21';

function getBase() {
  return (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
}

const isV1 = (base) => /\/openai\/v1$/i.test(base);

function isConfigured() {
  return !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT);
}

async function callAPI(messages, { maxTokens = 500, temperature = 0, jsonMode = false } = {}) {
  if (!isConfigured()) {
    log.warn('Azure OpenAI not configured — LLM call skipped');
    return null;
  }

  const base = getBase();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const v1 = isV1(base);

  const body = v1
    ? { model: deployment, messages, max_completion_tokens: maxTokens, temperature }
    : { messages, max_tokens: maxTokens, temperature };
  if (jsonMode) body.response_format = { type: 'json_object' };

  return postChatCompletion({
    url: v1
      ? `${base}/chat/completions`
      : `${base}/openai/deployments/${deployment}/chat/completions?api-version=${API_VERSION}`,
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.AZURE_OPENAI_KEY || '' },
    body,
    label: 'Azure OpenAI',
  });
}

module.exports = { name, isConfigured, callAPI };
