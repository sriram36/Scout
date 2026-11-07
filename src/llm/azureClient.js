'use strict';

/**
 * Azure OpenAI transport.
 *
 * Only knows how to talk to Azure; prompts and validation live in operations.js.
 */

const log = require('../logger');

const name = 'azure';

function getEndpoint() {
  const base = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/$/, '');
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
  const apiVersion = '2024-10-21';
  return `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'api-key': process.env.AZURE_OPENAI_KEY || '',
  };
}

function isConfigured() {
  return !!(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT);
}

async function callAPI(messages, { maxTokens = 500, temperature = 0, jsonMode = false } = {}) {
  if (!isConfigured()) {
    log.warn('Azure OpenAI not configured — LLM call skipped');
    return null;
  }

  const body = {
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(getEndpoint(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure OpenAI API error ${res.status}: ${text.substring(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty response from Azure OpenAI');
  return content;
}

module.exports = { name, isConfigured, callAPI };
