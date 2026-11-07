'use strict';

/**
 * Provider-independent LLM operations for Scout.
 *
 *  1. classifyField(fieldDescription) — Stage 3 field classification
 *  2. generateAnswer(params)          — job-aware free-text answer generation
 *
 * A "transport" supplies only { name, isConfigured(), callAPI(messages, opts) }.
 * All prompts and response validation live here so every provider behaves the same.
 *
 * IMPORTANT:
 *  - Never called from the dashboard (browser-side)
 *  - Never passed the full PII profile — callers use profileForLLM()
 *  - Every model response is validated (zod) before it is used
 */

const { z } = require('zod');
const log = require('../logger');

const VALID_MEANINGS = [
  'personal.firstName', 'personal.lastName', 'personal.email', 'personal.phone', 'personal.location',
  'links.linkedin', 'links.github', 'links.portfolio',
  'education.university', 'education.degree', 'education.specialization', 'education.graduationYear', 'education.cgpa',
  'experience.current.company', 'experience.current.role',
  'resume',
  'unknown',
];

const ClassifySchema = z.object({
  fieldMeaning: z.enum(VALID_MEANINGS),
  confidence:   z.number(),
  action:       z.string().optional(),
});

const AnswerSchema = z.object({
  answer:     z.string(),
  confidence: z.number().optional(),
  evidence:   z.array(z.string()).optional(),
});

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const EMPTY_ANSWER = () => ({ answer: '', confidence: 0, evidence: [] });

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
 * Parse a raw model string as JSON and validate it. Returns the parsed value or null.
 */
function parseAndValidate(raw, schema, what) {
  let json;
  try {
    json = JSON.parse(raw);
  } catch (_) {
    log.warn(`LLM returned invalid JSON for ${what}`);
    return null;
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    log.warn(`LLM returned malformed ${what}`, { issues: result.error.issues.length });
    return null;
  }
  return result.data;
}

function createOperations(transport) {
  async function classifyField(fieldDescription) {
    const userPrompt = `Classify this form field:\n${JSON.stringify(fieldDescription, null, 2)}`;

    let raw;
    try {
      raw = await transport.callAPI(
        [
          { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 150, temperature: 0, jsonMode: true }
      );
    } catch (e) {
      log.warn('LLM classify call failed', { provider: transport.name, error: e.message });
      return null;
    }
    if (!raw) return null;

    const parsed = parseAndValidate(raw, ClassifySchema, 'field classification');
    if (!parsed) return null;

    return {
      meaning:    parsed.fieldMeaning,
      confidence: clamp01(parsed.confidence),
      action:     parsed.action === 'fill' ? 'fill' : 'skip',
    };
  }

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
      raw = await transport.callAPI(
        [
          { role: 'system', content: ANSWER_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 400, temperature: 0.2, jsonMode: true }
      );
    } catch (e) {
      log.warn('LLM answer generation failed', { provider: transport.name, error: e.message });
      return EMPTY_ANSWER();
    }
    if (!raw) return EMPTY_ANSWER();

    const parsed = parseAndValidate(raw, AnswerSchema, 'answer');
    if (!parsed) return EMPTY_ANSWER();

    return {
      answer:     parsed.answer.trim(),
      confidence: clamp01(parsed.confidence || 0.7),
      evidence:   parsed.evidence || [],
    };
  }

  return { classifyField, generateAnswer };
}

module.exports = { createOperations, VALID_MEANINGS };
