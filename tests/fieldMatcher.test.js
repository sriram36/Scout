'use strict';

/**
 * Field Matcher Tests
 * Run with: node tests/fieldMatcher.test.js
 */

const { matchField, resolveValue } = require('../src/engine/fieldMatcher');
const { shouldNeverTouch, isTooUncertain } = require('../src/engine/safetyFilter');

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ ${description}`);
    failed++;
  }
}

async function assertMatch(description, descriptor, expectedMeaning, minConfidence = 0.75) {
  const result = await matchField(descriptor, { useLLM: false });
  const ok = result.meaning === expectedMeaning && result.confidence >= minConfidence;
  if (ok) {
    console.log(`  ✓ ${description} → ${result.meaning} (${(result.confidence * 100).toFixed(0)}%, stage ${result.stage})`);
    passed++;
  } else {
    console.error(`  ✗ ${description}`);
    console.error(`    Expected meaning: ${expectedMeaning}, got: ${result.meaning} (confidence: ${result.confidence}, stage: ${result.stage})`);
    failed++;
  }
}

async function assertSkipped(description, descriptor) {
  const isSafe = shouldNeverTouch(descriptor);
  if (isSafe) {
    console.log(`  ✓ ${description} → correctly blocked by safety filter`);
    passed++;
  } else {
    console.error(`  ✗ ${description} — expected to be blocked by safety filter, but wasn't`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n════════════════════════════════════════');
  console.log(' Scout Field Matcher Tests');
  console.log('════════════════════════════════════════\n');

  // ── Safety Filter Tests ──────────────────────────────────────────────────
  console.log('Safety Filter:');
  await assertSkipped('Gender field blocked',   { name: 'gender', type: 'select' });
  await assertSkipped('Race field blocked',      { name: 'race', type: 'select' });
  await assertSkipped('Veteran field blocked',   { id: 'veteran_status', type: 'radio' });
  await assertSkipped('Disability blocked',      { label: 'Disability Status', type: 'select' });
  await assertSkipped('reCAPTCHA blocked',       { id: 'g-recaptcha-response', type: 'hidden' });
  await assertSkipped('hCaptcha blocked',        { name: 'h-captcha-response', type: 'text' });
  await assertSkipped('Hidden field blocked',    { name: 'csrf_token', type: 'hidden' });
  await assertSkipped('Password blocked',        { name: 'password', type: 'password' });
  await assertSkipped('EEOC ethnicity blocked',  { label: 'Hispanic/Latino ethnicity', type: 'radio' });
  await assertSkipped('Pronouns blocked',        { label: 'Your pronouns', type: 'select' });
  assert('Non-sensitive field not blocked', !shouldNeverTouch({ name: 'first_name', type: 'text' }));
  assert('Confidence threshold (0.5 < 0.65)', isTooUncertain(0.5));
  assert('Confidence OK (0.8 >= 0.65)', !isTooUncertain(0.8));
  console.log();

  // ── Personal Fields ────────────────────────────────────────────────────────
  console.log('Personal — Name fields:');
  await assertMatch('first_name id',       { id: 'first_name', name: 'first_name', tag: 'input', type: 'text' }, 'personal.firstName');
  await assertMatch('fname id',            { id: 'fname', name: 'fname', tag: 'input', type: 'text' }, 'personal.firstName');
  await assertMatch('given_name',          { name: 'given_name', tag: 'input', type: 'text' }, 'personal.firstName');
  await assertMatch('last_name id',        { id: 'last_name', name: 'last_name', tag: 'input', type: 'text' }, 'personal.lastName');
  await assertMatch('surname name',        { name: 'surname', tag: 'input', type: 'text' }, 'personal.lastName');
  await assertMatch('full name label',     { label: 'Full Name', tag: 'input', type: 'text' }, 'personal.fullName');
  await assertMatch('your name label',     { label: 'Your Name', tag: 'input', type: 'text' }, 'personal.fullName');
  console.log();

  console.log('Personal — Contact fields:');
  await assertMatch('email id',            { id: 'email', name: 'email', tag: 'input', type: 'email' }, 'personal.email');
  await assertMatch('email address label', { label: 'Email Address', tag: 'input', type: 'email' }, 'personal.email');
  await assertMatch('phone id',            { id: 'phone', name: 'phone', tag: 'input', type: 'tel' }, 'personal.phone');
  await assertMatch('mobile label',        { label: 'Mobile Number', tag: 'input', type: 'tel' }, 'personal.phone');
  await assertMatch('telephone label',     { label: 'Telephone', tag: 'input', type: 'tel' }, 'personal.phone');
  await assertMatch('location id',         { id: 'location', name: 'location', tag: 'input', type: 'text' }, 'personal.location');
  console.log();

  // ── Links ──────────────────────────────────────────────────────────────────
  console.log('Links:');
  await assertMatch('linkedin name',       { name: 'linkedin', tag: 'input', type: 'url' }, 'links.linkedin');
  await assertMatch('LinkedIn URL label',  { label: 'LinkedIn URL', tag: 'input', type: 'url' }, 'links.linkedin');
  await assertMatch('LinkedIn Profile',    { label: 'LinkedIn Profile', tag: 'input', type: 'url' }, 'links.linkedin');
  await assertMatch('github name',         { name: 'github', tag: 'input', type: 'url' }, 'links.github');
  await assertMatch('GitHub URL label',    { label: 'GitHub URL', tag: 'input', type: 'url' }, 'links.github');
  await assertMatch('portfolio label',     { label: 'Portfolio Website', tag: 'input', type: 'url' }, 'links.portfolio');
  await assertMatch('personal website',    { label: 'Personal Website', tag: 'input', type: 'url' }, 'links.portfolio');
  console.log();

  // ── Education ─────────────────────────────────────────────────────────────
  console.log('Education:');
  await assertMatch('university id',       { id: 'university', name: 'university', tag: 'input', type: 'text' }, 'education.university');
  await assertMatch('college label',       { label: 'College', tag: 'input', type: 'text' }, 'education.university');
  await assertMatch('school label',        { label: 'School Name', tag: 'input', type: 'text' }, 'education.university');
  await assertMatch('educational inst',    { label: 'Educational Institution', tag: 'input', type: 'text' }, 'education.university');
  await assertMatch('degree label',        { label: 'Degree', tag: 'select', type: null }, 'education.degree');
  await assertMatch('level of education',  { label: 'Level of Education', tag: 'select', type: null }, 'education.degree');
  await assertMatch('major label',         { label: 'Major', tag: 'input', type: 'text' }, 'education.specialization');
  await assertMatch('field of study',      { label: 'Field of Study', tag: 'input', type: 'text' }, 'education.specialization');
  await assertMatch('graduation year',     { label: 'Graduation Year', tag: 'input', type: 'text' }, 'education.graduationYear');
  await assertMatch('gpa id',              { id: 'gpa', name: 'gpa', tag: 'input', type: 'text' }, 'education.cgpa');
  console.log();

  // ── Unknown / ambiguous ────────────────────────────────────────────────────
  console.log('Unknown fields (no LLM):');
  const unknown = await matchField({ id: 'qxyz123', name: 'qxyz123', tag: 'textarea', type: null, label: 'Tell us about yourself' }, { useLLM: false });
  assert('Ambiguous field → unknown without LLM', unknown.meaning === 'unknown' || unknown.action === 'skip');
  console.log();

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('════════════════════════════════════════');
  console.log(` Results: ${passed}/${total} passed`);
  if (failed > 0) console.error(` FAILED: ${failed} tests`);
  else console.log(' All tests passed ✓');
  console.log('════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
