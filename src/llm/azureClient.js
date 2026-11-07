'use strict';

/**
 * Centralized Azure OpenAI client for Scout.
 *
 * Two operations:
 *  1. classifyField(fieldDescription)  — Stage 3 field classification
 *  2. generateAnswer(params)           — Job-aware free-text answer generation
 *
 * IMPORTANT:
 *  - Never called from the dashboard (browser-side)
 *  - Never passed full PII profile — uses profileForLLM() safe subset
 *  - All outputs validated against JSON schema before being used
 */

const log = require('../logger');

// ─── Config ───────────────────────────────────────────────────────────────────

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

// ─── HTTP helper ──────────────────────────────────────────────────────────────

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

// ─── 1. Field Classification ──────────────────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are a form field classifier for a job application assistant.
Given a description of a form field, classify what candidate information it is asking for.

You MUST respond with valid JSON matching this exact schema:
{
  "fieldMeaning": string,  // dot-path like "personal.email", "education.university", or "unknown"
  "confidence": number,    // 0.0 to 1.0
  "action": "fill" | "skip"
}

Valid fieldMeaning values:
personal.firstName, personal.lastName, personal.email, personal.phone, personal.location,
links.linkedin, links.github, links.portfolio,
education.university, education.degree, education.specialization, education.graduationYear, education.cgpa,
experience.current.company, experience.current.role,
resume (for file upload fields),
unknown (if you genuinely cannot determine the field's meaning)

Rules:
- If the field is a demographic/EEOC question (race, gender, ethnicity, veteran, disability), return action: "skip" and fieldMeaning: "unknown"
- If confidence < 0.65, return action: "skip"
- If field is about work authorization or sponsorship, return fieldMeaning: "unknown", action: "skip"
- Never return a fieldMeaning that isn't in the valid list above`;

/**
 * Classify a single field using the LLM.
 * Returns { meaning, confidence, action } or null on failure.
 */
async function classifyField(fieldDescription) {
  const userPrompt = `Classify this form field:\n${JSON.stringify(fieldDescription, null, 2)}`;

  let raw;
  try {
    raw = await callAPI(
      [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 150, temperature: 0, jsonMode: true }
    );
  } catch (e) {
    log.warn('LLM classify call failed', { error: e.message });
    return null;
  }

  // Validate schema
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    log.warn('LLM returned invalid JSON for field classification');
    return null;
  }

  if (typeof parsed.fieldMeaning !== 'string' || typeof parsed.confidence !== 'number') {
    log.warn('LLM returned malformed classification', { parsed });
    return null;
  }

  return {
    meaning:    parsed.fieldMeaning,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    action:     parsed.action === 'fill' ? 'fill' : 'skip',
  };
}

// ─── 2. Answer Generation ─────────────────────────────────────────────────────

const ANSWER_SYSTEM_PROMPT = `You are helping a job candidate write concise, honest answers to application questions.

CRITICAL RULES:
1. Only use facts from the candidate profile provided. NEVER invent companies, projects, or skills.
2. Do not exaggerate years of experience. If the candidate only has internship experience, say so naturally.
3. Answers must be concise (2-4 sentences for most questions, 1 paragraph max).
4. Sound human and genuine, not like a template.
5. Tailor the answer to the specific role and company.
6. If the profile has no relevant information for the question, return confidence: 0.3 and a brief honest answer.

You MUST respond with valid JSON matching this exact schema:
{
  "answer": string,
  "confidence": number,    // 0.0 to 1.0
  "evidence": string[]     // dot-paths used from profile, e.g. ["experience[0].company", "projects[0].name"]
}`;

/**
 * Generate a job-aware answer for a free-text application question.
 * @param {{ question, candidateProfile, jobTitle, company, jobDescription }} params
 */
async function generateAnswer({ question, candidateProfile, jobTitle, company, jobDescription }) {
  const userPrompt = `
Job: ${jobTitle} at ${company}
Job Description (excerpt): ${(jobDescription || '').substring(0, 2000)}

Candidate Profile:
${JSON.stringify(candidateProfile, null, 2)}

Application Question: "${question}"

Write a concise, honest, tailored answer.`;

  let raw;
  try {
    raw = await callAPI(
      [
        { role: 'system', content: ANSWER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 400, temperature: 0.2, jsonMode: true }
    );
  } catch (e) {
    log.warn('LLM answer generation failed', { error: e.message });
    return { answer: '', confidence: 0, evidence: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    log.warn('LLM returned invalid JSON for answer generation');
    return { answer: '', confidence: 0, evidence: [] };
  }

  if (typeof parsed.answer !== 'string') {
    log.warn('LLM answer schema invalid', { parsed });
    return { answer: '', confidence: 0, evidence: [] };
  }

  return {
    answer:     parsed.answer.trim(),
    confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
    evidence:   Array.isArray(parsed.evidence) ? parsed.evidence : [],
  };
}

module.exports = { classifyField, generateAnswer, isConfigured };
