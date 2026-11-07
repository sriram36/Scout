'use strict';

/**
 * Public LLM API for the engine.
 *
 * Picks a provider (Azure or OpenAI-compatible) from the environment at call
 * time and delegates to the shared operations.
 */

const azure  = require('./azureClient');
const openai = require('./openaiCompatClient');
const { createOperations } = require('./operations');

const TRANSPORTS = { azure, openai };
const OPERATIONS = { azure: createOperations(azure), openai: createOperations(openai) };

/**
 * @param {object} env
 * @returns {'azure'|'openai'|null}
 */
function selectProvider(env = process.env) {
  const explicit = env.LLM_PROVIDER;
  if (explicit === 'azure' || explicit === 'openai') return explicit;

  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_KEY && env.AZURE_OPENAI_DEPLOYMENT) return 'azure';
  if (env.LLM_API_KEY || env.LLM_BASE_URL) return 'openai';
  return null;
}

async function classifyField(fieldDescription) {
  const provider = selectProvider();
  if (!provider) return null;
  return OPERATIONS[provider].classifyField(fieldDescription);
}

async function generateAnswer(params) {
  const provider = selectProvider();
  if (!provider) return { answer: '', confidence: 0, evidence: [] };
  return OPERATIONS[provider].generateAnswer(params);
}

function isConfigured() {
  const provider = selectProvider();
  return provider !== null && TRANSPORTS[provider].isConfigured();
}

module.exports = { selectProvider, classifyField, generateAnswer, isConfigured };
