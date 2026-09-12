require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  req.url = req.url.replace(/\/{2,}/g, '/');
  next();
});

// Basic health check endpoints for cloud deployment platforms
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Scout Job Automation API' }));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

const { fetchArbeitnow } = require('./src/discovery/arbeitnow');
const { fetchHimalayas } = require('./src/discovery/himalayas');

// Discovery endpoint: fetch real live jobs from job aggregators
app.get('/jobs', async (req, res) => {
  try {
    const [arbeitnowJobs, himalayasJobs] = await Promise.all([
      fetchArbeitnow().catch(err => { console.warn('Arbeitnow error:', err.message); return []; }),
      fetchHimalayas().catch(err => { console.warn('Himalayas error:', err.message); return []; })
    ]);

    const combined = [...arbeitnowJobs, ...himalayasJobs]
      .filter(j => j && j.url)
      .map((job, idx) => ({
        id: idx + 1,
        title: job.title,
        company: job.company || 'Tech Company',
        location: job.location || 'Remote',
        salary: job.salary || 'Competitive',
        source: job.source,
        postedAt: job.postedAt || 'Recent',
        url: job.url,
        tags: ['Remote', 'Software', job.source],
        color: idx % 3 === 0 ? 'violet' : idx % 3 === 1 ? 'blue' : 'pink',
        status: 'Discovered'
      }));

    res.json({ jobs: combined });
  } catch (err) {
    console.error('Error in /jobs endpoint:', err.message);
    res.status(500).json({ error: 'Failed to fetch live jobs' });
  }
});

// Helper function to call Azure OpenAI for custom questions
async function answerCustomQuestions(questions, profile, jobDescription) {
  if (!questions || questions.length === 0) return {};
  
  const prompt = `
You are a job application assistant. Answer the following custom application questions based on the candidate's profile, their full resume, and the job description.
Align the candidate's experience with the job description to provide compelling, highly-tailored answers.

Candidate Profile Summary: ${JSON.stringify(profile)}
Candidate Resume Text:
${profile.resume_text || "Not provided"}

Job Description:
${jobDescription.substring(0, 6000)} // Truncated to avoid token limits

Questions to answer:
${questions.map(q => `- ID: ${q.id}, Label: "${q.label}"`).join('\n')}

Respond ONLY with a JSON object where the keys are the Question IDs and the values are the answers. If you don't know the answer or it's highly subjective/requires human input, output an empty string for that ID. Do NOT include any markdown formatting or code blocks.
`;

  if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_KEY || !process.env.AZURE_OPENAI_DEPLOYMENT) {
    console.warn('Azure OpenAI environment variables not fully configured. Skipping LLM answers.');
    return {};
  }

  const baseEndpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/openai\/v1\/?$/, '');
  const url = `${baseEndpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-10-21`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.AZURE_OPENAI_KEY
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 2000
      })
    });
    
    if (!res.ok) {
      console.error('LLM API Error:', res.status, await res.text());
      return {};
    }
    
    const data = await res.json();
    let content = data.choices[0].message.content.trim();
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    
    return JSON.parse(content);
  } catch(e) {
    console.error("LLM parse or fetch error:", e);
    return {};
  }
}

app.post('/inspect', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing job URL' });

  let browser = null;
  try {
    const isCloud = process.platform === 'linux' || !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production');
    const isHeadless = process.env.HEADLESS ? process.env.HEADLESS === 'true' : isCloud;

    browser = await chromium.launch({
      headless: isHeadless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const screenshot = await page.screenshot({ encoding: 'base64' });
    const inputs = await page.$$eval('input, textarea, select', els =>
      els.map(el => {
        let label = null;
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) label = lbl.innerText.trim();
        }
        if (!label) {
          const parentLabel = el.closest('label');
          if (parentLabel) label = parentLabel.innerText.trim();
        }
        if (!label && el.getAttribute('aria-label')) {
          label = el.getAttribute('aria-label');
        }
        return {
          tag: el.tagName, type: el.type || null, name: el.name || null,
          id: el.id || null, placeholder: el.placeholder || null, label
        };
      })
    );

    await browser.close();
    res.json({ inputs, screenshot });
  } catch(err) {
    if (browser) { try { await browser.close(); } catch(e) {} }
    res.status(500).json({ error: err.message });
  }
});

app.all('/apply', async (req, res) => {
  let browser = null;
  try {
    const url = (req.body && req.body.url) || (req.query && req.query.url);
    if (!url) {
      return res.status(400).json({ error: 'Missing job URL' });
    }

    // Load profile from file, env, or fallback default
    let profile = {};
    const profilePath = path.join(__dirname, 'profile.json');
    if (fs.existsSync(profilePath)) {
      try {
        profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      } catch (e) {
        console.warn('Could not parse profile.json:', e.message);
      }
    } else if (process.env.PROFILE_JSON) {
      try {
        profile = JSON.parse(process.env.PROFILE_JSON);
      } catch(e) {
        console.warn('Could not parse PROFILE_JSON env var:', e.message);
      }
    }
    
    // Sensible fallbacks if profile fields missing
    profile.first_name = profile.first_name || process.env.CANDIDATE_FIRST_NAME || "Sriram";
    profile.last_name = profile.last_name || process.env.CANDIDATE_LAST_NAME || "Kolli";
    profile.email = profile.email || process.env.CANDIDATE_EMAIL || "kollisriram6@gmail.com";
    profile.phone = profile.phone || process.env.CANDIDATE_PHONE || "+91 9581697955";
    profile.location = profile.location || process.env.CANDIDATE_LOCATION || "India";

    // Dynamically parse the PDF resume if exists
    if (profile.resume_path && fs.existsSync(profile.resume_path)) {
      try {
        console.log('Parsing PDF resume...');
        const dataBuffer = fs.readFileSync(profile.resume_path);
        const pdfData = await pdfParse(dataBuffer);
        profile.resume_text = pdfData.text;
      } catch (e) {
        console.warn('Could not parse PDF resume:', e.message);
      }
    }

    // Auto-detect headless mode: default to true on cloud/Linux, false on local desktop
    const isCloud = process.platform === 'linux' || !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production');
    const isHeadless = process.env.HEADLESS ? process.env.HEADLESS === 'true' : isCloud;

    console.log(`Launching Playwright (headless: ${isHeadless})...`);
    browser = await chromium.launch({
      headless: isHeadless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Scrape visible text
    const jobDescription = await page.evaluate(() => document.body.innerText || '');

    // Extract inputs
    const inputs = await page.$$eval('input, textarea, select', els =>
      els.map(el => {
        let label = null;
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) label = lbl.innerText.trim();
        }
        if (!label) {
          const parentLabel = el.closest('label');
          if (parentLabel) label = parentLabel.innerText.trim();
        }
        return { tag: el.tagName, type: el.type || null, id: el.id || null, label };
      })
    );

    // Separate standard fields, EEOC fields, and custom questions
    const standardFields = ['first_name', 'last_name', 'email', 'phone'];
    const eeocKeywords = ['gender', 'hispanic', 'veteran', 'disability'];
    const customQuestions = [];

    // Fill standard fields
    for (const input of inputs) {
      if (!input.id) continue;
      
      const lowerId = input.id.toLowerCase();
      const lowerLabel = (input.label || '').toLowerCase();
      
      if (eeocKeywords.some(kw => lowerId.includes(kw) || lowerLabel.includes(kw))) {
        continue;
      }

      if (lowerId === 'resume' && input.type === 'file' && profile.resume_path && fs.existsSync(profile.resume_path)) {
        try {
          await page.locator(`id=${input.id}`).setInputFiles(profile.resume_path);
        } catch(e) {
          console.warn(`Could not upload resume to ${input.id}`);
        }
      } 
      else if (standardFields.includes(lowerId) && profile[lowerId]) {
        try {
          await page.locator(`id=${input.id}`).fill(profile[lowerId]);
        } catch(e) {
          console.warn(`Could not fill standard field ${input.id}`);
        }
      } 
      else if (input.id.startsWith('question_') && (input.type === 'text' || input.tag === 'TEXTAREA')) {
        customQuestions.push(input);
      }
    }

    let generatedAnswers = {};
    if (customQuestions.length > 0 && profile) {
      console.log(`Querying LLM for ${customQuestions.length} custom questions...`);
      generatedAnswers = await answerCustomQuestions(customQuestions, profile, jobDescription);
      
      for (const [id, answer] of Object.entries(generatedAnswers)) {
        if (answer) {
          try {
            await page.locator(`id=${id}`).fill(answer);
          } catch(e) {
            console.warn(`Could not fill custom question ${id}`);
          }
        }
      }
    }
    
    let screenshotBase64 = null;
    if (isHeadless) {
      screenshotBase64 = await page.screenshot({ fullPage: true, encoding: 'base64' });
      await browser.close();
      browser = null;
    }

    res.json({ 
      status: 'AWAITING_HUMAN_REVIEW', 
      message: isHeadless 
        ? 'Application drafted in cloud browser.' 
        : 'Form pre-filled. Please review the open browser and submit manually.',
      screenshot: screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : null,
      llm_answers: generatedAnswers
    });

  } catch (error) {
    console.error('Apply error:', error);
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
    res.status(500).json({ error: error.message });
  }
});

// Global Express error handler returning JSON instead of HTML
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Scout apply-service listening on ${PORT}`));

