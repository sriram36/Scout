'use strict';

/**
 * Creates a throwaway candidate profile + resume file in the OS temp dir and points
 * SCOUT_PROFILE_PATH at it, so tests never read the developer's real profile.json.
 * Call before requiring anything from src/config/profile.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function useTestProfile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-test-'));
  const resumePath = path.join(dir, 'Test_Candidate_Resume.pdf');
  fs.writeFileSync(resumePath, '%PDF-1.4\n% scout test resume\n');

  const profile = {
    personal: {
      firstName: 'Test',
      lastName: 'Candidate',
      email: 'test.candidate@example.com',
      phone: '+1 555-0100',
      location: 'Austin, TX, USA',
    },
    links: {
      linkedin: 'https://linkedin.com/in/test-candidate',
      github: 'https://github.com/test-candidate',
      portfolio: 'https://test-candidate.dev',
    },
    education: {
      university: 'Test State University',
      degree: 'B.Tech',
      specialization: 'Computer Science',
      graduationYear: '2025',
      cgpa: '8.5',
    },
    experience: [],
    skills: { languages: ['JavaScript'] },
    projects: [],
    preferences: { preferredRoles: ['Software Engineer'] },
    resume: { defaultPath: resumePath },
  };

  const profilePath = path.join(dir, 'profile.json');
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  process.env.SCOUT_PROFILE_PATH = profilePath;
  return { dir, profilePath, resumePath, profile };
}

module.exports = { useTestProfile };
