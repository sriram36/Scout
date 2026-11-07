'use strict';

/**
 * OpenAI-compatible chat-completions transport.
 *
 * Works with OpenAI, Gemini's OpenAI-compatible endpoint, Groq, Ollama, etc.
 * Env (read at call time):
 *   LLM_BASE_URL  default https://api.openai.com/v1
 *   LLM_API_KEY   optional for local servers such as Ollama
 *   LLM_MODEL     default gpt-4o-mini
 */

const log = require('../logger');
const { postChatCompletion } = require('./chatRequest');

const name = 'openai';

function isConfigured() {
  return !!(process.env.LLM_API_KEY || process.env.LLM_BASE_URL);
}

async function callAPI(messages, { maxTokens = 500, temperature = 0, jsonMode = false } = {}) {
  if (!isConfigured()) {
    log.warn('OpenAI-compatible LLM not configured — LLM call skipped');
    return null;
  }

  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LLM_API_KEY}`;

  const body = {
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  return postChatCompletion({ url: `${base}/chat/completions`, headers, body, label: 'LLM' });
}

module.exports = { name, isConfigured, callAPI };
