'use strict';

/**
 * Answer Generator
 *
 * Generates job-aware, candidate-specific answers for free-text application questions.
 *
 * Rules:
 *  - Only uses facts from the candidate profile (no invented experience)
 *  - Answers are concise and sound human
 *  - Tailored to the specific role and company
 *  - Returns confidence + evidence so the fill report shows what was used
 */

const { profileForLLM } = require('../config/profile');
const { generateAnswer } = require('../llm');
const { shouldNeverTouch } = require('./safetyFilter');
const log = require('../logger');

/**
 * Identify which fields in the descriptor list are free-text application questions
 * (not standard contact/education fields) that need AI-generated answers.
 *
 * @param {object[]} descriptors
 * @param {object[]} fillPlan     — already-classified plan (to avoid re-processing known fields)
 * @returns {object[]}            — subset of descriptors needing AI answers
 */
function identifyFreeTextQuestions(descriptors, fillPlan) {
  const unknownOrTextarea = fillPlan.filter(p =>
    p.action === 'skip' &&
    p.skipReason === 'Could not classify field' &&
    (p.descriptor?.tag === 'textarea' || p.descriptor?.type === 'text') &&
    questionText(p.descriptor) &&          // never ask the model about a question nobody has seen
    !shouldNeverTouch(p.descriptor)        // backstop: protected or legal fields are never sent to the model
  );
  return unknownOrTextarea.map(p => p.descriptor).filter(Boolean);
}

/** The visible question of a field, or an empty string when the page gave us none. */
function questionText(descriptor) {
  return (descriptor?.label || descriptor?.placeholder || descriptor?.ariaLabel || '').trim();
}

/**
 * Generate an AI answer for a single free-text question.
 *
 * @param {object} descriptor  — FieldDescriptor of the question
 * @param {object} job         — { title, company, description }
 * @returns {Promise<{elementId, answer, confidence, evidence}>}
 */
async function generateFieldAnswer(descriptor, job) {
  const question = questionText(descriptor);
  if (!question || shouldNeverTouch(descriptor)) return null;
  const safeProfle = profileForLLM();

  log.info('Generating answer for question', { question: question.substring(0, 80), job: job.title });

  try {
    const result = await generateAnswer({
      question,
      candidateProfile: safeProfle,
      jobTitle: job.title,
      company: job.company,
      jobDescription: (job.description || '').substring(0, 3000),
    });

    return {
      elementId:  descriptor.elementId,
      answer:     result.answer,
      confidence: result.confidence,
      evidence:   result.evidence,
    };
  } catch (e) {
    log.error('Answer generation failed', { question: question.substring(0, 80), error: e.message });
    return null;
  }
}

/**
 * Generate answers for all unclassified free-text questions in a fill plan.
 *
 * @param {object[]} descriptors  — all FieldDescriptors from the page
 * @param {object[]} fillPlan     — current fill plan
 * @param {object}   job          — job listing data
 * @returns {Promise<object[]>}   — [{elementId, answer, confidence, evidence}]
 */
async function generateAnswersForPlan(descriptors, fillPlan, job) {
  const questions = identifyFreeTextQuestions(descriptors, fillPlan);
  if (questions.length === 0) return [];

  log.info(`Generating answers for ${questions.length} free-text questions`);
  const results = [];

  for (const desc of questions) {
    const answer = await generateFieldAnswer(desc, job);
    if (answer) results.push(answer);
  }

  return results;
}

module.exports = { generateAnswersForPlan, generateFieldAnswer, identifyFreeTextQuestions };
