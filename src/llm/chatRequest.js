'use strict';

/**
 * One chat-completions request, shared by every provider.
 *
 * Newer models reject options older ones need: some want `max_completion_tokens` instead of
 * `max_tokens`, and some accept only the default `temperature`. Rather than hard-code model names,
 * a 400 that names exactly one of those two parameters is retried with the option adjusted, and
 * what was learned is remembered per endpoint so later calls do not waste a round trip.
 */

const MAX_ADJUSTMENTS = 2;

/** url -> { maxCompletionTokens: boolean, dropTemperature: boolean } */
const learned = new Map();

function resetLearnedParameters() {
  learned.clear();
}

function renameMaxTokens(payload) {
  if (!('max_tokens' in payload)) return payload;
  const { max_tokens: maxTokens, ...rest } = payload;
  return { ...rest, max_completion_tokens: maxTokens };
}

function dropTemperature(payload) {
  if (!('temperature' in payload)) return payload;
  const { temperature, ...rest } = payload;
  return rest;
}

function applyLearned(url, payload) {
  const known = learned.get(url);
  if (!known) return payload;
  let next = payload;
  if (known.maxCompletionTokens) next = renameMaxTokens(next);
  if (known.dropTemperature) next = dropTemperature(next);
  return next;
}

/** The adjusted payload when a 400 names a parameter we can fix, otherwise null. */
function adjustForRejection(url, payload, status, text) {
  if (status !== 400) return null;
  let param;
  try { param = JSON.parse(text)?.error?.param; } catch (_) { return null; }

  const known = learned.get(url) || { maxCompletionTokens: false, dropTemperature: false };
  if (param === 'max_tokens' && 'max_tokens' in payload) {
    learned.set(url, { ...known, maxCompletionTokens: true });
    return renameMaxTokens(payload);
  }
  if (param === 'temperature' && 'temperature' in payload) {
    learned.set(url, { ...known, dropTemperature: true });
    return dropTemperature(payload);
  }
  return null;
}

/**
 * @param {{url: string, headers: object, body: object, label: string}} request
 * @returns {Promise<string>} the model's message content
 */
async function postChatCompletion({ url, headers, body, label }) {
  let payload = applyLearned(url, body);

  for (let attempt = 0; attempt <= MAX_ADJUSTMENTS; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error(`Empty response from ${label}`);
      return content;
    }

    const text = await res.text();
    const adjusted = attempt < MAX_ADJUSTMENTS ? adjustForRejection(url, payload, res.status, text) : null;
    if (!adjusted) throw new Error(`${label} API error ${res.status}: ${text.substring(0, 200)}`);
    payload = adjusted;
  }
  throw new Error(`${label} request could not be adjusted to this model`);
}

module.exports = { postChatCompletion, resetLearnedParameters };
