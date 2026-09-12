const axios = require('axios');

async function fetchArbeitnow(keywords = ['engineer', 'developer']) {
  try {
    const res = await axios.get('https://www.arbeitnow.com/api/job-board-api');
    
    if (!res.data || !res.data.data) return [];

    return res.data.data
      .filter(job => job.remote === true) // Strict remote-only per PRD
      .filter(job => {
        const title = job.title.toLowerCase();
        return keywords.some(kw => title.includes(kw));
      })
      .map(job => ({
        title: job.title,
        company: job.company_name,
        location: job.location,
        url: job.url,
        source: 'Arbeitnow',
        description: job.description.substring(0, 500), // Excerpt
        salary: 'Unlisted', // Arbeitnow API rarely exposes salary cleanly
        postedAt: job.created_at || new Date().toISOString()
      }));
  } catch (error) {
    console.error('Error fetching Arbeitnow:', error.message);
    return [];
  }
}

module.exports = { fetchArbeitnow };
