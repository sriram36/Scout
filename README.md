# Scout Automations

Scout is a personal, AI-powered job application pipeline. It automates the repetitive parts of job searching by discovering new opportunities, tracking them, and using a local Playwright bot powered by Azure OpenAI to intelligently auto-fill job applications based on a candidate's specific background.

## Features
- **Job Discovery (n8n)**: Automatically aggregates jobs from Himalayas, Arbeitnow, Adzuna, and RemoteOK.
- **Smart Auto-Fill (Node.js & Playwright)**: Extracts job descriptions and uses LLMs to write tailored answers for custom application questions.
- **Human Review Gate**: Automatically fills out applications but halts before submission, allowing for manual human review and approval.
- **Premium Dashboard (Next.js)**: A glassmorphism dashboard to monitor active opportunities and trigger the auto-fill pipeline.

## Setup
1. Copy `.env.example` to `.env` and add your Azure OpenAI keys.
2. Update `profile.json` with your candidate information and a path to your PDF resume.
3. Install backend dependencies: `npm install`
4. Start backend service: `node server.js`
5. Start frontend dashboard: `cd dashboard && npm run dev`
