const axios = require('axios');

async function fetchHimalayas(keywords = ['engineer', 'developer']) {
  try {
    // Note: In real life, Himalayas has an API limit. Jitter helps.
    const res = await axios.get('https://himalayas.app/jobs/api', {
      params: { category: 'developer' }
    });
    
    if (!res.data || !res.data.jobs) return [];

    return res.data.jobs
      .filter(job => {
        const title = job.title.toLowerCase();
        return keywords.some(kw => title.includes(kw));
      })
      .map(job => ({
        title: job.title,
        company: job.companyName,
        location: job.location,
        url: job.applicationUrl || job.jobUrl, // Ensure we have the apply link
        source: 'Himalayas',
        description: job.excerpt || '',
        salary: job.minSalary ? `$${job.minSalary} - $${job.maxSalary}` : 'Unlisted',
        postedAt: job.pubDate || new Date().toISOString()
      }));
  } catch (error) {
    console.error('Error fetching Himalayas:', error.message);
    return [];
  }
}

module.exports = { fetchHimalayas };
