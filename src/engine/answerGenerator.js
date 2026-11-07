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
const { generateAnswer } = require('../llm/azureClient');
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
  const plannedElementIds = new Set(fillPlan.filter(p => p.action !== 'skip').map(p => p.elementId));
  const unknownOrTextarea = fillPlan.filter(p =>
    p.action === 'skip' &&
    p.skipReason === 'Could not classify field' &&
    (p.descriptor?.tag === 'textarea' || p.descriptor?.type === 'text')
  );
  return unknownOrTextarea.map(p => p.descriptor).filter(Boolean);
}

/**
 * Generate an AI answer for a single free-text question.
 *
 * @param {object} descriptor  — FieldDescriptor of the question
 * @param {object} job         — { title, company, description }
 * @returns {Promise<{elementId, answer, confidence, evidence}>}
 */
async function generateFieldAnswer(descriptor, job) {
  const question = descriptor.label || descriptor.placeholder || descriptor.ariaLabel || 'Unknown question';
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
