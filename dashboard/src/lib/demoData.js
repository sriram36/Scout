/**
 * Built-in sample data for demo mode (NEXT_PUBLIC_DEMO=true or ?demo=1).
 * Rows use the exact Supabase `listings` shape with `applications` embedded as
 * one object or null, so they flow through the same normalizer as live data.
 */

const HOUR = 3_600_000;

const DEMO_PROFILE = {
  name: 'Aarav Mehta',
  location: 'Bengaluru, India',
  links: { github: 'https://github.com/aarav-demo', linkedin: 'https://linkedin.com/in/aarav-demo' },
  education: { university: 'PES University', degree: 'B.Tech, Computer Science', graduationYear: 2026 },
  skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Python'],
  preferences: { roles: ['Software Engineer', 'Frontend Engineer'], internships: true },
};

/**
 * [title, company, location, source, internship, hoursAgo, status|null, ats, salary]
 * @type {[string, string, string, string, boolean, number, string | null, string | null, string | null][]}
 */
const SEED = [
  ['Software Engineer Intern', 'Razorpay', 'Bengaluru', 'LinkedIn', true, 1.5, null, null, '₹60k / month'],
  ['Frontend Engineer, New Grad', 'Postman', 'Bengaluru', 'Greenhouse', false, 3, null, null, null],
  ['Backend Developer Intern', 'Zerodha', 'Bengaluru', 'Internshala', true, 6, null, null, '₹40k / month'],
  ['Associate Software Engineer', 'Atlassian', 'Remote, India', 'LinkedIn', false, 20, null, null, null],
  ['Full Stack Developer', 'Juspay', 'Bengaluru', 'Wellfound', false, 28, null, null, '₹12–16 LPA'],
  ['Data Engineering Intern', 'Swiggy', 'Bengaluru', 'LinkedIn', true, 52, null, null, null],
  ['Platform Engineer I', 'Hasura', 'Remote', 'Wellfound', false, 75, null, null, null],
  ['Graduate Engineer Trainee', 'Freshworks', 'Chennai', 'Naukri', false, 120, null, null, '₹8 LPA'],
  ['SDE Intern, Payments', 'PhonePe', 'Bengaluru', 'LinkedIn', true, 4, 'pending_application', null, null],
  ['Software Engineer, Growth', 'CRED', 'Bengaluru', 'Wellfound', false, 9, 'pending_application', null, null],
  ['Web Developer Intern', 'Groww', 'Bengaluru', 'Internshala', true, 2, 'applying', 'lever', null],
  ['Junior Frontend Developer', 'Chargebee', 'Chennai', 'Greenhouse', false, 11, 'application_opened', 'greenhouse', null],
  ['Software Engineer I', 'Browserstack', 'Mumbai', 'LinkedIn', false, 14, 'form_analyzed', 'ashby', null],
  ['Software Engineer Intern', 'Stripe', 'Bengaluru', 'Greenhouse', true, 26, 'awaiting_review', 'greenhouse', null],
  ['Frontend Engineer', 'Setu', 'Bengaluru', 'Lever', false, 40, 'awaiting_review', 'lever', '₹14–18 LPA'],
  ['Product Engineer, New Grad', 'Plum', 'Bengaluru', 'Wellfound', false, 64, 'autofill_completed', 'ashby', null],
  ['Developer Advocate Intern', 'Appsmith', 'Remote', 'LinkedIn', true, 98, 'awaiting_review', 'generic', null],
  ['Software Development Engineer', 'Amazon', 'Hyderabad', 'LinkedIn', false, 130, 'submitted', 'workday', null],
  ['Engineering Intern', 'Notion', 'Remote', 'Greenhouse', true, 150, 'submitted', 'greenhouse', null],
  ['Backend Engineer, Graduate', 'Rippling', 'Bengaluru', 'Lever', false, 190, 'submitted', 'lever', null],
  ['Associate Engineer', 'Thoughtworks', 'Pune', 'Naukri', false, 230, 'submitted', 'generic', null],
  ['Frontend Intern', 'Dukaan', 'Bengaluru', 'Internshala', true, 270, 'submitted', 'generic', '₹25k / month'],
  ['Software Engineer, Infra', 'Meesho', 'Bengaluru', 'LinkedIn', false, 18, 'failed', 'workday', null],
  ['Mobile Engineer Intern', 'Zepto', 'Mumbai', 'Wellfound', true, 44, 'failed', 'lever', null],
];

const STRIPE_REPORT = {
  total: 17,
  filled: 12,
  skipped: 4,
  errors: 1,
  aiGenerated: 2,
  stageBreakdown: { learned: 3, deterministic: 6, semantic: 1, llm: 2 },
  details: {
    filled: [
      { field: 'first_name', label: 'First name', meaning: 'personal.firstName', value: 'Aarav', confidence: 1, stage: 'deterministic', isAIGenerated: false },
      { field: 'last_name', label: 'Last name', meaning: 'personal.lastName', value: 'Mehta', confidence: 1, stage: 'deterministic', isAIGenerated: false },
      { field: 'email', label: 'Email', meaning: 'personal.email', value: 'aarav@example.com', confidence: 1, stage: 'deterministic', isAIGenerated: false },
      { field: 'phone', label: 'Phone', meaning: 'personal.phone', value: '+91 98•••• ••21', confidence: 1, stage: 'deterministic', isAIGenerated: false },
      { field: 'resume', label: 'Resume/CV', meaning: 'resume', value: 'aarav-mehta-resume.pdf', confidence: 1, stage: 'deterministic', isAIGenerated: false },
      { field: 'job_application[location]', label: 'Current location', meaning: 'personal.location', value: 'Bengaluru, India', confidence: 0.94, stage: 'learned', isAIGenerated: false },
      { field: 'question_1182', label: 'LinkedIn profile', meaning: 'links.linkedin', value: 'linkedin.com/in/aarav-demo', confidence: 0.97, stage: 'learned', isAIGenerated: false },
      { field: 'question_1183', label: 'GitHub or portfolio', meaning: 'links.github', value: 'github.com/aarav-demo', confidence: 0.91, stage: 'learned', isAIGenerated: false },
      { field: 'school', label: 'School', meaning: 'education.university', value: 'PES University', confidence: 1, stage: 'deterministic', isAIGenerated: false },
      { field: 'question_1190', label: 'Expected graduation', meaning: 'education.graduationYear', value: '2026', confidence: 0.82, stage: 'semantic', isAIGenerated: false },
      { field: 'question_1201', label: 'Why do you want to intern at Stripe?', meaning: 'unknown', value: 'I have spent the last year building payment flows for a campus marketplace…', confidence: 0.71, stage: 'llm', isAIGenerated: true },
      { field: 'question_1202', label: 'Tell us about a project you are proud of', meaning: 'unknown', value: 'Scout, a job-application copilot that fills ATS forms and stops for review…', confidence: 0.74, stage: 'llm', isAIGenerated: true },
    ],
    skipped: [
      { field: 'question_1195', label: 'Current CGPA (out of 10)', signature: 'question_1195|question_1195|current cgpa (out of 10)', meaning: 'unknown', reason: 'Confidence 0.41 is below the 0.6 threshold' },
      { field: 'question_1196', label: 'Degree and branch', signature: 'question_1196|question_1196|degree and branch', meaning: 'unknown', reason: 'No matching option for the profile value' },
      { field: 'gender', label: 'Gender', meaning: 'protected', reason: 'Protected demographic field, never auto-filled' },
      { field: 'question_1199', label: 'Are you legally authorised to work in India?', meaning: 'unknown', reason: 'Legal declarations are left for you' },
    ],
    errors: [
      { field: 'question_1188', label: 'Portfolio website', meaning: 'links.portfolio', error: 'Element was detached from the page before it could be filled' },
    ],
  },
};

/**
 * Report for a review/applied card that is not the showcase one.
 * @param {number} seed
 */
function smallReport(seed) {
  const total = 10 + (seed % 5);
  const skipped = 1 + (seed % 2);
  const ai = seed % 3 === 0 ? 1 : 0;
  return {
    total, filled: total - skipped, skipped, errors: 0, aiGenerated: ai,
    stageBreakdown: { learned: 2 + (seed % 3), deterministic: total - skipped - 2 - (seed % 3) - ai, semantic: 0, llm: ai },
  };
}

const ERRORS = /** @type {Record<string, string>} */ ({
  Meesho: 'Workday asked for an account sign-in before the form loaded. Sign in once in the Scout browser, then retry.',
  Zepto: 'Timed out after 45s waiting for the application form to appear.',
});

/** @param {number} i */
const uuid = (i) => `d3m0${String(i).padStart(4, '0')}-5c0u-4e7a-9b1d-${String(1000 + i).padStart(12, '0')}`;

/**
 * @param {string} company
 * @param {string} title
 */
function description(company, title) {
  return `${company} is hiring a ${title} to build reliable, well-tested product features with a small team.\n\n` +
    'What you will do\n- Ship features end to end, from design review to production\n- Write clear code and tests, and review code from peers\n- Work closely with design and product on what to build next\n\n' +
    'What we look for\n- Strong fundamentals in data structures, networking and databases\n- Experience with TypeScript, React or a backend language through projects or internships\n- Curiosity, ownership and clear written communication';
}

/**
 * @param {Date} [now]
 * @returns {any[]} rows shaped like `listings` with `applications` embedded
 */
function buildDemoListings(now = new Date()) {
  const t = now.getTime();
  return SEED.map(([title, company, location, source, internship, hoursAgo, status, ats, salary], i) => {
    const id = uuid(i + 1);
    const discovered = new Date(t - hoursAgo * HOUR);
    const slug = company.toLowerCase().replace(/[^a-z]/g, '');
    const applyUrl = ats === 'greenhouse' ? `https://boards.greenhouse.io/${slug}/jobs/${4100 + i}`
      : ats === 'lever' ? `https://jobs.lever.co/${slug}/${uuid(i + 50)}`
      : ats === 'ashby' ? `https://jobs.ashbyhq.com/${slug}/${uuid(i + 80)}`
      : ats === 'workday' ? `https://${slug}.wd3.myworkdayjobs.com/careers/job/${4100 + i}`
      : `https://careers.${slug}.com/jobs/${4100 + i}`;

    let application = null;
    if (status) {
      const queuedAt = new Date(discovered.getTime() + 0.4 * HOUR);
      const started = ['pending_application'].includes(status) || (status === 'failed' && company === 'Meesho') ? null : new Date(queuedAt.getTime() + 2 * 60_000);
      const done = ['autofill_completed', 'awaiting_review', 'submitted'].includes(status) && started ? new Date(started.getTime() + 95_000) : null;
      const report = company === 'Stripe' ? STRIPE_REPORT : done ? smallReport(i) : null;
      const updated = status === 'submitted' ? new Date(discovered.getTime() + 20 * HOUR)
        : status === 'failed' ? new Date((started || queuedAt).getTime() + 45_000)
        : done || started || queuedAt;
      application = {
        id: uuid(i + 200),
        listing_id: id,
        status,
        status_updated_at: new Date(Math.min(updated.getTime(), t)).toISOString(),
        ats_platform: ats,
        started_at: started ? started.toISOString() : null,
        completed_at: done ? done.toISOString() : null,
        fields_detected: report ? report.total : status === 'form_analyzed' ? 14 : 0,
        fields_filled: report ? report.filled : 0,
        fields_skipped: report ? report.skipped : 0,
        ai_questions_answered: report ? report.aiGenerated : 0,
        fill_report: report,
        error_message: status === 'failed' ? ERRORS[company] || 'The apply server stopped unexpectedly.' : null,
        notes: null,
      };
    }

    return {
      id,
      title,
      company,
      location,
      salary,
      source,
      description: description(company, title),
      apply_url: applyUrl,
      canonical_url: applyUrl,
      posted_date: new Date(discovered.getTime() - 24 * HOUR).toISOString().slice(0, 10),
      discovered_at: discovered.toISOString(),
      is_internship: internship,
      applications: application,
    };
  });
}

/** Demo-only progression of a queued application, to mimic the apply server. */
const DEMO_NEXT = /** @type {Record<string, string>} */ ({
  pending_application: 'applying',
  applying: 'form_analyzed',
  form_analyzed: 'awaiting_review',
});

/**
 * @param {string} status
 * @returns {string | null}
 */
function nextDemoStatus(status) {
  return DEMO_NEXT[status] || null;
}

module.exports = { DEMO_PROFILE, buildDemoListings, nextDemoStatus, smallReport };
