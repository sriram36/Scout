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
app.use((req, res, next) => { req.url = req.url.replace(/\/{2,}/g, '/'); next(); });

// Basic health check endpoints for cloud deployment platforms
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Scout Job Automation API' }));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

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

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  try {
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
    await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.all('/apply', async (req, res) => {
  const url = (req.body && req.body.url) || (req.query && req.query.url);
  
  if (!url) {
    return res.status(400).json({ error: 'Missing job URL' });
  }

  // Load profile from profile.json file or PROFILE_JSON environment variable
  let profile = {};
  try {
    const profilePath = path.join(__dirname, 'profile.json');
    if (fs.existsSync(profilePath)) {
      profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    } else if (process.env.PROFILE_JSON) {
      profile = JSON.parse(process.env.PROFILE_JSON);
    } else {
      throw new Error('Neither profile.json nor PROFILE_JSON environment variable is available.');
    }
    
    // Dynamically parse the PDF resume for the LLM if file exists on system
    if (profile.resume_path && fs.existsSync(profile.resume_path)) {
      console.log('Parsing PDF resume...');
      const dataBuffer = fs.readFileSync(profile.resume_path);
      const pdfData = await pdfParse(dataBuffer);
      profile.resume_text = pdfData.text;
    }
  } catch (err) {
    console.error('Could not load profile or parse resume:', err.message);
    return res.status(500).json({ error: 'Candidate profile not found or invalid.' });
  }
  
  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Scrape the visible text of the page to use as the Job Description context
    const jobDescription = await page.evaluate(() => document.body.innerText);

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

    // Fill standard high-confidence fields
    for (const input of inputs) {
      if (!input.id) continue;
      
      const lowerId = input.id.toLowerCase();
      const lowerLabel = (input.label || '').toLowerCase();
      
      // Skip EEOC explicitly per PRD Section 4
      if (eeocKeywords.some(kw => lowerId.includes(kw) || lowerLabel.includes(kw))) {
        continue;
      }

      // Handle resume file upload if file exists
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
      // Collect custom questions
      else if (input.id.startsWith('question_') && (input.type === 'text' || input.tag === 'TEXTAREA')) {
        customQuestions.push(input);
      }
    }

    let generatedAnswers = {};
    // Query LLM for custom questions
    if (customQuestions.length > 0 && profile) {
      console.log(`Querying LLM for ${customQuestions.length} custom questions...`);
      generatedAnswers = await answerCustomQuestions(customQuestions, profile, jobDescription);
      
      // Fill LLM answers
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
    
    // In headless cloud mode: capture screenshot of completed form and close browser to prevent memory leaks
    let screenshotBase64 = null;
    if (isHeadless) {
      screenshotBase64 = await page.screenshot({ fullPage: true, encoding: 'base64' });
      await browser.close();
    }

    // Return human review status (we never submit automatically)
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
    try { await browser.close(); } catch(e) {}
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Scout apply-service listening on ${PORT}`));

